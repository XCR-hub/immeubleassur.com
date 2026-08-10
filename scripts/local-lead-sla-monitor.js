import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { requireOperationalTeamRecipient, sendNodeSmtpMail } from "./local-smtp.js";

loadDefaultEnvFiles();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function numberValue(value, fallback) {
  const number = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(number) ? number : fallback;
}

function numberEnv(name, fallback) {
  return numberValue(env(name, String(fallback)), fallback);
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function round(value, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function parseDate(value) {
  const raw = clean(value, 80);
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function hoursSince(value) {
  const timestamp = parseDate(value);
  if (!timestamp) return 0;
  return Math.max(0, (Date.now() - timestamp) / 3600000);
}

function unitCount(value) {
  return Number.parseInt(String(value || "0").replace(/\D/g, ""), 10) || 0;
}

function priorityFromScore(score) {
  if (score >= 85) return "hot";
  if (score >= 70) return "warm";
  if (score >= 45) return "standard";
  return "low";
}

function leadValueEstimate(lead, score = 0) {
  const units = Math.max(1, unitCount(lead.units_count));
  const need = clean(lead.need, 80);
  const profile = clean(lead.profile, 80);
  const propertyType = clean(lead.property_type, 80);
  let base = 260;

  if (["multirisque-immeuble", "copropriete", "audit-contrat"].includes(need)) base = 520;
  if (["rc-syndic", "dommages-ouvrage"].includes(need)) base = 620;
  if (["pno", "cno", "pno-cno"].includes(need) || ["lot-copropriete", "logement-vacant", "logement-loue"].includes(propertyType)) base = units <= 2 ? 190 : 260;
  if (["local-commercial", "commerce", "mixte"].includes(propertyType)) base += 180;
  if (["sci", "administrateur-biens", "syndic-professionnel"].includes(profile)) base += 160;

  const min = Math.round(Math.max(180, base + Math.max(0, units - 1) * 135));
  const max = Math.round(min * (score >= 85 ? 1.75 : score >= 70 ? 1.55 : 1.35));
  const band = max >= 9000 ? "portfolio" : max >= 3500 ? "immeuble-prioritaire" : max >= 1200 ? "immeuble-standard" : "lot-pno-cno";
  return {
    annual_premium_min: min,
    annual_premium_max: max,
    band,
    label: `${min}-${max} EUR/an`
  };
}

function slaHoursFor(score, valueEstimate) {
  const maxValue = Number(valueEstimate?.annual_premium_max || 0);
  if (score >= 85 || maxValue >= 9000) return 2;
  if (score >= 70 || maxValue >= 3500) return 6;
  if (score >= 45 || maxValue >= 1200) return 24;
  return 48;
}

function basisDateFor(lead) {
  const status = clean(lead.status || "new", 40);
  return status === "new" ? lead.created_at : (lead.updated_at || lead.created_at);
}

function targetHoursFor(lead, baseSlaHours) {
  const status = clean(lead.status || "new", 40);
  if (status === "contacted" || status === "qualified") return 24;
  if (status === "quoted") return 72;
  return baseSlaHours;
}

function safePathFromUrl(value) {
  try {
    const url = new URL(String(value || ""), "https://immeubleassur.com");
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

function formatEuro(value) {
  const amount = Number(value || 0);
  if (!amount) return "0 EUR";
  return `${Math.round(amount).toLocaleString("fr-FR")} EUR`;
}

function sumValues(rows, field) {
  return rows.reduce((sum, row) => sum + Number(row.value_estimate?.[field] || 0), 0);
}

function toLeadSla(row) {
  const score = Number(row.lead_score || 0);
  const valueEstimate = leadValueEstimate(row, score);
  const slaHours = slaHoursFor(score, valueEstimate);
  const targetHours = targetHoursFor(row, slaHours);
  const basisDate = basisDateFor(row);
  const ageHours = hoursSince(basisDate);
  const overdueHours = round(ageHours - targetHours, 1);
  return {
    reference: clean(row.reference || row.id, 120),
    priority: priorityFromScore(score),
    status: clean(row.status || "new", 40),
    profile: clean(row.profile, 80),
    property_type: clean(row.property_type, 80),
    city: clean(row.city, 120),
    need: clean(row.need, 120),
    units_count: clean(row.units_count, 40),
    score,
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    basis_at: basisDate || "",
    age_hours: round(ageHours, 1),
    sla_hours: slaHours,
    target_hours: targetHours,
    due_in_hours: round(targetHours - ageHours, 1),
    overdue_hours: overdueHours > 0 ? overdueHours : 0,
    due: ageHours >= targetHours,
    value_estimate: valueEstimate,
    source: clean(row.source, 120),
    page_path: safePathFromUrl(row.page_url)
  };
}

function openLeadRows(database, maxRows) {
  return database
    .prepare(`
      SELECT id, reference, profile, property_type, city, units_count, need, lead_score,
             status, source, page_url, created_at, updated_at
      FROM leads
      WHERE COALESCE(status, 'new') IN ('new', 'contacted', 'qualified', 'quoted')
      ORDER BY lead_score DESC, datetime(created_at) ASC
      LIMIT ?
    `)
    .all(maxRows);
}

function statusCounts(database) {
  return database
    .prepare("SELECT COALESCE(status, 'new') AS status, COUNT(*) AS count FROM leads GROUP BY COALESCE(status, 'new') ORDER BY count DESC")
    .all()
    .reduce((acc, row) => {
      acc[clean(row.status || "new", 40)] = Number(row.count || 0);
      return acc;
    }, {});
}

function recentLeadCounts(database) {
  return database
    .prepare(`
      SELECT
        SUM(CASE WHEN created_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS leads_24h,
        SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS leads_7d,
        SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS leads_30d
      FROM leads
    `)
    .get();
}

function buildSummary(leads, counts) {
  const dueLeads = leads.filter((lead) => lead.due).sort((a, b) => b.overdue_hours - a.overdue_hours || b.score - a.score);
  const hotDue = dueLeads.filter((lead) => lead.priority === "hot").length;
  const warmDue = dueLeads.filter((lead) => lead.priority === "warm").length;
  const nextDue = leads.filter((lead) => !lead.due).sort((a, b) => a.due_in_hours - b.due_in_hours)[0] || null;
  return {
    open_leads: leads.length,
    due_now: dueLeads.length,
    due_hot: hotDue,
    due_warm: warmDue,
    due_standard: dueLeads.filter((lead) => lead.priority === "standard").length,
    due_low: dueLeads.filter((lead) => lead.priority === "low").length,
    next_due_minutes: nextDue ? Math.max(0, Math.round(nextDue.due_in_hours * 60)) : null,
    oldest_due_hours: dueLeads[0] ? dueLeads[0].overdue_hours : 0,
    pipeline_value: {
      annual_premium_min: sumValues(leads, "annual_premium_min"),
      annual_premium_max: sumValues(leads, "annual_premium_max"),
      label: `${formatEuro(sumValues(leads, "annual_premium_min"))} - ${formatEuro(sumValues(leads, "annual_premium_max"))}/an`
    },
    due_value: {
      annual_premium_min: sumValues(dueLeads, "annual_premium_min"),
      annual_premium_max: sumValues(dueLeads, "annual_premium_max"),
      label: `${formatEuro(sumValues(dueLeads, "annual_premium_min"))} - ${formatEuro(sumValues(dueLeads, "annual_premium_max"))}/an`
    },
    status_counts: counts
  };
}

function mailConfig() {
  const resendMode = env("EMAIL_TRANSPORT", "smtp").toLowerCase() === "resend";
  const from = env("SMTP_FROM", env("RESEND_FROM", env("SMTP_USER", "")));
  const to = env("LOCAL_LEAD_SLA_ALERT_TO", env("SMTP_TO", from));
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
  return resolve(env("LOCAL_LEAD_SLA_ALERT_STATE", join(dirname(reportPath), "lead-sla-alert-state.json")));
}

function alertSignature(dueLeads) {
  return dueLeads.map((lead) => lead.reference).sort().join("+") || "none";
}

function recentlyAlerted(statePath, signature, cooldownMinutes) {
  if (!existsSync(statePath)) return false;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const lastAt = Date.parse(state.last_alert_at || "");
    return state.signature === signature && Number.isFinite(lastAt) && Date.now() - lastAt < cooldownMinutes * 60000;
  } catch {
    return false;
  }
}

function writeAlertState(statePath, signature) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ last_alert_at: new Date().toISOString(), signature }, null, 2)}\n`, "utf8");
}

async function maybeAlert(report, reportPath) {
  if (env("LOCAL_LEAD_SLA_ALERTS", "0") !== "1" || report.summary.due_now <= 0) return { attempted: false, status: "skipped" };
  const dueLeads = report.due_leads || [];
  const signature = alertSignature(dueLeads);
  const statePath = alertStatePath(reportPath);
  const cooldownMinutes = numberEnv("LOCAL_LEAD_SLA_ALERT_COOLDOWN_MINUTES", 60);
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

  const text = [
    "Alerte ImmeubleAssur SLA leads",
    `Date: ${report.generated_at}`,
    `Relances dues: ${report.summary.due_now}`,
    `Valeur estimee des relances: ${report.summary.due_value.label}`,
    "",
    ...dueLeads.slice(0, 12).map((lead) => `- ${lead.reference}: ${lead.priority}, ${lead.need || "besoin non precise"}, ${lead.city || "ville non precise"}, retard ${lead.overdue_hours}h, SLA ${lead.target_hours}h`)
  ].join("\n");

  const message = [
    `From: ImmeubleAssur Monitor <${config.from}>`,
    `To: ${config.to.join(", ")}`,
    `Subject: Relances SLA ImmeubleAssur: ${report.summary.due_now} dossier(s)`,
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
  const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
  const out = resolve(argValue("--out", env("LOCAL_LEAD_SLA_REPORT", join("reports", "local-lead-sla-report.json"))));
  const maxRows = numberValue(argValue("--max-rows", env("LOCAL_LEAD_SLA_MAX_ROWS", "500")), 500);

  if (!existsSync(dbPath)) throw new Error(`Base SQLite introuvable: ${dbPath}`);
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = openLeadRows(database, maxRows);
    const leads = rows.map(toLeadSla);
    const counts = statusCounts(database);
    const recent = recentLeadCounts(database);
    const dueLeads = leads.filter((lead) => lead.due).sort((a, b) => b.overdue_hours - a.overdue_hours || b.score - a.score);
    const report = {
      success: true,
      attention_required: dueLeads.length > 0,
      generated_at: new Date().toISOString(),
      database: {
        path: dbPath,
        mode: "sqlite-readonly"
      },
      summary: {
        ...buildSummary(leads, counts),
        leads_24h: Number(recent?.leads_24h || 0),
        leads_7d: Number(recent?.leads_7d || 0),
        leads_30d: Number(recent?.leads_30d || 0)
      },
      due_leads: dueLeads,
      upcoming_leads: leads.filter((lead) => !lead.due).sort((a, b) => a.due_in_hours - b.due_in_hours).slice(0, 12)
    };
    report.alert = await maybeAlert(report, out).catch((error) => ({ attempted: true, status: "failed", error: error.message || "alert failed" }));

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Lead SLA monitor: ${report.summary.due_now} due / ${report.summary.open_leads} open leads`);
    console.log(`Report: ${out}`);
  } finally {
    database.close();
  }
}

run();
