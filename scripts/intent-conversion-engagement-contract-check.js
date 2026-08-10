import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = resolve(import.meta.dirname, "..");
const fixture = mkdtempSync(join(tmpdir(), "immeubleassur-intent-engagement-"));
const dbPath = join(fixture, "fixture.sqlite");
const out = join(fixture, "report.json");
const publicOut = join(fixture, "public.json");
const growthOut = join(fixture, "growth.json");
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE site_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, page_url TEXT, target TEXT, session_id TEXT, lead_reference TEXT, payload TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT NOT NULL);
  CREATE TABLE leads (id TEXT PRIMARY KEY, reference TEXT, source TEXT, page_url TEXT, need TEXT, property_type TEXT, city TEXT, units_count TEXT, lead_score INTEGER, created_at TEXT NOT NULL);
  CREATE TABLE lead_events (lead_id TEXT, event_type TEXT, payload TEXT);
`);
const insert = db.prepare("INSERT INTO site_events (id,event_type,page_url,target,session_id,payload,created_at) VALUES (?,?,?,?,?,?,datetime('now'))");
let sequence = 0;
function event(type, session, target = "") {
  sequence += 1;
  insert.run(`event-${sequence}`, type, "https://immeubleassur.com/", target, session, JSON.stringify({ path: "/", source: "website", intent: "website" }));
}
for (let index = 0; index < 30; index += 1) {
  event("page_view", `automatic-${index}`);
  event("quote_router_view", `automatic-${index}`, "immeuble");
}

function runMonitor() {
  const result = spawnSync(process.execPath, [join(root, "scripts", "local-intent-conversion-monitor.js"), "--db", dbPath, "--out", out, "--public-out", publicOut], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `monitor exit ${result.status}`);
  return JSON.parse(readFileSync(out, "utf8"));
}

try {
  const automatic = runMonitor();
  const automaticWebsite = automatic.intent_funnels.find((row) => row.key === "website");
  const automaticTypes = automatic.recommendations.map((item) => item.type);
  for (let index = 0; index < 5; index += 1) event("cta_click", `engaged-${index}`, "devis");
  for (let index = 0; index < 3; index += 1) event("quote_router_select", `engaged-${index}`, "immeuble");
  const engaged = runMonitor();
  const engagedWebsite = engaged.intent_funnels.find((row) => row.key === "website");
  const engagedTypes = engaged.recommendations.map((item) => item.type);
  const growthResult = spawnSync(process.execPath, [join(root, "scripts", "local-growth-ops-export.js"), "--runtime-only", "--runtime-out", growthOut], { cwd: root, encoding: "utf8", env: { ...process.env, LOCAL_INTENT_CONVERSION_REPORT: out } });
  if (growthResult.status !== 0) throw new Error(growthResult.stderr || growthResult.stdout || `growth export exit ${growthResult.status}`);
  const growth = JSON.parse(readFileSync(growthOut, "utf8"));
  const checks = [
    ["automatic-loads-not-engaged", automaticWebsite?.sessions === 30 && automaticWebsite?.engaged_sessions === 0],
    ["automatic-loads-no-false-intent-action", !automaticTypes.includes("intent-sans-start")],
    ["automatic-router-views-no-false-action", !automaticTypes.includes("routeur-intention-bloque")],
    ["real-interactions-counted", engagedWebsite?.engaged_sessions === 5],
    ["engaged-traffic-can-trigger-action", engagedTypes.includes("intent-sans-start")],
    ["router-selection-can-trigger-action", engagedTypes.includes("routeur-intention-bloque")],
    ["growth-ops-preserves-engagement", growth.reports?.intent_conversion?.summary?.engaged_sessions === 5 && growth.reports?.intent_conversion?.intent_funnels?.find((row) => row.key === "website")?.engaged_sessions === 5]
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  console.log(`Intent engagement contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
  if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }
} finally {
  db.close();
  rmSync(fixture, { recursive: true, force: true });
}