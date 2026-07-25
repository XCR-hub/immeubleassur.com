import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const SITE = "https://immeubleassur.com";
const PUBLIC_DIR = "public";
const privateSlugs = new Set(["admin"]);
const nonServiceSlugs = new Set(["index", "blog", "villes", "guides", "faq", "contact", "mentions-legales", "confidentialite", "merci"]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(file) === ".html" ? [file] : [];
  });
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function slugFromFile(file) {
  const rel = relative(PUBLIC_DIR, file).replace(/\\/g, "/");
  if (rel === "index.html") return "index";
  return rel.replace(/\.html$/, "");
}

function pageUrl(slug) {
  return slug === "index" ? `${SITE}/` : `${SITE}/${slug}`;
}

function canonicalOf(html) {
  return (html.match(/<link rel="canonical" href="([^"]+)"\s*\/>/i) || [])[1] || "";
}

function extractJsonLd(html, file, issues) {
  const blocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  return blocks.map((match, index) => {
    const raw = match[1].trim();
    try {
      return JSON.parse(raw);
    } catch (error) {
      issues.push(`${file}: JSON-LD bloc ${index + 1} invalide (${error.message})`);
      return null;
    }
  }).filter(Boolean);
}

function collectTypes(value, types = []) {
  if (!value) return types;
  if (Array.isArray(value)) {
    for (const item of value) collectTypes(item, types);
    return types;
  }
  if (typeof value !== "object") return types;
  if (value["@graph"]) collectTypes(value["@graph"], types);
  const type = value["@type"];
  if (Array.isArray(type)) types.push(...type);
  else if (type) types.push(type);
  for (const item of Object.values(value)) {
    if (item && typeof item === "object") collectTypes(item, types);
  }
  return types;
}

function hasType(types, type) {
  return types.includes(type);
}

function shouldHaveService(slug) {
  if (nonServiceSlugs.has(slug)) return false;
  if (slug.startsWith("blog/") || slug.startsWith("faq/")) return false;
  return true;
}

function validatePage(file) {
  const html = readFileSync(file, "utf8");
  const slug = slugFromFile(file);
  if (privateSlugs.has(slug)) return [];
  const issues = [];
  const expectedUrl = pageUrl(slug);
  const canonical = canonicalOf(html);
  const jsonLd = extractJsonLd(html, file, issues);
  const types = collectTypes(jsonLd);
  const title = stripHtml((html.match(/<title>(.*?)<\/title>/is) || [])[1] || "");

  if (canonical !== expectedUrl) issues.push(`${slug}: canonical attendu ${expectedUrl}, recu ${canonical || "absent"}`);
  if (canonical.includes(".html")) issues.push(`${slug}: canonical avec extension .html`);
  if (!hasType(types, "Organization") && !hasType(types, "InsuranceAgency") && !hasType(types, "FinancialService")) issues.push(`${slug}: schema Organization/InsuranceAgency absent`);
  if (!hasType(types, "WebSite")) issues.push(`${slug}: schema WebSite absent`);
  if (!hasType(types, "BreadcrumbList")) issues.push(`${slug}: schema BreadcrumbList absent`);
  if (slug.startsWith("blog/")) {
    if (!hasType(types, "Article")) issues.push(`${slug}: schema Article absent`);
  } else if (!hasType(types, "WebPage")) {
    issues.push(`${slug}: schema WebPage absent`);
  }
  if (shouldHaveService(slug) && !hasType(types, "Service")) issues.push(`${slug}: schema Service absent`);
  if (/<details>/i.test(html) && !hasType(types, "FAQPage")) issues.push(`${slug}: details presents sans schema FAQPage`);
  if (!title || title.length < 20) issues.push(`${slug}: title trop faible`);
  return issues;
}

function sitemapUrls() {
  const xml = readFileSync(join(PUBLIC_DIR, "sitemap.xml"), "utf8");
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => ({
    loc: (match[1].match(/<loc>(.*?)<\/loc>/) || [])[1] || "",
    lastmod: (match[1].match(/<lastmod>(.*?)<\/lastmod>/) || [])[1] || ""
  }));
  return { xml, urls };
}

function validateSitemap(publicUrls) {
  const issues = [];
  const { xml, urls } = sitemapUrls();
  const sitemapSet = new Set(urls.map((item) => item.loc));
  if (xml.includes(".html")) issues.push("sitemap: contient encore des URLs .html");
  for (const item of urls) {
    if (!item.lastmod) issues.push(`sitemap: lastmod absent pour ${item.loc}`);
    if (item.lastmod && !/^\d{4}-\d{2}-\d{2}$/.test(item.lastmod)) issues.push(`sitemap: lastmod invalide pour ${item.loc}`);
  }
  for (const url of publicUrls) {
    if (!sitemapSet.has(url)) issues.push(`sitemap: URL publique absente ${url}`);
  }
  for (const item of urls) {
    if (!publicUrls.has(item.loc)) issues.push(`sitemap: URL sans page publique ${item.loc}`);
  }
  return issues;
}

const publicFiles = walk(PUBLIC_DIR).filter((file) => !privateSlugs.has(slugFromFile(file)));
const publicUrls = new Set(publicFiles.map((file) => pageUrl(slugFromFile(file))));
const issues = publicFiles.flatMap(validatePage).concat(validateSitemap(publicUrls));

if (issues.length) {
  console.error(`Schema quality check failed: ${issues.length} probleme(s).`);
  for (const issue of issues.slice(0, 80)) console.error(`- ${issue}`);
  if (issues.length > 80) console.error(`- ... ${issues.length - 80} autres problemes`);
  process.exit(1);
}

console.log(`Schema quality check passed for ${publicFiles.length} pages.`);