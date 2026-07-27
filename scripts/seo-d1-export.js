import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";
const report = JSON.parse(readFileSync(join(REPORT_DIR, "seo-autopilot-report.json"), "utf8"));
let contentFactory = { pages: [] };
try {
  contentFactory = JSON.parse(readFileSync(join(REPORT_DIR, "seo-content-factory.json"), "utf8"));
} catch {}

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function needsInspectionAction(row) {
  if (!row?.ok) return true;
  const verdict = String(row.verdict || "").toUpperCase();
  const coverage = String(row.coverage_state || "").toLowerCase();
  const robots = String(row.robots_txt_state || "").toUpperCase();
  const fetchState = String(row.page_fetch_state || "").toUpperCase();
  return (verdict && verdict !== "PASS") || /not|excluded|blocked|error|duplicate|redirect/i.test(coverage) || robots.includes("DISALLOW") || fetchState.includes("ERROR");
}

function priorityScore(priority) {
  return ({ fix: 95, high: 88, setup: 80, medium: 62, low: 38 })[priority] || 55;
}
function id(prefix, value) {
  return `${prefix}-${String(value).replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 80)}`;
}

const runId = `seo-${report.generated_at.replace(/[^0-9]/g, "").slice(0, 14)}`;
const lines = [
  "PRAGMA foreign_keys = ON;",
  `INSERT OR REPLACE INTO seo_runs (id, source, status, pages_checked, opportunities_count, payload, created_at) VALUES (${sql(runId)}, 'seo-autopilot', 'completed', ${Number(report.pages_checked || 0)}, ${Number(report.opportunities?.length || 0)}, ${sql(JSON.stringify({ average_score: report.average_score, mode: report.mode, gsc_configured: Boolean(report.gsc?.configured) }))}, ${sql(report.generated_at)});`
];

const autoFix = report.auto_fix || {};
const expansion = report.opportunity_expansion || {};
const contentQuality = report.content_quality || {};
const googleFeedback = report.google_feedback_loop || {};
const googleApiHealth = report.google_api_health || {};
const gsc = report.gsc || {};
const conversionIntelligence = report.conversion_intelligence || {};
const croExperiment = report.cro_experiment || {};
for (const metric of [
  ["auto_fix", "fixes_applied", autoFix.fixes_applied],
  ["auto_fix", "pages_changed", autoFix.pages_changed],
  ["audit", "average_score", report.average_score],
  ["content_quality", "warning_count", contentQuality.warning_count],
  ["content_quality", "severe_issue_count", contentQuality.severe_issue_count],
  ["google_feedback", "actions", Array.isArray(googleFeedback.actions) ? googleFeedback.actions.length : 0],
  ["google_api", "search_console_rows", googleApiHealth.search_console_rows],
  ["google_api", "search_console_opportunities", googleApiHealth.search_console_opportunities],
  ["google_api", "query_clusters", googleApiHealth.query_clusters],
  ["google_api", "url_inspection_checked", googleApiHealth.url_inspection_checked],
  ["google_api", "url_inspection_needs_action", googleApiHealth.url_inspection_needs_action],
  ["google_api", "sitemap_submitted", googleApiHealth.sitemap_submitted ? 1 : 0],
  ["google_api", "sitemap_status", googleApiHealth.sitemap_status],
  ["google_api", "pagespeed_checked", googleApiHealth.pagespeed_checked],
  ["google_api", "pagespeed_slow_pages", googleApiHealth.pagespeed_slow_pages],
  ["conversion_intelligence", "average_conversion_score", conversionIntelligence.average_conversion_score],
  ["conversion_intelligence", "average_money_score", conversionIntelligence.average_money_score],
  ["conversion_intelligence", "money_pages_checked", conversionIntelligence.money_pages_checked],
  ["conversion_intelligence", "actions", Array.isArray(conversionIntelligence.actions) ? conversionIntelligence.actions.length : 0],
  ["cro_experiment", "variant_count", croExperiment.variant_count],
  ["cro_experiment", "required_contracts", croExperiment.required_contracts],
  ["cro_experiment", "missing_contracts", Array.isArray(croExperiment.missing) ? croExperiment.missing.length : 0]
]) {
  if (metric[2] === undefined || metric[2] === null) continue;
  const metricId = id("metric", `${runId}-${metric[0]}-${metric[1]}`);
  lines.push(`INSERT OR REPLACE INTO seo_metrics (id, run_id, url, metric_type, metric_name, value, payload, created_at) VALUES (${sql(metricId)}, ${sql(runId)}, ${sql("https://immeubleassur.com/")}, ${sql(metric[0])}, ${sql(metric[1])}, ${Number(metric[2] || 0)}, ${sql(JSON.stringify({ value: metric[2], source: "seo-autopilot" }))}, ${sql(report.generated_at)});`);
}

