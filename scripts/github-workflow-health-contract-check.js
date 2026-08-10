import { classifyWorkflowHealth } from "./github-workflow-health.js";
const now = Date.parse("2026-08-11T12:00:00Z");
const run = (overrides = {}) => ({ event: "schedule", status: "completed", conclusion: "success", created_at: "2026-08-11T04:00:00Z", updated_at: "2026-08-11T04:10:00Z", head_sha: "a".repeat(40), ...overrides });
const fixtures = [
  [run(), null, "healthy", true],
  [run({ conclusion: "failure" }), null, "failed", false],
  [run({ conclusion: "failure" }), run({ event: "workflow_dispatch", updated_at: "2026-08-11T05:00:00Z" }), "recovered-awaiting-schedule", true],
  [run({ conclusion: "failure" }), run({ event: "workflow_dispatch", updated_at: "2026-08-11T03:00:00Z" }), "failed", false],
  [run({ updated_at: "2026-08-09T00:00:00Z" }), null, "stale", false],
  [null, null, "stale", false]
];
const failed = fixtures.filter(([scheduled, recovery, status, healthy]) => { const value = classifyWorkflowHealth(scheduled, recovery, now, 36); return value.status !== status || value.healthy !== healthy; });
if (failed.length) throw new Error(`GitHub workflow health contract failed: ${failed.length}/${fixtures.length}`);
console.log(`GitHub workflow health contract passed: ${fixtures.length}/${fixtures.length}.`);
