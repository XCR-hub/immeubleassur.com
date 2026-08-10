import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

const REPORT_DIR = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const ASSET_DIR = process.env.LOCAL_RUNTIME_ASSETS_ROOT ? join(process.env.LOCAL_RUNTIME_ASSETS_ROOT, "assets") : join("public", "assets");
const READINESS_REPORT = join(REPORT_DIR, "live-api-readiness-report.json");
const SEARCH_REPORT = join(REPORT_DIR, "search-intelligence-report.json");
const OUT_REPORT = join(REPORT_DIR, "live-ready-connectors-report.json");
const OUT_ASSET = join(ASSET_DIR, "live-ready-connectors-latest.json");
const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const forceSerp = args.has("--force-serp");
const runtimeCycle = args.has("--runtime-cycle");
const cooldownMinutes = Math.max(15, Number(env("SERP_RATE_LIMIT_COOLDOWN_MINUTES", "360")) || 360);

const runnable = {
  turnstile: { command: ["scripts/turnstile-hybrid-pass.js"], objective: "Rafraichir les widgets Turnstile et fallback anti-fraude local.", minIntervalMinutes: 1440, report: "turnstile-hybrid-report.json" },
  pexels: { command: ["scripts/media-autopilot.js", "--fetch"], objective: "Rafraichir les visuels attribues lorsque Pexels est configure.", minIntervalMinutes: 1440, report: "media-autopilot-report.json" },
  "editorial-ai": { command: ["scripts/editorial-autopilot.js", "--fetch", "--ai"], objective: "Rafraichir la veille editoriale IA avec fallback local.", minIntervalMinutes: 360, report: "editorial-autopilot-report.json" },
  "pagespeed-local": { command: ["scripts/local-lighthouse-monitor.js"], objective: "Mesurer les performances mobiles avec Lighthouse et Chrome locaux.", readinessIds: ["pagespeed"], minIntervalMinutes: 360, report: "local-lighthouse-report.json", attentionStatuses: ["degraded", "failed"] },
  serpapi: { command: ["scripts/search-intelligence.js", "--serp"], objective: "Mesurer les positions Google via SerpApi sans scraping direct." },
  "google-seo": { command: ["scripts/seo-autopilot.js", "--gsc-if-configured", "--url-inspection", "--submit-sitemap"], objective: "Rafraichir Search Console et les signaux SEO Google lorsque le connecteur est pret.", readinessIds: ["google-search-console"], minIntervalMinutes: 180, report: "seo-autopilot-report.json" }
};

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function writeJson(path, value) { ensureDir(dirname(path)); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return null; }
}
function minutesSince(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? (Date.now() - time) / 60000 : Infinity;
}
function reportStatus(path) {
  const report = readJson(path);
  if (!report) return { available: false };
  return {
    available: true,
    generated_at: report.generated_at || report.imported_at || "",
    status: report.status || report.mode || report.provider || "present",
    rate_limited: report.rate_limited === true,
    serp_request_count: Number(report.serp_request_count || 0),
    rate_limited_skipped_count: Number(report.rate_limited_skipped_count || 0),
    collection_status: report.collection_status || "",
    healthy_source_count: Number(report.healthy_source_count || 0),
    empty_source_count: Number(report.empty_source_count || 0),
    failed_source_count: Number(report.failed_source_count || 0)
  };
}
function runNode(name, command) {
  const started = Date.now();
  const timeout = Math.max(15000, Number(env("LOCAL_LIVE_CONNECTOR_TIMEOUT_MS", "90000")) || 90000);
  const result = spawnSync(process.execPath, command, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
    timeout,
    killSignal: "SIGTERM"
  });
  return {
    name,
    command: `node ${command.join(" ")}`,
    ok: result.status === 0,
    status: result.status,
    duration_ms: Date.now() - started,
    timed_out: result.error?.code === "ETIMEDOUT",
    error: result.error?.message || ""
  };
}
function rowById(report, id) {
  return (report?.rows || []).find((row) => row.id === id) || null;
}
function shouldSkipSerp() {
  if (forceSerp) return null;
  const report = readJson(SEARCH_REPORT);
  if (!report?.rate_limited) return null;
  const age = minutesSince(report.generated_at);
  if (age >= cooldownMinutes) return null;
  return {
    reason: "serpapi-rate-limit-cooldown",
    age_minutes: Math.round(age),
    cooldown_minutes: cooldownMinutes,
    next_retry_after_minutes: Math.max(0, Math.ceil(cooldownMinutes - age))
  };
}
function shouldSkipFreshConnector(config) {
  if (!runtimeCycle || !config.report || !config.minIntervalMinutes) return null;
  const report = readJson(join(REPORT_DIR, config.report));
  if (!report) return null;
  const age = minutesSince(report.generated_at || report.imported_at);
  if (age >= config.minIntervalMinutes) return null;
  return {
    reason: "connector-freshness-cooldown",
    age_minutes: Math.max(0, Math.round(age)),
    cooldown_minutes: config.minIntervalMinutes,
    next_retry_after_minutes: Math.max(0, Math.ceil(config.minIntervalMinutes - age))
  };
}function safePublicStep(step) {
  return {
    name: step.name,
    command: step.command,
    ok: step.ok,
    status: step.status,
    duration_ms: step.duration_ms,
    timed_out: step.timed_out === true,
    skipped: step.skipped === true,
    attention: step.attention === true,
    reason: step.reason || "",
    report: step.report || null,
    objective: step.objective || ""
  };
}

