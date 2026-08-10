import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { env, loadDefaultEnvFiles } from "./local-env.js";
import { EXPECTED_SCHEDULED_TASKS, classifyScheduledTask } from "./scheduled-task-health.js";

loadDefaultEnvFiles();
const reportPath = resolve(env("LOCAL_SCHEDULED_TASK_HEALTH_REPORT", join(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"), "local-scheduled-task-health-report.json")));
const command = `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; $rows = Get-ScheduledTask | Where-Object { $_.TaskName -like 'ImmeubleAssur*' } | ForEach-Object { $info=Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath; [pscustomobject]@{task_name=$_.TaskName;state=[string]$_.State;enabled=[bool]$_.Settings.Enabled;last_run=$info.LastRunTime.ToString('o');last_result=[long]$info.LastTaskResult;next_run=[string]$info.NextRunTime} }; $rows | ConvertTo-Json -Compress`;
const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand], { encoding: "utf8", windowsHide: true, timeout: 30000 });
if (result.status !== 0) {
  console.error(`Scheduled task health failed: ${String(result.stderr || result.error?.message || "PowerShell query failed").trim()}`);
  process.exit(1);
}
let discovered;
try { discovered = JSON.parse(String(result.stdout || "[]").replace(/^\\uFEFF/, "")); } catch (error) { console.error(`Scheduled task JSON parse failed: ${error.message}; stdout=${JSON.stringify(String(result.stdout || "").slice(0, 500))}; stderr=${JSON.stringify(String(result.stderr || "").slice(0, 500))}`); discovered = []; }
if (!Array.isArray(discovered)) discovered = discovered ? [discovered] : [];
const byName = new Map(discovered.map((task) => [task.task_name, task]));
const rows = Object.keys(EXPECTED_SCHEDULED_TASKS).map((taskName) => {
  const task = byName.get(taskName);
  if (!task) return { task_name: taskName, healthy: false, issues: ["missing"], age_minutes: null, max_age_minutes: EXPECTED_SCHEDULED_TASKS[taskName] };
  const ignoreLastResult = ["ImmeubleAssur Production Monitor", "ImmeubleAssur Runtime Reports"].includes(taskName);
  return { ...task, ...classifyScheduledTask(task, Date.now(), { ignoreLastResult }), last_result_ignored_for_cycle_dependency: ignoreLastResult };
});
const unhealthy = rows.filter((row) => !row.healthy);
const report = { generated_at: new Date().toISOString(), status: unhealthy.length ? "degraded" : "healthy", success: unhealthy.length === 0, summary: { expected: rows.length, healthy: rows.length - unhealthy.length, unhealthy: unhealthy.length }, rows };
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Scheduled task health ${report.status}: ${report.summary.healthy}/${report.summary.expected} healthy, ${report.summary.unhealthy} unhealthy.`);
if (!report.success) process.exit(1);
