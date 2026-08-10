export function classifyWorkflowHealth(scheduled, recovery, now = Date.now(), maxAgeHours = 36) {
  const scheduledAt = Date.parse(scheduled?.updated_at || scheduled?.created_at || "");
  const ageHours = Number.isFinite(scheduledAt) ? Math.max(0, (now - scheduledAt) / 3600000) : Infinity;
  const scheduledHealthy = scheduled?.status === "completed" && scheduled?.conclusion === "success" && ageHours <= maxAgeHours;
  const recoveryAt = Date.parse(recovery?.updated_at || recovery?.created_at || "");
  const recoveryHealthy = recovery?.event === "workflow_dispatch" && recovery?.status === "completed" && recovery?.conclusion === "success" && Number.isFinite(recoveryAt) && recoveryAt > scheduledAt && recovery?.head_sha;
  return { healthy: Boolean(scheduledHealthy || recoveryHealthy), status: scheduledHealthy ? "healthy" : recoveryHealthy ? "recovered-awaiting-schedule" : ageHours > maxAgeHours ? "stale" : "failed", scheduled_age_hours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(1)) : null, scheduled_success: Boolean(scheduledHealthy), recovery_verified: Boolean(recoveryHealthy) };
}
