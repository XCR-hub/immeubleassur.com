import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();
function read(path) { return existsSync(path) ? readFileSync(path, "utf8") : ""; }
async function fetchText(url, userAgent) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(15000) });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } catch (error) { return { ok: false, status: 0, text: "", error: error.message || "fetch failed" }; }
}
function groupAllows(robots, agent) {
  const groups = String(robots || "").split(/\n\s*\n/).map((group) => group.trim());
  const group = groups.find((item) => new RegExp(`^User-agent:\\s*${agent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im").test(item));
  return Boolean(group && /(^|\n)Allow:\s*\/\s*$/im.test(group) && !/(^|\n)Disallow:\s*\/\s*$/im.test(group));
}
function groupDisallows(robots, agent) {
  const groups = String(robots || "").split(/\n\s*\n/).map((group) => group.trim());
  const group = groups.find((item) => new RegExp(`^User-agent:\\s*${agent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im").test(item));
  return Boolean(group && /(^|\n)Disallow:\s*\/\s*$/im.test(group));
}

const origin = String(env("SITE_ORIGIN", "https://immeubleassur.com")).replace(/\/+$/, "");
const canonicalOrigin = String(env("SITE_CANONICAL_ORIGIN", "https://immeubleassur.com")).replace(/\/+$/, "");
const reportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", join("data", "runtime-reports")));
const out = resolve(env("LOCAL_AI_DISCOVERABILITY_REPORT", join(reportsRoot, "local-ai-discoverability-report.json")));
const publicationManifestPath = resolve(env("LOCAL_RUNTIME_PUBLICATIONS_ROOT", join(resolve(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets"))), "publications")), "current.json");
let manifest = null;
try { manifest = JSON.parse(read(publicationManifestPath)); } catch {}
const activeIssue = manifest?.issue?.slug || "";
const [robots, llms, methodology, sitemap, watch, editorialMetadata] = await Promise.all([
  fetchText(`${origin}/robots.txt`, "OAI-SearchBot/1.0; +https://openai.com/searchbot"),
  fetchText(`${origin}/llms.txt`, "OAI-SearchBot/1.0; +https://openai.com/searchbot"),
  fetchText(`${origin}/methodologie-editoriale`, "OAI-SearchBot/1.0; +https://openai.com/searchbot"),
  fetchText(`${origin}/sitemap.xml`, "OAI-SearchBot/1.0; +https://openai.com/searchbot"),
  fetchText(`${origin}/veille-assurance-immeuble`, "ChatGPT-User/1.0; +https://openai.com/bot"),
  fetchText(`${origin}/assets/editorial-autopilot-latest.json`, "OAI-SearchBot/1.0; +https://openai.com/searchbot")
]);
let publicEditorial = null;
try { publicEditorial = JSON.parse(editorialMetadata.text); } catch {}
const forbiddenPublicEditorialFields = ["draft_review_path", "draft_packet_path", "legal_review", "source_results", "watch_preview", "errors", "ai_attempts", "ai_provider_order"].filter((field) => Object.hasOwn(publicEditorial || {}, field));
const attribution = read("functions/api/admin/attribution.js");
const sourceMonitor = read("scripts/local-source-quality-monitor.js");
const checks = [
  ["robots-http-200", robots.status === 200],
  ["oai-searchbot-explicitly-allowed", groupAllows(robots.text, "OAI-SearchBot")],
  ["chatgpt-user-explicitly-allowed", groupAllows(robots.text, "ChatGPT-User")],
  ["gptbot-training-explicitly-disallowed", groupDisallows(robots.text, "GPTBot")],
  ["llms-http-200", llms.status === 200],
  ["llms-links-methodology", llms.text.includes(`${canonicalOrigin}/methodologie-editoriale`)],
  ["llms-identifies-active-edition", !activeIssue || llms.text.includes(`${canonicalOrigin}/${activeIssue}`)],
  ["methodology-is-indexable", methodology.status === 200 && !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(methodology.text)],
  ["methodology-declares-ai-quarantine", methodology.text.includes("brouillons produits par une IA restent en quarantaine")],
  ["methodology-has-entity-schema", methodology.text.includes('"@type":["InsuranceAgency","FinancialService"]') && methodology.text.includes('"propertyID":"ORIAS"')],
  ["sitemap-links-methodology", sitemap.status === 200 && sitemap.text.includes(`${canonicalOrigin}/methodologie-editoriale`)],
  ["sitemap-links-active-edition", !activeIssue || sitemap.text.includes(`${canonicalOrigin}/${activeIssue}`)],
  ["chatgpt-user-can-read-watch", watch.status === 200 && watch.text.includes("Veille assurance immeuble")],
  ["public-editorial-metadata-is-sanitized", editorialMetadata.status === 200 && publicEditorial?.status === "safe-public-metadata" && publicEditorial?.public_content_ai_generated === false && forbiddenPublicEditorialFields.length === 0],
  ["chatgpt-attribution-is-distinct", attribution.includes('"chatgpt / ai-referral"') && sourceMonitor.includes('`ai-referral:${aiUtm[0]}`')]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { success: missing.length === 0, status: missing.length ? "degraded" : "ready", generated_at: new Date().toISOString(), origin, checks: checks.length, missing, active_issue: activeIssue, crawler_http: { robots: robots.status, llms: llms.status, methodology: methodology.status, sitemap: sitemap.status, watch_as_chatgpt_user: watch.status, editorial_metadata: editorialMetadata.status }, public_editorial_metadata: { status: publicEditorial?.status || "unavailable", sanitized: forbiddenPublicEditorialFields.length === 0, forbidden_fields: forbiddenPublicEditorialFields, ai_generated: publicEditorial?.public_content_ai_generated ?? null }, policies: { search_discovery: "OAI-SearchBot-allowed", user_navigation: "ChatGPT-User-allowed", model_training: "GPTBot-disallowed", citation_guaranteed: false }, measurement: { source_key: "chatgpt / ai-referral", expected_utm_source: "chatgpt.com" }, official_guidance: "https://help.openai.com/en/articles/12627856-publishers-and-developers-faq" };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AI discoverability monitor: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (!report.success) process.exitCode = 1;
