const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function scoreLead(payload) {
  let score = 20;
  const units = Number.parseInt(payload.units_count || "0", 10);
  if (units >= 10) score += 20;
  if (units >= 40) score += 20;
  if (["syndic-professionnel", "administrateur-biens", "sci"].includes(payload.profile)) score += 15;
  if (["multirisque-immeuble", "copropriete", "audit-contrat"].includes(payload.need)) score += 10;
  if (payload.message && payload.message.length > 40) score += 10;
  return Math.min(score, 100);
}

function validate(payload) {
  const required = ["name", "phone", "email", "profile", "property_type", "city"];
  for (const field of required) {
    if (!clean(payload[field])) return `Champ manquant: ${field}`;
  }
  if (!clean(payload.email).includes("@")) return "Email invalide";
  if (clean(payload.phone).replace(/\D/g, "").length < 9) return "Telephone invalide";
  if (payload.consent !== true) return "Consentement requis";
  return "";
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost({ request, env }) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return json({ success: false, error: "JSON invalide" }, 400);
  }

  if (clean(payload.company_website)) {
    return json({ success: true, reference: "IGNORED" });
  }

  const validationError = validate(payload);
  if (validationError) {
    return json({ success: false, error: validationError }, 422);
  }

  if (!env.DB) {
    return json({ success: false, error: "Binding D1 DB manquant" }, 503);
  }

  const id = crypto.randomUUID();
  const reference = `IMB-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  const now = new Date().toISOString();
  const score = scoreLead(payload);
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "";
  const userAgent = request.headers.get("User-Agent") || "";

  const record = {
    name: clean(payload.name, 160),
    phone: clean(payload.phone, 80),
    email: clean(payload.email, 180).toLowerCase(),
    profile: clean(payload.profile, 80),
    property_type: clean(payload.property_type, 80),
    city: clean(payload.city, 120),
    units_count: clean(payload.units_count, 20),
    need: clean(payload.need, 80),
    message: clean(payload.message, 2000),
    source: clean(payload.source || "website", 80),
    page_url: clean(payload.page_url, 500),
    referrer: clean(payload.referrer, 500)
  };

  try {
    await env.DB.prepare(
      `INSERT INTO leads (
        id, reference, name, phone, email, profile, property_type, city,
        units_count, need, message, lead_score, status, source, page_url,
        referrer, ip_address, user_agent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        reference,
        record.name,
        record.phone,
        record.email,
        record.profile,
        record.property_type,
        record.city,
        record.units_count,
        record.need,
        record.message,
        score,
        record.source,
        record.page_url,
        record.referrer,
        ip,
        userAgent,
        now,
        now
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO lead_events (id, lead_id, event_type, payload, created_at)
       VALUES (?, ?, 'lead_created', ?, ?)`
    )
      .bind(crypto.randomUUID(), id, JSON.stringify({ reference, score, source: record.source }), now)
      .run();

    return json({ success: true, id, reference, score });
  } catch (error) {
    return json({ success: false, error: error.message || "Erreur base de donnees" }, 500);
  }
}
