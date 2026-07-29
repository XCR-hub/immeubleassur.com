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

function emailDomain(value) {
  const email = clean(value, 180).toLowerCase();
  return email.includes("@") ? email.split("@").pop().slice(0, 120) : "";
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

function hashString(value) {
  return String(value || "").split("").reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0);
}

function hostnameOf(value) {
  try {
    return new URL(clean(value, 500)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function expectedSessionToken(payload) {
  const sessionId = clean(payload.session_id, 120);
  const hostname = hostnameOf(payload.page_url);
  if (!sessionId || !hostname) return "";
  return Math.abs(hashString(`${sessionId}:${hostname}`)).toString(36);
}

function safeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function addReason(reasons, label) {
  if (!reasons.includes(label) && reasons.length < 12) reasons.push(label);
}

function disposableEmailDomain(value) {
  const domain = emailDomain(value);
  return /(^|\.)(yopmail|mailinator|guerrillamail|10minutemail|tempmail|temp-mail|trashmail|sharklasers|spamgourmet|dispostable|moakt|fakeinbox|maildrop|emailondeck)\./i.test(`${domain}.`);
}

function urlCount(value) {
  return (clean(value, 1800).match(/https?:\/\/|www\.|\.ru\b|\.xyz\b|\.top\b|\.click\b/gi) || []).length;
}

function repeatedNoise(value) {
  const text = clean(value, 1800).toLowerCase();
  return /(.)\1{7,}/.test(text) || /(?:casino|viagra|crypto|forex|loan|escort|porn|seo backlink|whatsapp only|telegram)/i.test(text);
}

function suspiciousUserAgent(value) {
  return /bot|crawl|spider|curl|wget|python|scrapy|httpclient|go-http-client|headless|selenium|phantom|puppeteer|playwright/i.test(clean(value, 500));
}

function localNewsletterChallengeStatus(payload) {
  const antiBot = payload && typeof payload.anti_bot === "object" && !Array.isArray(payload.anti_bot) ? payload.anti_bot : null;
  const sessionId = clean(payload?.session_id, 120);
  const expectedToken = expectedSessionToken(payload || {});
  const submittedToken = clean(antiBot?.session_token, 80);
  const elapsed = safeNumber(antiBot?.form_elapsed_ms);

  if (clean(payload?.company_website)) return { ok: true, status: "honeypot-handled" };
  if (!sessionId) return { ok: false, status: "session-manquante" };
  if (!antiBot?.js_enabled) return { ok: false, status: "signal-js-absent" };
  if (expectedToken && submittedToken !== expectedToken) return { ok: false, status: "jeton-session-invalide" };
  if (elapsed > 0 && elapsed < 500) return { ok: false, status: "soumission-instantanee" };
  return { ok: true, status: "local-ok" };
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

async function loadNewsletterSpamHistory(env, payload, ip) {
  const email = clean(payload.email, 180).toLowerCase();
  const sessionId = clean(payload.session_id, 120);
  return {
    ip_subscriptions_10m: ip ? await countRows(env, `SELECT COUNT(*) AS count FROM newsletter_subscribers WHERE ip_address = ? AND created_at >= datetime('now', '-10 minutes')`, [ip]) : 0,
    ip_spam_10m: ip ? await countRows(env, `SELECT COUNT(*) AS count FROM site_events WHERE event_type = 'newsletter_spam_blocked' AND ip_address = ? AND created_at >= datetime('now', '-10 minutes')`, [ip]) : 0,
    ip_events_2m: ip ? await countRows(env, `SELECT COUNT(*) AS count FROM site_events WHERE ip_address = ? AND event_type IN ('newsletter_subscribe_attempt', 'newsletter_subscribe_error', 'newsletter_spam_blocked', 'newsletter_subscribed') AND created_at >= datetime('now', '-2 minutes')`, [ip]) : 0,
    email_subscriptions_24h: email ? await countRows(env, `SELECT COUNT(*) AS count FROM newsletter_subscribers WHERE email = ? AND created_at >= datetime('now', '-24 hours')`, [email]) : 0,
    session_subscriptions_15m: sessionId ? await countRows(env, `SELECT COUNT(*) AS count FROM site_events WHERE event_type = 'newsletter_subscribed' AND session_id = ? AND created_at >= datetime('now', '-15 minutes')`, [sessionId]) : 0,
    session_spam_15m: sessionId ? await countRows(env, `SELECT COUNT(*) AS count FROM site_events WHERE event_type = 'newsletter_spam_blocked' AND session_id = ? AND created_at >= datetime('now', '-15 minutes')`, [sessionId]) : 0
  };
}

function assessNewsletterSpam(payload, { ip, userAgent, history }) {
  const reasons = [];
  let score = 0;
  const antiBot = payload && typeof payload.anti_bot === "object" && !Array.isArray(payload.anti_bot) ? payload.anti_bot : null;
  const elapsed = safeNumber(antiBot?.form_elapsed_ms);
  const interactions = safeNumber(antiBot?.interaction_count);
  const text = [payload.email, payload.name, payload.audience, payload.source, payload.page_url, payload.referrer].map((item) => clean(item, 500)).join(" ");
  const expectedToken = expectedSessionToken(payload);
  const submittedToken = clean(antiBot?.session_token, 80);

  if (clean(payload.company_website)) {
    score += 120;
    addReason(reasons, "honeypot-rempli");
  }
  if (!antiBot?.js_enabled) {
    score += 70;
    addReason(reasons, "signal-js-absent");
  }
  if (antiBot?.js_enabled && elapsed > 0 && elapsed < 900) {
    score += 45;
    addReason(reasons, "soumission-instantanee");
  }
  if (antiBot?.js_enabled && interactions === 0) {
    score += 15;
    addReason(reasons, "aucune-interaction-formulaire");
  }
  if (antiBot?.js_enabled && expectedToken && submittedToken !== expectedToken) {
    score += 40;
    addReason(reasons, "jeton-session-invalide");
  }
  if (!clean(userAgent, 500)) {
    score += 25;
    addReason(reasons, "user-agent-absent");
  } else if (suspiciousUserAgent(userAgent)) {
    score += 45;
    addReason(reasons, "user-agent-robot");
  }
  if (urlCount(payload.name) > 0 || urlCount(payload.email) > 0) {
    score += 70;
    addReason(reasons, "url-dans-identite");
  }
  if (repeatedNoise(text)) {
    score += 45;
    addReason(reasons, "contenu-spam");
  }
  if (disposableEmailDomain(payload.email)) {
    score += 55;
    addReason(reasons, "email-jetable");
  }
  if (clean(payload.page_url, 500) && !/^https?:\/\/(www\.)?immeubleassur\.com\//i.test(clean(payload.page_url, 500))) {
    score += 30;
    addReason(reasons, "page-origine-inconnue");
  }
  if (history.ip_subscriptions_10m >= 5) {
    score += 80;
    addReason(reasons, "volume-ip-newsletter");
  }
  if (history.ip_spam_10m >= 2) {
    score += 80;
    addReason(reasons, "ip-deja-bloquee");
  }
  if (history.ip_events_2m >= 10) {
    score += 50;
    addReason(reasons, "rafale-ip-newsletter");
  }
  if (history.email_subscriptions_24h >= 2) {
    score += 35;
    addReason(reasons, "email-deja-inscrit");
  }
  if (history.session_subscriptions_15m >= 3) {
    score += 45;
    addReason(reasons, "session-repetee");
  }
  if (history.session_spam_15m >= 1) {
    score += 60;
    addReason(reasons, "session-deja-bloquee");
  }

  return {
    score: Math.min(score, 150),
    reasons,
    blocked: score >= 70,
    action: score >= 100 || reasons.includes("honeypot-rempli") ? "silent_drop" : "block"
  };
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
    const spam = payload.spam_assessment && typeof payload.spam_assessment === "object" ? payload.spam_assessment : {};
    const reasons = Array.isArray(spam.reasons) ? spam.reasons.slice(0, 12) : [];
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
        label: reasons.join(", ") || clean(payload.source || "website", 180),
        path: clean(payload.path, 500),
        source: clean(payload.source || "website", 120),
        email_domain: emailDomain(payload.email),
        spam_score: spam.score === undefined ? "" : String(spam.score || 0),
        action: clean(spam.action || "", 80),
        reasons,
        challenge: clean(spam.challenge || "", 120),
        has_name: clean(payload.name, 160) ? "true" : "false",
        form_elapsed_ms: payload.anti_bot ? String(safeNumber(payload.anti_bot.form_elapsed_ms)) : ""
      }),
      clean(request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "", 120),
      clean(request.headers.get("User-Agent") || "", 500),
      now
    ).run();
  } catch {}
}

