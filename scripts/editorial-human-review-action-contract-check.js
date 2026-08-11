import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalEditorialReviewStore } from "./local-editorial-review-store.js";
import { onRequestGet, onRequestPost } from "../functions/api/admin/editorial-review.js";

const root = join(tmpdir(), "immeubleassur-editorial-review-" + process.pid + "-" + Date.now());
const drafts = join(root, "drafts");
const report = join(root, "review-report.json");
const token = "editorial-review-contract-token";
const generatedAt = "2026-08-11T10:00:00.000Z";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function body(response) {
  return { status: response.status, json: await response.json() };
}

function request(url, options = {}) {
  return new Request(url, { ...options, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(options.headers || {}) } });
}

try {
  mkdirSync(drafts, { recursive: true });
  const draft = {
    marker: "editorial-ai-draft-review-v1",
    generated_at: generatedAt,
    publication_status: "quarantined",
    human_review_required: true,
    no_auto_publish: true,
    allowed_publication: false,
    legal_review: { sensitive: true, matched_terms: ["obligation"], human_review_required: true, allowed_publication: false, public_interpretation_allowed: false },
    issue: { title: "Veille juridique a verifier", slug: "news/test" },
    synthesis: { provider: "test", model: "test-model", text: "Brouillon sensible uniquement visible dans la revue admin." },
    source_items: [{ source_name: "Source officielle", title: "Texte source", url: "https://example.test/source", published_at: "2026-08-10" }]
  };
  writeFileSync(join(drafts, "draft-test.json"), JSON.stringify(draft, null, 2));
  writeFileSync(report, JSON.stringify({ review_queue: [{ file: "draft-test.json", issue: draft.issue.title, review_severity: "warning", age_days: 1.5 }] }, null, 2));

  const store = createLocalEditorialReviewStore({ draftsRoot: drafts, reviewReportPath: report });
  assert(store.listDrafts().length === 1, "pending draft should be listed");
  assert(store.readDraft("draft-test.json").synthesis.text.includes("Brouillon sensible"), "authenticated detail should expose review text");
  let traversalBlocked = false;
  try { store.readDraft("../draft-test.json"); } catch (error) { traversalBlocked = error.message === "review-id-invalid"; }
  assert(traversalBlocked, "path traversal should be blocked");

  const env = {
    ADMIN_API_TOKEN: token,
    LIST_EDITORIAL_REVIEWS: store.listDrafts,
    READ_EDITORIAL_REVIEW: store.readDraft,
    REVIEW_EDITORIAL_DRAFT: store.reviewDraft
  };
  const listResponse = await body(await onRequestGet({ request: request("https://immeubleassur.com/api/admin/editorial-review"), env }));
  assert(listResponse.status === 200 && listResponse.json.drafts.length === 1, "authenticated API should list pending reviews");
  const unauthorized = await onRequestGet({ request: new Request("https://immeubleassur.com/api/admin/editorial-review"), env });
  assert(unauthorized.status === 401, "review API should require admin authentication");

  const decisionResponse = await body(await onRequestPost({
    request: request("https://immeubleassur.com/api/admin/editorial-review", {
      method: "POST",
      body: JSON.stringify({ review_id: "draft-test.json", decision: "reference_only", reviewer: "contract-human", reason: "Sources a conserver pour reecriture humaine.", expected_generated_at: generatedAt })
    }),
    env
  }));
  assert(decisionResponse.status === 200 && decisionResponse.json.allowed_publication === false && decisionResponse.json.automatic_publication === false, "human decision must never publish automatically");
  const reviewed = JSON.parse(readFileSync(join(drafts, "draft-test.json"), "utf8"));
  assert(reviewed.publication_status === "human_reviewed_reference_only", "reference-only decision should resolve quarantine");
  assert(reviewed.allowed_publication === false && reviewed.no_auto_publish === true, "reviewed draft must remain forbidden for public publication");
  assert(reviewed.human_review?.marker === "editorial-human-review-v1" && reviewed.human_review?.reviewer === "contract-human", "human review should be audited");
  assert(store.listDrafts().length === 0, "reviewed draft should leave pending queue");

  const secondDecision = await onRequestPost({
    request: request("https://immeubleassur.com/api/admin/editorial-review", {
      method: "POST",
      body: JSON.stringify({ review_id: "draft-test.json", decision: "rejected", reviewer: "contract-human", reason: "Tentative concurrente refusee.", expected_generated_at: generatedAt })
    }),
    env
  });
  assert(secondDecision.status === 409, "already reviewed draft should reject a second decision");
  const source = readFileSync("scripts/local-editorial-review-store.js", "utf8");
  const api = readFileSync("functions/api/admin/editorial-review.js", "utf8");
  const admin = readFileSync("public/assets/admin.js", "utf8");
  assert(!source.includes('"published"') && !api.includes("approve_for_publication"), "workflow must expose no publication decision");
  assert(admin.includes("Le brouillon ne sera pas publie automatiquement"), "admin confirmation should state the no-publication safeguard");

  console.log("Editorial human review action contract passed: authenticated, atomic, audited, no auto publication.");
} finally {
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
}
