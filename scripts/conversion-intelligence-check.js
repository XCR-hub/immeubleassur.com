import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_PATH = resolve(process.env.LOCAL_CONVERSION_INTELLIGENCE_REPORT || join("reports", "conversion-intelligence-report.json"));
const PUBLIC_REPORT_PATH = resolve(process.env.LOCAL_CONVERSION_INTELLIGENCE_PUBLIC_REPORT || join("public", "assets", "conversion-intelligence-latest.json"));
const SITE = "https://immeubleassur.com";

const nonLocalImmeubleSlugs = new Set([
  "assurance-immeuble-de-rapport",
  "assurance-immeuble-locatif",
  "assurance-immeuble-meuble-colocation",
  "assurance-immeuble-monopropriete",
  "assurance-immeuble-obligatoire",
  "assurance-immeuble-resilie",
  "assurance-immeuble-sinistre",
  "assurance-immeuble-syndic-benevole"
]);

const explicitSlugRules = [
  ["newsletter-veille", /^(newsletter-assurance-immeuble|veille-assurance-immeuble|news\/)/],
  ["pno-cno", /^(assurance-(pno|cno|pno-cno|coproprietaire-non-occupant)|devis-pno-cno|pno-cno|faq\/pno|blog\/.*(pno|cno|non-occupant|lot-vacant))/],
  ["devis-courtier", /^(devis-assurance-immeuble|devis-assurance-immeuble-en-ligne|courtier-assurance-immeuble|comparateur-assurance-immeuble|audit-contrat-assurance-immeuble|checklist-documents-assurance-immeuble|recherches-assurance-immeuble|blog\/checklist-documents-devis-immeuble)/],
  ["prix-tarif", /^(prix-assurance-immeuble|tarif-assurance-immeuble|faq\/prix|blog\/.*(prix|franchise|tarif|pertes-de-loyers))/],
  ["local-commercial", /^(assurance-local-commercial|faq\/local-commercial|blog\/.*(commerce|commercial|restaurant|local-professionnel|mixte))/],
  ["copropriete-syndic", /^(assurance-copropriete|assurance-parties-communes|rc-syndic|guide-assurance-copropriete|faq\/copropriete|blog\/.*(copropriete|syndic|protection-juridique|parking-garages))/],
  ["sinistre-resilie", /^(gestion-sinistres-immeuble|assurance-immeuble-resilie|assurance-immeuble-sinistre|faq\/sinistres|blog\/.*(sinistre|degat|fuite|infiltration|resiliation|refus))/],
  ["travaux", /^(dommages-ouvrage-immeuble|faq\/travaux|blog\/.*(travaux|dommages-ouvrage|renovation|ravalement|toiture))/],
  ["sci-bailleur", /^(assurance-sci|assurance-immeuble-de-rapport|assurance-immeuble-monopropriete|assurance-immeuble-locatif|assurance-immeuble-meuble-colocation|faq\/sci|blog\/.*(sci|locatif|bailleur|colocation|patrimoine|vacant))/],
  ["local", /^(villes|assurance-immeuble-[a-z-]+)$/]
];

const signalRules = [
  ["devis-courtier", /devis|courtier|comparateur|audit contrat|dossier assureur/],
  ["prix-tarif", /prix|tarif|cout|combien|prime annuelle/],
  ["local-commercial", /commerce|commercial|restaurant|local professionnel|immeuble mixte/],
  ["sinistre-resilie", /sinistre|resilie|resiliation|refus assureur|degat|fuite|incendie|infiltration/],
  ["travaux", /travaux|dommages ouvrage|renovation|ravalement|toiture|chantier/],
  ["copropriete-syndic", /copropriete|syndic|parties communes|assemblee generale|conseil syndical/],
  ["sci-bailleur", /sci|bailleur|immeuble de rapport|monopropriete|locatif|patrimoine|colocation/],
  ["pno-cno", /pno|cno|non[-\s]?occupant|proprietaire non occupant|coproprietaire non occupant/],
  ["newsletter-veille", /newsletter|veille|actualites|signaux marche/]
];

