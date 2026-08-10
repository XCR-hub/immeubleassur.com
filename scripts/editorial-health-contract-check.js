import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();
const monitor = readFileSync("scripts/local-editorial-health-monitor.js", "utf8");
const production = readFileSync("scripts/local-production-monitor.js", "utf8");
const runtime = readFileSync("scripts/local-runtime-report-cycle.js", "utf8");
const api = readFileSync("functions/api/admin/runtime-health.js", "utf8");
const admin = readFileSync("public/assets/admin.js", "utf8");
const review = readFileSync("scripts/local-editorial-review-monitor.js", "utf8");
const growth = readFileSync("scripts/local-growth-ops-export.js", "utf8");
const task = readFileSync("scripts/local-runtime-task.ps1", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const reportPath = join(reportDir, "editorial-health-contract-report.json");
const checks = [
  ["latest-valid-edition-measured", monitor.includes("latestPublishedEdition(publicRoot, publicationsRoot)") && monitor.includes("maximum_edition_age_days")],
  ["three-cycle-hold-threshold", monitor.includes('LOCAL_EDITORIAL_HOLD_ALERT_CYCLES') && monitor.includes("consecutiveHolds >= holdThreshold")],
  ["stale-report-detected", monitor.includes('type: "editorial-report-stale"')],
  ["stale-edition-detected", monitor.includes('type: "published-edition-stale"')],
  ["business-coverage-gap-operational-only", monitor.includes("operationalCycle && editorial?.business_coverage?.status")],
  ["business-coverage-gap-three-cycle-threshold", monitor.includes("LOCAL_EDITORIAL_COVERAGE_GAP_ALERT_CYCLES") && monitor.includes("coverageGapCycles[dimension] >= coverageGapThreshold")],
  ["business-coverage-gap-state-persisted", monitor.includes("coverage_gap_cycles: coverageGapCycles")],
  ["business-coverage-gap-actionable", monitor.includes('type: "editorial-business-coverage-gap"') && monitor.includes('severity: "high"')],
  ["runtime-cycle-runs-health-after-connectors", runtime.indexOf('runStep("editorial_health_monitor"') > runtime.indexOf('runStep("live_ready_connectors"')],
  ["production-monitor-consumes-health", production.includes('inspectEditorialHealth(editorialHealthPath)') && production.includes('check("editorial_health"')],
  ["existing-deduplicated-alert-path-reused", production.includes("recentlyAlerted(statePath, signature, cooldownMinutes)")],
  ["admin-api-sanitizes-editorial-health", api.includes("sanitizeEditorialHealthReport") && api.includes("editorial_health:")],
  ["admin-dashboard-shows-editorial-health", admin.includes("editorialHealthStatusLabel") && admin.includes('label:"Veille editoriale"')],
  ["review-queue-non-publishable-only", review.includes("data.no_auto_publish !== true") && review.includes("data.allowed_publication === true")],
  ["review-alert-metadata-only", review.includes('"metadata-alert-only"') && review.includes("Fichier de revue:")],
  ["review-alert-content-aware-deduplicated", review.includes("content-aware-cooldown") && review.includes("review_fingerprint") && review.includes("LOCAL_EDITORIAL_REVIEW_ALERT_COOLDOWN_MINUTES")],
  ["review-alert-routes-explicitly-to-team", task.includes("LOCAL_EDITORIAL_REVIEW_ALERT_TO = 'team@immeubleassur.com'") && review.includes("recipient_is_team")],
  ["critical-review-alerts-escalate-faster", review.includes("LOCAL_EDITORIAL_REVIEW_CRITICAL_COOLDOWN_MINUTES") && review.includes("report.critical_count > 0") && task.includes("LOCAL_EDITORIAL_REVIEW_CRITICAL_COOLDOWN_MINUTES = '360'")],
  ["runtime-runs-review-after-editorial", runtime.indexOf('runStep("editorial_review_monitor"') > runtime.indexOf('runStep("editorial_runtime_publisher"')],
  ["growth-ops-exposes-review-aggregate", growth.includes("sanitizeEditorialReview") && growth.includes("editorial-human-review")],
  ["runtime-executes-editorial-text-quality", runtime.includes('runStep("editorial_text_quality", ["scripts/editorial-text-quality-check.js"]')],
  ["standard-pipelines-execute-editorial-text-quality", ["check", "check:site", "local:autarky:check"].every((name) => String(packageJson.scripts?.[name] || "").includes("node scripts/editorial-text-quality-check.js"))]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, policy: { alert_after_consecutive_holds: 3, alert_after_consecutive_coverage_gaps: 3, maximum_public_edition_age_days: 14, legal_ai_auto_publication: false } };
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (missing.length) { console.error(`Editorial health contract failed: ${missing.join(", ")}`); process.exit(1); }
console.log(`Editorial health contract passed: ${checks.length} checks.`);
