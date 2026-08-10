const form = document.querySelector("#lead-form");
const statusBox = document.querySelector(".form-status");

const requiredFields = ["name", "phone", "profile", "property_type", "city"];
const sessionKey = "immeubleassur_session_id";
const attributionKey = "immeubleassur_attribution";
const experimentKey = "immeubleassur_cta_experiment";
const sessionId = getSessionId();
captureAttribution();
const ctaExperiment = getCtaExperiment();
let formStarted = false;
let formStartedAt = 0;
let formInteractionBaseline = 0;
let experimentViewSent = false;
let formSubmitted = false;
let qualityEventSent = false;
let abandonEventSent = false;
let valueHintEventSent = false;
let urgencyEventSent = false;
let formRescueTimer = 0;
let formRescueShown = false;
let formRescueDismissed = false;
const contentBridgeDismissKey = "immeubleassur_content_bridge_dismissed";
let contentLeadBridgeShown = false;
let contentLeadBridgeDismissed = sessionStorage.getItem(contentBridgeDismissKey) === "true";
const trafficNoClickDismissKey = "immeubleassur_traffic_no_click_dismissed";
let trafficNoClickInteracted = false;
let trafficNoClickShown = false;
let trafficNoClickTimer = 0;
let trafficNoClickSelectedUrgency = "standard";
let instantCallbackStarted = false;
let quoteRouterStallTimer = 0;
let quoteRouterContinued = false;
let botSignalFirstInteractionAt = 0;
let botSignalInteractionCount = 0;
let botSignalPointer = false;
let botSignalKeyboard = false;
const botSignalLoadedAt = Date.now();
const scrollDepthSent = new Set();

function isPrivateAppPage() {
  const path = window.location.pathname.toLowerCase();
  return path.includes("/admin") || path.includes("/merci") || path.includes("/espace-client");
}

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
  if (eventType === "form_start" && !formStartedAt) {
    formStartedAt = Date.now();
    formInteractionBaseline = botSignalInteractionCount;
  }
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

function currentPathWithQuery() {
  return `${window.location.pathname}${window.location.search}`.slice(0, 500);
}

function sameSitePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.hostname !== window.location.hostname) return "";
    return `${url.pathname}${url.search}`.slice(0, 500);
  } catch {
    return raw.startsWith("/") ? raw.slice(0, 500) : "";
  }
}

function querySourcePath() {
  const params = new URLSearchParams(window.location.search);
  return sameSitePath(params.get("source_path") || params.get("origin_path") || "");
}

function queryContentBridge() {
  const params = new URLSearchParams(window.location.search);
  const flag = String(params.get("content_bridge") || "").trim().toLowerCase();
  const contentBridge = ["1", "true", "yes", "pont"].includes(flag) ? "1" : "";
  const contentKind = String(params.get("content_kind") || params.get("content_level") || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
  return { content_bridge: contentBridge, content_kind: contentKind };
}

function routeWithAttribution(route, data = {}) {
  const url = new URL(route, window.location.origin);
  for (const [key, value] of Object.entries(data)) {
    if (value) url.searchParams.set(key, String(value).slice(0, 500));
  }
  return `${url.pathname}${url.search}`;
}

function normalizeLeadIntent(value) {
  const key = String(value || "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  const aliases = {
    "assurance-immeuble": "immeuble",
    "multirisque": "immeuble",
    "multirisque-immeuble": "immeuble",
    "mrh-immeuble": "immeuble",
    "dommages-ouvrage": "travaux",
    "dommage-ouvrage": "travaux",
    "do": "travaux",
    "renovation": "travaux",
    "local": "local-commercial",
    "commerce": "local-commercial",
    "mixte": "local-commercial",
    "immeuble-mixte": "local-commercial",
    "tarif": "prix",
    "comparateur": "prix",
    "comparaison": "prix",
    "audit": "audit-contrat",
    "resiliation": "sinistre",
    "refus": "sinistre",
    "sinistres": "sinistre",
    "actualite": "veille",
    "actualites": "veille",
    "news": "veille"
  };
  return aliases[key] || key;
}

function queryLeadIntent() {
  const params = new URLSearchParams(window.location.search);
  return normalizeLeadIntent(params.get("intent") || params.get("need") || "");
}

function currentLeadIntent() {
  return queryLeadIntent() || normalizeLeadIntent(document.body.dataset.intent) || normalizeLeadIntent(inferIntent());
}

function leadSourceFromAttribution(utm = {}) {
  const intent = normalizeLeadIntent(utm.intent) || currentLeadIntent();
  if (utm.utm_source) return utm.utm_source;
  if (intent && intent !== "website") return `intent:${intent}`.slice(0, 80);
  return document.body.dataset.intent || inferIntent() || "website";
}

function captureAttribution() {
  const params = new URLSearchParams(window.location.search);
  const current = Object.fromEntries(attributionKeys().map((key) => [key, params.get(key) || ""]).filter(([, value]) => value));
  const existing = parseStoredAttribution();
  const hasCurrent = Object.keys(current).length > 0;
  const intent = queryLeadIntent();
  const sourcePath = querySourcePath();
  const bridge = queryContentBridge();
  const next = {
    ...existing,
    utm: hasCurrent ? { ...(existing.utm || {}), ...current } : (existing.utm || {}),
    intent: intent || existing.intent || "",
    source_path: sourcePath || (intent ? currentPathWithQuery() : (existing.source_path || currentPathWithQuery())),
    content_bridge: bridge.content_bridge || existing.content_bridge || "",
    content_kind: bridge.content_kind || existing.content_kind || "",
    landing_path: existing.landing_path || window.location.pathname,
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
  const intent = queryLeadIntent();
  const sourcePath = querySourcePath();
  const bridge = queryContentBridge();
  return {
    ...(stored.utm || {}),
    ...current,
    intent: intent || stored.intent || "",
    source_path: sourcePath || stored.source_path || currentPathWithQuery(),
    content_bridge: bridge.content_bridge || stored.content_bridge || "",
    content_kind: bridge.content_kind || stored.content_kind || "",
    landing_path: stored.landing_path || window.location.pathname,
    landing_page: stored.landing_page || window.location.href,
    first_referrer: stored.first_referrer || document.referrer || ""
  };
}

function attributionPayload() {
  const utm = readUtm();
  const intent = normalizeLeadIntent(utm.intent) || currentLeadIntent();
  return {
    source: leadSourceFromAttribution(utm),
    intent,
    source_path: utm.source_path || currentPathWithQuery(),
    content_bridge: utm.content_bridge || "",
    content_kind: utm.content_kind || "",
    landing_path: utm.landing_path || window.location.pathname,
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

function conversionFormSource(formElement) {
  return String(formElement?.dataset?.conversionSource || "lead-form")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "")
    .slice(0, 80);
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

function resetTurnstileWidgets(scope = document) {
  const root = scope || document;
  if (!window.turnstile || !root.querySelectorAll) return;
  root.querySelectorAll(".cf-turnstile").forEach((widget) => {
    try {
      window.turnstile.reset(widget);
    } catch {
      try { window.turnstile.reset(); } catch {}
    }
  });
}

function turnstileSiteKey() {
  return document.querySelector(".cf-turnstile[data-sitekey]")?.dataset.sitekey || "";
}

function renderDynamicTurnstile(scope, retries = 8) {
  const root = scope || document;
  const widget = root.matches?.(".cf-turnstile[data-sitekey]") ? root : root.querySelector?.(".cf-turnstile[data-sitekey]");
  if (!widget || widget.dataset.dynamicRendered === "1") return;
  if (!window.turnstile?.render) {
    if (retries > 0) window.setTimeout(() => renderDynamicTurnstile(root, retries - 1), 500);
    return;
  }
  try {
    const widgetId = window.turnstile.render(widget, {
      sitekey: widget.dataset.sitekey,
      theme: widget.dataset.theme || "light",
      action: widget.dataset.action || "lead_form"
    });
    widget.dataset.dynamicRendered = "1";
    if (widgetId) widget.dataset.widgetId = widgetId;
  } catch {}
}

function turnstileResponseFromScope(scope) {
  const root = scope || document;
  const fieldValue = root.querySelector?.("[name='cf-turnstile-response']")?.value || "";
  if (fieldValue) return String(fieldValue).trim();
  const widget = root.querySelector?.(".cf-turnstile[data-widget-id]");
  if (!widget || !window.turnstile?.getResponse) return "";
  try {
    return String(window.turnstile.getResponse(widget.dataset.widgetId) || "").trim();
  } catch {
    return "";
  }
}

let turnstileLoadPromise = null;

function loadTurnstileOnDemand() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (turnstileLoadPromise) return turnstileLoadPromise;
  turnstileLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstileOnDemand = "1";
    script.addEventListener("load", () => {
      document.querySelectorAll(".cf-turnstile[data-sitekey]").forEach((widget) => renderDynamicTurnstile(widget));
      resolve(window.turnstile);
    }, { once: true });
    script.addEventListener("error", () => {
      turnstileLoadPromise = null;
      reject(new Error("Turnstile indisponible"));
    }, { once: true });
    document.head.append(script);
  });
  return turnstileLoadPromise;
}

function waitForTurnstileToken(scope, timeoutMs = 10000) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const token = turnstileResponseFromScope(scope);
      if (token) return resolve(token);
      if (Date.now() - startedAt >= timeoutMs) return resolve("");
      window.setTimeout(check, 200);
    };
    check();
  });
}

async function ensureTurnstileToken(scope) {
  const widget = scope?.querySelector?.(".cf-turnstile[data-sitekey]");
  if (!widget) return true;
  if (turnstileResponseFromScope(scope)) return true;
  try {
    await loadTurnstileOnDemand();
    renderDynamicTurnstile(widget);
    return Boolean(await waitForTurnstileToken(scope));
  } catch {
    return false;
  }
}

function bindTurnstileOnDemand() {
  document.querySelectorAll(".cf-turnstile[data-sitekey]").forEach((widget) => {
    const protectedForm = widget.closest("form");
    if (!protectedForm || protectedForm.dataset.turnstileOnDemand === "1") return;
    protectedForm.dataset.turnstileOnDemand = "1";
    const prime = () => loadTurnstileOnDemand().catch(() => {});
    protectedForm.addEventListener("focusin", prime, { once: true, passive: true });
    protectedForm.addEventListener("pointerdown", prime, { once: true, passive: true });
  });
}

