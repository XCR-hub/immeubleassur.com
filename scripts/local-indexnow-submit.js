import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();
const site = env("SITE_ORIGIN", "https://immeubleassur.com").replace(/\/$/, "");
const siteUrl = new URL(site);
const key = env("INDEXNOW_KEY", "d169136979c0451ea899c65ee7ee337d5ba8a445f2544bcbb89a3b055692177e");
const keyLocation = `${site}/${key}.txt`;
const configuredSitemapPath = env("INDEXNOW_SITEMAP", "");
const reportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"));
const runtimeAssetsRoot = resolve(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets")));
const publicationsRoot = resolve(env("LOCAL_RUNTIME_PUBLICATIONS_ROOT", join(runtimeAssetsRoot, "publications")));
const reportPath = resolve(env("LOCAL_INDEXNOW_REPORT", join(reportsRoot, "local-indexnow-report.json")));
const statePath = resolve(env("LOCAL_INDEXNOW_STATE", join(reportsRoot, "indexnow-state.json")));
const enabled = env("INDEXNOW_SUBMIT", "0") === "1";

function readJson(path) { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } }
function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function sitemapRows(xml) {
  return [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?[\s\S]*?<\/url>/gi)]
    .map((match) => ({ url: match[1].trim(), lastmod: (match[2] || "").trim() }))
    .filter((row) => { try { return new URL(row.url).host === siteUrl.host; } catch { return false; } });
}

function activeSitemap() {
  if (configuredSitemapPath) return { path: resolve(configuredSitemapPath), source: "configured", manifest_verified: false };
  const manifest = readJson(join(publicationsRoot, "current.json"));
  const sitemapArtifact = manifest?.marker === "runtime-editorial-publication-v1" && Array.isArray(manifest.files) ? manifest.files.find((file) => file.path === "sitemap.xml") : null;
  const candidate = manifest?.version ? join(publicationsRoot, "versions", manifest.version, "sitemap.xml") : "";
  if (candidate && sitemapArtifact?.sha256 && existsSync(candidate)) {
    const actualHash = createHash("sha256").update(readFileSync(candidate)).digest("hex");
    if (actualHash === sitemapArtifact.sha256) return { path: candidate, source: "active-runtime-publication", manifest_verified: true };
  }
  return { path: resolve("public", "sitemap.xml"), source: "static-fallback", manifest_verified: false };
}

async function run() {
  if (!/^[a-f0-9-]{8,128}$/i.test(key)) throw new Error("IndexNow key format invalid");
  const keyFile = resolve("public", `${key}.txt`);
  if (!existsSync(keyFile) || readFileSync(keyFile, "utf8").trim() !== key) throw new Error("IndexNow public key file missing or invalid");
  const sitemap = activeSitemap();
  const rows = sitemapRows(readFileSync(sitemap.path, "utf8"));
  const snapshot = Object.fromEntries(rows.map((row) => [row.url, row.lastmod]));
  const previous = readJson(statePath)?.snapshot || {};
  const firstRun = Object.keys(previous).length === 0;
  const recentCutoff = Date.now() - 7 * 86400000;
  const changed = rows.filter((row) => previous[row.url] !== row.lastmod && (!firstRun || (Number.isFinite(Date.parse(row.lastmod)) && Date.parse(row.lastmod) >= recentCutoff))).slice(0, 10000);
  const base = { generated_at: new Date().toISOString(), provider: "indexnow", endpoint: "https://api.indexnow.org/IndexNow", site, key_location: keyLocation, key_publicly_verifiable: true, sitemap_source: sitemap.source, sitemap_manifest_verified: sitemap.manifest_verified, sitemap_urls: rows.length, first_run: firstRun, changed_urls: changed.length, submitted_urls: 0, citation_or_ranking_guaranteed: false };
  const safeguards = ["same-host-only", "changed-urls-only", "state-deduplicated", "no-ranking-claim"];
  if (!enabled) { writeJson(reportPath, { ...base, success: true, status: "disabled", safeguards }); console.log(`IndexNow disabled: ${changed.length} changed URL(s) detected.`); return; }
  if (!changed.length) { writeJson(statePath, { updated_at: base.generated_at, snapshot }); writeJson(reportPath, { ...base, success: true, status: "no-changes", safeguards }); console.log("IndexNow no changes."); return; }
  let response;
  try {
    response = await fetch("https://api.indexnow.org/IndexNow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8", "user-agent": "ImmeubleAssur-IndexNow/1.0" }, body: JSON.stringify({ host: siteUrl.host, key, keyLocation, urlList: changed.map((row) => row.url) }), signal: AbortSignal.timeout(20000) });
  } catch (error) {
    writeJson(reportPath, { ...base, success: false, status: "network-degraded", error: String(error.message || error).slice(0, 300), safeguards: [...safeguards, "state-not-advanced-on-failure", "retry-next-cycle"] });
    console.log("IndexNow warning: network-degraded, retry scheduled.");
    return;
  }
  const body = (await response.text()).slice(0, 300);
  if (response.ok) {
    writeJson(statePath, { updated_at: base.generated_at, snapshot });
    writeJson(reportPath, { ...base, success: true, status: "submitted", http_status: response.status, submitted_urls: changed.length, safeguards });
    console.log(`IndexNow submitted: ${changed.length} URL(s), HTTP ${response.status}.`);
    return;
  }
  const transient = response.status === 429 || response.status >= 500;
  writeJson(reportPath, { ...base, success: false, status: transient ? "provider-degraded" : "rejected", http_status: response.status, response: body, safeguards: [...safeguards, "state-not-advanced-on-failure", "retry-next-cycle"] });
  console.log(`IndexNow ${transient ? "warning" : "failed"}: HTTP ${response.status}.`);
  if (!transient) process.exitCode = 1;
}

run().catch((error) => { writeJson(reportPath, { generated_at: new Date().toISOString(), success: false, status: "failed", error: String(error.message || error).slice(0, 500) }); console.error(error); process.exit(1); });
