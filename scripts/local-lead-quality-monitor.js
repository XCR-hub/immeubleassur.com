import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";

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

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
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

function safePathFromUrl(value) {
  try {
    const url = new URL(String(value || ""), "https://immeubleassur.com");
    return url.pathname || "/";
  } catch {
    return "/";
  }
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

function slaHoursFor(score) {
  if (score >= 85) return 2;
  if (score >= 70) return 6;
  if (score >= 45) return 24;
  return 48;
}

function isBlank(value) {
  return !clean(value, 120);
}

function isGeneric(value) {
  return /^(website|site|direct|unknown|non precise|non-précisé|n\/a|na)$/i.test(clean(value, 120));
}

function isOpenStatus(status) {
  return !["won", "lost", "archived", "spam", "closed"].includes(clean(status || "new", 40));
}

function leadRows(database, lookbackDays, maxRows) {
  return database
    .prepare(`
      SELECT id, reference, profile, property_type, city, units_count, need, lead_score,
             status, source, page_url, referrer, created_at, updated_at,
             CASE WHEN COALESCE(NULLIF(phone, ''), NULLIF(email, '')) IS NULL THEN 1 ELSE 0 END AS missing_contact
      FROM leads
      WHERE created_at >= datetime('now', ?)
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `)
    .all(`-${lookbackDays} days`, maxRows);
}

function countRows(database, sql, binds = []) {
  const statement = database.prepare(sql);
  const result = binds.length ? statement.get(...binds) : statement.get();
  return Number(result?.count || 0);
}

function enrich(row) {
  const score = Number(row.lead_score || 0);
  const status = clean(row.status || "new", 40);
  const ageHours = hoursSince(row.created_at);
  const updatedAgeHours = hoursSince(row.updated_at || row.created_at);
  return {
    reference: clean(row.reference || row.id, 120),
    priority: priorityFromScore(score),
    status,
    city: clean(row.city, 120),
    need: clean(row.need, 120),
    profile: clean(row.profile, 80),
    property_type: clean(row.property_type, 80),
    units_count: clean(row.units_count, 40),
    score,
    source: clean(row.source, 120),
    page_path: safePathFromUrl(row.page_url),
    has_referrer: !isBlank(row.referrer),
    has_page_url: !isBlank(row.page_url),
    missing_contact: Number(row.missing_contact || 0) === 1,
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    age_hours: Math.round(ageHours * 10) / 10,
    updated_age_hours: Math.round(updatedAgeHours * 10) / 10,
    open: isOpenStatus(status),
    sla_hours: slaHoursFor(score)
  };
}

const issueCatalog = {
  missing_contact: {
    severity: "critical",
    label: "Contact absent",
    action: "Corriger le formulaire ou rappeler la source: aucun telephone ni email exploitable."
  },
  overdue_new: {
    severity: "high",
    label: "Nouveau hors SLA",
    action: "Traiter immediatement les demandes encore nouvelles dont le delai de rappel est depasse."
  },
  stale_open: {
    severity: "high",
    label: "Dossier ouvert sans mise a jour",
    action: "Mettre a jour le statut ou relancer les dossiers ouverts sans activite recente."
  },
  missing_city: {
    severity: "medium",
    label: "Ville manquante",
    action: "Rendre la ville obligatoire et verifier les pages de devis qui pre-remplissent mal le champ."
  },
  missing_need: {
    severity: "medium",
    label: "Besoin manquant",
    action: "Verifier les formulaires et CTA: chaque lead doit porter PNO, CNO, copropriete ou immeuble."
  },
  missing_profile: {
    severity: "medium",
    label: "Profil manquant",
    action: "Forcer le choix syndic, bailleur, SCI ou administrateur pour mieux router les dossiers."
  },
  missing_property_type: {
    severity: "medium",
    label: "Type de bien manquant",
    action: "Completer le champ type de bien pour fiabiliser les consultations assureurs."
  },
  missing_units: {
    severity: "medium",
    label: "Nombre de lots manquant",
    action: "Demander les lots/logements pour les immeubles et coproprietes avant consultation."
  },
  zero_score: {
    severity: "medium",
    label: "Score non calcule",
    action: "Verifier le scoring lead: un score a zero rend la priorisation commerciale faible."
  },
  weak_page_context: {
    severity: "low",
    label: "Contexte page faible",
    action: "Verifier tracking source/page pour relier les leads aux pages qui convertissent."
  }
};

function issueTypesFor(lead) {
  const issues = [];
  if (lead.missing_contact) issues.push("missing_contact");
  if (lead.status === "new" && lead.age_hours >= lead.sla_hours) issues.push("overdue_new");
  if (lead.open && lead.updated_age_hours >= 168) issues.push("stale_open");
  if (isBlank(lead.city) || isGeneric(lead.city)) issues.push("missing_city");
  if (isBlank(lead.need) || isGeneric(lead.need)) issues.push("missing_need");
  if (isBlank(lead.profile) || isGeneric(lead.profile)) issues.push("missing_profile");
  if (isBlank(lead.property_type) || isGeneric(lead.property_type)) issues.push("missing_property_type");
  if (["multirisque-immeuble", "copropriete", "audit-contrat", "rc-syndic"].includes(lead.need) && unitCount(lead.units_count) <= 0) issues.push("missing_units");
  if (lead.score <= 0) issues.push("zero_score");
  if (!lead.has_page_url || (isGeneric(lead.source) && !lead.has_referrer)) issues.push("weak_page_context");
  return issues;
}

function severityRank(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity] || 0;
}

