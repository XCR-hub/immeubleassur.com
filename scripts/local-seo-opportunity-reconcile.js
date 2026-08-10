import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

function clean(value, max = 1000) { return String(value || "").trim().slice(0, max); }
function normalizeUrl(value) {
  try {
    const url = new URL(clean(value), "https://immeubleassur.com");
    return `https://immeubleassur.com${url.pathname.replace(/\/$/, "") || "/"}`;
  } catch { return ""; }
}
function localPagePath(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";
  const pathname = new URL(normalized).pathname;
  return resolve("public", pathname === "/" ? "index.html" : `${pathname.replace(/^\//, "")}.html`);
}
function parsePayload(value) { try { return JSON.parse(String(value || "{}")); } catch { return {}; } }

const dbPath = resolve(env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite")));
const auditPath = resolve(env("LOCAL_CONVERSION_INTELLIGENCE_REPORT", join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "conversion-intelligence-report.json")));
const reportPath = resolve(env("LOCAL_SEO_RECONCILIATION_REPORT", join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "local-seo-opportunity-reconciliation-report.json")));
const dryRun = process.argv.includes("--dry-run");
if (!existsSync(dbPath)) throw new Error(`Base SQLite introuvable: ${dbPath}`);
if (!existsSync(auditPath)) throw new Error(`Audit conversion introuvable: ${auditPath}`);

const audit = JSON.parse(readFileSync(auditPath, "utf8"));
if (!audit.generated_at || Number(audit.pages_checked || 0) < 50 || !Array.isArray(audit.actions) || !Array.isArray(audit.weak_money_pages)) throw new Error("Audit conversion incomplet ou invalide.");
const unresolved = new Set([...audit.actions.map((item) => normalizeUrl(item.url)), ...audit.weak_money_pages.map((item) => normalizeUrl(item.url))].filter(Boolean));
const database = new DatabaseSync(dbPath);
const now = new Date().toISOString();
const rows = database.prepare(`SELECT id, url, query, opportunity_type, score, status, recommendation, payload, created_at, updated_at FROM seo_opportunities WHERE status = 'open' AND opportunity_type = 'google-conversion-intelligence' ORDER BY score DESC, created_at ASC`).all();
const resolved = [];
const retained = [];
try {
  database.exec("BEGIN IMMEDIATE");
  const update = database.prepare("UPDATE seo_opportunities SET status = 'resolved', payload = ?, updated_at = ? WHERE id = ? AND status = 'open'");
  for (const row of rows) {
    const url = normalizeUrl(row.url);
    const pagePath = localPagePath(url);
    const pageExists = Boolean(pagePath && existsSync(pagePath));
    if (!url || !pageExists || unresolved.has(url)) {
      retained.push({ id: row.id, url, reason: !pageExists ? "page-missing" : "still-present-in-current-audit", score: Number(row.score || 0) });
      continue;
    }
    const payload = { ...parsePayload(row.payload), resolution: { status: "resolved", reason: "absent-from-current-conversion-audit", audit_generated_at: audit.generated_at, reconciled_at: now, page_path: pagePath } };
    if (!dryRun) update.run(JSON.stringify(payload), now, row.id);
    resolved.push({ id: row.id, url, previous_score: Number(row.score || 0), recommendation: clean(row.recommendation, 500) });
  }
  if (dryRun) database.exec("ROLLBACK"); else database.exec("COMMIT");
} catch (error) {
  try { database.exec("ROLLBACK"); } catch {}
  throw error;
} finally { database.close(); }

const report = { success: true, generated_at: now, mode: dryRun ? "dry-run" : "write", database: dbPath, audit: { path: auditPath, generated_at: audit.generated_at, pages_checked: Number(audit.pages_checked || 0), weak_money_pages: audit.weak_money_pages.length, actions: audit.actions.length }, checked: rows.length, resolved_count: resolved.length, retained_count: retained.length, resolved, retained, safeguards: ["conversion-intelligence-only", "current-audit-required", "local-page-must-exist", "history-preserved-with-resolved-status", "transactional-update", "no-content-publication"] };
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`SEO opportunity reconciliation: ${resolved.length} resolved, ${retained.length} retained (${dryRun ? "dry-run" : "write"}).`);