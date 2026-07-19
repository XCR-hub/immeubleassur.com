const form = document.querySelector("#lead-form");
const statusBox = document.querySelector(".form-status");

const requiredFields = ["name", "phone", "email", "profile", "property_type", "city"];
const sessionKey = "immeubleassur_session_id";
const sessionId = getSessionId();
let formStarted = false;

function getSessionId() {
  const existing = sessionStorage.getItem(sessionKey);
  if (existing) return existing;
  const value = crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(sessionKey, value);
  return value;
}

function setStatus(message, type = "") {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.className = `form-status ${type}`.trim();
}

function eventPayload(eventType, data = {}) {
  return {
    event_type: eventType,
    session_id: sessionId,
    page_url: window.location.href,
    path: window.location.pathname,
    referrer: document.referrer || "",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    ...data
  };
}

function track(eventType, data = {}) {
  const payload = JSON.stringify(eventPayload(eventType, data));
  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
    if (sent) return;
  }
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true
  }).catch(() => {});
}

function readUtm() {
  const params = new URLSearchParams(window.location.search);
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid"];
  return Object.fromEntries(keys.map((key) => [key, params.get(key) || ""]).filter(([, value]) => value));
}

function readForm(formElement) {
  const data = Object.fromEntries(new FormData(formElement).entries());
  const utm = readUtm();
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
    source: utm.utm_source || document.body.dataset.intent || "website",
    page_url: window.location.href,
    referrer: document.referrer || "",
    utm
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


function inferIntent() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("cno")) return "cno";
  if (path.includes("pno")) return "pno";
  if (path.includes("immeuble")) return "immeuble";
  return "website";
}

function mountLeadBar() {
  if (document.querySelector(".lead-action-bar") || window.location.pathname.includes("/admin") || window.location.pathname.includes("/merci")) return;
  document.body.dataset.intent = inferIntent();
  const bar = document.createElement("div");
  bar.className = "lead-action-bar";
  bar.innerHTML = `<span>Devis CNO/PNO/immeuble</span><a class="button primary" data-track="sticky-devis" href="/devis-pno-cno">Devis rapide</a><a class="button secondary" data-track="sticky-phone" href="tel:+33180855786">Appeler</a>`;
  document.body.append(bar);
}
function bindGrowthTracking() {
  track("page_view", { target: document.title });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (href.startsWith("tel:")) track("phone_click", { target: href, label: link.textContent.trim() });
    if (href.startsWith("mailto:")) track("email_click", { target: href, label: link.textContent.trim() });
    if (link.matches("[data-track], .button")) {
      track("cta_click", { target: href, label: link.textContent.trim() || link.dataset.track || "cta" });
    }
  });

  form?.addEventListener("focusin", () => {
    if (formStarted) return;
    formStarted = true;
    track("form_start", { target: "lead-form" });
  });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = readForm(form);

  if (payload.company_website) {
    window.location.assign("/merci");
    return;
  }

  const validationError = validate(payload);
  if (validationError) {
    setStatus(validationError, "error");
    track("lead_submit_error", { target: "validation", label: validationError });
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setStatus("Transmission du dossier en cours...");
  track("form_submit_attempt", { target: payload.need, label: payload.profile });

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
    track("lead_created", {
      lead_reference: result.reference,
      score: String(result.score || ""),
      notification: result.notification || "unknown",
      target: payload.need,
      label: payload.city
    });
  } catch (error) {
    const fallbackReference = `LOCAL-${Date.now().toString(36).toUpperCase()}`;
    localBackup(payload, { success: false, reference: fallbackReference, error: error.message });
    track("lead_submit_local_backup", { lead_reference: fallbackReference, target: payload.need, label: error.message });
    setStatus(
      `Connexion API indisponible en local. Dossier sauvegarde dans ce navigateur (${fallbackReference}).`,
      "error"
    );
  } finally {
    submitButton.disabled = false;
  }
});

mountLeadBar();
bindGrowthTracking();