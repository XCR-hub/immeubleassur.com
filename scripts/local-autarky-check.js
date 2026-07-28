import { existsSync, readFileSync } from "node:fs";

const checks = [
  ["package.json", "serve:local"],
  ["package.json", "db:sqlite:restore"],
  ["package.json", "db:sqlite:import-reports"],
  ["package.json", "production:monitor"],
  ["package.json", "leads:sla:monitor"],
  ["package.json", "leads:quality:monitor"],
  ["package.json", "conversion:funnel:monitor"],
  ["package.json", "conversion:actions:sync"],
  ["scripts/local-production-server.js", "openLocalD1"],
  ["scripts/local-production-server.js", "SEND_SMTP_MAIL"],
  ["scripts/local-production-monitor.js", "sqlite_backup_age"],
  ["scripts/local-production-monitor.js", "telemetry_filter"],
  ["scripts/local-lead-sla-monitor.js", "Lead SLA monitor"],
  ["scripts/local-lead-sla-monitor.js", "LOCAL_LEAD_SLA_ALERTS"],
  ["scripts/local-lead-quality-monitor.js", "Lead quality monitor"],
  ["scripts/local-lead-quality-monitor.js", "LOCAL_LEAD_QUALITY_REPORT"],
  ["scripts/local-conversion-funnel-monitor.js", "Conversion funnel monitor"],
  ["scripts/local-conversion-funnel-monitor.js", "LOCAL_CONVERSION_FUNNEL_REPORT"],
  ["scripts/local-conversion-action-sync.js", "Conversion action sync"],
  ["scripts/local-conversion-action-sync.js", "seo_opportunities"],
  ["scripts/local-conversion-action-sync.js", "LOCAL_CONVERSION_ACTION_SYNC_REPORT"],
  ["functions/api/admin/runtime-health.js", "sanitizeMonitorReport"],
  ["functions/api/admin/runtime-health.js", "LOCAL_PRODUCTION_MONITOR_REPORT"],
  ["functions/api/admin/runtime-health.js", "sanitizeLeadSlaReport"],
  ["functions/api/admin/runtime-health.js", "LOCAL_LEAD_SLA_REPORT"],
  ["functions/api/admin/runtime-health.js", "LOCAL_LEAD_QUALITY_REPORT"],
  ["functions/api/admin/runtime-health.js", "LOCAL_CONVERSION_FUNNEL_REPORT"],
  ["public/assets/admin.js", "Monitoring production"],
  ["public/assets/admin.js", "SLA leads"],
  ["public/assets/admin.js", "Qualite leads"],
  ["public/assets/admin.js", "Funnel leads"],
  ["scripts/local-production-server.js", "__IMMEUBLEASSUR_SEND_SMTP_MAIL"],
  ["functions/_shared/smtp.js", "__IMMEUBLEASSUR_SEND_SMTP_MAIL"],
  ["scripts/local-d1-sqlite.js", "DatabaseSync"],
  ["scripts/local-sqlite-restore.js", "snapshot.json.gz"],
  ["scripts/local-smtp.js", "STARTTLS"],
  ["README.md", "Production autonome"],
  ["README.md", "Cloudflare D1 n'est plus requis"],
  ["README.md", "leads:sla:monitor"],
  ["README.md", "leads:quality:monitor"],
  ["README.md", "conversion:funnel:monitor"],
  ["README.md", "conversion:actions:sync"]
];

const missing = [];
for (const [file, needle] of checks) {
  if (!existsSync(file) || !readFileSync(file, "utf8").includes(needle)) missing.push(`${file}:${needle}`);
}

if (missing.length) {
  console.error(`Autarky contract failed: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Autarky contract passed for ${checks.length} markers.`);
