import { classifyScheduledTask } from "./scheduled-task-health.js";

const now = Date.parse("2026-08-10T10:00:00.000Z");
const base = { task_name: "ImmeubleAssur Runtime Reports", state: "Ready", enabled: true, last_run: "2026-08-10T09:45:00.000Z", last_result: 0, principal_sid: "S-1-5-18", principal_user: "SYSTEM", logon_type: "ServiceAccount", run_level: "Highest", execute: "PowerShell.exe", arguments: "-File F:/site/scripts/local-runtime-task.ps1" };
const fixtures = [
  [base, true],
  [{ ...base, state: "Running", last_result: 0x41301 }, true],
  [{ ...base, enabled: false }, false],
  [{ ...base, state: "Disabled" }, false],
  [{ ...base, last_result: 1 }, false],
  [{ ...base, last_run: "2026-08-10T07:00:00.000Z" }, false],
  [{ ...base, last_run: "" }, false],
  [{ ...base, principal_sid: "S-1-5-21-1000", principal_user: "Administrateur" }, false],
  [{ ...base, logon_type: "InteractiveToken" }, false],
  [{ ...base, run_level: "Limited" }, false],
  [{ ...base, arguments: "-File C:/unexpected.ps1" }, false],
  [{ ...base, execute: "cmd.exe" }, false]
];
const productionMonitorFailure = { ...base, task_name: "ImmeubleAssur Production Monitor", arguments: "-File F:/site/scripts/local-production-monitor-task.ps1", last_result: 1 };
fixtures.push([productionMonitorFailure, false]);
const runtimeSelfFailure = { ...base, task_name: "ImmeubleAssur Runtime Reports", last_result: 1 };
const circularDependencyChecks = [
  classifyScheduledTask(productionMonitorFailure, now, { ignoreLastResult: true }).healthy === true,
  classifyScheduledTask(runtimeSelfFailure, now, { ignoreLastResult: true }).healthy === true,
  classifyScheduledTask({ ...productionMonitorFailure, enabled: false }, now, { ignoreLastResult: true }).healthy === false
];
const failures = fixtures.filter(([task, expected]) => classifyScheduledTask(task, now).healthy !== expected);
if (failures.length || circularDependencyChecks.includes(false)) {
  console.error(`Scheduled task health contract failed: ${failures.length + circularDependencyChecks.filter((ok) => !ok).length}/${fixtures.length + circularDependencyChecks.length}.`);
  process.exit(1);
}
console.log(`Scheduled task health contract: passed (${fixtures.length + circularDependencyChecks.length}/${fixtures.length + circularDependencyChecks.length}).`);
