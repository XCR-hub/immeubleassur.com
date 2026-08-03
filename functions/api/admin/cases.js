import { sendPortableSmtpMail } from "../../_shared/smtp.js";
import {
  BROKERAGE_CASE_MARKER,
  buildClientEmailDraft,
  buildInsurerEmailDraft,
  caseReferenceForLead,
  clean,
  consentSnapshotFor,
  documentChecklistFor,
  leadValueEstimate,
  nextActionForCase,
  nowIso,
  portalToken,
  portalUrl,
  readinessScoreFor,
  safeJson,
  stageForCase,
  stageLabel,
  urgencyForLead
} from "../../_shared/brokerage-cases.js";

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function authorized(request, env) {
  const expected = env.ADMIN_API_TOKEN;
  if (!expected) return false;
  return (request.headers.get("Authorization") || "") === `Bearer ${expected}`;
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

function rowsOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function errorOf(value) {
  return value && value.error ? value.error : "";
}

function valueLabel(minCents, maxCents) {
  const min = Math.round(Number(minCents || 0) / 100);
  const max = Math.round(Number(maxCents || 0) / 100);
  return max ? `${min}-${max} EUR/an` : "0 EUR/an";
}

function priorityFor(lead, readiness) {
  const score = Number(lead.lead_score || 0);
  const urgency = urgencyForLead(lead);
  if (urgency.level === "immediate" || score >= 85) return "hot";
  if (Number(readiness.score || 0) >= 70 || score >= 70) return "warm";
  if (score >= 45) return "standard";
  return "low";
}

function dueAtFor(priority, stage) {
  const hours = stage === "contract_active" ? 168 : priority === "hot" ? 2 : priority === "warm" ? 8 : priority === "standard" ? 24 : 48;
  return new Date(Date.now() + hours * 3600000).toISOString();
}

async function logTimeline(env, caseId, eventType, actor, payload = {}) {
  await safeRun(env, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)", [crypto.randomUUID(), caseId, clean(eventType, 80), clean(actor || "system", 120), JSON.stringify(payload), nowIso()]);
}

async function materializeCase(env, lead, counters) {
  const existing = await safeFirst(env, "SELECT * FROM brokerage_cases WHERE lead_id = ?", [lead.id]);
  if (errorOf(existing)) return null;
  const caseId = existing?.id || crypto.randomUUID();
  const docsBefore = existing ? rowsOrEmpty(await safeAll(env, "SELECT * FROM case_documents WHERE case_id = ?", [caseId])) : [];
  const readiness = readinessScoreFor(lead, docsBefore);
  const consultations = existing ? rowsOrEmpty(await safeAll(env, "SELECT * FROM insurer_consultations WHERE case_id = ?", [caseId])) : [];
  const stage = stageForCase(lead, readiness, consultations);
  const priority = priorityFor(lead, readiness);
  const value = leadValueEstimate(lead, Number(lead.lead_score || 0));
  const nextAction = nextActionForCase(lead, readiness, stage);
  const payload = {
    marker: BROKERAGE_CASE_MARKER,
    lead_reference: lead.reference,
    stage_label: stageLabel(stage),
    urgency: urgencyForLead(lead),
    readiness_signals: readiness.signals,
    value_estimate: value
  };

  if (!existing) {
    await safeRun(env, `INSERT INTO brokerage_cases (id, lead_id, case_reference, stage, readiness_score, priority, estimated_value_min_cents, estimated_value_max_cents, client_portal_token, assigned_to, next_action, due_at, human_review_required, consent_snapshot, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`, [
      caseId,
      lead.id,
      caseReferenceForLead(lead),
      stage,
      readiness.score,
      priority,
      value.annual_premium_min * 100,
      value.annual_premium_max * 100,
      portalToken(),
      clean(lead.assigned_to, 120),
      nextAction,
      dueAtFor(priority, stage),
      JSON.stringify(consentSnapshotFor(lead)),
      JSON.stringify(payload),
      nowIso(),
      nowIso()
    ]);
    counters.created += 1;
    await logTimeline(env, caseId, "case_created", "system", { lead_reference: lead.reference, marker: BROKERAGE_CASE_MARKER });
  } else {
    await safeRun(env, `UPDATE brokerage_cases SET stage = ?, readiness_score = ?, priority = ?, estimated_value_min_cents = ?, estimated_value_max_cents = ?, assigned_to = COALESCE(NULLIF(assigned_to, ''), ?), next_action = ?, due_at = COALESCE(due_at, ?), consent_snapshot = COALESCE(consent_snapshot, ?), payload = ?, updated_at = ? WHERE id = ?`, [
      stage,
      readiness.score,
      priority,
      value.annual_premium_min * 100,
      value.annual_premium_max * 100,
      clean(lead.assigned_to, 120),
      nextAction,
      dueAtFor(priority, stage),
      JSON.stringify(consentSnapshotFor(lead)),
      JSON.stringify(payload),
      nowIso(),
      caseId
    ]);
    counters.updated += 1;
  }

  const caseRow = await safeFirst(env, "SELECT * FROM brokerage_cases WHERE id = ?", [caseId]);
  for (const doc of documentChecklistFor(lead)) {
    const result = await safeRun(env, `INSERT OR IGNORE INTO case_documents (id, case_id, document_type, label, required, status, requested_at, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?)`, [crypto.randomUUID(), caseId, doc.document_type, doc.label, doc.required, nowIso(), JSON.stringify({ marker: BROKERAGE_CASE_MARKER }), nowIso(), nowIso()]);
    if (Number(result?.meta?.changes || 0) > 0) counters.documents_requested += 1;
  }
  const docs = rowsOrEmpty(await safeAll(env, "SELECT * FROM case_documents WHERE case_id = ? ORDER BY required DESC, label", [caseId]));
  const refreshedReadiness = readinessScoreFor(lead, docs);
  await safeRun(env, "UPDATE brokerage_cases SET readiness_score = ?, updated_at = ? WHERE id = ?", [refreshedReadiness.score, nowIso(), caseId]);

  const clientDraftExists = await safeFirst(env, "SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'client' AND status IN ('draft_review', 'approved', 'sent')", [caseId]);
  if (!clientDraftExists) {
    const draft = buildClientEmailDraft(lead, caseRow, docs, clean(env.SITE_ORIGIN, 240) || "https://immeubleassur.com");
    await safeRun(env, `INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, scheduled_at, payload, created_at, updated_at)
      VALUES (?, ?, 'client', ?, ?, ?, 'draft_review', 1, ?, ?, ?, ?)`, [crypto.randomUUID(), caseId, clean(lead.email, 180), draft.subject, draft.body, nowIso(), JSON.stringify({ marker: BROKERAGE_CASE_MARKER, purpose: "document_collection" }), nowIso(), nowIso()]);
    counters.mail_drafts += 1;
  }

  const insurerDraftExists = await safeFirst(env, "SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'insurer' AND status IN ('draft_review', 'approved', 'sent')", [caseId]);
  if (!insurerDraftExists && refreshedReadiness.score >= 55) {
    const draft = buildInsurerEmailDraft(lead, caseRow, docs);
    await safeRun(env, `INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, scheduled_at, payload, created_at, updated_at)
      VALUES (?, ?, 'insurer', '', ?, ?, 'draft_review', 1, ?, ?, ?, ?)`, [crypto.randomUUID(), caseId, draft.subject, draft.body, nowIso(), JSON.stringify({ marker: BROKERAGE_CASE_MARKER, purpose: "market_consultation", requires_partner_selection: true }), nowIso(), nowIso()]);
    counters.mail_drafts += 1;
  }

  if (refreshedReadiness.score >= 70) {
    const partners = rowsOrEmpty(await safeAll(env, "SELECT * FROM insurer_partners WHERE active = 1 ORDER BY service_level_hours ASC, name LIMIT 3"));
    for (const partner of partners) {
      const exists = await safeFirst(env, "SELECT id FROM insurer_consultations WHERE case_id = ? AND insurer_name = ?", [caseId, partner.name]);
      if (exists) continue;
      await safeRun(env, `INSERT INTO insurer_consultations (id, case_id, partner_id, insurer_name, recipient_email, status, package_status, response_due_at, payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'draft_review', 'ready_for_human_review', ?, ?, ?, ?)`, [crypto.randomUUID(), caseId, partner.id, partner.name, clean(partner.contact_email, 180), new Date(Date.now() + Number(partner.service_level_hours || 48) * 3600000).toISOString(), JSON.stringify({ marker: BROKERAGE_CASE_MARKER, appetite_profile: partner.appetite_profile }), nowIso(), nowIso()]);
      counters.consultations_prepared += 1;
    }
  }
  return { case_id: caseId, reference: caseRow?.case_reference || caseReferenceForLead(lead), stage, priority, readiness_score: refreshedReadiness.score };
}

async function ensureCasesForOpenLeads(env, limit = 160) {
  const counters = { scanned: 0, created: 0, updated: 0, documents_requested: 0, mail_drafts: 0, consultations_prepared: 0 };
  const leadRows = await safeAll(env, `SELECT * FROM leads WHERE status NOT IN ('lost', 'archived') ORDER BY created_at DESC LIMIT ?`, [limit]);
  const touched = [];
  for (const lead of rowsOrEmpty(leadRows)) {
    counters.scanned += 1;
    const result = await materializeCase(env, lead, counters);
    if (result) touched.push(result);
  }
  return { counters, touched, warning: errorOf(leadRows) };
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rowsOrEmpty(rows)) {
    const value = row[key];
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
}

function caseRowsWithChildren(cases, documents, mails, consultations, timelines, env) {
  const docsByCase = groupBy(documents, "case_id");
  const mailsByCase = groupBy(mails, "case_id");
  const consultationsByCase = groupBy(consultations, "case_id");
  const timelineByCase = groupBy(timelines, "case_id");
  return rowsOrEmpty(cases).map((row) => {
    const docs = docsByCase.get(row.id) || [];
    const missingRequired = docs.filter((doc) => Number(doc.required || 0) === 1 && !["received", "validated"].includes(clean(doc.status, 40))).length;
    return {
      id: row.id,
      case_reference: row.case_reference,
      lead_reference: row.lead_reference,
      stage: row.stage,
      stage_label: stageLabel(row.stage),
      priority: row.priority,
      readiness_score: Number(row.readiness_score || 0),
      missing_required_documents: missingRequired,
      client_portal_url: portalUrl(row.client_portal_token, clean(env.SITE_ORIGIN, 240) || "https://immeubleassur.com"),
      assigned_to: clean(row.assigned_to, 120),
      next_action: clean(row.next_action, 1000),
      due_at: row.due_at,
      updated_at: row.updated_at,
      created_at: row.created_at,
      value_label: valueLabel(row.estimated_value_min_cents, row.estimated_value_max_cents),
      lead: {
        name: clean(row.name, 120),
        phone: clean(row.phone, 80),
        email: clean(row.email, 180),
        profile: clean(row.profile, 120),
        property_type: clean(row.property_type, 120),
        city: clean(row.city, 120),
        need: clean(row.need, 120),
        units_count: clean(row.units_count, 40),
        status: clean(row.lead_status, 40)
      },
      documents: docs,
      mail_queue: mailsByCase.get(row.id) || [],
      consultations: consultationsByCase.get(row.id) || [],
      timeline: timelineByCase.get(row.id) || [],
      consent_snapshot: safeJson(row.consent_snapshot, {})
    };
  });
}

function buildActions(cases, mails, consultations) {
  const actions = [];
  const reviewMail = rowsOrEmpty(mails).find((item) => item.status === "draft_review");
  const ready = rowsOrEmpty(cases).find((item) => Number(item.readiness_score || 0) >= 70 && item.stage === "ready_for_market");
  const hot = rowsOrEmpty(cases).find((item) => item.priority === "hot" && !item.assigned_to);
  const missingDocs = rowsOrEmpty(cases).find((item) => Number(item.missing_required_documents || 0) > 0);
  const consultation = rowsOrEmpty(consultations).find((item) => item.status === "draft_review");
  if (hot) actions.push({ priority: 100, type: "pilotage", target: hot.case_reference, signal: "dossier chaud sans pilote", recommendation: "Assigner un courtier et appeler avant automatisation." });
  if (missingDocs) actions.push({ priority: 96, type: "pieces-client", target: missingDocs.case_reference, signal: `${missingDocs.missing_required_documents} piece(s) requise(s)`, recommendation: "Valider le mail client et demander uniquement les pieces manquantes." });
  if (ready) actions.push({ priority: 92, type: "pret-marche", target: ready.case_reference, signal: `${ready.readiness_score}/100`, recommendation: "Relire le dossier puis choisir les assureurs a consulter." });
  if (consultation) actions.push({ priority: 88, type: "consultation-assureur", target: consultation.case_reference || consultation.insurer_name, signal: consultation.insurer_name, recommendation: "Configurer le contact assureur, relire le pack et approuver avant envoi." });
  if (reviewMail) actions.push({ priority: 84, type: "mail-a-valider", target: reviewMail.case_reference || reviewMail.audience, signal: reviewMail.subject, recommendation: "Lecture humaine obligatoire avant approbation ou envoi." });
  return actions.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)).slice(0, 20);
}

