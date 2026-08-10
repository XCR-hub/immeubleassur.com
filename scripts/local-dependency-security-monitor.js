import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { env, loadDefaultEnvFiles } from "./local-env.js";
import { summarizeDependencyAudit } from "./dependency-security.js";

loadDefaultEnvFiles();
const reportPath = resolve(env("LOCAL_DEPENDENCY_SECURITY_REPORT", join(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"), "local-dependency-security-report.json")));
const maxAgeHours = Math.max(1, Number(env("LOCAL_DEPENDENCY_AUDIT_MAX_AGE_HOURS", "24")) || 24);
function readReport() { try { return JSON.parse(readFileSync(reportPath, "utf8")); } catch { return null; } }
function writeReport(report) { mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"); }
function ageHours(value) { const ms = Date.parse(value || ""); return Number.isFinite(ms) ? Math.max(0, (Date.now() - ms) / 3600000) : Infinity; }

const previous = existsSync(reportPath) ? readReport() : null;
const previousAge = ageHours(previous?.last_successful_audit_at || previous?.generated_at);
if (previous && previousAge <= maxAgeHours && previous.registry_checked === true) {
  console.log(`Dependency security ${previous.status}: cached audit age=${previousAge.toFixed(1)}h, vulnerabilities=${Number(previous.summary?.total || 0)}.`);
  if (previous.status === "failed") process.exit(1);
  process.exit(0);
}
const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const result = spawnSync(process.execPath, [npmCli, "audit", "--omit=dev", "--json"], { cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 120000 });
let audit = null;
try { audit = JSON.parse(String(result.stdout || "")); } catch {}
if (audit?.metadata?.vulnerabilities) {
  const classified = summarizeDependencyAudit(audit);
  const report = { generated_at: new Date().toISOString(), last_successful_audit_at: new Date().toISOString(), status: classified.status, success: classified.blocking === 0, registry_checked: true, cache_max_age_hours: maxAgeHours, scope: "production", summary: classified.summary, blocking: classified.blocking, safeguards: ["production-dependencies-only", "daily-registry-check", "cached-between-cycles", "no-advisory-payload-public-export"] };
  writeReport(report);
  console.log(`Dependency security ${report.status}: vulnerabilities=${report.summary.total}, high=${report.summary.high}, critical=${report.summary.critical}.`);
  if (!report.success) process.exit(1);
  process.exit(0);
}
const error = String(result.stderr || result.error?.message || "npm audit unavailable").replace(/\s+/g, " ").trim().slice(0, 300);
const report = { generated_at: new Date().toISOString(), last_successful_audit_at: previous?.last_successful_audit_at || "", status: "degraded", success: true, registry_checked: false, cache_max_age_hours: maxAgeHours, scope: "production", summary: previous?.summary || { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }, blocking: Number(previous?.blocking || 0), error, safeguards: ["registry-failure-visible", "last-known-result-retained", "no-false-clean-status"] };
writeReport(report);
console.log(`Dependency security degraded: registry unavailable; last successful audit age=${Number.isFinite(previousAge) ? previousAge.toFixed(1) : "unknown"}h.`);