const steps = [];
steps.push(runNode("readiness_before", ["scripts/live-api-readiness-check.js"]));
const readiness = readJson(READINESS_REPORT);

for (const [id, config] of Object.entries(runnable)) {
  const readinessRows = (config.readinessIds || [id]).map((readinessId) => rowById(readiness, readinessId)).filter(Boolean);
  const row = rowById(readiness, id) || readinessRows[0] || null;
  const connectorReady = readinessRows.length ? readinessRows.some((item) => item.ready) : Boolean(row?.ready);
  if (!connectorReady) {
    steps.push({ name: id, command: `node ${config.command.join(" ")}`, ok: true, status: 0, duration_ms: 0, skipped: true, reason: "connector-not-ready", objective: config.objective, report: row?.last_report || null });
    continue;
  }
  if (id === "serpapi") {
    const skip = shouldSkipSerp();
    if (skip) {
      steps.push({ name: id, command: `node ${config.command.join(" ")}`, ok: true, status: 0, duration_ms: 0, skipped: true, reason: skip.reason, objective: config.objective, report: { ...reportStatus(SEARCH_REPORT), ...skip } });
      continue;
    }
  }
  const freshnessSkip = shouldSkipFreshConnector(config);
  if (freshnessSkip) {
    const freshReport = { ...reportStatus(join(REPORT_DIR, config.report)), ...freshnessSkip };
    steps.push({ name: id, command: `node ${config.command.join(" ")}`, ok: true, status: 0, duration_ms: 0, skipped: true, attention: ["partial", "degraded"].includes(freshReport.collection_status) || (config.attentionStatuses || []).includes(freshReport.status), reason: freshnessSkip.reason, objective: config.objective, report: freshReport });
    continue;
  }  const step = runNode(id, config.command);
  step.objective = config.objective;
  step.report = id === "serpapi" ? reportStatus(SEARCH_REPORT) : config.report ? reportStatus(join(REPORT_DIR, config.report)) : null;
  if (id === "editorial-ai") {
    const editorialReport = readJson(join(REPORT_DIR, config.report));
    step.attention = ["partial", "degraded"].includes(editorialReport?.collection_status);
    step.report = { ...step.report, collection_status: editorialReport?.collection_status || "unknown", healthy_source_count: Number(editorialReport?.healthy_source_count || 0), empty_source_count: Number(editorialReport?.empty_source_count || 0), failed_source_count: Number(editorialReport?.failed_source_count || 0) };
  }
  if ((config.attentionStatuses || []).includes(step.report?.status)) step.attention = true;
  steps.push(step);
}

steps.push(runNode("readiness_after", ["scripts/live-api-readiness-check.js"]));
steps.push(runNode("google_unlock_after", ["scripts/google-readiness-unlock.js"]));

const finalReadiness = readJson(READINESS_REPORT);
const googleUnlock = readJson(join(REPORT_DIR, "google-readiness-unlock-report.json"));
const failed = steps.filter((step) => !step.ok);
const skipped = steps.filter((step) => step.skipped);
const attention = steps.filter((step) => step.attention);
const report = {
  generated_at: new Date().toISOString(),
  status: failed.length || attention.length ? "degraded" : "completed",
  strict,
  cooldown_minutes: cooldownMinutes,
  ready_count: finalReadiness?.ready_count || 0,
  connectors_checked: finalReadiness?.connectors_checked || 0,
  blocking_count: googleUnlock?.blocking_count || 0,
  degraded_count: googleUnlock?.degraded_count || 0,
  summary: {
    executed: steps.filter((step) => !step.skipped && !step.name.includes("readiness") && !step.name.includes("unlock")).length,
    skipped: skipped.length,
    failed: failed.length,
    attention: attention.length
  },
  steps: steps.map(safePublicStep),
  safeguards: ["ready-connectors-only", "secret-values-never-exported", "serpapi-rate-limit-cooldown", "fallbacks-remain-operational"]
};

writeJson(OUT_REPORT, report);
writeJson(OUT_ASSET, report);
console.log(`Live ready connectors ${report.status}: executed=${report.summary.executed}, skipped=${report.summary.skipped}, failed=${report.summary.failed}, attention=${report.summary.attention}.`);
if (strict && failed.length) process.exit(1);