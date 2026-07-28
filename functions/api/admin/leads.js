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

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

const allowedStatuses = new Set(["new", "contacted", "quoted", "won", "lost", "archived"]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

async function logLeadEvent(env, leadId, eventType, payload, createdAt) {
  await env.DB.prepare(
    `INSERT INTO lead_events (id, lead_id, event_type, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), leadId, eventType, JSON.stringify(payload), createdAt)
    .run();
}

function addReason(reasons, label) {
  if (!reasons.includes(label) && reasons.length < 8) reasons.push(label);
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
    label: `${min}-${max} EUR/an`,
    basis: `${units} lot(s), ${need || "besoin non precise"}`
  };
}

function slaHoursFor(score, valueEstimate) {
  const maxValue = Number(valueEstimate?.annual_premium_max || 0);
  if (score >= 85 || maxValue >= 9000) return 2;
  if (score >= 70 || maxValue >= 3500) return 6;
  if (score >= 45 || maxValue >= 1200) return 24;
  return 48;
}

function priorityFromScore(score) {
  if (score >= 85) return "hot";
  if (score >= 70) return "warm";
  if (score >= 45) return "standard";
  return "low";
}

function readinessTextOf(value) {
  return clean(value, 2400).toLowerCase();
}

function hasPreparedDossier(value) {
  const text = readinessTextOf(value);
  return /dossier pret assureur|pieces disponibles/i.test(text) && !/pieces disponibles:\s*aucune piece/i.test(text);
}

function readinessSignalCount(value) {
  const text = readinessTextOf(value);
  return ["contrat actuel", "appel de prime", "sinistres 36 mois", "nombre de lots", "echeance", "travaux prevus"].filter((item) => text.includes(item)).length;
}

function nextActionFor(lead, score) {
  const need = clean(lead.need, 80);
  const profile = clean(lead.profile, 80);
  const propertyType = clean(lead.property_type, 80);
  const units = unitCount(lead.units_count);

  if (hasPreparedDossier(lead.message || "")) return "Reprendre les pieces disponibles, demander les manquants puis consulter les assureurs adaptes.";
  if (score >= 85) return "Rappeler en priorite et demander contrat actuel, echeance, sinistres 36 mois.";
  if (["pno", "cno", "pno-cno"].includes(need) || propertyType === "lot-copropriete") {
    return "Verifier occupation du lot, contrat immeuble copropriete et assurance occupant.";
  }
  if (units >= 10 || ["syndic-professionnel", "administrateur-biens"].includes(profile)) {
    return "Demander tableau lots, sinistralite, prime actuelle et travaux prevus.";
  }
  if (profile === "sci") return "Identifier portefeuille SCI, lots disperses et contrats deja en place.";
  return "Rappeler pour completer echeance, assureur actuel, surface et sinistres.";
}

function qualifyLead(lead) {
  let score = 20;
  const reasons = [];
  const units = unitCount(lead.units_count);
  const need = clean(lead.need, 80);
  const profile = clean(lead.profile, 80);
  const propertyType = clean(lead.property_type, 80);
  const source = clean(lead.source, 80);
  const readinessText = `${lead.message || ""} ${source}`;
  const readinessSignals = readinessSignalCount(readinessText);

  if (units >= 2) {
    score += 8;
    addReason(reasons, "plusieurs lots");
  }
  if (units >= 10) {
    score += 20;
    addReason(reasons, "immeuble multi-lots");
  }
  if (units >= 40) {
    score += 20;
    addReason(reasons, "portefeuille important");
  }
  if (["syndic-professionnel", "administrateur-biens", "sci"].includes(profile)) {
    score += 15;
    addReason(reasons, "profil professionnel ou SCI");
  }
  if (["multirisque-immeuble", "copropriete", "audit-contrat"].includes(need)) {
    score += 10;
    addReason(reasons, "besoin immeuble qualifie");
  }
  if (["pno", "cno", "pno-cno"].includes(need)) {
    score += 18;
    addReason(reasons, "intention PNO/CNO");
  }
  if (["lot-copropriete", "logement-vacant", "logement-loue", "local-commercial"].includes(propertyType)) {
    score += 12;
    addReason(reasons, "situation du bien exploitable");
  }
  if (/pno|cno|coproprietaire|non.?occupant/i.test(`${lead.message || ""} ${source}`)) {
    score += 10;
    addReason(reasons, "mot-cle PNO/CNO detecte");
  }
  if (hasPreparedDossier(readinessText)) {
    score += 12;
    addReason(reasons, "dossier assureur prepare");
  }
  if (readinessSignals >= 3) {
    score += 8;
    addReason(reasons, "pieces assureur disponibles");
  }
  if (lead.message && lead.message.length > 40) {
    score += 10;
    addReason(reasons, "message detaille");
  }

  const persistedScore = Number(lead.lead_score);
  score = Number.isFinite(persistedScore) ? persistedScore : Math.min(score, 100);
  score = Math.min(score, 100);
  const valueEstimate = leadValueEstimate(lead, score);
  return {
    score,
    priority: priorityFromScore(score),
    reasons,
    value_estimate: valueEstimate,
    sla_hours: slaHoursFor(score, valueEstimate),
    next_action: nextActionFor(lead, score)
  };
}

function hoursSince(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, (Date.now() - timestamp) / 3600000);
}

function isOpenStatus(status) {
  return !["won", "lost", "archived"].includes(clean(status || "new", 40));
}

function followUpDueFor(lead, qualification = qualifyLead(lead)) {
  const status = clean(lead.status || "new", 40);
  if (!isOpenStatus(status)) return false;
  const createdAge = hoursSince(lead.created_at);
  const updatedAge = hoursSince(lead.updated_at || lead.created_at);
  if (status === "new" && qualification.priority === "hot") return createdAge >= 2;
  if (status === "new" && qualification.priority === "warm") return createdAge >= 6;
  if (status === "new" && qualification.priority === "standard") return createdAge >= 24;
  if (status === "new") return createdAge >= 48;
  if (status === "contacted") return updatedAge >= 24;
  if (status === "quoted") return updatedAge >= 72;
  return false;
}

function increment(map, key) {
  const cleanKey = clean(key || "non precise", 120) || "non precise";
  map.set(cleanKey, (map.get(cleanKey) || 0) + 1);
}

function valueLabel(min, max) {
  if (!max) return "0 EUR/an";
  return `${Math.round(min)}-${Math.round(max)} EUR/an`;
}

function topFromMap(map) {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 6);
}

function summarizeLeads(leads) {
  const priority_counts = { hot: 0, warm: 0, standard: 0, low: 0 };
  const needs = new Map();
  const cities = new Map();
  let scoreTotal = 0;
  let oldestHot = "";
  let followup_due_count = 0;
  let unassigned_open_count = 0;
  let pipelineValueMin = 0;
  let pipelineValueMax = 0;
  let followupValueMin = 0;
  let followupValueMax = 0;
  let sla_2h_count = 0;
  let topValueLead = null;

  for (const lead of leads) {
    const q = lead.qualification || qualifyLead(lead);
    const priority = q.priority || "standard";
    priority_counts[priority] = (priority_counts[priority] || 0) + 1;
    scoreTotal += Number(q.score || 0);
    const valueEstimate = q.value_estimate || leadValueEstimate(lead, q.score || 0);
    if (isOpenStatus(lead.status)) {
      pipelineValueMin += Number(valueEstimate.annual_premium_min || 0);
      pipelineValueMax += Number(valueEstimate.annual_premium_max || 0);
      if (Number(q.sla_hours || 48) <= 2) sla_2h_count += 1;
      if (!topValueLead || Number(valueEstimate.annual_premium_max || 0) > Number(topValueLead.value_estimate?.annual_premium_max || 0)) {
        topValueLead = { reference: lead.reference, city: lead.city, need: lead.need, value_estimate: valueEstimate, priority };
      }
    }
    increment(needs, lead.need);
    increment(cities, lead.city);
    if (priority === "hot" && lead.status === "new") {
      if (!oldestHot || String(lead.created_at || "") < oldestHot) oldestHot = lead.created_at || "";
    }
    if (followUpDueFor(lead, q)) {
      followup_due_count += 1;
      followupValueMin += Number(valueEstimate.annual_premium_min || 0);
      followupValueMax += Number(valueEstimate.annual_premium_max || 0);
    }
    if (isOpenStatus(lead.status) && !clean(lead.assigned_to, 120)) unassigned_open_count += 1;
  }

  const count = leads.length;
  return {
    count,
    average_score: count ? Math.round((scoreTotal / count) * 10) / 10 : 0,
    priority_counts,
    top_needs: topFromMap(needs),
    top_cities: topFromMap(cities),
    oldest_hot_created_at: oldestHot,
    pipeline_value: { annual_premium_min: pipelineValueMin, annual_premium_max: pipelineValueMax, label: valueLabel(pipelineValueMin, pipelineValueMax) },
    followup_due_value: { annual_premium_min: followupValueMin, annual_premium_max: followupValueMax, label: valueLabel(followupValueMin, followupValueMax) },
    sla_2h_count,
    top_value_lead: topValueLead,
    followup_due_count,
    unassigned_open_count
  };
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) {
    return json({ success: false, error: "Acces refuse" }, 401);
  }

  if (!env.DB) {
    return json({ success: false, error: "Base SQLite indisponible" }, 503);
  }

  const { results } = await env.DB.prepare(
    `SELECT reference, name, phone, email, profile, property_type, city,
            units_count, need, message, lead_score, status, assigned_to, notes,
            source, page_url, referrer, created_at, updated_at
       FROM leads
      ORDER BY created_at DESC
      LIMIT 100`
  ).all();

  const leads = (results || []).map((lead) => ({
    ...lead,
    qualification: qualifyLead(lead)
  }));

  return json({ success: true, leads, summary: summarizeLeads(leads) });
}

export async function onRequestPatch({ request, env }) {
  if (!authorized(request, env)) {
    return json({ success: false, error: "Acces refuse" }, 401);
  }

  if (!env.DB) {
    return json({ success: false, error: "Base SQLite indisponible" }, 503);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, error: "JSON invalide" }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json({ success: false, error: "Payload lead invalide" }, 400);
  }

  const reference = clean(payload.reference, 80);
  const requestedStatus = hasOwn(payload, "status") ? clean(payload.status, 40).toLowerCase() : "";

  if (!reference) {
    return json({ success: false, error: "Reference lead manquante" }, 400);
  }
  if (requestedStatus && !allowedStatuses.has(requestedStatus)) {
    return json({ success: false, error: "Statut lead invalide" }, 400);
  }

  try {
    const existing = await env.DB.prepare(
      `SELECT id, reference, status, assigned_to, notes, updated_at
         FROM leads
        WHERE reference = ?
        LIMIT 1`
    ).bind(reference).first();

    if (!existing) {
      return json({ success: false, error: "Lead introuvable" }, 404);
    }

    const previousStatus = allowedStatuses.has(existing.status) ? existing.status : "new";
    const nextStatus = requestedStatus || previousStatus;
    const nextAssignedTo = hasOwn(payload, "assigned_to") ? clean(payload.assigned_to, 120) : (existing.assigned_to || "");
    const nextNotes = hasOwn(payload, "notes") ? clean(payload.notes, 1200) : (existing.notes || "");
    const statusChanged = nextStatus !== previousStatus;
    const assignedChanged = nextAssignedTo !== (existing.assigned_to || "");
    const notesChanged = nextNotes !== (existing.notes || "");

    if (!statusChanged && !assignedChanged && !notesChanged) {
      return json({
        success: true,
        unchanged: true,
        lead: {
          reference,
          status: nextStatus,
          assigned_to: nextAssignedTo,
          notes: nextNotes,
          updated_at: existing.updated_at || ""
        }
      });
    }

    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE leads
          SET status = ?, assigned_to = ?, notes = ?, updated_at = ?
        WHERE id = ?`
    ).bind(nextStatus, nextAssignedTo, nextNotes, now, existing.id).run();

    await logLeadEvent(env, existing.id, statusChanged ? "lead_status_updated" : "lead_followup_updated", {
      reference,
      from_status: previousStatus,
      to_status: nextStatus,
      assigned_to: nextAssignedTo,
      notes: nextNotes ? "updated" : "",
      assigned_changed: assignedChanged,
      notes_changed: notesChanged
    }, now);

    return json({
      success: true,
      lead: {
        reference,
        status: nextStatus,
        assigned_to: nextAssignedTo,
        notes: nextNotes,
        updated_at: now
      }
    });
  } catch (error) {
    return json({ success: false, error: error.message || "Erreur base de donnees" }, 500);
  }
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers });
}
