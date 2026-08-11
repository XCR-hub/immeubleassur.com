import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const publicDir = "public";
const files = readdirSync(publicDir).filter((name) => /^assurance-immeuble-[a-z0-9-]+\.html$/.test(name));
const scoped = files.map((name) => {
  const html = readFileSync(join(publicDir, name), "utf8");
  return {
    name,
    hasCityDepth: html.includes("<!-- city-depth:start -->"),
    hasExplicitCityHeading: /<h1[^>]*>Assurance immeuble a ([^.<]+)\.?<\/h1>/i.test(html)
  };
});
const offenders = scoped.filter((page) => page.hasCityDepth && !page.hasExplicitCityHeading).map((page) => page.name);
const cityPages = scoped.filter((page) => page.hasExplicitCityHeading);
const cityDepthPages = scoped.filter((page) => page.hasCityDepth);
const diversity = readFileSync("scripts/content-diversity-pass.js", "utf8");
const factory = readFileSync("scripts/seo-content-factory.js", "utf8");
const checks = [
  ["no-business-page-has-city-depth", offenders.length === 0],
  ["all-explicit-city-pages-have-depth", cityPages.length > 0 && cityPages.every((page) => page.hasCityDepth)],
  ["diversity-does-not-infer-city-from-slug", diversity.includes('if (fromH1) return fromH1.trim();') && diversity.includes('return "";') && !diversity.includes('.replace(/^assurance-immeuble-/, "")')],
  ["factory-skips-non-city-pages", factory.includes("if (!rawName)") && factory.includes("continue;") && !factory.includes('fileName.replace("assurance-immeuble-", "")')]
];
const missing = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({
  status: missing.length ? "failed" : "passed",
  checks: checks.length,
  explicit_city_pages: cityPages.length,
  city_depth_pages: cityDepthPages.length,
  offenders,
  missing
}, null, 2));
if (missing.length) process.exit(1);
