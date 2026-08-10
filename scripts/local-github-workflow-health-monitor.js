import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { env, loadDefaultEnvFiles } from "./local-env.js";
import { classifyWorkflowHealth } from "./github-workflow-health.js";
loadDefaultEnvFiles();
const reportPath = resolve(env("LOCAL_GITHUB_WORKFLOW_HEALTH_REPORT", join(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"), "local-github-workflow-health-report.json")));
const repository = env("GITHUB_WORKFLOW_HEALTH_REPOSITORY", "XCR-hub/immeubleassur.com");
const maxAgeHours = Math.max(24, Number(env("GITHUB_WORKFLOW_MAX_AGE_HOURS", "36")) || 36);
const workflows = ["seo-autopilot.yml", "editorial-autopilot.yml"];
function previousReport() { try { return JSON.parse(readFileSync(reportPath, "utf8")); } catch { return null; } }
async function latest(workflow, event) {
  const url = `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/runs?event=${event}&per_page=1`;
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "ImmeubleAssur-runtime-monitor" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  return (await response.json()).workflow_runs?.[0] || null;
}
function safeRun(run) {
  if (!run) return null;
  return { id: Number(run.id || 0), event: run.event || "", status: run.status || "", conclusion: run.conclusion || "", created_at: run.created_at || "", updated_at: run.updated_at || "", head_sha: String(run.head_sha || "").slice(0, 40), url: run.html_url || "" };
}
try {
  const checkedAt = Date.now();
  const rows = await Promise.all(workflows.map(async (workflow) => {
    const [scheduled, recovery] = await Promise.all([latest(workflow, "schedule"), latest(workflow, "workflow_dispatch")]);
    return { workflow, ...classifyWorkflowHealth(scheduled, recovery, checkedAt, maxAgeHours), scheduled: safeRun(scheduled), recovery: safeRun(recovery) };
  }));
  const report = { generated_at: new Date(checkedAt).toISOString(), status: rows.every((row) => row.status === "healthy") ? "healthy" : rows.every((row) => row.healthy) ? "recovered-awaiting-schedule" : "failed", success: rows.every((row) => row.healthy), repository, max_age_hours: maxAgeHours, workflows: rows, summary: { expected: rows.length, healthy: rows.filter((row) => row.healthy).length, scheduled_success: rows.filter((row) => row.scheduled_success).length, recovered: rows.filter((row) => row.recovery_verified).length, failed: rows.filter((row) => !row.healthy).length }, safeguards: ["public-metadata-only", "scheduled-run-observed", "manual-recovery-must-be-newer", "stale-run-detected", "no-github-token-required"] };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`GitHub workflow health ${report.status}: ${report.summary.healthy}/${report.summary.expected}, scheduled=${report.summary.scheduled_success}, recovered=${report.summary.recovered}.`);
  if (!report.success) process.exitCode = 1;
} catch (error) {
  const previous = previousReport();
  const previousAgeHours = previous?.generated_at ? (Date.now() - Date.parse(previous.generated_at)) / 3600000 : Infinity;
  const trusted = previous?.success === true && previousAgeHours <= 6;
  const report = { generated_at: new Date().toISOString(), status: trusted ? "degraded" : "failed", success: trusted, repository, max_age_hours: maxAgeHours, api_checked: false, previous_age_hours: Number.isFinite(previousAgeHours) ? Number(previousAgeHours.toFixed(1)) : null, error: String(error?.message || "GitHub API unavailable").slice(0, 160), safeguards: ["api-failure-visible", "six-hour-last-known-good-limit", "no-false-clean-without-cache"] };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`GitHub workflow health ${report.status}: API unavailable.`);
  if (!report.success) process.exitCode = 1;
}
