import { sendGa4Event } from "../_shared/ga4.js";

const DEFAULT_CORS_ORIGIN = "https://immeubleassur.com";
const headers = {
  "Access-Control-Allow-Origin": DEFAULT_CORS_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Origin"
};

const allowedEvents = new Set([
  "page_view",
  "experiment_view",
  "cta_click",
  "form_start",
  "lead_intent_prefill",
  "lead_urgency_detected",
  "form_submit_attempt",
  "lead_created",
  "lead_submit_error",
  "lead_submit_local_backup",
  "lead_submit_rejected",
  "lead_duplicate_returned",
  "phone_click",
  "email_click",
  "form_quality_ready",
  "lead_value_hint_ready",
  "risk_router_select",
  "quote_router_view",
  "quote_router_select",
  "quote_router_continue",
  "diagnostic_select",
  "diagnostic_complete",
  "readiness_start",
  "readiness_update",
  "readiness_complete",
  "scroll_depth",
  "lead_form_abandoned",
  "lead_spam_blocked",
  "newsletter_subscribe_attempt",
  "newsletter_subscribed",
  "newsletter_subscribe_error",
  "newsletter_spam_blocked"
]);

const ga4EventNames = {
  page_view: "page_view",
  experiment_view: "ia_experiment_view",
  cta_click: "ia_cta_click",
  form_start: "form_start",
  lead_intent_prefill: "ia_lead_intent_prefill",
  lead_urgency_detected: "ia_lead_urgency_detected",
  form_submit_attempt: "ia_form_submit_attempt",
  lead_created: "ia_lead_created_client",
  lead_submit_error: "ia_lead_submit_error",
  lead_submit_local_backup: "ia_lead_local_backup",
  lead_submit_rejected: "ia_lead_submit_rejected",
  lead_duplicate_returned: "ia_lead_duplicate_returned",
  phone_click: "ia_phone_click",
  email_click: "ia_email_click",
  form_quality_ready: "ia_form_quality_ready",
  lead_value_hint_ready: "ia_lead_value_hint_ready",
  risk_router_select: "ia_risk_router_select",
  quote_router_view: "ia_quote_router_view",
  quote_router_select: "ia_quote_router_select",
  quote_router_continue: "ia_quote_router_continue",
  diagnostic_select: "ia_diagnostic_select",
  diagnostic_complete: "ia_diagnostic_complete",
  readiness_start: "ia_readiness_start",
  readiness_update: "ia_readiness_update",
  readiness_complete: "ia_readiness_complete",
  scroll_depth: "ia_scroll_depth",
  lead_form_abandoned: "ia_lead_form_abandoned",
  lead_spam_blocked: "ia_lead_spam_blocked",
  newsletter_subscribe_attempt: "ia_newsletter_subscribe_attempt",
  newsletter_subscribed: "ia_newsletter_subscribed",
  newsletter_subscribe_error: "ia_newsletter_subscribe_error",
  newsletter_spam_blocked: "ia_newsletter_spam_blocked"
};

function ga4NameFor(eventType) {
  return ga4EventNames[eventType] || "ia_event";
}
function json(body, status = 200, request = null, env = null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeadersFor(request, env) });
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function hostFrom(value) {
  const raw = clean(value, 700).toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw, "https://immeubleassur.com").hostname.toLowerCase();
  } catch {
    return "";
  }
}

function addAllowedHost(hosts, value) {
  const raw = clean(value, 700).toLowerCase();
  if (!raw) return;
  try {
    const host = raw.includes("://") ? new URL(raw).hostname : raw.split("/")[0].split(":")[0];
    if (host) hosts.add(host.toLowerCase());
  } catch {}
}

function allowedEventHosts(env, request) {
  const hosts = new Set(["immeubleassur.com", "www.immeubleassur.com", "localhost", "127.0.0.1", "192.168.1.70"]);
  for (const value of [env.SITE_ORIGIN, env.PUBLIC_SITE_URL, env.GOOGLE_SEARCH_CONSOLE_SITE_URL, request.headers.get("Host")]) {
    addAllowedHost(hosts, value);
  }
  for (const value of clean(env.ALLOWED_EVENT_HOSTS || env.EVENT_ALLOWED_HOSTS, 1000).split(/[;,]/)) {
    addAllowedHost(hosts, value);
  }
  return hosts;
}

