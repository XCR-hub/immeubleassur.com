import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { sendNodeSmtpMail } from "./local-smtp.js";

loadDefaultEnvFiles();

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");

function numberEnv(name, fallback) {
  const value = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(value) ? value : fallback;
}

function clean(value, max = 500) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

function recipients(value) {
  return String(value || "").split(/[;,]/).map((item) => item.trim()).filter(Boolean).slice(0, 6);
}

function mailConfig() {
  const from = env("SMTP_FROM", env("RESEND_FROM", env("SMTP_USER", "")));
  return {
    host: env("SMTP_HOST", ""),
    port: numberEnv("SMTP_PORT", 587),
    username: env("SMTP_USER", from),
    password: env("SMTP_PASS", ""),
    from,
    to: recipients(env("SMTP_TO", env("CONTACT_EMAIL", from))),
    secureTransport: numberEnv("SMTP_PORT", 587) === 465 ? "on" : "starttls"
  };
}

function candidates(database, cooldownMinutes, maxAttempts, recoveryProbeMinutes, limit) {
  return database.prepare(`
    SELECT l.*, MAX(f.created_at) AS failed_at,
      (SELECT COUNT(*) FROM lead_events r WHERE r.lead_id = l.id AND r.event_type = 'email_notification_retry_failed') AS retry_failures,
      (SELECT MAX(r.created_at) FROM lead_events r WHERE r.lead_id = l.id AND r.event_type IN ('email_notification_retry_failed', 'email_notification_retry_sent')) AS last_retry_at
    FROM leads l
    JOIN lead_events f ON f.lead_id = l.id AND f.event_type = 'email_notification_failed'
    WHERE NOT EXISTS (
      SELECT 1 FROM lead_events ok
      WHERE ok.lead_id = l.id AND ok.event_type IN ('email_notification_sent', 'email_notification_retry_sent')
    )
    GROUP BY l.id
    HAVING (
      retry_failures < ? AND datetime(COALESCE(last_retry_at, failed_at)) <= datetime('now', ?)
    ) OR (
      retry_failures >= ? AND datetime(COALESCE(last_retry_at, failed_at)) <= datetime('now', ?)
    )
    ORDER BY datetime(failed_at) ASC
    LIMIT ?
  `).all(maxAttempts, `-${cooldownMinutes} minutes`, maxAttempts, `-${recoveryProbeMinutes} minutes`, limit);
}

