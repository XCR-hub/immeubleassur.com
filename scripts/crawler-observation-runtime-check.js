import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const temporaryRoot = mkdtempSync(join(tmpdir(), "immeubleassur-crawler-observation-"));
const databasePath = join(temporaryRoot, "runtime.sqlite");
const port = 19000 + Math.floor(Math.random() * 2000);
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["scripts/local-production-server.js"], {
  cwd: resolve("."),
  env: {
    ...process.env,
    LOCAL_SQLITE_DB: databasePath,
    LOCAL_SITE_ROOT: resolve("public"),
    LOCAL_RUNTIME_ASSETS_ROOT: join(temporaryRoot, "assets"),
    LOCAL_RUNTIME_PUBLICATIONS_ROOT: join(temporaryRoot, "publications"),
    LOCAL_RUNTIME_REPORTS_ROOT: join(temporaryRoot, "reports"),
    LOCAL_SITE_HOST: "127.0.0.1",
    LOCAL_SITE_PORT: String(port),
    SITE_ORIGIN: origin,
    GOOGLE_SITE_VERIFICATION_FILE: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

async function waitUntilReady() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 125));
  }
  throw new Error(`server did not become ready: ${output.slice(-500)}`);
}

async function request(userAgent) {
  const response = await fetch(`${origin}/assurance-immeuble?secret=not-stored`, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`unexpected HTTP ${response.status}`);
  await response.arrayBuffer();
}

try {
  await waitUntilReady();
  await request("OAI-SearchBot/1.0 ImmeubleAssurDiscoverabilityMonitor/1.0");
  await request("OAI-SearchBot/1.0 (+https://openai.com/searchbot)");
  await request("OAI-SearchBot/1.0 (+https://openai.com/searchbot)");
  await new Promise((resolveWait) => setTimeout(resolveWait, 150));

  const database = new DatabaseSync(databasePath, { readOnly: true });
  const rows = database.prepare("SELECT event_type, page_url, target, payload, ip_address, user_agent FROM site_events WHERE event_type = 'crawler_observation'").all();
  database.close();
  const row = rows[0];
  const payload = row ? JSON.parse(row.payload || "{}") : {};
  const checks = [
    ["synthetic-monitor-excluded-and-daily-deduplicated", rows.length === 1],
    ["path-stored-without-query", row?.page_url === "/assurance-immeuble"],
    ["agent-normalized", row?.target === "oai-searchbot" && row?.user_agent === "oai-searchbot"],
    ["ip-not-stored", row?.ip_address === ""],
    ["identity-claim-is-honest", payload.identity_verified === false && payload.verification_method === "no-trusted-source-address" && payload.source_transport === "untrusted-or-unavailable"],
    ["privacy-marker-recorded", payload.query_stored === false && payload.ip_stored === false && payload.marker === "crawler-observation-v1"]
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  console.log(`Crawler observation runtime: ${missing.length ? "failed" : "passed"} (${checks.length - missing.length}/${checks.length}).`);
  if (missing.length) {
    console.error(JSON.stringify({ missing, rows }, null, 2));
    process.exitCode = 1;
  }
} finally {
  child.kill();
  await new Promise((resolveWait) => {
    child.once("exit", resolveWait);
    setTimeout(resolveWait, 1500);
  });
  rmSync(temporaryRoot, { recursive: true, force: true });
}
