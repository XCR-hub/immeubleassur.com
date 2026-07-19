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

async function safeFirst(env, sql, binds = []) {
  try {
    const statement = env.DB.prepare(sql);
    return binds.length ? await statement.bind(...binds).first() : await statement.first();
  } catch (error) {
    return { error: error.message };
  }
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) {
    return json({ success: false, error: "Acces refuse" }, 401);
  }

  if (!env.DB) {
    return json({ success: false, error: "Binding D1 DB manquant" }, 503);
  }

  const [eventCounts, leadStats, latestRun, opportunities, contentPipeline, topPaths, topLandingPages, leadsByNeed, leadsByCity] = await Promise.all([
    safeAll(env, `SELECT event_type, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_type ORDER BY count DESC`),
    safeFirst(env, `SELECT COUNT(*) AS leads_30d, COALESCE(AVG(lead_score), 0) AS avg_score, SUM(CASE WHEN lead_score >= 80 THEN 1 ELSE 0 END) AS hot_leads_30d FROM leads WHERE created_at >= datetime('now', '-30 days')`),
    safeFirst(env, `SELECT id, source, status, pages_checked, opportunities_count, created_at FROM seo_runs ORDER BY created_at DESC LIMIT 1`),
    safeAll(env, `SELECT url, query, opportunity_type, score, status, recommendation, created_at FROM seo_opportunities ORDER BY score DESC, created_at DESC LIMIT 50`),
    safeAll(env, `SELECT slug, category, title, intent, status, quality_score, updated_at FROM content_pipeline ORDER BY quality_score DESC, updated_at DESC LIMIT 50`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.path'), ''), page_url, '/') AS path, event_type, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY path, event_type ORDER BY count DESC LIMIT 80`),
    safeAll(env, `SELECT COALESCE(NULLIF(json_extract(payload, '$.landing_page'), ''), page_url, '/') AS landing_page, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY landing_page ORDER BY count DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(need, ''), 'non precise') AS need, COUNT(*) AS count, COALESCE(AVG(lead_score), 0) AS avg_score FROM leads WHERE created_at >= datetime('now', '-30 days') GROUP BY need ORDER BY count DESC, avg_score DESC LIMIT 20`),
    safeAll(env, `SELECT COALESCE(NULLIF(city, ''), 'non precise') AS city, COUNT(*) AS count, COALESCE(AVG(lead_score), 0) AS avg_score FROM leads WHERE created_at >= datetime('now', '-30 days') GROUP BY city ORDER BY count DESC, avg_score DESC LIMIT 20`)
  ]);

  const pageViews = countFrom(eventCounts, "page_view");
  const ctaClicks = countFrom(eventCounts, "cta_click") + countFrom(eventCounts, "phone_click") + countFrom(eventCounts, "email_click");
  const formStarts = countFrom(eventCounts, "form_start");
  const qualityReady = countFrom(eventCounts, "form_quality_ready");
  const attempts = countFrom(eventCounts, "form_submit_attempt");
  const leadCreated = countFrom(eventCounts, "lead_created");
  const abandoned = countFrom(eventCounts, "lead_form_abandoned");
  const conversionFunnel = {
    page_views: pageViews,
    cta_clicks: ctaClicks,
    form_starts: formStarts,
    quality_ready: qualityReady,
    submit_attempts: attempts,
    leads_created: leadCreated,
    abandoned_forms: abandoned,
    visitor_to_cta_rate: pct(ctaClicks, pageViews),
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
    latest_run: latestRun,
    opportunities: Array.isArray(opportunities) ? opportunities : [],
    content_pipeline: Array.isArray(contentPipeline) ? contentPipeline : [],
    warnings: [eventCounts, leadStats, latestRun, opportunities, contentPipeline, topPaths, topLandingPages, leadsByNeed, leadsByCity].filter((item) => item && item.error).map((item) => item.error)
  });
}
