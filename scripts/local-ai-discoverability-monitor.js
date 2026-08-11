import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { summarizeCrawlerObservations } from "./crawler-observation-summary.js";

loadDefaultEnvFiles();
function read(path) { return existsSync(path) ? readFileSync(path, "utf8") : ""; }
async function fetchText(url, userAgent) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": userAgent + " ImmeubleAssurDiscoverabilityMonitor/1.0" }, signal: AbortSignal.timeout(15000) });
    return { ok: response.ok, status: response.status, content_type: response.headers.get("content-type") || "", text: await response.text() };
  } catch (error) { return { ok: false, status: 0, content_type: "", text: "", error: error.message || "fetch failed" }; }
}
async function fetchRedirect(url, userAgent) {
  try {
    const response = await fetch(url, { redirect: "manual", headers: { "User-Agent": userAgent + " ImmeubleAssurDiscoverabilityMonitor/1.0" }, signal: AbortSignal.timeout(15000) });
    return { status: response.status, location: response.headers.get("location") || "" };
  } catch (error) { return { status: 0, location: "", error: error.message || "fetch failed" }; }
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

function groupDisallowsPath(robots, agent, path) {
  const groups = String(robots || "").split(/\n\s*\n/).map((group) => group.trim());
  const escapedAgent = agent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const group = groups.find((item) => new RegExp("^User-agent:\\s*" + escapedAgent + "\\s*$", "im").test(item));
  return Boolean(group && new RegExp("(^|\\n)Disallow:\\s*" + escapedPath + "\\s*$", "im").test(group));
}

const origin = String(env("SITE_ORIGIN", "https://immeubleassur.com")).replace(/\/+$/, "");
const canonicalOrigin = String(env("SITE_CANONICAL_ORIGIN", "https://immeubleassur.com")).replace(/\/+$/, "");
const reportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", join("data", "runtime-reports")));
const out = resolve(env("LOCAL_AI_DISCOVERABILITY_REPORT", join(reportsRoot, "local-ai-discoverability-report.json")));
const crawlerObservation = summarizeCrawlerObservations(resolve(env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))), 30);
const publicationManifestPath = resolve(env("LOCAL_RUNTIME_PUBLICATIONS_ROOT", join(resolve(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets"))), "publications")), "current.json");
let manifest = null;
try { manifest = JSON.parse(read(publicationManifestPath)); } catch {}
const activeIssue = manifest?.issue?.slug || "";
const activeEditionUrl = activeIssue ? `${origin}/${activeIssue}` : `${origin}/veille-assurance-immeuble`;
const [robots, llms, methodology, sitemap, watch, editorialMetadata, perplexityWatch, claudeSearchWatch, claudeUserWatch, googleWatch, bingWatch, activeEdition, watchSlashRedirect] = await Promise.all([
  fetchText(`${origin}/robots.txt`, "OAI-SearchBot/1.0; +https://openai.com/searchbot"),
  fetchText(`${origin}/llms.txt`, "OAI-SearchBot/1.0; +https://openai.com/searchbot"),
  fetchText(`${origin}/methodologie-editoriale`, "OAI-SearchBot/1.0; +https://openai.com/searchbot"),
  fetchText(`${origin}/sitemap.xml`, "OAI-SearchBot/1.0; +https://openai.com/searchbot"),
  fetchText(`${origin}/veille-assurance-immeuble`, "ChatGPT-User/1.0; +https://openai.com/bot"),
  fetchText(`${origin}/assets/editorial-autopilot-latest.json`, "OAI-SearchBot/1.0; +https://openai.com/searchbot"),
  fetchText(`${origin}/veille-assurance-immeuble`, "PerplexityBot/1.0; +https://perplexity.ai/perplexitybot"),
  fetchText(`${origin}/veille-assurance-immeuble`, "Claude-SearchBot/1.0"),
  fetchText(`${origin}/veille-assurance-immeuble`, "Claude-User/1.0"),
  fetchText(`${origin}/veille-assurance-immeuble`, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
  fetchText(`${origin}/veille-assurance-immeuble`, "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"),
  fetchText(activeEditionUrl, "OAI-SearchBot/1.0; +https://openai.com/searchbot"),
  fetchRedirect(`${origin}/veille-assurance-immeuble/`, "OAI-SearchBot/1.0; +https://openai.com/searchbot")
]);
let publicEditorial = null;
try { publicEditorial = JSON.parse(editorialMetadata.text); } catch {}
const forbiddenPublicEditorialFields = ["draft_review_path", "draft_packet_path", "legal_review", "source_results", "watch_preview", "errors", "ai_attempts", "ai_provider_order"].filter((field) => Object.hasOwn(publicEditorial || {}, field));
const attribution = read("functions/api/admin/attribution.js");
const sourceMonitor = read("scripts/local-source-quality-monitor.js");
const checks = [
  ["robots-http-200", robots.status === 200],
  ["googlebot-explicitly-allowed", groupAllows(robots.text, "Googlebot")],
  ["bingbot-explicitly-allowed", groupAllows(robots.text, "Bingbot")],
  ["oai-searchbot-explicitly-allowed", groupAllows(robots.text, "OAI-SearchBot")],
  ["chatgpt-user-explicitly-allowed", groupAllows(robots.text, "ChatGPT-User")],
  ["perplexitybot-search-explicitly-allowed", groupAllows(robots.text, "PerplexityBot")],
  ["perplexity-user-explicitly-allowed", groupAllows(robots.text, "Perplexity-User")],
  ["claude-searchbot-explicitly-allowed", groupAllows(robots.text, "Claude-SearchBot")],
  ["claude-user-explicitly-allowed", groupAllows(robots.text, "Claude-User")],
  ["gptbot-training-explicitly-disallowed", groupDisallows(robots.text, "GPTBot")],
  ["claudebot-training-explicitly-disallowed", groupDisallows(robots.text, "ClaudeBot")],
  ["admin-route-disallowed-for-search-crawlers", ["Googlebot", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-SearchBot", "Claude-User", "*"].every((agent) => groupDisallowsPath(robots.text, agent, "/admin"))],
  ["llms-http-200", llms.status === 200],
  ["llms-links-methodology", llms.text.includes(`${canonicalOrigin}/methodologie-editoriale`)],
  ["llms-identifies-active-edition", !activeIssue || llms.text.includes(`${canonicalOrigin}/${activeIssue}`)],
  ["methodology-is-indexable", methodology.status === 200 && !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(methodology.text)],
  ["methodology-declares-ai-quarantine", methodology.text.includes("brouillons produits par une IA restent en quarantaine")],
  ["methodology-has-entity-schema", methodology.text.includes('"@type":["InsuranceAgency","FinancialService"]') && methodology.text.includes('"propertyID":"ORIAS"')],
  ["sitemap-links-methodology", sitemap.status === 200 && sitemap.text.includes(`${canonicalOrigin}/methodologie-editoriale`)],
  ["sitemap-links-active-edition", !activeIssue || sitemap.text.includes(`${canonicalOrigin}/${activeIssue}`)],
  ["trailing-slash-redirects-to-canonical", watchSlashRedirect.status === 308 && watchSlashRedirect.location === "/veille-assurance-immeuble"],
  ["active-edition-http-200", activeEdition.status === 200],
  ["active-edition-is-indexable", !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(activeEdition.text)],
  ["active-edition-canonical-is-current", !activeIssue || activeEdition.text.includes(`<link rel="canonical" href="${canonicalOrigin}/${activeIssue}"`)],
  ["active-edition-has-newsarticle-schema", activeEdition.text.includes('"@type":"NewsArticle"') && activeEdition.text.includes('"datePublished"') && activeEdition.text.includes('"mainEntityOfPage"')],
  ["active-edition-declares-utf8", /charset=utf-8/i.test(activeEdition.content_type)],
  ["active-edition-has-no-mojibake", !/(?:\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00e2\u20ac(?:[\u0080-\u00bf]|\u0153|\u2122)|\ufffd)/u.test(activeEdition.text)],
  ["chatgpt-user-can-read-watch", watch.status === 200 && watch.text.includes("Veille assurance immeuble")],
  ["perplexitybot-can-read-watch", perplexityWatch.status === 200 && perplexityWatch.text.includes("Veille assurance immeuble")],
  ["claude-searchbot-can-read-watch", claudeSearchWatch.status === 200 && claudeSearchWatch.text.includes("Veille assurance immeuble")],
  ["claude-user-can-read-watch", claudeUserWatch.status === 200 && claudeUserWatch.text.includes("Veille assurance immeuble")],
  ["googlebot-can-read-watch", googleWatch.status === 200 && googleWatch.text.includes("Veille assurance immeuble")],
  ["bingbot-can-read-watch", bingWatch.status === 200 && bingWatch.text.includes("Veille assurance immeuble")],
  ["public-editorial-metadata-is-sanitized", editorialMetadata.status === 200 && publicEditorial?.status === "safe-public-metadata" && publicEditorial?.public_content_ai_generated === false && forbiddenPublicEditorialFields.length === 0],
  ["chatgpt-attribution-is-distinct", attribution.includes('"chatgpt / ai-referral"') && sourceMonitor.includes('`ai-referral:${aiUtm[0]}`')]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { success: missing.length === 0, status: missing.length ? "degraded" : "ready", generated_at: new Date().toISOString(), origin, checks: checks.length, missing, active_issue: activeIssue, crawler_http: { robots: robots.status, llms: llms.status, methodology: methodology.status, sitemap: sitemap.status, active_edition: activeEdition.status, active_edition_content_type: activeEdition.content_type, watch_trailing_slash: watchSlashRedirect.status, watch_trailing_slash_location: watchSlashRedirect.location, watch_as_chatgpt_user: watch.status, watch_as_perplexitybot: perplexityWatch.status, watch_as_claude_searchbot: claudeSearchWatch.status, watch_as_claude_user: claudeUserWatch.status, watch_as_googlebot: googleWatch.status, watch_as_bingbot: bingWatch.status, editorial_metadata: editorialMetadata.status }, public_editorial_metadata: { status: publicEditorial?.status || "unavailable", sanitized: forbiddenPublicEditorialFields.length === 0, forbidden_fields: forbiddenPublicEditorialFields, ai_generated: publicEditorial?.public_content_ai_generated ?? null }, policies: { search_discovery: ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"], user_navigation: ["ChatGPT-User", "Perplexity-User", "Claude-User"], model_training_disallowed: ["GPTBot", "ClaudeBot"], citation_guaranteed: false }, measurement: { source_key: "chatgpt / ai-referral", expected_utm_source: "chatgpt.com", source_keys: ["chatgpt / ai-referral", "perplexity / ai-referral", "claude / ai-referral", "gemini / ai-referral", "copilot / ai-referral"], expected_utm_sources: ["chatgpt.com", "perplexity.ai", "claude.ai", "gemini.google.com", "copilot.microsoft.com"] }, crawler_observation: crawlerObservation, official_guidance: { openai: "https://help.openai.com/en/articles/12627856-publishers-and-developers-faq", perplexity: "https://docs.perplexity.ai/docs/resources/perplexity-crawlers", anthropic: "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler" } };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AI discoverability monitor: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (!report.success) process.exitCode = 1;
