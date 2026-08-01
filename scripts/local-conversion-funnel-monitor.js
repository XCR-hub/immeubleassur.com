import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

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

function pathOf(value) {
  const raw = clean(value, 700);
  if (!raw) return "/";
  try {
    return new URL(raw, "https://immeubleassur.com").pathname || "/";
  } catch {
    return raw.startsWith("/") ? raw : "/";
  }
}

function eventCounts(database, sinceSql) {
  return database
    .prepare(`
      SELECT event_type, COUNT(*) AS count, COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), id)) AS sessions, MAX(created_at) AS last_seen
      FROM site_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY event_type
      ORDER BY count DESC
    `)
    .all(sinceSql);
}

function countFor(rows, eventType) {
  const row = rows.find((item) => item.event_type === eventType);
  return Number(row?.count || 0);
}

function leadTotals(database, sinceSql) {
  return database
    .prepare(`
      SELECT
        COUNT(*) AS leads,
        SUM(CASE WHEN lead_score >= 85 THEN 1 ELSE 0 END) AS hot_leads,
        COALESCE(AVG(lead_score), 0) AS avg_score
      FROM leads
      WHERE created_at >= datetime('now', ?)
    `)
    .get(sinceSql);
}

function pathFunnels(database, sinceSql, maxRows) {
  return database
    .prepare(`
      SELECT
        COALESCE(NULLIF(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.path') ELSE NULL END, ''), page_url, '/') AS raw_path,
        COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), id)) AS sessions,
        SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
        SUM(CASE WHEN event_type = 'quote_router_view' THEN 1 ELSE 0 END) AS quote_router_views,
        SUM(CASE WHEN event_type = 'quote_router_select' THEN 1 ELSE 0 END) AS quote_router_selects,
        SUM(CASE WHEN event_type = 'quote_router_continue' THEN 1 ELSE 0 END) AS quote_router_continues,
        SUM(CASE WHEN event_type = 'quote_router_select' AND CASE WHEN json_valid(payload) THEN json_extract(payload, '$.source') ELSE '' END = 'homepage-devis-accelerator' THEN 1 ELSE 0 END) AS homepage_devis_selects,
        SUM(CASE WHEN event_type = 'quote_router_continue' AND CASE WHEN json_valid(payload) THEN json_extract(payload, '$.source') ELSE '' END = 'homepage-devis-accelerator' THEN 1 ELSE 0 END) AS homepage_devis_continues,
        SUM(CASE WHEN event_type = 'quote_router_view' AND CASE WHEN json_valid(payload) THEN json_extract(payload, '$.source') ELSE '' END = 'quote-fast-nudge' THEN 1 ELSE 0 END) AS quote_fast_nudge_views,
        SUM(CASE WHEN event_type = 'quote_router_continue' AND CASE WHEN json_valid(payload) THEN json_extract(payload, '$.source') ELSE '' END = 'quote-fast-nudge' THEN 1 ELSE 0 END) AS quote_fast_nudge_continues,
        SUM(CASE WHEN event_type IN ('cta_click', 'phone_click', 'email_click', 'traffic_without_click_quote_click', 'traffic_without_click_phone_click') THEN 1 ELSE 0 END) AS cta_clicks,
        SUM(CASE WHEN event_type IN ('phone_click', 'traffic_without_click_phone_click') THEN 1 ELSE 0 END) AS phone_clicks,
        SUM(CASE WHEN event_type = 'traffic_without_click_shown' THEN 1 ELSE 0 END) AS traffic_rescue_shown,
        SUM(CASE WHEN event_type = 'traffic_without_click_urgency_select' THEN 1 ELSE 0 END) AS traffic_rescue_urgency_selects,
        SUM(CASE WHEN event_type IN ('traffic_without_click_quote_click', 'traffic_without_click_phone_click') THEN 1 ELSE 0 END) AS traffic_rescue_clicks,
        SUM(CASE WHEN event_type = 'traffic_without_click_dismissed' THEN 1 ELSE 0 END) AS traffic_rescue_dismissed,
        SUM(CASE WHEN event_type = 'content_lead_bridge_shown' THEN 1 ELSE 0 END) AS content_bridge_shown,
        SUM(CASE WHEN event_type IN ('content_lead_bridge_quote_click', 'content_lead_bridge_phone_click') THEN 1 ELSE 0 END) AS content_bridge_clicks,
        SUM(CASE WHEN event_type = 'form_start' THEN 1 ELSE 0 END) AS form_starts,
        SUM(CASE WHEN event_type = 'form_submit_attempt' THEN 1 ELSE 0 END) AS submit_attempts,
        SUM(CASE WHEN event_type = 'lead_submit_error' THEN 1 ELSE 0 END) AS submit_errors,
        SUM(CASE WHEN event_type = 'lead_form_rescue_shown' THEN 1 ELSE 0 END) AS form_rescue_shown,
        SUM(CASE WHEN event_type = 'lead_form_rescue_phone_click' THEN 1 ELSE 0 END) AS form_rescue_phone_clicks,
        SUM(CASE WHEN event_type = 'lead_form_rescue_express_click' THEN 1 ELSE 0 END) AS form_rescue_express_clicks,
        SUM(CASE WHEN event_type = 'lead_form_rescue_dismissed' THEN 1 ELSE 0 END) AS form_rescue_dismissed,
        SUM(CASE WHEN event_type = 'lead_form_abandoned' THEN 1 ELSE 0 END) AS abandoned_forms,
        SUM(CASE WHEN event_type = 'lead_created' THEN 1 ELSE 0 END) AS leads_created
      FROM site_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY raw_path
      HAVING page_views + quote_router_views + cta_clicks + traffic_rescue_shown + traffic_rescue_urgency_selects + content_bridge_shown + form_rescue_shown + form_starts + submit_attempts + leads_created > 0
      ORDER BY page_views DESC, form_starts DESC, leads_created DESC
      LIMIT ?
    `)
    .all(sinceSql, maxRows)
    .map((row) => enrichPath(row));
}

