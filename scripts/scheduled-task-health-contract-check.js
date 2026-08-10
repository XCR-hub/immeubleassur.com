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
const failures = fixtures.filter(([task, expected]) => classifyScheduledTask(task, now).healthy !== expected);
if (failures.length) {
  console.error(`Scheduled task health contract failed: ${failures.length}/${fixtures.length}.`);
  process.exit(1);
}
console.log(`Scheduled task health contract: passed (${fixtures.length}/${fixtures.length}).`);
