import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const SITE = "https://immeubleassur.com";
const duplicateAliasSlugs = new Set(["blog/index", "faq/index"]);
const utilitySlugs = new Set(["mentions-legales", "confidentialite", "merci"]);
const stopwords = new Set("assurance immeuble immeubles pour avec dans des les une aux votre vous nous plus sur par qui est sont cette entre sans devis prix garanties contrat contrats copropriete pno cno sci syndic bailleur proprietaire proprietaires".split(" "));
const bannedManipulation = [
  /contenu\s+non\s+identifiable/i,
  /texte\s+ia\s+indetectable/i,
  /contourner\s+google/i,
  /tromper\s+google/i,
  /bourrage\s+de\s+mots.?cles/i,
  /hidden\s+keywords/i,
  /keyword\s+stuffing/i
];
const bannedInternalEditorialLanguage = [
  /page\s+seo\s+artificielle/i,
  /gagner\s+un\s+lead\s+qualifie/i,
  /gain\s+de\s+lead/i,
  /pourquoi\s+cette\s+page\s+cible/i,
  /angle\s+seo\s+protege/i,
  /page\s+renforcee\s+automatiquement/i,
  /objectif\s+leads\s+qualifies/i,
  /questions\s+qui\s+convertissent/i,
  /parcours\s+a\s+renforcer/i,
  /intention\s+de\s+recherche/i,
  /requetes\s+proches\s+traitees/i,
  /recherche\s+google\s+au\s+lead\s+qualifie/i,
  /page\s+mot.?cle/i,
  /parcours\s+commercial/i,
  /urgence\s+commerciale/i
];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(file) === ".html" ? [file] : [];
  });
}

function slugFromFile(file) {
  const rel = relative(PUBLIC_DIR, file).replace(/\\/g, "/");
  if (rel === "index.html") return "index";
  return rel.replace(/\.html$/, "");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html, pattern) {
  return ((html.match(pattern) || [])[1] || "").trim();
}

function canonical(slug) {
  return slug === "index" ? `${SITE}/` : `${SITE}/${slug}`;
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function topKeywordDensity(text) {
  const words = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{5,}/g) || [];
  const counts = new Map();
  for (const word of words) {
    if (stopwords.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || ["", 0];
  return { keyword: top[0], count: top[1], density: words.length ? top[1] / words.length : 0 };
}

function paragraphs(html) {
  return [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((text) => text.length >= 140);
}

function paragraphFingerprint(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 220);
}

function auditPage(file) {
  const html = readFileSync(file, "utf8");
  const slug = slugFromFile(file);
  const text = stripHtml(html);
  const words = wordCount(text);
  const title = stripHtml(meta(html, /<title>(.*?)<\/title>/is));
  const description = meta(html, /<meta name="description" content="([^"]*)"/i);
  const noIndex = /<meta name="robots" content="[^"]*noindex/i.test(html);
  const canonicalUrl = meta(html, /<link rel="canonical" href="([^"]*)"/i);
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const detailsCount = (html.match(/<details\b/gi) || []).length;
  const form = html.includes('id="lead-form"');
  const density = topKeywordDensity(text);
  const issues = [];
  const warnings = [];

  if (slug !== "admin" && !noIndex && !duplicateAliasSlugs.has(slug)) {
    if (bannedManipulation.some((pattern) => pattern.test(text))) issues.push("manipulation-language");
    if (bannedInternalEditorialLanguage.some((pattern) => pattern.test(text))) issues.push("internal-editorial-language");
    if (/display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0/i.test(html) && /assurance|devis|immeuble/i.test(html)) warnings.push("possible-hidden-seo-text");
    if (canonicalUrl !== canonical(slug)) issues.push("canonical-mismatch");
    if (h1Count !== 1) issues.push("h1-count");
    if (words < 380 && !utilitySlugs.has(slug)) warnings.push("thin-content-risk");
    if (density.density > 0.095 && density.count >= 18) warnings.push(`keyword-density-${density.keyword}`);
    if (!form && !html.includes('class="button primary"') && !utilitySlugs.has(slug)) warnings.push("weak-conversion-path");
    if (!utilitySlugs.has(slug) && detailsCount === 0 && /assurance|devis|prix|courtier|pno|cno/i.test(title)) warnings.push("no-visible-faq");
  }

  return { slug, url: canonical(slug), title, description, noindex: noIndex, words, h1_count: h1Count, faq_count: detailsCount, has_lead_form: form, top_keyword: density, issues, warnings, paragraphs: paragraphs(html).map(paragraphFingerprint) };
}

