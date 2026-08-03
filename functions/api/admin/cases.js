import { sendPortableSmtpMail } from "../../_shared/smtp.js";
import {
  BROKERAGE_CASE_MARKER,
  CLIENT_OFFER_FOLLOWUP_MARKER,
  buildClientOfferFollowupDraft,
  clientOfferFollowupDue,
  buildClientEmailDraft,
  buildInsurerEmailDraft,
  caseReferenceForLead,
  clean,
  consentSnapshotFor,
  documentChecklistFor,
  leadValueEstimate,
  nextActionForCase,
  nowIso,
  insurerPortalToken,
  insurerPortalUrl,
  portalToken,
  portalUrl,
  readinessScoreFor,
  safeJson,
  stageForCase,
  stageLabel,
  urgencyForLead
} from "../../_shared/brokerage-cases.js";
import { CLIENT_CONTRACT_MARKER, consentProfileFor, crossSellRecommendationsFor } from "../../_shared/client-contracts.js";

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const CLIENT_OFFER_MARKER = "client-offer-recommendation-v1";
const CASE_ACTION_PLAN_MARKER = "case-action-plan-v1";
const PARTNER_PERFORMANCE_MARKER = "partner-performance-v1";
const CRM_ACTION_QUEUE_MARKER = "crm-action-queue-v1";
const INSURER_PACKAGE_READINESS_MARKER = "insurer-package-readiness-v1";
const INSURER_PACKAGE_SEND_GUARD_MARKER = "insurer-package-send-guard-v1";
const INSURER_FOLLOWUP_AUTOPILOT_MARKER = "insurer-followup-autopilot-v1";
const CROSS_SELL_REVIEW_MARKER = "cross-sell-human-review-v1";

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

async function materializeClientOfferFollowups(env, counters) {
  const offerRows = await safeAll(env, `SELECT o.*, c.case_reference, c.client_portal_token, l.name, l.email, l.city, l.need, l.property_type, l.status AS lead_status
    FROM client_offer_recommendations o
    JOIN brokerage_cases c ON c.id = o.case_id
    JOIN leads l ON l.id = c.lead_id
    WHERE o.status = 'presented' AND l.status NOT IN ('won', 'lost', 'archived')
    ORDER BY COALESCE(o.presented_at, o.human_approved_at, o.updated_at) ASC
    LIMIT 200`);
  if (errorOf(offerRows)) return errorOf(offerRows);
  for (const offer of rowsOrEmpty(offerRows)) {
    if (!clientOfferFollowupDue(offer)) continue;
    counters.offer_followups_due += 1;
    if (!clean(offer.email, 180)) {
      counters.offer_followups_missing_email += 1;
      continue;
    }
    const existing = await safeFirst(env, "SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'client_offer_followup' AND payload LIKE ? AND status IN ('draft_review', 'approved', 'sent')", [offer.case_id, `%${offer.id}%`]);
    if (existing?.id) continue;
    const draft = buildClientOfferFollowupDraft(offer, clean(env.SITE_ORIGIN, 240) || "https://immeubleassur.com");
    const mailId = crypto.randomUUID();
    await safeRun(env, `INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, scheduled_at, payload, created_at, updated_at)
      VALUES (?, ?, 'client_offer_followup', ?, ?, ?, 'draft_review', 1, ?, ?, ?, ?)`, [mailId, offer.case_id, clean(offer.email, 180), draft.subject, draft.body, nowIso(), JSON.stringify({ marker: CLIENT_OFFER_FOLLOWUP_MARKER, offer_id: offer.id, human_review_required: true, purpose: "client_offer_followup" }), nowIso(), nowIso()]);
    await safeRun(env, "UPDATE brokerage_cases SET next_action = ?, human_review_required = 1, updated_at = ? WHERE id = ?", ["Valider la relance offre client ou appeler le prospect avant expiration de la proposition.", nowIso(), offer.case_id]);
    await logTimeline(env, offer.case_id, "client_offer_followup_draft", "system", { marker: CLIENT_OFFER_FOLLOWUP_MARKER, offer_id: offer.id, mail_id: mailId, human_review_required: true });
    counters.offer_followup_drafts += 1;
    counters.mail_drafts += 1;
  }
  return "";
}

async function materializeInsurerConsultationFollowups(env, counters) {
  const consultationRows = await safeAll(env, `SELECT i.*, c.case_reference
    FROM insurer_consultations i
    JOIN brokerage_cases c ON c.id = i.case_id
    WHERE i.status = 'sent'
    ORDER BY i.response_due_at ASC, i.updated_at ASC
    LIMIT 240`);
  if (errorOf(consultationRows)) return errorOf(consultationRows);
  const now = Date.now();
  for (const consultation of rowsOrEmpty(consultationRows)) {
    const dueAt = new Date(consultation.response_due_at || "").getTime();
    if (!Number.isFinite(dueAt) || dueAt >= now) continue;
    counters.insurer_followups_due += 1;
    if (!validEmail(consultation.recipient_email)) {
      counters.insurer_followups_missing_email += 1;
      continue;
    }
    const existing = await safeFirst(env, "SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'insurer_followup' AND recipient_email = ? AND payload LIKE ? AND status IN ('draft_review', 'approved')", [consultation.case_id, consultation.recipient_email, `%${consultation.id}%`]);
    if (existing?.id) continue;
    const bundle = await consultationBundle(env, consultation.id);
    if (bundle.error) {
      counters.insurer_followups_errors += 1;
      continue;
    }
    const access = await ensureConsultationToken(env, consultation.id, { insurer_name: bundle.row.insurer_name, case_id: bundle.row.case_id });
    const draft = insurerDraft(bundle.row, bundle.documents, true, consultationPortalLink(env, access.token));
    const mailId = crypto.randomUUID();
    await safeRun(env, `INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, scheduled_at, payload, created_at, updated_at)
      VALUES (?, ?, 'insurer_followup', ?, ?, ?, 'draft_review', 1, ?, ?, ?, ?)`, [mailId, bundle.row.case_id, bundle.row.recipient_email, draft.subject, draft.body, nowIso(), JSON.stringify({ marker: INSURER_FOLLOWUP_AUTOPILOT_MARKER, consultation_id: consultation.id, purpose: "insurer_followup_autopilot", human_review_required: true, previous_due_at: consultation.response_due_at || "" }), nowIso(), nowIso()]);
    await safeRun(env, "UPDATE insurer_consultations SET response_due_at = ?, updated_at = ? WHERE id = ?", [new Date(Date.now() + 24 * 3600000).toISOString(), nowIso(), consultation.id]);
    await safeRun(env, "UPDATE brokerage_cases SET next_action = ?, human_review_required = 1, updated_at = ? WHERE id = ?", ["Valider la relance assureur preparee automatiquement ou tracer une reponse partenaire avant envoi.", nowIso(), bundle.row.case_id]);
    await logTimeline(env, bundle.row.case_id, "insurer_consultation_followup_autopilot", "system", { marker: INSURER_FOLLOWUP_AUTOPILOT_MARKER, consultation_id: consultation.id, mail_id: mailId, human_review_required: true, previous_due_at: consultation.response_due_at || "" });
    counters.insurer_followup_drafts += 1;
    counters.mail_drafts += 1;
  }
  return "";
}

