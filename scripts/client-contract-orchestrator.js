import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { clean, nowIso, safeJson } from "../functions/_shared/brokerage-cases.js";
import {
  CLIENT_CONTRACT_MARKER,
  annualPremiumCentsFor,
  assetSnapshotFor,
  consentProfileFor,
  contractDocumentsFor,
  contractReferenceForCase,
  crossSellRecommendationsFor,
  paymentScheduleFor,
  referralCodeFor,
  renewalDateFor,
  requestDueAtFor
} from "../functions/_shared/client-contracts.js";

loadDefaultEnvFiles();

const dbPath = env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"));
const reportPath = env("CLIENT_CONTRACT_REPORT", join("reports", "client-contract-orchestrator-report.json"));
const assetPath = env("CLIENT_CONTRACT_PUBLIC_REPORT", join("public", "assets", "client-contract-orchestrator-latest.json"));

function rows(database, sql, binds = []) {
  return database.prepare(sql).bind(...binds).all().results || [];
}

function first(database, sql, binds = []) {
  return database.prepare(sql).bind(...binds).first() || null;
}

function run(database, sql, binds = []) {
  return database.prepare(sql).bind(...binds).run();
}

function writeJson(file, payload) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function json(value) {
  return JSON.stringify(value || {});
}

function quotedInsurer(database, caseId) {
  const row = first(database, "SELECT insurer_name FROM insurer_consultations WHERE case_id = ? AND status IN ('quoted', 'answered', 'sent') ORDER BY CASE status WHEN 'quoted' THEN 1 WHEN 'answered' THEN 2 ELSE 3 END, updated_at DESC LIMIT 1", [caseId]);
  return clean(row?.insurer_name, 160) || "Assureur a confirmer";
}

function materializeContract(database, row, counters) {
  const existing = first(database, "SELECT * FROM client_contracts WHERE case_id = ?", [row.case_id]);
  const contractId = existing?.id || crypto.randomUUID();
  const premium = existing?.annual_premium_cents || annualPremiumCentsFor(row, row);
  const nextPaymentDue = existing?.next_payment_due_at || new Date(Date.now() + 15 * 86400000).toISOString();
  const renewalAt = existing?.renewal_at || renewalDateFor();
  const profile = consentProfileFor(safeJson(existing?.consent_profile, {}));
  const payload = {
    marker: CLIENT_CONTRACT_MARKER,
    source_case_reference: row.case_reference,
    lead_reference: row.lead_reference,
    cross_sell: crossSellRecommendationsFor(row, profile),
    automation_guard: "no-contact-import-no-third-party-navigation-without-opt-in"
  };

  if (!existing) {
    run(database, `INSERT INTO client_contracts (id, case_id, lead_id, contract_reference, status, insurer_name, policy_number, annual_premium_cents, premium_frequency, next_payment_due_at, renewal_at, referral_code, consent_profile, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, '', ?, 'annual', ?, ?, ?, ?, ?, ?, ?)`, [
      contractId,
      row.case_id,
      row.lead_id,
      contractReferenceForCase(row, row),
      quotedInsurer(database, row.case_id),
      premium,
      nextPaymentDue,
      renewalAt,
      referralCodeFor(row, row),
      json(profile),
      json(payload),
      nowIso(),
      nowIso()
    ]);
    counters.created += 1;
    run(database, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, 'contract_workspace_created', 'system', ?, ?)", [crypto.randomUUID(), row.case_id, json({ marker: CLIENT_CONTRACT_MARKER, contract_id: contractId }), nowIso()]);
  } else {
    run(database, "UPDATE client_contracts SET status = 'active', annual_premium_cents = COALESCE(NULLIF(annual_premium_cents, 0), ?), next_payment_due_at = COALESCE(next_payment_due_at, ?), renewal_at = COALESCE(renewal_at, ?), consent_profile = COALESCE(consent_profile, ?), payload = ?, updated_at = ? WHERE id = ?", [premium, nextPaymentDue, renewalAt, json(profile), json(payload), nowIso(), contractId]);
    counters.updated += 1;
  }

  for (const doc of contractDocumentsFor(row)) {
    const result = run(database, `INSERT OR IGNORE INTO contract_documents (id, contract_id, document_type, label, status, required, due_at, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [crypto.randomUUID(), contractId, doc.document_type, doc.label, doc.status, doc.required, new Date(Date.now() + 7 * 86400000).toISOString(), json({ marker: CLIENT_CONTRACT_MARKER }), nowIso(), nowIso()]);
    if (Number(result.meta?.changes || 0) > 0) counters.documents += 1;
  }

  const contract = first(database, "SELECT * FROM client_contracts WHERE id = ?", [contractId]);
  const existingPayments = first(database, "SELECT COUNT(*) AS count FROM contract_payment_schedule WHERE contract_id = ?", [contractId]);
  if (Number(existingPayments?.count || 0) === 0) {
    for (const payment of paymentScheduleFor(contract)) {
      run(database, `INSERT OR IGNORE INTO contract_payment_schedule (id, contract_id, installment_reference, amount_cents, due_at, status, payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [crypto.randomUUID(), contractId, payment.installment_reference, payment.amount_cents, payment.due_at, payment.status, json({ marker: CLIENT_CONTRACT_MARKER, payment_provider: "manual_or_configured_later" }), nowIso(), nowIso()]);
      counters.payments += 1;
    }
  }

  const asset = assetSnapshotFor(row);
  const assetResult = run(database, `INSERT OR IGNORE INTO client_assets (id, contract_id, asset_type, label, address, units_count, occupancy, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [crypto.randomUUID(), contractId, asset.asset_type, asset.label, asset.address, asset.units_count, asset.occupancy, json({ marker: CLIENT_CONTRACT_MARKER }), nowIso(), nowIso()]);
  if (Number(assetResult.meta?.changes || 0) > 0) counters.assets += 1;

  const welcome = first(database, "SELECT id FROM contract_service_requests WHERE contract_id = ? AND request_type = 'document' AND subject = 'Verification espace contrat'", [contractId]);
  if (!welcome) {
    run(database, `INSERT INTO contract_service_requests (id, contract_id, request_type, status, priority, subject, message, due_at, human_review_required, payload, created_at, updated_at)
      VALUES (?, ?, 'document', 'open', 'standard', 'Verification espace contrat', 'Verifier les documents contractuels disponibles, le prochain paiement et la date de renouvellement.', ?, 1, ?, ?, ?)`, [crypto.randomUUID(), contractId, requestDueAtFor("document"), json({ marker: CLIENT_CONTRACT_MARKER, source: "orchestrator" }), nowIso(), nowIso()]);
    counters.requests += 1;
  }

  return { contract_id: contractId, case_reference: row.case_reference, contract_reference: contract?.contract_reference || contractReferenceForCase(row, row), premium_cents: premium, renewal_at: renewalAt };
}

function buildSummary(database) {
  const base = first(database, `SELECT COUNT(*) AS contracts, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_contracts, COALESCE(SUM(annual_premium_cents), 0) AS annual_premium_cents FROM client_contracts`, []);
  const payments = first(database, `SELECT COUNT(*) AS payments, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid FROM contract_payment_schedule`, []);
  const requests = first(database, `SELECT COUNT(*) AS requests, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_requests FROM contract_service_requests`, []);
  const referrals = first(database, `SELECT COUNT(*) AS referrals, SUM(CASE WHEN status = 'draft_review' THEN 1 ELSE 0 END) AS review_referrals FROM contract_referrals`, []);
  return {
    ...base,
    annual_premium_label: `${Math.round(Number(base?.annual_premium_cents || 0) / 100)} EUR/an`,
    payments,
    requests,
    referrals
  };
}

function main() {
  const database = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  const counters = { scanned: 0, created: 0, updated: 0, documents: 0, payments: 0, assets: 0, requests: 0 };
  const wonCases = rows(database, `SELECT c.id AS case_id, c.case_reference, c.lead_id, c.estimated_value_min_cents, c.estimated_value_max_cents, c.client_portal_token, l.reference AS lead_reference, l.name, l.email, l.profile, l.property_type, l.city, l.units_count, l.need, l.message, l.status AS lead_status
    FROM brokerage_cases c JOIN leads l ON l.id = c.lead_id
    WHERE c.stage = 'contract_active' OR l.status = 'won'
    ORDER BY c.updated_at DESC LIMIT 200`, []);
  counters.scanned = wonCases.length;
  const touched = wonCases.map((row) => materializeContract(database, row, counters));
  const report = {
    generated_at: nowIso(),
    status: "passed",
    marker: CLIENT_CONTRACT_MARKER,
    counters,
    summary: buildSummary(database),
    touched_contracts: touched.slice(0, 40),
    safeguards: ["explicit-opt-in-cross-sell", "revocation-stored", "no-address-book-scraping", "client-token-portal", "human-review-contract-requests"]
  };
  writeJson(reportPath, report);
  writeJson(assetPath, report);
  database.close();
  console.log(`Client contract orchestrator: ${counters.scanned} won case(s), ${counters.created} contract(s), ${counters.payments} payment(s), ${counters.requests} request(s).`);
}

main();