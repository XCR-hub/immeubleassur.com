import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();
const source = readFileSync("scripts/local-source-quality-monitor.js", "utf8");
const backlog = readFileSync("scripts/local-seo-backlog-monitor.js", "utf8");
const admin = readFileSync("public/assets/admin.js", "utf8");
const runtime = readFileSync("scripts/local-runtime-report-cycle.js", "utf8");
const checks = [
  ["engagement-event-set", source.includes("ENGAGEMENT_EVENTS") && source.includes("engaged_sessions: new Set()")],
  ["passive-pageviews-kept-separate", source.includes("sessions: totals.sessions") && source.includes("engaged_sessions: totals.engaged_sessions")],
  ["engaged-conversion-rate", source.includes("engaged_session_to_lead_rate")],
  ["recommendations-require-engagement", source.includes("row.engaged_sessions >= 10")],
  ["backlog-sql-counts-engaged-sessions", backlog.includes("AS engaged_sessions")],
  ["raw-pageview-weight-capped", backlog.includes("Math.min(Number(row.page_views || 0) * 0.1, 10)")],
  ["single-start-is-low-confidence", backlog.includes('key: "early-start-signal"') && backlog.includes('severity: "low"')],
  ["blocked-form-requires-sample", backlog.includes("formStarts >= 3")],
  ["backlog-exports-engaged-summary", backlog.includes("top_qualified_source_engaged_sessions")],
  ["backlog-deduplicates-logical-actions", backlog.includes("CREATE TEMP VIEW seo_opportunities_effective") && backlog.includes("ROW_NUMBER() OVER")],
  ["backlog-reports-suppressed-duplicates", backlog.includes("suppressed: Math.max(0, raw - effective)") && backlog.includes('mode: "sqlite-readonly-deduplicated"')],
  ["admin-shows-engaged-versus-raw", admin.includes("session(s) engagee(s)")],
  ["runtime-runs-source-quality", runtime.includes('runStep("source_quality_monitor"')],
  ["runtime-runs-backlog-after-sync", runtime.includes('runStep("seo_backlog_monitor_after_sync"')]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, safeguards: ["raw-traffic-not-treated-as-commercial-intent", "minimum-sample-before-high-friction-alert", "first-party-events-only", "no-pii-in-seo-reports"] };
const out = process.env.LOCAL_MEASURED_SEO_CONTRACT_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "measured-seo-contract-report.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Measured SEO contract: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (missing.length) process.exit(1);