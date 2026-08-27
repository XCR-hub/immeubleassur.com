import { readFileSync } from "node:fs";

const installer = readFileSync("scripts/install-local-production-update-task.ps1", "utf8");
const deploy = readFileSync("scripts/update-local-production-checkout.ps1", "utf8");
const checks = [
  ["system-service-account", installer.includes("-UserId 'SYSTEM'") && installer.includes("-LogonType ServiceAccount") && installer.includes("S-1-5-18")],
  ["highest-run-level", installer.includes("-RunLevel Highest")],
  ["ten-minute-cadence", installer.includes("New-TimeSpan -Minutes 10") && installer.includes("PT10M")],
  ["offset-precedes-runtime-and-monitor", installer.includes("* 10) + 12") && installer.includes("($startMinute % 10) -ne 2")],
  ["single-instance", installer.includes("-MultipleInstances IgnoreNew")],
  ["bounded-execution", installer.includes("New-TimeSpan -Minutes 25")],
  ["locked-fast-forward-deployment", deploy.includes("Global\\ImmeubleAssurProductionCheckout") && deploy.includes("pull', '--ff-only'")],
  ["runtime-activation-and-proof", deploy.includes("local-site-watchdog.js") && deploy.includes("--force") && deploy.includes("runtime_revision_verified")],
  ["explicit-system-git-path", installer.includes("-GitPath") && installer.includes("PortableGit") && deploy.includes("& $GitPath -C $SiteRoot")],
  ["persistent-report", installer.includes("local-production-checkout-update-report.json") && installer.includes("-ReportPath")],
  ["new-revision-refreshes-editorial-runtime", deploy.includes("local-editorial-publisher.js") && deploy.includes("editorial_refresh_attempted") && deploy.includes("editorial_refresh_status") && deploy.includes("editorial-refresh-on-new-revision")]
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Production update task contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }
