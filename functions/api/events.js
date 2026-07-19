const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const allowedEvents = new Set([
  "page_view",
  "cta_click",
  "form_start",
  "form_submit_attempt",
  "lead_created",
  "lead_submit_error",
  "lead_submit_local_backup",
  "phone_click",
  "email_click"
]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ success: false, error: "Binding D1 DB manquant" }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, error: "JSON invalide" }, 400);
  }

  const eventType = clean(payload.event_type, 80);
  if (!allowedEvents.has(eventType)) return json({ success: false, error: "Evenement invalide" }, 422);

  const now = new Date().toISOString();
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
  const userAgent = request.headers.get("User-Agent") || "";
  const context = {
    target: clean(payload.target, 240),
    label: clean(payload.label, 240),
    path: clean(payload.path, 500),
    referrer: clean(payload.referrer, 500),
    lead_reference: clean(payload.lead_reference, 80),
    score: clean(payload.score, 20),
    notification: clean(payload.notification, 80),
    viewport: clean(payload.viewport, 80)
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

  return json({ success: true });
}