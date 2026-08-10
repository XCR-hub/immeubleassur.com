import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { sanitizePublicWatchItems } from "./editorial-public-metadata-policy.js";

loadDefaultEnvFiles();

const reportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"));
const assetsRoot = resolve(env("LOCAL_RUNTIME_ASSETS_ROOT", "public"));
const sourcePath = join(reportsRoot, "editorial-autopilot-report.json");
const outputPath = join(assetsRoot, "assets", "editorial-autopilot-latest.json");

if (!existsSync(sourcePath)) {
  console.error(`Editorial public metadata sanitizer: missing internal report ${sourcePath}.`);
  process.exitCode = 1;
} else {
  const report = JSON.parse(readFileSync(sourcePath, "utf8"));
  const publicReport = {
    generated_at: report.generated_at || new Date().toISOString(),
    status: "safe-public-metadata",
    publication_status: report.publication_status || "unknown",
    public_content_provider: report.public_content_provider || "deterministic",
    public_content_ai_generated: false,
    ai_draft_review_pending: report.human_review_required === true,
    legal_sensitive_draft_pending: report.legal_sensitive_draft === true,
    source_count: Number(report.source_count || 0),
    healthy_source_count: Number(report.healthy_source_count || 0),
    empty_source_count: Number(report.empty_source_count || 0),
    no_relevant_source_count: Number(report.no_relevant_source_count || 0),
    reference_verified_count: Number(report.reference_verified_count || 0),
    reference_unverified_count: Number(report.reference_unverified_count || 0),
    reference_access_restricted_count: Number(report.reference_access_restricted_count || 0),

    failed_source_count: Number(report.failed_source_count || 0),
    collection_status: report.collection_status || "unknown",
    public_watch_items: sanitizePublicWatchItems(report.public_watch_items),
    safeguards: ["no-ai-draft-content", "no-internal-paths", "no-provider-errors", "no-source-summaries", "no-future-publication-dates", "deterministic-public-content-only"]
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(publicReport, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, outputPath);
  console.log(`Editorial public metadata sanitizer: passed (${publicReport.public_watch_items.length} public signal(s)).`);
}
