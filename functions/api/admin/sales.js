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
  return (request.headers.get("Authorization") || "") === `Bearer ${expected}`;
}

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

function unitCount(value) {
  return Number.parseInt(String(value || "0").replace(/\D/g, ""), 10) || 0;
}

function leadValueEstimate(lead, score = 0) {
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
  const band = max >= 9000 ? "portfolio" : max >= 3500 ? "immeuble-prioritaire" : max >= 1200 ? "immeuble-standard" : "lot-pno-cno";
  return {
    annual_premium_min: min,
    annual_premium_max: max,
    band,
    label: `${min}-${max} EUR/an`
  };
}

function priorityFromScore(score) {
  if (score >= 85) return "hot";
  if (score >= 70) return "warm";
  if (score >= 45) return "standard";
  return "low";
}

function slaHoursFor(score, valueEstimate, urgency = null) {
  const maxValue = Number(valueEstimate?.annual_premium_max || 0);
  let base = 48;
  if (score >= 85 || maxValue >= 9000) base = 2;
  else if (score >= 70 || maxValue >= 3500) base = 6;
  else if (score >= 45 || maxValue >= 1200) base = 24;
  return urgency?.sla_hours ? Math.min(base, urgency.sla_hours) : base;
}

function leadUrgency(lead = {}) {
  const text = `${lead.message || ""} ${lead.need || ""} ${lead.property_type || ""} ${lead.source || ""} ${lead.page_url || ""}`.toLowerCase();
  const units = unitCount(lead.units_count);
  if (/sinistre|degat|resili|refus|mise en demeure|sans assurance|urgent|aujourd|demain|echeance proche/.test(text)) {
    return { level: "immediate", label: "Urgence immediate", reason: "sinistre/resiliation/echeance", sla_hours: 2 };
  }
  if (/echeance|preavis|travaux|chantier|ravalement|toiture|dommages-ouvrage|local-commercial/.test(text) || units >= 10) {
    return { level: "this-month", label: "A traiter ce mois-ci", reason: "echeance/travaux/immeuble multi-lots", sla_hours: 6 };
  }
  if (/prix|tarif|comparateur|devis|audit|veille/.test(text)) {
    return { level: "quote-ready", label: "Devis a cadrer", reason: "comparaison/prix/audit", sla_hours: 24 };
  }
  return { level: "standard", label: "Qualification standard", reason: "information minimale", sla_hours: 48 };
}

function hoursSince(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, (Date.now() - timestamp) / 3600000);
}

function isOpenStatus(status) {
  return !["won", "lost", "archived"].includes(clean(status || "new", 40));
}

function followUpDueFor(lead) {
  const status = clean(lead.status || "new", 40);
  if (!isOpenStatus(status)) return false;
  const score = Number(lead.lead_score || 0);
  const priority = priorityFromScore(score);
  const urgency = leadUrgency(lead);
  const createdAge = hoursSince(lead.created_at);
  const updatedAge = hoursSince(lead.updated_at || lead.created_at);
  if (status === "new" && urgency.level === "immediate") return createdAge >= 2;
  if (status === "new" && urgency.level === "this-month") return createdAge >= 6;
  if (status === "new" && priority === "hot") return createdAge >= 2;
  if (status === "new" && priority === "warm") return createdAge >= 6;
  if (status === "new" && priority === "standard") return createdAge >= 24;
  if (status === "new") return createdAge >= 48;
  if (status === "contacted") return updatedAge >= 24;
  if (status === "quoted") return updatedAge >= 72;
  return false;
}

function dueInHours(lead, slaHours) {
  const status = clean(lead.status || "new", 40);
  const basis = status === "new" ? lead.created_at : (lead.updated_at || lead.created_at);
  const age = hoursSince(basis);
  const target = status === "contacted" ? 24 : status === "quoted" ? 72 : slaHours;
  return Math.round((target - age) * 10) / 10;
}