async function ensureCasesForOpenLeads(env, limit = 160) {
  const counters = { scanned: 0, created: 0, updated: 0, documents_requested: 0, mail_drafts: 0, consultations_prepared: 0, offer_followups_due: 0, offer_followup_drafts: 0, offer_followups_missing_email: 0, insurer_followups_due: 0, insurer_followup_drafts: 0, insurer_followups_missing_email: 0, insurer_followups_errors: 0 };
  const leadRows = await safeAll(env, `SELECT * FROM leads WHERE status NOT IN ('lost', 'archived') ORDER BY created_at DESC LIMIT ?`, [limit]);
  const touched = [];
  for (const lead of rowsOrEmpty(leadRows)) {
    counters.scanned += 1;
    const result = await materializeCase(env, lead, counters);
    if (result) touched.push(result);
  }
  const followupWarning = await materializeClientOfferFollowups(env, counters);
  const insurerFollowupWarning = await materializeInsurerConsultationFollowups(env, counters);
  return { counters, touched, warning: [errorOf(leadRows), followupWarning, insurerFollowupWarning].filter(Boolean).join("; ") };
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

function crossSellReviewFor(contract = {}, lead = {}) {
  const consent = consentProfileFor(safeJson(contract.consent_profile, {}));
  const recommendations = crossSellRecommendationsFor(lead, consent);
  if (clean(contract.status, 40) !== "active" || recommendations.enabled !== true || !rowsOrEmpty(recommendations.recommendations).length) {
    return { marker: CROSS_SELL_REVIEW_MARKER, enabled: false, reason: recommendations.reason || "cross_sell_not_available", human_review_required: true, no_automatic_contact: true };
  }
  const top = rowsOrEmpty(recommendations.recommendations).slice(0, 3);
  return {
    marker: CROSS_SELL_REVIEW_MARKER,
    enabled: true,
    status: "review_required",
    reason: recommendations.reason || "explicit-opt-in",
    recommendations: top,
    recommendation_labels: top.map((item) => clean(item.label, 160)),
    next_action: "Verifier l'interet client, preparer une proposition utile et contacter uniquement apres revue humaine.",
    human_review_required: true,
    no_automatic_contact: true
  };
}

function contractOperationSummary(contracts = [], requests = [], payments = [], referrals = []) {
  const now = Date.now();
  const renewalLimit = now + 60 * 86400000;
  const rows = rowsOrEmpty(contracts);
  const requestRows = rowsOrEmpty(requests);
  const paymentRows = rowsOrEmpty(payments);
  const referralRows = rowsOrEmpty(referrals);
  const crossSellReviews = rows.filter((item) => clean(item.status, 40) === "active" && consentProfileFor(safeJson(item.consent_profile, {})).cross_sell === true).length;
  const navigationStudyEnabled = rows.filter((item) => clean(item.status, 40) === "active" && consentProfileFor(safeJson(item.consent_profile, {})).navigation_study === true).length;
  return {
    contracts: rows.length,
    open_requests: requestRows.filter((item) => ["open", "in_progress"].includes(clean(item.status, 40))).length,
    high_requests: requestRows.filter((item) => clean(item.priority, 40) === "high" && ["open", "in_progress"].includes(clean(item.status, 40))).length,
    pending_payments: paymentRows.filter((item) => clean(item.status, 40) === "pending").length,
    review_referrals: referralRows.filter((item) => clean(item.status, 40) === "draft_review").length,
    cross_sell_reviews: crossSellReviews,
    navigation_study_enabled: navigationStudyEnabled,
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

function ratioPercent(part, total) {
  if (!Number(total || 0)) return 0;
  return Math.round((Number(part || 0) / Number(total || 1)) * 100);
}

function insurerPackageReadiness(row = {}, documents = [], mails = [], consultations = [], partners = []) {
  const required = rowsOrEmpty(documents).filter((doc) => Number(doc.required || 0) === 1);
  const acceptedStatuses = ["received", "validated", "waived"];
  const receivedRequired = required.filter((doc) => acceptedStatuses.includes(clean(doc.status, 40)));
  const missingRequired = required.filter((doc) => !acceptedStatuses.includes(clean(doc.status, 40)));
  const consultationRows = rowsOrEmpty(consultations);
  const mailRows = rowsOrEmpty(mails);
  const activePartners = rowsOrEmpty(partners).filter((partner) => Number(partner.active || 0) === 1);
  const partnerContacts = activePartners.filter((partner) => clean(partner.contact_email, 180));
  const missingConsultationEmail = consultationRows.filter((item) => ["draft_review", "approved"].includes(clean(item.status, 40)) && !clean(item.recipient_email, 180));
  const insurerDraft = mailRows.find((item) => clean(item.audience, 80) === "insurer" && clean(item.status, 40) === "draft_review");
  const activeConsultations = consultationRows.filter((item) => ["sent", "answered", "quoted"].includes(clean(item.status, 40)));
  const quotedConsultations = consultationRows.filter((item) => clean(item.status, 40) === "quoted");
  const documentScore = ratioPercent(receivedRequired.length, required.length);
  let score = Math.max(0, Math.min(100, Math.round((Number(row.readiness_score || 0) * 0.65) + (documentScore * 0.35))));
  if (missingConsultationEmail.length) score = Math.max(0, score - 10);
  if (activeConsultations.length) score = Math.min(100, score + 8);
  if (quotedConsultations.length) score = Math.min(100, score + 8);
  let status = "qualification";
  let label = "Qualification";
  let nextAction = "Qualifier le risque et demander les pieces prioritaires avant consultation assureur.";
  const blockers = [];
  if (missingRequired.length) {
    status = "blocked_documents";
    label = "Pieces a completer";
    nextAction = "Relancer le client sur les pieces manquantes avant consultation assureur.";
    blockers.push(...missingRequired.slice(0, 5).map((doc) => clean(doc.label, 160)));
  } else if (missingConsultationEmail.length || (Number(row.readiness_score || 0) >= 70 && activePartners.length && !partnerContacts.length)) {
    status = "blocked_partner_contact";
    label = "Contact assureur a completer";
    nextAction = "Renseigner l'email assureur ou choisir un partenaire joignable avant approbation.";
    blockers.push(...missingConsultationEmail.slice(0, 4).map((item) => `${clean(item.insurer_name, 120)}: email manquant`));
    if (!blockers.length) blockers.push("aucun partenaire actif avec email");
  } else if (quotedConsultations.length) {
    status = "quote_received";
    label = "Offre assureur recue";
    nextAction = "Comparer les conditions et preparer une proposition client sous revue humaine.";
  } else if (activeConsultations.length) {
    status = "market_active";
    label = "Consultation en marche";
    nextAction = "Suivre les SLA assureurs, tracer les retours et relancer par brouillon relu si necessaire.";
  } else if (consultationRows.some((item) => clean(item.status, 40) === "draft_review") || insurerDraft) {
    status = "draft_review";
    label = "Pack en revue";
    nextAction = "Relire le pack assureur, verifier les pieces et approuver humainement.";
  } else if (Number(row.readiness_score || 0) >= 70) {
    status = "ready_for_human_review";
    label = "Pack pret";
    nextAction = "Choisir les partenaires, relire le dossier et approuver la consultation.";
  }
  return {
    marker: INSURER_PACKAGE_READINESS_MARKER,
    status,
    label,
    score,
    document_completion: documentScore,
    required_documents: required.length,
    received_required_documents: receivedRequired.length,
    missing_required_documents: missingRequired.length,
    missing_documents: missingRequired.slice(0, 8).map((doc) => clean(doc.label, 160)),
    partner_contacts_ready: partnerContacts.length,
    missing_consultation_email: missingConsultationEmail.length,
    consultations: consultationRows.length,
    active_consultations: activeConsultations.length,
    quoted_consultations: quotedConsultations.length,
    next_action: nextAction,
    blockers,
    proof_points: receivedRequired.slice(0, 6).map((doc) => clean(doc.label, 160)),
    human_review_required: true
  };
}
function latestByFields(rows = [], fields = ["updated_at", "created_at"]) {
  return rowsOrEmpty(rows).slice().sort((a, b) => {
    const at = Math.max(...fields.map((field) => new Date(a?.[field] || "").getTime()).filter(Number.isFinite), 0);
    const bt = Math.max(...fields.map((field) => new Date(b?.[field] || "").getTime()).filter(Number.isFinite), 0);
    return bt - at;
  })[0] || null;
}

function caseActionPlan(row = {}, documents = [], mails = [], consultations = [], offers = [], contracts = []) {
  const now = Date.now();
  const missing = rowsOrEmpty(documents).filter((doc) => Number(doc.required || 0) === 1 && !["received", "validated", "waived"].includes(clean(doc.status, 40)));
  const draftMail = latestByFields(rowsOrEmpty(mails).filter((item) => clean(item.status, 40) === "draft_review"));
  const approvedMail = latestByFields(rowsOrEmpty(mails).filter((item) => clean(item.status, 40) === "approved"));
  const draftConsultation = latestByFields(rowsOrEmpty(consultations).filter((item) => clean(item.status, 40) === "draft_review"));
  const approvedConsultation = latestByFields(rowsOrEmpty(consultations).filter((item) => clean(item.status, 40) === "approved"));
  const overdueConsultation = latestByFields(rowsOrEmpty(consultations).filter((item) => clean(item.status, 40) === "sent" && Number.isFinite(new Date(item.response_due_at || "").getTime()) && new Date(item.response_due_at).getTime() < now), ["response_due_at", "updated_at"]);
  const quotedConsultation = latestByFields(rowsOrEmpty(consultations).filter((item) => clean(item.status, 40) === "quoted"));
  const draftOffer = latestByFields(rowsOrEmpty(offers).filter((item) => clean(item.status, 40) === "draft_review"));
  const presentedOffer = latestByFields(rowsOrEmpty(offers).filter((item) => clean(item.status, 40) === "presented"), ["validity_until", "updated_at"]);
  const contractOps = rowsOrEmpty(contracts).flatMap((contract) => [
    ...rowsOrEmpty(contract.requests).filter((item) => ["open", "in_progress"].includes(clean(item.status, 40))).map((item) => ({ type: "demande", due_at: item.due_at, label: item.subject || item.request_type || contract.contract_reference })),
    ...rowsOrEmpty(contract.payments).filter((item) => clean(item.status, 40) === "pending").map((item) => ({ type: "prime", due_at: item.due_at, label: item.label || contract.contract_reference })),
    ...rowsOrEmpty(contract.referrals).filter((item) => clean(item.status, 40) === "draft_review").map((item) => ({ type: "parrainage", due_at: item.updated_at, label: item.referred_name || contract.contract_reference }))
  ]);
  const base = {
    marker: CASE_ACTION_PLAN_MARKER,
    status: "manual_followup",
    severity: "normal",
    label: "Suivi manuel",
    next_action: clean(row.next_action, 1000) || "Controler le dossier et tracer la prochaine action humaine.",
    blockers: [],
    due_at: row.due_at || "",
    human_review_required: Number(row.human_review_required || 0) === 1,
    missing_required_documents: missing.length
  };
  if (clean(row.stage, 60) === "contract_active" && contractOps.length) return { ...base, status: "contract_ops", severity: "high", label: "Operations contrat", next_action: "Traiter les demandes, primes ou parrainages ouverts depuis l'espace client.", blockers: contractOps.slice(0, 3).map((item) => `${item.type}: ${clean(item.label, 120)}`), due_at: contractOps.find((item) => item.due_at)?.due_at || base.due_at, human_review_required: true };
  if (!clean(row.email, 180) && !clean(row.phone, 80)) return { ...base, status: "blocked_contact", severity: "high", label: "Contact client incomplet", next_action: "Completer email ou telephone avant toute relance automatisee.", blockers: ["email/telephone manquant"], human_review_required: true };
  if (missing.length) return { ...base, status: "blocked_documents", severity: "high", label: "Pieces manquantes", next_action: "Relancer le client avec le lien d'espace client et limiter la demande aux pieces utiles.", blockers: missing.slice(0, 3).map((doc) => clean(doc.label, 160)), human_review_required: true };
  if (draftOffer) return { ...base, status: "offer_review", severity: "high", label: "Offre client a relire", next_action: "Verifier prime, franchises, exclusions et publier seulement apres validation humaine.", blockers: [clean(draftOffer.insurer_name, 120) || "offre client"], human_review_required: true };
  if (draftConsultation) return { ...base, status: clean(draftConsultation.recipient_email, 180) ? "consultation_review" : "consultation_contact_missing", severity: "high", label: "Consultation assureur a relire", next_action: clean(draftConsultation.recipient_email, 180) ? "Relire le pack assureur puis approuver la consultation." : "Renseigner l'email assureur avant approbation.", blockers: clean(draftConsultation.recipient_email, 180) ? [clean(draftConsultation.insurer_name, 120)] : [`${clean(draftConsultation.insurer_name, 120)}: email manquant`], human_review_required: true };
  if (draftMail) return { ...base, status: "mail_review", severity: "high", label: "Mail a valider", next_action: "Relire le message avant approbation; aucun envoi direct sans controle humain.", blockers: [clean(draftMail.subject, 180)], human_review_required: true };
  if (approvedConsultation) return { ...base, status: "consultation_ready_send", severity: "normal", label: "Consultation prete", next_action: "Envoyer ou marquer envoyee la consultation assureur deja approuvee.", blockers: [clean(approvedConsultation.insurer_name, 120)], human_review_required: true };
  if (approvedMail) return { ...base, status: "mail_ready_send", severity: "normal", label: "Mail approuve", next_action: "Envoyer ou marquer envoye le mail deja relu.", blockers: [clean(approvedMail.subject, 180)], human_review_required: true };
  if (overdueConsultation) return { ...base, status: "insurer_overdue", severity: "high", label: "Assureur en retard", next_action: "Creer une relance assureur en brouillon puis la valider humainement.", blockers: [clean(overdueConsultation.insurer_name, 120)], due_at: overdueConsultation.response_due_at || base.due_at, human_review_required: true };
  if (quotedConsultation && !draftOffer && !presentedOffer) return { ...base, status: "offer_to_prepare", severity: "high", label: "Offre a preparer", next_action: "Transformer le retour assureur en proposition client relue et comparable.", blockers: [clean(quotedConsultation.insurer_name, 120)], human_review_required: true };
  if (presentedOffer) return { ...base, status: "client_offer_followup", severity: "normal", label: "Offre client a suivre", next_action: "Suivre l'acceptation explicite client ou preparer une relance humaine.", blockers: [clean(presentedOffer.insurer_name, 120)], due_at: presentedOffer.validity_until || base.due_at, human_review_required: true };
  if (Number(row.readiness_score || 0) >= 70 && clean(row.stage, 60) === "ready_for_market") return { ...base, status: "ready_for_market", severity: "normal", label: "Pret assureurs", next_action: "Choisir les partenaires, relire le dossier et approuver la consultation.", human_review_required: true };
  return base;
}

function actionPlanSummary(cases = []) {
  const rows = rowsOrEmpty(cases);
  return rows.reduce((acc, item) => {
    const plan = item.action_plan || {};
    const status = clean(plan.status, 80) || "manual_followup";
    acc.total += 1;
    acc[status] = (acc[status] || 0) + 1;
    if (clean(plan.severity, 40) === "high") acc.high += 1;
    if (plan.human_review_required) acc.human_review_required += 1;
    return acc;
  }, { marker: CASE_ACTION_PLAN_MARKER, total: 0, high: 0, human_review_required: 0 });
}

function partnerRowsWithPerformance(partners = [], consultations = []) {
  const now = Date.now();
  const consultationRows = rowsOrEmpty(consultations);
  return rowsOrEmpty(partners).map((partner) => {
    const related = consultationRows.filter((item) => clean(item.partner_id, 120) === clean(partner.id, 120) || clean(item.insurer_name, 160) === clean(partner.name, 160));
    const stats = {
      consultations: related.length,
      draft_review: related.filter((item) => clean(item.status, 40) === "draft_review").length,
      approved: related.filter((item) => clean(item.status, 40) === "approved").length,
      sent: related.filter((item) => clean(item.status, 40) === "sent").length,
      answered: related.filter((item) => ["answered", "quoted"].includes(clean(item.status, 40))).length,
      quoted: related.filter((item) => clean(item.status, 40) === "quoted").length,
      declined: related.filter((item) => clean(item.status, 40) === "declined").length,
      overdue: related.filter((item) => clean(item.status, 40) === "sent" && Number.isFinite(new Date(item.response_due_at || "").getTime()) && new Date(item.response_due_at).getTime() < now).length,
      missing_recipient: related.filter((item) => ["draft_review", "approved"].includes(clean(item.status, 40)) && !clean(item.recipient_email, 180)).length
    };
    const latest = latestByFields(related, ["answered_at", "sent_at", "updated_at", "created_at"]);
    const contactEmail = clean(partner.contact_email, 180);
    const active = Number(partner.active || 0) === 1;
    const score = Math.max(0, Math.min(100, 55 + (contactEmail ? 8 : -18) + stats.quoted * 10 + stats.answered * 4 - stats.overdue * 15 - stats.missing_recipient * 8 - stats.declined * 4));
    const status = !active ? "inactive" : !contactEmail ? "contact_missing" : stats.overdue ? "overdue" : stats.missing_recipient ? "setup_required" : stats.quoted ? "productive" : (stats.sent || stats.approved || stats.draft_review) ? "in_progress" : "ready";
    const nextAction = ({
      inactive: "Verifier si ce partenaire doit rester desactive.",
      contact_missing: "Renseigner un email assureur avant toute consultation.",
      overdue: "Relancer ce partenaire depuis un brouillon relu humainement.",
      setup_required: "Completer le contact et valider le pack avant envoi.",
      productive: "Capitaliser sur les retours cotes et comparer les conditions.",
      in_progress: "Suivre les consultations ouvertes et tracer les retours.",
      ready: "Partenaire pret pour une prochaine consultation qualifiee."
    })[status] || "Suivi partenaire a tracer.";
    return {
      ...partner,
      performance: {
        marker: PARTNER_PERFORMANCE_MARKER,
        status,
        score,
        active,
        contact_configured: Boolean(contactEmail),
        last_activity_at: latest?.answered_at || latest?.sent_at || latest?.updated_at || latest?.created_at || "",
        next_action: nextAction,
        ...stats
      }
    };
  });
}

function partnerPerformanceSummary(partners = []) {
  const rows = rowsOrEmpty(partners);
  const summary = rows.reduce((acc, partner) => {
    const performance = partner.performance || {};
    const status = clean(performance.status, 80) || "ready";
    acc.partners += 1;
    if (performance.active) acc.active += 1;
    if (performance.contact_configured) acc.contact_configured += 1;
    acc[status] = (acc[status] || 0) + 1;
    acc.overdue_consultations += Number(performance.overdue || 0);
    acc.quoted += Number(performance.quoted || 0);
    acc.missing_recipient += Number(performance.missing_recipient || 0);
    return acc;
  }, { marker: PARTNER_PERFORMANCE_MARKER, partners: 0, active: 0, contact_configured: 0, contact_missing: 0, setup_required: 0, overdue: 0, overdue_consultations: 0, quoted: 0, missing_recipient: 0 });
  const top = rows.slice().sort((a, b) => Number(b.performance?.score || 0) - Number(a.performance?.score || 0))[0];
  summary.top_partner = clean(top?.name, 160);
  return summary;
}

function queueUrgency(priority, dueAt = "") {
  const dueTime = new Date(dueAt || "").getTime();
  if ((Number.isFinite(dueTime) && dueTime < Date.now()) || Number(priority || 0) >= 100) return "critical";
  if (Number(priority || 0) >= 90) return "high";
  return "normal";
}

function pushCrmAction(queue, item) {
  const priority = Number(item.priority || 0);
  const dueAt = item.due_at || "";
  queue.push({
    marker: CRM_ACTION_QUEUE_MARKER,
    priority,
    urgency: queueUrgency(priority, dueAt),
    due_at: dueAt,
    type: clean(item.type, 80),
    target: clean(item.target, 160),
    case_reference: clean(item.case_reference, 120),
    lead_name: clean(item.lead_name, 120),
    lead_city: clean(item.lead_city, 120),
    stage: clean(item.stage, 80),
    contact_channel: clean(item.contact_channel, 40) || "admin",
    signal: clean(item.signal, 500),
    recommendation: clean(item.recommendation, 1000),
    human_review_required: item.human_review_required !== false,
    quick_action: clean(item.quick_action, 80)
  });
}

function buildCrmActionQueue(cases = [], mails = [], consultations = [], partners = []) {
  const queue = [];
  const partnerIssue = rowsOrEmpty(partners).find((item) => ["contact_missing", "overdue", "setup_required"].includes(item.performance?.status));
  if (partnerIssue) pushCrmAction(queue, {
    priority: 95,
    type: "relation-assureur",
    target: partnerIssue.name,
    signal: partnerIssue.performance?.status || "partenaire",
    recommendation: partnerIssue.performance?.next_action || "Mettre a jour le partenaire assureur.",
    contact_channel: "partenaire",
    human_review_required: true,
    quick_action: "update_partner"
  });

  for (const caseRow of rowsOrEmpty(cases)) {
    const lead = caseRow.lead || {};
    const base = {
      target: caseRow.case_reference,
      case_reference: caseRow.case_reference,
      lead_name: lead.name,
      lead_city: lead.city,
      stage: caseRow.stage,
      due_at: caseRow.due_at,
      contact_channel: lead.phone ? "appel" : (lead.email ? "email" : "admin")
    };
    const plan = caseRow.action_plan || {};
    const packageReadiness = caseRow.insurer_package_readiness || {};
    if (["blocked_documents", "blocked_partner_contact"].includes(packageReadiness.status)) pushCrmAction(queue, {
      ...base,
      priority: packageReadiness.status === "blocked_documents" ? 99 : 94,
      type: "pack-assureur-bloque",
      signal: packageReadiness.label || "pack incomplet",
      recommendation: packageReadiness.next_action || "Completer le pack assureur sous controle humain.",
      human_review_required: true,
      quick_action: packageReadiness.status === "blocked_documents" ? "review_client_mail" : "update_partner"
    });
    if (["ready_for_human_review", "draft_review"].includes(packageReadiness.status)) pushCrmAction(queue, {
      ...base,
      priority: packageReadiness.status === "ready_for_human_review" ? 97 : 92,
      type: "pack-assureur-revue",
      signal: `${packageReadiness.label || "pack"} - ${packageReadiness.score || 0}/100`,
      recommendation: packageReadiness.next_action || "Relire le pack assureur avant consultation.",
      human_review_required: true,
      quick_action: "approve_consultation"
    });
    if (plan.severity === "high" || plan.human_review_required) pushCrmAction(queue, {
      ...base,
      priority: plan.severity === "high" ? 106 : 86,
      type: "plan-dossier",
      signal: plan.label || "plan action",
      recommendation: plan.next_action || caseRow.next_action || "Controler le dossier et tracer la prochaine action humaine.",
      human_review_required: Boolean(plan.human_review_required),
      quick_action: "open_case"
    });
    if (Number(caseRow.missing_required_documents || 0) > 0) pushCrmAction(queue, {
      ...base,
      priority: 98,
      type: "pieces-client",
      signal: `${caseRow.missing_required_documents} piece(s) requise(s)`,
      recommendation: "Relancer le client sur les seules pieces manquantes, apres relecture humaine du message.",
      human_review_required: true,
      quick_action: "review_client_mail"
    });
    if (caseRow.priority === "hot" && !caseRow.assigned_to) pushCrmAction(queue, {
      ...base,
      priority: 101,
      type: "assignation",
      signal: "dossier chaud sans pilote",
      recommendation: "Assigner un courtier puis appeler le prospect avant toute automatisation.",
      human_review_required: true,
      quick_action: "assign_broker"
    });

    for (const mail of rowsOrEmpty(caseRow.mail_queue)) {
      if (mail.status === "draft_review") pushCrmAction(queue, {
        ...base,
        priority: /followup/.test(mail.audience || "") ? 93 : 88,
        type: "mail-a-valider",
        signal: mail.subject || mail.audience,
        recommendation: "Relire le brouillon, verifier le destinataire et approuver uniquement si le contexte est exact.",
        human_review_required: true,
        quick_action: "approve_mail"
      });
      if (mail.status === "approved" && mail.recipient_email) pushCrmAction(queue, {
        ...base,
        priority: 90,
        type: "mail-approuve",
        signal: mail.subject || mail.audience,
        recommendation: "Envoyer ou marquer comme envoye le mail deja approuve, puis tracer la suite.",
        human_review_required: true,
        quick_action: "send_mail"
      });
    }

    for (const consultation of rowsOrEmpty(caseRow.consultations)) {
      if (consultation.status === "draft_review") pushCrmAction(queue, {
        ...base,
        priority: consultation.recipient_email ? 91 : 87,
        type: "consultation-assureur",
        signal: consultation.insurer_name || "assureur",
        recommendation: consultation.recipient_email ? "Relire le pack assureur puis approuver la consultation." : "Completer l'email assureur avant approbation.",
        human_review_required: true,
        quick_action: "approve_consultation"
      });
      if (consultation.status === "approved") pushCrmAction(queue, {
        ...base,
        priority: 92,
        type: "consultation-a-envoyer",
        signal: consultation.insurer_name || "assureur",
        recommendation: "Envoyer la consultation approuvee ou la marquer envoyee apres controle.",
        human_review_required: true,
        quick_action: "send_consultation"
      });
      if (consultation.status === "sent" && Number.isFinite(new Date(consultation.response_due_at || "").getTime()) && new Date(consultation.response_due_at).getTime() < Date.now()) pushCrmAction(queue, {
        ...base,
        priority: 96,
        due_at: consultation.response_due_at,
        type: "relance-assureur",
        signal: consultation.insurer_name || "SLA depasse",
        recommendation: "Generer un brouillon de relance assureur et le faire valider humainement.",
        human_review_required: true,
        quick_action: "consultation_followup"
      });
      if (consultation.status === "quoted") pushCrmAction(queue, {
        ...base,
        priority: 94,
        type: "offre-a-preparer",
        signal: consultation.insurer_name || "offre recue",
        recommendation: "Comparer les conditions puis preparer une proposition client sous revue humaine.",
        human_review_required: true,
        quick_action: "prepare_client_offer"
      });
    }

    for (const offer of rowsOrEmpty(caseRow.client_offers)) {
      if (offer.status === "draft_review") pushCrmAction(queue, {
        ...base,
        priority: 97,
        type: "offre-client-a-valider",
        signal: offer.insurer_name || offer.case_reference || "offre client",
        recommendation: "Relire la recommandation, les garanties et la prime avant publication dans l'espace client.",
        human_review_required: true,
        quick_action: "approve_client_offer"
      });
    }

    for (const contract of rowsOrEmpty(caseRow.contracts)) {
      for (const request of rowsOrEmpty(contract.requests).filter((item) => ["open", "in_progress"].includes(clean(item.status, 40)))) pushCrmAction(queue, {
        ...base,
        priority: request.priority === "high" ? 99 : 89,
        due_at: request.due_at || base.due_at,
        type: "demande-contrat",
        signal: request.subject || request.request_type || contract.contract_reference,
        recommendation: "Traiter la demande client depuis l'espace contrat et tracer le statut.",
        human_review_required: true,
        quick_action: "contract_request_status"
      });
      for (const payment of rowsOrEmpty(contract.payments).filter((item) => clean(item.status, 40) === "pending")) pushCrmAction(queue, {
        ...base,
        priority: 90,
        due_at: payment.due_at || base.due_at,
        type: "prime-a-suivre",
        signal: payment.label || contract.contract_reference,
        recommendation: "Verifier la prime, le lien de paiement et tracer le reglement apres controle.",
        human_review_required: true,
        quick_action: "payment_status"
      });
      for (const referral of rowsOrEmpty(contract.referrals).filter((item) => clean(item.status, 40) === "draft_review")) pushCrmAction(queue, {
        ...base,
        priority: 84,
        type: "parrainage-a-valider",
        signal: referral.referred_name || contract.contract_reference,
        recommendation: "Verifier le parrainage et valider l'avantage uniquement apres controle humain.",
        human_review_required: true,
        quick_action: "referral_status"
      });
      const crossSell = contract.cross_sell_review || {};
      if (crossSell.enabled === true) pushCrmAction(queue, {
        ...base,
        priority: 82,
        type: "cross-sell-revue",
        signal: rowsOrEmpty(crossSell.recommendation_labels).join(", ") || contract.contract_reference,
        recommendation: crossSell.next_action || "Verifier l'interet client avant toute proposition complementaire.",
        contact_channel: "admin",
        human_review_required: true,
        quick_action: "cross_sell_review"
      });
    }
  }

  return queue.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || new Date(a.due_at || 8640000000000000) - new Date(b.due_at || 8640000000000000)).slice(0, 40);
}

function crmActionQueueSummary(queue = []) {
  const rows = rowsOrEmpty(queue);
  return {
    marker: CRM_ACTION_QUEUE_MARKER,
    total: rows.length,
    critical: rows.filter((item) => item.urgency === "critical").length,
    high: rows.filter((item) => item.urgency === "high").length,
    human_review_required: rows.filter((item) => item.human_review_required).length,
    overdue: rows.filter((item) => Number.isFinite(new Date(item.due_at || "").getTime()) && new Date(item.due_at).getTime() < Date.now()).length
  };
}
function insurerPackageReadinessSummary(cases = []) {
  const rows = rowsOrEmpty(cases);
  const summary = rows.reduce((acc, item) => {
    const readiness = item.insurer_package_readiness || {};
    const status = clean(readiness.status, 80) || "qualification";
    acc.total += 1;
    acc[status] = (acc[status] || 0) + 1;
    acc.score_total += Number(readiness.score || 0);
    if (["ready_for_human_review", "draft_review", "market_active", "quote_received"].includes(status)) acc.market_ready += 1;
    if (["blocked_documents", "blocked_partner_contact"].includes(status)) acc.blocked += 1;
    if (readiness.human_review_required) acc.human_review_required += 1;
    acc.missing_required_documents += Number(readiness.missing_required_documents || 0);
    acc.missing_consultation_email += Number(readiness.missing_consultation_email || 0);
    return acc;
  }, { marker: INSURER_PACKAGE_READINESS_MARKER, total: 0, market_ready: 0, blocked: 0, human_review_required: 0, missing_required_documents: 0, missing_consultation_email: 0, score_total: 0 });
  summary.average_score = summary.total ? Math.round(summary.score_total / summary.total) : 0;
  delete summary.score_total;
  const top = rows.slice().sort((a, b) => Number(b.insurer_package_readiness?.score || 0) - Number(a.insurer_package_readiness?.score || 0))[0];
  summary.top_case = clean(top?.case_reference, 120);
  return summary;
}
function caseRowsWithChildren(cases, documents, mails, consultations, timelines, offers, contracts, contractRequests, contractPayments, contractReferrals, contractConsents, partners, env) {
  const docsByCase = groupBy(documents, "case_id");
  const mailsByCase = groupBy(mails, "case_id");
  const consultationRows = rowsOrEmpty(consultations).map((item) => ({
    ...item,
    insurer_portal_url: item.insurer_portal_token ? insurerPortalUrl(item.insurer_portal_token, clean(env.SITE_ORIGIN, 240) || "https://immeubleassur.com") : ""
  }));
  const consultationsByCase = groupBy(consultationRows, "case_id");
  const timelineByCase = groupBy(timelines, "case_id");
  const offersByCase = groupBy(offers, "case_id");
  const contractRows = contractsWithChildren(contracts, contractRequests, contractPayments, contractReferrals, contractConsents);
  const contractsByCase = groupBy(contractRows, "case_id");
  return rowsOrEmpty(cases).map((row) => {
    const docs = docsByCase.get(row.id) || [];
    const caseMails = mailsByCase.get(row.id) || [];
    const caseConsultations = consultationsByCase.get(row.id) || [];
    const caseOffers = offersByCase.get(row.id) || [];
    const lead = {
      name: clean(row.name, 120),
      phone: clean(row.phone, 80),
      email: clean(row.email, 180),
      profile: clean(row.profile, 120),
      property_type: clean(row.property_type, 120),
      city: clean(row.city, 120),
      need: clean(row.need, 120),
      units_count: clean(row.units_count, 40),
      status: clean(row.lead_status, 40)
    };
    const caseContracts = (contractsByCase.get(row.id) || []).map((contract) => ({ ...contract, cross_sell_review: crossSellReviewFor(contract, lead) }));
    const packageReadiness = insurerPackageReadiness(row, docs, caseMails, caseConsultations, partners);
    const plan = caseActionPlan(row, docs, caseMails, caseConsultations, caseOffers, caseContracts);
    return {
      id: row.id,
      case_reference: row.case_reference,
      lead_reference: row.lead_reference,
      stage: row.stage,
      stage_label: stageLabel(row.stage),
      priority: row.priority,
      readiness_score: Number(row.readiness_score || 0),
      missing_required_documents: plan.missing_required_documents,
      action_plan: plan,
      insurer_package_readiness: packageReadiness,
      client_portal_url: portalUrl(row.client_portal_token, clean(env.SITE_ORIGIN, 240) || "https://immeubleassur.com"),
      assigned_to: clean(row.assigned_to, 120),
      next_action: clean(row.next_action, 1000),
      due_at: row.due_at,
      updated_at: row.updated_at,
      created_at: row.created_at,
      value_label: valueLabel(row.estimated_value_min_cents, row.estimated_value_max_cents),
      lead,
      documents: docs,
      mail_queue: caseMails,
      consultations: caseConsultations,
      client_offers: caseOffers,
      timeline: timelineByCase.get(row.id) || [],
      contracts: caseContracts,
      consent_snapshot: safeJson(row.consent_snapshot, {})
    };
  });
}

function buildActions(cases, mails, consultations, partners = []) {
  const actions = [];
  const caseList = rowsOrEmpty(cases);
  const reviewMail = rowsOrEmpty(mails).find((item) => item.status === "draft_review");
  const ready = caseList.find((item) => Number(item.readiness_score || 0) >= 70 && item.stage === "ready_for_market");
  const hot = caseList.find((item) => item.priority === "hot" && !item.assigned_to);
  const missingDocs = caseList.find((item) => Number(item.missing_required_documents || 0) > 0);
  const plan = caseList.find((item) => item.action_plan?.severity === "high");
  const packageBlocked = caseList.find((item) => ["blocked_documents", "blocked_partner_contact"].includes(item.insurer_package_readiness?.status));
  const packageReady = caseList.find((item) => ["ready_for_human_review", "draft_review"].includes(item.insurer_package_readiness?.status));
  const consultation = rowsOrEmpty(consultations).find((item) => item.status === "draft_review");
  const partnerIssue = rowsOrEmpty(partners).find((item) => ["contact_missing", "overdue", "setup_required"].includes(item.performance?.status));
  if (plan) actions.push({ priority: 104, type: "plan-action-dossier", target: plan.case_reference, signal: plan.action_plan?.label || "plan action", recommendation: plan.action_plan?.next_action || "Executer la prochaine action humaine tracee." });
  if (partnerIssue) actions.push({ priority: 94, type: "relation-assureur", target: partnerIssue.name, signal: partnerIssue.performance?.status || "partenaire", recommendation: partnerIssue.performance?.next_action || "Mettre a jour le partenaire assureur." });
  if (packageBlocked) actions.push({ priority: 98, type: "pack-assureur-bloque", target: packageBlocked.case_reference, signal: packageBlocked.insurer_package_readiness?.label || "pack incomplet", recommendation: packageBlocked.insurer_package_readiness?.next_action || "Completer le pack assureur sous controle humain." });
  if (packageReady) actions.push({ priority: 93, type: "pack-assureur-revue", target: packageReady.case_reference, signal: `${packageReady.insurer_package_readiness?.score || 0}/100`, recommendation: packageReady.insurer_package_readiness?.next_action || "Relire le pack assureur avant consultation." });
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

  const [caseRows, documents, mails, consultations, timelines, offers, contracts, contractRequests, contractPayments, contractReferrals, contractConsents, partners, summaryRow, docSummary, mailSummary, consultSummary, contractSummary, offerSummary] = await Promise.all([
    safeAll(env, `SELECT c.*, l.reference AS lead_reference, l.name, l.phone, l.email, l.profile, l.property_type, l.city, l.units_count, l.need, l.status AS lead_status FROM brokerage_cases c JOIN leads l ON l.id = c.lead_id ORDER BY CASE c.priority WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 WHEN 'standard' THEN 3 ELSE 4 END, c.updated_at DESC LIMIT 120`),
    safeAll(env, `SELECT d.* FROM case_documents d JOIN brokerage_cases c ON c.id = d.case_id ORDER BY d.required DESC, d.label LIMIT 800`),
    safeAll(env, `SELECT m.*, c.case_reference FROM case_mail_queue m JOIN brokerage_cases c ON c.id = m.case_id ORDER BY CASE m.status WHEN 'draft_review' THEN 1 WHEN 'approved' THEN 2 WHEN 'sent' THEN 3 ELSE 4 END, m.updated_at DESC LIMIT 240`),
    safeAll(env, `SELECT i.*, c.case_reference, tok.token AS insurer_portal_token FROM insurer_consultations i JOIN brokerage_cases c ON c.id = i.case_id LEFT JOIN insurer_consultation_tokens tok ON tok.consultation_id = i.id AND tok.status = 'active' ORDER BY CASE i.status WHEN 'draft_review' THEN 1 WHEN 'approved' THEN 2 WHEN 'sent' THEN 3 ELSE 4 END, i.updated_at DESC LIMIT 240`),
    safeAll(env, `SELECT t.* FROM case_timeline t JOIN brokerage_cases c ON c.id = t.case_id ORDER BY t.created_at DESC LIMIT 300`),
    safeAll(env, `SELECT o.*, c.case_reference FROM client_offer_recommendations o JOIN brokerage_cases c ON c.id = o.case_id ORDER BY CASE o.status WHEN 'draft_review' THEN 1 WHEN 'presented' THEN 2 WHEN 'accepted' THEN 3 ELSE 4 END, o.updated_at DESC LIMIT 240`),
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
    safeFirst(env, `SELECT COUNT(*) AS contracts, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_contracts, COALESCE(SUM(annual_premium_cents), 0) AS annual_premium_cents FROM client_contracts`),
    safeFirst(env, `SELECT COUNT(*) AS offers, SUM(CASE WHEN status = 'draft_review' THEN 1 ELSE 0 END) AS review_offers, SUM(CASE WHEN status = 'presented' THEN 1 ELSE 0 END) AS presented_offers, SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted_offers FROM client_offer_recommendations`)
  ]);

  const cases = caseRowsWithChildren(caseRows, documents, mails, consultations, timelines, offers, contracts, contractRequests, contractPayments, contractReferrals, contractConsents, partners, env);
  const planSummary = actionPlanSummary(cases);
  const packageSummary = insurerPackageReadinessSummary(cases);
  const partnerRows = partnerRowsWithPerformance(partners, consultations);
  const partnerSummary = partnerPerformanceSummary(partnerRows);
  const crmActionQueue = buildCrmActionQueue(cases, rowsOrEmpty(mails), rowsOrEmpty(consultations), partnerRows);
  const crmActionSummary = crmActionQueueSummary(crmActionQueue);
  const summary = {
    ...(summaryRow || {}),
    documents: docSummary || {},
    mail_queue: mailSummary || {},
    consultations: { ...(consultSummary || {}), ...consultationOperationSummary(consultations) },
    contracts: contractSummary || {},
    client_offers: offerSummary || {},
    contract_marker: CLIENT_CONTRACT_MARKER,
    contract_operations: contractOperationSummary(contracts, contractRequests, contractPayments, contractReferrals),
    action_plan: planSummary,
    insurer_package_readiness: packageSummary,
    partner_performance: partnerSummary,
    crm_action_queue: crmActionSummary,
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
    client_offers: rowsOrEmpty(offers),
    contract_requests: rowsOrEmpty(contractRequests),
    contract_payments: rowsOrEmpty(contractPayments),
    contract_referrals: rowsOrEmpty(contractReferrals),
    partners: partnerRows,
    crm_action_queue: crmActionQueue,
    actions: buildActions(cases, rowsOrEmpty(mails), rowsOrEmpty(consultations), partnerRows),
    warnings: [syncResult?.warning, errorOf(caseRows), errorOf(documents), errorOf(mails), errorOf(consultations), errorOf(offers), errorOf(contracts), errorOf(contractRequests), errorOf(contractPayments), errorOf(contractReferrals), errorOf(contractConsents), errorOf(partners), errorOf(summaryRow), errorOf(docSummary), errorOf(mailSummary), errorOf(consultSummary), errorOf(contractSummary), errorOf(offerSummary)].filter(Boolean),
    safeguards: ["human-review-before-send", "mail-draft-review", "insurer-consultation-human-review", "client-portal-token", "consent-snapshot", "audit-timeline", "client-contract-workspace", "client-offer-human-review", "case-action-plan-v1", "partner-performance-v1", "crm-action-queue-v1", "insurer-package-readiness-v1", "insurer-package-send-guard-v1", "insurer-followup-autopilot-v1", "cross-sell-human-review-v1"]
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

async function ensureConsultationToken(env, consultationId, payload = {}) {
  const existing = await safeFirst(env, "SELECT id, token FROM insurer_consultation_tokens WHERE consultation_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", [consultationId]);
  if (existing?.token && !errorOf(existing)) return existing;
  const tokenRow = { id: crypto.randomUUID(), token: insurerPortalToken() };
  await safeRun(env, `INSERT INTO insurer_consultation_tokens (id, consultation_id, token, status, expires_at, payload, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`, [tokenRow.id, consultationId, tokenRow.token, new Date(Date.now() + 45 * 86400000).toISOString(), JSON.stringify({ marker: "insurer-partner-portal-v1", ...payload }), nowIso(), nowIso()]);
  return tokenRow;
}

function consultationPortalLink(env, token) {
  return insurerPortalUrl(token, clean(env.SITE_ORIGIN, 240) || "https://immeubleassur.com");
}

async function consultationBundle(env, consultationId) {
  const row = await safeFirst(env, `SELECT i.*, c.case_reference, c.client_portal_token, c.readiness_score, c.stage, l.reference AS lead_reference, l.name, l.phone, l.email, l.profile, l.property_type, l.city, l.units_count, l.need, l.message, l.lead_score, l.status AS lead_status
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

async function insurerPackageSendGuard(env, caseId, context = "insurer_send", actor = "admin") {
  const documents = rowsOrEmpty(await safeAll(env, "SELECT * FROM case_documents WHERE case_id = ? ORDER BY required DESC, label", [caseId]));
  const missing = missingRequiredDocuments(documents);
  const guard = {
    marker: INSURER_PACKAGE_SEND_GUARD_MARKER,
    context: clean(context, 120),
    missing_required: missing.map((doc) => clean(doc.label, 160)),
    missing_count: missing.length,
    human_review_required: true
  };
  if (!missing.length) return { ok: true, guard, documents };
  await logTimeline(env, caseId, "insurer_package_send_blocked", actor, guard);
  return { ok: false, guard, documents };
}

function insurerPackageSendGuardResponse(guard) {
  return json({
    success: false,
    marker: INSURER_PACKAGE_SEND_GUARD_MARKER,
    error: "Pack assureur incomplet: pieces requises manquantes avant envoi",
    missing_required: guard.missing_required || [],
    missing_count: guard.missing_count || 0,
    context: guard.context || "insurer_send"
  }, 409);
}

async function requireInsurerPackageSendable(env, caseId, context, actor) {
  const result = await insurerPackageSendGuard(env, caseId, context, actor);
  return result.ok ? null : insurerPackageSendGuardResponse(result.guard);
}

async function requireMailPackageSendable(env, mail, action, actor) {
  if (clean(mail.audience, 80) !== "insurer") return null;
  return requireInsurerPackageSendable(env, mail.case_id, `mail_${clean(action, 80)}`, actor);
}
function insurerDraft(row, documents, followup = false, portalUrlValue = "") {
  if (followup) {
    return {
      subject: `Relance consultation ${clean(row.case_reference, 80)} - ${clean(row.insurer_name, 120)}`,
      body: [
        "Bonjour,",
        "",
        `Nous revenons vers vous au sujet du dossier ${clean(row.case_reference, 80)} transmis pour etude.`,
        `Risque: ${clean(row.property_type, 120) || "immeuble"} - ${clean(row.city, 120) || "ville a confirmer"} - ${clean(row.units_count, 40) || "lots a confirmer"} lot(s).`,
        "Merci de nous confirmer votre appetit, les garanties envisageables, franchises, exclusions et prime indicative.",
        portalUrlValue ? `Retour assureur securise: ${portalUrlValue}` : "",
        "",
        "Cette relance est preparee en brouillon et doit rester validee humainement avant tout envoi.",
        "",
        "Bien cordialement,",
        "ImmeubleAssur"
      ].filter(Boolean).join("\n")
    };
  }
  const draft = buildInsurerEmailDraft(row, row, documents);
  return portalUrlValue ? { ...draft, body: `${draft.body}\n\nRetour assureur securise: ${portalUrlValue}` } : draft;
}

async function approveConsultation(env, body) {
  const consultationId = clean(body.consultation_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  if (!consultationId) return json({ success: false, error: "consultation_id requis" }, 400);
  const bundle = await consultationBundle(env, consultationId);
  if (bundle.error) return json({ success: false, error: bundle.error }, 404);
  const recipient = validEmail(body.recipient_email || bundle.row.recipient_email);
  if (!recipient) return json({ success: false, error: "Email assureur requis avant approbation" }, 409);
  const blocked = await requireInsurerPackageSendable(env, bundle.row.case_id, "approve_consultation", reviewer);
  if (blocked) return blocked;
  await safeRun(env, "UPDATE insurer_consultations SET recipient_email = ?, status = 'approved', package_status = 'approved_for_send', human_approved_at = COALESCE(human_approved_at, ?), notes = COALESCE(NULLIF(?, ''), notes), updated_at = ? WHERE id = ?", [recipient, nowIso(), clean(body.notes, 1000), nowIso(), consultationId]);
  const access = await ensureConsultationToken(env, consultationId, { insurer_name: bundle.row.insurer_name, case_id: bundle.row.case_id });
  await logTimeline(env, bundle.row.case_id, "insurer_consultation_approved", reviewer, { marker: "insurer-consultation-action-v1", consultation_id: consultationId, insurer_name: bundle.row.insurer_name, human_review: true, partner_portal: true });
  return json({ success: true, status: "approved", insurer_portal_url: consultationPortalLink(env, access.token) });
}

async function markConsultationSent(env, body, sentBy = "admin") {
  const consultationId = clean(body.consultation_id, 120);
  const reviewer = clean(body.reviewer || sentBy, 120);
  if (!consultationId) return json({ success: false, error: "consultation_id requis" }, 400);
  const bundle = await consultationBundle(env, consultationId);
  if (bundle.error) return json({ success: false, error: bundle.error }, 404);
  if (clean(bundle.row.status, 40) !== "approved" || !bundle.row.human_approved_at) return json({ success: false, error: "Validation humaine consultation requise avant envoi" }, 409);
  if (!validEmail(bundle.row.recipient_email)) return json({ success: false, error: "Email assureur requis avant envoi" }, 409);
  const blocked = await requireInsurerPackageSendable(env, bundle.row.case_id, "mark_consultation_sent", reviewer);
  if (blocked) return blocked;
  const access = await ensureConsultationToken(env, consultationId, { insurer_name: bundle.row.insurer_name, case_id: bundle.row.case_id });
  await safeRun(env, "UPDATE insurer_consultations SET status = 'sent', package_status = 'sent_to_partner', sent_at = COALESCE(sent_at, ?), response_due_at = COALESCE(response_due_at, ?), updated_at = ? WHERE id = ?", [nowIso(), new Date(Date.now() + 48 * 3600000).toISOString(), nowIso(), consultationId]);
  await safeRun(env, "UPDATE brokerage_cases SET stage = 'insurer_consultation', next_action = ?, updated_at = ? WHERE id = ?", ["Suivre les retours assureurs et relancer sans envoi non relu si l'echeance est depassee.", nowIso(), bundle.row.case_id]);
  await logTimeline(env, bundle.row.case_id, "insurer_consultation_marked_sent", reviewer, { marker: "insurer-consultation-action-v1", consultation_id: consultationId, insurer_name: bundle.row.insurer_name, partner_portal: true });
  return json({ success: true, status: "sent", insurer_portal_url: consultationPortalLink(env, access.token) });
}

async function sendConsultation(env, body) {
  const consultationId = clean(body.consultation_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  if (!consultationId) return json({ success: false, error: "consultation_id requis" }, 400);
  const bundle = await consultationBundle(env, consultationId);
  if (bundle.error) return json({ success: false, error: bundle.error }, 404);
  if (clean(bundle.row.status, 40) !== "approved" || !bundle.row.human_approved_at) return json({ success: false, error: "Validation humaine consultation requise avant envoi" }, 409);
  if (!validEmail(bundle.row.recipient_email)) return json({ success: false, error: "Email assureur requis avant envoi" }, 409);
  const blocked = await requireInsurerPackageSendable(env, bundle.row.case_id, "send_consultation", reviewer);
  if (blocked) return blocked;
  const access = await ensureConsultationToken(env, consultationId, { insurer_name: bundle.row.insurer_name, case_id: bundle.row.case_id });
  const draft = insurerDraft(bundle.row, bundle.documents, false, consultationPortalLink(env, access.token));
  const config = await smtpConfig(env, { recipient_email: bundle.row.recipient_email });
  if (!config.host || !config.username || !config.password || !config.from || !config.to.length) return json({ success: false, error: "Configuration SMTP incomplete" }, 503);
  const smtpResult = await sendPortableSmtpMail(config, mailMessage(config, { recipient_email: bundle.row.recipient_email, subject: draft.subject, body: draft.body }), env);
  const result = await markConsultationSent(env, body, "smtp");
  await logTimeline(env, bundle.row.case_id, "insurer_consultation_sent", reviewer, { marker: "insurer-consultation-action-v1", consultation_id: consultationId, insurer_name: bundle.row.insurer_name, smtp: clean(smtpResult, 500) });
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
  const access = await ensureConsultationToken(env, consultationId, { insurer_name: bundle.row.insurer_name, case_id: bundle.row.case_id });
  const existing = await safeFirst(env, "SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'insurer_followup' AND recipient_email = ? AND status IN ('draft_review', 'approved')", [bundle.row.case_id, bundle.row.recipient_email]);
  if (existing?.id) return json({ success: true, status: "draft_review", mail_id: existing.id, reused: true });
  const draft = insurerDraft(bundle.row, bundle.documents, true, consultationPortalLink(env, access.token));
  const mailId = crypto.randomUUID();
  await safeRun(env, `INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, scheduled_at, payload, created_at, updated_at)
    VALUES (?, ?, 'insurer_followup', ?, ?, ?, 'draft_review', 1, ?, ?, ?, ?)`, [mailId, bundle.row.case_id, bundle.row.recipient_email, draft.subject, draft.body, nowIso(), JSON.stringify({ marker: "insurer-consultation-action-v1", consultation_id: consultationId, purpose: "insurer_followup", human_review_required: true }), nowIso(), nowIso()]);
  await safeRun(env, "UPDATE insurer_consultations SET response_due_at = ?, updated_at = ? WHERE id = ?", [new Date(Date.now() + 24 * 3600000).toISOString(), nowIso(), consultationId]);
  await logTimeline(env, bundle.row.case_id, "insurer_consultation_followup_draft", reviewer, { marker: "insurer-consultation-action-v1", consultation_id: consultationId, mail_id: mailId, human_review: true });
  return json({ success: true, status: "draft_review", mail_id: mailId });
}

function offerMoneyLabel(cents) {
  return `${Math.round(Number(cents || 0) / 100)} EUR`;
}

function defaultClientOfferRecommendation(row, premium, deductible) {
  const insurer = clean(row.insurer_name, 160) || "assureur retenu";
  const city = clean(row.city, 120) || "ville a confirmer";
  const property = clean(row.property_type, 120) || "immeuble";
  return `Recommandation ImmeubleAssur: retenir l'offre ${insurer} pour ${property} a ${city}, sous reserve de validation des garanties, exclusions, franchises et pieces definitives. Prime indicative ${offerMoneyLabel(premium)}/an, franchise principale ${offerMoneyLabel(deductible)}.`;
}

function clientOfferMailDraft(row, offer, env) {
  const portal = portalUrl(row.client_portal_token, clean(env.SITE_ORIGIN, 240) || "https://immeubleassur.com");
  return {
    subject: `Votre proposition assurance immeuble ${clean(row.case_reference, 80)}`,
    body: [
      `Bonjour ${clean(row.name, 120) || ""}`.trim(),
      "",
      `Nous avons prepare une proposition apres retour assureur pour votre dossier ${clean(row.case_reference, 80)}.`,
      `Assureur: ${clean(offer.insurer_name, 160)}.`,
      `Prime indicative: ${offerMoneyLabel(offer.premium_amount_cents)}/an. Franchise principale: ${offerMoneyLabel(offer.deductible_cents)}.`,
      clean(offer.recommendation, 1800),
      clean(offer.coverage_summary, 1800),
      clean(offer.exclusions_summary, 1200),
      "",
      `Votre espace client securise: ${portal}`,
      "",
      "Cette proposition est publiee apres validation humaine. L'acceptation finale doit etre explicite depuis votre espace client avant creation du contrat.",
      "",
      "Bien cordialement,",
      "ImmeubleAssur"
    ].filter(Boolean).join("\n")
  };
}

async function prepareClientOffer(env, body) {
  const consultationId = clean(body.consultation_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  if (!consultationId) return json({ success: false, error: "consultation_id requis" }, 400);
  const bundle = await consultationBundle(env, consultationId);
  if (bundle.error) return json({ success: false, error: bundle.error }, 404);
  if (clean(bundle.row.status, 40) !== "quoted") return json({ success: false, error: "Offre assureur quotee requise avant proposition client" }, 409);
  if (!validEmail(bundle.row.email)) return json({ success: false, error: "Email client requis pour brouillon offre" }, 409);
  let premium = centsFromBody(body.premium_amount_cents ?? body.premium_amount);
  if (premium === null) premium = Number(bundle.row.premium_amount_cents || 0);
  let deductible = centsFromBody(body.deductible_cents ?? body.deductible);
  if (deductible === null) deductible = Number(bundle.row.deductible_cents || 0);
  if (!premium || premium < 1) return json({ success: false, error: "Prime assureur requise avant proposition client" }, 409);
  const existing = await safeFirst(env, "SELECT * FROM client_offer_recommendations WHERE consultation_id = ? ORDER BY created_at DESC LIMIT 1", [consultationId]);
  if (existing?.id && clean(existing.status, 40) === "accepted") return json({ success: false, error: "Offre client deja acceptee" }, 409);
  const offerId = existing?.id || crypto.randomUUID();
  const validity = clean(body.validity_until, 80) || new Date(Date.now() + 30 * 86400000).toISOString();
  const offer = {
    id: offerId,
    insurer_name: clean(bundle.row.insurer_name, 160),
    premium_amount_cents: premium,
    deductible_cents: deductible,
    recommendation: clean(body.recommendation, 1800) || defaultClientOfferRecommendation(bundle.row, premium, deductible),
    coverage_summary: clean(body.coverage_summary, 1800) || "Garanties principales a verifier: multirisque immeuble, responsabilite, degat des eaux, incendie, recours des voisins, protection juridique selon conditions assureur.",
    exclusions_summary: clean(body.exclusions_summary, 1200) || "Points a relire avant acceptation: exclusions, franchises, antecedents sinistres, mesures de prevention, clauses travaux ou vacance."
  };
  if (existing?.id) {
    await safeRun(env, "UPDATE client_offer_recommendations SET insurer_name = ?, status = 'draft_review', premium_amount_cents = ?, deductible_cents = ?, recommendation = ?, coverage_summary = ?, exclusions_summary = ?, validity_until = ?, payload = ?, updated_at = ? WHERE id = ?", [offer.insurer_name, offer.premium_amount_cents, offer.deductible_cents, offer.recommendation, offer.coverage_summary, offer.exclusions_summary, validity, JSON.stringify({ marker: CLIENT_OFFER_MARKER, consultation_id: consultationId, human_review_required: true }), nowIso(), offerId]);
  } else {
    await safeRun(env, `INSERT INTO client_offer_recommendations (id, case_id, consultation_id, insurer_name, status, premium_amount_cents, deductible_cents, recommendation, coverage_summary, exclusions_summary, validity_until, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft_review', ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [offerId, bundle.row.case_id, consultationId, offer.insurer_name, offer.premium_amount_cents, offer.deductible_cents, offer.recommendation, offer.coverage_summary, offer.exclusions_summary, validity, JSON.stringify({ marker: CLIENT_OFFER_MARKER, consultation_id: consultationId, human_review_required: true }), nowIso(), nowIso()]);
  }
  const mailExists = await safeFirst(env, "SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'client_offer' AND payload LIKE ? AND status IN ('draft_review', 'approved', 'sent')", [bundle.row.case_id, `%${offerId}%`]);
  let mailId = mailExists?.id || "";
  if (!mailId) {
    mailId = crypto.randomUUID();
    const draft = clientOfferMailDraft(bundle.row, offer, env);
    await safeRun(env, `INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, scheduled_at, payload, created_at, updated_at)
      VALUES (?, ?, 'client_offer', ?, ?, ?, 'draft_review', 1, ?, ?, ?, ?)`, [mailId, bundle.row.case_id, clean(bundle.row.email, 180), draft.subject, draft.body, nowIso(), JSON.stringify({ marker: CLIENT_OFFER_MARKER, offer_id: offerId, purpose: "client_offer_recommendation", human_review_required: true }), nowIso(), nowIso()]);
  }
  await safeRun(env, "UPDATE brokerage_cases SET stage = 'offer_followup', next_action = ?, updated_at = ? WHERE id = ?", ["Relire la proposition client, approuver l'offre puis suivre l'acceptation explicite dans l'espace client.", nowIso(), bundle.row.case_id]);
  await logTimeline(env, bundle.row.case_id, "client_offer_draft_prepared", reviewer, { marker: CLIENT_OFFER_MARKER, offer_id: offerId, consultation_id: consultationId, mail_id: mailId, human_review_required: true });
  return json({ success: true, status: "draft_review", offer_id: offerId, mail_id: mailId });
}

async function approveClientOffer(env, body) {
  const offerId = clean(body.offer_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  if (!offerId) return json({ success: false, error: "offer_id requis" }, 400);
  const row = await safeFirst(env, `SELECT o.*, c.case_reference FROM client_offer_recommendations o JOIN brokerage_cases c ON c.id = o.case_id WHERE o.id = ?`, [offerId]);
  if (!row || errorOf(row)) return json({ success: false, error: "Offre client introuvable" }, 404);
  const status = clean(row.status, 40);
  if (status === "accepted") return json({ success: true, status: "accepted", already_done: true });
  if (status !== "draft_review" && status !== "presented") return json({ success: false, error: "Offre non publiable" }, 409);
  await safeRun(env, "UPDATE client_offer_recommendations SET status = 'presented', human_approved_at = COALESCE(human_approved_at, ?), approved_by = COALESCE(NULLIF(?, ''), approved_by), presented_at = COALESCE(presented_at, ?), updated_at = ? WHERE id = ?", [nowIso(), reviewer, nowIso(), nowIso(), offerId]);
  await safeRun(env, "UPDATE brokerage_cases SET next_action = ?, updated_at = ? WHERE id = ?", ["Attendre acceptation explicite client ou relancer humainement la proposition publiee.", nowIso(), row.case_id]);
  await logTimeline(env, row.case_id, "client_offer_approved", reviewer, { marker: CLIENT_OFFER_MARKER, offer_id: offerId, human_review: true });
  return json({ success: true, status: "presented", offer_id: offerId });
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
  if (action === "prepare_client_offer") return prepareClientOffer(env, body);
  if (action === "approve_client_offer") return approveClientOffer(env, body);
  if (action === "consultation_response") return updateConsultationResponse(env, body);

  if (!["approve_mail", "send_mail", "mark_sent"].includes(action)) return json({ success: false, error: "Action non supportee" }, 400);
  const mailId = clean(body.mail_id, 120);
  const reviewer = clean(body.reviewer || "admin", 120);
  const mail = await safeFirst(env, "SELECT m.*, c.case_reference FROM case_mail_queue m JOIN brokerage_cases c ON c.id = m.case_id WHERE m.id = ?", [mailId]);
  if (!mail || errorOf(mail)) return json({ success: false, error: "Mail introuvable" }, 404);

  if (action === "approve_mail") {
    const blocked = await requireMailPackageSendable(env, mail, action, reviewer);
    if (blocked) return blocked;
    await safeRun(env, "UPDATE case_mail_queue SET status = 'approved', approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?", [nowIso(), reviewer, nowIso(), mailId]);
    await logTimeline(env, mail.case_id, "mail_approved", reviewer, { mail_id: mailId, audience: mail.audience, subject: mail.subject });
    return json({ success: true, status: "approved" });
  }

  if (action === "mark_sent") {
    const blocked = await requireMailPackageSendable(env, mail, action, reviewer);
    if (blocked) return blocked;
    await safeRun(env, "UPDATE case_mail_queue SET status = 'sent', sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ?", [nowIso(), nowIso(), mailId]);
    await logTimeline(env, mail.case_id, "mail_marked_sent", reviewer, { mail_id: mailId, audience: mail.audience, subject: mail.subject });
    return json({ success: true, status: "sent" });
  }

  if (mail.status !== "approved") return json({ success: false, error: "Validation humaine requise avant envoi" }, 409);
  const blocked = await requireMailPackageSendable(env, mail, action, reviewer);
  if (blocked) return blocked;
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