import { clean, safeJson, stageLabel } from "../../_shared/brokerage-cases.js";
import {
  CLIENT_CONTRACT_MARKER,
  applyConsent,
  consentProfileFor,
  consentTypeLabel,
  crossSellRecommendationsFor,
  normalizeConsentType,
  requestDueAtFor,
  requestPriorityFor,
  requestTypeLabel
} from "../../_shared/client-contracts.js";

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

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rowsOrEmpty(rows)) {
    const value = row[key];
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
}

function moneyLabel(cents) {
  return `${Math.round(Number(cents || 0) / 100)} EUR`;
}

const consentReceiptTypes = ["marketing_automation", "cross_sell", "navigation_study"];
const CONSENT_RECEIPT_MARKER = "consent-receipt-v1";
const DOCUMENT_UPLOAD_MARKER = "client-document-upload-v1";
const MAX_DOCUMENT_BYTES = 6 * 1024 * 1024;
const uploadTypes = new Map([
  ["application/pdf", { extension: "pdf", signature: (bytes) => textPrefix(bytes, 4) === "%PDF" }],
  ["image/jpeg", { extension: "jpg", signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ["image/png", { extension: "png", signature: (bytes) => textPrefix(bytes, 8) === "\x89PNG\r\n\x1a\n" }],
  ["image/webp", { extension: "webp", signature: (bytes) => textPrefix(bytes, 4) === "RIFF" && textPrefix(bytes.slice(8), 4) === "WEBP" }]
]);

function textPrefix(bytes, length) {
  return String.fromCharCode(...Array.from(bytes.slice(0, length)));
}

function attachmentMeta(payload = {}) {
  const attachment = safeJson(payload, {}).attachment;
  if (!attachment || typeof attachment !== "object") return null;
  return {
    marker: DOCUMENT_UPLOAD_MARKER,
    file_name: clean(attachment.file_name, 160),
    mime_type: clean(attachment.mime_type, 100),
    size_bytes: Number(attachment.size_bytes || 0),
    scan_status: clean(attachment.scan_status, 60),
    uploaded_at: attachment.uploaded_at || "",
    validated_at: attachment.validated_at || ""
  };
}

function publicAttachment(payload = {}) {
  const attachment = attachmentMeta(payload);
  if (!attachment?.file_name) return null;
  return attachment;
}

function decodeUpload(body = {}) {
  const fileName = clean(body.file_name, 160).replace(/[\\/\0]/g, "-");
  const mimeType = clean(body.mime_type, 100).toLowerCase();
  const raw = clean(body.content_base64, MAX_DOCUMENT_BYTES * 2);
  const encoded = raw.includes(",") && raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (!fileName || !encoded || !uploadTypes.has(mimeType)) return { error: "Format de piece non supporte" };
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(encoded)) return { error: "Fichier invalide" };
  try {
    const bytes = Uint8Array.from(atob(encoded.replace(/\s/g, "")), (char) => char.charCodeAt(0));
    const type = uploadTypes.get(mimeType);
    if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES || !type.signature(bytes)) return { error: "Signature ou taille de fichier invalide" };
    return { fileName, mimeType, bytes, encoded: encoded.replace(/\s/g, ""), extension: type.extension };
  } catch {
    return { error: "Fichier illisible" };
  }
}

async function scanUploadedDocument(env, upload) {
  if (typeof env.SCAN_DOCUMENT !== "function") return { status: "unavailable", provider: "clamav", reason: "scanner_not_injected" };
  try {
    return await env.SCAN_DOCUMENT({ bytes: upload.bytes, fileName: upload.fileName });
  } catch {
    return { status: "unavailable", provider: "clamav", reason: "scanner_error" };
  }
}

function uploadedPayload(documentRow, upload, scan = {}) {
  const current = safeJson(documentRow?.payload, {});
  return {
    ...current,
    marker: DOCUMENT_UPLOAD_MARKER,
    attachment: {
      marker: DOCUMENT_UPLOAD_MARKER,
      file_name: upload.fileName,
      mime_type: upload.mimeType,
      size_bytes: upload.bytes.length,
      content_base64: upload.encoded,
      scan_status: scan.status === "clean" ? "clean_pending_human_validation" : "pending_antivirus",
      scan_provider: scan.provider || "clamav",
      uploaded_at: new Date().toISOString(),
      validated_at: ""
    }
  };
}

