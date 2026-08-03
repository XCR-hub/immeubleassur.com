const form = document.querySelector("#portal-token-form");
const tokenInput = document.querySelector("#portal-token");
const statusBox = document.querySelector("#portal-status");
const content = document.querySelector("#portal-content");
const docsBox = document.querySelector("#portal-documents");
const consultationsBox = document.querySelector("#portal-consultations");
const offersBox = document.querySelector("#portal-offers");
const contractsBox = document.querySelector("#portal-contracts");
const paymentsBox = document.querySelector("#portal-payments");
const requestsBox = document.querySelector("#portal-requests");
const consentsBox = document.querySelector("#portal-consents");
const referralsBox = document.querySelector("#portal-referrals");
const assetsBox = document.querySelector("#portal-assets");
const requestForm = document.querySelector("#portal-request-form");
const referralForm = document.querySelector("#portal-referral-form");
const assetForm = document.querySelector("#portal-asset-form");

let activeContractId = "";
let latestPayload = null;

const consentTypes = [
  ["marketing_automation", "Emails et relances utiles", "Relances dossier, echeances et conseils lies au contrat."],
  ["cross_sell", "Offres partenaires pertinentes", "Suggestions commerciales limitees aux produits utiles pour le profil immeuble."],
  ["navigation_study", "Navigation interne ImmeubleAssur", "Analyse des pages ImmeubleAssur consultees pour ameliorer le suivi."]
];

function setStatus(message, type = "") {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.className = `form-status ${type}`.trim();
}

function text(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value || "-";
}

function tokenFromUrl() {
  return new URLSearchParams(window.location.search).get("token") || "";
}

function documentDownloadUrl(documentId) {
  const token = tokenInput?.value.trim() || tokenFromUrl() || sessionStorage.getItem("immeubleassur_case_token") || "";
  return `/api/client/case?action=download_document&token=${encodeURIComponent(token)}&document_id=${encodeURIComponent(documentId || "")}`;
}

function saveToken(token) {
  if (token) sessionStorage.setItem("immeubleassur_case_token", token);
}

function storedToken() {
  return tokenFromUrl() || sessionStorage.getItem("immeubleassur_case_token") || "";
}

function statusLabel(status) {
  return ({ requested: "Demandee", received: "Transmise", validated: "Validee", waived: "Non requise", to_upload: "A transmettre", available: "Disponible" })[status] || "Demandee";
}

function consultationLabel(status) {
  return ({ draft_review: "En preparation", sent: "Envoyee", answered: "Reponse recue", quoted: "Offre recue", declined: "Refusee" })[status] || "En preparation";
}

function offerLabel(status) {
  return ({ presented: "A accepter", accepted: "Acceptee", declined: "Declinee" })[status] || "A verifier";
}

function paymentLabel(status) {
  return ({ pending: "A regler", paid: "Reglee", failed: "Incident", waived: "Annulee" })[status] || "A regler";
}

function requestLabel(status) {
  return ({ open: "Ouverte", in_progress: "En cours", resolved: "Resolue", closed: "Fermee" })[status] || "Ouverte";
}

function formatDate(value) {
  if (!value) return "a confirmer";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "a confirmer";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function clearWithEmpty(node, message) {
  if (!node) return false;
  node.replaceChildren();
  if (!message) return false;
  const empty = document.createElement("p");
  empty.className = "portal-empty";
  empty.textContent = message;
  node.append(empty);
  return true;
}

function smallText(value) {
  const small = document.createElement("small");
  small.textContent = value || "-";
  return small;
}

function allContracts(payload = latestPayload) {
  const contracts = payload?.case?.contracts;
  return Array.isArray(contracts) ? contracts : [];
}

function currentContract() {
  const contracts = allContracts();
  if (!contracts.length) return null;
  const selected = contracts.find((contract) => contract.id === activeContractId) || contracts[0];
  activeContractId = selected.id;
  return selected;
}

function rowsAcrossContracts(key) {
  return allContracts().flatMap((contract) => (Array.isArray(contract[key]) ? contract[key].map((item) => ({ ...item, contract })) : []));
}

function renderDocuments(documents = []) {
  if (!docsBox) return;
  docsBox.replaceChildren();
  if (!documents.length) {
    docsBox.textContent = "Aucune piece demandee.";
    return;
  }
  for (const doc of documents) {
    const row = document.createElement("div");
    row.className = "portal-document-row";
    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = doc.label || doc.document_type || "Piece";
    const small = document.createElement("small");
    small.textContent = `${statusLabel(doc.status)}${doc.required ? " - requise" : ""}`;
    copy.append(strong, small);
    if (doc.attachment?.file_name) {
      const link = document.createElement("a");
      link.href = documentDownloadUrl(doc.id);
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Telecharger";
      row.append(link);
    }
    row.append(copy);

    if (!["received", "validated", "waived"].includes(doc.status)) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
      input.className = "portal-document-input";
      input.dataset.documentInput = doc.document_type;
      input.setAttribute("aria-label", `Joindre ${doc.label || "la piece"}`);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary compact-action";
      button.dataset.documentType = doc.document_type;
      button.dataset.documentUpload = "true";
      button.textContent = "Transmettre";
      row.append(input, button);
    }
    docsBox.append(row);
  }
}

function renderConsultations(consultations = []) {
  if (!consultationsBox) return;
  consultationsBox.replaceChildren();
  if (!consultations.length) {
    consultationsBox.textContent = "Consultation en preparation.";
    return;
  }
  for (const item of consultations) {
    const row = document.createElement("div");
    row.className = "portal-consultation-row";
    const strong = document.createElement("strong");
    strong.textContent = item.insurer_name || "Assureur";
    const small = document.createElement("small");
    small.textContent = consultationLabel(item.status);
    row.append(strong, small);
    consultationsBox.append(row);
  }
}

function renderOffers(offers = []) {
  if (!offersBox) return;
  offersBox.replaceChildren();
  if (!offers.length) {
    clearWithEmpty(offersBox, "Aucune offre publiee pour le moment.");
    return;
  }
  for (const offer of offers) {
    const row = document.createElement("div");
    row.className = "portal-offer-row";
    if (offer.status === "accepted") row.classList.add("is-accepted");
    row.dataset.offerId = offer.id;

    const heading = document.createElement("div");
    heading.className = "portal-row-heading";
    const strong = document.createElement("strong");
    strong.textContent = offer.insurer_name || "Assureur";
    const badge = document.createElement("span");
    badge.className = "portal-badge";
    badge.textContent = offerLabel(offer.status);
    heading.append(strong, badge);

    const meta = document.createElement("div");
    meta.className = "portal-offer-meta";
    for (const value of [offer.premium_label, `Franchise ${offer.deductible_label || "a confirmer"}`, `Valable jusqu'au ${formatDate(offer.validity_until)}`]) {
      const chip = document.createElement("span");
      chip.textContent = value;
      meta.append(chip);
    }

    const recommendation = document.createElement("p");
    recommendation.textContent = offer.recommendation || "Proposition en cours de validation.";
    row.append(heading, meta, recommendation);
    if (offer.coverage_summary) row.append(smallText(offer.coverage_summary));
    if (offer.exclusions_summary) row.append(smallText(offer.exclusions_summary));

    if (offer.status === "presented") {
      const proof = document.createElement("label");
      proof.className = "portal-offer-proof";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "explicit_acceptance";
      const proofText = document.createElement("span");
      proofText.textContent = "J'accepte explicitement cette proposition et la creation du contrat correspondant apres verification finale du courtier.";
      proof.append(checkbox, proofText);
      const actions = document.createElement("div");
      actions.className = "portal-offer-actions";
      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = "submit-button compact-action";
      accept.dataset.offerDecision = "accepted";
      accept.textContent = "Accepter offre";
      const decline = document.createElement("button");
      decline.type = "button";
      decline.className = "button secondary compact-action";
      decline.dataset.offerDecision = "declined";
      decline.textContent = "Decliner";
      actions.append(accept, decline);
      row.append(proof, actions);
    }
    offersBox.append(row);
  }
}

function renderContractDocuments(container, documents = []) {
  if (!documents.length) return;
  const list = document.createElement("div");
  list.className = "portal-contract-docs";
  for (const doc of documents.slice(0, 6)) {
    const row = document.createElement("div");
    row.className = "portal-contract-doc-row";
    const strong = document.createElement("strong");
    strong.textContent = doc.label || "Document";
    const small = smallText(statusLabel(doc.status));
    row.append(strong, small);
    if (doc.file_url) {
      const link = document.createElement("a");
      link.href = doc.file_url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Voir";
      row.append(link);
    }
    list.append(row);
  }
  container.append(list);
}

function renderContracts(contracts = []) {
  if (!contractsBox) return;
  contractsBox.replaceChildren();
  if (!contracts.length) {
    clearWithEmpty(contractsBox, "Le contrat apparaitra ici apres validation courtage.");
    activeContractId = "";
    return;
  }
  if (!contracts.some((contract) => contract.id === activeContractId)) activeContractId = contracts[0].id;
  for (const contract of contracts) {
    const row = document.createElement("div");
    row.className = "portal-contract-row";
    if (contract.id === activeContractId) row.classList.add("is-active");
    row.tabIndex = 0;
    row.dataset.contractId = contract.id;

    const heading = document.createElement("div");
    heading.className = "portal-row-heading";
    const strong = document.createElement("strong");
    strong.textContent = contract.contract_reference || "Contrat";
    const badge = document.createElement("span");
    badge.className = "portal-badge";
    badge.textContent = contract.status || "actif";
    heading.append(strong, badge);

    const meta = smallText(`${contract.insurer_name || "Assureur a confirmer"} - ${contract.annual_premium_label || "prime a confirmer"}`);
    const renewal = smallText(`Prochaine prime ${formatDate(contract.next_payment_due_at)} - renouvellement ${formatDate(contract.renewal_at)}`);
    row.append(heading, meta, renewal);

    if (contract.cross_sell?.enabled && Array.isArray(contract.cross_sell.recommendations) && contract.cross_sell.recommendations.length) {
      const recos = document.createElement("div");
      recos.className = "portal-recommendations";
      for (const reco of contract.cross_sell.recommendations.slice(0, 3)) {
        const chip = document.createElement("span");
        chip.textContent = reco.label;
        recos.append(chip);
      }
      row.append(recos);
    } else {
      row.append(smallText("Offres complementaires bloquees tant que le consentement n'est pas donne."));
    }

    renderContractDocuments(row, contract.documents || []);
    contractsBox.append(row);
  }
}

function renderPayments() {
  if (!paymentsBox) return;
  const payments = rowsAcrossContracts("payments");
  paymentsBox.replaceChildren();
  if (!payments.length) {
    clearWithEmpty(paymentsBox, "Aucune echeance disponible.");
    return;
  }
  for (const item of payments.slice(0, 12)) {
    const row = document.createElement("div");
    row.className = "portal-payment-row";
    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = item.amount_label || "Prime";
    const small = smallText(`${paymentLabel(item.status)} - echeance ${formatDate(item.due_at)}`);
    copy.append(strong, small);
    row.append(copy);

    if (item.payment_url) {
      const link = document.createElement("a");
      link.className = "button secondary compact-action";
      link.href = item.payment_url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Payer";
      row.append(link);
    } else if (item.status === "pending") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary compact-action";
      button.dataset.paymentLink = item.contract.id;
      button.textContent = "Lien paiement";
      row.append(button);
    }
    paymentsBox.append(row);
  }
}

