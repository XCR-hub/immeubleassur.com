const form = document.querySelector("#lead-form");
const statusBox = document.querySelector(".form-status");

const requiredFields = ["name", "phone", "email", "profile", "property_type", "city"];
const sessionKey = "immeubleassur_session_id";
const attributionKey = "immeubleassur_attribution";
const experimentKey = "immeubleassur_cta_experiment";
const sessionId = getSessionId();
captureAttribution();
const ctaExperiment = getCtaExperiment();
let formStarted = false;
let experimentViewSent = false;
let formSubmitted = false;
let qualityEventSent = false;
let abandonEventSent = false;
let valueHintEventSent = false;
let botSignalFirstInteractionAt = 0;
let botSignalInteractionCount = 0;
let botSignalPointer = false;
let botSignalKeyboard = false;
const botSignalLoadedAt = Date.now();
const scrollDepthSent = new Set();

function getSessionId() {
  const existing = sessionStorage.getItem(sessionKey);
  if (existing) return existing;
  const value = crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(sessionKey, value);
  return value;
}


function hashString(value) {
  return String(value || "").split("").reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0);
}

function experimentVariants() {
  return [
    { id: "ia_cta_v2", variant: "speed", label: "devis rapide", badge: "devis specialise", primary: "Devis rapide", secondary: "Appeler" },
    { id: "ia_cta_v2", variant: "audit", label: "audit contrat", badge: "audit + devis", primary: "Audit gratuit", secondary: "Parler a un specialiste" },
    { id: "ia_cta_v2", variant: "proof", label: "dossier assureur", badge: "dossier assureur", primary: "Preparer mon dossier", secondary: "Rappel expert" }
  ];
}

function getCtaExperiment() {
  const variants = experimentVariants();
  try {
    const stored = JSON.parse(sessionStorage.getItem(experimentKey) || "null");
    if (stored && stored.id === variants[0].id && variants.some((item) => item.variant === stored.variant)) return stored;
  } catch {}
  const selected = variants[Math.abs(hashString(sessionId)) % variants.length];
  sessionStorage.setItem(experimentKey, JSON.stringify(selected));
  return selected;
}

function experimentPayload() {
  return {
    experiment_id: ctaExperiment.id,
    experiment_variant: ctaExperiment.variant,
    experiment_label: ctaExperiment.label
  };
}
function gaClientId() {
  const cookie = document.cookie.split("; ").find((row) => row.startsWith("_ga="));
  if (!cookie) return "";
  const value = decodeURIComponent(cookie.split("=").slice(1).join("="));
  const parts = value.split(".");
  if (parts.length >= 4) return `${parts[2]}.${parts[3]}`;
  return value.replace(/^GA\d+\.\d+\./, "").slice(0, 120);
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
    page_title: document.title,
    language: navigator.language || "",
    ga_client_id: gaClientId(),
    ...experimentPayload(),
    ...attributionPayload(),
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

function attributionKeys() {
  return ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid"];
}

function parseStoredAttribution() {
  try {
    return JSON.parse(sessionStorage.getItem(attributionKey) || "{}");
  } catch {
    return {};
  }
}

function captureAttribution() {
  const params = new URLSearchParams(window.location.search);
  const current = Object.fromEntries(attributionKeys().map((key) => [key, params.get(key) || ""]).filter(([, value]) => value));
  const existing = parseStoredAttribution();
  const hasCurrent = Object.keys(current).length > 0;
  const next = {
    ...existing,
    utm: hasCurrent ? { ...(existing.utm || {}), ...current } : (existing.utm || {}),
    landing_page: existing.landing_page || window.location.href,
    first_referrer: existing.first_referrer || document.referrer || "",
    captured_at: existing.captured_at || new Date().toISOString()
  };
  sessionStorage.setItem(attributionKey, JSON.stringify(next));
}

function readUtm() {
  const params = new URLSearchParams(window.location.search);
  const current = Object.fromEntries(attributionKeys().map((key) => [key, params.get(key) || ""]).filter(([, value]) => value));
  const stored = parseStoredAttribution();
  return {
    ...(stored.utm || {}),
    ...current,
    landing_page: stored.landing_page || window.location.href,
    first_referrer: stored.first_referrer || document.referrer || ""
  };
}

function attributionPayload() {
  const utm = readUtm();
  return {
    source: utm.utm_source || document.body.dataset.intent || inferIntent(),
    utm_source: utm.utm_source || "",
    utm_medium: utm.utm_medium || "",
    utm_campaign: utm.utm_campaign || "",
    utm_term: utm.utm_term || "",
    utm_content: utm.utm_content || "",
    gclid: utm.gclid || "",
    gbraid: utm.gbraid || "",
    wbraid: utm.wbraid || "",
    landing_page: utm.landing_page || "",
    first_referrer: utm.first_referrer || ""
  };
}

function noteBotInteraction(kind) {
  if (!botSignalFirstInteractionAt) botSignalFirstInteractionAt = Date.now();
  botSignalInteractionCount += 1;
  if (kind === "pointer") botSignalPointer = true;
  if (kind === "keyboard") botSignalKeyboard = true;
}

function botSignalPayload() {
  const now = Date.now();
  return {
    js_enabled: true,
    form_loaded_at: new Date(botSignalLoadedAt).toISOString(),
    form_elapsed_ms: Math.max(0, now - botSignalLoadedAt),
    first_interaction_ms: botSignalFirstInteractionAt ? Math.max(0, botSignalFirstInteractionAt - botSignalLoadedAt) : 0,
    interaction_count: botSignalInteractionCount,
    pointer_detected: botSignalPointer,
    keyboard_detected: botSignalKeyboard,
    session_token: Math.abs(hashString(`${sessionId}:${window.location.hostname}`)).toString(36)
  };
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
    session_id: sessionId,
    ga_client_id: gaClientId(),
    page_title: document.title,
    anti_bot: botSignalPayload(),
    turnstile_token: String(data["cf-turnstile-response"] || "").trim(),
    "cf-turnstile-response": String(data["cf-turnstile-response"] || "").trim(),
    ...experimentPayload(),
    experiment: experimentPayload(),
    utm
  };
}

const fieldLabels = {
  name: "nom",
  phone: "telephone",
  email: "email",
  profile: "profil",
  property_type: "type de bien",
  city: "ville",
  consent: "accord de contact"
};

