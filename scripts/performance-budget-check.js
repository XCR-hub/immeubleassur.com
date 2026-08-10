import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const REPORT_PATH = join(REPORT_DIR, "performance-budget-report.json");
const ASSET_PATH = join(PUBLIC_DIR, "assets", "performance-budget-latest.json");

const budgets = {
  htmlBytes: 80 * 1024,
  averageHtmlBytes: 40 * 1024,
  stylesBytes: 90 * 1024,
  appBytes: 140 * 1024,
  heroImageBytes: 180 * 1024,
  adminBytes: 130 * 1024,
  searchIndexBytes: 90 * 1024,
  publicReportBytes: 160 * 1024,
  maxBlockingExternalScripts: 0
};

const allowedExternalScripts = [
  /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js$/i
];

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function writeJson(path, value) { ensureDir(dirname(path)); writeFileSync(path, JSON.stringify(value, null, 2), "utf8"); }
function read(path) { return readFileSync(path, "utf8"); }
function bytes(path) { return statSync(path).size; }
function kb(value) { return Math.round((Number(value || 0) / 1024) * 10) / 10; }

function walk(dir, predicate) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file, predicate);
    return predicate(file) ? [file] : [];
  });
}

function rel(file) { return relative(PUBLIC_DIR, file).replace(/\\/g, "/"); }
function isNoIndex(html) { return /<meta name="robots" content="[^"]*noindex/i.test(html); }
function isVersionedAsset(value) { return /^\/assets\/[a-z0-9._/-]+\.(css|js)\?v=[a-f0-9]{8,}/i.test(value); }
function isTurnstileScript(value) { return allowedExternalScripts.some((pattern) => pattern.test(value)); }

