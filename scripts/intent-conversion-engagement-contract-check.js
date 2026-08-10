import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const interventions = join(fixture, "interventions.json");
writeFileSync(interventions, JSON.stringify({ schema_version: 1, interventions: [{ id: "fixture-cro-change", deployed_at: "2026-08-10T05:00:00.000Z", scope: ["intent-conversion"], metric: "form-start-to-submit" }] }), "utf8");
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE site_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, page_url TEXT, target TEXT, session_id TEXT, lead_reference TEXT, payload TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT NOT NULL);
  CREATE TABLE leads (id TEXT PRIMARY KEY, reference TEXT, source TEXT, page_url TEXT, need TEXT, property_type TEXT, city TEXT, units_count TEXT, lead_score INTEGER, created_at TEXT NOT NULL);
  CREATE TABLE lead_events (lead_id TEXT, event_type TEXT, payload TEXT);
`);
const insert = db.prepare("INSERT INTO site_events (id,event_type,page_url,target,session_id,payload,created_at) VALUES (?,?,?,?,?,?,?)");
let sequence = 0;
function event(type, session, target = "", createdAt = "2026-08-10 06:00:00", extra = {}) {
  sequence += 1;
  insert.run(`event-${sequence}`, type, "https://immeubleassur.com/", target, session, JSON.stringify({ path: "/", source: "website", intent: "website", ...extra }), createdAt);
}
for (let index = 0; index < 2; index += 1) {
  event("page_view", `historical-${index}`, "", "2026-08-10 04:00:00");
  event("form_start", `historical-${index}`, "", "2026-08-10 04:01:00");
}
for (let index = 0; index < 30; index += 1) {
  event("page_view", `automatic-${index}`);
  event("quote_router_view", `automatic-${index}`, "immeuble");
}

function runMonitor() {
  const result = spawnSync(process.execPath, [join(root, "scripts", "local-intent-conversion-monitor.js"), "--db", dbPath, "--out", out, "--public-out", publicOut, "--interventions", interventions], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `monitor exit ${result.status}`);
  return JSON.parse(readFileSync(out, "utf8"));
}

try {
  const automatic = runMonitor();
  const automaticPublic = JSON.parse(readFileSync(publicOut, "utf8"));
  const automaticWebsite = automatic.intent_funnels.find((row) => row.key === "website");
  const automaticTypes = automatic.recommendations.map((item) => item.type);
  for (let index = 0; index < 5; index += 1) event("cta_click", `engaged-${index}`, "devis");
  for (let index = 0; index < 3; index += 1) event("quote_router_select", `engaged-${index}`, "immeuble");
  const engaged = runMonitor();
  const engagedWebsite = engaged.intent_funnels.find((row) => row.key === "website");
  const engagedTypes = engaged.recommendations.map((item) => item.type);
  event("form_start", "hub-conversion", "recherches-hub", "2026-08-10 06:10:00", { form_source: "recherches-hub" });
  event("form_submit_attempt", "hub-conversion", "recherches-hub", "2026-08-10 06:11:00", { form_source: "recherches-hub" });
  event("lead_created", "hub-conversion", "recherches-hub", "2026-08-10 06:12:00", { form_source: "recherches-hub" });
  db.prepare("INSERT INTO leads (id,reference,source,page_url,need,property_type,city,units_count,lead_score,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run("lead-hub", "IMB-HUB", "website", "https://immeubleassur.com/recherches-assurance-immeuble", "multirisque-immeuble", "copropriete", "Paris", "20", 88, "2026-08-10 06:12:00");
  db.prepare("INSERT INTO lead_events (lead_id,event_type,payload) VALUES (?,?,?)").run("lead-hub", "lead_created", JSON.stringify({ intent: "website", form_source: "recherches-hub", lead_value_max: 4200 }));
  const attributed = runMonitor();
  const attributedPublic = JSON.parse(readFileSync(publicOut, "utf8"));
  const hubFunnel = attributed.form_source_funnels.find((row) => row.key === "recherches-hub");
  const growthResult = spawnSync(process.execPath, [join(root, "scripts", "local-growth-ops-export.js"), "--runtime-only", "--runtime-out", growthOut], { cwd: root, encoding: "utf8", env: { ...process.env, LOCAL_INTENT_CONVERSION_REPORT: out } });
  if (growthResult.status !== 0) throw new Error(growthResult.stderr || growthResult.stdout || `growth export exit ${growthResult.status}`);
  const growth = JSON.parse(readFileSync(growthOut, "utf8"));
  const productionRegistry = JSON.parse(readFileSync(join(root, "config", "conversion-interventions.json"), "utf8"));
  const productionIntervention = productionRegistry.interventions?.find((item) => item.id === "lead-email-optional-v1");
  const checks = [
    ["production-intervention-registry-valid", productionRegistry.schema_version === 1 && productionIntervention?.deployed_at === "2026-08-10T05:45:21.000Z" && productionIntervention?.scope?.includes("intent-conversion")],
    ["historical-starts-preserved", automatic.historical_context?.form_starts === 2 && automatic.historical_context?.pre_intervention_events === 4],
    ["historical-starts-not-current-alert", automatic.summary?.form_starts === 0 && !automaticTypes.includes("aucun-submit-global")],
    ["observation-window-visible", automatic.status === "observing" && automatic.observation?.intervention_id === "fixture-cro-change"],
    ["public-observation-safe-export", automaticPublic.observation?.status === "collecting" && automaticPublic.historical_context?.form_starts === 2],
    ["automatic-loads-not-engaged", automaticWebsite?.sessions === 30 && automaticWebsite?.engaged_sessions === 0],
    ["automatic-loads-no-false-intent-action", !automaticTypes.includes("intent-sans-start")],
    ["automatic-router-views-no-false-action", !automaticTypes.includes("routeur-intention-bloque")],
    ["real-interactions-counted", engagedWebsite?.engaged_sessions === 5],
    ["engaged-traffic-can-trigger-action", engagedTypes.includes("intent-sans-start")],
    ["router-selection-can-trigger-action", engagedTypes.includes("routeur-intention-bloque")],
    ["form-source-funnel-complete", hubFunnel?.form_starts === 1 && hubFunnel?.submit_attempts === 1 && hubFunnel?.leads_db === 1 && hubFunnel?.start_to_lead_rate === 100],
    ["form-source-public-export", attributedPublic.form_source_funnels?.[0]?.key === "recherches-hub"],
    ["growth-ops-preserves-cohort", growth.reports?.intent_conversion?.summary?.engaged_sessions >= 5 && growth.reports?.intent_conversion?.observation?.intervention_id === "fixture-cro-change" && growth.reports?.intent_conversion?.historical_context?.form_starts === 3],
    ["growth-ops-exports-form-source", growth.reports?.intent_conversion?.form_source_funnels?.[0]?.key === "recherches-hub"]
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  console.log(`Intent engagement contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
  if (failed.length) { console.error(failed.join(", ")); console.error(JSON.stringify({ intent_conversion: growth.reports?.intent_conversion }, null, 2)); process.exitCode = 1; }
} finally {
  db.close();
  rmSync(fixture, { recursive: true, force: true });
}