import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();
function read(path) { return existsSync(path) ? readFileSync(path, "utf8") : ""; }
function readJson(path) { try { return JSON.parse(read(path)); } catch { return null; } }
function words(html) { return (String(html || "").replace(/<[^>]+>/g, " ").match(/\b[\p{L}\p{N}'’-]+\b/gu) || []).length; }
function count(text, marker) { return String(text || "").split(marker).length - 1; }

const runtimeAssetsRoot = resolve(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets")));
const publicationsRoot = resolve(env("LOCAL_RUNTIME_PUBLICATIONS_ROOT", join(runtimeAssetsRoot, "publications")));
const reportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", join("data", "runtime-reports")));
const staticRoot = resolve(env("LOCAL_SITE_PUBLIC_ROOT", "public"));
const out = resolve(env("LOCAL_EDITORIAL_HUB_QUALITY_REPORT", join(reportsRoot, "local-editorial-hub-quality-report.json")));
const manifest = readJson(join(publicationsRoot, "current.json"));
const versionRoot = manifest ? join(publicationsRoot, "versions", String(manifest.version || "")) : "";
const baseFaq = read(join(staticRoot, "faq.html"));
const baseCities = read(join(staticRoot, "villes.html"));
const activeFaq = versionRoot ? read(join(versionRoot, "faq.html")) : "";
const activeCities = versionRoot ? read(join(versionRoot, "villes.html")) : "";
const issueSlug = manifest?.issue?.slug || "";
const checks = [
  ["active-manifest-available", Boolean(manifest?.version && versionRoot)],
  ["faq-hub-whitelisted", manifest?.allowed_files?.includes("faq.html") === true],
  ["cities-hub-whitelisted", manifest?.allowed_files?.includes("villes.html") === true],
  ["faq-canonical-preserved", activeFaq.includes('<link rel="canonical" href="https://immeubleassur.com/faq"')],
  ["cities-canonical-preserved", activeCities.includes('<link rel="canonical" href="https://immeubleassur.com/villes"')],
  ["faq-enrichment-is-substantial", words(activeFaq) >= words(baseFaq) + 100],
  ["cities-enrichment-is-substantial", words(activeCities) >= words(baseCities) + 100],
  ["one-enrichment-block-per-hub", count(activeFaq, "runtime-editorial-hub") === 1 && count(activeCities, "runtime-editorial-hub") === 1],
  ["both-hubs-link-active-issue", Boolean(issueSlug) && activeFaq.includes(`/${issueSlug}`) && activeCities.includes(`/${issueSlug}`)],
  ["no-automatic-city-doorway-pages", (manifest?.allowed_files || []).filter((file) => /^assurance-immeuble-[^/]+\.html$/.test(file)).length === 0],
  ["legal-and-ai-disclaimers-preserved", activeFaq.includes("ne constituent ni une interpretation juridique") && manifest?.public_content_ai_generated === false && manifest?.ai_draft_allowed_publication === false]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { success: missing.length === 0, status: missing.length ? "failed" : "passed", generated_at: new Date().toISOString(), version: manifest?.version || "", issue: manifest?.issue || null, checks: checks.length, missing, metrics: { base_faq_words: words(baseFaq), active_faq_words: words(activeFaq), base_cities_words: words(baseCities), active_cities_words: words(activeCities), automatically_created_city_pages: (manifest?.allowed_files || []).filter((file) => /^assurance-immeuble-[^/]+\.html$/.test(file)).length } };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Editorial hub quality: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (!report.success) process.exit(1);