function enrichPath(row) {
  const pageViews = Number(row.page_views || 0);
  const formStarts = Number(row.form_starts || 0);
  const submitAttempts = Number(row.submit_attempts || 0);
  const leadsCreated = Number(row.leads_created || 0);
  const quoteViews = Number(row.quote_router_views || 0);
  const quoteContinues = Number(row.quote_router_continues || 0);
  const trafficRescueShown = Number(row.traffic_rescue_shown || 0);
  const trafficRescueUrgencySelects = Number(row.traffic_rescue_urgency_selects || 0);
  const trafficRescueClicks = Number(row.traffic_rescue_clicks || 0);
  const trafficRescueDismissed = Number(row.traffic_rescue_dismissed || 0);
  return {
    path: pathOf(row.raw_path),
    sessions: Number(row.sessions || 0),
    page_views: pageViews,
    quote_router_views: quoteViews,
    quote_router_selects: Number(row.quote_router_selects || 0),
    quote_router_continues: quoteContinues,
    homepage_devis_selects: Number(row.homepage_devis_selects || 0),
    homepage_devis_continues: Number(row.homepage_devis_continues || 0),
    homepage_devis_start_rate: pct(formStarts, row.homepage_devis_continues),
    quote_fast_nudge_views: Number(row.quote_fast_nudge_views || 0),
    quote_fast_nudge_continues: Number(row.quote_fast_nudge_continues || 0),
    quote_fast_nudge_rate: pct(row.quote_fast_nudge_continues, row.quote_fast_nudge_views),
    cta_clicks: Number(row.cta_clicks || 0),
    phone_clicks: Number(row.phone_clicks || 0),
    traffic_rescue_shown: trafficRescueShown,
    traffic_rescue_urgency_selects: trafficRescueUrgencySelects,
    traffic_rescue_clicks: trafficRescueClicks,
    traffic_rescue_dismissed: trafficRescueDismissed,
    traffic_rescue_click_rate: pct(trafficRescueClicks, trafficRescueShown),
    traffic_rescue_urgency_select_rate: pct(trafficRescueUrgencySelects, trafficRescueShown),
    traffic_rescue_dismiss_rate: pct(trafficRescueDismissed, trafficRescueShown),
    content_bridge_shown: Number(row.content_bridge_shown || 0),
    content_bridge_clicks: Number(row.content_bridge_clicks || 0),
    content_bridge_click_rate: pct(row.content_bridge_clicks, row.content_bridge_shown),
    form_starts: formStarts,
    submit_attempts: submitAttempts,
    submit_errors: Number(row.submit_errors || 0),
    form_rescue_shown: Number(row.form_rescue_shown || 0),
    form_rescue_phone_clicks: Number(row.form_rescue_phone_clicks || 0),
    form_rescue_express_clicks: Number(row.form_rescue_express_clicks || 0),
    form_rescue_dismissed: Number(row.form_rescue_dismissed || 0),
    form_rescue_phone_rate: pct(row.form_rescue_phone_clicks, row.form_rescue_shown),
    form_rescue_express_rate: pct(row.form_rescue_express_clicks, row.form_rescue_shown),
    abandoned_forms: Number(row.abandoned_forms || 0),
    leads_created: leadsCreated,
    start_rate: pct(formStarts, pageViews),
    submit_rate: pct(submitAttempts, formStarts),
    lead_rate: pct(leadsCreated, formStarts),
    quote_continue_rate: pct(quoteContinues, quoteViews)
  };
}

