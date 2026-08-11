import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function safeVersion(value) { return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100); }
const SOURCE_SUMMARY_ARTIFACT_PATTERN = /\/div&gt;|&lt;!--|@bdf_|components\/|(?:png|jpe?g|webp)\s+\d+w|(?:srcset|sizes|loading|width|height|alt)=&quot;/i;
function containsSourceSummaryArtifacts(value) { return SOURCE_SUMMARY_ARTIFACT_PATTERN.test(String(value || "")); }
function esc(value) { return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function enrichStaticHub(relative, marker, block) {
  const source = join(staticPublicRoot, relative);
  const destination = join(versionRoot, relative);
  if (!existsSync(source)) return { relative, marker, enriched: false, marker_count: 0, reason: "source-missing" };
  let html = readFileSync(source, "utf8").replace(new RegExp(`\\n?<!-- ${marker}:start -->[\\s\\S]*?<!-- ${marker}:end -->`, "g"), "");
  if (!html.includes("</main>")) return { relative, marker, enriched: false, marker_count: 0, reason: "main-close-missing" };
  html = html.replace("</main>", `\n<!-- ${marker}:start -->\n${block}\n<!-- ${marker}:end -->\n</main>`);
  writeFileSync(destination, html, "utf8");
  const markerCount = (html.match(new RegExp(`<!-- ${marker}:start -->`, "g")) || []).length;
  const endMarkerCount = (html.match(new RegExp(`<!-- ${marker}:end -->`, "g")) || []).length;
  const enriched = markerCount === 1 && endMarkerCount === 1;
  return { relative, marker, enriched, marker_count: markerCount, end_marker_count: endMarkerCount, reason: enriched ? "" : "marker-count-invalid" };
}

const runtimeAssetsRoot = resolve(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets")));
const reportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", join("data", "runtime-reports")));
const staticPublicRoot = resolve(env("LOCAL_SITE_PUBLIC_ROOT", "public"));
const publicationsRoot = resolve(env("LOCAL_RUNTIME_PUBLICATIONS_ROOT", join(runtimeAssetsRoot, "publications")));
const manifestPath = join(publicationsRoot, "current.json");
const reportPath = resolve(env("LOCAL_EDITORIAL_PUBLISHER_REPORT", join(reportsRoot, "local-editorial-publisher-report.json")));
const current = readJson(manifestPath);
const today = new Date().toISOString().slice(0, 10);
const expectedSlug = `news/veille-assurance-immeuble-${today}`;
const force = process.argv.includes("--force");
const currentIssuePath = current?.version && current?.issue?.slug ? join(publicationsRoot, "versions", current.version, `${current.issue.slug}.html`) : "";
const baseHubHashes = Object.fromEntries(["faq.html", "villes.html"].map((relative) => {
  const path = join(staticPublicRoot, relative);
  return [relative.replace(".html", ""), existsSync(path) ? sha256(path) : ""];
}));
const publicationInputHashes = Object.fromEntries([
  "scripts/editorial-autopilot.js",
  "scripts/editorial-public-metadata-policy.js",
  "scripts/local-editorial-publisher.js"
].map((relative) => [relative, existsSync(resolve(relative)) ? sha256(resolve(relative)) : ""]));
const publicationBuildHash = createHash("sha256")
  .update(JSON.stringify(publicationInputHashes))
  .digest("hex");
const sourceArtifactRepairNeeded = Boolean(currentIssuePath && existsSync(currentIssuePath) && containsSourceSummaryArtifacts(readFileSync(currentIssuePath, "utf8")));
const hubProofRepairNeeded = current?.issue?.slug === expectedSlug && (current?.hub_enrichment?.faq?.marker_count !== 1 || current?.hub_enrichment?.faq?.end_marker_count !== 1 || current?.hub_enrichment?.cities?.marker_count !== 1 || current?.hub_enrichment?.cities?.end_marker_count !== 1 || Number(current?.hub_enrichment?.cities?.linked_city_count || 0) < 3);
const baseHubRefreshNeeded = current?.issue?.slug === expectedSlug && (current?.base_hub_hashes?.faq !== baseHubHashes.faq || current?.base_hub_hashes?.villes !== baseHubHashes.villes);
const publicationInputsRefreshNeeded = current?.issue?.slug === expectedSlug && current?.publication_build_hash !== publicationBuildHash;
const repairTriggered = sourceArtifactRepairNeeded || hubProofRepairNeeded || baseHubRefreshNeeded || publicationInputsRefreshNeeded;

if (!force && current?.issue?.slug === expectedSlug && !repairTriggered) {
  const report = { success: true, status: "already-published-today", generated_at: new Date().toISOString(), manifest: manifestPath, active_version: current.version, issue: current.issue, preserved_previous: true, source_artifact_repair_needed: false };
  writeJson(reportPath, report);
  console.log(`Editorial publisher: ${report.status} (${expectedSlug}).`);
  process.exit(0);
}

const version = safeVersion(`${new Date().toISOString().replace(/[:.]/g, "-")}-${createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 8)}`);
const versionRoot = join(publicationsRoot, "versions", version);
mkdirSync(versionRoot, { recursive: true });
const child = spawnSync(process.execPath, ["scripts/editorial-autopilot.js", "--fetch"], {
  cwd: process.cwd(),
  env: { ...process.env, LOCAL_RUNTIME_ONLY: "0", LOCAL_EDITORIAL_OUTPUT_ROOT: versionRoot, LOCAL_RUNTIME_REPORTS_ROOT: reportsRoot, LOCAL_RUNTIME_ASSETS_ROOT: runtimeAssetsRoot },
  encoding: "utf8",
  timeout: 120000,
  windowsHide: true
});
const editorialReport = readJson(join(reportsRoot, "editorial-autopilot-report.json"));
const baseReport = { generated_at: new Date().toISOString(), version, version_root: versionRoot, manifest: manifestPath, repair_triggered: repairTriggered, child_status: child.status, child_stdout: String(child.stdout || "").trim().slice(0, 3000), child_stderr: String(child.stderr || "").trim().slice(0, 3000) };

if (child.status !== 0 || !editorialReport) {
  const report = { ...baseReport, success: false, status: "generation-failed", preserved_previous: Boolean(current), error: editorialReport ? "editorial child failed" : "editorial report missing" };
  writeJson(reportPath, report);
  console.error(`Editorial publisher: ${report.status}.`);
  process.exit(1);
}
if (!editorialReport.publication_gate?.ready || !editorialReport.public_write_enabled) {
  const report = { ...baseReport, success: true, status: "held-by-publication-gate", preserved_previous: Boolean(current), gate: editorialReport.publication_gate, candidate_issue: editorialReport.candidate_issue || null };
  writeJson(reportPath, report);
  console.log(`Editorial publisher: ${report.status}; previous edition preserved.`);
  process.exit(0);
}
if (editorialReport.public_content_ai_generated !== false || editorialReport.public_content_provider !== "deterministic" || editorialReport.ai_draft_allowed_publication !== false) {
  const report = { ...baseReport, success: false, status: "unsafe-content-provider", preserved_previous: Boolean(current), public_content_provider: editorialReport.public_content_provider, public_content_ai_generated: editorialReport.public_content_ai_generated };
  writeJson(reportPath, report);
  console.error(`Editorial publisher: ${report.status}.`);
  process.exit(1);
}

const issue = editorialReport.issue;
const topTopics = [...new Set((editorialReport.public_watch_items || []).map((item) => item.topic || "veille"))].slice(0, 3);
const faqQuestions = [
  ["Un signal de veille change-t-il automatiquement mon contrat ?", "Non. Une actualite sert a identifier une clause, une franchise, une echeance ou une piece a verifier; le contrat et la situation de l immeuble restent les references du dossier."],
  ["La preparation differe-t-elle entre syndic benevole et syndic professionnel ?", "Le role differe, mais la base documentaire reste proche: contrat, appel de prime, historique des sinistres, travaux, lots, usages et echeance. La validation finale demeure humaine."],
  ["Comment utiliser une actualite pour un immeuble situe dans une ville precise ?", "La ville seule ne suffit pas. Il faut relier le signal a l occupation, aux commerces, aux travaux, aux sinistres et aux caracteristiques du batiment avant toute consultation."]
];
const faqBlock = `<section class="band content-expansion-band runtime-editorial-hub" aria-labelledby="runtime-faq-${today}"><div class="section-head"><p class="eyebrow dark">FAQ mise a jour ${today}</p><h2 id="runtime-faq-${today}">Questions pratiques issues de la derniere veille validee.</h2><p>Edition source: <a href="/${issue.slug}">${esc(issue.title)}</a>. Themes suivis: ${esc(topTopics.join(", ") || "assurance immeuble")}.</p></div><div class="card-grid">${faqQuestions.map(([question, answer]) => `<article class="content-card"><h3>${esc(question)}</h3><p>${esc(answer)}</p></article>`).join("")}</div><p class="seo-expansion-note">Ces reponses organisent les verifications utiles et ne constituent ni une interpretation juridique ni une recommandation contractuelle personnalisee.</p></section>`;
const faqHub = enrichStaticHub("faq.html", "runtime-editorial-faq", faqBlock);
const citiesHtml = existsSync(join(staticPublicRoot, "villes.html")) ? readFileSync(join(staticPublicRoot, "villes.html"), "utf8") : "";
const cityLinks = [...citiesHtml.matchAll(/href="\/(assurance-immeuble-[^"]+)(?:\.html)?"[^>]*>([^<]+)<\/a>/g)].map((match) => ({ path: match[1].replace(/\.html$/, ""), label: match[2].trim() })).filter((item, index, all) => item.label && all.findIndex((candidate) => candidate.path === item.path) === index).slice(0, 6);
const cityActions = ["Verifier usages et nombre de lots", "Relire sinistres et mesures correctives", "Lister travaux votes ou prevus", "Qualifier commerces et locaux techniques", "Comparer franchises et plafonds", "Preparer contrat, prime et echeance"];
const cityBlock = `<section class="band content-expansion-band runtime-editorial-hub" aria-labelledby="runtime-cities-${today}"><div class="section-head"><p class="eyebrow dark">Parcours villes mis a jour ${today}</p><h2 id="runtime-cities-${today}">Appliquer la veille validee a un dossier local concret.</h2><p>Le dernier numero ne cree pas une regle locale: il fournit une checklist a confronter au batiment, a son occupation et a ses pieces.</p></div><div class="card-grid">${cityLinks.map((city, index) => `<article class="content-card"><h3><a href="/${city.path}">${esc(city.label)}</a></h3><p>${esc(cityActions[index % cityActions.length])}, puis relier le dossier a <a href="/${issue.slug}">la veille du ${today}</a>.</p></article>`).join("")}</div><p class="seo-expansion-note">Aucune page locale nouvelle n est creee automatiquement: seuls les parcours existants et controles sont actualises.</p></section>`;
const cityHub = { ...enrichStaticHub("villes.html", "runtime-editorial-cities", cityBlock), linked_city_count: cityLinks.length };
const hubEnrichment = { faq: faqHub, cities: cityHub };
if (!faqHub.enriched || !cityHub.enriched || cityLinks.length < 3) {
  const report = { ...baseReport, success: false, status: "hub-enrichment-failed", preserved_previous: Boolean(current), hub_enrichment: hubEnrichment };
  writeJson(reportPath, report);
  console.error(`Editorial publisher: ${report.status}.`);
  process.exit(1);
}
const baseLlmsPath = join(staticPublicRoot, "llms.txt");
if (existsSync(baseLlmsPath) && issue?.slug) {
  const sourceLines = (editorialReport.public_watch_items || []).slice(0, 6).map((item) => `- ${item.source_name}: ${item.url}`).join("\n");
  const activeLlms = `${readFileSync(baseLlmsPath, "utf8").trim()}\n\n## Edition active\n\nDate: ${today}\nURL: https://immeubleassur.com/${issue.slug}\nTitre: ${issue.title}\nFournisseur du contenu public: deterministic\nContenu public genere par IA: non\n\n### Sources attribuees de l edition\n\n${sourceLines}\n`;
  writeFileSync(join(versionRoot, "llms.txt"), activeLlms, "utf8");
}
const baseSitemapPath = join(staticPublicRoot, "sitemap.xml");
const runtimeSitemapPath = join(versionRoot, "sitemap.xml");
if (existsSync(baseSitemapPath) && issue?.slug) {
  let sitemap = readFileSync(baseSitemapPath, "utf8");
  const loc = `https://immeubleassur.com/${issue.slug}`;
  if (!sitemap.includes(`<loc>${loc}</loc>`)) sitemap = sitemap.replace("</urlset>", `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n</urlset>`);
  writeFileSync(runtimeSitemapPath, sitemap, "utf8");
}
const allowedFiles = ["veille-assurance-immeuble.html", "newsletter-assurance-immeuble.html", `${issue?.slug || ""}.html`, "faq.html", "villes.html", "llms.txt", "sitemap.xml"];
const invalid = [];
const files = allowedFiles.map((relative) => {
  const file = join(versionRoot, ...relative.split("/"));
  const html = existsSync(file) ? readFileSync(file, "utf8") : "";
  const expectedContent = relative === "sitemap.xml" ? html.includes("<urlset") && html.includes(`https://immeubleassur.com/${issue.slug}`) : html.includes("https://immeubleassur.com");
  if (!relative || !existsSync(file) || statSync(file).size < 1000 || !expectedContent || /\uFFFD|ï¿½|Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â(?:€|™|œ|ž)/.test(html) || containsSourceSummaryArtifacts(html)) invalid.push(relative || "missing-issue-slug");
  return { path: relative, bytes: existsSync(file) ? statSync(file).size : 0, sha256: existsSync(file) ? sha256(file) : "" };
});
if (invalid.length) {
  const report = { ...baseReport, success: false, status: "generated-files-invalid", preserved_previous: Boolean(current), invalid_files: invalid, files };
  writeJson(reportPath, report);
  console.error(`Editorial publisher: ${report.status}: ${invalid.join(", ")}.`);
  process.exit(1);
}

const manifest = {
  marker: "runtime-editorial-publication-v1",
  version,
  activated_at: new Date().toISOString(),
  allowed_files: allowedFiles,
  files,
  issue: { id: issue.id, slug: issue.slug, title: issue.title, html_url: issue.html_url },
  publication_gate: editorialReport.publication_gate,
  public_content_provider: editorialReport.public_content_provider,
  public_content_ai_generated: false,
  ai_draft_allowed_publication: false,
  hub_enrichment: hubEnrichment,
  base_hub_hashes: baseHubHashes,
  publication_input_hashes: publicationInputHashes,
  publication_build_hash: publicationBuildHash,
  previous_version: current?.version || null,
  repair_reason: sourceArtifactRepairNeeded ? "source-summary-artifacts" : hubProofRepairNeeded ? "hub-enrichment-proof-missing" : baseHubRefreshNeeded ? "static-hub-base-changed" : publicationInputsRefreshNeeded ? "publication-inputs-changed" : null
};
mkdirSync(publicationsRoot, { recursive: true });
const temporaryManifest = join(publicationsRoot, `current-${process.pid}-${Date.now()}.tmp`);
writeJson(temporaryManifest, manifest);
renameSync(temporaryManifest, manifestPath);
const publicationStatus = sourceArtifactRepairNeeded ? "repaired-source-artifacts" : hubProofRepairNeeded ? "repaired-hub-enrichment-proof" : baseHubRefreshNeeded ? "refreshed-static-hub-base" : publicationInputsRefreshNeeded ? "refreshed-publication-inputs" : "published";
const report = { ...baseReport, success: true, status: publicationStatus, preserved_previous: Boolean(current), active_version: version, previous_version: current?.version || null, issue: manifest.issue, hub_enrichment: hubEnrichment, files };
writeJson(reportPath, report);
console.log(`Editorial publisher: ${publicationStatus} ${issue.slug} as ${version}.`);
