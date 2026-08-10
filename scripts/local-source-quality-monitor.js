import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

const SITE = "https://immeubleassur.com";
const AI_SOURCE_PATTERNS = [
  ["chatgpt", /chatgpt|openai/],
  ["perplexity", /perplexity/],
  ["claude", /claude|anthropic/],
  ["copilot", /copilot/]
];

const ENGAGEMENT_EVENTS = new Set([
  "cta_click", "phone_click", "form_start", "form_submit_attempt", "lead_created",
  "traffic_without_click_urgency_select", "traffic_without_click_quote_click",
  "traffic_without_click_phone_click", "content_lead_bridge_quote_click",
  "content_lead_bridge_phone_click"
]);
const ORGANIC_HOSTS = [
  "google.",
  "bing.",
  "duckduckgo.",
  "qwant.",
  "yahoo.",
  "ecosia."
];

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function numberValue(value, fallback) {
  const number = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(number) ? number : fallback;
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function pct(part, total) {
  const numerator = Number(part || 0);
  const denominator = Number(total || 0);
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function parseJson(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function pathOf(value) {
  const raw = clean(value, 700);
  if (!raw) return "/";
  try {
    return new URL(raw, SITE).pathname || "/";
  } catch {
    return raw.startsWith("/") ? raw.split("?")[0] || "/" : "/";
  }
}

function hostOf(value) {
  const raw = clean(value, 700).toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw, SITE).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeSource(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "") || "";
}

function sourceFromPayload(row, payload = {}) {
  const originSource = normalizeSource(payload.source_origin);
  if (originSource && String(row.event_type || "").startsWith("traffic_without_click")) return originSource.startsWith("intent:") ? "intent-prefill" : originSource;
  const utmSource = normalizeSource(payload.utm_source || payload.utm?.utm_source);
  const medium = normalizeSource(payload.utm_medium || payload.utm?.utm_medium);
  const aiUtm = AI_SOURCE_PATTERNS.find(([, pattern]) => pattern.test(utmSource));
  if (aiUtm) return `ai-referral:${aiUtm[0]}`;
  if (utmSource && medium) return `utm:${utmSource}/${medium}`;
  if (utmSource) return `utm:${utmSource}`;
  const earlyReferrer = hostOf(payload.first_referrer || payload.referrer || row.referrer);
  const earlyAiReferrer = AI_SOURCE_PATTERNS.find(([, pattern]) => pattern.test(earlyReferrer));
  if (earlyAiReferrer) return `ai-referral:${earlyAiReferrer[0]}`;
  const source = normalizeSource(payload.source || row.source);
  if (source) return source.startsWith("intent:") ? "intent-prefill" : source;
  const referrer = hostOf(payload.first_referrer || payload.referrer || row.referrer);
  if (referrer && !referrer.endsWith("immeubleassur.com")) {
    const aiReferrer = AI_SOURCE_PATTERNS.find(([, pattern]) => pattern.test(referrer));
    if (aiReferrer) return `ai-referral:${aiReferrer[0]}`;
    if (ORGANIC_HOSTS.some((host) => referrer.includes(host))) return "organic-search";
    return `referral:${referrer}`;
  }
  return "direct";
}

function createBucket(source) {
  return {
    source,
    sessions: new Set(),
    engaged_sessions: new Set(),
    landing_paths: new Map(),
    page_views: 0,
    cta_clicks: 0,
    phone_clicks: 0,
    form_starts: 0,
    submit_attempts: 0,
    submit_errors: 0,
    abandoned_forms: 0,
    spam_blocks: 0,
    traffic_rescue_shown: 0,
    traffic_rescue_urgency_selects: 0,
    traffic_rescue_clicks: 0,
    traffic_rescue_direct_shown: 0,
    traffic_rescue_direct_clicks: 0,
    leads_event: 0,
    leads_db: 0,
    hot_leads_db: 0,
    score_sum: 0
  };
}

function addPath(bucket, path, row = {}, eventType = "") {
  if (!path) return;
  const current = bucket.landing_paths.get(path) || { path, session_set: new Set(), sessions: 0, page_views: 0, form_starts: 0, leads: 0 };
  if (row.session_id) current.session_set.add(row.session_id);
  current.sessions = current.session_set.size;
  if (eventType === "page_view") current.page_views += 1;
  if (eventType === "form_start") current.form_starts += 1;
  if (eventType === "lead_created") current.leads += 1;
  bucket.landing_paths.set(path, current);
}

function countEvent(bucket, row, payload) {
  const type = row.event_type;
  if (row.session_id) bucket.sessions.add(row.session_id);
  if (row.session_id && ENGAGEMENT_EVENTS.has(type)) bucket.engaged_sessions.add(row.session_id);
  if (type === "page_view") bucket.page_views += 1;
  if (["cta_click", "traffic_without_click_quote_click", "content_lead_bridge_quote_click"].includes(type)) bucket.cta_clicks += 1;
  if (["phone_click", "traffic_without_click_phone_click", "content_lead_bridge_phone_click"].includes(type)) {
    bucket.cta_clicks += 1;
    bucket.phone_clicks += 1;
  }
  if (type === "form_start") bucket.form_starts += 1;
  if (type === "form_submit_attempt") bucket.submit_attempts += 1;
  if (type === "lead_submit_error" || type === "lead_submit_rejected") bucket.submit_errors += 1;
  if (type === "lead_form_abandoned") bucket.abandoned_forms += 1;
  if (type === "lead_spam_blocked") bucket.spam_blocks += 1;
  const rescueVariant = normalizeSource(payload.rescue_variant);
  const directRescue = rescueVariant === "source-quality-direct";
  if (type === "traffic_without_click_shown") bucket.traffic_rescue_shown += 1;
  if (type === "traffic_without_click_shown" && directRescue) bucket.traffic_rescue_direct_shown += 1;
  if (type === "traffic_without_click_urgency_select") bucket.traffic_rescue_urgency_selects += 1;
  if (["traffic_without_click_quote_click", "traffic_without_click_phone_click"].includes(type)) bucket.traffic_rescue_clicks += 1;
  if (["traffic_without_click_quote_click", "traffic_without_click_phone_click"].includes(type) && directRescue) bucket.traffic_rescue_direct_clicks += 1;
  if (type === "lead_created") bucket.leads_event += 1;
  const path = pathOf(payload.landing_page || payload.landing_path || payload.source_path || payload.path || row.page_url);
  addPath(bucket, path, row, type);
}

function countLead(bucket, row) {
  const score = Number(row.lead_score || 0);
  bucket.leads_db += 1;
  if (score >= 85) bucket.hot_leads_db += 1;
  bucket.score_sum += Number.isFinite(score) ? score : 0;
  const path = pathOf(row.page_url);
  const current = bucket.landing_paths.get(path) || { path, sessions: 0, page_views: 0, form_starts: 0, leads: 0 };
  current.leads += 1;
  bucket.landing_paths.set(path, current);
}

function finalize(bucket) {
  const sessions = bucket.sessions.size;
  const engagedSessions = bucket.engaged_sessions.size;
  const leads = Math.max(bucket.leads_db, bucket.leads_event);
  return {
    source: bucket.source,
    sessions,
    engaged_sessions: engagedSessions,
    page_views: bucket.page_views,
    cta_clicks: bucket.cta_clicks,
    phone_clicks: bucket.phone_clicks,
    form_starts: bucket.form_starts,
    submit_attempts: bucket.submit_attempts,
    submit_errors: bucket.submit_errors,
    abandoned_forms: bucket.abandoned_forms,
    spam_blocks: bucket.spam_blocks,
    traffic_rescue_shown: bucket.traffic_rescue_shown,
    traffic_rescue_urgency_selects: bucket.traffic_rescue_urgency_selects,
    traffic_rescue_clicks: bucket.traffic_rescue_clicks,
    traffic_rescue_click_rate: pct(bucket.traffic_rescue_clicks, bucket.traffic_rescue_shown),
    traffic_rescue_direct_shown: bucket.traffic_rescue_direct_shown,
    traffic_rescue_direct_clicks: bucket.traffic_rescue_direct_clicks,
    traffic_rescue_direct_click_rate: pct(bucket.traffic_rescue_direct_clicks, bucket.traffic_rescue_direct_shown),
    leads_event: bucket.leads_event,
    leads_db: bucket.leads_db,
    hot_leads_db: bucket.hot_leads_db,
    average_lead_score: bucket.leads_db ? Math.round(bucket.score_sum / bucket.leads_db) : 0,
    session_to_start_rate: pct(bucket.form_starts, sessions),
    engaged_session_to_start_rate: pct(bucket.form_starts, engagedSessions),
    start_to_lead_rate: pct(leads, bucket.form_starts),
    session_to_lead_rate: pct(leads, sessions),
    submit_error_rate: pct(bucket.submit_errors, bucket.submit_attempts),
    abandon_rate: pct(bucket.abandoned_forms, bucket.form_starts),
    spam_pressure_rate: pct(bucket.spam_blocks, bucket.form_starts + bucket.submit_attempts + bucket.spam_blocks),
    top_paths: [...bucket.landing_paths.values()]
      .sort((a, b) => b.leads - a.leads || b.form_starts - a.form_starts || b.page_views - a.page_views)
      .slice(0, 5)
      .map((item) => ({
        path: item.path,
        sessions: Number(item.sessions || 0),
        page_views: Number(item.page_views || 0),
        form_starts: Number(item.form_starts || 0),
        leads: Number(item.leads || 0)
      }))
  };
}

function recommendationFor(row) {
  if (row.engaged_sessions >= 10 && row.form_starts === 0 && row.traffic_rescue_shown === 0) {
    return {
      type: "source-sans-rattrapage",
      severity: "high",
      source: row.source,
      signal: `${row.engaged_sessions} session(s) engagee(s), 0 demarrage formulaire`,
      action: "Declencher le rattrapage homepage plus tot et verifier que le rappel express reste visible pour cette source.",
      score: 90
    };
  }
  if (row.traffic_rescue_direct_shown >= 10 && row.traffic_rescue_direct_clicks === 0) {
    return {
      type: "source-rattrapage-direct-sans-clic",
      severity: "high",
      source: row.source,
      signal: `${row.traffic_rescue_direct_shown} rattrapage(s) direct, 0 clic`,
      action: "Reviser le texte prioritaire et le bouton rappel immediat du variant direct pour cette source.",
      score: 88
    };
  }
  if (row.traffic_rescue_shown >= 10 && row.traffic_rescue_clicks === 0) {
    return {
      type: "source-rattrapage-sans-clic",
      severity: "high",
      source: row.source,
      signal: `${row.traffic_rescue_shown} rattrapage(s), 0 clic`,
      action: "Tester le texte, le delai et le bouton rappel express du panneau de rattrapage pour cette source.",
      score: 86
    };
  }
  if (row.form_starts >= 3 && row.leads_db === 0 && row.submit_attempts === 0) {
    return {
      type: "source-start-sans-submit",
      severity: "medium",
      source: row.source,
      signal: `${row.form_starts} start(s), 0 tentative`,
      action: "Verifier la friction mobile, le rappel express et les champs obligatoires pour cette source.",
      score: 78
    };
  }
  if (row.submit_attempts >= 2 && row.leads_db === 0) {
    return {
      type: "source-submit-sans-lead",
      severity: "high",
      source: row.source,
      signal: `${row.submit_attempts} tentative(s), 0 lead`,
      action: "Tester l'API leads, Turnstile et les validations pour le parcours de cette source.",
      score: 88
    };
  }
  if (row.submit_error_rate >= 25 && row.submit_attempts >= 4) {
    return {
      type: "source-erreurs-submit",
      severity: "medium",
      source: row.source,
      signal: `${row.submit_error_rate}% erreurs submit`,
      action: "Identifier les champs rejetes et simplifier l'aide de saisie pour cette source.",
      score: 74
    };
  }
  if (row.spam_pressure_rate >= 30 && row.spam_blocks >= 3) {
    return {
      type: "source-pression-spam",
      severity: "medium",
      source: row.source,
      signal: `${row.spam_blocks} blocage(s), pression ${row.spam_pressure_rate}%`,
      action: "Conserver Turnstile/local challenge et surveiller les sources qui declenchent les blocages.",
      score: 72
    };
  }
  return null;
}

function readEvents(database, sinceSql) {
  return database.prepare(`
    SELECT event_type, page_url, target, session_id, lead_reference, payload, created_at
    FROM site_events
    WHERE created_at >= datetime('now', ?)
      AND event_type IN (
        'page_view', 'cta_click', 'phone_click', 'form_start',
        'form_submit_attempt', 'lead_submit_error', 'lead_submit_rejected',
        'lead_form_abandoned', 'lead_spam_blocked', 'lead_created',
        'traffic_without_click_shown', 'traffic_without_click_urgency_select',
        'traffic_without_click_quote_click', 'traffic_without_click_phone_click',
        'content_lead_bridge_quote_click', 'content_lead_bridge_phone_click'
      )
    ORDER BY created_at DESC
  `).all(sinceSql);
}

function readLeads(database, sinceSql) {
  return database.prepare(`
    SELECT id, reference, lead_score, source, page_url, referrer, created_at
    FROM leads
    WHERE created_at >= datetime('now', ?)
    ORDER BY created_at DESC
  `).all(sinceSql);
}

function run() {
  const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
  const out = resolve(argValue("--out", env("LOCAL_SOURCE_QUALITY_REPORT", join("reports", "local-source-quality-report.json"))));
  const publicOut = resolve(argValue("--public-out", env("LOCAL_SOURCE_QUALITY_PUBLIC_REPORT", join("public", "assets", "local-source-quality-latest.json"))));
  const days = numberValue(argValue("--days", env("LOCAL_SOURCE_QUALITY_LOOKBACK_DAYS", "30")), 30);
  const sinceSql = `-${days} days`;
  const database = new DatabaseSync(dbPath, { readOnly: true });
  const buckets = new Map();
  const bucketFor = (source) => {
    const key = clean(source, 160) || "direct";
    if (!buckets.has(key)) buckets.set(key, createBucket(key));
    return buckets.get(key);
  };

  const events = readEvents(database, sinceSql);
  for (const row of events) {
    const payload = parseJson(row.payload);
    countEvent(bucketFor(sourceFromPayload(row, payload)), row, payload);
  }

  const leads = readLeads(database, sinceSql);
  for (const row of leads) {
    countLead(bucketFor(sourceFromPayload(row, { source: row.source, referrer: row.referrer })), row);
  }
  database.close();

  const sourceRows = [...buckets.values()].map(finalize)
    .sort((a, b) => b.leads_db - a.leads_db || b.form_starts - a.form_starts || b.sessions - a.sessions)
    .slice(0, 40);
  const recommendations = sourceRows
    .map(recommendationFor)
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  const totals = sourceRows.reduce((sum, row) => ({
    sessions: sum.sessions + row.sessions,
    engaged_sessions: sum.engaged_sessions + row.engaged_sessions,
    page_views: sum.page_views + row.page_views,
    form_starts: sum.form_starts + row.form_starts,
    submit_attempts: sum.submit_attempts + row.submit_attempts,
    leads_db: sum.leads_db + row.leads_db,
    hot_leads_db: sum.hot_leads_db + row.hot_leads_db,
    spam_blocks: sum.spam_blocks + row.spam_blocks,
    traffic_rescue_direct_shown: sum.traffic_rescue_direct_shown + row.traffic_rescue_direct_shown,
    traffic_rescue_direct_clicks: sum.traffic_rescue_direct_clicks + row.traffic_rescue_direct_clicks
  }), { sessions: 0, engaged_sessions: 0, page_views: 0, form_starts: 0, submit_attempts: 0, leads_db: 0, hot_leads_db: 0, spam_blocks: 0, traffic_rescue_direct_shown: 0, traffic_rescue_direct_clicks: 0 });
  const report = {
    generated_at: new Date().toISOString(),
    status: recommendations.some((item) => item.severity === "high") ? "action-required" : "passed",
    success: true,
    attention_required: recommendations.length > 0,
    lookback_days: days,
    summary: {
      sources: sourceRows.length,
      sessions: totals.sessions,
      engaged_sessions: totals.engaged_sessions,
      page_views: totals.page_views,
      form_starts: totals.form_starts,
      submit_attempts: totals.submit_attempts,
      leads_db: totals.leads_db,
      hot_leads_db: totals.hot_leads_db,
      spam_blocks: totals.spam_blocks,
      traffic_rescue_direct_shown: totals.traffic_rescue_direct_shown,
      traffic_rescue_direct_clicks: totals.traffic_rescue_direct_clicks,
      traffic_rescue_direct_click_rate: pct(totals.traffic_rescue_direct_clicks, totals.traffic_rescue_direct_shown),
      session_to_lead_rate: pct(totals.leads_db, totals.sessions),
      engaged_session_to_lead_rate: pct(totals.leads_db, totals.engaged_sessions),
      start_to_lead_rate: pct(totals.leads_db, totals.form_starts)
    },
    sources: sourceRows,
    recommendations,
    safeguards: [
      "no-pii-public-export",
      "aggregate-source-metrics-only",
      "no-email-phone-name-fields",
      "sqlite-read-only",
      "seo-cro-actions-derived-from-first-party-events"
    ]
  };

  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(dirname(publicOut), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(publicOut, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Source quality monitor ${report.status}: ${report.summary.sources} source(s), ${report.summary.leads_db} lead(s), ${recommendations.length} action(s).`);
}

run();
