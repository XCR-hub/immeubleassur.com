import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

const SITE = "https://immeubleassur.com";
const TRACKED_EVENTS = [
  "page_view",
  "cta_click",
  "phone_click",
  "email_click",
  "lead_intent_prefill",
  "lead_urgency_detected",
  "form_quality_ready",
  "lead_value_hint_ready",
  "form_start",
  "form_submit_attempt",
  "lead_created",
  "lead_submit_error",
  "lead_submit_rejected",
  "lead_form_abandoned",
  "quote_router_view",
  "quote_router_select",
  "quote_router_continue",
  "diagnostic_complete",
  "readiness_complete",
  "lead_spam_blocked"
];
const TRACKED_EVENT_SQL = TRACKED_EVENTS.map((item) => `'${item}'`).join(", ");
const INTENT_LABELS = {
  cno: "CNO coproprietaire non occupant",
  pno: "PNO proprietaire non occupant",
  "pno-cno": "PNO/CNO",
  copropriete: "Copropriete",
  sci: "SCI",
  travaux: "Travaux",
  "local-commercial": "Local commercial",
  prix: "Prix et comparaison",
  sinistre: "Sinistre ou resiliation",
  veille: "Veille et actualite",
  "audit-contrat": "Audit contrat",
  immeuble: "Immeuble",
  devis: "Devis immediat",
  website: "Trafic general"
};
const URGENCY_LABELS = {
  immediate: "Immediate",
  fast: "Rapide",
  ready: "Dossier pret",
  standard: "Standard",
  unknown: "Non qualifiee"
};

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

function normalizeLeadIntent(value) {
  const key = clean(value, 120).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  const aliases = {
    "assurance-immeuble": "immeuble",
    multirisque: "immeuble",
    "multirisque-immeuble": "immeuble",
    "mrh-immeuble": "immeuble",
    "dommages-ouvrage": "travaux",
    "dommage-ouvrage": "travaux",
    do: "travaux",
    renovation: "travaux",
    local: "local-commercial",
    commerce: "local-commercial",
    mixte: "local-commercial",
    "immeuble-mixte": "local-commercial",
    tarif: "prix",
    comparateur: "prix",
    comparaison: "prix",
    audit: "audit-contrat",
    resiliation: "sinistre",
    refus: "sinistre",
    sinistres: "sinistre",
    actualite: "veille",
    actualites: "veille",
    news: "veille",
    "multirisque-immeuble-pno": "pno",
    "multirisque-immeuble-cno": "cno"
  };
  return aliases[key] || key;
}

