import { adminRequestAllowed } from "../../_shared/admin-auth.js";
import { sendPortableSmtpMail } from "../../_shared/smtp.js";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function authorized(request, env) { return adminRequestAllowed(request, env); }

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function headerSafe(value, max = 240) {
  return clean(value, max).replace(/[\r\n]+/g, " ");
}

function parseRecipients(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 500);
}

async function safeAll(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql);
    const result = binds.length ? await statement.bind(...binds).all() : await statement.all();
    return result.results || [];
  } catch (error) {
    return { error: error.message };
  }
}

async function safeFirst(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql);
    return binds.length ? await statement.bind(...binds).first() : await statement.first();
  } catch (error) {
    return { error: error.message };
  }
}

function smtpSession(socket) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  let buffer = "";

  async function readLine() {
    while (!buffer.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) throw new Error("Connexion SMTP fermee");
      buffer += decoder.decode(value, { stream: true });
    }
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).replace(/\r$/, "");
    buffer = buffer.slice(index + 1);
    return line;
  }

  async function readResponse() {
    const lines = [];
    while (true) {
      const line = await readLine();
      lines.push(line);
      if (/^\d{3} /.test(line)) break;
      if (!/^\d{3}-/.test(line)) break;
    }
    const code = Number.parseInt(lines[lines.length - 1].slice(0, 3), 10);
    if (!Number.isFinite(code)) throw new Error(`Reponse SMTP invalide: ${lines.join(" | ")}`);
    return { code, lines };
  }

  async function writeLine(line) {
    await writer.write(encoder.encode(`${line}\r\n`));
  }

  async function writeRaw(text) {
    await writer.write(encoder.encode(text));
  }

  function release() {
    reader.releaseLock();
    writer.releaseLock();
  }

  return { readResponse, writeLine, writeRaw, release };
}

function assertSmtp(response, expected, context) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.code)) throw new Error(`${context}: SMTP ${response.code} ${response.lines.join(" | ")}`);
}

async function smtpCommand(session, command, expected, context = command) {
  await session.writeLine(command);
  const response = await session.readResponse();
  assertSmtp(response, expected, context);
  return response;
}

async function smtpAuth(session, username, password) {
  await session.writeLine(`AUTH PLAIN ${btoa(`\0${username}\0${password}`)}`);
  let response = await session.readResponse();
  if (response.code === 235) return;
  if (response.code !== 504 && response.code !== 503) assertSmtp(response, 235, "AUTH PLAIN");

  await session.writeLine("AUTH LOGIN");
  response = await session.readResponse();
  assertSmtp(response, 334, "AUTH LOGIN");
  await session.writeLine(btoa(username));
  response = await session.readResponse();
  assertSmtp(response, 334, "AUTH LOGIN username");
  await session.writeLine(btoa(password));
  response = await session.readResponse();
  assertSmtp(response, 235, "AUTH LOGIN password");
}

