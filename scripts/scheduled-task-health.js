export const EXPECTED_SCHEDULED_TASKS = {
  "ImmeubleAssur Caddy Proxy": 1440,
  "ImmeubleAssur Conversion Action Sync": 90,
  "ImmeubleAssur Conversion Funnel Monitor": 90,
  "ImmeubleAssur Lead Quality Monitor": 90,
  "ImmeubleAssur Lead SLA Monitor": 45,
  "ImmeubleAssur Local Site": 20,
  "ImmeubleAssur Production Monitor": 45,
  "ImmeubleAssur Runtime Reports": 90,
  "ImmeubleAssur SEO Backlog Monitor": 90,
  "ImmeubleAssur SQLite Backup": 420
};

export function classifyScheduledTask(task, now = Date.now(), options = {}) {
  const maxAgeMinutes = EXPECTED_SCHEDULED_TASKS[task?.task_name];
  if (!maxAgeMinutes) return { healthy: true, issues: [] };
  const issues = [];
  const state = String(task.state || "").toLowerCase();
  const result = Number(task.last_result);
  const lastRunMs = Date.parse(task.last_run || "");
  const ageMinutes = Number.isFinite(lastRunMs) ? Math.max(0, (now - lastRunMs) / 60000) : null;
  if (task.enabled !== true) issues.push("disabled");
  if (!["ready", "running"].includes(state)) issues.push(`state-${state || "unknown"}`);
  if (!options.ignoreLastResult && ![0, 0x41301].includes(result)) issues.push(`last-result-${result}`);
  if (ageMinutes === null) issues.push("never-ran");
  else if (ageMinutes > maxAgeMinutes) issues.push("stale");
  return { healthy: issues.length === 0, issues, age_minutes: ageMinutes === null ? null : Math.round(ageMinutes * 10) / 10, max_age_minutes: maxAgeMinutes };
}
