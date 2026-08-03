import { adminRequestAllowed } from "../../_shared/admin-auth.js";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function authorized(request, env) { return adminRequestAllowed(request, env); }

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
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

function rowsOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function errorOf(value) {
  return value && value.error ? value.error : "";
}

function pct(part, total) {
  const denominator = Number(total || 0);
  if (!denominator) return 0;
  return Math.round((Number(part || 0) / denominator) * 1000) / 10;
}

function unitCount(value) {
  return Number.parseInt(String(value || "0").replace(/\D/g, ""), 10) || 0;
}

function valueEstimate(lead) {
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

function sourceKey(row = {}) {
  const source = clean(row.utm_source || row.source, 120).toLowerCase();
  const medium = clean(row.utm_medium, 120).toLowerCase();
  const referrer = clean(row.referrer || row.first_referrer, 500).toLowerCase();
  if (source) return medium ? `${source} / ${medium}` : source;
  if (referrer.includes("google.")) return "google / organic";
  if (referrer.includes("bing.")) return "bing / organic";
  if (referrer.includes("linkedin.")) return "linkedin / referral";
  if (referrer.includes("facebook.") || referrer.includes("instagram.")) return "meta / social";
  if (referrer) return "referral";
  return "direct / none";
}

function pathFromUrl(value) {
  const raw = clean(value, 700);
  if (!raw) return "/";
  try {
    const url = raw.startsWith("http") ? new URL(raw) : new URL(raw, "https://immeubleassur.com");
    return `${url.pathname || "/"}${url.search || ""}`.slice(0, 500);
  } catch {
    return raw.replace(/^https?:\/\/(www\.)?immeubleassur\.com/i, "").slice(0, 500) || "/";
  }
}

function addMetric(map, key, mutator) {
  const cleanKey = clean(key || "non precise", 500) || "non precise";
  const current = map.get(cleanKey) || {
    key: cleanKey,
    page_views: 0,
    cta_clicks: 0,
    form_starts: 0,
    form_abandons: 0,
    submit_attempts: 0,
    leads: 0,
    hot_leads: 0,
    avg_score_total: 0,
    value_min: 0,
    value_max: 0
  };
  mutator(current);
  map.set(cleanKey, current);
}

function sourceQualityScore(row) {
  return Math.round(
    Number(row.hot_leads || 0) * 35 +
    Number(row.leads || 0) * 12 +
    Number(row.lead_rate || 0) * 2 +
    Number(row.start_rate || 0) +
    Math.min(Number(row.value_max || 0) / 100, 120)
  );
}

function rowsFromMap(map, limit = 20) {
  return [...map.values()]
    .map((row) => {
      const enriched = {
        ...row,
        avg_score: row.leads ? Math.round((row.avg_score_total / row.leads) * 10) / 10 : 0,
        cta_rate: pct(row.cta_clicks, row.page_views),
        start_rate: pct(row.form_starts, row.page_views),
        abandon_rate: pct(row.form_abandons, row.form_starts),
        lead_rate: pct(row.leads, row.form_starts),
        value_label: row.value_max ? `${Math.round(row.value_min)}-${Math.round(row.value_max)} EUR/an` : "0 EUR/an"
      };
      return { ...enriched, quality_score: sourceQualityScore(enriched) };
    })
    .sort((a, b) => Number(b.value_max || 0) - Number(a.value_max || 0) || Number(b.leads || 0) - Number(a.leads || 0) || Number(b.form_starts || 0) - Number(a.form_starts || 0))
    .slice(0, limit);
}

function sourceQualityRows(map, limit = 10) {
  return rowsFromMap(map, 80)
    .filter((row) => Number(row.leads || 0) > 0 || Number(row.form_starts || 0) > 0)
    .sort((a, b) => Number(b.quality_score || 0) - Number(a.quality_score || 0) || Number(b.hot_leads || 0) - Number(a.hot_leads || 0) || Number(b.leads || 0) - Number(a.leads || 0))
    .slice(0, limit);
}

function buildAttribution({ events, leads }) {
  const sources = new Map();
  const landingPages = new Map();
  const needs = new Map();
  const campaigns = new Map();
  const paths = new Map();

  for (const event of events) {
    const type = clean(event.event_type, 80);
    const source = sourceKey(event);
    const landing = pathFromUrl(event.landing_page || event.page_url);
    const path = pathFromUrl(event.path || event.page_url);
    const campaign = clean(event.utm_campaign || "sans campagne", 180) || "sans campagne";
    const target = clean(event.target || "non precise", 180) || "non precise";

    const apply = (row) => {
      if (type === "page_view") row.page_views += Number(event.count || 0);
      if (["cta_click", "phone_click", "email_click"].includes(type)) row.cta_clicks += Number(event.count || 0);
      if (type === "form_start") row.form_starts += Number(event.count || 0);
      if (type === "lead_form_abandoned") row.form_abandons += Number(event.count || 0);
      if (type === "form_submit_attempt") row.submit_attempts += Number(event.count || 0);
    };
    addMetric(sources, source, apply);
    addMetric(landingPages, landing, apply);
    addMetric(campaigns, campaign, apply);
    addMetric(paths, path, apply);
    addMetric(needs, target, apply);
  }

  for (const lead of leads) {
    const source = sourceKey(lead);
    const landing = pathFromUrl(lead.landing_path || lead.landing_page || lead.page_url);
    const path = pathFromUrl(lead.source_path || lead.page_url);
    const campaign = clean(lead.utm_campaign || "sans campagne", 180) || "sans campagne";
    const need = clean(lead.need || "non precise", 120) || "non precise";
    const value = valueEstimate(lead);
    const score = Number(lead.lead_score || 0);
    const apply = (row) => {
      row.leads += 1;
      if (score >= 80) row.hot_leads += 1;
      row.avg_score_total += score;
      row.value_min += value.min;
      row.value_max += value.max;
    };
    addMetric(sources, source, apply);
    addMetric(landingPages, landing, apply);
    addMetric(campaigns, campaign, apply);
    addMetric(paths, path, apply);
    addMetric(needs, need, apply);
  }

  return {
    sources: rowsFromMap(sources, 20),
    source_quality: sourceQualityRows(sources, 10),
    landing_pages: rowsFromMap(landingPages, 25),
    campaigns: rowsFromMap(campaigns, 20),
    paths: rowsFromMap(paths, 25),
    needs: rowsFromMap(needs, 20)
  };
}

function buildSummary(attribution, totals) {
  const topSource = attribution.sources[0] || null;
  const topQualitySource = attribution.source_quality?.[0] || null;
  const topLanding = attribution.landing_pages[0] || null;
  const topNeed = attribution.needs[0] || null;
  return {
    page_views_30d: Number(totals?.page_views || 0),
    form_starts_30d: Number(totals?.form_starts || 0),
    form_abandons_30d: Number(totals?.form_abandons || 0),
    leads_30d: Number(totals?.leads || 0),
    hot_leads_30d: Number(totals?.hot_leads || 0),
    visitor_to_lead_rate: pct(totals?.leads, totals?.page_views),
    form_abandon_rate: pct(totals?.form_abandons, totals?.form_starts),
    form_to_lead_rate: pct(totals?.leads, totals?.form_starts),
    top_source: topSource?.key || "-",
    top_source_value: topSource?.value_label || "0 EUR/an",
    top_quality_source: topQualitySource?.key || "-",
    top_quality_source_signal: topQualitySource ? `${topQualitySource.quality_score} pts, ${topQualitySource.hot_leads || 0} chaud(s), ${topQualitySource.value_label}` : "-",
    top_landing_page: topLanding?.key || "-",
    top_need: topNeed?.key || "-"
  };
}

function buildActions(attribution, summary) {
  const actions = [];
  const topSource = attribution.sources[0];
  const qualitySource = attribution.source_quality?.[0];
  const topLanding = attribution.landing_pages[0];
  const weakLanding = attribution.landing_pages.find((row) => Number(row.form_starts || 0) >= 3 && Number(row.leads || 0) === 0);
  const abandonLanding = attribution.landing_pages.find((row) => Number(row.form_abandons || 0) >= 3 && Number(row.abandon_rate || 0) >= 40);
  const abandonPath = attribution.paths.find((row) => Number(row.form_abandons || 0) >= 3 && Number(row.abandon_rate || 0) >= 40);
  const strongNeed = attribution.needs.find((row) => Number(row.leads || 0) > 0 && Number(row.avg_score || 0) >= 70);
  const lowStartPath = attribution.paths.find((row) => Number(row.page_views || 0) >= 20 && Number(row.form_starts || 0) === 0);
  const paidNoLead = attribution.campaigns.find((row) => row.key !== "sans campagne" && Number(row.submit_attempts || 0) > 0 && Number(row.leads || 0) === 0);

  if (topSource && Number(topSource.leads || 0) > 0) {
    actions.push({
      priority: 94,
      type: "source-gagnante",
      target: topSource.key,
      signal: `${topSource.leads} lead(s), ${topSource.value_label}`,
      recommendation: "Renforcer le contenu, les liens internes et les CTA proches de cette source car elle porte deja de la valeur."
    });
  }
  if (qualitySource && qualitySource.key !== topSource?.key && Number(qualitySource.leads || 0) > 0) {
    actions.push({
      priority: 92,
      type: "source-qualifiee",
      target: qualitySource.key,
      signal: `${qualitySource.quality_score} pts, ${qualitySource.hot_leads || 0} chaud(s), ${qualitySource.value_label}`,
      recommendation: "Prioriser cette source dans les relances SEO et les contenus satellites car elle combine qualite lead, valeur et taux de transformation."
    });
  }
  if (topLanding && Number(topLanding.value_max || 0) > 0) {
    actions.push({
      priority: 90,
      type: "landing-gagnante",
      target: topLanding.key,
      signal: `${topLanding.leads} lead(s), taux form ${topLanding.start_rate}%`,
      recommendation: "Dupliquer les preuves, FAQ et CTA de cette landing vers les pages voisines a meme intention."
    });
  }
  if (weakLanding) {
    actions.push({
      priority: 88,
      type: "landing-friction",
      target: weakLanding.key,
      signal: `${weakLanding.form_starts} depart(s), 0 lead`,
      recommendation: "Verifier les champs bloquants, le message de reassurance et la promesse de rappel sur cette page."
    });
  }
  if (abandonLanding) {
    actions.push({
      priority: 89,
      type: "abandon-formulaire",
      target: abandonLanding.key,
      signal: `${abandonLanding.form_abandons} abandon(s), ${abandonLanding.abandon_rate}% abandon/start`,
      recommendation: "Reduire la friction visible: rassurance rappel, champs optionnels repousses, message anti-robot clair et CTA telephone proche du formulaire."
    });
  }
  if (abandonPath && abandonPath.key !== abandonLanding?.key) {
    actions.push({
      priority: 87,
      type: "page-abandon",
      target: abandonPath.key,
      signal: `${abandonPath.form_abandons} abandon(s), ${abandonPath.abandon_rate}% abandon/start`,
      recommendation: "Tester une version plus courte du formulaire ou un pre-remplissage par intention sur cette page."
    });
  }
  if (strongNeed) {
    actions.push({
      priority: 82,
      type: "besoin-rentable",
      target: strongNeed.key,
      signal: `${strongNeed.leads} lead(s), score ${strongNeed.avg_score}`,
      recommendation: "Prioriser articles, FAQ et pages locales autour de ce besoin car il produit des demandes qualifiees."
    });
  }
  if (lowStartPath) {
    actions.push({
      priority: 78,
      type: "trafic-sans-formulaire",
      target: lowStartPath.key,
      signal: `${lowStartPath.page_views} vues, 0 start`,
      recommendation: "Ajouter un CTA plus visible, un module diagnostic ou un lien vers devis adapte."
    });
  }
  if (paidNoLead) {
    actions.push({
      priority: 86,
      type: "campagne-a-controler",
      target: paidNoLead.key,
      signal: `${paidNoLead.submit_attempts} tentative(s), 0 lead`,
      recommendation: "Verifier tracking, promesse publicitaire, formulaire et qualite du trafic avant d'augmenter le budget."
    });
  }
  if (!Number(summary.leads_30d || 0) && Number(summary.form_starts_30d || 0) > 0) {
    actions.push({
      priority: 84,
      type: "conversion-globale",
      target: "formulaire",
      signal: `${summary.form_starts_30d} start(s), 0 lead`,
      recommendation: "Verifier immediatement validation, filtre local, API leads et message d'erreur."
    });
  }

  if (Number(summary.form_abandons_30d || 0) >= 5 && Number(summary.form_abandon_rate || 0) >= 40) {
    actions.push({
      priority: 85,
      type: "abandon-global",
      target: "formulaire",
      signal: `${summary.form_abandons_30d} abandon(s), ${summary.form_abandon_rate}% abandon/start`,
      recommendation: "Controler le formulaire mobile, la vitesse, Turnstile, les erreurs de validation et le texte de confiance avant d'acheter plus de trafic."
    });
  }

  return actions.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)).slice(0, 20);
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);

  const [eventRows, leadRows, totals] = await Promise.all([
    safeAll(env, `SELECT event_type, page_url, target, COALESCE(NULLIF(json_extract(payload, '$.path'), ''), '') AS path, COALESCE(NULLIF(json_extract(payload, '$.landing_page'), ''), '') AS landing_page, COALESCE(NULLIF(json_extract(payload, '$.first_referrer'), ''), '') AS first_referrer, COALESCE(NULLIF(json_extract(payload, '$.utm_source'), ''), '') AS utm_source, COALESCE(NULLIF(json_extract(payload, '$.utm_medium'), ''), '') AS utm_medium, COALESCE(NULLIF(json_extract(payload, '$.utm_campaign'), ''), '') AS utm_campaign, COUNT(*) AS count FROM site_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_type, page_url, target, path, landing_page, first_referrer, utm_source, utm_medium, utm_campaign ORDER BY count DESC LIMIT 600`),
    safeAll(env, `SELECT l.reference, l.source, l.page_url, l.referrer, l.need, l.profile, l.property_type, l.units_count, l.lead_score, l.created_at, COALESCE(NULLIF(json_extract(le.payload, '$.utm.utm_source'), ''), '') AS utm_source, COALESCE(NULLIF(json_extract(le.payload, '$.utm.utm_medium'), ''), '') AS utm_medium, COALESCE(NULLIF(json_extract(le.payload, '$.utm.utm_campaign'), ''), '') AS utm_campaign, COALESCE(NULLIF(json_extract(le.payload, '$.utm.landing_page'), ''), '') AS landing_page, COALESCE(NULLIF(json_extract(le.payload, '$.landing_path'), ''), '') AS landing_path, COALESCE(NULLIF(json_extract(le.payload, '$.source_path'), ''), '') AS source_path, COALESCE(NULLIF(json_extract(le.payload, '$.utm.first_referrer'), ''), '') AS first_referrer FROM leads l LEFT JOIN lead_events le ON le.id = (SELECT le2.id FROM lead_events le2 WHERE le2.lead_id = l.id AND le2.event_type = 'lead_created' ORDER BY le2.created_at DESC, le2.id DESC LIMIT 1) WHERE l.created_at >= datetime('now', '-30 days') ORDER BY l.created_at DESC LIMIT 250`),
    safeFirst(env, `SELECT (SELECT COUNT(*) FROM site_events WHERE event_type = 'page_view' AND created_at >= datetime('now', '-30 days')) AS page_views, (SELECT COUNT(*) FROM site_events WHERE event_type = 'form_start' AND created_at >= datetime('now', '-30 days')) AS form_starts, (SELECT COUNT(*) FROM site_events WHERE event_type = 'lead_form_abandoned' AND created_at >= datetime('now', '-30 days')) AS form_abandons, (SELECT COUNT(*) FROM leads WHERE created_at >= datetime('now', '-30 days')) AS leads, (SELECT COUNT(*) FROM leads WHERE lead_score >= 80 AND created_at >= datetime('now', '-30 days')) AS hot_leads`)
  ]);

  const attribution = buildAttribution({
    events: rowsOrEmpty(eventRows),
    leads: rowsOrEmpty(leadRows)
  });
  const cleanTotals = totals && !totals.error ? totals : {};
  const summary = buildSummary(attribution, cleanTotals);

  return json({
    success: true,
    generated_at: new Date().toISOString(),
    summary,
    attribution,
    actions: buildActions(attribution, summary),
    privacy: "Donnees agregees par source, page, campagne et besoin; aucun contact nominatif n'est retourne.",
    warnings: [errorOf(eventRows), errorOf(leadRows), errorOf(totals)].filter(Boolean)
  });
}
