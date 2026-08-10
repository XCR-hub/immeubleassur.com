import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();

const editorial = readFileSync("scripts/editorial-autopilot.js", "utf8");
const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const reportPath = join(reportDir, "editorial-publication-gate-report.json");

const checks = [
  ["publication-gate-evaluated", editorial.includes("evaluatePublicationGate(items, sourceResults)")],
  ["network-fetch-required", editorial.includes('if (!ENABLE_FETCH) reasons.push("network-fetch-disabled")')],
  ["healthy-source-quorum", editorial.includes('reasons.push("insufficient-healthy-sources")')],
  ["official-source-quorum", editorial.includes('reasons.push("insufficient-official-or-regulator-sources")')],
  ["attributable-item-quorum", editorial.includes('reasons.push("insufficient-attributable-items")')],
  ["fresh-evidence-required", editorial.includes('reasons.push("no-fresh-dated-official-evidence")')],
  ["writes-share-one-gate", /if \(publicWriteEnabled\) \{[\s\S]*veillePage[\s\S]*newsletterPage[\s\S]*issuePage[\s\S]*injectHubs[\s\S]*updateSitemap/.test(editorial)],
  ["runtime-cannot-publish", editorial.includes("const publicWriteEnabled = !RUNTIME_ONLY && publicationGate.ready")],
  ["last-valid-publication-held", editorial.includes('decision: reasons.length ? "hold-last-valid-publication"')],
  ["held-state-reported", editorial.includes('"held-insufficient-official-evidence"') && editorial.includes("published_issue: publicWriteEnabled")]
];

const forbidden = [
  ["ungated-watch-write", /if \(!RUNTIME_ONLY\) write\(join\(OUT, "veille-assurance-immeuble/.test(editorial)],
  ["ungated-news-write", /if \(!RUNTIME_ONLY\) write\(join\(OUT, `\$\{issue\.slug\}/.test(editorial)]
];

const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const forbiddenHits = forbidden.filter(([, hit]) => hit).map(([name]) => name);
const report = {
  generated_at: new Date().toISOString(),
  status: missing.length || forbiddenHits.length ? "failed" : "passed",
  checks: checks.length,
  missing,
  forbidden_checks: forbidden.length,
  forbidden_hits: forbiddenHits,
  policy: "new-publication-requires-fresh-attributable-official-evidence",
  failure_action: "preserve-last-valid-publication"
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (report.status !== "passed") {
  console.error(`Editorial publication gate failed: ${[...missing, ...forbiddenHits].join(", ")}`);
  process.exit(1);
}
console.log(`Editorial publication gate passed: ${checks.length} required checks, ${forbidden.length} forbidden checks.`);
