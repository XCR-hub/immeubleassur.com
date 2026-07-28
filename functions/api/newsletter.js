const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function emailValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(clean(value, 180));
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function esc(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function countRecentSubscriptions(env, ip) {
  if (!ip) return 0;
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM newsletter_subscribers WHERE ip_address = ? AND created_at >= datetime('now', '-10 minutes')`
    ).bind(clean(ip, 120)).first();
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

async function logNewsletterEvent(env, subscriberId, eventType, payload, now) {
  try {
    await env.DB.prepare(
      `INSERT INTO newsletter_events (id, subscriber_id, issue_id, event_type, payload, created_at)
       VALUES (?, ?, NULL, ?, ?, ?)`
    ).bind(crypto.randomUUID(), subscriberId || null, eventType, JSON.stringify(payload || {}), now).run();
  } catch {}
}

async function logSiteEvent(env, request, payload, eventType, now) {
  try {
    await env.DB.prepare(
      `INSERT INTO site_events (
        id, event_type, page_url, target, session_id, lead_reference,
        payload, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      eventType,
      clean(payload.page_url, 500),
      clean(payload.audience || "newsletter", 120),
      clean(payload.session_id, 120),
      JSON.stringify({
        target: clean(payload.audience || "newsletter", 120),
        label: clean(payload.source || "website", 180),
        path: clean(payload.path, 500),
        source: clean(payload.source || "website", 120),
        email_domain: clean(payload.email, 180).split("@").pop() || ""
      }),
      clean(request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "", 120),
      clean(request.headers.get("User-Agent") || "", 500),
      now
    ).run();
  } catch {}
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return html("<p>Base newsletter indisponible.</p>", 503);
  const url = new URL(request.url);
  const token = clean(url.searchParams.get("unsubscribe"), 120);
  if (!token) return html("<p>Parametre de desinscription manquant.</p>", 400);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT id, email FROM newsletter_subscribers WHERE unsubscribe_token = ? LIMIT 1`
  ).bind(token).first();
  if (!row) return html("<p>Lien de desinscription invalide ou deja traite.</p>", 404);
  await env.DB.prepare(
    `UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = ?, updated_at = ? WHERE id = ?`
  ).bind(now, now, row.id).run();
  await logNewsletterEvent(env, row.id, "unsubscribed", { email: row.email }, now);
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Desinscription newsletter</title></head><body><main style="font-family:system-ui;max-width:720px;margin:48px auto;padding:24px"><h1>Desinscription prise en compte</h1><p>L'adresse ${esc(row.email)} ne recevra plus la veille ImmeubleAssur.</p><p><a href="/">Retour au site</a></p></main></body></html>`);
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ success: false, error: "Binding D1 DB manquant" }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, error: "JSON invalide" }, 400);
  }

  const now = new Date().toISOString();
  const ip = clean(request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "", 120);
  const userAgent = clean(request.headers.get("User-Agent") || "", 500);

  if (clean(payload.company_website)) {
    await logSiteEvent(env, request, payload, "newsletter_spam_blocked", now);
    return json({ success: true, status: "filtered" });
  }

  if (!emailValid(payload.email)) return json({ success: false, error: "Email invalide" }, 422);
  if (payload.consent !== true) return json({ success: false, error: "Consentement requis" }, 422);
  if (await countRecentSubscriptions(env, ip) >= 5) {
    await logSiteEvent(env, request, payload, "newsletter_spam_blocked", now);
    return json({ success: false, error: "Trop de tentatives. Reessayez plus tard." }, 429);
  }

  const id = crypto.randomUUID();
  const token = crypto.randomUUID().replaceAll("-", "");
  const email = clean(payload.email, 180).toLowerCase();
  const consentText = "J'accepte de recevoir la veille assurance immeuble ImmeubleAssur et je peux me desinscrire a tout moment.";

  await env.DB.prepare(
    `INSERT INTO newsletter_subscribers (
      id, email, name, audience, status, source, consent_text, unsubscribe_token,
      ip_address, user_agent, created_at, updated_at, confirmed_at, unsubscribed_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      audience = excluded.audience,
      status = 'active',
      source = excluded.source,
      consent_text = excluded.consent_text,
      ip_address = excluded.ip_address,
      user_agent = excluded.user_agent,
      updated_at = excluded.updated_at,
      confirmed_at = COALESCE(newsletter_subscribers.confirmed_at, excluded.confirmed_at),
      unsubscribed_at = NULL`
  ).bind(
    id,
    email,
    clean(payload.name, 160),
    clean(payload.audience || "assurance-immeuble", 120),
    clean(payload.source || "website", 120),
    consentText,
    token,
    ip,
    userAgent,
    now,
    now,
    now
  ).run();

  const subscriber = await env.DB.prepare(`SELECT id, email FROM newsletter_subscribers WHERE email = ? LIMIT 1`).bind(email).first();
  await logNewsletterEvent(env, subscriber?.id || id, "subscribed", { source: clean(payload.source || "website", 120), audience: clean(payload.audience, 120) }, now);
  await logSiteEvent(env, request, { ...payload, email }, "newsletter_subscribed", now);

  return json({ success: true, status: "active" });
}