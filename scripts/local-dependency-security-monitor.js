import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { env, loadDefaultEnvFiles } from "./local-env.js";
import { dependencyAuditCacheDecision, summarizeDependencyAudit } from "./dependency-security.js";
import { redactLocalPaths } from "./runtime-report-redaction.js";

loadDefaultEnvFiles();
const reportPath = resolve(env("LOCAL_DEPENDENCY_SECURITY_REPORT", join(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"), "local-dependency-security-report.json")));
const maxAgeHours = Math.max(1, Number(env("LOCAL_DEPENDENCY_AUDIT_MAX_AGE_HOURS", "24")) || 24);
const lockfilePath = resolve("package-lock.json");
const lockfileSha256 = existsSync(lockfilePath) ? createHash("sha256").update(readFileSync(lockfilePath)).digest("hex") : "";
function readReport() { try { return JSON.parse(readFileSync(reportPath, "utf8")); } catch { return null; } }
function writeReport(report) { mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"); }

const previous = existsSync(reportPath) ? readReport() : null;
const cache = dependencyAuditCacheDecision(previous, lockfileSha256, maxAgeHours);
if (cache.reusable) {
  console.log(`Dependency security ${previous.status}: cached audit age=${cache.age_hours.toFixed(1)}h, vulnerabilities=${Number(previous.summary?.total || 0)}.`);
  if (previous.status === "failed") process.exit(1);
  process.exit(0);
}
const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const result = spawnSync(process.execPath, [npmCli, "audit", "--json"], { cwd: process.cwd(), encoding: "utf8", windowsHide: true, timeout: 120000 });
let audit = null;
try { audit = JSON.parse(String(result.stdout || "")); } catch {}
if (audit?.metadata?.vulnerabilities) {
  const classified = summarizeDependencyAudit(audit);
  const report = { generated_at: new Date().toISOString(), last_successful_audit_at: new Date().toISOString(), status: classified.status, success: classified.blocking === 0, registry_checked: true, cache_max_age_hours: maxAgeHours, scope: "all", lockfile_sha256: lockfileSha256, summary: classified.summary, blocking: classified.blocking, safeguards: ["all-dependencies-audited", "daily-registry-check", "lockfile-bound-cache", "cache-invalidated-on-lockfile-change", "no-advisory-payload-public-export"] };
  writeReport(report);
  console.log(`Dependency security ${report.status}: vulnerabilities=${report.summary.total}, high=${report.summary.high}, critical=${report.summary.critical}.`);
  if (!report.success) process.exit(1);
  process.exit(0);
}
const unsafeWithoutFreshAudit = !cache.trusted_previous || !cache.lockfile_matches;
const error = redactLocalPaths(String(result.stderr || result.error?.message || "npm audit unavailable")).replace(/\s+/g, " ").trim().slice(0, 300);
const report = { generated_at: new Date().toISOString(), last_successful_audit_at: previous?.last_successful_audit_at || "", status: unsafeWithoutFreshAudit ? "failed" : "degraded", success: !unsafeWithoutFreshAudit, registry_checked: false, cache_max_age_hours: maxAgeHours, scope: "all", lockfile_sha256: lockfileSha256, last_success_applies_to_lockfile: cache.lockfile_matches, summary: previous?.summary || { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }, blocking: Number(previous?.blocking || 0), error, safeguards: ["registry-failure-visible", "last-known-result-retained-only-for-same-lockfile", "lockfile-change-fails-closed", "no-false-clean-status", "no-local-paths-in-report"] };
writeReport(report);
console.log(`Dependency security ${report.status}: registry unavailable; last successful audit age=${Number.isFinite(cache.age_hours) ? cache.age_hours.toFixed(1) : "unknown"}h, lockfile_match=${cache.lockfile_matches}.`);
if (!report.success) process.exit(1);