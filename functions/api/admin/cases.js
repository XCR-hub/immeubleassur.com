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
import { CLIENT_CONTRACT_MARKER } from "../../_shared/client-contracts.js";

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


function contractsWithChildren(contracts = [], requests = [], payments = [], referrals = [], consentEvents = []) {
  const requestsByContract = groupBy(requests, "contract_id");
  const paymentsByContract = groupBy(payments, "contract_id");
  const referralsByContract = groupBy(referrals, "contract_id");
  const consentByContract = groupBy(consentEvents, "contract_id");
  return rowsOrEmpty(contracts).map((contract) => ({
    ...contract,
    requests: requestsByContract.get(contract.id) || [],
    payments: paymentsByContract.get(contract.id) || [],
    referrals: referralsByContract.get(contract.id) || [],
    consent_events: consentByContract.get(contract.id) || []
  }));
}

function contractOperationSummary(contracts = [], requests = [], payments = [], referrals = []) {
  const now = Date.now();
  const renewalLimit = now + 60 * 86400000;
  const rows = rowsOrEmpty(contracts);
  const requestRows = rowsOrEmpty(requests);
  const paymentRows = rowsOrEmpty(payments);
  const referralRows = rowsOrEmpty(referrals);
  return {
    contracts: rows.length,
    open_requests: requestRows.filter((item) => ["open", "in_progress"].includes(clean(item.status, 40))).length,
    high_requests: requestRows.filter((item) => clean(item.priority, 40) === "high" && ["open", "in_progress"].includes(clean(item.status, 40))).length,
    pending_payments: paymentRows.filter((item) => clean(item.status, 40) === "pending").length,
    review_referrals: referralRows.filter((item) => clean(item.status, 40) === "draft_review").length,
    renewals_60d: rows.filter((item) => {
      const due = new Date(item.renewal_at || "").getTime();
      return Number.isFinite(due) && due >= now && due <= renewalLimit;
    }).length
  };
}

