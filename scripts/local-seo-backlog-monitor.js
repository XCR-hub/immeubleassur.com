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

function clean(value, max = 600) {
  return String(value || "").trim().slice(0, max);
}

function rowsByStatus(database) {
  return database
    .prepare(`
      SELECT
        status,
        COUNT(*) AS count,
        SUM(CASE WHEN score >= 90 THEN 1 ELSE 0 END) AS critical_count,
        SUM(CASE WHEN score >= 80 AND score < 90 THEN 1 ELSE 0 END) AS high_count,
        COALESCE(AVG(score), 0) AS average_score,
        MIN(created_at) AS oldest_created_at,
        MAX(updated_at) AS latest_updated_at
      FROM seo_opportunities
      GROUP BY status
      ORDER BY count DESC
    `)
    .all();
}

function rowsByType(database) {
  return database
    .prepare(`
      SELECT
        opportunity_type,
        COUNT(*) AS count,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
        MAX(score) AS max_score,
        MAX(updated_at) AS latest_updated_at
      FROM seo_opportunities
      GROUP BY opportunity_type
      ORDER BY open_count DESC, max_score DESC
      LIMIT 20
    `)
    .all();
}

function topOpen(database, limit) {
  return database
    .prepare(`
      SELECT id, url, query, opportunity_type, score, status, recommendation, created_at, updated_at
      FROM seo_opportunities
      WHERE status = 'open'
      ORDER BY score DESC, updated_at ASC
      LIMIT ?
    `)
    .all(limit)
    .map((row) => ({
      id: clean(row.id, 120),
      url: clean(row.url, 700),
      query: clean(row.query, 240),
      opportunity_type: clean(row.opportunity_type, 120),
      score: Number(row.score || 0),
      status: clean(row.status, 40),
      recommendation: clean(row.recommendation, 900),
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
      age_days: ageDays(row.created_at)
    }));
}

function conversionOpen(database, limit) {
  return database
    .prepare(`
      SELECT id, url, query, opportunity_type, score, status, recommendation, created_at, updated_at
      FROM seo_opportunities
      WHERE status = 'open' AND opportunity_type LIKE 'conversion-funnel-%'
      ORDER BY score DESC, updated_at ASC
      LIMIT ?
    `)
    .all(limit)
    .map((row) => ({
      id: clean(row.id, 120),
      url: clean(row.url, 700),
      query: clean(row.query, 240),
      opportunity_type: clean(row.opportunity_type, 120),
      score: Number(row.score || 0),
      status: clean(row.status, 40),
      recommendation: clean(row.recommendation, 900),
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
      age_days: ageDays(row.created_at)
    }));
}

function staleRows(database, days, limit) {
  return database
    .prepare(`
      SELECT id, url, query, opportunity_type, score, status, recommendation, created_at, updated_at
      FROM seo_opportunities
      WHERE status = 'open' AND created_at <= datetime('now', ?)
      ORDER BY score DESC, created_at ASC
      LIMIT ?
    `)
    .all(`-${days} days`, limit)
    .map((row) => ({
      id: clean(row.id, 120),
      url: clean(row.url, 700),
      query: clean(row.query, 240),
      opportunity_type: clean(row.opportunity_type, 120),
      score: Number(row.score || 0),
      status: clean(row.status, 40),
      recommendation: clean(row.recommendation, 900),
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
      age_days: ageDays(row.created_at)
    }));
}

function ageDays(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return null;
  return Math.round(Math.max(0, Date.now() - timestamp) / 8640000) / 10;
}

function summaryFrom(statusRows, topRows, conversionRows, stale) {
  const open = statusRows.find((row) => row.status === "open");
  const staleStatus = statusRows.find((row) => row.status === "stale");
  const total = statusRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  return {
    total_opportunities: total,
    open_opportunities: Number(open?.count || 0),
    stale_opportunities: Number(staleStatus?.count || 0),
    critical_open: topRows.filter((row) => row.score >= 90).length,
    high_open: topRows.filter((row) => row.score >= 80 && row.score < 90).length,
    conversion_open: conversionRows.length,
    old_open: stale.length,
    oldest_open_days: topRows.length ? Math.max(...topRows.map((row) => Number(row.age_days || 0))) : 0,
    average_open_score: topRows.length ? Math.round(topRows.reduce((sum, row) => sum + Number(row.score || 0), 0) / topRows.length) : 0
  };
}

