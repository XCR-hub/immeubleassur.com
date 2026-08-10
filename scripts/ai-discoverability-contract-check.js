import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();
const pass = readFileSync("scripts/ai-discoverability-pass.js", "utf8");
const publisher = readFileSync("scripts/local-editorial-publisher.js", "utf8");
const monitor = readFileSync("scripts/local-ai-discoverability-monitor.js", "utf8");
const attribution = readFileSync("functions/api/admin/attribution.js", "utf8");
const sourceQuality = readFileSync("scripts/local-source-quality-monitor.js", "utf8");
const robots = readFileSync("public/robots.txt", "utf8");
const llms = readFileSync("public/llms.txt", "utf8");
const methodology = readFileSync("public/methodologie-editoriale.html", "utf8");
const editorial = readFileSync("scripts/editorial-autopilot.js", "utf8");
const sanitizer = readFileSync("scripts/local-editorial-public-metadata-sanitizer.js", "utf8");
const publicEditorial = JSON.parse(readFileSync("public/assets/editorial-autopilot-latest.json", "utf8"));
const forbiddenPublicFields = ["draft_review_path", "draft_packet_path", "legal_review", "source_results", "watch_preview", "errors", "ai_attempts", "ai_provider_order"].filter((field) => Object.hasOwn(publicEditorial, field));
const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const out = join(reportDir, "ai-discoverability-contract-report.json");
const checks = [
  ["oai-searchbot-explicit-allow", /User-agent: OAI-SearchBot\s+Allow: \//.test(robots)],
  ["chatgpt-user-explicit-allow", /User-agent: ChatGPT-User\s+Allow: \//.test(robots)],
  ["perplexity-search-explicit-allow", /User-agent: PerplexityBot\s+Allow: \//.test(robots) && /User-agent: Perplexity-User\s+Allow: \//.test(robots)],
  ["claude-search-explicit-allow", /User-agent: Claude-SearchBot\s+Allow: \//.test(robots) && /User-agent: Claude-User\s+Allow: \//.test(robots)],
  ["gptbot-training-opt-out", /User-agent: GPTBot\s+Disallow: \//.test(robots)],
  ["claudebot-training-opt-out", /User-agent: ClaudeBot\s+Disallow: \//.test(robots)],
  ["admin-and-api-remain-protected", (robots.match(/Disallow: \/admin\.html/g) || []).length >= 3 && (robots.match(/Disallow: \/api\//g) || []).length >= 3],
  ["llms-links-methodology", llms.includes("https://immeubleassur.com/methodologie-editoriale")],
  ["methodology-is-indexable", methodology.includes('content="index, follow, max-image-preview:large"')],
  ["methodology-has-entity-and-citations", methodology.includes('"propertyID":"ORIAS"') && methodology.includes('"citation"')],
  ["methodology-discloses-ai-quarantine", methodology.includes("brouillons produits par une IA restent en quarantaine")],
  ["runtime-llms-includes-active-edition", publisher.includes('## Edition active') && publisher.includes('Contenu public genere par IA: non')],
  ["chatgpt-referrals-measured", attribution.includes('"chatgpt / ai-referral"') && sourceQuality.includes('ai-referral:')],
  ["live-monitor-does-not-promise-citations", monitor.includes("citation_guaranteed: false")],
  ["public-editorial-export-is-distinct", editorial.includes("const publicReport =") && editorial.includes("JSON.stringify(publicReport, null, 2)")],
  ["static-public-editorial-asset-is-sanitized", publicEditorial.status === "safe-public-metadata" && publicEditorial.public_content_ai_generated === false && forbiddenPublicFields.length === 0 && Array.isArray(publicEditorial.public_watch_items) && publicEditorial.public_watch_items.every((item) => !Object.hasOwn(item, "summary"))],
  ["public-editorial-export-declares-safeguards", editorial.includes('"no-ai-draft-content"') && editorial.includes('"no-internal-paths"') && editorial.includes('"no-provider-errors"') && editorial.includes('"no-source-summaries"')],
  ["live-monitor-checks-public-editorial-redaction", monitor.includes("public-editorial-metadata-is-sanitized") && monitor.includes("forbiddenPublicEditorialFields")],
  ["runtime-sanitizer-is-atomic", sanitizer.includes("renameSync(temporaryPath, outputPath)") && sanitizer.includes('status: "safe-public-metadata"')],
  ["runtime-sanitizer-strips-sensitive-fields", !sanitizer.includes("draft_review_path") && !sanitizer.includes("draft_packet_path") && !sanitizer.includes("legal_review") && !sanitizer.includes("source_results")],
  ["monitor-exits-cleanly-on-windows", monitor.includes("process.exitCode = 1")],
  ["official-openai-guidance-recorded", monitor.includes("https://help.openai.com/en/articles/12627856-publishers-and-developers-faq")],
  ["official-perplexity-guidance-recorded", monitor.includes("https://docs.perplexity.ai/docs/resources/perplexity-crawlers")],
  ["official-anthropic-guidance-recorded", monitor.includes("https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler")],
  ["live-monitor-verifies-multi-ai-access", monitor.includes("perplexitybot-can-read-watch") && monitor.includes("claude-searchbot-can-read-watch") && monitor.includes("claude-user-can-read-watch")],
  ["generation-pass-persists-artifacts", pass.includes('write(join(OUT, "robots.txt")') && pass.includes('write(join(OUT, "llms.txt")') && pass.includes('methodologie-editoriale.html')]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, claims: { search_eligible: ["chatgpt", "perplexity", "claude"], citation_guaranteed: false, training_bots_allowed: [] }, safeguards: ["explicit-multi-ai-crawler-policy", "training-bot-opt-out", "indexable-methodology", "entity-schema", "active-edition-in-llms", "sanitized-public-editorial-metadata", "ai-referral-attribution"] };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AI discoverability contract: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (missing.length) process.exit(1);
