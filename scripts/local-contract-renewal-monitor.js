import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { env, loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();

const MARKER = "contract-renewal-autopilot-v1";
const RENEWAL_AUDIENCE = "client_contract_renewal";
const PAYMENT_AUDIENCE = "client_payment_reminder";

function clean(value, max = 2000) {
  return String(value || "").replace(/\r/g, "").trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 180));
}

function dateKey(value) {
  return String(value || "").slice(0, 10);
}

function daysBetween(a, b) {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

function portalUrl(origin, token) {
  return origin.replace(/\/+$/, "") + "/espace-client.html#token=" + encodeURIComponent(clean(token, 160));
}

function money(cents) {
  return Math.round(Number(cents || 0) / 100) + " EUR";
}

function insertDraft(database, row, audience, periodKey, subject, body, dueAt) {
  const existing = database.prepare("SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = ? AND payload LIKE ? AND status IN ('draft_review', 'approved', 'sent') LIMIT 1").bind(row.case_id, audience, "%" + periodKey + "%").first();
  if (existing?.id) return { created: false, mail_id: existing.id };
  const now = new Date().toISOString();
  const mailId = crypto.randomUUID();
  database.prepare("INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, scheduled_at, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft_review', 1, ?, ?, ?, ?)").bind(
    mailId, row.case_id, audience, clean(row.client_email, 180), subject, body, dueAt,
    JSON.stringify({ marker: MARKER, contract_id: row.id, period_key: periodKey, human_review_required: true, no_automatic_send: true }), now, now
  ).run();
  database.prepare("INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, ?, 'system', ?, ?)").bind(
    crypto.randomUUID(), row.case_id, audience === RENEWAL_AUDIENCE ? "contract_renewal_draft" : "contract_payment_reminder_draft",
    JSON.stringify({ marker: MARKER, contract_id: row.id, mail_id: mailId, period_key: periodKey, human_review_required: true, no_automatic_send: true }), now
  ).run();
  return { created: true, mail_id: mailId };
}

export function runContractRenewalMonitor(database, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const origin = String(options.siteOrigin || env("SITE_ORIGIN", "https://immeubleassur.com")).slice(0, 240) || "https://immeubleassur.com";
  const renewalDays = Number.isFinite(Number(options.renewalDays)) ? Number(options.renewalDays) : 90;
  const paymentDays = Number.isFinite(Number(options.paymentDays)) ? Number(options.paymentDays) : 14;
  const renewalLimit = new Date(now.getTime() + renewalDays * 86400000);
  const paymentLimit = new Date(now.getTime() + paymentDays * 86400000);
  const rows = database.prepare("SELECT cc.*, c.case_reference, c.client_portal_token, l.name AS client_name, l.email AS client_email FROM client_contracts cc JOIN brokerage_cases c ON c.id = cc.case_id JOIN leads l ON l.id = cc.lead_id WHERE cc.status = 'active'").all().results || [];
  const report = { marker: MARKER, generated_at: now.toISOString(), renewal_days: renewalDays, payment_days: paymentDays, scanned: rows.length, created: 0, skipped_missing_email: 0, renewal_drafts: 0, payment_drafts: 0, duplicates: 0 };
  for (const row of rows) {
    const recipient = clean(row.client_email, 180);
    if (!validEmail(recipient)) {
      report.skipped_missing_email += 1;
      continue;
    }
    const portal = portalUrl(origin, row.client_portal_token);
    const renewalAt = new Date(row.renewal_at || "");
    if (Number.isFinite(renewalAt.getTime()) && renewalAt >= now && renewalAt <= renewalLimit) {
      const periodKey = "renewal-" + dateKey(row.renewal_at);
      const days = daysBetween(now, renewalAt);
      const subject = "Renouvellement " + clean(row.contract_reference, 100) + " - echeance dans " + days + " jour(s)";
      const body = ["Bonjour " + (clean(row.client_name, 160) || "client") + ",", "", "Votre contrat " + clean(row.contract_reference, 100) + " arrive a renouvellement le " + dateKey(row.renewal_at) + ".", "Ce brouillon rappelle l echeance et necessite une verification humaine avant tout envoi.", "Merci de controler les garanties, la prime, les franchises, les changements d usage et les sinistres avant arbitrage.", "", "Espace client: " + portal, "", "Aucun conseil ou changement de contrat n est execute automatiquement."].join("\n");
      const result = insertDraft(database, row, RENEWAL_AUDIENCE, periodKey, subject, body, row.renewal_at);
      if (result.created) { report.created += 1; report.renewal_drafts += 1; } else report.duplicates += 1;
    }
    const paymentRows = database.prepare("SELECT * FROM contract_payment_schedule WHERE contract_id = ? AND status = 'pending' AND due_at >= ? AND due_at <= ? ORDER BY due_at").bind(row.id, now.toISOString(), paymentLimit.toISOString()).all().results || [];
    for (const payment of paymentRows) {
      const periodKey = "payment-" + dateKey(payment.due_at) + "-" + clean(payment.installment_reference, 80);
      const days = daysBetween(now, new Date(payment.due_at));
      const subject = "Appel de prime " + clean(row.contract_reference, 100) + " - echeance dans " + days + " jour(s)";
      const body = ["Bonjour " + (clean(row.client_name, 160) || "client") + ",", "", "Un appel de prime de " + money(payment.amount_cents) + " est prevu le " + dateKey(payment.due_at) + " pour le contrat " + clean(row.contract_reference, 100) + ".", "Ce brouillon est soumis a validation humaine avant tout envoi. Le lien de paiement doit etre verifie ou complete par le courtier.", "", "Espace client: " + portal, "", "Aucun paiement n est declenche automatiquement."].join("\n");
      const result = insertDraft(database, row, PAYMENT_AUDIENCE, periodKey, subject, body, payment.due_at);
      if (result.created) { report.created += 1; report.payment_drafts += 1; } else report.duplicates += 1;
    }
  }
  return report;
}

function main() {
  const database = openLocalSqlite({ dbPath: env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite")), schemaPath: "schema.sql" });
  const reportRoot = env("LOCAL_RUNTIME_REPORTS_ROOT", join("data", "runtime-reports"));
  const reportPath = resolve(env("LOCAL_CONTRACT_RENEWAL_REPORT", join(reportRoot, "local-contract-renewal-report.json")));
  mkdirSync(dirname(reportPath), { recursive: true });
  const report = runContractRenewalMonitor(database);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  database.close();
  console.log("Contract renewal monitor: " + report.created + " draft(s), " + report.duplicates + " duplicate(s), " + report.skipped_missing_email + " missing email(s).");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();