const moneySlugs = new Set([
  "assurance-immeuble",
  "devis-assurance-immeuble",
  "devis-assurance-immeuble-en-ligne",
  "devis-pno-cno",
  "assurance-pno-cno",
  "assurance-cno",
  "assurance-pno",
  "assurance-copropriete",
  "courtier-assurance-immeuble",
  "comparateur-assurance-immeuble",
  "prix-assurance-immeuble",
  "tarif-assurance-immeuble",
  "assurance-immeuble-de-rapport",
  "assurance-immeuble-monopropriete",
  "assurance-immeuble-resilie",
  "assurance-immeuble-sinistre"
]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(file) === ".html" ? [file] : [];
  });
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugFromFile(file) {
  const rel = relative(PUBLIC_DIR, file).replace(/\\/g, "/");
  if (rel === "index.html") return "index";
  return rel.replace(/\.html$/, "");
}

function meta(html, pattern) {
  return ((html.match(pattern) || [])[1] || "").trim();
}

function firstH1(html) {
  return stripHtml((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
}

function pageUrl(slug) {
  return slug === "index" ? `${SITE}/` : `${SITE}/${slug}`;
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeSignal(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isCitySlug(slug) {
  return /^assurance-immeuble-[a-z-]+$/.test(slug) && !nonLocalImmeubleSlugs.has(slug);
}

function detectCluster({ slug, title, description, h1 }) {
  const normalizedSlug = normalizeSignal(slug);
  if (isCitySlug(normalizedSlug)) return "local";
  const explicit = explicitSlugRules.find(([, pattern]) => pattern.test(normalizedSlug));
  if (explicit) return explicit[0];
  const source = normalizeSignal(`${slug} ${title} ${h1}`);
  return (signalRules.find(([, pattern]) => pattern.test(source)) || ["assurance-immeuble"])[0];
}

function internalLinks(html) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"/gi)]
    .map((match) => match[1])
    .filter((href) => href.startsWith("/") && !href.startsWith("//"));
}

function scorePage(page) {
  let score = 10;
  const actions = [];
  const moneyIntent = moneySlugs.has(page.slug) || page.slug.startsWith("assurance-immeuble-") || /devis|prix|tarif|courtier|pno|cno|sinistre|resilie/i.test(page.slug);

  if (moneyIntent) score += 15;
  if (page.has_lead_form) score += 24; else if (moneyIntent) actions.push("Ajouter un formulaire ou un CTA direct vers devis.");
  if (page.primary_cta_count >= 2) score += 12; else if (moneyIntent) actions.push("Ajouter un deuxieme CTA contextuel avant la fin de page.");
  if (page.has_diagnostic) score += 12; else if (moneyIntent) actions.push("Ajouter le diagnostic express pour qualifier l'intention.");
  if (page.has_readiness) score += 12; else if (moneyIntent) actions.push("Ajouter le module dossier pret assureur.");
  if (page.has_momentum) score += 10; else if (moneyIntent) actions.push("Ajouter un bloc priorite business PNO/CNO/immeuble.");
  if (page.faq_count >= 3) score += 8; else if (moneyIntent) actions.push("Renforcer la FAQ visible avec questions de decision.");
  if (page.words >= 750) score += 7; else if (moneyIntent) actions.push("Renforcer la profondeur utile sans duplication.");
  if (page.money_links >= 4) score += 7; else if (moneyIntent) actions.push("Renforcer le maillage vers devis, PNO/CNO, prix et audit.");
  if (page.title.length >= 35 && page.title.length <= 72) score += 4;
  if (page.description.length >= 110 && page.description.length <= 170) score += 4;

  return {
    ...page,
    money_intent: moneyIntent,
    conversion_score: Math.min(100, score),
    recommended_actions: actions.slice(0, 4)
  };
}

function auditPage(file) {
  const html = readFileSync(file, "utf8");
  const slug = slugFromFile(file);
  const text = stripHtml(html);
  const title = stripHtml(meta(html, /<title>(.*?)<\/title>/is));
  const description = meta(html, /<meta name="description" content="([^"]*)"/i);
  const h1 = firstH1(html);
  const links = internalLinks(html);
  const moneyLinks = links.filter((href) => /devis|pno|cno|prix|tarif|courtier|assurance-immeuble|comparateur|audit/.test(href)).length;
  return scorePage({
    slug,
    url: pageUrl(slug),
    title,
    description,
    words: wordCount(text),
    cluster: detectCluster({ slug, title, description, h1 }),
    has_lead_form: html.includes('id="lead-form"'),
    has_diagnostic: html.includes("data-diagnostic"),
    has_readiness: html.includes("data-readiness"),
    has_momentum: html.includes("conversion-momentum"),
    primary_cta_count: (html.match(/class="[^"]*\bbutton primary\b/gi) || []).length + (html.match(/class="[^"]*\bsubmit-button\b/gi) || []).length,
    faq_count: (html.match(/<details\b/gi) || []).length,
    internal_link_count: links.length,
    money_links: moneyLinks
  });
}

