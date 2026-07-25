import { createSign } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const SITE = "https://immeubleassur.com";
const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
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
  ["assurance immeuble syndic benevole", "assurance-immeuble-syndic-benevole"]
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
  const canonical = readMeta(html, /<link rel="canonical" href="([^"]*)"/i);
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
  if (jsonLd < 2 && slug !== "admin") add("medium", "schema", `${jsonLd} blocs JSON-LD`, "Verifier BreadcrumbList, WebPage/Article, FAQ ou Service selon la page.");
  if (!hasLeadForm && !hasCta && slug !== "admin" && !nonCommercialSlugs.has(slug)) add("medium", "conversion", "CTA faible ou absent", "Ajouter une action claire vers devis, audit ou contact.");

  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === "high" ? 18 : issue.severity === "medium" ? 10 : 5), 0);
  return { slug: slug || "index", url: pageUrl(slug), title, description, words, h1, h2, details, jsonLd, hasLeadForm, issues, score: Math.max(0, 100 - penalty) };
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
    const inspectionUrl = `${SITE}/`;
    const inspect = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { method: "POST", headers, body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: "fr-FR" }) });
    result.url_inspection = { url: inspectionUrl, ok: inspect.ok, status: inspect.status, data: inspect.ok ? await inspect.json() : await inspect.text() };
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

function buildGoogleFeedbackLoop({ gsc, pagespeed, contentQuality }) {
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

  const slowPages = (pagespeed?.rows || []).filter((row) => row.ok && Number(row.performance || 0) < 90).sort((a, b) => Number(a.performance || 0) - Number(b.performance || 0));
  for (const row of slowPages.slice(0, 5)) {
    actions.push({ priority: "medium", source: "pagespeed", url: row.url, action: `Ameliorer performance mobile PageSpeed: ${row.performance}/100, SEO ${row.seo}/100, accessibilite ${row.accessibility}/100.` });
  }

  if (contentQuality?.severe_issue_count > 0) {
    actions.push({ priority: "high", source: "content-quality", action: `${contentQuality.severe_issue_count} probleme(s) editorial(aux) bloquants a corriger avant publication.` });
  } else if (contentQuality?.warning_count > 0) {
    actions.push({ priority: "low", source: "content-quality", action: `${contentQuality.warning_count} avertissement(s) editorial(aux) non bloquants a surveiller: densite, FAQ, conversion ou similarite.` });
  }

  return {
    status: actions.some((item) => item.priority === "high" || item.priority === "fix") ? "action-required" : "monitoring",
    actions: actions.slice(0, 20),
    principles: ["measure-with-gsc", "improve-by-query-cluster", "protect-page-experience", "people-first-content", "measure-lead-quality"]
  };
}
function buildMarkdown(report) {
  const topIssues = report.opportunities.slice(0, 12).map((item, index) => `${index + 1}. ${item.type} - ${item.url || item.page || "global"} - score ${item.score || item.page_score || 0}: ${item.recommendation}`).join("\n");
  return `# SEO Autopilot ImmeubleAssur\n\nGenerated: ${report.generated_at}\n\n- Pages checked: ${report.pages_checked}\n- Average score: ${report.average_score}\n- Opportunities: ${report.opportunities.length}\n- GSC configured: ${Boolean(report.gsc?.configured)}\n- PageSpeed checked: ${report.pagespeed?.checked || 0}\n- Auto-fixes applied: ${report.auto_fix?.fixes_applied || 0}\n- Pages expanded: ${report.opportunity_expansion?.pages_expanded || 0}\n- Content quality: ${report.content_quality?.status || "unknown"} (${report.content_quality?.warning_count || 0} warnings)\n- Google feedback actions: ${report.google_feedback_loop?.actions?.length || 0}\n\n## Top actions\n\n${topIssues || "No blocking issue detected."}\n`;
}

async function run() {
  mkdirSync(REPORT_DIR, { recursive: true });
  mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });
  const pages = walk(PUBLIC_DIR).map(auditPage).filter((page) => page.slug !== "admin");
  const issueOpportunities = pages.flatMap((page) => page.issues.map((issue, index) => ({ id: `${page.slug}-${index + 1}`, type: issue.type, url: page.url, page_score: page.score, severity: issue.severity, score: issue.severity === "high" ? 85 : issue.severity === "medium" ? 60 : 35, recommendation: issue.recommendation, message: issue.message })));
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
  const googleFeedbackLoop = buildGoogleFeedbackLoop({ gsc, pagespeed, contentQuality });
  const opportunities = [...issueOpportunities, ...contentGaps, ...gscOpps].sort((a, b) => (b.score || 0) - (a.score || 0));
  const report = { generated_at: new Date().toISOString(), mode: localOnly ? "local-only" : "api", pages_checked: pages.length, average_score: Math.round(pages.reduce((sum, page) => sum + page.score, 0) / pages.length), weak_pages: pages.filter((page) => page.score < 80).sort((a, b) => a.score - b.score).slice(0, 25), opportunities, gsc, pagespeed, auto_fix: autoFix, opportunity_expansion: opportunityExpansion, content_quality: contentQuality, google_feedback_loop: googleFeedbackLoop, api_connectors: { google_search_console: "GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY + GOOGLE_SEARCH_CONSOLE_SITE_URL", pagespeed_insights: "PAGESPEED_API_KEY optional", ga4_measurement_protocol: "GA4_MEASUREMENT_ID + GA4_API_SECRET in Cloudflare Pages; GA4_MEASUREMENT_ID at build time for gtag client id", indexing_api: "not used: reserved by Google for JobPosting/BroadcastEvent URLs" }, compliance: ["no automated Google SERP scraping", "no scaled duplicate doorway pages", "content factory uses quality gate and user-intent pages", "Search Console average position is the source for Google ranking signals", "no AI-detection evasion content", "GA4 server-side generate_lead event when configured"] };
  writeFileSync(join(REPORT_DIR, "seo-autopilot-report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(REPORT_DIR, "seo-autopilot-report.md"), buildMarkdown(report), "utf8");
  const publicReport = { generated_at: report.generated_at, pages_checked: report.pages_checked, average_score: report.average_score, opportunities_count: report.opportunities.length, weak_pages: report.weak_pages.slice(0, 10), top_opportunities: report.opportunities.slice(0, 20), auto_fix: report.auto_fix, opportunity_expansion: report.opportunity_expansion, content_quality: report.content_quality, google_feedback_loop: report.google_feedback_loop, connectors: report.api_connectors, compliance: report.compliance };
  writeFileSync(join(PUBLIC_DIR, "assets", "seo-autopilot-latest.json"), JSON.stringify(publicReport, null, 2), "utf8");
  console.log(`SEO autopilot checked ${report.pages_checked} pages, average score ${report.average_score}, opportunities ${report.opportunities.length}.`);
}

run();
