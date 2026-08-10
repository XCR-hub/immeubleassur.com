import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";
loadDefaultEnvFiles();
const backup=readFileSync("scripts/local-sqlite-backup.js","utf8");
const monitor=readFileSync("scripts/local-production-monitor.js","utf8");
const runtime=readFileSync("scripts/local-runtime-report-cycle.js","utf8");
const task=readFileSync("scripts/local-runtime-task.ps1","utf8");
const backupTask=readFileSync("scripts/local-sqlite-backup-task.ps1","utf8");
const monitorTask=readFileSync("scripts/local-production-monitor-task.ps1","utf8");
const lighthouse=readFileSync("scripts/local-lighthouse-monitor.js","utf8");
const restoreDrill=readFileSync("scripts/local-sqlite-restore-drill.js","utf8");
const server=readFileSync("scripts/local-production-server.js","utf8");
const security=readFileSync("scripts/local-security-surface-monitor.js","utf8");
const smtp=readFileSync("scripts/local-smtp.js","utf8");
const smtpHealth=readFileSync("scripts/local-smtp-health-check.js","utf8");
const leadCanary=readFileSync("scripts/lead-dedupe-runtime-check.js","utf8");
const smtpEnvelope=smtp.slice(smtp.indexOf("export async function verifyNodeSmtpRecipients"),smtp.indexOf("export async function sendNodeSmtpMail"));
const inlineExecutableHtml=readdirSync("public",{recursive:true}).filter((file)=>String(file).endsWith(".html")).filter((file)=>/<script\b(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json["'])[^>]*>/i.test(readFileSync(join("public",String(file)),"utf8")));
const checks=[
  ["backup-vacuum-atomic-copy",backup.includes("VACUUM INTO")],
  ["backup-integrity-check",backup.includes("PRAGMA integrity_check")],
  ["backup-content-hash",backup.includes("const backupHash = sha256(backupPath)")&&backup.includes("sha256: backupHash")],
  ["backup-cross-volume-mirror",backup.includes("LOCAL_SQLITE_BACKUP_MIRROR_DIR")&&backup.includes("copyFileSync")],
  ["backup-mirror-integrity-and-hash",backup.includes("mirrorInspection.integrity")&&backup.includes("mirrorHash !== backupHash")],
  ["tiered-recent-retention",backup.includes("recent: keep")&&backup.includes("recent: 32")===false&&backup.includes('LOCAL_SQLITE_BACKUP_KEEP", "32"')],
  ["tiered-daily-retention",backup.includes("LOCAL_SQLITE_BACKUP_DAILY_DAYS")&&backup.includes("daily_snapshots")],
  ["tiered-weekly-retention",backup.includes("LOCAL_SQLITE_BACKUP_WEEKLY_WEEKS")&&backup.includes("weekly_snapshots")],
  ["monitor-verifies-backup-exists",monitor.includes("artifact_exists")&&monitor.includes("existsSync(backupFile)")],
  ["monitor-verifies-backup-hash",monitor.includes("artifact_verified")&&monitor.includes("actualHash === manifest.sha256")],
  ["monitor-requires-verified-mirror",monitor.includes("LOCAL_SQLITE_BACKUP_MIRROR_REQUIRED")&&monitor.includes("mirror_verified")],
  ["runtime-configures-cross-volume-mirror",task.includes("LOCAL_SQLITE_BACKUP_MIRROR_DIR = 'C:\\Users\\Administrateur\\immeubleassur-backup-mirror'")&&task.includes("LOCAL_SQLITE_BACKUP_MIRROR_REQUIRED = '1'")],
  ["dedicated-backup-task-requires-cross-volume-mirror",backupTask.includes("LOCAL_SQLITE_BACKUP_MIRROR_DIR = 'C:\\Users\\Administrateur\\immeubleassur-backup-mirror'")&&backupTask.includes("LOCAL_SQLITE_BACKUP_MIRROR_REQUIRED = '1'")],
  ["dedicated-monitor-task-requires-verified-mirror",monitorTask.includes("LOCAL_SQLITE_BACKUP_MIRROR_REQUIRED = '1'")&&monitorTask.includes("LOCAL_RUNTIME_REPORTS_ROOT = 'F:\\immeubleassur-runtime\\reports'")],
  ["restore-drill-copies-backup",restoreDrill.includes("copyFileSync(sourcePath, restoredPath)")],
  ["restore-drill-verifies-hash",restoreDrill.includes("restoredHash !== expectedHash")],
  ["restore-drill-opens-read-only",restoreDrill.includes("{ readOnly: true }")],
  ["restore-drill-checks-integrity-and-foreign-keys",restoreDrill.includes("PRAGMA integrity_check")&&restoreDrill.includes("PRAGMA foreign_key_check")],
  ["restore-drill-cleans-temporary-copy",restoreDrill.includes("rmSync(restoredPath, { force: true })")],
  ["production-monitor-requires-fresh-restore-drill",monitor.includes('inspectJsonRuntime("sqlite_restore_drill"')],
  ["runtime-runs-restore-drill",runtime.includes('runStep("sqlite_restore_drill"')],
  ["runtime-fails-on-ready-connector-errors",runtime.includes('["scripts/live-ready-connectors-runner.js", "--runtime-cycle", "--strict"]')],
  ["runtime-does-not-rerun-connectors",task.match(/live-ready-connectors-runner\\.js/g) === null],
  ["csp-blocks-inline-executable-scripts",server.includes("script-src 'self' https://challenges.cloudflare.com")&&!server.includes("script-src 'self' 'unsafe-inline'")],
  ["public-html-has-no-inline-executable-scripts",inlineExecutableHtml.length===0],
  ["live-security-monitor-enforces-strict-script-csp",security.includes("csp-blocks-inline-executable-scripts")&&security.includes("!scriptPolicy.includes")&&security.includes("'unsafe-inline'")],
  ["smtp-envelope-verifies-recipients",smtp.includes("verifyNodeSmtpRecipients")&&smtp.includes("RCPT TO")&&smtp.includes('smtpCommand(client, "RSET"')],
  ["smtp-envelope-does-not-send-message",smtpEnvelope.includes('smtpCommand(client, "RSET"')&&!smtpEnvelope.includes('smtpCommand(client, "DATA"')&&smtpHealth.includes("message_sent: false")&&smtpHealth.includes("envelope_test_only")],
  ["smtp-health-requires-team-recipient",smtpHealth.includes("team@immeubleassur.com")&&smtpHealth.includes("team_recipient_configured")],
  ["production-monitor-requires-recipient-acceptance",monitor.includes("report.team_recipient_configured === true")&&monitor.includes("report.recipient_accepted === true")],
  ["production-monitor-covers-notification-backlog",monitor.includes('inspectJsonRuntime("lead_notification_backlog"')&&monitor.includes("report.exhausted === 0")],
  ["runtime-runs-isolated-lead-submission-canary",runtime.includes('runStep("lead_submission_canary"')&&leadCanary.includes("sqlite-temp-db")&&leadCanary.includes("no-smtp-config")],
  ["monitor-covers-isolated-lead-submission-canary",monitor.includes('inspectJsonRuntime("lead_submission_canary"')&&monitor.includes("report.express?.placeholders_ok === true")],
  ["monitor-covers-tls",monitor.includes('inspectJsonRuntime("tls_certificate"')],
  ["monitor-covers-smtp",monitor.includes('inspectJsonRuntime("smtp_transport"')],
  ["monitor-covers-newsletter",monitor.includes('inspectJsonRuntime("newsletter_delivery"')],
  ["monitor-accepts-safe-manual-newsletter-sync",monitor.includes('"synced-awaiting-auto-send"')&&monitor.includes("report.issue_synced === true")&&monitor.includes("report.failed === 0")],
  ["monitor-covers-runtime-cycle",monitor.includes('inspectJsonRuntime("runtime_cycle_freshness"')],
  ["monitor-skips-cycle-self-reference-only-when-explicit",monitor.includes('LOCAL_PRODUCTION_MONITOR_SKIP_RUNTIME_CYCLE')&&monitor.includes('? [] : [inspectJsonRuntime("runtime_cycle_freshness"')],
  ["runtime-marks-in-cycle-monitor-call",runtime.includes('LOCAL_PRODUCTION_MONITOR_SKIP_RUNTIME_CYCLE: "1"')],
  ["monitor-covers-security-surface",monitor.includes('inspectJsonRuntime("security_surface"') && runtime.includes('runStep("security_surface_monitor"')],
  ["monitor-covers-editorial-review-sla",monitor.includes("inspectEditorialReview(editorialReviewPath)")&&monitor.includes('severity = fresh && report.success === true && critical === 0 && warning > 0 ? "warn" : "fail"')],
  ["monitor-failure-exits-gracefully",monitor.includes("if (!report.success) process.exitCode = 1")&&!monitor.includes("if (!report.success) process.exit(1)")],
  ["monitor-covers-dependency-security",monitor.includes('inspectJsonRuntime("dependency_security"') && runtime.includes('runStep("dependency_security"')],
  ["monitor-covers-scheduled-task-health",monitor.includes('inspectJsonRuntime("scheduled_task_health"') && runtime.includes('runStep("scheduled_task_health"')],
  ["monitor-covers-nondestructive-turnstile-browser",monitor.includes('inspectJsonRuntime("turnstile_browser"')&&monitor.includes("report.destructive === false")&&monitor.includes("report.submitted_forms || 0")],
  ["monitor-covers-site-watchdog",monitor.includes('inspectJsonRuntime("site_watchdog"')&&monitor.includes('LOCAL_SITE_WATCHDOG_REPORT')],
  ["production-alerts-enabled",task.includes("LOCAL_MONITOR_ALERTS = '1'")],
  ["lead-sla-alerts-enabled",task.includes("LOCAL_LEAD_SLA_ALERTS = '1'")],
  ["runtime-runs-monitor",runtime.includes('runStep("production_monitor"')],
  ["lighthouse-reports-long-tasks",lighthouse.includes('"long-tasks"')&&lighthouse.includes("long_tasks")],
  ["lighthouse-reports-script-bootup",lighthouse.includes('"bootup-time"')&&lighthouse.includes("bootup_time")],
  ["lighthouse-reports-unused-javascript",lighthouse.includes('"unused-javascript"')&&lighthouse.includes("unused_javascript")]
];
const missing=checks.filter(([,ok])=>!ok).map(([name])=>name);
const report={generated_at:new Date().toISOString(),status:missing.length?"failed":"passed",checks:checks.length,missing,safeguards:["tiered-backup-retention","backup-artifact-hash-verification","cross-volume-mirror-verification","non-destructive-restore-drill","strict-ready-connector-failures","single-pass-ready-connectors","strict-script-csp","smtp-recipient-envelope-acceptance","cross-system-freshness","email-alert-cooldown","lead-sla-alerts","actionable-lighthouse-diagnostics"]};
const out=process.env.LOCAL_RELIABILITY_CONTRACT_REPORT||join(process.env.LOCAL_RUNTIME_REPORTS_ROOT||"reports","reliability-contract-report.json"); mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,`${JSON.stringify(report,null,2)}\n`,`utf8`); console.log(`Reliability contract: ${report.status} (${checks.filter(([,ok])=>ok).length}/${checks.length}).`); if(missing.length)process.exit(1);