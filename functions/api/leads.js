import { gaLeadParams, sendGa4Event } from "../_shared/ga4.js";
import { sendPortableSmtpMail } from "../_shared/smtp.js";

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

function addReason(reasons, label) {
  if (!reasons.includes(label) && reasons.length < 8) reasons.push(label);
}

function addSpamReason(reasons, label) {
  if (!reasons.includes(label) && reasons.length < 12) reasons.push(label);
}

function phoneDigits(value) {
  return clean(value, 80).replace(/\D/g, "");
}

function emailDomain(value) {
  const email = clean(value, 180).toLowerCase();
  return email.includes("@") ? email.split("@").pop().slice(0, 120) : "";
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

function disposableEmailDomain(value) {
  const domain = emailDomain(value);
  return /(^|\.)(yopmail|mailinator|guerrillamail|10minutemail|tempmail|temp-mail|trashmail|sharklasers|spamgourmet|dispostable|moakt|fakeinbox|maildrop|emailondeck)\./i.test(`${domain}.`);
}

function urlCount(value) {
  return (clean(value, 2400).match(/https?:\/\/|www\.|\.ru\b|\.xyz\b|\.top\b|\.click\b/gi) || []).length;
}

function repeatedNoise(value) {
  const text = clean(value, 2400).toLowerCase();
  return /(.)\1{7,}/.test(text) || /(?:casino|viagra|crypto|forex|loan|escort|porn|seo backlink|whatsapp only|telegram)/i.test(text);
}

function suspiciousUserAgent(value) {
  return /bot|crawl|spider|curl|wget|python|scrapy|httpclient|go-http-client|headless|selenium|phantom|puppeteer|playwright/i.test(clean(value, 500));
}

function safeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function localChallengeStatus(payload) {
  const antiBot = payload && typeof payload.anti_bot === "object" && !Array.isArray(payload.anti_bot) ? payload.anti_bot : null;
  const sessionId = clean(payload?.session_id, 120);
  const expectedToken = expectedSessionToken(payload || {});
  const submittedToken = clean(antiBot?.session_token, 80);
  const elapsed = safeNumber(antiBot?.form_elapsed_ms);

  if (clean(payload?.company_website)) return { ok: true, status: "honeypot-handled" };
  if (!sessionId) return { ok: false, status: "session-manquante" };
  if (!antiBot?.js_enabled) return { ok: false, status: "signal-js-absent" };
  if (expectedToken && submittedToken !== expectedToken) return { ok: false, status: "jeton-session-invalide" };
  if (elapsed > 0 && elapsed < 700) return { ok: false, status: "soumission-instantanee" };
  return { ok: true, status: "local-ok" };
}

function turnstileToken(payload) {
  return clean(payload?.turnstile_token || payload?.["cf-turnstile-response"], 2048);
}

async function verifyTurnstile(env, payload, ip) {
  const siteKey = clean(env?.TURNSTILE_SITE_KEY, 200);
  const secret = clean(env?.TURNSTILE_SECRET_KEY, 2048);
  if (!siteKey || !secret) return { ok: true, configured: false, status: "fallback-local" };

  const token = turnstileToken(payload);
  if (!token) return { ok: false, configured: true, status: "token-manquant", errorCodes: ["missing-input-response"] };

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  const remoteIp = clean(ip, 120).split(",")[0].trim();
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body
    });
    const result = await response.json().catch(() => ({}));
    const errorCodes = Array.isArray(result["error-codes"]) ? result["error-codes"].slice(0, 5) : [];
    if (response.ok && result.success) return { ok: true, configured: true, status: "verified" };

    return { ok: false, configured: true, status: "refuse", errorCodes };
  } catch {
    const failOpen = clean(env?.TURNSTILE_FAIL_OPEN, 20) === "1";
    return {
      ok: failOpen,
      configured: true,
      status: failOpen ? "indisponible-fail-open" : "indisponible",
      errorCodes: ["siteverify-unreachable"]
    };
  }
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

