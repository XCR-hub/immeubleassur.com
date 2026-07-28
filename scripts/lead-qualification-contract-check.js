import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";

const expectations = [
  {
    file: "functions/api/leads.js",
    role: "lead-api",
    snippets: [
      "readinessSignals",
      "dossier assureur prepare",
      "pieces assureur disponibles",
      "Reprendre les pieces disponibles",
      "leadValueEstimate",
      "value_estimate",
      "sla_hours",
      "Valeur estimee",
      "assessSpamSubmission",
      "lead_spam_blocked",
      "logSpamAttempt"
    ]
  },
  {
    file: "functions/api/admin/leads.js",
    role: "admin-leads",
    snippets: [
      "readinessSignals",
      "dossier assureur prepare",
      "pieces assureur disponibles",
      "Reprendre les pieces disponibles",
      "leadValueEstimate",
      "value_estimate",
      "sla_hours",
      "allowedStatuses",
      "lead_status_updated",
      "lead_followup_updated",
      "followUpDueFor",
      "pipeline_value",
      "followup_due_value",
      "sla_2h_count",
      "top_value_lead",
      "onRequestPatch"
    ]
  },
  {
    file: "public/assets/app.js",
    role: "lead-form-runtime",
    snippets: [
      "readinessSignals",
      "dossier assureur prepare",
      "pieces assureur disponibles",
      "readiness_complete",
      "Dossier pret assureur",
      "lead-value-preview",
      "lead_value_hint_ready",
      "leadValueEventPayload",
      "validationDetails",
      "validationTelemetry",
      "markInvalidFields",
      "botSignalPayload",
      "anti_bot",
      "bindBotSignalTracking"
    ]
  },
  {
    file: "functions/api/events.js",
    role: "event-api",
    snippets: ["readiness_start", "readiness_update", "readiness_complete", "lead_value_hint_ready", "lead_spam_blocked", "revenue_band", "lead_value_max"]
  },
  {
    file: "functions/api/admin/seo.js",
    role: "seo-admin",
    snippets: ["readiness_paths", "readiness_completion_rate", "lead_value_hint_ready", "value_hint_ready", "value_hint_paths", "validation_errors", "validation-friction", "lead_spam_blocked", "spam-bloque", "estimation-gagnante", "dossier-friction", "dossier-gagnant"]
  },
  {
    file: "functions/_shared/ga4.js",
    role: "ga4-lead-value",
    snippets: ["lead_value_min", "lead_value_max", "revenue_band", "sla_hours"]
  },
  {
    file: "functions/api/admin/sales.js",
    role: "admin-sales",
    snippets: ["followUpDueFor", "due_in_hours", "call_script", "email_subject", "sales_actions", "relance_leads", "quote_followups", "pipeline_value", "due_value"]
  },
  {
    file: "public/assets/admin.js",
    role: "admin-dashboard",
    snippets: ["Dossier pret", "readiness_paths", "dossier-pret", "lead-status-save", "lead-followup-save", "lead-status-filter", "updateLeadStatus", "updateLeadFollowUp", "method: \"PATCH\"", "Pipeline estime", "Valeur relance", "Valeur affichee", "Erreurs formulaire", "validation-friction", "Spam bloques", "spam-bloque", "lead-value-cell", "annual_premium_min", "loadSales", "/api/admin/sales", "Scripts de rappel", "sales-body", "Relances dues"]
  }
];

const missing = [];
for (const expectation of expectations) {
  const source = readFileSync(expectation.file, "utf8");
  for (const snippet of expectation.snippets) {
    if (!source.includes(snippet)) {
      missing.push({ file: expectation.file, role: expectation.role, snippet });
    }
  }
}

const report = {
  generated_at: new Date().toISOString(),
  checked_files: expectations.map((item) => item.file),
  required_contracts: expectations.reduce((sum, item) => sum + item.snippets.length, 0),
  missing,
  status: missing.length ? "failed" : "passed"
};

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "lead-qualification-contract-report.json"), JSON.stringify(report, null, 2), "utf8");

if (missing.length) {
  console.error(`Lead qualification contract failed: ${missing.map((item) => `${item.file}:${item.snippet}`).join(", ")}`);
  process.exit(1);
}

console.log(`Lead qualification contract passed for ${report.required_contracts} required markers.`);
