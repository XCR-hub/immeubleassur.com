import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();

const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";

const monitor = readFileSync("scripts/local-lighthouse-monitor.js", "utf8");
const runner = readFileSync("scripts/live-ready-connectors-runner.js", "utf8");
const required = [
  ["three-samples-default", monitor.includes('numberEnv("LOCAL_LIGHTHOUSE_SAMPLES", 3)')],
  ["sample-cli-override", monitor.includes('process.argv.includes("--samples")')],
  ["bounded-sample-count", monitor.includes("Math.max(1, Math.min(5")],
  ["median-aggregation", monitor.includes("function median(values") && monitor.includes('aggregation: "median"')],
  ["raw-samples-preserved", monitor.includes("samples,") && monitor.includes("sample_errors: sampleErrors")],
  ["partial-sample-degrades", monitor.includes("row.issues.push(`samples<${samplesPerUrl}`)")],
  ["connector-timeout-supports-three-samples", /"pagespeed-local"[^\n]+timeoutMs:\s*240000/.test(runner)]
];

const missing = required.filter(([, ok]) => !ok).map(([name]) => name);
const report = {
  generated_at: new Date().toISOString(),
  status: missing.length ? "failed" : "passed",
  checks: required.length,
  missing,
  safeguards: ["median-not-single-run", "raw-sample-evidence", "bounded-runtime", "partial-failure-visible"]
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(join(reportDir, "local-lighthouse-contract-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (missing.length) {
  console.error(`Local Lighthouse contract failed: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`Local Lighthouse contract passed for ${required.length} checks.`);
