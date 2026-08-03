const form = document.querySelector("#portal-token-form");
const tokenInput = document.querySelector("#portal-token");
const statusBox = document.querySelector("#portal-status");
const content = document.querySelector("#portal-content");
const docsBox = document.querySelector("#portal-documents");
const consultationsBox = document.querySelector("#portal-consultations");

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

function saveToken(token) {
  if (token) sessionStorage.setItem("immeubleassur_case_token", token);
}

function storedToken() {
  return tokenFromUrl() || sessionStorage.getItem("immeubleassur_case_token") || "";
}

function statusLabel(status) {
  return ({ requested: "Demandee", received: "Transmise", validated: "Validee", waived: "Non requise" })[status] || "Demandee";
}

function consultationLabel(status) {
  return ({ draft_review: "En preparation", sent: "Envoyee", answered: "Reponse recue", quoted: "Offre recue", declined: "Refusee" })[status] || "En preparation";
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
    row.append(copy);
    if (!["received", "validated", "waived"].includes(doc.status)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary compact-action";
      button.dataset.documentType = doc.document_type;
      button.textContent = "Piece transmise";
      row.append(button);
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

function renderCase(payload) {
  const caseData = payload.case || {};
  const lead = caseData.lead || {};
  const documents = Array.isArray(caseData.documents) ? caseData.documents : [];
  const consultations = Array.isArray(caseData.consultations) ? caseData.consultations : [];
  text("[data-case-reference]", caseData.case_reference);
  text("[data-case-stage]", caseData.stage_label);
  text("[data-case-next-action]", caseData.next_action);
  text("[data-case-city]", lead.city || "Bien a confirmer");
  text("[data-case-need]", `${lead.need || "assurance immeuble"} - ${lead.property_type || "immeuble"}`);
  text("[data-documents-count]", `${documents.filter((doc) => ["received", "validated"].includes(doc.status)).length}/${documents.length}`);
  text("[data-consultations-count]", String(consultations.length));
  const progress = document.querySelector("[data-case-progress]");
  if (progress) progress.style.width = `${Math.max(4, Math.min(100, Number(caseData.readiness_score || 0)))}%`;
  renderDocuments(documents);
  renderConsultations(consultations);
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

async function markDocumentReceived(documentType, button) {
  const token = storedToken();
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = "Envoi...";
  try {
    const response = await fetch(`/api/client/case?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_type: documentType })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "Mise a jour impossible");
    await loadCase(token);
  } catch (error) {
    setStatus(error.message || "Mise a jour impossible", "error");
  } finally {
    button.disabled = false;
    button.textContent = previous;
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
  markDocumentReceived(button.dataset.documentType || "", button);
});

const initialToken = storedToken();
if (initialToken) loadCase(initialToken).catch((error) => setStatus(error.message || "Dossier introuvable", "error"));