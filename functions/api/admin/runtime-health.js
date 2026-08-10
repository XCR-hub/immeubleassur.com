import { adminRequestAllowed } from "../../_shared/admin-auth.js";
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function isAuthorized(request, env) { return adminRequestAllowed(request, env); }

function publicRuntime() {
  return {
    platform: typeof process === "undefined" ? "cloudflare-pages" : "local-node",
    node: typeof process === "undefined" ? null : process.version,
    uptime_seconds: typeof process === "undefined" ? null : Math.round(process.uptime()),
    memory: typeof process === "undefined" ? null : process.memoryUsage()
  };
}

async function currentSourceRevision() {
  if (typeof process === "undefined") return "";
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const gitDir = path.join(process.cwd(), ".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 40);
    return fs.readFileSync(path.join(gitDir, head.slice(5)), "utf8").trim().slice(0, 40);
  } catch {
    return "";
  }
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


function sanitizeSmtpHealth(report) {
  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const ageMinutes = generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null;
  return {
    available: true,
    status: report.status || "unknown",
    generated_at: generatedAt,
    age_minutes: ageMinutes,
    host_configured: report.host === "configured",
    port: Number(report.port || 0),
    secure_transport: report.secure_transport || "",
    authenticated: report.authenticated === true,
    error: report.error || ""
  };
}


function sanitizeRuntimeCycle(report, expectedRevision = "") {


  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const ageMinutes = generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null;
  const steps = Array.isArray(report.steps) ? report.steps.slice(0, 24).map((step) => ({
    name: step.name || "",
    ok: step.ok === true,
    attention: step.attention === true,
    status: step.status ?? null,
    error: step.error || "",
    stderr: step.stderr || ""
  })) : [];
  return {
    available: true,
    success: report.success === true,
    stale: ageMinutes === null || ageMinutes > 30,
    source_revision: String(report.source_revision || "").slice(0, 40),
    source_revision_expected: String(expectedRevision || "").slice(0, 40),
    source_revision_match: !expectedRevision || !report.source_revision || String(report.source_revision).slice(0, 40) === String(expectedRevision).slice(0, 40),
    source_revision_mismatch: Boolean(expectedRevision && report.source_revision && String(report.source_revision).slice(0, 40) !== String(expectedRevision).slice(0, 40)),
    generated_at: generatedAt,
    age_minutes: ageMinutes,
    summary: {
      ok: Number(report.summary?.ok || 0),
      failed: Number(report.summary?.failed || 0),
      attention: Number(report.summary?.attention || 0),
      growth_status: report.summary?.growth_status || "",
      growth_attention: Number(report.summary?.growth_attention || 0)
    },
    failed_steps: steps.filter((step) => !step.ok).map((step) => step.name).slice(0, 12),
    steps
  };
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

function sanitizeLeadQualityReport(report) {
  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const ageMinutes = generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null;
  return {
    available: true,
    success: report.success === true,
    attention_required: report.attention_required === true,
    generated_at: generatedAt,
    age_minutes: ageMinutes,
    summary: {
      lookback_days: Number(report.summary?.lookback_days || 0),
      leads_24h: Number(report.summary?.leads_24h || 0),
      leads_7d: Number(report.summary?.leads_7d || 0),
      leads_period: Number(report.summary?.leads_period || 0),
      open_leads: Number(report.summary?.open_leads || 0),
      hot_leads: Number(report.summary?.hot_leads || 0),
      warm_leads: Number(report.summary?.warm_leads || 0),
      average_score: Number(report.summary?.average_score || 0),
      quality_score: Number(report.summary?.quality_score || 0),
      core_completion_rate: Number(report.summary?.core_completion_rate || 0),
      issue_count: Number(report.summary?.issue_count || 0),
      critical_issues: Number(report.summary?.critical_issues || 0),
      high_issues: Number(report.summary?.high_issues || 0)
    },
    issues: Array.isArray(report.issues)
      ? report.issues.slice(0, 10).map((issue) => ({
          type: issue.type || "",
          severity: issue.severity || "",
          label: issue.label || "",
          count: Number(issue.count || 0),
          action: issue.action || "",
          references: Array.isArray(issue.references) ? issue.references.slice(0, 8) : []
        }))
      : [],
    sample_leads: Array.isArray(report.sample_leads)
      ? report.sample_leads.slice(0, 8).map((lead) => ({
          reference: lead.reference || "",
          priority: lead.priority || "",
          status: lead.status || "",
          city: lead.city || "",
          need: lead.need || "",
          score: Number(lead.score || 0),
          page_path: lead.page_path || "",
          issue_types: Array.isArray(lead.issue_types) ? lead.issue_types.slice(0, 6) : []
        }))
      : []
  };
}

function sanitizeConversionFunnelReport(report) {
  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const ageMinutes = generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null;
  const numericSummary = (summary = {}) => ({
    lookback_days: Number(summary.lookback_days || 0),
    page_views: Number(summary.page_views || 0),
    quote_router_views: Number(summary.quote_router_views || 0),
    quote_router_selects: Number(summary.quote_router_selects || 0),
    quote_router_continues: Number(summary.quote_router_continues || 0),
    quote_continue_rate: Number(summary.quote_continue_rate || 0),
    cta_clicks: Number(summary.cta_clicks || 0),
    phone_clicks: Number(summary.phone_clicks || 0),
    form_starts: Number(summary.form_starts || 0),
    submit_attempts: Number(summary.submit_attempts || 0),
    submit_errors: Number(summary.submit_errors || 0),
    abandoned_forms: Number(summary.abandoned_forms || 0),
    leads_event: Number(summary.leads_event || 0),
    leads_db: Number(summary.leads_db || 0),
    hot_leads_db: Number(summary.hot_leads_db || 0),
    average_lead_score_db: Number(summary.average_lead_score_db || 0),
    page_to_form_rate: Number(summary.page_to_form_rate || 0),
    form_to_submit_rate: Number(summary.form_to_submit_rate || 0),
    submit_to_lead_rate: Number(summary.submit_to_lead_rate || 0),
    form_to_lead_rate: Number(summary.form_to_lead_rate || 0)
  });
  return {
    available: true,
    success: report.success === true,
    attention_required: report.attention_required === true,
    generated_at: generatedAt,
    age_minutes: ageMinutes,
    summary: numericSummary(report.summary),
    top_paths: Array.isArray(report.top_paths)
      ? report.top_paths.slice(0, 8).map((item) => ({
          path: item.path || "/",
          sessions: Number(item.sessions || 0),
          page_views: Number(item.page_views || 0),
          quote_router_continues: Number(item.quote_router_continues || 0),
          cta_clicks: Number(item.cta_clicks || 0),
          phone_clicks: Number(item.phone_clicks || 0),
          form_starts: Number(item.form_starts || 0),
          submit_attempts: Number(item.submit_attempts || 0),
          submit_errors: Number(item.submit_errors || 0),
          abandoned_forms: Number(item.abandoned_forms || 0),
          leads_created: Number(item.leads_created || 0),
          start_rate: Number(item.start_rate || 0),
          lead_rate: Number(item.lead_rate || 0),
          quote_continue_rate: Number(item.quote_continue_rate || 0)
        }))
      : [],
    cta_variants: Array.isArray(report.cta_variants)
      ? report.cta_variants.slice(0, 6).map((item) => ({
          variant: item.variant || "",
          label: item.label || "",
          views: Number(item.views || 0),
          cta_clicks: Number(item.cta_clicks || 0),
          quote_router_continues: Number(item.quote_router_continues || 0),
          form_starts: Number(item.form_starts || 0),
          submit_attempts: Number(item.submit_attempts || 0),
          leads_created: Number(item.leads_created || 0),
          start_rate: Number(item.start_rate || 0),
          lead_rate: Number(item.lead_rate || 0)
        }))
      : [],
    recommendations: Array.isArray(report.recommendations)
      ? report.recommendations.slice(0, 8).map((item) => ({
          type: item.type || "",
          severity: item.severity || "",
          path: item.path || "/",
          signal: item.signal || "",
          action: item.action || "",
          score: Number(item.score || 0)
        }))
      : []
  };
}

function sanitizeIntentConversionReport(report) {
  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const ageMinutes = generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null;
  const numericSummary = (summary = {}) => ({
    lookback_days: Number(summary.lookback_days || 0),
    tracked_events: Number(summary.tracked_events || 0),
    tracked_sessions: Number(summary.tracked_sessions || 0),
    leads_db: Number(summary.leads_db || 0),
    hot_leads_db: Number(summary.hot_leads_db || 0),
    page_views: Number(summary.page_views || 0),
    form_starts: Number(summary.form_starts || 0),
    submit_attempts: Number(summary.submit_attempts || 0),
    submit_errors: Number(summary.submit_errors || 0),
    lead_urgency_events: Number(summary.lead_urgency_events || 0),
    spam_blocks: Number(summary.spam_blocks || 0),
    intent_count: Number(summary.intent_count || 0),
    urgency_count: Number(summary.urgency_count || 0),
    intents_with_leads: Number(summary.intents_with_leads || 0),
    intents_with_traffic_no_leads: Number(summary.intents_with_traffic_no_leads || 0),
    urgent_starts_without_leads: Number(summary.urgent_starts_without_leads || 0),
    attention_count: Number(summary.attention_count || 0),
    page_to_start_rate: Number(summary.page_to_start_rate || 0),
    start_to_submit_rate: Number(summary.start_to_submit_rate || 0),
    submit_to_lead_rate: Number(summary.submit_to_lead_rate || 0),
    start_to_lead_rate: Number(summary.start_to_lead_rate || 0)
  });
  const sanitizeFunnel = (item) => ({
    key: item.key || "",
    label: item.label || item.key || "",
    sessions: Number(item.sessions || 0),
    page_views: Number(item.page_views || 0),
    cta_clicks: Number(item.cta_clicks || 0),
    lead_intent_prefills: Number(item.lead_intent_prefills || 0),
    lead_urgency_events: Number(item.lead_urgency_events || 0),
    form_starts: Number(item.form_starts || 0),
    submit_attempts: Number(item.submit_attempts || 0),
    submit_errors: Number(item.submit_errors || 0),
    leads_db: Number(item.leads_db || 0),
    hot_leads_db: Number(item.hot_leads_db || 0),
    average_lead_score: Number(item.average_lead_score || 0),
    start_to_lead_rate: Number(item.start_to_lead_rate || 0),
    submit_to_lead_rate: Number(item.submit_to_lead_rate || 0),
    top_paths: Array.isArray(item.top_paths) ? item.top_paths.slice(0, 4) : []
  });
  return {
    available: true,
    success: report.success === true,
    status: report.status || "unknown",
    attention_required: report.attention_required === true,
    generated_at: generatedAt,
    age_minutes: ageMinutes,
    summary: numericSummary(report.summary),
    intent_funnels: Array.isArray(report.intent_funnels) ? report.intent_funnels.slice(0, 10).map(sanitizeFunnel) : [],
    urgency_funnels: Array.isArray(report.urgency_funnels) ? report.urgency_funnels.slice(0, 6).map(sanitizeFunnel) : [],
    lead_segments: Array.isArray(report.lead_segments)
      ? report.lead_segments.slice(0, 8).map((item) => ({
          intent: item.intent || "",
          urgency: item.urgency || "",
          need: item.need || "",
          property_type: item.property_type || "",
          leads: Number(item.leads || 0),
          hot_leads: Number(item.hot_leads || 0),
          average_score: Number(item.average_score || 0),
          estimated_value_min: Number(item.estimated_value_min || 0),
          estimated_value_max: Number(item.estimated_value_max || 0)
        }))
      : [],
    recommendations: Array.isArray(report.recommendations)
      ? report.recommendations.slice(0, 8).map((item) => ({
          type: item.type || "",
          severity: item.severity || "",
          target: item.target || "",
          signal: item.signal || "",
          action: item.action || "",
          score: Number(item.score || 0)
        }))
      : []
  };
}
function sanitizeSourceQualityReport(report) {
  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const ageMinutes = generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null;
  return {
    available: true,
    success: report.success === true,
    status: report.status || "unknown",
    attention_required: report.attention_required === true,
    generated_at: generatedAt,
    age_minutes: ageMinutes,
    summary: {
      lookback_days: Number(report.summary?.lookback_days || 0),
      sources: Number(report.summary?.sources || 0),
      sessions: Number(report.summary?.sessions || 0),
      page_views: Number(report.summary?.page_views || 0),
      form_starts: Number(report.summary?.form_starts || 0),
      submit_attempts: Number(report.summary?.submit_attempts || 0),
      leads_db: Number(report.summary?.leads_db || 0),
      hot_leads_db: Number(report.summary?.hot_leads_db || 0),
      spam_blocks: Number(report.summary?.spam_blocks || 0),
      traffic_rescue_direct_shown: Number(report.summary?.traffic_rescue_direct_shown || 0),
      traffic_rescue_direct_clicks: Number(report.summary?.traffic_rescue_direct_clicks || 0),
      traffic_rescue_direct_click_rate: Number(report.summary?.traffic_rescue_direct_click_rate || 0),
      session_to_lead_rate: Number(report.summary?.session_to_lead_rate || 0),
      start_to_lead_rate: Number(report.summary?.start_to_lead_rate || 0)
    },
    sources: Array.isArray(report.sources)
      ? report.sources.slice(0, 10).map((item) => ({
          source: item.source || "",
          sessions: Number(item.sessions || 0),
          form_starts: Number(item.form_starts || 0),
          submit_attempts: Number(item.submit_attempts || 0),
          leads_db: Number(item.leads_db || 0),
          hot_leads_db: Number(item.hot_leads_db || 0),
          average_lead_score: Number(item.average_lead_score || 0),
          session_to_lead_rate: Number(item.session_to_lead_rate || 0),
          start_to_lead_rate: Number(item.start_to_lead_rate || 0),
          traffic_rescue_shown: Number(item.traffic_rescue_shown || 0),
          traffic_rescue_clicks: Number(item.traffic_rescue_clicks || 0),
          traffic_rescue_click_rate: Number(item.traffic_rescue_click_rate || 0),
          traffic_rescue_direct_shown: Number(item.traffic_rescue_direct_shown || 0),
          traffic_rescue_direct_clicks: Number(item.traffic_rescue_direct_clicks || 0),
          traffic_rescue_direct_click_rate: Number(item.traffic_rescue_direct_click_rate || 0),
          submit_error_rate: Number(item.submit_error_rate || 0),
          abandon_rate: Number(item.abandon_rate || 0),
          spam_pressure_rate: Number(item.spam_pressure_rate || 0),
          top_paths: Array.isArray(item.top_paths) ? item.top_paths.slice(0, 4) : []
        }))
      : [],
    recommendations: Array.isArray(report.recommendations)
      ? report.recommendations.slice(0, 8).map((item) => ({
          type: item.type || "",
          severity: item.severity || "",
          source: item.source || "",
          signal: item.signal || "",
          action: item.action || "",
          score: Number(item.score || 0)
        }))
      : []
  };
}
function sanitizeSeoBacklogReport(report) {
  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const ageMinutes = generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null;
  const sanitizeOpportunity = (item) => ({
    url: item.url || "",
    query: item.query || "",
    opportunity_type: item.opportunity_type || "",
    score: Number(item.score || 0),
    status: item.status || "",
    recommendation: item.recommendation || "",
    age_days: item.age_days ?? null
  });
  const sanitizeSourceQuality = (item) => ({
    source: item.source || "",
    leads: Number(item.leads || 0),
    hot_leads: Number(item.hot_leads || 0),
    warm_leads: Number(item.warm_leads || 0),
    bridge_leads: Number(item.bridge_leads || 0),
    average_score: Number(item.average_score || 0),
    quality_score: Number(item.quality_score || 0),
    signal_score: Number(item.signal_score || 0),
    sessions: Number(item.sessions || 0),
    page_views: Number(item.page_views || 0),
    cta_clicks: Number(item.cta_clicks || 0),
    urgency_selects: Number(item.urgency_selects || 0),
    quote_router_continues: Number(item.quote_router_continues || 0),
    form_starts: Number(item.form_starts || 0),
    submit_attempts: Number(item.submit_attempts || 0),
    leads_created: Number(item.leads_created || 0),
    bridge_clicks: Number(item.bridge_clicks || 0),
    quality_basis: item.quality_basis || "",
    source_stage: item.source_stage || "",
    source_stage_label: item.source_stage_label || "",
    source_stage_severity: item.source_stage_severity || "",
    top_need: item.top_need || "",
    value_label: item.value_label || ""
  });
  return {
    available: true,
    success: report.success === true,
    attention_required: report.attention_required === true,
    generated_at: generatedAt,
    age_minutes: ageMinutes,
    thresholds: {
      stale_days: Number(report.thresholds?.stale_days || 0),
      max_rows: Number(report.thresholds?.max_rows || 0)
    },
    summary: {
      total_opportunities: Number(report.summary?.total_opportunities || 0),
      open_opportunities: Number(report.summary?.open_opportunities || 0),
      stale_opportunities: Number(report.summary?.stale_opportunities || 0),
      critical_open: Number(report.summary?.critical_open || 0),
      high_open: Number(report.summary?.high_open || 0),
      conversion_open: Number(report.summary?.conversion_open || 0),
      old_open: Number(report.summary?.old_open || 0),
      qualified_source_count: Number(report.summary?.qualified_source_count || 0),
      top_qualified_source: report.summary?.top_qualified_source || "",
      top_qualified_source_score: Number(report.summary?.top_qualified_source_score || 0),
      top_qualified_source_leads: Number(report.summary?.top_qualified_source_leads || 0),
      top_qualified_source_sessions: Number(report.summary?.top_qualified_source_sessions || 0),
      top_qualified_source_urgency_selects: Number(report.summary?.top_qualified_source_urgency_selects || 0),
      top_qualified_source_basis: report.summary?.top_qualified_source_basis || "",
      top_qualified_source_stage: report.summary?.top_qualified_source_stage || "",
      top_qualified_source_stage_label: report.summary?.top_qualified_source_stage_label || "",
      oldest_open_days: Number(report.summary?.oldest_open_days || 0),
      average_open_score: Number(report.summary?.average_open_score || 0)
    },
    type_breakdown: Array.isArray(report.type_breakdown)
      ? report.type_breakdown.slice(0, 10).map((item) => ({
          opportunity_type: item.opportunity_type || "",
          count: Number(item.count || 0),
          open_count: Number(item.open_count || 0),
          max_score: Number(item.max_score || 0),
          latest_updated_at: item.latest_updated_at || ""
        }))
      : [],
    top_open: Array.isArray(report.top_open) ? report.top_open.slice(0, 8).map(sanitizeOpportunity) : [],
    conversion_open: Array.isArray(report.conversion_open) ? report.conversion_open.slice(0, 8).map(sanitizeOpportunity) : [],
    source_quality: Array.isArray(report.source_quality) ? report.source_quality.slice(0, 8).map(sanitizeSourceQuality) : [],
    old_open: Array.isArray(report.old_open) ? report.old_open.slice(0, 8).map(sanitizeOpportunity) : [],
    recommendations: Array.isArray(report.recommendations)
      ? report.recommendations.slice(0, 8).map((item) => ({
          type: item.type || "",
          severity: item.severity || "",
          signal: item.signal || "",
          action: item.action || "",
          url: item.url || "",
          score: Number(item.score || 0)
        }))
      : []
  };
}
function sanitizeEditorialHealthReport(report) {
  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const ageMinutes = generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null;
  const missingCoverage = Array.isArray(report.business_coverage?.missing_dimensions)
    ? report.business_coverage.missing_dimensions.map((value) => String(value || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40)).filter(Boolean).slice(0, 8)
    : [];
  return {
    available: true,
    success: report.success === true,
    attention_required: report.attention_required === true,
    status: report.status || "unknown",
    generated_at: generatedAt,
    age_minutes: ageMinutes,
    collection_status: report.collection_status || "unknown",
    publication_status: report.publication_status || "unknown",
    gate_ready: report.publication_gate?.ready === true,
    gate_decision: report.publication_gate?.decision || "unknown",
    gate_reasons: Array.isArray(report.publication_gate?.reasons) ? report.publication_gate.reasons.slice(0, 8) : [],
    observed: {
      healthy_sources: Number(report.publication_gate?.observed?.healthy_sources || 0),
      authoritative_sources: Number(report.publication_gate?.observed?.authoritative_sources || 0),
      attributable_items: Number(report.publication_gate?.observed?.attributable_items || 0),
      fresh_dated_items: Number(report.publication_gate?.observed?.fresh_dated_items || 0),
      text_quality_rejected_items: Number(report.publication_gate?.observed?.text_quality_rejected_items || 0)
    },
    held_this_cycle: report.held_this_cycle === true,
    consecutive_holds: Number(report.consecutive_holds || 0),
    hold_alert_cycles: Number(report.hold_alert_cycles || 0),
    business_coverage_status: report.business_coverage?.status === "gaps-detected" ? "gaps-detected" : report.business_coverage?.status === "covered" ? "covered" : "unknown",
    coverage_gaps: missingCoverage.map((dimension) => ({ dimension, cycles: Math.max(0, Number(report.coverage_gap_cycles?.[dimension] || 0)) })),
    coverage_gap_alert_cycles: Math.max(0, Number(report.coverage_gap_alert_cycles || 0)),
    latest_valid_edition: report.latest_valid_edition ? {
      date: report.latest_valid_edition.date || "",
      path: report.latest_valid_edition.path || "",
      age_days: Number(report.latest_valid_edition.age_days || 0),
      source: report.latest_valid_edition.source || "static-checkout",
      version: report.latest_valid_edition.version || ""
    } : null,
    maximum_edition_age_days: Number(report.maximum_edition_age_days || 0),
    issues: Array.isArray(report.issues) ? report.issues.slice(0, 8).map((item) => ({ type: item.type || "", severity: item.severity || "", signal: item.signal || "", threshold: item.threshold || "" })) : []
  };
}
function sanitizeEditorialReviewReport(report) {
  if (!report || typeof report !== "object") return { available: false };
  const generatedAt = report.generated_at || "";
  const safeUrl = (value) => {
    try { const parsed = new URL(String(value || "")); return ["https:", "http:"].includes(parsed.protocol) ? parsed.toString() : ""; }
    catch { return ""; }
  };
  return {
    available: true,
    status: report.status || "unknown",
    generated_at: generatedAt,
    age_minutes: generatedAt ? Math.round(((Date.now() - new Date(generatedAt).getTime()) / 60000) * 10) / 10 : null,
    pending_count: Number(report.pending_count || 0),
    legal_sensitive_count: Number(report.legal_sensitive_count || 0),
    warning_count: Number(report.warning_count || 0),
    critical_count: Number(report.critical_count || 0),
    oldest_age_days: Number(report.oldest_age_days || 0),
    recipient_is_team: report.alert_policy?.recipient_is_team === true,
    review_queue: (report.review_queue || []).slice(0, 12).map((item) => ({
      issue: item.issue || "",
      review_severity: item.review_severity || "pending",
      age_days: Number(item.age_days || 0),
      legal_sensitive: item.legal_sensitive === true,
      matched_terms: Array.isArray(item.matched_terms) ? item.matched_terms.slice(0, 12) : [],
      source_count: Number(item.source_count || 0),
      source_urls: (item.source_urls || []).map(safeUrl).filter(Boolean).slice(0, 7)
    }))
  };
}
export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return json({ success: false, error: "Non autorise" }, 401);

  const databaseHealth = typeof env.DB?.health === "function" ? env.DB.health() : null;
  const reportAt = (root, name) => `${String(root || "").replace(/[\\/]+$/, "")}/${name}`;
  const runtimeReportsRoot = env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
  const monitorRoot = env.LOCAL_MONITOR_ROOT || "reports";
  const monitorPath = env.LOCAL_PRODUCTION_MONITOR_REPORT || reportAt(monitorRoot, "latest.json");
  const monitorReport = await readLocalJson(monitorPath);
  const runtimeCyclePath = env.LOCAL_RUNTIME_REPORT_CYCLE_REPORT || reportAt(runtimeReportsRoot, "local-runtime-report-cycle.json");
  const runtimeCycleReport = await readLocalJson(runtimeCyclePath);
  const smtpHealthPath = env.LOCAL_SMTP_HEALTH_REPORT || reportAt(runtimeReportsRoot, "local-smtp-health-report.json");
  const smtpHealthReport = await readLocalJson(smtpHealthPath);
  const leadSlaPath = env.LOCAL_LEAD_SLA_REPORT || reportAt(monitorRoot, "lead-sla-latest.json");
  const leadSlaReport = await readLocalJson(leadSlaPath);
  const leadQualityPath = env.LOCAL_LEAD_QUALITY_REPORT || reportAt(monitorRoot, "lead-quality-latest.json");
  const leadQualityReport = await readLocalJson(leadQualityPath);
  const conversionFunnelPath = env.LOCAL_CONVERSION_FUNNEL_REPORT || reportAt(monitorRoot, "conversion-funnel-latest.json");
  const conversionFunnelReport = await readLocalJson(conversionFunnelPath);
  const intentConversionPath = env.LOCAL_INTENT_CONVERSION_REPORT || reportAt(runtimeReportsRoot, "local-intent-conversion-report.json");
  const intentConversionReport = await readLocalJson(intentConversionPath);
  const sourceQualityPath = env.LOCAL_SOURCE_QUALITY_REPORT || reportAt(runtimeReportsRoot, "local-source-quality-report.json");
  const sourceQualityReport = await readLocalJson(sourceQualityPath);
  const seoBacklogPath = env.LOCAL_SEO_BACKLOG_REPORT || reportAt(monitorRoot, "seo-backlog-latest.json");
  const seoBacklogReport = await readLocalJson(seoBacklogPath);
  const editorialHealthPath = env.LOCAL_EDITORIAL_HEALTH_REPORT || reportAt(runtimeReportsRoot, "local-editorial-health-report.json");
  const editorialHealthReport = await readLocalJson(editorialHealthPath);
  const editorialReviewPath = env.LOCAL_EDITORIAL_REVIEW_REPORT || reportAt(runtimeReportsRoot, "local-editorial-review-report.json");
  const editorialReviewReport = await readLocalJson(editorialReviewPath);
  const expectedSourceRevision = await currentSourceRevision();
  const documentScanner = typeof env.DOCUMENT_SCANNER_STATUS === "function"
    ? await env.DOCUMENT_SCANNER_STATUS()
    : { available: false, configured: false, reason: "scanner_status_unavailable" };
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
          driver: "sqlite-unavailable",
          detailed_health: "local-runtime-only"
        },
    document_scanner: documentScanner,
    monitor: sanitizeMonitorReport(monitorReport),
    runtime_cycle: sanitizeRuntimeCycle(runtimeCycleReport, expectedSourceRevision),
    smtp_health: sanitizeSmtpHealth(smtpHealthReport),
    lead_sla: sanitizeLeadSlaReport(leadSlaReport),
    lead_quality: sanitizeLeadQualityReport(leadQualityReport),
    conversion_funnel: sanitizeConversionFunnelReport(conversionFunnelReport),
    intent_conversion: sanitizeIntentConversionReport(intentConversionReport),
    source_quality: sanitizeSourceQualityReport(sourceQualityReport),
    seo_backlog: sanitizeSeoBacklogReport(seoBacklogReport),
    editorial_health: sanitizeEditorialHealthReport(editorialHealthReport),
    editorial_review: sanitizeEditorialReviewReport(editorialReviewReport)
  });
}
