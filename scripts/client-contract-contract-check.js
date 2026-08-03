import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const required = [
  ["schema.sql", "CREATE TABLE IF NOT EXISTS client_contracts"],
  ["schema.sql", "CREATE TABLE IF NOT EXISTS contract_documents"],
  ["schema.sql", "CREATE TABLE IF NOT EXISTS contract_payment_schedule"],
  ["schema.sql", "CREATE TABLE IF NOT EXISTS client_assets"],
  ["schema.sql", "CREATE TABLE IF NOT EXISTS contract_service_requests"],
  ["schema.sql", "CREATE TABLE IF NOT EXISTS contract_consent_events"],
  ["schema.sql", "CREATE TABLE IF NOT EXISTS contract_referrals"],
  ["functions/_shared/client-contracts.js", "client-contract-workspace-v1"],
  ["functions/_shared/client-contracts.js", "contact_import: false"],
  ["functions/_shared/client-contracts.js", "no-address-book-scraping"],
  ["functions/_shared/client-contracts.js", "cross_sell_disabled_until_explicit_opt_in"],
  ["functions/_shared/client-contracts.js", "explicit-opt-in"],
  ["scripts/client-contract-orchestrator.js", "explicit-opt-in-cross-sell"],
  ["scripts/client-contract-orchestrator.js", "revocation-stored"],
  ["scripts/client-contract-orchestrator.js", "no-address-book-scraping"],
  ["scripts/client-contract-orchestrator.js", "human-review-contract-requests"],
  ["functions/api/client/case.js", "contract_consent"],
  ["functions/api/client/case.js", "contract_document_upload"],
  ["functions/api/client/case.js", "contract_document_uploaded"],
  ["functions/api/client/case.js", "contract_document_id"],
  ["functions/api/client/case.js", "message: clean(request.message, 2000)"],
  ["functions/api/client/case.js", "internalNotificationRecipient"],
  ["functions/api/client/case.js", "internal_request"],
  ["functions/api/client/case.js", "contract_request_notification_draft"],
  ["scripts/client-contract-workflow-smoke.js", "supervised internal notification draft"],
  ["functions/api/client/case.js", "Message requis pour cette demande"],
  ["public/espace-client.html", "portal-message-field"],
  ["public/assets/client-portal.js", "item.message"],
  ["scripts/client-contract-workflow-smoke.js", "client request should accept a detailed message"],
  ["scripts/local-contract-renewal-monitor.js", "contract-renewal-autopilot-v1"],
  ["scripts/local-contract-renewal-monitor.js", "no_automatic_send: true"],
  ["functions/api/client/case.js", "contract_referral"],
  ["functions/api/client/case.js", "payment_link_request"],
  ["functions/api/client/case.js", "asset_update"],
  ["functions/api/client/case.js", "explicit_acceptance"],
  ["functions/api/client/case.js", "contract_consent_updated"],
  ["functions/api/client/case.js", "consent-receipt-v1"],
  ["functions/api/client/case.js", "consentReceiptsFor"],
  ["functions/api/client/case.js", "consent_receipts"],
  ["functions/api/client/case.js", "revocation_available"],
  ["functions/api/admin/cases.js", "client-contract-workspace"],
  ["functions/api/admin/cases.js", "cross-sell-human-review-v1"],
  ["functions/api/admin/cases.js", "crossSellReviewFor"],
  ["functions/api/admin/cases.js", "cross_sell_review"],
  ["functions/api/admin/cases.js", "cross-sell-revue"],
  ["functions/api/admin/cases.js", "cross_sell_reviews"],
  ["functions/api/admin/cases.js", "contract_request_status"],
  ["functions/api/admin/cases.js", "contract_document_id"],
  ["functions/api/admin/cases.js", "contract-document-review-v1"],
  ["functions/api/admin/cases.js", "client-contract-request-reply-v1"],
  ["functions/api/admin/cases.js", "contract_request_client_reply_draft"],
  ["functions/api/admin/cases.js", "reply_status"],
  ["public/assets/admin.js", "client_request_update"],
  ["public/assets/admin.js", "client_contract_renewal"],
  ["public/assets/admin.js", "client_payment_reminder"],
  ["scripts/client-contract-workflow-smoke.js", "request status changes should create supervised client reply drafts"],
  ["functions/api/admin/cases.js", "referral_status"],
  ["functions/api/admin/cases.js", "payment_status"],
  ["functions/api/admin/cases.js", "admin-contract-action-v1"],
  ["public/assets/admin.js", "postContractAdminAction"],
  ["public/assets/admin.js", "cross_sell_reviews"],
  ["public/assets/admin.js", "data-contract-action"],
  ["public/espace-client.html", "portal-contracts"],
  ["public/espace-client.html", "portal-consents"],
  ["public/espace-client.html", "portal-referral-form"],
  ["public/espace-client.html", "portal-asset-form"],
  ["public/assets/client-portal.js", "contract_consent"],
  ["public/assets/client-portal.js", "uploadContractDocument"],
  ["public/assets/client-portal.js", "contractDocumentUpload"],
  ["public/assets/client-portal.js", "contract_referral"],
  ["public/assets/client-portal.js", "payment_link_request"],
  ["public/assets/client-portal.js", "asset_update"],
  ["public/assets/client-portal.js", "explicit_acceptance"],
  ["public/assets/client-portal.js", "renderConsentReceipt"],
  ["public/assets/client-portal.js", "consent_receipts"],
  ["public/assets/styles.css", "portal-consent-receipt"],
  ["public/assets/styles.css", "client-contract-portal-2026-08:start"],
  ["package.json", "client:contracts"],
  ["package.json", "contracts:renewals"],
  ["scripts/local-runtime-report-cycle.js", "contract_renewal_monitor"],
  ["package.json", "client:contracts:contract"],
  ["package.json", "client:contracts:smoke"],
  ["scripts/client-contract-workflow-smoke.js", "consent receipt should expose explicit acceptance proof"],
  ["scripts/client-contract-workflow-smoke.js", "client should upload a contract document under human validation"],
  ["scripts/client-contract-workflow-smoke.js", "admin should validate a clean contract document"],
  ["scripts/client-contract-workflow-smoke.js", "renewal monitor should prepare supervised renewal and payment drafts"],
  ["scripts/client-contract-workflow-smoke.js", "renewal monitor should deduplicate the same contractual periods"],
  ["scripts/client-contract-workflow-smoke.js", "crm action queue should route cross-sell through human review"]
];