function nextActionFor(lead, score) {
  const need = clean(lead.need, 80);
  const profile = clean(lead.profile, 80);
  const propertyType = clean(lead.property_type, 80);
  const units = unitCount(lead.units_count);
  const message = clean(lead.message, 2200).toLowerCase();
  const urgency = leadUrgency(lead);

  if (urgency.level === "immediate") return "Rappeler en urgence: verifier sinistre, resiliation, absence de couverture ou echeance proche.";
  if (/dossier pret assureur|pieces disponibles/i.test(message) && !/pieces disponibles:\s*aucune piece/i.test(message)) return "Reprendre les pieces deja disponibles puis demander uniquement les manquants.";
  if (score >= 85) return "Rappeler en priorite, confirmer echeance, contrat actuel, prime et sinistres 36 mois.";
  if (["pno", "cno", "pno-cno"].includes(need) || propertyType === "lot-copropriete") return "Verifier occupation du lot, contrat immeuble et assurance occupant.";
  if (units >= 10 || ["syndic-professionnel", "administrateur-biens"].includes(profile)) return "Demander tableau lots, sinistralite, prime actuelle, travaux prevus et mandat.";
  if (profile === "sci") return "Identifier les biens SCI, contrats existants, echeances et lots disperses.";
  return "Completer echeance, assureur actuel, surface, lots et sinistres avant consultation.";
}

function callScriptFor(lead, valueEstimate, slaHours) {
  const need = clean(lead.need || "immeuble", 80);
  const city = clean(lead.city || "votre immeuble", 120);
  const units = clean(lead.units_count || "", 40);
  const value = valueEstimate?.label || "a qualifier";
  const urgency = leadUrgency(lead);
  const intro = `Bonjour ${clean(lead.name, 80) || ""}, je vous appelle d'ImmeubleAssur au sujet de votre demande ${need} a ${city}.`;
  const qualifier = units
    ? `Je valide rapidement les ${units} lot(s), l'echeance, la prime actuelle et les sinistres 36 mois pour consulter les assureurs adaptes.`
    : "Je valide rapidement les lots, l'echeance, la prime actuelle et les sinistres 36 mois pour consulter les assureurs adaptes.";
  return `${intro} ${qualifier} Potentiel estime ${value}; ${urgency.label.toLowerCase()}; rappel cible ${slaHours}h.`;
}

function emailDraftFor(lead, valueEstimate) {
  const city = clean(lead.city || "votre immeuble", 120);
  return {
    subject: `Votre devis assurance immeuble - ${city}`,
    body: [
      `Bonjour ${clean(lead.name, 80) || ""},`,
      "",
      "Merci pour votre demande ImmeubleAssur. Pour comparer rapidement les garanties adaptees, pouvez-vous me confirmer:",
      "- contrat actuel ou appel de prime",
      "- echeance et preavis",
      "- nombre de lots, surface et usage du batiment",
      "- sinistres sur les 36 derniers mois",
      "",
      `Estimation de prime a cadrer: ${valueEstimate?.label || "selon dossier"}.`,
      "",
      "Bien cordialement,",
      "L'equipe ImmeubleAssur"
    ].join("\n")
  };
}

function enrichLead(lead) {
  const score = Number(lead.lead_score || 0);
  const valueEstimate = leadValueEstimate(lead, score);
  const urgency = leadUrgency(lead);
  const slaHours = slaHoursFor(score, valueEstimate, urgency);
  const dueIn = dueInHours(lead, slaHours);
  const due = followUpDueFor(lead);
  const priority = priorityFromScore(score);
  const status = clean(lead.status || "new", 40);
  const action = nextActionFor(lead, score);
  const email = emailDraftFor(lead, valueEstimate);
  return {
    reference: lead.reference,
    name: clean(lead.name, 120),
    phone: clean(lead.phone, 80),
    email: clean(lead.email, 180),
    city: clean(lead.city, 120),
    need: clean(lead.need, 80),
    profile: clean(lead.profile, 80),
    property_type: clean(lead.property_type, 80),
    units_count: clean(lead.units_count, 40),
    score,
    priority,
    status,
    assigned_to: clean(lead.assigned_to, 120),
    created_at: lead.created_at,
    updated_at: lead.updated_at,
    page_url: clean(lead.page_url, 500),
    source: clean(lead.source, 120),
    due,
    due_in_hours: dueIn,
    due_label: due ? `${Math.abs(dueIn)}h de retard` : `${Math.max(0, dueIn)}h restantes`,
    value_estimate: valueEstimate,
    sla_hours: slaHours,
    urgency,
    lead_urgency: urgency.level,
    lead_urgency_reason: urgency.reason,
    next_action: action,
    call_script: callScriptFor(lead, valueEstimate, slaHours),
    email_subject: email.subject,
    email_body: email.body
  };
}

