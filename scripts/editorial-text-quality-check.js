import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();
const editorial = readFileSync("scripts/editorial-autopilot.js", "utf8");
const { parsePublicPage, sourceUrlAllowed, repairMojibake, normalizeEditorialText, sanitizeEditorialSummary, editorialTextQuality, qualityFiltered } = await import("./editorial-autopilot.js");
const decomposed = "Assurance proprie\u0301taire";
const corruptedFixture = { title: "Actualite\uFFFD assurance immeuble", summary: "Signal public", published_at: "10 aout 2026" };
const repairableFixtures = [
  ["ao\u00c3\u00bbt", "ao\u00fbt"],
  ["l\u00e2\u20ac\u2122\u00e9volution", "l\u2019\u00e9volution"],
  ["propri\u00c3\u00a9taire", "propri\u00e9taire"]
];
const cleanFixture = { title: decomposed, summary: "Signal public attribue", published_at: "10 aout 2026" };
const artifactFixture = { title: "Actualite assurance immeuble attribuee", summary: '/fileadmin/image.jpg 992w,/fileadmin/image-large.jpg 2000w" sizes="100vw" loading="lazy" width="1200" height="800" alt=""> 03 aout 2026 Une mesure de prevention est publiee pour les immeubles&hellip;', published_at: "03 aout 2026" };
const sanitizedArtifact = sanitizeEditorialSummary(artifactFixture.summary);
const navigationSummaryFixture = "L’assurance vie";
const navigationSequenceFixture = "La prévention au quotidien Les démarches en cas de sinistre";
const acprNewsSource = { id: "acpr-actualites" };
const acprPressSource = { id: "acpr-communiques" };
const parsedAcprFixture = parsePublicPage(
  '<main><a href="/fr/actualites/indemnisation-multirisques-habitation">Indemnisation assurance multirisques habitation</a><p>Actualite assurance logement et sinistres.</p><a href="/fr/professionnels/vos-outils-et-services/esurfi-banque-assurance">Registre des agents financiers et organismes assurance</a></main>',
  { ...acprNewsSource, name: "ACPR", url: "https://acpr.banque-france.fr/fr/actualites" }
);
const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const editorialReportPath = join(reportDir, "editorial-autopilot-report.json");
const out = join(reportDir, "editorial-text-quality-report.json");
const editorialReport = existsSync(editorialReportPath) ? JSON.parse(readFileSync(editorialReportPath, "utf8")) : null;
const corruptionPattern = /\uFFFD|ï¿½|Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â(?:€|™|œ|ž)|(?:srcset|sizes|loading|width|height|alt)\s*=|(?:png|jpe?g|webp)\s+\d+w|\/div>|&(?:gt|lt|quot|hellip);|components\/|@bdf_|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/i;
const corrupted = (editorialReport?.public_watch_items || []).filter((item) => {
  const corpus = `${item.title || ""} ${item.summary || ""} ${item.source_name || ""} ${item.published_at || ""}`;
  return corruptionPattern.test(corpus) || repairMojibake(corpus) !== corpus;
});
const checks = [
  ["unicode-normalization", editorial.includes('.normalize("NFC")')],
  ["control-characters-removed", editorial.includes("\\u0000-\\u0008")],
  ["replacement-characters-rejected", editorial.includes('reasons.push("replacement-character")')],
  ["mojibake-signatures-rejected", editorial.includes('reasons.push("probable-mojibake")')],
  ["markup-artifacts-rejected", editorial.includes('reasons.push("markup-artifact")')],
  ["partial-markup-boundaries-trimmed", editorial.includes("function trimPartialMarkup")],
  ["summary-sanitizer-applied", editorial.includes("summary: sanitizeEditorialSummary(item.summary)")],
  ["rss-items-quality-filtered", /function parseRss[\s\S]*return qualityFiltered/.test(editorial)],
  ["public-page-items-quality-filtered", /function parsePublicPage[\s\S]*qualityFiltered[\s\S]*return filtered/.test(editorial)],
  ["rejections-counted-per-source", editorial.includes("text_quality_rejected_count: Number(parsed.rejected_text_quality || 0)")],
  ["gate-observes-rejections", editorial.includes("text_quality_rejected_items:")],
  ["runtime-summaries-exported", editorial.includes("title, url, summary, topic")],
  ["current-runtime-output-clean", !editorialReport || corrupted.length === 0],
  ["decomposed-unicode-normalized", normalizeEditorialText(decomposed) === decomposed.normalize("NFC")],
  ["windows-1252-mojibake-repaired", repairableFixtures.every(([input, expected]) => repairMojibake(input) === expected)],
  ["normalization-applies-mojibake-repair", repairableFixtures.every(([input, expected]) => normalizeEditorialText(input) === expected)],
  ["corrupted-fixture-detected", editorialTextQuality(corruptedFixture).clean === false],
  ["corrupted-fixture-excluded", qualityFiltered([cleanFixture, corruptedFixture]).length === 1],
  ["artifact-fixture-sanitized", sanitizedArtifact.includes("Une mesure de prevention") && sanitizedArtifact.includes("\u2026") && !corruptionPattern.test(sanitizedArtifact)],
  ["sanitized-fixture-retained", qualityFiltered([artifactFixture]).length === 1],
  ["navigation-summary-suppressed", sanitizeEditorialSummary(navigationSummaryFixture) === ""],
  ["navigation-sequence-suppressed", sanitizeEditorialSummary(navigationSequenceFixture) === ""],
  ["informative-short-summary-retained", sanitizeEditorialSummary("Communiqué de presse ACPR") === "Communiqué de presse ACPR"],
  ["acpr-news-article-url-retained", sourceUrlAllowed(acprNewsSource, new URL("https://acpr.banque-france.fr/fr/actualites/indemnisation-multirisques-habitation"))],
  ["acpr-navigation-url-rejected", !sourceUrlAllowed(acprNewsSource, new URL("https://acpr.banque-france.fr/fr/professionnels/vos-outils-et-services/esurfi-banque-assurance"))],
  ["acpr-press-url-retained", sourceUrlAllowed(acprPressSource, new URL("https://acpr.banque-france.fr/fr/communiques-de-presse/mesure-assurance"))],
  ["acpr-taxonomy-url-rejected", !sourceUrlAllowed(acprNewsSource, new URL("https://acpr.banque-france.fr/fr/taxonomy/term/assurance"))],
  ["url-scope-rejections-reported", editorial.includes("url_scope_rejected_count") && editorial.includes("regulator-url-scope-filtered")],
  ["acpr-parser-retains-news-and-rejects-navigation", parsedAcprFixture.length === 1 && parsedAcprFixture[0].url.includes("/fr/actualites/") && Number(parsedAcprFixture.rejected_url_scope) === 1]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, runtime_report_available: Boolean(editorialReport), runtime_items_checked: editorialReport?.public_watch_items?.length || 0, corrupted_runtime_items: corrupted.map((item) => ({ source_id: item.source_id || "", title: item.title || "" })).slice(0, 8), safeguards: ["unicode-nfc", "control-character-removal", "mojibake-rejection", "source-rejection-accounting", "markup-artifact-sanitization", "runtime-summary-inspection"] };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (missing.length) { console.error(`Editorial text quality failed: ${missing.join(", ")}`); process.exit(1); }
console.log(`Editorial text quality passed: ${checks.length} checks, ${report.runtime_items_checked} runtime items clean.`);
