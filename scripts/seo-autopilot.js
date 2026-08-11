import { createSign } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();

const SITE = "https://immeubleassur.com";
const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const SEARCH_INTELLIGENCE_REPORT = process.env.LOCAL_SEARCH_INTELLIGENCE_REPORT || (process.env.LOCAL_RUNTIME_REPORTS_ROOT ? join(process.env.LOCAL_RUNTIME_REPORTS_ROOT, "search-intelligence-report.json") : join(REPORT_DIR, "search-intelligence-report.json"));
const SEO_AUTOPILOT_REPORT = process.env.LOCAL_SEO_AUTOPILOT_REPORT || join(REPORT_DIR, "seo-autopilot-report.json");
const SEO_AUTOPILOT_MARKDOWN = process.env.LOCAL_SEO_AUTOPILOT_MARKDOWN || join(REPORT_DIR, "seo-autopilot-report.md");
const SEO_AUTOPILOT_PUBLIC_REPORT = process.env.LOCAL_SEO_AUTOPILOT_PUBLIC_REPORT || join(PUBLIC_DIR, "assets", "seo-autopilot-latest.json");
const args = new Set(process.argv.slice(2));
const localOnly = args.has("--local-only");
const usePageSpeed = args.has("--pagespeed") && !localOnly;
const useGsc = (args.has("--gsc") || args.has("--gsc-if-configured")) && !localOnly;
const inspectUrls = args.has("--url-inspection") && !localOnly;
const submitSitemap = args.has("--submit-sitemap") && !localOnly;

const nonCommercialSlugs = new Set(["mentions-legales", "confidentialite", "merci"]);

const intentBacklog = [
  ["assurance CNO", "assurance-cno"],
  ["assurance coproprietaire non occupant", "assurance-coproprietaire-non-occupant"],
  ["assurance PNO CNO", "assurance-pno-cno"],
  ["devis PNO CNO", "devis-pno-cno"],
  ["assurance immeuble prix", "blog/prix-assurance-immeuble-au-m2"],
  ["assurance immeuble ancien", "blog/assurance-immeuble-ancien"],
  ["assurance copropriete syndic benevole", "blog/copropriete-petite-syndic-benevole"],
  ["syndic professionnel assurance copropriete", "blog/syndic-copropriete-assurance-contrat"],
  ["PNO copropriete", "faq/pno"],
  ["sinistre degat des eaux immeuble", "blog/checklist-sinistre-degat-des-eaux"],
  ["dommages ouvrage copropriete", "blog/dommages-ouvrage-copropriete-travaux"],
  ["assurance SCI familiale", "blog/sci-familiale-immeuble"],
  ["protection juridique copropriete", "blog/protection-juridique-copropriete"],
  ["assurance local commercial vacant", "blog/local-commercial-vacant"],
  ["franchise assurance immeuble", "blog/audit-franchises-assurance-immeuble"],
  ["assurance immeuble obligatoire", "assurance-immeuble-obligatoire"],
  ["devis assurance immeuble en ligne", "devis-assurance-immeuble-en-ligne"],
  ["courtier assurance immeuble", "courtier-assurance-immeuble"],
  ["assurance immeuble de rapport", "assurance-immeuble-de-rapport"],
  ["assurance immeuble monopropriete", "assurance-immeuble-monopropriete"],
  ["assurance batiment proprietaire", "assurance-batiment-proprietaire"],
  ["assurance parties communes immeuble", "assurance-parties-communes"],
  ["assurance immeuble resilie", "assurance-immeuble-resilie"],
  ["assurance immeuble avec sinistres", "assurance-immeuble-sinistre"],
  ["tarif assurance immeuble", "tarif-assurance-immeuble"],
  ["assurance immeuble syndic benevole", "assurance-immeuble-syndic-benevole"],
  ["assurance immeuble syndic professionnel", "assurance-immeuble-syndic-professionnel"]
];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(file) === ".html" ? [file] : [];
  });
}

function stripHtml(value) {
  return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function slugFromFile(file) {
  const rel = relative(PUBLIC_DIR, file).replace(/\\/g, "/");
  if (rel === "index.html") return "";
  return rel.replace(/\.html$/, "");
}

function pageUrl(slug) {
  return `${SITE}${slug ? `/${slug}` : "/"}`;
}

function readMeta(html, pattern, fallback = "") {
  return ((html.match(pattern) || [])[1] || fallback).trim();
}

function auditPage(file) {
  const html = readFileSync(file, "utf8");
  const slug = slugFromFile(file);
  const title = stripHtml(readMeta(html, /<title>(.*?)<\/title>/is));
  const description = readMeta(html, /<meta name="description" content="([^"]*)"/i);
  const h1 = [...html.matchAll(/<h1[^>]*>/gi)].length;
  const h2 = [...html.matchAll(/<h2[^>]*>/gi)].length;
  const details = [...html.matchAll(/<details>/gi)].length;
  const jsonLd = [...html.matchAll(/type="application\/ld\+json"/gi)].length;
  const hasPageSchema = /"@type"\s*:\s*(?:\[[^\]]*)?"(?:Article|WebPage|AboutPage|FAQPage|Service|CollectionPage|ItemList|InsuranceAgency|FinancialService)"/i.test(html);
  const canonical = readMeta(html, /<link rel="canonical" href="([^"]*)"/i);
  const robots = readMeta(html, /<meta name="robots" content="([^"]*)"/i);
  const noindex = /(?:^|[,\s])noindex(?:[,\s]|$)/i.test(robots);
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  const hasLeadForm = html.includes('id="lead-form"');
  const hasCta = html.includes('class="button primary"') || html.includes("submit-button");
  const issues = [];
  const add = (severity, type, message, recommendation) => issues.push({ severity, type, message, recommendation });

  if (!title || title.length < 35 || title.length > 72) add("medium", "title", `Title longueur ${title.length}`, "Ajuster le titre entre 35 et 72 caracteres utiles.");
  if (!description || description.length < 110 || description.length > 170) add("medium", "description", `Description longueur ${description.length}`, "Ajuster la meta description autour de 120-160 caracteres.");
  if (h1 !== 1) add("high", "h1", `${h1} H1 detectes`, "Conserver un seul H1 clair par page.");
  if (!canonical || canonical.includes(".html")) add("high", "canonical", "Canonical absent ou non propre", "Utiliser une URL canonique propre sans extension.");
  if (words < 450 && slug !== "admin" && !nonCommercialSlugs.has(slug)) add("medium", "content-depth", `${words} mots`, "Renforcer la page avec exemples, FAQ et checklist utile.");
  if (details < 2 && slug !== "admin" && !nonCommercialSlugs.has(slug)) add("low", "faq", "Peu de FAQ visibles", "Ajouter des questions reelles et reponses courtes quand pertinent.");
  if (!hasPageSchema && slug !== "admin") add("medium", "schema", `${jsonLd} blocs JSON-LD sans type de page reconnu`, "Verifier WebPage, Article, FAQ, Service ou type metier pertinent.");
  if (!hasLeadForm && !hasCta && slug !== "admin" && !nonCommercialSlugs.has(slug)) add("medium", "conversion", "CTA faible ou absent", "Ajouter une action claire vers devis, audit ou contact.");

  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === "high" ? 18 : issue.severity === "medium" ? 10 : 5), 0);
  return { slug: slug || "index", url: pageUrl(slug), title, description, words, h1, h2, details, jsonLd, hasPageSchema, hasLeadForm, noindex, issues, score: Math.max(0, 100 - penalty) };
}