function consentScopeFor(type) {
  return ({
    marketing_automation: "Relances contractuelles, echeances, documents et conseils lies au contrat ImmeubleAssur.",
    cross_sell: "Suggestions commerciales limitees aux produits d'assurance utiles au profil immeuble connu.",
    navigation_study: "Analyse first-party des pages ImmeubleAssur consultees dans l'espace client, sans donnees externes ni carnet d'adresses."
  })[type] || "Preference client explicite.";
}

function latestConsentEventsByType(consents = []) {
  const map = new Map();
  for (const event of rowsOrEmpty(consents).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))) {
    const type = normalizeConsentType(event.consent_type);
    if (type && !map.has(type)) map.set(type, event);
  }
  return map;
}

function consentReceiptsFor(consent = {}, consents = []) {
  const latest = latestConsentEventsByType(consents);
  return consentReceiptTypes.map((type) => {
    const event = latest.get(type);
    const payload = safeJson(event?.payload, {});
    const granted = consent[type] === true;
    return {
      marker: CONSENT_RECEIPT_MARKER,
      consent_type: type,
      label: consentTypeLabel(type),
      granted,
      status: granted ? "granted" : "revoked",
      legal_basis: "consentement explicite du client",
      scope: consentScopeFor(type),
      revocation_available: true,
      latest_event: event ? {
        status: clean(event.status, 40),
        created_at: event.created_at || "",
        proof_text: clean(event.proof_text, 1000),
        explicit_acceptance: payload.explicit_acceptance === true
      } : null
    };
  });
}

function publicContract(row, lead, documents = [], payments = [], requests = [], referrals = [], consents = [], assets = []) {
  const consent = consentProfileFor(safeJson(row.consent_profile, {}));
  return {
    id: row.id,
    contract_reference: row.contract_reference,
    status: row.status,
    insurer_name: clean(row.insurer_name, 160),
    policy_number: clean(row.policy_number, 120),
    annual_premium_label: `${moneyLabel(row.annual_premium_cents)}/an`,
    premium_frequency: clean(row.premium_frequency, 40) || "annual",
    next_payment_due_at: row.next_payment_due_at || "",
    renewal_at: row.renewal_at || "",
    referral_code: row.referral_code,
    consent,
    cross_sell: crossSellRecommendationsFor(lead, consent),
    documents: rowsOrEmpty(documents).map((doc) => ({
      id: doc.id,
      document_type: doc.document_type,
      label: doc.label,
      status: doc.status,
      required: Number(doc.required || 0) === 1,
      file_url: clean(doc.file_url, 500),
      due_at: doc.due_at || "",
      received_at: doc.received_at || "",
      validated_at: doc.validated_at || "",
      attachment: publicAttachment(doc.payload)
    })),
    payments: rowsOrEmpty(payments).map((payment) => ({
      id: payment.id,
      installment_reference: payment.installment_reference,
      amount_label: moneyLabel(payment.amount_cents),
      due_at: payment.due_at,
      status: payment.status,
      payment_url: clean(payment.payment_url, 500),
      paid_at: payment.paid_at || ""
    })),
    requests: rowsOrEmpty(requests).slice(0, 12).map((request) => ({
      id: request.id,
      request_type: request.request_type,
      label: requestTypeLabel(request.request_type),
      status: request.status,
      priority: request.priority,
      subject: request.subject,
      due_at: request.due_at || "",
      created_at: request.created_at
    })),
    referrals: rowsOrEmpty(referrals).slice(0, 8).map((item) => ({
      id: item.id,
      status: item.status,
      reward_label: item.reward_label,
      created_at: item.created_at
    })),
    consent_receipts: consentReceiptsFor(consent, consents),
    consent_events: rowsOrEmpty(consents).slice(0, 12).map((item) => ({
      consent_type: item.consent_type,
      label: consentTypeLabel(item.consent_type),
      status: item.status,
      created_at: item.created_at
    })),
    assets: rowsOrEmpty(assets).map((asset) => ({
      id: asset.id,
      asset_type: asset.asset_type,
      label: asset.label,
      address: asset.address || "",
      units_count: asset.units_count || "",
      occupancy: asset.occupancy || ""
    }))
  };
}

function publicOffer(row) {
  return {
    id: row.id,
    insurer_name: clean(row.insurer_name, 160),
    status: clean(row.status, 40),
    premium_label: `${moneyLabel(row.premium_amount_cents)}/an`,
    deductible_label: moneyLabel(row.deductible_cents),
    recommendation: clean(row.recommendation, 1800),
    coverage_summary: clean(row.coverage_summary, 1800),
    exclusions_summary: clean(row.exclusions_summary, 1200),
    validity_until: row.validity_until || "",
    presented_at: row.presented_at || row.human_approved_at || "",
    accepted_at: row.accepted_at || "",
    marker: "client-offer-recommendation-v1"
  };
}