function readForm(formElement) {
  const data = Object.fromEntries(new FormData(formElement).entries());
  const utm = readUtm();
  const attribution = attributionPayload();
  const turnstileResponse = String(data["cf-turnstile-response"] || "").trim();
  const payload = {
    name: String(data.name || "").trim(),
    phone: String(data.phone || "").trim(),
    email: String(data.email || "").trim().toLowerCase(),
    profile: String(data.profile || "").trim(),
    property_type: String(data.property_type || "").trim(),
    city: String(data.city || "").trim(),
    units_count: String(data.units_count || "").trim(),
    need: String(data.need || "multirisque-immeuble").trim(),
    message: String(data.message || "").trim(),
    submission_mode: String(formElement.dataset.submissionMode || data.submission_mode || "").trim(),
    consent: data.consent === "on",
    company_website: String(data.company_website || "").trim(),
    turnstile_token: turnstileResponse,
    "cf-turnstile-response": turnstileResponse,
    source: attribution.source,
    form_source: conversionFormSource(formElement),
    intent: attribution.intent,
    source_path: attribution.source_path,
    content_bridge: attribution.content_bridge,
    content_kind: attribution.content_kind,
    landing_path: attribution.landing_path,
    page_url: window.location.href,
    referrer: document.referrer || "",
    session_id: sessionId,
    ga_client_id: gaClientId(),
    page_title: document.title,
    anti_bot: botSignalPayload(),
    ...experimentPayload(),
    experiment: experimentPayload(),
    utm: { ...utm, intent: attribution.intent, source_path: attribution.source_path, landing_path: attribution.landing_path, content_bridge: attribution.content_bridge, content_kind: attribution.content_kind }
  };
  const urgency = leadUrgency(payload);
  return {
    ...payload,
    lead_urgency: urgency.level,
    lead_urgency_label: urgency.label,
    lead_urgency_reason: urgency.reason
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

function emailLooksValid(value) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function phoneLooksValid(value) {
  const length = String(value || "").replace(/\D/g, "").length;
  return length >= 9 && length <= 15;
}

function isExpressCallback(payload) {
  return String(payload.submission_mode || "") === "express-callback";
}

function validationDetails(payload) {
  if (isExpressCallback(payload)) {
    const missing = [];
    const invalid = [];
    const phoneFilled = Boolean(payload.phone);
    const emailFilled = Boolean(payload.email);
    if (!phoneFilled && !emailFilled) missing.push("phone", "email");
    if (phoneFilled && !phoneLooksValid(payload.phone)) invalid.push("phone");
    if (emailFilled && !emailLooksValid(payload.email)) invalid.push("email");
    if (!payload.consent) missing.push("consent");
    const fields = [...missing, ...invalid];
    if (!fields.length) return { message: "", missing, invalid, step: "express-callback", blocking_fields: [] };
    const hasValidContact = phoneLooksValid(payload.phone) || emailLooksValid(payload.email);
    const message = !hasValidContact
      ? "Rappel express: telephone ou email valide requis."
      : !payload.consent
        ? "Cochez l'accord de contact."
        : invalid.includes("email")
          ? "Adresse email invalide."
          : "Numero de telephone invalide.";
    return { message, missing, invalid, step: "express-callback", blocking_fields: fields, labels: fields.map((field) => fieldLabels[field] || field) };
  }

  const missing = requiredFields.filter((field) => !payload[field]);
  const invalid = [];
  if (payload.email && !emailLooksValid(payload.email)) invalid.push("email");
  if (!missing.includes("phone") && !phoneLooksValid(payload.phone)) invalid.push("phone");
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

const LOCAL_LEAD_FALLBACK_MARKER = "lead-local-fallback-privacy-v2";
const LOCAL_LEAD_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;
function purgeLocalLeadBackups() {
  try {
    const key = "immeubleassur_pending_leads";
    const now = Date.now();
    const rows = JSON.parse(localStorage.getItem(key) || "[]");
    const valid = Array.isArray(rows) ? rows.filter((row) => Date.parse(row.expires_at || "") > now) : [];
    if (valid.length) localStorage.setItem(key, JSON.stringify(valid.slice(-5)));
    else localStorage.removeItem(key);
  } catch {}
}
function localBackup(payload, result) {
  try {
    purgeLocalLeadBackups();
    const key = "immeubleassur_pending_leads";
    const now = Date.now();
    const rows = JSON.parse(localStorage.getItem(key) || "[]");
    const valid = Array.isArray(rows) ? rows : [];
    valid.push({ payload, result, marker: LOCAL_LEAD_FALLBACK_MARKER, saved_at: new Date(now).toISOString(), expires_at: new Date(now + LOCAL_LEAD_FALLBACK_TTL_MS).toISOString() });
    localStorage.setItem(key, JSON.stringify(valid.slice(-5)));
  } catch {}
}
purgeLocalLeadBackups();
function inferIntent() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("cno")) return "cno";
  if (path.includes("pno")) return "pno";
  if (path.includes("copro")) return "copropriete";
  if (path.includes("sci")) return "sci";
  if (path.includes("dommages-ouvrage") || path.includes("travaux") || path.includes("renovation")) return "travaux";
  if (path.includes("local-commercial") || path.includes("immeuble-mixte") || path.includes("commerce")) return "local-commercial";
  if (path.includes("sinistre") || path.includes("resiliation") || path.includes("refus")) return "sinistre";
  if (path.includes("comparateur") || path.includes("prix") || path.includes("tarif")) return "prix";
  if (path.includes("veille") || path.includes("/news/")) return "veille";
  if (path.includes("audit")) return "audit-contrat";
  if (path.includes("devis")) return "devis";
  if (path.includes("immeuble")) return "immeuble";
  return "website";
}

function intentLabel(intent) {
  return ({
    cno: "CNO",
    pno: "PNO",
    "pno-cno": "PNO/CNO",
    copropriete: "Copropriete",
    sci: "SCI",
    travaux: "Travaux",
    "local-commercial": "Local commercial",
    prix: "Prix",
    sinistre: "Sinistre",
    veille: "Veille",
    devis: "Devis",
    "audit-contrat": "Audit",
    immeuble: "Immeuble"
  })[intent] || "Immeuble";
}

function leadConversionRoutes() {
  return {
    cno: "/devis-pno-cno?intent=cno",
    pno: "/devis-pno-cno?intent=pno",
    "pno-cno": "/devis-pno-cno?intent=pno-cno",
    copropriete: "/devis-assurance-immeuble?intent=copropriete",
    sci: "/devis-assurance-immeuble?intent=sci",
    travaux: "/devis-assurance-immeuble?intent=travaux",
    "local-commercial": "/devis-assurance-immeuble?intent=local-commercial",
    prix: "/devis-assurance-immeuble?intent=prix",
    sinistre: "/devis-assurance-immeuble?intent=sinistre",
    veille: "/devis-assurance-immeuble?intent=veille",
    devis: "/devis-assurance-immeuble?intent=devis",
    "audit-contrat": "/devis-assurance-immeuble?intent=audit-contrat",
    immeuble: "/devis-assurance-immeuble?intent=immeuble",
    website: "/devis-assurance-immeuble"
  };
}

function mountLeadBar() {
  if (document.querySelector(".lead-action-bar") || isPrivateAppPage()) return;
  document.body.dataset.intent = currentLeadIntent();
  const intent = document.body.dataset.intent;
  const label = intentLabel(intent);
  const routes = leadConversionRoutes();
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

function leadUrgency(payload = {}) {
  const intent = payload.intent || currentLeadIntent();
  const text = `${payload.message || ""} ${payload.need || ""} ${payload.property_type || ""} ${payload.source || ""} ${intent}`.toLowerCase();
  const units = unitCount(payload.units_count);
  if (/sinistre|degat|resili|refus|mise en demeure|sans assurance|urgent|aujourd|demain|echeance proche/.test(text)) {
    return { level: "immediate", label: "Urgence immediate", reason: "sinistre/resiliation/echeance", sla_hours: 2, score_boost: 12 };
  }
  if (/echeance|preavis|travaux|chantier|ravalement|toiture|dommages-ouvrage|local-commercial/.test(text) || units >= 10) {
    return { level: "this-month", label: "A traiter ce mois-ci", reason: "echeance/travaux/immeuble multi-lots", sla_hours: 6, score_boost: 8 };
  }
  if (/prix|tarif|comparateur|devis|audit|veille/.test(text)) {
    return { level: "quote-ready", label: "Devis a cadrer", reason: "comparaison/prix/audit", sla_hours: 24, score_boost: 4 };
  }
  return { level: "standard", label: "Qualification standard", reason: "information minimale", sla_hours: 48, score_boost: 0 };
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

function slaHoursFor(score, valueEstimate, urgency = null) {
  const maxValue = Number(valueEstimate?.annual_premium_max || 0);
  let base = 48;
  if (score >= 85 || maxValue >= 9000) base = 2;
  else if (score >= 70 || maxValue >= 3500) base = 6;
  else if (score >= 45 || maxValue >= 1200) base = 24;
  return urgency?.sla_hours ? Math.min(base, urgency.sla_hours) : base;
}
function leadQualification(payload) {
  let score = 20;
  const reasons = [];
  const units = unitCount(payload.units_count);
  const need = String(payload.need || "").trim();
  const profile = String(payload.profile || "").trim();
  const propertyType = String(payload.property_type || "").trim();
  const source = String(payload.source || "").trim();
  const urgency = leadUrgency(payload);
  const readinessText = `${payload.message || ""} ${source} ${payload.intent || ""} ${urgency.level}`;
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
  if (urgency.score_boost) {
    score += urgency.score_boost;
    addReason(reasons, `urgence ${urgency.level}`);
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
  return { score, priority: priorityFromScore(score), reasons, value_estimate: valueEstimate, sla_hours: slaHoursFor(score, valueEstimate, urgency), urgency };
}

function leadQuality(payload) {
  return leadQualification(payload).score;
}

function leadValueEventPayload(payload, qualification = leadQualification(payload)) {
  const estimate = qualification.value_estimate || leadValueEstimate(payload, qualification.score || 0);
  const urgency = qualification.urgency || leadUrgency(payload);
  return {
    score: String(qualification.score || ""),
    priority: qualification.priority || "",
    revenue_band: estimate.band || "",
    lead_value_min: String(estimate.annual_premium_min || ""),
    lead_value_max: String(estimate.annual_premium_max || ""),
    sla_hours: String(qualification.sla_hours || slaHoursFor(qualification.score || 0, estimate, urgency)),
    lead_urgency: urgency.level || "",
    lead_urgency_reason: urgency.reason || ""
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
  const urgency = qualification.urgency || leadUrgency(payload);
  preview.dataset.level = qualification.sla_hours <= 6 ? "urgent" : qualification.score >= 55 ? "ready" : "base";
  preview.dataset.urgency = urgency.level;
  preview.querySelector("[data-value-range]").textContent = `${formatEuro(estimate.annual_premium_min)} - ${formatEuro(estimate.annual_premium_max)}/an`;
  preview.querySelector("[data-value-sla]").textContent = `Rappel ${qualification.sla_hours}h`;
  preview.querySelector("[data-value-urgency]").textContent = urgency.label;
  preview.querySelector("[data-value-docs]").textContent = documentChecklistFor(payload).join(" + ");
  preview.querySelector("[data-value-note]").textContent = urgency.level === "immediate"
    ? "Signal urgent detecte: le dossier doit etre traite avant les demandes standard."
    : qualification.score >= 70
      ? "Dossier lisible: ajoutez echeance ou sinistres pour accelerer la consultation."
      : "Fourchette indicative, ajustee apres analyse du risque et des garanties.";

  if (urgency.level !== "standard" && !urgencyEventSent) {
    urgencyEventSent = true;
    track("lead_urgency_detected", {
      target: payload.need || "unknown",
      label: urgency.level,
      ...leadValueEventPayload(payload, qualification)
    });
  }

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
  preview.innerHTML = `<div class="lead-value-preview-main"><span><strong data-value-range>0 EUR - 0 EUR/an</strong><small>Prime indicative</small></span><span><strong data-value-sla>Rappel 48h</strong><small>Priorite dossier</small></span><span><strong data-value-urgency>Qualification standard</strong><small>Urgence</small></span><span><strong data-value-docs>Contrat actuel</strong><small>Pieces cles</small></span></div><p data-value-note>Fourchette indicative, ajustee apres analyse du risque et des garanties.</p>`;
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
    sci: ["multirisque-immeuble", "audit-contrat"],
    immeuble: ["multirisque-immeuble"],
    devis: ["multirisque-immeuble", "audit-contrat"],
    prix: ["multirisque-immeuble", "audit-contrat"],
    travaux: ["dommages-ouvrage", "audit-contrat", "multirisque-immeuble"],
    veille: ["audit-contrat", "multirisque-immeuble"],
    sinistre: ["audit-contrat", "multirisque-immeuble"],
    "audit-contrat": ["audit-contrat", "multirisque-immeuble"],
    "local-commercial": ["multirisque-immeuble", "audit-contrat"],
    mixte: ["audit-contrat", "multirisque-immeuble"]
  },
  property_type: {
    "lot-copropriete": ["lot-copropriete", "copropriete"],
    "logement-vacant": ["logement-vacant", "immeuble-locatif"],
    "logement-loue": ["logement-loue", "immeuble-locatif"],
    "immeuble-locatif": ["immeuble-locatif", "mixte"],
    "local-commercial": ["local-commercial", "commerce", "mixte"],
    copropriete: ["copropriete", "lot-copropriete"],
    commerce: ["commerce", "local-commercial", "mixte"],
    mixte: ["mixte", "local-commercial", "commerce", "immeuble-locatif"]
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
  const intent = queryLeadIntent();
  if (!intent) return;
  const needMap = {
    cno: "cno",
    pno: "pno",
    "pno-cno": "pno-cno",
    copropriete: "copropriete",
    sci: "multirisque-immeuble",
    travaux: "dommages-ouvrage",
    "local-commercial": "multirisque-immeuble",
    prix: "multirisque-immeuble",
    devis: "multirisque-immeuble",
    veille: "audit-contrat",
    sinistre: "audit-contrat",
    audit: "audit-contrat",
    "audit-contrat": "audit-contrat",
    immeuble: "multirisque-immeuble"
  };
  const profileMap = {
    sci: "sci",
    copropriete: "syndic-professionnel",
    travaux: "syndic-professionnel",
    cno: "bailleur",
    pno: "bailleur",
    "pno-cno": "bailleur",
    "local-commercial": "bailleur",
    prix: "bailleur",
    devis: "bailleur",
    veille: "bailleur",
    sinistre: "bailleur",
    mixte: "bailleur",
    audit: "bailleur",
    "audit-contrat": "bailleur"
  };
  const propertyMap = {
    cno: "lot-copropriete",
    pno: "logement-loue",
    "pno-cno": "lot-copropriete",
    copropriete: "copropriete",
    sci: "immeuble-locatif",
    travaux: "copropriete",
    "local-commercial": "local-commercial",
    prix: "immeuble-locatif",
    devis: "immeuble-locatif",
    veille: "immeuble-locatif",
    sinistre: "immeuble-locatif",
    mixte: "local-commercial",
    audit: "immeuble-locatif",
    "audit-contrat": "immeuble-locatif",
    immeuble: "immeuble-locatif"
  };
  const messageMap = {
    cno: "Je souhaite verifier la bonne assurance CNO pour un lot en copropriete.",
    pno: "Je souhaite verifier la bonne assurance PNO pour un logement loue ou vacant.",
    "pno-cno": "Je souhaite comparer PNO et CNO selon ma situation.",
    copropriete: "Je souhaite qualifier une copropriete avant consultation assureur.",
    sci: "Je souhaite organiser l'assurance d'un patrimoine en SCI.",
    travaux: "Je souhaite verifier les garanties avant ou apres travaux sur l'immeuble.",
    "local-commercial": "Je souhaite assurer un immeuble avec local commercial ou usage mixte.",
    prix: "Je souhaite comparer prix, franchises et garanties pour mon immeuble.",
    devis: "Je souhaite obtenir un devis specialise assurance immeuble.",
    veille: "Je souhaite transformer une information de veille en audit assurance immeuble.",
    sinistre: "Je souhaite analyser mon contrat apres sinistre, refus, resiliation ou aggravation.",
    "audit-contrat": "Je souhaite auditer mon contrat assurance immeuble actuel.",
    immeuble: "Je souhaite obtenir une analyse assurance immeuble multirisque."
  };
  const applied = applyFormValues({ need: needMap[intent], profile: profileMap[intent], property_type: propertyMap[intent], message: messageMap[intent] });
  if (applied) track("lead_intent_prefill", { target: intent, label: `${needMap[intent] || ""}:${propertyMap[intent] || ""}` });
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
  const prefillKey = (risk) => (risk === "mixte" ? "local-commercial" : risk);
  const prefillRow = (risk) => {
    const key = prefillKey(risk);
    const devisRows = homepageDevisRows();
    return { key, row: devisRows[key] || devisRows.immeuble };
  };
  const status = document.createElement("p");
  status.className = "risk-router-status";
  status.dataset.riskRouterStatus = "";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  result.insertAdjacentElement("afterend", status);
  const showStatus = (row, mode = "pret") => {
    status.innerHTML = `<strong>${row.title}</strong><span>${mode === "option" ? "Formulaire deja pre-rempli" : "Parcours pret"}: ${row.proof || "besoin, profil et message cadres"}. Ajoutez nom, telephone et ville.</span>`;
    status.classList.add("is-visible");
  };
  const prefillWithoutScroll = (risk, source) => {
    if (!form) return;
    const { key, row } = prefillRow(risk);
    if (!row) return;
    quoteRouterContinued = true;
    clearQuoteRouterStallTimer();
    applyFormValues({ ...row, message: quoteFastTrackMessage(row) });
    showStatus(row, "option");
    track("quote_router_continue", { target: key, label: row.title, route: row.href, mode: "router-option-prefill", source });
    if (!formStarted) {
      formStarted = true;
      track("form_start", { target: source, label: key });
    }
  };
  const render = (risk, shouldTrack = false) => {
    const row = rows[risk] || rows.cno;
    router.dataset.activeRisk = risk;
    options.forEach((option) => option.classList.toggle("is-active", option.dataset.risk === risk));
    result.innerHTML = `<p class="risk-result-label">Parcours prioritaire</p><h3>${row.title}</h3><p>${row.text}</p><ul>${row.items.map((item) => `<li>${item}</li>`).join("")}</ul><a class="button primary" data-track="risk-router-devis" data-risk-router-prefill="${prefillKey(risk)}" href="${row.href}">Pre-remplir mon devis</a>`;
    if (shouldTrack) {
      track("risk_router_select", { target: risk, label: row.title });
      prefillWithoutScroll(risk, "risk-router-option");
    }
  };
  result.addEventListener("click", (event) => {
    const link = event.target.closest("[data-risk-router-prefill]");
    if (!link) return;
    const key = link.dataset.riskRouterPrefill || prefillKey(router.dataset.activeRisk || "cno");
    const rows = homepageDevisRows();
    const row = rows[key] || rows.immeuble;
    if (!row) return;
    event.preventDefault();
    showStatus(row);
    startHeroPrefill(key, row, "risk-router-cta", "risk-router-devis", { payload: { router: "risk-router" } });
  });
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
    travaux: {
      label: "Travaux",
      title: "Travaux ou dommages ouvrage",
      text: "Verifier l'impact des travaux votes, de la renovation ou de la dommages ouvrage sur le contrat immeuble.",
      proof: "Pieces cles: devis travaux, PV d'AG, assureur actuel.",
      href: "/devis-assurance-immeuble?intent=travaux",
      need: "dommages-ouvrage",
      profile: "syndic-professionnel",
      property_type: "copropriete"
    },
    "local-commercial": {
      label: "Local",
      title: "Immeuble avec local commercial",
      text: "Qualifier l'activite, le bail, la vacance et les garanties du locataire avant consultation.",
      proof: "Pieces cles: bail, activite, extraction, assurance occupant.",
      href: "/devis-assurance-immeuble?intent=local-commercial",
      need: "multirisque-immeuble",
      profile: "bailleur",
      property_type: "local-commercial"
    },
    sinistre: {
      label: "Sinistre",
      title: "Sinistre, refus ou resiliation",
      text: "Analyser le contrat et l'historique avant de solliciter un nouvel assureur.",
      proof: "Pieces cles: releve sinistres, courriers assureur, travaux correctifs.",
      href: "/devis-assurance-immeuble?intent=sinistre",
      need: "audit-contrat",
      profile: "bailleur",
      property_type: "immeuble-locatif"
    },
    prix: {
      label: "Prix",
      title: "Comparer prix et garanties",
      text: "Comparer la prime avec franchises, plafonds, exclusions et qualite de gestion sinistre.",
      proof: "Pieces cles: appel de prime, contrat actuel, lots, surface.",
      href: "/devis-assurance-immeuble?intent=prix",
      need: "multirisque-immeuble",
      profile: "bailleur",
      property_type: "immeuble-locatif"
    },
    veille: {
      label: "Veille",
      title: "Transformer une veille en audit",
      text: "Relier une actualite assurance immeuble au contrat, aux garanties et aux actions utiles.",
      proof: "Pieces cles: contrat actuel, question identifiee, echeance.",
      href: "/devis-assurance-immeuble?intent=veille",
      need: "audit-contrat",
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
  const requested = currentLeadIntent();
  if (["cno", "pno", "copropriete", "sci", "immeuble", "travaux", "local-commercial", "sinistre", "prix", "veille"].includes(requested)) return requested;
  if (["audit", "audit-contrat"].includes(requested)) return "audit";
  if (requested === "devis" || requested === "website") return "immeuble";
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
  const nudgeText = shell.querySelector("[data-quote-fast-nudge-text]");
  if (nudgeText) nudgeText.textContent = `${row.proof} Besoin, profil et message deja cadres.`;
  const nudgeCta = shell.querySelector("[data-quote-fast-nudge-continue]");
  if (nudgeCta) {
    nudgeCta.href = row.href;
    nudgeCta.dataset.intent = key;
  }
  if (shouldTrack) {
    track("quote_router_select", { target: key, label: row.title, route: row.href, source: "quote-fast-track" });
    scheduleQuoteRouterStallRescue("quote-fast-track-select", key);
  }
}

function quoteFastTrackApply(row, messageOverride = "") {
  if (!form) return false;
  applyFormValues({ ...row, message: messageOverride || quoteFastTrackMessage(row) });
  return true;
}

function clearQuoteRouterStallTimer() {
  if (!quoteRouterStallTimer) return;
  window.clearTimeout(quoteRouterStallTimer);
  quoteRouterStallTimer = 0;
}

function scheduleQuoteRouterStallRescue(source, key, delay = 7600) {
  if (!isHomepage() || formStarted || formSubmitted || sessionStorage.getItem(trafficNoClickDismissKey) === "true") return;
  clearQuoteRouterStallTimer();
  quoteRouterStallTimer = window.setTimeout(() => {
    quoteRouterStallTimer = 0;
    if (quoteRouterContinued || formStarted || formSubmitted) return;
    showTrafficNoClickRescue("quote-router-stall", { ignoreInteraction: true, defaultIntent: key, source });
  }, delay);
}

function continueQuoteFastTrack(shell, rows, initial, event, source = "quote-fast-track") {
  const key = shell.dataset.activeIntent || initial;
  const row = rows[key] || rows.immeuble;
  quoteRouterContinued = true;
  clearQuoteRouterStallTimer();
  track("quote_router_continue", { target: key, label: row.title, route: row.href, mode: form ? "prefill" : "navigate", source });
  if (!quoteFastTrackApply(row)) return false;
  event?.preventDefault();
  if (!formStarted) {
    formStarted = true;
    track("form_start", { target: source, label: key });
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  const focusTarget = form.querySelector("input[name='name'], input[name='phone'], input[name='email']");
  focusTarget?.focus({ preventScroll: true });
  return true;
}

function observeQuoteFastTrackNudge(shell, initial) {
  if (!form || shell.dataset.quoteFastNudgeObserved === "1") return;
  shell.dataset.quoteFastNudgeObserved = "1";
  const markShown = () => {
    if (formStarted || shell.dataset.quoteFastNudgeShown === "1") return;
    shell.dataset.quoteFastNudgeShown = "1";
    const rows = quoteFastTrackRows();
    const key = shell.dataset.activeIntent || initial;
    const row = rows[key] || rows.immeuble;
    track("quote_router_view", { target: key, label: row.title, route: row.href, source: "quote-fast-nudge", mode: "nudge" });
    scheduleQuoteRouterStallRescue("quote-fast-nudge", key, 6200);
  };
  if (!("IntersectionObserver" in window)) {
    window.setTimeout(markShown, 2800);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35)) return;
    window.setTimeout(markShown, 900);
    observer.disconnect();
  }, { threshold: [0.35, 0.6] });
  observer.observe(shell);
}

function mountQuoteFastTrack() {
  if (isPrivateAppPage()) return;
  if (document.querySelector(".quote-fast-track")) return;
  const anchor = document.querySelector(".conversion-strip") || document.querySelector(".page-hero") || document.querySelector(".hero") || document.querySelector(".article-head");
  if (!anchor) return;
  const rows = quoteFastTrackRows();
  const initial = quoteFastTrackIntent();
  const shell = document.createElement("section");
  shell.className = "quote-fast-track band";
  shell.setAttribute("aria-label", "Acces rapide devis assurance immeuble");
  shell.innerHTML = `<div class="quote-fast-track-inner"><div class="quote-fast-copy"><p class="eyebrow dark">Devis immediat</p><h2>Aller directement au bon parcours assurance immeuble.</h2><p data-quote-fast-text></p><strong data-quote-fast-proof></strong></div><div class="quote-fast-panel"><div class="quote-fast-options" role="group" aria-label="Type de demande">${Object.entries(rows).map(([key, row]) => `<button type="button" data-quote-fast-option="${key}" aria-pressed="false">${row.label}</button>`).join("")}</div><div class="quote-fast-result"><span>Parcours recommande</span><h3 data-quote-fast-title></h3><a class="button primary" data-track="quote-fast-continue" data-quote-fast-continue href="/devis-assurance-immeuble">Continuer mon devis</a><a class="button secondary" data-track="quote-fast-phone" href="tel:+33180855786">Appeler maintenant</a></div><div class="quote-fast-nudge" data-quote-fast-nudge><span><strong>Parcours pret</strong><small data-quote-fast-nudge-text></small></span><a class="button secondary" data-track="quote-fast-nudge" data-quote-fast-nudge-continue href="/devis-assurance-immeuble">Pre-remplir ici</a></div></div></div>`;
  anchor.insertAdjacentElement("afterend", shell);
  renderQuoteFastTrack(shell, initial);
  track("quote_router_view", { target: initial, label: window.location.pathname });
  scheduleQuoteRouterStallRescue("quote-fast-track", initial, 11500);
  shell.querySelectorAll("[data-quote-fast-option]").forEach((button) => {
    button.addEventListener("click", () => renderQuoteFastTrack(shell, button.dataset.quoteFastOption, true));
  });
  shell.querySelector("[data-quote-fast-continue]")?.addEventListener("click", (event) => {
    continueQuoteFastTrack(shell, rows, initial, event, "quote-fast-track");
  });
  shell.querySelector("[data-quote-fast-nudge-continue]")?.addEventListener("click", (event) => {
    continueQuoteFastTrack(shell, rows, initial, event, "quote-fast-nudge");
  });
  observeQuoteFastTrackNudge(shell, initial);
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
        if (mark === 50) showContentLeadBridge("scroll-50");
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

function contentLeadBridgeKind() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("/blog/")) return "article";
  if (path === "/faq.html" || path.startsWith("/faq/")) return "faq";
  if (/^\/assurance-immeuble-[a-z0-9-]+\.html$/.test(path) && document.querySelector(".city-depth-band")) return "ville";
  if (path.includes("veille") || path.includes("/news/")) return "veille";
  if (path.includes("guide")) return "guide";
  return "contenu";
}

function contentLeadBridgeEligible() {
  const path = window.location.pathname.toLowerCase();
  if (contentLeadBridgeDismissed || contentLeadBridgeShown || formStarted || formSubmitted) return false;
  if (path.includes("/admin") || path.includes("/merci") || path.includes("/espace-client") || path.startsWith("/devis-") || path.includes("contact") || path.includes("confidentialite") || path.includes("mentions-legales")) return false;
  if (document.querySelector(".content-lead-bridge")) return false;
  return path.includes("/blog/") || path === "/faq.html" || path.startsWith("/faq/") || /^\/assurance-immeuble-[a-z0-9-]+\.html$/.test(path) || path.includes("guide") || path.includes("veille") || path.includes("/news/") || Boolean(document.querySelector(".rich-article, .article-layout, .faq-list, .city-depth-band, .content-expansion-band, .seo-opportunity-expansion"));
}

function contentLeadBridgeCopy(intent, kind) {
  if (["cno", "pno", "pno-cno"].includes(intent)) {
    return { title: "Transformer cette lecture PNO/CNO en devis", text: "Statut du lot, occupation, vacance et contrat immeuble peuvent etre cadres en une demande exploitable.", cta: "Preparer le devis PNO/CNO" };
  }
  if (intent === "sci") {
    return { title: "Cadrer l'assurance de la SCI", text: "Un dossier clair separe patrimoine, occupants, sinistres et contrats deja en place avant consultation.", cta: "Demander le devis SCI" };
  }
  if (intent === "sinistre") {
    return { title: "Verifier le contrat apres sinistre", text: "Chronologie, mesures correctives et historique 36 mois changent fortement la lecture assureur.", cta: "Lancer l'audit sinistre" };
  }
  if (intent === "prix") {
    return { title: "Comparer prix et garanties", text: "La prime seule ne suffit pas: franchises, plafonds et exclusions doivent etre compares avec le risque reel.", cta: "Obtenir une comparaison" };
  }
  if (intent === "travaux") {
    return { title: "Anticiper travaux et assurance", text: "Ravalement, toiture, dommages-ouvrage ou changement d'usage doivent etre presentes avant echeance.", cta: "Cadrer le devis travaux" };
  }
  if (intent === "local-commercial") {
    return { title: "Qualifier l'immeuble mixte", text: "Activite du commerce, baux, protections et assurances locataires doivent etre decrits sans approximation.", cta: "Demander le devis adapte" };
  }
  if (intent === "copropriete") {
    return { title: "Preparer le dossier copropriete", text: "PV, syndic, lots, parties communes et sinistres permettent une consultation plus rapide.", cta: "Demander le devis copro" };
  }
  return { title: kind === "ville" ? "Transformer cette recherche locale en devis" : "Transformer cette lecture en devis", text: "ImmeubleAssur structure les informations utiles pour limiter les allers-retours avec les assureurs.", cta: "Demander le devis" };
}

function contentLeadBridgePayload(reason, action = "") {
  const intent = currentLeadIntent();
  const kind = contentLeadBridgeKind();
  const route = routeWithAttribution(leadConversionRoutes()[intent] || leadConversionRoutes().website, {
    source_path: currentPathWithQuery(),
    content_bridge: "1",
    content_kind: kind
  });
  return {
    target: intent || "immeuble",
    label: reason,
    route,
    level: kind,
    content_bridge: "1",
    content_kind: kind,
    step: action,
    source_path: currentPathWithQuery()
  };
}

function showContentLeadBridge(reason = "lecture") {
  if (!contentLeadBridgeEligible()) return;
  const intent = currentLeadIntent();
  const kind = contentLeadBridgeKind();
  const route = routeWithAttribution(leadConversionRoutes()[intent] || leadConversionRoutes().website, {
    source_path: currentPathWithQuery(),
    content_bridge: "1",
    content_kind: kind
  });
  const copy = contentLeadBridgeCopy(intent, kind);
  const panel = document.createElement("aside");
  panel.className = "content-lead-bridge";
  panel.setAttribute("aria-label", "Suite devis assurance immeuble");
  panel.innerHTML = `<button class="content-lead-bridge-close" type="button" data-content-bridge-close aria-label="Fermer">&times;</button><p class="eyebrow dark">Suite utile</p><strong>${copy.title}</strong><span>${copy.text}</span><div class="content-lead-bridge-actions"><a class="button primary" data-content-bridge-quote data-track="content-bridge-devis" href="${route}">${copy.cta}</a><a class="button secondary" data-content-bridge-phone data-track="content-bridge-phone" href="tel:+33180855786">Appeler</a></div>`;
  document.body.append(panel);
  contentLeadBridgeShown = true;
  track("content_lead_bridge_shown", contentLeadBridgePayload(reason, "shown"));
  panel.querySelector("[data-content-bridge-quote]")?.addEventListener("click", () => {
    track("content_lead_bridge_quote_click", contentLeadBridgePayload(reason, "quote"));
  });
  panel.querySelector("[data-content-bridge-phone]")?.addEventListener("click", () => {
    track("content_lead_bridge_phone_click", contentLeadBridgePayload(reason, "phone"));
  });
  panel.querySelector("[data-content-bridge-close]")?.addEventListener("click", () => {
    contentLeadBridgeDismissed = true;
    sessionStorage.setItem(contentBridgeDismissKey, "true");
    panel.remove();
    track("content_lead_bridge_dismissed", contentLeadBridgePayload(reason, "dismissed"));
  });
}

function bindContentLeadBridge() {
  if (!contentLeadBridgeEligible()) return;
  window.setTimeout(() => showContentLeadBridge("lecture-20s"), 20000);
}

function trackFormAbandonment(reason) {
  if (!form || !formStarted || formSubmitted || abandonEventSent) return;
  let payload = readForm(form);
  const engagementMs = formStartedAt ? Math.max(0, Date.now() - formStartedAt) : 0;
  const interactions = Math.max(0, botSignalInteractionCount - formInteractionBaseline);
  const completedFields = [payload.name, payload.phone, payload.email, payload.city, payload.message].filter((value) => String(value || "").trim()).length;
  if (engagementMs < 3000 || interactions < 2 || completedFields < 2) return;
  const qualification = leadQualification(payload);
  abandonEventSent = true;
  track("lead_form_abandoned", {
    target: payload.need || "unknown",
    label: reason,
    qualified_abandonment: true,
    engagement_ms: engagementMs,
    interaction_count: interactions,
    completed_field_count: completedFields,
    ...leadValueEventPayload(payload, qualification)
  });
}

function bindFormAbandonment() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") trackFormAbandonment("visibility_hidden");
  });
  window.addEventListener("pagehide", () => trackFormAbandonment("pagehide"));
}

