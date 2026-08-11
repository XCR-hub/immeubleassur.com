import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PUBLIC_DIR = "public";
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : name.endsWith(".html") ? [file] : [];
  });
}
function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function fingerprint(text) {
  return text.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 220);
}
const paragraphs = new Map();
for (const file of walk(PUBLIC_DIR)) {
  const slug = relative(PUBLIC_DIR, file).replace(/\\/g, "/").replace(/\.html$/, "");
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripHtml(match[1]);
    if (text.length < 140) continue;
    const key = fingerprint(text);
    if (!key) continue;
    paragraphs.set(key, [...(paragraphs.get(key) || []), slug]);
  }
}
const clusters = [...paragraphs.entries()]
  .map(([key, pages]) => ({ fingerprint: key, pages: [...new Set(pages)] }))
  .filter((item) => item.pages.length >= 8)
  .map((item) => ({ ...item, count: item.pages.length }));
const diversity = readFileSync("scripts/content-diversity-pass.js", "utf8");
const editorial = readFileSync("scripts/editorial-autopilot.js", "utf8");
const checks = [
  ["no-eight-page-paragraph-cluster", clusters.length === 0],
  ["short-article-variants-covered", diversity.includes('"blog-documents-short"') && diversity.includes('"blog-premium-short"')],
  ["measured-serp-boilerplate-covered", diversity.includes('"measured-serp-guide"')],
  ["editorial-regeneration-stays-contextual", editorial.includes("contextualizeEditorialCopy(publicSynthesis.text, issue.slug)") && editorial.includes("contextualizeEditorialCopy(html, source)") && editorial.includes("intentExitBlock(source)") && editorial.includes("editorialReadinessCopy(source)")]
];
const missing = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ status: missing.length ? "failed" : "passed", checks: checks.length, clusters, missing }, null, 2));
if (missing.length) process.exit(1);
