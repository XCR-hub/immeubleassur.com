import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { readGitRevision } from "./git-revision.js";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function numberValue(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeForMatch(value) {
  return String(value || "").toLowerCase().replace(/\\/g, "/");
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForRuntime(timeoutSeconds) {
  const startedAt = Date.now();
  const deadline = startedAt + Math.max(1, timeoutSeconds) * 1000;
  let attempts = 0;
  let health = { ok: false, status_code: 0, body: null, error: "startup pending", security_headers: null };
  do {
    await sleep(250);
    attempts += 1;
    health = await runtimeCheck();
  } while (!health.ok && Date.now() < deadline);
  return { health, attempts, elapsed_ms: Date.now() - startedAt };
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultSiteDir = resolve(scriptDir, "..");
const siteDir = resolve(argValue("--site-dir", process.env.LOCAL_SITE_DIR || defaultSiteDir));
process.chdir(siteDir);
loadDefaultEnvFiles();

const port = numberValue(argValue("--port", env("LOCAL_SITE_PORT", "8790")), 8790);
const nodePath = argValue("--node", env("LOCAL_NODE_PATH", process.execPath));
const logDir = resolve(argValue("--log-dir", env("LOCAL_SITE_WATCHDOG_LOG_DIR", join("data", "logs"))));
const reportPath = resolve(argValue("--report", env("LOCAL_SITE_WATCHDOG_REPORT", join(logDir, "local-site-watchdog-report.json"))));
const startupWaitSeconds = numberValue(argValue("--startup-wait", env("LOCAL_SITE_WATCHDOG_STARTUP_WAIT_SECONDS", "12")), 12);
const startupAttempts = Math.max(1, Math.min(3, numberValue(argValue("--startup-attempts", env("LOCAL_SITE_WATCHDOG_STARTUP_ATTEMPTS", "3")), 3)));
const forceRestart = hasArg("--force");
const serverScript = join(siteDir, "scripts", "local-production-server.js");
const requiredSecurityHeaders = [
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "permissions-policy",
  "cross-origin-opener-policy"
];
const WATCHDOG_PROCESS_MATCH_MARKER = "watchdog-process-discovery-v2";

const expectedRevision = readGitRevision(siteDir);

mkdirSync(logDir, { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });

function writeReport(status, details = {}) {
  const report = {
    generated_at: new Date().toISOString(),
    status,
    site_dir: siteDir,
    port,
    marker: WATCHDOG_PROCESS_MATCH_MARKER,
    details
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function healthCheck() {
  return new Promise((resolveHealth) => {
    const request = httpRequest(
      { hostname: "127.0.0.1", port, path: "/health", method: "GET", timeout: 6000 },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          let body = null;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {}
          const baseHealthy = response.statusCode === 200 && body?.success === true && body?.status === "ok";
          const observedRevision = String(body?.source_revision || "");
          const revisionMatches = Boolean(expectedRevision && observedRevision === expectedRevision);
          resolveHealth({
            ok: baseHealthy && revisionMatches,
            status_code: response.statusCode || 0,
            body,
            expected_revision: expectedRevision,
            observed_revision: observedRevision,
            revision_matches: revisionMatches,
            error: baseHealthy && !revisionMatches ? "runtime revision mismatch" : ""
          });
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("health timeout")));
    request.on("error", (error) => {
      resolveHealth({ ok: false, status_code: 0, body: null, error: error.message || "health unavailable" });
    });
    request.end();
  });
}

function securityHeaderCheck() {
  return new Promise((resolveSecurity) => {
    const request = httpRequest(
      { hostname: "127.0.0.1", port, path: "/", method: "HEAD", timeout: 6000 },
      (response) => {
        response.resume();
        response.on("end", () => {
          const missing = requiredSecurityHeaders.filter((name) => !response.headers[name]);
          resolveSecurity({
            ok: response.statusCode === 200 && missing.length === 0,
            status_code: response.statusCode || 0,
            missing,
            headers: Object.fromEntries(requiredSecurityHeaders.map((name) => [name, response.headers[name] || ""])),
            error: missing.length ? `Missing runtime security headers: ${missing.join(", ")}` : ""
          });
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("security header timeout")));
    request.on("error", (error) => {
      resolveSecurity({ ok: false, status_code: 0, missing: requiredSecurityHeaders, headers: {}, error: error.message || "security headers unavailable" });
    });
    request.end();
  });
}

async function runtimeCheck() {
  const health = await healthCheck();
  if (!health.ok) return { ...health, security_headers: null };
  const securityHeaders = await securityHeaderCheck();
  return {
    ...health,
    ok: health.ok && securityHeaders.ok,
    security_headers: securityHeaders,
    error: securityHeaders.ok ? health.error : securityHeaders.error
  };
}

function normalizeProcess(processInfo = {}) {
  const processId = Number.parseInt(processInfo.process_id ?? processInfo.ProcessId ?? "", 10);
  const commandLine = String(processInfo.command_line ?? processInfo.CommandLine ?? "").trim();
  return commandLine && Number.isFinite(processId) ? { process_id: processId, command_line: commandLine } : null;
}

function parsePowerShellProcesses(output) {
  const raw = String(output || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeProcess).filter(Boolean);
  } catch {
    return [];
  }
}

function parseWmicProcesses(output) {
  const blocks = String(output || "").split(/\r?\n\r?\n+/);
  const processes = [];
  for (const block of blocks) {
    const commandLine = block.match(/CommandLine=(.*)/)?.[1]?.trim() || "";
    const processId = Number.parseInt(block.match(/ProcessId=(\d+)/)?.[1] || "", 10);
    const processInfo = normalizeProcess({ process_id: processId, command_line: commandLine });
    if (processInfo) processes.push(processInfo);
  }
  return processes;
}

function queryProcessesByName(name) {
  try {
    const output = execFileSync("cmd.exe", ["/d", "/c", `wmic process where name='${name}' get ProcessId,CommandLine /format:list`], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000
    });
    return parseWmicProcesses(output);
  } catch {
    return [];
  }
}

function queryProcessesByCim(names = ["node.exe", "cmd.exe"]) {
  try {
    const filter = names.map((name) => `Name='${String(name).replace(/'/g, "''")}'`).join(" OR ");
    const script = `$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
    const output = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000
    });
    return parsePowerShellProcesses(output);
  } catch {
    return [];
  }
}

function queryListeningPortOwners() {
  try {
    const output = execFileSync("netstat.exe", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    const owners = new Set();
    for (const line of String(output || "").split(/\r?\n/)) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 5 || columns[0].toUpperCase() !== "TCP" || columns[3].toUpperCase() !== "LISTENING") continue;
      if (!columns[1].endsWith(`:${port}`)) continue;
      const processId = Number.parseInt(columns[4], 10);
      if (Number.isFinite(processId) && processId > 0) owners.add(processId);
    }
    return [...owners];
  } catch {
    return [];
  }
}

function queryPortOwnerProcesses() {
  try {
    const script = `$owners = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); $owners | ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId=$_" | Select-Object ProcessId,CommandLine } | ConvertTo-Json -Compress`;
    const output = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000
    });
    return parsePowerShellProcesses(output);
  } catch {
    return [];
  }
}

function matchesSiteProcess(processInfo) {
  const command = normalizeForMatch(processInfo.command_line);
  const siteMarker = normalizeForMatch(siteDir);
  return command.includes("local-production-server.js") && (
    command.includes(siteMarker) ||
    command.includes("scripts/local-production-server.js")
  );
}

function siteProcesses(allowVerifiedPortOwner = false) {
  const verifiedPortOwners = allowVerifiedPortOwner ? queryListeningPortOwners().map((processId) => ({ process_id: processId, command_line: `verified-immeubleassur-port-owner local-production-server.js ${siteDir}` })) : [];
  if (verifiedPortOwners.length) return verifiedPortOwners;
  return [
    ...queryProcessesByName("node.exe"),
    ...queryProcessesByName("cmd.exe"),
    ...queryProcessesByCim(),
    ...queryPortOwnerProcesses()
  ]
    .filter(matchesSiteProcess)
    .filter((processInfo, index, all) => all.findIndex((item) => item.process_id === processInfo.process_id) === index);
}

function stopSiteProcesses(allowVerifiedPortOwner = false) {
  const stopped = [];
  for (const processInfo of siteProcesses(allowVerifiedPortOwner)) {
    try {
      execFileSync("taskkill.exe", ["/PID", String(processInfo.process_id), "/F", "/T"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10000
      });
      stopped.push({ process_id: processInfo.process_id, status: "stopped" });
    } catch (error) {
      stopped.push({ process_id: processInfo.process_id, status: "stop_failed", error: error.message || "taskkill failed" });
    }
  }
  return stopped;
}

function startSite() {
  if (!existsSync(serverScript)) throw new Error(`local-production-server.js introuvable: ${serverScript}`);
  if (!existsSync(nodePath)) throw new Error(`Node.js introuvable: ${nodePath}`);

  const outLog = join(logDir, "local-site.out.log");
  const errLog = join(logDir, "local-site.err.log");
  writeFileSync(outLog, `--- node watchdog launch ${new Date().toISOString()} ---\n`, { flag: "a" });
  writeFileSync(errLog, `--- node watchdog launch ${new Date().toISOString()} ---\n`, { flag: "a" });
  const out = openSync(outLog, "a");
  const err = openSync(errLog, "a");
  const child = spawn(nodePath, ["--trace-exit", "--trace-uncaught", serverScript], {
    cwd: siteDir,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", out, err]
  });
  child.unref();
  closeSync(out);
  closeSync(err);
  return { process_id: child.pid, command: "node scripts/local-production-server.js", out_log: outLog, err_log: errLog };
}

async function main() {
  const before = await runtimeCheck();
  if (before.ok && !forceRestart) {
    writeReport("healthy", { action: "none", health_before: before });
    console.log("immeubleassur_node_watchdog=healthy");
    return;
  }

  const verifiedRuntimeOnPort = before.status_code === 200 && before.body?.service === "immeubleassur-local-site" && before.body?.status === "ok";
  const stopped = stopSiteProcesses(verifiedRuntimeOnPort);
  let started = startSite();
  let recovery = await waitForRuntime(startupWaitSeconds);
  const launches = [{ attempt: 1, started, recovery }];
  for (let attempt = 2; !recovery.health.ok && attempt <= startupAttempts; attempt += 1) {
    await sleep(500 * attempt);
    stopped.push(...stopSiteProcesses(verifiedRuntimeOnPort));
    started = startSite();
    recovery = await waitForRuntime(startupWaitSeconds);
    launches.push({ attempt, started, recovery });
  }
  const after = recovery.health;
  writeReport(after.ok ? "recovered" : "failed", {
    action: "restart",
    health_before: before,
    health_after: after,
    stopped,
    started,
    recovery: { ...recovery, launch_attempts: launches.length, launches }
  });

  if (!after.ok) {
    console.error("immeubleassur_node_watchdog=failed");
    process.exitCode = 1;
    return;
  }
  console.log("immeubleassur_node_watchdog=recovered");
}

main()
  .then(() => {
    process.exit(process.exitCode || 0);
  })
  .catch((error) => {
    writeReport("failed", { action: "exception", error: error.message || "watchdog failed" });
    console.error(error);
    process.exit(1);
  });
