import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();
const publisher = readFileSync("scripts/local-editorial-publisher.js", "utf8");
const server = readFileSync("scripts/local-production-server.js", "utf8");
const cycle = readFileSync("scripts/local-runtime-report-cycle.js", "utf8");
const health = readFileSync("scripts/local-editorial-health-monitor.js", "utf8");
const smoke = readFileSync("scripts/local-editorial-publication-smoke.js", "utf8");
const hubQuality = readFileSync("scripts/local-editorial-hub-quality-check.js", "utf8");
const workflow = readFileSync(".github/workflows/editorial-autopilot.yml", "utf8");
const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const reportPath = join(reportDir, "editorial-runtime-publication-contract-report.json");
const publisherIndex = cycle.indexOf('runStep("editorial_runtime_publisher"');
const connectorsIndex = cycle.indexOf('runStep("live_ready_connectors"');
const healthIndex = cycle.indexOf('runStep("editorial_health_monitor"');
const checks = [
  ["automatic-content-is-deterministic", publisher.includes('public_content_provider !== "deterministic"')],
  ["automatic-ai-publication-forbidden", publisher.includes('public_content_ai_generated !== false') && publisher.includes('ai_draft_allowed_publication !== false')],
  ["fresh-source-gate-required", publisher.includes("!editorialReport.publication_gate?.ready") && publisher.includes("!editorialReport.public_write_enabled")],
  ["same-day-artifacts-trigger-repair", publisher.includes("const repairTriggered =") && publisher.includes('status: publicationStatus') && publisher.includes('"repaired-source-artifacts"')],
  ["same-day-static-hub-change-triggers-refresh", publisher.includes("baseHubRefreshNeeded") && publisher.includes("base_hub_hashes: baseHubHashes") && publisher.includes('"static-hub-base-changed"') && publisher.includes('"refreshed-static-hub-base"')],
  ["same-day-publication-input-change-triggers-refresh", publisher.includes("publicationInputsRefreshNeeded") && publisher.includes("publication_input_hashes: publicationInputHashes") && publisher.includes("publication_build_hash: publicationBuildHash") && publisher.includes('"publication-inputs-changed"') && publisher.includes('"refreshed-publication-inputs"')],
  ["generated-artifacts-block-activation", publisher.includes("containsSourceSummaryArtifacts(html)") && publisher.includes("SOURCE_SUMMARY_ARTIFACT_PATTERN")],
  ["publisher-does-not-enable-ai", publisher.includes('["scripts/editorial-autopilot.js", "--fetch"]') && !publisher.includes('"--fetch", "--ai"')],
  ["runtime-output-is-versioned", publisher.includes('join(publicationsRoot, "versions", version)')],
  ["runtime-sitemap-includes-active-issue", publisher.includes('const runtimeSitemapPath = join(versionRoot, "sitemap.xml")') && publisher.includes('html.includes("<urlset")') && publisher.includes('"sitemap.xml"')],
  ["activation-manifest-is-atomic", publisher.includes("renameSync(temporaryManifest, manifestPath)")],
  ["served-files-are-whitelisted", server.includes("manifest.allowed_files.includes(relative)") && server.includes("isInside(versionRoot, file)")],
  ["publisher-runs-after-connectors-before-health", connectorsIndex >= 0 && publisherIndex > connectorsIndex && healthIndex > publisherIndex],
  ["health-reads-active-runtime-manifest", health.includes('source: "runtime-manifest"') && health.includes('readJson(join(publicationsRoot, "current.json"))')],
  ["public-smoke-compares-active-file-hashes", smoke.includes("remote.sha256 === localHash") && smoke.includes("manifest.allowed_files")],
  ["faq-and-city-hubs-are-enriched", publisher.includes('enrichStaticHub("faq.html"') && publisher.includes('enrichStaticHub("villes.html"')],
  ["hub-enrichment-is-activation-gated", publisher.includes('status: "hub-enrichment-failed"') && publisher.includes("!faqHub.enriched || !cityHub.enriched || cityLinks.length < 3")],
  ["hub-enrichment-proof-is-versioned", publisher.includes("hub_enrichment: hubEnrichment") && publisher.includes('"hub-enrichment-proof-missing"')],
  ["hub-quality-blocks-doorway-pages", hubQuality.includes('no-automatic-city-doorway-pages') && hubQuality.includes('automatically_created_city_pages')],
  ["git-workflow-remains-read-only", /permissions:\s*\n\s*contents:\s*read/.test(workflow)]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, invariants: ["deterministic-public-content-only", "ai-drafts-never-promoted", "fresh-official-evidence-required", "atomic-manifest-activation", "last-valid-edition-preserved", "same-day-source-artifact-self-repair", "same-day-publication-input-refresh"] };
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (missing.length) { console.error(`Editorial runtime publication contract failed: ${missing.join(", ")}`); process.exit(1); }
console.log(`Editorial runtime publication contract passed: ${checks.length} checks.`);
