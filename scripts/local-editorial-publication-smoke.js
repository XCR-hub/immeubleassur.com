import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();
function readJson(path) { if (!existsSync(path)) return null; try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
async function fetchText(url) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "ImmeubleAssur editorial publication smoke" }, signal: AbortSignal.timeout(12000) });
    const text = await response.text();
    return { ok: response.ok, status: response.status, bytes: Buffer.byteLength(text), sha256: hash(Buffer.from(text, "utf8")), text };
  } catch (error) { return { ok: false, status: 0, bytes: 0, sha256: "", text: "", error: error.message || "fetch failed" }; }
}

const runtimeAssetsRoot = resolve(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets")));
const publicationsRoot = resolve(env("LOCAL_RUNTIME_PUBLICATIONS_ROOT", join(runtimeAssetsRoot, "publications")));
const reportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", join("data", "runtime-reports")));
const out = resolve(env("LOCAL_EDITORIAL_PUBLICATION_SMOKE_REPORT", join(reportsRoot, "local-editorial-publication-smoke-report.json")));
const origin = String(env("SITE_ORIGIN", "https://immeubleassur.com")).replace(/\/+$/, "");
const manifest = readJson(join(publicationsRoot, "current.json"));
const checks = [];

if (!manifest) checks.push({ name: "active_manifest", ok: false, error: "missing" });
else {
  checks.push({ name: "active_manifest", ok: manifest.marker === "runtime-editorial-publication-v1" && manifest.public_content_provider === "deterministic" && manifest.public_content_ai_generated === false && manifest.ai_draft_allowed_publication === false, version: manifest.version || "" });
  for (const relative of manifest.allowed_files || []) {
    const localPath = join(publicationsRoot, "versions", String(manifest.version || ""), ...relative.split("/"));
    const localHash = existsSync(localPath) ? createHash("sha256").update(readFileSync(localPath)).digest("hex") : "";
    const route = `/${relative.replace(/\.html$/, "")}`;
    const remote = await fetchText(`${origin}${route}`);
    checks.push({ name: `served:${route}`, ok: remote.ok && Boolean(localHash) && remote.sha256 === localHash, status: remote.status, local_sha256: localHash, remote_sha256: remote.sha256, bytes: remote.bytes, error: remote.error || (remote.sha256 !== localHash ? "content-hash-mismatch" : "") });
  }
}

const report = { success: checks.length >= 4 && checks.every((item) => item.ok), status: checks.length >= 4 && checks.every((item) => item.ok) ? "passed" : "failed", generated_at: new Date().toISOString(), origin, version: manifest?.version || "", issue: manifest?.issue || null, checks };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Editorial publication smoke: ${report.status} (${checks.filter((item) => item.ok).length}/${checks.length}).`);
if (!report.success) process.exit(1);