function localEventHost(host) {
  return ["localhost", "127.0.0.1", "192.168.1.70"].includes(clean(host, 120).toLowerCase());
}

function absoluteHeaderUrl(value) {
  const raw = clean(value, 700);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function eventHeaderAllowed(value, env, request) {
  const parsed = absoluteHeaderUrl(value);
  if (!parsed) return false;
  const hostname = parsed.hostname.toLowerCase();
  if (!allowedEventHosts(env, request).has(hostname)) return false;
  return parsed.protocol === "https:" || localEventHost(hostname);
}

function corsOriginAllowed(origin, env, request) {
  return eventHeaderAllowed(origin, env, request);
}

function corsHeadersFor(request, env) {
  const next = { ...headers };
  const origin = clean(request?.headers?.get?.("Origin"), 500);
  if (corsOriginAllowed(origin, env, request)) next["Access-Control-Allow-Origin"] = origin;
  return next;
}

function requestOriginStatus(request, env) {
  const checks = [
    ["origin", request?.headers?.get?.("Origin")],
    ["referer", request?.headers?.get?.("Referer")]
  ];
  let present = false;
  for (const [label, value] of checks) {
    const raw = clean(value, 700);
    if (!raw) continue;
    present = true;
    const invalidStatus = label === "origin" ? "origin-evenement-invalide" : "referer-evenement-invalide";
    const protocolStatus = label === "origin" ? "origin-protocole-invalide" : "referer-protocole-invalide";
    const parsed = absoluteHeaderUrl(raw);
    if (!parsed) return { ok: false, status: invalidStatus, hostname: "" };
    const hostname = parsed.hostname.toLowerCase();
    if (!allowedEventHosts(env, request).has(hostname)) return { ok: false, status: invalidStatus, hostname };
    if (parsed.protocol !== "https:" && !localEventHost(hostname)) return { ok: false, status: protocolStatus, hostname };
  }
  return { ok: true, status: present ? "origin-evenement-ok" : "origin-evenement-absente" };
}

function trustedEventPage(payload, env, request) {
  const host = hostFrom(payload.page_url);
  return Boolean(host && allowedEventHosts(env, request).has(host));
}

function pagePath(payload) {
  const direct = clean(payload.path, 500);
  if (direct) return direct;
  try {
    return new URL(clean(payload.page_url, 700), "https://immeubleassur.com").pathname || "/";
  } catch {
    return "/";
  }
}

function suspiciousUserAgent(value) {
  return /bot|crawl|spider|curl|wget|python|scrapy|httpclient|go-http-client|headless|selenium|phantom|puppeteer|playwright/i.test(clean(value, 500));
}

function passiveTelemetryEvent(eventType) {
  return ["page_view", "experiment_view", "scroll_depth"].includes(eventType);
}

async function countRows(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql);
    const row = binds.length ? await statement.bind(...binds).first() : await statement.first();
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

async function shouldDropTelemetry(env, request, { eventType, payload, ip, userAgent }) {
  if (!trustedEventPage(payload, env, request)) return { drop: true, reason: "page-host-invalide" };
  const originStatus = requestOriginStatus(request, env);
  if (!originStatus.ok) return { drop: true, reason: originStatus.status };
  if (suspiciousUserAgent(userAgent)) return { drop: true, reason: "user-agent-robot" };

  const sessionId = clean(payload.session_id, 120);
  if (!sessionId && eventType !== "page_view") return { drop: true, reason: "session-absente" };

  if (ip) {
    const ipEvents = await countRows(env, `SELECT COUNT(*) AS count FROM site_events WHERE ip_address = ? AND created_at >= datetime('now', '-1 minutes')`, [clean(ip, 120)]);
    if (ipEvents >= 120) return { drop: true, reason: "volume-ip-evenements" };
  }

  if (sessionId) {
    const sessionEvents = await countRows(env, `SELECT COUNT(*) AS count FROM site_events WHERE session_id = ? AND created_at >= datetime('now', '-1 minutes')`, [sessionId]);
    if (sessionEvents >= 60) return { drop: true, reason: "volume-session-evenements" };
  }

  if (sessionId && passiveTelemetryEvent(eventType)) {
    const duplicates = await countRows(
      env,
      `SELECT COUNT(*) AS count FROM site_events WHERE session_id = ? AND event_type = ? AND COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') = ? AND created_at >= datetime('now', '-5 minutes')`,
      [sessionId, eventType, pagePath(payload)]
    );
    if (duplicates >= 3) return { drop: true, reason: "doublon-evenement-passif" };
  }

  return { drop: false, reason: "accepted" };
}

export async function onRequestOptions({ request, env }) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request, env) });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const reply = (body, status = 200) => json(body, status, request, env);
  if (!env.DB) return reply({ success: false, error: "Base SQLite indisponible" }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return reply({ success: false, error: "JSON invalide" }, 400);
  }

  const eventType = clean(payload.event_type, 80);
  if (!allowedEvents.has(eventType)) return reply({ success: false, error: "Evenement invalide" }, 422);

  const now = new Date().toISOString();
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
  const userAgent = request.headers.get("User-Agent") || "";
  const telemetryGuard = await shouldDropTelemetry(env, request, { eventType, payload, ip, userAgent });
  if (telemetryGuard.drop) return reply({ success: true, sampled: false, reason: "telemetry-filtered", filter: telemetryGuard.reason });

  const context = {
    target: clean(payload.target, 240),
    label: clean(payload.label, 240),
    experiment_id: clean(payload.experiment_id, 80),
    experiment_variant: clean(payload.experiment_variant, 80),
    experiment_label: clean(payload.experiment_label, 120),
    path: clean(payload.path, 500),
    intent: clean(payload.intent, 80),
    source_path: clean(payload.source_path, 500),
    referrer: clean(payload.referrer, 500),
    lead_reference: clean(payload.lead_reference, 80),
    score: clean(payload.score, 20),
    notification: clean(payload.notification, 80),
    priority: clean(payload.priority, 80),
    next_action: clean(payload.next_action, 240),
    revenue_band: clean(payload.revenue_band, 80),
    lead_value_min: clean(payload.lead_value_min, 20),
    lead_value_max: clean(payload.lead_value_max, 20),
    sla_hours: clean(payload.sla_hours, 20),
    lead_urgency: clean(payload.lead_urgency, 80),
    lead_urgency_reason: clean(payload.lead_urgency_reason, 160),
    step: clean(payload.step, 80),
    route: clean(payload.route, 300),
    level: clean(payload.level, 80),
    missing: clean(payload.missing, 500),
    viewport: clean(payload.viewport, 80),
    source: clean(payload.source, 120),
    utm_source: clean(payload.utm_source, 120),
    utm_medium: clean(payload.utm_medium, 120),
    utm_campaign: clean(payload.utm_campaign, 180),
    utm_term: clean(payload.utm_term, 180),
    utm_content: clean(payload.utm_content, 180),
    landing_page: clean(payload.landing_page, 500),
    first_referrer: clean(payload.first_referrer, 500),
    ga_client_id: clean(payload.ga_client_id, 120),
    page_title: clean(payload.page_title, 300),
    language: clean(payload.language, 40),
    gclid: clean(payload.gclid, 160),
    gbraid: clean(payload.gbraid, 160),
    wbraid: clean(payload.wbraid, 160),
    event_status: clean(payload.status, 80),
    challenge: clean(payload.challenge, 80),
    duplicate_reason: clean(payload.duplicate_reason || payload.label, 120)
  };

  await env.DB.prepare(
    `INSERT INTO site_events (
      id, event_type, page_url, target, session_id, lead_reference,
      payload, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      eventType,
      clean(payload.page_url, 500),
      context.target,
      clean(payload.session_id, 120),
      context.lead_reference,
      JSON.stringify(context),
      clean(ip, 120),
      clean(userAgent, 500),
      now
    )
    .run();

  const ga4Task = sendGa4Event({
    env,
    request,
    eventName: ga4NameFor(eventType),
    payload,
    params: {
      ...context,
      page_location: clean(payload.page_url, 500),
      page_referrer: context.referrer,
      link_url: context.target,
      link_text: context.label,
      lead_need: context.target,
      lead_score: context.score
    }
  }).catch(() => null);
  if (typeof waitUntil === "function") waitUntil(ga4Task);
  else await ga4Task;

  return reply({ success: true });
}

