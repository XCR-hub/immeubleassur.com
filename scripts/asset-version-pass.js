import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(file) === ".html" ? [file] : [];
  });
}

function versionedAsset(path) {
  const file = join(PUBLIC_DIR, ...path.replace(/^\//, "").split("/"));
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10);
  return `${path}?v=${hash}`;
}

const assets = {
  styles: versionedAsset("/assets/styles.css"),
  app: versionedAsset("/assets/app.js"),
  admin: versionedAsset("/assets/admin.js")
};

const tagRules = [
  {
    name: "styles",
    pattern: /<link\s+rel="stylesheet"\s+href="\/assets\/styles\.css(?:\?v=[^"]*)?"\s*\/?\s*>/g,
    replacement: `<link rel="stylesheet" href="${assets.styles}" />`
  },
  {
    name: "app",
    pattern: /<script\s+src="\/assets\/app\.js(?:\?v=[^"]*)?"\s+type="module"><\/script>/g,
    replacement: `<script src="${assets.app}" type="module"></script>`
  },
  {
    name: "admin",
    pattern: /<script\s+src="\/assets\/admin\.js(?:\?v=[^"]*)?"\s+type="module"><\/script>/g,
    replacement: `<script src="${assets.admin}" type="module"></script>`
  }
];

function normalize(html) {
  let updates = 0;
  for (const rule of tagRules) {
    let seen = false;
    html = html.replace(rule.pattern, (match) => {
      const next = seen ? "" : rule.replacement;
      seen = true;
      if (match !== next) updates += 1;
      return next;
    });
  }
  return { html, updates };
}

const changed = [];
let replacements = 0;
const files = walk(PUBLIC_DIR);
for (const file of files) {
  const before = readFileSync(file, "utf8");
  const { html, updates } = normalize(before);
  if (updates > 0 || html !== before) {
    writeFileSync(file, html, "utf8");
    replacements += updates;
    changed.push({ file: relative(PUBLIC_DIR, file).replace(/\\/g, "/"), updates });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  files_checked: files.length,
  files_changed: changed.length,
  replacements,
  assets,
  changed: changed.slice(0, 80),
  status: "passed"
};

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "asset-version-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`Asset version pass checked ${files.length} pages, changed ${changed.length}, replacements ${replacements}.`);