import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { onRequestGet as adminGet, onRequestPost as adminPost } from "../functions/api/admin/cases.js";
import { onRequestGet as clientGet, onRequestPost as clientPost } from "../functions/api/client/case.js";

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
  assert(adminResponse.body.mail_queue?.some((mail) => mail.status === "draft_review"), "mail queue should keep drafts under human review");
  assert(adminResponse.body.safeguards?.includes("human-review-before-send"), "admin safeguards should require human review before send");

  const caseRow = DB.prepare("SELECT id, client_portal_token FROM brokerage_cases WHERE lead_id = ?").bind(leadId).first();
  assert(caseRow?.client_portal_token?.length >= 24, "case should have a private client portal token");

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
  const consultationSent = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_consultation_sent", consultation_id: consultation.id, reviewer: "smoke" }) }), env }));
  assert(consultationSent.status === 200 && consultationSent.body.status === "sent", "admin should mark reviewed insurer consultation as sent");
  const followupDraft = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "consultation_followup", consultation_id: consultation.id, reviewer: "smoke" }) }), env }));
  assert(followupDraft.status === 200 && followupDraft.body.status === "draft_review", "insurer followup should be prepared as a reviewed mail draft");
  const consultationQuote = await readJson(await adminPost({ request: new Request(`${siteOrigin}/api/admin/cases`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "consultation_response", consultation_id: consultation.id, status: "quoted", premium_amount_cents: 123400, deductible_cents: 50000, notes: "Offre smoke recue", reviewer: "smoke" }) }), env }));
  assert(consultationQuote.status === 200 && consultationQuote.body.status === "quoted", "admin should trace insurer quote response");
  const followupMail = DB.prepare("SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'insurer_followup' AND status = 'draft_review'").bind(caseRow.id).first();
  assert(followupMail?.id, "insurer followup should remain in human-reviewed draft queue");
  const refreshedCase = DB.prepare("SELECT stage FROM brokerage_cases WHERE id = ?").bind(caseRow.id).first();
  assert(refreshedCase?.stage === "offer_followup", "quoted consultation should move case to offer followup");

  const timelineCount = DB.prepare("SELECT COUNT(*) AS count FROM case_timeline WHERE case_id = ?").bind(caseRow.id).first()?.count || 0;
  assert(Number(timelineCount) >= 8, "case timeline should trace system, client, admin and insurer actions");

  DB.close();
  cleanup();
  console.log("Brokerage case workflow smoke passed: lead -> case -> client portal -> human mail review -> insurer consultation -> timeline.");
}

main().catch((error) => {
  try { cleanup(); } catch {}
  console.error(`Brokerage case workflow smoke failed: ${error.message}`);
  process.exit(1);
});