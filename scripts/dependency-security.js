export function summarizeDependencyAudit(audit = {}) {
  const counts = audit?.metadata?.vulnerabilities || {};
  const summary = {
    info: Number(counts.info || 0),
    low: Number(counts.low || 0),
    moderate: Number(counts.moderate || 0),
    high: Number(counts.high || 0),
    critical: Number(counts.critical || 0),
    total: Number(counts.total || 0)
  };
  const blocking = summary.high + summary.critical;
  return { summary, blocking, status: blocking ? "failed" : summary.total ? "degraded" : "healthy" };
}
export function dependencyAuditCacheDecision(previous, currentLockfileSha256, maxAgeHours, now = Date.now()) {
  const lastAt = Date.parse(previous?.last_successful_audit_at || previous?.generated_at || "");
  const ageHours = Number.isFinite(lastAt) ? Math.max(0, (now - lastAt) / 3600000) : Infinity;
  const lockfileMatches = Boolean(currentLockfileSha256 && previous?.lockfile_sha256 === currentLockfileSha256);
  const trustedPrevious = Boolean(previous?.registry_checked === true && previous?.last_successful_audit_at && previous?.lockfile_sha256);
  return { age_hours: ageHours, lockfile_matches: lockfileMatches, trusted_previous: trustedPrevious, reusable: trustedPrevious && lockfileMatches && ageHours <= maxAgeHours };
}
export function evaluateDependencySecurityReport(report = {}, now = Date.now(), registryGraceHours = 48) {
  const generatedAt = Date.parse(report.generated_at || "");
  const lastSuccessfulAt = Date.parse(report.last_successful_audit_at || "");
  const generatedAgeMinutes = Number.isFinite(generatedAt) ? Math.max(0, (now - generatedAt) / 60000) : Infinity;
  const auditAgeHours = Number.isFinite(lastSuccessfulAt) ? Math.max(0, (now - lastSuccessfulAt) / 3600000) : Infinity;
  const blocking = Number(report.blocking || 0);
  const total = Number(report.summary?.total || 0);
  const reportMaxAgeHours = Math.max(1, Number(report.cache_max_age_hours || 24)) + 2;
  const lockfileBound = report.registry_checked === true || report.last_success_applies_to_lockfile === true;
  const base = { generated_age_minutes: generatedAgeMinutes, report_max_age_hours: reportMaxAgeHours, audit_age_hours: auditAgeHours, blocking, total, registry_checked: report.registry_checked === true, lockfile_bound: lockfileBound };
  if (generatedAgeMinutes > reportMaxAgeHours * 60) return { ...base, ok: false, severity: "fail", reason: "report-stale" };
  if (report.success !== true || blocking > 0) return { ...base, ok: false, severity: "fail", reason: "blocking-vulnerability" };
  if (!Number.isFinite(auditAgeHours) || !lockfileBound) return { ...base, ok: false, severity: "fail", reason: "audit-proof-untrusted" };
  if (report.registry_checked === true) return total > 0 ? { ...base, ok: false, severity: "warn", reason: "non-blocking-vulnerabilities" } : { ...base, ok: true, severity: "fail", reason: "fresh-registry-audit" };
  if (auditAgeHours <= registryGraceHours) return { ...base, ok: false, severity: "warn", reason: "registry-temporarily-unavailable" };
  return { ...base, ok: false, severity: "fail", reason: "last-successful-audit-too-old" };
}