function detectIntentGaps(pages) {
  const existingSlugs = new Set(pages.map((page) => page.slug));
  return intentBacklog
    .filter(([, slug]) => !existingSlugs.has(slug))
    .map(([query, slug], index) => ({ id: `intent-${index + 1}`, type: "content-gap", query, url: `${SITE}/${slug}`, score: 45, recommendation: `Creer ou renforcer un contenu utile autour de "${query}".` }));
}

function queryCluster(query = "") {
  const value = String(query).toLowerCase();
  if (/pno|cno|non.?occupant|coproprietaire/.test(value)) return "pno-cno";
  if (/prix|tarif|cout|combien|cher/.test(value)) return "prix-tarif";
  if (/courtier|comparateur|devis/.test(value)) return "devis-courtier";
  if (/sinistre|resilie|refus|degat|fuite|incendie/.test(value)) return "dossiers-difficiles";
  if (/copro|syndic|parties communes|ag/.test(value)) return "copropriete-syndic";
  if (/sci|rapport|monopropriete|bailleur|locatif/.test(value)) return "bailleur-sci";
  if (/paris|lyon|marseille|bordeaux|lille|nantes|nice|toulouse|ville/.test(value)) return "local";
  return "assurance-immeuble";
}

function summarizeGscRows(rows = []) {
  const buckets = new Map();
  for (const row of rows) {
    const key = queryCluster(row.query);
    const bucket = buckets.get(key) || { cluster: key, clicks: 0, impressions: 0, weighted_position: 0, opportunity_score: 0, sample_queries: [] };
    const impressions = Number(row.impressions || 0);
    bucket.clicks += Number(row.clicks || 0);
    bucket.impressions += impressions;
    bucket.weighted_position += Number(row.position || 0) * impressions;
    bucket.opportunity_score = Math.max(bucket.opportunity_score, Number(row.opportunity_score || 0));
    if (row.query && bucket.sample_queries.length < 5 && !bucket.sample_queries.includes(row.query)) bucket.sample_queries.push(row.query);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map((bucket) => ({
    cluster: bucket.cluster,
    clicks: Math.round(bucket.clicks * 100) / 100,
    impressions: Math.round(bucket.impressions),
    ctr: bucket.impressions ? Math.round((bucket.clicks / bucket.impressions) * 1000) / 10 : 0,
    position: bucket.impressions ? Math.round((bucket.weighted_position / bucket.impressions) * 10) / 10 : 0,
    opportunity_score: bucket.opportunity_score,
    sample_queries: bucket.sample_queries
  })).sort((a, b) => b.opportunity_score - a.opportunity_score || b.impressions - a.impressions).slice(0, 20);
}
function normalizeSiteUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value, SITE);
    if (parsed.hostname !== "immeubleassur.com") return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function urlInspectionTargets(rows = []) {
  const envTargets = String(process.env.GOOGLE_URL_INSPECTION_URLS || "")
    .split(",")
    .map(normalizeSiteUrl)
    .filter(Boolean);
  const defaults = [
    `${SITE}/`,
    `${SITE}/assurance-immeuble`,
    `${SITE}/assurance-copropriete`,
    `${SITE}/assurance-cno`,
    `${SITE}/assurance-pno-cno`,
    `${SITE}/devis-assurance-immeuble`,
    `${SITE}/courtier-assurance-immeuble`,
    `${SITE}/tarif-assurance-immeuble`
  ];
  const gscPages = rows
    .filter((row) => Number(row.opportunity_score || 0) >= 40)
    .sort((a, b) => Number(b.opportunity_score || 0) - Number(a.opportunity_score || 0))
    .map((row) => normalizeSiteUrl(row.page))
    .filter(Boolean);
  const limit = Math.max(1, Math.min(20, Number(process.env.GOOGLE_URL_INSPECTION_LIMIT || 8)));
  return [...new Set([...envTargets, ...defaults, ...gscPages])].slice(0, limit);
}

function summarizeInspection(url, data, status, ok) {
  const index = data?.inspectionResult?.indexStatusResult || {};
  return {
    url,
    ok: Boolean(ok),
    status,
    verdict: index.verdict || "",
    coverage_state: index.coverageState || "",
    indexing_state: index.indexingState || "",
    robots_txt_state: index.robotsTxtState || "",
    page_fetch_state: index.pageFetchState || "",
    user_canonical: index.userCanonical || "",
    google_canonical: index.googleCanonical || "",
    last_crawl_time: index.lastCrawlTime || ""
  };
}

function inspectionNeedsAction(row) {
  if (!row?.ok) return true;
  const verdict = String(row.verdict || "").toUpperCase();
  const coverage = String(row.coverage_state || "").toLowerCase();
  const robots = String(row.robots_txt_state || "").toUpperCase();
  const fetchState = String(row.page_fetch_state || "").toUpperCase();
  return (verdict && verdict !== "PASS") || /not|excluded|blocked|error|duplicate|redirect/i.test(coverage) || robots.includes("DISALLOW") || fetchState.includes("ERROR");
}
function opportunityScore(row) {
  const impressions = Number(row.impressions || 0);
  const clicks = Number(row.clicks || 0);
  const ctr = Number(row.ctr || 0);
  const position = Number(row.position || 99);
  let score = 0;
  if (impressions >= 1000) score += 30; else if (impressions >= 250) score += 20; else if (impressions >= 50) score += 10;
  if (position >= 4 && position <= 20) score += 35; else if (position > 20 && position <= 50) score += 15;
  if (ctr < 0.02 && impressions >= 100) score += 25; else if (ctr < 0.05) score += 10;
  if (clicks === 0 && impressions >= 50) score += 10;
  return Math.min(100, score);
}

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getGoogleToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) return null;
  const key = rawKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = { iss: email, scope: "https://www.googleapis.com/auth/webmasters", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(key).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }) });
  if (!response.ok) throw new Error(`Google OAuth ${response.status}`);
  const data = await response.json();
  return data.access_token;
}
function isoDate(daysAgo) {
  const date = new Date(Date.now() - daysAgo * 86400000);
  return date.toISOString().slice(0, 10);
}