function variantFunnels(database, sinceSql) {
  return database
    .prepare(`
      SELECT
        COALESCE(NULLIF(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.experiment_variant') ELSE NULL END, ''), 'non-mesure') AS variant,
        COALESCE(NULLIF(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.experiment_label') ELSE NULL END, ''), '') AS label,
        SUM(CASE WHEN event_type = 'experiment_view' THEN 1 ELSE 0 END) AS views,
        SUM(CASE WHEN event_type IN ('cta_click', 'phone_click', 'email_click', 'traffic_without_click_quote_click', 'traffic_without_click_phone_click') THEN 1 ELSE 0 END) AS cta_clicks,
        SUM(CASE WHEN event_type = 'quote_router_continue' THEN 1 ELSE 0 END) AS quote_router_continues,
        SUM(CASE WHEN event_type = 'form_start' THEN 1 ELSE 0 END) AS form_starts,
        SUM(CASE WHEN event_type = 'form_submit_attempt' THEN 1 ELSE 0 END) AS submit_attempts,
        SUM(CASE WHEN event_type = 'lead_created' THEN 1 ELSE 0 END) AS leads_created
      FROM site_events
      WHERE created_at >= datetime('now', ?)
      GROUP BY variant, label
      HAVING views + cta_clicks + quote_router_continues + form_starts + leads_created > 0
      ORDER BY leads_created DESC, form_starts DESC, cta_clicks DESC
      LIMIT 12
    `)
    .all(sinceSql)
    .map((row) => ({
      variant: clean(row.variant, 80),
      label: clean(row.label, 120),
      views: Number(row.views || 0),
      cta_clicks: Number(row.cta_clicks || 0),
      quote_router_continues: Number(row.quote_router_continues || 0),
      form_starts: Number(row.form_starts || 0),
      submit_attempts: Number(row.submit_attempts || 0),
      leads_created: Number(row.leads_created || 0),
      start_rate: pct(row.form_starts, row.views),
      lead_rate: pct(row.leads_created, row.form_starts)
    }));
}

function addRecommendation(items, type, severity, path, signal, action, score) {
  items.push({ type, severity, path, signal, action, score });
}

