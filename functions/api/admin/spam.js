import { adminTokenMatches } from "../../_shared/admin-auth.js";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function authorized(request, env) { return adminTokenMatches(request, env); }

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

function rowsOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function errorOf(value) {
  return value && value.error ? value.error : "";
}

function numberOf(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function pct(part, total) {
  const denominator = numberOf(total);
  if (!denominator) return 0;
  return Math.round((numberOf(part) / denominator) * 1000) / 10;
}

function maskIp(value) {
  const ip = String(value || "").trim();
  if (!ip) return "non-renseigne";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  }
  if (ip.includes(":")) {
    return `${ip.split(":").slice(0, 4).join(":")}::x`;
  }
  return `${ip.slice(0, 6)}...`;
}

function uaFamily(value) {
  const ua = String(value || "");
  if (!ua) return "absent";
  if (/bot|crawl|spider/i.test(ua)) return "bot/crawler";
  if (/curl|wget|python|scrapy|httpclient|go-http-client/i.test(ua)) return "script/http";
  if (/headless|selenium|phantom|puppeteer|playwright/i.test(ua)) return "headless";
  if (/Chrome/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  if (/Firefox/i.test(ua)) return "firefox";
  return "autre";
}

function sanitizeRecent(rows = []) {
  return rows.map((row) => ({
    event_type: row.event_type || "",
    path: row.path || row.page_url || "/",
    target: row.target || "",
    reason: row.reason || "anti-spam",
    spam_score: numberOf(row.spam_score),
    ip_fingerprint: maskIp(row.ip_address),
    user_agent_family: uaFamily(row.user_agent),
    created_at: row.created_at || ""
  }));
}

function sanitizeSources(rows = []) {
  return rows.map((row) => ({
    ip_fingerprint: maskIp(row.ip_address),
    blocked: numberOf(row.blocked),
    sessions: numberOf(row.sessions),
    paths: numberOf(row.paths),
    max_score: numberOf(row.max_score),
    user_agent_family: uaFamily(row.user_agent),
    last_seen: row.last_seen || ""
  }));
}

function countFrom(rows, key) {
  const row = rows.find((item) => item.event_type === key);
  return numberOf(row?.count);
}

function buildActions({ summary, topReasons, topPaths, repeatSources, duplicates }) {
  const actions = [];
  const blocks30d = numberOf(summary.spam_blocks_30d);
  const submitAttempts = numberOf(summary.submit_attempts_30d);
  const duplicateLeads30d = numberOf(summary.duplicate_leads_30d);
  const blockRate = pct(blocks30d, blocks30d + submitAttempts);
  const topReason = topReasons[0];
  const topPath = topPaths[0];
  const repeatSource = repeatSources[0];
  const topDuplicate = duplicates[0];

  if (blocks30d > 0) {
    actions.push({
      priority: 94,
      type: "robots-bloques",
      signal: `${blocks30d} blocage(s) sur 30 jours`,
      recommendation: "Continuer a surveiller les raisons de blocage avant d'assouplir les formulaires."
    });
  }

  if (blockRate >= 25) {
    actions.push({
      priority: 92,
      type: "pression-spam-elevee",
      signal: `${blockRate}% des tentatives recentes sont filtrees`,
      recommendation: "Verifier que le filtre local reste actif en production et conserver le honeypot sur tous les formulaires."
    });
  }

  if (topReason && numberOf(topReason.blocked) >= 3) {
    actions.push({
      priority: 88,
      type: "raison-dominante",
      signal: `${topReason.reason}: ${topReason.blocked} blocage(s)`,
      recommendation: "Utiliser cette raison pour ajuster les seuils sans bloquer les vrais prospects."
    });
  }

  if (topPath && numberOf(topPath.blocked) >= 3) {
    actions.push({
      priority: 84,
      type: "page-ciblee",
      signal: `${topPath.path}: ${topPath.blocked} blocage(s)`,
      recommendation: "Controler cette page: CTA, formulaire, signaux anti-robots locaux et absence de champs ambigus."
    });
  }

  if (repeatSource && numberOf(repeatSource.blocked) >= 3) {
    actions.push({
      priority: 82,
      type: "source-repetee",
      signal: `${repeatSource.ip_fingerprint}: ${repeatSource.blocked} blocage(s)`,
      recommendation: "Surveiller la source masquee et renforcer le filtrage si elle revient sur plusieurs sessions."
    });
  }

  if (duplicateLeads30d > 0) {
    actions.push({
      priority: 90,
      type: "doublons-filtres",
      signal: `${duplicateLeads30d} demande(s) deja connue(s) sur 30 jours`,
      recommendation: "Ne pas les compter comme nouveaux leads; utiliser ces signaux pour relancer le dossier existant."
    });
  }

  if (topDuplicate && numberOf(topDuplicate.duplicates) >= 3) {
    actions.push({
      priority: 83,
      type: "page-doublons",
      signal: `${topDuplicate.path}: ${topDuplicate.duplicates} doublon(s)`,
      recommendation: "Verifier si cette page provoque des renvois repetes et ajouter un message de confirmation plus visible si besoin."
    });
  }

  if (!actions.length) {
    actions.push({
      priority: 60,
      type: "surveillance-active",
      signal: "aucune pression spam significative",
      recommendation: "Garder le suivi actif et verifier les prochains formulaires apres chaque evolution UX."
    });
  }

  return actions.sort((a, b) => b.priority - a.priority).slice(0, 12);
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);

  const [
    eventCounts,
    periods,
    topReasons,
    topPaths,
    repeatSources,
    recentBlocks,
    validationErrors,
    duplicates
  ] = await Promise.all([
    safeAll(env, `SELECT event_type, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') AND event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked', 'lead_submit_error', 'form_submit_attempt', 'lead_created', 'form_start', 'lead_duplicate_filtered') GROUP BY event_type ORDER BY count DESC`),
    safeFirst(env, `SELECT
      SUM(CASE WHEN event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked') AND created_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS spam_blocks_24h,
      SUM(CASE WHEN event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked') AND created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS spam_blocks_7d,
      SUM(CASE WHEN event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked') AND created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS spam_blocks_30d,
      SUM(CASE WHEN event_type = 'lead_duplicate_filtered' AND created_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS duplicate_leads_24h,
      SUM(CASE WHEN event_type = 'lead_duplicate_filtered' AND created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS duplicate_leads_7d,
      SUM(CASE WHEN event_type = 'lead_duplicate_filtered' AND created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS duplicate_leads_30d,
      SUM(CASE WHEN event_type = 'form_submit_attempt' AND created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS submit_attempts_30d,
      SUM(CASE WHEN event_type = 'lead_created' AND created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS leads_30d
      FROM site_events WHERE created_at >= datetime('now', '-30 days')`),
    safeAll(env, `SELECT event_type, COALESCE(NULLIF(json_extract(payload, '$.label'), ''), COALESCE(NULLIF(json_extract(payload, '$.reason'), ''), 'anti-spam')) AS reason, COUNT(*) AS blocked, COALESCE(MAX(CAST(NULLIF(json_extract(payload, '$.spam_score'), '') AS REAL)), 0) AS max_score, MAX(created_at) AS last_seen FROM site_events WHERE event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked') AND created_at >= datetime('now', '-30 days') GROUP BY event_type, reason ORDER BY blocked DESC, max_score DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COUNT(*) AS blocked, SUM(CASE WHEN event_type = 'lead_spam_blocked' THEN 1 ELSE 0 END) AS lead_blocks, SUM(CASE WHEN event_type = 'newsletter_spam_blocked' THEN 1 ELSE 0 END) AS newsletter_blocks, MAX(created_at) AS last_seen FROM site_events WHERE event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked') AND created_at >= datetime('now', '-30 days') GROUP BY path ORDER BY blocked DESC, last_seen DESC LIMIT 20`),
    safeAll(env, `SELECT ip_address, COUNT(*) AS blocked, COUNT(DISTINCT session_id) AS sessions, COUNT(DISTINCT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/')) AS paths, COALESCE(MAX(CAST(NULLIF(json_extract(payload, '$.spam_score'), '') AS REAL)), 0) AS max_score, MAX(user_agent) AS user_agent, MAX(created_at) AS last_seen FROM site_events WHERE event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked') AND created_at >= datetime('now', '-30 days') AND COALESCE(NULLIF(ip_address, ''), '') <> '' GROUP BY ip_address ORDER BY blocked DESC, sessions DESC, paths DESC LIMIT 20`),
    safeAll(env, `SELECT event_type, COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, target, COALESCE(NULLIF(json_extract(payload, '$.label'), ''), 'anti-spam') AS reason, COALESCE(CAST(NULLIF(json_extract(payload, '$.spam_score'), '') AS REAL), 0) AS spam_score, ip_address, user_agent, created_at FROM site_events WHERE event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked') AND created_at >= datetime('now', '-30 days') ORDER BY created_at DESC LIMIT 30`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.missing'), ''), COALESCE(NULLIF(json_extract(payload, '$.label'), ''), 'validation')) AS missing, COUNT(*) AS errors, MAX(created_at) AS last_seen FROM site_events WHERE event_type = 'lead_submit_error' AND created_at >= datetime('now', '-30 days') GROUP BY path, missing ORDER BY errors DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.duplicate_reason'), ''), COALESCE(NULLIF(json_extract(payload, '$.label'), ''), 'doublon-contact')) AS reason, COUNT(*) AS duplicates, COUNT(DISTINCT NULLIF(lead_reference, '')) AS existing_leads, MAX(created_at) AS last_seen FROM site_events WHERE event_type = 'lead_duplicate_filtered' AND created_at >= datetime('now', '-30 days') GROUP BY path, reason ORDER BY duplicates DESC, last_seen DESC LIMIT 20`)
  ]);

  const cleanEventCounts = rowsOrEmpty(eventCounts);
  const summary = {
    spam_blocks_24h: numberOf(periods?.spam_blocks_24h),
    spam_blocks_7d: numberOf(periods?.spam_blocks_7d),
    spam_blocks_30d: numberOf(periods?.spam_blocks_30d),
    duplicate_leads_24h: numberOf(periods?.duplicate_leads_24h),
    duplicate_leads_7d: numberOf(periods?.duplicate_leads_7d),
    duplicate_leads_30d: numberOf(periods?.duplicate_leads_30d),
    lead_spam_blocks_30d: countFrom(cleanEventCounts, "lead_spam_blocked"),
    newsletter_spam_blocks_30d: countFrom(cleanEventCounts, "newsletter_spam_blocked"),
    validation_errors_30d: countFrom(cleanEventCounts, "lead_submit_error"),
    submit_attempts_30d: numberOf(periods?.submit_attempts_30d),
    leads_30d: numberOf(periods?.leads_30d)
  };
  summary.block_rate = pct(summary.spam_blocks_30d, summary.spam_blocks_30d + summary.submit_attempts_30d);
  summary.duplicate_filter_rate = pct(summary.duplicate_leads_30d, summary.duplicate_leads_30d + summary.leads_30d);

  const cleanTopReasons = rowsOrEmpty(topReasons);
  const cleanTopPaths = rowsOrEmpty(topPaths);
  const cleanRepeatSources = sanitizeSources(rowsOrEmpty(repeatSources));
  const cleanDuplicates = rowsOrEmpty(duplicates);

  return json({
    success: true,
    generated_at: new Date().toISOString(),
    summary,
    event_counts: cleanEventCounts,
    top_reasons: cleanTopReasons,
    top_paths: cleanTopPaths,
    repeat_sources: cleanRepeatSources,
    recent_blocks: sanitizeRecent(rowsOrEmpty(recentBlocks)),
    validation_errors: rowsOrEmpty(validationErrors),
    duplicates: cleanDuplicates,
    actions: buildActions({ summary, topReasons: cleanTopReasons, topPaths: cleanTopPaths, repeatSources: cleanRepeatSources, duplicates: cleanDuplicates }),
    privacy: "Les IP sont masquees dans cette reponse admin; les valeurs brutes restent limitees a SQLite local.",
    warnings: [
      errorOf(eventCounts),
      errorOf(periods),
      errorOf(topReasons),
      errorOf(topPaths),
      errorOf(repeatSources),
      errorOf(recentBlocks),
      errorOf(validationErrors),
      errorOf(duplicates)
    ].filter(Boolean)
  });
}
