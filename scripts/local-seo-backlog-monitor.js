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

function tableExists(database, name) {
  const row = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return Boolean(row?.name);
}

function unitCount(value) {
  return Number.parseInt(String(value || "0").replace(/\D/g, ""), 10) || 0;
}

function leadValueEstimate(lead) {
  const score = Number(lead.lead_score || 0);
  const units = Math.max(1, unitCount(lead.units_count));
  const need = clean(lead.need, 80);
  const profile = clean(lead.profile, 80);
  const propertyType = clean(lead.property_type, 80);
  let base = 260;
  if (["multirisque-immeuble", "copropriete", "audit-contrat"].includes(need)) base = 520;
  if (["rc-syndic", "dommages-ouvrage"].includes(need)) base = 620;
  if (["pno", "cno", "pno-cno"].includes(need) || ["lot-copropriete", "logement-vacant", "logement-loue"].includes(propertyType)) base = units <= 2 ? 190 : 260;
  if (["local-commercial", "commerce", "mixte"].includes(propertyType)) base += 180;
  if (["sci", "administrateur-biens", "syndic-professionnel"].includes(profile)) base += 160;
  const min = Math.round(Math.max(180, base + Math.max(0, units - 1) * 135));
  const max = Math.round(min * (score >= 85 ? 1.75 : score >= 70 ? 1.55 : 1.35));
  return { min, max };
}

function valueLabel(min, max) {
  if (!max) return "0 EUR/an";
  return `${Math.round(min)}-${Math.round(max)} EUR/an`;
}

function sourceQualityScore(row) {
  return Math.round(
    Number(row.hot_leads || 0) * 38 +
    Number(row.warm_leads || 0) * 18 +
    Number(row.leads || 0) * 8 +
    Number(row.average_score || 0) +
    Math.min(Number(row.value_max || 0) / 100, 120)
  );
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

function sourceQualityRows(database, limit) {
  if (!tableExists(database, "leads") || !tableExists(database, "lead_events")) return [];
  const rows = database
    .prepare(`
      SELECT
        l.reference,
        l.source,
        l.page_url,
        l.need,
        l.profile,
        l.property_type,
        l.units_count,
        l.lead_score,
        COALESCE(NULLIF(CASE WHEN json_valid(le.payload) THEN json_extract(le.payload, '$.source_path') ELSE NULL END, ''), '') AS source_path,
        COALESCE(NULLIF(CASE WHEN json_valid(le.payload) THEN json_extract(le.payload, '$.landing_path') ELSE NULL END, ''), '') AS landing_path,
        COALESCE(NULLIF(CASE WHEN json_valid(le.payload) THEN json_extract(le.payload, '$.content_bridge') ELSE NULL END, ''), '') AS content_bridge
      FROM leads l
      LEFT JOIN lead_events le ON le.id = (
        SELECT le2.id
        FROM lead_events le2
        WHERE le2.lead_id = l.id AND le2.event_type = 'lead_created'
        ORDER BY le2.created_at DESC, le2.id DESC
        LIMIT 1
      )
      WHERE l.created_at >= datetime('now', '-30 days')
      ORDER BY l.created_at DESC
      LIMIT 500
    `)
    .all();
  const map = new Map();
  for (const lead of rows) {
    const source = clean(lead.source_path || lead.landing_path || lead.page_url || lead.source || "non precise", 500) || "non precise";
    const score = Number(lead.lead_score || 0);
    const current = map.get(source) || { source, leads: 0, hot_leads: 0, warm_leads: 0, bridge_leads: 0, score_total: 0, value_min: 0, value_max: 0, needs: new Map() };
    const value = leadValueEstimate(lead);
    const need = clean(lead.need || "non precise", 120) || "non precise";
    current.leads += 1;
    if (score >= 80) current.hot_leads += 1;
    if (score >= 65 && score < 80) current.warm_leads += 1;
    if (clean(lead.content_bridge, 20) === "1") current.bridge_leads += 1;
    current.score_total += score;
    current.value_min += value.min;
    current.value_max += value.max;
    current.needs.set(need, (current.needs.get(need) || 0) + 1);
    map.set(source, current);
  }
  return [...map.values()]
    .map((row) => {
      const average_score = row.leads ? Math.round((row.score_total / row.leads) * 10) / 10 : 0;
      const topNeed = [...row.needs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      const normalized = {
        source: row.source,
        leads: row.leads,
        hot_leads: row.hot_leads,
        warm_leads: row.warm_leads,
        bridge_leads: row.bridge_leads,
        average_score,
        top_need: topNeed ? topNeed[0] : "non precise",
        value_min: row.value_min,
        value_max: row.value_max,
        value_label: valueLabel(row.value_min, row.value_max)
      };
      return { ...normalized, quality_score: sourceQualityScore(normalized) };
    })
    .sort((a, b) => b.quality_score - a.quality_score || b.hot_leads - a.hot_leads || b.leads - a.leads || a.source.localeCompare(b.source))
    .slice(0, limit);
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

function summaryFrom(statusRows, topRows, conversionRows, stale, sourceQuality) {
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
    qualified_source_count: sourceQuality.length,
    top_qualified_source: sourceQuality[0]?.source || "",
    top_qualified_source_score: Number(sourceQuality[0]?.quality_score || 0),
    top_qualified_source_leads: Number(sourceQuality[0]?.leads || 0),
    oldest_open_days: topRows.length ? Math.max(...topRows.map((row) => Number(row.age_days || 0))) : 0,
    average_open_score: topRows.length ? Math.round(topRows.reduce((sum, row) => sum + Number(row.score || 0), 0) / topRows.length) : 0
  };
}

function recommendations(summary, topRows, staleRowsList, conversionRows, sourceQuality) {
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
  if (summary.qualified_source_count > 0) {
    const top = sourceQuality[0];
    actions.push({
      type: "qualified-source-growth",
      severity: Number(top?.quality_score || 0) >= 120 ? "high" : "medium",
      signal: `${top?.leads || 0} lead(s), ${top?.hot_leads || 0} chaud(s), score ${top?.quality_score || 0}`,
      action: `Renforcer la source ${top?.source || "non precise"}: maillage interne, contenus satellites, preuve locale et CTA devis sur le besoin ${top?.top_need || "immeuble"}.`,
      url: top?.source || "admin/attribution",
      score: Math.min(96, Math.max(78, Number(top?.quality_score || 0)))
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
    const sourceQuality = sourceQualityRows(database, Math.min(maxRows, 20));
    const summary = summaryFrom(statusRows, topRows, conversionRows, stale, sourceQuality);
    const report = {
      success: true,
      attention_required: summary.critical_open > 0 || summary.conversion_open > 0 || summary.old_open > 0 || summary.top_qualified_source_score >= 80,
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
      source_quality: sourceQuality.slice(0, 20),
      old_open: stale.slice(0, 20),
      recommendations: recommendations(summary, topRows, stale, conversionRows, sourceQuality)
    };

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`SEO backlog monitor: ${summary.open_opportunities} open, ${summary.critical_open} critical, ${summary.conversion_open} conversion, ${summary.qualified_source_count} qualified source(s), ${summary.old_open} old.`);
    console.log(`Report: ${out}`);
  } finally {
    database.close();
  }
}

run();
