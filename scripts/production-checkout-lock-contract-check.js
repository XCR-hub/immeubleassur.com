import { readFileSync } from "node:fs";

const runtime = readFileSync("scripts/local-runtime-task.ps1", "utf8");
const deploy = readFileSync("scripts/update-local-production-checkout.ps1", "utf8");
const mutex = "Global\\ImmeubleAssurProductionCheckout";
const checks = [
  ["shared-named-mutex", runtime.includes(mutex) && deploy.includes(mutex)],
  ["authenticated-users-have-minimal-wait-rights", runtime.includes("S-1-5-11") && deploy.includes("S-1-5-11") && runtime.includes("MutexRights]::Modify") && runtime.includes("MutexRights]::Synchronize") && !runtime.includes("S-1-1-0") && !deploy.includes("S-1-1-0")],
  ["runtime-waits-for-checkout-lock", runtime.includes("WaitOne([TimeSpan]::FromMinutes(25))")],
  ["deployment-waits-for-runtime-lock", deploy.includes("LockTimeoutSeconds = 1500") && deploy.includes("WaitOne([TimeSpan]::FromSeconds($LockTimeoutSeconds))")],
  ["runtime-releases-lock-in-finally", runtime.includes("} finally {") && runtime.includes("ReleaseMutex()")],
  ["deployment-releases-lock-in-finally", deploy.includes("} finally {") && deploy.includes("ReleaseMutex()")],
  ["dirty-production-checkout-rejected", deploy.includes("status', '--porcelain") && deploy.includes("uncommitted changes")],
  ["production-branch-pinned", deploy.includes("symbolic-ref', '--short', 'HEAD") && deploy.includes("expected '$Branch'")],
  ["updates-are-fast-forward-only", deploy.includes("pull', '--ff-only', $Remote, $Branch")],
  ["native-git-stderr-does-not-bypass-exit-code", deploy.includes("$previousErrorAction = $ErrorActionPreference") && deploy.includes("$exitCode = $LASTEXITCODE") && deploy.includes("if ($exitCode -ne 0)") && deploy.includes("$ErrorActionPreference = $previousErrorAction")],
  ["deployment-report-has-revisions", deploy.includes("revision_before") && deploy.includes("revision_after")],
  ["deployment-report-is-utf8-without-bom", deploy.includes("[IO.File]::WriteAllText") && deploy.includes("[Text.UTF8Encoding]::new($false)") && !deploy.includes("Set-Content -LiteralPath $ReportPath")],
  ["validation-mode-does-not-pull", deploy.includes("if (-not $ValidateOnly)")]
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Production checkout lock contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }
