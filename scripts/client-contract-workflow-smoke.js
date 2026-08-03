import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { onRequestGet as adminGet, onRequestPost as adminPost } from "../functions/api/admin/cases.js";
import { onRequestGet as clientGet, onRequestPost as clientPost } from "../functions/api/client/case.js";

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
    env: { DB }
  }));
}

async function getClient(token, DB) {
  return readJson(await clientGet({ request: new Request(`${siteOrigin}/api/client/case?token=${token}`), env: { DB } }));
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
  assert(contract.consent?.cross_sell === false, "cross-sell should be refused by default");
  assert(contract.cross_sell?.enabled === false, "cross-sell recommendations should stay disabled before opt-in");
  assert(contract.consent_receipts?.some((receipt) => receipt.marker === "consent-receipt-v1" && receipt.consent_type === "cross_sell" && receipt.revocation_available), "consent receipt should expose revocation proof");

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
  const requestResolved = await postAdmin({ action: "contract_request_status", request_id: requestRow.id, status: "resolved", reviewer: "smoke-admin" }, DB);
  assert(requestResolved.status === 200 && requestResolved.body.status === "resolved", "admin should resolve a contract request");

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
  console.log("Client contract workflow smoke passed: won case -> contract -> consent -> referral -> requests -> admin actions -> timeline.");
}

main().catch((error) => {
  try { cleanup(); } catch {}
  console.error(`Client contract workflow smoke failed: ${error.message}`);
  process.exit(1);
});