function extractAttrs(html, tag, attr) {
  const pattern = new RegExp(`<${tag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "gi");
  return [...html.matchAll(pattern)].map((match) => ({ value: match[1], tag: match[0] }));
}

function pushIssue(list, severity, source, rule, message, detail = {}) {
  list.push({ severity, source, rule, message, ...detail });
}

function analyzePage(file) {
  const html = read(file);
  const source = rel(file);
  const issues = [];
  const size = bytes(file);
  const scripts = extractAttrs(html, "script", "src");
  const stylesheets = extractAttrs(html, "link", "href").filter((item) => /rel=["']stylesheet["']/i.test(item.tag));
  const images = extractAttrs(html, "img", "src");

  if (size > budgets.htmlBytes) pushIssue(issues, "high", source, "html-size", `HTML ${kb(size)} Ko > budget ${kb(budgets.htmlBytes)} Ko`, { bytes: size });
  if (!/<meta name="viewport" content="width=device-width, initial-scale=1"/i.test(html)) pushIssue(issues, "high", source, "viewport", "Viewport mobile absent ou non standard.");
  if (!stylesheets.some((item) => isVersionedAsset(item.value))) pushIssue(issues, "high", source, "versioned-css", "CSS principal absent ou non versionne.");
  if (source === "index.html" && !/<link\b[^>]*rel=["']preload["'][^>]*href=["']\/assets\/hero-building\.webp["'][^>]*fetchpriority=["']high["'][^>]*>/i.test(html)) {
    pushIssue(issues, "high", source, "lcp-image-priority", "Le preload de l image LCP doit declarer fetchpriority=high.");
  }

  if (source !== "admin.html" && !scripts.some((item) => /^\/assets\/app\.js\?v=[a-f0-9]{8,}/i.test(item.value))) {
    pushIssue(issues, "high", source, "versioned-app-js", "Script applicatif public absent ou non versionne.");
  }
  if (source === "admin.html" && !scripts.some((item) => /^\/assets\/admin\.js\?v=[a-f0-9]{8,}/i.test(item.value))) {
    pushIssue(issues, "high", source, "versioned-admin-js", "Script admin absent ou non versionne.");
  }

  for (const script of scripts) {
    if (/^https?:\/\//i.test(script.value)) {
      if (!isTurnstileScript(script.value)) pushIssue(issues, "high", source, "external-script", `Script externe non autorise: ${script.value}`);
      if (!/\sasync\b/i.test(script.tag) || !/\sdefer\b/i.test(script.tag)) pushIssue(issues, "medium", source, "async-external-script", `Script externe non asynchrone: ${script.value}`);
    }
  }

  for (const image of images) {
    if (!/\sloading=["']lazy["']/i.test(image.tag)) pushIssue(issues, "medium", source, "lazy-image", `Image sans loading lazy: ${image.value}`);
    if (!/\sdecoding=["']async["']/i.test(image.tag)) pushIssue(issues, "medium", source, "async-image", `Image sans decoding async: ${image.value}`);
    if (!/\salt=["'][^"']+["']/i.test(image.tag)) pushIssue(issues, "medium", source, "image-alt", `Image sans alt descriptif: ${image.value}`);
  }

  return { source, bytes: size, indexable: !isNoIndex(html), issue_count: issues.length, issues };
}

function assetRow(path, budget) {
  const file = join(PUBLIC_DIR, path);
  const size = existsSync(file) ? bytes(file) : 0;
  return { path, bytes: size, kb: kb(size), budget_bytes: budget, budget_kb: kb(budget), ok: existsSync(file) && size <= budget };
}

function build() {
  ensureDir(REPORT_DIR);
  ensureDir(join(PUBLIC_DIR, "assets"));
  const htmlFiles = walk(PUBLIC_DIR, (file) => extname(file) === ".html");
  const pageRows = htmlFiles.map(analyzePage);
  const pageIssues = pageRows.flatMap((row) => row.issues);
  const assetRows = [
    assetRow("assets/styles.css", budgets.stylesBytes),
    assetRow("assets/app.js", budgets.appBytes),
    assetRow("assets/hero-building.webp", budgets.heroImageBytes),
    assetRow("assets/admin.js", budgets.adminBytes),
    assetRow("assets/search-index.json", budgets.searchIndexBytes)
  ];
  const reportAssets = walk(join(PUBLIC_DIR, "assets"), (file) => /-latest\.json$/i.test(file));
  const reportAssetRows = reportAssets.map((file) => ({ path: rel(file), bytes: bytes(file), kb: kb(bytes(file)), ok: bytes(file) <= budgets.publicReportBytes })).sort((a, b) => b.bytes - a.bytes);
  const assetIssues = assetRows.filter((row) => !row.ok).map((row) => ({ severity: "high", source: row.path, rule: "asset-size", message: `${row.path} ${row.kb} Ko > budget ${row.budget_kb} Ko`, bytes: row.bytes }));
  const reportAssetIssues = reportAssetRows.filter((row) => !row.ok).map((row) => ({ severity: "medium", source: row.path, rule: "report-asset-size", message: `${row.path} ${row.kb} Ko > budget ${kb(budgets.publicReportBytes)} Ko`, bytes: row.bytes }));
  const averageHtml = pageRows.reduce((sum, row) => sum + row.bytes, 0) / Math.max(1, pageRows.length);
  const aggregateIssues = [];
  const styles = read(join(PUBLIC_DIR, "assets", "styles.css"));
  if (!styles.includes("content-visibility: auto") || !styles.includes("contain-intrinsic-size: auto 720px")) {
    pushIssue(aggregateIssues, "high", "assets/styles.css", "below-fold-render-containment", "Le rendu hors ecran doit rester differe avec une taille intrinseque stable.");
  }
  if (averageHtml > budgets.averageHtmlBytes) pushIssue(aggregateIssues, "high", "public", "average-html-size", `HTML moyen ${kb(averageHtml)} Ko > budget ${kb(budgets.averageHtmlBytes)} Ko`, { bytes: Math.round(averageHtml) });

  const allIssues = pageIssues.concat(assetIssues, reportAssetIssues, aggregateIssues);
  const severeIssues = allIssues.filter((item) => item.severity === "high");
  const report = {
    generated_at: new Date().toISOString(),
    status: severeIssues.length ? "failed" : "passed",
    pages_checked: pageRows.length,
    indexable_pages: pageRows.filter((row) => row.indexable).length,
    average_html_kb: kb(averageHtml),
    largest_pages: pageRows.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 12).map((row) => ({ source: row.source, kb: kb(row.bytes), issue_count: row.issue_count })),
    assets: assetRows,
    public_report_assets: reportAssetRows.slice(0, 12),
    warning_count: allIssues.length,
    severe_issue_count: severeIssues.length,
    issues: allIssues.slice(0, 120),
    budgets,
    safeguards: ["html-size-budget", "core-asset-budget", "versioned-css-js", "turnstile-on-demand", "local-hero-image-budget", "lcp-image-fetch-priority", "below-fold-render-containment", "lazy-images", "public-report"]
  };

  writeJson(REPORT_PATH, report);
  writeJson(ASSET_PATH, report);
  if (severeIssues.length) {
    console.error(`Performance budget failed: ${severeIssues.length} severe issue(s), ${allIssues.length} total issue(s).`);
    for (const issue of severeIssues.slice(0, 20)) console.error(`${issue.source}: ${issue.rule} - ${issue.message}`);
    process.exit(1);
  }
  console.log(`Performance budget passed for ${pageRows.length} page(s), average HTML ${report.average_html_kb} Ko, ${allIssues.length} warning(s).`);
}

build();