function validationDetails(payload) {
  const missing = requiredFields.filter((field) => !payload[field]);
  const invalid = [];
  if (!missing.includes("email") && (!payload.email.includes("@") || payload.email.length < 6)) invalid.push("email");
  if (!missing.includes("phone") && payload.phone.replace(/\D/g, "").length < 9) invalid.push("phone");
  if (!payload.consent) missing.push("consent");

  const fields = [...missing, ...invalid];
  if (!fields.length) return { message: "", missing, invalid, step: "complete", blocking_fields: [] };

  const labels = fields.map((field) => fieldLabels[field] || field);
  const message = missing.length
    ? `A completer: ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? "..." : ""}.`
    : invalid.includes("email")
      ? "Adresse email invalide."
      : "Numero de telephone invalide.";
  return {
    message,
    missing,
    invalid,
    step: fields[0] || "validation",
    blocking_fields: fields,
    labels
  };
}

function validate(payload) {
  return validationDetails(payload).message;
}

function clearInvalidFields(formElement) {
  formElement.querySelectorAll("[data-invalid='true']").forEach((field) => {
    field.removeAttribute("data-invalid");
    field.removeAttribute("aria-invalid");
  });
}

function markInvalidFields(formElement, details) {
  clearInvalidFields(formElement);
  const fields = details.blocking_fields || [];
  for (const name of fields) {
    const field = formElement.elements[name];
    if (!field) continue;
    field.dataset.invalid = "true";
    field.setAttribute("aria-invalid", "true");
  }
  const first = fields.map((name) => formElement.elements[name]).find(Boolean);
  first?.focus({ preventScroll: true });
}

function validationTelemetry(payload, details) {
  return {
    target: payload.need || "validation",
    label: details.message || "validation",
    missing: (details.blocking_fields || []).join(","),
    step: details.step || "validation",
    ...leadValueEventPayload(payload)
  };
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
  if (path.includes("copro")) return "copropriete";
  if (path.includes("sci")) return "sci";
  if (path.includes("immeuble")) return "immeuble";
  return "website";
}

function intentLabel(intent) {
  return ({ cno: "CNO", pno: "PNO", copropriete: "Copropriete", sci: "SCI", immeuble: "Immeuble" })[intent] || "Immeuble";
}

function mountLeadBar() {
  if (document.querySelector(".lead-action-bar") || window.location.pathname.includes("/admin") || window.location.pathname.includes("/merci")) return;
  document.body.dataset.intent = inferIntent();
  const intent = document.body.dataset.intent;
  const label = intentLabel(intent);
  const routes = {
    cno: "/devis-pno-cno?intent=cno",
    pno: "/devis-pno-cno?intent=pno",
    copropriete: "/devis-assurance-immeuble?intent=copropriete",
    sci: "/devis-assurance-immeuble?intent=sci",
    immeuble: "/devis-assurance-immeuble?intent=immeuble",
    website: "/devis-assurance-immeuble"
  };
  const bar = document.createElement("div");
  bar.className = "lead-action-bar";
  bar.dataset.experimentId = ctaExperiment.id;
  bar.dataset.experimentVariant = ctaExperiment.variant;
  bar.innerHTML = `<span>${label}: ${ctaExperiment.badge}</span><a class="button primary" data-track="sticky-devis" data-experiment-variant="${ctaExperiment.variant}" href="${routes[intent] || routes.website}">${ctaExperiment.primary}</a><a class="button secondary" data-track="sticky-phone" data-experiment-variant="${ctaExperiment.variant}" href="tel:+33180855786">${ctaExperiment.secondary}</a>`;
  document.body.append(bar);
}

function addReason(reasons, label) {
  if (!reasons.includes(label) && reasons.length < 8) reasons.push(label);
}

function priorityFromScore(score) {
  if (score >= 85) return "hot";
  if (score >= 70) return "warm";
  if (score >= 45) return "standard";
  return "low";
}

function unitCount(value) {
  return Number.parseInt(String(value || "0").replace(/\D/g, ""), 10) || 0;
}

function leadValueEstimate(payload, score = 0) {
  const units = Math.max(1, unitCount(payload.units_count));
  const need = String(payload.need || "").trim();
  const profile = String(payload.profile || "").trim();
  const propertyType = String(payload.property_type || "").trim();
  let base = 260;

  if (["multirisque-immeuble", "copropriete", "audit-contrat"].includes(need)) base = 520;
  if (["rc-syndic", "dommages-ouvrage"].includes(need)) base = 620;
  if (["pno", "cno", "pno-cno"].includes(need) || ["lot-copropriete", "logement-vacant", "logement-loue"].includes(propertyType)) base = units <= 2 ? 190 : 260;
  if (["local-commercial", "commerce", "mixte"].includes(propertyType)) base += 180;
  if (["sci", "administrateur-biens", "syndic-professionnel"].includes(profile)) base += 160;

  const min = Math.round(Math.max(180, base + Math.max(0, units - 1) * 135));
  const max = Math.round(min * (score >= 85 ? 1.75 : score >= 70 ? 1.55 : 1.35));
  const band = max >= 9000 ? "portfolio" : max >= 3500 ? "immeuble-prioritaire" : max >= 1200 ? "immeuble-standard" : "lot-pno-cno";
  return {
    annual_premium_min: min,
    annual_premium_max: max,
    band,
    label: `${min}-${max} EUR/an`,
    basis: `${units} lot(s), ${need || "besoin non precise"}`
  };
}

