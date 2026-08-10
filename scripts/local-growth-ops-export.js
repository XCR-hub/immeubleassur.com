import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

const REPORT_DIR = "reports";
const PUBLIC_DIR = "public";
const REPORT_PATH = join(REPORT_DIR, "local-growth-ops-report.json");
const ASSET_PATH = join(PUBLIC_DIR, "assets", "local-growth-ops-latest.json");

const inputs = {
  production: env("LOCAL_PRODUCTION_MONITOR_REPORT", join(REPORT_DIR, "local-production-monitor-report.json")),
  lead_sla: env("LOCAL_LEAD_SLA_REPORT", join(REPORT_DIR, "local-lead-sla-report.json")),
  lead_quality: env("LOCAL_LEAD_QUALITY_REPORT", join(REPORT_DIR, "local-lead-quality-report.json")),
  conversion_funnel: env("LOCAL_CONVERSION_FUNNEL_REPORT", join(REPORT_DIR, "local-conversion-funnel-report.json")),
  intent_conversion: env("LOCAL_INTENT_CONVERSION_REPORT", join(REPORT_DIR, "local-intent-conversion-report.json")),
  source_quality: env("LOCAL_SOURCE_QUALITY_REPORT", join(REPORT_DIR, "local-source-quality-report.json")),
  seo_backlog: env("LOCAL_SEO_BACKLOG_REPORT", join(REPORT_DIR, "local-seo-backlog-report.json"))
};

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function writeJson(path, value) { ensureDir(dirname(path)); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function number(value) { return Number(value || 0); }
function bool(value) { return value === true; }
function clean(value, max = 300) { return String(value || "").trim().slice(0, max); }

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function ageMinutes(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return null;
  return Math.round(((Date.now() - timestamp) / 60000) * 10) / 10;
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function reportState(report) {
  if (!report) return { available: false, status: "missing", attention_required: false, generated_at: "", age_minutes: null };
  return {
    available: true,
    status: report.status || (report.success === true ? "passed" : "failed"),
    success: report.success === true,
    attention_required: report.attention_required === true,
    generated_at: report.generated_at || "",
    age_minutes: ageMinutes(report.generated_at)
  };
}

function sanitizeProduction(report) {
  const state = reportState(report);
  if (!state.available) return state;
  const checks = Array.isArray(report.checks) ? report.checks : [];
  return {
    ...state,
    summary: {
      ok: number(report.summary?.ok),
      failed: number(report.summary?.failed),
      warnings: number(report.summary?.warnings)
    },
    failed_checks: checks
      .filter((item) => item.ok !== true)
      .slice(0, 8)
      .map((item) => ({
        name: clean(item.name, 120),
        severity: clean(item.severity || "error", 40),
        status: clean(item.status || item.reason || item.error || "failed", 160)
      }))
  };
}

function sanitizeLeadSla(report) {
  const state = reportState(report);
  if (!state.available) return state;
  return {
    ...state,
    summary: {
      open_leads: number(report.summary?.open_leads),
      due_now: number(report.summary?.due_now),
      due_hot: number(report.summary?.due_hot),
      due_warm: number(report.summary?.due_warm),
      oldest_due_hours: number(report.summary?.oldest_due_hours),
      next_due_minutes: report.summary?.next_due_minutes ?? null,
      leads_24h: number(report.summary?.leads_24h),
      leads_7d: number(report.summary?.leads_7d),
      leads_30d: number(report.summary?.leads_30d),
      pipeline_value: report.summary?.pipeline_value || null,
      due_value: report.summary?.due_value || null
    },
    alert: report.alert ? { attempted: Boolean(report.alert.attempted), status: clean(report.alert.status, 80) } : null
  };
}

function sanitizeLeadQuality(report) {
  const state = reportState(report);
  if (!state.available) return state;
  return {
    ...state,
    summary: {
      lookback_days: number(report.summary?.lookback_days),
      leads_24h: number(report.summary?.leads_24h),
      leads_7d: number(report.summary?.leads_7d),
      leads_period: number(report.summary?.leads_period),
      open_leads: number(report.summary?.open_leads),
      hot_leads: number(report.summary?.hot_leads),
      warm_leads: number(report.summary?.warm_leads),
      average_score: number(report.summary?.average_score),
      quality_score: number(report.summary?.quality_score),
      core_completion_rate: number(report.summary?.core_completion_rate),
      issue_count: number(report.summary?.issue_count),
      critical_issues: number(report.summary?.critical_issues),
      high_issues: number(report.summary?.high_issues)
    },
    issues: Array.isArray(report.issues)
      ? report.issues.slice(0, 10).map((issue) => ({
          type: clean(issue.type, 80),
          severity: clean(issue.severity, 40),
          label: clean(issue.label, 160),
          count: number(issue.count),
          action: clean(issue.action, 500)
        }))
      : []
  };
}

function sanitizeConversionFunnel(report) {
  const state = reportState(report);
  if (!state.available) return state;
  const summary = report.summary || {};
  return {
    ...state,
    summary: {
      lookback_days: number(summary.lookback_days),
      page_views: number(summary.page_views),
      quote_router_views: number(summary.quote_router_views),
      quote_router_continues: number(summary.quote_router_continues),
      quote_continue_rate: number(summary.quote_continue_rate),
      cta_clicks: number(summary.cta_clicks),
      phone_clicks: number(summary.phone_clicks),
      form_starts: number(summary.form_starts),
      submit_attempts: number(summary.submit_attempts),
      submit_errors: number(summary.submit_errors),
      abandoned_forms: number(summary.abandoned_forms),
      leads_db: number(summary.leads_db),
      hot_leads_db: number(summary.hot_leads_db),
      page_to_form_rate: number(summary.page_to_form_rate),
      form_to_submit_rate: number(summary.form_to_submit_rate),
      submit_to_lead_rate: number(summary.submit_to_lead_rate),
      form_to_lead_rate: number(summary.form_to_lead_rate)
    },
    top_paths: Array.isArray(report.top_paths)
      ? report.top_paths.slice(0, 8).map((item) => ({
          path: clean(item.path || "/", 240),
          page_views: number(item.page_views),
          cta_clicks: number(item.cta_clicks),
          form_starts: number(item.form_starts),
          leads_created: number(item.leads_created),
          start_rate: number(item.start_rate),
          lead_rate: number(item.lead_rate)
        }))
      : [],
    recommendations: sanitizeRecommendations(report.recommendations, "path")
  };
}

function sanitizeIntentConversion(report) {
  const state = reportState(report);
  if (!state.available) return state;
  const summary = report.summary || {};
  const sanitizeFunnel = (item) => ({
    key: clean(item.key, 80),
    label: clean(item.label || item.key, 160),
    sessions: number(item.sessions),
    engaged_sessions: number(item.engaged_sessions),
    page_views: number(item.page_views),
    form_starts: number(item.form_starts),
    submit_attempts: number(item.submit_attempts),
    leads_db: number(item.leads_db),
    hot_leads_db: number(item.hot_leads_db),
    start_to_lead_rate: number(item.start_to_lead_rate),
    submit_to_lead_rate: number(item.submit_to_lead_rate)
  });
  return {
    ...state,
    observation: report.observation ? {
      intervention_id: clean(report.observation.intervention_id, 120),
      analysis_started_at: clean(report.observation.analysis_started_at, 80),
      metric: clean(report.observation.metric, 120),
      minimum_engaged_sessions: number(report.observation.minimum_engaged_sessions),
      engaged_sessions: number(report.observation.engaged_sessions),
      remaining_engaged_sessions: number(report.observation.remaining_engaged_sessions),
      status: clean(report.observation.status, 40)
    } : null,
    historical_context: report.historical_context ? {
      lookback_days: number(report.historical_context.lookback_days),
      tracked_events: number(report.historical_context.tracked_events),
      tracked_sessions: number(report.historical_context.tracked_sessions),
      form_starts: number(report.historical_context.form_starts),
      submit_attempts: number(report.historical_context.submit_attempts),
      leads_db: number(report.historical_context.leads_db),
      pre_intervention_events: number(report.historical_context.pre_intervention_events),
      pre_intervention_leads: number(report.historical_context.pre_intervention_leads)
    } : null,
    summary: {
      lookback_days: number(summary.lookback_days),
      tracked_events: number(summary.tracked_events),
      tracked_sessions: number(summary.tracked_sessions),
      engaged_sessions: number(summary.engaged_sessions),
      leads_db: number(summary.leads_db),
      hot_leads_db: number(summary.hot_leads_db),
      page_views: number(summary.page_views),
      form_starts: number(summary.form_starts),
      submit_attempts: number(summary.submit_attempts),
      submit_errors: number(summary.submit_errors),
      spam_blocks: number(summary.spam_blocks),
      intent_count: number(summary.intent_count),
      urgency_count: number(summary.urgency_count),
      intents_with_leads: number(summary.intents_with_leads),
      attention_count: number(summary.attention_count),
      start_to_lead_rate: number(summary.start_to_lead_rate)
    },
    intent_funnels: Array.isArray(report.intent_funnels) ? report.intent_funnels.slice(0, 10).map(sanitizeFunnel) : [],
    urgency_funnels: Array.isArray(report.urgency_funnels) ? report.urgency_funnels.slice(0, 6).map(sanitizeFunnel) : [],
    recommendations: sanitizeRecommendations(report.recommendations, "target")
  };
}

function sanitizeSourceQuality(report) {
  const state = reportState(report);
  if (!state.available) return state;
  const summary = report.summary || {};
  return {
    ...state,
    summary: {
      lookback_days: number(summary.lookback_days),
      sources: number(summary.sources),
      sessions: number(summary.sessions),
      page_views: number(summary.page_views),
      form_starts: number(summary.form_starts),
      submit_attempts: number(summary.submit_attempts),
      leads_db: number(summary.leads_db),
      hot_leads_db: number(summary.hot_leads_db),
      spam_blocks: number(summary.spam_blocks),
      traffic_rescue_direct_shown: number(summary.traffic_rescue_direct_shown),
      traffic_rescue_direct_clicks: number(summary.traffic_rescue_direct_clicks),
      traffic_rescue_direct_click_rate: number(summary.traffic_rescue_direct_click_rate),
      session_to_lead_rate: number(summary.session_to_lead_rate),
      start_to_lead_rate: number(summary.start_to_lead_rate)
    },
    sources: Array.isArray(report.sources)
      ? report.sources.slice(0, 10).map((item) => ({
          source: clean(item.source, 160),
          sessions: number(item.sessions),
    engaged_sessions: number(item.engaged_sessions),
          form_starts: number(item.form_starts),
          submit_attempts: number(item.submit_attempts),
          leads_db: number(item.leads_db),
          hot_leads_db: number(item.hot_leads_db),
          average_lead_score: number(item.average_lead_score),
          session_to_lead_rate: number(item.session_to_lead_rate),
          start_to_lead_rate: number(item.start_to_lead_rate),
          traffic_rescue_shown: number(item.traffic_rescue_shown),
          traffic_rescue_clicks: number(item.traffic_rescue_clicks),
          traffic_rescue_click_rate: number(item.traffic_rescue_click_rate),
          traffic_rescue_direct_shown: number(item.traffic_rescue_direct_shown),
          traffic_rescue_direct_clicks: number(item.traffic_rescue_direct_clicks),
          traffic_rescue_direct_click_rate: number(item.traffic_rescue_direct_click_rate),
          spam_pressure_rate: number(item.spam_pressure_rate)
        }))
      : [],
    recommendations: sanitizeRecommendations(report.recommendations, "source")
  };
}

function sanitizeSeoBacklog(report) {
  const state = reportState(report);
  if (!state.available) return state;
  const summary = report.summary || {};
  return {
    ...state,
    summary: {
      total_opportunities: number(summary.total_opportunities),
      open_opportunities: number(summary.open_opportunities),
      stale_opportunities: number(summary.stale_opportunities),
      critical_open: number(summary.critical_open),
      high_open: number(summary.high_open),
      conversion_open: number(summary.conversion_open),
      old_open: number(summary.old_open),
      qualified_source_count: number(summary.qualified_source_count),
      top_qualified_source_score: number(summary.top_qualified_source_score),
      top_qualified_source_leads: number(summary.top_qualified_source_leads),
      top_qualified_source_sessions: number(summary.top_qualified_source_sessions),
      top_qualified_source_stage_label: clean(summary.top_qualified_source_stage_label, 160),
      oldest_open_days: number(summary.oldest_open_days),
      average_open_score: number(summary.average_open_score)
    },
    type_breakdown: Array.isArray(report.type_breakdown)
      ? report.type_breakdown.slice(0, 8).map((item) => ({
          opportunity_type: clean(item.opportunity_type, 120),
          count: number(item.count),
          open_count: number(item.open_count),
          max_score: number(item.max_score)
        }))
      : [],
    recommendations: sanitizeRecommendations(report.recommendations, "url")
  };
}

function sanitizeRecommendations(items = [], targetKey = "target") {
  return Array.isArray(items)
    ? items.slice(0, 8).map((item) => ({
        type: clean(item.type, 100),
        severity: clean(item.severity, 40),
        target: clean(item[targetKey] || item.path || item.url || item.target || "", 240),
        signal: clean(item.signal, 300),
        action: clean(item.action, 700),
        score: number(item.score)
      }))
    : [];
}

function severityScore(value) {
  return { critical: 5, high: 4, medium: 3, warn: 2, low: 1 }[String(value || "").toLowerCase()] || 0;
}

function pushAction(actions, type, severity, signal, action, target = "", score = 50) {
  actions.push({ type, severity, signal, action, target, score });
}

function buildPriorityActions(reports) {
  const actions = [];
  if (!reports.production.available) {
    pushAction(actions, "production-monitor-missing", "medium", "rapport production absent", "Planifier ou lancer production:monitor sur le serveur pour consolider health, sauvegarde SQLite et telemetry.", "production:monitor", 74);
  }
  if (reports.production.available && reports.production.success === false) {
    const failed = reports.production.failed_checks?.map((item) => item.name).filter(Boolean).join(", ") || "monitoring";
    pushAction(actions, "production-monitor", "critical", failed, "Corriger le check production en erreur avant de lancer de nouvelles acquisitions.", "runtime-health", 100);
  }
  if (number(reports.lead_sla.summary?.due_now) > 0) {
    pushAction(actions, "lead-sla", number(reports.lead_sla.summary?.due_hot) > 0 ? "critical" : "high", `${reports.lead_sla.summary.due_now} relance(s) due(s)`, "Traiter les leads en retard, puis relancer le moniteur SLA.", "admin/leads", 96);
  }
  if (number(reports.lead_quality.summary?.critical_issues) > 0 || number(reports.lead_quality.summary?.high_issues) > 0) {
    const issue = reports.lead_quality.issues?.[0];
    pushAction(actions, "lead-quality", issue?.severity || "high", issue?.label || "qualite lead", issue?.action || "Corriger les champs de qualification incomplets.", "admin/leads", 90);
  }
  for (const item of reports.conversion_funnel.recommendations || []) {
    pushAction(actions, `funnel-${item.type || "action"}`, item.severity || "medium", item.signal || "fuite tunnel", item.action || "Corriger le tunnel de conversion.", item.target || "conversion", Math.max(70, number(item.score)));
  }
  for (const item of reports.intent_conversion.recommendations || []) {
    pushAction(actions, `intent-${item.type || "action"}`, item.severity || "medium", item.signal || "intention a optimiser", item.action || "Renforcer le parcours d'intention.", item.target || "intentions", Math.max(68, number(item.score)));
  }
  for (const item of reports.source_quality.recommendations || []) {
    pushAction(actions, `source-${item.type || "action"}`, item.severity || "medium", item.signal || "source a optimiser", item.action || "Optimiser la source d'acquisition.", item.target || "sources", Math.max(68, number(item.score)));
  }
  for (const item of reports.seo_backlog.recommendations || []) {
    pushAction(actions, `seo-${item.type || "action"}`, item.severity || "medium", item.signal || "backlog SEO/CRO", item.action || "Traiter le backlog SEO/CRO prioritaire.", item.target || "seo", Math.max(66, number(item.score)));
  }

  return actions
    .sort((a, b) => severityScore(b.severity) - severityScore(a.severity) || number(b.score) - number(a.score))
    .slice(0, 12);
}

function build() {
  const raw = Object.fromEntries(Object.entries(inputs).map(([key, path]) => [key, readJson(path)]));
  const reports = {
    production: sanitizeProduction(raw.production),
    lead_sla: sanitizeLeadSla(raw.lead_sla),
    lead_quality: sanitizeLeadQuality(raw.lead_quality),
    conversion_funnel: sanitizeConversionFunnel(raw.conversion_funnel),
    intent_conversion: sanitizeIntentConversion(raw.intent_conversion),
    source_quality: sanitizeSourceQuality(raw.source_quality),
    seo_backlog: sanitizeSeoBacklog(raw.seo_backlog)
  };
  const priorityActions = buildPriorityActions(reports);
  const availableCount = Object.values(reports).filter((item) => item.available).length;
  const attentionCount = Object.values(reports).filter((item) => bool(item.attention_required) || item.success === false).length;
  const status = !availableCount ? "no-data" : priorityActions.some((item) => item.severity === "critical") ? "critical" : priorityActions.some((item) => item.severity === "high") ? "action-required" : "passed";
  const report = {
    generated_at: new Date().toISOString(),
    status,
    success: status !== "critical",
    attention_required: status !== "passed",
    reports_available: availableCount,
    reports_expected: Object.keys(inputs).length,
    attention_count: attentionCount,
    missing_reports: Object.entries(reports).filter(([, value]) => !value.available).map(([key]) => key),
    reports,
    priority_actions: priorityActions,
    safeguards: [
      "no-pii-public-export",
      "no-raw-lead-records",
      "no-email-phone-name-fields",
      "sqlite-reports-only",
      "aggregate-source-quality",
      "public-aggregate-observability"
    ]
  };
  const runtimeOnly = hasArg("--runtime-only") || env("LOCAL_GROWTH_OPS_RUNTIME_ONLY", "0") === "1";
  const defaultRuntimeOut = join(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets")), "assets", "local-growth-ops-latest.json");
  const runtimeOut = argValue("--runtime-out", env("LOCAL_GROWTH_OPS_RUNTIME_ASSET", runtimeOnly ? defaultRuntimeOut : ""));
  if (runtimeOnly && !runtimeOut) throw new Error("--runtime-only requires --runtime-out, LOCAL_GROWTH_OPS_RUNTIME_ASSET or LOCAL_RUNTIME_ASSETS_ROOT");
  if (!runtimeOnly) {
    writeJson(REPORT_PATH, report);
    writeJson(ASSET_PATH, report);
  }
  if (runtimeOut) writeJson(runtimeOut, report);
  const target = runtimeOnly ? `runtime ${runtimeOut}` : (runtimeOut ? `tracked + runtime ${runtimeOut}` : "tracked");
  console.log(`Local growth ops export: ${status}, ${availableCount}/${Object.keys(inputs).length} report(s), ${priorityActions.length} action(s), target ${target}.`);
}

build();
