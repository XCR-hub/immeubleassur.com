import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function writeJson(path, value) { ensureDir(dirname(path)); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function clean(value, max = 2000) { return String(value || "").replace(/\r/g, "").trim().slice(0, max); }

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
  const attention = result.status === 0 && /(failed|degraded|action-required|fallback-only|partial)/i.test(stdout + " " + stderr);
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
    LOCAL_RUNTIME_REPORTS_ROOT: runtimeReportsRoot,
    LOCAL_RUNTIME_ASSETS_ROOT: runtimeAssetsRoot,
    LOCAL_SMTP_HEALTH_REPORT: join(runtimeReportsRoot, "local-smtp-health-report.json"),
    LOCAL_INTENT_CONVERSION_REPORT: runtimeIntentReport,
    LOCAL_INTENT_CONVERSION_PUBLIC_REPORT: runtimeIntentAsset,
    LOCAL_SOURCE_QUALITY_REPORT: runtimeSourceReport,
    LOCAL_SOURCE_QUALITY_PUBLIC_REPORT: runtimeSourceAsset,
    BROKERAGE_CASE_REPORT: join(runtimeReportsRoot, "brokerage-case-orchestrator-report.json"),
    BROKERAGE_CASE_PUBLIC_REPORT: join(runtimeAssetsRoot, "assets", "brokerage-case-orchestrator-latest.json"),
    CLIENT_CONTRACT_REPORT: join(runtimeReportsRoot, "client-contract-orchestrator-report.json"),
    CLIENT_CONTRACT_PUBLIC_REPORT: join(runtimeAssetsRoot, "assets", "client-contract-orchestrator-latest.json")
  };
  const steps = [
    runStep("smtp_health", ["scripts/local-smtp-health-check.js"], commonRuntimeEnv),
    runStep("live_api_readiness", ["scripts/live-api-readiness-check.js"], commonRuntimeEnv),
    runStep("google_readiness_unlock", ["scripts/google-readiness-unlock.js"], commonRuntimeEnv),
    runStep("sqlite_backup", ["scripts/local-sqlite-backup.js"]),
    runStep("brokerage_cases", ["scripts/brokerage-case-orchestrator.js"], commonRuntimeEnv),
    runStep("client_contracts", ["scripts/client-contract-orchestrator.js"], commonRuntimeEnv),
    runStep("imap_sync", ["scripts/local-imap-sync.js"]),
    runStep("contract_renewal_monitor", ["scripts/local-contract-renewal-monitor.js"]),
    runStep("production_monitor", ["scripts/local-production-monitor.js"]),
    runStep("tls_certificate_monitor", ["scripts/local-tls-certificate-monitor.js"]),
    runStep("lead_sla_monitor", ["scripts/local-lead-sla-monitor.js"]),
    runStep("lead_quality_monitor", ["scripts/local-lead-quality-monitor.js"]),
    runStep("conversion_funnel_monitor", ["scripts/local-conversion-funnel-monitor.js"]),
    runStep("intent_conversion_runtime", ["scripts/local-intent-conversion-monitor.js"], commonRuntimeEnv),
    runStep("source_quality_monitor", ["scripts/local-source-quality-monitor.js"], commonRuntimeEnv),
    runStep("seo_backlog_monitor", ["scripts/local-seo-backlog-monitor.js"]),
    runStep("conversion_action_sync", ["scripts/local-conversion-action-sync.js"]),
    runStep("seo_backlog_monitor_after_sync", ["scripts/local-seo-backlog-monitor.js"]),
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