async function fetchGscData() {
  if (!useGsc) return { configured: false, skipped: "--gsc not requested" };
  const token = await getGoogleToken();
  if (!token) return { configured: false, skipped: "GOOGLE_SERVICE_ACCOUNT_EMAIL/KEY missing" };
  const siteUrl = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || "sc-domain:immeubleassur.com";
  const encodedSite = encodeURIComponent(siteUrl);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const body = { startDate: isoDate(Number(process.env.GOOGLE_GSC_LOOKBACK_DAYS || 28)), endDate: isoDate(2), dimensions: ["query", "page"], rowLimit: 2500, startRow: 0 };
  const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`GSC searchAnalytics ${response.status}`);
  const data = await response.json();
  const rows = (data.rows || []).map((row) => ({ query: row.keys?.[0] || "", page: row.keys?.[1] || "", clicks: row.clicks || 0, impressions: row.impressions || 0, ctr: row.ctr || 0, position: row.position || 0, opportunity_score: opportunityScore(row) }));
  const opportunities = rows.filter((row) => row.opportunity_score >= 40).sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 100).map((row, index) => ({ id: `gsc-${index + 1}`, type: row.position <= 20 ? "near-top-ranking" : "impression-gap", query: row.query, url: row.page, score: row.opportunity_score, recommendation: row.ctr < 0.03 ? "Renforcer title/meta/FAQ et aligner le contenu avec la requete." : "Ajouter profondeur, maillage interne et preuve de specialisation." }));
  const result = { configured: true, siteUrl, rows_imported: rows.length, query_clusters: summarizeGscRows(rows), opportunities };

  if (inspectUrls) {
    const targets = urlInspectionTargets(rows);
    const inspections = [];
    for (const inspectionUrl of targets) {
      const inspect = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
        method: "POST",
        headers,
        body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: "fr-FR" })
      });
      let data = null;
      try {
        data = inspect.ok ? await inspect.json() : { error: await inspect.text() };
      } catch (error) {
        data = { error: error.message };
      }
      inspections.push({ ...summarizeInspection(inspectionUrl, data, inspect.status, inspect.ok), error: data?.error || "" });
    }
    result.url_inspections = {
      checked: inspections.length,
      needs_action: inspections.filter(inspectionNeedsAction).length,
      rows: inspections
    };
  }

  if (submitSitemap) {
    const sitemapUrl = `${SITE}/sitemap.xml`;
    const submit = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodeURIComponent(sitemapUrl)}`, { method: "PUT", headers });
    result.sitemap_submission = { sitemapUrl, ok: submit.ok, status: submit.status };
  }
  return result;
}

async function fetchPageSpeed(urls) {
  if (!usePageSpeed) return { skipped: "--pagespeed not requested" };
  const key = process.env.PAGESPEED_API_KEY;
  const rows = [];
  for (const url of urls.slice(0, 8)) {
    const params = new URLSearchParams({ url, strategy: "mobile" }); params.append("category", "PERFORMANCE"); params.append("category", "SEO"); params.append("category", "ACCESSIBILITY");
    if (key) params.set("key", key);
    const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`);
    if (!response.ok) {
      rows.push({ url, ok: false, status: response.status });
      continue;
    }
    const data = await response.json();
    const categories = data.lighthouseResult?.categories || {};
    rows.push({ url, ok: true, performance: Math.round((categories.performance?.score || 0) * 100), seo: Math.round((categories.seo?.score || 0) * 100), accessibility: Math.round((categories.accessibility?.score || 0) * 100) });
  }
  return { checked: rows.length, rows };
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readAutoFixReport() {
  const report = readJsonFile(join(REPORT_DIR, "seo-auto-fix-report.json"), null);
  if (!report) return { configured: true, skipped: "seo-auto-fix-report missing" };
  return {
    configured: true,
    generated_at: report.generated_at,
    pages_checked: report.pages_checked || 0,
    pages_changed: report.pages_changed || 0,
    fixes_applied: report.fixes_applied || 0,
    safeguards: report.safeguards || [],
    sample: (report.pages || []).slice(0, 20).map((page) => ({ slug: page.slug, fixes: page.fixes }))
  };
}
function readOpportunityExpansionReport() {
  const report = readJsonFile(join(REPORT_DIR, "seo-opportunity-expansion-report.json"), null);
  if (!report) return { configured: true, skipped: "seo-opportunity-expansion-report missing" };
  return {
    configured: true,
    generated_at: report.generated_at,
    pages_checked: report.pages_checked || 0,
    pages_expanded: report.pages_expanded || 0,
    words_added_estimate: report.words_added_estimate || 0,
    safeguards: report.safeguards || [],
    sample: (report.pages || []).slice(0, 20).map((page) => ({ slug: page.slug, before_words: page.before_words, after_words: page.after_words }))
  };
}
function readContentQualityReport() {
  const report = readJsonFile(join(REPORT_DIR, "content-quality-report.json"), null);
  if (!report) return { configured: true, skipped: "content-quality-report missing" };
  return {
    configured: true,
    generated_at: report.generated_at,
    pages_checked: report.pages_checked || 0,
    status: report.status || "unknown",
    severe_issue_count: report.severe_issue_count || 0,
    warning_count: report.warning_count || 0,
    policy_alignment: report.policy_alignment || [],
    weakest_pages: report.weakest_pages || []
  };
}