function publicCase(row, documents, consultations, mails, contracts, offers = []) {
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
      validated_at: doc.validated_at || "",
      attachment: publicAttachment(doc.payload)
    })),
    consultations: visibleConsultations,
    client_offers: rowsOrEmpty(offers).map(publicOffer),
    contracts,
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
  return safeFirst(env, `SELECT c.*, l.name, l.city, l.need, l.property_type, l.units_count, l.profile, l.message FROM brokerage_cases c JOIN leads l ON l.id = c.lead_id WHERE c.client_portal_token = ?`, [token]);
}

async function ownedContract(env, caseId, contractId) {
  const id = clean(contractId, 120);
  if (!id) return null;
  return safeFirst(env, "SELECT * FROM client_contracts WHERE id = ? AND case_id = ?", [id, caseId]);
}

async function ownedOffer(env, row, offerId) {
  const id = clean(offerId, 120);
  if (!id) return null;
  return safeFirst(env, "SELECT * FROM client_offer_recommendations WHERE id = ? AND case_id = ? AND status IN ('presented', 'accepted', 'declined')", [id, row.id]);
}
async function contractsForCase(env, row) {
  const contractRows = rowsOrEmpty(await safeAll(env, "SELECT * FROM client_contracts WHERE case_id = ? ORDER BY created_at DESC", [row.id]));
  if (!contractRows.length) return [];
  const ids = contractRows.map((item) => item.id);
  const placeholders = ids.map(() => "?").join(",");
  const [documents, payments, requests, referrals, consents, assets] = await Promise.all([
    safeAll(env, `SELECT * FROM contract_documents WHERE contract_id IN (${placeholders}) ORDER BY required DESC, label`, ids),
    safeAll(env, `SELECT * FROM contract_payment_schedule WHERE contract_id IN (${placeholders}) ORDER BY due_at`, ids),
    safeAll(env, `SELECT * FROM contract_service_requests WHERE contract_id IN (${placeholders}) ORDER BY CASE status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END, created_at DESC`, ids),
    safeAll(env, `SELECT * FROM contract_referrals WHERE contract_id IN (${placeholders}) ORDER BY created_at DESC`, ids),
    safeAll(env, `SELECT * FROM contract_consent_events WHERE contract_id IN (${placeholders}) ORDER BY created_at DESC`, ids),
    safeAll(env, `SELECT * FROM client_assets WHERE contract_id IN (${placeholders}) ORDER BY created_at DESC`, ids)
  ]);
  const docsByContract = groupBy(documents, "contract_id");
  const paymentsByContract = groupBy(payments, "contract_id");
  const requestsByContract = groupBy(requests, "contract_id");
  const referralsByContract = groupBy(referrals, "contract_id");
  const consentsByContract = groupBy(consents, "contract_id");
  const assetsByContract = groupBy(assets, "contract_id");
  return contractRows.map((contract) => publicContract(contract, row, docsByContract.get(contract.id), paymentsByContract.get(contract.id), requestsByContract.get(contract.id), referralsByContract.get(contract.id), consentsByContract.get(contract.id), assetsByContract.get(contract.id)));
}

export function onRequestOptions() {
  return new Response("", { status: 204, headers });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ success: false, error: "Base indisponible" }, 503);
  const token = tokenOf(request);
  const row = await caseByToken(env, token);
  if (!row || row.error) return json({ success: false, error: "Dossier introuvable" }, 404);
  if (new URL(request.url).searchParams.get("action") === "download_document") return downloadCaseDocument(env, row, request);
  const [documents, consultations, mails, offers, contracts] = await Promise.all([
    safeAll(env, "SELECT * FROM case_documents WHERE case_id = ? ORDER BY required DESC, label", [row.id]),
    safeAll(env, "SELECT * FROM insurer_consultations WHERE case_id = ? ORDER BY updated_at DESC", [row.id]),
    safeAll(env, "SELECT audience, subject, status, approved_at, sent_at FROM case_mail_queue WHERE case_id = ? ORDER BY updated_at DESC LIMIT 20", [row.id]),
    safeAll(env, "SELECT * FROM client_offer_recommendations WHERE case_id = ? AND status IN ('presented', 'accepted', 'declined') ORDER BY CASE status WHEN 'accepted' THEN 1 WHEN 'presented' THEN 2 ELSE 3 END, updated_at DESC", [row.id]),
    contractsForCase(env, row)
  ]);
  return json({ success: true, generated_at: new Date().toISOString(), case: publicCase(row, documents, consultations, mails, contracts, offers), contract_marker: CLIENT_CONTRACT_MARKER });
}

