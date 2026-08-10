import { gaLeadParams, sendGa4Event } from "../_shared/ga4.js";
import { sendPortableSmtpMail } from "../_shared/smtp.js";

const DEFAULT_CORS_ORIGIN = "https://immeubleassur.com";
const corsHeaders = {
  "Access-Control-Allow-Origin": DEFAULT_CORS_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin"
};

function json(body, status = 200, request = null, env = null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeadersFor(request, env) });
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

function turnstileAllowedHostnames(env) {
  const configured = clean(env?.TURNSTILE_ALLOWED_HOSTNAMES, 500)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : ["immeubleassur.com", "www.immeubleassur.com"];
}

function turnstileHostnameValid(env, hostname) {
  const value = clean(hostname, 255).toLowerCase();
  if (!value) return false;
  return turnstileAllowedHostnames(env).includes(value);
}

function turnstileActionValid(action, expectedAction) {
  const value = clean(action, 120);
  return Boolean(value && value === expectedAction);
}

function requestHeaderHostname(value) {
  const header = clean(value, 500);
  if (!header) return "";
  try {
    return new URL(header).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function requestOriginStatus(request, env) {
  const origin = clean(request.headers.get("Origin"), 500);
  const referer = clean(request.headers.get("Referer"), 500);
  if (origin) {
    const hostname = requestHeaderHostname(origin);
    if (!turnstileHostnameValid(env, hostname)) {
      return { ok: false, status: hostname ? "origin-invalide" : "origin-malforme", header: "origin", hostname };
    }
  }
  if (referer) {
    const hostname = requestHeaderHostname(referer);
    if (!turnstileHostnameValid(env, hostname)) {
      return { ok: false, status: hostname ? "referer-invalide" : "referer-malforme", header: "referer", hostname };
    }
  }
  return { ok: true, status: origin || referer ? "origin-ok" : "origin-absente" };
}

function corsOriginAllowed(origin, env) {
  const header = clean(origin, 500);
  if (!header) return false;
  try {
    const parsed = new URL(header);
    return parsed.protocol === "https:" && turnstileHostnameValid(env, parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function corsHeadersFor(request, env) {
  const next = { ...corsHeaders };
  const origin = clean(request?.headers?.get?.("Origin"), 500);
  if (corsOriginAllowed(origin, env)) next["Access-Control-Allow-Origin"] = origin;
  return next;
}

async function verifyTurnstile(env, payload, ip, expectedAction = "lead_form") {
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
    const hostname = clean(result.hostname, 255).toLowerCase();
    const action = clean(result.action, 120);

    if (response.ok && result.success) {
      if (!turnstileHostnameValid(env, hostname)) {
        return { ok: false, configured: true, status: hostname ? "hostname-invalide" : "hostname-manquant", errorCodes: ["invalid-hostname"], hostname, action };
      }
      if (!turnstileActionValid(action, expectedAction)) {
        return { ok: false, configured: true, status: action ? "action-invalide" : "action-manquante", errorCodes: ["invalid-action"], hostname, action };
      }
      return { ok: true, configured: true, status: "verified", hostname, action };
    }

    return { ok: false, configured: true, status: "refuse", errorCodes, hostname, action };
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

function leadDuplicateReason(record, existing) {
  const sameEmail = clean(existing.email, 180).toLowerCase() === clean(record.email, 180).toLowerCase();
  const phone = phoneDigits(record.phone);
  const samePhone = phone.length >= 8 && phoneDigits(existing.phone).endsWith(phone.slice(-8));
  const sameCity = clean(existing.city, 120).toLowerCase() === clean(record.city, 120).toLowerCase();
  const sameNeed = clean(existing.need, 80) && clean(existing.need, 80) === clean(record.need, 80);
  const sameProperty = clean(existing.property_type, 80) === clean(record.property_type, 80);

  if (sameEmail && samePhone) return "email-telephone";
  if (samePhone && sameCity && (sameNeed || sameProperty)) return "telephone-ville-besoin";
  if (sameEmail && sameCity && (sameNeed || sameProperty)) return "email-ville-besoin";
  return "";
}

async function findRecentDuplicateLead(env, record) {
  const email = clean(record.email, 180).toLowerCase();
  const phone = phoneDigits(record.phone);
  if (!email && phone.length < 8) return null;
  const phonePattern = phone.length >= 8 ? `%${phone.slice(-8)}` : "__no_phone_match__";
  const { results = [] } = await env.DB.prepare(
    `SELECT id, reference, email, phone, city, need, property_type, lead_score, created_at
       FROM leads
      WHERE created_at >= datetime('now', '-24 hours')
        AND (email = ? OR REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '.', ''), '-', ''), '+', '') LIKE ?)
      ORDER BY created_at DESC
      LIMIT 12`
  ).bind(email || "__no_email_match__", phonePattern).all();

  for (const existing of results || []) {
    const reason = leadDuplicateReason(record, existing);
    if (reason) return { ...existing, duplicate_reason: reason };
  }
  return null;
}

async function logDuplicateLead(env, request, payload, record, duplicate, now, ip, userAgent) {
  const path = clean(record.page_url || payload.page_url, 500).replace(/^https?:\/\/(www\.)?immeubleassur\.com/i, "") || clean(payload.path, 500) || "/api/leads";
  const context = {
    target: clean(record.need || "lead-duplicate", 120),
    label: clean(duplicate.duplicate_reason || "doublon-contact", 120),
    path,
    duplicate_reason: clean(duplicate.duplicate_reason || "", 120),
    existing_reference: clean(duplicate.reference, 80),
    existing_created_at: clean(duplicate.created_at, 80),
    source: clean(record.source || "website", 120),
    source_path: clean(record.source_path || payload.source_path || payload.utm?.source_path, 500),
    content_bridge: clean(record.content_bridge || payload.content_bridge || payload.utm?.content_bridge, 20),
    content_kind: clean(record.content_kind || payload.content_kind || payload.utm?.content_kind, 80),
    city: clean(record.city, 120),
    page_url: clean(record.page_url, 500),
    session_id: clean(record.session_id, 120),
    contact_match: [record.email && "email", phoneDigits(record.phone).length >= 8 && "telephone"].filter(Boolean).join("+")
  };
  await env.DB.prepare(
    `INSERT INTO site_events (
      id, event_type, page_url, target, session_id, lead_reference,
      payload, ip_address, user_agent, created_at
    ) VALUES (?, 'lead_duplicate_filtered', ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      clean(record.page_url, 500),
      context.target,
      clean(record.session_id, 120),
      clean(duplicate.reference, 80),
      JSON.stringify(context),
      clean(ip, 120),
      clean(userAgent, 500),
      now
    )
    .run();

  await logLeadEvent(env, duplicate.id, "lead_duplicate_filtered", context, now);
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
    first_referrer: clean(payload.utm?.first_referrer || payload.referrer, 500),
    turnstile: clean(assessment.turnstile_status || "", 120),
    turnstile_action: clean(assessment.turnstile_action || "", 120),
    turnstile_hostname: clean(assessment.turnstile_hostname || "", 255),
    turnstile_errors: Array.isArray(assessment.turnstile_errors) ? assessment.turnstile_errors.slice(0, 5).join(", ") : "",
    origin_status: clean(assessment.origin_status || "", 120),
    origin_header: clean(assessment.origin_header || "", 40),
    origin_hostname: clean(assessment.origin_hostname || "", 255)
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

function leadUrgency(payload = {}) {
  const intent = clean(payload.intent || payload.utm?.intent, 80);
  const text = `${payload.message || ""} ${payload.need || ""} ${payload.property_type || ""} ${payload.source || ""} ${intent}`.toLowerCase();
  const units = unitCount(payload.units_count);
  if (/sinistre|degat|resili|refus|mise en demeure|sans assurance|urgent|aujourd|demain|echeance proche/.test(text)) {
    return { level: "immediate", label: "Urgence immediate", reason: "sinistre/resiliation/echeance", sla_hours: 2, score_boost: 12 };
  }
  if (/echeance|preavis|travaux|chantier|ravalement|toiture|dommages-ouvrage|local-commercial/.test(text) || units >= 10) {
    return { level: "this-month", label: "A traiter ce mois-ci", reason: "echeance/travaux/immeuble multi-lots", sla_hours: 6, score_boost: 8 };
  }
  if (/prix|tarif|comparateur|devis|audit|veille/.test(text)) {
    return { level: "quote-ready", label: "Devis a cadrer", reason: "comparaison/prix/audit", sla_hours: 24, score_boost: 4 };
  }
  return { level: "standard", label: "Qualification standard", reason: "information minimale", sla_hours: 48, score_boost: 0 };
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

function slaHoursFor(score, valueEstimate, urgency = null) {
  const maxValue = Number(valueEstimate?.annual_premium_max || 0);
  let base = 48;
  if (score >= 85 || maxValue >= 9000) base = 2;
  else if (score >= 70 || maxValue >= 3500) base = 6;
  else if (score >= 45 || maxValue >= 1200) base = 24;
  return urgency?.sla_hours ? Math.min(base, urgency.sla_hours) : base;
}

function priorityFromScore(score) {
  if (score >= 85) return "hot";
  if (score >= 70) return "warm";
  if (score >= 45) return "standard";
  return "low";
}

function nextActionFor(payload, score) {
  if (clean(payload.submission_mode, 80) === "express-callback") return "Rappeler en priorite pour completer profil, ville, type de bien et pieces assureur.";
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
  const urgency = leadUrgency(payload);
  const readinessText = `${payload.message || ""} ${source} ${intent} ${urgency.level}`;
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
  if (urgency.score_boost) {
    score += urgency.score_boost;
    addReason(reasons, `urgence ${urgency.level}`);
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
  if (clean(payload.submission_mode, 80) === "express-callback") {
    score += 6;
    addReason(reasons, "rappel express");
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
    sla_hours: slaHoursFor(score, valueEstimate, urgency),
    urgency,
    next_action: nextActionFor(payload, score)
  };
}

function validate(payload) {
  const express = clean(payload.submission_mode, 80) === "express-callback";
  const email = clean(payload.email, 180);
  const phone = clean(payload.phone, 80);
  const validEmail = email.includes("@") && email.length >= 6;
  const validPhone = phone.replace(/\D/g, "").length >= 9;
  if (express) {
    if (payload.consent !== true) return "Consentement requis";
    if (email && !validEmail) return "Email invalide";
    if (phone && !validPhone) return "Telephone invalide";
    if (!validEmail && !validPhone) return "Telephone ou email requis";
    return "";
  }
  const required = ["name", "phone", "profile", "property_type", "city"];
  for (const field of required) {
    if (!clean(payload[field])) return `Champ manquant: ${field}`;
  }
  if (email && !validEmail) return "Email invalide";
  if (!validPhone) return "Telephone invalide";
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
    content_bridge: clean(raw.content_bridge, 20),
    content_kind: clean(raw.content_kind, 80),
    landing_path: clean(raw.landing_path, 500),
    lead_urgency: clean(raw.lead_urgency, 80),
    lead_urgency_reason: clean(raw.lead_urgency_reason, 160),
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

function leadMailConfig(env) {
  const resendMode = String(env.EMAIL_TRANSPORT || "").toLowerCase() === "resend";
  const host = clean(env.SMTP_HOST, 160);
  const port = Number.parseInt(env.SMTP_PORT || "587", 10);
  const username = clean(env.SMTP_USER || env.SMTP_FROM, 180);
  const password = String(env.SMTP_PASS || "");
  const from = clean(env.SMTP_FROM || env.RESEND_FROM || username, 180);
  const recipients = parseRecipients(env.SMTP_TO || env.CONTACT_EMAIL || from);
  if (resendMode && clean(env.RESEND_API_KEY, 300) && from && recipients.length) return { host: "resend", port: 443, username: "", password: "", from, to: recipients, secureTransport: "https" };
  if (!host || !port || !username || !password || !from || recipients.length === 0) return null;
  return {
    host,
    port,
    username,
    password,
    from,
    to: recipients,
    secureTransport: port === 465 ? "on" : "starttls"
  };
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
  const subject = record.email ? `Nouveau lead ImmeubleAssur ${reference}` : `Nouveau lead ImmeubleAssur ${reference} - TELEPHONE SEUL`;
  const text = [
    `Reference: ${reference}`,
    `Mode: ${record.submission_mode || "complet"}`,
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
    `Email: ${record.email || "non renseigne - contacter par telephone"}`,
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
    `Urgence: ${record.lead_urgency || qualification.urgency?.level || "standard"}`,
    `Raison urgence: ${record.lead_urgency_reason || qualification.urgency?.reason || "information minimale"}`,
    `Chemin source: ${record.source_path || "non precise"}`,
    `Pont contenu: ${record.content_bridge === "1" ? "oui" : "non"}`,
    `Type contenu: ${record.content_kind || "non precise"}`,
    `Campagne: ${record.utm?.utm_campaign || "non precisee"}`,
    `Test CTA: ${record.experiment_variant || "non mesure"}`,
    `Lead ID: ${id}`
  ].join("\n");
  return { subject, text };
}

async function sendSmtpMail(config, message, env) {
  return sendPortableSmtpMail(config, message, env);
}

function buildDuplicateLeadEmail({ duplicate, record, now }) {
  const subject = record.email ? `Retour prospect ImmeubleAssur ${duplicate.reference}` : `Retour prospect ImmeubleAssur ${duplicate.reference} - TELEPHONE SEUL`;
  const text = [
    `Reference existante: ${duplicate.reference}`,
    `Motif doublon: ${duplicate.duplicate_reason || "doublon-contact"}`,
    `Score existant: ${Number(duplicate.lead_score || 0)}`,
    `Lead cree le: ${duplicate.created_at || "non precise"}`,
    `Retour recu le: ${now}`,
    "",
    "Le prospect vient de renvoyer une demande sur un dossier deja ouvert.",
    "Action: rappeler rapidement le dossier existant au lieu de creer un nouveau lead.",
    "",
    `Nom: ${record.name}`,
    `Telephone: ${record.phone}`,
    `Email: ${record.email || "non renseigne - contacter par telephone"}`,
    `Profil: ${record.profile}`,
    `Type de bien: ${record.property_type}`,
    `Ville: ${record.city}`,
    `Lots: ${record.units_count || "non precise"}`,
    `Besoin: ${record.need || "non precise"}`,
    "",
    "Message renvoye:",
    record.message || "Aucun message.",
    "",
    `Page: ${record.page_url || "non precisee"}`,
    `Source: ${record.source || "website"}`,
    `Intent: ${record.intent || "non precise"}`,
    `Session: ${record.session_id || "non precisee"}`
  ].join("\n");
  return { subject, text };
}

async function notifyLeadByEmail({ id, reference, score, qualification, record, now }, env) {
  const config = leadMailConfig(env);
  if (!config) return { attempted: false, status: "skipped" };

  const { subject, text } = buildLeadEmail({ id, reference, score, qualification, record, now });
  const headers = [
    `From: ImmeubleAssur <${config.from}>`,
    `To: ${config.to.join(", ")}`,
    ...(record.email ? [`Reply-To: ${headerSafe(record.email)}`] : []),
    `Subject: ${headerSafe(subject)}`,
    `Date: ${new Date(now).toUTCString()}`,
    `Message-ID: <${reference}.${id}@immeubleassur.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit"
  ];

  const receipt = await sendSmtpMail(config, `${headers.join("\r\n")}\r\n\r\n${text}`, env);
  return { attempted: true, status: "sent", receipt };
}

async function notifyDuplicateLeadByEmail({ duplicate, record, now }, env) {
  const config = leadMailConfig(env);
  if (!config) return { attempted: false, status: "skipped" };

  const { subject, text } = buildDuplicateLeadEmail({ duplicate, record, now });
  const parsedNow = Date.parse(now);
  const messageIdTime = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const headers = [
    `From: ImmeubleAssur <${config.from}>`,
    `To: ${config.to.join(", ")}`,
    ...(record.email ? [`Reply-To: ${headerSafe(record.email)}`] : []),
    `Subject: ${headerSafe(subject)}`,
    `Date: ${new Date(now).toUTCString()}`,
    `Message-ID: <duplicate.${duplicate.reference}.${messageIdTime}@immeubleassur.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit"
  ];

  const receipt = await sendSmtpMail(config, `${headers.join("\r\n")}\r\n\r\n${text}`, env);
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

export { validate as validateLeadPayload, buildLeadEmail, buildDuplicateLeadEmail };

export async function onRequestOptions({ request, env }) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request, env) });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const reply = (body, status = 200) => json(body, status, request, env);
  let payload;

  try {
    payload = await request.json();
  } catch {
    return reply({ success: false, error: "JSON invalide" }, 400);
  }

  const now = new Date().toISOString();
  const ip = (request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || request.headers.get("X-Real-IP") || "").split(",")[0].trim().slice(0, 120);
  const userAgent = request.headers.get("User-Agent") || "";

  if (!env.DB) {
    if (clean(payload.company_website)) return reply({ success: true, reference: "IGNORED" });
    return reply({ success: false, error: "Base SQLite indisponible" }, 503);
  }

  const originStatus = requestOriginStatus(request, env);
  if (!originStatus.ok) {
    const assessment = {
      score: 100,
      reasons: [`request-${originStatus.status || "origine-invalide"}`],
      blocked: true,
      action: "block",
      origin_status: originStatus.status || "",
      origin_header: originStatus.header || "",
      origin_hostname: originStatus.hostname || ""
    };
    await logSpamAttempt(env, request, payload, assessment, now, ip, userAgent);
    return reply({ success: false, error: "Origine de formulaire non autorisee.", challenge: "origin-failed", origin: originStatus.status }, 403);
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
    return reply({ success: false, error: "Verification anti-robot invalide. Rechargez la page puis recommencez.", challenge: "local-failed" }, 403);
  }

  const turnstile = await verifyTurnstile(env, payload, ip, "lead_form");
  if (!turnstile.ok) {
    const assessment = {
      score: 95,
      reasons: [`turnstile-${turnstile.status || "echec"}`, ...(turnstile.errorCodes || []).map((code) => `turnstile-${clean(code, 60)}`).slice(0, 3)],
      blocked: true,
      action: "block",
      turnstile_status: turnstile.status || "",
      turnstile_action: turnstile.action || "",
      turnstile_hostname: turnstile.hostname || "",
      turnstile_errors: turnstile.errorCodes || []
    };
    await logSpamAttempt(env, request, payload, assessment, now, ip, userAgent);
    return reply({ success: false, error: "Verification anti-robot Cloudflare invalide. Rechargez la page puis recommencez.", challenge: "turnstile-failed", turnstile: turnstile.status }, 403);
  }

  const spamHistory = await loadSpamHistory(env, payload, clean(ip, 120));
  const spamAssessment = assessSpamSubmission(payload, { ip, userAgent, history: spamHistory });
  if (spamAssessment.blocked) {
    await logSpamAttempt(env, request, payload, spamAssessment, now, ip, userAgent);
    if (spamAssessment.action === "silent_drop") return reply({ success: true, reference: "FILTERED", spam_blocked: true });
    return reply({ success: false, error: "Demande bloquee par le filtre anti-spam. Contactez-nous par telephone si besoin." }, 429);
  }

  const validationError = validate(payload);
  if (validationError) {
    return reply({ success: false, error: validationError }, 422);
  }

  const qualification = qualifyLead(payload);
  const score = qualification.score;
  const experiment = payload.experiment || {};
  const submissionMode = clean(payload.submission_mode, 80);
  const isExpress = submissionMode === "express-callback";
  const expressNote = isExpress ? "Mode rappel express: le prospect accepte un rappel avec informations minimales; completer profil, type de bien, ville et pieces au telephone." : "";
  const message = clean([clean(payload.message, 1800), expressNote].filter(Boolean).join("\n\n"), 2000);

  const record = {
    name: clean(payload.name, 160) || (isExpress ? "A preciser" : ""),
    phone: clean(payload.phone, 80),
    email: clean(payload.email, 180).toLowerCase(),
    profile: clean(payload.profile, 80) || (isExpress ? "a-preciser" : ""),
    property_type: clean(payload.property_type, 80) || (isExpress ? "a-preciser" : ""),
    city: clean(payload.city, 120) || (isExpress ? "a-preciser" : ""),
    units_count: clean(payload.units_count, 20),
    need: clean(payload.need, 80),
    message,
    submission_mode: submissionMode,
    source: clean(payload.source || "website", 80),
    intent: clean(payload.intent || payload.utm?.intent, 80),
    source_path: clean(payload.source_path || payload.utm?.source_path, 500),
    content_bridge: clean(payload.content_bridge || payload.utm?.content_bridge, 20) === "1" ? "1" : "",
    content_kind: clean(payload.content_kind || payload.utm?.content_kind, 80),
    landing_path: clean(payload.landing_path || payload.utm?.landing_path, 500),
    lead_urgency: clean(payload.lead_urgency || payload.utm?.lead_urgency || qualification.urgency?.level, 80),
    lead_urgency_reason: clean(payload.lead_urgency_reason || payload.utm?.lead_urgency_reason || qualification.urgency?.reason, 160),
    page_url: clean(payload.page_url, 500),
    referrer: clean(payload.referrer, 500),
    session_id: clean(payload.session_id, 120),
    ga_client_id: clean(payload.ga_client_id, 120),
    experiment_id: clean(payload.experiment_id || experiment.experiment_id, 80),
    experiment_variant: clean(payload.experiment_variant || experiment.experiment_variant, 80),
    experiment_label: clean(payload.experiment_label || experiment.experiment_label, 120),
    utm: cleanUtm(payload.utm || {})
  };

  const duplicateLead = await findRecentDuplicateLead(env, record);
  if (duplicateLead) {
    await logDuplicateLead(env, request, payload, record, duplicateLead, now, ip, userAgent);
    let notification = { attempted: false, status: "skipped" };
    try {
      notification = await notifyDuplicateLeadByEmail({ duplicate: duplicateLead, record, now }, env);
      if (notification.attempted) {
        await logLeadEvent(env, duplicateLead.id, "duplicate_email_notification_sent", { reference: duplicateLead.reference, duplicate_reason: duplicateLead.duplicate_reason, receipt: notification.receipt }, now);
      }
    } catch (error) {
      notification = { attempted: true, status: "failed" };
      await logLeadEvent(env, duplicateLead.id, "duplicate_email_notification_failed", { reference: duplicateLead.reference, duplicate_reason: duplicateLead.duplicate_reason, error: error.message || "Erreur SMTP" }, now);
    }
    return reply({
      success: true,
      duplicate: true,
      status: "duplicate_recent",
      id: duplicateLead.id,
      reference: duplicateLead.reference,
      score: Number(duplicateLead.lead_score || 0),
      duplicate_reason: duplicateLead.duplicate_reason,
      notification: notification.status
    });
  }

  const id = crypto.randomUUID();
  const reference = `IMB-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

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
      content_bridge: record.content_bridge,
      content_kind: record.content_kind,
      landing_path: record.landing_path,
      lead_urgency: record.lead_urgency,
      lead_urgency_reason: record.lead_urgency_reason,
      page_url: record.page_url,
      referrer: record.referrer,
      session_id: record.session_id,
      ga_client_id: record.ga_client_id,
      experiment_id: record.experiment_id,
      experiment_variant: record.experiment_variant,
      experiment_label: record.experiment_label,
      experiment: { id: record.experiment_id, variant: record.experiment_variant, label: record.experiment_label },
      submission_mode: record.submission_mode,
      contact_mode: [record.email && "email", phoneDigits(record.phone).length >= 8 && "telephone"].filter(Boolean).join("+"),
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

    return reply({ success: true, id, reference, score, priority: qualification.priority, reasons: qualification.reasons, value_estimate: qualification.value_estimate, sla_hours: qualification.sla_hours, lead_urgency: record.lead_urgency, lead_urgency_reason: record.lead_urgency_reason, next_action: qualification.next_action, submission_mode: record.submission_mode, notification: notification.status });
  } catch (error) {
    return reply({ success: false, error: error.message || "Erreur base de donnees" }, 500);
  }
}

