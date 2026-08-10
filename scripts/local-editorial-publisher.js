import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function safeVersion(value) { return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100); }

const runtimeAssetsRoot = resolve(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets")));
const reportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", join("data", "runtime-reports")));
const staticPublicRoot = resolve(env("LOCAL_SITE_PUBLIC_ROOT", "public"));
const publicationsRoot = resolve(env("LOCAL_RUNTIME_PUBLICATIONS_ROOT", join(runtimeAssetsRoot, "publications")));
const manifestPath = join(publicationsRoot, "current.json");
const reportPath = resolve(env("LOCAL_EDITORIAL_PUBLISHER_REPORT", join(reportsRoot, "local-editorial-publisher-report.json")));
const current = readJson(manifestPath);
const today = new Date().toISOString().slice(0, 10);
const expectedSlug = `news/veille-assurance-immeuble-${today}`;
const force = process.argv.includes("--force");

if (!force && current?.issue?.slug === expectedSlug) {
  const report = { success: true, status: "already-published-today", generated_at: new Date().toISOString(), manifest: manifestPath, active_version: current.version, issue: current.issue, preserved_previous: true };
  writeJson(reportPath, report);
  console.log(`Editorial publisher: ${report.status} (${expectedSlug}).`);
  process.exit(0);
}

const version = safeVersion(`${new Date().toISOString().replace(/[:.]/g, "-")}-${createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 8)}`);
const versionRoot = join(publicationsRoot, "versions", version);
mkdirSync(versionRoot, { recursive: true });
const child = spawnSync(process.execPath, ["scripts/editorial-autopilot.js", "--fetch"], {
  cwd: process.cwd(),
  env: { ...process.env, LOCAL_RUNTIME_ONLY: "0", LOCAL_EDITORIAL_OUTPUT_ROOT: versionRoot, LOCAL_RUNTIME_REPORTS_ROOT: reportsRoot, LOCAL_RUNTIME_ASSETS_ROOT: runtimeAssetsRoot },
  encoding: "utf8",
  timeout: 120000,
  windowsHide: true
});
const editorialReport = readJson(join(reportsRoot, "editorial-autopilot-report.json"));
const baseReport = { generated_at: new Date().toISOString(), version, version_root: versionRoot, manifest: manifestPath, child_status: child.status, child_stdout: String(child.stdout || "").trim().slice(0, 3000), child_stderr: String(child.stderr || "").trim().slice(0, 3000) };

if (child.status !== 0 || !editorialReport) {
  const report = { ...baseReport, success: false, status: "generation-failed", preserved_previous: Boolean(current), error: editorialReport ? "editorial child failed" : "editorial report missing" };
  writeJson(reportPath, report);
  console.error(`Editorial publisher: ${report.status}.`);
  process.exit(1);
}
if (!editorialReport.publication_gate?.ready || !editorialReport.public_write_enabled) {
  const report = { ...baseReport, success: true, status: "held-by-publication-gate", preserved_previous: Boolean(current), gate: editorialReport.publication_gate, candidate_issue: editorialReport.candidate_issue || null };
  writeJson(reportPath, report);
  console.log(`Editorial publisher: ${report.status}; previous edition preserved.`);
  process.exit(0);
}
if (editorialReport.public_content_ai_generated !== false || editorialReport.public_content_provider !== "deterministic" || editorialReport.ai_draft_allowed_publication !== false) {
  const report = { ...baseReport, success: false, status: "unsafe-content-provider", preserved_previous: Boolean(current), public_content_provider: editorialReport.public_content_provider, public_content_ai_generated: editorialReport.public_content_ai_generated };
  writeJson(reportPath, report);
  console.error(`Editorial publisher: ${report.status}.`);
  process.exit(1);
}

const issue = editorialReport.issue;
const baseSitemapPath = join(staticPublicRoot, "sitemap.xml");
const runtimeSitemapPath = join(versionRoot, "sitemap.xml");
if (existsSync(baseSitemapPath) && issue?.slug) {
  let sitemap = readFileSync(baseSitemapPath, "utf8");
  const loc = `https://immeubleassur.com/${issue.slug}`;
  if (!sitemap.includes(`<loc>${loc}</loc>`)) sitemap = sitemap.replace("</urlset>", `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n</urlset>`);
  writeFileSync(runtimeSitemapPath, sitemap, "utf8");
}
const allowedFiles = ["veille-assurance-immeuble.html", "newsletter-assurance-immeuble.html", `${issue?.slug || ""}.html`, "sitemap.xml"];
const invalid = [];
const files = allowedFiles.map((relative) => {
  const file = join(versionRoot, ...relative.split("/"));
  const html = existsSync(file) ? readFileSync(file, "utf8") : "";
  const expectedContent = relative === "sitemap.xml" ? html.includes("<urlset") && html.includes(`https://immeubleassur.com/${issue.slug}`) : html.includes("https://immeubleassur.com");
  if (!relative || !existsSync(file) || statSync(file).size < 1000 || !expectedContent || /\uFFFD|ï¿½|Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â(?:€|™|œ|ž)/.test(html)) invalid.push(relative || "missing-issue-slug");
  return { path: relative, bytes: existsSync(file) ? statSync(file).size : 0, sha256: existsSync(file) ? sha256(file) : "" };
});
if (invalid.length) {
  const report = { ...baseReport, success: false, status: "generated-files-invalid", preserved_previous: Boolean(current), invalid_files: invalid, files };
  writeJson(reportPath, report);
  console.error(`Editorial publisher: ${report.status}: ${invalid.join(", ")}.`);
  process.exit(1);
}

const manifest = {
  marker: "runtime-editorial-publication-v1",
  version,
  activated_at: new Date().toISOString(),
  allowed_files: allowedFiles,
  files,
  issue: { id: issue.id, slug: issue.slug, title: issue.title, html_url: issue.html_url },
  publication_gate: editorialReport.publication_gate,
  public_content_provider: editorialReport.public_content_provider,
  public_content_ai_generated: false,
  ai_draft_allowed_publication: false,
  previous_version: current?.version || null
};
mkdirSync(publicationsRoot, { recursive: true });
const temporaryManifest = join(publicationsRoot, `current-${process.pid}-${Date.now()}.tmp`);
writeJson(temporaryManifest, manifest);
renameSync(temporaryManifest, manifestPath);
const report = { ...baseReport, success: true, status: "published", preserved_previous: Boolean(current), active_version: version, previous_version: current?.version || null, issue: manifest.issue, files };
writeJson(reportPath, report);
console.log(`Editorial publisher: published ${issue.slug} as ${version}.`);
