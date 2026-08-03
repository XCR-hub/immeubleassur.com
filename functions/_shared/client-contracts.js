import { clean, nowIso, unitCount } from "./brokerage-cases.js";

export const CLIENT_CONTRACT_MARKER = "client-contract-workspace-v1";

export function contractReferenceForCase(caseRow = {}, lead = {}) {
  const base = clean(caseRow.case_reference || lead.reference || lead.id || crypto.randomUUID(), 80).replace(/[^A-Za-z0-9-]/g, "").slice(-14);
  return `CTR-${base || crypto.randomUUID().slice(0, 8)}`.toUpperCase();
}

export function referralCodeFor(caseRow = {}, lead = {}) {
  const base = clean(caseRow.case_reference || lead.reference || lead.id || "client", 80).replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase();
  return `IA-PAR-${base || crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export function annualPremiumCentsFor(caseRow = {}, lead = {}) {
  const min = Number(caseRow.estimated_value_min_cents || 0);
  const max = Number(caseRow.estimated_value_max_cents || 0);
  if (max > 0) return Math.round((Math.max(min, 0) + max) / 2);
  const units = Math.max(1, unitCount(lead.units_count));
  return Math.max(24000, units * 32000);
}

export function addDaysIso(days, from = new Date()) {
  return new Date(from.getTime() + Number(days || 0) * 86400000).toISOString();
}

export function renewalDateFor(from = new Date()) {
  return addDaysIso(335, from);
}

export function consentProfileFor(existing = {}) {
  return {
    marketing_automation: existing.marketing_automation === true,
    cross_sell: existing.cross_sell === true,
    navigation_study: existing.navigation_study === true,
    contact_import: false,
    updated_at: existing.updated_at || nowIso(),
    compliance: "explicit-opt-in-required; revocation-stored; no-address-book-scraping; first-party-only"
  };
}

export function consentTypeLabel(type) {
  return ({
    marketing_automation: "Emails de suivi et conseils personnalises",
    cross_sell: "Propositions partenaires et produits complementaires",
    navigation_study: "Analyse de navigation interne ImmeubleAssur uniquement",
    contact_import: "Import de contacts externes"
  })[type] || "Consentement";
}

export function normalizeConsentType(value) {
  const key = clean(value, 80).replace(/[^a-z0-9_:-]/gi, "").toLowerCase();
  if (["marketing_automation", "cross_sell", "navigation_study"].includes(key)) return key;
  return "";
}

export function applyConsent(profile = {}, type, granted) {
  const next = consentProfileFor(profile);
  const key = normalizeConsentType(type);
  if (!key) return next;
  next[key] = granted === true;
  next.updated_at = nowIso();
  return next;
}

export function contractDocumentsFor(lead = {}) {
  const docs = [
    ["policy_schedule", "Conditions particulieres du contrat", "to_upload", true],
    ["insurance_certificate", "Attestation d'assurance", "to_upload", true],
    ["premium_call", "Appel de prime ou echeancier", "to_upload", true],
    ["general_conditions", "Conditions generales", "to_upload", false],
    ["claims_contact_card", "Fiche contact sinistre", "available", false],
    ["asset_schedule", "Fiche parc et biens assures", "requested", true]
  ];
  if (["sci", "administrateur-biens"].includes(clean(lead.profile, 80))) docs.push(["portfolio_schedule", "Tableau portefeuille client", "requested", true]);
  if (["copropriete", "syndic-professionnel", "syndic-benevole"].includes(clean(lead.property_type, 80)) || clean(lead.profile, 80).includes("syndic")) docs.push(["coownership_certificate", "Attestation syndic ou copropriete", "to_upload", false]);
  return docs.map(([document_type, label, status, required]) => ({ document_type, label, status, required: required ? 1 : 0 }));
}

export function paymentScheduleFor(contract = {}) {
  const annual = Math.max(0, Number(contract.annual_premium_cents || 0));
  const frequency = clean(contract.premium_frequency, 40) || "annual";
  const count = frequency === "monthly" ? 12 : frequency === "quarterly" ? 4 : 1;
  const stepDays = frequency === "monthly" ? 30 : frequency === "quarterly" ? 90 : 365;
  const firstDue = contract.next_payment_due_at ? new Date(contract.next_payment_due_at) : new Date(Date.now() + 15 * 86400000);
  return Array.from({ length: count }, (_, index) => ({
    installment_reference: `${clean(contract.contract_reference || "CTR", 40)}-${String(index + 1).padStart(2, "0")}`,
    amount_cents: Math.round(annual / count),
    due_at: addDaysIso(index * stepDays, firstDue),
    status: "pending"
  }));
}

export function requestPriorityFor(type) {
  if (["claim", "payment_issue", "coverage_gap", "privacy_erasure", "privacy_revoke"].includes(clean(type, 80))) return "high";
  if (["endorsement", "renewal", "document", "privacy_access", "privacy_export", "privacy_rectification"].includes(clean(type, 80))) return "standard";
  return "low";
}

export function requestDueAtFor(type) {
  const priority = requestPriorityFor(type);
  return addDaysIso(priority === "high" ? 1 : priority === "standard" ? 3 : 7);
}

export function requestTypeLabel(type) {
  return ({
    document: "Document",
    endorsement: "Avenant / modification",
    renewal: "Renouvellement",
    payment_issue: "Paiement / prime",
    claim: "Sinistre",
    asset_update: "Parc immobilier",
    coverage_gap: "Garantie a verifier",
    referral: "Parrainage",
    privacy_access: "Droit d acces a mes donnees",
    privacy_export: "Exporter mes donnees",
    privacy_rectification: "Rectifier mes donnees",
    privacy_erasure: "Demander l effacement",
    privacy_revoke: "Revoquer mes acces et consentements"
  })[type] || "Demande client";
}

export function crossSellRecommendationsFor(lead = {}, consent = {}) {
  if (consent.cross_sell !== true) {
    return { enabled: false, reason: "cross_sell_disabled_until_explicit_opt_in", recommendations: [] };
  }
  const profile = clean(lead.profile, 80);
  const property = clean(lead.property_type, 80);
  const rows = [
    { key: "pno-cno", label: "PNO/CNO pour lots non occupants", reason: "utile si lots loues ou vacants" },
    { key: "protection-juridique", label: "Protection juridique immeuble", reason: "utile pour litiges locatifs ou voisinage" },
    { key: "dommages-ouvrage", label: "Dommages ouvrage travaux", reason: "utile si travaux votes ou a venir" }
  ];
  if (profile === "sci") rows.unshift({ key: "sci-portfolio", label: "Audit portefeuille SCI", reason: "coherence contrats, echeances et adresses" });
  if (property === "local-commercial") rows.unshift({ key: "local-commercial", label: "Garanties local commercial", reason: "activite, bail et responsabilites bailleur" });
  return { enabled: true, reason: "explicit-opt-in", recommendations: rows.slice(0, 4) };
}

export function assetSnapshotFor(lead = {}) {
  return {
    asset_type: clean(lead.property_type, 80) || "immeuble",
    label: `${clean(lead.property_type, 80) || "Immeuble"} - ${clean(lead.city, 120) || "ville a confirmer"}`,
    address: clean(lead.city, 180),
    units_count: clean(lead.units_count, 40),
    occupancy: clean(lead.need, 120) || "a confirmer"
  };
}