async function uploadCaseDocument(env, row, body) {
  const documentType = clean(body.document_type, 120);
  const documentRow = await safeFirst(env, "SELECT * FROM case_documents WHERE case_id = ? AND document_type = ?", [row.id, documentType]);
  if (!documentRow || documentRow.error) return json({ success: false, error: "Piece inconnue" }, 404);
  const upload = decodeUpload(body);
  if (upload.error) return json({ success: false, error: upload.error }, 422);
  const scan = await scanUploadedDocument(env, upload);
  if (scan.status === "infected") return json({ success: false, error: "Fichier bloque par l antivirus", marker: DOCUMENT_UPLOAD_MARKER, scan_status: "infected" }, 422);
  const now = new Date().toISOString();
  await safeRun(env, "UPDATE case_documents SET status = 'received', received_at = COALESCE(received_at, ?), notes = COALESCE(NULLIF(?, ''), notes), payload = ?, updated_at = ? WHERE id = ?", [now, clean(body.notes, 1000), JSON.stringify(uploadedPayload(documentRow, upload, scan)), now, documentRow.id]);
  await safeRun(env, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, 'client_document_uploaded', 'client', ?, ?)", [crypto.randomUUID(), row.id, JSON.stringify({ marker: DOCUMENT_UPLOAD_MARKER, document_id: documentRow.id, document_type: documentType, file_name: upload.fileName, mime_type: upload.mimeType, size_bytes: upload.bytes.length, scan_status: scan.status === "clean" ? "clean_pending_human_validation" : "pending_antivirus", scan_provider: scan.provider || "clamav" }), now]);
  return json({ success: true, status: scan.status === "clean" ? "received_pending_human_validation" : "received_pending_antivirus", document_id: documentRow.id, marker: DOCUMENT_UPLOAD_MARKER, scan_status: scan.status === "clean" ? "clean_pending_human_validation" : "pending_antivirus", scan_provider: scan.provider || "clamav" });
}

