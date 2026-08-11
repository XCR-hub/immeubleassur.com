import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const root = resolve(".");
const fixture = mkdtempSync(join(tmpdir(), "immeubleassur-lead-sla-alert-"));
const dbPath = join(fixture, "sla.sqlite");
const reportPath = join(fixture, "sla-report.json");
let report = null;
let result = null;
try {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(readFileSync(join(root, "schema.sql"), "utf8"));
    const createdAt = new Date(Date.now() - 72 * 3600000).toISOString();
    db.prepare(`INSERT INTO leads (id, reference, name, phone, email, profile, property_type, city, units_count, need, message, lead_score, status, source, page_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run("fixture-lead", "IA-FIXTURE-SLA", "Fixture", "0100000000", "", "syndic-benevole", "copropriete", "Paris", "25", "multirisque-immeuble", "", 95, "new", "runtime-fixture", "https://immeubleassur.com/devis", createdAt, createdAt);
  } finally { db.close(); }

  result = spawnSync(process.execPath, [join(root, "scripts", "local-lead-sla-monitor.js"), "--db", dbPath, "--out", reportPath], {
    cwd: root,
    env: {
      ...process.env,
      LOCAL_LEAD_SLA_ALERTS: "1",
      LOCAL_LEAD_SLA_ALERT_TO: "team@immeubleassur.com",
      EMAIL_TRANSPORT: "smtp",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
      SMTP_USER: "fixture",
      SMTP_PASS: "fixture",
      SMTP_FROM: "fixture@immeubleassur.invalid"
    },
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000
  });
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

const checks = [
  ["task-fails", result?.status === 1],
  ["one-lead-due", report?.summary?.due_now === 1],
  ["delivery-required", report?.alert_delivery_required === true],
  ["delivery-not-verified", report?.alert_delivery_verified === false],
  ["report-fails", report?.success === false],
  ["transport-failure-recorded", report?.alert?.status === "failed"],
  ["report-excludes-contact-data", !JSON.stringify(report || {}).includes("0100000000") && !JSON.stringify(report || {}).includes("Fixture")]
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Lead SLA alert runtime: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }

