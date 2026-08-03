export const BROKERAGE_CASE_MARKER = "brokerage-case-orchestrator-v1";

export function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

export function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function unitCount(value) {
  return Number.parseInt(String(value || "0").replace(/\D/g, ""), 10) || 0;
}

export function nowIso() {
  return new Date().toISOString();
}

export function addHoursIso(hours, from = new Date()) {
  return new Date(from.getTime() + Number(hours || 0) * 3600000).toISOString();
}

export function caseReferenceForLead(lead = {}) {
  const base = clean(lead.reference || lead.id || crypto.randomUUID(), 80).replace(/[^A-Za-z0-9-]/g, "").slice(-14);
  return `DOS-${base || crypto.randomUUID().slice(0, 8)}`.toUpperCase();
}

export function portalToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function portalUrl(token, origin = "https://immeubleassur.com") {
  const root = clean(origin, 240).replace(/\/+$/, "") || "https://immeubleassur.com";
  return `${root}/espace-client.html?token=${encodeURIComponent(clean(token, 120))}`;
}

export function insurerPortalToken() {
  return `ins-${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function insurerPortalUrl(token, origin = "https://immeubleassur.com") {
  const root = clean(origin, 240).replace(/\/+$/, "") || "https://immeubleassur.com";
  return `${root}/espace-assureur.html?token=${encodeURIComponent(clean(token, 160))}`;
}

export function leadValueEstimate(lead, score = 0) {
  const units = Math.max(1, unitCount(lead.units_count));
  const need = clean(lead.need, 80);
  const profile = clean(lead.profile, 80);
  const propertyType = clean(lead.property_type, 80);
  let base = 260;
  if (["multirisque-immeuble", "copropriete", "audit-contrat"].includes(need)) base = 520;
  if (["rc-syndic", "dommages-ouvrage"].includes(need)) base = 620;
  if (["pno", "cno", "pno-cno"].includes(need) || ["lot-copropriete", "logement-vacant", "logement-loue"].includes(propertyType)) base = units <= 2 ? 190 : 260;
  if (["local-commercial", "commerce", "mixte"].includes(propertyType)) base += 180;
  if (["sci", "administrateur-biens", "syndic-professionnel"].includes(profile)) base += 160;
  const min = Math.round(Math.max(180, base + Math.max(0, units - 1) * 135));
  const max = Math.round(min * (score >= 85 ? 1.75 : score >= 70 ? 1.55 : 1.35));
  const band = max >= 9000 ? "portfolio" : max >= 3500 ? "immeuble-prioritaire" : max >= 1200 ? "immeuble-standard" : "lot-pno-cno";
  return { annual_premium_min: min, annual_premium_max: max, band, label: `${min}-${max} EUR/an` };
}

export function urgencyForLead(lead = {}) {
  const text = `${lead.message || ""} ${lead.need || ""} ${lead.property_type || ""} ${lead.source || ""} ${lead.page_url || ""}`.toLowerCase();
  const units = unitCount(lead.units_count);
  if (/sinistre|degat|resili|refus|mise en demeure|sans assurance|urgent|aujourd|demain|echeance proche/.test(text)) {
    return { level: "immediate", label: "Urgence immediate", sla_hours: 2, reason: "sinistre/resiliation/echeance" };
  }
  if (/echeance|preavis|travaux|chantier|ravalement|toiture|dommages-ouvrage|local-commercial/.test(text) || units >= 10) {
    return { level: "this-month", label: "A traiter ce mois-ci", sla_hours: 6, reason: "echeance/travaux/immeuble multi-lots" };
  }
  if (/prix|tarif|comparateur|devis|audit|veille/.test(text)) {
    return { level: "quote-ready", label: "Devis a cadrer", sla_hours: 24, reason: "comparaison/prix/audit" };
  }
  return { level: "standard", label: "Qualification standard", sla_hours: 48, reason: "information minimale" };
}

export function documentChecklistFor(lead = {}) {
  const need = clean(lead.need, 80);
  const profile = clean(lead.profile, 80);
  const propertyType = clean(lead.property_type, 80);
  const docs = [
    ["current_contract", "Contrat ou appel de prime actuel", true],
    ["claims_history", "Releve de sinistres 36 mois", true],
    ["building_profile", "Adresse, surface, lots, usage et annee de construction", true],
    ["due_date", "Echeance, preavis et assureur actuel", true]
  ];
  if (["copropriete", "rc-syndic"].includes(need) || ["syndic-professionnel", "syndic-benevole", "conseil-syndical"].includes(profile) || propertyType === "copropriete") {
    docs.push(["coownership_minutes", "PV d'AG, budget et informations syndic", true]);
    docs.push(["coownership_lots", "Nombre de lots principaux et annexes", true]);
  }
  if (["pno", "cno", "pno-cno"].includes(need) || propertyType === "lot-copropriete") {
    docs.push(["lease_or_occupancy", "Bail, occupation, vacance ou usage du lot", true]);
    docs.push(["tenant_insurance", "Attestation occupant ou contrat immeuble", false]);
  }
  if (profile === "sci" || profile === "administrateur-biens") {
    docs.push(["portfolio_schedule", "Liste des biens, lots, echeances et contrats du portefeuille", true]);
  }
  if (/travaux|chantier|ravalement|toiture|renovation|dommages-ouvrage/i.test(`${lead.message || ""} ${need} ${propertyType}`)) {
    docs.push(["works_scope", "Devis travaux, planning, entreprises et garanties chantier", true]);
  }
  if (/sinistre|degat|refus|resili/i.test(`${lead.message || ""} ${need}`)) {
    docs.push(["remediation_evidence", "Chronologie sinistre, photos, courriers et mesures correctives", true]);
  }
  const unique = new Map();
  for (const [type, label, required] of docs) unique.set(type, { document_type: type, label, required: required ? 1 : 0 });
  return [...unique.values()];
}

export function readinessScoreFor(lead = {}, documents = []) {
  const text = clean(lead.message, 3000).toLowerCase();
  let score = 20;
  const signals = [];
  const expected = documentChecklistFor(lead);
  const byType = new Map((documents || []).map((doc) => [clean(doc.document_type, 120), doc]));
  for (const doc of expected) {
    const stored = byType.get(doc.document_type);
    const label = doc.label.toLowerCase();
    const received = stored && ["received", "validated"].includes(clean(stored.status, 40));
    const mentioned = label.split(/[, ]+/).some((word) => word.length > 5 && text.includes(word));
    if (received) {
      score += doc.required ? 12 : 7;
      signals.push(`${doc.label}: recu`);
    } else if (mentioned || text.includes(doc.document_type.replace(/_/g, " "))) {
      score += doc.required ? 7 : 4;
      signals.push(`${doc.label}: mentionne`);
    }
  }
  if (clean(lead.email, 180)) score += 5;
  if (clean(lead.phone, 80)) score += 5;
  if (unitCount(lead.units_count) > 0) score += 6;
  if (clean(lead.city, 120)) score += 4;
  return { score: Math.min(100, score), expected_documents: expected.length, signals: signals.slice(0, 8) };
}

export function stageForCase(lead = {}, readiness = {}, consultations = []) {
  const status = clean(lead.status, 40);
  const sent = consultations.filter((item) => ["sent", "answered", "quoted", "declined"].includes(clean(item.status, 40))).length;
  const quoted = consultations.filter((item) => ["answered", "quoted"].includes(clean(item.status, 40))).length;
  if (status === "won") return "contract_active";
  if (status === "lost") return "lost";
  if (quoted > 0 || status === "quoted") return "offer_followup";
  if (sent > 0) return "insurer_consultation";
  if (Number(readiness.score || 0) >= 70) return "ready_for_market";
  if (status === "contacted") return "document_collection";
  return "qualification";
}

export function stageLabel(stage) {
  return ({
    qualification: "Qualification",
    document_collection: "Pieces client",
    ready_for_market: "Pret assureurs",
    insurer_consultation: "Consultation assureurs",
    offer_followup: "Offres a suivre",
    contract_active: "Contrat actif",
    lost: "Perdu"
  })[stage] || "Qualification";
}

export function nextActionForCase(lead = {}, readiness = {}, stage = "qualification") {
  if (stage === "contract_active") return "Basculer le client dans l'espace contrat: prime, documents, avenants et demandes.";
  if (stage === "offer_followup") return "Comparer les retours assureurs, confirmer franchises/exclusions, puis proposer l'offre la plus adaptee.";
  if (stage === "insurer_consultation") return "Relancer les assureurs sans reenvoyer le dossier si aucune reponse dans 48h.";
  if (stage === "ready_for_market") return "Validation humaine: relire le dossier, choisir les assureurs et approuver l'email de consultation.";
  if (stage === "document_collection") return "Relancer le client sur les pieces manquantes avec le lien d'espace client.";
  const urgency = urgencyForLead(lead);
  if (urgency.level === "immediate") return "Rappeler avant toute automatisation et verifier la couverture actuelle.";
  return "Qualifier au telephone puis demander les pieces prioritaires.";
}

export function buildClientEmailDraft(lead = {}, caseRow = {}, documents = [], origin = "https://immeubleassur.com") {
  const pending = documents.filter((doc) => !["received", "validated"].includes(clean(doc.status, 40))).slice(0, 8);
  const token = clean(caseRow.client_portal_token, 140);
  return {
    subject: `Votre dossier ImmeubleAssur ${clean(caseRow.case_reference || lead.reference, 80)}`,
    body: [
      `Bonjour ${clean(lead.name, 80) || ""},`,
      "",
      "Nous preparons votre dossier assurance immeuble afin de consulter les assureurs avec des informations exploitables.",
      pending.length ? "Pieces prioritaires a fournir:" : "Les pieces principales sont indiquees comme disponibles. Nous verifions le dossier avant consultation.",
      ...pending.map((doc) => `- ${doc.label}`),
      "",
      token ? `Suivi du dossier: ${portalUrl(token, origin)}` : "Votre lien de suivi sera transmis apres validation interne.",
      "",
      "Aucune consultation assureur ne part sans controle humain du dossier.",
      "",
      "Bien cordialement,",
      "L'equipe ImmeubleAssur"
    ].join("\n")
  };
}

export function buildInsurerEmailDraft(lead = {}, caseRow = {}, documents = []) {
  const received = documents.filter((doc) => ["received", "validated"].includes(clean(doc.status, 40))).map((doc) => doc.label);
  const missing = documents.filter((doc) => !["received", "validated"].includes(clean(doc.status, 40))).map((doc) => doc.label);
  return {
    subject: `Consultation assurance immeuble - ${clean(lead.city, 120) || "France"} - ${clean(caseRow.case_reference || lead.reference, 80)}`,
    body: [
      "Bonjour,",
      "",
      "Merci d'etudier ce risque immeuble sous reserve de validation humaine finale du courtier.",
      `Reference dossier: ${clean(caseRow.case_reference || lead.reference, 80)}`,
      `Profil: ${clean(lead.profile, 120) || "non precise"}`,
      `Besoin: ${clean(lead.need, 120) || "assurance immeuble"}`,
      `Bien: ${clean(lead.property_type, 120) || "immeuble"} - ${clean(lead.city, 120) || "ville a confirmer"}`,
      `Lots: ${clean(lead.units_count, 40) || "a confirmer"}`,
      "",
      received.length ? `Pieces disponibles: ${received.join("; ")}.` : "Pieces disponibles: a confirmer apres retour client.",
      missing.length ? `Pieces encore attendues: ${missing.slice(0, 6).join("; ")}.` : "Pieces obligatoires: indiquees completes.",
      "",
      clean(lead.message, 1200) ? `Contexte client: ${clean(lead.message, 1200)}` : "Contexte client: a completer apres rappel.",
      "",
      "Merci d'indiquer appetit, garanties, franchises, exclusions, prime indicative et pieces complementaires necessaires.",
      "",
      "Bien cordialement,",
      "ImmeubleAssur"
    ].join("\n")
  };
}

export function consentSnapshotFor(lead = {}) {
  return {
    source: clean(lead.source, 120) || "website",
    page_url: clean(lead.page_url, 500),
    consent_basis: "Demande entrante: recontact, analyse du dossier et consultation assureur sous controle humain.",
    marketing_automation: "disabled_until_explicit_opt_in",
    cross_sell: "disabled_until_explicit_opt_in",
    generated_at: nowIso()
  };
}