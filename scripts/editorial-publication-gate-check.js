import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";
import { evaluatePublicationGate, publicationDate } from "./editorial-autopilot.js";

loadDefaultEnvFiles();

const editorial = readFileSync("scripts/editorial-autopilot.js", "utf8");
const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const reportPath = join(reportDir, "editorial-publication-gate-report.json");
const temporalNow = new Date("2026-08-10T12:00:00.000Z");
const temporalSources = [
  { source_id: "official-a", authority: "official", status: "healthy" },
  { source_id: "official-b", authority: "regulator", status: "healthy" },
  { source_id: "other", authority: "reference", status: "healthy" }
];
const temporalItems = (publishedAt) => [
  { source_id: "official-a", source_name: "Official A", title: "Signal A", url: "https://example.test/a", published_at: publishedAt },
  { source_id: "official-b", source_name: "Official B", title: "Signal B", url: "https://example.test/b", published_at: "" },
  { source_id: "other", source_name: "Other", title: "Signal C", url: "https://example.test/c", published_at: "" }
];
const nearFuture = evaluatePublicationGate(temporalItems("2026-08-10T17:00:00.000Z"), temporalSources, temporalNow);
const farFuture = evaluatePublicationGate(temporalItems("2026-08-11T12:00:00.000Z"), temporalSources, temporalNow);

const checks = [
  ["publication-gate-evaluated", editorial.includes("evaluatePublicationGate(items, sourceResults)")],
  ["network-fetch-required", editorial.includes('if (!ENABLE_FETCH) reasons.push("network-fetch-disabled")')],
  ["healthy-source-quorum", editorial.includes('reasons.push("insufficient-healthy-sources")')],
  ["official-source-quorum", editorial.includes('reasons.push("insufficient-official-or-regulator-sources")')],
  ["attributable-item-quorum", editorial.includes('reasons.push("insufficient-attributable-items")')],
  ["fresh-evidence-required", editorial.includes('reasons.push("no-fresh-dated-official-evidence")')],
  ["invalid-calendar-dates-rejected", publicationDate("31 fevrier 2026") === null && publicationDate("2026-02-31") === null],
  ["small-future-skew-tolerated", nearFuture.observed.fresh_dated_items === 1 && nearFuture.minimums.maximum_future_hours === 6],
  ["far-future-evidence-rejected", farFuture.observed.fresh_dated_items === 0 && farFuture.observed.future_dated_rejected_items === 1 && farFuture.reasons.includes("no-fresh-dated-official-evidence")],
  ["future-rejection-exported", editorial.includes("future_dated_rejected_items")],
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
