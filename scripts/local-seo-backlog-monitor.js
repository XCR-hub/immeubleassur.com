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

function sourceSignalScore(row) {
  const score =
    Number(row.sessions || 0) * 2 +
    Number(row.page_views || 0) * 0.5 +
    Number(row.cta_clicks || 0) * 10 +
    Number(row.quote_router_continues || 0) * 12 +
    Number(row.bridge_clicks || 0) * 14 +
    Number(row.urgency_selects || 0) * 16 +
    Number(row.form_starts || 0) * 24 +
    Number(row.submit_attempts || 0) * 30 +
    Number(row.leads_created || 0) * 42 -
    Number(row.submit_errors || 0) * 10 -
    Number(row.abandoned_forms || 0) * 4;
  return Math.max(0, Math.round(score));
}

function sourceQualityScore(row) {
  return Math.round(
    Number(row.hot_leads || 0) * 38 +
    Number(row.warm_leads || 0) * 18 +
    Number(row.leads || 0) * 8 +
    Number(row.average_score || 0) +
    Math.min(Number(row.value_max || 0) / 100, 120) +
    Number(row.signal_score || 0)
  );
}

function sourcePath(value) {
  const raw = clean(value, 700);
  if (!raw) return "/";
  if (/^(mailto:|tel:|javascript:)/i.test(raw)) return "/";
  try {
    const parsed = new URL(raw, "https://immeubleassur.com");
    if (parsed.hostname && !parsed.hostname.endsWith("immeubleassur.com")) return raw;
    return `${parsed.pathname || "/"}${parsed.search || ""}`;
  } catch {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

function actionableSource(source) {
  const value = clean(source, 700).toLowerCase();
  if (!value) return false;
  return !value.includes("/admin") && !value.includes("/api/") && !value.includes("/health") && !value.includes("/merci");
}

function intentFromSource(source) {
  const value = clean(source, 700).toLowerCase();
  if (value.includes("cno")) return "cno";
  if (value.includes("pno")) return "pno";
  if (value.includes("copro")) return "copropriete";
  if (value.includes("sci")) return "sci";
  if (value.includes("sinistre")) return "sinistre";
  if (value.includes("travaux") || value.includes("renovation")) return "travaux";
  if (value.includes("local-commercial") || value.includes("commerce")) return "local-commercial";
  if (value.includes("prix") || value.includes("tarif") || value.includes("comparateur")) return "prix";
  if (value.includes("devis")) return "devis";
  return "immeuble";
}

function normalizedNeed(value, source) {
  const raw = clean(value, 120);
  const lower = raw.toLowerCase();
  if (!raw) return intentFromSource(source);
  if (raw.length > 42 || lower.includes("|") || lower.includes("immeubleassur") || lower.includes("devis gratuit")) return intentFromSource(source);
  return raw;
}
function sourceStage(row) {
  const leads = Number(row.leads || 0) + Number(row.leads_created || 0);
  const submitAttempts = Number(row.submit_attempts || 0);
  const formStarts = Number(row.form_starts || 0);
  const ctaSignals = Number(row.cta_clicks || 0) + Number(row.quote_router_continues || 0) + Number(row.bridge_clicks || 0);
  const urgencySelects = Number(row.urgency_selects || 0);
  const sessions = Number(row.sessions || 0);
  const pageViews = Number(row.page_views || 0);
  if (leads > 0) return { key: "lead-growth", label: "Leads a amplifier", severity: "high" };
  if (submitAttempts > 0) return { key: "submit-without-lead", label: "Envois sans lead", severity: "critical" };
  if (formStarts > 0) return { key: "start-without-submit", label: "Formulaire bloque", severity: "high" };
  if (urgencySelects > 0) return { key: "urgency-without-start", label: "Urgence sans formulaire", severity: "high" };
  if (ctaSignals > 0) return { key: "click-without-start", label: "Clics sans formulaire", severity: "medium" };
  if (sessions >= 20 || pageViews >= 20) return { key: "traffic-without-click", label: "Trafic sans clic", severity: "medium" };
  return { key: "signal-watch", label: "Signal a surveiller", severity: "low" };
}

function sourceStageAction(row) {
  const source = clean(row.source || "source", 700) || "source";
  const need = normalizedNeed(row.top_need, source) || "immeuble";
  const stage = row.source_stage || sourceStage(row).key;
  if (stage === "lead-growth") return `Amplifier ${source}: creer des liens internes depuis les pages proches, renforcer la preuve locale et pousser un CTA devis sur ${need}.`;
  if (stage === "submit-without-lead") return `Corriger ${source}: tester l'envoi complet, verifier Turnstile/validation/API et simplifier le bloc formulaire pour ${need}.`;
  if (stage === "start-without-submit") return `Debloquer ${source}: reduire la friction formulaire, afficher les champs obligatoires restants et proposer l'appel direct sur ${need}.`;
  if (stage === "urgency-without-start") return `Transformer l'urgence de ${source}: rendre le bouton devis prioritaire apres choix urgence, conserver le pre-remplissage ${need} et proposer rappel express.`;
  if (stage === "click-without-start") return `Transformer les clics de ${source}: aligner le bouton avec le formulaire, pre-remplir le besoin ${need} et rapprocher le module devis.`;
  if (stage === "traffic-without-click") return `Transformer le trafic de ${source}: remonter un CTA devis au premier ecran, ajouter une preuve metier et clarifier l'offre ${need}.`;
  return `Surveiller ${source}: accumuler plus de signaux avant d'ouvrir une action lourde.`;
}

function applySourceStage(row) {
  const stage = sourceStage(row);
  const enriched = { ...row, source_stage: stage.key, source_stage_label: stage.label, source_stage_severity: stage.severity };
  return { ...enriched, source_stage_action: sourceStageAction(enriched) };
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

function leadSourceQualityRows(database, limit) {
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
        value_label: valueLabel(row.value_min, row.value_max),
        sessions: 0,
        page_views: 0,
        cta_clicks: 0,
        quote_router_continues: 0,
        form_starts: 0,
        submit_attempts: 0,
        submit_errors: 0,
        abandoned_forms: 0,
        leads_created: 0,
        bridge_clicks: 0,
        urgency_selects: 0,
        signal_score: 0,
        quality_basis: "leads"
      };
      return applySourceStage({ ...normalized, quality_score: sourceQualityScore(normalized) });
    })
    .sort((a, b) => b.quality_score - a.quality_score || b.hot_leads - a.hot_leads || b.leads - a.leads || a.source.localeCompare(b.source))
    .slice(0, limit);
}