function clearFormRescueTimer() {
  if (!formRescueTimer) return;
  window.clearTimeout(formRescueTimer);
  formRescueTimer = 0;
}

function formHasRescueSignal(payload) {
  return Boolean(payload.name || payload.phone || payload.email || payload.city || payload.units_count || payload.message);
}

function formRescueTelemetry(payload, reason) {
  const qualification = leadQualification(payload);
  return {
    target: payload.need || "unknown",
    label: reason,
    ...leadValueEventPayload(payload, qualification)
  };
}

function showFormRescue(reason = "hesitation") {
  if (!form || formSubmitted || formRescueShown || formRescueDismissed) return;
  let payload = readForm(form);
  if ((!formStarted && reason !== "validation-error") || !formHasRescueSignal(payload)) return;

  const panel = document.createElement("div");
  panel.className = "form-rescue";
  panel.innerHTML = `<div><strong>Un conseiller peut finaliser avec vous.</strong><span>Rappel direct pour cadrer l'immeuble, les garanties et l'echeance.</span></div><div class="form-rescue-actions"><button class="button primary" type="submit" data-form-rescue-express="1">Rappel express</button><a class="button secondary" href="tel:+33180855786" data-form-rescue-phone>01 80 85 57 86</a><button class="button secondary form-rescue-close" type="button" data-form-rescue-close>Continuer</button></div>`;

  const anchor = form.querySelector(".form-status") || form.querySelector("button[type='submit']");
  if (anchor) anchor.insertAdjacentElement("beforebegin", panel);
  else form.append(panel);

  formRescueShown = true;
  track("lead_form_rescue_shown", formRescueTelemetry(payload, reason));

  panel.querySelector("[data-form-rescue-express]")?.addEventListener("click", () => {
    form.dataset.submissionMode = "express-callback";
    track("lead_form_rescue_express_click", { ...formRescueTelemetry(readForm(form), "express-callback"), source: "express-callback" });
  });
  panel.querySelector("[data-form-rescue-phone]")?.addEventListener("click", () => {
    track("lead_form_rescue_phone_click", formRescueTelemetry(readForm(form), "phone"));
  });
  panel.querySelector("[data-form-rescue-close]")?.addEventListener("click", () => {
    formRescueDismissed = true;
    panel.remove();
    track("lead_form_rescue_dismissed", formRescueTelemetry(readForm(form), "continue"));
  });
}

