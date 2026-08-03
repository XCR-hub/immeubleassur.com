import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { onRequestGet as adminGet, onRequestPost as adminPost } from "../functions/api/admin/cases.js";
import { onRequestGet as clientGet, onRequestPost as clientPost } from "../functions/api/client/case.js";
import { onRequestGet as partnerGet, onRequestPost as partnerPost } from "../functions/api/partner/consultation.js";

const dbPath = join(tmpdir(), `immeubleassur-brokerage-smoke-${process.pid}-${Date.now()}.sqlite`);
const adminToken = "brokerage-smoke-token";
const siteOrigin = "https://immeubleassur.com";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function cleanup() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) rmSync(file, { force: true });
  }
}

async function main() {
  cleanup();
  const DB = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  const now = new Date().toISOString();
  DB.prepare("UPDATE insurer_partners SET contact_email = ?, service_level_hours = 24, active = 1, updated_at = ? WHERE id = 'partner-default-mri'").bind("assureur-smoke@example.test", now).run();
  DB.prepare("UPDATE insurer_partners SET active = 0, updated_at = ? WHERE id <> 'partner-default-mri'").bind(now).run();
  const leadId = crypto.randomUUID();
  DB.prepare(`INSERT INTO leads (id, reference, name, phone, email, profile, property_type, city, units_count, need, message, lead_score, status, source, page_url, referrer, ip_address, user_agent, assigned_to, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'smoke-test', ?, '', '127.0.0.1', 'brokerage-smoke', '', '', ?, ?)`).bind(
    leadId,
    "IA-SMOKE-001",
    "Client Smoke Test",
    "0600000000",
    "client-smoke@example.test",
    "syndic-professionnel",
    "copropriete",
    "Lyon",
    "42",
    "renouvellement",
    "Contrat actuel, echeance proche, sinistres maitrises, besoin de consultation assureur complete.",
    92,
    `${siteOrigin}/devis-assurance-immeuble`,
    now,
    now
  ).run();

  const env = { DB, ADMIN_API_TOKEN: adminToken, SITE_ORIGIN: siteOrigin };
  const adminResponse = await readJson(await adminGet({ request: new Request(`${siteOrigin}/api/admin/cases?sync=1`, { headers: { Authorization: `Bearer ${adminToken}` } }), env }));
  assert(adminResponse.status === 200 && adminResponse.body.success, "admin cases API should return success");
  assert(adminResponse.body.sync?.counters?.created === 1, "admin sync should create one brokerage case");
  assert(adminResponse.body.cases?.length >= 1, "admin API should expose created case");
  assert(adminResponse.body.cases[0]?.action_plan?.marker === "case-action-plan-v1", "case action plan should expose supervised next action");
  assert(adminResponse.body.summary?.insurer_package_readiness?.marker === "insurer-package-readiness-v1", "insurer package readiness summary should expose marker");
  assert(adminResponse.body.cases[0]?.insurer_package_readiness?.marker === "insurer-package-readiness-v1", "case should expose insurer package readiness");
  assert(adminResponse.body.cases[0]?.insurer_package_readiness?.status === "blocked_documents", "incomplete case should block insurer package on documents");
  assert(Number(adminResponse.body.summary?.action_plan?.total || 0) >= 1, "case action plan summary should count dossiers");
  assert(adminResponse.body.mail_queue?.some((mail) => mail.status === "draft_review"), "mail queue should keep drafts under human review");
  assert(adminResponse.body.safeguards?.includes("human-review-before-send"), "admin safeguards should require human review before send");
  assert(adminResponse.body.safeguards?.includes("client-offer-human-review"), "admin safeguards should require human review before client offer publication");

  const caseRow = DB.prepare("SELECT id, client_portal_token FROM brokerage_cases WHERE lead_id = ?").bind(leadId).first();
  assert(caseRow?.client_portal_token?.length >= 24, "case should have a private client portal token");
  const insurerMailDraft = DB.prepare("SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'insurer' AND status = 'draft_review' LIMIT 1").bind(caseRow.id).first();
  assert(insurerMailDraft?.id, "smoke should create an initial insurer mail draft before package completion");
  const blockedInsurerMailApproval = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_mail", mail_id: insurerMailDraft.id, reviewer: "smoke" }) }), env }));
  assert(blockedInsurerMailApproval.status === 409 && blockedInsurerMailApproval.body.marker === "insurer-package-send-guard-v1", "insurer package send guard should block incomplete insurer mail approval");
  const initialGuardTimeline = DB.prepare("SELECT COUNT(*) AS count FROM case_timeline WHERE case_id = ? AND event_type = 'insurer_package_send_blocked'").bind(caseRow.id).first()?.count || 0;
  assert(Number(initialGuardTimeline) >= 1, "insurer package send guard should trace blocked insurer mail approval");

  const clientResponse = await readJson(await clientGet({ request: new Request(`${siteOrigin}/api/client/case?token=${caseRow.client_portal_token}`), env }));
  assert(clientResponse.status === 200 && clientResponse.body.success, "client portal API should open case by token");
  assert(clientResponse.body.case?.documents?.length >= 4, "client portal should expose document checklist");
  assert(!clientResponse.body.case?.lead?.email, "client portal response should not expose email back to browser payload");

  const firstDoc = clientResponse.body.case.documents[0];
  const clientPostResponse = await readJson(await clientPost({ request: new Request(`${siteOrigin}/api/client/case?token=${caseRow.client_portal_token}`, { method: "POST", body: JSON.stringify({ document_type: firstDoc.document_type, notes: "Piece recue smoke test" }) }), env }));
  assert(clientPostResponse.status === 200 && clientPostResponse.body.status === "received", "client portal should mark a document as received");
  DB.prepare("UPDATE case_documents SET status = 'validated', received_at = COALESCE(received_at, ?), validated_at = COALESCE(validated_at, ?), updated_at = ? WHERE case_id = ?").bind(now, now, now, caseRow.id).run();
  const marketSync = await readJson(await adminGet({ request: new Request(`${siteOrigin}/api/admin/cases?sync=1`, { headers: { Authorization: `Bearer ${adminToken}` } }), env }));
  assert(marketSync.status === 200 && marketSync.body.success, "admin sync should refresh a complete market-ready case");
  assert((marketSync.body.consultations || []).length >= 1, "complete case should prepare an insurer consultation");
  assert(marketSync.body.summary?.partner_performance?.marker === "partner-performance-v1", "partner performance summary should count configured insurers");
  assert(marketSync.body.partners?.some((partner) => partner.performance?.marker === "partner-performance-v1"), "partner rows should expose insurer performance");
  assert(marketSync.body.summary?.crm_action_queue?.marker === "crm-action-queue-v1", "crm action queue summary should expose supervised next actions");
  assert(marketSync.body.summary?.insurer_package_readiness?.market_ready >= 1, "insurer package readiness should expose market-ready cases");
  assert((marketSync.body.cases || []).some((item) => item.insurer_package_readiness?.status === "draft_review" && item.insurer_package_readiness?.human_review_required), "complete case should move insurer package to reviewed draft status");
  assert((marketSync.body.crm_action_queue || []).some((item) => item.marker === "crm-action-queue-v1" && item.human_review_required), "crm action queue should expose supervised next actions");
  assert((marketSync.body.crm_action_queue || []).some((item) => item.type === "pack-assureur-revue"), "crm action queue should prioritize insurer package review");

  const mail = DB.prepare("SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'client' LIMIT 1").bind(caseRow.id).first();
  const blockedSend = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "send_mail", mail_id: mail.id, reviewer: "smoke" }) }), env }));
  assert(blockedSend.status === 409 && /Validation humaine/.test(blockedSend.body.error || ""), "send_mail should be blocked before human approval");

  const approve = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_mail", mail_id: mail.id, reviewer: "smoke" }) }), env }));
  assert(approve.status === 200 && approve.body.status === "approved", "admin should approve draft mail explicitly");

  const markSent = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_sent", mail_id: mail.id, reviewer: "smoke" }) }), env }));
  assert(markSent.status === 200 && markSent.body.status === "sent", "admin should be able to mark reviewed mail as sent");

  const consultation = DB.prepare("SELECT id FROM insurer_consultations WHERE case_id = ? LIMIT 1").bind(caseRow.id).first();
  assert(consultation?.id, "smoke should have a partner consultation to process");
  const blockedConsultationSend = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "send_consultation", consultation_id: consultation.id, reviewer: "smoke" }) }), env }));
  assert(blockedConsultationSend.status === 409 && /Validation humaine consultation/.test(blockedConsultationSend.body.error || ""), "consultation send should be blocked before human approval");
  const consultationApproved = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_consultation", consultation_id: consultation.id, reviewer: "smoke" }) }), env }));
  assert(consultationApproved.status === 200 && consultationApproved.body.status === "approved", "admin should approve insurer consultation after review");
  assert(/espace-assureur\.html\?token=/.test(consultationApproved.body.insurer_portal_url || ""), "approval should create an insurer portal URL");
  const tokenRow = DB.prepare("SELECT token FROM insurer_consultation_tokens WHERE consultation_id = ? AND status = 'active' LIMIT 1").bind(consultation.id).first();
  assert(tokenRow?.token, "approved consultation should store an active partner token");
  const partnerPayload = await readJson(await partnerGet({ request: new Request(`${siteOrigin}/api/partner/consultation?token=${tokenRow.token}`), env }));
  assert(partnerPayload.status === 200 && partnerPayload.body.marker === "insurer-partner-portal-v1", "partner portal should open by token");
  const partnerJson = JSON.stringify(partnerPayload.body);
  assert(!partnerJson.includes("client-smoke@example.test") && !partnerJson.includes("0600000000"), "partner portal should not expose client email or phone");

  const guardDoc = DB.prepare("SELECT id FROM case_documents WHERE case_id = ? AND required = 1 LIMIT 1").bind(caseRow.id).first();
  assert(guardDoc?.id, "smoke should have one required document for send guard regression");
  DB.prepare("UPDATE case_documents SET status = 'requested', updated_at = ? WHERE id = ?").bind(now, guardDoc.id).run();
  const blockedPackageSend = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_consultation_sent", consultation_id: consultation.id, reviewer: "smoke" }) }), env }));
  assert(blockedPackageSend.status === 409 && blockedPackageSend.body.marker === "insurer-package-send-guard-v1" && Number(blockedPackageSend.body.missing_count || 0) >= 1, "insurer package send guard should block sending if required documents regress");
  DB.prepare("UPDATE case_documents SET status = 'validated', received_at = COALESCE(received_at, ?), validated_at = COALESCE(validated_at, ?), updated_at = ? WHERE id = ?").bind(now, now, now, guardDoc.id).run();

  const consultationSent = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_consultation_sent", consultation_id: consultation.id, reviewer: "smoke" }) }), env }));
  assert(consultationSent.status === 200 && consultationSent.body.status === "sent", "admin should mark reviewed insurer consultation as sent");
  const overdueAt = new Date(Date.now() - 3600000).toISOString();
  DB.prepare("UPDATE insurer_consultations SET response_due_at = ?, updated_at = ? WHERE id = ?").bind(overdueAt, overdueAt, consultation.id).run();
  const insurerFollowupSync = await readJson(await adminGet({ request: new Request(`${siteOrigin}/api/admin/cases?sync=1`, { headers: { Authorization: `Bearer ${adminToken}` } }), env }));
  assert(insurerFollowupSync.status === 200 && insurerFollowupSync.body.sync?.counters?.insurer_followup_drafts === 1, "admin sync should prepare one overdue insurer followup draft");
  const autoFollowupMail = DB.prepare("SELECT status, body FROM case_mail_queue WHERE case_id = ? AND audience = 'insurer_followup' AND payload LIKE ? LIMIT 1").bind(caseRow.id, `%${consultation.id}%`).first();
  assert(autoFollowupMail?.status === "draft_review" && /espace-assureur\.html\?token=/.test(autoFollowupMail.body || ""), "overdue insurer followup should remain a human-reviewed draft with partner portal link");
  const insurerFollowupTimeline = DB.prepare("SELECT COUNT(*) AS count FROM case_timeline WHERE case_id = ? AND event_type = 'insurer_consultation_followup_autopilot'").bind(caseRow.id).first()?.count || 0;
  assert(Number(insurerFollowupTimeline) === 1, "overdue insurer followup should be traced in timeline");
  const partnerQuestion = await readJson(await partnerPost({ request: new Request(`${siteOrigin}/api/partner/consultation?token=${tokenRow.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "question", notes: "Merci de confirmer la franchise toiture." }) }), env }));
  assert(partnerQuestion.status === 200 && partnerQuestion.body.status === "answered", "partner portal should trace an insurer question");
  const followupDraft = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "consultation_followup", consultation_id: consultation.id, reviewer: "smoke" }) }), env }));
  assert(followupDraft.status === 200 && followupDraft.body.status === "draft_review", "insurer followup should be prepared as a reviewed mail draft");
  const consultationQuote = await readJson(await partnerPost({ request: new Request(`${siteOrigin}/api/partner/consultation?token=${tokenRow.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "quote", premium_amount_cents: 123400, deductible_cents: 50000, notes: "Offre smoke recue via portail." }) }), env }));
  assert(consultationQuote.status === 200 && consultationQuote.body.status === "quoted", "partner portal should trace insurer quote response");
  const followupMail = DB.prepare("SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'insurer_followup' AND status = 'draft_review'").bind(caseRow.id).first();
  assert(followupMail?.id, "insurer followup should remain in human-reviewed draft queue");
  const refreshedCase = DB.prepare("SELECT stage FROM brokerage_cases WHERE id = ?").bind(caseRow.id).first();
  assert(refreshedCase?.stage === "offer_followup", "quoted consultation should move case to offer followup");

  const draftOffer = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare_client_offer", consultation_id: consultation.id, reviewer: "smoke" }) }), env }));
  assert(draftOffer.status === 200 && draftOffer.body.status === "draft_review" && draftOffer.body.offer_id && draftOffer.body.mail_id, "admin should prepare a human-reviewed client offer draft");
  const draftOfferClient = await readJson(await clientGet({ request: new Request(`${siteOrigin}/api/client/case?token=${caseRow.client_portal_token}`), env }));
  assert(draftOfferClient.status === 200 && !(draftOfferClient.body.case?.client_offers || []).length, "client offer draft should stay hidden before human approval");
  const prematureOfferDecision = await readJson(await clientPost({ request: new Request(`${siteOrigin}/api/client/case?token=${caseRow.client_portal_token}`, { method: "POST", body: JSON.stringify({ action: "offer_decision", offer_id: draftOffer.body.offer_id, decision: "accepted", explicit_acceptance: true }) }), env }));
  assert(prematureOfferDecision.status === 404, "client should not decide an unpublished offer");

  const approvedOffer = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_client_offer", offer_id: draftOffer.body.offer_id, reviewer: "smoke" }) }), env }));
  assert(approvedOffer.status === 200 && approvedOffer.body.status === "presented", "admin should publish the client offer after human review");
  const oldOfferAt = new Date(Date.now() - 4 * 86400000).toISOString();
  DB.prepare("UPDATE client_offer_recommendations SET presented_at = ?, human_approved_at = ?, updated_at = ? WHERE id = ?").bind(oldOfferAt, oldOfferAt, oldOfferAt, draftOffer.body.offer_id).run();
  const offerFollowupSync = await readJson(await adminGet({ request: new Request(`${siteOrigin}/api/admin/cases?sync=1`, { headers: { Authorization: `Bearer ${adminToken}` } }), env }));
  assert(offerFollowupSync.status === 200 && offerFollowupSync.body.sync?.counters?.offer_followup_drafts === 1, "admin sync should prepare one overdue client offer followup draft");
  const offerFollowupMail = DB.prepare("SELECT status, body FROM case_mail_queue WHERE case_id = ? AND audience = 'client_offer_followup' AND payload LIKE ? LIMIT 1").bind(caseRow.id, `%${draftOffer.body.offer_id}%`).first();
  assert(offerFollowupMail?.status === "draft_review" && /espace-client\.html\?token=/.test(offerFollowupMail.body || ""), "client offer followup should remain a human-reviewed draft with portal link");
  const offerFollowupTimeline = DB.prepare("SELECT COUNT(*) AS count FROM case_timeline WHERE case_id = ? AND event_type = 'client_offer_followup_draft'").bind(caseRow.id).first()?.count || 0;
  assert(Number(offerFollowupTimeline) === 1, "client offer followup should be traced in timeline");
  const offerPortal = await readJson(await clientGet({ request: new Request(`${siteOrigin}/api/client/case?token=${caseRow.client_portal_token}`), env }));
  const visibleOffer = (offerPortal.body.case?.client_offers || []).find((item) => item.id === draftOffer.body.offer_id);
  assert(offerPortal.status === 200 && visibleOffer?.status === "presented" && visibleOffer.marker === "client-offer-recommendation-v1", "client portal should expose only the approved offer recommendation");
  const missingExplicit = await readJson(await clientPost({ request: new Request(`${siteOrigin}/api/client/case?token=${caseRow.client_portal_token}`, { method: "POST", body: JSON.stringify({ action: "offer_decision", offer_id: draftOffer.body.offer_id, decision: "accepted" }) }), env }));
  assert(missingExplicit.status === 422 && /Acceptation explicite/.test(missingExplicit.body.error || ""), "client offer acceptance should require explicit consent");
  const acceptedOffer = await readJson(await clientPost({ request: new Request(`${siteOrigin}/api/client/case?token=${caseRow.client_portal_token}`, { method: "POST", body: JSON.stringify({ action: "offer_decision", offer_id: draftOffer.body.offer_id, decision: "accepted", explicit_acceptance: true }) }), env }));
  assert(acceptedOffer.status === 200 && acceptedOffer.body.status === "accepted", "client should accept a published offer explicitly");
  const wonCase = DB.prepare("SELECT c.stage, l.status AS lead_status FROM brokerage_cases c JOIN leads l ON l.id = c.lead_id WHERE c.id = ?").bind(caseRow.id).first();
  assert(wonCase?.stage === "contract_active" && wonCase?.lead_status === "won", "accepted offer should move the case to active contract and win the lead");

  const timelineCount = DB.prepare("SELECT COUNT(*) AS count FROM case_timeline WHERE case_id = ?").bind(caseRow.id).first()?.count || 0;
  assert(Number(timelineCount) >= 13, "case timeline should trace system, client, admin, insurer, offer and followup actions");

  DB.close();
  cleanup();
  console.log("Brokerage case workflow smoke passed: lead -> case -> client portal -> human mail review -> insurer portal -> autopilot followup draft -> client offer -> followup draft -> explicit acceptance -> timeline.");
}

main().catch((error) => {
  try { cleanup(); } catch {}
  console.error(`Brokerage case workflow smoke failed: ${error.message}`);
  process.exit(1);
});