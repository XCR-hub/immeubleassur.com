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
const publicRoot = resolve(env("LOCAL_PUBLIC_ROOT", "public"));
function localPagePath(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";
  const pathname = new URL(normalized).pathname;
  return resolve(publicRoot, pathname === "/" ? "index.html" : `${pathname.replace(/^\//, "")}.html`);
}
function parsePayload(value) { try { return JSON.parse(String(value || "{}")); } catch { return {}; } }
function stripHtml(value) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function pageMetrics(pagePath) {
  const html = readFileSync(pagePath, "utf8");
  const title = stripHtml((html.match(/<title>(.*?)<\/title>/is) || [])[1] || "");
  const description = ((html.match(/<meta name="description" content="([^"]*)"/i) || [])[1] || "").trim();
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return { title_length: title.length, description_length: description.length, words, has_lead_form: html.includes('id="lead-form"'), has_cta: html.includes('class="button primary"') || html.includes("submit-button") };
}
const nonCommercialSlugs = new Set(["admin", "mentions-legales", "confidentialite", "merci"]);
function staticResolution(type, metrics, url) {
  const slug = new URL(url).pathname.replace(/^\//, "").replace(/\/$/, "");
  if (type === "title") return { resolved: metrics.title_length >= 35 && metrics.title_length <= 72, metric: metrics.title_length, expected: "35-72" };
  if (type === "description") return { resolved: metrics.description_length >= 110 && metrics.description_length <= 170, metric: metrics.description_length, expected: "110-170" };
  if (type === "content-depth") return nonCommercialSlugs.has(slug) ? { resolved: true, metric: metrics.words, expected: "excluded-non-commercial-page", reason: "excluded-by-current-audit-policy" } : { resolved: metrics.words >= 450, metric: metrics.words, expected: ">=450" };
  if (type === "conversion") return nonCommercialSlugs.has(slug) ? { resolved: true, metric: false, expected: "excluded-non-commercial-page", reason: "excluded-by-current-audit-policy" } : { resolved: metrics.has_lead_form || metrics.has_cta, metric: metrics.has_lead_form || metrics.has_cta, expected: "lead-form-or-primary-cta" };
  return null;
}

const dbPath = resolve(env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite")));
const auditPath = resolve(env("LOCAL_CONVERSION_INTELLIGENCE_REPORT", join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "conversion-intelligence-report.json")));
const reportPath = resolve(env("LOCAL_SEO_RECONCILIATION_REPORT", join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "local-seo-opportunity-reconciliation-report.json")));
const dryRun = process.argv.includes("--dry-run");
if (!existsSync(dbPath)) throw new Error(`Base SQLite introuvable: ${dbPath}`);
if (!existsSync(auditPath)) throw new Error(`Audit conversion introuvable: ${auditPath}`);

const audit = JSON.parse(readFileSync(auditPath, "utf8"));
if (!audit.generated_at || Number(audit.pages_checked || 0) < 50 || !Array.isArray(audit.actions) || !Array.isArray(audit.weak_money_pages)) throw new Error("Audit conversion incomplet ou invalide.");
const auditAgeMs = Date.now() - Date.parse(audit.generated_at);
if (!Number.isFinite(auditAgeMs) || auditAgeMs < 0 || auditAgeMs > 72 * 60 * 60 * 1000) throw new Error("Audit conversion trop ancien ou date invalide.");
const unresolved = new Set([...audit.actions.map((item) => normalizeUrl(item.url)), ...audit.weak_money_pages.map((item) => normalizeUrl(item.url))].filter(Boolean));
const database = new DatabaseSync(dbPath);
const now = new Date().toISOString();
const rows = database.prepare(`SELECT id, url, query, opportunity_type, score, status, recommendation, payload, created_at, updated_at FROM seo_opportunities WHERE status = 'open' AND opportunity_type IN ('google-conversion-intelligence', 'title', 'description', 'content-depth', 'conversion') ORDER BY score DESC, created_at ASC`).all();
const resolved = [];
const retained = [];
try {
  database.exec("BEGIN IMMEDIATE");
  const update = database.prepare("UPDATE seo_opportunities SET status = 'resolved', payload = ?, updated_at = ? WHERE id = ? AND status = 'open'");
  for (const row of rows) {
    const url = normalizeUrl(row.url);
    const pagePath = localPagePath(url);
    const pageExists = Boolean(pagePath && existsSync(pagePath));
    const metrics = pageExists ? pageMetrics(pagePath) : null;
    const staticCheck = metrics ? staticResolution(row.opportunity_type, metrics, url) : null;
    const stillOpen = row.opportunity_type === "google-conversion-intelligence" ? unresolved.has(url) : !staticCheck?.resolved;
    if (!url || !pageExists || stillOpen) {
      retained.push({ id: row.id, url, opportunity_type: row.opportunity_type, reason: !pageExists ? "page-missing" : row.opportunity_type === "google-conversion-intelligence" ? "still-present-in-current-audit" : "threshold-not-met", score: Number(row.score || 0), metrics, expected: staticCheck?.expected });
      continue;
    }
    const reason = row.opportunity_type === "google-conversion-intelligence" ? "absent-from-current-conversion-audit" : staticCheck?.reason || "current-page-meets-audit-threshold";
    const payload = { ...parsePayload(row.payload), resolution: { status: "resolved", reason, audit_generated_at: audit.generated_at, reconciled_at: now, page_path: pagePath, opportunity_type: row.opportunity_type, metrics, expected: staticCheck?.expected } };
    if (!dryRun) update.run(JSON.stringify(payload), now, row.id);
    resolved.push({ id: row.id, url, opportunity_type: row.opportunity_type, reason, previous_score: Number(row.score || 0), recommendation: clean(row.recommendation, 500) });
  }
  if (dryRun) database.exec("ROLLBACK"); else database.exec("COMMIT");
} catch (error) {
  try { database.exec("ROLLBACK"); } catch {}
  throw error;
} finally { database.close(); }

const report = { success: true, generated_at: now, mode: dryRun ? "dry-run" : "write", database: dbPath, audit: { path: auditPath, generated_at: audit.generated_at, pages_checked: Number(audit.pages_checked || 0), weak_money_pages: audit.weak_money_pages.length, actions: audit.actions.length }, checked: rows.length, resolved_count: resolved.length, retained_count: retained.length, resolved, retained, safeguards: ["conversion-and-static-metrics-only", "fresh-current-audit-required", "local-page-must-exist", "history-preserved-with-resolved-status", "transactional-update", "no-content-publication"] };
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`SEO opportunity reconciliation: ${resolved.length} resolved, ${retained.length} retained (${dryRun ? "dry-run" : "write"}).`);
