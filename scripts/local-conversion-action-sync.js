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

function markStale(db, activeIds, now) {
  if (!activeIds.length) {
    return db.prepare(`UPDATE seo_opportunities SET status = 'stale', updated_at = ? WHERE opportunity_type LIKE 'conversion-funnel-%'`).bind(now).run().meta.changes;
  }
  const placeholders = activeIds.map(() => "?").join(", ");
  return db
    .prepare(`UPDATE seo_opportunities SET status = 'stale', updated_at = ? WHERE opportunity_type LIKE 'conversion-funnel-%' AND id NOT IN (${placeholders})`)
    .bind(now, ...activeIds)
    .run().meta.changes;
}

function run() {
  const dbPath = argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite")));
  const reportPath = resolve(argValue("--report", env("LOCAL_CONVERSION_FUNNEL_REPORT", join("reports", "local-conversion-funnel-report.json"))));
  const out = resolve(argValue("--out", env("LOCAL_CONVERSION_ACTION_SYNC_REPORT", join("reports", "local-conversion-action-sync-report.json"))));
  const report = readJson(reportPath);
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];
  const now = new Date().toISOString();
  const runId = runIdFor(report);
  const opportunities = recommendations.map((item) => normalizeOpportunity(item, report, runId, now));
  const db = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  try {
    upsertRun(db, runId, report, opportunities.length, now);
    for (const metric of metricRows(report, runId, now)) upsertMetric(db, metric);
    for (const opportunity of opportunities) upsertOpportunity(db, opportunity);
    const staleMarked = markStale(db, opportunities.map((item) => item.id), now);
    const result = {
      success: true,
      generated_at: now,
      source_report: reportPath,
      database: db.path,
      run_id: runId,
      opportunities_opened: opportunities.length,
      opportunities_stale_marked: staleMarked,
      metrics_written: metricRows(report, runId, now).length,
      top_opportunity: opportunities[0] || null
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`Conversion action sync: ${opportunities.length} opportunity(s), ${staleMarked} stale, run ${runId}`);
    console.log(`Report: ${out}`);
  } finally {
    db.close();
  }
}

run();