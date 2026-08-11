export const EXPECTED_SCHEDULED_TASKS = {
  "ImmeubleAssur Caddy Proxy": 1440,
  "ImmeubleAssur Conversion Action Sync": 90,
  "ImmeubleAssur Conversion Funnel Monitor": 90,
  "ImmeubleAssur Lead Quality Monitor": 90,
  "ImmeubleAssur Lead SLA Monitor": 45,
  "ImmeubleAssur Local Site": 20,
  "ImmeubleAssur Production Monitor": 45,
  "ImmeubleAssur Production Update": 30,
  "ImmeubleAssur Runtime Reports": 90,
  "ImmeubleAssur SEO Backlog Monitor": 90,
  "ImmeubleAssur SQLite Backup": 420
};

export const EXPECTED_SCHEDULED_TASK_ACTIONS = {
  "ImmeubleAssur Caddy Proxy": ["caddy.exe", "Caddyfile"],
  "ImmeubleAssur Conversion Action Sync": ["powershell.exe", "run-conversion-action-sync.ps1"],
  "ImmeubleAssur Conversion Funnel Monitor": ["powershell.exe", "run-conversion-funnel-monitor.ps1"],
  "ImmeubleAssur Lead Quality Monitor": ["powershell.exe", "run-lead-quality-monitor.ps1"],
  "ImmeubleAssur Lead SLA Monitor": ["powershell.exe", "run-lead-sla-monitor.ps1"],
  "ImmeubleAssur Local Site": ["node.exe", "local-site-watchdog.js"],
  "ImmeubleAssur Production Monitor": ["powershell.exe", "local-production-monitor-task.ps1"],
  "ImmeubleAssur Production Update": ["powershell.exe", "update-local-production-checkout.ps1"],
  "ImmeubleAssur Runtime Reports": ["powershell.exe", "local-runtime-task.ps1"],
  "ImmeubleAssur SEO Backlog Monitor": ["powershell.exe", "run-seo-backlog-monitor.ps1"],
  "ImmeubleAssur SQLite Backup": ["powershell.exe", "local-sqlite-backup-task.ps1"]
};

export function classifyScheduledTask(task, now = Date.now(), options = {}) {
  const maxAgeMinutes = EXPECTED_SCHEDULED_TASKS[task?.task_name];
  if (!maxAgeMinutes) return { healthy: true, issues: [] };
  const issues = [];
  const state = String(task.state || "").toLowerCase();
  const result = Number(task.last_result);
  const lastRunMs = Date.parse(task.last_run || "");
  const ageMinutes = Number.isFinite(lastRunMs) ? Math.max(0, (now - lastRunMs) / 60000) : null;
  const principalSid = String(task.principal_sid || "").toLowerCase();
  const principal = String(task.principal_user || "").toLocaleLowerCase("fr-FR");
  const identityValid = principalSid ? principalSid === "s-1-5-18" : ["system", "s-1-5-18", "système", "systeme"].includes(principal);
  const principalValid = identityValid && String(task.logon_type || "").toLowerCase() === "serviceaccount" && String(task.run_level || "").toLowerCase() === "highest";
  const [expectedExecutable, expectedMarker] = EXPECTED_SCHEDULED_TASK_ACTIONS[task.task_name] || [];
  const execute = String(task.execute || "").replace(/\\/g, "/").toLowerCase();
  const argumentsText = String(task.arguments || "").replace(/\\/g, "/").toLowerCase();
  const actionValid = Boolean(expectedExecutable && expectedMarker && execute.endsWith(expectedExecutable.toLowerCase()) && argumentsText.includes(expectedMarker.toLowerCase()));
  if (task.enabled !== true) issues.push("disabled");
  if (!["ready", "running"].includes(state)) issues.push(`state-${state || "unknown"}`);
  if (!options.ignoreLastResult && ![0, 0x41301].includes(result)) issues.push(`last-result-${result}`);
  if (ageMinutes === null) issues.push("never-ran");
  else if (ageMinutes > maxAgeMinutes) issues.push("stale");
  if (!principalValid) issues.push("principal-invalid");
  if (!actionValid) issues.push("action-invalid");
  return { healthy: issues.length === 0, issues, age_minutes: ageMinutes === null ? null : Math.round(ageMinutes * 10) / 10, max_age_minutes: maxAgeMinutes, principal_valid: principalValid, action_valid: actionValid };
}
