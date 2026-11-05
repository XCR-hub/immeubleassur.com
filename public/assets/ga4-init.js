function initializeGa4() {
  const measurementId = document.querySelector('meta[name="ia-ga4-measurement-id"]')?.content || "";
  if (!/^G-[A-Z0-9]+$/i.test(measurementId)) return;
  if (/^\/(?:admin[^/]*|espace-client|espace-assureur|questionnaire-immeuble|merci)(?:[/.]|$)/i.test(location.pathname)) return;
  const key = "immeubleassur_analytics_choice_v1";
  const maxAge = 180 * 86400000;
  let choice = "", configured = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved?.measurementId === measurementId && Date.now() - saved.at >= 0 && Date.now() - saved.at < maxAge
      && ["granted", "denied"].includes(saved.value)) choice = saved.value;
  } catch {}
  const cleanUrl = value => {
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : ""; } catch { return ""; }
  };
  const pageParams = () => ({
    page_location: location.origin + location.pathname,
    page_referrer: cleanUrl(document.referrer),
    page_title: document.title,
    send_to: measurementId
  });
  window.iaAnalyticsState = () => ({ granted: choice === "granted", transport: "browser" });
  window.iaTrackAnalytics = (eventType, data = {}) => {
    if (choice !== "granted") return;
    const names = { form_start: "form_start", form_submit_attempt: "form_submit", lead_created: "generate_lead",
      phone_click: "click", cta_click: "select_content", quote_router_continue: "quote_router_continue" };
    const name = names[eventType];
    if (!name) return;
    const params = pageParams();
    for (const field of ["lead_intent", "lead_need", "lead_profile", "property_type"]) {
      const value = String(data[field] || "");
      if (/^[a-z0-9-]{1,80}$/i.test(value)) params[field] = value;
    }
    window.gtag?.("event", name, params);
  };
  function start() {
    window["ga-disable-" + measurementId] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("consent", "update", { analytics_storage: "granted", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied" });
    if (configured) return;
    configured = true;
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: false, allow_google_signals: false,
      allow_ad_personalization_signals: false, page_location: location.origin + location.pathname });
    window.gtag("event", "page_view", pageParams());
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    script.dataset.iaGa4 = "1";
    document.head.append(script);
  }
  function clearCookies() {
    for (const item of document.cookie.split(";")) {
      const name = item.trim().split("=")[0];
      if (!/^_ga(?:_|$)|^_gid$/.test(name)) continue;
      for (const domain of ["", location.hostname, "." + location.hostname]) {
        document.cookie = name + "=; Max-Age=0; Path=/" + (domain ? "; Domain=" + domain : "") + "; SameSite=Lax";
      }
    }
  }
  const banner = document.createElement("section");
  banner.className = "analytics-choice";
  banner.setAttribute("aria-label", "Mesure d'audience");
  banner.innerHTML = '<p>Autoriser Google Analytics pour mesurer les visites et les demandes de devis ? Ce choix est facultatif.</p><div><button type="button" data-analytics-choice="granted">Accepter</button><button type="button" data-analytics-choice="denied">Refuser</button></div><a href="/confidentialite">En savoir plus</a>';
  banner.addEventListener("click", event => {
    const button = event.target.closest("[data-analytics-choice]");
    if (!button) return;
    choice = button.dataset.analyticsChoice;
    try { localStorage.setItem(key, JSON.stringify({ value: choice, at: Date.now(), measurementId })); } catch {}
    if (choice === "granted") start();
    else { window["ga-disable-" + measurementId] = true; clearCookies(); }
    banner.hidden = true;
  });
  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "analytics-settings";
  settings.textContent = "Mesure d'audience";
  settings.addEventListener("click", () => {
    banner.hidden = false;
    banner.querySelector("button").focus({ preventScroll: true });
  });
  (document.querySelector(".site-footer") || document.body).append(settings);
  document.body.append(banner);
  banner.hidden = Boolean(choice);
  if (choice === "granted") start();
}
initializeGa4();
