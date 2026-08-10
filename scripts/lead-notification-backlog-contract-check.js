import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = resolve(import.meta.dirname, "..");
const fixture = mkdtempSync(join(tmpdir(), "immeubleassur-notification-backlog-"));
const dbPath = join(fixture, "fixture.sqlite");
const reportPath = join(fixture, "report.json");
const database = new DatabaseSync(dbPath);
database.exec(`
  CREATE TABLE leads (id TEXT PRIMARY KEY, reference TEXT, name TEXT, phone TEXT, email TEXT, profile TEXT, property_type TEXT, city TEXT, units_count TEXT, need TEXT, message TEXT, lead_score INTEGER, status TEXT, source TEXT, page_url TEXT, referrer TEXT, ip_address TEXT, user_agent TEXT, assigned_to TEXT, notes TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE lead_events (id TEXT PRIMARY KEY, lead_id TEXT, event_type TEXT, payload TEXT, created_at TEXT);
`);
const old = new Date(Date.now() - 2 * 3600000).toISOString();
database.prepare("INSERT INTO leads (id, reference, name, phone, email, profile, property_type, city, lead_score, status, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run("lead-1", "IA-FIXTURE", "Fixture", "0600000000", "", "syndic", "copropriete", "Lyon", 80, "new", "fixture", old, old);
database.prepare("INSERT INTO lead_events VALUES (?,?,?,?,?)").run("failed-0", "lead-1", "email_notification_failed", "{}", old);
for (let attempt = 1; attempt <= 5; attempt += 1) database.prepare("INSERT INTO lead_events VALUES (?,?,?,?,?)").run(`retry-${attempt}`, "lead-1", "email_notification_retry_failed", "{}", old);
database.prepare("INSERT INTO leads (id, reference, name, phone, email, profile, property_type, city, lead_score, status, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run("lead-2", "IA-LEASE", "Fixture", "0600000001", "lease@example.test", "syndic", "copropriete", "Paris", 70, "new", "fixture", old, old);
database.prepare("INSERT INTO lead_events VALUES (?,?,?,?,?)").run("failed-lease", "lead-2", "email_notification_failed", "{}", old);
database.prepare("INSERT INTO lead_events VALUES (?,?,?,?,?)").run("claim-active", "lead-2", "email_notification_retry_claimed", "{}", new Date().toISOString());

function runRetry() {
  return spawnSync(process.execPath, [join(root, "scripts", "local-lead-notification-retry.js"), "--dry-run"], { cwd: root, encoding: "utf8", env: { ...process.env, LOCAL_SQLITE_DB: dbPath, LOCAL_NOTIFICATION_RETRY_REPORT: reportPath } });
}

try {
  const blockedRun = runRetry();
  const blocked = JSON.parse(readFileSync(reportPath, "utf8"));
  database.prepare("UPDATE lead_events SET created_at = ? WHERE id = 'claim-active'").run(old);
  const expiredRun = runRetry();
  const expired = JSON.parse(readFileSync(reportPath, "utf8"));
  database.prepare("INSERT INTO lead_events VALUES (?,?,?,?,?)").run("sent-1", "lead-1", "email_notification_retry_sent", "{}", new Date().toISOString());
  database.prepare("INSERT INTO lead_events VALUES (?,?,?,?,?)").run("sent-2", "lead-2", "email_notification_retry_sent", "{}", new Date().toISOString());
  const recoveredRun = runRetry();
  const recovered = JSON.parse(readFileSync(reportPath, "utf8"));
  const checks = [
    ["exhausted-backlog-exits-nonzero", blockedRun.status !== 0],
    ["exhausted-backlog-is-degraded", blocked.status === "degraded"],
    ["pending-count-visible", blocked.pending === 2],
    ["exhausted-count-visible", blocked.exhausted === 1],
    ["active-lease-hides-candidate-not-backlog", blocked.candidates === 0],
    ["expired-lease-restores-candidate", expiredRun.status !== 0 && expired.candidates === 1],
    ["privacy-safeguards-declared", blocked.safeguards?.includes("smtp-diagnostics-redacted") && blocked.safeguards?.includes("no-contact-data-in-report")],
    ["sent-event-clears-backlog", recovered.pending === 0 && recovered.exhausted === 0],
    ["recovered-status-completed", recovered.status === "completed"],
    ["recovered-exits-zero", recoveredRun.status === 0]
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  console.log(`Lead notification backlog contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
  if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }
} finally {
  database.close();
  rmSync(fixture, { recursive: true, force: true });
}