async function downloadCaseDocument(env, row, request) {
  const documentId = clean(new URL(request.url).searchParams.get("document_id"), 120);
  const documentRow = await safeFirst(env, "SELECT * FROM case_documents WHERE case_id = ? AND id = ?", [row.id, documentId]);
  const attachment = documentRow && !documentRow.error ? safeJson(documentRow.payload, {}).attachment : null;
  if (!attachment?.content_base64 || !attachment?.mime_type) return json({ success: false, error: "Fichier introuvable" }, 404);
  try {
    const bytes = Uint8Array.from(atob(attachment.content_base64), (char) => char.charCodeAt(0));
    const safeName = clean(attachment.file_name, 160).replace(/"/g, "-");
    return new Response(bytes, { status: 200, headers: { "Content-Type": attachment.mime_type, "Content-Length": String(bytes.length), "Content-Disposition": "attachment; filename=\"" + safeName + "\"", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return json({ success: false, error: "Fichier illisible" }, 500);
  }
}
async function markCaseDocumentReceived(env, row, body) {
  const documentType = clean(body.document_type, 120);
  const notes = clean(body.notes, 1000);
  const documentRow = await safeFirst(env, "SELECT * FROM case_documents WHERE case_id = ? AND document_type = ?", [row.id, documentType]);
  if (!documentRow || documentRow.error) return json({ success: false, error: "Piece inconnue" }, 404);
  await safeRun(env, "UPDATE case_documents SET status = 'received', received_at = COALESCE(received_at, ?), notes = COALESCE(NULLIF(?, ''), notes), updated_at = ? WHERE id = ?", [new Date().toISOString(), notes, new Date().toISOString(), documentRow.id]);
  await safeRun(env, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, 'client_document_received', 'client', ?, ?)", [crypto.randomUUID(), row.id, JSON.stringify({ document_type: documentType, notes: notes ? "client-note" : "" }), new Date().toISOString()]);
  return json({ success: true, status: "received" });
}

async function decideClientOffer(env, row, body) {
  const offer = await ownedOffer(env, row, body.offer_id);
  if (!offer || offer.error) return json({ success: false, error: "Offre introuvable" }, 404);
  const decision = clean(body.decision || body.status, 40);
  if (!["accepted", "declined"].includes(decision)) return json({ success: false, error: "Decision offre invalide" }, 400);
  if (clean(offer.status, 40) === "accepted") return decision === "accepted" ? json({ success: true, status: "accepted", already_done: true }) : json({ success: false, error: "Offre deja acceptee" }, 409);
  if (clean(offer.status, 40) === "declined") return json({ success: false, error: "Offre deja declinee" }, 409);
  if (decision === "accepted" && body.explicit_acceptance !== true) return json({ success: false, error: "Acceptation explicite requise" }, 422);
  const now = new Date().toISOString();
  const proof = clean(body.proof_text, 1000) || (decision === "accepted" ? "Acceptation explicite de l'offre depuis l'espace client ImmeubleAssur" : "Offre declinee depuis l'espace client ImmeubleAssur");
  const payload = { ...safeJson(offer.payload, {}), marker: "client-offer-recommendation-v1", decision, explicit_acceptance: decision === "accepted", proof_text: proof };
  await safeRun(env, "UPDATE client_offer_recommendations SET status = ?, decision_at = ?, accepted_at = CASE WHEN ? = 'accepted' THEN COALESCE(accepted_at, ?) ELSE accepted_at END, payload = ?, updated_at = ? WHERE id = ?", [decision, now, decision, now, JSON.stringify(payload), now, offer.id]);
  if (decision === "accepted") {
    await safeRun(env, "UPDATE client_offer_recommendations SET status = 'declined', decision_at = COALESCE(decision_at, ?), updated_at = ? WHERE case_id = ? AND id <> ? AND status = 'presented'", [now, now, row.id, offer.id]);
    await safeRun(env, "UPDATE brokerage_cases SET stage = 'contract_active', next_action = ?, human_review_required = 1, updated_at = ? WHERE id = ?", ["Transformer l'offre acceptee en contrat, verifier les pieces definitives et lancer l'espace contrat.", now, row.id]);
    await safeRun(env, "UPDATE leads SET status = 'won', updated_at = ? WHERE id = ?", [now, row.lead_id]);
  } else {
    await safeRun(env, "UPDATE brokerage_cases SET next_action = ?, updated_at = ? WHERE id = ?", ["Reprendre contact apres refus de l'offre client et rechercher une alternative si besoin.", now, row.id]);
  }
  await safeRun(env, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, ?, 'client', ?, ?)", [crypto.randomUUID(), row.id, decision === "accepted" ? "client_offer_accepted" : "client_offer_declined", JSON.stringify({ marker: "client-offer-recommendation-v1", offer_id: offer.id, insurer_name: offer.insurer_name, explicit_acceptance: decision === "accepted" }), now]);
  return json({ success: true, status: decision });
}
async function addContractRequest(env, row, contract, body, typeOverride = "") {
  const type = clean(typeOverride || body.request_type || "document", 80);
  const priority = requestPriorityFor(type);
  const subject = clean(body.subject, 180) || requestTypeLabel(type);
  const message = clean(body.message, 2000);
  await safeRun(env, `INSERT INTO contract_service_requests (id, contract_id, request_type, status, priority, subject, message, due_at, human_review_required, payload, created_at, updated_at)
    VALUES (?, ?, ?, 'open', ?, ?, ?, ?, 1, ?, ?, ?)`, [crypto.randomUUID(), contract.id, type, priority, subject, message, requestDueAtFor(type), JSON.stringify({ marker: CLIENT_CONTRACT_MARKER, source: "client_portal" }), new Date().toISOString(), new Date().toISOString()]);
  await safeRun(env, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, 'contract_request_created', 'client', ?, ?)", [crypto.randomUUID(), row.id, JSON.stringify({ contract_id: contract.id, request_type: type, priority }), new Date().toISOString()]);
  return json({ success: true, status: "open" });
}

async function updateContractConsent(env, row, contract, body) {
  const consentType = normalizeConsentType(body.consent_type);
  if (!consentType) return json({ success: false, error: "Consentement non supporte" }, 400);
  const granted = body.granted === true || clean(body.status, 40) === "granted";
  if (granted && body.explicit_acceptance !== true) return json({ success: false, error: "Acceptation explicite requise" }, 422);
  const current = consentProfileFor(safeJson(contract.consent_profile, {}));
  const next = applyConsent(current, consentType, granted);
  const status = granted ? "granted" : "revoked";
  await safeRun(env, "UPDATE client_contracts SET consent_profile = ?, updated_at = ? WHERE id = ?", [JSON.stringify(next), new Date().toISOString(), contract.id]);
  await safeRun(env, "INSERT INTO contract_consent_events (id, contract_id, consent_type, status, channel, proof_text, payload, created_at) VALUES (?, ?, ?, ?, 'client_portal', ?, ?, ?)", [crypto.randomUUID(), contract.id, consentType, status, clean(body.proof_text, 1000) || consentTypeLabel(consentType), JSON.stringify({ marker: CLIENT_CONTRACT_MARKER, explicit_acceptance: granted === true, receipt_marker: CONSENT_RECEIPT_MARKER, revocation_available: true }), new Date().toISOString()]);
  await safeRun(env, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, 'contract_consent_updated', 'client', ?, ?)", [crypto.randomUUID(), row.id, JSON.stringify({ contract_id: contract.id, consent_type: consentType, status }), new Date().toISOString()]);
  return json({ success: true, status, consent: next });
}

async function addReferral(env, row, contract, body) {
  const name = clean(body.filleul_name, 160);
  const email = clean(body.filleul_email, 180);
  const phone = clean(body.filleul_phone, 80);
  if (body.explicit_permission !== true) return json({ success: false, error: "Accord explicite du filleul requis" }, 422);
  if (!email && !phone) return json({ success: false, error: "Email ou telephone du filleul requis" }, 422);
  await safeRun(env, `INSERT INTO contract_referrals (id, contract_id, referral_code, filleul_name, filleul_email, filleul_phone, status, reward_type, reward_label, explicit_permission, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'draft_review', 'low_cost_partner_reward', 'Avantage parrainage a confirmer apres validation', 1, ?, ?, ?)`, [crypto.randomUUID(), contract.id, contract.referral_code, name, email, phone, JSON.stringify({ marker: CLIENT_CONTRACT_MARKER, no_unsupervised_contact: true }), new Date().toISOString(), new Date().toISOString()]);
  await safeRun(env, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, 'contract_referral_submitted', 'client', ?, ?)", [crypto.randomUUID(), row.id, JSON.stringify({ contract_id: contract.id, referral_code: contract.referral_code }), new Date().toISOString()]);
  return json({ success: true, status: "draft_review" });
}

async function addAsset(env, row, contract, body) {
  const label = clean(body.label, 180) || "Bien a confirmer";
  await safeRun(env, `INSERT INTO client_assets (id, contract_id, asset_type, label, address, units_count, occupancy, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(contract_id, label) DO UPDATE SET asset_type = excluded.asset_type, address = excluded.address, units_count = excluded.units_count, occupancy = excluded.occupancy, updated_at = excluded.updated_at`, [crypto.randomUUID(), contract.id, clean(body.asset_type, 80) || "immeuble", label, clean(body.address, 240), clean(body.units_count, 40), clean(body.occupancy, 120), JSON.stringify({ marker: CLIENT_CONTRACT_MARKER, source: "client_portal" }), new Date().toISOString(), new Date().toISOString()]);
  await addContractRequest(env, row, contract, { request_type: "asset_update", subject: "Mise a jour parc client", message: label }, "asset_update");
  return json({ success: true, status: "asset_saved" });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ success: false, error: "Base indisponible" }, 503);
  const token = tokenOf(request);
  const row = await caseByToken(env, token);
  if (!row || row.error) return json({ success: false, error: "Dossier introuvable" }, 404);
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 80) || "case_document_received";
  if (action === "case_document_upload") return uploadCaseDocument(env, row, body);
  if (action === "case_document_received") return markCaseDocumentReceived(env, row, body);
  if (action === "offer_decision") return decideClientOffer(env, row, body);

  const contract = await ownedContract(env, row.id, body.contract_id);
  if (!contract || contract.error) return json({ success: false, error: "Contrat introuvable" }, 404);
  if (action === "contract_request") return addContractRequest(env, row, contract, body);
  if (action === "payment_link_request") return addContractRequest(env, row, contract, { ...body, subject: "Demande de lien de paiement", request_type: "payment_issue" }, "payment_issue");
  if (action === "contract_consent") return updateContractConsent(env, row, contract, body);
  if (action === "contract_referral") return addReferral(env, row, contract, body);
  if (action === "asset_update") return addAsset(env, row, contract, body);
  return json({ success: false, error: "Action non supportee" }, 400);
}