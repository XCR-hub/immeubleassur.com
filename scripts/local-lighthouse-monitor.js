import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

const SITE = env("SITE_ORIGIN", "https://immeubleassur.com").replace(/\/$/, "");
const REPORT_DIR = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const REPORT_PATH = resolve(env("LOCAL_LIGHTHOUSE_REPORT", join(REPORT_DIR, "local-lighthouse-report.json")));
const HISTORY_PATH = resolve(env("LOCAL_LIGHTHOUSE_HISTORY", join(REPORT_DIR, "local-lighthouse-history.jsonl")));
const requestedUrl = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "";
const defaultUrls = [`${SITE}/`, `${SITE}/devis-assurance-immeuble`, `${SITE}/assurance-immeuble`];
const rotationSlot = Math.floor(Date.now() / (6 * 3600000)) % defaultUrls.length;
const urls = requestedUrl ? [requestedUrl] : [defaultUrls[rotationSlot]];

function numberEnv(name, fallback) {
  const value = Number(env(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

const requestedSamples = process.argv.includes("--samples") ? Number(process.argv[process.argv.indexOf("--samples") + 1]) : numberEnv("LOCAL_LIGHTHOUSE_SAMPLES", 3);
const samplesPerUrl = Math.max(1, Math.min(5, Number.isFinite(requestedSamples) ? Math.round(requestedSamples) : 3));

const thresholds = {
  performance: numberEnv("LOCAL_LIGHTHOUSE_MIN_PERFORMANCE", 80),
  seo: numberEnv("LOCAL_LIGHTHOUSE_MIN_SEO", 95),
  accessibility: numberEnv("LOCAL_LIGHTHOUSE_MIN_ACCESSIBILITY", 90),
  lcp_ms: numberEnv("LOCAL_LIGHTHOUSE_MAX_LCP_MS", 2500),
  cls: numberEnv("LOCAL_LIGHTHOUSE_MAX_CLS", 0.1),
  tbt_ms: numberEnv("LOCAL_LIGHTHOUSE_MAX_TBT_MS", 300)
};

function score(category) {
  return Math.round(Number(category?.score || 0) * 100);
}

function metric(audits, id, precision = 0) {
  const value = Number(audits?.[id]?.numericValue);
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function topAuditItems(audits, id, fields, sortField, limit = 5) {
  const items = Array.isArray(audits?.[id]?.details?.items) ? audits[id].details.items : [];
  return items
    .map((item) => Object.fromEntries(fields.map((field) => [field, item?.[field] ?? null])))
    .filter((item) => Number(item[sortField]) > 0)
    .sort((a, b) => Number(b[sortField]) - Number(a[sortField]))
    .slice(0, limit);
}

function diagnostics(audits) {
  return {
    long_tasks: topAuditItems(audits, "long-tasks", ["url", "duration", "startTime"], "duration"),
    bootup_time: topAuditItems(audits, "bootup-time", ["url", "total", "scripting", "scriptParseCompile"], "total"),
    unused_javascript: topAuditItems(audits, "unused-javascript", ["url", "totalBytes", "wastedBytes", "wastedPercent"], "wastedBytes")
  };
}

function median(values, precision = 0) {
  const valid = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  const value = valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function evaluate(row) {
  const issues = [];
  if (row.performance < thresholds.performance) issues.push(`performance<${thresholds.performance}`);
  if (row.seo < thresholds.seo) issues.push(`seo<${thresholds.seo}`);
  if (row.accessibility < thresholds.accessibility) issues.push(`accessibility<${thresholds.accessibility}`);
  if (row.lcp_ms !== null && row.lcp_ms > thresholds.lcp_ms) issues.push(`lcp>${thresholds.lcp_ms}ms`);
  if (row.cls !== null && row.cls > thresholds.cls) issues.push(`cls>${thresholds.cls}`);
  if (row.tbt_ms !== null && row.tbt_ms > thresholds.tbt_ms) issues.push(`tbt>${thresholds.tbt_ms}ms`);
  return issues;
}

function trimHistory(path, maxLines = 720) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length > maxLines) writeFileSync(path, `${lines.slice(-maxLines).join("\n")}\n`, "utf8");
}

async function run() {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  mkdirSync(dirname(HISTORY_PATH), { recursive: true });
  const chromePath = env("CHROME_PATH", "") || chromeLauncher.Launcher.getInstallations()[0];
  const chromeProfile = resolve(env("LOCAL_LIGHTHOUSE_CHROME_PROFILE", join(REPORT_DIR, "lighthouse-chrome-profile")));
  mkdirSync(chromeProfile, { recursive: true });
  if (!chromePath) throw new Error("Chrome ou Chromium introuvable");
  const chrome = await chromeLauncher.launch({ chromePath, userDataDir: chromeProfile, chromeFlags: ["--headless=new", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check"] });
  const rows = [];
  try {
    for (const url of urls) {
      try {
        const samples = [];
        const sampleErrors = [];
        for (let sample = 1; sample <= samplesPerUrl; sample += 1) {
          try {
            let result;
            for (let attempt = 1; attempt <= 2; attempt += 1) {
              result = await lighthouse(url, { port: chrome.port, logLevel: "error", output: "json", onlyCategories: ["performance", "seo", "accessibility"], formFactor: "mobile", maxWaitForLoad: 45000 });
              if (!result?.lhr?.runtimeError || result.lhr.runtimeError.code !== "NO_NAVSTART") break;
            }
            if (result?.lhr?.runtimeError) throw new Error((result.lhr.runtimeError.code || "runtime-error") + ": " + (result.lhr.runtimeError.message || "Lighthouse runtime error"));
            const categories = result?.lhr?.categories || {};
            const audits = result?.lhr?.audits || {};
            samples.push({ sample, final_url: result?.lhr?.finalUrl || url, lighthouse_version: result?.lhr?.lighthouseVersion || "", performance: score(categories.performance), seo: score(categories.seo), accessibility: score(categories.accessibility), fcp_ms: metric(audits, "first-contentful-paint"), lcp_ms: metric(audits, "largest-contentful-paint"), cls: metric(audits, "cumulative-layout-shift", 3), tbt_ms: metric(audits, "total-blocking-time"), speed_index_ms: metric(audits, "speed-index"), diagnostics: diagnostics(audits) });
          } catch (error) {
            sampleErrors.push({ sample, error: String(error.message || "Lighthouse sample failed").slice(0, 500) });
          }
        }
        if (!samples.length) throw new Error(sampleErrors.map((item) => item.error).join(" | ") || "All Lighthouse samples failed");
        const medianTbt = median(samples.map((item) => item.tbt_ms));
        const representative = [...samples].sort((a, b) => Math.abs(Number(a.tbt_ms) - medianTbt) - Math.abs(Number(b.tbt_ms) - medianTbt))[0];
        const row = {
          url,
          final_url: samples.at(-1)?.final_url || url,
          ok: true,
          lighthouse_version: samples[0]?.lighthouse_version || "",
          sample_count: samples.length,
          samples_requested: samplesPerUrl,
          aggregation: "median",
          performance: median(samples.map((item) => item.performance)),
          seo: median(samples.map((item) => item.seo)),
          accessibility: median(samples.map((item) => item.accessibility)),
          fcp_ms: median(samples.map((item) => item.fcp_ms)),
          lcp_ms: median(samples.map((item) => item.lcp_ms)),
          cls: median(samples.map((item) => item.cls), 3),
          tbt_ms: medianTbt,
          speed_index_ms: median(samples.map((item) => item.speed_index_ms)),
          diagnostics: representative?.diagnostics || {},
          samples,
          sample_errors: sampleErrors
        };
        row.issues = evaluate(row);
        if (samples.length < samplesPerUrl) row.issues.push(`samples<${samplesPerUrl}`);
        rows.push(row);
      } catch (error) {
        rows.push({ url, ok: false, error: String(error.message || "Lighthouse failed").slice(0, 500), issues: ["audit-failed"] });
      }
    }
  } finally {
    try { await chrome.kill(); } catch { /* Windows peut encore verrouiller le dossier temporaire apres l arret de Chrome. */ }
  }

  const valid = rows.filter((row) => row.ok);
  const report = {
    generated_at: new Date().toISOString(),
    status: !valid.length ? "failed" : rows.some((row) => !row.ok || row.issues.length) ? "degraded" : "healthy",
    engine: "lighthouse-local",
    lighthouse_version: valid[0]?.lighthouse_version || "",
    chrome_path: chromePath,
    chrome_profile: chromeProfile,
    samples_per_url: samplesPerUrl,
    aggregation: "median",
    checked: rows.length,
    rotation_slot: requestedUrl ? null : rotationSlot,
    successful: valid.length,
    thresholds,
    averages: valid.length ? {
      performance: Math.round(valid.reduce((sum, row) => sum + row.performance, 0) / valid.length),
      seo: Math.round(valid.reduce((sum, row) => sum + row.seo, 0) / valid.length),
      accessibility: Math.round(valid.reduce((sum, row) => sum + row.accessibility, 0) / valid.length)
    } : null,
    rows
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  appendFileSync(HISTORY_PATH, `${JSON.stringify({ generated_at: report.generated_at, status: report.status, averages: report.averages, rows: rows.map(({ url, ok, performance, seo, accessibility, fcp_ms, lcp_ms, cls, tbt_ms, issues }) => ({ url, ok, performance, seo, accessibility, fcp_ms, lcp_ms, cls, tbt_ms, issues })) })}\n`, "utf8");
  trimHistory(HISTORY_PATH);
  console.log(`Local Lighthouse ${report.status}: ${report.successful}/${report.checked} pages, performance=${report.averages?.performance || 0}, SEO=${report.averages?.seo || 0}, accessibility=${report.averages?.accessibility || 0}.`);
  if (!valid.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