function dotStuff(message) {
  return message
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

async function sendSmtpMail(config, message, env) {
  return sendPortableSmtpMail(config, message, env);
}


function smtpConfig(env) {
  const resendMode = String(env.EMAIL_TRANSPORT || "").toLowerCase() === "resend";
  const from = clean(env.SMTP_FROM || env.RESEND_FROM || env.SMTP_USER, 180);
  if (resendMode && clean(env.RESEND_API_KEY, 300) && from) return { host: "resend", port: 443, username: "", password: "", from, secureTransport: "https" };
  const host = clean(env.SMTP_HOST, 160);
  const port = Number.parseInt(env.SMTP_PORT || "587", 10);
  const username = clean(env.SMTP_USER || from, 180);
  const password = String(env.SMTP_PASS || "");
  if (!host || !port || !username || !password || !from) return null;
  return { host, port, username, password, from, secureTransport: port === 465 ? "on" : "starttls" };
}


function issueText(issue, subscriber, requestUrl) {
  const site = new URL(requestUrl).origin;
  const unsubscribe = `${site}/api/newsletter?unsubscribe=${encodeURIComponent(subscriber.unsubscribe_token)}`;
  const body = clean(issue.plain_text, 8000) || [
    issue.title,
    "",
    clean(issue.summary, 1200),
    "",
    issue.html_url ? `${site}${issue.html_url}` : site,
    "",
    "Vous recevez cette veille car vous avez demande a etre informe sur l'assurance immeuble.",
    `Desinscription: ${unsubscribe}`
  ].join("\n");
  return `${body}\n\nDesinscription: ${unsubscribe}`;
}

function buildMessage(config, issue, subscriber, requestUrl) {
  const unsubscribe = `${new URL(requestUrl).origin}/api/newsletter?unsubscribe=${encodeURIComponent(subscriber.unsubscribe_token)}`;
  const headers = [
    `From: ImmeubleAssur <${config.from}>`,
    `To: ${subscriber.email}`,
    `Subject: ${headerSafe(issue.subject || issue.title)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <newsletter.${issue.id}.${subscriber.id}@immeubleassur.com>`,
    `List-Unsubscribe: <${unsubscribe}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit"
  ];
  return `${headers.join("\r\n")}\r\n\r\n${issueText(issue, subscriber, requestUrl)}`;
}

async function recordNewsletterEvent(env, subscriberId, issueId, eventType, payload, now) {
  await env.DB.prepare(
    `INSERT INTO newsletter_events (id, subscriber_id, issue_id, event_type, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), subscriberId, issueId, eventType, JSON.stringify(payload || {}), now).run();
}

async function sendLatestIssue(request, env) {
  const config = smtpConfig(env);
  if (!config) return json({ success: false, error: "Configuration SMTP manquante" }, 503);

  const limit = Math.max(1, Math.min(500, Number.parseInt(env.NEWSLETTER_SEND_LIMIT || "100", 10) || 100));
  const issue = await safeFirst(env, `SELECT * FROM newsletter_issues WHERE status IN ('published', 'draft') ORDER BY created_at DESC LIMIT 1`);
  if (!issue || issue.error) return json({ success: false, error: issue?.error || "Aucune newsletter disponible" }, 404);

  const subscribers = await safeAll(env, `SELECT id, email, unsubscribe_token FROM newsletter_subscribers WHERE status = 'active' ORDER BY created_at ASC LIMIT ?`, [limit]);
  if (!Array.isArray(subscribers)) return json({ success: false, error: subscribers.error || "Lecture abonnes impossible" }, 500);

  const now = new Date().toISOString();
  const results = [];
  for (const subscriber of subscribers) {
    try {
      const receipt = await sendSmtpMail({ ...config, to: parseRecipients(subscriber.email) }, buildMessage(config, issue, subscriber, request.url), env);
      await recordNewsletterEvent(env, subscriber.id, issue.id, "sent", { receipt }, now);
      results.push({ email: subscriber.email, status: "sent" });
    } catch (error) {
      await recordNewsletterEvent(env, subscriber.id, issue.id, "send_failed", { error: error.message || "Erreur SMTP" }, now);
      results.push({ email: subscriber.email, status: "failed" });
    }
  }

  await env.DB.prepare(`UPDATE newsletter_issues SET sent_at = ?, status = 'published' WHERE id = ?`).bind(now, issue.id).run();
  const sent = results.filter((row) => row.status === "sent").length;
  const failed = results.filter((row) => row.status === "failed").length;
  return json({ success: true, issue: { id: issue.id, slug: issue.slug, subject: issue.subject }, sent, failed, limit, attempted: results.length });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers });
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);

  const [subscriberStats, issues, watchItems, sendStats] = await Promise.all([
    safeAll(env, `SELECT status, COUNT(*) AS count FROM newsletter_subscribers GROUP BY status ORDER BY count DESC`),
    safeAll(env, `SELECT id, slug, title, subject, status, html_url, created_at, published_at, sent_at FROM newsletter_issues ORDER BY created_at DESC LIMIT 20`),
    safeAll(env, `SELECT source_name, title, url, topic, relevance_score, published_at, fetched_at FROM editorial_watch_items ORDER BY fetched_at DESC, relevance_score DESC LIMIT 30`),
    safeAll(env, `SELECT event_type, COUNT(*) AS count FROM newsletter_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_type ORDER BY count DESC`)
  ]);

  return json({ success: true, subscriber_stats: subscriberStats, issues, watch_items: watchItems, send_stats: sendStats, smtp_configured: Boolean(smtpConfig(env)) });
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);

  let payload = {};
  try {
    payload = await request.json();
  } catch {}

  const action = clean(payload.action || "send_latest", 80);
  if (action === "send_latest") return sendLatestIssue(request, env);
  return json({ success: false, error: "Action newsletter inconnue" }, 422);
}