function clusterCoverage(pages) {
  const map = new Map();
  for (const page of pages) {
    const bucket = map.get(page.cluster) || { cluster: page.cluster, pages: 0, money_pages: 0, average_score: 0, top_pages: [] };
    bucket.pages += 1;
    if (page.money_intent) bucket.money_pages += 1;
    bucket.average_score += page.conversion_score;
    bucket.top_pages.push({ slug: page.slug, url: page.url, score: page.conversion_score });
    map.set(page.cluster, bucket);
  }
  return [...map.values()].map((bucket) => ({
    ...bucket,
    average_score: Math.round(bucket.average_score / Math.max(1, bucket.pages)),
    top_pages: bucket.top_pages.sort((a, b) => b.score - a.score).slice(0, 6)
  })).sort((a, b) => b.money_pages - a.money_pages || b.average_score - a.average_score);
}

function actionPriority(page) {
  if (page.conversion_score < 65 && page.money_intent) return "high";
  if (page.conversion_score < 82 && page.money_intent) return "medium";
  return "low";
}

const ignored = new Set(["admin", "mentions-legales", "confidentialite", "merci"]);
const pages = walk(PUBLIC_DIR).map(auditPage).filter((page) => !ignored.has(page.slug));
const moneyPages = pages.filter((page) => page.money_intent);
const clusters = clusterCoverage(pages);
const weakMoneyPages = moneyPages.filter((page) => page.conversion_score < 82).sort((a, b) => a.conversion_score - b.conversion_score);
const actions = weakMoneyPages.slice(0, 30).map((page) => ({
  priority: actionPriority(page),
  source: "conversion-intelligence",
  url: page.url,
  cluster: page.cluster,
  score: page.conversion_score,
  action: page.recommended_actions[0] || "Surveiller le passage vers formulaire et lead qualifie."
}));

const report = {
  generated_at: new Date().toISOString(),
  pages_checked: pages.length,
  money_pages_checked: moneyPages.length,
  cluster_count: clusters.length,
  cluster_detection: {
    strategy: "slug-title-description-h1",
    safeguards: ["ignores-global-cta-copy", "city-slugs-before-thematic-rules", "no-hidden-content", "no-google-scraping"]
  },
  average_conversion_score: Math.round(pages.reduce((sum, page) => sum + page.conversion_score, 0) / Math.max(1, pages.length)),
  average_money_score: Math.round(moneyPages.reduce((sum, page) => sum + page.conversion_score, 0) / Math.max(1, moneyPages.length)),
  cluster_coverage: clusters,
  top_money_pages: moneyPages.sort((a, b) => b.conversion_score - a.conversion_score).slice(0, 25).map((page) => ({ slug: page.slug, url: page.url, cluster: page.cluster, score: page.conversion_score })),
  weak_money_pages: weakMoneyPages.slice(0, 40).map((page) => ({ slug: page.slug, url: page.url, cluster: page.cluster, score: page.conversion_score, actions: page.recommended_actions })),
  actions,
  safeguards: ["conversion-score-does-not-replace-lead-quality", "money-pages-need-clear-user-intent", "no-hidden-cta-or-hidden-seo-text", "prioritize-measured-leads-over-raw-traffic"]
};

mkdirSync(dirname(REPORT_PATH), { recursive: true });
mkdirSync(dirname(PUBLIC_REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
writeFileSync(PUBLIC_REPORT_PATH, JSON.stringify({
  generated_at: report.generated_at,
  pages_checked: report.pages_checked,
  money_pages_checked: report.money_pages_checked,
  cluster_count: report.cluster_count,
  cluster_detection: report.cluster_detection,
  average_conversion_score: report.average_conversion_score,
  average_money_score: report.average_money_score,
  cluster_coverage: report.cluster_coverage,
  top_money_pages: report.top_money_pages.slice(0, 12),
  weak_money_pages: report.weak_money_pages.slice(0, 12),
  actions: report.actions.slice(0, 20),
  safeguards: report.safeguards
}, null, 2), "utf8");

if (moneyPages.length < 15 || report.average_money_score < 70) {
  console.error(`Conversion intelligence failed: ${moneyPages.length} money pages, average money score ${report.average_money_score}.`);
  process.exit(1);
}

console.log(`Conversion intelligence checked ${pages.length} pages, ${moneyPages.length} money pages, average money score ${report.average_money_score}.`);
