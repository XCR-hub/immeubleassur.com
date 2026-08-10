import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";
loadDefaultEnvFiles();
const backup=readFileSync("scripts/local-sqlite-backup.js","utf8");
const monitor=readFileSync("scripts/local-production-monitor.js","utf8");
const runtime=readFileSync("scripts/local-runtime-report-cycle.js","utf8");
const task=readFileSync("scripts/local-runtime-task.ps1","utf8");
const checks=[
  ["backup-vacuum-atomic-copy",backup.includes("VACUUM INTO")],
  ["backup-integrity-check",backup.includes("PRAGMA integrity_check")],
  ["backup-content-hash",backup.includes("sha256: sha256(backupPath)")],
  ["tiered-recent-retention",backup.includes("recent: keep")&&backup.includes("recent: 32")===false&&backup.includes('LOCAL_SQLITE_BACKUP_KEEP", "32"')],
  ["tiered-daily-retention",backup.includes("LOCAL_SQLITE_BACKUP_DAILY_DAYS")&&backup.includes("daily_snapshots")],
  ["tiered-weekly-retention",backup.includes("LOCAL_SQLITE_BACKUP_WEEKLY_WEEKS")&&backup.includes("weekly_snapshots")],
  ["monitor-verifies-backup-exists",monitor.includes("artifact_exists")&&monitor.includes("existsSync(backupFile)")],
  ["monitor-verifies-backup-hash",monitor.includes("artifact_verified")&&monitor.includes("actualHash === manifest.sha256")],
  ["monitor-covers-tls",monitor.includes('inspectJsonRuntime("tls_certificate"')],
  ["monitor-covers-smtp",monitor.includes('inspectJsonRuntime("smtp_transport"')],
  ["monitor-covers-newsletter",monitor.includes('inspectJsonRuntime("newsletter_delivery"')],
  ["monitor-covers-runtime-cycle",monitor.includes('inspectJsonRuntime("runtime_cycle_freshness"')],
  ["monitor-covers-security-surface",monitor.includes('inspectJsonRuntime("security_surface"') && runtime.includes('runStep("security_surface_monitor"')],
  ["production-alerts-enabled",task.includes("LOCAL_MONITOR_ALERTS = '1'")],
  ["lead-sla-alerts-enabled",task.includes("LOCAL_LEAD_SLA_ALERTS = '1'")],
  ["runtime-runs-monitor",runtime.includes('runStep("production_monitor"')]
];
const missing=checks.filter(([,ok])=>!ok).map(([name])=>name);
const report={generated_at:new Date().toISOString(),status:missing.length?"failed":"passed",checks:checks.length,missing,safeguards:["tiered-backup-retention","backup-artifact-hash-verification","cross-system-freshness","email-alert-cooldown","lead-sla-alerts"]};
const out=process.env.LOCAL_RELIABILITY_CONTRACT_REPORT||join(process.env.LOCAL_RUNTIME_REPORTS_ROOT||"reports","reliability-contract-report.json"); mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,`${JSON.stringify(report,null,2)}\n`,`utf8`); console.log(`Reliability contract: ${report.status} (${checks.filter(([,ok])=>ok).length}/${checks.length}).`); if(missing.length)process.exit(1);