function readCannibalizationReport() {
  const report = readJsonFile(join(REPORT_DIR, "seo-cannibalization-report.json"), null);
  if (!report) return { configured: true, skipped: "seo-cannibalization-report missing" };
  return {
    configured: true,
    generated_at: report.generated_at,
    status: report.status || "unknown",
    pages_checked: report.pages_checked || 0,
    clusters_checked: report.clusters_checked || 0,
    high_risk_count: report.high_risk_count || 0,
    medium_risk_count: report.medium_risk_count || 0,
    watch_count: report.watch_count || 0,
    cluster_summary: (report.cluster_summary || []).slice(0, 12),
    watchlist: (report.watchlist || []).slice(0, 20),
    safeguards: report.safeguards || []
  };
}
function readIntentDifferentiationReport() {
  const report = readJsonFile(join(REPORT_DIR, "seo-intent-differentiation-report.json"), null);
  if (!report) return { configured: true, skipped: "seo-intent-differentiation-report missing" };
  return {
    configured: true,
    status: report.status || "unknown",
    generated_at: report.generated_at || "",
    target_pages: report.target_pages || 0,
    pages_changed: report.pages_changed || 0,
    pages_changed_this_run: report.pages_changed_this_run || report.pages_changed || 0,
    conflicts_addressed: report.conflicts_addressed || 0,
    safeguards: report.safeguards || [],
    pages: (report.pages || []).slice(0, 25)
  };
}
function readAngleDifferentiationReport() {
  const report = readJsonFile(join(REPORT_DIR, "seo-angle-differentiation-report.json"), null);
  if (!report) return { configured: true, skipped: "seo-angle-differentiation-report missing" };
  return {
    configured: true,
    status: report.status || "unknown",
    generated_at: report.generated_at || "",
    pages_targeted: report.pages_targeted || 0,
    pages_changed: report.pages_changed || 0,
    noindex_pages: report.noindex_pages || 0,
    sitemap_entries_removed: report.sitemap_entries_removed || 0,
    safeguards: report.safeguards || [],
    pages: (report.pages || []).slice(0, 25)
  };
}
function readInternalLinkEquityReport() {
  const report = readJsonFile(join(REPORT_DIR, "internal-link-equity-report.json"), null);
  if (!report) return { configured: true, skipped: "internal-link-equity-report missing" };
  return {
    configured: true,
    status: report.status || "unknown",
    generated_at: report.generated_at || "",
    pages_checked: report.pages_checked || 0,
    pages_targeted: report.pages_targeted || 0,
    pages_changed: report.pages_changed || 0,
    links_added: report.links_added || 0,
    pages_with_active_blocks: report.pages_with_active_blocks || 0,
    active_internal_links: report.active_internal_links || 0,
    noindex_skipped: report.noindex_skipped || 0,
    cluster_targets: report.cluster_targets || [],
    safeguards: report.safeguards || [],
    pages: (report.pages || []).slice(0, 25)
  };
}
function readClusterConversionBridgeReport() {
  const report = readJsonFile(join(REPORT_DIR, "cluster-conversion-bridge-report.json"), null);
  if (!report) return { configured: true, skipped: "cluster-conversion-bridge-report missing" };
  return {
    configured: true,
    status: report.status || "unknown",
    generated_at: report.generated_at || "",
    pages_checked: report.pages_checked || 0,
    pages_targeted: report.pages_targeted || 0,
    pages_changed: report.pages_changed || 0,
    active_bridges: report.active_bridges || 0,
    cluster_targets: report.cluster_targets || [],
    safeguards: report.safeguards || [],
    pages: (report.pages || []).slice(0, 25)
  };
}
function readEditorialClusterRescueReport() {
  const report = readJsonFile(join(REPORT_DIR, "editorial-cluster-rescue-report.json"), null);
  if (!report) return { configured: true, skipped: "editorial-cluster-rescue-report missing" };
  return {
    configured: true,
    status: report.status || "unknown",
    generated_at: report.generated_at || "",
    pages_checked: report.pages_checked || 0,
    clusters_targeted: report.clusters_targeted || 0,
    pages_targeted: report.pages_targeted || 0,
    blocks_written: report.blocks_written || 0,
    active_rescues: report.active_rescues || 0,
    cluster_targets: report.cluster_targets || [],
    safeguards: report.safeguards || [],
    pages: (report.pages || []).slice(0, 25)
  };
}
function readConversionIntelligenceReport() {
  const report = readJsonFile(join(REPORT_DIR, "conversion-intelligence-report.json"), null);
  if (!report) return { configured: true, skipped: "conversion-intelligence-report missing" };
  return {
    configured: true,
    generated_at: report.generated_at,
    pages_checked: report.pages_checked || 0,
    money_pages_checked: report.money_pages_checked || 0,
    average_conversion_score: report.average_conversion_score || 0,
    average_money_score: report.average_money_score || 0,
    cluster_count: report.cluster_count || (report.cluster_coverage || []).length,
    cluster_detection: report.cluster_detection || {},
    cluster_coverage: report.cluster_coverage || [],
    top_money_pages: report.top_money_pages || [],
    weak_money_pages: report.weak_money_pages || [],
    actions: report.actions || [],
    safeguards: report.safeguards || []
  };
}
function readCroExperimentReport() {
  const report = readJsonFile(join(REPORT_DIR, "cro-experiment-report.json"), null);
  if (!report) return { configured: true, skipped: "cro-experiment-report missing" };
  return {
    configured: true,
    generated_at: report.generated_at,
    status: report.status || "unknown",
    variant_count: report.variant_count || 0,
    variants: report.variants || [],
    required_contracts: report.required_contracts || 0,
    missing: report.missing || [],
    safeguards: report.safeguards || []
  };
}

