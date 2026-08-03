const form = document.querySelector("#partner-token-form");
const tokenInput = document.querySelector("#partner-token");
const statusBox = document.querySelector("#partner-status");
const content = document.querySelector("#partner-content");
const docsBox = document.querySelector("#partner-documents");
const quoteForm = document.querySelector("#partner-quote-form");
const questionForm = document.querySelector("#partner-question-form");
const declineForm = document.querySelector("#partner-decline-form");

let activeToken = "";
let latestPayload = null;

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
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.get("token") || new URLSearchParams(window.location.search).get("token") || "";
}

function storedToken() {
  return tokenFromUrl() || sessionStorage.getItem("immeubleassur_partner_token") || "";
}

function saveToken(token) {
  if (token) sessionStorage.setItem("immeubleassur_partner_token", token);
}

function consultationLabel(status) {
  return ({ draft_review: "En preparation", approved: "Pret a envoyer", sent: "Envoyee", answered: "Question recue", quoted: "Offre recue", declined: "Declinee" })[status] || "En preparation";
}

function documentLabel(status) {
  return ({ requested: "Demandee", received: "Transmise", validated: "Validee", waived: "Non requise" })[status] || "A verifier";
}

function formatDate(value) {
  if (!value) return "echeance a confirmer";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "echeance a confirmer";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function renderDocuments(documents = []) {
  if (!docsBox) return;
  docsBox.replaceChildren();
  if (!documents.length) {
    docsBox.textContent = "Pieces en cours de verification par le courtier.";
    return;
  }
  for (const doc of documents) {
    const row = document.createElement("div");
    row.className = "portal-document-row";
    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = doc.label || doc.document_type || "Piece";
    const small = document.createElement("small");
    small.textContent = `${documentLabel(doc.status)}${doc.required ? " - requise" : ""}`;
    copy.append(strong, small);
    row.append(copy);
    docsBox.append(row);
  }
}

function render(payload) {
  latestPayload = payload;
  const consultation = payload.consultation || {};
  const risk = consultation.risk || {};
  text("[data-case-reference]", consultation.case_reference || "Dossier");
  text("[data-consultation-status]", `${consultation.insurer_name || "Assureur"} - ${consultationLabel(consultation.status)}`);
  text("[data-response-due]", `Reponse souhaitee: ${formatDate(consultation.response_due_at)}`);
  text("[data-risk-city]", risk.city || "Ville a confirmer");
  text("[data-risk-summary]", `${risk.property_type || "immeuble"} - ${risk.units_count || "?"} lot(s) - score dossier ${risk.readiness_score || 0}/100`);
  text("[data-risk-need]", risk.need || "assurance immeuble");
  text("[data-risk-context]", risk.context || "Contexte transmis par le courtier apres verification.");
  text("[data-documents-count]", `${(consultation.documents || []).length} piece(s)`);
  renderDocuments(consultation.documents || []);
  if (content) content.hidden = false;
}

async function load(token) {
  activeToken = token || storedToken();
  if (!activeToken) {
    setStatus("Jeton consultation requis.", "error");
    return;
  }
  if (tokenInput) tokenInput.value = activeToken;
  saveToken(activeToken);
  setStatus("Chargement consultation...");
  const response = await fetch("/api/partner/consultation", { headers: { Authorization: "Bearer " + activeToken } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Consultation introuvable");
  render(payload);
  setStatus("Consultation chargee.", "success");
}

async function submitPartnerAction(action, fields = {}) {
  if (!activeToken) activeToken = storedToken();
  if (!activeToken) return setStatus("Jeton consultation requis.", "error");
  setStatus("Transmission en cours...");
  const response = await fetch("/api/partner/consultation", {
    method: "POST",
    headers: { Authorization: "Bearer " + activeToken, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...fields })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Transmission impossible");
  await load(activeToken);
  setStatus(action === "quote" ? "Offre transmise au courtier." : action === "decline" ? "Refus transmis au courtier." : "Question transmise au courtier.", "success");
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  load(tokenInput?.value.trim() || "").catch((error) => setStatus(error.message || "Chargement impossible", "error"));
});

quoteForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(quoteForm);
  submitPartnerAction("quote", {
    premium_amount: data.get("premium_amount") || "",
    deductible: data.get("deductible") || "",
    notes: data.get("notes") || ""
  }).catch((error) => setStatus(error.message || "Offre impossible", "error"));
});

questionForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(questionForm);
  submitPartnerAction("question", { notes: data.get("notes") || "" }).catch((error) => setStatus(error.message || "Question impossible", "error"));
});

declineForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(declineForm);
  submitPartnerAction("decline", { notes: data.get("notes") || "" }).catch((error) => setStatus(error.message || "Refus impossible", "error"));
});

load(storedToken()).catch((error) => setStatus(error.message || "Consultation introuvable", "error"));