function valueLabel(min, max) {
  if (!max) return "0 EUR/an";
  return `${Math.round(min)}-${Math.round(max)} EUR/an`;
}

function buildSummary(leads, statusRows, eventRows) {
  let dueNow = 0;
  let due24h = 0;
  let hot = 0;
  let unassigned = 0;
  let valueMin = 0;
  let valueMax = 0;
  let dueValueMin = 0;
  let dueValueMax = 0;
  let portfolio = 0;

  for (const lead of leads) {
    if (!isOpenStatus(lead.status)) continue;
    valueMin += Number(lead.value_estimate?.annual_premium_min || 0);
    valueMax += Number(lead.value_estimate?.annual_premium_max || 0);
    if (lead.priority === "hot") hot += 1;
    if (!lead.assigned_to) unassigned += 1;
    if (lead.value_estimate?.band === "portfolio") portfolio += 1;
    if (lead.due) {
      dueNow += 1;
      dueValueMin += Number(lead.value_estimate?.annual_premium_min || 0);
      dueValueMax += Number(lead.value_estimate?.annual_premium_max || 0);
    } else if (Number(lead.due_in_hours || 0) <= 24) {
      due24h += 1;
    }
  }

  return {
    open_leads: leads.filter((lead) => isOpenStatus(lead.status)).length,
    due_now: dueNow,
    due_24h: due24h,
    hot_open: hot,
    unassigned_open: unassigned,
    portfolio_open: portfolio,
    pipeline_value: { annual_premium_min: valueMin, annual_premium_max: valueMax, label: valueLabel(valueMin, valueMax) },
    due_value: { annual_premium_min: dueValueMin, annual_premium_max: dueValueMax, label: valueLabel(dueValueMin, dueValueMax) },
    statuses: statusRows,
    recent_events: eventRows
  };
}

