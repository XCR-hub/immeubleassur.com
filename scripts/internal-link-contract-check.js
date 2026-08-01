import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, posix, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const REPORT_PATH = join(REPORT_DIR, "internal-link-contract-report.json");
const ASSET_PATH = join(PUBLIC_DIR, "assets", "internal-link-contract-latest.json");
const SITE_HOSTS = new Set(["immeubleassur.com", "www.immeubleassur.com"]);
const SKIP_PROTOCOL = /^(mailto|tel|sms|javascript|data|blob):/i;

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function read(path) { return readFileSync(path, "utf8"); }
function write(path, value) { ensureDir(dirname(path)); writeFileSync(path, value, "utf8"); }

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(file) === ".html" ? [file] : [];
  });
}

function publicRel(file) {
  return relative(PUBLIC_DIR, file).replace(/\\/g, "/");
}

function pageSlug(file) {
  const rel = publicRel(file);
  if (rel === "index.html") return "index";
  return rel.replace(/\.html$/i, "");
}

function pagePathForFile(file) {
  const slug = pageSlug(file);
  return slug === "index" ? "/" : `/${slug}`;
}

function htmlFileForPath(pathname) {
  const clean = pathname.replace(/^\/+/, "");
  if (!clean) return join(PUBLIC_DIR, "index.html");
  if (clean.endsWith(".html")) return join(PUBLIC_DIR, clean);
  const direct = join(PUBLIC_DIR, clean);
  const html = join(PUBLIC_DIR, `${clean}.html`);
  const index = join(PUBLIC_DIR, clean, "index.html");
  if (existsSync(html)) return html;
  if (existsSync(index)) return index;
  if (existsSync(direct)) return direct;
  return html;
}

function assetFileForPath(pathname) {
  return join(PUBLIC_DIR, pathname.replace(/^\/+/, ""));
}

function normalizeInternalRef(raw, sourceFile) {
  const value = String(raw || "").trim();
  if (!value || SKIP_PROTOCOL.test(value)) return null;
  if (value.startsWith("//")) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!SITE_HOSTS.has(url.hostname.toLowerCase())) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  if (value.startsWith("#")) return `${pagePathForFile(sourceFile)}${value}`;
  if (value.startsWith("?")) return pagePathForFile(sourceFile);
  if (value.startsWith("/")) return value;
  const sourceDir = posix.dirname(pagePathForFile(sourceFile));
  return posix.normalize(`${sourceDir}/${value}`);
}

function splitRef(value) {
  const hashAt = value.indexOf("#");
  const beforeHash = hashAt >= 0 ? value.slice(0, hashAt) : value;
  const fragment = hashAt >= 0 ? value.slice(hashAt + 1).split("?")[0] : "";
  const queryAt = beforeHash.indexOf("?");
  const pathname = (queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash) || "/";
  return { pathname, fragment };
}

function hasAnchor(html, fragment) {
  if (!fragment) return true;
  let decoded = fragment;
  try { decoded = decodeURIComponent(fragment); } catch {}
  const escaped = decoded.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const idPattern = new RegExp(`\\s(?:id|name)=["']${escaped}["']`, "i");
  return idPattern.test(html);
}

function extractRefs(html) {
  const refs = [];
  const pattern = /\s(href|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(html))) refs.push({ attr: match[1].toLowerCase(), raw: match[2] });
  return refs;
}

function resolveTarget(ref, sourceFile) {
  const internal = normalizeInternalRef(ref.raw, sourceFile);
  if (!internal) return null;
  const { pathname, fragment } = splitRef(internal);
  const extension = extname(pathname).toLowerCase();
  const isHtmlRoute = !extension || extension === ".html";
  const targetFile = isHtmlRoute ? htmlFileForPath(pathname) : assetFileForPath(pathname);
  return { ...ref, internal, pathname, fragment, targetFile, isHtmlRoute };
}

function build() {
  ensureDir(REPORT_DIR);
  ensureDir(join(PUBLIC_DIR, "assets"));
  const files = walk(PUBLIC_DIR).filter((file) => !/\\admin\.html$/i.test(file));
  const broken = [];
  let refsChecked = 0;
  let internalRefs = 0;

  for (const file of files) {
    const html = read(file);
    const source = publicRel(file);
    for (const ref of extractRefs(html)) {
      refsChecked += 1;
      const target = resolveTarget(ref, file);
      if (!target) continue;
      internalRefs += 1;
      if (!existsSync(target.targetFile)) {
        broken.push({ source, attr: ref.attr, href: ref.raw, resolved: target.pathname, reason: "missing-target" });
        continue;
      }
      if (target.isHtmlRoute && target.fragment) {
        const targetHtml = read(target.targetFile);
        if (!hasAnchor(targetHtml, target.fragment)) {
          broken.push({ source, attr: ref.attr, href: ref.raw, resolved: `${target.pathname}#${target.fragment}`, reason: "missing-anchor" });
        }
      }
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    status: broken.length ? "failed" : "passed",
    pages_checked: files.length,
    refs_checked: refsChecked,
    internal_refs_checked: internalRefs,
    broken_count: broken.length,
    broken: broken.slice(0, 100),
    safeguards: ["internal-hrefs", "internal-src-assets", "clean-url-to-html", "same-page-anchors", "public-report"]
  };
  write(REPORT_PATH, JSON.stringify(report, null, 2));
  write(ASSET_PATH, JSON.stringify(report, null, 2));
  if (broken.length) {
    console.error(`Internal link contract failed: ${broken.length} broken reference(s).`);
    for (const item of broken.slice(0, 12)) console.error(`${item.source} -> ${item.href} (${item.reason})`);
    process.exit(1);
  }
  console.log(`Internal link contract passed for ${files.length} page(s), ${internalRefs} internal reference(s).`);
}

build();