import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const installer = readFileSync("scripts/install-local-site-watchdog-task.ps1", "utf8");
const watchdog = readFileSync("scripts/local-site-watchdog.js", "utf8");
const checks = [
  ["system-service-account", installer.includes("-UserId 'SYSTEM'") && installer.includes("-LogonType ServiceAccount") && installer.includes("S-1-5-18")],
  ["startup-trigger", installer.includes("New-ScheduledTaskTrigger -AtStartup")],
  ["five-minute-trigger", installer.includes("New-TimeSpan -Minutes 5") && installer.includes("PT5M")],
  ["single-instance", installer.includes("-MultipleInstances IgnoreNew")],
  ["watchdog-action", installer.includes("local-site-watchdog.js") && installer.includes("--site-dir") && installer.includes("--report")],
  ["post-registration-validation", installer.includes("Action watchdog invalide") && installer.includes("Declencheurs invalides")],
  ["watchdog-health-and-headers", watchdog.includes("runtimeCheck()") && watchdog.includes("requiredSecurityHeaders")],
  ["watchdog-targeted-process-discovery", watchdog.includes("WATCHDOG_PROCESS_MATCH_MARKER") && watchdog.includes("matchesSiteProcess")],
  ["watchdog-bounded-readiness-poll", watchdog.includes("async function waitForRuntime") && watchdog.includes("elapsed_ms") && watchdog.includes("await sleep(250)")],
  ["watchdog-empty-port-is-not-an-error", watchdog.includes("Get-NetTCPConnection") && watchdog.includes("-ErrorAction SilentlyContinue")]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, safeguards: ["system-service-account", "startup-plus-five-minute-recovery", "ignore-overlapping-runs", "health-and-security-header-gate", "site-scoped-process-restart", "bounded-readiness-poll"] };
const out = resolve(process.env.LOCAL_SITE_WATCHDOG_TASK_CONTRACT_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "local-site-watchdog-task-contract-report.json"));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Local site watchdog task contract: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (missing.length) process.exit(1);