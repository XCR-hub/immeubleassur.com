import { BROKERAGE_CASE_MARKER, clean, nowIso } from "../../_shared/brokerage-cases.js";

export const PARTNER_PORTAL_MARKER = "insurer-partner-portal-v1";

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function rowsOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function errorOf(value) {
  return value && value.error ? value.error : "";
}

async function safeAll(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql);
    const result = binds.length ? await statement.bind(...binds).all() : await statement.all();
    return result.results || [];
  } catch (error) {
    return { error: error.message || "SQL all failed" };
  }
}

async function safeFirst(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql);
    return binds.length ? await statement.bind(...binds).first() : await statement.first();
  } catch (error) {
    return { error: error.message || "SQL first failed" };
  }
}

async function safeRun(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql);
    return binds.length ? await statement.bind(...binds).run() : await statement.run();
  } catch (error) {
    return { error: error.message || "SQL run failed" };
  }
}

function tokenFrom(request) {
  return clean(new URL(request.url).searchParams.get("token"), 180);
}

function centsFromBody(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(String(value).replace(/[^0-9.,-]/g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric > 10000 ? numeric : numeric * 100);
}

function redact(value, max = 1400) {
  return clean(value, max)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email masque]")
    .replace(/(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}/g, "[telephone masque]");
}

async function logTimeline(env, caseId, eventType, actor, payload = {}) {
  await safeRun(env, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)", [crypto.randomUUID(), caseId, clean(eventType, 80), clean(actor || "assureur", 120), JSON.stringify(payload), nowIso()]);
}

async function portalBundle(env, token) {
  if (!env.DB) return { status: 503, error: "Base SQLite indisponible" };
  if (!token) return { status: 400, error: "Token assureur requis" };
  const row = await safeFirst(env, `SELECT tok.id AS token_id, tok.token, tok.status AS token_status, tok.expires_at, i.*, c.case_reference, c.readiness_score, c.stage, l.profile, l.property_type, l.city, l.units_count, l.need, l.message, l.lead_score
    FROM insurer_consultation_tokens tok
    JOIN insurer_consultations i ON i.id = tok.consultation_id
    JOIN brokerage_cases c ON c.id = i.case_id
    JOIN leads l ON l.id = c.lead_id
    WHERE tok.token = ?`, [token]);
  if (!row || errorOf(row)) return { status: 404, error: "Consultation assureur introuvable" };
  if (clean(row.token_status, 40) !== "active") return { status: 403, error: "Lien assureur desactive" };
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt && Number.isFinite(expiresAt) && expiresAt < Date.now()) return { status: 403, error: "Lien assureur expire" };
  const documents = rowsOrEmpty(await safeAll(env, "SELECT document_type, label, required, status, updated_at FROM case_documents WHERE case_id = ? ORDER BY required DESC, label", [row.case_id]));
  await safeRun(env, "UPDATE insurer_consultation_tokens SET last_used_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), row.token_id]);
  return { row, documents };
}

function publicPayload(row, documents = []) {
  return {
    success: true,
    marker: PARTNER_PORTAL_MARKER,
    generated_at: nowIso(),
    consultation: {
      case_reference: clean(row.case_reference, 80),
      insurer_name: clean(row.insurer_name, 160),
      status: clean(row.status, 40),
      package_status: clean(row.package_status, 80),
      response_due_at: row.response_due_at || "",
      sent_at: row.sent_at || "",
      risk: {
        profile: clean(row.profile, 120),
        property_type: clean(row.property_type, 120),
        city: clean(row.city, 120),
        units_count: clean(row.units_count, 40),
        need: clean(row.need, 120),
        readiness_score: Number(row.readiness_score || 0),
        context: redact(row.message, 900)
      },
      documents: rowsOrEmpty(documents).map((doc) => ({
        document_type: clean(doc.document_type, 120),
        label: clean(doc.label, 220),
        required: Number(doc.required || 0) === 1,
        status: clean(doc.status, 40),
        updated_at: doc.updated_at || ""
      })),
      allowed_actions: ["question", "quote", "decline"],
      data_policy: ["no-client-email", "no-client-phone", "token-limited", "timeline-audit"]
    }
  };
}

