import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = resolve(import.meta.dirname, "..");
const fixture = mkdtempSync(join(tmpdir(), "immeubleassur-source-security-"));
const dbPath = join(fixture, "fixture.sqlite");
const out = join(fixture, "report.json");
const publicOut = join(fixture, "public.json");
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE site_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, page_url TEXT, target TEXT, session_id TEXT, lead_reference TEXT, payload TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT NOT NULL);
  CREATE TABLE leads (id TEXT PRIMARY KEY, reference TEXT, lead_score INTEGER, source TEXT, page_url TEXT, referrer TEXT, created_at TEXT NOT NULL);
`);
const insert = db.prepare("INSERT INTO site_events (id,event_type,page_url,target,session_id,payload,user_agent,created_at) VALUES (?,?,?,?,?,?,?,datetime('now'))");
let sequence = 0;
function blocked(session, source, userAgent = "Mozilla/5.0") {
  sequence += 1;
  insert.run(`event-${sequence}`, "lead_spam_blocked", "https://immeubleassur.com/devis-assurance-immeuble", "anti-spam", session, JSON.stringify({ source, reason: "fixture-block" }), userAgent);
}
blocked("qa-origin-fixture", "website", "node");
blocked("turnstile-test-fixture", "website", "node");
blocked("spam-test-fixture", "website", "PowerShell");
blocked("external-curl", "website", "curl/8.13.0");
blocked("external-1", "attack-source");
blocked("external-2", "attack-source");
blocked("external-3", "attack-source");

try {
  const result = spawnSync(process.execPath, [join(root, "scripts", "local-source-quality-monitor.js"), "--db", dbPath, "--out", out, "--public-out", publicOut], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `monitor exit ${result.status}`);
  const report = JSON.parse(readFileSync(out, "utf8"));
  const publicReport = JSON.parse(readFileSync(publicOut, "utf8"));
  const website = report.sources.find((row) => row.source === "website");
  const attack = report.sources.find((row) => row.source === "attack-source");
  const recommendation = report.recommendations.find((item) => item.source === "attack-source");
  const checks = [
    ["synthetic-checks-separated", website?.synthetic_security_checks === 3 && website?.spam_blocks === 1],
    ["synthetic-checks-no-acquisition-alert", !report.recommendations.some((item) => item.source === "website")],
    ["external-pressure-preserved", attack?.spam_blocks === 3 && attack?.synthetic_security_checks === 0],
    ["external-pressure-alerted", recommendation?.type === "source-pression-spam"],
    ["aggregate-counts-exact", report.summary?.spam_blocks === 4 && report.summary?.synthetic_security_checks === 3],
    ["public-export-aggregate-only", publicReport.summary?.synthetic_security_checks === 3 && !JSON.stringify(publicReport).includes("fixture-block")]
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  console.log(`Source security attribution contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
  if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }
} finally {
  db.close();
  rmSync(fixture, { recursive: true, force: true });
}