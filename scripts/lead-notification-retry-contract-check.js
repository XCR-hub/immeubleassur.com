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

try {
  database.exec(readFileSync("schema.sql", "utf8"));
  const createdAt = new Date(Date.now() - 40 * 60000).toISOString();
  database.prepare(`INSERT INTO leads (id, reference, name, phone, email, profile, property_type, city, lead_score, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("lead-retry-test", "IA-RETRY-TEST", "Test reprise", "0100000000", "test@example.invalid", "syndic-benevole", "copropriete", "Paris", 80, "new", "contract-test", createdAt, createdAt);
  database.prepare("INSERT INTO lead_events (id, lead_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("event-failed", "lead-retry-test", "email_notification_failed", "{}", createdAt);

  const runDry = () => spawnSync(process.execPath, ["scripts/local-lead-notification-retry.js", "--dry-run"], {
    cwd: process.cwd(),
    env: { ...process.env, LOCAL_SQLITE_DB: dbPath, LOCAL_NOTIFICATION_RETRY_REPORT: reportPath, LOCAL_NOTIFICATION_RETRY_COOLDOWN_MINUTES: "5" },
    encoding: "utf8"
  });

  let result = runDry();
  assert(result.status !== 0, "pending notification dry-run must keep monitoring degraded");
  let report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert(report.candidates === 1, "failed notification must become a retry candidate");
  assert(report.results[0]?.status === "dry-run", "dry-run must not send or mutate retry state");
  assert(database.prepare("SELECT COUNT(*) AS count FROM lead_events WHERE event_type LIKE 'email_notification_retry_%'").get().count === 0, "dry-run must not write retry events");

  const probeAt = new Date(Date.now() - 7 * 3600000).toISOString();
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    database.prepare("INSERT INTO lead_events (id, lead_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("event-retry-" + attempt, "lead-retry-test", "email_notification_retry_failed", JSON.stringify({ attempt }), probeAt);
  }
  result = runDry();
  assert(result.status !== 0, "exhausted recovery probe must keep monitoring degraded");
  report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert(report.candidates === 1 && report.results[0]?.recovery_probe === true, "exhausted burst must remain eligible for a spaced recovery probe");

  database.prepare("INSERT INTO lead_events (id, lead_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("event-sent", "lead-retry-test", "email_notification_sent", "{}", new Date().toISOString());
  result = runDry();
  assert(result.status === 0, "second dry-run failed");
  report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert(report.candidates === 0, "a successful notification must suppress retries");

  console.log("Lead notification retry contract passed: failed candidate detected, dry-run immutable, sent notification deduplicated.");
} finally {
  database.close();
  if (root.startsWith(tmpdir())) rmSync(root, { recursive: true, force: true });
}
