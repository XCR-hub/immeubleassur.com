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
const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const out = join(reportDir, "ai-discoverability-contract-report.json");
const checks = [
  ["oai-searchbot-explicit-allow", /User-agent: OAI-SearchBot\s+Allow: \//.test(robots)],
  ["chatgpt-user-explicit-allow", /User-agent: ChatGPT-User\s+Allow: \//.test(robots)],
  ["gptbot-training-opt-out", /User-agent: GPTBot\s+Disallow: \//.test(robots)],
  ["admin-and-api-remain-protected", (robots.match(/Disallow: \/admin\.html/g) || []).length >= 3 && (robots.match(/Disallow: \/api\//g) || []).length >= 3],
  ["llms-links-methodology", llms.includes("https://immeubleassur.com/methodologie-editoriale")],
  ["methodology-is-indexable", methodology.includes('content="index, follow, max-image-preview:large"')],
  ["methodology-has-entity-and-citations", methodology.includes('"propertyID":"ORIAS"') && methodology.includes('"citation"')],
  ["methodology-discloses-ai-quarantine", methodology.includes("brouillons produits par une IA restent en quarantaine")],
  ["runtime-llms-includes-active-edition", publisher.includes('## Edition active') && publisher.includes('Contenu public genere par IA: non')],
  ["chatgpt-referrals-measured", attribution.includes('"chatgpt / ai-referral"') && sourceQuality.includes('ai-referral:')],
  ["live-monitor-does-not-promise-citations", monitor.includes("citation_guaranteed: false")],
  ["official-openai-guidance-recorded", monitor.includes("https://help.openai.com/en/articles/12627856-publishers-and-developers-faq")],
  ["generation-pass-persists-artifacts", pass.includes('write(join(OUT, "robots.txt")') && pass.includes('write(join(OUT, "llms.txt")') && pass.includes('methodologie-editoriale.html')]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, claims: { chatgpt_search_eligible: true, chatgpt_citation_guaranteed: false, gptbot_training_allowed: false }, safeguards: ["explicit-crawler-policy", "indexable-methodology", "entity-schema", "active-edition-in-llms", "ai-referral-attribution"] };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AI discoverability contract: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (missing.length) process.exit(1);