function buildActions({ leads, quoteRows, needRows, cityRows }) {
  const actions = [];
  const dueLeads = leads.filter((lead) => lead.due);
  const topDue = dueLeads[0];
  const hotUnassigned = leads.find((lead) => lead.priority === "hot" && !lead.assigned_to && isOpenStatus(lead.status));
  const topValue = leads.find((lead) => isOpenStatus(lead.status) && Number(lead.value_estimate?.annual_premium_max || 0) >= 3500);
  const staleQuotes = quoteRows.filter((row) => Number(row.count || 0) > 0);
  const topNeed = needRows[0];
  const topCity = cityRows[0];

  if (topDue) {
    actions.push({
      priority: 100,
      type: "relance-sla",
      target: topDue.reference,
      signal: `${dueLeads.length} relance(s) en retard`,
      recommendation: `Traiter ${topDue.reference}: ${topDue.next_action}`
    });
  }
  if (hotUnassigned) {
    actions.push({
      priority: 96,
      type: "assignation-hot",
      target: hotUnassigned.reference,
      signal: "lead chaud sans pilote",
      recommendation: "Assigner un responsable avant rappel pour eviter la perte de delai."
    });
  }
  if (topValue) {
    actions.push({
      priority: 90,
      type: "valeur-pipeline",
      target: topValue.reference,
      signal: topValue.value_estimate?.label || "valeur haute",
      recommendation: "Preparer une consultation assureurs avec contrat, sinistres, lots, surfaces et travaux."
    });
  }
  if (staleQuotes.length) {
    actions.push({
      priority: 86,
      type: "devis-a-suivre",
      target: "quote_requests",
      signal: `${staleQuotes.reduce((sum, row) => sum + Number(row.count || 0), 0)} devis en attente`,
      recommendation: "Relancer les assureurs et noter les retours pour accelerer le taux de transformation."
    });
  }
  if (topNeed) {
    actions.push({
      priority: 74,
      type: "besoin-commercial",
      target: topNeed.need || "non precise",
      signal: `${topNeed.count || 0} lead(s), score ${Math.round(topNeed.avg_score || 0)}`,
      recommendation: "Aligner le script de rappel et les pieces demandees sur ce besoin dominant."
    });
  }
  if (topCity) {
    actions.push({
      priority: 70,
      type: "zone-commerciale",
      target: topCity.city || "non precise",
      signal: `${topCity.count || 0} lead(s)`,
      recommendation: "Prioriser les relances locales et renforcer ensuite le maillage SEO de cette zone."
    });
  }

  return actions.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)).slice(0, 20);
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  if (!env.DB) return json({ success: false, error: "Base SQLite indisponible" }, 503);

  const [
    leadRows,
    statusRows,
    eventRows,
    quoteRows,
    needRows,
    cityRows
  ] = await Promise.all([
    safeAll(env, `SELECT reference, name, phone, email, profile, property_type, city, units_count, need, message, lead_score, status, assigned_to, source, page_url, created_at, updated_at FROM leads WHERE created_at >= datetime('now', '-90 days') ORDER BY created_at DESC LIMIT 200`),
    safeAll(env, `SELECT status, COUNT(*) AS count, COALESCE(AVG(lead_score), 0) AS avg_score FROM leads WHERE created_at >= datetime('now', '-90 days') GROUP BY status ORDER BY count DESC`),
    safeAll(env, `SELECT event_type, COUNT(*) AS count, MAX(created_at) AS last_seen FROM lead_events WHERE created_at >= datetime('now', '-30 days') GROUP BY event_type ORDER BY last_seen DESC LIMIT 20`),
    safeAll(env, `SELECT response_status, COUNT(*) AS count, MIN(requested_at) AS oldest_requested_at FROM quote_requests WHERE response_status IN ('pending', 'sent') GROUP BY response_status ORDER BY count DESC`),
    safeAll(env, `SELECT COALESCE(NULLIF(need, ''), 'non precise') AS need, COUNT(*) AS count, COALESCE(AVG(lead_score), 0) AS avg_score FROM leads WHERE created_at >= datetime('now', '-90 days') GROUP BY need ORDER BY count DESC, avg_score DESC LIMIT 12`),
    safeAll(env, `SELECT COALESCE(NULLIF(city, ''), 'non precise') AS city, COUNT(*) AS count, COALESCE(AVG(lead_score), 0) AS avg_score FROM leads WHERE created_at >= datetime('now', '-90 days') GROUP BY city ORDER BY count DESC, avg_score DESC LIMIT 12`)
  ]);

  const leads = rowsOrEmpty(leadRows).map(enrichLead).sort((a, b) => {
    if (a.due !== b.due) return a.due ? -1 : 1;
    return Number(b.value_estimate?.annual_premium_max || 0) - Number(a.value_estimate?.annual_premium_max || 0);
  });

  const visibleLeads = leads.filter((lead) => isOpenStatus(lead.status)).slice(0, 80);
  const cleanStatusRows = rowsOrEmpty(statusRows);
  const cleanEventRows = rowsOrEmpty(eventRows);
  const cleanQuoteRows = rowsOrEmpty(quoteRows);
  const cleanNeedRows = rowsOrEmpty(needRows);
  const cleanCityRows = rowsOrEmpty(cityRows);

  return json({
    success: true,
    generated_at: new Date().toISOString(),
    summary: buildSummary(visibleLeads, cleanStatusRows, cleanEventRows),
    relance_leads: visibleLeads,
    quote_followups: cleanQuoteRows,
    needs: cleanNeedRows,
    cities: cleanCityRows,
    sales_actions: buildActions({ leads: visibleLeads, quoteRows: cleanQuoteRows, needRows: cleanNeedRows, cityRows: cleanCityRows }),
    warnings: [errorOf(leadRows), errorOf(statusRows), errorOf(eventRows), errorOf(quoteRows), errorOf(needRows), errorOf(cityRows)].filter(Boolean)
  });
}
