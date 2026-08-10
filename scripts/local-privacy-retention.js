import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();
function argValue(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback; }
function days(name, fallback) { const value = Number(env(name, String(fallback))); return Number.isFinite(value) && value >= 1 ? Math.round(value) : fallback; }
const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
const reportPath = resolve(argValue("--out", env("LOCAL_PRIVACY_RETENTION_REPORT", join(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"), "local-privacy-retention-report.json"))));
const apply = process.argv.includes("--apply") || env("LOCAL_PRIVACY_RETENTION_APPLY", "0") === "1";
const technicalDays = days("LOCAL_PRIVACY_TECHNICAL_DAYS", 30);
const telemetryDays = days("LOCAL_PRIVACY_TELEMETRY_DAYS", 180);
const auditDays = days("LOCAL_PRIVACY_AUDIT_DAYS", 180);
function writeReport(value) { mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function tableExists(db, name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function count(db, sql, binds = []) { return Number(db.prepare(sql).get(...binds)?.count || 0); }
function changeCount(result) { return Number(result?.changes || 0); }

if (!existsSync(dbPath)) throw new Error(`Base SQLite introuvable: ${dbPath}`);
const db = new DatabaseSync(dbPath);
try {
  const cutTechnical = `-${technicalDays} days`;
  const cutTelemetry = `-${telemetryDays} days`;
  const cutAudit = `-${auditDays} days`;
  const estimates = {
    site_events_technical: tableExists(db, "site_events") ? count(db, "SELECT COUNT(*) count FROM site_events WHERE created_at < datetime('now', ?) AND (COALESCE(ip_address,'')<>'' OR COALESCE(user_agent,'')<>'')", [cutTechnical]) : 0,
    site_events_expired: tableExists(db, "site_events") ? count(db, "SELECT COUNT(*) count FROM site_events WHERE created_at < datetime('now', ?)", [cutTelemetry]) : 0,
    leads_technical: tableExists(db, "leads") ? count(db, "SELECT COUNT(*) count FROM leads WHERE created_at < datetime('now', ?) AND (COALESCE(ip_address,'')<>'' OR COALESCE(user_agent,'')<>'')", [cutTechnical]) : 0,
    newsletter_technical: tableExists(db, "newsletter_subscribers") ? count(db, "SELECT COUNT(*) count FROM newsletter_subscribers WHERE created_at < datetime('now', ?) AND (COALESCE(ip_address,'')<>'' OR COALESCE(user_agent,'')<>'')", [cutTechnical]) : 0,
    newsletter_event_email_payloads: tableExists(db, "newsletter_events") ? count(db, "SELECT COUNT(*) count FROM newsletter_events WHERE json_valid(payload) AND json_type(payload, '$.email') IS NOT NULL") : 0,
    admin_audits_expired: tableExists(db, "admin_auth_events") ? count(db, "SELECT COUNT(*) count FROM admin_auth_events WHERE created_at < datetime('now', ?)", [cutAudit]) : 0
  };
  const changes = Object.fromEntries(Object.keys(estimates).map((key) => [key, 0]));
  if (apply) {
    db.exec("BEGIN IMMEDIATE");
    try {
      if (tableExists(db, "site_events")) {
        changes.site_events_technical = changeCount(db.prepare("UPDATE site_events SET ip_address='', user_agent='' WHERE created_at < datetime('now', ?) AND (COALESCE(ip_address,'')<>'' OR COALESCE(user_agent,'')<>'')").run(cutTechnical));
        changes.site_events_expired = changeCount(db.prepare("DELETE FROM site_events WHERE created_at < datetime('now', ?)").run(cutTelemetry));
      }
      if (tableExists(db, "leads")) changes.leads_technical = changeCount(db.prepare("UPDATE leads SET ip_address='', user_agent='' WHERE created_at < datetime('now', ?) AND (COALESCE(ip_address,'')<>'' OR COALESCE(user_agent,'')<>'')").run(cutTechnical));
      if (tableExists(db, "newsletter_subscribers")) changes.newsletter_technical = changeCount(db.prepare("UPDATE newsletter_subscribers SET ip_address='', user_agent='' WHERE created_at < datetime('now', ?) AND (COALESCE(ip_address,'')<>'' OR COALESCE(user_agent,'')<>'')").run(cutTechnical));
      if (tableExists(db, "newsletter_events")) changes.newsletter_event_email_payloads = changeCount(db.prepare("UPDATE newsletter_events SET payload=json_remove(payload, '$.email') WHERE json_valid(payload) AND json_type(payload, '$.email') IS NOT NULL").run());
      if (tableExists(db, "admin_auth_events")) changes.admin_audits_expired = changeCount(db.prepare("DELETE FROM admin_auth_events WHERE created_at < datetime('now', ?)").run(cutAudit));
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const report = { generated_at: new Date().toISOString(), success: true, status: apply ? "applied" : "dry-run", database: { mode: apply ? "sqlite-transactional-write" : "sqlite-readonly-analysis", file: dbPath.split(/[\\/]/).pop() }, policy: { technical_identifiers_days: technicalDays, telemetry_days: telemetryDays, admin_audit_days: auditDays, lead_contact_data_deleted: false, newsletter_suppression_data_deleted: false }, estimates, changes, safeguards: ["transactional", "no-lead-contact-deletion", "no-newsletter-suppression-deletion", "technical-identifiers-anonymized", "expired-telemetry-only", "no-pii-in-report"] };
  writeReport(report);
  console.log(`Privacy retention ${report.status}: ${Object.values(changes).reduce((sum, value) => sum + value, 0)} row change(s).`);
} finally { db.close(); }
