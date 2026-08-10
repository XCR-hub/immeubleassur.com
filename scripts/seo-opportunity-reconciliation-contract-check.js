import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = mkdtempSync(join(tmpdir(), "immeubleassur-seo-reconcile-"));
const dbPath = join(root, "fixture.sqlite");
const auditPath = join(root, "conversion.json");
const reportPath = join(root, "reconciliation.json");
const database = new DatabaseSync(dbPath);
database.exec(`CREATE TABLE seo_opportunities (id TEXT PRIMARY KEY, run_id TEXT, url TEXT, query TEXT, opportunity_type TEXT, score INTEGER, status TEXT, recommendation TEXT, payload TEXT, created_at TEXT, updated_at TEXT)`);
const insert = database.prepare(`INSERT INTO seo_opportunities (id, run_id, url, query, opportunity_type, score, status, recommendation, payload, created_at, updated_at) VALUES (?, '', ?, '', 'google-conversion-intelligence', 88, 'open', 'Ajouter un formulaire ou un CTA direct vers devis.', '{}', datetime('now'), datetime('now'))`);
insert.run("resolved-page", "https://immeubleassur.com/pno-cno");
insert.run("missing-page", "https://immeubleassur.com/page-introuvable-contract-fixture");
database.close();
writeFileSync(auditPath, JSON.stringify({ generated_at: new Date().toISOString(), pages_checked: 200, weak_money_pages: [], actions: [] }), "utf8");

function run() {
  return spawnSync(process.execPath, ["scripts/local-seo-opportunity-reconcile.js"], { cwd: process.cwd(), env: { ...process.env, LOCAL_SQLITE_DB: dbPath, LOCAL_CONVERSION_INTELLIGENCE_REPORT: auditPath, LOCAL_SEO_RECONCILIATION_REPORT: reportPath }, encoding: "utf8" });
}

const first = run();
const firstReport = JSON.parse(readFileSync(reportPath, "utf8"));
const verify = new DatabaseSync(dbPath, { readOnly: true });
const resolved = verify.prepare("SELECT status, payload FROM seo_opportunities WHERE id = 'resolved-page'").get();
const retained = verify.prepare("SELECT status FROM seo_opportunities WHERE id = 'missing-page'").get();
verify.close();
const second = run();
const secondReport = JSON.parse(readFileSync(reportPath, "utf8"));
const checks = [
  ["first-run-succeeds", first.status === 0],
  ["corrected-page-resolved", resolved?.status === "resolved" && JSON.parse(resolved.payload).resolution?.reason === "absent-from-current-conversion-audit"],
  ["missing-page-retained", retained?.status === "open" && firstReport.retained?.[0]?.reason === "page-missing"],
  ["transaction-counts", firstReport.resolved_count === 1 && firstReport.retained_count === 1],
  ["second-run-idempotent", second.status === 0 && secondReport.resolved_count === 0 && secondReport.retained_count === 1],
  ["safeguards-reported", firstReport.safeguards?.includes("transactional-update") && firstReport.safeguards?.includes("no-content-publication")]
];
rmSync(root, { recursive: true, force: true });
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing };
const out = process.env.LOCAL_SEO_RECONCILIATION_CONTRACT_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "seo-opportunity-reconciliation-contract-report.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`SEO opportunity reconciliation contract: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (missing.length) process.exit(1);