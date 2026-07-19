import { connect } from "cloudflare:sockets";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function headerSafe(value, max = 240) {
  return clean(value, max).replace(/[\r\n]+/g, " ");
}

function scoreLead(payload) {
  let score = 20;
  const units = Number.parseInt(payload.units_count || "0", 10);
  if (units >= 10) score += 20;
  if (units >= 40) score += 20;
  if (["syndic-professionnel", "administrateur-biens", "sci"].includes(payload.profile)) score += 15;
  if (["multirisque-immeuble", "copropriete", "audit-contrat"].includes(payload.need)) score += 10;
  if (payload.message && payload.message.length > 40) score += 10;
  return Math.min(score, 100);
}

function validate(payload) {
  const required = ["name", "phone", "email", "profile", "property_type", "city"];
  for (const field of required) {
    if (!clean(payload[field])) return `Champ manquant: ${field}`;
  }
  if (!clean(payload.email).includes("@")) return "Email invalide";
  if (clean(payload.phone).replace(/\D/g, "").length < 9) return "Telephone invalide";
  if (payload.consent !== true) return "Consentement requis";
  return "";
}

function parseRecipients(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
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
  if (!allowed.includes(response.code)) {
    throw new Error(`${context}: SMTP ${response.code} ${response.lines.join(" | ")}`);
  }
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
  if (response.code !== 504 && response.code !== 503) {
    assertSmtp(response, 235, "AUTH PLAIN");
  }

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

function buildLeadEmail({ id, reference, score, record, now }) {
  const subject = `Nouveau lead ImmeubleAssur ${reference}`;
  const text = [
    `Reference: ${reference}`,
    `Score: ${score}`,
    `Date: ${now}`,
    "",
    `Nom: ${record.name}`,
    `Telephone: ${record.phone}`,
    `Email: ${record.email}`,
    `Profil: ${record.profile}`,
    `Type de bien: ${record.property_type}`,
    `Ville: ${record.city}`,
    `Lots: ${record.units_count || "non precise"}`,
    `Besoin: ${record.need || "non precise"}`,
    "",
    "Message:",
    record.message || "Aucun message.",
    "",
    `Page: ${record.page_url || "non precisee"}`,
    `Source: ${record.source || "website"}`,
    `Lead ID: ${id}`
  ].join("\n");
  return { subject, text };
}

async function sendSmtpMail(config, message) {
  let socket = connect(
    { hostname: config.host, port: config.port },
    { secureTransport: config.secureTransport }
  );
  await socket.opened;
  let session = smtpSession(socket);

  let response = await session.readResponse();
  assertSmtp(response, 220, "Accueil SMTP");
  await smtpCommand(session, "EHLO immeubleassur.com", 250, "EHLO");

  if (config.secureTransport === "starttls") {
    await smtpCommand(session, "STARTTLS", 220, "STARTTLS");
    session.release();
    socket = socket.startTls();
    await socket.opened;
    session = smtpSession(socket);
    await smtpCommand(session, "EHLO immeubleassur.com", 250, "EHLO TLS");
  }
  await smtpAuth(session, config.username, config.password);
  await smtpCommand(session, `MAIL FROM:<${config.from}>`, 250, "MAIL FROM");
  for (const recipient of config.to) {
    await smtpCommand(session, `RCPT TO:<${recipient}>`, [250, 251], "RCPT TO");
  }
  await smtpCommand(session, "DATA", 354, "DATA");
  await session.writeRaw(`${dotStuff(message)}\r\n.\r\n`);
  response = await session.readResponse();
  assertSmtp(response, 250, "Fin DATA");
  await session.writeLine("QUIT");
  socket.close().catch(() => {});
  return response.lines.join(" | ");
}

async function notifyLeadByEmail({ id, reference, score, record, now }, env) {
  const host = clean(env.SMTP_HOST, 160);
  const port = Number.parseInt(env.SMTP_PORT || "587", 10);
  const username = clean(env.SMTP_USER || env.SMTP_FROM, 180);
  const password = String(env.SMTP_PASS || "");
  const from = clean(env.SMTP_FROM || username, 180);
  const recipients = parseRecipients(env.SMTP_TO || env.CONTACT_EMAIL || from);

  if (!host || !port || !username || !password || !from || recipients.length === 0) {
    return { attempted: false, status: "skipped" };
  }

  const { subject, text } = buildLeadEmail({ id, reference, score, record, now });
  const headers = [
    `From: ImmeubleAssur <${from}>`,
    `To: ${recipients.join(", ")}`,
    `Reply-To: ${headerSafe(record.email)}`,
    `Subject: ${headerSafe(subject)}`,
    `Date: ${new Date(now).toUTCString()}`,
    `Message-ID: <${reference}.${id}@immeubleassur.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit"
  ];

  const receipt = await sendSmtpMail(
    {
      host,
      port,
      username,
      password,
      from,
      to: recipients,
      secureTransport: port === 465 ? "on" : "starttls"
    },
    `${headers.join("\r\n")}\r\n\r\n${text}`
  );

  return { attempted: true, status: "sent", receipt };
}

async function logLeadEvent(env, leadId, eventType, payload, createdAt) {
  await env.DB.prepare(
    `INSERT INTO lead_events (id, lead_id, event_type, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), leadId, eventType, JSON.stringify(payload), createdAt)
    .run();
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost({ request, env }) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return json({ success: false, error: "JSON invalide" }, 400);
  }

  if (clean(payload.company_website)) {
    return json({ success: true, reference: "IGNORED" });
  }

  const validationError = validate(payload);
  if (validationError) {
    return json({ success: false, error: validationError }, 422);
  }

  if (!env.DB) {
    return json({ success: false, error: "Binding D1 DB manquant" }, 503);
  }

  const id = crypto.randomUUID();
  const reference = `IMB-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  const now = new Date().toISOString();
  const score = scoreLead(payload);
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "";
  const userAgent = request.headers.get("User-Agent") || "";

  const record = {
    name: clean(payload.name, 160),
    phone: clean(payload.phone, 80),
    email: clean(payload.email, 180).toLowerCase(),
    profile: clean(payload.profile, 80),
    property_type: clean(payload.property_type, 80),
    city: clean(payload.city, 120),
    units_count: clean(payload.units_count, 20),
    need: clean(payload.need, 80),
    message: clean(payload.message, 2000),
    source: clean(payload.source || "website", 80),
    page_url: clean(payload.page_url, 500),
    referrer: clean(payload.referrer, 500)
  };

  try {
    await env.DB.prepare(
      `INSERT INTO leads (
        id, reference, name, phone, email, profile, property_type, city,
        units_count, need, message, lead_score, status, source, page_url,
        referrer, ip_address, user_agent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        reference,
        record.name,
        record.phone,
        record.email,
        record.profile,
        record.property_type,
        record.city,
        record.units_count,
        record.need,
        record.message,
        score,
        record.source,
        record.page_url,
        record.referrer,
        ip,
        userAgent,
        now,
        now
      )
      .run();

    await logLeadEvent(env, id, "lead_created", { reference, score, source: record.source }, now);

    let notification = { attempted: false, status: "skipped" };
    try {
      notification = await notifyLeadByEmail({ id, reference, score, record, now }, env);
      if (notification.attempted) {
        await logLeadEvent(env, id, "email_notification_sent", { reference, receipt: notification.receipt }, now);
      }
    } catch (error) {
      notification = { attempted: true, status: "failed" };
      await logLeadEvent(env, id, "email_notification_failed", { reference, error: error.message || "Erreur SMTP" }, now);
    }

    return json({ success: true, id, reference, score, notification: notification.status });
  } catch (error) {
    return json({ success: false, error: error.message || "Erreur base de donnees" }, 500);
  }
}