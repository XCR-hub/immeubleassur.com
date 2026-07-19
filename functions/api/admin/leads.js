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

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) {
    return json({ success: false, error: "Acces refuse" }, 401);
  }

  if (!env.DB) {
    return json({ success: false, error: "Binding D1 DB manquant" }, 503);
  }

  const { results } = await env.DB.prepare(
    `SELECT reference, name, phone, email, profile, property_type, city,
            units_count, need, message, lead_score, status, created_at
       FROM leads
      ORDER BY created_at DESC
      LIMIT 100`
  ).all();

  return json({ success: true, leads: results || [] });
}
