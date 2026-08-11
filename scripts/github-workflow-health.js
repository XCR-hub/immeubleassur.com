function nextDailyScheduleAfter(timestamp, hourUtc, minuteUtc) {
  const after = new Date(timestamp);
  const next = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), hourUtc, minuteUtc));
  if (next.getTime() <= after.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

export function classifyWorkflowHealth(scheduled, recovery, now = Date.now(), maxAgeHours = 36, schedule = null) {
  const scheduledAt = Date.parse(scheduled?.updated_at || scheduled?.created_at || "");
  const ageHours = Number.isFinite(scheduledAt) ? Math.max(0, (now - scheduledAt) / 3600000) : Infinity;
  const scheduledHealthy = scheduled?.status === "completed" && scheduled?.conclusion === "success" && ageHours <= maxAgeHours;
  const recoveryAt = Date.parse(recovery?.updated_at || recovery?.created_at || "");
  const recoveryAgeHours = Number.isFinite(recoveryAt) ? Math.max(0, (now - recoveryAt) / 3600000) : Infinity;
  const proofDueAt = schedule && Number.isFinite(recoveryAt) ? nextDailyScheduleAfter(recoveryAt, schedule.hour_utc, schedule.minute_utc) + schedule.grace_minutes * 60000 : null;
  const scheduledProofOverdue = Number.isFinite(proofDueAt) && now > proofDueAt && scheduledAt < recoveryAt;
  const recoveryHealthy = recovery?.event === "workflow_dispatch" && recovery?.status === "completed" && recovery?.conclusion === "success" && Number.isFinite(recoveryAt) && recoveryAt > scheduledAt && recoveryAgeHours <= maxAgeHours && recovery?.head_sha && !scheduledProofOverdue;
  return { healthy: Boolean(scheduledHealthy || recoveryHealthy), status: scheduledHealthy ? "healthy" : recoveryHealthy ? "recovered-awaiting-schedule" : scheduledProofOverdue ? "scheduled-proof-overdue" : ageHours > maxAgeHours ? "stale" : "failed", scheduled_age_hours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(1)) : null, recovery_age_hours: Number.isFinite(recoveryAgeHours) ? Number(recoveryAgeHours.toFixed(1)) : null, scheduled_success: Boolean(scheduledHealthy), recovery_verified: Boolean(recoveryHealthy), scheduled_proof_due_at: Number.isFinite(proofDueAt) ? new Date(proofDueAt).toISOString() : null };
}
