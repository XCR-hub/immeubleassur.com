const form = document.querySelector("#lead-form");
const statusBox = document.querySelector(".form-status");

const requiredFields = ["name", "phone", "email", "profile", "property_type", "city"];
const sessionKey = "immeubleassur_session_id";
const attributionKey = "immeubleassur_attribution";
const sessionId = getSessionId();
captureAttribution();
let formStarted = false;
let formSubmitted = false;
let qualityEventSent = false;
let abandonEventSent = false;
const scrollDepthSent = new Set();

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
    landing_page: utm.landing_page || "",
    first_referrer: utm.first_referrer || ""
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
  bar.innerHTML = `<span>${label}: devis specialise</span><a class="button primary" data-track="sticky-devis" href="${routes[intent] || routes.website}">Devis rapide</a><a class="button secondary" data-track="sticky-phone" href="tel:+33180855786">Appeler</a>`;
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

function leadQualification(payload) {
  let score = 20;
  const reasons = [];
  const units = Number.parseInt(String(payload.units_count || "0").replace(/\D/g, ""), 10) || 0;
  const need = String(payload.need || "").trim();
  const profile = String(payload.profile || "").trim();
  const propertyType = String(payload.property_type || "").trim();
  const source = String(payload.source || "").trim();

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
  if (payload.message && payload.message.length > 40) {
    score += 10;
    addReason(reasons, "message detaille");
  }

  score = Math.min(score, 100);
  return { score, priority: priorityFromScore(score), reasons };
}

function leadQuality(payload) {
  return leadQualification(payload).score;
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
function applyIntentPrefill() {
  if (!form) return;
  const params = new URLSearchParams(window.location.search);
  const intent = (params.get("intent") || params.get("need") || "").toLowerCase();
  if (!intent) return;
  const needMap = {
    cno: "cno",
    pno: "pno",
    "pno-cno": "pno-cno",
    copropriete: "multirisque-immeuble",
    sci: "multirisque-immeuble",
    mixte: "audit-contrat",
    immeuble: "multirisque-immeuble"
  };
  const profileMap = {
    sci: "sci",
    copropriete: "syndic-professionnel",
    cno: "bailleur",
    pno: "bailleur",
    mixte: "bailleur"
  };
  const propertyMap = {
    cno: "lot-copropriete",
    pno: "logement-loue",
    copropriete: "immeuble-locatif",
    sci: "immeuble-locatif",
    mixte: "local-commercial",
    immeuble: "immeuble-locatif"
  };
  const setSelect = (name, value) => {
    const field = form.elements[name];
    if (!field || !value) return;
    if ([...field.options].some((option) => option.value === value)) field.value = value;
  };
  setSelect("need", needMap[intent]);
  setSelect("profile", profileMap[intent]);
  setSelect("property_type", propertyMap[intent]);
  form.dispatchEvent(new Event("change", { bubbles: true }));
}

function mountFormProof() {
  if (!form || form.querySelector(".ux-form-proof")) return;
  const anchor = form.querySelector(".form-advisor") || form.querySelector(".form-heading") || form.firstElementChild;
  const proof = document.createElement("div");
  proof.className = "ux-form-proof";
  proof.innerHTML = `<span>Rappel humain</span><span>CNO / PNO</span><span>Audit contrat</span><span>Sinistres</span>`;
  anchor.insertAdjacentElement("afterend", proof);
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
  abandonEventSent = true;
  track("lead_form_abandoned", {
    target: payload.need || "unknown",
    label: reason,
    score: String(leadQuality(payload))
  });
}

function bindFormAbandonment() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") trackFormAbandonment("visibility_hidden");
  });
  window.addEventListener("pagehide", () => trackFormAbandonment("pagehide"));
}
function bindGrowthTracking() {
  track("page_view", { target: document.title, label: document.body.dataset.intent || inferIntent() });

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

applyIntentPrefill();
mountLeadBar();
mountFormAdvisor();
mountFormProof();
mountRiskRouter();
enhanceHeader();
bindScrollDepthTracking();
bindFormAbandonment();
bindGrowthTracking();
