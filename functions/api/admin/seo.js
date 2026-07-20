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

function buildLeadActions({ conversionFunnel, leadStats, leadPriorities, hotPending, conversionGaps, abandonPaths, diagnosticPaths, readinessPaths }) {
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

  if (topGap && Number(topGap.form_starts || 0) > Number(topGap.leads_created || 0)) {
    actions.push({
      score: 88,
      opportunity_type: "tunnel-lead",
      url: topGap.path || "/",
      query: `${topGap.form_starts || 0} starts / ${topGap.leads_created || 0} leads`,
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

  if (topReadiness && Number(topReadiness.completions || 0) > 0) {
    actions.push({
      score: 74,
      opportunity_type: "dossier-gagnant",
      url: topReadiness.path || "/",
      query: `${topReadiness.completions} dossier(s), score moyen ${Math.round(topReadiness.avg_score || 0)}%`,
      recommendation: "Renforcer les CTA autour des pieces qui rendent cette page plus qualifiante pour l'assureur."
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
    return json({ success: false, error: "Binding D1 DB manquant" }, 503);
  }

  const [
    eventCounts,
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
    readinessPaths
  ] = await Promise.all([
    safeAll(env, `SELECT event_type, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_type ORDER BY count DESC`),
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
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, SUM(CASE WHEN event_type = 'form_start' THEN 1 ELSE 0 END) AS form_starts, SUM(CASE WHEN event_type = 'form_submit_attempt' THEN 1 ELSE 0 END) AS submit_attempts, SUM(CASE WHEN event_type = 'lead_created' THEN 1 ELSE 0 END) AS leads_created, SUM(CASE WHEN event_type = 'lead_form_abandoned' THEN 1 ELSE 0 END) AS abandoned_forms FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY path HAVING SUM(CASE WHEN event_type = 'form_start' THEN 1 ELSE 0 END) > 0 ORDER BY (SUM(CASE WHEN event_type = 'form_start' THEN 1 ELSE 0 END) - SUM(CASE WHEN event_type = 'lead_created' THEN 1 ELSE 0 END)) DESC, abandoned_forms DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COUNT(*) AS count FROM site_events WHERE event_type = 'lead_form_abandoned' AND created_at >= datetime('now', '-30 days') GROUP BY path ORDER BY count DESC LIMIT 10`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.target'), ''), 'non precise') AS target, COALESCE(NULLIF(json_extract(payload, '$.route'), ''), '') AS route, COUNT(*) AS completions FROM site_events WHERE event_type = 'diagnostic_complete' AND created_at >= datetime('now', '-30 days') GROUP BY path, target, route ORDER BY completions DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, COALESCE(NULLIF(json_extract(payload, '$.target'), ''), 'non precise') AS target, COUNT(*) AS completions, COALESCE(AVG(CAST(NULLIF(json_extract(payload, '$.score'), '') AS REAL)), 0) AS avg_score FROM site_events WHERE event_type = 'readiness_complete' AND created_at >= datetime('now', '-30 days') GROUP BY path, target ORDER BY completions DESC, avg_score DESC LIMIT 20`)
  ]);

  const pageViews = countFrom(eventCounts, "page_view");
  const ctaClicks = countFrom(eventCounts, "cta_click") + countFrom(eventCounts, "phone_click") + countFrom(eventCounts, "email_click");
  const formStarts = countFrom(eventCounts, "form_start");
  const qualityReady = countFrom(eventCounts, "form_quality_ready");
  const attempts = countFrom(eventCounts, "form_submit_attempt");
  const leadCreated = countFrom(eventCounts, "lead_created");
  const abandoned = countFrom(eventCounts, "lead_form_abandoned");
  const diagnosticSelects = countFrom(eventCounts, "diagnostic_select");
  const diagnosticCompletes = countFrom(eventCounts, "diagnostic_complete");
  const readinessStarts = countFrom(eventCounts, "readiness_start");
  const readinessUpdates = countFrom(eventCounts, "readiness_update");
  const readinessCompletes = countFrom(eventCounts, "readiness_complete");
  const conversionFunnel = {
    page_views: pageViews,
    cta_clicks: ctaClicks,
    diagnostic_selects: diagnosticSelects,
    diagnostic_completes: diagnosticCompletes,
    readiness_starts: readinessStarts,
    readiness_updates: readinessUpdates,
    readiness_completes: readinessCompletes,
    form_starts: formStarts,
    quality_ready: qualityReady,
    submit_attempts: attempts,
    leads_created: leadCreated,
    abandoned_forms: abandoned,
    visitor_to_cta_rate: pct(ctaClicks, pageViews),
    diagnostic_completion_rate: pct(diagnosticCompletes, diagnosticSelects),
    diagnostic_to_form_rate: pct(formStarts, diagnosticCompletes),
    readiness_completion_rate: pct(readinessCompletes, readinessStarts),
    readiness_to_form_rate: pct(formStarts, readinessCompletes),
    cta_to_form_rate: pct(formStarts, ctaClicks),
    form_to_lead_rate: pct(leadCreated, formStarts),
    attempt_to_lead_rate: pct(leadCreated, attempts),
    abandon_rate: pct(abandoned, formStarts)
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
    lead_actions: buildLeadActions({ conversionFunnel, leadStats, leadPriorities, hotPending, conversionGaps, abandonPaths, diagnosticPaths, readinessPaths }),
    latest_run: latestRun,
    opportunities: Array.isArray(opportunities) ? opportunities : [],
    content_pipeline: Array.isArray(contentPipeline) ? contentPipeline : [],
    warnings: [eventCounts, leadStats, latestRun, opportunities, contentPipeline, topPaths, topLandingPages, leadsByNeed, leadsByCity, leadPriorities, hotPending, conversionGaps, abandonPaths, diagnosticPaths, readinessPaths].filter((item) => item && item.error).map((item) => item.error)
  });
}