const pages = walk(PUBLIC_DIR).map(auditPage);
const titleMap = new Map();
const descriptionMap = new Map();
const paragraphMap = new Map();
for (const page of pages.filter((page) => page.slug !== "admin" && !page.noindex && !duplicateAliasSlugs.has(page.slug))) {
  if (page.title) titleMap.set(page.title, [...(titleMap.get(page.title) || []), page.slug]);
  if (page.description) descriptionMap.set(page.description, [...(descriptionMap.get(page.description) || []), page.slug]);
  for (const fingerprint of page.paragraphs) {
    if (!fingerprint) continue;
    paragraphMap.set(fingerprint, [...(paragraphMap.get(fingerprint) || []), page.slug]);
  }
}

const duplicateTitles = [...titleMap.entries()].filter(([, slugs]) => slugs.length > 1).map(([title, slugs]) => ({ title, slugs }));
const duplicateDescriptions = [...descriptionMap.entries()].filter(([, slugs]) => slugs.length > 1).map(([description, slugs]) => ({ description, slugs }));
const repeatedParagraphs = [...paragraphMap.entries()].filter(([, slugs]) => new Set(slugs).size >= 8).slice(0, 30).map(([fingerprint, slugs]) => ({ fingerprint, pages: [...new Set(slugs)].slice(0, 20), count: new Set(slugs).size }));

for (const item of duplicateTitles) {
  for (const slug of item.slugs) pages.find((page) => page.slug === slug)?.issues.push("duplicate-title");
}
for (const item of duplicateDescriptions) {
  for (const slug of item.slugs) pages.find((page) => page.slug === slug)?.warnings.push("duplicate-description");
}

const severeIssues = pages.flatMap((page) => page.issues.map((issue) => ({ slug: page.slug, url: page.url, issue })));
const warnings = pages.flatMap((page) => page.warnings.map((warning) => ({ slug: page.slug, url: page.url, warning }))).slice(0, 200);
const report = {
  generated_at: new Date().toISOString(),
  pages_checked: pages.length,
  status: severeIssues.length ? "failed" : "passed",
  severe_issue_count: severeIssues.length,
  warning_count: pages.reduce((sum, page) => sum + page.warnings.length, 0),
  duplicate_titles: duplicateTitles,
  duplicate_descriptions: duplicateDescriptions.slice(0, 30),
  repeated_paragraph_clusters: repeatedParagraphs,
  severe_issues: severeIssues,
  warnings,
  policy_alignment: [
    "people-first-content",
    "no-internal-editorial-language",
    "no-ai-evasion-language",
    "no-hidden-keyword-blocks",
    "unique-title-and-canonical",
    "conversion-path-visible",
    "automation-supports-editorial-quality"
  ],
  weakest_pages: pages
    .map((page) => ({ slug: page.slug, url: page.url, words: page.words, issues: page.issues, warnings: page.warnings }))
    .filter((page) => page.issues.length || page.warnings.length)
    .slice(0, 40)
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });
writeFileSync(join(REPORT_DIR, "content-quality-report.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(PUBLIC_DIR, "assets", "content-quality-latest.json"), JSON.stringify({ generated_at: report.generated_at, pages_checked: report.pages_checked, status: report.status, severe_issue_count: report.severe_issue_count, warning_count: report.warning_count, policy_alignment: report.policy_alignment, weakest_pages: report.weakest_pages.slice(0, 12) }, null, 2), "utf8");

if (severeIssues.length) {
  console.error(`Content quality check failed: ${severeIssues.length} severe issue(s).`);
  for (const issue of severeIssues.slice(0, 40)) console.error(`- ${issue.slug}: ${issue.issue}`);
  process.exit(1);
}

console.log(`Content quality check passed for ${pages.length} pages with ${report.warning_count} warning(s).`);