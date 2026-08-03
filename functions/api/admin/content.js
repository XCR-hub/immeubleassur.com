import { adminRequestAllowed } from "../../_shared/admin-auth.js";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function authorized(request, env) { return adminRequestAllowed(request, env); }

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

function averageQuality(rows = []) {
  const values = rows.map((row) => Number(row.avg_quality || 0)).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function totalCount(rows = []) {
  return rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
}

function buildContentActions({ lowQualityPages, topOpportunities, watchItems, latestSeoRun, latestAiRun }) {
  const actions = [];

  for (const page of lowQualityPages.slice(0, 12)) {
    actions.push({
      priority: Math.max(60, 100 - Number(page.quality_score || 0)),
      type: "qualite-contenu",
      score: Number(page.quality_score || 0),
      target: page.slug || "",
      signal: `${page.category || "page"} - ${page.intent || "seo"}`,
      recommendation: `Renforcer la page ${page.title || page.slug}: preuves, FAQ, maillage interne et CTA devis.`
    });
  }

  for (const item of topOpportunities.slice(0, 12)) {
    actions.push({
      priority: Number(item.score || 0),
      type: item.opportunity_type || "opportunite-seo",
      score: Number(item.score || 0),
      target: item.url || "",
      signal: item.query || "requete",
      recommendation: item.recommendation || "Renforcer le contenu et la conversion de cette page."
    });
  }

  for (const item of watchItems.slice(0, 8)) {
    actions.push({
      priority: Number(item.relevance_score || 0),
      type: "veille-editoriale",
      score: Number(item.relevance_score || 0),
      target: item.url || "",
      signal: item.topic || item.source_name || "veille",
      recommendation: `Transformer ce signal en breve, FAQ ou paragraphe de mise a jour: ${item.title || "source a qualifier"}.`
    });
  }

  if (!latestSeoRun) {
    actions.push({
      priority: 82,
      type: "run-seo-manquant",
      score: 82,
      target: "seo_runs",
      signal: "aucun run SQLite",
      recommendation: "Verifier l'import SQLite du rapport SEO apres chaque build pour garder le pilotage actionnable."
    });
  }

  if (!latestAiRun) {
    actions.push({
      priority: 80,
      type: "run-ia-manquant",
      score: 80,
      target: "ai_generation_runs",
      signal: "aucun run SQLite",
      recommendation: "Verifier les secrets IA GitHub Actions et l'import des generations pour suivre provider, modele et qualite."
    });
  }

  return actions
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .slice(0, 40);
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) {
    return json({ success: false, error: "Acces refuse" }, 401);
  }
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);

  const [
    pipelineStats,
    lowQualityPages,
    freshPages,
    topOpportunities,
    watchItems,
    latestAiRun,
    latestSeoRun,
    latestSearchRun,
    latestMediaRun
  ] = await Promise.all([
    safeAll(env, `SELECT category, status, COUNT(*) AS count, COALESCE(AVG(quality_score), 0) AS avg_quality, MIN(quality_score) AS min_quality, MAX(updated_at) AS last_updated FROM content_pipeline GROUP BY category, status ORDER BY count DESC, avg_quality ASC`),
    safeAll(env, `SELECT slug, category, title, intent, status, quality_score, updated_at FROM content_pipeline WHERE quality_score < 80 ORDER BY quality_score ASC, updated_at DESC LIMIT 30`),
    safeAll(env, `SELECT slug, category, title, intent, status, quality_score, updated_at FROM content_pipeline ORDER BY updated_at DESC LIMIT 30`),
    safeAll(env, `SELECT url, query, opportunity_type, score, status, recommendation, created_at FROM seo_opportunities WHERE status = 'open' ORDER BY score DESC, created_at DESC LIMIT 30`),
    safeAll(env, `SELECT source_name, title, url, topic, relevance_score, published_at, fetched_at FROM editorial_watch_items ORDER BY relevance_score DESC, fetched_at DESC LIMIT 30`),
    safeFirst(env, `SELECT id, provider, model, task, status, created_at FROM ai_generation_runs ORDER BY created_at DESC LIMIT 1`),
    safeFirst(env, `SELECT id, source, status, pages_checked, opportunities_count, created_at FROM seo_runs ORDER BY created_at DESC LIMIT 1`),
    safeFirst(env, `SELECT id, provider, status, keywords_checked, average_position, first_page_count, created_at FROM search_intelligence_runs ORDER BY created_at DESC LIMIT 1`),
    safeFirst(env, `SELECT id, provider, status, assets_count, created_at FROM media_runs ORDER BY created_at DESC LIMIT 1`)
  ]);

  const cleanPipelineStats = rowsOrEmpty(pipelineStats);
  const cleanLowQualityPages = rowsOrEmpty(lowQualityPages);
  const cleanFreshPages = rowsOrEmpty(freshPages);
  const cleanTopOpportunities = rowsOrEmpty(topOpportunities);
  const cleanWatchItems = rowsOrEmpty(watchItems);
  const cleanLatestSeoRun = latestSeoRun && !latestSeoRun.error ? latestSeoRun : null;
  const cleanLatestAiRun = latestAiRun && !latestAiRun.error ? latestAiRun : null;

  return json({
    success: true,
    generated_at: new Date().toISOString(),
    summary: {
      pipeline_pages: totalCount(cleanPipelineStats),
      average_quality: averageQuality(cleanPipelineStats),
      low_quality_pages: cleanLowQualityPages.length,
      open_opportunities: cleanTopOpportunities.length,
      watch_items: cleanWatchItems.length
    },
    pipeline_stats: cleanPipelineStats,
    low_quality_pages: cleanLowQualityPages,
    fresh_pages: cleanFreshPages,
    top_opportunities: cleanTopOpportunities,
    watch_items: cleanWatchItems,
    latest_ai_run: cleanLatestAiRun,
    latest_seo_run: cleanLatestSeoRun,
    latest_search_run: latestSearchRun && !latestSearchRun.error ? latestSearchRun : null,
    latest_media_run: latestMediaRun && !latestMediaRun.error ? latestMediaRun : null,
    content_actions: buildContentActions({
      lowQualityPages: cleanLowQualityPages,
      topOpportunities: cleanTopOpportunities,
      watchItems: cleanWatchItems,
      latestSeoRun: cleanLatestSeoRun,
      latestAiRun: cleanLatestAiRun
    }),
    warnings: [
      errorOf(pipelineStats),
      errorOf(lowQualityPages),
      errorOf(freshPages),
      errorOf(topOpportunities),
      errorOf(watchItems),
      errorOf(latestAiRun),
      errorOf(latestSeoRun),
      errorOf(latestSearchRun),
      errorOf(latestMediaRun)
    ].filter(Boolean)
  });
}
