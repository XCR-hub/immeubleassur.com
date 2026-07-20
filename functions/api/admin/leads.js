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

function addReason(reasons, label) {
  if (!reasons.includes(label) && reasons.length < 8) reasons.push(label);
}

function priorityFromScore(score) {
  if (score >= 85) return "hot";
  if (score >= 70) return "warm";
  if (score >= 45) return "standard";
  return "low";
}

function nextActionFor(lead, score) {
  const need = clean(lead.need, 80);
  const profile = clean(lead.profile, 80);
  const propertyType = clean(lead.property_type, 80);
  const units = Number.parseInt(lead.units_count || "0", 10);

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
  const units = Number.parseInt(lead.units_count || "0", 10);
  const need = clean(lead.need, 80);
  const profile = clean(lead.profile, 80);
  const propertyType = clean(lead.property_type, 80);
  const source = clean(lead.source, 80);

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
  if (lead.message && lead.message.length > 40) {
    score += 10;
    addReason(reasons, "message detaille");
  }

  const persistedScore = Number(lead.lead_score);
  score = Number.isFinite(persistedScore) ? persistedScore : Math.min(score, 100);
  score = Math.min(score, 100);
  return {
    score,
    priority: priorityFromScore(score),
    reasons,
    next_action: nextActionFor(lead, score)
  };
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) {
    return json({ success: false, error: "Acces refuse" }, 401);
  }

  if (!env.DB) {
    return json({ success: false, error: "Binding D1 DB manquant" }, 503);
  }

  const { results } = await env.DB.prepare(
    `SELECT reference, name, phone, email, profile, property_type, city,
            units_count, need, message, lead_score, status, source, page_url,
            referrer, created_at
       FROM leads
      ORDER BY created_at DESC
      LIMIT 100`
  ).all();

  const leads = (results || []).map((lead) => ({
    ...lead,
    qualification: qualifyLead(lead)
  }));

  return json({ success: true, leads });
}
