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

async function readLocalJson(file) {
  if (typeof process === "undefined" || !file) return null;
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function sanitizeMonitorReport(report) {
  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const ageMinutes = generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null;
  return {
    available: true,
    success: report.success === true,
    generated_at: generatedAt,
    age_minutes: ageMinutes,
    origin: report.origin || "",
    summary: report.summary || {},
    checks: Array.isArray(report.checks)
      ? report.checks.map((item) => ({
          name: item.name || "",
          ok: item.ok === true,
          status: item.status || "",
          mode: item.mode || "",
          integrity: item.integrity || "",
          table_count: item.table_count || 0,
          age_hours: item.age_hours ?? null,
          max_age_hours: item.max_age_hours ?? null
        }))
      : [],
    alert: report.alert ? { attempted: Boolean(report.alert.attempted), status: report.alert.status || "" } : null
  };
}

function sanitizeLeadSlaReport(report) {
  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const ageMinutes = generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null;
  const sanitizeLead = (lead) => ({
    reference: lead.reference || "",
    priority: lead.priority || "",
    status: lead.status || "",
    city: lead.city || "",
    need: lead.need || "",
    score: Number(lead.score || 0),
    created_at: lead.created_at || "",
    age_hours: lead.age_hours ?? null,
    target_hours: lead.target_hours ?? null,
    overdue_hours: lead.overdue_hours ?? null,
    due_in_hours: lead.due_in_hours ?? null,
    value_label: lead.value_estimate?.label || ""
  });
  return {
    available: true,
    success: report.success === true,
    attention_required: report.attention_required === true,
    generated_at: generatedAt,
    age_minutes: ageMinutes,
    summary: {
      open_leads: Number(report.summary?.open_leads || 0),
      due_now: Number(report.summary?.due_now || 0),
      due_hot: Number(report.summary?.due_hot || 0),
      due_warm: Number(report.summary?.due_warm || 0),
      oldest_due_hours: report.summary?.oldest_due_hours ?? 0,
      next_due_minutes: report.summary?.next_due_minutes ?? null,
      due_value: report.summary?.due_value || null,
      pipeline_value: report.summary?.pipeline_value || null,
      leads_24h: Number(report.summary?.leads_24h || 0),
      leads_7d: Number(report.summary?.leads_7d || 0),
      leads_30d: Number(report.summary?.leads_30d || 0)
    },
    due_leads: Array.isArray(report.due_leads) ? report.due_leads.slice(0, 10).map(sanitizeLead) : [],
    upcoming_leads: Array.isArray(report.upcoming_leads) ? report.upcoming_leads.slice(0, 6).map(sanitizeLead) : [],
    alert: report.alert ? { attempted: Boolean(report.alert.attempted), status: report.alert.status || "" } : null
  };
}

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return json({ success: false, error: "Non autorise" }, 401);

  const databaseHealth = typeof env.DB?.health === "function" ? env.DB.health() : null;
  const monitorPath = env.LOCAL_PRODUCTION_MONITOR_REPORT || "reports/local-production-monitor-report.json";
  const monitorReport = await readLocalJson(monitorPath);
  const leadSlaPath = env.LOCAL_LEAD_SLA_REPORT || "reports/local-lead-sla-report.json";
  const leadSlaReport = await readLocalJson(leadSlaPath);
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
        },
    monitor: sanitizeMonitorReport(monitorReport),
    lead_sla: sanitizeLeadSlaReport(leadSlaReport)
  });
}
