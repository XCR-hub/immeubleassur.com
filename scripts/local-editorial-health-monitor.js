import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function ageHours(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? Math.max(0, Math.round(((Date.now() - timestamp) / 3600000) * 10) / 10) : null;
}

function latestPublishedEdition(publicRoot) {
  const newsDir = join(publicRoot, "news");
  if (!existsSync(newsDir)) return null;
  const editions = readdirSync(newsDir)
    .map((name) => ({ name, match: name.match(/^veille-assurance-immeuble-(\d{4}-\d{2}-\d{2})\.html$/) }))
    .filter((item) => item.match)
    .sort((a, b) => b.match[1].localeCompare(a.match[1]));
  if (!editions.length) return null;
  const date = editions[0].match[1];
  return { date, path: `news/${editions[0].name}`, age_days: Math.max(0, Math.floor((Date.now() - Date.parse(`${date}T00:00:00Z`)) / 86400000)) };
}

const reportRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"));
const publicRoot = resolve(env("LOCAL_SITE_PUBLIC_ROOT", "public"));
const editorialPath = resolve(env("LOCAL_EDITORIAL_REPORT", join(reportRoot, "editorial-autopilot-report.json")));
const out = resolve(env("LOCAL_EDITORIAL_HEALTH_REPORT", join(reportRoot, "local-editorial-health-report.json")));
const statePath = resolve(env("LOCAL_EDITORIAL_HEALTH_STATE", join(reportRoot, "editorial-health-state.json")));
const maxReportAgeHours = Math.max(1, Number(env("LOCAL_EDITORIAL_REPORT_MAX_AGE_HOURS", "12")) || 12);
const maxEditionAgeDays = Math.max(1, Number(env("LOCAL_EDITORIAL_EDITION_MAX_AGE_DAYS", "14")) || 14);
const holdThreshold = Math.max(1, Number(env("LOCAL_EDITORIAL_HOLD_ALERT_CYCLES", "3")) || 3);

const editorial = readJson(editorialPath);
const previousState = readJson(statePath) || {};
const gateReady = editorial?.publication_gate?.ready === true;
const operationalCycle = editorial?.fetch_enabled === true;
const held = operationalCycle && !gateReady;
const consecutiveHolds = held ? Number(previousState.consecutive_holds || 0) + 1 : 0;
const latestEdition = latestPublishedEdition(publicRoot);
const reportAge = ageHours(editorial?.generated_at);
const issues = [];

if (!editorial) issues.push({ type: "editorial-report-missing", severity: "critical", signal: editorialPath });
else if (reportAge === null || reportAge > maxReportAgeHours) issues.push({ type: "editorial-report-stale", severity: "critical", signal: `${reportAge ?? "unknown"}h`, threshold: `${maxReportAgeHours}h` });
if (!latestEdition) issues.push({ type: "published-edition-missing", severity: "critical", signal: publicRoot });
else if (latestEdition.age_days > maxEditionAgeDays) issues.push({ type: "published-edition-stale", severity: "high", signal: `${latestEdition.age_days}d`, threshold: `${maxEditionAgeDays}d` });
if (consecutiveHolds >= holdThreshold) issues.push({ type: "publication-held-repeatedly", severity: "high", signal: `${consecutiveHolds} cycles`, reasons: editorial?.publication_gate?.reasons || [] });

const report = {
  success: issues.length === 0,
  attention_required: issues.length > 0,
  status: issues.length ? "degraded" : held ? "watching-hold" : "healthy",
  generated_at: new Date().toISOString(),
  editorial_report: editorialPath,
  editorial_report_age_hours: reportAge,
  collection_status: editorial?.collection_status || "unknown",
  publication_status: editorial?.publication_status || "unknown",
  publication_gate: editorial?.publication_gate || { ready: false, reasons: ["report-unavailable"] },
  operational_cycle: operationalCycle,
  held_this_cycle: held,
  consecutive_holds: consecutiveHolds,
  hold_alert_cycles: holdThreshold,
  latest_valid_edition: latestEdition,
  maximum_edition_age_days: maxEditionAgeDays,
  issues
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(statePath, `${JSON.stringify({ updated_at: report.generated_at, consecutive_holds: consecutiveHolds, last_gate_ready: gateReady, last_publication_status: report.publication_status }, null, 2)}\n`, "utf8");
console.log(`Editorial health: ${report.status}; last edition ${latestEdition?.date || "missing"}; consecutive holds ${consecutiveHolds}/${holdThreshold}.`);