export async function onRequestGet({ request, env }) {
  const bundle = await portalBundle(env, tokenFrom(request));
  if (bundle.error) return json({ success: false, error: bundle.error }, bundle.status || 400);
  return json(publicPayload(bundle.row, bundle.documents));
}

export async function onRequestPost({ request, env }) {
  const bundle = await portalBundle(env, tokenFrom(request));
  if (bundle.error) return json({ success: false, error: bundle.error }, bundle.status || 400);
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 40);
  const notes = redact(body.notes || body.message || "", 1800);
  if (!action) return json({ success: false, error: "Action assureur requise" }, 400);

  if (action === "question") {
    if (!notes) return json({ success: false, error: "Question assureur requise" }, 400);
    const nextNotes = [clean(bundle.row.notes, 1800), `Question assureur: ${notes}`].filter(Boolean).join("\n").slice(0, 3000);
    await safeRun(env, "UPDATE insurer_consultations SET status = CASE WHEN status = 'quoted' THEN status ELSE 'answered' END, answered_at = COALESCE(answered_at, ?), notes = ?, updated_at = ? WHERE id = ?", [nowIso(), nextNotes, nowIso(), bundle.row.id]);
    await safeRun(env, "UPDATE brokerage_cases SET next_action = ?, updated_at = ? WHERE id = ?", ["Repondre a la question assureur puis mettre a jour le pack de consultation.", nowIso(), bundle.row.case_id]);
    await logTimeline(env, bundle.row.case_id, "insurer_portal_question", bundle.row.insurer_name, { marker: PARTNER_PORTAL_MARKER, consultation_id: bundle.row.id, human_followup_required: true });
    return json({ success: true, status: "answered" });
  }

  if (action === "quote") {
    const premium = centsFromBody(body.premium_amount_cents ?? body.premium_amount);
    const deductible = centsFromBody(body.deductible_cents ?? body.deductible);
    const nextNotes = [clean(bundle.row.notes, 1800), notes ? `Offre assureur: ${notes}` : "Offre assureur transmise via portail."].filter(Boolean).join("\n").slice(0, 3000);
    await safeRun(env, "UPDATE insurer_consultations SET status = 'quoted', answered_at = COALESCE(answered_at, ?), premium_amount_cents = COALESCE(?, premium_amount_cents), deductible_cents = COALESCE(?, deductible_cents), notes = ?, updated_at = ? WHERE id = ?", [nowIso(), premium, deductible, nextNotes, nowIso(), bundle.row.id]);
    await safeRun(env, "UPDATE brokerage_cases SET stage = 'offer_followup', next_action = ?, updated_at = ? WHERE id = ?", ["Comparer l'offre assureur recue via portail et preparer la recommandation client.", nowIso(), bundle.row.case_id]);
    await logTimeline(env, bundle.row.case_id, "insurer_portal_quote", bundle.row.insurer_name, { marker: PARTNER_PORTAL_MARKER, consultation_id: bundle.row.id, premium_amount_cents: premium, deductible_cents: deductible, human_review_required: true });
    return json({ success: true, status: "quoted" });
  }

  if (action === "decline") {
    const nextNotes = [clean(bundle.row.notes, 1800), notes ? `Refus assureur: ${notes}` : "Refus assureur transmis via portail."].filter(Boolean).join("\n").slice(0, 3000);
    await safeRun(env, "UPDATE insurer_consultations SET status = 'declined', answered_at = COALESCE(answered_at, ?), notes = ?, updated_at = ? WHERE id = ?", [nowIso(), nextNotes, nowIso(), bundle.row.id]);
    await safeRun(env, "UPDATE brokerage_cases SET next_action = ?, updated_at = ? WHERE id = ?", ["Analyser le refus assureur et relancer un partenaire adapte si besoin.", nowIso(), bundle.row.case_id]);
    await logTimeline(env, bundle.row.case_id, "insurer_portal_decline", bundle.row.insurer_name, { marker: PARTNER_PORTAL_MARKER, consultation_id: bundle.row.id, human_review_required: true });
    return json({ success: true, status: "declined" });
  }

  return json({ success: false, error: "Action assureur non supportee" }, 400);
}