import { clean, safeJson, stageLabel } from "../../_shared/brokerage-cases.js";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "https://immeubleassur.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
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

function tokenOf(request) {
  const url = new URL(request.url);
  return clean(url.searchParams.get("token") || "", 160);
}

function rowsOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function publicCase(row, documents, consultations, mails) {
  const visibleConsultations = rowsOrEmpty(consultations).filter((item) => ["sent", "answered", "quoted"].includes(clean(item.status, 40))).map((item) => ({
    insurer_name: clean(item.insurer_name, 160),
    status: clean(item.status, 40),
    sent_at: item.sent_at || "",
    answered_at: item.answered_at || "",
    response_due_at: item.response_due_at || ""
  }));
  return {
    case_reference: row.case_reference,
    stage: row.stage,
    stage_label: stageLabel(row.stage),
    readiness_score: Number(row.readiness_score || 0),
    priority: row.priority,
    next_action: clean(row.next_action, 1000),
    due_at: row.due_at || "",
    updated_at: row.updated_at,
    lead: {
      name: clean(row.name, 120),
      city: clean(row.city, 120),
      need: clean(row.need, 120),
      property_type: clean(row.property_type, 120),
      units_count: clean(row.units_count, 40)
    },
    documents: rowsOrEmpty(documents).map((doc) => ({
      id: doc.id,
      document_type: doc.document_type,
      label: doc.label,
      required: Number(doc.required || 0) === 1,
      status: doc.status,
      requested_at: doc.requested_at,
      received_at: doc.received_at || "",
      validated_at: doc.validated_at || ""
    })),
    consultations: visibleConsultations,
    last_messages: rowsOrEmpty(mails).filter((mail) => ["sent", "approved"].includes(clean(mail.status, 40))).slice(0, 5).map((mail) => ({
      audience: mail.audience,
      subject: mail.subject,
      status: mail.status,
      sent_at: mail.sent_at || "",
      approved_at: mail.approved_at || ""
    })),
    consent: safeJson(row.consent_snapshot, {})
  };
}

async function caseByToken(env, token) {
  if (!token || token.length < 24) return null;
  return safeFirst(env, `SELECT c.*, l.name, l.city, l.need, l.property_type, l.units_count FROM brokerage_cases c JOIN leads l ON l.id = c.lead_id WHERE c.client_portal_token = ?`, [token]);
}

export function onRequestOptions() {
  return new Response("", { status: 204, headers });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ success: false, error: "Base indisponible" }, 503);
  const token = tokenOf(request);
  const row = await caseByToken(env, token);
  if (!row || row.error) return json({ success: false, error: "Dossier introuvable" }, 404);
  const [documents, consultations, mails] = await Promise.all([
    safeAll(env, "SELECT * FROM case_documents WHERE case_id = ? ORDER BY required DESC, label", [row.id]),
    safeAll(env, "SELECT * FROM insurer_consultations WHERE case_id = ? ORDER BY updated_at DESC", [row.id]),
    safeAll(env, "SELECT audience, subject, status, approved_at, sent_at FROM case_mail_queue WHERE case_id = ? ORDER BY updated_at DESC LIMIT 20", [row.id])
  ]);
  return json({ success: true, generated_at: new Date().toISOString(), case: publicCase(row, documents, consultations, mails) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ success: false, error: "Base indisponible" }, 503);
  const token = tokenOf(request);
  const row = await caseByToken(env, token);
  if (!row || row.error) return json({ success: false, error: "Dossier introuvable" }, 404);
  const body = await request.json().catch(() => ({}));
  const documentType = clean(body.document_type, 120);
  const notes = clean(body.notes, 1000);
  const documentRow = await safeFirst(env, "SELECT * FROM case_documents WHERE case_id = ? AND document_type = ?", [row.id, documentType]);
  if (!documentRow || documentRow.error) return json({ success: false, error: "Piece inconnue" }, 404);
  await safeRun(env, "UPDATE case_documents SET status = 'received', received_at = COALESCE(received_at, ?), notes = COALESCE(NULLIF(?, ''), notes), updated_at = ? WHERE id = ?", [new Date().toISOString(), notes, new Date().toISOString(), documentRow.id]);
  await safeRun(env, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, 'client_document_received', 'client', ?, ?)", [crypto.randomUUID(), row.id, JSON.stringify({ document_type: documentType, notes: notes ? "client-note" : "" }), new Date().toISOString()]);
  return json({ success: true, status: "received" });
}