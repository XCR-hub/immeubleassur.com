import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
const root = resolve(import.meta.dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "immeubleassur-privacy-retention-"));
const dbPath = join(dir, "fixture.sqlite");
const reportPath = join(dir, "report.json");
try {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE site_events(id TEXT, payload TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT);
    CREATE TABLE leads(id TEXT, name TEXT, phone TEXT, email TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT);
    CREATE TABLE newsletter_subscribers(id TEXT, email TEXT, status TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT);
    CREATE TABLE newsletter_events(id TEXT, payload TEXT, created_at TEXT);
    CREATE TABLE admin_auth_events(id TEXT, created_at TEXT);
    INSERT INTO site_events VALUES('expired','{}','198.51.100.1','Old UA',datetime('now','-200 days'));
    INSERT INTO site_events VALUES('anonymize','{}','198.51.100.2','Aging UA',datetime('now','-40 days'));
    INSERT INTO site_events VALUES('recent','{}','198.51.100.3','Recent UA',datetime('now','-2 days'));
    INSERT INTO leads VALUES('lead-old','Prospect','0612345678','prospect@example.test','198.51.100.4','Lead UA',datetime('now','-40 days'));
    INSERT INTO newsletter_subscribers VALUES('subscriber-old','subscriber@example.test','unsubscribed','198.51.100.5','Newsletter UA',datetime('now','-40 days'));
    INSERT INTO newsletter_events VALUES('event-email','{"email":"subscriber@example.test","source":"legacy"}',datetime('now','-40 days'));
    INSERT INTO admin_auth_events VALUES('audit-old',datetime('now','-200 days'));
  `);
  db.close();
  const child = spawnSync(process.execPath, [join(root, "scripts", "local-privacy-retention.js"), "--db", dbPath, "--out", reportPath, "--apply"], { cwd: root, encoding: "utf8" });
  if (child.status !== 0) throw new Error(child.stderr || child.stdout || `retention exit ${child.status}`);
  const verify = new DatabaseSync(dbPath, { readOnly: true });
  const expired = verify.prepare("SELECT COUNT(*) count FROM site_events WHERE id='expired'").get().count;
  const anonymized = verify.prepare("SELECT ip_address,user_agent FROM site_events WHERE id='anonymize'").get();
  const recent = verify.prepare("SELECT ip_address,user_agent FROM site_events WHERE id='recent'").get();
  const lead = verify.prepare("SELECT name,phone,email,ip_address,user_agent FROM leads WHERE id='lead-old'").get();
  const subscriber = verify.prepare("SELECT email,status,ip_address,user_agent FROM newsletter_subscribers WHERE id='subscriber-old'").get();
  const newsletterEvent = verify.prepare("SELECT payload FROM newsletter_events WHERE id='event-email'").get();
  const audits = verify.prepare("SELECT COUNT(*) count FROM admin_auth_events").get().count;
  verify.close();
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const checks = [
    ["expired-telemetry-deleted", Number(expired) === 0],
    ["aging-technical-identifiers-anonymized", anonymized?.ip_address === "" && anonymized?.user_agent === ""],
    ["recent-antifraud-identifiers-preserved", recent?.ip_address === "198.51.100.3" && recent?.user_agent === "Recent UA"],
    ["lead-contact-data-preserved", lead?.name === "Prospect" && lead?.phone === "0612345678" && lead?.email === "prospect@example.test" && lead?.ip_address === "" && lead?.user_agent === ""],
    ["newsletter-suppression-data-preserved", subscriber?.email === "subscriber@example.test" && subscriber?.status === "unsubscribed" && subscriber?.ip_address === "" && subscriber?.user_agent === ""],
    ["newsletter-event-email-removed", !String(newsletterEvent?.payload || "").includes("@")],
    ["expired-admin-audit-deleted", Number(audits) === 0],
    ["transactional-pii-free-report", report.status === "applied" && report.safeguards?.includes("transactional") && !JSON.stringify(report).includes("example.test")]
  ];
  const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
  console.log(`Privacy retention contract: ${failed.length ? "failed" : "passed"} (${checks.length-failed.length}/${checks.length}).`);
  if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }
} finally { rmSync(dir, { recursive: true, force: true }); }