for (const item of (report.opportunities || []).slice(0, 100)) {
  const oppId = id("opp", `${runId}-${item.id || item.url || item.query || item.type}`);
  lines.push(`INSERT OR REPLACE INTO seo_opportunities (id, run_id, url, query, opportunity_type, score, status, recommendation, payload, created_at, updated_at) VALUES (${sql(oppId)}, ${sql(runId)}, ${sql(item.url)}, ${sql(item.query)}, ${sql(item.type || item.opportunity_type || "audit")}, ${Number(item.score || item.page_score || 0)}, 'open', ${sql(item.recommendation)}, ${sql(JSON.stringify(item))}, ${sql(report.generated_at)}, ${sql(report.generated_at)});`);
}

for (const [index, item] of (googleFeedback.actions || []).slice(0, 40).entries()) {
  const oppId = id("opp", `${runId}-google-feedback-${index + 1}-${item.source || "feedback"}-${item.url || item.cluster || item.priority}`);
  lines.push(`INSERT OR REPLACE INTO seo_opportunities (id, run_id, url, query, opportunity_type, score, status, recommendation, payload, created_at, updated_at) VALUES (${sql(oppId)}, ${sql(runId)}, ${sql(item.url || "https://immeubleassur.com/")}, ${sql(item.cluster || item.priority || "google-feedback")}, ${sql(`google-${item.source || "feedback"}`)}, ${priorityScore(item.priority)}, 'open', ${sql(item.action)}, ${sql(JSON.stringify(item))}, ${sql(report.generated_at)}, ${sql(report.generated_at)});`);
}

for (const [index, row] of ((gsc.url_inspections || {}).rows || []).filter(needsInspectionAction).slice(0, 20).entries()) {
  const recommendation = `Verifier indexation: verdict ${row.verdict || "inconnu"}, couverture ${row.coverage_state || "non renseignee"}, robots ${row.robots_txt_state || "non renseigne"}.`;
  const oppId = id("opp", `${runId}-url-inspection-${index + 1}-${row.url}`);
  lines.push(`INSERT OR REPLACE INTO seo_opportunities (id, run_id, url, query, opportunity_type, score, status, recommendation, payload, created_at, updated_at) VALUES (${sql(oppId)}, ${sql(runId)}, ${sql(row.url)}, ${sql(row.coverage_state || row.verdict || "url-inspection")}, 'google-url-inspection', ${row.ok ? 88 : 95}, 'open', ${sql(recommendation)}, ${sql(JSON.stringify(row))}, ${sql(report.generated_at)}, ${sql(report.generated_at)});`);
}
for (const page of (contentFactory.pages || []).slice(0, 250)) {
  const pipelineId = id("content", page.slug);
  lines.push(`INSERT OR REPLACE INTO content_pipeline (id, slug, category, title, intent, status, quality_score, payload, created_at, updated_at) VALUES (${sql(pipelineId)}, ${sql(page.slug)}, ${sql(page.type || "content")}, ${sql(page.title)}, ${sql(page.type || "seo")}, 'published', ${Number(page.quality_score || 0)}, ${sql(JSON.stringify(page))}, ${sql(contentFactory.generated_at || report.generated_at)}, ${sql(report.generated_at)});`);
}

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "seo-autopilot-d1.sql"), `${lines.join("\n")}\n`, "utf8");
console.log(`SEO D1 export wrote ${lines.length - 1} statements for run ${runId}.`);
