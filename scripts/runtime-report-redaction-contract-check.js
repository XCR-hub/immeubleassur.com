import { readFileSync } from "node:fs";
import { redactLocalPaths, reportFileName } from "./runtime-report-redaction.js";

const drive = "E:\\private\\runtime\\reports\\secret.json";
const unc = "\\\\SERVER\\share\\runtime\\secret.json";
const mixed = `Rapport: ${drive}\nErreur suivante conservee\nMiroir: ${unc}`;
const redacted = redactLocalPaths(mixed);
const cycle = readFileSync("scripts/local-runtime-report-cycle.js", "utf8");
const checks = [
  ["drive-path-redacted", !redacted.includes("E:") && redacted.includes("Rapport: [local-path]")],
  ["unc-path-redacted", !redacted.includes("SERVER") && redacted.includes("Miroir: [network-path]")],
  ["unrelated-diagnostic-retained", redacted.includes("Erreur suivante conservee")],
  ["basename-only-for-public-assets", reportFileName(drive) === "secret.json" && reportFileName(unc) === "secret.json"],
  ["runtime-roots-not-exported", !cycle.includes("runtime_reports_root:") && !cycle.includes("runtime_assets_root:")],
  ["all-step-diagnostics-redacted", cycle.includes('command: clean(`node ${args.join(" ")}`)') && cycle.includes('error: clean(result.error?.message || "")')],
  ["runtime-safeguards-exported", cycle.includes('"stdout-stderr-path-redaction"') && cycle.includes('"storage-roots-not-exported"')]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length) throw new Error(`Runtime report redaction failed: ${missing.join(", ")}`);
console.log(`Runtime report redaction contract passed: ${checks.length}/${checks.length}.`);