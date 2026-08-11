import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function htmlFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const file = join(directory, name);
    return statSync(file).isDirectory() ? htmlFiles(file) : name.endsWith(".html") ? [file] : [];
  });
}

const generator = readFileSync("scripts/seo-growth-pass.js", "utf8");
const pages = htmlFiles("public");
const offenders = pages.filter((file) => {
  const html = readFileSync(file, "utf8");
  return html.includes('"@type":"SearchAction"') || html.includes("search_term_string");
});
const websiteSchemas = pages.filter((file) => readFileSync(file, "utf8").includes('"@type":"WebSite"'));
const checks = [
  ["generator-does-not-claim-unimplemented-search", !generator.includes("SearchAction") && !generator.includes("search_term_string")],
  ["published-pages-do-not-claim-unimplemented-search", offenders.length === 0],
  ["website-entity-remains-published", websiteSchemas.length > 0]
];
const missing = checks.filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  generated_at: new Date().toISOString(),
  status: missing.length ? "failed" : "passed",
  checks: checks.length,
  pages_scanned: pages.length,
  website_schema_pages: websiteSchemas.length,
  offenders,
  missing,
  safeguards: ["truthful-structured-data", "no-fictitious-search-target", "website-entity-retained"]
};
console.log(JSON.stringify(report, null, 2));
if (missing.length) process.exit(1);