function eventSourceQualityRows(database, limit) {
  if (!tableExists(database, "site_events")) return [];
  const rows = database
    .prepare(`
      SELECT
        COALESCE(
          NULLIF(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.source_path') ELSE NULL END, ''),
          NULLIF(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.landing_path') ELSE NULL END, ''),
          NULLIF(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.path') ELSE NULL END, ''),
          page_url,
          '/'
        ) AS source,
        COALESCE(
          NULLIF(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.intent') ELSE NULL END, ''),
          NULLIF(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.target') ELSE NULL END, ''),
          target,
          ''
        ) AS intent,
        COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), id)) AS sessions,
        SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
        SUM(CASE WHEN event_type IN ('cta_click', 'phone_click', 'email_click', 'traffic_without_click_quote_click', 'traffic_without_click_phone_click') THEN 1 ELSE 0 END) AS cta_clicks,
        SUM(CASE WHEN event_type = 'quote_router_continue' THEN 1 ELSE 0 END) AS quote_router_continues,
        SUM(CASE WHEN event_type = 'form_start' THEN 1 ELSE 0 END) AS form_starts,
        SUM(CASE WHEN event_type = 'form_submit_attempt' THEN 1 ELSE 0 END) AS submit_attempts,
        SUM(CASE WHEN event_type = 'lead_submit_error' THEN 1 ELSE 0 END) AS submit_errors,
        SUM(CASE WHEN event_type = 'lead_form_abandoned' THEN 1 ELSE 0 END) AS abandoned_forms,
        SUM(CASE WHEN event_type = 'lead_created' THEN 1 ELSE 0 END) AS leads_created,
        SUM(CASE WHEN event_type = 'content_lead_bridge_shown' THEN 1 ELSE 0 END) AS bridge_shown,
        SUM(CASE WHEN event_type IN ('content_lead_bridge_quote_click', 'content_lead_bridge_phone_click') THEN 1 ELSE 0 END) AS bridge_clicks,
        SUM(CASE WHEN event_type = 'traffic_without_click_urgency_select' THEN 1 ELSE 0 END) AS urgency_selects
      FROM site_events
      WHERE created_at >= datetime('now', '-30 days')
        AND event_type IN ('page_view', 'cta_click', 'phone_click', 'email_click', 'traffic_without_click_shown', 'traffic_without_click_quote_click', 'traffic_without_click_phone_click', 'traffic_without_click_dismissed', 'traffic_without_click_urgency_select', 'quote_router_continue', 'form_start', 'form_submit_attempt', 'lead_submit_error', 'lead_form_abandoned', 'lead_created', 'content_lead_bridge_shown', 'content_lead_bridge_quote_click', 'content_lead_bridge_phone_click')
      GROUP BY source, intent
      ORDER BY leads_created DESC, submit_attempts DESC, form_starts DESC, urgency_selects DESC, cta_clicks DESC, sessions DESC
      LIMIT 1200
    `)
    .all();
  const map = new Map();
  for (const row of rows) {
    const source = sourcePath(row.source);
    if (!actionableSource(source)) continue;
    const current = map.get(source) || {
      source,
      sessions: 0,
      page_views: 0,
      cta_clicks: 0,
      quote_router_continues: 0,
      form_starts: 0,
      submit_attempts: 0,
      submit_errors: 0,
      abandoned_forms: 0,
      leads_created: 0,
      bridge_clicks: 0,
      urgency_selects: 0,
      needs: new Map()
    };
    const intent = normalizedNeed(row.intent, source);
    current.sessions += Number(row.sessions || 0);
    current.page_views += Number(row.page_views || 0);
    current.cta_clicks += Number(row.cta_clicks || 0);
    current.quote_router_continues += Number(row.quote_router_continues || 0);
    current.form_starts += Number(row.form_starts || 0);
    current.submit_attempts += Number(row.submit_attempts || 0);
    current.submit_errors += Number(row.submit_errors || 0);
    current.abandoned_forms += Number(row.abandoned_forms || 0);
    current.leads_created += Number(row.leads_created || 0);
    current.bridge_clicks += Number(row.bridge_clicks || 0);
    current.urgency_selects += Number(row.urgency_selects || 0);
    const intentWeight = Number(row.form_starts || 0) * 3 + Number(row.submit_attempts || 0) * 4 + Number(row.cta_clicks || 0) + Number(row.urgency_selects || 0) * 2 + Number(row.sessions || 0);
    current.needs.set(intent, (current.needs.get(intent) || 0) + Math.max(1, intentWeight));
    map.set(source, current);
  }
  return [...map.values()]
    .map((row) => {
      const topNeed = [...row.needs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      const normalized = {
        source: row.source,
        leads: 0,
        hot_leads: 0,
        warm_leads: 0,
        bridge_leads: 0,
        average_score: 0,
        top_need: topNeed ? topNeed[0] : intentFromSource(row.source),
        value_min: 0,
        value_max: 0,
        value_label: "0 EUR/an",
        sessions: row.sessions,
        page_views: row.page_views,
        cta_clicks: row.cta_clicks,
        quote_router_continues: row.quote_router_continues,
        form_starts: row.form_starts,
        submit_attempts: row.submit_attempts,
        submit_errors: row.submit_errors,
        abandoned_forms: row.abandoned_forms,
        leads_created: row.leads_created,
        bridge_clicks: row.bridge_clicks,
        urgency_selects: row.urgency_selects,
        quality_basis: "event-signals"
      };
      normalized.signal_score = sourceSignalScore(normalized);
      return applySourceStage({ ...normalized, quality_score: sourceQualityScore(normalized) });
    })
    .filter((row) => row.signal_score >= 20 || row.form_starts > 0 || row.cta_clicks > 0 || row.urgency_selects > 0 || row.submit_attempts > 0)
    .sort((a, b) => b.quality_score - a.quality_score || b.form_starts - a.form_starts || b.urgency_selects - a.urgency_selects || b.cta_clicks - a.cta_clicks || a.source.localeCompare(b.source))
    .slice(0, limit);
}

function mergeSourceQualityRows(leadRows, eventRows, limit) {
  const map = new Map();
  for (const row of [...leadRows, ...eventRows]) {
    const source = sourcePath(row.source);
    if (!actionableSource(source)) continue;
    const current = map.get(source) || {
      source,
      leads: 0,
      hot_leads: 0,
      warm_leads: 0,
      bridge_leads: 0,
      score_total: 0,
      value_min: 0,
      value_max: 0,
      sessions: 0,
      page_views: 0,
      cta_clicks: 0,
      quote_router_continues: 0,
      form_starts: 0,
      submit_attempts: 0,
      submit_errors: 0,
      abandoned_forms: 0,
      leads_created: 0,
      bridge_clicks: 0,
      urgency_selects: 0,
      signal_score: 0,
      needs: new Map(),
      bases: new Set()
    };
    const leads = Number(row.leads || 0);
    current.leads += leads;
    current.hot_leads += Number(row.hot_leads || 0);
    current.warm_leads += Number(row.warm_leads || 0);
    current.bridge_leads += Number(row.bridge_leads || 0);
    current.score_total += Number(row.average_score || 0) * leads;
    current.value_min += Number(row.value_min || 0);
    current.value_max += Number(row.value_max || 0);
    current.sessions += Number(row.sessions || 0);
    current.page_views += Number(row.page_views || 0);
    current.cta_clicks += Number(row.cta_clicks || 0);
    current.quote_router_continues += Number(row.quote_router_continues || 0);
    current.form_starts += Number(row.form_starts || 0);
    current.submit_attempts += Number(row.submit_attempts || 0);
    current.submit_errors += Number(row.submit_errors || 0);
    current.abandoned_forms += Number(row.abandoned_forms || 0);
    current.leads_created += Number(row.leads_created || 0);
    current.bridge_clicks += Number(row.bridge_clicks || 0);
    current.urgency_selects += Number(row.urgency_selects || 0);
    current.signal_score += Number(row.signal_score || 0);
    const basis = clean(row.quality_basis || (leads ? "leads" : "event-signals"), 40);
    if (basis) current.bases.add(basis);
    const need = normalizedNeed(row.top_need, source);
    const needWeight = leads * 5 + Number(row.form_starts || 0) * 3 + Number(row.submit_attempts || 0) * 4 + Number(row.cta_clicks || 0) + Number(row.urgency_selects || 0) * 2 + Number(row.sessions || 0);
    current.needs.set(need, (current.needs.get(need) || 0) + Math.max(1, needWeight));
    map.set(source, current);
  }
  return [...map.values()]
    .map((row) => {
      const topNeed = [...row.needs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      const normalized = {
        source: row.source,
        leads: row.leads,
        hot_leads: row.hot_leads,
        warm_leads: row.warm_leads,
        bridge_leads: row.bridge_leads,
        average_score: row.leads ? Math.round((row.score_total / row.leads) * 10) / 10 : 0,
        top_need: topNeed ? topNeed[0] : intentFromSource(row.source),
        value_min: row.value_min,
        value_max: row.value_max,
        value_label: valueLabel(row.value_min, row.value_max),
        sessions: row.sessions,
        page_views: row.page_views,
        cta_clicks: row.cta_clicks,
        quote_router_continues: row.quote_router_continues,
        form_starts: row.form_starts,
        submit_attempts: row.submit_attempts,
        submit_errors: row.submit_errors,
        abandoned_forms: row.abandoned_forms,
        leads_created: row.leads_created,
        bridge_clicks: row.bridge_clicks,
        urgency_selects: row.urgency_selects,
        signal_score: row.signal_score,
        quality_basis: row.bases.has("leads") && row.bases.has("event-signals") ? "leads+event-signals" : [...row.bases][0] || "event-signals"
      };
      return applySourceStage({ ...normalized, quality_score: sourceQualityScore(normalized) });
    })
    .filter((row) => row.leads > 0 || row.signal_score >= 20 || row.form_starts > 0 || row.cta_clicks > 0 || row.urgency_selects > 0 || row.submit_attempts > 0)
    .sort((a, b) => b.quality_score - a.quality_score || b.hot_leads - a.hot_leads || b.form_starts - a.form_starts || b.urgency_selects - a.urgency_selects || b.leads - a.leads || a.source.localeCompare(b.source))
    .slice(0, limit);
}

function sourceQualityRows(database, limit) {
  const leadRows = leadSourceQualityRows(database, Math.max(limit * 2, 20));
  const eventRows = eventSourceQualityRows(database, Math.max(limit * 3, 60));
  return mergeSourceQualityRows(leadRows, eventRows, limit);
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
    top_qualified_source_sessions: Number(sourceQuality[0]?.sessions || 0),
    top_qualified_source_urgency_selects: Number(sourceQuality[0]?.urgency_selects || 0),
    top_qualified_source_basis: sourceQuality[0]?.quality_basis || "",
    top_qualified_source_stage: sourceQuality[0]?.source_stage || "",
    top_qualified_source_stage_label: sourceQuality[0]?.source_stage_label || "",
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
    const leads = Number(top?.leads || 0);
    const signal = leads > 0
      ? `${leads} lead(s), ${top?.hot_leads || 0} chaud(s), score ${top?.quality_score || 0}`
      : `${top?.sessions || 0} session(s), ${top?.form_starts || 0} start(s), ${top?.cta_clicks || 0} clic(s), ${top?.urgency_selects || 0} urgence(s), score ${top?.quality_score || 0}`;
    const action = top?.source_stage_action || (leads > 0
      ? `Renforcer la source ${top?.source || "non precise"}: maillage interne, contenus satellites, preuve locale et CTA devis sur le besoin ${top?.top_need || "immeuble"}.`
      : `Transformer la source prometteuse ${top?.source || "non precise"}: clarifier l'offre, remonter le CTA devis et creer un contenu satellite sur le besoin ${top?.top_need || "immeuble"}.`);
    actions.push({
      type: "qualified-source-growth",
      severity: top?.source_stage_severity || (Number(top?.quality_score || 0) >= 120 ? "high" : "medium"),
      signal: top?.source_stage_label ? `${top.source_stage_label}: ${signal}` : signal,
      action,
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
