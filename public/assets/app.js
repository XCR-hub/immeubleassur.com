const form = document.querySelector("#lead-form");
const statusBox = document.querySelector(".form-status");

const requiredFields = ["name", "phone", "email", "profile", "property_type", "city"];

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `form-status ${type}`.trim();
}

function readForm(formElement) {
  const data = Object.fromEntries(new FormData(formElement).entries());
  return {
    name: String(data.name || "").trim(),
    phone: String(data.phone || "").trim(),
    email: String(data.email || "").trim().toLowerCase(),
    profile: String(data.profile || "").trim(),
    property_type: String(data.property_type || "").trim(),
    city: String(data.city || "").trim(),
    units_count: String(data.units_count || "").trim(),
    need: String(data.need || "multirisque-immeuble").trim(),
    message: String(data.message || "").trim(),
    consent: data.consent === "on",
    company_website: String(data.company_website || "").trim(),
    source: "website",
    page_url: window.location.href,
    referrer: document.referrer || ""
  };
}

function validate(payload) {
  const missing = requiredFields.filter((field) => !payload[field]);
  if (missing.length > 0) return "Merci de remplir les champs obligatoires.";
  if (!payload.email.includes("@") || payload.email.length < 6) return "Adresse email invalide.";
  if (payload.phone.replace(/\D/g, "").length < 9) return "Numero de telephone invalide.";
  if (!payload.consent) return "Merci de confirmer votre accord de contact.";
  return "";
}

function localBackup(payload, result) {
  const key = "immeubleassur_pending_leads";
  const rows = JSON.parse(localStorage.getItem(key) || "[]");
  rows.push({ payload, result, saved_at: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(rows.slice(-25)));
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = readForm(form);

  if (payload.company_website) {
    window.location.assign("/merci.html");
    return;
  }

  const validationError = validate(payload);
  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setStatus("Transmission du dossier en cours...");

  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Envoi impossible pour le moment.");
    }

    localBackup(payload, result);
    form.reset();
    setStatus(`Demande recue. Reference ${result.reference}. Un conseiller vous rappelle rapidement.`, "ok");
  } catch (error) {
    const fallbackReference = `LOCAL-${Date.now().toString(36).toUpperCase()}`;
    localBackup(payload, { success: false, reference: fallbackReference, error: error.message });
    setStatus(
      `Connexion API indisponible en local. Dossier sauvegarde dans ce navigateur (${fallbackReference}).`,
      "error"
    );
  } finally {
    submitButton.disabled = false;
  }
});
