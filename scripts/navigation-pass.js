import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { renderSiteNavigation } from "./site-navigation.js";

const root = "public";
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : extname(path) === ".html" ? [path] : [];
  });
}

let checked = 0;
let changed = 0;
for (const file of walk(root)) {
  const html = readFileSync(file, "utf8");
  const header = html.match(/<header\b[^>]*class="site-header"[^>]*>[\s\S]*?<\/header>/);
  if (!header || !/<nav\b[^>]*class="nav"/.test(header[0])) continue;
  checked++;
  const slug = relative(root, file).replaceAll("\\", "/").replace(/\.html$/, "");
  const next = html.replace(header[0], renderSiteNavigation(slug));
  if (next === html) continue;
  writeFileSync(file, next);
  changed++;
}
console.log(`Shared navigation: ${checked} pages checked, ${changed} updated.`);
