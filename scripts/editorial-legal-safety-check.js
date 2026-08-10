import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();

const editorial = readFileSync("scripts/editorial-autopilot.js", "utf8");
const workflow = readFileSync(".github/workflows/editorial-autopilot.yml", "utf8");
const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const reportPath = join(reportDir, "editorial-legal-safety-report.json");

const checks = [
  ["ai-output-is-review-only", editorial.includes("Tu prepares uniquement un brouillon interne soumis a validation humaine")],
  ["legal-advice-forbidden-in-prompt", editorial.includes("Ne formule aucun conseil juridique ni interpretation definitive")],
  ["ai-provider-triggers-review", editorial.includes('const aiRequiresReview = synthesis.provider !== "deterministic"')],
  ["public-synthesis-falls-back-to-deterministic", /const publicSynthesis = aiRequiresReview[\s\S]*deterministicProvider\(\)[\s\S]*fallbackSynthesis\(items\)/.test(editorial)],
  ["public-pages-use-safe-synthesis", editorial.includes("veillePage(items, publicSynthesis, issue)") && editorial.includes("issuePage(issue, items, publicSynthesis)")],
  ["ai-draft-quarantined", editorial.includes('ai_draft_publication_status: humanReviewPending ? "quarantined"')],
  ["equivalent-pending-draft-remains-review-only", editorial.includes("const humanReviewPending = aiRequiresReview || Boolean(equivalentPendingDraft)") && editorial.includes('status: "skipped-equivalent-pending-draft"')],
  ["ai-publication-explicitly-forbidden", editorial.includes("ai_draft_allowed_publication: false") && editorial.includes("allowed_publication: false")],
  ["legal-sensitive-classifier", editorial.includes("function legalSensitivity(items, synthesis)") && editorial.includes('publication_gate: matched_terms.length ? "legal-human-approval"')],
  ["public-output-declared-non-ai", editorial.includes("public_content_ai_generated: false") && editorial.includes("public_content_provider: publicSynthesis.provider")],
  ["workflow-cannot-write-repository", /permissions:\s*\n\s*contents:\s*read/.test(workflow)],
  ["review-drafts-uploaded-privately", workflow.includes("reports/editorial-drafts/**/*.json")]
];

const forbidden = [
  ["raw-ai-on-watch-page", editorial.includes("veillePage(items, synthesis, issue)")],
  ["raw-ai-on-news-page", editorial.includes("issuePage(issue, items, synthesis)")],
  ["ai-draft-auto-publish-enabled", /ai_draft_allowed_publication:\s*true/.test(editorial)],
  ["workflow-write-permission", /contents:\s*write/.test(workflow)]
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
  policy: {
    ai_publication: "quarantined-until-human-approval",
    legal_sensitive_publication: "legal-human-approval-required",
    public_automatic_content: "deterministic-safe-fallback-only"
  },
  safeguards: ["static-dataflow-check", "read-only-cron-permissions", "private-review-artifacts", "no-raw-ai-publication"]
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (report.status !== "passed") {
  console.error(`Editorial legal safety failed: ${[...missing, ...forbiddenHits].join(", ")}`);
  process.exit(1);
}
console.log(`Editorial legal safety passed: ${checks.length} required checks, ${forbidden.length} forbidden checks.`);