function renderRequests() {
  if (!requestsBox) return;
  const requests = rowsAcrossContracts("requests");
  requestsBox.replaceChildren();
  if (!requests.length) {
    clearWithEmpty(requestsBox, "Aucune demande ouverte.");
    return;
  }
  for (const item of requests.slice(0, 12)) {
    const row = document.createElement("div");
    row.className = "portal-request-row";
    const strong = document.createElement("strong");
    strong.textContent = item.subject || item.label || "Demande";
    const small = smallText(`${item.label || "Demande"} - ${requestLabel(item.status)} - ${item.priority || "standard"}`);
    row.append(strong, small);
    requestsBox.append(row);
  }
}

function renderConsentReceipt(receipt = {}) {
  const box = document.createElement("div");
  box.className = "portal-consent-receipt";
  const latest = receipt.latest_event;
  const lines = [
    receipt.scope,
    receipt.legal_basis,
    receipt.revocation_available ? "Revocation disponible depuis cet espace client." : "Revocation sur demande.",
    latest ? `Dernier evenement: ${latest.status || "trace"} le ${formatDate(latest.created_at)}` : "Aucun accord actif trace pour cette finalite.",
    latest?.proof_text ? `Preuve: ${latest.proof_text}` : ""
  ].filter(Boolean);
  for (const line of lines) box.append(smallText(line));
  return box;
}

function renderConsents() {
  if (!consentsBox) return;
  const contract = currentContract();
  consentsBox.replaceChildren();
  if (!contract) {
    clearWithEmpty(consentsBox, "Consentements disponibles apres creation du contrat.");
    return;
  }
  const receipts = Array.isArray(contract.consent_receipts) ? contract.consent_receipts : [];
  for (const [type, label, detail] of consentTypes) {
    const granted = contract.consent?.[type] === true;
    const row = document.createElement("div");
    row.className = "portal-consent-row";
    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = label;
    const small = smallText(`${granted ? "Accepte" : "Refuse"} - ${detail}`);
    copy.append(strong, small);
    const button = document.createElement("button");
    button.type = "button";
    button.className = granted ? "button secondary compact-action" : "submit-button compact-action";
    button.dataset.consentType = type;
    button.dataset.granted = granted ? "false" : "true";
    button.textContent = granted ? "Revoquer" : "Accepter";
    row.append(copy, button);
    const receipt = receipts.find((item) => item.consent_type === type);
    if (receipt) row.append(renderConsentReceipt(receipt));
    consentsBox.append(row);
  }
}

function renderReferrals() {
  if (!referralsBox) return;
  const contract = currentContract();
  text("[data-referral-code]", contract?.referral_code || "-");
  referralsBox.replaceChildren();
  if (!contract) {
    clearWithEmpty(referralsBox, "Parrainage disponible apres creation du contrat.");
    return;
  }
  const referrals = Array.isArray(contract.referrals) ? contract.referrals : [];
  if (!referrals.length) {
    clearWithEmpty(referralsBox, "Aucun parrainage transmis.");
    return;
  }
  for (const item of referrals) {
    const row = document.createElement("div");
    row.className = "portal-referral-row";
    const strong = document.createElement("strong");
    strong.textContent = item.reward_label || "Avantage parrainage";
    const small = smallText(`${item.status || "en revue"} - ${formatDate(item.created_at)}`);
    row.append(strong, small);
    referralsBox.append(row);
  }
}

function renderAssets() {
  if (!assetsBox) return;
  const assets = rowsAcrossContracts("assets");
  assetsBox.replaceChildren();
  if (!assets.length) {
    clearWithEmpty(assetsBox, "Aucun bien rattache au contrat.");
    return;
  }
  for (const item of assets) {
    const row = document.createElement("div");
    row.className = "portal-asset-row";
    const strong = document.createElement("strong");
    strong.textContent = item.label || "Bien";
    const small = smallText(`${item.address || "adresse a confirmer"} - ${item.units_count || "lots a confirmer"}`);
    row.append(strong, small);
    assetsBox.append(row);
  }
}

function renderCase(payload) {
  latestPayload = payload;
  const caseData = payload.case || {};
  const lead = caseData.lead || {};
  const documents = Array.isArray(caseData.documents) ? caseData.documents : [];
  const consultations = Array.isArray(caseData.consultations) ? caseData.consultations : [];
  const offers = Array.isArray(caseData.client_offers) ? caseData.client_offers : [];
  const contracts = Array.isArray(caseData.contracts) ? caseData.contracts : [];
  const payments = contracts.flatMap((contract) => Array.isArray(contract.payments) ? contract.payments : []);
  const requests = contracts.flatMap((contract) => Array.isArray(contract.requests) ? contract.requests : []);
  const assets = contracts.flatMap((contract) => Array.isArray(contract.assets) ? contract.assets : []);
  text("[data-case-reference]", caseData.case_reference);
  text("[data-case-stage]", caseData.stage_label);
  text("[data-case-next-action]", caseData.next_action);
  text("[data-case-city]", lead.city || "Bien a confirmer");
  text("[data-case-need]", `${lead.need || "assurance immeuble"} - ${lead.property_type || "immeuble"}`);
  text("[data-documents-count]", `${documents.filter((doc) => ["received", "validated"].includes(doc.status)).length}/${documents.length}`);
  text("[data-consultations-count]", String(consultations.length));
  text("[data-offers-count]", offers.length ? String(offers.length) : "0");
  text("[data-contracts-count]", contracts.length ? String(contracts.length) : "0");
  text("[data-payments-count]", payments.length ? String(payments.filter((payment) => payment.status === "pending").length) : "0");
  text("[data-requests-count]", requests.length ? String(requests.filter((request) => request.status === "open").length) : "0");
  text("[data-assets-count]", String(assets.length));
  const progress = document.querySelector("[data-case-progress]");
  if (progress) progress.style.width = `${Math.max(4, Math.min(100, Number(caseData.readiness_score || 0)))}%`;
  renderDocuments(documents);
  renderConsultations(consultations);
  renderOffers(offers);
  renderContracts(contracts);
  renderPayments();
  renderRequests();
  renderConsents();
  renderReferrals();
  renderAssets();
  if (content) content.hidden = false;
}

async function loadCase(token) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) {
    setStatus("Jeton dossier requis.", "error");
    return;
  }
  saveToken(cleanToken);
  if (tokenInput) tokenInput.value = cleanToken;
  setStatus("Chargement du dossier...");
  const response = await fetch(`/api/client/case?token=${encodeURIComponent(cleanToken)}`);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "Dossier introuvable");
  renderCase(result);
  setStatus("Dossier charge.", "success");
}

