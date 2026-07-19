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

function id(prefix, value) {
  return `${prefix}-${String(value).replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 80)}`;
}

const runId = `seo-${report.generated_at.replace(/[^0-9]/g, "").slice(0, 14)}`;
const lines = [
  "PRAGMA foreign_keys = ON;",
  `INSERT OR REPLACE INTO seo_runs (id, source, status, pages_checked, opportunities_count, payload, created_at) VALUES (${sql(runId)}, 'seo-autopilot', 'completed', ${Number(report.pages_checked || 0)}, ${Number(report.opportunities?.length || 0)}, ${sql(JSON.stringify({ average_score: report.average_score, mode: report.mode, gsc_configured: Boolean(report.gsc?.configured) }))}, ${sql(report.generated_at)});`
];

const autoFix = report.auto_fix || {};
for (const metric of [
  ["auto_fix", "fixes_applied", autoFix.fixes_applied],
  ["auto_fix", "pages_changed", autoFix.pages_changed],
  ["audit", "average_score", report.average_score]
]) {
  if (metric[2] === undefined || metric[2] === null) continue;
  const metricId = id("metric", `${runId}-${metric[0]}-${metric[1]}`);
  lines.push(`INSERT OR REPLACE INTO seo_metrics (id, run_id, url, metric_type, metric_name, value, payload, created_at) VALUES (${sql(metricId)}, ${sql(runId)}, ${sql("https://immeubleassur.com/")}, ${sql(metric[0])}, ${sql(metric[1])}, ${Number(metric[2] || 0)}, ${sql(JSON.stringify({ value: metric[2], source: "seo-autopilot" }))}, ${sql(report.generated_at)});`);
}

for (const item of (report.opportunities || []).slice(0, 100)) {
  const oppId = id("opp", `${runId}-${item.id || item.url || item.query || item.type}`);
  lines.push(`INSERT OR REPLACE INTO seo_opportunities (id, run_id, url, query, opportunity_type, score, status, recommendation, payload, created_at, updated_at) VALUES (${sql(oppId)}, ${sql(runId)}, ${sql(item.url)}, ${sql(item.query)}, ${sql(item.type || item.opportunity_type || "audit")}, ${Number(item.score || item.page_score || 0)}, 'open', ${sql(item.recommendation)}, ${sql(JSON.stringify(item))}, ${sql(report.generated_at)}, ${sql(report.generated_at)});`);
}

for (const page of (contentFactory.pages || []).slice(0, 250)) {
  const pipelineId = id("content", page.slug);
  lines.push(`INSERT OR REPLACE INTO content_pipeline (id, slug, category, title, intent, status, quality_score, payload, created_at, updated_at) VALUES (${sql(pipelineId)}, ${sql(page.slug)}, ${sql(page.type || "content")}, ${sql(page.title)}, ${sql(page.type || "seo")}, 'published', ${Number(page.quality_score || 0)}, ${sql(JSON.stringify(page))}, ${sql(contentFactory.generated_at || report.generated_at)}, ${sql(report.generated_at)});`);
}

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "seo-autopilot-d1.sql"), `${lines.join("\n")}\n`, "utf8");
console.log(`SEO D1 export wrote ${lines.length - 1} statements for run ${runId}.`);