import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { outputNeedsAttention } from "./runtime-attention.js";

loadDefaultEnvFiles();

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function writeJson(path, value) { ensureDir(dirname(path)); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function clean(value, max = 2000) { return String(value || "").replace(/\r/g, "").trim().slice(0, max); }

function sourceRevision() {
  try {
    const gitDir = join(process.cwd(), ".git");
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 40);
    const refPath = join(gitDir, head.slice(5));
    return readFileSync(refPath, "utf8").trim().slice(0, 40);
  } catch {
    return "";
  }
}

const runtimeReportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", join("data", "runtime-reports")));
const runtimeAssetsRoot = resolve(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets")));
const runtimeIntentReport = join(runtimeReportsRoot, "local-intent-conversion-report.json");
const runtimeIntentAsset = join(runtimeAssetsRoot, "assets", "local-intent-conversion-latest.json");
const runtimeSourceReport = join(runtimeReportsRoot, "local-source-quality-report.json");
const runtimeSourceAsset = join(runtimeAssetsRoot, "assets", "local-source-quality-latest.json");
const runtimeGrowthAsset = join(runtimeAssetsRoot, "assets", "local-growth-ops-latest.json");
const cycleReportPath = resolve(env("LOCAL_RUNTIME_REPORT_CYCLE_REPORT", join(runtimeReportsRoot, "local-runtime-report-cycle.json")));

function runStep(name, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    stdio: "pipe"
  });
  const stdout = clean(result.stdout);
  const stderr = clean(result.stderr);
  const attention = result.status === 0 && outputNeedsAttention(stdout, stderr);
  return {
    name,
    command: `node ${args.join(" ")}`,
    ok: result.status === 0,
    status: result.status,
    attention,
    stdout,
    stderr,
    error: result.error?.message || ""
  };
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function run() {
  ensureDir(runtimeReportsRoot);
  ensureDir(join(runtimeAssetsRoot, "assets"));
  const commonRuntimeEnv = {
    LOCAL_RUNTIME_ONLY: "1",
    LOCAL_RUNTIME_REPORTS_ROOT: runtimeReportsRoot,
    LOCAL_RUNTIME_ASSETS_ROOT: runtimeAssetsRoot,
    LOCAL_SMTP_HEALTH_REPORT: join(runtimeReportsRoot, "local-smtp-health-report.json"),
    LOCAL_NOTIFICATION_RETRY_REPORT: join(runtimeReportsRoot, "local-lead-notification-retry-report.json"),
    LOCAL_LEAD_CANARY_REPORT: join(runtimeReportsRoot, "lead-dedupe-runtime-report.json"),
    LOCAL_NEWSLETTER_DELIVERY_REPORT: join(runtimeReportsRoot, "local-newsletter-delivery-report.json"),
    LOCAL_NEWSLETTER_CANARY_REPORT: join(runtimeReportsRoot, "newsletter-runtime-canary-report.json"),
    LOCAL_NEWSLETTER_DELIVERY_CONTRACT_REPORT: join(runtimeReportsRoot, "newsletter-delivery-contract-report.json"),
    LOCAL_IMAP_REPORT: join(runtimeReportsRoot, "local-imap-sync-report.json"),
    LOCAL_TLS_REPORT: join(runtimeReportsRoot, "local-tls-certificate-report.json"),
    LOCAL_RELIABILITY_CONTRACT_REPORT: join(runtimeReportsRoot, "reliability-contract-report.json"),
    LOCAL_SQLITE_RESTORE_DRILL_REPORT: join(runtimeReportsRoot, "local-sqlite-restore-drill-report.json"),
    LOCAL_SECURITY_SURFACE_REPORT: join(runtimeReportsRoot, "local-security-surface-report.json"),
    LOCAL_DEPENDENCY_SECURITY_REPORT: join(runtimeReportsRoot, "local-dependency-security-report.json"),
    LOCAL_SCHEDULED_TASK_HEALTH_REPORT: join(runtimeReportsRoot, "local-scheduled-task-health-report.json"),
    LOCAL_LIGHTHOUSE_REPORT: join(runtimeReportsRoot, "local-lighthouse-report.json"),
    LOCAL_LIGHTHOUSE_HISTORY: join(runtimeReportsRoot, "local-lighthouse-history.jsonl"),
    LOCAL_LIGHTHOUSE_CHROME_PROFILE: join(runtimeReportsRoot, "lighthouse-chrome-profile"),
    LOCAL_EDITORIAL_DRAFT_ROOT: join(runtimeReportsRoot, "editorial-drafts"),
    LOCAL_EDITORIAL_REVIEW_REPORT: join(runtimeReportsRoot, "local-editorial-review-report.json"),
    LOCAL_EDITORIAL_REVIEW_ALERT_STATE: join(runtimeReportsRoot, "editorial-review-alert-state.json"),
    LOCAL_EDITORIAL_REVIEW_ALERTS: "1",
    LOCAL_INDEXNOW_REPORT: join(runtimeReportsRoot, "local-indexnow-report.json"),
    LOCAL_INDEXNOW_STATE: join(runtimeReportsRoot, "indexnow-state.json"),
    LOCAL_INTENT_CONVERSION_REPORT: runtimeIntentReport,
    LOCAL_INTENT_CONVERSION_PUBLIC_REPORT: runtimeIntentAsset,
    LOCAL_SOURCE_QUALITY_REPORT: runtimeSourceReport,
    LOCAL_SOURCE_QUALITY_PUBLIC_REPORT: runtimeSourceAsset,
    LOCAL_CONVERSION_INTELLIGENCE_REPORT: join(runtimeReportsRoot, "conversion-intelligence-report.json"),
    LOCAL_CONVERSION_INTELLIGENCE_PUBLIC_REPORT: join(runtimeAssetsRoot, "assets", "conversion-intelligence-latest.json"),
    LOCAL_SEO_RECONCILIATION_REPORT: join(runtimeReportsRoot, "local-seo-opportunity-reconciliation-report.json"),
    BROKERAGE_CASE_REPORT: join(runtimeReportsRoot, "brokerage-case-orchestrator-report.json"),
    BROKERAGE_CASE_PUBLIC_REPORT: join(runtimeAssetsRoot, "assets", "brokerage-case-orchestrator-latest.json"),
    CLIENT_CONTRACT_REPORT: join(runtimeReportsRoot, "client-contract-orchestrator-report.json"),
    CLIENT_CONTRACT_PUBLIC_REPORT: join(runtimeAssetsRoot, "assets", "client-contract-orchestrator-latest.json")
  };
  const steps = [
    runStep("smtp_health", ["scripts/local-smtp-health-check.js"], commonRuntimeEnv),
    runStep("lead_notification_retry", ["scripts/local-lead-notification-retry.js"], commonRuntimeEnv),
    runStep("lead_submission_canary", ["scripts/lead-dedupe-runtime-check.js"], commonRuntimeEnv),
    runStep("live_api_readiness", ["scripts/live-api-readiness-check.js"], commonRuntimeEnv),
    runStep("editorial_legal_safety", ["scripts/editorial-legal-safety-check.js"], commonRuntimeEnv),
    runStep("editorial_publication_gate", ["scripts/editorial-publication-gate-check.js"], commonRuntimeEnv),
    runStep("google_readiness_unlock", ["scripts/google-readiness-unlock.js"], commonRuntimeEnv),
    runStep("live_ready_connectors", ["scripts/live-ready-connectors-runner.js", "--runtime-cycle", "--strict"], commonRuntimeEnv),
    runStep("editorial_public_metadata_sanitizer", ["scripts/local-editorial-public-metadata-sanitizer.js"], commonRuntimeEnv),
    runStep("editorial_runtime_publisher", ["scripts/local-editorial-publisher.js"], commonRuntimeEnv),
    runStep("editorial_draft_schema_migration", ["scripts/local-editorial-draft-schema-migrate.js"], commonRuntimeEnv),
    runStep("editorial_review_monitor", ["scripts/local-editorial-review-monitor.js"], commonRuntimeEnv),
    runStep("editorial_hub_quality", ["scripts/local-editorial-hub-quality-check.js"], commonRuntimeEnv),
    runStep("editorial_publication_smoke", ["scripts/local-editorial-publication-smoke.js"], commonRuntimeEnv),
    runStep("newsletter_runtime_canary", ["scripts/newsletter-runtime-canary.js"], commonRuntimeEnv),
    runStep("newsletter_delivery", ["scripts/local-newsletter-delivery.js"], commonRuntimeEnv),
    runStep("newsletter_delivery_contract", ["scripts/newsletter-delivery-contract-check.js"], commonRuntimeEnv),
    runStep("ai_discoverability_monitor", ["scripts/local-ai-discoverability-monitor.js"], commonRuntimeEnv),
    runStep("ai_discoverability_contract", ["scripts/ai-discoverability-contract-check.js"], commonRuntimeEnv),
    runStep("indexnow_submit", ["scripts/local-indexnow-submit.js"], commonRuntimeEnv),
    runStep("editorial_health_monitor", ["scripts/local-editorial-health-monitor.js"], commonRuntimeEnv),
    runStep("editorial_text_quality", ["scripts/editorial-text-quality-check.js"], commonRuntimeEnv),
    runStep("editorial_publication_contract", ["scripts/editorial-runtime-publication-contract-check.js"], commonRuntimeEnv),
    runStep("sqlite_backup", ["scripts/local-sqlite-backup.js"]),
    runStep("sqlite_restore_drill", ["scripts/local-sqlite-restore-drill.js"], commonRuntimeEnv),
    runStep("brokerage_cases", ["scripts/brokerage-case-orchestrator.js"], commonRuntimeEnv),
    runStep("client_contracts", ["scripts/client-contract-orchestrator.js"], commonRuntimeEnv),
    runStep("imap_sync", ["scripts/local-imap-sync.js"], commonRuntimeEnv),
    runStep("contract_renewal_monitor", ["scripts/local-contract-renewal-monitor.js"]),
    runStep("security_surface_monitor", ["scripts/local-security-surface-monitor.js"], commonRuntimeEnv),
    runStep("dependency_security", ["scripts/local-dependency-security-monitor.js"], commonRuntimeEnv),
    runStep("scheduled_task_health", ["scripts/local-scheduled-task-health-monitor.js"], commonRuntimeEnv),
    runStep("production_monitor", ["scripts/local-production-monitor.js"], { ...commonRuntimeEnv, LOCAL_PRODUCTION_MONITOR_SKIP_RUNTIME_CYCLE: "1" }),
    runStep("reliability_contract", ["scripts/reliability-contract-check.js"], commonRuntimeEnv),
    runStep("tls_certificate_monitor", ["scripts/local-tls-certificate-monitor.js"], commonRuntimeEnv),
    runStep("lead_sla_monitor", ["scripts/local-lead-sla-monitor.js"]),
    runStep("lead_quality_monitor", ["scripts/local-lead-quality-monitor.js"]),
    runStep("conversion_funnel_monitor", ["scripts/local-conversion-funnel-monitor.js"]),
    runStep("intent_conversion_runtime", ["scripts/local-intent-conversion-monitor.js"], commonRuntimeEnv),
    runStep("source_quality_monitor", ["scripts/local-source-quality-monitor.js"], commonRuntimeEnv),
    runStep("conversion_intelligence_runtime", ["scripts/conversion-intelligence-check.js"], commonRuntimeEnv),
    runStep("seo_opportunity_reconciliation", ["scripts/local-seo-opportunity-reconcile.js"], commonRuntimeEnv),
    runStep("seo_backlog_monitor", ["scripts/local-seo-backlog-monitor.js"]),
    runStep("conversion_action_sync", ["scripts/local-conversion-action-sync.js"]),
    runStep("seo_backlog_monitor_after_sync", ["scripts/local-seo-backlog-monitor.js"]),
    runStep("measured_seo_contract", ["scripts/measured-seo-contract-check.js"], commonRuntimeEnv),
    runStep(
      "growth_ops_runtime",
      ["scripts/local-growth-ops-export.js", "--runtime-only", "--runtime-out", runtimeGrowthAsset],
      {
        ...commonRuntimeEnv,
        LOCAL_GROWTH_OPS_RUNTIME_ONLY: "1",
        LOCAL_GROWTH_OPS_RUNTIME_ASSET: runtimeGrowthAsset
      }
    )
  ];
  const growth = readJson(runtimeGrowthAsset);
  const report = {
    success: steps.every((step) => step.ok),
    generated_at: new Date().toISOString(),
    source_revision: sourceRevision(),
    runtime_reports_root: runtimeReportsRoot,
    runtime_assets_root: runtimeAssetsRoot,
    public_runtime_assets: {
      growth_ops: runtimeGrowthAsset,
      intent_conversion: runtimeIntentAsset,
      source_quality: runtimeSourceAsset
    },
    summary: {
      ok: steps.filter((step) => step.ok).length,
      failed: steps.filter((step) => !step.ok).length,
      attention: steps.filter((step) => step.attention).length,
      growth_status: growth?.status || "",
      growth_reports_available: Number(growth?.reports_available || 0),
      growth_reports_expected: Number(growth?.reports_expected || 0),
      growth_attention: Number(growth?.attention_count || 0)
    },
    steps
  };
  writeJson(cycleReportPath, report);
  console.log(`Runtime report cycle: ${report.success ? "ok" : "failed"} (${report.summary.ok}/${steps.length} step(s) ok), growth ${report.summary.growth_reports_available}/${report.summary.growth_reports_expected}.`);
  console.log(`Runtime Growth Ops asset: ${runtimeGrowthAsset}`);
  if (!report.success) process.exit(1);
}

run();
