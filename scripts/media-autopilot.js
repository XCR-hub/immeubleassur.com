import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT = "public";
const REPORT_DIR = "reports";
const SITE = "https://immeubleassur.com";
const args = new Set(process.argv.slice(2));
const ENABLE_FETCH = args.has("--fetch") && Boolean(process.env.PEXELS_API_KEY);

const QUERIES = [
  ["immeuble copropriete facade", "copropriete"],
  ["apartment building entrance", "immeuble"],
  ["real estate office meeting", "courtier"],
  ["building renovation facade", "travaux"],
  ["city apartment building france", "villes"]
].map(([query, topic]) => ({ query, topic }));

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function read(path, fallback = "") { return existsSync(path) ? readFileSync(path, "utf8") : fallback; }
function write(path, value) { ensureDir(dirname(path)); writeFileSync(path, value, "utf8"); }
function esc(value) { return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function attr(value) { return esc(value).replaceAll("'", "&#39;"); }
function hash(value, size = 12) { return createHash("sha256").update(String(value || "")).digest("hex").slice(0, size); }
function sql(value) { return value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Authorization: process.env.PEXELS_API_KEY, "User-Agent": "ImmeubleAssur media autopilot (+https://immeubleassur.com)" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchPhotos(query) {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query.query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("locale", "fr-FR");
  url.searchParams.set("per_page", "3");
  const data = await fetchJson(url);
  return (data.photos || []).map((photo) => ({
    id: `pexels-${photo.id}`,
    provider: "pexels",
    topic: query.topic,
    query: query.query,
    alt: photo.alt || `Visuel ${query.topic} assurance immeuble`,
    photographer: photo.photographer || "Pexels",
    photographer_url: photo.photographer_url || "https://www.pexels.com",
    url: photo.url,
    src: photo.src?.large2x || photo.src?.large || photo.src?.landscape || "",
    width: photo.width || null,
    height: photo.height || null
  })).filter((photo) => photo.src && photo.url);
}

function fallbackMedia() {
  return QUERIES.map((query, index) => ({
    id: `media-plan-${hash(query.query)}`,
    provider: "planned-pexels",
    topic: query.topic,
    query: query.query,
    alt: `Visuel a selectionner pour ${query.topic}`,
    photographer: "",
    photographer_url: "",
    url: "",
    src: "",
    width: null,
    height: null,
    priority: index + 1
  }));
}

async function collectMedia() {
  const errors = [];
  if (!ENABLE_FETCH) return { media: fallbackMedia(), errors, mode: "planned-no-pexels-key" };
  const media = [];
  for (const query of QUERIES) {
    try { media.push(...await searchPhotos(query)); }
    catch (error) { errors.push({ query: query.query, error: error.message || "pexels failed" }); }
  }
  return { media: media.length ? media : fallbackMedia(), errors, mode: media.length ? "pexels-fetched" : "fallback-after-fetch" };
}

function mediaBlock(media) {
  const usable = media.filter((item) => item.src && item.url).slice(0, 3);
  if (!usable.length) return "";
  return `<section class="band media-proof-band"><div class="section-head"><p class="eyebrow dark">Immeubles et risques reels</p><h2>Un site plus visuel, plus concret, plus rassurant.</h2></div><div class="media-grid">${usable.map((item) => `<figure class="media-card"><img src="${attr(item.src)}" alt="${attr(item.alt)}" loading="lazy" decoding="async" /><figcaption><a href="${attr(item.url)}" rel="nofollow noopener">Photo</a> par <a href="${attr(item.photographer_url)}" rel="nofollow noopener">${esc(item.photographer)}</a> sur Pexels</figcaption></figure>`).join("")}</div></section>`;
}

function injectBlock(file, block) {
  if (!block || !existsSync(file)) return false;
  let html = read(file);
  const pattern = /\n?<!-- media-autopilot:start -->[\s\S]*?<!-- media-autopilot:end -->/g;
  html = html.replace(pattern, "");
  html = html.replace("</main>", `\n<!-- media-autopilot:start -->\n${block}\n<!-- media-autopilot:end -->\n</main>`);
  write(file, html);
  return true;
}

function injectMedia(media) {
  const block = mediaBlock(media);
  const targets = ["index.html", "assurance-immeuble.html", "courtier-assurance-immeuble.html", "veille-assurance-immeuble.html"];
  return targets.filter((file) => injectBlock(join(OUT, file), block)).length;
}

function d1Sql(report) {
  const now = report.generated_at;
  const lines = ["PRAGMA foreign_keys = ON;"];
  lines.push(`INSERT OR REPLACE INTO media_runs (id, provider, status, assets_count, payload, created_at) VALUES (${sql(report.run_id)}, ${sql(report.provider)}, ${sql(report.status)}, ${report.assets_count}, ${sql(JSON.stringify({ mode: report.mode, errors: report.errors }))}, ${sql(now)});`);
  for (const item of report.media) {
    lines.push(`INSERT OR REPLACE INTO media_assets (id, run_id, provider, topic, source_url, image_url, alt_text, photographer, photographer_url, payload, created_at) VALUES (${sql(item.id)}, ${sql(report.run_id)}, ${sql(item.provider)}, ${sql(item.topic)}, ${sql(item.url)}, ${sql(item.src)}, ${sql(item.alt)}, ${sql(item.photographer)}, ${sql(item.photographer_url)}, ${sql(JSON.stringify(item))}, ${sql(now)});`);
  }
  return `${lines.join("\n")}\n`;
}

async function run() {
  ensureDir(REPORT_DIR);
  ensureDir(join(OUT, "assets"));
  const { media, errors, mode } = await collectMedia();
  const injected_pages = injectMedia(media);
  const report = {
    run_id: `media-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${hash(JSON.stringify(media), 8)}`,
    generated_at: new Date().toISOString(),
    provider: ENABLE_FETCH ? "pexels" : "planned-pexels",
    status: ENABLE_FETCH && errors.length ? "completed-with-errors" : ENABLE_FETCH ? "completed" : "skipped-no-pexels-key",
    mode,
    pexels_enabled: ENABLE_FETCH,
    assets_count: media.filter((item) => item.src).length,
    injected_pages,
    media,
    compliance: ["pexels-api-with-attribution", "no-secret-in-repository", "no-dark-stock-backgrounds", "images-support-real-estate-context"],
    errors
  };
  write(join(REPORT_DIR, "media-autopilot-report.json"), JSON.stringify(report, null, 2));
  write(join(REPORT_DIR, "media-autopilot-d1.sql"), d1Sql(report));
  write(join(OUT, "assets", "media-autopilot-latest.json"), JSON.stringify(report, null, 2));
  console.log(`Media autopilot ${report.status}; assets=${report.assets_count}, injected_pages=${injected_pages}.`);
}

run().catch((error) => { console.error(error); process.exit(1); });
