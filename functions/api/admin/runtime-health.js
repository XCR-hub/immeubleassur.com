function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function isAuthorized(request, env) {
  const expected = env.ADMIN_API_TOKEN;
  if (!expected) return false;
  return (request.headers.get("Authorization") || "") === `Bearer ${expected}`;
}

function publicRuntime() {
  return {
    platform: typeof process === "undefined" ? "cloudflare-pages" : "local-node",
    node: typeof process === "undefined" ? null : process.version,
    uptime_seconds: typeof process === "undefined" ? null : Math.round(process.uptime()),
    memory: typeof process === "undefined" ? null : process.memoryUsage()
  };
}

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return json({ success: false, error: "Non autorise" }, 401);

  const databaseHealth = typeof env.DB?.health === "function" ? env.DB.health() : null;
  return json({
    success: true,
    generated_at: new Date().toISOString(),
    service: "immeubleassur-admin-runtime-health",
    runtime: publicRuntime(),
    database: databaseHealth
      ? {
          driver: "sqlite",
          path: databaseHealth.path,
          size_bytes: databaseHealth.size_bytes,
          table_count: databaseHealth.tables.length,
          tables: databaseHealth.tables
        }
      : {
          driver: "cloudflare-d1",
          detailed_health: "local-runtime-only"
        }
  });
}