function consultationOperationSummary(consultations = []) {
  const now = Date.now();
  const rows = rowsOrEmpty(consultations);
  return {
    approved_consultations: rows.filter((item) => clean(item.status, 40) === "approved").length,
    overdue_consultations: rows.filter((item) => clean(item.status, 40) === "sent" && Number.isFinite(new Date(item.response_due_at || "").getTime()) && new Date(item.response_due_at).getTime() < now).length,
    quoted_consultations: rows.filter((item) => clean(item.status, 40) === "quoted").length,
    declined_consultations: rows.filter((item) => clean(item.status, 40) === "declined").length,
    missing_recipient_consultations: rows.filter((item) => ["draft_review", "approved"].includes(clean(item.status, 40)) && !clean(item.recipient_email, 180)).length
  };
}
function caseRowsWithChildren(cases, documents, mails, consultations, timelines, contracts, contractRequests, contractPayments, contractReferrals, contractConsents, env) {
  const docsByCase = groupBy(documents, "case_id");
  const mailsByCase = groupBy(mails, "case_id");
  const consultationsByCase = groupBy(consultations, "case_id");
  const timelineByCase = groupBy(timelines, "case_id");
  const contractRows = contractsWithChildren(contracts, contractRequests, contractPayments, contractReferrals, contractConsents);
  const contractsByCase = groupBy(contractRows, "case_id");
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
      contracts: contractsByCase.get(row.id) || [],
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

  const [caseRows, documents, mails, consultations, timelines, contracts, contractRequests, contractPayments, contractReferrals, contractConsents, partners, summaryRow, docSummary, mailSummary, consultSummary, contractSummary] = await Promise.all([
    safeAll(env, `SELECT c.*, l.reference AS lead_reference, l.name, l.phone, l.email, l.profile, l.property_type, l.city, l.units_count, l.need, l.status AS lead_status FROM brokerage_cases c JOIN leads l ON l.id = c.lead_id ORDER BY CASE c.priority WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 WHEN 'standard' THEN 3 ELSE 4 END, c.updated_at DESC LIMIT 120`),
    safeAll(env, `SELECT d.* FROM case_documents d JOIN brokerage_cases c ON c.id = d.case_id ORDER BY d.required DESC, d.label LIMIT 800`),
    safeAll(env, `SELECT m.*, c.case_reference FROM case_mail_queue m JOIN brokerage_cases c ON c.id = m.case_id ORDER BY CASE m.status WHEN 'draft_review' THEN 1 WHEN 'approved' THEN 2 WHEN 'sent' THEN 3 ELSE 4 END, m.updated_at DESC LIMIT 240`),
    safeAll(env, `SELECT i.*, c.case_reference FROM insurer_consultations i JOIN brokerage_cases c ON c.id = i.case_id ORDER BY CASE i.status WHEN 'draft_review' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END, i.updated_at DESC LIMIT 240`),
    safeAll(env, `SELECT t.* FROM case_timeline t JOIN brokerage_cases c ON c.id = t.case_id ORDER BY t.created_at DESC LIMIT 300`),
    safeAll(env, `SELECT cc.*, c.case_reference FROM client_contracts cc JOIN brokerage_cases c ON c.id = cc.case_id ORDER BY cc.updated_at DESC LIMIT 240`),
    safeAll(env, `SELECT r.*, cc.case_id, cc.contract_reference FROM contract_service_requests r JOIN client_contracts cc ON cc.id = r.contract_id ORDER BY CASE r.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END, r.due_at LIMIT 400`),
    safeAll(env, `SELECT p.*, cc.case_id, cc.contract_reference FROM contract_payment_schedule p JOIN client_contracts cc ON cc.id = p.contract_id ORDER BY CASE p.status WHEN 'pending' THEN 1 ELSE 2 END, p.due_at LIMIT 400`),
    safeAll(env, `SELECT f.*, cc.case_id, cc.contract_reference FROM contract_referrals f JOIN client_contracts cc ON cc.id = f.contract_id ORDER BY CASE f.status WHEN 'draft_review' THEN 1 ELSE 2 END, f.updated_at DESC LIMIT 240`),
    safeAll(env, `SELECT e.*, cc.case_id, cc.contract_reference FROM contract_consent_events e JOIN client_contracts cc ON cc.id = e.contract_id ORDER BY e.created_at DESC LIMIT 400`),
    safeAll(env, `SELECT id, name, contact_email, appetite_profile, service_level_hours, active FROM insurer_partners ORDER BY active DESC, name`),
    safeFirst(env, `SELECT COUNT(*) AS cases, SUM(CASE WHEN stage NOT IN ('contract_active', 'lost') THEN 1 ELSE 0 END) AS open_cases, SUM(CASE WHEN priority = 'hot' THEN 1 ELSE 0 END) AS hot_cases, SUM(CASE WHEN readiness_score >= 70 THEN 1 ELSE 0 END) AS ready_cases, SUM(CASE WHEN human_review_required = 1 THEN 1 ELSE 0 END) AS human_review_required, COALESCE(SUM(estimated_value_min_cents), 0) AS value_min_cents, COALESCE(SUM(estimated_value_max_cents), 0) AS value_max_cents FROM brokerage_cases`),
    safeFirst(env, `SELECT COUNT(*) AS requested, SUM(CASE WHEN status IN ('received', 'validated') THEN 1 ELSE 0 END) AS received, SUM(CASE WHEN required = 1 AND status NOT IN ('received', 'validated') THEN 1 ELSE 0 END) AS missing_required FROM case_documents`),
    safeFirst(env, `SELECT COUNT(*) AS drafts, SUM(CASE WHEN status = 'draft_review' THEN 1 ELSE 0 END) AS review_drafts, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent FROM case_mail_queue`),
    safeFirst(env, `SELECT COUNT(*) AS consultations, SUM(CASE WHEN status = 'draft_review' THEN 1 ELSE 0 END) AS review_consultations, SUM(CASE WHEN status IN ('sent', 'answered', 'quoted') THEN 1 ELSE 0 END) AS active_consultations FROM insurer_consultations`),
    safeFirst(env, `SELECT COUNT(*) AS contracts, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_contracts, COALESCE(SUM(annual_premium_cents), 0) AS annual_premium_cents FROM client_contracts`)
  ]);

  const cases = caseRowsWithChildren(caseRows, documents, mails, consultations, timelines, contracts, contractRequests, contractPayments, contractReferrals, contractConsents, env);
  const summary = {
    ...(summaryRow || {}),
    documents: docSummary || {},
    mail_queue: mailSummary || {},
    consultations: { ...(consultSummary || {}), ...consultationOperationSummary(consultations) },
    contracts: contractSummary || {},
    contract_marker: CLIENT_CONTRACT_MARKER,
    contract_operations: contractOperationSummary(contracts, contractRequests, contractPayments, contractReferrals),
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
    contract_requests: rowsOrEmpty(contractRequests),
    contract_payments: rowsOrEmpty(contractPayments),
    contract_referrals: rowsOrEmpty(contractReferrals),
    partners: rowsOrEmpty(partners),
    actions: buildActions(cases, rowsOrEmpty(mails), rowsOrEmpty(consultations)),
    warnings: [syncResult?.warning, errorOf(caseRows), errorOf(documents), errorOf(mails), errorOf(consultations), errorOf(contracts), errorOf(contractRequests), errorOf(contractPayments), errorOf(contractReferrals), errorOf(contractConsents), errorOf(partners), errorOf(summaryRow), errorOf(docSummary), errorOf(mailSummary), errorOf(consultSummary), errorOf(contractSummary)].filter(Boolean),
    safeguards: ["human-review-before-send", "mail-draft-review", "insurer-consultation-human-review", "client-portal-token", "consent-snapshot", "audit-timeline", "client-contract-workspace"]
  });
}