function recommendations(summary, paths) {
  const items = [];
  for (const row of paths) {
    if (row.page_views >= 20 && row.form_starts === 0) {
      addRecommendation(items, "page-sans-start", "high", row.path, `${row.page_views} vues, 0 demarrage formulaire`, "Ajouter un CTA devis au-dessus de la ligne de flottaison et verifier le message d'intention.", 90);
    }
    if (row.quote_router_views >= 10 && row.quote_router_continues === 0) {
      addRecommendation(items, "routeur-sans-suite", "high", row.path, `${row.quote_router_views} vues routeur, 0 continuation`, "Revoir le libelle du parcours recommande et rendre le bouton principal plus explicite.", 86);
    }
    if (row.traffic_rescue_shown >= 5 && row.traffic_rescue_clicks === 0) {
      addRecommendation(items, "relance-accueil-sans-clic", "high", row.path, `${row.traffic_rescue_shown} relance(s), 0 clic`, "Tester le texte, le delai et la position du panneau trafic sans clic sur la page accueil.", 88);
    }
    if (row.traffic_rescue_urgency_selects >= 3 && row.traffic_rescue_clicks === 0) {
      addRecommendation(items, "relance-urgence-sans-devis", "high", row.path, `${row.traffic_rescue_urgency_selects} choix urgence, 0 devis`, "Rendre le bouton de continuation plus visible apres selection urgence afin de transformer l'intention chaude en formulaire.", 89);
    }
    if (row.traffic_rescue_clicks > 0 && row.form_starts === 0) {
      addRecommendation(items, "relance-accueil-sans-start", "medium", row.path, `${row.traffic_rescue_clicks} clic(s) relance, 0 start`, "Verifier le scroll vers formulaire, le pre-remplissage et affichage mobile de la relance accueil.", 76);
    }
    if (row.content_bridge_shown >= 5 && row.content_bridge_clicks === 0) {
      addRecommendation(items, "pont-contenu-sans-clic", "medium", row.path, `${row.content_bridge_shown} affichage(s), 0 clic`, "Rendre le passage lecture vers devis plus concret sur cette page SEO.", 78);
    }
    if (row.form_starts >= 3 && row.leads_created === 0 && row.submit_attempts > 0) {
      addRecommendation(items, "submit-sans-lead", "high", row.path, `${row.submit_attempts} tentative(s), 0 lead`, "Tester l'envoi complet, verifier Turnstile, validation locale et journal lead_events.", 86);
    }
    if (row.form_starts >= 3 && row.leads_created === 0 && row.submit_attempts === 0) {
      addRecommendation(items, "start-sans-submit", "medium", row.path, `${row.form_starts} starts, 0 tentative`, "Reduire la friction avant soumission: rappel express, champs obligatoires visibles et reassurance sur le delai de rappel.", 76);
    }
    if (row.submit_attempts > row.leads_created && row.submit_errors >= 1) {
      addRecommendation(items, "erreurs-submit", "medium", row.path, `${row.submit_errors} erreur(s) pour ${row.submit_attempts} tentative(s)`, "Identifier les champs rejetes et simplifier le texte d'aide avant soumission.", 72);
    }
    if (row.abandoned_forms >= 2 && row.leads_created < row.form_starts) {
      addRecommendation(items, "abandon-formulaire", "medium", row.path, `${row.abandoned_forms} abandon(s) detecte(s)`, "Reduire la friction du formulaire et mettre en avant les pieces facultatives apres contact.", 68);
    }
  }
  if (summary.page_views > 0 && summary.form_starts === 0) {
    addRecommendation(items, "aucun-start-global", "critical", "/", `${summary.page_views} vues, aucun demarrage`, "Verifier immediatement le JS, les CTA et l'accessibilite du formulaire.", 100);
  }
  if (summary.submit_attempts > 0 && summary.leads_db === 0) {
    addRecommendation(items, "aucun-lead-global", "critical", "/", `${summary.form_starts} starts, aucun lead SQLite`, "Tester une demande de devis de bout en bout et verifier l'API leads.", 98);
  }
  if (summary.form_starts > 0 && summary.submit_attempts === 0 && summary.leads_db === 0) {
    addRecommendation(items, "aucun-submit-global", "high", "/", `${summary.form_starts} start(s), aucune tentative`, "Traiter comme friction formulaire: raccourcir le premier contact, rendre le rappel express dominant et clarifier les champs obligatoires.", 94);
  }
  return items.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 16);
}