function issueReport(leads) {
  const byType = new Map();
  for (const lead of leads) {
    const issueTypes = issueTypesFor(lead);
    lead.issue_types = issueTypes;
    for (const type of issueTypes) {
      const catalog = issueCatalog[type] || { severity: "low", label: type, action: "Verifier le dossier." };
      if (!byType.has(type)) {
        byType.set(type, {
          type,
          severity: catalog.severity,
          label: catalog.label,
          action: catalog.action,
          count: 0,
          references: []
        });
      }
      const issue = byType.get(type);
      issue.count += 1;
      if (issue.references.length < 12) issue.references.push(lead.reference);
    }
  }
  return [...byType.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.count - a.count || a.type.localeCompare(b.type));
}

function ratio(part, total) {
  if (!total) return 100;
  return Math.round((part / total) * 100);
}

function qualityScore(leads, issues) {
  const total = Math.max(1, leads.length);
  const weights = { critical: 16, high: 10, medium: 5, low: 2 };
  const deduction = issues.reduce((sum, issue) => sum + (weights[issue.severity] || 2) * Math.min(issue.count / total, 1), 0);
  return Math.max(0, Math.round(100 - deduction));
}

function buildSummary(database, leads, issues, lookbackDays) {
  const total = leads.length;
  const leadCount24h = countRows(database, "SELECT COUNT(*) AS count FROM leads WHERE created_at >= datetime('now', '-24 hours')");
  const leadCount7d = countRows(database, "SELECT COUNT(*) AS count FROM leads WHERE created_at >= datetime('now', '-7 days')");
  const avgScore = total ? Math.round(leads.reduce((sum, lead) => sum + lead.score, 0) / total) : 0;
  const completeCore = leads.filter((lead) => !["missing_city", "missing_need", "missing_profile", "missing_property_type", "missing_contact"].some((type) => lead.issue_types.includes(type))).length;
  const critical = issues.filter((issue) => issue.severity === "critical").reduce((sum, issue) => sum + issue.count, 0);
  const high = issues.filter((issue) => issue.severity === "high").reduce((sum, issue) => sum + issue.count, 0);
  return {
    lookback_days: lookbackDays,
    leads_24h: leadCount24h,
    leads_7d: leadCount7d,
    leads_period: total,
    open_leads: leads.filter((lead) => lead.open).length,
    hot_leads: leads.filter((lead) => lead.priority === "hot").length,
    warm_leads: leads.filter((lead) => lead.priority === "warm").length,
    average_score: avgScore,
    quality_score: qualityScore(leads, issues),
    core_completion_rate: ratio(completeCore, total),
    issue_count: issues.reduce((sum, issue) => sum + issue.count, 0),
    critical_issues: critical,
    high_issues: high
  };
}

function run() {
  const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
  const out = resolve(argValue("--out", env("LOCAL_LEAD_QUALITY_REPORT", join("reports", "local-lead-quality-report.json"))));
  const lookbackDays = numberValue(argValue("--days", env("LOCAL_LEAD_QUALITY_LOOKBACK_DAYS", "30")), 30);
  const maxRows = numberValue(argValue("--max-rows", env("LOCAL_LEAD_QUALITY_MAX_ROWS", "1000")), 1000);

  if (!existsSync(dbPath)) throw new Error(`Base SQLite introuvable: ${dbPath}`);
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const leads = leadRows(database, lookbackDays, maxRows).map(enrich);
    const issues = issueReport(leads);
    const summary = buildSummary(database, leads, issues, lookbackDays);
    const report = {
      success: true,
      attention_required: summary.critical_issues > 0 || summary.high_issues > 0 || summary.quality_score < 85,
      generated_at: new Date().toISOString(),
      database: { path: dbPath, mode: "sqlite-readonly" },
      summary,
      issues,
      sample_leads: leads
        .filter((lead) => lead.issue_types.length)
        .sort((a, b) => b.issue_types.length - a.issue_types.length || b.score - a.score)
        .slice(0, 20)
        .map((lead) => ({
          reference: lead.reference,
          priority: lead.priority,
          status: lead.status,
          city: lead.city,
          need: lead.need,
          score: lead.score,
          source: lead.source,
          page_path: lead.page_path,
          age_hours: lead.age_hours,
          issue_types: lead.issue_types
        }))
    };

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Lead quality monitor: ${summary.quality_score}/100 quality, ${summary.issue_count} issue(s), ${summary.leads_period} lead(s)`);
    console.log(`Report: ${out}`);
  } finally {
    database.close();
  }
}

run();
