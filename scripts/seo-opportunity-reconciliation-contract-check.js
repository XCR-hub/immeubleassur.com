import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = mkdtempSync(join(tmpdir(), "immeubleassur-seo-reconcile-"));
const dbPath = join(root, "fixture.sqlite");
const auditPath = join(root, "conversion.json");
const reportPath = join(root, "reconciliation.json");
const publicRoot = join(root, "public");
mkdirSync(publicRoot, { recursive: true });
const healthyHtml = `<!doctype html><html><head><title>Assurance immeuble complete pour coproprietaires</title><meta name="description" content="Une description suffisamment detaillee pour informer clairement les coproprietaires, syndics et bailleurs sur cette assurance immeuble utile."></head><body>${"contenu utile ".repeat(460)}<a class="button primary">Devis</a></body></html>`;
writeFileSync(join(publicRoot, "pno-cno.html"), healthyHtml, "utf8");
writeFileSync(join(publicRoot, "static-ok.html"), healthyHtml, "utf8");
writeFileSync(join(publicRoot, "confidentialite.html"), "<title>Politique de confidentialite ImmeubleAssur</title><meta name=\"description\" content=\"Description legale suffisamment claire pour informer les visiteurs sur le traitement des demandes et des donnees transmises au site.\"><body>information legale</body>", "utf8");
writeFileSync(join(publicRoot, "static-ko.html"), "<title>Court</title><meta name=\"description\" content=\"Breve\"><body>peu</body>", "utf8");
const database = new DatabaseSync(dbPath);
database.exec(`CREATE TABLE seo_opportunities (id TEXT PRIMARY KEY, run_id TEXT, url TEXT, query TEXT, opportunity_type TEXT, score INTEGER, status TEXT, recommendation TEXT, payload TEXT, created_at TEXT, updated_at TEXT)`);
const insert = database.prepare(`INSERT INTO seo_opportunities (id, run_id, url, query, opportunity_type, score, status, recommendation, payload, created_at, updated_at) VALUES (?, '', ?, '', ?, 88, 'open', 'Ajouter un formulaire ou un CTA direct vers devis.', '{}', datetime('now'), datetime('now'))`);
insert.run("resolved-page", "https://immeubleassur.com/pno-cno", "google-conversion-intelligence");
insert.run("missing-page", "https://immeubleassur.com/page-introuvable-contract-fixture", "google-conversion-intelligence");
insert.run("title-ok", "https://immeubleassur.com/static-ok", "title");
insert.run("description-ok", "https://immeubleassur.com/static-ok", "description");
insert.run("depth-ok", "https://immeubleassur.com/static-ok", "content-depth");
insert.run("title-ko", "https://immeubleassur.com/static-ko", "title");
insert.run("conversion-ok", "https://immeubleassur.com/static-ok", "conversion");
insert.run("conversion-ko", "https://immeubleassur.com/static-ko", "conversion");
insert.run("legal-depth-excluded", "https://immeubleassur.com/confidentialite", "content-depth");
insert.run("legal-conversion-excluded", "https://immeubleassur.com/confidentialite", "conversion");
database.close();
writeFileSync(auditPath, JSON.stringify({ generated_at: new Date().toISOString(), pages_checked: 200, weak_money_pages: [], actions: [] }), "utf8");

function run() {
  return spawnSync(process.execPath, ["scripts/local-seo-opportunity-reconcile.js"], { cwd: process.cwd(), env: { ...process.env, LOCAL_SQLITE_DB: dbPath, LOCAL_CONVERSION_INTELLIGENCE_REPORT: auditPath, LOCAL_SEO_RECONCILIATION_REPORT: reportPath, LOCAL_PUBLIC_ROOT: publicRoot }, encoding: "utf8" });
}

const first = run();
const firstReport = JSON.parse(readFileSync(reportPath, "utf8"));
const verify = new DatabaseSync(dbPath, { readOnly: true });
const resolved = verify.prepare("SELECT status, payload FROM seo_opportunities WHERE id = 'resolved-page'").get();
const retained = verify.prepare("SELECT status FROM seo_opportunities WHERE id = 'missing-page'").get();
const staticResolved = verify.prepare("SELECT id, status, payload FROM seo_opportunities WHERE id IN ('title-ok', 'description-ok', 'depth-ok') ORDER BY id").all();
const staticRetained = verify.prepare("SELECT status FROM seo_opportunities WHERE id = 'title-ko'").get();
const conversionResolved = verify.prepare("SELECT id, status, payload FROM seo_opportunities WHERE id IN ('conversion-ok', 'legal-depth-excluded', 'legal-conversion-excluded') ORDER BY id").all();
const conversionRetained = verify.prepare("SELECT status FROM seo_opportunities WHERE id = 'conversion-ko'").get();
verify.close();
const second = run();
const secondReport = JSON.parse(readFileSync(reportPath, "utf8"));
const checks = [
  ["first-run-succeeds", first.status === 0],
  ["corrected-page-resolved", resolved?.status === "resolved" && JSON.parse(resolved.payload).resolution?.reason === "absent-from-current-conversion-audit"],
  ["missing-page-retained", retained?.status === "open" && firstReport.retained?.[0]?.reason === "page-missing"],
  ["static-thresholds-resolve-with-evidence", staticResolved.length === 3 && staticResolved.every((row) => row.status === "resolved" && JSON.parse(row.payload).resolution?.reason === "current-page-meets-audit-threshold")],
  ["unmet-static-threshold-retained", staticRetained?.status === "open" && firstReport.retained?.some((row) => row.id === "title-ko" && row.reason === "threshold-not-met")],
  ["current-conversion-and-legal-policy-resolved", conversionResolved.length === 3 && conversionResolved.every((row) => row.status === "resolved") && JSON.parse(conversionResolved.find((row) => row.id === "legal-depth-excluded").payload).resolution?.reason === "excluded-by-current-audit-policy"],
  ["missing-conversion-signal-retained", conversionRetained?.status === "open" && firstReport.retained?.some((row) => row.id === "conversion-ko" && row.reason === "threshold-not-met")],
  ["transaction-counts", firstReport.resolved_count === 7 && firstReport.retained_count === 3],
  ["second-run-idempotent", second.status === 0 && secondReport.resolved_count === 0 && secondReport.retained_count === 3],
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