async function blockNewsletterSpam(env, request, payload, assessment, now, status = 429, message = "Trop de tentatives. Reessayez plus tard.") {
  await logSiteEvent(env, request, { ...payload, spam_assessment: assessment }, "newsletter_spam_blocked", now);
  if (assessment.action === "silent_drop") return json({ success: true, status: "filtered" });
  return json({ success: false, error: message, challenge: assessment.challenge || "newsletter-spam" }, status);
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
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);

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
    return blockNewsletterSpam(env, request, payload, { score: 120, reasons: ["honeypot-rempli"], blocked: true, action: "silent_drop", challenge: "honeypot" }, now);
  }

  const challenge = localNewsletterChallengeStatus(payload);
  if (!challenge.ok) {
    return blockNewsletterSpam(
      env,
      request,
      payload,
      { score: 90, reasons: [`local-challenge-${challenge.status || "echec"}`], blocked: true, action: "block", challenge: "local-failed" },
      now,
      403,
      "Verification anti-robot invalide. Rechargez la page puis recommencez."
    );
  }

  if (!emailValid(payload.email)) return json({ success: false, error: "Email invalide" }, 422);
  if (payload.consent !== true) return json({ success: false, error: "Consentement requis" }, 422);

  const history = await loadNewsletterSpamHistory(env, payload, ip);
  const assessment = assessNewsletterSpam(payload, { ip, userAgent, history });
  if (assessment.blocked) return blockNewsletterSpam(env, request, payload, assessment, now);

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