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