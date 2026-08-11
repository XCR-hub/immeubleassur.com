import { readFileSync } from "node:fs";

const api = readFileSync("functions/api/leads.js", "utf8");
const sla = readFileSync("scripts/local-lead-sla-monitor.js", "utf8");
const retry = readFileSync("scripts/local-lead-notification-retry.js", "utf8");
const production = readFileSync("scripts/local-production-monitor.js", "utf8");
const wrapper = readFileSync("scripts/local-production-monitor-task.ps1", "utf8");
const checks = [
  ["initial-and-duplicate-failures-persisted", api.includes('"email_notification_failed"') && api.includes('"duplicate_email_notification_failed"') && api.includes("await logLeadEvent")],
  ["team-recipient-required-at-submission", api.includes("team@immeubleassur.com absent")],
  ["failed-notifications-retried", retry.includes("duplicate_email_notification_failed") && retry.includes("email_notification_retry_sent") && retry.includes("atomic-retry-claim")],
  ["sla-alert-required-when-due", sla.includes('const alertRequired = env("LOCAL_LEAD_SLA_ALERTS", "0") === "1" && report.summary.due_now > 0')],
  ["sla-delivery-needs-sent-or-cooldown", sla.includes('["sent", "cooldown"].includes(report.alert.status)')],
  ["sla-fails-task-on-undelivered-alert", sla.includes("if (!report.success) process.exitCode = 1")],
  ["global-monitor-consumes-sla", production.includes("inspectLeadSla(leadSlaPath)") && production.includes("report.alert_delivery_verified === true")],
  ["due-alert-remains-visible-warning", production.includes("lead-sla-due-alerted") && production.includes('severity: "warn"')],
  ["production-wrapper-points-to-real-sla-report", wrapper.includes("LOCAL_LEAD_SLA_REPORT") && wrapper.includes("lead-sla-latest.json")]
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Lead SLA alert delivery contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }

