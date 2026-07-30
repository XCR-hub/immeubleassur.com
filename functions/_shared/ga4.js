const DEFAULT_ENDPOINT = "https://region1.google-analytics.com/mp/collect";
const GLOBAL_ENDPOINT = "https://www.google-analytics.com/mp/collect";

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gaConfig(env = {}) {
  const measurementId = clean(env.GA4_MEASUREMENT_ID || env.GOOGLE_GA4_MEASUREMENT_ID, 80);
  const apiSecret = clean(env.GA4_API_SECRET || env.GOOGLE_GA4_API_SECRET, 160);
  if (!measurementId || !apiSecret) return null;
  const endpoint = clean(env.GA4_ENDPOINT, 120) || (env.GA4_REGION === "global" ? GLOBAL_ENDPOINT : DEFAULT_ENDPOINT);
  return { measurementId, apiSecret, endpoint };
}

function parseGaCookie(cookieHeader = "") {
  const match = String(cookieHeader).match(/(?:^|;\s*)_ga=([^;]+)/);
  if (!match) return "";
  const value = decodeURIComponent(match[1]);
  const parts = value.split(".");
  if (parts.length >= 4) return `${parts[2]}.${parts[3]}`;
  return value.replace(/^GA\d+\.\d+\./, "");
}

function eventName(value) {
  const cleanName = clean(value, 40).replace(/[^a-zA-Z0-9_]/g, "_").replace(/^\d+/, "event_");
  return cleanName || "ia_event";
}

function unitsBucket(value) {
  const units = number(value, 0);
  if (units >= 40) return "40_plus";
  if (units >= 10) return "10_39";
  if (units >= 2) return "2_9";
  if (units >= 1) return "1";
  return "unknown";
}

function gaClientId({ payload = {}, request }) {
  return clean(payload.ga_client_id || payload.client_id || parseGaCookie(request?.headers?.get("Cookie") || "") || payload.session_id, 120);
}

function safeParamMap(params = {}) {
  const allowed = {
    page_location: clean(params.page_location || params.page_url, 500),
    page_referrer: clean(params.page_referrer || params.referrer, 500),
    page_title: clean(params.page_title, 300),
    link_url: clean(params.link_url || params.target, 300),
    link_text: clean(params.link_text || params.label, 120),
    form_id: clean(params.form_id || params.target, 80),
    session_id: clean(params.session_id, 120),
    experiment_id: clean(params.experiment_id, 80),
    experiment_variant: clean(params.experiment_variant, 80),
    experiment_label: clean(params.experiment_label, 120),
    source: clean(params.source, 120),
    lead_intent: clean(params.lead_intent || params.intent, 80),
    source_path: clean(params.source_path, 500),
    landing_path: clean(params.landing_path, 500),
    medium: clean(params.medium || params.utm_medium, 120),
    campaign: clean(params.campaign || params.utm_campaign, 180),
    term: clean(params.term || params.utm_term, 180),
    content: clean(params.content || params.utm_content, 180),
    lead_need: clean(params.lead_need || params.need, 80),
    lead_profile: clean(params.lead_profile || params.profile, 80),
    property_type: clean(params.property_type, 80),
    units_bucket: clean(params.units_bucket || unitsBucket(params.units_count), 40),
    lead_priority: clean(params.lead_priority || params.priority, 40),
    lead_score: number(params.lead_score || params.score, 0),
    lead_value_min: number(params.lead_value_min || params.value_min, 0),
    lead_value_max: number(params.lead_value_max || params.value_max, 0),
    revenue_band: clean(params.revenue_band, 80),
    sla_hours: number(params.sla_hours, 0),
    engagement_time_msec: Math.max(1, number(params.engagement_time_msec, 100))
  };
  return Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== "" && value !== 0));
}

export async function sendGa4Event({ env, request, eventName: name, payload = {}, params = {} }) {
  const config = gaConfig(env);
  if (!config) return { configured: false, skipped: "GA4_MEASUREMENT_ID/GA4_API_SECRET missing" };

  const clientId = gaClientId({ payload: { ...payload, ...params }, request });
  if (!clientId) return { configured: true, skipped: "client_id missing" };

  const query = new URLSearchParams({ measurement_id: config.measurementId, api_secret: config.apiSecret });
  const body = {
    client_id: clientId,
    non_personalized_ads: true,
    events: [{ name: eventName(name), params: safeParamMap({ ...payload, ...params }) }]
  };

  const response = await fetch(`${config.endpoint}?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { configured: true, ok: response.ok, status: response.status };
}

export function gaLeadParams({ payload = {}, record = {}, qualification = {}, reference = "" }) {
  const utm = payload.utm || record.utm || {};
  return {
    page_location: record.page_url || payload.page_url,
    page_referrer: record.referrer || payload.referrer,
    session_id: payload.session_id,
    experiment_id: record.experiment_id || payload.experiment_id || payload.experiment?.experiment_id,
    experiment_variant: record.experiment_variant || payload.experiment_variant || payload.experiment?.experiment_variant,
    experiment_label: record.experiment_label || payload.experiment_label || payload.experiment?.experiment_label,
    source: record.source || payload.source || utm.utm_source,
    lead_intent: record.intent || payload.intent || utm.intent,
    source_path: record.source_path || payload.source_path || utm.source_path,
    landing_path: record.landing_path || payload.landing_path || utm.landing_path,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_term: utm.utm_term,
    utm_content: utm.utm_content,
    lead_need: record.need || payload.need,
    lead_profile: record.profile || payload.profile,
    property_type: record.property_type || payload.property_type,
    units_count: record.units_count || payload.units_count,
    lead_priority: qualification.priority,
    lead_score: qualification.score,
    lead_value_min: record.value_estimate?.annual_premium_min || qualification.value_estimate?.annual_premium_min || payload.value_estimate?.annual_premium_min,
    lead_value_max: record.value_estimate?.annual_premium_max || qualification.value_estimate?.annual_premium_max || payload.value_estimate?.annual_premium_max,
    revenue_band: record.value_estimate?.band || qualification.value_estimate?.band || payload.value_estimate?.band,
    sla_hours: qualification.sla_hours || payload.sla_hours,
    form_id: "lead-form",
    link_text: reference ? "lead_created" : "lead",
    engagement_time_msec: 100
  };
}
