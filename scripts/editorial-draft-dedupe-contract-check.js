import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findEquivalentPendingDraft, sourceSetFingerprint } from "./editorial-draft-dedupe-policy.js";

const root = mkdtempSync(join(tmpdir(), "immeubleassur-draft-dedupe-"));
try {
  const sources = [{ url: "https://example.test/b" }, { url: "https://example.test/a" }, { url: "https://example.test/a" }];
  const draft = { marker: "editorial-ai-draft-review-v1", generated_at: "2026-08-10T08:00:00.000Z", publication_status: "quarantined", human_review_required: true, no_auto_publish: true, allowed_publication: false, source_items: sources };
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "news-existing.json"), JSON.stringify(draft), "utf8");
  writeFileSync(join(root, "news-approved.json"), JSON.stringify({ ...draft, allowed_publication: true, source_items: [{ url: "https://example.test/approved" }] }), "utf8");
  const equivalent = findEquivalentPendingDraft(root, [...sources].reverse());
  const changed = findEquivalentPendingDraft(root, [...sources, { url: "https://example.test/new" }]);
  const approved = findEquivalentPendingDraft(root, [{ url: "https://example.test/approved" }]);
  const autopilot = readFileSync("scripts/editorial-autopilot.js", "utf8");
  const checks = [
    ["fingerprint-order-and-duplicate-invariant", sourceSetFingerprint(sources) === sourceSetFingerprint([...sources].reverse())],
    ["exact-pending-source-set-reused", equivalent?.file === "news-existing.json"],
    ["changed-source-set-not-reused", changed === null],
    ["approved-draft-never-reused-as-pending", approved === null],
    ["empty-source-set-never-reused", findEquivalentPendingDraft(root, []) === null],
    ["ai-call-skipped-for-equivalent-pending-draft", autopilot.includes('status: "skipped-equivalent-pending-draft"') && /equivalentPendingDraft[\s\S]*?: await synthesize\(items\)/.test(autopilot)],
    ["human-review-remains-pending", autopilot.includes("const humanReviewPending = aiRequiresReview || Boolean(equivalentPendingDraft)")],
    ["no-new-draft-written-on-reuse", autopilot.includes("if (aiRequiresReview) write(draftReviewPath")]
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length) throw new Error(`Editorial draft dedupe failed: ${missing.join(", ")}`);
  console.log(`Editorial draft dedupe contract passed: ${checks.length}/${checks.length}.`);
} finally {
  if (root.startsWith(tmpdir())) rmSync(root, { recursive: true, force: true });
}