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
