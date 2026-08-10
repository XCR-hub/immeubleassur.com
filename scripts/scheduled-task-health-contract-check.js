import { classifyScheduledTask } from "./scheduled-task-health.js";

const now = Date.parse("2026-08-10T10:00:00.000Z");
const base = { task_name: "ImmeubleAssur Runtime Reports", state: "Ready", enabled: true, last_run: "2026-08-10T09:45:00.000Z", last_result: 0 };
const fixtures = [
  [base, true],
  [{ ...base, state: "Running", last_result: 0x41301 }, true],
  [{ ...base, enabled: false }, false],
  [{ ...base, state: "Disabled" }, false],
  [{ ...base, last_result: 1 }, false],
  [{ ...base, last_run: "2026-08-10T07:00:00.000Z" }, false],
  [{ ...base, last_run: "" }, false]
];
const productionMonitorFailure = { ...base, task_name: "ImmeubleAssur Production Monitor", last_result: 1 };
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
