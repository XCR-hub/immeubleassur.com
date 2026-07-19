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

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) {
    return json({ success: false, error: "Acces refuse" }, 401);
  }

  if (!env.DB) {
    return json({ success: false, error: "Binding D1 DB manquant" }, 503);
  }

  const [eventCounts, leadStats, latestRun, opportunities, contentPipeline] = await Promise.all([
    safeAll(env, `SELECT event_type, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_type ORDER BY count DESC`),
    safeFirst(env, `SELECT COUNT(*) AS leads_30d, COALESCE(AVG(lead_score), 0) AS avg_score FROM leads WHERE created_at >= datetime('now', '-30 days')`),
    safeFirst(env, `SELECT id, source, status, pages_checked, opportunities_count, created_at FROM seo_runs ORDER BY created_at DESC LIMIT 1`),
    safeAll(env, `SELECT url, query, opportunity_type, score, status, recommendation, created_at FROM seo_opportunities ORDER BY score DESC, created_at DESC LIMIT 50`),
    safeAll(env, `SELECT slug, category, title, intent, status, quality_score, updated_at FROM content_pipeline ORDER BY quality_score DESC, updated_at DESC LIMIT 50`)
  ]);

  return json({
    success: true,
    event_counts: eventCounts,
    lead_stats: leadStats,
    latest_run: latestRun,
    opportunities: Array.isArray(opportunities) ? opportunities : [],
    content_pipeline: Array.isArray(contentPipeline) ? contentPipeline : [],
    warnings: [eventCounts, leadStats, latestRun, opportunities, contentPipeline].filter((item) => item && item.error).map((item) => item.error)
  });
}