async function loadSpamHistory(env, payload, ip) {
  const email = clean(payload.email, 180).toLowerCase();
  const phone = phoneDigits(payload.phone);
  const sessionId = clean(payload.session_id, 120);
  return {
    ip_leads_10m: ip ? await countRows(env, `SELECT COUNT(*) AS count FROM leads WHERE ip_address = ? AND created_at >= datetime('now', '-10 minutes')`, [ip]) : 0,
    ip_spam_10m: ip ? await countRows(env, `SELECT COUNT(*) AS count FROM site_events WHERE event_type = 'lead_spam_blocked' AND ip_address = ? AND created_at >= datetime('now', '-10 minutes')`, [ip]) : 0,
    ip_events_2m: ip ? await countRows(env, `SELECT COUNT(*) AS count FROM site_events WHERE ip_address = ? AND event_type IN ('form_submit_attempt', 'lead_submit_error', 'lead_spam_blocked', 'lead_created') AND created_at >= datetime('now', '-2 minutes')`, [ip]) : 0,
    email_leads_24h: email ? await countRows(env, `SELECT COUNT(*) AS count FROM leads WHERE email = ? AND created_at >= datetime('now', '-24 hours')`, [email]) : 0,
    phone_leads_24h: phone.length >= 8 ? await countRows(env, `SELECT COUNT(*) AS count FROM leads WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '.', ''), '-', ''), '+', '') LIKE ? AND created_at >= datetime('now', '-24 hours')`, [`%${phone.slice(-8)}`]) : 0,
    session_leads_15m: sessionId ? await countRows(env, `SELECT COUNT(*) AS count FROM site_events WHERE event_type = 'lead_created' AND session_id = ? AND created_at >= datetime('now', '-15 minutes')`, [sessionId]) : 0,
    session_spam_15m: sessionId ? await countRows(env, `SELECT COUNT(*) AS count FROM site_events WHERE event_type = 'lead_spam_blocked' AND session_id = ? AND created_at >= datetime('now', '-15 minutes')`, [sessionId]) : 0
  };
}

function assessSpamSubmission(payload, { ip, userAgent, history }) {
  const reasons = [];
  let score = 0;
  const antiBot = payload && typeof payload.anti_bot === "object" && !Array.isArray(payload.anti_bot) ? payload.anti_bot : null;
  const elapsed = safeNumber(antiBot?.form_elapsed_ms);
  const interactions = safeNumber(antiBot?.interaction_count);
  const allText = [payload.name, payload.email, payload.phone, payload.city, payload.message, payload.page_url, payload.referrer].map((item) => clean(item, 2400)).join(" ");
  const compactContact = `${clean(payload.name, 160)} ${clean(payload.phone, 80)} ${clean(payload.city, 120)}`;
  const expectedToken = expectedSessionToken(payload);
  const submittedToken = clean(antiBot?.session_token, 80);

  if (clean(payload.company_website)) {
    score += 120;
    addSpamReason(reasons, "honeypot-rempli");
  }
  if (!antiBot?.js_enabled) {
    score += 70;
    addSpamReason(reasons, "signal-js-absent");
  }
  if (antiBot?.js_enabled && elapsed > 0 && elapsed < 1200) {
    score += 45;
    addSpamReason(reasons, "soumission-instantanee");
  } else if (antiBot?.js_enabled && elapsed > 0 && elapsed < 3000) {
    score += 20;
    addSpamReason(reasons, "soumission-tres-rapide");
  }
  if (antiBot?.js_enabled && interactions === 0) {
    score += 20;
    addSpamReason(reasons, "aucune-interaction-formulaire");
  }
  if (antiBot?.js_enabled && expectedToken && submittedToken !== expectedToken) {
    score += 35;
    addSpamReason(reasons, "jeton-session-invalide");
  }
  if (!clean(userAgent, 500)) {
    score += 25;
    addSpamReason(reasons, "user-agent-absent");
  } else if (suspiciousUserAgent(userAgent)) {
    score += 45;
    addSpamReason(reasons, "user-agent-robot");
  }
  if (urlCount(compactContact) > 0) {
    score += 65;
    addSpamReason(reasons, "url-dans-identite");
  }
  if (urlCount(payload.message) >= 2) {
    score += 35;
    addSpamReason(reasons, "liens-multiples-message");
  }
  if (repeatedNoise(allText)) {
    score += 40;
    addSpamReason(reasons, "contenu-spam");
  }
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(clean(payload.name, 160))) {
    score += 25;
    addSpamReason(reasons, "email-dans-nom");
  }
  if (disposableEmailDomain(payload.email)) {
    score += 45;
    addSpamReason(reasons, "email-jetable");
  }
  if (clean(payload.page_url, 500) && !/^https?:\/\/(www\.)?immeubleassur\.com\//i.test(clean(payload.page_url, 500))) {
    score += 30;
    addSpamReason(reasons, "page-origine-inconnue");
  }
  if (history.ip_leads_10m >= 3) {
    score += 65;
    addSpamReason(reasons, "volume-ip-leads");
  }
  if (history.ip_spam_10m >= 2) {
    score += 80;
    addSpamReason(reasons, "ip-deja-bloquee");
  }
  if (history.ip_events_2m >= 8) {
    score += 55;
    addSpamReason(reasons, "rafale-ip");
  }
  if (history.email_leads_24h >= 2) {
    score += 55;
    addSpamReason(reasons, "email-repete");
  }
  if (history.phone_leads_24h >= 2) {
    score += 45;
    addSpamReason(reasons, "telephone-repete");
  }
  if (history.session_leads_15m >= 2) {
    score += 45;
    addSpamReason(reasons, "session-repetee");
  }
  if (history.session_spam_15m >= 1) {
    score += 55;
    addSpamReason(reasons, "session-deja-bloquee");
  }

  return {
    score: Math.min(score, 150),
    reasons,
    blocked: score >= 70,
    action: score >= 100 || reasons.includes("honeypot-rempli") ? "silent_drop" : "block"
  };
}