function recommendations(summary, topRows, staleRowsList, conversionRows) {
  const actions = [];
  if (summary.critical_open > 0) {
    const top = topRows.find((row) => row.score >= 90);
    actions.push({
      type: "critical-backlog",
      severity: "critical",
      signal: `${summary.critical_open} opportunite(s) score 90+`,
      action: top?.recommendation || "Traiter les opportunites critiques du backlog SEO/CRO.",
      url: top?.url || "admin/seo",
      score: 100
    });
  }
  if (summary.conversion_open > 0) {
    const top = conversionRows[0];
    actions.push({
      type: "conversion-funnel-open",
      severity: "high",
      signal: `${summary.conversion_open} fuite(s) conversion ouverte(s)`,
      action: top?.recommendation || "Corriger la fuite du tunnel de conversion la mieux scoree.",
      url: top?.url || "admin/seo",
      score: 92
    });
  }
  if (summary.old_open > 0) {
    const top = staleRowsList[0];
    actions.push({
      type: "old-open-opportunities",
      severity: "medium",
      signal: `${summary.old_open} action(s) ouverte(s) trop ancienne(s)`,
      action: top?.recommendation || "Requalifier les actions ouvertes anciennes: traiter, fermer ou declasser.",
      url: top?.url || "admin/content",
      score: 78
    });
  }
  if (!actions.length) {
    actions.push({
      type: "backlog-ok",
      severity: "low",
      signal: "aucun retard critique",
      action: "Continuer a importer les signaux SEO/CRO et traiter les actions selon le score.",
      url: "admin/seo",
      score: 50
    });
  }
  return actions.sort((a, b) => b.score - a.score).slice(0, 8);
}

function run() {
  const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
  const out = resolve(argValue("--out", env("LOCAL_SEO_BACKLOG_REPORT", join("reports", "local-seo-backlog-report.json"))));
  const maxRows = numberValue(argValue("--max-rows", env("LOCAL_SEO_BACKLOG_MAX_ROWS", "50")), 50);
  const staleDays = numberValue(argValue("--stale-days", env("LOCAL_SEO_BACKLOG_STALE_DAYS", "14")), 14);

  if (!existsSync(dbPath)) throw new Error(`Base SQLite introuvable: ${dbPath}`);
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const statusRows = rowsByStatus(database);
    const typeRows = rowsByType(database);
    const topRows = topOpen(database, maxRows);
    const conversionRows = conversionOpen(database, maxRows);
    const stale = staleRows(database, staleDays, maxRows);
    const summary = summaryFrom(statusRows, topRows, conversionRows, stale);
    const report = {
      success: true,
      attention_required: summary.critical_open > 0 || summary.conversion_open > 0 || summary.old_open > 0,
      generated_at: new Date().toISOString(),
      database: { path: dbPath, mode: "sqlite-readonly" },
      thresholds: { stale_days: staleDays, max_rows: maxRows },
      summary,
      status_breakdown: statusRows.map((row) => ({
        status: row.status || "",
        count: Number(row.count || 0),
        critical_count: Number(row.critical_count || 0),
        high_count: Number(row.high_count || 0),
        average_score: Math.round(Number(row.average_score || 0)),
        oldest_created_at: row.oldest_created_at || "",
        latest_updated_at: row.latest_updated_at || ""
      })),
      type_breakdown: typeRows.map((row) => ({
        opportunity_type: row.opportunity_type || "",
        count: Number(row.count || 0),
        open_count: Number(row.open_count || 0),
        max_score: Number(row.max_score || 0),
        latest_updated_at: row.latest_updated_at || ""
      })),
      top_open: topRows.slice(0, 20),
      conversion_open: conversionRows.slice(0, 20),
      old_open: stale.slice(0, 20),
      recommendations: recommendations(summary, topRows, stale, conversionRows)
    };

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`SEO backlog monitor: ${summary.open_opportunities} open, ${summary.critical_open} critical, ${summary.conversion_open} conversion, ${summary.old_open} old.`);
    console.log(`Report: ${out}`);
  } finally {
    database.close();
  }
}

run();
