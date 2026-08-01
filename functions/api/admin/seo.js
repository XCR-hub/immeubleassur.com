const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function authorized(request, env) {
  const expected = env.ADMIN_API_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  return header === `Bearer ${expected}`;
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

function countFrom(rows, eventType) {
  if (!Array.isArray(rows)) return 0;
  const row = rows.find((item) => item.event_type === eventType);
  return Number(row?.count || 0);
}

function pct(part, total) {
  const denominator = Number(total || 0);
  if (!denominator) return 0;
  return Math.round((Number(part || 0) / denominator) * 1000) / 10;
}

function metricsObject(rows) {
  const metrics = {};
  if (!Array.isArray(rows)) return metrics;
  for (const row of rows) {
    metrics[`${row.metric_type}.${row.metric_name}`] = Number(row.value || 0);
  }
  return metrics;
}
function buildLeadActions({ conversionFunnel, leadStats, leadPriorities, hotPending, conversionGaps, abandonPaths, diagnosticPaths, readinessPaths, valueHintPaths, validationErrors, spamBlocks, duplicateLeads, contentBridgePaths, ctaExperiments }) {
  const actions = [];
  const hotPendingCount = Number(hotPending?.count || 0);
  const leads30d = Number(leadStats?.leads_30d || 0);
  const hotLeads30d = Number(leadStats?.hot_leads_30d || 0);
  const topGap = Array.isArray(conversionGaps) ? conversionGaps[0] : null;
  const topAbandon = Array.isArray(abandonPaths) ? abandonPaths[0] : null;
  const diagnosticSelects = Number(conversionFunnel.diagnostic_selects || 0);
  const diagnosticCompletes = Number(conversionFunnel.diagnostic_completes || 0);
  const topDiagnostic = Array.isArray(diagnosticPaths) ? diagnosticPaths[0] : null;
  const readinessStarts = Number(conversionFunnel.readiness_starts || 0);
  const readinessCompletes = Number(conversionFunnel.readiness_completes || 0);
  const topReadiness = Array.isArray(readinessPaths) ? readinessPaths[0] : null;
  const valueHintsReady = Number(conversionFunnel.value_hint_ready || 0);
  const topValueHint = Array.isArray(valueHintPaths) ? valueHintPaths[0] : null;
  const validationErrorCount = Number(conversionFunnel.validation_errors || 0);
  const topValidation = Array.isArray(validationErrors) ? validationErrors[0] : null;
  const spamBlockedCount = Number(conversionFunnel.spam_blocked || 0);
  const topSpamBlock = Array.isArray(spamBlocks) ? spamBlocks[0] : null;
  const duplicateFilteredCount = Number(conversionFunnel.duplicate_filtered || 0);
  const topDuplicateLead = Array.isArray(duplicateLeads) ? duplicateLeads[0] : null;
  const rescueShown = Number(conversionFunnel.form_rescue_shown || 0);
  const rescuePhoneClicks = Number(conversionFunnel.form_rescue_phone_clicks || 0);
  const trafficRescueShown = Number(conversionFunnel.traffic_rescue_shown || 0);
  const trafficRescueClicks = Number(conversionFunnel.traffic_rescue_clicks || 0);
  const contentBridgeShown = Number(conversionFunnel.content_bridge_shown || 0);
  const contentBridgeClicks = Number(conversionFunnel.content_bridge_clicks || 0);
  const contentBridgeLeads = Array.isArray(contentBridgePaths) ? contentBridgePaths.reduce((sum, row) => sum + Number(row.leads_created || 0), 0) : 0;
  const topContentBridge = Array.isArray(contentBridgePaths) ? contentBridgePaths[0] : null;
  const bestExperiment = Array.isArray(ctaExperiments) ? ctaExperiments.find((row) => Number(row.form_starts || 0) > 0 || Number(row.leads_created || 0) > 0 || Number(row.cta_clicks || 0) > 0) : null;
  const topGapHandled = topGap ? Number(topGap.leads_created || 0) + Number(topGap.duplicate_filtered || 0) : 0;

  if (hotPendingCount > 0) {
    actions.push({
      score: 100,
      opportunity_type: "lead-hot",
      url: "admin/leads",
      query: `${hotPendingCount} lead(s) chaud(s) nouveau(x)`,
      recommendation: "Rappeler en priorite et demander contrat actuel, echeance, sinistralite et surfaces."
    });
  }

  if (Number(conversionFunnel.abandon_rate || 0) >= 25 && topAbandon) {
    actions.push({
      score: 92,
      opportunity_type: "abandon-formulaire",
      url: topAbandon.path || topAbandon.page_url || "/",
      query: `${conversionFunnel.abandon_rate}% abandon formulaire`,
      recommendation: "Rendre le CTA plus direct sur cette page et verifier la longueur percue du formulaire."
    });
  }

  if (rescueShown >= 5 && rescuePhoneClicks === 0) {
    actions.push({
      score: 87,
      opportunity_type: "rattrapage-formulaire",
      url: topAbandon?.path || "/devis-assurance-immeuble.html",
      query: `${rescueShown} rattrapage(s), 0 appel`,
      recommendation: "Tester un texte plus direct, rapprocher le telephone du champ bloquant et verifier l'affichage mobile du panneau de rattrapage."
    });
  }

  if (rescuePhoneClicks > 0) {
    actions.push({
      score: 73,
      opportunity_type: "rattrapage-appel",
      url: topAbandon?.path || "/devis-assurance-immeuble.html",
      query: `${rescuePhoneClicks}/${rescueShown || rescuePhoneClicks} appel(s) apres rattrapage`,
      recommendation: "Conserver le rattrapage et comparer les pages qui transforment le mieux l'hesitation en appel."
    });
  }

  if (trafficRescueShown >= 5 && trafficRescueClicks === 0) {
    actions.push({
      score: 90,
      opportunity_type: "relance-accueil-friction",
      url: "/",
      query: `${trafficRescueShown} relance(s) accueil, 0 clic`,
      recommendation: "Tester le texte, le delai et la preuve metier de la relance accueil pour transformer le trafic sans clic."
    });
  }

  if (trafficRescueClicks > 0) {
    actions.push({
      score: 77,
      opportunity_type: "relance-accueil-active",
      url: "/",
      query: `${trafficRescueClicks}/${trafficRescueShown || trafficRescueClicks} clic(s) relance accueil`,
      recommendation: "Comparer les clics devis/appel issus de la relance accueil avec les starts formulaire et renforcer le parcours gagnant."
    });
  }

  if (contentBridgeShown >= 10 && contentBridgeClicks === 0) {
    actions.push({
      score: 86,
      opportunity_type: "pont-contenu-friction",
      url: topContentBridge?.path || "/blog.html",
      query: `${contentBridgeShown} pont(s) contenu, 0 clic`,
      recommendation: "Tester un message de passage vers devis plus concret sur les articles, FAQ et villes a forte lecture."
    });
  }

  if (contentBridgeClicks >= 3 && contentBridgeLeads === 0) {
    actions.push({
      score: 84,
      opportunity_type: "pont-contenu-lead-friction",
      url: topContentBridge?.path || "/blog.html",
      query: `${contentBridgeClicks} clic(s) contenu, 0 lead confirme`,
      recommendation: "Controler la promesse du pont, le formulaire cible et le message de reassurance jusqu'a l'envoi du devis."
    });
  }

  if (contentBridgeLeads > 0) {
    actions.push({
      score: 91,
      opportunity_type: "pont-contenu-lead-gagnant",
      url: topContentBridge?.path || "/blog.html",
      query: `${contentBridgeLeads} lead(s) depuis contenu, ${contentBridgeClicks || 0} clic(s)`,
      recommendation: "Renforcer cette page SEO, ajouter des liens internes proches et produire des contenus satellites sur la meme intention."
    });
  }

  if (contentBridgeClicks > 0) {
    actions.push({
      score: 75,
      opportunity_type: "pont-contenu-gagnant",
      url: topContentBridge?.path || "/blog.html",
      query: `${contentBridgeClicks}/${contentBridgeShown || contentBridgeClicks} clic(s) depuis contenu`,
      recommendation: "Identifier les pages de lecture qui declenchent le mieux le devis et renforcer leur maillage interne."
    });
  }

  if (topGap && Number(topGap.form_starts || 0) > topGapHandled) {
    actions.push({
      score: 88,
      opportunity_type: "tunnel-lead",
      url: topGap.path || "/",
      query: `${topGap.form_starts || 0} starts / ${topGap.leads_created || 0} leads / ${topGap.duplicate_filtered || 0} doublons`,
      recommendation: "Analyser les champs, l'intention de page et le message de reassurance autour du formulaire."
    });
  }

  if (diagnosticSelects >= 5 && diagnosticCompletes < diagnosticSelects) {
    actions.push({
      score: 86,
      opportunity_type: "diagnostic-friction",
      url: topDiagnostic?.path || "/",
      query: `${diagnosticCompletes}/${diagnosticSelects} diagnostics termines`,
      recommendation: "Verifier si le CTA du diagnostic est assez visible et si le parcours pre-remplit bien le formulaire sur mobile."
    });
  }

  if (topDiagnostic && Number(topDiagnostic.completions || 0) > 0) {
    actions.push({
      score: 72,
      opportunity_type: "diagnostic-gagnant",
      url: topDiagnostic.path || "/",
      query: `${topDiagnostic.completions} diagnostic(s) ${topDiagnostic.target || ""}`.trim(),
      recommendation: "Renforcer le maillage interne vers ce parcours car il declenche des intentions qualifiees."
    });
  }

  if (readinessStarts >= 5 && readinessCompletes < readinessStarts) {
    actions.push({
      score: 84,
      opportunity_type: "dossier-friction",
      url: topReadiness?.path || "/",
      query: `${readinessCompletes}/${readinessStarts} dossiers prepares`,
      recommendation: "Verifier que le module dossier visible conduit bien au formulaire et que le message pre-rempli rassure."
    });
  }

  if (valueHintsReady >= 5 && Number(conversionFunnel.submit_attempts || 0) < valueHintsReady) {
    actions.push({
      score: 82,
      opportunity_type: "estimation-friction",
      url: topValueHint?.path || "/devis-assurance-immeuble.html",
      query: `${conversionFunnel.submit_attempts || 0}/${valueHintsReady} tentatives apres estimation`,
      recommendation: "Verifier si la fourchette indicative rassure assez et si le bouton de devis reste visible apres la qualification."
    });
  }

  if (topValueHint && Number(topValueHint.completions || 0) > 0) {
    actions.push({
      score: 71,
      opportunity_type: "estimation-gagnante",
      url: topValueHint.path || "/",
      query: `${topValueHint.completions} estimation(s), potentiel ${Math.round(topValueHint.avg_value_max || 0)} EUR`,
      recommendation: "Renforcer le contenu prix, franchises et pieces assureur sur les pages qui declenchent les meilleures estimations."
    });
  }

  if (topReadiness && Number(topReadiness.completions || 0) > 0) {
    actions.push({
      score: 74,
      opportunity_type: "dossier-gagnant",
      url: topReadiness.path || "/",
      query: `${topReadiness.completions} dossier(s), score moyen ${Math.round(topReadiness.avg_score || 0)}%`,
      recommendation: "Renforcer les CTA autour des pieces qui rendent cette page plus qualifiante pour l'assureur."
    });
  }

  if (topValidation && validationErrorCount > 0) {
    actions.push({
      score: 85,
      opportunity_type: "validation-friction",
      url: topValidation.path || "/devis-assurance-immeuble.html",
      query: `${topValidation.errors || 0} blocage(s): ${topValidation.missing || "validation"}`,
      recommendation: "Simplifier ou mieux expliquer les champs qui bloquent le plus les demandes de devis."
    });
  }

  if (spamBlockedCount > 0) {
    actions.push({
      score: 94,
      opportunity_type: "spam-bloque",
      url: topSpamBlock?.path || "admin/seo",
      query: `${spamBlockedCount} tentative(s) robot bloquees`,
      recommendation: "Surveiller les raisons de blocage et renforcer les champs pieges si le volume augmente."
    });
  }
  if (duplicateFilteredCount > 0) {
    actions.push({
      score: 89,
      opportunity_type: "doublon-filtre",
      url: topDuplicateLead?.path || "admin/leads",
      query: `${duplicateFilteredCount} demande(s) deja rattachee(s) a un lead existant`,
      recommendation: "Traiter ces signaux comme relance commerciale, sans les laisser gonfler artificiellement le volume de nouveaux leads."
    });
  }
  if (bestExperiment && Number(bestExperiment.views || 0) >= 10) {
    actions.push({
      score: 73,
      opportunity_type: "test-cta-gagnant",
      url: "admin/seo",
      query: `${bestExperiment.variant}: ${bestExperiment.form_starts || 0} starts / ${bestExperiment.leads_created || 0} leads`,
      recommendation: "Conserver la variante gagnante et renforcer les CTA proches du meme angle."
    });
  }

  if (leads30d > 0 && hotLeads30d === 0) {
    actions.push({
      score: 76,
      opportunity_type: "qualite-lead",
      url: "admin/leads",
      query: "0 lead chaud sur 30 jours",
      recommendation: "Renforcer les pages PNO/CNO, SCI, syndic et immeubles multi-lots qui portent les meilleurs scores."
    });
  }

  for (const bucket of Array.isArray(leadPriorities) ? leadPriorities : []) {
    if (bucket.priority === "warm" && Number(bucket.count || 0) >= 3) {
      actions.push({
        score: 70,
        opportunity_type: "relance-warm",
        url: "admin/leads",
        query: `${bucket.count} leads a traiter`,
        recommendation: "Creer une relance courte pour obtenir echeance, contrat actuel et sinistres manquants."
      });
    }
  }

  return actions.sort((a, b) => b.score - a.score).slice(0, 12);
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) {
    return json({ success: false, error: "Acces refuse" }, 401);
  }

  if (!env.DB) {
    return json({ success: false, error: "Base SQLite indisponible" }, 503);
  }

  const [
    eventCounts,
    homepageDevisEvents,
    quoteFastNudgeEvents,
    leadStats,
    latestRun,
    opportunities,
    contentPipeline,
    topPaths,
    topLandingPages,
    leadsByNeed,
    leadsByCity,
    leadPriorities,
    hotPending,
    conversionGaps,
    abandonPaths,
    diagnosticPaths,
    readinessPaths,
    valueHintPaths,
    validationErrors,
    spamBlocks,
    duplicateLeads,
    seoMetrics,
    contentBridgePaths,
    ctaExperiments
  ] = await Promise.all([
    safeAll(env, `SELECT event_type, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_type ORDER BY count DESC`),
    safeFirst(env, `SELECT SUM(CASE WHEN event_type = 'quote_router_select' THEN 1 ELSE 0 END) AS selects, SUM(CASE WHEN event_type = 'quote_router_continue' THEN 1 ELSE 0 END) AS continues FROM site_events WHERE created_at >= datetime('now', '-30 days') AND COALESCE(NULLIF(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.source') ELSE '' END, ''), '') = 'homepage-devis-accelerator'`),
    safeFirst(env, `SELECT SUM(CASE WHEN event_type = 'quote_router_view' THEN 1 ELSE 0 END) AS views, SUM(CASE WHEN event_type = 'quote_router_continue' THEN 1 ELSE 0 END) AS continues FROM site_events WHERE created_at >= datetime('now', '-30 days') AND COALESCE(NULLIF(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.source') ELSE '' END, ''), '') = 'quote-fast-nudge'`),
    safeFirst(env, `SELECT COUNT(*) AS leads_30d, COALESCE(AVG(lead_score), 0) AS avg_score, SUM(CASE WHEN lead_score >= 80 THEN 1 ELSE 0 END) AS hot_leads_30d FROM leads WHERE created_at >= datetime('now', '-30 days')`),
    safeFirst(env, `SELECT id, source, status, pages_checked, opportunities_count, created_at FROM seo_runs ORDER BY created_at DESC LIMIT 1`),
    safeAll(env, `SELECT url, query, opportunity_type, score, status, recommendation, created_at FROM seo_opportunities ORDER BY score DESC, created_at DESC LIMIT 50`),
    safeAll(env, `SELECT slug, category, title, intent, status, quality_score, updated_at FROM content_pipeline ORDER BY quality_score DESC, updated_at DESC LIMIT 50`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, event_type, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY path, event_type ORDER BY count DESC LIMIT 80`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.landing_page'), ''), page_url, '/') AS landing_page, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY landing_page ORDER BY count DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(need, ''), 'non precise') AS need, COUNT(*) AS count, COALESCE(AVG(lead_score), 0) AS avg_score FROM leads WHERE created_at >= datetime('now', '-30 days') GROUP BY need ORDER BY count DESC, avg_score DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(city, ''), 'non precise') AS city, COUNT(*) AS count, COALESCE(AVG(lead_score), 0) AS avg_score FROM leads WHERE created_at >= datetime('now', '-30 days') GROUP BY city ORDER BY count DESC, avg_score DESC LIMIT 20`),
    safeAll(env, `SELECT CASE WHEN lead_score >= 85 THEN 'hot' WHEN lead_score >= 70 THEN 'warm' WHEN lead_score >= 45 THEN 'standard' ELSE 'low' END AS priority, COUNT(*) AS count, COALESCE(AVG(lead_score), 0) AS avg_score FROM leads WHERE created_at >= datetime('now', '-30 days') GROUP BY priority`),
    safeFirst(env, `SELECT COUNT(*) AS count, MIN(created_at) AS oldest_created_at FROM leads WHERE status = 'new' AND lead_score >= 85`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, SUM(CASE WHEN event_type = 'form_start' THEN 1 ELSE 0 END) AS form_starts, SUM(CASE WHEN event_type = 'form_submit_attempt' THEN 1 ELSE 0 END) AS submit_attempts, SUM(CASE WHEN event_type = 'lead_created' THEN 1 ELSE 0 END) AS leads_created, SUM(CASE WHEN event_type = 'lead_duplicate_filtered' THEN 1 ELSE 0 END) AS duplicate_filtered, SUM(CASE WHEN event_type = 'lead_form_abandoned' THEN 1 ELSE 0 END) AS abandoned_forms FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY path HAVING SUM(CASE WHEN event_type = 'form_start' THEN 1 ELSE 0 END) > 0 ORDER BY (SUM(CASE WHEN event_type = 'form_start' THEN 1 ELSE 0 END) - SUM(CASE WHEN event_type = 'lead_created' THEN 1 ELSE 0 END) - SUM(CASE WHEN event_type = 'lead_duplicate_filtered' THEN 1 ELSE 0 END)) DESC, abandoned_forms DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COUNT(*) AS count FROM site_events WHERE event_type = 'lead_form_abandoned' AND created_at >= datetime('now', '-30 days') GROUP BY path ORDER BY count DESC LIMIT 10`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.target'), ''), 'non precise') AS target, COALESCE(NULLIF(json_extract(payload, '$.route'), ''), '') AS route, COUNT(*) AS completions FROM site_events WHERE event_type = 'diagnostic_complete' AND created_at >= datetime('now', '-30 days') GROUP BY path, target, route ORDER BY completions DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.target'), ''), 'non precise') AS target, COUNT(*) AS completions, COALESCE(AVG(CAST(NULLIF(json_extract(payload, '$.score'), '') AS REAL)), 0) AS avg_score FROM site_events WHERE event_type = 'readiness_complete' AND created_at >= datetime('now', '-30 days') GROUP BY path, target ORDER BY completions DESC, avg_score DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.target'), ''), 'non precise') AS target, COUNT(*) AS completions, COALESCE(AVG(CAST(NULLIF(json_extract(payload, '$.score'), '') AS REAL)), 0) AS avg_score, COALESCE(AVG(CAST(NULLIF(json_extract(payload, '$.lead_value_max'), '') AS REAL)), 0) AS avg_value_max FROM site_events WHERE event_type = 'lead_value_hint_ready' AND created_at >= datetime('now', '-30 days') GROUP BY path, target ORDER BY completions DESC, avg_value_max DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.missing'), ''), COALESCE(NULLIF(json_extract(payload, '$.label'), ''), 'non precise')) AS missing, COUNT(*) AS errors FROM site_events WHERE event_type = 'lead_submit_error' AND created_at >= datetime('now', '-30 days') GROUP BY path, missing ORDER BY errors DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.label'), ''), 'anti-spam') AS reason, COUNT(*) AS blocked, COALESCE(MAX(CAST(NULLIF(json_extract(payload, '$.spam_score'), '') AS REAL)), 0) AS max_score FROM site_events WHERE event_type = 'lead_spam_blocked' AND created_at >= datetime('now', '-30 days') GROUP BY path, reason ORDER BY blocked DESC, max_score DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.duplicate_reason'), ''), COALESCE(NULLIF(json_extract(payload, '$.label'), ''), 'doublon-contact')) AS reason, COUNT(*) AS duplicates, COUNT(DISTINCT NULLIF(lead_reference, '')) AS existing_leads FROM site_events WHERE event_type = 'lead_duplicate_filtered' AND created_at >= datetime('now', '-30 days') GROUP BY path, reason ORDER BY duplicates DESC LIMIT 20`),
    safeAll(env, `SELECT metric_type, metric_name, value, payload, created_at FROM seo_metrics WHERE run_id = (SELECT id FROM seo_runs ORDER BY created_at DESC LIMIT 1) ORDER BY metric_type, metric_name`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.source_path'), ''), COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/')) AS path, COALESCE(NULLIF(json_extract(payload, '$.content_kind'), ''), COALESCE(NULLIF(json_extract(payload, '$.level'), ''), 'contenu')) AS content_kind, SUM(CASE WHEN event_type = 'content_lead_bridge_shown' THEN 1 ELSE 0 END) AS shown, SUM(CASE WHEN event_type = 'content_lead_bridge_quote_click' THEN 1 ELSE 0 END) AS quote_clicks, SUM(CASE WHEN event_type = 'content_lead_bridge_phone_click' THEN 1 ELSE 0 END) AS phone_clicks, SUM(CASE WHEN event_type = 'content_lead_bridge_dismissed' THEN 1 ELSE 0 END) AS dismissed, SUM(CASE WHEN event_type = 'lead_created' THEN 1 ELSE 0 END) AS leads_created, SUM(CASE WHEN event_type = 'lead_created' THEN COALESCE(CAST(NULLIF(json_extract(payload, '$.lead_value_max'), '') AS REAL), 0) ELSE 0 END) AS lead_value_max_total, COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), id)) AS sessions FROM site_events WHERE created_at >= datetime('now', '-30 days') AND (event_type IN ('content_lead_bridge_shown', 'content_lead_bridge_quote_click', 'content_lead_bridge_phone_click', 'content_lead_bridge_dismissed') OR (event_type = 'lead_created' AND COALESCE(NULLIF(json_extract(payload, '$.content_bridge'), ''), '') = '1')) GROUP BY path, content_kind HAVING shown + quote_clicks + phone_clicks + dismissed + leads_created > 0 ORDER BY leads_created DESC, (quote_clicks + phone_clicks) DESC, shown DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.experiment_variant'), ''), 'non mesure') AS variant, COALESCE(NULLIF(json_extract(payload, '$.experiment_label'), ''), '') AS label, COUNT(*) AS events, SUM(CASE WHEN event_type = 'experiment_view' THEN 1 ELSE 0 END) AS views, SUM(CASE WHEN event_type IN ('cta_click', 'phone_click', 'email_click', 'traffic_without_click_quote_click', 'traffic_without_click_phone_click') THEN 1 ELSE 0 END) AS cta_clicks, SUM(CASE WHEN event_type = 'form_start' THEN 1 ELSE 0 END) AS form_starts, SUM(CASE WHEN event_type = 'lead_created' THEN 1 ELSE 0 END) AS leads_created, SUM(CASE WHEN event_type = 'lead_created' THEN COALESCE(CAST(NULLIF(json_extract(payload, '$.lead_value_max'), '') AS REAL), 0) ELSE 0 END) AS lead_value_max_total FROM site_events WHERE created_at >= datetime('now', '-30 days') AND COALESCE(NULLIF(json_extract(payload, '$.experiment_variant'), ''), '') <> '' GROUP BY variant, label ORDER BY leads_created DESC, form_starts DESC, cta_clicks DESC LIMIT 12`)
  ]);

  const pageViews = countFrom(eventCounts, "page_view");
  const experimentViews = countFrom(eventCounts, "experiment_view");
  const homepageDevisSelects = Number(homepageDevisEvents?.selects || 0);
  const homepageDevisContinues = Number(homepageDevisEvents?.continues || 0);
  const quoteFastNudgeViews = Number(quoteFastNudgeEvents?.views || 0);
  const quoteFastNudgeContinues = Number(quoteFastNudgeEvents?.continues || 0);
  const ctaClicks = countFrom(eventCounts, "cta_click") + countFrom(eventCounts, "phone_click") + countFrom(eventCounts, "email_click") + countFrom(eventCounts, "traffic_without_click_quote_click") + countFrom(eventCounts, "traffic_without_click_phone_click");
  const formStarts = countFrom(eventCounts, "form_start");
  const qualityReady = countFrom(eventCounts, "form_quality_ready");
  const validationErrorsCount = countFrom(eventCounts, "lead_submit_error");
  const spamBlockedCount = countFrom(eventCounts, "lead_spam_blocked");
  const duplicateFiltered = countFrom(eventCounts, "lead_duplicate_filtered");
  const valueHintReady = countFrom(eventCounts, "lead_value_hint_ready");
  const attempts = countFrom(eventCounts, "form_submit_attempt");
  const leadCreated = countFrom(eventCounts, "lead_created");
  const abandoned = countFrom(eventCounts, "lead_form_abandoned");
  const rescueShown = countFrom(eventCounts, "lead_form_rescue_shown");
  const rescuePhoneClicks = countFrom(eventCounts, "lead_form_rescue_phone_click");
  const rescueExpressClicks = countFrom(eventCounts, "lead_form_rescue_express_click");
  const rescueDismissed = countFrom(eventCounts, "lead_form_rescue_dismissed");
  const trafficRescueShown = countFrom(eventCounts, "traffic_without_click_shown");
  const trafficRescueUrgencySelects = countFrom(eventCounts, "traffic_without_click_urgency_select");
  const trafficRescueQuoteClicks = countFrom(eventCounts, "traffic_without_click_quote_click");
  const trafficRescuePhoneClicks = countFrom(eventCounts, "traffic_without_click_phone_click");
  const trafficRescueDismissed = countFrom(eventCounts, "traffic_without_click_dismissed");
  const trafficRescueClicks = trafficRescueQuoteClicks + trafficRescuePhoneClicks;
  const contentBridgeShown = countFrom(eventCounts, "content_lead_bridge_shown");
  const contentBridgeQuoteClicks = countFrom(eventCounts, "content_lead_bridge_quote_click");
  const contentBridgePhoneClicks = countFrom(eventCounts, "content_lead_bridge_phone_click");
  const contentBridgeDismissed = countFrom(eventCounts, "content_lead_bridge_dismissed");
  const contentBridgeClicks = contentBridgeQuoteClicks + contentBridgePhoneClicks;
  const contentBridgeLeadCreated = Array.isArray(contentBridgePaths) ? contentBridgePaths.reduce((sum, row) => sum + Number(row.leads_created || 0), 0) : 0;
  const diagnosticSelects = countFrom(eventCounts, "diagnostic_select");
  const diagnosticCompletes = countFrom(eventCounts, "diagnostic_complete");
  const readinessStarts = countFrom(eventCounts, "readiness_start");
  const readinessUpdates = countFrom(eventCounts, "readiness_update");
  const readinessCompletes = countFrom(eventCounts, "readiness_complete");
  const conversionFunnel = {
    page_views: pageViews,
    experiment_views: experimentViews,
    cta_clicks: ctaClicks,
    homepage_devis_selects: homepageDevisSelects,
    homepage_devis_continues: homepageDevisContinues,
    homepage_devis_start_rate: pct(formStarts, homepageDevisContinues),
    quote_fast_nudge_views: quoteFastNudgeViews,
    quote_fast_nudge_continues: quoteFastNudgeContinues,
    quote_fast_nudge_rate: pct(quoteFastNudgeContinues, quoteFastNudgeViews),
    diagnostic_selects: diagnosticSelects,
    diagnostic_completes: diagnosticCompletes,
    readiness_starts: readinessStarts,
    readiness_updates: readinessUpdates,
    readiness_completes: readinessCompletes,
    form_starts: formStarts,
    quality_ready: qualityReady,
    validation_errors: validationErrorsCount,
    spam_blocked: spamBlockedCount,
    duplicate_filtered: duplicateFiltered,
    handled_leads: leadCreated + duplicateFiltered,
    value_hint_ready: valueHintReady,
    submit_attempts: attempts,
    leads_created: leadCreated,
    abandoned_forms: abandoned,
    form_rescue_shown: rescueShown,
    form_rescue_phone_clicks: rescuePhoneClicks,
    form_rescue_express_clicks: rescueExpressClicks,
    form_rescue_dismissed: rescueDismissed,
    traffic_rescue_shown: trafficRescueShown,
    traffic_rescue_urgency_selects: trafficRescueUrgencySelects,
    traffic_rescue_clicks: trafficRescueClicks,
    traffic_rescue_quote_clicks: trafficRescueQuoteClicks,
    traffic_rescue_phone_clicks: trafficRescuePhoneClicks,
    traffic_rescue_dismissed: trafficRescueDismissed,
    content_bridge_shown: contentBridgeShown,
    content_bridge_clicks: contentBridgeClicks,
    content_bridge_quote_clicks: contentBridgeQuoteClicks,
    content_bridge_phone_clicks: contentBridgePhoneClicks,
    content_bridge_dismissed: contentBridgeDismissed,
    content_bridge_leads: contentBridgeLeadCreated,
    visitor_to_cta_rate: pct(ctaClicks, pageViews),
    diagnostic_completion_rate: pct(diagnosticCompletes, diagnosticSelects),
    diagnostic_to_form_rate: pct(formStarts, diagnosticCompletes),
    readiness_completion_rate: pct(readinessCompletes, readinessStarts),
    readiness_to_form_rate: pct(formStarts, readinessCompletes),
    cta_to_form_rate: pct(formStarts, ctaClicks),
    form_to_lead_rate: pct(leadCreated, formStarts),
    attempt_to_lead_rate: pct(leadCreated, attempts),
    attempt_to_handled_lead_rate: pct(leadCreated + duplicateFiltered, attempts),
    value_hint_to_submit_rate: pct(attempts, valueHintReady),
    value_hint_to_lead_rate: pct(leadCreated, valueHintReady),
    abandon_rate: pct(abandoned, formStarts),
    form_rescue_phone_rate: pct(rescuePhoneClicks, rescueShown),
    form_rescue_express_rate: pct(rescueExpressClicks, rescueShown),
    form_rescue_dismiss_rate: pct(rescueDismissed, rescueShown),
    traffic_rescue_click_rate: pct(trafficRescueClicks, trafficRescueShown),
    traffic_rescue_urgency_select_rate: pct(trafficRescueUrgencySelects, trafficRescueShown),
    traffic_rescue_quote_rate: pct(trafficRescueQuoteClicks, trafficRescueShown),
    traffic_rescue_phone_rate: pct(trafficRescuePhoneClicks, trafficRescueShown),
    traffic_rescue_dismiss_rate: pct(trafficRescueDismissed, trafficRescueShown),
    content_bridge_click_rate: pct(contentBridgeClicks, contentBridgeShown),
    content_bridge_quote_rate: pct(contentBridgeQuoteClicks, contentBridgeShown),
    content_bridge_phone_rate: pct(contentBridgePhoneClicks, contentBridgeShown),
    content_bridge_dismiss_rate: pct(contentBridgeDismissed, contentBridgeShown),
    content_bridge_to_lead_rate: pct(contentBridgeLeadCreated, contentBridgeShown),
    content_bridge_click_to_lead_rate: pct(contentBridgeLeadCreated, contentBridgeClicks)
  };

  return json({
    success: true,
    event_counts: eventCounts,
    lead_stats: leadStats,
    conversion_funnel: conversionFunnel,
    top_paths: Array.isArray(topPaths) ? topPaths : [],
    top_landing_pages: Array.isArray(topLandingPages) ? topLandingPages : [],
    leads_by_need: Array.isArray(leadsByNeed) ? leadsByNeed : [],
    leads_by_city: Array.isArray(leadsByCity) ? leadsByCity : [],
    lead_priorities: Array.isArray(leadPriorities) ? leadPriorities : [],
    hot_pending: hotPending,
    conversion_gaps: Array.isArray(conversionGaps) ? conversionGaps : [],
    abandon_paths: Array.isArray(abandonPaths) ? abandonPaths : [],
    diagnostic_paths: Array.isArray(diagnosticPaths) ? diagnosticPaths : [],
    readiness_paths: Array.isArray(readinessPaths) ? readinessPaths : [],
    value_hint_paths: Array.isArray(valueHintPaths) ? valueHintPaths : [],
    validation_errors: Array.isArray(validationErrors) ? validationErrors : [],
    spam_blocks: Array.isArray(spamBlocks) ? spamBlocks : [],
    duplicate_leads: Array.isArray(duplicateLeads) ? duplicateLeads : [],
    content_bridge_paths: Array.isArray(contentBridgePaths) ? contentBridgePaths.map((row) => { const clicks = Number(row.quote_clicks || 0) + Number(row.phone_clicks || 0); const leads = Number(row.leads_created || 0); return { ...row, shown: Number(row.shown || 0), quote_clicks: Number(row.quote_clicks || 0), phone_clicks: Number(row.phone_clicks || 0), dismissed: Number(row.dismissed || 0), leads_created: leads, lead_value_max_total: Number(row.lead_value_max_total || 0), clicks, click_rate: pct(clicks, row.shown), dismiss_rate: pct(row.dismissed, row.shown), bridge_to_lead_rate: pct(leads, row.shown), click_to_lead_rate: pct(leads, clicks) }; }) : [],
    cta_experiments: Array.isArray(ctaExperiments) ? ctaExperiments : [],
    seo_metrics: metricsObject(seoMetrics),
    lead_actions: buildLeadActions({ conversionFunnel, leadStats, leadPriorities, hotPending, conversionGaps, abandonPaths, diagnosticPaths, readinessPaths, valueHintPaths, validationErrors, spamBlocks, duplicateLeads, contentBridgePaths, ctaExperiments }),
    latest_run: latestRun,
    opportunities: Array.isArray(opportunities) ? opportunities : [],
    content_pipeline: Array.isArray(contentPipeline) ? contentPipeline : [],
    warnings: [eventCounts, leadStats, latestRun, opportunities, contentPipeline, topPaths, topLandingPages, leadsByNeed, leadsByCity, leadPriorities, hotPending, conversionGaps, abandonPaths, diagnosticPaths, readinessPaths, valueHintPaths, validationErrors, spamBlocks, duplicateLeads, seoMetrics, contentBridgePaths, ctaExperiments].filter((item) => item && item.error).map((item) => item.error)
  });
}