async function logSpamAttempt(env, request, payload, assessment, now, ip, userAgent) {
  const path = clean(payload.page_url, 500).replace(/^https?:\/\/(www\.)?immeubleassur\.com/i, "") || clean(payload.path, 500) || "/api/leads";
  const context = {
    target: clean(payload.need || "anti-spam", 120),
    label: assessment.reasons.join(", ") || "anti-spam",
    path,
    spam_score: String(assessment.score || 0),
    action: assessment.action,
    reasons: assessment.reasons,
    email_domain: emailDomain(payload.email),
    has_phone: phoneDigits(payload.phone).length >= 8 ? "true" : "false",
    source: clean(payload.source || "website", 120),
    landing_page: clean(payload.utm?.landing_page, 500),
    first_referrer: clean(payload.utm?.first_referrer || payload.referrer, 500)
  };
  await env.DB.prepare(
    `INSERT INTO site_events (
      id, event_type, page_url, target, session_id, lead_reference,
      payload, ip_address, user_agent, created_at
    ) VALUES (?, 'lead_spam_blocked', ?, ?, ?, '', ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      clean(payload.page_url, 500),
      context.target,
      clean(payload.session_id, 120),
      JSON.stringify(context),
      clean(ip, 120),
      clean(userAgent, 500),
      now
    )
    .run();
}
function unitCount(value) {
  return Number.parseInt(String(value || "0").replace(/\D/g, ""), 10) || 0;
}

function leadValueEstimate(lead, score = 0) {
  const units = Math.max(1, unitCount(lead.units_count));
  const need = clean(lead.need, 80);
  const profile = clean(lead.profile, 80);
  const propertyType = clean(lead.property_type, 80);
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

function slaHoursFor(score, valueEstimate) {
  const maxValue = Number(valueEstimate?.annual_premium_max || 0);
  if (score >= 85 || maxValue >= 9000) return 2;
  if (score >= 70 || maxValue >= 3500) return 6;
  if (score >= 45 || maxValue >= 1200) return 24;
  return 48;
}

function priorityFromScore(score) {
  if (score >= 85) return "hot";
  if (score >= 70) return "warm";
  if (score >= 45) return "standard";
  return "low";
}

function nextActionFor(payload, score) {
  const need = clean(payload.need, 80);
  const profile = clean(payload.profile, 80);
  const propertyType = clean(payload.property_type, 80);
  const units = unitCount(payload.units_count);

  if (/dossier pret assureur|pieces disponibles/i.test(payload.message || "") && !/pieces disponibles:\s*aucune piece/i.test(payload.message || "")) return "Reprendre les pieces disponibles, demander les manquants puis consulter les assureurs adaptes.";
  if (score >= 85) return "Rappeler en priorite et demander contrat actuel, echeance, sinistres 36 mois.";
  if (["pno", "cno", "pno-cno"].includes(need) || propertyType === "lot-copropriete") {
    return "Verifier occupation du lot, contrat immeuble copropriete et assurance occupant.";
  }
  if (units >= 10 || ["syndic-professionnel", "administrateur-biens"].includes(profile)) {
    return "Demander tableau lots, sinistralite, prime actuelle et travaux prevus.";
  }
  if (profile === "sci") return "Identifier portefeuille SCI, lots disperses et contrats deja en place.";
  return "Rappeler pour completer echeance, assureur actuel, surface et sinistres.";
}

function qualifyLead(payload) {
  let score = 20;
  const reasons = [];
  const units = unitCount(payload.units_count);
  const need = clean(payload.need, 80);
  const profile = clean(payload.profile, 80);
  const propertyType = clean(payload.property_type, 80);
  const source = clean(payload.source, 80);
  const intent = clean(payload.intent || payload.utm?.intent, 80);
  const readinessText = `${payload.message || ""} ${source} ${intent}`;
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
  if (["travaux", "sinistre", "prix", "veille", "audit-contrat", "local-commercial"].includes(intent)) {
    score += 8;
    addReason(reasons, "intention SEO qualifiee");
  }
  if (["lot-copropriete", "logement-vacant", "logement-loue", "local-commercial"].includes(propertyType)) {
    score += 12;
    addReason(reasons, "situation du bien exploitable");
  }
  if (/pno|cno|coproprietaire|non.?occupant/i.test(`${payload.message || ""} ${source}`)) {
    score += 10;
    addReason(reasons, "mot-cle PNO/CNO detecte");
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
  return {
    score,
    priority: priorityFromScore(score),
    reasons,
    value_estimate: valueEstimate,
    sla_hours: slaHoursFor(score, valueEstimate),
    next_action: nextActionFor(payload, score)
  };
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

function cleanUtm(raw = {}) {
  return {
    utm_source: clean(raw.utm_source, 120),
    utm_medium: clean(raw.utm_medium, 120),
    utm_campaign: clean(raw.utm_campaign, 180),
    utm_term: clean(raw.utm_term, 180),
    utm_content: clean(raw.utm_content, 180),
    gclid: clean(raw.gclid, 160),
    gbraid: clean(raw.gbraid, 160),
    wbraid: clean(raw.wbraid, 160),
    intent: clean(raw.intent, 80),
    source_path: clean(raw.source_path, 500),
    landing_path: clean(raw.landing_path, 500),
    landing_page: clean(raw.landing_page, 500),
    first_referrer: clean(raw.first_referrer, 500)
  };
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

function buildLeadEmail({ id, reference, score, qualification, record, now }) {
  const subject = `Nouveau lead ImmeubleAssur ${reference}`;
  const text = [
    `Reference: ${reference}`,
    `Score: ${score}`,
    `Priorite: ${qualification.priority}`,
    `Valeur estimee: ${qualification.value_estimate?.label || "non estimee"}`,
    `SLA rappel: ${qualification.sla_hours || 48}h`,
    `Prochaine action: ${qualification.next_action}`,
    `Raisons: ${qualification.reasons.length ? qualification.reasons.join(", ") : "non precisees"}`,
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
    `Landing: ${record.utm?.landing_page || "non precisee"}`,
    `Source: ${record.source || "website"}`,
    `Intent: ${record.intent || "non precise"}`,
    `Chemin source: ${record.source_path || "non precise"}`,
    `Campagne: ${record.utm?.utm_campaign || "non precisee"}`,
    `Test CTA: ${record.experiment_variant || "non mesure"}`,
    `Lead ID: ${id}`
  ].join("\n");
  return { subject, text };
}

async function sendSmtpMail(config, message) {
  return sendPortableSmtpMail(config, message);
}

async function notifyLeadByEmail({ id, reference, score, qualification, record, now }, env) {
  const host = clean(env.SMTP_HOST, 160);
  const port = Number.parseInt(env.SMTP_PORT || "587", 10);
  const username = clean(env.SMTP_USER || env.SMTP_FROM, 180);
  const password = String(env.SMTP_PASS || "");
  const from = clean(env.SMTP_FROM || username, 180);
  const recipients = parseRecipients(env.SMTP_TO || env.CONTACT_EMAIL || from);

  if (!host || !port || !username || !password || !from || recipients.length === 0) {
    return { attempted: false, status: "skipped" };
  }

  const { subject, text } = buildLeadEmail({ id, reference, score, qualification, record, now });
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

export async function onRequestPost({ request, env, waitUntil }) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return json({ success: false, error: "JSON invalide" }, 400);
  }

  const now = new Date().toISOString();
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "";
  const userAgent = request.headers.get("User-Agent") || "";

  if (!env.DB) {
    if (clean(payload.company_website)) return json({ success: true, reference: "IGNORED" });
    return json({ success: false, error: "Base SQLite indisponible" }, 503);
  }

  const challenge = localChallengeStatus(payload);
  if (!challenge.ok) {
    const assessment = {
      score: 90,
      reasons: [`local-challenge-${challenge.status || "echec"}`],
      blocked: true,
      action: "block"
    };
    await logSpamAttempt(env, request, payload, assessment, now, ip, userAgent);
    return json({ success: false, error: "Verification anti-robot invalide. Rechargez la page puis recommencez.", challenge: "local-failed" }, 403);
  }

  const turnstile = await verifyTurnstile(env, payload, ip);
  if (!turnstile.ok) {
    const assessment = {
      score: 95,
      reasons: [`turnstile-${turnstile.status || "echec"}`, ...(turnstile.errorCodes || []).map((code) => `turnstile-${clean(code, 60)}`).slice(0, 3)],
      blocked: true,
      action: "block"
    };
    await logSpamAttempt(env, request, payload, assessment, now, ip, userAgent);
    return json({ success: false, error: "Verification anti-robot Cloudflare invalide. Rechargez la page puis recommencez.", challenge: "turnstile-failed", turnstile: turnstile.status }, 403);
  }

  const spamHistory = await loadSpamHistory(env, payload, clean(ip, 120));
  const spamAssessment = assessSpamSubmission(payload, { ip, userAgent, history: spamHistory });
  if (spamAssessment.blocked) {
    await logSpamAttempt(env, request, payload, spamAssessment, now, ip, userAgent);
    if (spamAssessment.action === "silent_drop") return json({ success: true, reference: "FILTERED", spam_blocked: true });
    return json({ success: false, error: "Demande bloquee par le filtre anti-spam. Contactez-nous par telephone si besoin." }, 429);
  }

  const validationError = validate(payload);
  if (validationError) {
    return json({ success: false, error: validationError }, 422);
  }

  const id = crypto.randomUUID();
  const reference = `IMB-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  const qualification = qualifyLead(payload);
  const score = qualification.score;
  const experiment = payload.experiment || {};

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
    intent: clean(payload.intent || payload.utm?.intent, 80),
    source_path: clean(payload.source_path || payload.utm?.source_path, 500),
    landing_path: clean(payload.landing_path || payload.utm?.landing_path, 500),
    page_url: clean(payload.page_url, 500),
    referrer: clean(payload.referrer, 500),
    session_id: clean(payload.session_id, 120),
    ga_client_id: clean(payload.ga_client_id, 120),
    experiment_id: clean(payload.experiment_id || experiment.experiment_id, 80),
    experiment_variant: clean(payload.experiment_variant || experiment.experiment_variant, 80),
    experiment_label: clean(payload.experiment_label || experiment.experiment_label, 120),
    utm: cleanUtm(payload.utm || {})
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

    await logLeadEvent(env, id, "lead_created", {
      reference,
      score,
      priority: qualification.priority,
      reasons: qualification.reasons,
      next_action: qualification.next_action,
      value_estimate: qualification.value_estimate,
      sla_hours: qualification.sla_hours,
      source: record.source,
      intent: record.intent,
      source_path: record.source_path,
      landing_path: record.landing_path,
      page_url: record.page_url,
      referrer: record.referrer,
      session_id: record.session_id,
      ga_client_id: record.ga_client_id,
      experiment_id: record.experiment_id,
      experiment_variant: record.experiment_variant,
      experiment_label: record.experiment_label,
      experiment: { id: record.experiment_id, variant: record.experiment_variant, label: record.experiment_label },
      utm: record.utm
    }, now);

    const ga4Task = sendGa4Event({
      env,
      request,
      eventName: "generate_lead",
      payload,
      params: gaLeadParams({ payload, record, qualification, reference })
    }).catch(() => null);
    if (typeof waitUntil === "function") waitUntil(ga4Task);
    else await ga4Task;

    let notification = { attempted: false, status: "skipped" };
    try {
      notification = await notifyLeadByEmail({ id, reference, score, qualification, record, now }, env);
      if (notification.attempted) {
        await logLeadEvent(env, id, "email_notification_sent", { reference, receipt: notification.receipt }, now);
      }
    } catch (error) {
      notification = { attempted: true, status: "failed" };
      await logLeadEvent(env, id, "email_notification_failed", { reference, error: error.message || "Erreur SMTP" }, now);
    }

    return json({ success: true, id, reference, score, priority: qualification.priority, reasons: qualification.reasons, value_estimate: qualification.value_estimate, sla_hours: qualification.sla_hours, next_action: qualification.next_action, notification: notification.status });
  } catch (error) {
    return json({ success: false, error: error.message || "Erreur base de donnees" }, 500);
  }
}