function slaHoursFor(score, valueEstimate) {
  const maxValue = Number(valueEstimate?.annual_premium_max || 0);
  if (score >= 85 || maxValue >= 9000) return 2;
  if (score >= 70 || maxValue >= 3500) return 6;
  if (score >= 45 || maxValue >= 1200) return 24;
  return 48;
}
function leadQualification(payload) {
  let score = 20;
  const reasons = [];
  const units = unitCount(payload.units_count);
  const need = String(payload.need || "").trim();
  const profile = String(payload.profile || "").trim();
  const propertyType = String(payload.property_type || "").trim();
  const source = String(payload.source || "").trim();
  const readinessText = `${payload.message || ""} ${source}`;
  const readinessSignals = ["contrat actuel", "appel de prime", "sinistres 36 mois", "nombre de lots", "echeance", "travaux prevus"].filter((item) => readinessText.toLowerCase().includes(item)).length;

  if (units >= 2) {
    score += 8;
    addReason(reasons, "plusieurs lots");
  }
  if (units >= 10) {
    score += 20;
    addReason(reasons, "immeuble multi-lots");
  }
  if (units >= 40) {
    score += 20;
    addReason(reasons, "portefeuille important");
  }
  if (["syndic-professionnel", "administrateur-biens", "sci"].includes(profile)) {
    score += 15;
    addReason(reasons, "profil professionnel ou SCI");
  }
  if (["multirisque-immeuble", "copropriete", "audit-contrat"].includes(need)) {
    score += 10;
    addReason(reasons, "besoin immeuble qualifie");
  }
  if (["pno", "cno", "pno-cno"].includes(need)) {
    score += 18;
    addReason(reasons, "intention PNO/CNO");
  }
  if (["lot-copropriete", "logement-vacant", "logement-loue", "local-commercial"].includes(propertyType)) {
    score += 12;
    addReason(reasons, "situation du bien exploitable");
  }
  if (/pno|cno|coproprietaire|non.?occupant/i.test(`${payload.message || ""} ${source}`)) {
    score += 10;
    addReason(reasons, "mot-cle PNO/CNO detecte");
  }
  if (/dossier pret assureur|pieces disponibles/i.test(readinessText) && !/pieces disponibles:\s*aucune piece/i.test(readinessText)) {
    score += 12;
    addReason(reasons, "dossier assureur prepare");
  }
  if (readinessSignals >= 3) {
    score += 8;
    addReason(reasons, "pieces assureur disponibles");
  }
  if (payload.message && payload.message.length > 40) {
    score += 10;
    addReason(reasons, "message detaille");
  }

  score = Math.min(score, 100);
  const valueEstimate = leadValueEstimate(payload, score);
  return { score, priority: priorityFromScore(score), reasons, value_estimate: valueEstimate, sla_hours: slaHoursFor(score, valueEstimate) };
}

function leadQuality(payload) {
  return leadQualification(payload).score;
}

function leadValueEventPayload(payload, qualification = leadQualification(payload)) {
  const estimate = qualification.value_estimate || leadValueEstimate(payload, qualification.score || 0);
  return {
    score: String(qualification.score || ""),
    priority: qualification.priority || "",
    revenue_band: estimate.band || "",
    lead_value_min: String(estimate.annual_premium_min || ""),
    lead_value_max: String(estimate.annual_premium_max || ""),
    sla_hours: String(qualification.sla_hours || slaHoursFor(qualification.score || 0, estimate))
  };
}