function backlog(database, maxAttempts, overdueMinutes) {
  return database.prepare(`
    SELECT COUNT(*) AS pending,
      SUM(CASE WHEN retry_failures >= ? THEN 1 ELSE 0 END) AS exhausted,
      SUM(CASE WHEN retry_failures < ? AND datetime(last_activity_at) <= datetime('now', ?) THEN 1 ELSE 0 END) AS overdue,
      MIN(failed_at) AS oldest_failed_at
    FROM (
      SELECT l.id, MAX(f.created_at) AS failed_at,
        (SELECT COUNT(*) FROM lead_events r WHERE r.lead_id = l.id AND r.event_type = 'email_notification_retry_failed') AS retry_failures,
        COALESCE((SELECT MAX(r.created_at) FROM lead_events r WHERE r.lead_id = l.id AND r.event_type IN ('email_notification_retry_failed', 'email_notification_retry_sent')), MAX(f.created_at)) AS last_activity_at
      FROM leads l
      JOIN lead_events f ON f.lead_id = l.id AND f.event_type = 'email_notification_failed'
      WHERE NOT EXISTS (SELECT 1 FROM lead_events ok WHERE ok.lead_id = l.id AND ok.event_type IN ('email_notification_sent', 'email_notification_retry_sent'))
      GROUP BY l.id
    ) pending_notifications
  `).get(maxAttempts, maxAttempts, `-${overdueMinutes} minutes`);
}
function messageFor(lead, attempt, now, config) {
  const reference = clean(lead.reference, 80);
  const subject = `Reprise notification lead ${reference}${lead.email ? "" : " - TELEPHONE SEUL"} - ${clean(lead.city || "ville non precisee", 120)}`;
  const body = [
    "Notification ImmeubleAssur reprise automatiquement après un échec temporaire.",
    `Référence: ${reference}`,
    `Tentative de reprise: ${attempt}`,
    `Créé le: ${clean(lead.created_at, 80)}`,
    "",
    `Nom: ${clean(lead.name, 160)}`,
    `Téléphone: ${clean(lead.phone, 80)}`,
    `Email: ${clean(lead.email, 180) || "non renseigne - contacter par telephone"}`,
    `Profil: ${clean(lead.profile, 100)}`,
    `Type de bien: ${clean(lead.property_type, 100)}`,
    `Ville: ${clean(lead.city, 120)}`,
    `Lots: ${clean(lead.units_count || "non précisé", 40)}`,
    `Besoin: ${clean(lead.need || "non précisé", 120)}`,
    `Score: ${Number(lead.lead_score || 0)}`,
    "",
    `Message: ${clean(lead.message || "Aucun message", 2000)}`,
    `Page: ${clean(lead.page_url || "non précisée", 500)}`,
    `Source: ${clean(lead.source || "website", 120)}`
  ].join("\n");
  const headers = [
    `From: ImmeubleAssur <${clean(config.from, 180)}>`,
    `To: ${config.to.map((item) => clean(item, 180)).join(", ")}`,
    ...(lead.email ? [`Reply-To: ${clean(lead.email, 180)}`] : []),
    `Subject: ${clean(subject, 240)}`,
    `Date: ${new Date(now).toUTCString()}`,
    `Message-ID: <retry.${reference}.${attempt}@immeubleassur.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit"
  ];
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

function logEvent(database, lead, eventType, payload, now) {
  database.prepare("INSERT INTO lead_events (id, lead_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(randomUUID(), lead.id, eventType, JSON.stringify(payload), now);
}

async function run() {
  const dbPath = resolve(env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite")));
  const reportPath = resolve(env("LOCAL_NOTIFICATION_RETRY_REPORT", join("reports", "local-lead-notification-retry-report.json")));
  const cooldownMinutes = Math.max(5, numberEnv("LOCAL_NOTIFICATION_RETRY_COOLDOWN_MINUTES", 15));
  const maxAttempts = Math.max(1, numberEnv("LOCAL_NOTIFICATION_RETRY_MAX_ATTEMPTS", 5));
  const recoveryProbeMinutes = Math.max(60, numberEnv("LOCAL_NOTIFICATION_RETRY_RECOVERY_PROBE_MINUTES", 360));
  const overdueMinutes = Math.max(cooldownMinutes * 2, numberEnv("LOCAL_NOTIFICATION_RETRY_OVERDUE_MINUTES", 30));
  const limit = Math.max(1, numberEnv("LOCAL_NOTIFICATION_RETRY_BATCH_SIZE", 20));
  if (!existsSync(dbPath)) throw new Error(`Base SQLite introuvable: ${dbPath}`);

  const database = new DatabaseSync(dbPath);
  const config = mailConfig();
  const rows = candidates(database, cooldownMinutes, maxAttempts, recoveryProbeMinutes, limit);
  const results = [];
  let backlogState = { pending: 0, exhausted: 0, overdue: 0, oldest_failed_at: null };
  try {
    for (const lead of rows) {
      const attempt = Number(lead.retry_failures || 0) + 1;
      if (DRY_RUN) {
        results.push({ reference: clean(lead.reference, 80), status: "dry-run", attempt, recovery_probe: attempt > maxAttempts });
        continue;
      }
      const now = new Date().toISOString();
      try {
        const receipt = await sendNodeSmtpMail(config, messageFor(lead, attempt, now, config));
        logEvent(database, lead, "email_notification_retry_sent", { reference: lead.reference, attempt, receipt: clean(receipt, 500) }, now);
        results.push({ reference: clean(lead.reference, 80), status: "sent", attempt, recovery_probe: attempt > maxAttempts });
      } catch (error) {
        logEvent(database, lead, "email_notification_retry_failed", { reference: lead.reference, attempt, error: clean(error.message || "Erreur SMTP", 500) }, now);
        results.push({ reference: clean(lead.reference, 80), status: "failed", attempt, recovery_probe: attempt > maxAttempts, error: clean(error.message || "Erreur SMTP", 300) });
      }
    }
    backlogState = backlog(database, maxAttempts, overdueMinutes);
  } finally {
    database.close();
  }

  const report = {
    generated_at: new Date().toISOString(),
    status: results.some((item) => item.status === "failed") || Number(backlogState.overdue || 0) > 0 || Number(backlogState.exhausted || 0) > 0 ? "degraded" : "completed",
    dry_run: DRY_RUN,
    cooldown_minutes: cooldownMinutes,
    max_attempts: maxAttempts,
    recovery_probe_minutes: recoveryProbeMinutes,
    overdue_minutes: overdueMinutes,
    pending: Number(backlogState.pending || 0),
    overdue: Number(backlogState.overdue || 0),
    exhausted: Number(backlogState.exhausted || 0),
    oldest_pending_hours: backlogState.oldest_failed_at ? Math.round(((Date.now() - Date.parse(backlogState.oldest_failed_at)) / 3600000) * 10) / 10 : 0,
    candidates: rows.length,
    sent: results.filter((item) => item.status === "sent").length,
    failed: results.filter((item) => item.status === "failed").length,
    results
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Lead notification retry ${report.status}: candidates=${report.candidates}, sent=${report.sent}, failed=${report.failed}, dry_run=${report.dry_run}.`);
  if (report.status === "degraded") process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
