import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { loadDefaultEnvFiles, env } from "./local-env.js";

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
const forceRestart = hasArg("--force");
const serverScript = join(siteDir, "scripts", "local-production-server.js");

mkdirSync(logDir, { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });

function writeReport(status, details = {}) {
  const report = {
    generated_at: new Date().toISOString(),
    status,
    site_dir: siteDir,
    port,
    details
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function healthCheck() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    const body = await response.json().catch(() => null);
    return {
      ok: response.status === 200 && body?.success === true && body?.status === "ok",
      status_code: response.status,
      body,
      error: ""
    };
  } catch (error) {
    return {
      ok: false,
      status_code: 0,
      body: null,
      error: error.message || "health unavailable"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseWmicProcesses(output) {
  const blocks = String(output || "").split(/\r?\n\r?\n+/);
  const processes = [];
  for (const block of blocks) {
    const commandLine = block.match(/CommandLine=(.*)/)?.[1]?.trim() || "";
    const processId = Number.parseInt(block.match(/ProcessId=(\d+)/)?.[1] || "", 10);
    if (commandLine && Number.isFinite(processId)) processes.push({ process_id: processId, command_line: commandLine });
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

function siteProcesses() {
  const siteMarker = normalizeForMatch(siteDir);
  return [...queryProcessesByName("node.exe"), ...queryProcessesByName("cmd.exe")]
    .filter((processInfo) => {
      const command = normalizeForMatch(processInfo.command_line);
      return command.includes("local-production-server.js") && command.includes(siteMarker);
    })
    .filter((processInfo, index, all) => all.findIndex((item) => item.process_id === processInfo.process_id) === index);
}

function stopSiteProcesses() {
  const stopped = [];
  for (const processInfo of siteProcesses()) {
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
  const before = await healthCheck();
  if (before.ok && !forceRestart) {
    writeReport("healthy", { action: "none", health_before: before });
    console.log("immeubleassur_node_watchdog=healthy");
    return;
  }

  const stopped = stopSiteProcesses();
  const started = startSite();
  await sleep(startupWaitSeconds * 1000);
  const after = await healthCheck();
  writeReport(after.ok ? "recovered" : "failed", {
    action: "restart",
    health_before: before,
    health_after: after,
    stopped,
    started
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
