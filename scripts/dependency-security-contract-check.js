import { readFileSync } from "node:fs";
import { dependencyAuditCacheDecision, evaluateDependencySecurityReport, summarizeDependencyAudit } from "./dependency-security.js";

function audit(vulnerabilities) { return { metadata: { vulnerabilities } }; }
const fixtures = [
  [audit({ total: 0 }), "healthy", 0],
  [audit({ low: 1, total: 1 }), "degraded", 0],
  [audit({ moderate: 2, total: 2 }), "degraded", 0],
  [audit({ high: 1, total: 1 }), "failed", 1],
  [audit({ critical: 2, total: 2 }), "failed", 2]
];
const failures = fixtures.filter(([input, status, blocking]) => { const result = summarizeDependencyAudit(input); return result.status !== status || result.blocking !== blocking; });
const now = Date.parse("2026-08-10T20:00:00.000Z");
const previous = { generated_at: "2026-08-10T19:00:00.000Z", last_successful_audit_at: "2026-08-10T19:00:00.000Z", registry_checked: true, lockfile_sha256: "hash-a" };
const same = dependencyAuditCacheDecision(previous, "hash-a", 24, now);
const changed = dependencyAuditCacheDecision(previous, "hash-b", 24, now);
const stale = dependencyAuditCacheDecision(previous, "hash-a", 0.5, now);
const legacy = dependencyAuditCacheDecision({ ...previous, lockfile_sha256: undefined }, "hash-a", 24, now);
const freshRegistry = evaluateDependencySecurityReport({ generated_at: "2026-08-10T19:50:00.000Z", last_successful_audit_at: "2026-08-10T19:50:00.000Z", success: true, registry_checked: true, blocking: 0, summary: { total: 0 } }, now);
const temporaryRegistryFailure = evaluateDependencySecurityReport({ generated_at: "2026-08-10T19:55:00.000Z", last_successful_audit_at: "2026-08-09T20:00:00.000Z", success: true, registry_checked: false, last_success_applies_to_lockfile: true, blocking: 0, summary: { total: 0 } }, now);
const expiredRegistryFailure = evaluateDependencySecurityReport({ generated_at: "2026-08-10T19:55:00.000Z", last_successful_audit_at: "2026-08-07T20:00:00.000Z", success: true, registry_checked: false, last_success_applies_to_lockfile: true, blocking: 0, summary: { total: 0 } }, now);
const unboundRegistryFailure = evaluateDependencySecurityReport({ generated_at: "2026-08-10T19:55:00.000Z", last_successful_audit_at: "2026-08-10T19:00:00.000Z", success: true, registry_checked: false, last_success_applies_to_lockfile: false, blocking: 0, summary: { total: 0 } }, now);
const nonBlockingVulnerability = evaluateDependencySecurityReport({ generated_at: "2026-08-10T19:50:00.000Z", last_successful_audit_at: "2026-08-10T19:50:00.000Z", success: true, registry_checked: true, blocking: 0, summary: { low: 1, total: 1 } }, now);
const staleGeneratedReport = evaluateDependencySecurityReport({ generated_at: "2026-08-09T17:00:00.000Z", last_successful_audit_at: "2026-08-09T17:00:00.000Z", success: true, registry_checked: true, blocking: 0, summary: { total: 0 } }, now);
const monitor = readFileSync("scripts/local-dependency-security-monitor.js", "utf8");
const checks = [
  ["severity-classification", failures.length === 0],
  ["same-fresh-lockfile-cache-reusable", same.reusable === true && same.lockfile_matches === true],
  ["changed-lockfile-invalidates-cache", changed.reusable === false && changed.trusted_previous === true && changed.lockfile_matches === false],
  ["stale-cache-invalidated", stale.reusable === false && stale.lockfile_matches === true],
  ["legacy-unbound-cache-untrusted", legacy.reusable === false && legacy.trusted_previous === false],
  ["all-dependencies-audited", monitor.includes('[npmCli, "audit", "--json"]') && !monitor.includes('"--omit=dev"') && monitor.includes('scope: "all"')],
  ["lockfile-hash-persisted", monitor.includes("lockfile_sha256: lockfileSha256") && monitor.includes("lockfile-bound-cache")],
  ["new-lockfile-registry-failure-fails-closed", monitor.includes("const unsafeWithoutFreshAudit = !cache.trusted_previous || !cache.lockfile_matches") && monitor.includes('status: unsafeWithoutFreshAudit ? "failed" : "degraded"')],
  ["same-lockfile-last-known-result-retained", monitor.includes("last_success_applies_to_lockfile: cache.lockfile_matches")],
  ["audit-errors-redact-local-paths", monitor.includes("redactLocalPaths") && monitor.includes("no-local-paths-in-report")],
  ["fresh-registry-proof-is-healthy", freshRegistry.ok === true && freshRegistry.reason === "fresh-registry-audit"],
  ["temporary-registry-failure-is-warning", temporaryRegistryFailure.ok === false && temporaryRegistryFailure.severity === "warn" && temporaryRegistryFailure.reason === "registry-temporarily-unavailable"],
  ["expired-registry-proof-fails-closed", expiredRegistryFailure.ok === false && expiredRegistryFailure.severity === "fail" && expiredRegistryFailure.reason === "last-successful-audit-too-old"],
  ["unbound-registry-proof-fails-closed", unboundRegistryFailure.ok === false && unboundRegistryFailure.severity === "fail" && unboundRegistryFailure.reason === "audit-proof-untrusted"],
  ["non-blocking-vulnerability-remains-visible", nonBlockingVulnerability.ok === false && nonBlockingVulnerability.severity === "warn" && nonBlockingVulnerability.reason === "non-blocking-vulnerabilities"],
  ["freshness-uses-report-generation-too", staleGeneratedReport.ok === false && staleGeneratedReport.reason === "report-stale"]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length) {
  console.error(`Dependency security contract failed: ${missing.join(", ")}.`);
  process.exit(1);
}
console.log(`Dependency security contract: passed (${checks.length}/${checks.length}).`);