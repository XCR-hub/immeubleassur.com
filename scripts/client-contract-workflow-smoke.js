import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { onRequestGet as adminGet, onRequestPatch as adminPatch, onRequestPost as adminPost } from "../functions/api/admin/cases.js";
import { onRequestGet as clientGet, onRequestPost as clientPost } from "../functions/api/client/case.js";
import { runContractRenewalMonitor } from "./local-contract-renewal-monitor.js";

const stamp = `${process.pid}-${Date.now()}`;
const dbPath = join(tmpdir(), `immeubleassur-client-contract-smoke-${stamp}.sqlite`);
const reportPath = join(tmpdir(), `immeubleassur-client-contract-report-${stamp}.json`);
const assetPath = join(tmpdir(), `immeubleassur-client-contract-asset-${stamp}.json`);
const adminToken = "client-contract-smoke-token";
const siteOrigin = "https://immeubleassur.com";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function cleanup() {
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, reportPath, assetPath]) {
    if (existsSync(file)) rmSync(file, { force: true });
  }
}

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function post(token, body, DB) {
  return readJson(await clientPost({
    request: new Request(`${siteOrigin}/api/client/case?token=${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    env: { DB, SMTP_TO: "team@example.test", SCAN_DOCUMENT: async () => ({ status: "clean", provider: "smoke-antivirus" }) }
  }));
}

async function getClient(token, DB) {
  return readJson(await clientGet({ request: new Request(`${siteOrigin}/api/client/case?token=${token}`), env: { DB, SMTP_TO: "team@example.test", SCAN_DOCUMENT: async () => ({ status: "clean", provider: "smoke-antivirus" }) } }));
}

async function postAdmin(body, DB) {
  return readJson(await adminPost({
    request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    env: { DB, ADMIN_API_TOKEN: adminToken, SITE_ORIGIN: siteOrigin }
  }));
}

async function main() {
  cleanup();
  let DB = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  const now = new Date().toISOString();
  const leadId = crypto.randomUUID();
  DB.prepare(`INSERT INTO leads (id, reference, name, phone, email, profile, property_type, city, units_count, need, message, lead_score, status, source, page_url, referrer, ip_address, user_agent, assigned_to, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'client-contract-smoke', ?, '', '127.0.0.1', 'client-contract-smoke', '', '', ?, ?)`).bind(
    leadId,
    "IA-CTR-SMOKE-001",
    "Client Contrat Smoke",
    "0600000000",
    "client-contrat-smoke@example.test",
    "sci",
    "copropriete",
    "Bordeaux",
    "18",
    "renouvellement",
    "Contrat gagne a materialiser avec espace client, primes, parrainage, consentements et demandes.",
    94,
    `${siteOrigin}/devis-assurance-immeuble`,
    now,
    now
  ).run();

  const adminResponse = await readJson(await adminGet({ request: new Request(`${siteOrigin}/api/admin/cases?sync=1`, { headers: { Authorization: `Bearer ${adminToken}` } }), env: { DB, ADMIN_API_TOKEN: adminToken, SITE_ORIGIN: siteOrigin } }));
  assert(adminResponse.status === 200 && adminResponse.body.success, "admin sync should create a brokerage case");

  DB.prepare("UPDATE leads SET status = 'won', updated_at = ? WHERE id = ?").bind(now, leadId).run();
  DB.prepare("UPDATE brokerage_cases SET stage = 'contract_active', readiness_score = 100, updated_at = ? WHERE lead_id = ?").bind(now, leadId).run();
  DB.close();

  const previousEnv = {
    LOCAL_SQLITE_DB: process.env.LOCAL_SQLITE_DB,
    CLIENT_CONTRACT_REPORT: process.env.CLIENT_CONTRACT_REPORT,
    CLIENT_CONTRACT_PUBLIC_REPORT: process.env.CLIENT_CONTRACT_PUBLIC_REPORT
  };
  process.env.LOCAL_SQLITE_DB = dbPath;
  process.env.CLIENT_CONTRACT_REPORT = reportPath;
  process.env.CLIENT_CONTRACT_PUBLIC_REPORT = assetPath;
  await import(new URL(`./client-contract-orchestrator.js?smoke=${Date.now()}`, import.meta.url));
  restoreEnv(previousEnv);

  DB = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  const caseRow = DB.prepare("SELECT id, client_portal_token FROM brokerage_cases WHERE lead_id = ?").bind(leadId).first();
  assert(caseRow?.client_portal_token, "case should keep a client portal token");
  const contractRow = DB.prepare("SELECT * FROM client_contracts WHERE case_id = ?").bind(caseRow.id).first();
  assert(contractRow?.id, "orchestrator should create a client contract for a won case");

  let clientResponse = await getClient(caseRow.client_portal_token, DB);
  assert(clientResponse.status === 200 && clientResponse.body.success, "client API should expose the case by token");
  assert(clientResponse.body.contract_marker === "client-contract-workspace-v1", "client API should expose the contract marker");
  let contract = clientResponse.body.case.contracts?.[0];
  assert(contract?.documents?.length >= 4, "client contract should expose contract documents");
  assert(contract?.payments?.length >= 1, "client contract should expose premium schedule");
  assert(contract?.requests?.length >= 1, "client contract should expose service requests");
  assert(contract?.assets?.length >= 1, "client contract should expose insured assets");
  const monitorNow = new Date("2026-08-03T12:00:00.000Z");
  const renewalAt = new Date(monitorNow.getTime() + 30 * 86400000).toISOString();
  const paymentAt = new Date(monitorNow.getTime() + 5 * 86400000).toISOString();
  DB.prepare("UPDATE client_contracts SET renewal_at = ?, updated_at = ? WHERE id = ?").bind(renewalAt, monitorNow.toISOString(), contract.id).run();
  DB.prepare("UPDATE contract_payment_schedule SET due_at = ?, updated_at = ? WHERE contract_id = ? AND status = 'pending'").bind(paymentAt, monitorNow.toISOString(), contract.id).run();
  const renewalDrafts = runContractRenewalMonitor(DB, { now: monitorNow, siteOrigin, renewalDays: 90, paymentDays: 14 });
  assert(renewalDrafts.created === 2 && renewalDrafts.renewal_drafts === 1 && renewalDrafts.payment_drafts === 1, "renewal monitor should prepare supervised renewal and payment drafts");
  const renewalSecondRun = runContractRenewalMonitor(DB, { now: monitorNow, siteOrigin, renewalDays: 90, paymentDays: 14 });
  assert(renewalSecondRun.created === 0 && renewalSecondRun.duplicates === 2, "renewal monitor should deduplicate the same contractual periods");
  const uploadTarget = contract.documents.find((item) => item.status === "requested");
  assert(uploadTarget?.document_type, "client contract should expose a requested document for upload");
  const contractUpload = await post(caseRow.client_portal_token, { action: "contract_document_upload", contract_id: contract.id, document_type: uploadTarget.document_type, file_name: "attestation-smoke.pdf", mime_type: "application/pdf", content_base64: Buffer.from("%PDF-1.4 smoke").toString("base64") }, DB);
  assert(contractUpload.status === 200 && contractUpload.body.status === "received_pending_human_validation", "client should upload a contract document under human validation");
  const contractDocAfterUpload = DB.prepare("SELECT * FROM contract_documents WHERE id = ?").bind(contractUpload.body.document_id).first();
  assert(contractDocAfterUpload?.status === "received" && /clean_pending_human_validation/.test(contractDocAfterUpload.payload || ""), "contract upload should keep antivirus result pending human validation");
  const contractDocValidation = await readJson(await adminPatch({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "PATCH", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ contract_document_id: contractUpload.body.document_id, status: "validated", actor: "smoke-admin" }) }), env: { DB, ADMIN_API_TOKEN: adminToken, SITE_ORIGIN: siteOrigin } }));
  assert(contractDocValidation.status === 200 && contractDocValidation.body.status === "validated", "admin should validate a clean contract document");
  const contractDocAfterValidation = DB.prepare("SELECT status, validated_at, payload FROM contract_documents WHERE id = ?").bind(contractUpload.body.document_id).first();
  assert(contractDocAfterValidation?.status === "validated" && contractDocAfterValidation.validated_at && /validated_clean/.test(contractDocAfterValidation.payload || ""), "validated contract document should record clean review");
  const adminWithContractDocument = await readJson(await adminGet({ request: new Request(`${siteOrigin}/api/admin/cases?sync=0`, { headers: { Authorization: `Bearer ${adminToken}` } }), env: { DB, ADMIN_API_TOKEN: adminToken, SITE_ORIGIN: siteOrigin } }));
  assert(adminWithContractDocument.body.cases?.[0]?.contracts?.some((item) => item.documents?.some((doc) => doc.id === contractUpload.body.document_id && doc.status === "validated")), "admin should expose validated contract documents without binary content");
  assert(contract.consent?.cross_sell === false, "cross-sell should be refused by default");
  assert(contract.cross_sell?.enabled === false, "cross-sell recommendations should stay disabled before opt-in");
  assert(contract.consent_receipts?.some((receipt) => receipt.marker === "consent-receipt-v1" && receipt.consent_type === "cross_sell" && receipt.revocation_available), "consent receipt should expose revocation proof");

  const clientRequest = await post(caseRow.client_portal_token, { action: "contract_request", contract_id: contract.id, request_type: "endorsement", subject: "Modification smoke", message: "Merci de modifier la garantie du local technique et de confirmer la franchise." }, DB);
  assert(clientRequest.status === 200 && clientRequest.body.status === "open", "client request should accept a detailed message");
  const refreshedWithMessage = await getClient(caseRow.client_portal_token, DB);
  assert(refreshedWithMessage.body.case.contracts?.[0]?.requests?.some((item) => item.subject === "Modification smoke" && /local technique/.test(item.message || "")), "client portal should expose the request message for follow-up");
  const notificationDraft = DB.prepare("SELECT status, audience, subject, body FROM case_mail_queue WHERE case_id = ? AND audience = ? ORDER BY created_at DESC LIMIT 1").bind(caseRow.id, "internal_request").first();
  assert(notificationDraft?.status === "draft_review" && notificationDraft.audience === "internal_request" && /local technique/.test(notificationDraft.body || ""), "client request should create a supervised internal notification draft");

  const blockedConsent = await post(caseRow.client_portal_token, { action: "contract_consent", contract_id: contract.id, consent_type: "cross_sell", granted: true }, DB);
  assert(blockedConsent.status === 422, "granting commercial consent should require explicit acceptance");

  const grantedConsent = await post(caseRow.client_portal_token, { action: "contract_consent", contract_id: contract.id, consent_type: "cross_sell", granted: true, explicit_acceptance: true }, DB);
  assert(grantedConsent.status === 200 && grantedConsent.body.status === "granted", "explicit opt-in should be stored");
  clientResponse = await getClient(caseRow.client_portal_token, DB);
  contract = clientResponse.body.case.contracts?.[0];
  assert(contract.consent?.cross_sell === true, "cross-sell consent should become true after opt-in");
  assert(contract.cross_sell?.enabled === true && contract.cross_sell.recommendations?.length > 0, "recommendations should appear only after opt-in");
  const grantedReceipt = contract.consent_receipts?.find((receipt) => receipt.consent_type === "cross_sell");
  assert(grantedReceipt?.latest_event?.explicit_acceptance === true, "consent receipt should expose explicit acceptance proof");
  const adminCrossSell = await readJson(await adminGet({ request: new Request(`${siteOrigin}/api/admin/cases?sync=0`, { headers: { Authorization: `Bearer ${adminToken}` } }), env: { DB, ADMIN_API_TOKEN: adminToken, SITE_ORIGIN: siteOrigin } }));
  assert(Number(adminCrossSell.body.summary?.contract_operations?.cross_sell_reviews || 0) >= 1, "admin should expose cross-sell consent as a human-reviewed contract opportunity");
  assert((adminCrossSell.body.crm_action_queue || []).some((item) => item.type === "cross-sell-revue" && item.human_review_required), "crm action queue should route cross-sell through human review");

  const revokedConsent = await post(caseRow.client_portal_token, { action: "contract_consent", contract_id: contract.id, consent_type: "cross_sell", granted: false }, DB);
  assert(revokedConsent.status === 200 && revokedConsent.body.status === "revoked", "revocation should be stored");
  clientResponse = await getClient(caseRow.client_portal_token, DB);
  contract = clientResponse.body.case.contracts?.[0];
  const revokedReceipt = contract.consent_receipts?.find((receipt) => receipt.consent_type === "cross_sell");
  assert(revokedReceipt?.status === "revoked" && revokedReceipt.latest_event?.status === "revoked", "consent receipt should expose revocation status");

  const blockedReferral = await post(caseRow.client_portal_token, { action: "contract_referral", contract_id: contract.id, filleul_email: "filleul@example.test" }, DB);
  assert(blockedReferral.status === 422, "referral should require explicit filleul permission");
  const referral = await post(caseRow.client_portal_token, { action: "contract_referral", contract_id: contract.id, filleul_name: "Filleul Smoke", filleul_email: "filleul@example.test", explicit_permission: true }, DB);
  assert(referral.status === 200 && referral.body.status === "draft_review", "referral should stay in human review");

  const paymentRequest = await post(caseRow.client_portal_token, { action: "payment_link_request", contract_id: contract.id }, DB);
  assert(paymentRequest.status === 200 && paymentRequest.body.status === "open", "payment link request should create an open request");
  const assetUpdate = await post(caseRow.client_portal_token, { action: "asset_update", contract_id: contract.id, label: "Immeuble Smoke Bordeaux", units_count: "20", address: "Bordeaux", occupancy: "locatif" }, DB);
  assert(assetUpdate.status === 200 && assetUpdate.body.status === "asset_saved", "asset update should be stored");

  const requestRow = DB.prepare("SELECT id FROM contract_service_requests WHERE contract_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1").bind(contract.id).first();
  assert(requestRow?.id, "admin smoke should find an open contract request");
  const requestTaken = await postAdmin({ action: "contract_request_status", request_id: requestRow.id, status: "in_progress", reviewer: "smoke-admin" }, DB);
  assert(requestTaken.status === 200 && requestTaken.body.status === "in_progress", "admin should take a contract request");
  assert(requestTaken.body.reply_status === "draft_review" && requestTaken.body.reply_mail_id, "taking a request should prepare a reviewed client reply");
  const requestResolved = await postAdmin({ action: "contract_request_status", request_id: requestRow.id, status: "resolved", reviewer: "smoke-admin" }, DB);
  assert(requestResolved.status === 200 && requestResolved.body.status === "resolved", "admin should resolve a contract request");
  const clientReplyDrafts = DB.prepare("SELECT COUNT(*) AS count FROM case_mail_queue WHERE case_id = ? AND audience = ? AND status = ?").bind(caseRow.id, "client_request_update", "draft_review").first()?.count || 0;
  assert(Number(clientReplyDrafts) >= 2, "request status changes should create supervised client reply drafts");

  const referralRow = DB.prepare("SELECT id FROM contract_referrals WHERE contract_id = ? AND status = 'draft_review' ORDER BY created_at DESC LIMIT 1").bind(contract.id).first();
  assert(referralRow?.id, "admin smoke should find a referral in review");
  const referralApproved = await postAdmin({ action: "referral_status", referral_id: referralRow.id, status: "approved", reviewer: "smoke-admin" }, DB);
  assert(referralApproved.status === 200 && referralApproved.body.status === "approved", "admin should approve a referral after review");

  const paymentRow = DB.prepare("SELECT id FROM contract_payment_schedule WHERE contract_id = ? AND status = 'pending' ORDER BY due_at LIMIT 1").bind(contract.id).first();
  assert(paymentRow?.id, "admin smoke should find a pending premium schedule");
  const paymentMarked = await postAdmin({ action: "payment_status", payment_id: paymentRow.id, status: "paid", reviewer: "smoke-admin" }, DB);
  assert(paymentMarked.status === 200 && paymentMarked.body.status === "paid", "admin should mark a reviewed premium as paid");

  const consentEvents = DB.prepare("SELECT COUNT(*) AS count FROM contract_consent_events WHERE contract_id = ?").bind(contract.id).first()?.count || 0;
  assert(Number(consentEvents) >= 2, "consent grant and revocation should be traced");
  const timelineCount = DB.prepare("SELECT COUNT(*) AS count FROM case_timeline WHERE case_id = ? AND event_type LIKE 'contract_%'").bind(caseRow.id).first()?.count || 0;
  assert(Number(timelineCount) >= 8, "contract timeline should trace system, client and admin actions");
  const humanReviewRequests = DB.prepare("SELECT COUNT(*) AS count FROM contract_service_requests WHERE contract_id = ? AND human_review_required = 1").bind(contract.id).first()?.count || 0;
  assert(Number(humanReviewRequests) >= 3, "contract requests should require human review");

  DB.close();
  cleanup();
  console.log("Client contract workflow smoke passed: won case -> contract -> consent -> cross-sell review -> referral -> requests -> admin actions -> timeline.");
}

main().catch((error) => {
  try { cleanup(); } catch {}
  console.error(`Client contract workflow smoke failed: ${error.message}`);
  process.exit(1);
});