async function postPortalAction(action, body = {}, button = null) {
  const token = storedToken();
  if (!token) throw new Error("Jeton dossier requis.");
  const previous = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = "Envoi...";
  }
  try {
    const response = await fetch(`/api/client/case?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "Mise a jour impossible");
    await loadCase(token);
    return result;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previous;
    }
  }
}

async function uploadDocument(documentType, button) {
  const input = docsBox?.querySelector(`[data-document-input="${CSS.escape(documentType)}"]`);
  const file = input?.files?.[0];
  if (!file) return markDocumentReceived(documentType, button);
  if (file.size > 6 * 1024 * 1024) throw new Error("Fichier trop volumineux (6 Mo maximum). ");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  await postPortalAction("case_document_upload", { document_type: documentType, file_name: file.name, mime_type: file.type, content_base64: btoa(binary) }, button);
  setStatus("Piece recue. Elle sera controlee par un collaborateur avant tout envoi.", "success");
}
async function markDocumentReceived(documentType, button) {
  try {
    await postPortalAction("case_document_received", { document_type: documentType }, button);
  } catch (error) {
    setStatus(error.message || "Mise a jour impossible", "error");
  }
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadCase(tokenInput?.value || "").catch((error) => setStatus(error.message || "Dossier introuvable", "error"));
});

docsBox?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("[data-document-type]");
  if (!button) return;
  const action = button.dataset.documentUpload === "true" ? uploadDocument : markDocumentReceived;
  action(button.dataset.documentType || "", button).catch((error) => setStatus(error.message || "Transmission impossible", "error"));
});

offersBox?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("[data-offer-decision]");
  const row = target.closest("[data-offer-id]");
  if (!button || !row) return;
  const decision = button.dataset.offerDecision || "";
  const explicit = Boolean(row.querySelector('input[name="explicit_acceptance"]')?.checked);
  postPortalAction("offer_decision", {
    offer_id: row.dataset.offerId,
    decision,
    explicit_acceptance: decision === "accepted" ? explicit : false,
    proof_text: decision === "accepted" ? "Acceptation explicite depuis l'espace client ImmeubleAssur" : "Offre declinee depuis l'espace client ImmeubleAssur"
  }, button)
    .then(() => setStatus(decision === "accepted" ? "Offre acceptee. Creation du contrat en revue." : "Offre declinee.", "success"))
    .catch((error) => setStatus(error.message || "Decision offre impossible", "error"));
});

contractsBox?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const row = target.closest("[data-contract-id]");
  if (!row) return;
  activeContractId = row.dataset.contractId || "";
  renderCase(latestPayload || {});
});

paymentsBox?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("[data-payment-link]");
  if (!button) return;
  postPortalAction("payment_link_request", { contract_id: button.dataset.paymentLink }, button)
    .then(() => setStatus("Demande de lien de paiement transmise.", "success"))
    .catch((error) => setStatus(error.message || "Demande impossible", "error"));
});

consentsBox?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("[data-consent-type]");
  const contract = currentContract();
  if (!button || !contract) return;
  const grant = button.dataset.granted === "true";
  postPortalAction("contract_consent", {
    contract_id: contract.id,
    consent_type: button.dataset.consentType,
    granted: grant,
    explicit_acceptance: grant,
    proof_text: grant ? "Acceptation explicite depuis l'espace client ImmeubleAssur" : "Revocation depuis l'espace client ImmeubleAssur"
  }, button)
    .then(() => setStatus(grant ? "Consentement enregistre." : "Consentement revoque.", "success"))
    .catch((error) => setStatus(error.message || "Consentement impossible", "error"));
});

requestForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const contract = currentContract();
  if (!contract) {
    setStatus("Contrat introuvable.", "error");
    return;
  }
  const data = new FormData(requestForm);
  postPortalAction("contract_request", {
    contract_id: contract.id,
    request_type: String(data.get("request_type") || "document"),
    subject: String(data.get("subject") || "")
  }, requestForm.querySelector("button"))
    .then(() => {
      requestForm.reset();
      setStatus("Demande transmise.", "success");
    })
    .catch((error) => setStatus(error.message || "Demande impossible", "error"));
});

referralForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const contract = currentContract();
  if (!contract) {
    setStatus("Contrat introuvable.", "error");
    return;
  }
  const data = new FormData(referralForm);
  postPortalAction("contract_referral", {
    contract_id: contract.id,
    filleul_name: String(data.get("filleul_name") || ""),
    filleul_email: String(data.get("filleul_email") || ""),
    filleul_phone: String(data.get("filleul_phone") || ""),
    explicit_permission: data.get("explicit_permission") === "on"
  }, referralForm.querySelector("button"))
    .then(() => {
      referralForm.reset();
      setStatus("Parrainage transmis pour revue.", "success");
    })
    .catch((error) => setStatus(error.message || "Parrainage impossible", "error"));
});

assetForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const contract = currentContract();
  if (!contract) {
    setStatus("Contrat introuvable.", "error");
    return;
  }
  const data = new FormData(assetForm);
  postPortalAction("asset_update", {
    contract_id: contract.id,
    label: String(data.get("label") || ""),
    units_count: String(data.get("units_count") || ""),
    address: String(data.get("address") || ""),
    occupancy: String(data.get("occupancy") || "")
  }, assetForm.querySelector("button"))
    .then(() => {
      assetForm.reset();
      setStatus("Parc mis a jour.", "success");
    })
    .catch((error) => setStatus(error.message || "Mise a jour impossible", "error"));
});

const initialToken = storedToken();
if (initialToken) loadCase(initialToken).catch((error) => setStatus(error.message || "Dossier introuvable", "error"));