function scheduleFormRescue(reason = "inactivity") {
  if (!form || formSubmitted || formRescueShown || formRescueDismissed) return;
  clearFormRescueTimer();
  formRescueTimer = window.setTimeout(() => showFormRescue(reason), 14000);
}

function bindFormRescue() {
  if (!form) return;
  form.addEventListener("focusin", () => scheduleFormRescue("focus-hesitation"));
  form.addEventListener("input", () => scheduleFormRescue("input-hesitation"), { passive: true });
  form.addEventListener("change", () => scheduleFormRescue("change-hesitation"), { passive: true });
}
function bindBotSignalTracking() {
  if (!form) return;
  form.addEventListener("input", () => noteBotInteraction("input"), { passive: true });
  form.addEventListener("change", () => noteBotInteraction("input"), { passive: true });
  form.addEventListener("pointerdown", () => noteBotInteraction("pointer"), { passive: true });
  form.addEventListener("keydown", () => noteBotInteraction("keyboard"), { passive: true });
}

function isHomepage() {
  return window.location.pathname === "/" || window.location.pathname === "/index.html";
}


function heroIntentAcceleratorRows() {
  const rows = quoteFastTrackRows();
  return {
    immeuble: rows.immeuble,
    copropriete: rows.copropriete,
    "pno-cno": {
      ...rows.cno,
      label: "PNO/CNO",
      title: "PNO ou CNO a cadrer",
      text: "Lot loue, vacant ou non occupe: qualifier occupation, contrat immeuble et assurance occupant.",
      proof: "Pieces cles: occupation du lot, contrat immeuble, bail ou attestation occupant.",
      href: "/devis-pno-cno?intent=pno-cno",
      need: "pno-cno",
      profile: "bailleur",
      property_type: "lot-copropriete"
    },
    sci: rows.sci
  };
}

function heroIntentKeyFromCard(card) {
  const raw = `${card.dataset.heroIntent || ""} ${card.dataset.track || ""} ${card.getAttribute("href") || ""} ${card.textContent || ""}`.toLowerCase();
  if (raw.includes("pno") || raw.includes("cno")) return "pno-cno";
  if (raw.includes("copro")) return "copropriete";
  if (raw.includes("sci")) return "sci";
  if (raw.includes("immeuble")) return "immeuble";
  return "immeuble";
}

function heroActionIntentFromLink(link) {
  const raw = `${link.dataset.heroIntent || ""} ${link.dataset.track || ""} ${link.getAttribute("href") || ""} ${link.textContent || ""}`.toLowerCase();
  if (raw.includes("pno") || raw.includes("cno")) return "pno-cno";
  if (raw.includes("copro")) return "copropriete";
  if (raw.includes("sci")) return "sci";
  return "immeuble";
}

function updateHeroIntentStatuses(row, detail = "Formulaire pre-rempli: ajoutez nom, telephone et echeance.") {
  const statuses = [...new Set([...document.querySelectorAll("#hero-intent-status, [data-hero-intent-status]")])];
  statuses.forEach((status) => {
    status.innerHTML = `<strong>${row.title}</strong><span>${row.proof} ${detail}</span>`;
    status.classList.add("is-visible");
  });
}

function syncHeroFastTrack(key, row) {
  const fastTrack = document.querySelector(".quote-fast-track");
  const fastKey = key === "pno-cno" ? "cno" : key;
  const fastRows = quoteFastTrackRows();
  if (fastTrack && fastRows[fastKey]) renderQuoteFastTrack(fastTrack, fastKey, false);
  updateHeroIntentStatuses(row);
}

function startHeroPrefill(key, row, source, targetLabel, options = {}) {
  trafficNoClickInteracted = true;
  if (trafficNoClickTimer) window.clearTimeout(trafficNoClickTimer);
  quoteRouterContinued = true;
  clearQuoteRouterStallTimer();
  document.body.dataset.intent = key;
  quoteFastTrackApply(row, options.message || "");
  syncHeroFastTrack(key, row);
  const extraPayload = options.payload || {};
  track("quote_router_continue", { target: key, label: row.title, route: row.href, mode: "hero-prefill", source, ...extraPayload });
  if (!formStarted) {
    formStarted = true;
    track("form_start", { target: targetLabel, label: key, ...(options.formPayload || extraPayload) });
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  const focusTarget = form.querySelector("input[name='name'], input[name='phone'], input[name='email']");
  window.setTimeout(() => focusTarget?.focus({ preventScroll: true }), 260);
}

function bindHeroIntentAccelerator() {
  if (!isHomepage() || !form) return;
  const grid = document.querySelector(".hero-intent-grid");
  if (!grid || grid.dataset.heroAccelerator === "1") return;
  const cards = [...grid.querySelectorAll(".intent-card")];
  if (!cards.length) return;
  const rows = heroIntentAcceleratorRows();
  const status = document.createElement("p");
  status.id = "hero-intent-status";
  status.className = "hero-intent-status";
  status.dataset.heroIntentStatus = "hero-intent-grid";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  grid.dataset.heroAccelerator = "1";
  grid.insertAdjacentElement("afterend", status);

  cards.forEach((card) => {
    const key = heroIntentKeyFromCard(card);
    const row = rows[key];
    if (!row) return;
    card.dataset.heroIntent = key;
    card.setAttribute("aria-describedby", status.id);
    card.addEventListener("click", (event) => {
      event.preventDefault();
      trafficNoClickInteracted = true;
      if (trafficNoClickTimer) window.clearTimeout(trafficNoClickTimer);
      cards.forEach((item) => item.classList.toggle("is-active", item === card));
      track("quote_router_select", { target: key, label: row.title, route: row.href, source: "hero-intent-grid" });
      startHeroPrefill(key, row, "hero-intent-grid", "hero-intent-card");
    });
  });
}

function bindHeroActionAccelerator() {
  if (!isHomepage() || !form) return;
  const actions = document.querySelector(".hero-actions");
  if (!actions || actions.dataset.heroActionAccelerator === "1") return;
  const links = [...actions.querySelectorAll("a[data-track]")];
  if (!links.length) return;
  const rows = heroIntentAcceleratorRows();
  actions.dataset.heroActionAccelerator = "1";
  links.forEach((link) => {
    const key = heroActionIntentFromLink(link);
    const row = rows[key];
    if (!row) return;
    link.dataset.heroIntent = key;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      links.forEach((item) => item.classList.toggle("is-active", item === link));
      track("quote_router_select", { target: key, label: row.title, route: row.href, source: "hero-actions" });
      startHeroPrefill(key, row, "hero-actions", "hero-action");
    });
  });
}

function leadBarIntentKey(link) {
  const href = link?.getAttribute("href") || "";
  const requested = currentLeadIntent();
  if (href.includes("pno-cno") || requested === "pno" || requested === "cno") return requested === "pno" ? "pno" : "cno";
  if (["copropriete", "sci", "immeuble", "travaux", "local-commercial", "sinistre", "prix", "veille"].includes(requested)) return requested;
  if (["audit", "audit-contrat"].includes(requested)) return "audit";
  return "immeuble";
}

function bindLeadBarAccelerator() {
  if (!form) return;
  const bar = document.querySelector(".lead-action-bar");
  if (!bar || bar.dataset.leadBarAccelerator === "1") return;
  const quote = bar.querySelector("[data-track='sticky-devis']");
  if (!quote) return;
  const rows = quoteFastTrackRows();
  bar.dataset.leadBarAccelerator = "1";
  quote.addEventListener("click", (event) => {
    const key = leadBarIntentKey(quote);
    const row = rows[key] || rows.immeuble;
    event.preventDefault();
    quote.classList.add("is-active");
    track("quote_router_select", { target: key, label: row.title, route: row.href, source: "lead-action-bar" });
    startHeroPrefill(key, row, "lead-action-bar", "sticky-devis");
  });
}

function homepageDevisRows() {
  const rows = quoteFastTrackRows();
  const heroRows = heroIntentAcceleratorRows();
  return {
    ...rows,
    "pno-cno": heroRows["pno-cno"],
    mixte: rows["local-commercial"],
    "audit-contrat": rows.audit
  };
}

function homepageDevisIntentFromLink(link) {
  const href = link?.getAttribute("href") || "";
  const rows = homepageDevisRows();
  try {
    const url = new URL(href, window.location.origin);
    const intent = normalizeLeadIntent(url.searchParams.get("intent") || "");
    if (intent === "audit-contrat") return "audit";
    if (rows[intent]) return intent;
    if (intent === "pno" || intent === "cno") return intent;
    if (url.pathname.includes("pno-cno")) return "pno-cno";
    if (url.pathname.includes("audit")) return "audit";
  } catch (_) {}
  const raw = `${href} ${link?.dataset.track || ""} ${link?.textContent || ""}`.toLowerCase();
  if (raw.includes("pno") || raw.includes("cno")) return "pno-cno";
  if (raw.includes("copro")) return "copropriete";
  if (raw.includes("sci")) return "sci";
  if (raw.includes("audit")) return "audit";
  if (raw.includes("sinistre")) return "sinistre";
  if (raw.includes("mixte") || raw.includes("local")) return "local-commercial";
  return "immeuble";
}

function isHomepageDevisAcceleratorLink(link) {
  if (!link) return false;
  const href = link.getAttribute("href") || "";
  if (href.startsWith("tel:") || href.startsWith("mailto:") || href.startsWith("#")) return false;
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    return ["/devis-assurance-immeuble", "/devis-assurance-immeuble.html", "/devis-pno-cno", "/devis-pno-cno.html", "/audit-contrat-assurance-immeuble", "/audit-contrat-assurance-immeuble.html"].includes(url.pathname);
  } catch (_) {
    return false;
  }
}

function bindHomepageDecisionAccelerator() {
  if (!isHomepage() || !form) return;
  const shell = document.querySelector(".hero-decision-accelerator");
  if (!shell || shell.dataset.heroDecisionAccelerator === "1") return;
  const links = [...shell.querySelectorAll(".hero-decision-options a[href]")];
  if (!links.length) return;
  const rows = homepageDevisRows();
  const initialKey = rows[currentLeadIntent()] ? currentLeadIntent() : "immeuble";
  const initialRow = rows[initialKey] || rows.immeuble;
  const status = document.createElement("p");
  status.id = "hero-decision-status";
  status.className = "hero-intent-status hero-decision-status";
  status.dataset.heroIntentStatus = "hero-decision-accelerator";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  shell.dataset.heroDecisionAccelerator = "1";
  shell.append(status);
  track("quote_router_view", { target: initialKey, label: initialRow.title, route: initialRow.href, source: "homepage-decision-accelerator" });
  scheduleQuoteRouterStallRescue("homepage-decision-accelerator", initialKey, 9800);

  links.forEach((link) => {
    const key = homepageDevisIntentFromLink(link);
    const row = rows[key] || rows.immeuble;
    link.dataset.heroIntent = key;
    link.setAttribute("aria-describedby", status.id);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      links.forEach((item) => item.classList.toggle("is-active", item === link));
      track("quote_router_select", { target: key, label: row.title, route: row.href, source: "homepage-decision-accelerator" });
      startHeroPrefill(key, row, "homepage-decision-accelerator", link.dataset.track || "homepage-decision");
    });
  });
}
function bindHomepageDevisAccelerator() {
  if (!isHomepage() || !form || document.body.dataset.homepageDevisAccelerator === "1") return;
  document.body.dataset.homepageDevisAccelerator = "1";
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    const link = event.target.closest("a[href]");
    if (!isHomepageDevisAcceleratorLink(link)) return;
    const rows = homepageDevisRows();
    const key = homepageDevisIntentFromLink(link);
    const row = rows[key] || rows.immeuble;
    if (!row) return;
    event.preventDefault();
    link.dataset.homepageDevisAccelerator = "1";
    link.classList.add("is-active");
    track("quote_router_select", { target: key, label: row.title, route: row.href, source: "homepage-devis-accelerator" });
    startHeroPrefill(key, row, "homepage-devis-accelerator", link.dataset.track || "homepage-devis");
  });
}

function leadMagnetChecklistMessage(row) {
  return `${row.title}. Je souhaite recevoir la checklist des pieces utiles pour un devis assurance immeuble: contrat actuel, appel de prime, sinistres, nombre de lots, travaux, franchises et echeance. Merci de me rappeler pour completer le dossier.`;
}

function bindLeadMagnetAccelerator() {
  if (!isHomepage() || !form) return;
  const magnet = document.querySelector("[data-lead-magnet]");
  if (!magnet || magnet.dataset.leadMagnetBound === "1") return;
  magnet.dataset.leadMagnetBound = "1";
  magnet.addEventListener("click", () => {
    const rows = homepageDevisRows();
    const requested = currentLeadIntent();
    const key = rows[requested] ? requested : "audit";
    const row = rows[key] || rows.audit || rows.immeuble;
    if (!row) return;
    magnet.classList.add("is-active");
    track("lead_magnet_checklist_click", { target: key, label: "checklist-documents", route: row.href, source: "growth-lead-magnet" });
    startHeroPrefill(key, row, "growth-lead-magnet", "lead-magnet-checklist", {
      message: leadMagnetChecklistMessage(row),
      payload: { lead_magnet: "checklist-documents", source: "growth-lead-magnet" },
      formPayload: { lead_magnet: "checklist-documents" }
    });
  });
}
function trafficNoClickPayload(action, extra = {}) {
  const attribution = attributionPayload();
  return {
    target: action,
    label: currentLeadIntent(),
    source_origin: attribution.source || "website",
    urgency: extra.urgency || trafficNoClickSelectedUrgency,
    source_path: currentPathWithQuery(),
    content_kind: "homepage",
    step: "traffic-without-click",
    level: "homepage-rescue",
    ...extra
  };
}

function dismissTrafficNoClickRescue(reason) {
  const panel = document.querySelector(".traffic-no-click-rescue");
  if (panel) panel.remove();
  if (trafficNoClickTimer) window.clearTimeout(trafficNoClickTimer);
  trafficNoClickTimer = 0;
  sessionStorage.setItem(trafficNoClickDismissKey, "true");
  if (reason) track("traffic_without_click_dismissed", trafficNoClickPayload(reason));
}

function trafficNoClickIntentRows() {
  const rows = quoteFastTrackRows();
  const heroRows = heroIntentAcceleratorRows();
  return {
    immeuble: rows.immeuble,
    copropriete: rows.copropriete,
    "pno-cno": heroRows["pno-cno"],
    audit: rows.audit
  };
}

function trafficNoClickIntentKey() {
  const requested = currentLeadIntent();
  const rows = trafficNoClickIntentRows();
  if (rows[requested]) return requested;
  if (requested === "pno" || requested === "cno") return "pno-cno";
  return "immeuble";
}

function trafficNoClickUrgencyRows() {
  return {
    standard: { label: "Comparer", text: "Prix, garanties, franchises", message: "Priorite: obtenir un comparatif clair entre prime, franchises et garanties." },
    echeance: { label: "Echeance", text: "Contrat a revoir", message: "Priorite: comparer le contrat actuel avant echeance avec les exclusions et plafonds." },
    urgent: { label: "Urgent", text: "Sinistre, refus, sans assurance", message: "Priorite: rappel rapide car sinistre, resiliation, refus assureur ou echeance proche." }
  };
}

function trafficNoClickUrgencyMessage(key) {
  const rows = trafficNoClickUrgencyRows();
  return (rows[key] || rows.standard).message;
}

function trafficNoClickMessage(row, urgencyKey = trafficNoClickSelectedUrgency) {
  return `${quoteFastTrackMessage(row)} ${trafficNoClickUrgencyMessage(urgencyKey)}`;
}

function instantCallbackContact(value) {
  const contact = String(value || "").trim();
  if (contact.includes("@")) return { email: contact.toLowerCase(), phone: "" };
  return { email: "", phone: contact };
}

function instantCallbackStatus(formElement, message, type = "") {
  const box = formElement.querySelector("[data-instant-callback-status]");
  if (!box) return;
  box.textContent = message;
  box.className = `form-status ${type}`.trim();
}

function markInstantCallbackInvalid(formElement, details) {
  formElement.querySelectorAll("[data-invalid='true']").forEach((field) => {
    field.removeAttribute("data-invalid");
    field.removeAttribute("aria-invalid");
  });
  const blocking = details.blocking_fields || [];
  if (blocking.includes("phone") || blocking.includes("email")) {
    const contact = formElement.elements.contact;
    contact?.setAttribute("data-invalid", "true");
    contact?.setAttribute("aria-invalid", "true");
    contact?.focus({ preventScroll: true });
  }
  if (blocking.includes("consent")) {
    const consent = formElement.elements.consent;
    consent?.setAttribute("data-invalid", "true");
    consent?.setAttribute("aria-invalid", "true");
  }
}

function instantCallbackContext(formElement) {
  return formElement?.closest?.(".traffic-no-click-rescue, [data-instant-callback-context]") || formElement;
}

function instantCallbackPayload(formElement, panel = instantCallbackContext(formElement)) {
  const data = Object.fromEntries(new FormData(formElement).entries());
  const rows = trafficNoClickIntentRows();
  const selected = formElement.dataset.instantCallbackIntent || panel?.dataset.activeIntent || trafficNoClickIntentKey();
  const row = rows[selected] || rows.immeuble;
  const contact = instantCallbackContact(data.contact);
  const attribution = attributionPayload();
  const urgencyRows = trafficNoClickUrgencyRows();
  const urgencyRow = urgencyRows[trafficNoClickSelectedUrgency] || urgencyRows.standard;
  const source = formElement.dataset.instantCallbackSource || panel?.dataset.instantCallbackSource || "instant-callback";
  const contentKind = formElement.dataset.instantCallbackContentKind || panel?.dataset.instantCallbackContentKind || "homepage-rescue";
  const message = `${trafficNoClickMessage(row)} Rappel express depuis l'accueil, priorite ${urgencyRow.label}.`;
  return {
    name: "Rappel express",
    phone: contact.phone,
    email: contact.email,
    profile: row.profile || "bailleur",
    property_type: row.property_type || "immeuble-locatif",
    city: "",
    units_count: "",
    need: row.need || "multirisque-immeuble",
    message,
    submission_mode: "express-callback",
    consent: data.consent === "on",
    company_website: String(data.company_website || "").trim(),
    turnstile_token: turnstileResponseFromScope(formElement),
    "cf-turnstile-response": turnstileResponseFromScope(formElement),
    source,
    intent: selected,
    source_path: attribution.source_path,
    content_bridge: attribution.content_bridge,
    content_kind: contentKind,
    landing_path: attribution.landing_path,
    page_url: window.location.href,
    referrer: document.referrer || "",
    session_id: sessionId,
    ga_client_id: gaClientId(),
    page_title: document.title,
    anti_bot: botSignalPayload(),
    ...experimentPayload(),
    experiment: experimentPayload(),
    utm: { ...readUtm(), intent: selected, source_path: attribution.source_path, landing_path: attribution.landing_path, content_bridge: attribution.content_bridge, content_kind: contentKind }
  };
}