function normalizeUrgency(value) {
  const key = clean(value, 80).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (!key) return "unknown";
  if (["urgent", "urgence", "immediate", "prioritaire", "critique"].includes(key)) return "immediate";
  if (["rapide", "fast", "court", "chaud"].includes(key)) return "fast";
  if (["ready", "pret", "dossier-pret", "qualified"].includes(key)) return "ready";
  if (key === "standard" || key === "base") return "standard";
  return key.slice(0, 40);
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

function intentFromUrl(value) {
  const raw = clean(value, 700);
  if (!raw) return "";
  try {
    const url = new URL(raw, SITE);
    return normalizeLeadIntent(url.searchParams.get("intent") || url.searchParams.get("need") || "");
  } catch {
    const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
    if (!query) return "";
    return normalizeLeadIntent(new URLSearchParams(query).get("intent") || new URLSearchParams(query).get("need") || "");
  }
}

function intentFromPath(value) {
  const path = pathOf(value).toLowerCase();
  if (path.includes("pno-cno")) return "pno-cno";
  if (path.includes("assurance-cno") || path.includes("/cno")) return "cno";
  if (path.includes("assurance-pno") || path.includes("/pno")) return "pno";
  if (path.includes("copropriete")) return "copropriete";
  if (path.includes("sci")) return "sci";
  if (path.includes("travaux") || path.includes("renovation") || path.includes("dommage-ouvrage")) return "travaux";
  if (path.includes("local-commercial") || path.includes("commerce") || path.includes("mixte")) return "local-commercial";
  if (path.includes("tarif") || path.includes("prix") || path.includes("comparateur")) return "prix";
  if (path.includes("sinistre") || path.includes("resilie") || path.includes("resiliation")) return "sinistre";
  if (path.includes("veille") || path.includes("newsletter") || path.includes("news") || path.includes("blog")) return "veille";
  if (path.includes("audit-contrat") || path.includes("audit")) return "audit-contrat";
  if (path.includes("devis")) return "devis";
  if (path.includes("immeuble")) return "immeuble";
  return "";
}

function firstIntent(values) {
  for (const value of values) {
    const intent = normalizeLeadIntent(value);
    if (intent && intent !== "website") return intent;
  }
  return "website";
}

function eventIntent(row, payload) {
  const source = clean(payload.source || row.source || "", 120);
  const sourceIntent = source.startsWith("intent:") ? source.slice("intent:".length) : "";
  const targetIntent = row.event_type === "lead_intent_prefill" || row.event_type === "quote_router_continue" ? clean(row.target || payload.target, 120) : "";
  return firstIntent([
    payload.intent,
    sourceIntent,
    targetIntent,
    intentFromUrl(payload.source_path),
    intentFromUrl(payload.landing_page),
    intentFromUrl(row.page_url),
    intentFromPath(payload.source_path || payload.path || row.page_url),
    intentFromPath(payload.landing_path || payload.landing_page)
  ]);
}

function leadIntent(row, payload) {
  const source = clean(row.source || payload.source || "", 120);
  const sourceIntent = source.startsWith("intent:") ? source.slice("intent:".length) : "";
  return firstIntent([
    payload.intent,
    sourceIntent,
    intentFromUrl(payload.source_path),
    intentFromUrl(payload.landing_path),
    intentFromUrl(payload.utm?.source_path),
    intentFromUrl(payload.utm?.landing_page),
    intentFromUrl(row.page_url),
    intentFromPath(payload.source_path || row.page_url),
    row.need
  ]);
}

function createMetricBucket(key, label = key) {
  return {
    key,
    label,
    sessions_set: new Set(),
    paths: new Map(),
    events_seen: 0,
    page_views: 0,
    cta_clicks: 0,
    phone_clicks: 0,
    email_clicks: 0,
    lead_intent_prefills: 0,
    lead_urgency_events: 0,
    form_quality_ready: 0,
    lead_value_hints: 0,
    form_starts: 0,
    submit_attempts: 0,
    submit_errors: 0,
    abandoned_forms: 0,
    quote_router_views: 0,
    quote_router_selects: 0,
    quote_router_continues: 0,
    diagnostic_completes: 0,
    readiness_completes: 0,
    spam_blocks: 0,
    leads_event: 0,
    leads_db: 0,
    hot_leads_db: 0,
    score_sum: 0,
    lead_value_min_sum: 0,
    lead_value_max_sum: 0
  };
}

function addPath(bucket, path, eventType) {
  if (!path) return;
  const current = bucket.paths.get(path) || { path, page_views: 0, form_starts: 0, submit_attempts: 0, leads_created: 0, urgency_events: 0 };
  if (eventType === "page_view") current.page_views += 1;
  if (eventType === "form_start") current.form_starts += 1;
  if (eventType === "form_submit_attempt") current.submit_attempts += 1;
  if (eventType === "lead_created") current.leads_created += 1;
  if (eventType === "lead_urgency_detected") current.urgency_events += 1;
  bucket.paths.set(path, current);
}

function countEvent(bucket, row, path) {
  const type = row.event_type;
  bucket.events_seen += 1;
  if (row.session_id) bucket.sessions_set.add(row.session_id);
  if (type === "page_view") bucket.page_views += 1;
  if (type === "cta_click") bucket.cta_clicks += 1;
  if (type === "phone_click") {
    bucket.cta_clicks += 1;
    bucket.phone_clicks += 1;
  }
  if (type === "email_click") {
    bucket.cta_clicks += 1;
    bucket.email_clicks += 1;
  }
  if (type === "lead_intent_prefill") bucket.lead_intent_prefills += 1;
  if (type === "lead_urgency_detected") bucket.lead_urgency_events += 1;
  if (type === "form_quality_ready") bucket.form_quality_ready += 1;
  if (type === "lead_value_hint_ready") bucket.lead_value_hints += 1;
  if (type === "form_start") bucket.form_starts += 1;
  if (type === "form_submit_attempt") bucket.submit_attempts += 1;
  if (type === "lead_submit_error" || type === "lead_submit_rejected") bucket.submit_errors += 1;
  if (type === "lead_form_abandoned") bucket.abandoned_forms += 1;
  if (type === "quote_router_view") bucket.quote_router_views += 1;
  if (type === "quote_router_select") bucket.quote_router_selects += 1;
  if (type === "quote_router_continue") bucket.quote_router_continues += 1;
  if (type === "diagnostic_complete") bucket.diagnostic_completes += 1;
  if (type === "readiness_complete") bucket.readiness_completes += 1;
  if (type === "lead_spam_blocked") bucket.spam_blocks += 1;
  if (type === "lead_created") bucket.leads_event += 1;
  addPath(bucket, path, type);
}

function addLead(bucket, row, payload) {
  const score = Number(row.lead_score || payload.score || 0);
  const min = Number(payload.value_estimate?.annual_premium_min || payload.lead_value_min || 0);
  const max = Number(payload.value_estimate?.annual_premium_max || payload.lead_value_max || 0);
  bucket.leads_db += 1;
  if (score >= 85) bucket.hot_leads_db += 1;
  bucket.score_sum += score;
  bucket.lead_value_min_sum += Number.isFinite(min) ? min : 0;
  bucket.lead_value_max_sum += Number.isFinite(max) ? max : 0;
}

function publicPaths(bucket) {
  return [...bucket.paths.values()]
    .sort((a, b) => b.form_starts - a.form_starts || b.page_views - a.page_views || b.leads_created - a.leads_created)
    .slice(0, 5);
}

function finalizeBucket(bucket) {
  return {
    key: bucket.key,
    label: bucket.label,
    sessions: bucket.sessions_set.size,
    events_seen: bucket.events_seen,
    page_views: bucket.page_views,
    cta_clicks: bucket.cta_clicks,
    phone_clicks: bucket.phone_clicks,
    email_clicks: bucket.email_clicks,
    lead_intent_prefills: bucket.lead_intent_prefills,
    lead_urgency_events: bucket.lead_urgency_events,
    form_quality_ready: bucket.form_quality_ready,
    lead_value_hints: bucket.lead_value_hints,
    form_starts: bucket.form_starts,
    submit_attempts: bucket.submit_attempts,
    submit_errors: bucket.submit_errors,
    abandoned_forms: bucket.abandoned_forms,
    quote_router_views: bucket.quote_router_views,
    quote_router_selects: bucket.quote_router_selects,
    quote_router_continues: bucket.quote_router_continues,
    diagnostic_completes: bucket.diagnostic_completes,
    readiness_completes: bucket.readiness_completes,
    spam_blocks: bucket.spam_blocks,
    leads_event: bucket.leads_event,
    leads_db: bucket.leads_db,
    hot_leads_db: bucket.hot_leads_db,
    average_lead_score: bucket.leads_db ? Math.round(bucket.score_sum / bucket.leads_db) : 0,
    estimated_value_min: Math.round(bucket.lead_value_min_sum),
    estimated_value_max: Math.round(bucket.lead_value_max_sum),
    page_to_start_rate: pct(bucket.form_starts, bucket.page_views),
    cta_to_start_rate: pct(bucket.form_starts, bucket.cta_clicks),
    start_to_submit_rate: pct(bucket.submit_attempts, bucket.form_starts),
    submit_to_lead_rate: pct(Math.max(bucket.leads_db, bucket.leads_event), bucket.submit_attempts),
    start_to_lead_rate: pct(Math.max(bucket.leads_db, bucket.leads_event), bucket.form_starts),
    quote_continue_rate: pct(bucket.quote_router_continues, bucket.quote_router_views),
    top_paths: publicPaths(bucket)
  };
}

function ensureBucket(map, key, label) {
  const safeKey = key || "unknown";
  if (!map.has(safeKey)) map.set(safeKey, createMetricBucket(safeKey, label || safeKey));
  return map.get(safeKey);
}

function readEvents(database, sinceSql, maxEvents) {
  return database
    .prepare(`
      SELECT id, event_type, page_url, target, session_id, lead_reference, payload, created_at
      FROM site_events
      WHERE created_at >= datetime('now', ?)
        AND event_type IN (${TRACKED_EVENT_SQL})
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(sinceSql, maxEvents);
}

function readLeads(database, sinceSql, maxLeads) {
  return database
    .prepare(`
      SELECT
        l.id,
        l.reference,
        l.source,
        l.page_url,
        l.need,
        l.property_type,
        l.city,
        l.units_count,
        l.lead_score,
        l.created_at,
        le.payload AS event_payload
      FROM leads l
      LEFT JOIN lead_events le ON le.lead_id = l.id AND le.event_type = 'lead_created'
      WHERE l.created_at >= datetime('now', ?)
      ORDER BY l.created_at DESC
      LIMIT ?
    `)
    .all(sinceSql, maxLeads);
}

function tableExists(database, name) {
  const row = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return Boolean(row?.name);
}

function leadSegments(rows) {
  const segments = new Map();
  for (const row of rows) {
    const payload = parseJson(row.event_payload);
    const intent = leadIntent(row, payload);
    const urgency = normalizeUrgency(payload.lead_urgency || payload.urgency?.level || "unknown");
    const key = `${intent}|${urgency}|${clean(row.need, 80) || "besoin"}|${clean(row.property_type, 80) || "bien"}`;
    const current = segments.get(key) || {
      intent,
      urgency,
      need: clean(row.need, 80) || "",
      property_type: clean(row.property_type, 80) || "",
      leads: 0,
      hot_leads: 0,
      score_sum: 0,
      estimated_value_min: 0,
      estimated_value_max: 0
    };
    const score = Number(row.lead_score || payload.score || 0);
    current.leads += 1;
    if (score >= 85) current.hot_leads += 1;
    current.score_sum += score;
    current.estimated_value_min += Number(payload.value_estimate?.annual_premium_min || 0);
    current.estimated_value_max += Number(payload.value_estimate?.annual_premium_max || 0);
    segments.set(key, current);
  }
  return [...segments.values()]
    .map((segment) => ({
      ...segment,
      label: `${INTENT_LABELS[segment.intent] || segment.intent} / ${URGENCY_LABELS[segment.urgency] || segment.urgency}`,
      average_score: segment.leads ? Math.round(segment.score_sum / segment.leads) : 0,
      estimated_value_min: Math.round(segment.estimated_value_min),
      estimated_value_max: Math.round(segment.estimated_value_max)
    }))
    .sort((a, b) => b.hot_leads - a.hot_leads || b.leads - a.leads || b.average_score - a.average_score)
    .slice(0, 16);
}

function addRecommendation(items, type, severity, target, signal, action, score) {
  items.push({ type, severity, target, signal, action, score });
}

function recommendations(summary, intentFunnels, urgencyFunnels) {
  const items = [];
  for (const row of intentFunnels) {
    if (row.page_views >= 20 && row.form_starts === 0) {
      addRecommendation(items, "intent-sans-start", "high", row.key, `${row.page_views} vues, 0 demarrage`, "Renforcer le premier ecran, la preuve metier et le CTA devis sur cette intention.", 92);
    }
    if (row.form_starts >= 2 && row.leads_db === 0) {
      addRecommendation(items, "intent-sans-lead", "high", row.key, `${row.form_starts} starts, 0 lead SQLite`, "Tester le parcours jusqu au stockage local et simplifier les champs bloquants pour cette intention.", 90);
    }
    if (row.submit_errors > 0) {
      addRecommendation(items, "intent-erreurs-submit", "medium", row.key, `${row.submit_errors} erreur(s) submit`, "Identifier les rejets formulaire et ajouter une aide visible au champ le plus bloquant.", 72);
    }
    if (row.lead_urgency_events > 0 && row.leads_db === 0) {
      addRecommendation(items, "urgence-non-convertie", "high", row.key, `${row.lead_urgency_events} signal(s) urgence, 0 lead`, "Mettre le rappel prioritaire et le telephone au contact du formulaire pour cette intention.", 88);
    }
    if (row.quote_router_views >= 8 && row.quote_router_continues === 0) {
      addRecommendation(items, "routeur-intention-bloque", "medium", row.key, `${row.quote_router_views} vues routeur, 0 suite`, "Clarifier le libelle du choix et envoyer vers le formulaire pre-rempli.", 70);
    }
  }
  for (const row of urgencyFunnels) {
    if (["immediate", "fast"].includes(row.key) && row.form_starts >= 1 && row.leads_db === 0) {
      addRecommendation(items, "urgence-sans-lead", "high", row.key, `${row.form_starts} starts urgents, 0 lead`, "Controler le parcours mobile urgent et proposer appel + devis court.", 89);
    }
  }
  if (summary.tracked_events > 0 && summary.leads_db === 0 && summary.form_starts > 0) {
    addRecommendation(items, "aucun-lead-global", "critical", "global", `${summary.form_starts} starts, aucun lead local`, "Faire un test de demande reel, verifier l API leads et le journal lead_events.", 100);
  }
  return items.sort((a, b) => b.score - a.score || a.target.localeCompare(b.target)).slice(0, 18);
}

function writeReports(report, out, publicOut) {
  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(dirname(publicOut), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const publicReport = {
    generated_at: report.generated_at,
    success: report.success,
    status: report.status,
    attention_required: report.attention_required,
    summary: report.summary,
    intent_funnels: report.intent_funnels.slice(0, 12),
    urgency_funnels: report.urgency_funnels.slice(0, 8),
    lead_segments: report.lead_segments.slice(0, 8),
    recommendations: report.recommendations.slice(0, 10),
    safeguards: report.safeguards
  };
  writeFileSync(publicOut, `${JSON.stringify(publicReport, null, 2)}\n`, "utf8");
}

function unavailableReport(status, dbPath, reason) {
  return {
    success: true,
    status,
    attention_required: false,
    generated_at: new Date().toISOString(),
    database: { engine: "sqlite", file: basename(dbPath), mode: "unavailable" },
    summary: { lookback_days: 0, tracked_events: 0, tracked_sessions: 0, leads_db: 0, hot_leads_db: 0, intent_count: 0, urgency_count: 0, attention_count: 0, reason },
    intent_funnels: [],
    urgency_funnels: [],
    lead_segments: [],
    recommendations: [],
    safeguards: ["no-pii-public-export", "sqlite-readonly", "first-party-events-only", "no-google-scraping"]
  };
}

function run() {
  const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
  const out = resolve(argValue("--out", env("LOCAL_INTENT_CONVERSION_REPORT", join("reports", "local-intent-conversion-report.json"))));
  const publicOut = resolve(argValue("--public-out", env("LOCAL_INTENT_CONVERSION_PUBLIC_REPORT", join("public", "assets", "local-intent-conversion-latest.json"))));
  const days = numberValue(argValue("--days", env("LOCAL_INTENT_CONVERSION_LOOKBACK_DAYS", "30")), 30);
  const maxEvents = numberValue(argValue("--max-events", env("LOCAL_INTENT_CONVERSION_MAX_EVENTS", "120000")), 120000);
  const maxLeads = numberValue(argValue("--max-leads", env("LOCAL_INTENT_CONVERSION_MAX_LEADS", "5000")), 5000);
  const sinceSql = `-${days} days`;

  if (!existsSync(dbPath)) {
    const report = unavailableReport("no-database", dbPath, "Base SQLite absente sur cet environnement");
    writeReports(report, out, publicOut);
    console.log(`Intent conversion monitor: no database at ${dbPath}`);
    return;
  }

  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    if (!tableExists(database, "site_events") || !tableExists(database, "leads") || !tableExists(database, "lead_events")) {
      const report = unavailableReport("schema-incomplete", dbPath, "Tables site_events/leads/lead_events absentes");
      writeReports(report, out, publicOut);
      console.log("Intent conversion monitor: schema incomplete");
      return;
    }

    const events = readEvents(database, sinceSql, maxEvents);
    const leads = readLeads(database, sinceSql, maxLeads);
    const intentBuckets = new Map();
    const urgencyBuckets = new Map();
    const allSessions = new Set();

    for (const row of events) {
      const payload = parseJson(row.payload);
      const intent = eventIntent(row, payload);
      const urgency = normalizeUrgency(payload.lead_urgency || (row.event_type === "lead_urgency_detected" ? payload.label : "unknown"));
      const path = pathOf(payload.source_path || payload.path || row.page_url);
      const session = clean(row.session_id || payload.session_id || row.id, 160);
      if (session) allSessions.add(session);
      const intentBucket = ensureBucket(intentBuckets, intent, INTENT_LABELS[intent] || intent);
      const urgencyBucket = ensureBucket(urgencyBuckets, urgency, URGENCY_LABELS[urgency] || urgency);
      if (session) {
        intentBucket.sessions_set.add(session);
        urgencyBucket.sessions_set.add(session);
      }
      countEvent(intentBucket, row, path);
      countEvent(urgencyBucket, row, path);
    }

    for (const row of leads) {
      const payload = parseJson(row.event_payload);
      const intent = leadIntent(row, payload);
      const urgency = normalizeUrgency(payload.lead_urgency || payload.urgency?.level || "unknown");
      addLead(ensureBucket(intentBuckets, intent, INTENT_LABELS[intent] || intent), row, payload);
      addLead(ensureBucket(urgencyBuckets, urgency, URGENCY_LABELS[urgency] || urgency), row, payload);
    }

    const intentFunnels = [...intentBuckets.values()].map(finalizeBucket).sort((a, b) => b.leads_db - a.leads_db || b.form_starts - a.form_starts || b.page_views - a.page_views);
    const urgencyFunnels = [...urgencyBuckets.values()].map(finalizeBucket).sort((a, b) => b.leads_db - a.leads_db || b.form_starts - a.form_starts || b.lead_urgency_events - a.lead_urgency_events);
    const total = intentFunnels.reduce((acc, row) => {
      acc.page_views += row.page_views;
      acc.form_starts += row.form_starts;
      acc.submit_attempts += row.submit_attempts;
      acc.submit_errors += row.submit_errors;
      acc.leads_event += row.leads_event;
      acc.leads_db += row.leads_db;
      acc.hot_leads_db += row.hot_leads_db;
      acc.lead_urgency_events += row.lead_urgency_events;
      acc.spam_blocks += row.spam_blocks;
      return acc;
    }, { page_views: 0, form_starts: 0, submit_attempts: 0, submit_errors: 0, leads_event: 0, leads_db: 0, hot_leads_db: 0, lead_urgency_events: 0, spam_blocks: 0 });
    const rawSummary = {
      lookback_days: days,
      tracked_events: events.length,
      tracked_sessions: allSessions.size,
      leads_db: total.leads_db,
      hot_leads_db: total.hot_leads_db,
      page_views: total.page_views,
      form_starts: total.form_starts,
      submit_attempts: total.submit_attempts,
      submit_errors: total.submit_errors,
      leads_event: total.leads_event,
      lead_urgency_events: total.lead_urgency_events,
      spam_blocks: total.spam_blocks,
      intent_count: intentFunnels.length,
      urgency_count: urgencyFunnels.length,
      intents_with_leads: intentFunnels.filter((row) => row.leads_db > 0).length,
      intents_with_traffic_no_leads: intentFunnels.filter((row) => row.page_views > 0 && row.leads_db === 0).length,
      urgent_starts_without_leads: urgencyFunnels.filter((row) => ["immediate", "fast"].includes(row.key) && row.form_starts > 0 && row.leads_db === 0).length,
      page_to_start_rate: pct(total.form_starts, total.page_views),
      start_to_submit_rate: pct(total.submit_attempts, total.form_starts),
      submit_to_lead_rate: pct(Math.max(total.leads_db, total.leads_event), total.submit_attempts),
      start_to_lead_rate: pct(Math.max(total.leads_db, total.leads_event), total.form_starts)
    };
    const actions = recommendations(rawSummary, intentFunnels, urgencyFunnels);
    const summary = { ...rawSummary, attention_count: actions.filter((item) => ["critical", "high"].includes(item.severity)).length };
    const report = {
      success: true,
      status: events.length || leads.length ? (summary.attention_count ? "action-required" : "passed") : "no-data",
      attention_required: summary.attention_count > 0,
      generated_at: new Date().toISOString(),
      database: { engine: "sqlite", file: basename(dbPath), mode: "readonly" },
      summary,
      intent_funnels: intentFunnels.slice(0, 30),
      urgency_funnels: urgencyFunnels.slice(0, 12),
      lead_segments: leadSegments(leads),
      recommendations: actions,
      safeguards: ["no-pii-public-export", "sqlite-readonly", "first-party-events-only", "no-google-scraping", "intent-data-from-local-events-and-lead-events"]
    };
    writeReports(report, out, publicOut);
    console.log(`Intent conversion monitor: ${summary.intent_count} intent(s), ${summary.leads_db} lead(s), ${summary.attention_count} action(s)`);
  } finally {
    database.close();
  }
}

run();