function normalizeStatus(value, allowed) {
  const status = clean(value, 40);
  return allowed.includes(status) ? status : "";
}

async function updateContractRequestStatus(env, body) {
  const requestId = clean(body.request_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  const status = normalizeStatus(body.status, ["open", "in_progress", "resolved", "closed"]);
  if (!requestId || !status) return json({ success: false, error: "Statut demande invalide" }, 400);
  const row = await safeFirst(env, "SELECT r.*, cc.case_id, cc.contract_reference FROM contract_service_requests r JOIN client_contracts cc ON cc.id = r.contract_id WHERE r.id = ?", [requestId]);
  if (!row || errorOf(row)) return json({ success: false, error: "Demande contrat introuvable" }, 404);
  await safeRun(env, "UPDATE contract_service_requests SET status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), requestId]);
  await logTimeline(env, row.case_id, "contract_request_admin_status", reviewer, { marker: "admin-contract-action-v1", request_id: requestId, contract_id: row.contract_id, status });
  return json({ success: true, status });
}

async function updateReferralStatus(env, body) {
  const referralId = clean(body.referral_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  const status = normalizeStatus(body.status, ["draft_review", "approved", "rejected", "contacted", "rewarded"]);
  if (!referralId || !status) return json({ success: false, error: "Statut parrainage invalide" }, 400);
  const row = await safeFirst(env, "SELECT f.*, cc.case_id FROM contract_referrals f JOIN client_contracts cc ON cc.id = f.contract_id WHERE f.id = ?", [referralId]);
  if (!row || errorOf(row)) return json({ success: false, error: "Parrainage introuvable" }, 404);
  await safeRun(env, "UPDATE contract_referrals SET status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), referralId]);
  await logTimeline(env, row.case_id, "contract_referral_admin_status", reviewer, { marker: "admin-contract-action-v1", referral_id: referralId, contract_id: row.contract_id, status, human_review: true });
  return json({ success: true, status });
}

async function updatePaymentStatus(env, body) {
  const paymentId = clean(body.payment_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  const status = normalizeStatus(body.status, ["pending", "paid", "failed", "waived"]);
  const paymentUrl = clean(body.payment_url, 500);
  if (!paymentId || !status) return json({ success: false, error: "Statut paiement invalide" }, 400);
  const row = await safeFirst(env, "SELECT p.*, cc.case_id FROM contract_payment_schedule p JOIN client_contracts cc ON cc.id = p.contract_id WHERE p.id = ?", [paymentId]);
  if (!row || errorOf(row)) return json({ success: false, error: "Echeance introuvable" }, 404);
  await safeRun(env, "UPDATE contract_payment_schedule SET status = ?, payment_url = COALESCE(NULLIF(?, ''), payment_url), paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, ?) ELSE paid_at END, updated_at = ? WHERE id = ?", [status, paymentUrl, status, nowIso(), nowIso(), paymentId]);
  await logTimeline(env, row.case_id, "contract_payment_admin_status", reviewer, { marker: "admin-contract-action-v1", payment_id: paymentId, contract_id: row.contract_id, status });
  return json({ success: true, status });
}

function centsFromBody(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(String(value).replace(/[^0-9.,-]/g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric > 10000 ? numeric : numeric * 100);
}

function validEmail(value) {
  const email = clean(value, 180);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

async function consultationBundle(env, consultationId) {
  const row = await safeFirst(env, `SELECT i.*, c.case_reference, c.readiness_score, c.stage, l.reference AS lead_reference, l.name, l.phone, l.email, l.profile, l.property_type, l.city, l.units_count, l.need, l.message, l.lead_score, l.status AS lead_status
    FROM insurer_consultations i
    JOIN brokerage_cases c ON c.id = i.case_id
    JOIN leads l ON l.id = c.lead_id
    WHERE i.id = ?`, [consultationId]);
  if (!row || errorOf(row)) return { error: "Consultation assureur introuvable" };
  const documents = rowsOrEmpty(await safeAll(env, "SELECT * FROM case_documents WHERE case_id = ? ORDER BY required DESC, label", [row.case_id]));
  return { row, documents };
}

function missingRequiredDocuments(documents = []) {
  return rowsOrEmpty(documents).filter((doc) => Number(doc.required || 0) === 1 && !["received", "validated", "waived"].includes(clean(doc.status, 40)));
}

function insurerDraft(row, documents, followup = false) {
  if (followup) {
    return {
      subject: `Relance consultation ${clean(row.case_reference, 80)} - ${clean(row.insurer_name, 120)}`,
      body: [
        "Bonjour,",
        "",
        `Nous revenons vers vous au sujet du dossier ${clean(row.case_reference, 80)} transmis pour etude.`,
        `Risque: ${clean(row.property_type, 120) || "immeuble"} - ${clean(row.city, 120) || "ville a confirmer"} - ${clean(row.units_count, 40) || "lots a confirmer"} lot(s).`,
        "Merci de nous confirmer votre appetit, les garanties envisageables, franchises, exclusions et prime indicative.",
        "",
        "Cette relance est preparee en brouillon et doit rester validee humainement avant tout envoi.",
        "",
        "Bien cordialement,",
        "ImmeubleAssur"
      ].join("\n")
    };
  }
  return buildInsurerEmailDraft(row, row, documents);
}

async function approveConsultation(env, body) {
  const consultationId = clean(body.consultation_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  if (!consultationId) return json({ success: false, error: "consultation_id requis" }, 400);
  const bundle = await consultationBundle(env, consultationId);
  if (bundle.error) return json({ success: false, error: bundle.error }, 404);
  const recipient = validEmail(body.recipient_email || bundle.row.recipient_email);
  if (!recipient) return json({ success: false, error: "Email assureur requis avant approbation" }, 409);
  const missing = missingRequiredDocuments(bundle.documents);
  if (missing.length && body.override_missing_documents !== true) return json({ success: false, error: "Pieces requises manquantes avant consultation assureur", missing_required: missing.map((doc) => doc.label) }, 409);
  await safeRun(env, "UPDATE insurer_consultations SET recipient_email = ?, status = 'approved', package_status = 'approved_for_send', human_approved_at = COALESCE(human_approved_at, ?), notes = COALESCE(NULLIF(?, ''), notes), updated_at = ? WHERE id = ?", [recipient, nowIso(), clean(body.notes, 1000), nowIso(), consultationId]);
  await logTimeline(env, bundle.row.case_id, "insurer_consultation_approved", reviewer, { marker: "insurer-consultation-action-v1", consultation_id: consultationId, insurer_name: bundle.row.insurer_name, human_review: true });
  return json({ success: true, status: "approved" });
}

async function markConsultationSent(env, body, sentBy = "admin") {
  const consultationId = clean(body.consultation_id, 120);
  const reviewer = clean(body.reviewer || sentBy, 120);
  if (!consultationId) return json({ success: false, error: "consultation_id requis" }, 400);
  const bundle = await consultationBundle(env, consultationId);
  if (bundle.error) return json({ success: false, error: bundle.error }, 404);
  if (clean(bundle.row.status, 40) !== "approved" || !bundle.row.human_approved_at) return json({ success: false, error: "Validation humaine consultation requise avant envoi" }, 409);
  if (!validEmail(bundle.row.recipient_email)) return json({ success: false, error: "Email assureur requis avant envoi" }, 409);
  await safeRun(env, "UPDATE insurer_consultations SET status = 'sent', package_status = 'sent_to_partner', sent_at = COALESCE(sent_at, ?), response_due_at = COALESCE(response_due_at, ?), updated_at = ? WHERE id = ?", [nowIso(), new Date(Date.now() + 48 * 3600000).toISOString(), nowIso(), consultationId]);
  await safeRun(env, "UPDATE brokerage_cases SET stage = 'insurer_consultation', next_action = ?, updated_at = ? WHERE id = ?", ["Suivre les retours assureurs et relancer sans envoi non relu si l'echeance est depassee.", nowIso(), bundle.row.case_id]);
  await logTimeline(env, bundle.row.case_id, "insurer_consultation_marked_sent", reviewer, { marker: "insurer-consultation-action-v1", consultation_id: consultationId, insurer_name: bundle.row.insurer_name });
  return json({ success: true, status: "sent" });
}

async function sendConsultation(env, body) {
  const consultationId = clean(body.consultation_id, 120);
  if (!consultationId) return json({ success: false, error: "consultation_id requis" }, 400);
  const bundle = await consultationBundle(env, consultationId);
  if (bundle.error) return json({ success: false, error: bundle.error }, 404);
  if (clean(bundle.row.status, 40) !== "approved" || !bundle.row.human_approved_at) return json({ success: false, error: "Validation humaine consultation requise avant envoi" }, 409);
  if (!validEmail(bundle.row.recipient_email)) return json({ success: false, error: "Email assureur requis avant envoi" }, 409);
  const draft = insurerDraft(bundle.row, bundle.documents, false);
  const config = await smtpConfig(env, { recipient_email: bundle.row.recipient_email });
  if (!config.host || !config.username || !config.password || !config.from || !config.to.length) return json({ success: false, error: "Configuration SMTP incomplete" }, 503);
  const smtpResult = await sendPortableSmtpMail(config, mailMessage(config, { recipient_email: bundle.row.recipient_email, subject: draft.subject, body: draft.body }), env);
  const result = await markConsultationSent(env, body, "smtp");
  await logTimeline(env, bundle.row.case_id, "insurer_consultation_sent", clean(body.reviewer || "admin", 120), { marker: "insurer-consultation-action-v1", consultation_id: consultationId, insurer_name: bundle.row.insurer_name, smtp: clean(smtpResult, 500) });
  return result;
}

async function queueConsultationFollowup(env, body) {
  const consultationId = clean(body.consultation_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  if (!consultationId) return json({ success: false, error: "consultation_id requis" }, 400);
  const bundle = await consultationBundle(env, consultationId);
  if (bundle.error) return json({ success: false, error: bundle.error }, 404);
  if (!["sent", "answered", "quoted"].includes(clean(bundle.row.status, 40))) return json({ success: false, error: "Relance possible apres envoi initial seulement" }, 409);
  if (!validEmail(bundle.row.recipient_email)) return json({ success: false, error: "Email assureur requis pour preparer la relance" }, 409);
  const existing = await safeFirst(env, "SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'insurer_followup' AND recipient_email = ? AND status IN ('draft_review', 'approved')", [bundle.row.case_id, bundle.row.recipient_email]);
  if (existing?.id) return json({ success: true, status: "draft_review", mail_id: existing.id, reused: true });
  const draft = insurerDraft(bundle.row, bundle.documents, true);
  const mailId = crypto.randomUUID();
  await safeRun(env, `INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, scheduled_at, payload, created_at, updated_at)
    VALUES (?, ?, 'insurer_followup', ?, ?, ?, 'draft_review', 1, ?, ?, ?, ?)`, [mailId, bundle.row.case_id, bundle.row.recipient_email, draft.subject, draft.body, nowIso(), JSON.stringify({ marker: "insurer-consultation-action-v1", consultation_id: consultationId, purpose: "insurer_followup", human_review_required: true }), nowIso(), nowIso()]);
  await safeRun(env, "UPDATE insurer_consultations SET response_due_at = ?, updated_at = ? WHERE id = ?", [new Date(Date.now() + 24 * 3600000).toISOString(), nowIso(), consultationId]);
  await logTimeline(env, bundle.row.case_id, "insurer_consultation_followup_draft", reviewer, { marker: "insurer-consultation-action-v1", consultation_id: consultationId, mail_id: mailId, human_review: true });
  return json({ success: true, status: "draft_review", mail_id: mailId });
}

async function updateConsultationResponse(env, body) {
  const consultationId = clean(body.consultation_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  const status = normalizeStatus(body.status, ["answered", "quoted", "declined"]);
  if (!consultationId || !status) return json({ success: false, error: "Statut retour assureur invalide" }, 400);
  const bundle = await consultationBundle(env, consultationId);
  if (bundle.error) return json({ success: false, error: bundle.error }, 404);
  const premium = centsFromBody(body.premium_amount_cents ?? body.premium_amount);
  const deductible = centsFromBody(body.deductible_cents ?? body.deductible);
  await safeRun(env, "UPDATE insurer_consultations SET status = ?, answered_at = COALESCE(answered_at, ?), premium_amount_cents = COALESCE(?, premium_amount_cents), deductible_cents = COALESCE(?, deductible_cents), notes = COALESCE(NULLIF(?, ''), notes), updated_at = ? WHERE id = ?", [status, nowIso(), premium, deductible, clean(body.notes, 1500), nowIso(), consultationId]);
  if (status === "quoted") await safeRun(env, "UPDATE brokerage_cases SET stage = 'offer_followup', next_action = ?, updated_at = ? WHERE id = ?", ["Comparer l'offre assureur, verifier franchises/exclusions et presenter la meilleure option au client.", nowIso(), bundle.row.case_id]);
  await logTimeline(env, bundle.row.case_id, "insurer_consultation_response", reviewer, { marker: "insurer-consultation-action-v1", consultation_id: consultationId, insurer_name: bundle.row.insurer_name, status, premium_amount_cents: premium, deductible_cents: deductible });
  return json({ success: true, status });
}
export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 80);
  if (action === "sync") return json({ success: true, sync: await ensureCasesForOpenLeads(env, 220) });

  if (action === "contract_request_status") return updateContractRequestStatus(env, body);
  if (action === "referral_status") return updateReferralStatus(env, body);
  if (action === "payment_status") return updatePaymentStatus(env, body);
  if (action === "approve_consultation") return approveConsultation(env, body);
  if (action === "send_consultation") return sendConsultation(env, body);
  if (action === "mark_consultation_sent") return markConsultationSent(env, body);
  if (action === "consultation_followup") return queueConsultationFollowup(env, body);
  if (action === "consultation_response") return updateConsultationResponse(env, body);

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