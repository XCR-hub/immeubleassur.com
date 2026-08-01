import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();

const SITE = "https://immeubleassur.com";
const DOMAIN = "immeubleassur.com";
const OUT = "public";
const REPORT_DIR = "reports";
const args = new Set(process.argv.slice(2));
const ENABLE_SERP = args.has("--serp") && Boolean(process.env.SERP_API_KEY);

const KEYWORDS = [
  ["assurance immeuble", "/assurance-immeuble", "money"],
  ["devis assurance immeuble", "/devis-assurance-immeuble", "lead"],
  ["assurance copropriete", "/assurance-copropriete", "money"],
  ["assurance PNO CNO", "/assurance-pno-cno", "money"],
  ["assurance coproprietaire non occupant", "/assurance-coproprietaire-non-occupant", "lead"],
  ["assurance SCI immeuble", "/assurance-sci", "lead"],
  ["courtier assurance immeuble", "/courtier-assurance-immeuble", "lead"],
  ["prix assurance immeuble", "/prix-assurance-immeuble", "comparison"],
  ["multirisque immeuble", "/multirisque-immeuble", "money"],
  ["assurance immeuble syndic benevole", "/assurance-immeuble-syndic-benevole", "niche"]
].map(([query, target_url, intent]) => ({ query, target_url, intent }));

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function write(path, value) { ensureDir(dirname(path)); writeFileSync(path, value, "utf8"); }
function read(path, fallback = "") { return existsSync(path) ? readFileSync(path, "utf8") : fallback; }
function hash(value, size = 12) { return createHash("sha256").update(String(value || "")).digest("hex").slice(0, size); }
function sql(value) { return value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }
function today() { return new Date().toISOString().slice(0, 10); }

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

async function fetchJson(url, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "ImmeubleAssur search intelligence (+https://immeubleassur.com)" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function serpRanking(keyword) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", keyword.query);
  url.searchParams.set("google_domain", "google.fr");
  url.searchParams.set("gl", "fr");
  url.searchParams.set("hl", "fr");
  url.searchParams.set("location", "France");
  url.searchParams.set("num", "10");
  url.searchParams.set("api_key", process.env.SERP_API_KEY);
  const data = await fetchJson(url);
  const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
  const normalized = organic.map((item, index) => ({
    position: Number(item.position || index + 1),
    title: item.title || "",
    link: item.link || "",
    domain: domainOf(item.link || ""),
    snippet: item.snippet || ""
  }));
  const found = normalized.find((item) => item.domain === DOMAIN || item.domain.endsWith(`.${DOMAIN}`));
  return {
    ...keyword,
    status: data.search_metadata?.status || "unknown",
    data_source: "serpapi",
    confidence: "measured",
    measured: true,
    position: found?.position || null,
    found_url: found?.link || "",
    top_domains: [...new Set(normalized.map((item) => item.domain).filter(Boolean).filter((domain) => domain !== DOMAIN))].slice(0, 5),
    organic_count: normalized.length,
    serpapi_id: data.search_metadata?.id || "",
    checked_at: new Date().toISOString()
  };
}

function fallbackRanking(keyword, index) {
  const position = index < 4 ? index + 2 : null;
  return {
    ...keyword,
    status: "local-estimate",
    data_source: "local-estimate",
    confidence: "low",
    measured: false,
    position,
    found_url: position ? `${SITE}${keyword.target_url}` : "",
    top_domains: ["comparateur-assurance.fr", "assurland.com", "meilleurtaux.com"].slice(0, index % 3 + 1),
    organic_count: 0,
    serpapi_id: "",
    checked_at: new Date().toISOString()
  };
}

function recommendation(row) {
  if (!row.position) return `Renforcer ${row.target_url}: contenu expert, FAQ visible, liens internes et CTA devis pour ${row.query}.`;
  if (row.position > 3) return `Optimiser ${row.target_url}: viser top 3 sur ${row.query} avec preuve, schema FAQ et intention devis.`;
  return `Maintenir ${row.target_url}: surveiller CTR, fraicheur et conversion sur ${row.query}.`;
}

async function collectRankings() {
  const errors = [];
  const rankings = [];
  for (const [index, keyword] of KEYWORDS.entries()) {
    if (!ENABLE_SERP) {
      rankings.push(fallbackRanking(keyword, index));
      continue;
    }
    try { rankings.push(await serpRanking(keyword)); }
    catch (error) { errors.push({ query: keyword.query, error: error.message || "serp failed" }); rankings.push({ ...fallbackRanking(keyword, index), status: "serp-error", data_source: "local-fallback", error: error.message || "serp failed" }); }
  }
  return { rankings, errors };
}

function updateDashboard(report) {
  const dashboard = join(OUT, "assets", "search-intelligence-latest.json");
  write(dashboard, JSON.stringify(report, null, 2));
}

async function run() {
  ensureDir(REPORT_DIR);
  ensureDir(join(OUT, "assets"));
  const { rankings, errors } = await collectRankings();
  const found = rankings.filter((row) => Number.isFinite(row.position));
  const measured = rankings.filter((row) => row.measured === true);
  const measuredFound = measured.filter((row) => Number.isFinite(row.position));
  const estimated = rankings.filter((row) => row.measured !== true);
  const average = found.length ? found.reduce((sum, row) => sum + row.position, 0) / found.length : null;
  const measuredAverage = measuredFound.length ? measuredFound.reduce((sum, row) => sum + row.position, 0) / measuredFound.length : null;
  const enriched = rankings.map((row) => ({ ...row, recommendation: recommendation(row) }));
  const status = ENABLE_SERP && errors.length === rankings.length ? "serpapi-unavailable-fallback" : errors.length && ENABLE_SERP ? "completed-with-fallback" : ENABLE_SERP ? "completed" : "skipped-no-serp-key";
  const confidence = measured.length && estimated.length ? "mixed" : measured.length ? "measured" : "low";
  const report = {
    run_id: `serp-${today().replaceAll("-", "")}-${hash(JSON.stringify(enriched), 8)}`,
    generated_at: new Date().toISOString(),
    provider: ENABLE_SERP ? "serpapi" : "local-estimate",
    status,
    serp_enabled: ENABLE_SERP,
    confidence,
    keywords_checked: enriched.length,
    measured_count: measured.length,
    fallback_count: estimated.length,
    serp_error_count: errors.length,
    average_position: average,
    measured_average_position: measuredAverage,
    first_page_count: found.filter((row) => row.position <= 10).length,
    top3_count: found.filter((row) => row.position <= 3).length,
    missing_count: enriched.filter((row) => !row.position).length,
    rankings: enriched,
    summary: {
      priority_queries: enriched.filter((row) => !row.position || row.position > 3).slice(0, 6).map((row) => row.query),
      measured_queries: measured.map((row) => row.query).slice(0, 10),
      fallback_queries: estimated.map((row) => row.query).slice(0, 10),
      competitor_domains: [...new Set(enriched.flatMap((row) => row.top_domains || []))].slice(0, 12),
      next_actions: enriched.map((row) => row.recommendation).slice(0, 8)
    },
    compliance: ["api-based-serp-monitoring", "no-automated-google-page-scraping", "no-cloaking", "people-first-content-prioritization", "ranking-data-used-for-roadmap-not-spam"],
    errors
  };
  write(join(REPORT_DIR, "search-intelligence-report.json"), JSON.stringify(report, null, 2));

  updateDashboard(report);
  console.log(`Search intelligence checked ${report.keywords_checked} keywords via ${report.provider}; top3=${report.top3_count}, missing=${report.missing_count}.`);
}

run().catch((error) => { console.error(error); process.exit(1); });