function readLeadFrictionReport() {
  const report = readJsonFile(join(REPORT_DIR, "lead-friction-report.json"), null);
  if (!report) return { configured: true, skipped: "lead-friction-report missing" };
  return {
    status: report.status || "unknown",
    action_count: report.action_count || 0,
    verified_count: report.verified_count || 0,
    watch_count: report.watch_count || 0,
    pages_checked: report.pages_checked || 0,
    top_dimensions: report.top_dimensions || []
  };
}
function readLeadIntentRoutingReport() {
  const report = readJsonFile(join(REPORT_DIR, "lead-intent-routing-report.json"), null);
  if (!report) return { status: "missing", required_intents: [], active_bridges: 0, missing_money_intent_links: [] };
  return {
    status: report.status || "unknown",
    required_intents: report.required_intents || [],
    money_intents: report.money_intents || [],
    intent_link_counts: report.intent_link_counts || {},
    missing_money_intent_links: report.missing_money_intent_links || [],
    active_bridges: report.active_bridges || 0,
    bridge_status: report.bridge_status || "unknown"
  };
}
function readLeadUrgencyFeedbackReport() {
  const report = readJsonFile(join(REPORT_DIR, "lead-urgency-feedback-report.json"), null);
  if (!report) return { status: "missing", urgent_pages: 0, missing_cta_count: 0, contract_missing_count: 0 };
  return {
    status: report.status || "unknown",
    urgent_pages: report.urgent_pages || 0,
    missing_cta_count: report.missing_cta_count || 0,
    contract_missing_count: report.contract_missing_count || 0,
    coverage_by_intent: report.coverage_by_intent || [],
    weakest_pages: report.weakest_pages || [],
    conversion_signals: report.conversion_signals || {}
  };
}
function readIntentConversionMonitorReport() {
  const report = readJsonFile(join(REPORT_DIR, "local-intent-conversion-report.json"), null);
  if (!report) return { status: "missing", available: false, attention_required: false, summary: {}, recommendations: [] };
  return {
    status: report.status || "unknown",
    available: report.status !== "no-database" && report.status !== "schema-incomplete",
    generated_at: report.generated_at || "",
    attention_required: report.attention_required === true,
    summary: report.summary || {},
    top_intents: (report.intent_funnels || []).slice(0, 12),
    top_urgencies: (report.urgency_funnels || []).slice(0, 8),
    lead_segments: (report.lead_segments || []).slice(0, 8),
    recommendations: (report.recommendations || []).slice(0, 10)
  };
}
function readSearchIntelligenceReport() {
  const report = readJsonFile(SEARCH_INTELLIGENCE_REPORT, null);
  if (!report) return { status: "missing", available: false, rankings: [], errors: [], priority_queries: [] };
  const rankings = Array.isArray(report.rankings) ? report.rankings : [];
  return {
    status: report.status || "unknown",
    available: true,
    provider: report.provider || "unknown",
    serp_enabled: report.serp_enabled === true,
    confidence: report.confidence || "unknown",
    generated_at: report.generated_at || "",
    keywords_checked: report.keywords_checked || rankings.length,
    measured_count: report.measured_count || rankings.filter((row) => row.measured === true).length,
    fallback_count: report.fallback_count || rankings.filter((row) => row.measured !== true).length,
    serp_error_count: report.serp_error_count || (Array.isArray(report.errors) ? report.errors.length : 0),
    serp_request_count: report.serp_request_count || 0,
    rate_limited: report.rate_limited === true,
    rate_limited_skipped_count: report.rate_limited_skipped_count || 0,
    retry_after: report.retry_after || "",
    average_position: report.measured_average_position || null,
    measured_average_position: report.measured_average_position || null,
    top3_count: rankings.filter((row) => row.measured === true && Number.isFinite(row.position) && row.position <= 3).length,
    missing_count: rankings.filter((row) => row.measured === true && !row.position).length,
    first_page_count: rankings.filter((row) => row.measured === true && Number.isFinite(row.position) && row.position <= 10).length,
    priority_queries: report.summary?.priority_queries || [],
    competitor_domains: report.summary?.competitor_domains || [],
    rankings: rankings.slice(0, 20),
    errors: (report.errors || []).slice(0, 10)
  };
}
function buildGoogleFeedbackLoop({ gsc, pagespeed, searchIntelligence, contentQuality, cannibalization, intentDifferentiation, angleDifferentiation, internalLinkEquity, conversionIntelligence, croExperiment, leadIntentRouting, leadUrgencyFeedback, intentConversionMonitor }) {
  const actions = [];
  if (!gsc?.configured) {
    actions.push({ priority: "setup", source: "google-search-console", action: "Configurer GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY et GOOGLE_SEARCH_CONSOLE_SITE_URL pour recuperer requetes, pages, CTR et position moyenne." });
  } else if (gsc.error) {
    actions.push({ priority: "fix", source: "google-search-console", action: `Corriger l'acces Search Console: ${gsc.error}` });
  } else {
    for (const cluster of (gsc.query_clusters || []).slice(0, 6)) {
      actions.push({ priority: cluster.opportunity_score >= 60 ? "high" : "medium", source: "google-search-console", cluster: cluster.cluster, action: `Optimiser ${cluster.cluster}: ${cluster.impressions} impressions, CTR ${cluster.ctr}%, position ${cluster.position}. Requetes: ${cluster.sample_queries.join(", ")}.` });
    }
  }

  if (searchIntelligence?.available) {
    const lowConfidence = searchIntelligence.confidence === "low" || String(searchIntelligence.status || "").includes("fallback");
    for (const row of (searchIntelligence.rankings || []).filter((item) => item.measured === true && item.actionable === true && item.data_source === "serpapi" && item.confidence === "measured" && (!item.position || Number(item.position) > 3)).slice(0, 6)) {
      actions.push({
        priority: !row.position ? "high" : "medium",
        source: "search-intelligence",
        url: row.target_url,
        query: row.query,
        action: `${row.query}: ${row.position ? `position ${row.position}` : "absent du top 10"} sur ${row.target_url}. ${row.recommendation} Source ${row.data_source}, confiance ${row.confidence}.`
      });
    }
    if (searchIntelligence.serp_error_count > 0) {
      actions.push({
        priority: searchIntelligence.serp_error_count >= searchIntelligence.keywords_checked ? "fix" : "medium",
        source: "serpapi",
        action: searchIntelligence.rate_limited
          ? `Quota SerpApi atteint apres ${searchIntelligence.serp_request_count || 1} requete(s); ${searchIntelligence.rate_limited_skipped_count || 0} requete(s) reportee(s). Attendre la fenetre de quota ou augmenter le quota avant de relancer search:live.`
          : `Controle SerpApi a corriger: ${searchIntelligence.serp_error_count}/${searchIntelligence.keywords_checked} requetes en erreur, statut ${searchIntelligence.status}. Les positions fallback restent utiles mais ne doivent pas etre traitees comme mesures Google.`
      });
    } else if (!gsc?.configured && searchIntelligence.top3_count > 0) {
      actions.push({ priority: "medium", source: "search-intelligence", action: `Maintenir les ${searchIntelligence.top3_count} requete(s) top 3 detectees et surveiller CTR/conversion avec GSC des que le compte service est configure.` });
    }
    if (lowConfidence && searchIntelligence.priority_queries?.length) {
      actions.push({ priority: "medium", source: "search-intelligence", action: `Priorites provisoires a confirmer par GSC ou SerpApi stable: ${searchIntelligence.priority_queries.slice(0, 6).join(", ")}.` });
    }
  }
  const inspectionRows = Array.isArray(gsc?.url_inspections?.rows) ? gsc.url_inspections.rows : [];
  for (const row of inspectionRows.filter(inspectionNeedsAction).slice(0, 8)) {
    actions.push({
      priority: row.ok ? "high" : "fix",
      source: "url-inspection",
      url: row.url,
      action: `Verifier indexation Google: verdict ${row.verdict || "inconnu"}, couverture ${row.coverage_state || "non renseignee"}, robots ${row.robots_txt_state || "non renseigne"}, fetch ${row.page_fetch_state || row.status || "non renseigne"}.`
    });
  }

  if (gsc?.sitemap_submission && !gsc.sitemap_submission.ok) {
    actions.push({
      priority: "fix",
      source: "sitemap-api",
      url: gsc.sitemap_submission.sitemapUrl,
      action: `Corriger la soumission sitemap Search Console: statut ${gsc.sitemap_submission.status || "inconnu"}.`
    });
  }
  const slowPages = (pagespeed?.rows || []).filter((row) => row.ok && Number(row.performance || 0) < 90).sort((a, b) => Number(a.performance || 0) - Number(b.performance || 0));
  for (const row of slowPages.slice(0, 5)) {
    actions.push({ priority: "medium", source: "pagespeed", url: row.url, action: `Ameliorer performance mobile PageSpeed: ${row.performance}/100, SEO ${row.seo}/100, accessibilite ${row.accessibility}/100.` });
  }

  if (contentQuality?.severe_issue_count > 0) {
    actions.push({ priority: "high", source: "content-quality", action: `${contentQuality.severe_issue_count} probleme(s) editorial(aux) bloquants a corriger avant publication.` });
  } else if (contentQuality?.warning_count > 0) {
    actions.push({ priority: "low", source: "content-quality", action: `${contentQuality.warning_count} avertissement(s) editorial(aux) non bloquants a surveiller: densite, FAQ, conversion ou similarite.` });
  }

  if (cannibalization?.high_risk_count > 0) {
    actions.push({ priority: "high", source: "seo-cannibalization", action: `${cannibalization.high_risk_count} risque(s) fort(s) de cannibalisation SEO a differencier: role de page, titre, maillage et intention primaire.` });
  } else if (cannibalization?.medium_risk_count > 0) {
    actions.push({ priority: "medium", source: "seo-cannibalization", action: `${cannibalization.medium_risk_count} recouvrement(s) moyen(s) a surveiller pour proteger les pages money.` });
  }
  if (intentDifferentiation?.conflicts_addressed > 0) {
    actions.push({ priority: "low", source: "seo-intent-differentiation", action: `${intentDifferentiation.conflicts_addressed} signal(aux) deja recadres par contenu visible et maillage interne; verifier ensuite les titres et angles editoriaux restants.` });
  }
  if (angleDifferentiation?.pages_targeted > 0) {
    actions.push({ priority: angleDifferentiation.noindex_pages ? "medium" : "low", source: "seo-angle-differentiation", action: `${angleDifferentiation.pages_targeted} page(s) recadrees par titres/H1/meta; ${angleDifferentiation.noindex_pages || 0} page(s) consolidee(s) en noindex pour concentrer l'indexation.` });
  }
  if (internalLinkEquity?.pages_targeted > 0) {
    actions.push({ priority: "low", source: "internal-link-equity", action: `${internalLinkEquity.active_internal_links || internalLinkEquity.links_added || 0} lien(s) interne(s) visible(s) actif(s) sur ${internalLinkEquity.pages_with_active_blocks || internalLinkEquity.pages_targeted || 0} page(s) pour orienter vers devis, hubs et pages money sans masquer de texte.` });
  }
  if (croExperiment?.status && croExperiment.status !== "passed") {
    actions.push({ priority: "medium", source: "cro-experiment", action: "Retablir le contrat de test CTA pour mesurer les variantes jusqu au lead." });
  }
  if (leadIntentRouting?.status && leadIntentRouting.status !== "passed") {
    actions.push({ priority: "high", source: "lead-intent-routing", action: "Retablir le pre-remplissage et l attribution des liens SEO ?intent=... jusqu au lead et GA4." });
  }

  if (leadUrgencyFeedback?.status && !["passed", "missing"].includes(leadUrgencyFeedback.status)) {
    actions.push({ priority: "high", source: "lead-urgency-feedback", action: "Retablir les sorties visibles vers devis et rappel prioritaire sur les pages a urgence detectee." });
  }
  if (intentConversionMonitor?.status === "no-data") {
    actions.push({ priority: "setup", source: "intent-conversion-monitor", action: "Laisser tourner la telemetrie locale pour obtenir assez de signaux par intention avant de prioriser les parcours SEO." });
  } else if (intentConversionMonitor?.attention_required) {
    for (const item of (intentConversionMonitor.recommendations || []).slice(0, 5)) {
      actions.push({
        priority: item.severity === "critical" ? "fix" : item.severity || "medium",
        source: "intent-conversion-monitor",
        cluster: item.target,
        action: `${item.target || "intention"}: ${item.signal || item.type}. ${item.action || "Renforcer le parcours devis mesure."}`
      });
    }
  }
  for (const item of (conversionIntelligence?.actions || []).slice(0, 6)) {
    actions.push({
      priority: item.priority || "medium",
      source: "conversion-intelligence",
      url: item.url,
      cluster: item.cluster,
      action: `${item.cluster || "money-page"}: score conversion ${item.score || 0}/100. ${item.action || "Renforcer le passage vers devis qualifie."}`
    });
  }
  return {
    status: actions.some((item) => item.priority === "high" || item.priority === "fix") ? "action-required" : "monitoring",
    actions: actions.slice(0, 20),
    principles: ["measure-with-gsc", "improve-by-query-cluster", "protect-page-experience", "people-first-content", "measure-lead-quality"]
  };
}
function buildGoogleApiHealth({ gsc, pagespeed, searchIntelligence }) {
  const inspections = Array.isArray(gsc?.url_inspections?.rows) ? gsc.url_inspections.rows : [];
  const slowPages = (pagespeed?.rows || []).filter((row) => row.ok && Number(row.performance || 0) < 90);
  const searchErrors = Number(searchIntelligence?.serp_error_count || 0);
  return {
    search_console_configured: Boolean(gsc?.configured),
    search_console_rows: Number(gsc?.rows_imported || 0),
    search_console_opportunities: Array.isArray(gsc?.opportunities) ? gsc.opportunities.length : 0,
    query_clusters: Array.isArray(gsc?.query_clusters) ? gsc.query_clusters.length : 0,
    url_inspection_checked: Number(gsc?.url_inspections?.checked || inspections.length || 0),
    url_inspection_needs_action: Number(gsc?.url_inspections?.needs_action || inspections.filter(inspectionNeedsAction).length || 0),
    sitemap_submitted: Boolean(gsc?.sitemap_submission?.ok),
    sitemap_status: Number(gsc?.sitemap_submission?.status || 0),
    pagespeed_checked: Number(pagespeed?.checked || 0),
    pagespeed_slow_pages: slowPages.length,
    search_intelligence_status: searchIntelligence?.status || "missing",
    search_intelligence_provider: searchIntelligence?.provider || "unknown",
    search_intelligence_confidence: searchIntelligence?.confidence || "unknown",
    serp_keywords_checked: Number(searchIntelligence?.keywords_checked || 0),
    serp_measured_count: Number(searchIntelligence?.measured_count || 0),
    serp_fallback_count: Number(searchIntelligence?.fallback_count || 0),
    serp_missing_count: Number(searchIntelligence?.missing_count || 0),
    serp_error_count: searchErrors,
    serp_rate_limited: searchIntelligence?.rate_limited === true,
    serp_request_count: Number(searchIntelligence?.serp_request_count || 0),
    status: gsc?.error || slowPages.length || inspections.filter(inspectionNeedsAction).length || (searchIntelligence?.serp_enabled && searchErrors) ? "action-required" : "monitoring"
  };
}
function buildMarkdown(report) {
  const topIssues = report.opportunities.slice(0, 12).map((item, index) => `${index + 1}. ${item.type} - ${item.url || item.page || "global"} - score ${item.score || item.page_score || 0}: ${item.recommendation}`).join("\n");
  return `# SEO Autopilot ImmeubleAssur\n\nGenerated: ${report.generated_at}\n\n- Pages checked: ${report.pages_checked}\n- Average score: ${report.average_score}\n- Opportunities: ${report.opportunities.length}\n- GSC configured: ${Boolean(report.gsc?.configured)}\n- PageSpeed checked: ${report.pagespeed?.checked || 0}\n- Auto-fixes applied: ${report.auto_fix?.fixes_applied || 0}\n- Pages expanded: ${report.opportunity_expansion?.pages_expanded || 0}\n- Content quality: ${report.content_quality?.status || "unknown"} (${report.content_quality?.warning_count || 0} warnings)\n- Intent differentiation: ${report.intent_differentiation?.conflicts_addressed || 0} conflicts addressed\n- Angle differentiation: ${report.angle_differentiation?.pages_targeted || 0} pages, ${report.angle_differentiation?.noindex_pages || 0} noindex\n- Internal link equity: ${report.internal_link_equity?.active_internal_links || report.internal_link_equity?.links_added || 0} links on ${report.internal_link_equity?.pages_with_active_blocks || report.internal_link_equity?.pages_targeted || 0} pages\n- Cluster conversion bridges: ${report.cluster_conversion_bridge?.active_bridges || 0} active on ${report.cluster_conversion_bridge?.pages_targeted || 0} targeted pages
- Editorial cluster rescue: ${report.editorial_cluster_rescue?.active_rescues || 0} active on ${report.editorial_cluster_rescue?.pages_targeted || 0} targeted pages\n- Conversion intelligence: ${report.conversion_intelligence?.average_money_score || 0}/100 money score, ${report.conversion_intelligence?.cluster_count || 0} clusters\n- CRO experiment: ${report.cro_experiment?.status || "unknown"} (${report.cro_experiment?.variant_count || 0} variants)
- Lead friction: ${report.lead_friction?.action_count || 0} actions (${report.lead_friction?.verified_count || 0} verified)\n- Lead intent routing: ${report.lead_intent_routing?.status || "unknown"} (${report.lead_intent_routing?.active_bridges || 0} bridges)\n- Lead urgency feedback: ${report.lead_urgency_feedback?.status || "unknown"} (${report.lead_urgency_feedback?.urgent_pages || 0} urgent pages, ${report.lead_urgency_feedback?.missing_cta_count || 0} missing CTA)\n- Intent conversion monitor: ${report.intent_conversion_monitor?.status || "unknown"} (${report.intent_conversion_monitor?.summary?.intents_with_leads || 0}/${report.intent_conversion_monitor?.summary?.intent_count || 0} intents with leads)\n- Search intelligence: ${report.search_intelligence?.status || "unknown"} (${report.search_intelligence?.top3_count || 0} top 3, ${report.search_intelligence?.missing_count || 0} absentes, confiance ${report.search_intelligence?.confidence || "unknown"})\n- Google feedback actions: ${report.google_feedback_loop?.actions?.length || 0}\n- URL inspections: ${report.google_api_health?.url_inspection_checked || 0} checked, ${report.google_api_health?.url_inspection_needs_action || 0} to review\n- Sitemap API: ${report.google_api_health?.sitemap_submitted ? "submitted" : "not submitted"}\n\n## Top actions\n\n${topIssues || "No blocking issue detected."}\n`;
}

