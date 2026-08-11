import { readFileSync } from "node:fs";

const imap = readFileSync("scripts/local-imap-sync.js", "utf8");
const task = readFileSync("scripts/local-runtime-task.ps1", "utf8");
const monitor = readFileSync("scripts/local-production-monitor.js", "utf8");
const alertBlock = imap.slice(imap.indexOf("async function maybeAlertPending"), imap.indexOf("class ImapSession"));
const checks = [
  ["pending-unmatched-queried", imap.includes("case_id IS NULL") && imap.includes("received_pending_review") && imap.includes("report.pending_unmatched") && imap.includes('all().results')],
  ["team-recipient-enforced", imap.includes("requireOperationalTeamRecipient(config)") && task.includes("LOCAL_IMAP_UNMATCHED_ALERT_TO = 'team@immeubleassur.com'")],
  ["alert-enabled-in-system-cycle", task.includes("LOCAL_IMAP_UNMATCHED_ALERTS = '1'") && task.includes("LOCAL_IMAP_UNMATCHED_ALERT_STATE")],
  ["content-free-alert", alertBlock.includes("Aucun expediteur, objet ou contenu de message n est inclus") && !alertBlock.includes("headers.") && !alertBlock.includes("sender") && !alertBlock.includes("subject")],
  ["cooldown-and-stable-signature", imap.includes("pendingSignature(rows)") && imap.includes("recentAlert(signature, cooldownMinutes)") && imap.includes("imap-unmatched-alert-state.json")],
  ["delivery-failure-is-visible", imap.includes("alert_delivery_required") && imap.includes("alert_delivery_verified") && imap.includes("process.exitCode = 1")],
  ["manual-review-link-present", imap.includes("https://immeubleassur.com/admin#cases")],
  ["self-alert-loop-prevented", imap.includes("X-ImmeubleAssur-Automation: ") && imap.includes("X-IMMEUBLEASSUR-AUTOMATION") && imap.includes("ignored_automation") && imap.includes("continue;") && monitor.includes("ignored_automation")],
  ["smtp-imap-roundtrip-proof-exported", imap.includes("smtp_roundtrip_verified") && imap.includes("smtp_roundtrip_marker: automationHeader") && imap.includes("automation_receipts[automationHeader]") && monitor.includes("smtp_roundtrip_receipts") && monitor.includes("smtp_roundtrip_last_seen_at")],
  ["roundtrip-proof-remains-metadata-only", imap.includes('mode: "read-only-headers"') && imap.includes("BODY.PEEK[HEADER.FIELDS") && !imap.includes("BODY.PEEK[TEXT]") && !imap.includes("BODY[]")],
  ["imap-remains-read-only", imap.includes("BODY.PEEK[HEADER.FIELDS") && !imap.includes("STORE ") && !imap.includes("EXPUNGE")]
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log("IMAP unmatched alert contract: " + (failed.length ? "failed" : "passed") + " (" + (checks.length - failed.length) + "/" + checks.length + ").");
if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }
