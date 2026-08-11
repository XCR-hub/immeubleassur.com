import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { requireOperationalTeamRecipient, sendNodeSmtpMail } from "./local-smtp.js";
import { readGitRevision } from "./git-revision.js";

loadDefaultEnvFiles();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function numberEnv(name, fallback) {
  const number = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(number) ? number : fallback;
}

function check(name, ok, details = {}, severity = "fail") {
  return { name, ok: Boolean(ok), severity, ...details };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeout_ms || 12000));
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 ImmeubleAssurMonitor",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {}
    return { response, text, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHomepage(origin) {
  try {
    const response = await fetch(`${origin}/`, {
      headers: { "User-Agent": "Mozilla/5.0 ImmeubleAssurMonitor" },
      signal: AbortSignal.timeout(12000)
    });
    const html = await response.text();
    return check("homepage_https", response.ok && html.includes("ImmeubleAssur"), {
      status: response.status,
      bytes: html.length
    });
  } catch (error) {
    return check("homepage_https", false, { error: error.message || "homepage unavailable" });
  }
}

async function checkHealth(origin) {
  try {
    const { response, body } = await fetchJson(`${origin}/health`);
    return check("public_health", response.ok && body?.success === true && body?.status === "ok", {
      status: response.status,
      mode: body?.mode || ""
    });
  } catch (error) {
    return check("public_health", false, { error: error.message || "health unavailable" });
  }
}

async function checkTelemetryFilter(origin) {
  try {
    const payload = {
      event_type: "page_view",
      page_url: "https://invalid-monitor-origin.example/",
      path: "/",
      session_id: `monitor-${Date.now().toString(36)}`,
      target: "production-monitor",
      label: "telemetry-filter-check"
    };
    const { response, body } = await fetchJson(`${origin}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return check("telemetry_filter", response.ok && body?.sampled === false, {
      status: response.status,
      reason: body?.reason || ""
    });
  } catch (error) {
    return check("telemetry_filter", false, { error: error.message || "events unavailable" });
  }
}

function inspectSqlite(dbPath) {
  if (!existsSync(dbPath)) return check("sqlite_database", false, { path: dbPath, error: "missing" });
  const database = new DatabaseSync(dbPath);
  try {
    const integrity = database.prepare("PRAGMA integrity_check").get()?.integrity_check || "unknown";
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => row.name);
    const leads24h = database.prepare("SELECT COUNT(*) AS count FROM leads WHERE created_at >= datetime('now', '-24 hours')").get()?.count || 0;
    const spam24h = database.prepare("SELECT COUNT(*) AS count FROM site_events WHERE event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked') AND created_at >= datetime('now', '-24 hours')").get()?.count || 0;
    return check("sqlite_database", integrity === "ok" && tables.length >= 10, {
      path: dbPath,
      size_bytes: statSync(dbPath).size,
      integrity,
      table_count: tables.length,
      leads_24h: Number(leads24h || 0),
      spam_blocks_24h: Number(spam24h || 0)
    });
  } catch (error) {
    return check("sqlite_database", false, { path: dbPath, error: error.message || "sqlite inspection failed" });
  } finally {
    database.close();
  }
}

function inspectBackup(manifestPath, maxAgeHours) {
  if (!existsSync(manifestPath)) return check("sqlite_backup_age", false, { manifest: manifestPath, error: "missing" });
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const generated = new Date(manifest.generated_at).getTime();
    const ageHours = generated ? Math.round(((Date.now() - generated) / 3600000) * 10) / 10 : 9999;
    const backupFile = resolve(manifest.backup_file || "");
    const fileExists = Boolean(manifest.backup_file && existsSync(backupFile));
    const actualSize = fileExists ? statSync(backupFile).size : 0;
    const actualHash = fileExists ? createHash("sha256").update(readFileSync(backupFile)).digest("hex") : "";
    const artifactVerified = fileExists && actualSize === Number(manifest.size_bytes || 0) && actualHash === manifest.sha256;
    const mirrorRequired = env("LOCAL_SQLITE_BACKUP_MIRROR_REQUIRED", "0") === "1";
    const mirrorFile = resolve(manifest.mirror?.backup_file || "");
    const mirrorExists = Boolean(manifest.mirror?.backup_file && existsSync(mirrorFile));
    const mirrorHash = mirrorExists ? createHash("sha256").update(readFileSync(mirrorFile)).digest("hex") : "";
    const mirrorVerified = mirrorExists && manifest.mirror?.verified === true && manifest.mirror?.integrity === "ok" && mirrorHash === manifest.mirror?.sha256 && mirrorHash === manifest.sha256;
    return check("sqlite_backup_age", manifest.integrity === "ok" && ageHours <= maxAgeHours && artifactVerified && (!mirrorRequired || mirrorVerified), {
      manifest: manifestPath,
      backup_file: manifest.backup_file || "",
      integrity: manifest.integrity || "",
      table_count: manifest.table_count || 0,
      age_hours: ageHours,
      max_age_hours: maxAgeHours,
      artifact_exists: fileExists,
      artifact_verified: artifactVerified,
      size_bytes: actualSize,
      mirror_required: mirrorRequired,
      mirror_file: manifest.mirror?.backup_file || "",
      mirror_exists: mirrorExists,
      mirror_verified: mirrorVerified
    });
  } catch (error) {
    return check("sqlite_backup_age", false, { manifest: manifestPath, error: error.message || "backup manifest unreadable" });
  }
}

function reportAgeMinutes(report) {
  const timestamp = Date.parse(report?.generated_at || "");
  return Number.isFinite(timestamp) ? Math.round(((Date.now() - timestamp) / 60000) * 10) / 10 : 999999;
}

function currentSourceRevision() { return readGitRevision(); }

function inspectProductionCheckout(reportPath) {
  if (!existsSync(reportPath)) return check("production_checkout_update", false, { path: reportPath, error: "missing" });
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const requiredSafeguards = ["named-checkout-mutex", "clean-worktree-required", "fast-forward-only", "branch-pinned", "runtime-revision-verified", "no-local-paths"];
    const revisionBefore = String(report.revision_before || "");
    const revisionAfter = String(report.revision_after || "");
    const sourceRevision = currentSourceRevision();
    const ageMinutes = reportAgeMinutes(report);
    const maxAgeMinutes = numberEnv("LOCAL_PRODUCTION_CHECKOUT_UPDATE_MAX_AGE_MINUTES", 30);
    const fresh = ageMinutes >= -5 && ageMinutes <= maxAgeMinutes;
    const safeguardsVerified = requiredSafeguards.every((item) => report.safeguards?.includes(item));
    const ok = fresh && ["updated", "validated"].includes(report.status) && /^[a-f0-9]{40}$/.test(revisionBefore) && /^[a-f0-9]{40}$/.test(revisionAfter) && revisionAfter === sourceRevision && report.runtime_revision_verified === true && report.served_revision === revisionAfter && (!report.validate_only || revisionBefore === revisionAfter) && safeguardsVerified && !report.error;
    return check("production_checkout_update", ok, { path: reportPath, status: report.status || "unknown", validate_only: report.validate_only === true, age_minutes: ageMinutes, max_age_minutes: maxAgeMinutes, fresh, revision_matches_runtime: revisionAfter === sourceRevision, served_revision_matches: report.served_revision === revisionAfter, runtime_revision_verified: report.runtime_revision_verified === true, safeguards_verified: safeguardsVerified, duration_seconds: Number(report.duration_seconds || 0) });
  } catch (error) {
    return check("production_checkout_update", false, { path: reportPath, error: error.message || "deployment report unreadable" });
  }
}

function inspectJsonRuntime(name, reportPath, maxAgeMinutes, validate, details = () => ({})) {
  if (!existsSync(reportPath)) return check(name, false, { path: reportPath, error: "missing" });
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const ageMinutes = reportAgeMinutes(report);
    return check(name, ageMinutes <= maxAgeMinutes && validate(report), { path: reportPath, status: report.status || "", age_minutes: ageMinutes, max_age_minutes: maxAgeMinutes, ...details(report) });
  } catch (error) {
    return check(name, false, { path: reportPath, error: error.message || "runtime report unreadable" });
  }
}
function inspectLeadSla(reportPath) {
  const result = inspectJsonRuntime("lead_sla", reportPath, 45, (report) => report.success === true && report.alert_delivery_verified === true, (report) => ({ due_now: Number(report.summary?.due_now || 0), due_hot: Number(report.summary?.due_hot || 0), open_leads: Number(report.summary?.open_leads || 0), oldest_due_hours: Number(report.summary?.oldest_due_hours || 0), alert_status: report.alert?.status || "", alert_delivery_required: report.alert_delivery_required === true, alert_delivery_verified: report.alert_delivery_verified === true }));
  if (result.ok && result.due_now > 0) return { ...result, ok: false, severity: "warn", reason: "lead-sla-due-alerted" };
  return result;
}

function inspectGithubWorkflowHealth(reportPath) {
  const result = inspectJsonRuntime("github_workflow_health", reportPath, 90, (report) => report.success === true && Number(report.summary?.failed || 0) === 0, (report) => ({ status: report.status || "", expected: Number(report.summary?.expected || 0), healthy: Number(report.summary?.healthy || 0), scheduled_success: Number(report.summary?.scheduled_success || 0), recovered: Number(report.summary?.recovered || 0), failed: Number(report.summary?.failed || 0), schedule_grace_minutes: Number(report.schedule_grace_minutes || 0), proof_due_at: (report.workflows || []).map((row) => row.scheduled_proof_due_at).filter(Boolean).sort()[0] || "" }));
  if (result.ok && result.status === "recovered-awaiting-schedule") return { ...result, ok: false, severity: "warn", reason: "scheduled-run-awaiting-proof" };
  return result;
}

function inspectGoogleReadiness(reportPath) {
  if (!existsSync(reportPath)) return check("google_search_console", false, { path: reportPath, error: "missing" });
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const ageMinutes = reportAgeMinutes(report);
    const gscAction = (report.actions || []).find((item) => item.id === "google-search-console");
    const fresh = ageMinutes <= 90;
    const ready = fresh && !gscAction && ["ready", "degraded"].includes(report.status);
    return check("google_search_console", ready, { path: reportPath, status: ready ? "ready" : gscAction?.reason || report.status || "unknown", age_minutes: ageMinutes, max_age_minutes: 90, configured: !gscAction, missing_configuration: gscAction?.reason === "missing-secret", connector_signal: gscAction?.signal || "Search Console connector ready", secret_values_exported: false }, fresh ? "warn" : "fail");
  } catch (error) {
    return check("google_search_console", false, { path: reportPath, error: error.message || "google readiness report unreadable" });
  }
}

function inspectSearchIntelligence(reportPath) {
  if (!existsSync(reportPath)) return check("serp_measurement", false, { path: reportPath, error: "missing" });
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const ageMinutes = reportAgeMinutes(report);
    const measured = Number(report.measured_count || 0);
    const fallback = Number(report.fallback_count || 0);
    const fresh = ageMinutes <= 390;
    const trustworthy = fresh && measured > 0 && report.confidence !== "low" && report.rate_limited !== true;
    return check("serp_measurement", trustworthy, { path: reportPath, status: report.status || "unknown", age_minutes: ageMinutes, max_age_minutes: 390, provider: report.provider || "", confidence: report.confidence || "unknown", measured_queries: measured, fallback_queries: fallback, rate_limited: report.rate_limited === true, request_count: Number(report.serp_request_count || 0), fallback_positions_treated_as_measured: false }, fresh ? "warn" : "fail");
  } catch (error) {
    return check("serp_measurement", false, { path: reportPath, error: error.message || "search intelligence report unreadable" });
  }
}

function inspectSeoAutopilot(reportPath) {
  return inspectJsonRuntime("seo_autopilot_public", reportPath, 90, (report) => {
    const rankings = Array.isArray(report.search_intelligence?.rankings) ? report.search_intelligence.rankings : [];
    const measuredQueries = new Set(rankings.filter((row) => row.measured === true && row.actionable === true && row.data_source === "serpapi" && row.confidence === "measured").map((row) => row.query));
    const fallbackUnsafe = rankings.some((row) => row.measured !== true && (row.actionable === true || row.recommendation));
    const rankingActions = (report.google_feedback_loop?.actions || []).filter((row) => row.source === "search-intelligence" && row.query);
    return !fallbackUnsafe && rankingActions.every((row) => measuredQueries.has(row.query));
  }, (report) => ({
    measured_queries: Number(report.search_intelligence?.measured_count || 0),
    fallback_queries: Number(report.search_intelligence?.fallback_count || 0),
    ranking_actions: (report.google_feedback_loop?.actions || []).filter((row) => row.source === "search-intelligence" && row.query).length,
    fallback_actions_blocked: true
  }));
}
function inspectEditorialReview(reportPath) {
  if (!existsSync(reportPath)) return check("editorial_review_sla", false, { path: reportPath, error: "missing" });
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const ageMinutes = reportAgeMinutes(report);
    const critical = Number(report.critical_count || 0);
    const warning = Number(report.warning_count || 0);
    const fresh = ageMinutes <= 90;
    const deliveryVerified = report.alert_delivery_verified === true;
    const ok = fresh && report.success === true && deliveryVerified && critical === 0 && warning === 0;
    const severity = fresh && report.success === true && deliveryVerified && critical === 0 && warning > 0 ? "warn" : "fail";
    return check("editorial_review_sla", ok, { path: reportPath, status: report.status || "unknown", age_minutes: ageMinutes, max_age_minutes: 90, pending: Number(report.pending_count || 0), warning, critical, oldest_age_days: Number(report.oldest_age_days || 0), priority_file: report.priority_pending?.file || "", alert_status: report.alert?.status || "", alert_delivery_required: report.alert_delivery_required === true, alert_delivery_verified: deliveryVerified }, severity);
  } catch (error) {
    return check("editorial_review_sla", false, { path: reportPath, error: error.message || "editorial review unreadable" });
  }
}
function inspectIndexNow(reportPath) {
  if (!existsSync(reportPath)) return check("indexnow", false, { path: reportPath, error: "missing" });
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const ageMinutes = reportAgeMinutes(report);
    const fresh = Number.isFinite(ageMinutes) && ageMinutes <= 390;
    const activeSitemapVerified = report.sitemap_source === "active-runtime-publication" && report.sitemap_manifest_verified === true;
    const healthy = fresh && report.success === true && ["submitted", "no-changes"].includes(report.status) && report.key_publicly_verifiable === true && activeSitemapVerified;
    const degraded = fresh && (["network-degraded", "provider-degraded"].includes(report.status) || (report.success === true && !activeSitemapVerified));
    return check("indexnow", healthy, { path: reportPath, status: report.status || "unknown", age_minutes: ageMinutes, max_age_minutes: 390, sitemap_source: report.sitemap_source || "unknown", sitemap_manifest_verified: report.sitemap_manifest_verified === true, sitemap_urls: Number(report.sitemap_urls || 0), changed_urls: Number(report.changed_urls || 0), submitted_urls: Number(report.submitted_urls || 0), http_status: Number(report.http_status || 0), ranking_guaranteed: false }, degraded ? "warn" : "fail");
  } catch (error) {
    return check("indexnow", false, { path: reportPath, error: error.message || "indexnow report unreadable" });
  }
}
function inspectEditorialHealth(reportPath) {
  if (!existsSync(reportPath)) return check("editorial_health", false, { path: reportPath, error: "missing" });
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const issue = Array.isArray(report.issues) ? report.issues[0] : null;
    const coverageWarning = issue?.type === "editorial-business-coverage-gap";
    return check("editorial_health", report.success === true && report.attention_required !== true, {
      path: reportPath,
      status: report.status || "unknown",
      publication_status: report.publication_status || "unknown",
      consecutive_holds: Number(report.consecutive_holds || 0),
      latest_edition: report.latest_valid_edition?.date || "",
      latest_edition_age_days: report.latest_valid_edition?.age_days ?? null,
      reason: issue?.type || "",
      freshness_gaps: Array.isArray(issue?.freshness_gaps) ? issue.freshness_gaps.slice(0, 8) : [],
      gate_reasons: report.publication_gate?.reasons || []
    }, coverageWarning ? "warn" : "fail");
  } catch (error) {
    return check("editorial_health", false, { path: reportPath, error: error.message || "editorial health unreadable" });
  }
}
function mailConfig() {
  const resendMode = env("EMAIL_TRANSPORT", "smtp").toLowerCase() === "resend";
  const from = env("SMTP_FROM", env("RESEND_FROM", env("SMTP_USER", "")));
  const to = env("LOCAL_MONITOR_ALERT_TO", env("SMTP_TO", from));
  const recipients = String(to || "").split(/[;,]/).map((item) => item.trim()).filter(Boolean).slice(0, 6);
  if (resendMode && env("RESEND_API_KEY", "") && from && recipients.length) {
    return { host: "resend", port: 443, username: "", password: "", from, to: recipients, secureTransport: "https", transport: "resend" };
  }
  return {
    host: env("SMTP_HOST", ""),
    port: numberEnv("SMTP_PORT", 587),
    username: env("SMTP_USER", from),
    password: env("SMTP_PASS", ""),
    from,
    to: recipients,
    secureTransport: numberEnv("SMTP_PORT", 587) === 465 ? "on" : "starttls",
    transport: "smtp"
  };
}

function alertStatePath(reportPath) {
  return resolve(env("LOCAL_MONITOR_ALERT_STATE", join(dirname(reportPath), "alert-state.json")));
}

function alertSignature(report) {
  return report.checks.filter((item) => !item.ok).map((item) => item.name).sort().join("+") || "ok";
}

function recentlyAlerted(statePath, signature, cooldownMinutes) {
  if (!existsSync(statePath)) return false;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const lastAt = new Date(state.last_alert_at).getTime();
    return state.signature === signature && lastAt && Date.now() - lastAt < cooldownMinutes * 60000;
  } catch {
    return false;
  }
}

function writeAlertState(statePath, signature) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ last_alert_at: new Date().toISOString(), signature }, null, 2)}\n`, "utf8");
}

async function maybeAlert(report, reportPath) {
  const alertableWarnings = report.checks.filter((item) => !item.ok && item.severity === "warn" && item.name === "editorial_health" && item.reason === "editorial-business-coverage-gap");
  if (env("LOCAL_MONITOR_ALERTS", "0") !== "1" || (report.success && alertableWarnings.length === 0)) return { attempted: false, status: "skipped" };
  const signature = alertSignature(report);
  const statePath = alertStatePath(reportPath);
  const cooldownMinutes = numberEnv("LOCAL_MONITOR_ALERT_COOLDOWN_MINUTES", 60);
  if (recentlyAlerted(statePath, signature, cooldownMinutes)) {
    return { attempted: false, status: "cooldown", cooldown_minutes: cooldownMinutes };
  }

  const config = mailConfig();
  requireOperationalTeamRecipient(config);
  const resendMode = env("EMAIL_TRANSPORT", "smtp").toLowerCase() === "resend";
  const transportReady = resendMode
    ? Boolean(env("RESEND_API_KEY", "") && config.from && config.to.length)
    : Boolean(config.host && config.username && config.password && config.from && config.to.length);
  if (!transportReady) {
    return { attempted: false, status: resendMode ? "missing-resend-config" : "missing-smtp-config", transport: config.transport };
  }
  const failed = report.checks.filter((item) => !item.ok);
  const text = [
    `Alerte ImmeubleAssur production monitor`,
    `Date: ${report.generated_at}`,
    `Origin: ${report.origin}`,
    "",
    ...failed.map((item) => `- ${item.name}: ${item.error || item.reason || item.status || "failed"}`)
  ].join("\n");
  const message = [
    `From: ImmeubleAssur Monitor <${config.from}>`,
    `To: ${config.to.join(", ")}`,
    `Subject: Alerte ImmeubleAssur production`,
    `Date: ${new Date(report.generated_at).toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text
  ].join("\r\n");
  const receipt = await sendNodeSmtpMail(config, message);
  writeAlertState(statePath, signature);
  return { attempted: true, status: "sent", transport: config.transport, receipt, cooldown_minutes: cooldownMinutes };
}

async function run() {
  const origin = cleanUrl(argValue("--origin", env("SITE_ORIGIN", "https://immeubleassur.com")));
  const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
  const backupDir = resolve(argValue("--backup-dir", env("LOCAL_SQLITE_BACKUP_DIR", join("backups", "sqlite"))));
  const backupManifest = resolve(argValue("--backup-manifest", join(backupDir, "latest.json")));
  const maxBackupAgeHours = numberEnv("LOCAL_SQLITE_BACKUP_MAX_AGE_HOURS", 8);
  const runtimeReportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"));
  const editorialHealthPath = resolve(env("LOCAL_EDITORIAL_HEALTH_REPORT", join(runtimeReportsRoot, "local-editorial-health-report.json")));
  const editorialReviewPath = resolve(env("LOCAL_EDITORIAL_REVIEW_REPORT", join(runtimeReportsRoot, "local-editorial-review-report.json")));
  const tlsReportPath = resolve(env("LOCAL_TLS_REPORT", join(runtimeReportsRoot, "local-tls-certificate-report.json")));
  const smtpReportPath = resolve(env("LOCAL_SMTP_HEALTH_REPORT", join(runtimeReportsRoot, "local-smtp-health-report.json")));
  const notificationRetryPath = resolve(env("LOCAL_NOTIFICATION_RETRY_REPORT", join(runtimeReportsRoot, "local-lead-notification-retry-report.json")));
  const leadSlaPath = resolve(env("LOCAL_LEAD_SLA_REPORT", join(runtimeReportsRoot, "local-lead-sla-report.json")));
  const leadCanaryPath = resolve(env("LOCAL_LEAD_CANARY_REPORT", join(runtimeReportsRoot, "lead-dedupe-runtime-report.json")));
  const newsletterReportPath = resolve(env("LOCAL_NEWSLETTER_DELIVERY_REPORT", join(runtimeReportsRoot, "local-newsletter-delivery-report.json")));
  const googleReadinessPath = resolve(env("LOCAL_GOOGLE_READINESS_REPORT", join(runtimeReportsRoot, "google-readiness-unlock-report.json")));
  const searchIntelligencePath = resolve(env("LOCAL_SEARCH_INTELLIGENCE_REPORT", join(runtimeReportsRoot, "search-intelligence-report.json")));
  const seoAutopilotPublicPath = resolve(env("LOCAL_SEO_AUTOPILOT_PUBLIC_REPORT", join(env("LOCAL_RUNTIME_ASSETS_ROOT", join(runtimeReportsRoot, "..")), "assets", "seo-autopilot-latest.json")));
  const indexNowPath = resolve(env("LOCAL_INDEXNOW_REPORT", join(runtimeReportsRoot, "local-indexnow-report.json")));
  const privacyRetentionPath = resolve(env("LOCAL_PRIVACY_RETENTION_REPORT", join(runtimeReportsRoot, "local-privacy-retention-report.json")));
  const newsletterCanaryPath = resolve(env("LOCAL_NEWSLETTER_CANARY_REPORT", join(runtimeReportsRoot, "newsletter-runtime-canary-report.json")));
  const runtimeCyclePath = resolve(env("LOCAL_RUNTIME_CYCLE_REPORT", join(runtimeReportsRoot, "local-runtime-report-cycle.json")));
  const securitySurfacePath = resolve(env("LOCAL_SECURITY_SURFACE_REPORT", join(runtimeReportsRoot, "local-security-surface-report.json")));
  const dependencySecurityPath = resolve(env("LOCAL_DEPENDENCY_SECURITY_REPORT", join(runtimeReportsRoot, "local-dependency-security-report.json")));
  const scheduledTaskHealthPath = resolve(env("LOCAL_SCHEDULED_TASK_HEALTH_REPORT", join(runtimeReportsRoot, "local-scheduled-task-health-report.json")));
  const githubWorkflowHealthPath = resolve(env("LOCAL_GITHUB_WORKFLOW_HEALTH_REPORT", join(runtimeReportsRoot, "local-github-workflow-health-report.json")));
  const turnstileBrowserPath = resolve(env("LOCAL_TURNSTILE_BROWSER_REPORT", join(runtimeReportsRoot, "local-turnstile-browser-smoke-report.json")));
  const restoreDrillPath = resolve(env("LOCAL_SQLITE_RESTORE_DRILL_REPORT", join(runtimeReportsRoot, "local-sqlite-restore-drill-report.json")));
  const siteWatchdogPath = resolve(env("LOCAL_SITE_WATCHDOG_REPORT", join(runtimeReportsRoot, "local-site-watchdog-report.json")));
  const productionCheckoutUpdatePath = resolve(env("LOCAL_PRODUCTION_CHECKOUT_UPDATE_REPORT", join(runtimeReportsRoot, "local-production-checkout-update-report.json")));
  const out = resolve(argValue("--out", env("LOCAL_PRODUCTION_MONITOR_REPORT", join("reports", "local-production-monitor-report.json"))));

  const checks = [
    await checkHomepage(origin),
    await checkHealth(origin),
    await checkTelemetryFilter(origin),
    inspectSqlite(dbPath),
    inspectBackup(backupManifest, maxBackupAgeHours),
    inspectProductionCheckout(productionCheckoutUpdatePath),
    inspectJsonRuntime("sqlite_restore_drill", restoreDrillPath, 90, (report) => report.status === "passed" && report.source_hash_verified === true && report.integrity === "ok" && report.foreign_key_violations === 0 && report.table_count >= 10, (report) => ({ source_type: report.source_type || "", integrity: report.integrity || "", table_count: Number(report.table_count || 0), total_rows: Number(report.total_rows || 0) })),
    inspectEditorialHealth(editorialHealthPath),
    inspectGoogleReadiness(googleReadinessPath),
    inspectSearchIntelligence(searchIntelligencePath),
    inspectSeoAutopilot(seoAutopilotPublicPath),
    inspectIndexNow(indexNowPath),
    inspectJsonRuntime("privacy_retention", privacyRetentionPath, 90, (report) => report.success === true && report.status === "applied" && report.policy?.lead_contact_data_deleted === false && report.policy?.newsletter_suppression_data_deleted === false && report.safeguards?.includes("transactional") && report.safeguards?.includes("no-pii-in-report"), (report) => ({ mode: report.database?.mode || "", technical_identifiers_days: Number(report.policy?.technical_identifiers_days || 0), telemetry_days: Number(report.policy?.telemetry_days || 0), rows_changed: Object.values(report.changes || {}).reduce((sum, value) => sum + Number(value || 0), 0), lead_contact_data_deleted: report.policy?.lead_contact_data_deleted === true, newsletter_suppression_data_deleted: report.policy?.newsletter_suppression_data_deleted === true })),
    inspectEditorialReview(editorialReviewPath),
    inspectJsonRuntime("tls_certificate", tlsReportPath, 90, (report) => report.ok === true && ["healthy", "warning"].includes(report.status), (report) => ({ days_remaining: report.days_remaining })),
    inspectJsonRuntime("smtp_transport", smtpReportPath, 90, (report) => report.status === "ready" && report.authenticated === true && report.team_recipient_configured === true && (report.transport === "resend" || report.recipient_accepted === true), (report) => ({ authenticated: report.authenticated === true, transport: report.transport || report.provider || "smtp", team_recipient_configured: report.team_recipient_configured === true, recipient_accepted: report.recipient_accepted === true, message_sent: report.message_sent === true })),
    inspectJsonRuntime("lead_notification_backlog", notificationRetryPath, 90, (report) => report.status === "completed" && report.failed === 0 && report.overdue === 0 && report.exhausted === 0, (report) => ({ pending: Number(report.pending || 0), overdue: Number(report.overdue || 0), exhausted: Number(report.exhausted || 0), oldest_pending_hours: Number(report.oldest_pending_hours || 0) })),
    inspectLeadSla(leadSlaPath),
    inspectJsonRuntime("lead_submission_canary", leadCanaryPath, 90, (report) => report.status === "passed" && report.success === true && Number(report.counts?.leads || 0) === 3 && Number(report.counts?.duplicate_site_events || 0) === 2 && report.concurrent?.verified === true && Number(report.concurrent?.created || 0) === 1 && Number(report.concurrent?.duplicates || 0) === 1 && report.concurrent?.same_id === true && report.concurrent?.same_reference === true && report.concurrent?.duplicate_notification === "skipped" && Number(report.counts?.email_notification_events || 0) === 2 && report.first?.success === true && report.second?.duplicate === true && report.express?.success === true && report.express?.placeholders_ok === true && report.notification_capture?.verified === true && report.notification_capture?.recipient_is_team === true, (report) => ({ leads: Number(report.counts?.leads || 0), duplicate_events: Number(report.counts?.duplicate_site_events || 0), concurrent_verified: report.concurrent?.verified === true, concurrent_created: Number(report.concurrent?.created || 0), concurrent_duplicates: Number(report.concurrent?.duplicates || 0), concurrent_notification_skipped: report.concurrent?.duplicate_notification === "skipped", email_notifications: Number(report.counts?.email_notification_events || 0), first_success: report.first?.success === true, duplicate_filtered: report.second?.duplicate === true, express_success: report.express?.success === true, notification_captured: report.notification_capture?.verified === true, recipient_is_team: report.notification_capture?.recipient_is_team === true, external_delivery: false })),
    inspectJsonRuntime("newsletter_runtime_canary", newsletterCanaryPath, 90, (report) => report.status === "passed" && report.success === true && report.subscription?.consent_refused === true && Number(report.subscription?.subscribers || 0) === 1 && report.delivery?.capture_verified === true && report.delivery?.external_delivery === false && Number(report.delivery?.sent_events || 0) === 1 && Number(report.delivery?.second_sent || 0) === 0 && report.unsubscribe?.confirmed === true && Number(report.unsubscribe?.inactive_subscribers || 0) === 1, (report) => ({ consent_refused: report.subscription?.consent_refused === true, subscribers: Number(report.subscription?.subscribers || 0), capture_verified: report.delivery?.capture_verified === true, sent_events: Number(report.delivery?.sent_events || 0), second_sent: Number(report.delivery?.second_sent || 0), unsubscribe_confirmed: report.unsubscribe?.confirmed === true, inactive_subscribers: Number(report.unsubscribe?.inactive_subscribers || 0), external_delivery: false })),
    inspectJsonRuntime("newsletter_delivery", newsletterReportPath, 90, (report) => ["no-active-subscribers", "up-to-date", "completed", "batch-completed", "synced-awaiting-auto-send"].includes(report.status) && report.issue_synced === true && report.failed === 0, (report) => ({ issue_synced: report.issue_synced === true, auto_send: report.auto_send === true, active_subscribers: Number(report.active_subscribers || 0), failed: Number(report.failed || 0) })),
    ...(env("LOCAL_PRODUCTION_MONITOR_SKIP_RUNTIME_CYCLE", "0") === "1" ? [] : [inspectJsonRuntime("runtime_cycle_freshness", runtimeCyclePath, 90, (report) => report.success === true, (report) => ({ steps: Array.isArray(report.steps) ? report.steps.length : 0 }))]),
    inspectJsonRuntime("security_surface", securitySurfacePath, 90, (report) => report.success === true && report.summary?.failed === 0, (report) => ({ checks: Array.isArray(report.checks) ? report.checks.length : 0, failed: Number(report.summary?.failed || 0), schedule_grace_minutes: Number(report.schedule_grace_minutes || 0), proof_due_at: (report.workflows || []).map((row) => row.scheduled_proof_due_at).filter(Boolean).sort()[0] || "" })),
    inspectJsonRuntime("dependency_security", dependencySecurityPath, 1560, (report) => report.success === true && Number(report.blocking || 0) === 0, (report) => ({ registry_checked: report.registry_checked === true, vulnerabilities: Number(report.summary?.total || 0), high: Number(report.summary?.high || 0), critical: Number(report.summary?.critical || 0) })),
    inspectJsonRuntime("scheduled_task_health", scheduledTaskHealthPath, 90, (report) => report.success === true && Number(report.summary?.unhealthy || 0) === 0, (report) => ({ expected: Number(report.summary?.expected || 0), healthy: Number(report.summary?.healthy || 0), unhealthy: Number(report.summary?.unhealthy || 0) })),
    inspectGithubWorkflowHealth(githubWorkflowHealthPath),
    inspectJsonRuntime("turnstile_browser", turnstileBrowserPath, 390, (report) => report.status === "healthy" && report.destructive === false && report.telemetry_isolated === true && Number(report.submitted_forms || 0) === 0 && Number(report.scenarios_passed || 0) === Number(report.scenarios_checked || 0) && Number(report.scenarios_checked || 0) >= 2, (report) => ({ destructive: report.destructive === true, submitted_forms: Number(report.submitted_forms || 0), telemetry_isolated: report.telemetry_isolated === true, telemetry_posts_blocked: Number(report.telemetry_posts_blocked || 0), scenarios_checked: Number(report.scenarios_checked || 0), scenarios_passed: Number(report.scenarios_passed || 0) })),
    inspectJsonRuntime("site_watchdog", siteWatchdogPath, 20, (report) => ["healthy", "recovered"].includes(report.status) && (report.details?.health_before?.ok === true || report.details?.health_after?.ok === true), (report) => ({ action: report.details?.action || "", port: Number(report.port || 0), marker: report.marker || "" }))
  ];

  const report = {
    success: checks.every((item) => item.ok || item.severity === "warn"),
    generated_at: new Date().toISOString(),
    origin,
    checks,
    summary: {
      ok: checks.filter((item) => item.ok).length,
      failed: checks.filter((item) => !item.ok && item.severity !== "warn").length,
      warnings: checks.filter((item) => !item.ok && item.severity === "warn").length
    }
  };
  report.alert = await maybeAlert(report, out).catch((error) => ({ attempted: true, status: "failed", error: error.message || "alert failed" }));

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Production monitor: ${report.success ? "ok" : "failed"} (${report.summary.ok}/${checks.length} checks ok)`);
  console.log(`Report: ${out}`);
  if (!report.success) process.exitCode = 1;
}

run();
