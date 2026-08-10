import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = mkdtempSync(join(tmpdir(), "immeubleassur-notification-retry-"));
const dbPath = join(root, "leads.sqlite");
const reportPath = join(root, "retry-report.json");
const database = new DatabaseSync(dbPath);
const retrySource = readFileSync("scripts/local-lead-notification-retry.js", "utf8");

try {
  assert(retrySource.includes('item.toLowerCase() === "team@immeubleassur.com"'), "retry transport must require the operational team recipient");
  assert(retrySource.includes("duplicate_email_notification_failed"), "duplicate return notification failures must be retried");
  assert(retrySource.includes("datetime(ok.created_at) >= datetime(f.failed_at)"), "only a success after the latest failure may suppress a retry");
  database.exec(readFileSync("schema.sql", "utf8"));
  const initialFailureAt = new Date(Date.now() - 8 * 3600000).toISOString();
  const duplicateFailureAt = new Date(Date.now() - 40 * 60000).toISOString();
  const oldSuccessAt = new Date(Date.now() - 2 * 3600000).toISOString();
  const insertLead = database.prepare(`INSERT INTO leads (id, reference, name, phone, email, profile, property_type, city, lead_score, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertLead.run("lead-retry-test", "IA-RETRY-TEST", "Test reprise", "0100000000", "test@example.invalid", "syndic-benevole", "copropriete", "Paris", 80, "new", "contract-test", initialFailureAt, initialFailureAt);
  insertLead.run("lead-duplicate-test", "IA-DUPLICATE-TEST", "Test retour", "0200000000", "duplicate@example.invalid", "syndic-professionnel", "immeuble", "Lyon", 70, "new", "contract-test", oldSuccessAt, oldSuccessAt);
  const insertEvent = database.prepare("INSERT INTO lead_events (id, lead_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)");
  insertEvent.run("event-failed", "lead-retry-test", "email_notification_failed", "{}", initialFailureAt);
  insertEvent.run("event-old-success", "lead-duplicate-test", "email_notification_sent", "{}", oldSuccessAt);
  insertEvent.run("event-duplicate-failed", "lead-duplicate-test", "duplicate_email_notification_failed", "{}", duplicateFailureAt);

  const runDry = () => spawnSync(process.execPath, ["scripts/local-lead-notification-retry.js", "--dry-run"], {
    cwd: process.cwd(),
    env: { ...process.env, SMTP_TO: "team@immeubleassur.com", LOCAL_SQLITE_DB: dbPath, LOCAL_NOTIFICATION_RETRY_REPORT: reportPath, LOCAL_NOTIFICATION_RETRY_COOLDOWN_MINUTES: "5" },
    encoding: "utf8"
  });
  const rejectedRecipient = spawnSync(process.execPath, ["scripts/local-lead-notification-retry.js", "--dry-run"], {
    cwd: process.cwd(),
    env: { ...process.env, SMTP_TO: "wrong-recipient@example.invalid", LOCAL_SQLITE_DB: dbPath, LOCAL_NOTIFICATION_RETRY_REPORT: reportPath },
    encoding: "utf8"
  });
  assert(rejectedRecipient.status !== 0 && rejectedRecipient.stderr.includes("team@immeubleassur.com absent"), "retry transport must reject a non-team recipient at runtime");

  let result = runDry();
  assert(result.status !== 0, "pending notification dry-run must keep monitoring degraded");
  let report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert(report.candidates === 2, "initial and duplicate-return failures must both become retry candidates");
  assert(report.results.some((item) => item.notification_kind === "duplicate-return"), "an earlier initial success must not hide a later duplicate-return failure");
  assert(database.prepare("SELECT COUNT(*) AS count FROM lead_events WHERE event_type LIKE 'email_notification_retry_%'").get().count === 0, "dry-run must not write retry events");

  const probeAt = new Date(Date.now() - 7 * 3600000).toISOString();
  for (let attempt = 1; attempt <= 5; attempt += 1) insertEvent.run("event-retry-" + attempt, "lead-retry-test", "email_notification_retry_failed", JSON.stringify({ attempt }), probeAt);
  result = runDry();
  report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert(report.results.some((item) => item.reference === "IA-RETRY-TEST" && item.recovery_probe === true), "exhausted initial failure must remain eligible for a spaced recovery probe");

  const now = new Date().toISOString();
  insertEvent.run("event-sent", "lead-retry-test", "email_notification_sent", "{}", now);
  insertEvent.run("event-duplicate-sent", "lead-duplicate-test", "duplicate_email_notification_sent", "{}", now);
  result = runDry();
  assert(result.status === 0, "successful notifications after each failure must clear the backlog");
  report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert(report.candidates === 0 && report.pending === 0, "post-failure successes must suppress retries");

  console.log("Lead notification retry contract passed: initial and duplicate-return failures covered chronologically.");
} finally {
  database.close();
  if (root.startsWith(tmpdir())) rmSync(root, { recursive: true, force: true });
}