async function submitInstantCallback(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const panel = instantCallbackContext(formElement);
  let payload = instantCallbackPayload(formElement, panel);
  if (payload.company_website) {
    window.location.assign("/merci");
    return;
  }

  const validation = validationDetails(payload);
  if (validation.message) {
    instantCallbackStatus(formElement, validation.message, "error");
    markInstantCallbackInvalid(formElement, validation);
    track("lead_submit_error", { ...validationTelemetry(payload, validation), source: payload.source || "instant-callback" });
    return;
  }

  const submitButton = formElement.querySelector("button[type='submit']");
  submitButton.disabled = true;
  instantCallbackStatus(formElement, "Verification anti-robot...");
  if (!(await ensureTurnstileToken(formElement))) {
    instantCallbackStatus(formElement, "Verification anti-robot indisponible. Verifiez votre connexion puis recommencez.", "error");
    submitButton.disabled = false;
    return;
  }
  payload = instantCallbackPayload(formElement, panel);
  instantCallbackStatus(formElement, "Envoi du rappel express...");
  const qualification = leadQualification(payload);
  track("form_submit_attempt", { target: payload.need, label: payload.profile, source: payload.source || "instant-callback", ...leadValueEventPayload(payload, qualification) });

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

    if (result.duplicate) {
      instantCallbackStatus(formElement, `Demande deja recue. Reference ${result.reference}.`, "ok");
      track("lead_duplicate_returned", {
        lead_reference: result.reference,
        target: payload.need,
        label: result.duplicate_reason || "duplicate_recent",
        score: String(result.score || ""),
        source: payload.source || payload.submission_mode || "full-lead",
        source_path: payload.source_path || "",
        content_bridge: payload.content_bridge || "",
        content_kind: payload.content_kind || ""
      });
    } else {
      instantCallbackStatus(formElement, `Rappel express recu. Reference ${result.reference}.`, "ok");
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
        lead_urgency: result.lead_urgency || payload.lead_urgency || "",
        lead_urgency_reason: result.lead_urgency_reason || payload.lead_urgency_reason || "",
        source_path: payload.source_path || "",
        content_bridge: payload.content_bridge || "",
        content_kind: payload.content_kind || "",
        source: payload.source || "instant-callback",
        target: payload.need,
        label: payload.intent
      });
    }
    window.setTimeout(() => dismissTrafficNoClickRescue(""), 1800);
  } catch (error) {
    if (error.status && error.status < 500) {
      track("lead_submit_rejected", { target: payload.need, label: error.message, source: payload.source || payload.submission_mode || "full-lead", status: String(error.status), challenge: error.result?.challenge || "", turnstile: error.result?.turnstile || "" });
      instantCallbackStatus(formElement, error.message || "Demande rejetee. Verifiez puis recommencez.", "error");
      return;
    }
    const fallbackReference = `LOCAL-${Date.now().toString(36).toUpperCase()}`;
    localBackup(payload, { success: false, reference: fallbackReference, error: error.message });
    track("lead_submit_local_backup", { lead_reference: fallbackReference, target: payload.need, label: error.message, source: payload.source || "instant-callback" });
    instantCallbackStatus(formElement, `Connexion API indisponible. Demande sauvegardee (${fallbackReference}).`, "error");
  } finally {
    resetTurnstileWidgets(formElement);
    submitButton.disabled = false;
  }
}

function bindInstantCallbackForm(scope) {
  const miniForm = scope?.matches?.("[data-instant-callback-form]") ? scope : scope?.querySelector?.("[data-instant-callback-form]");
  if (!miniForm || miniForm.dataset.bound === "1") return;
  const context = instantCallbackContext(miniForm);
  miniForm.dataset.bound = "1";
  miniForm.addEventListener("focusin", () => {
    if (!instantCallbackStarted) {
      instantCallbackStarted = true;
      formStarted = true;
      const callbackSource = miniForm.dataset.instantCallbackSource || context?.dataset.instantCallbackSource || "instant-callback";
      track("form_start", { target: callbackSource, label: miniForm.dataset.instantCallbackIntent || context?.dataset.activeIntent || trafficNoClickIntentKey(), source: callbackSource, rescue_variant: context?.dataset.rescueVariant || trafficNoClickActiveVariant || "standard" });
    }
  });
  miniForm.addEventListener("input", () => noteBotInteraction("input"), { passive: true });
  miniForm.addEventListener("change", () => noteBotInteraction("input"), { passive: true });
  miniForm.addEventListener("pointerdown", () => noteBotInteraction("pointer"), { passive: true });
  miniForm.addEventListener("keydown", () => noteBotInteraction("keyboard"), { passive: true });
  miniForm.addEventListener("submit", submitInstantCallback);
  const turnstileWidget = miniForm.querySelector(".cf-turnstile[data-sitekey]");
  if (turnstileWidget) {
    const prime = () => loadTurnstileOnDemand().catch(() => {});
    miniForm.addEventListener("focusin", prime, { once: true, passive: true });
    miniForm.addEventListener("pointerdown", prime, { once: true, passive: true });
  }
}

function bindInstantCallbackForms(scope = document) {
  scope.querySelectorAll?.("[data-instant-callback-form]").forEach((miniForm) => bindInstantCallbackForm(miniForm));
}

function setTrafficNoClickUrgency(panel, key, shouldTrack = true) {
  const rows = trafficNoClickUrgencyRows();
  const selected = rows[key] ? key : "standard";
  const row = rows[selected];
  trafficNoClickSelectedUrgency = selected;
  panel.dataset.urgency = selected;
  panel.querySelectorAll("[data-traffic-no-click-urgency]").forEach((button) => {
    const active = button.dataset.trafficNoClickUrgency === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const detail = panel.querySelector("[data-traffic-no-click-urgency-detail]");
  if (detail) detail.textContent = row.message;
  if (shouldTrack) track("traffic_without_click_urgency_select", trafficNoClickPayload("urgency", { urgency: selected, label: row.label, detail: row.text }));
}

function setTrafficNoClickIntent(panel, key, shouldTrack = true) {
  const rows = trafficNoClickIntentRows();
  const selected = rows[key] ? key : trafficNoClickIntentKey();
  const row = rows[selected] || rows.immeuble;
  panel.dataset.activeIntent = selected;
  panel.querySelectorAll("[data-traffic-no-click-intent]").forEach((button) => {
    const active = button.dataset.trafficNoClickIntent === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (shouldTrack) track("quote_router_select", { target: selected, label: row.title, route: row.href, source: "traffic-no-click-rescue" });
}

function startTrafficNoClickPrefill(key) {
  const rows = trafficNoClickIntentRows();
  const selected = rows[key] ? key : trafficNoClickIntentKey();
  const row = rows[selected] || rows.immeuble;
  const urgencyRows = trafficNoClickUrgencyRows();
  const urgency = trafficNoClickSelectedUrgency;
  const urgencyRow = urgencyRows[urgency] || urgencyRows.standard;
  const rescuePayload = { urgency, urgency_label: urgencyRow.label, urgency_detail: urgencyRow.text, source: "traffic-no-click-rescue", rescue_variant: trafficNoClickActiveVariant || "standard" };
  trafficNoClickInteracted = true;
  quoteRouterContinued = true;
  clearQuoteRouterStallTimer();
  track("traffic_without_click_quote_click", { ...trafficNoClickPayload("quote", rescuePayload), target: selected, label: row.title, route: row.href });
  track("quote_router_select", { target: selected, label: row.title, route: row.href, ...rescuePayload });
  dismissTrafficNoClickRescue("");
  startHeroPrefill(selected, row, "traffic-no-click-rescue", "traffic-no-click-rescue", { message: trafficNoClickMessage(row, urgency), payload: rescuePayload });
}

function focusHomepageQuoteForm() {
  if (!form) return false;
  if (!formStarted) {
    formStarted = true;
    track("form_start", { target: "traffic-no-click-rescue", label: currentLeadIntent() });
  }
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  const focusTarget = form.querySelector("input[name='name'], input[name='phone'], input[name='email']");
  window.setTimeout(() => focusTarget?.focus(), 260);
  return true;
}

function trafficNoClickRescueCopy(variant = "standard") {
  if (variant === "source-quality-direct") {
    return {
      eyebrow: "Rappel prioritaire",
      title: "Un conseiller qualifie votre immeuble avec vous.",
      body: "Laissez un telephone ou un email. On traite lots, occupation, sinistres et echeance pendant le rappel.",
      label: "Telephone ou email *",
      placeholder: "06 12 34 56 78",
      submit: "Me rappeler maintenant",
      quote: "Pre-remplir le dossier",
      phone: "Appeler le specialiste"
    };
  }
  return {
    eyebrow: "Devis immeuble",
    title: "Recevoir un rappel sans remplir tout le dossier.",
    body: "Indiquez un telephone ou un email. Le conseiller completera profil, lots, garanties et echeance avec vous.",
    label: "Telephone ou email *",
    placeholder: "06 12 34 56 78",
    submit: "Rappel express",
    quote: "Pre-remplir le formulaire complet",
    phone: "Appeler"
  };
}

function showTrafficNoClickRescue(reason = "shown", options = {}) {
  const ignoreInteraction = options.ignoreInteraction === true;
  if (trafficNoClickShown || (!ignoreInteraction && trafficNoClickInteracted) || formStarted || formSubmitted) return;
  if (!isHomepage() || sessionStorage.getItem(trafficNoClickDismissKey) === "true") return;
  if (document.querySelector(".traffic-no-click-rescue")) return;
  const rows = trafficNoClickIntentRows();
  const urgencyRows = trafficNoClickUrgencyRows();
  const defaultIntent = options.defaultIntent && rows[options.defaultIntent] ? options.defaultIntent : trafficNoClickIntentKey();
  const defaultUrgency = options.defaultUrgency && urgencyRows[options.defaultUrgency] ? options.defaultUrgency : trafficNoClickSelectedUrgency;
  const variant = options.variant || "standard";
  const copy = trafficNoClickRescueCopy(variant);
  const intentButtons = Object.entries(rows).map(([key, row]) => `<button type="button" data-traffic-no-click-intent="${key}" aria-pressed="false"><strong>${row.label}</strong><span>${row.title}</span></button>`).join("");
  const urgencyButtons = Object.entries(urgencyRows).map(([key, row]) => `<button type="button" data-traffic-no-click-urgency="${key}" aria-pressed="false"><strong>${row.label}</strong><span>${row.text}</span></button>`).join("");
  const siteKey = turnstileSiteKey();
  const turnstileHtml = siteKey ? `<div class="turnstile-field instant-callback-turnstile"><div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="light" data-action="lead_form"></div></div>` : "";
  const panel = document.createElement("aside");
  trafficNoClickActiveVariant = variant;
  panel.className = "traffic-no-click-rescue";
  panel.dataset.activeIntent = defaultIntent;
  panel.dataset.rescueVariant = variant;
  panel.dataset.instantCallbackSource = options.source || "instant-callback";
  panel.dataset.instantCallbackContentKind = variant === "source-quality-direct" ? "homepage-source-quality-rescue" : "homepage-rescue";
  if (variant !== "standard") panel.dataset.variant = variant;
  panel.setAttribute("aria-label", "Acces rapide devis immeuble");
  panel.innerHTML = `<button class="traffic-no-click-close" type="button" data-traffic-no-click-close aria-label="Fermer">&times;</button><p class="eyebrow dark">${copy.eyebrow}</p><strong>${copy.title}</strong><span>${copy.body}</span><form class="instant-callback-form" data-instant-callback-form novalidate><input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" /><label>${copy.label}<input name="contact" autocomplete="tel" inputmode="email" required placeholder="${copy.placeholder}" /></label><label class="consent-row"><input type="checkbox" name="consent" required /><span>J'accepte d'etre recontacte pour mon devis immeuble.</span></label>${turnstileHtml}<button class="submit-button" type="submit" data-track="instant-callback-submit">${copy.submit}</button><p class="form-status" data-instant-callback-status role="status" aria-live="polite"></p></form><div class="traffic-no-click-intents" role="group" aria-label="Choisir le parcours devis">${intentButtons}</div><div class="traffic-no-click-urgency" role="group" aria-label="Priorite de rappel">${urgencyButtons}</div><small class="traffic-no-click-detail" data-traffic-no-click-urgency-detail></small><div class="traffic-no-click-actions"><a class="button secondary" data-track="traffic-no-click-devis" data-traffic-no-click-quote href="#lead-form">${copy.quote}</a><a class="button secondary" data-track="traffic-no-click-phone" data-traffic-no-click-phone href="tel:+33180855786">${copy.phone}</a></div>`;
  document.body.append(panel);
  trafficNoClickShown = true;
  bindInstantCallbackForm(panel);
  setTrafficNoClickIntent(panel, defaultIntent, false);
  setTrafficNoClickUrgency(panel, defaultUrgency, false);
  track("traffic_without_click_shown", trafficNoClickPayload(reason, { source: options.source || "instant-callback", rescue_variant: variant, default_intent: defaultIntent, default_urgency: defaultUrgency }));
  panel.querySelector("[data-traffic-no-click-close]")?.addEventListener("click", () => dismissTrafficNoClickRescue("closed"));
  panel.querySelectorAll("[data-traffic-no-click-urgency]").forEach((button) => {
    button.addEventListener("click", () => setTrafficNoClickUrgency(panel, button.dataset.trafficNoClickUrgency || "standard"));
  });
  panel.querySelectorAll("[data-traffic-no-click-intent]").forEach((button) => {
    button.addEventListener("click", () => setTrafficNoClickIntent(panel, button.dataset.trafficNoClickIntent || "immeuble"));
  });
  panel.querySelector("[data-traffic-no-click-quote]")?.addEventListener("click", (event) => {
    event.preventDefault();
    startTrafficNoClickPrefill(panel.dataset.activeIntent || trafficNoClickIntentKey());
  });
  panel.querySelector("[data-traffic-no-click-phone]")?.addEventListener("click", () => {
    trafficNoClickInteracted = true;
    track("traffic_without_click_phone_click", trafficNoClickPayload("phone"));
    dismissTrafficNoClickRescue("");
  });
}

function trafficNoClickConversionInteraction(event) {
  const target = event?.target;
  const control = target?.closest?.("#lead-form, .quote-fast-track, .hero-hot-quote, .hero-decision-accelerator, .hero-intent-grid, .hero-actions, .lead-action-bar, .growth-lead-magnet, .traffic-no-click-rescue");
  if (control) return true;
  const link = target?.closest?.("a[href]");
  const href = link?.getAttribute("href") || "";
  return href.startsWith("tel:") || href.includes("/devis-") || href.includes("/audit-contrat-assurance-immeuble");
}

function homepageSourceQualityRescueConfig() {
  const attribution = attributionPayload();
  const source = String(attribution.source || "website").toLowerCase();
  const hasCampaign = Boolean(attribution.utm_source || attribution.gclid || attribution.gbraid || attribution.wbraid);
  const directLike = !hasCampaign && (!attribution.first_referrer || source === "website" || source === "direct");
  const intentLike = source.startsWith("intent:");
  if (directLike) return { delay: 4200, source: "source-quality-homepage-gap", defaultIntent: currentLeadIntent() || "immeuble", defaultUrgency: "urgent", variant: "source-quality-direct" };
  if (intentLike) return { delay: 5200, source: "source-quality-intent-gap", defaultIntent: currentLeadIntent() || "immeuble", defaultUrgency: "echeance", variant: "source-quality-intent" };
  return { delay: 8500, source: "homepage-idle", defaultIntent: currentLeadIntent() || "immeuble", defaultUrgency: "standard", variant: "standard" };
}

function bindTrafficNoClickRescue() {
  if (!isHomepage() || sessionStorage.getItem(trafficNoClickDismissKey) === "true") return;
  const markInteraction = (event) => {
    if (!trafficNoClickConversionInteraction(event)) return;
    trafficNoClickInteracted = true;
    if (trafficNoClickTimer) window.clearTimeout(trafficNoClickTimer);
  };
  document.addEventListener("click", markInteraction, { capture: true });
  form?.addEventListener("focusin", markInteraction, { once: true });
  const rescue = homepageSourceQualityRescueConfig();
  trafficNoClickTimer = window.setTimeout(() => showTrafficNoClickRescue("no-click", rescue), rescue.delay);
}
function bindGrowthTracking() {
  track("page_view", { target: document.title, label: currentLeadIntent() });
  if (!experimentViewSent && !isPrivateAppPage()) {
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
    const formSource = conversionFormSource(form);
    track("form_start", { target: formSource, form_source: formSource });
  });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.submitter?.matches?.("[data-form-rescue-express]")) form.dataset.submissionMode = "express-callback";
  else delete form.dataset.submissionMode;
  let payload = readForm(form);

  if (payload.company_website) {
    window.location.assign("/merci");
    return;
  }

  const validation = validationDetails(payload);
  if (validation.message) {
    setStatus(validation.message, "error");
    markInvalidFields(form, validation);
    track("lead_submit_error", validationTelemetry(payload, validation));
    showFormRescue("validation-error");
    return;
  }
  clearInvalidFields(form);

  clearFormRescueTimer();
  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setStatus("Verification anti-robot...");
  if (!(await ensureTurnstileToken(form))) {
    setStatus("Verification anti-robot indisponible. Verifiez votre connexion puis recommencez.", "error");
    submitButton.disabled = false;
    return;
  }
  payload = readForm(form);
  setStatus("Transmission du dossier en cours...");
  const qualification = leadQualification(payload);
  track("form_submit_attempt", { target: payload.need, label: payload.profile, source: payload.submission_mode || "full-lead", ...leadValueEventPayload(payload, qualification) });

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

    form.reset();
    if (result.duplicate) {
      setStatus(`Demande deja recue. Reference ${result.reference}. Nous conservons le dossier prioritaire deja ouvert.`, "ok");
      track("lead_duplicate_returned", {
        lead_reference: result.reference,
        target: payload.need,
        label: result.duplicate_reason || "duplicate_recent",
        score: String(result.score || ""),
        source: payload.source || payload.submission_mode || "full-lead",
        source_path: payload.source_path || "",
        content_bridge: payload.content_bridge || "",
        content_kind: payload.content_kind || ""
      });
      return;
    }
    setStatus(payload.submission_mode === "express-callback" ? `Rappel express recu. Reference ${result.reference}. Un conseiller vous rappelle pour completer le dossier.` : `Demande recue. Reference ${result.reference}. Un conseiller vous rappelle rapidement.`, "ok");
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
      lead_urgency: result.lead_urgency || payload.lead_urgency || "",
      lead_urgency_reason: result.lead_urgency_reason || payload.lead_urgency_reason || "",
      source_path: payload.source_path || "",
      content_bridge: payload.content_bridge || "",
      content_kind: payload.content_kind || "",
      source: payload.submission_mode || "full-lead",
      target: payload.need,
      label: payload.city
    });
  } catch (error) {
    if (error.status && error.status < 500) {
      track("lead_submit_rejected", { target: payload.need, label: error.message, source: payload.source || payload.submission_mode || "full-lead", status: String(error.status), challenge: error.result?.challenge || "", turnstile: error.result?.turnstile || "" });
      setStatus(error.message || "Demande rejetee. Verifiez les champs puis recommencez.", "error");
      return;
    }
    const fallbackReference = `LOCAL-${Date.now().toString(36).toUpperCase()}`;
    localBackup(payload, { success: false, reference: fallbackReference, error: error.message });
    track("lead_submit_local_backup", { lead_reference: fallbackReference, target: payload.need, label: error.message, source: payload.source || payload.submission_mode || "full-lead" });
    setStatus(
      `Connexion API indisponible en local. Dossier sauvegarde dans ce navigateur (${fallbackReference}).`,
      "error"
    );
  } finally {
    resetTurnstileWidgets(form);
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
  const turnstileResponse = String(data["cf-turnstile-response"] || "").trim();
  return {
    email: String(data.email || "").trim().toLowerCase(),
    name: String(data.name || "").trim(),
    audience: String(data.audience || "assurance-immeuble").trim(),
    consent: data.consent === "on",
    company_website: String(data.company_website || "").trim(),
    turnstile_token: turnstileResponse,
    newsletter_turnstile_token: turnstileResponse,
    "cf-turnstile-response": turnstileResponse,
    source: formElement.dataset.newsletterSource || currentLeadIntent(),
    page_url: window.location.href,
    path: window.location.pathname,
    referrer: document.referrer || "",
    session_id: sessionId,
    ga_client_id: gaClientId(),
    page_title: document.title,
    anti_bot: botSignalPayload()
  };
}

function bindNewsletterForms() {
  document.querySelectorAll(".newsletter-form").forEach((newsletterFormElement) => {
    if (newsletterFormElement.dataset.bound === "true") return;
    newsletterFormElement.dataset.bound = "true";
    newsletterFormElement.addEventListener("submit", async (event) => {
      event.preventDefault();
      let payload = readNewsletterForm(newsletterFormElement);
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
      newsletterStatus(newsletterFormElement, "Verification anti-robot...");
      if (!(await ensureTurnstileToken(newsletterFormElement))) {
        newsletterStatus(newsletterFormElement, "Verification anti-robot indisponible. Verifiez votre connexion puis recommencez.", "error");
        button.disabled = false;
        return;
      }
      payload = readNewsletterForm(newsletterFormElement);
      newsletterStatus(newsletterFormElement, "Inscription en cours...");
      track("newsletter_subscribe_attempt", { target: payload.audience, label: payload.source });
      try {
        const response = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          const submitError = new Error(result.error || "Inscription impossible.");
          submitError.status = response.status;
          submitError.result = result;
          throw submitError;
        }
        newsletterFormElement.reset();
        resetTurnstileWidgets(newsletterFormElement);
        newsletterStatus(newsletterFormElement, "Inscription confirmee. Vous recevrez la veille ImmeubleAssur.", "ok");
        track("newsletter_subscribed", { target: payload.audience, label: payload.source, status: result.status || "active" });
      } catch (error) {
        newsletterStatus(newsletterFormElement, error.message || "Inscription impossible pour le moment.", "error");
        track("newsletter_subscribe_error", {
          target: payload.audience,
          label: error.message || "erreur",
          status: String(error.status || ""),
          challenge: error.result?.challenge || "",
          turnstile: error.result?.turnstile || ""
        });
      } finally {
        resetTurnstileWidgets(newsletterFormElement);
        button.disabled = false;
      }
    });
  });
}
applyIntentPrefill();
bindTurnstileOnDemand();
bindFormAbandonment();
bindBotSignalTracking();
bindHomepageDevisAccelerator();
bindInstantCallbackForms();
bindGrowthTracking();

// Split non-critical visual mounting from module evaluation. This keeps form,
// tracking and anti-spam listeners available immediately while preventing the
// first JavaScript task from accumulating avoidable DOM/layout work.
const mountInitialVisualEnhancements = () => {
  mountLeadBar();
  mountFormAdvisor();
  mountFormProof();
  bindNewsletterForms();
  enhanceHeader();
  bindHeroIntentAccelerator();
  bindHeroActionAccelerator();
  bindLeadBarAccelerator();
  bindHomepageDecisionAccelerator();
  bindLeadMagnetAccelerator();
};

if ('requestAnimationFrame' in window) {
  window.requestAnimationFrame(mountInitialVisualEnhancements);
} else {
  window.setTimeout(mountInitialVisualEnhancements, 0);
}

// Keep forms, anti-spam signals and above-the-fold interactions responsive.
// The remaining enhancements only enrich content below the fold or delayed
// rescue journeys, so let the browser finish its first render before mounting
// them. The timeout still guarantees initialization on busy/older browsers.
const mountDeferredEnhancements = () => {
  mountLeadValuePreview();
  mountDiagnostic();
  mountReadiness();
  mountRiskRouter();
  mountQuoteFastTrack();
  bindScrollDepthTracking();
  bindContentLeadBridge();
  bindTrafficNoClickRescue();
  bindFormRescue();
};

if ('requestIdleCallback' in window) {
  window.requestIdleCallback(mountDeferredEnhancements, { timeout: 1500 });
} else {
  window.setTimeout(mountDeferredEnhancements, 600);
}