async function smtpConfig(env, mail) {
  const from = clean(env.SMTP_FROM || env.SMTP_USER, 180);
  return {
    host: clean(env.SMTP_HOST, 160),
    port: Number.parseInt(env.SMTP_PORT || "587", 10),
    username: clean(env.SMTP_USER || from, 180),
    password: String(env.SMTP_PASS || ""),
    from,
    to: [clean(mail.recipient_email, 180)].filter(Boolean),
    secureTransport: Number.parseInt(env.SMTP_PORT || "587", 10) === 465 ? "on" : "starttls"
  };
}

function mailMessage(config, mail) {
  const subject = clean(mail.subject, 240).replace(/[\r\n]+/g, " ");
  return [
    `From: ${config.from}`,
    `To: ${clean(mail.recipient_email, 180)}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    clean(mail.body, 12000)
  ].join("\r\n");
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);
  const url = new URL(request.url);
  const sync = url.searchParams.get("sync") !== "0";
  const syncResult = sync ? await ensureCasesForOpenLeads(env) : null;

  const [caseRows, documents, mails, consultations, timelines, partners, summaryRow, docSummary, mailSummary, consultSummary] = await Promise.all([
    safeAll(env, `SELECT c.*, l.reference AS lead_reference, l.name, l.phone, l.email, l.profile, l.property_type, l.city, l.units_count, l.need, l.status AS lead_status FROM brokerage_cases c JOIN leads l ON l.id = c.lead_id ORDER BY CASE c.priority WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 WHEN 'standard' THEN 3 ELSE 4 END, c.updated_at DESC LIMIT 120`),
    safeAll(env, `SELECT d.* FROM case_documents d JOIN brokerage_cases c ON c.id = d.case_id ORDER BY d.required DESC, d.label LIMIT 800`),
    safeAll(env, `SELECT m.*, c.case_reference FROM case_mail_queue m JOIN brokerage_cases c ON c.id = m.case_id ORDER BY CASE m.status WHEN 'draft_review' THEN 1 WHEN 'approved' THEN 2 WHEN 'sent' THEN 3 ELSE 4 END, m.updated_at DESC LIMIT 240`),
    safeAll(env, `SELECT i.*, c.case_reference FROM insurer_consultations i JOIN brokerage_cases c ON c.id = i.case_id ORDER BY CASE i.status WHEN 'draft_review' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END, i.updated_at DESC LIMIT 240`),
    safeAll(env, `SELECT t.* FROM case_timeline t JOIN brokerage_cases c ON c.id = t.case_id ORDER BY t.created_at DESC LIMIT 300`),
    safeAll(env, `SELECT id, name, contact_email, appetite_profile, service_level_hours, active FROM insurer_partners ORDER BY active DESC, name`),
    safeFirst(env, `SELECT COUNT(*) AS cases, SUM(CASE WHEN stage NOT IN ('contract_active', 'lost') THEN 1 ELSE 0 END) AS open_cases, SUM(CASE WHEN priority = 'hot' THEN 1 ELSE 0 END) AS hot_cases, SUM(CASE WHEN readiness_score >= 70 THEN 1 ELSE 0 END) AS ready_cases, SUM(CASE WHEN human_review_required = 1 THEN 1 ELSE 0 END) AS human_review_required, COALESCE(SUM(estimated_value_min_cents), 0) AS value_min_cents, COALESCE(SUM(estimated_value_max_cents), 0) AS value_max_cents FROM brokerage_cases`),
    safeFirst(env, `SELECT COUNT(*) AS requested, SUM(CASE WHEN status IN ('received', 'validated') THEN 1 ELSE 0 END) AS received, SUM(CASE WHEN required = 1 AND status NOT IN ('received', 'validated') THEN 1 ELSE 0 END) AS missing_required FROM case_documents`),
    safeFirst(env, `SELECT COUNT(*) AS drafts, SUM(CASE WHEN status = 'draft_review' THEN 1 ELSE 0 END) AS review_drafts, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent FROM case_mail_queue`),
    safeFirst(env, `SELECT COUNT(*) AS consultations, SUM(CASE WHEN status = 'draft_review' THEN 1 ELSE 0 END) AS review_consultations, SUM(CASE WHEN status IN ('sent', 'answered', 'quoted') THEN 1 ELSE 0 END) AS active_consultations FROM insurer_consultations`)
  ]);

  const cases = caseRowsWithChildren(caseRows, documents, mails, consultations, timelines, env);
  const summary = {
    ...(summaryRow || {}),
    documents: docSummary || {},
    mail_queue: mailSummary || {},
    consultations: consultSummary || {},
    pipeline_value_label: valueLabel(summaryRow?.value_min_cents, summaryRow?.value_max_cents)
  };
  return json({
    success: true,
    generated_at: nowIso(),
    marker: BROKERAGE_CASE_MARKER,
    sync: syncResult,
    summary,
    cases,
    mail_queue: rowsOrEmpty(mails),
    consultations: rowsOrEmpty(consultations),
    partners: rowsOrEmpty(partners),
    actions: buildActions(cases, rowsOrEmpty(mails), rowsOrEmpty(consultations)),
    warnings: [syncResult?.warning, errorOf(caseRows), errorOf(documents), errorOf(mails), errorOf(consultations), errorOf(partners), errorOf(summaryRow), errorOf(docSummary), errorOf(mailSummary), errorOf(consultSummary)].filter(Boolean),
    safeguards: ["human-review-before-send", "mail-draft-review", "client-portal-token", "consent-snapshot", "audit-timeline"]
  });
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 80);
  if (action === "sync") return json({ success: true, sync: await ensureCasesForOpenLeads(env, 220) });

  if (!["approve_mail", "send_mail", "mark_sent"].includes(action)) return json({ success: false, error: "Action non supportee" }, 400);
  const mailId = clean(body.mail_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  const mail = await safeFirst(env, "SELECT m.*, c.case_reference FROM case_mail_queue m JOIN brokerage_cases c ON c.id = m.case_id WHERE m.id = ?", [mailId]);
  if (!mail || errorOf(mail)) return json({ success: false, error: "Mail introuvable" }, 404);

  if (action === "approve_mail") {
    await safeRun(env, "UPDATE case_mail_queue SET status = 'approved', approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?", [nowIso(), reviewer, nowIso(), mailId]);
    await logTimeline(env, mail.case_id, "mail_approved", reviewer, { mail_id: mailId, audience: mail.audience, subject: mail.subject });
    return json({ success: true, status: "approved" });
  }

  if (action === "mark_sent") {
    await safeRun(env, "UPDATE case_mail_queue SET status = 'sent', sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ?", [nowIso(), nowIso(), mailId]);
    await logTimeline(env, mail.case_id, "mail_marked_sent", reviewer, { mail_id: mailId, audience: mail.audience, subject: mail.subject });
    return json({ success: true, status: "sent" });
  }

  if (mail.status !== "approved") return json({ success: false, error: "Validation humaine requise avant envoi" }, 409);
  if (!clean(mail.recipient_email, 180)) return json({ success: false, error: "Destinataire manquant" }, 409);
  const config = await smtpConfig(env, mail);
  if (!config.host || !config.username || !config.password || !config.from || !config.to.length) return json({ success: false, error: "Configuration SMTP incomplete" }, 503);
  try {
    const smtpResult = await sendPortableSmtpMail(config, mailMessage(config, mail), env);
    await safeRun(env, "UPDATE case_mail_queue SET status = 'sent', sent_at = ?, last_error = '', updated_at = ? WHERE id = ?", [nowIso(), nowIso(), mailId]);
    await logTimeline(env, mail.case_id, "mail_sent", reviewer, { mail_id: mailId, audience: mail.audience, smtp: clean(smtpResult, 500) });
    return json({ success: true, status: "sent" });
  } catch (error) {
    await safeRun(env, "UPDATE case_mail_queue SET last_error = ?, updated_at = ? WHERE id = ?", [clean(error.message, 500), nowIso(), mailId]);
    return json({ success: false, error: error.message || "Envoi SMTP impossible" }, 502);
  }
}

export async function onRequestPatch({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);
  const body = await request.json().catch(() => ({}));
  const caseId = clean(body.case_id, 120);
  const documentId = clean(body.document_id, 120);
  const actor = clean(body.actor || "admin", 120);
  if (documentId) {
    const status = clean(body.status, 40);
    if (!["requested", "received", "validated", "waived"].includes(status)) return json({ success: false, error: "Statut piece invalide" }, 400);
    const documentRow = await safeFirst(env, "SELECT * FROM case_documents WHERE id = ?", [documentId]);
    if (!documentRow || errorOf(documentRow)) return json({ success: false, error: "Piece introuvable" }, 404);
    await safeRun(env, "UPDATE case_documents SET status = ?, received_at = CASE WHEN ? IN ('received', 'validated') THEN COALESCE(received_at, ?) ELSE received_at END, validated_at = CASE WHEN ? = 'validated' THEN COALESCE(validated_at, ?) ELSE validated_at END, notes = COALESCE(NULLIF(?, ''), notes), updated_at = ? WHERE id = ?", [status, status, nowIso(), status, nowIso(), clean(body.notes, 1000), nowIso(), documentId]);
    await logTimeline(env, documentRow.case_id, "document_status", actor, { document_id: documentId, status });
    return json({ success: true, status });
  }
  if (!caseId) return json({ success: false, error: "case_id requis" }, 400);
  const stage = clean(body.stage, 60);
  const assignedTo = clean(body.assigned_to, 120);
  const nextAction = clean(body.next_action, 1000);
  await safeRun(env, "UPDATE brokerage_cases SET stage = COALESCE(NULLIF(?, ''), stage), assigned_to = COALESCE(NULLIF(?, ''), assigned_to), next_action = COALESCE(NULLIF(?, ''), next_action), updated_at = ? WHERE id = ?", [stage, assignedTo, nextAction, nowIso(), caseId]);
  await logTimeline(env, caseId, "case_updated", actor, { stage, assigned_to: assignedTo, next_action: nextAction });
  return json({ success: true });
}