function formatEuro(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} EUR`;
}

function documentChecklistFor(payload) {
  const need = payload.need || inferIntent();
  const propertyType = payload.property_type || "";
  const units = unitCount(payload.units_count);
  if (["pno", "cno", "pno-cno"].includes(need) || propertyType === "lot-copropriete") return ["Occupation du lot", "Contrat copropriete", "Attestation occupant"];
  if (["local-commercial", "commerce", "mixte"].includes(propertyType)) return ["Activite du commerce", "Bail", "Assurance occupant"];
  if (units >= 10) return ["Tableau des lots", "Prime actuelle", "Sinistres 36 mois"];
  if (payload.profile === "sci") return ["Liste des biens", "Contrats existants", "Echeances"];
  return ["Contrat actuel", "Appel de prime", "Travaux prevus"];
}

function updateLeadValuePreview(preview, formElement) {
  const payload = readForm(formElement);
  const qualification = leadQualification(payload);
  const estimate = qualification.value_estimate;
  preview.dataset.level = qualification.sla_hours <= 6 ? "urgent" : qualification.score >= 55 ? "ready" : "base";
  preview.querySelector("[data-value-range]").textContent = `${formatEuro(estimate.annual_premium_min)} - ${formatEuro(estimate.annual_premium_max)}/an`;
  preview.querySelector("[data-value-sla]").textContent = `Rappel ${qualification.sla_hours}h`;
  preview.querySelector("[data-value-docs]").textContent = documentChecklistFor(payload).join(" + ");
  preview.querySelector("[data-value-note]").textContent = qualification.score >= 70
    ? "Dossier lisible: ajoutez echeance ou sinistres pour accelerer la consultation."
    : "Fourchette indicative, ajustee apres analyse du risque et des garanties.";

  if (qualification.score >= 70 && !valueHintEventSent) {
    valueHintEventSent = true;
    track("lead_value_hint_ready", {
      target: payload.need || "unknown",
      label: estimate.band,
      ...leadValueEventPayload(payload, qualification)
    });
  }
}

function mountLeadValuePreview() {
  if (!form || form.querySelector(".lead-value-preview")) return;
  const anchor = form.querySelector(".ux-form-proof") || form.querySelector(".form-advisor") || form.querySelector(".form-heading") || form.firstElementChild;
  const preview = document.createElement("div");
  preview.className = "lead-value-preview";
  preview.innerHTML = `<div class="lead-value-preview-main"><span><strong data-value-range>0 EUR - 0 EUR/an</strong><small>Prime indicative</small></span><span><strong data-value-sla>Rappel 48h</strong><small>Priorite dossier</small></span><span><strong data-value-docs>Contrat actuel</strong><small>Pieces cles</small></span></div><p data-value-note>Fourchette indicative, ajustee apres analyse du risque et des garanties.</p>`;
  anchor.insertAdjacentElement("afterend", preview);
  updateLeadValuePreview(preview, form);
  form.addEventListener("input", () => updateLeadValuePreview(preview, form));
  form.addEventListener("change", () => updateLeadValuePreview(preview, form));
}
function advisorCopy(payload, score) {
  const need = payload.need || inferIntent();
  const units = Number(String(payload.units_count || "").replace(/\D/g, ""));
  if (score >= 82) return { state: "Dossier prioritaire", next: "Ajoutez l'echeance, l'assureur actuel ou les sinistres recents si vous les avez." };
  if (["cno", "pno", "pno-cno"].includes(need)) return { state: "Parcours PNO/CNO", next: "Precisez si le lot est loue, vacant ou occupe gratuitement." };
  if (units >= 10) return { state: "Immeuble multi-lots", next: "Indiquez les travaux, commerces et sinistres des 36 derniers mois." };
  if (payload.profile === "sci") return { state: "SCI patrimoniale", next: "Mentionnez si les lots sont regroupes ou disperses." };
  return { state: "Qualification rapide", next: "Les champs obligatoires suffisent pour lancer le rappel." };
}

function updateFormAdvisor(advisor, formElement) {
  const payload = readForm(formElement);
  const score = leadQuality(payload);
  const copy = advisorCopy(payload, score);
  advisor.querySelector(".form-score-value").textContent = `${score}%`;
  advisor.querySelector(".form-score-bar span").style.width = `${score}%`;
  advisor.querySelector(".form-advisor-state").textContent = copy.state;
  advisor.querySelector(".form-advisor-next").textContent = copy.next;
  advisor.dataset.level = score >= 82 ? "high" : score >= 55 ? "medium" : "low";
  if (score >= 70 && !qualityEventSent) {
    qualityEventSent = true;
    track("form_quality_ready", { target: payload.need || "unknown", label: payload.city || "unknown", score: String(score) });
  }
}

function mountFormAdvisor() {
  if (!form || form.querySelector(".form-advisor")) return;
  const heading = form.querySelector(".form-heading") || form.firstElementChild;
  const advisor = document.createElement("div");
  advisor.className = "form-advisor";
  advisor.innerHTML = `<div><strong class="form-advisor-state">Qualification rapide</strong><span class="form-advisor-next">Les champs obligatoires suffisent pour lancer le rappel.</span></div><div class="form-score" aria-label="Score de qualification"><strong class="form-score-value">0%</strong><span class="form-score-bar"><span></span></span></div>`;
  heading.insertAdjacentElement("afterend", advisor);
  updateFormAdvisor(advisor, form);
  form.addEventListener("input", () => updateFormAdvisor(advisor, form));
  form.addEventListener("change", () => updateFormAdvisor(advisor, form));
}

// ux-conversion-runtime:start
const selectAliases = {
  need: {
    copropriete: ["copropriete", "multirisque-immeuble"],
    cno: ["cno", "pno-cno", "pno"],
    "pno-cno": ["pno-cno", "cno", "pno"],
    pno: ["pno", "pno-cno"],
    mixte: ["audit-contrat", "multirisque-immeuble"]
  },
  property_type: {
    "lot-copropriete": ["lot-copropriete", "copropriete"],
    "logement-vacant": ["logement-vacant", "immeuble-locatif"],
    "logement-loue": ["logement-loue", "immeuble-locatif"],
    "local-commercial": ["local-commercial", "commerce", "mixte"],
    copropriete: ["copropriete", "lot-copropriete"],
    commerce: ["commerce", "local-commercial", "mixte"]
  }
};

function setSelectValue(name, value) {
  if (!form || !value) return false;
  const field = form.elements[name];
  if (!field || !field.options) return false;
  const candidates = [value, ...((selectAliases[name] || {})[value] || [])];
  const option = [...field.options].find((item) => candidates.includes(item.value));
  if (!option) return false;
  field.value = option.value;
  return true;
}

function setInputValue(name, value, { onlyIfEmpty = false } = {}) {
  if (!form || value === undefined || value === null) return false;
  const field = form.elements[name];
  if (!field) return false;
  if (onlyIfEmpty && String(field.value || "").trim()) return false;
  field.value = value;
  return true;
}

function applyFormValues(values) {
  if (!form) return false;
  setSelectValue("need", values.need);
  setSelectValue("profile", values.profile);
  setSelectValue("property_type", values.property_type);
  setInputValue("message", values.message, { onlyIfEmpty: true });
  form.dispatchEvent(new Event("input", { bubbles: true }));
  form.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function applyIntentPrefill() {
  if (!form) return;
  const params = new URLSearchParams(window.location.search);
  const intent = (params.get("intent") || params.get("need") || "").toLowerCase();
  if (!intent) return;
  const needMap = {
    cno: "cno",
    pno: "pno",
    "pno-cno": "pno-cno",
    copropriete: "copropriete",
    sci: "multirisque-immeuble",
    mixte: "audit-contrat",
    audit: "audit-contrat",
    "audit-contrat": "audit-contrat",
    immeuble: "multirisque-immeuble"
  };
  const profileMap = {
    sci: "sci",
    copropriete: "syndic-professionnel",
    cno: "bailleur",
    pno: "bailleur",
    mixte: "bailleur",
    audit: "bailleur",
    "audit-contrat": "bailleur"
  };
  const propertyMap = {
    cno: "lot-copropriete",
    pno: "logement-loue",
    copropriete: "copropriete",
    sci: "immeuble-locatif",
    mixte: "local-commercial",
    audit: "immeuble-locatif",
    "audit-contrat": "immeuble-locatif",
    immeuble: "immeuble-locatif"
  };
  applyFormValues({ need: needMap[intent], profile: profileMap[intent], property_type: propertyMap[intent] });
}

function mountFormProof() {
  if (!form || form.querySelector(".ux-form-proof")) return;
  const anchor = form.querySelector(".form-advisor") || form.querySelector(".form-heading") || form.firstElementChild;
  const proof = document.createElement("div");
  proof.className = "ux-form-proof";
  proof.innerHTML = `<span>Rappel humain</span><span>CNO / PNO</span><span>Audit contrat</span><span>Sinistres</span>`;
  anchor.insertAdjacentElement("afterend", proof);
}

function diagnosticRoute(state) {
  const profile = state.profile || "bailleur";
  const property = state.property || "lot-copropriete";
  const urgency = state.urgency || "echeance";
  let key = "immeuble";
  if (["syndic-professionnel", "conseil-syndical"].includes(profile)) key = "copropriete";
  else if (profile === "sci") key = "sci";
  else if (property === "lot-copropriete") key = "cno";
  else if (property === "logement-vacant") key = "pno";
  else if (property === "local-commercial") key = "mixte";

  const routes = {
    cno: {
      badge: "Parcours CNO",
      title: "Lot en copropriete non occupe.",
      text: "Prioriser la responsabilite civile du coproprietaire, la vacance, le bail et la coherence avec le contrat immeuble.",
      items: ["Contrat immeuble copropriete", "Statut d'occupation du lot", "Attestation occupant ou vacance"],
      href: "/devis-pno-cno?intent=cno",
      need: "cno",
      property_type: "lot-copropriete"
    },
    pno: {
      badge: "Parcours PNO",
      title: "Bien loue ou vacant a proteger.",
      text: "Cadrer la PNO avec l'assurance occupant, la vacance, les dependances et les recours possibles.",
      items: ["Adresse et surface", "Occupation actuelle", "Franchises et exclusions vacance"],
      href: "/devis-pno-cno?intent=pno",
      need: "pno",
      property_type: property === "logement-vacant" ? "logement-vacant" : "logement-loue"
    },
    copropriete: {
      badge: "Parcours copropriete",
      title: "Syndic, conseil syndical ou AG.",
      text: "Presenter les parties communes, lots, sinistres, travaux et garanties RC du syndicat des coproprietaires.",
      items: ["Nombre de lots", "Contrat actuel et appel de prime", "Historique sinistres 36 mois"],
      href: "/devis-assurance-immeuble?intent=copropriete",
      need: "copropriete",
      property_type: "copropriete"
    },
    sci: {
      badge: "Parcours SCI",
      title: "Patrimoine locatif ou lots multiples.",
      text: "Organiser les contrats par bien pour eviter doublons, trous de garantie et declarations inexactes.",
      items: ["Liste des biens", "Contrats existants", "Lots regroupes ou disperses"],
      href: "/devis-assurance-immeuble?intent=sci",
      need: "multirisque-immeuble",
      property_type: "immeuble-locatif"
    },
    mixte: {
      badge: "Parcours immeuble mixte",
      title: "Commerce, bureau ou local vacant.",
      text: "Declarer l'activite, le bail, les installations techniques et l'assurance du locataire commercial.",
      items: ["Activite exacte", "Bail et assurance occupant", "Extraction, stock ou terrasse"],
      href: "/devis-assurance-immeuble?intent=mixte",
      need: "audit-contrat",
      property_type: "local-commercial"
    },
    immeuble: {
      badge: "Parcours immeuble",
      title: "Immeuble locatif ou monopropriete.",
      text: "Transformer le batiment en fiche risque: lots, usage, entretien, sinistres et garanties attendues.",
      items: ["Nombre de lots", "Travaux et entretien", "Prime, franchises et exclusions"],
      href: "/devis-assurance-immeuble?intent=immeuble",
      need: "multirisque-immeuble",
      property_type: "immeuble-locatif"
    }
  };
  const urgencyItems = {
    echeance: "Echeance et preavis a verifier",
    sinistre: "Sinistre recent a documenter",
    prix: "Prime et franchises a comparer",
    creation: "Nouveau bien a declarer proprement"
  };
  const route = routes[key];
  const items = [...route.items, urgencyItems[urgency] || urgencyItems.echeance];
  return {
    ...route,
    key,
    profile,
    urgency,
    items,
    message: `${route.badge}. Priorite: ${urgencyItems[urgency] || urgencyItems.echeance}. Pieces disponibles: ${route.items.slice(0, 2).join(", ")}.`
  };
}

function diagnosticState(shell) {
  const valueFor = (step) => shell.querySelector(`[data-diagnostic-option][data-step="${step}"].is-active`)?.dataset.value || "";
  return {
    profile: valueFor("profile") || "bailleur",
    property: valueFor("property") || "lot-copropriete",
    urgency: valueFor("urgency") || "echeance"
  };
}

function renderDiagnostic(shell) {
  const route = diagnosticRoute(diagnosticState(shell));
  shell.dataset.route = route.key;
  const badge = shell.querySelector(".diagnostic-route");
  const title = shell.querySelector(".diagnostic-result-title");
  const text = shell.querySelector(".diagnostic-result-text");
  const list = shell.querySelector(".diagnostic-next");
  const cta = shell.querySelector(".diagnostic-cta");
  if (badge) badge.textContent = route.badge;
  if (title) title.textContent = route.title;
  if (text) text.textContent = route.text;
  if (list) list.innerHTML = route.items.map((item) => `<li>${item}</li>`).join("");
  if (cta) {
    cta.href = route.href;
    cta.dataset.route = route.key;
    cta.dataset.need = route.need;
  }
}

function mountDiagnostic() {
  document.querySelectorAll("[data-diagnostic]").forEach((shell) => {
    const options = [...shell.querySelectorAll("[data-diagnostic-option]")];
    options.forEach((option) => {
      option.addEventListener("click", () => {
        options.filter((item) => item.dataset.step === option.dataset.step).forEach((item) => item.classList.toggle("is-active", item === option));
        renderDiagnostic(shell);
        track("diagnostic_select", { target: option.dataset.step || "unknown", label: option.dataset.value || "unknown" });
      });
    });
    shell.querySelector(".diagnostic-cta")?.addEventListener("click", (event) => {
      const route = diagnosticRoute(diagnosticState(shell));
      track("diagnostic_complete", { target: route.need, label: `${route.profile}/${route.property_type}/${route.urgency}`, route: route.href });
      if (!applyFormValues(route)) return;
      event.preventDefault();
      if (!formStarted) {
        formStarted = true;
        track("form_start", { target: "diagnostic-prefill", label: route.key });
      }
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      const focusTarget = form.querySelector("input[name='name'], input[name='phone'], input[name='email']");
      focusTarget?.focus({ preventScroll: true });
    });
    renderDiagnostic(shell);
  });
}

function readinessState(shell) {
  const items = [...shell.querySelectorAll("[data-readiness-item]")];
  const checked = items.filter((item) => item.checked);
  const checkedLabels = checked.map((item) => item.dataset.label || item.value).filter(Boolean);
  const missingLabels = items.filter((item) => !item.checked).map((item) => item.dataset.label || item.value).filter(Boolean);
  const score = Math.min(100, 20 + checked.reduce((sum, item) => sum + Number(item.dataset.points || 0), 0));
  const level = score >= 85 ? "pret-assureur" : score >= 60 ? "presque-pret" : "a-completer";
  return { score, level, checkedLabels, missingLabels };
}

function readinessMessage(state) {
  const available = state.checkedLabels.length ? state.checkedLabels.join(", ") : "aucune piece cochee";
  const missing = state.missingLabels.length ? state.missingLabels.slice(0, 4).join(", ") : "dossier complet";
  return `Dossier pret assureur ${state.score}%. Pieces disponibles: ${available}. A completer: ${missing}.`;
}

function renderReadiness(shell) {
  const state = readinessState(shell);
  const labels = {
    "pret-assureur": "Pret a consulter",
    "presque-pret": "Presque complet",
    "a-completer": "Dossier a cadrer"
  };
  const next = {
    "pret-assureur": "Le rappel peut partir avec un dossier lisible pour l'assureur.",
    "presque-pret": "Ajoutez echeance ou sinistres pour accelerer la comparaison.",
    "a-completer": "Cochez contrat, lots ou sinistres pour reduire les allers-retours."
  };
  shell.dataset.level = state.level;
  shell.querySelector(".readiness-label").textContent = labels[state.level] || labels["a-completer"];
  shell.querySelector(".readiness-score").textContent = `${state.score}%`;
  shell.querySelector(".readiness-bar span").style.width = `${state.score}%`;
  shell.querySelector(".readiness-next").textContent = next[state.level] || next["a-completer"];
  return state;
}

function mountReadiness() {
  document.querySelectorAll("[data-readiness]").forEach((shell) => {
    const items = [...shell.querySelectorAll("[data-readiness-item]")];
    let started = false;
    let completed = false;
    items.forEach((item) => {
      item.addEventListener("change", () => {
        const state = renderReadiness(shell);
        if (!started) {
          started = true;
          track("readiness_start", { target: window.location.pathname, label: state.level, score: String(state.score) });
        }
        track("readiness_update", {
          target: item.value || "piece",
          label: item.checked ? "checked" : "unchecked",
          score: String(state.score),
          level: state.level
        });
      });
    });

    shell.querySelector(".readiness-cta")?.addEventListener("click", (event) => {
      const state = renderReadiness(shell);
      if (!completed) {
        completed = true;
        track("readiness_complete", {
          target: state.level,
          label: state.checkedLabels.join(", ") || "aucune-piece",
          score: String(state.score),
          missing: state.missingLabels.join(", ")
        });
      }
      if (!form) return;
      event.preventDefault();
      setInputValue("message", readinessMessage(state), { onlyIfEmpty: false });
      form.dispatchEvent(new Event("input", { bubbles: true }));
      form.dispatchEvent(new Event("change", { bubbles: true }));
      if (!formStarted) {
        formStarted = true;
        track("form_start", { target: "readiness-prefill", label: state.level });
      }
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      const focusTarget = form.querySelector("input[name='name'], input[name='phone'], input[name='email']");
      focusTarget?.focus({ preventScroll: true });
    });
    renderReadiness(shell);
  });
}
function mountRiskRouter() {
  const router = document.querySelector(".risk-router");
  if (!router) return;
  const result = router.querySelector(".risk-result");
  const options = [...router.querySelectorAll(".risk-option[data-risk]")];
  const rows = {
    cno: {
      title: "Coproprietaire non occupant",
      text: "Verifier le lot, la vacance, le bail, le contrat immeuble et la responsabilite civile du coproprietaire.",
      items: ["Adresse et usage du lot", "Contrat occupant ou vacance", "Echeance et sinistres recents"],
      href: "/devis-pno-cno?intent=cno"
    },
    pno: {
      title: "Proprietaire non occupant",
      text: "Cadrer le logement loue, vacant ou prete avec les garanties utiles au proprietaire bailleur.",
      items: ["Statut d'occupation", "Surface et dependances", "Franchises et exclusions de vacance"],
      href: "/devis-pno-cno?intent=pno"
    },
    copropriete: {
      title: "Syndic ou conseil syndical",
      text: "Presenter les lots, parties communes, sinistres, travaux et garanties RC du syndicat.",
      items: ["Nombre de lots", "PV d'AG et contrat actuel", "Historique sinistres 36 mois"],
      href: "/devis-assurance-immeuble?intent=copropriete"
    },
    sci: {
      title: "SCI immobiliere",
      text: "Organiser les contrats autour du patrimoine, des lots et des occupants pour eviter les doublons.",
      items: ["Liste des biens", "Contrats existants", "Lots regroupes ou disperses"],
      href: "/devis-assurance-immeuble?intent=sci"
    },
    mixte: {
      title: "Immeuble mixte",
      text: "Identifier l'activite commerciale, le bail, les locaux vacants et les garanties du bailleur.",
      items: ["Activite du commerce", "Bail et assurance occupant", "Extraction, stock ou terrasse"],
      href: "/devis-assurance-immeuble?intent=mixte"
    }
  };
  const render = (risk, shouldTrack = false) => {
    const row = rows[risk] || rows.cno;
    router.dataset.activeRisk = risk;
    options.forEach((option) => option.classList.toggle("is-active", option.dataset.risk === risk));
    result.innerHTML = `<p class="risk-result-label">Parcours prioritaire</p><h3>${row.title}</h3><p>${row.text}</p><ul>${row.items.map((item) => `<li>${item}</li>`).join("")}</ul><a class="button primary" data-track="risk-router-devis" href="${row.href}">Demander le bon devis</a>`;
    if (shouldTrack) track("risk_router_select", { target: risk, label: row.title });
  };
  options.forEach((option) => option.addEventListener("click", () => render(option.dataset.risk, true)));
  render(router.dataset.activeRisk || "cno");
}
function quoteFastTrackRows() {
  return {
    cno: {
      label: "CNO",
      title: "Coproprietaire non occupant",
      text: "Lot en copropriete, logement vacant ou loue: verifier RC, contrat immeuble et assurance occupant.",
      proof: "Pieces cles: adresse, occupation, contrat copropriete.",
      href: "/devis-pno-cno?intent=cno",
      need: "cno",
      profile: "bailleur",
      property_type: "lot-copropriete"
    },
    pno: {
      label: "PNO",
      title: "Proprietaire bailleur",
      text: "Logement loue, vacant ou en attente de locataire: cadrer garanties, vacance et franchises.",
      proof: "Pieces cles: bail, occupation, surface, sinistres.",
      href: "/devis-pno-cno?intent=pno",
      need: "pno",
      profile: "bailleur",
      property_type: "logement-loue"
    },
    copropriete: {
      label: "Copropriete",
      title: "Syndic ou conseil syndical",
      text: "Parties communes, RC syndicat, lots, travaux et sinistres doivent etre presentes clairement.",
      proof: "Pieces cles: nombre de lots, contrat actuel, sinistres 36 mois.",
      href: "/devis-assurance-immeuble?intent=copropriete",
      need: "copropriete",
      profile: "syndic-professionnel",
      property_type: "copropriete"
    },
    sci: {
      label: "SCI",
      title: "SCI ou patrimoine multi-biens",
      text: "Regrouper les biens, contrats et occupants pour eviter doublons et trous de garantie.",
      proof: "Pieces cles: liste des biens, lots, contrats existants.",
      href: "/devis-assurance-immeuble?intent=sci",
      need: "multirisque-immeuble",
      profile: "sci",
      property_type: "immeuble-locatif"
    },
    immeuble: {
      label: "Immeuble",
      title: "Immeuble locatif ou mixte",
      text: "Transformer le batiment en fiche risque: lots, usage, entretien, sinistres et garanties attendues.",
      proof: "Pieces cles: lots, prime actuelle, echeance, travaux.",
      href: "/devis-assurance-immeuble?intent=immeuble",
      need: "multirisque-immeuble",
      profile: "bailleur",
      property_type: "immeuble-locatif"
    },
    audit: {
      label: "Audit",
      title: "Contrat a comparer avant echeance",
      text: "Lire franchises, exclusions, plafonds, recours et service sinistre avant de consulter le marche.",
      proof: "Pieces cles: contrat actuel, appel de prime, echeance.",
      href: "/devis-assurance-immeuble?intent=audit-contrat",
      need: "audit-contrat",
      profile: "bailleur",
      property_type: "immeuble-locatif"
    }
  };
}

function quoteFastTrackIntent() {
  const params = new URLSearchParams(window.location.search);
  const requested = (params.get("intent") || params.get("need") || inferIntent()).toLowerCase();
  if (["cno", "pno", "copropriete", "sci", "immeuble"].includes(requested)) return requested;
  if (["audit", "audit-contrat", "prix", "comparateur"].includes(requested)) return "audit";
  if (requested === "website") return "immeuble";
  return "immeuble";
}

function quoteFastTrackMessage(row) {
  return `${row.title}. ${row.proof} Objectif: obtenir un devis exploitable et comparer les garanties sans allers-retours.`;
}

function renderQuoteFastTrack(shell, key, shouldTrack = false) {
  const rows = quoteFastTrackRows();
  const row = rows[key] || rows.immeuble;
  shell.dataset.activeIntent = key;
  shell.querySelectorAll("[data-quote-fast-option]").forEach((button) => {
    const active = button.dataset.quoteFastOption === key;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  shell.querySelector("[data-quote-fast-title]").textContent = row.title;
  shell.querySelector("[data-quote-fast-text]").textContent = row.text;
  shell.querySelector("[data-quote-fast-proof]").textContent = row.proof;
  const cta = shell.querySelector("[data-quote-fast-continue]");
  cta.href = row.href;
  cta.dataset.intent = key;
  if (shouldTrack) track("quote_router_select", { target: key, label: row.title, route: row.href });
}

function quoteFastTrackApply(row) {
  if (!form) return false;
  applyFormValues({ ...row, message: quoteFastTrackMessage(row) });
  return true;
}

function mountQuoteFastTrack() {
  if (window.location.pathname.includes("/admin") || window.location.pathname.includes("/merci")) return;
  if (document.querySelector(".quote-fast-track")) return;
  const anchor = document.querySelector(".conversion-strip") || document.querySelector(".page-hero") || document.querySelector(".hero") || document.querySelector(".article-head");
  if (!anchor) return;
  const rows = quoteFastTrackRows();
  const initial = quoteFastTrackIntent();
  const shell = document.createElement("section");
  shell.className = "quote-fast-track band";
  shell.setAttribute("aria-label", "Acces rapide devis assurance immeuble");
  shell.innerHTML = `<div class="quote-fast-track-inner"><div class="quote-fast-copy"><p class="eyebrow dark">Devis immediat</p><h2>Aller directement au bon parcours assurance immeuble.</h2><p data-quote-fast-text></p><strong data-quote-fast-proof></strong></div><div class="quote-fast-panel"><div class="quote-fast-options" role="group" aria-label="Type de demande">${Object.entries(rows).map(([key, row]) => `<button type="button" data-quote-fast-option="${key}" aria-pressed="false">${row.label}</button>`).join("")}</div><div class="quote-fast-result"><span>Parcours recommande</span><h3 data-quote-fast-title></h3><a class="button primary" data-track="quote-fast-continue" data-quote-fast-continue href="/devis-assurance-immeuble">Continuer mon devis</a><a class="button secondary" data-track="quote-fast-phone" href="tel:+33180855786">Appeler maintenant</a></div></div></div>`;
  anchor.insertAdjacentElement("afterend", shell);
  renderQuoteFastTrack(shell, initial);
  track("quote_router_view", { target: initial, label: window.location.pathname });
  shell.querySelectorAll("[data-quote-fast-option]").forEach((button) => {
    button.addEventListener("click", () => renderQuoteFastTrack(shell, button.dataset.quoteFastOption, true));
  });
  shell.querySelector("[data-quote-fast-continue]")?.addEventListener("click", (event) => {
    const key = shell.dataset.activeIntent || initial;
    const row = rows[key] || rows.immeuble;
    track("quote_router_continue", { target: key, label: row.title, route: row.href, mode: form ? "prefill" : "navigate" });
    if (!quoteFastTrackApply(row)) return;
    event.preventDefault();
    if (!formStarted) {
      formStarted = true;
      track("form_start", { target: "quote-fast-track", label: key });
    }
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    const focusTarget = form.querySelector("input[name='name'], input[name='phone'], input[name='email']");
    focusTarget?.focus({ preventScroll: true });
  });
}
// ux-conversion-runtime:end
function enhanceHeader() {
  const header = document.querySelector(".site-header[data-elevate]");
  if (!header) return;
  const toggle = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  toggle();
  document.addEventListener("scroll", toggle, { passive: true });
}

function bindScrollDepthTracking() {
  if (window.location.pathname.includes("/admin")) return;
  let ticking = false;
  const check = () => {
    ticking = false;
    const doc = document.documentElement;
    const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
    const depth = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
    for (const mark of [50, 90]) {
      if (depth >= mark && !scrollDepthSent.has(mark)) {
        scrollDepthSent.add(mark);
        track("scroll_depth", { target: String(mark), label: window.location.pathname });
      }
    }
  };
  document.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(check);
  }, { passive: true });
  check();
}

function trackFormAbandonment(reason) {
  if (!form || !formStarted || formSubmitted || abandonEventSent) return;
  const payload = readForm(form);
  const hasContact = Boolean(payload.name || payload.phone || payload.email || payload.city || payload.message);
  if (!hasContact) return;
  const qualification = leadQualification(payload);
  abandonEventSent = true;
  track("lead_form_abandoned", {
    target: payload.need || "unknown",
    label: reason,
    ...leadValueEventPayload(payload, qualification)
  });
}

function bindFormAbandonment() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") trackFormAbandonment("visibility_hidden");
  });
  window.addEventListener("pagehide", () => trackFormAbandonment("pagehide"));
}
function bindBotSignalTracking() {
  if (!form) return;
  form.addEventListener("input", () => noteBotInteraction("input"), { passive: true });
  form.addEventListener("change", () => noteBotInteraction("input"), { passive: true });
  form.addEventListener("pointerdown", () => noteBotInteraction("pointer"), { passive: true });
  form.addEventListener("keydown", () => noteBotInteraction("keyboard"), { passive: true });
}

function bindGrowthTracking() {
  track("page_view", { target: document.title, label: document.body.dataset.intent || inferIntent() });
  if (!experimentViewSent && !window.location.pathname.includes("/admin")) {
    experimentViewSent = true;
    track("experiment_view", { target: ctaExperiment.id, label: ctaExperiment.variant });
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (href.startsWith("tel:")) track("phone_click", { target: href, label: link.textContent.trim() });
    if (href.startsWith("mailto:")) track("email_click", { target: href, label: link.textContent.trim() });
    if (link.matches("[data-track], .button, .intent-card")) {
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

  const validation = validationDetails(payload);
  if (validation.message) {
    setStatus(validation.message, "error");
    markInvalidFields(form, validation);
    track("lead_submit_error", validationTelemetry(payload, validation));
    return;
  }
  clearInvalidFields(form);

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setStatus("Transmission du dossier en cours...");
  const qualification = leadQualification(payload);
  track("form_submit_attempt", { target: payload.need, label: payload.profile, ...leadValueEventPayload(payload, qualification) });

  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      const submitError = new Error(result.error || "Envoi impossible pour le moment.");
      submitError.status = response.status;
      submitError.result = result;
      throw submitError;
    }

    formSubmitted = true;
    localBackup(payload, result);
    form.reset();
    setStatus(`Demande recue. Reference ${result.reference}. Un conseiller vous rappelle rapidement.`, "ok");
    track("lead_created", {
      lead_reference: result.reference,
      score: String(result.score || ""),
      notification: result.notification || "unknown",
      priority: result.priority || "",
      next_action: result.next_action || "",
      revenue_band: result.value_estimate?.band || "",
      lead_value_min: String(result.value_estimate?.annual_premium_min || ""),
      lead_value_max: String(result.value_estimate?.annual_premium_max || ""),
      sla_hours: String(result.sla_hours || ""),
      target: payload.need,
      label: payload.city
    });
  } catch (error) {
    if (error.status && error.status < 500) {
      track("lead_submit_rejected", { target: payload.need, label: error.message, status: String(error.status), turnstile: error.result?.turnstile || "" });
      setStatus(error.message || "Demande rejetee. Verifiez les champs puis recommencez.", "error");
      return;
    }
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


function newsletterStatus(formElement, message, type = "") {
  const box = formElement.querySelector("[data-newsletter-status]") || formElement.querySelector(".form-status");
  if (!box) return;
  box.textContent = message;
  box.className = `form-status ${type}`.trim();
}

function readNewsletterForm(formElement) {
  const data = Object.fromEntries(new FormData(formElement).entries());
  return {
    email: String(data.email || "").trim().toLowerCase(),
    name: String(data.name || "").trim(),
    audience: String(data.audience || "assurance-immeuble").trim(),
    consent: data.consent === "on",
    company_website: String(data.company_website || "").trim(),
    source: formElement.dataset.newsletterSource || document.body.dataset.intent || inferIntent(),
    page_url: window.location.href,
    path: window.location.pathname,
    referrer: document.referrer || "",
    session_id: sessionId,
    ga_client_id: gaClientId()
  };
}

function bindNewsletterForms() {
  document.querySelectorAll(".newsletter-form").forEach((newsletterFormElement) => {
    if (newsletterFormElement.dataset.bound === "true") return;
    newsletterFormElement.dataset.bound = "true";
    newsletterFormElement.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = readNewsletterForm(newsletterFormElement);
      const button = newsletterFormElement.querySelector("button[type='submit']");
      if (payload.company_website) {
        newsletterStatus(newsletterFormElement, "Inscription prise en compte.", "ok");
        return;
      }
      if (!payload.email.includes("@") || payload.email.length < 6) {
        newsletterStatus(newsletterFormElement, "Email invalide.", "error");
        track("newsletter_subscribe_error", { target: payload.audience, label: "email-invalide" });
        return;
      }
      if (!payload.consent) {
        newsletterStatus(newsletterFormElement, "Consentement requis.", "error");
        track("newsletter_subscribe_error", { target: payload.audience, label: "consentement-manquant" });
        return;
      }
      button.disabled = true;
      newsletterStatus(newsletterFormElement, "Inscription en cours...");
      track("newsletter_subscribe_attempt", { target: payload.audience, label: payload.source });
      try {
        const response = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Inscription impossible.");
        newsletterFormElement.reset();
        newsletterStatus(newsletterFormElement, "Inscription confirmee. Vous recevrez la veille ImmeubleAssur.", "ok");
        track("newsletter_subscribed", { target: payload.audience, label: payload.source, status: result.status || "active" });
      } catch (error) {
        newsletterStatus(newsletterFormElement, error.message || "Inscription impossible pour le moment.", "error");
        track("newsletter_subscribe_error", { target: payload.audience, label: error.message || "erreur" });
      } finally {
        button.disabled = false;
      }
    });
  });
}
applyIntentPrefill();
mountLeadBar();
mountFormAdvisor();
mountFormProof();
mountLeadValuePreview();
mountDiagnostic();
mountReadiness();
mountRiskRouter();
mountQuoteFastTrack();
bindNewsletterForms();
enhanceHeader();
bindScrollDepthTracking();
bindFormAbandonment();
bindBotSignalTracking();
bindGrowthTracking();
