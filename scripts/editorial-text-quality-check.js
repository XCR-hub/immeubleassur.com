import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();
const editorial = readFileSync("scripts/editorial-autopilot.js", "utf8");
const { parseRss, parsePublicPage, sourceUrlAllowed, sourceContentAllowed, repairMojibake, normalizeEditorialText, sanitizeEditorialSummary, editorialTextQuality, qualityFiltered, editorialBusinessCoverage } = await import("./editorial-autopilot.js");
const decomposed = "Assurance proprie\u0301taire";
const corruptedFixture = { title: "Actualite\uFFFD assurance immeuble", summary: "Signal public", published_at: "10 aout 2026" };
const repairableFixtures = [
  ["ao\u00c3\u00bbt", "ao\u00fbt"],
  ["l\u00e2\u20ac\u2122\u00e9volution", "l\u2019\u00e9volution"],
  ["propri\u00c3\u00a9taire", "propri\u00e9taire"]
];
const cleanFixture = { title: decomposed, summary: "Signal public attribue", published_at: "10 aout 2026" };
const coverageFixture = [
  { source_id: "regulator", title: "Assurance immeuble : garanties et franchise", summary: "Contrat copropriete" },
  { source_id: "official", title: "Syndic et assemblee generale", summary: "Obligation et responsabilite" }
];
const coverageComplete = editorialBusinessCoverage(coverageFixture);
const coverageGap = editorialBusinessCoverage(coverageFixture.slice(0, 1));
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
const servicePublicProSource = { id: "service-public-professionnels", name: "Entreprendre.Service-Public.fr", url: "https://www.service-public.gouv.fr/abonnements/rss/actu-actu-pro.rss" };
const servicePublicProRssFixture = `<rss><channel>${Array.from({ length: 61 }, (_, index) => `<item><title>Formalites sociales entreprise numero ${index + 1}</title><description>Declaration administrative generale</description><link>https://entreprendre.service-public.gouv.fr/actualites/A${18000 + index}</link><dc:date>2026-06-01T00:00:00+02:00</dc:date></item>`).join("")}<item><title>Bail commercial : ce qui change</title><description>La loi comporte de nouvelles obligations relatives au bail commercial.</description><link>https://entreprendre.service-public.gouv.fr/actualites/A18929</link><dc:date>2026-05-29T00:00:00+02:00</dc:date></item></channel></rss>`;
const parsedServicePublicProFixture = parseRss(servicePublicProRssFixture, servicePublicProSource);
const noRelevantRssFixture = parseRss('<rss><channel><item><title>Formalites administratives generales</title><description>Declaration annuelle</description><link>https://www.service-public.gouv.fr/particuliers/actualites/A10000</link><dc:date>2026-08-10T00:00:00+02:00</dc:date></item></channel></rss>', { id: "service-public-particuliers", name: "Service Public", url: "https://www.service-public.gouv.fr/abonnements/rss/actu-actualites-particuliers.rss" });
const franceAssureursSource = { id: "france-assureurs-actualites", name: "France Assureurs", url: "https://www.franceassureurs.fr/actualites" };
const parsedFranceAssureursFixture = parsePublicPage(
  '<main><a href="/nos-positions/lassurance-qui-emploie/livre-blanc-emploi/">Livre blanc apprentissage et reconversion dans l assurance</a><a href="/actualites/incendie-immeuble/"><span>Lire l article</span><span class="screen-reader-text">Assurance habitation : incendie dans un immeuble</span></a><a href="/actualites/cyber-ados/"><span class="screen-reader-text">Campagne cyber pour les adolescents</span></a></main>',
  franceAssureursSource
);const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
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
  ["rss-items-quality-filtered", /function parseRss[\s\S]*qualityFiltered\(relevant\)[\s\S]*return filtered/.test(editorial)],
  ["public-page-items-quality-filtered", /function parsePublicPage[\s\S]*qualityFiltered[\s\S]*return filtered/.test(editorial)],
  ["rejections-counted-per-source", editorial.includes("text_quality_rejected_count: Number(parsed.rejected_text_quality || 0)")],
  ["gate-observes-rejections", editorial.includes("text_quality_rejected_items:")],
  ["runtime-summaries-exported", editorial.includes("title, url, summary, topic")],
  ["current-runtime-output-clean", !editorialReport || corrupted.length === 0],
  ["decomposed-unicode-normalized", normalizeEditorialText(decomposed) === decomposed.normalize("NFC")],
  ["windows-1252-mojibake-repaired", repairableFixtures.every(([input, expected]) => repairMojibake(input) === expected)],
  ["normalization-applies-mojibake-repair", repairableFixtures.every(([input, expected]) => normalizeEditorialText(input) === expected)],
  ["business-coverage-dimensions-reported", coverageComplete.status === "covered" && coverageComplete.required_dimensions.length === 4],
  ["business-coverage-gap-detected", coverageGap.status === "gaps-detected" && coverageGap.missing_dimensions.includes("syndic") && coverageGap.missing_dimensions.includes("obligations")],
  ["reference-sources-distinguished", editorial.includes("reference_source_count") && editorial.includes('status: "reference-only"')],
  ["business-coverage-exported", editorial.includes("business_coverage: editorialBusinessCoverage(items)")],
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
  ["acpr-parser-retains-news-and-rejects-navigation", parsedAcprFixture.length === 1 && parsedAcprFixture[0].url.includes("/fr/actualites/") && Number(parsedAcprFixture.rejected_url_scope) === 1],
  ["service-public-pro-canonical-rss-configured", editorial.includes('"https://www.service-public.gouv.fr/abonnements/rss/actu-actu-pro.rss", "rss"')],
  ["service-public-pro-rss-scans-beyond-first-20", parsedServicePublicProFixture.length === 1 && parsedServicePublicProFixture[0].title === "Bail commercial : ce qui change"],
  ["service-public-pro-rss-dc-date-retained", parsedServicePublicProFixture[0]?.published_at === "2026-05-29T00:00:00+02:00"],
  ["service-public-pro-rss-offtopic-counted", Number(parsedServicePublicProFixture.rejected_content_scope) === 61],
  ["rss-no-relevant-distinguished-from-empty", noRelevantRssFixture.length === 0 && Number(noRelevantRssFixture.raw_item_count) === 1 && Number(noRelevantRssFixture.rejected_content_scope) === 1],
  ["no-relevant-source-status-reported", editorial.includes('"no-relevant-items"') && editorial.includes("no_relevant_source_count") && editorial.includes("raw_item_count")],
  ["service-public-pro-sector-obligation-rejected", !sourceContentAllowed(servicePublicProSource, { title: "Des nouvelles obligations pour les transporteurs sanitaires", summary: "Assurance maladie" })],
  ["service-public-pro-property-obligation-retained", sourceContentAllowed(servicePublicProSource, { title: "Bail commercial : ce qui change", summary: "Nouvelles obligations du bailleur" })],
  ["france-assureurs-article-scope-enforced", sourceUrlAllowed(franceAssureursSource, new URL("https://www.franceassureurs.fr/actualites/incendie-immeuble/")) && !sourceUrlAllowed(franceAssureursSource, new URL("https://www.franceassureurs.fr/nos-positions/emploi/"))],
  ["france-assureurs-offtopic-content-rejected", !sourceContentAllowed(franceAssureursSource, { title: "Campagne cyber pour les adolescents" }) && !sourceContentAllowed(franceAssureursSource, { title: "Les metiers de l assurance" })],
  ["france-assureurs-property-content-retained", sourceContentAllowed(franceAssureursSource, { title: "Assurance habitation : incendie dans un immeuble" })],
  ["france-assureurs-accessible-card-title-parsed", parsedFranceAssureursFixture.length === 1 && parsedFranceAssureursFixture[0].title === "Assurance habitation : incendie dans un immeuble"],
  ["france-assureurs-rejections-counted", Number(parsedFranceAssureursFixture.rejected_url_scope) === 1 && Number(parsedFranceAssureursFixture.rejected_content_scope) === 1]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, runtime_report_available: Boolean(editorialReport), runtime_items_checked: editorialReport?.public_watch_items?.length || 0, corrupted_runtime_items: corrupted.map((item) => ({ source_id: item.source_id || "", title: item.title || "" })).slice(0, 8), safeguards: ["unicode-nfc", "control-character-removal", "mojibake-rejection", "source-rejection-accounting", "markup-artifact-sanitization", "runtime-summary-inspection"] };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (missing.length) { console.error(`Editorial text quality failed: ${missing.join(", ")}`); process.exit(1); }
console.log(`Editorial text quality passed: ${checks.length} checks, ${report.runtime_items_checked} runtime items clean.`);