const forbidden = [
  ["functions/_shared/client-contracts.js", "contact_import: true"],
  ["functions/api/client/case.js", "navigator.contacts"],
  ["public/assets/client-portal.js", "navigator.contacts"],
  ["public/assets/client-portal.js", "ContactsManager"],
  ["public/assets/client-portal.js", "addressBook"],
  ["public/assets/client-portal.js", "collectContacts"],
  ["public/assets/client-portal.js", "external_navigation"],
  ["public/assets/client-portal.js", "third_party_navigation_probe"],
  ["public/assets/client-portal.js", "hidden_tracking"],
  ["scripts/client-contract-orchestrator.js", "contact_import: true"]
];

const missing = [];
const violations = [];

for (const [file, needle] of required) {
  if (!existsSync(file) || !readFileSync(file, "utf8").includes(needle)) missing.push(`${file}:${needle}`);
}

for (const [file, needle] of forbidden) {
  if (existsSync(file) && readFileSync(file, "utf8").includes(needle)) violations.push(`${file}:${needle}`);
}

const report = {
  generated_at: new Date().toISOString(),
  status: missing.length || violations.length ? "failed" : "passed",
  marker: "client-contract-workspace-v1",
  checked_required: required.length,
  checked_forbidden: forbidden.length,
  missing,
  violations,
  safeguards: ["explicit-opt-in", "revocation-tracing", "no-address-book-scraping", "first-party-navigation-only", "human-review-before-commercial-contact"]
};

for (const file of [join("reports", "client-contract-contract-report.json"), join("public", "assets", "client-contract-contract-latest.json")]) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (missing.length || violations.length) {
  if (missing.length) console.error(`Client contract required markers missing: ${missing.join(", ")}`);
  if (violations.length) console.error(`Client contract forbidden markers present: ${violations.join(", ")}`);
  process.exit(1);
}

console.log(`Client contract contract passed for ${required.length} required markers and ${forbidden.length} forbidden markers.`);