import { adminRequestAllowed } from "../../_shared/admin-auth.js";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(value, max = 1000) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function errorResponse(error) {
  const code = clean(error?.message, 120);
  if (code === "review-not-found") return json({ success: false, error: "Brouillon introuvable" }, 404);
  if (code === "review-not-pending" || code === "review-stale") return json({ success: false, error: "Brouillon deja traite ou remplace; recharge requise" }, 409);
  if (["review-id-invalid", "review-decision-invalid", "reviewer-required", "review-reason-required"].includes(code)) return json({ success: false, error: "Parametres de revue invalides" }, 422);
  return json({ success: false, error: "Revue editoriale indisponible" }, 503);
}

export async function onRequestGet({ request, env }) {
  if (!adminRequestAllowed(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (typeof env.READ_EDITORIAL_REVIEW !== "function" || typeof env.LIST_EDITORIAL_REVIEWS !== "function") return json({ success: false, error: "Revue editoriale locale indisponible" }, 503);
  try {
    const url = new URL(request.url);
    const reviewId = clean(url.searchParams.get("review_id"), 190);
    if (reviewId) return json({ success: true, draft: await env.READ_EDITORIAL_REVIEW(reviewId) });
    return json({ success: true, drafts: await env.LIST_EDITORIAL_REVIEWS(), safeguards: ["human-review-only", "no-auto-publication", "legal-sensitive-quarantine", "atomic-local-write"] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  if (!adminRequestAllowed(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (typeof env.REVIEW_EDITORIAL_DRAFT !== "function") return json({ success: false, error: "Revue editoriale locale indisponible" }, 503);
  const body = await request.json().catch(() => ({}));
  try {
    const result = await env.REVIEW_EDITORIAL_DRAFT({
      reviewId: clean(body.review_id, 190),
      decision: clean(body.decision, 40),
      reviewer: clean(body.reviewer, 120),
      reason: clean(body.reason, 1000),
      expectedGeneratedAt: clean(body.expected_generated_at, 80)
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
