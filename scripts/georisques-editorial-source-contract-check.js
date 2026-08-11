import { readFileSync } from "node:fs";

const editorial = readFileSync("scripts/editorial-autopilot.js", "utf8");
const checks = [
  ["georisques-official-source-configured", editorial.includes('["georisques-actualites", "Georisques", "https://www.georisques.gouv.fr/actualites-evenements", "public-page", "risques-batiment", "official"')],
  ["georisques-url-scope-single-article-only", editorial.includes('source?.id === "georisques-actualites"') && editorial.includes('/^\\/[a-z0-9][a-z0-9-]+$/')],
  ["georisques-content-scope-explicit", editorial.includes('/sinistre|incendie|inondation|pluie|tempete|catastrophe|secheresse|argile|feu de foret|deboisement|debroussaillement|prevention|risque naturel|submersion|mouvement de terrain/')],
  ["georisques-date-enrichment-enabled", editorial.includes('"france-assureurs-actualites", "georisques-actualites"')],
  ["unrelated-content-counted-as-rejected", editorial.includes("content_scope_rejected_count") && editorial.includes("rejectedContentScope")],
  ["fresh-official-evidence-still-required", editorial.includes('"no-fresh-dated-official-evidence"') && editorial.includes("maximum_age_days: 45")],
  ["legal-signals-remain-human-only", editorial.includes('publication_gate: matched_terms.length ? "legal-human-approval"') && editorial.includes("allowed_publication: false")],
  ["runtime-preview-does-not-write-public-pages", editorial.includes("const RUNTIME_ONLY") && editorial.includes("if (!RUNTIME_ONLY) write(file, html)")],
  ["third-party-copying-remains-forbidden", editorial.includes('"no-copying-third-party-articles"')]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Georisques editorial source contract: ${missing.length ? "failed" : "passed"} (${checks.length - missing.length}/${checks.length}).`);
if (missing.length) {
  console.error(missing.join(", "));
  process.exitCode = 1;
}
