import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

const PENDING_STATUSES = new Set(["quarantined", "draft_review"]);
const DECISIONS = {
  rejected: "human_rejected",
  reference_only: "human_reviewed_reference_only"
};

function clean(value, max = 500) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function safeUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function validReviewId(value) {
  const id = clean(value, 190);
  return /^[a-z0-9][a-z0-9._-]{0,180}\.json$/i.test(id) && basename(id) === id ? id : "";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isInside(root, file) {
  const prefix = root.endsWith(sep) ? root : root + sep;
  return file.startsWith(prefix);
}

function publicSummary(id, draft, queueItem = {}) {
  const generatedAt = clean(draft.generated_at, 80);
  const ageDays = Number.isFinite(Number(queueItem.age_days))
    ? Number(queueItem.age_days)
    : Math.max(0, Math.round(((Date.now() - Date.parse(generatedAt || "1970-01-01")) / 86400000) * 10) / 10);
  return {
    review_id: id,
    generated_at: generatedAt,
    issue: clean(draft.issue?.title || queueItem.issue || id, 300),
    slug: clean(draft.issue?.slug, 300),
    review_severity: clean(queueItem.review_severity || "pending", 30),
    age_days: ageDays,
    legal_sensitive: draft.legal_review?.sensitive === true,
    matched_terms: (draft.legal_review?.matched_terms || []).map((item) => clean(item, 80)).filter(Boolean).slice(0, 12),
    source_count: Array.isArray(draft.source_items) ? draft.source_items.length : 0,
    source_urls: (draft.source_items || []).map((item) => safeUrl(item.url)).filter(Boolean).slice(0, 12),
    publication_status: clean(draft.publication_status, 80),
    human_review_required: draft.human_review_required === true,
    allowed_publication: draft.allowed_publication === true
  };
}

function publicDetail(id, draft, queueItem = {}) {
  return {
    ...publicSummary(id, draft, queueItem),
    synthesis: {
      provider: clean(draft.synthesis?.provider, 80),
      model: clean(draft.synthesis?.model, 120),
      text: String(draft.synthesis?.text || "").slice(0, 40000)
    },
    sources: (draft.source_items || []).slice(0, 30).map((item) => ({
      source_name: clean(item.source_name, 160),
      title: clean(item.title, 500),
      url: safeUrl(item.url),
      published_at: clean(item.published_at, 120),
      topic: clean(item.topic, 80)
    })).filter((item) => item.url)
  };
}

export function createLocalEditorialReviewStore({ draftsRoot, reviewReportPath }) {
  const root = resolve(draftsRoot);
  const reportPath = resolve(reviewReportPath);

  function draftPath(reviewId) {
    const id = validReviewId(reviewId);
    if (!id) throw new Error("review-id-invalid");
    const path = resolve(root, id);
    if (!isInside(root, path)) throw new Error("review-id-invalid");
    return { id, path };
  }

  function readPending(reviewId) {
    const { id, path } = draftPath(reviewId);
    if (!existsSync(path)) throw new Error("review-not-found");
    const draft = readJson(path);
    const pending = draft.marker === "editorial-ai-draft-review-v1"
      && PENDING_STATUSES.has(draft.publication_status)
      && draft.human_review_required === true
      && draft.no_auto_publish === true
      && draft.allowed_publication !== true;
    if (!pending) throw new Error("review-not-pending");
    return { id, path, draft };
  }

  function queueItems() {
    if (!existsSync(reportPath)) return [];
    const report = readJson(reportPath);
    return Array.isArray(report.review_queue) ? report.review_queue : [];
  }

  function listDrafts() {
    const queued = queueItems();
    const rows = [];
    for (const item of queued) {
      try {
        const id = validReviewId(item.file);
        if (!id) continue;
        const { draft } = readPending(id);
        rows.push(publicSummary(id, draft, item));
      } catch {}
    }
    return rows.sort((a, b) => {
      const rank = { critical: 3, warning: 2, pending: 1 };
      return (rank[b.review_severity] || 0) - (rank[a.review_severity] || 0)
        || Number(b.legal_sensitive) - Number(a.legal_sensitive)
        || Date.parse(a.generated_at || 0) - Date.parse(b.generated_at || 0);
    });
  }

  function readDraft(reviewId) {
    const { id, draft } = readPending(reviewId);
    const queueItem = queueItems().find((item) => item.file === id) || {};
    return publicDetail(id, draft, queueItem);
  }

  function reviewDraft({ reviewId, decision, reviewer, reason, expectedGeneratedAt }) {
    const normalizedDecision = clean(decision, 40);
    const normalizedReviewer = clean(reviewer, 120);
    const normalizedReason = clean(reason, 1000);
    if (!DECISIONS[normalizedDecision]) throw new Error("review-decision-invalid");
    if (normalizedReviewer.length < 2) throw new Error("reviewer-required");
    if (normalizedReason.length < 8) throw new Error("review-reason-required");
    const { id, path, draft } = readPending(reviewId);
    if (clean(expectedGeneratedAt, 80) !== clean(draft.generated_at, 80)) throw new Error("review-stale");

    const reviewedAt = new Date().toISOString();
    const next = {
      ...draft,
      publication_status: DECISIONS[normalizedDecision],
      human_review_required: false,
      no_auto_publish: true,
      allowed_publication: false,
      legal_review: {
        ...(draft.legal_review || {}),
        human_review_required: false,
        allowed_publication: false,
        public_interpretation_allowed: false
      },
      human_review: {
        marker: "editorial-human-review-v1",
        decision: normalizedDecision,
        reviewer: normalizedReviewer,
        reason: normalizedReason,
        reviewed_at: reviewedAt,
        automatic_publication: false
      }
    };
    const temp = path + "." + randomUUID() + ".tmp";
    try {
      writeFileSync(temp, JSON.stringify(next, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      renameSync(temp, path);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
    return {
      success: true,
      review_id: id,
      status: next.publication_status,
      decision: normalizedDecision,
      reviewed_at: reviewedAt,
      allowed_publication: false,
      automatic_publication: false
    };
  }

  return { listDrafts, readDraft, reviewDraft };
}