async function run() {
  mkdirSync(REPORT_DIR, { recursive: true });
  mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });
  const pages = walk(PUBLIC_DIR).map(auditPage).filter((page) => page.slug !== "admin");
  const indexablePages = pages.filter((page) => !page.noindex);
  const issueOpportunities = indexablePages.flatMap((page) => page.issues.map((issue, index) => ({ id: `${page.slug}-${index + 1}`, type: issue.type, url: page.url, page_score: page.score, severity: issue.severity, score: issue.severity === "high" ? 85 : issue.severity === "medium" ? 60 : 35, recommendation: issue.recommendation, message: issue.message })));
  const contentGaps = detectIntentGaps(pages);
  const sampleUrls = [SITE + "/", `${SITE}/assurance-immeuble`, `${SITE}/assurance-copropriete`, `${SITE}/assurance-cno`, `${SITE}/assurance-pno-cno`, `${SITE}/devis-pno-cno`, `${SITE}/devis-assurance-immeuble`, `${SITE}/recherches-assurance-immeuble`, `${SITE}/courtier-assurance-immeuble`, `${SITE}/tarif-assurance-immeuble`, `${SITE}/blog`, `${SITE}/villes`];
  let gsc = { configured: false, skipped: "not run" };
  let pagespeed = { skipped: "not run" };
  try { gsc = await fetchGscData(); } catch (error) { gsc = { configured: true, error: error.message }; }
  try { pagespeed = await fetchPageSpeed(sampleUrls); } catch (error) { pagespeed = { error: error.message }; }
  const gscOpps = Array.isArray(gsc.opportunities) ? gsc.opportunities : [];
  const autoFix = readAutoFixReport();
  const opportunityExpansion = readOpportunityExpansionReport();
  const contentQuality = readContentQualityReport();
  const cannibalization = readCannibalizationReport();
  const intentDifferentiation = readIntentDifferentiationReport();
  const angleDifferentiation = readAngleDifferentiationReport();
  const internalLinkEquity = readInternalLinkEquityReport();
  const clusterConversionBridge = readClusterConversionBridgeReport();
  const editorialClusterRescue = readEditorialClusterRescueReport();
  const conversionIntelligence = readConversionIntelligenceReport();
  const croExperiment = readCroExperimentReport();
  const leadFriction = readLeadFrictionReport();
  const leadIntentRouting = readLeadIntentRoutingReport();
  const leadUrgencyFeedback = readLeadUrgencyFeedbackReport();
  const intentConversionMonitor = readIntentConversionMonitorReport();
  const searchIntelligence = readSearchIntelligenceReport();
  const googleFeedbackLoop = buildGoogleFeedbackLoop({ gsc, pagespeed, searchIntelligence, contentQuality, cannibalization, intentDifferentiation, angleDifferentiation, internalLinkEquity, conversionIntelligence, croExperiment, leadIntentRouting, leadUrgencyFeedback, intentConversionMonitor });
  const googleApiHealth = buildGoogleApiHealth({ gsc, pagespeed, searchIntelligence });
  const opportunities = [...issueOpportunities, ...contentGaps, ...gscOpps].sort((a, b) => (b.score || 0) - (a.score || 0));
  const report = { generated_at: new Date().toISOString(), mode: localOnly ? "local-only" : "api", pages_checked: pages.length, indexable_pages_checked: indexablePages.length, noindex_pages_skipped: pages.length - indexablePages.length, average_score: Math.round(indexablePages.reduce((sum, page) => sum + page.score, 0) / Math.max(1, indexablePages.length)), weak_pages: indexablePages.filter((page) => page.score < 80).sort((a, b) => a.score - b.score).slice(0, 25), opportunities, gsc, pagespeed, auto_fix: autoFix, opportunity_expansion: opportunityExpansion, content_quality: contentQuality, cannibalization, intent_differentiation: intentDifferentiation, angle_differentiation: angleDifferentiation, internal_link_equity: internalLinkEquity, cluster_conversion_bridge: clusterConversionBridge, editorial_cluster_rescue: editorialClusterRescue, conversion_intelligence: conversionIntelligence, cro_experiment: croExperiment, lead_friction: leadFriction, lead_intent_routing: leadIntentRouting, lead_urgency_feedback: leadUrgencyFeedback, intent_conversion_monitor: intentConversionMonitor, search_intelligence: searchIntelligence, google_feedback_loop: googleFeedbackLoop, google_api_health: googleApiHealth, api_connectors: { google_search_console: "GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY + GOOGLE_SEARCH_CONSOLE_SITE_URL", pagespeed_insights: "PAGESPEED_API_KEY optional", serpapi_positions: "SERP_API_KEY via scripts/search-intelligence.js --serp", url_inspection: "GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY + GOOGLE_SEARCH_CONSOLE_SITE_URL + --url-inspection", sitemaps_api: "GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY + GOOGLE_SEARCH_CONSOLE_SITE_URL + --submit-sitemap", ga4_measurement_protocol: "GA4_MEASUREMENT_ID + GA4_API_SECRET cote serveur local; GA4_MEASUREMENT_ID au build pour le client gtag", indexing_api: "not used: reserved by Google for JobPosting/BroadcastEvent URLs" }, compliance: ["no automated Google SERP scraping", "no scaled duplicate doorway pages", "content factory uses quality gate and user-intent pages", "Search Console average position is the source for Google ranking signals",
    "SerpApi ranking feedback is labelled measured, mixed or fallback before use", "no AI-detection evasion content", "GA4 server-side generate_lead event when configured", "cannibalization watchlist protects primary search intents", "visible intent differentiation avoids hidden keyword stuffing", "angle differentiation uses visible content and noindex consolidation for duplicates", "internal link equity uses visible contextual links only", "cluster conversion bridges use visible CTAs only", "editorial_cluster_rescue uses visible first-party CTA blocks only", "lead intent routing keeps visible SEO CTAs measurable through form, API and GA4", "lead urgency feedback keeps urgent pages routed to visible quote paths", "intent conversion monitor uses first-party local SQLite events only"] };
  mkdirSync(dirname(SEO_AUTOPILOT_REPORT), { recursive: true });
  mkdirSync(dirname(SEO_AUTOPILOT_MARKDOWN), { recursive: true });
  mkdirSync(dirname(SEO_AUTOPILOT_PUBLIC_REPORT), { recursive: true });
  writeFileSync(SEO_AUTOPILOT_REPORT, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(SEO_AUTOPILOT_MARKDOWN, buildMarkdown(report), "utf8");
  const publicReport = { generated_at: report.generated_at, pages_checked: report.pages_checked, indexable_pages_checked: report.indexable_pages_checked, noindex_pages_skipped: report.noindex_pages_skipped, average_score: report.average_score, opportunities_count: report.opportunities.length, weak_pages: report.weak_pages.slice(0, 10), top_opportunities: report.opportunities.slice(0, 20), auto_fix: report.auto_fix, opportunity_expansion: report.opportunity_expansion, content_quality: report.content_quality, cannibalization: report.cannibalization, intent_differentiation: report.intent_differentiation, angle_differentiation: report.angle_differentiation, internal_link_equity: report.internal_link_equity, cluster_conversion_bridge: report.cluster_conversion_bridge, editorial_cluster_rescue: report.editorial_cluster_rescue, conversion_intelligence: report.conversion_intelligence, cro_experiment: report.cro_experiment, lead_friction: report.lead_friction, lead_intent_routing: report.lead_intent_routing, lead_urgency_feedback: report.lead_urgency_feedback, intent_conversion_monitor: report.intent_conversion_monitor, search_intelligence: report.search_intelligence, google_feedback_loop: report.google_feedback_loop, google_api_health: report.google_api_health, connectors: report.api_connectors, compliance: report.compliance };
  writeFileSync(SEO_AUTOPILOT_PUBLIC_REPORT, JSON.stringify(publicReport, null, 2), "utf8");
  console.log(`SEO autopilot checked ${report.pages_checked} pages, average score ${report.average_score}, opportunities ${report.opportunities.length}.`);
}

run();