function summaryFrom(events, leadStats, days, paths = []) {
  const pageViews = countFor(events, "page_view");
  const formStarts = countFor(events, "form_start");
  const submitAttempts = countFor(events, "form_submit_attempt");
  const leadsEvent = countFor(events, "lead_created");
  const leadsDb = Number(leadStats?.leads || 0);
  const quoteViews = countFor(events, "quote_router_view");
  const quoteContinues = countFor(events, "quote_router_continue");
  const homepageDevis = paths.reduce((sum, row) => sum + Number(row.homepage_devis_continues || 0), 0);
  const homepageDevisSelects = paths.reduce((sum, row) => sum + Number(row.homepage_devis_selects || 0), 0);
  const quoteFastNudgeViews = paths.reduce((sum, row) => sum + Number(row.quote_fast_nudge_views || 0), 0);
  const quoteFastNudgeContinues = paths.reduce((sum, row) => sum + Number(row.quote_fast_nudge_continues || 0), 0);
  const contentBridgeShown = countFor(events, "content_lead_bridge_shown");
  const contentBridgeClicks = countFor(events, "content_lead_bridge_quote_click") + countFor(events, "content_lead_bridge_phone_click");
  const trafficRescueShown = countFor(events, "traffic_without_click_shown");
  const trafficRescueUrgencySelects = countFor(events, "traffic_without_click_urgency_select");
  const trafficRescueClicks = countFor(events, "traffic_without_click_quote_click") + countFor(events, "traffic_without_click_phone_click");
  const trafficRescueDismissed = countFor(events, "traffic_without_click_dismissed");
  const formRescueShown = countFor(events, "lead_form_rescue_shown");
  const formRescueExpressClicks = countFor(events, "lead_form_rescue_express_click");
  return {
    lookback_days: days,
    page_views: pageViews,
    quote_router_views: quoteViews,
    quote_router_selects: countFor(events, "quote_router_select"),
    quote_router_continues: quoteContinues,
    homepage_devis_selects: homepageDevisSelects,
    homepage_devis_continues: homepageDevis,
    homepage_devis_start_rate: pct(formStarts, homepageDevis),
    quote_fast_nudge_views: quoteFastNudgeViews,
    quote_fast_nudge_continues: quoteFastNudgeContinues,
    quote_fast_nudge_rate: pct(quoteFastNudgeContinues, quoteFastNudgeViews),
    cta_clicks: countFor(events, "cta_click") + countFor(events, "phone_click") + countFor(events, "email_click") + countFor(events, "traffic_without_click_quote_click") + countFor(events, "traffic_without_click_phone_click"),
    phone_clicks: countFor(events, "phone_click") + countFor(events, "traffic_without_click_phone_click"),
    traffic_rescue_shown: trafficRescueShown,
    traffic_rescue_urgency_selects: trafficRescueUrgencySelects,
    traffic_rescue_clicks: trafficRescueClicks,
    traffic_rescue_dismissed: trafficRescueDismissed,
    traffic_rescue_click_rate: pct(trafficRescueClicks, trafficRescueShown),
    traffic_rescue_urgency_select_rate: pct(trafficRescueUrgencySelects, trafficRescueShown),
    traffic_rescue_dismiss_rate: pct(trafficRescueDismissed, trafficRescueShown),
    content_bridge_shown: contentBridgeShown,
    content_bridge_clicks: contentBridgeClicks,
    form_starts: formStarts,
    submit_attempts: submitAttempts,
    submit_errors: countFor(events, "lead_submit_error") + countFor(events, "lead_submit_rejected"),
    form_rescue_shown: formRescueShown,
    form_rescue_phone_clicks: countFor(events, "lead_form_rescue_phone_click"),
    form_rescue_express_clicks: formRescueExpressClicks,
    form_rescue_dismissed: countFor(events, "lead_form_rescue_dismissed"),
    form_rescue_phone_rate: pct(countFor(events, "lead_form_rescue_phone_click"), formRescueShown),
    form_rescue_express_rate: pct(formRescueExpressClicks, formRescueShown),
    abandoned_forms: countFor(events, "lead_form_abandoned"),
    leads_event: leadsEvent,
    leads_db: leadsDb,
    hot_leads_db: Number(leadStats?.hot_leads || 0),
    average_lead_score_db: Math.round(Number(leadStats?.avg_score || 0)),
    page_to_form_rate: pct(formStarts, pageViews),
    quote_continue_rate: pct(quoteContinues, quoteViews),
    content_bridge_click_rate: pct(contentBridgeClicks, contentBridgeShown),
    form_to_submit_rate: pct(submitAttempts, formStarts),
    submit_to_lead_rate: pct(Math.max(leadsEvent, leadsDb), submitAttempts),
    form_to_lead_rate: pct(Math.max(leadsEvent, leadsDb), formStarts)
  };
}

function run() {
  const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
  const out = resolve(argValue("--out", env("LOCAL_CONVERSION_FUNNEL_REPORT", join("reports", "local-conversion-funnel-report.json"))));
  const days = numberValue(argValue("--days", env("LOCAL_CONVERSION_FUNNEL_LOOKBACK_DAYS", "30")), 30);
  const maxPaths = numberValue(argValue("--max-paths", env("LOCAL_CONVERSION_FUNNEL_MAX_PATHS", "80")), 80);
  const sinceSql = `-${days} days`;

  if (!existsSync(dbPath)) throw new Error(`Base SQLite introuvable: ${dbPath}`);
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const events = eventCounts(database, sinceSql);
    const leads = leadTotals(database, sinceSql);
    const paths = pathFunnels(database, sinceSql, maxPaths);
    const summary = summaryFrom(events, leads, days, paths);
    const reportRecommendations = recommendations(summary, paths);
    const report = {
      success: true,
      attention_required: reportRecommendations.some((item) => ["critical", "high"].includes(item.severity)),
      generated_at: new Date().toISOString(),
      database: { path: dbPath, mode: "sqlite-readonly" },
      summary,
      events,
      top_paths: paths.slice(0, 30),
      cta_variants: variantFunnels(database, sinceSql),
      recommendations: reportRecommendations
    };

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Conversion funnel monitor: ${summary.page_views} views, ${summary.form_starts} starts, ${summary.leads_db} lead(s), ${report.recommendations.length} recommendation(s)`);
    console.log(`Report: ${out}`);
  } finally {
    database.close();
  }
}

run();
