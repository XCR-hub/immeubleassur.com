import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { sendNodeSmtpMail } from "./local-smtp.js";

loadDefaultEnvFiles();

const reportsRoot = resolve(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"));
const draftsRoot = resolve(env("LOCAL_EDITORIAL_DRAFT_ROOT", join(reportsRoot, "editorial-drafts")));
const reportPath = resolve(env("LOCAL_EDITORIAL_REVIEW_REPORT", join(reportsRoot, "local-editorial-review-report.json")));
const statePath = resolve(env("LOCAL_EDITORIAL_REVIEW_ALERT_STATE", join(reportsRoot, "editorial-review-alert-state.json")));

function numberEnv(name, fallback) {
  const value = Number(env(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function clean(value, limit = 300) {
  return String(value || "").replace(/[\r\n\0]+/g, " ").trim().slice(0, limit);
}

function safeDiagnostic(value, limit = 240) {
  return clean(value, limit * 2)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email-redacted]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip-redacted]")
    .replace(/\b(bearer|token|password|secret|api[-_ ]?key)\s*[:=]?\s*\S+/gi, "$1 [redacted]")
    .slice(0, limit);
}

function safeSourceUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return ["https:", "http:"].includes(parsed.protocol) ? clean(parsed.toString(), 500) : "";
  } catch {
    return "";
  }
}
function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function pendingDrafts() {
  if (!existsSync(draftsRoot)) return [];
  return readdirSync(draftsRoot)
    .filter((name) => /^news-.*\.json$/i.test(name))
    .map((name) => {
      const path = join(draftsRoot, name);
      const data = readJson(path);
      const pendingStatus = data?.publication_status === "quarantined" || data?.publication_status === "draft_review";
      if (data?.marker !== "editorial-ai-draft-review-v1" || !pendingStatus || data.human_review_required !== true || data.no_auto_publish !== true || data.allowed_publication === true) return null;
      const generatedAt = data.generated_at || statSync(path).mtime.toISOString();
      const reviewFingerprint = createHash("sha256").update(JSON.stringify({
        issue: { slug: data.issue?.slug || "", title: data.issue?.title || "" },
        legal_review: { sensitive: data.legal_review?.sensitive === true, matched_terms: data.legal_review?.matched_terms || [] },
        sources: (data.source_items || []).map((item) => ({ source_id: item.source_id || "", title: item.title || "", url: item.url || "" })),
        synthesis: { provider: data.synthesis?.provider || "", model: data.synthesis?.model || "", status: data.synthesis?.status || "", text: data.synthesis?.text || "" }
      })).digest("hex").slice(0, 20);
      return {
        file: name,
        generated_at: generatedAt,
        publication_status: data.publication_status,
        legacy_format: data.publication_status === "draft_review",
        issue: clean(data.issue?.title || data.issue?.slug || name, 180),
        legal_sensitive: data.legal_review?.sensitive === true,
        matched_terms: (data.legal_review?.matched_terms || []).map((item) => clean(item, 80)).filter(Boolean).slice(0, 12),
        source_count: Array.isArray(data.source_items) ? data.source_items.length : 0,
        source_urls: [...new Set((data.source_items || []).map((item) => safeSourceUrl(item.url)).filter(Boolean))].slice(0, 7),
        provider: clean(data.synthesis?.provider, 80),
        model: clean(data.synthesis?.model, 120),
        review_fingerprint: reviewFingerprint
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.generated_at) - Date.parse(a.generated_at));
}

function signature(drafts) {
  return createHash("sha256").update(drafts.map((draft) => `${draft.file}:${draft.legal_sensitive}:${draft.review_fingerprint}`).sort().join("|")).digest("hex").slice(0, 20);
}

function mailConfig() {
  const from = env("SMTP_FROM", env("SMTP_USER", ""));
  const to = env("LOCAL_EDITORIAL_REVIEW_ALERT_TO", env("SMTP_TO", from));
  return {
    host: env("SMTP_HOST", ""),
    port: numberEnv("SMTP_PORT", 587),
    username: env("SMTP_USER", from),
    password: env("SMTP_PASS", ""),
    from,
    to: String(to || "").split(/[;,]/).map((item) => item.trim()).filter(Boolean).slice(0, 6),
    secureTransport: numberEnv("SMTP_PORT", 587) === 465 ? "on" : "starttls",
    transport: "smtp"
  };
}

function recentAlert(signatureValue, cooldownMinutes) {
  const state = existsSync(statePath) ? readJson(statePath) : null;
  const lastAt = Date.parse(state?.last_alert_at || "");
  return state?.signature === signatureValue && Number.isFinite(lastAt) && Date.now() - lastAt < cooldownMinutes * 60000;
}

async function maybeAlert(report) {
  if (env("LOCAL_EDITORIAL_REVIEW_ALERTS", "0") !== "1" || !report.newest_pending) return { attempted: false, status: "skipped" };
  const cooldownMinutes = report.critical_count > 0
    ? numberEnv("LOCAL_EDITORIAL_REVIEW_CRITICAL_COOLDOWN_MINUTES", 360)
    : report.warning_count > 0
      ? numberEnv("LOCAL_EDITORIAL_REVIEW_WARNING_COOLDOWN_MINUTES", 1440)
      : numberEnv("LOCAL_EDITORIAL_REVIEW_ALERT_COOLDOWN_MINUTES", 1440);
  if (recentAlert(report.signature, cooldownMinutes)) return { attempted: false, status: "cooldown", cooldown_minutes: cooldownMinutes };
  const config = mailConfig();
  if (!config.host || !config.username || !config.password || !config.from || !config.to.length) return { attempted: false, status: "missing-smtp-config" };
  const draft = report.priority_pending || report.newest_pending;
  const urgency = draft.review_severity === "critical" ? "CRITIQUE " : draft.review_severity === "warning" ? "A TRAITER " : "";
  const subject = `Revue editoriale ImmeubleAssur - ${urgency}${draft.legal_sensitive ? "JURIDIQUE " : ""}${basename(draft.file, ".json")}`;
  const text = [
    "Des brouillons IA ImmeubleAssur attendent une revue humaine.",
    "Ils restent en quarantaine et ne peuvent pas etre publies automatiquement.",
    "",
    `Sujet: ${draft.issue}`,
    `Date: ${draft.generated_at}`,
    `Sensibilite juridique: ${draft.legal_sensitive ? "oui" : "non"}`,
    `Termes sensibles: ${draft.matched_terms.join(", ") || "aucun"}`,
    `Sources attribuees: ${draft.source_count}`,
    "Sources officielles/prioritaires:",
    ...(draft.source_urls.length ? draft.source_urls.map((url) => `- ${url}`) : ["- aucune URL exploitable"]),
    "Revue securisee: https://immeubleassur.com/admin#editorial-review",
    `Age de revue: ${draft.age_days} jour(s) - ${draft.review_severity}`,
    `Fichier de revue: ${draft.file}`,
    `Brouillons en attente: ${report.pending_count}`,
    `En avertissement: ${report.warning_count}`,
    `Critiques: ${report.critical_count}`,
    "",
    "File prioritaire:",
    ...report.review_queue.slice(0, 7).map((item) => `- ${item.review_severity.toUpperCase()} | ${item.age_days}j | ${item.legal_sensitive ? "juridique" : "editorial"} | ${item.file}`)
  ].join("\n");
  const message = [`From: ImmeubleAssur Editorial <${config.from}>`, `To: ${config.to.join(", ")}`, `Subject: ${subject}`, `Date: ${new Date(report.generated_at).toUTCString()}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", text].join("\r\n");
  const receipt = await sendNodeSmtpMail(config, message);
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ last_alert_at: new Date().toISOString(), signature: report.signature, file: draft.file }, null, 2)}\n`, "utf8");
  return { attempted: true, status: "sent", transport: config.transport, recipient_is_team: config.to.some((item) => item.toLowerCase() === "team@immeubleassur.com"), receipt: safeDiagnostic(receipt), cooldown_minutes: cooldownMinutes };
}

async function run() {
  const rawDrafts = pendingDrafts();
  const now = Date.now();
  const warningDays = numberEnv("LOCAL_EDITORIAL_REVIEW_WARNING_DAYS", 3);
  const criticalDays = numberEnv("LOCAL_EDITORIAL_REVIEW_CRITICAL_DAYS", 7);
  const drafts = rawDrafts.map((draft) => {
    const ageDays = Math.max(0, Math.round(((now - Date.parse(draft.generated_at)) / 86400000) * 10) / 10);
    return { ...draft, age_days: ageDays, review_severity: ageDays >= criticalDays ? "critical" : ageDays >= warningDays ? "warning" : "pending" };
  });
  const severityRank = { critical: 3, warning: 2, pending: 1 };
  const reviewQueue = [...drafts].sort((a, b) => severityRank[b.review_severity] - severityRank[a.review_severity] || Number(b.legal_sensitive) - Number(a.legal_sensitive) || Date.parse(a.generated_at) - Date.parse(b.generated_at));
  const criticalCount = drafts.filter((draft) => draft.review_severity === "critical").length;
  const warningCount = drafts.filter((draft) => draft.review_severity === "warning").length;
  const report = {
    success: true,
    status: criticalCount ? "review-overdue" : warningCount ? "review-aging" : drafts.length ? "review-pending" : "clear",
    attention_required: drafts.length > 0,
    generated_at: new Date().toISOString(),
    pending_count: drafts.length,
    legal_sensitive_count: drafts.filter((draft) => draft.legal_sensitive).length,
    legacy_format_count: drafts.filter((draft) => draft.legacy_format).length,
    warning_count: warningCount,
    critical_count: criticalCount,
    oldest_age_days: drafts.length ? Math.round(((now - Math.min(...drafts.map((draft) => Date.parse(draft.generated_at)))) / 86400000) * 10) / 10 : 0,
    newest_pending: drafts[0] || null,
    priority_pending: reviewQueue[0] || null,
    review_queue: reviewQueue.slice(0, 30),
    pending: drafts.slice(0, 30),
    signature: signature(drafts),
    alert_policy: {
      enabled: env("LOCAL_EDITORIAL_REVIEW_ALERTS", "0") === "1",
      recipient_is_team: mailConfig().to.some((item) => item.toLowerCase() === "team@immeubleassur.com"),
      warning_cooldown_minutes: numberEnv("LOCAL_EDITORIAL_REVIEW_WARNING_COOLDOWN_MINUTES", 1440),
      critical_cooldown_minutes: numberEnv("LOCAL_EDITORIAL_REVIEW_CRITICAL_COOLDOWN_MINUTES", 360)
    },
    retention: { automatic_deletion: false, review_window_days: numberEnv("LOCAL_EDITORIAL_REVIEW_WINDOW_DAYS", 30), warning_days: warningDays, critical_days: criticalDays },
    safeguards: ["quarantined-only", "metadata-alert-only", "human-review-required", "no-auto-publication", "content-aware-cooldown", "same-content-timestamp-stable", "no-automatic-deletion", "age-based-review-sla", "oldest-critical-first", "actionable-source-links", "admin-review-link", "admin-review-anchor-resolves", "no-local-paths-in-report-or-alert", "smtp-diagnostics-redacted"]
  };
  report.alert = await maybeAlert(report).catch((error) => ({ attempted: true, status: "failed", error: safeDiagnostic(error.message || "editorial review alert failed") }));
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Editorial review monitor: ${report.status}, pending=${report.pending_count}, legal=${report.legal_sensitive_count}, alert=${report.alert.status}.`);
}

run().catch((error) => { console.error(error); process.exit(1); });
