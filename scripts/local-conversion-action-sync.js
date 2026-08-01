import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function readJson(file) {
  if (!existsSync(file)) throw new Error(`Rapport introuvable: ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function readOptionalJson(file) {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function stableHash(value, length = 24) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function runIdFor(report) {
  const timestamp = new Date(report.generated_at || Date.now()).toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return `local-conversion-funnel-${timestamp}`;
}

function siteUrl(path) {
  const origin = env("SITE_ORIGIN", "https://immeubleassur.com").replace(/\/+$/, "");
  const raw = clean(path || "/", 700);
  try {
    const parsed = new URL(raw, origin);
    return parsed.origin === origin ? parsed.toString() : `${origin}/`;
  } catch {
    return raw.startsWith("/") ? `${origin}${raw}` : `${origin}/`;
  }
}

function sourceUrl(source) {
  const raw = clean(source, 700);
  if (raw.startsWith("/") || raw.startsWith("http://") || raw.startsWith("https://")) return siteUrl(raw);
  return siteUrl("/admin.html");
}

function scoreFor(item) {
  const score = Number(item.score || 0);
  if (score > 0) return Math.min(100, Math.round(score));
  if (item.severity === "critical") return 100;
  if (item.severity === "high") return 90;
  if (item.severity === "medium") return 72;
  return 55;
}

function normalizeOpportunity(item, report, runId, now) {
  const type = clean(item.type || "funnel", 90).replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  const path = clean(item.path || "/", 700) || "/";
  const id = `funnel-${stableHash(`${type}|${path}`)}`;
  const summary = report.summary || {};
  return {
    id,
    run_id: runId,
    url: siteUrl(path),
    query: clean(item.signal || type, 240),
    opportunity_type: `conversion-funnel-${type}`,
    score: scoreFor(item),
    status: "open",
    recommendation: clean(item.action || "Verifier la fuite de conversion mesuree sur cette page.", 900),
    payload: JSON.stringify({
      source: "local-conversion-funnel-monitor",
      severity: item.severity || "",
      path,
      signal: item.signal || "",
      report_generated_at: report.generated_at || "",
      lookback_days: Number(summary.lookback_days || 0),
      page_views: Number(summary.page_views || 0),
      form_starts: Number(summary.form_starts || 0),
      leads_db: Number(summary.leads_db || 0),
      form_to_lead_rate: Number(summary.form_to_lead_rate || 0),
      quote_continue_rate: Number(summary.quote_continue_rate || 0)
    }),
    created_at: now,
    updated_at: now
  };
}

function normalizeSourceQualityOpportunity(item, report, runId, now) {
  const source = clean(item.source || "non precise", 700) || "non precise";
  const topNeed = clean(item.top_need || "immeuble", 140) || "immeuble";
  const leads = Number(item.leads || 0);
  const sessions = Number(item.sessions || 0);
  const ctaClicks = Number(item.cta_clicks || 0);
  const urgencySelects = Number(item.urgency_selects || 0);
  const formStarts = Number(item.form_starts || 0);
  const submitAttempts = Number(item.submit_attempts || 0);
  const sourceStage = clean(item.source_stage || "", 80);
  const sourceStageLabel = clean(item.source_stage_label || "", 120);
  const sourceStageAction = clean(item.source_stage_action || "", 900);
  const score = Math.min(100, Math.max(78, Math.round(Number(item.quality_score || 0))));
  const queryPrefix = sourceStageLabel ? `${sourceStageLabel}: ` : "";
  const query = leads > 0
    ? `${queryPrefix}${leads} lead(s), ${item.hot_leads || 0} chaud(s), besoin ${topNeed}`
    : `${queryPrefix}${sessions} session(s), ${formStarts} start(s), ${ctaClicks} clic(s), ${urgencySelects} urgence(s), besoin ${topNeed}`;
  const recommendation = sourceStageAction || (leads > 0
    ? `Renforcer la source ${source}: maillage interne, contenus satellites, preuve locale et CTA devis sur le besoin ${topNeed}.`
    : `Transformer la source prometteuse ${source}: clarifier l'offre, remonter le CTA devis, creer un contenu satellite et suivre les starts formulaire sur le besoin ${topNeed}.`);
  return {
    id: `qualified-source-${stableHash(source)}`,
    run_id: runId,
    url: sourceUrl(source),
    query: clean(query, 240),
    opportunity_type: "qualified-source-growth",
    score,
    status: "open",
    recommendation: clean(recommendation, 900),
    payload: JSON.stringify({
      source: "local-seo-backlog-monitor",
      source_path: source,
      report_generated_at: report.generated_at || "",
      quality_basis: item.quality_basis || "",
      source_stage: sourceStage,
      source_stage_label: sourceStageLabel,
      leads,
      hot_leads: Number(item.hot_leads || 0),
      warm_leads: Number(item.warm_leads || 0),
      bridge_leads: Number(item.bridge_leads || 0),
      average_score: Number(item.average_score || 0),
      quality_score: Number(item.quality_score || 0),
      signal_score: Number(item.signal_score || 0),
      sessions,
      page_views: Number(item.page_views || 0),
      cta_clicks: ctaClicks,
      urgency_selects: urgencySelects,
      quote_router_continues: Number(item.quote_router_continues || 0),
      form_starts: formStarts,
      submit_attempts: submitAttempts,
      leads_created: Number(item.leads_created || 0),
      bridge_clicks: Number(item.bridge_clicks || 0),
      top_need: topNeed,
      value_label: item.value_label || "0 EUR/an"
    }),
    created_at: now,
    updated_at: now
  };
}

function sourceQualityOpportunities(report, runId, now) {
  if (!report || !Array.isArray(report.source_quality)) return [];
  return report.source_quality
    .filter((item) => Number(item.leads || 0) > 0 || Number(item.form_starts || 0) > 0 || Number(item.submit_attempts || 0) > 0 || Number(item.cta_clicks || 0) > 0 || Number(item.urgency_selects || 0) > 0 || Number(item.signal_score || 0) >= 30)
    .slice(0, 20)
    .map((item) => normalizeSourceQualityOpportunity(item, report, runId, now));
}

function metricRows(report, runId, now) {
  const summary = report.summary || {};
  const pairs = [
    ["page_views", summary.page_views],
    ["quote_router_views", summary.quote_router_views],
    ["quote_router_continues", summary.quote_router_continues],
    ["quote_continue_rate", summary.quote_continue_rate],
    ["cta_clicks", summary.cta_clicks],
    ["phone_clicks", summary.phone_clicks],
    ["form_starts", summary.form_starts],
    ["submit_attempts", summary.submit_attempts],
    ["submit_errors", summary.submit_errors],
    ["abandoned_forms", summary.abandoned_forms],
    ["leads_db", summary.leads_db],
    ["hot_leads_db", summary.hot_leads_db],
    ["page_to_form_rate", summary.page_to_form_rate],
    ["form_to_submit_rate", summary.form_to_submit_rate],
    ["submit_to_lead_rate", summary.submit_to_lead_rate],
    ["form_to_lead_rate", summary.form_to_lead_rate],
    ["recommendations", Array.isArray(report.recommendations) ? report.recommendations.length : 0]
  ];
  return pairs.map(([name, value]) => ({
    id: `${runId}-${name}`,
    run_id: runId,
    url: siteUrl("/admin.html"),
    metric_type: "conversion_funnel",
    metric_name: name,
    value: Number(value || 0),
    payload: JSON.stringify({ report_generated_at: report.generated_at || "", lookback_days: Number(summary.lookback_days || 0) }),
    created_at: now
  }));
}

function upsertRun(db, runId, report, count, now) {
  const summary = report.summary || {};
  db.prepare(`
    INSERT OR REPLACE INTO seo_runs (id, source, status, pages_checked, opportunities_count, payload, created_at)
    VALUES (?, 'local-conversion-funnel', 'completed', ?, ?, ?, ?)
  `)
    .bind(
      runId,
      Array.isArray(report.top_paths) ? report.top_paths.length : 0,
      count,
      JSON.stringify({
        report_generated_at: report.generated_at || "",
        lookback_days: Number(summary.lookback_days || 0),
        page_views: Number(summary.page_views || 0),
        form_starts: Number(summary.form_starts || 0),
        leads_db: Number(summary.leads_db || 0),
        attention_required: report.attention_required === true
      }),
      now
    )
    .run();
}

function upsertMetric(db, metric) {
  db.prepare(`
    INSERT OR REPLACE INTO seo_metrics (id, run_id, url, metric_type, metric_name, value, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(metric.id, metric.run_id, metric.url, metric.metric_type, metric.metric_name, metric.value, metric.payload, metric.created_at)
    .run();
}

function upsertOpportunity(db, opportunity) {
  db.prepare(`
    INSERT INTO seo_opportunities (id, run_id, url, query, opportunity_type, score, status, recommendation, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      run_id = excluded.run_id,
      url = excluded.url,
      query = excluded.query,
      opportunity_type = excluded.opportunity_type,
      score = excluded.score,
      status = 'open',
      recommendation = excluded.recommendation,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `)
    .bind(
      opportunity.id,
      opportunity.run_id,
      opportunity.url,
      opportunity.query,
      opportunity.opportunity_type,
      opportunity.score,
      opportunity.status,
      opportunity.recommendation,
      opportunity.payload,
      opportunity.created_at,
      opportunity.updated_at
    )
    .run();
}

function markStaleByType(db, typePattern, activeIds, now) {
  if (!activeIds.length) {
    return db.prepare("UPDATE seo_opportunities SET status = 'stale', updated_at = ? WHERE opportunity_type LIKE ?").bind(now, typePattern).run().meta.changes;
  }
  const placeholders = activeIds.map(() => "?").join(", ");
  return db
    .prepare(`UPDATE seo_opportunities SET status = 'stale', updated_at = ? WHERE opportunity_type LIKE ? AND id NOT IN (${placeholders})`)
    .bind(now, typePattern, ...activeIds)
    .run().meta.changes;
}

function run() {
  const dbPath = argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite")));
  const reportPath = resolve(argValue("--report", env("LOCAL_CONVERSION_FUNNEL_REPORT", join("reports", "local-conversion-funnel-report.json"))));
  const backlogReportPath = resolve(argValue("--backlog-report", env("LOCAL_SEO_BACKLOG_REPORT", join("reports", "local-seo-backlog-report.json"))));
  const out = resolve(argValue("--out", env("LOCAL_CONVERSION_ACTION_SYNC_REPORT", join("reports", "local-conversion-action-sync-report.json"))));
  const report = readJson(reportPath);
  const backlogReport = readOptionalJson(backlogReportPath);
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];
  const now = new Date().toISOString();
  const runId = runIdFor(report);
  const funnelOpportunities = recommendations.map((item) => normalizeOpportunity(item, report, runId, now));
  const qualifiedSourceOpportunities = sourceQualityOpportunities(backlogReport, runId, now);
  const opportunities = [...funnelOpportunities, ...qualifiedSourceOpportunities];
  const db = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  try {
    upsertRun(db, runId, report, opportunities.length, now);
    for (const metric of metricRows(report, runId, now)) upsertMetric(db, metric);
    for (const opportunity of opportunities) upsertOpportunity(db, opportunity);
    const staleConversionMarked = markStaleByType(db, "conversion-funnel-%", funnelOpportunities.map((item) => item.id), now);
    const staleQualifiedSourceMarked = markStaleByType(db, "qualified-source-growth", qualifiedSourceOpportunities.map((item) => item.id), now);
    const result = {
      success: true,
      generated_at: now,
      source_report: reportPath,
      backlog_report: backlogReportPath,
      backlog_report_loaded: Boolean(backlogReport),
      database: db.path,
      run_id: runId,
      opportunities_opened: opportunities.length,
      conversion_opportunities_opened: funnelOpportunities.length,
      qualified_source_opportunities_opened: qualifiedSourceOpportunities.length,
      opportunities_stale_marked: staleConversionMarked + staleQualifiedSourceMarked,
      conversion_opportunities_stale_marked: staleConversionMarked,
      qualified_source_opportunities_stale_marked: staleQualifiedSourceMarked,
      metrics_written: metricRows(report, runId, now).length,
      top_opportunity: opportunities[0] || null
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`Conversion action sync: ${opportunities.length} opportunity(s), ${staleConversionMarked + staleQualifiedSourceMarked} stale, ${qualifiedSourceOpportunities.length} qualified source(s), run ${runId}`);
    console.log(`Report: ${out}`);
  } finally {
    db.close();
  }
}

run();