import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "immeubleassur-google-readiness-"));
const reports = join(root, "reports");
const assets = join(root, "runtime");
try {
  mkdirSync(reports, { recursive: true });
  const rows = [
    { id: "google-search-console", label: "GSC", ready: false, status: "fallback", missing_required_names: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY"] },
    { id: "pagespeed", label: "PageSpeed", ready: true, status: "ready", last_report: { status: "passed" } },
    { id: "ga4", label: "GA4", ready: false, status: "fallback", missing_required_names: ["GA4_MEASUREMENT_ID"] },
    { id: "serpapi", label: "SerpApi", ready: true, status: "ready", last_report: { status: "serpapi-rate-limited-fallback", summary: { rate_limited: true } } }
  ];
  writeFileSync(join(reports, "live-api-readiness-report.json"), JSON.stringify({ status: "partial", ready_count: 2, connectors_checked: 4, rows }), "utf8");
  const result = spawnSync(process.execPath, ["scripts/google-readiness-unlock.js"], { cwd: process.cwd(), env: { ...process.env, LOCAL_RUNTIME_REPORTS_ROOT: reports, LOCAL_RUNTIME_ASSETS_ROOT: assets }, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "google readiness process failed");
  const report = JSON.parse(readFileSync(join(reports, "google-readiness-unlock-report.json"), "utf8"));
  const serp = report.actions.find((item) => item.id === "serpapi");
  const checks = [
    ["rate-limited-reason-exported", serp?.reason === "rate-limited"],
    ["configured-key-remains-visible", serp?.configured === true],
    ["rate-limited-connector-not-operational", serp?.operational_ready === false && serp?.ready === false],
    ["last-runtime-status-not-masked", serp?.status === "serpapi-rate-limited-fallback"],
    ["degraded-connector-excluded-from-ready-count", report.google_ready_count === 1],
    ["semantic-safeguard-exported", report.safeguards.includes("configured-is-distinct-from-operational-ready")]
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length) throw new Error(`Google readiness semantics failed: ${missing.join(", ")}`);
  console.log(`Google readiness semantics contract passed: ${checks.length}/${checks.length}.`);
} finally {
  if (root.startsWith(tmpdir())) rmSync(root, { recursive: true, force: true });
}