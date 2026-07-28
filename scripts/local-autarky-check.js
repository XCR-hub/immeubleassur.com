import { existsSync, readFileSync } from "node:fs";

const checks = [
  ["package.json", "serve:local"],
  ["package.json", "db:sqlite:restore"],
  ["package.json", "db:sqlite:import-reports"],
  ["package.json", "production:monitor"],
  ["scripts/local-production-server.js", "openLocalD1"],
  ["scripts/local-production-server.js", "SEND_SMTP_MAIL"],
  ["scripts/local-production-monitor.js", "sqlite_backup_age"],
  ["scripts/local-production-monitor.js", "telemetry_filter"],
  ["scripts/local-production-server.js", "__IMMEUBLEASSUR_SEND_SMTP_MAIL"],
  ["functions/_shared/smtp.js", "__IMMEUBLEASSUR_SEND_SMTP_MAIL"],
  ["scripts/local-d1-sqlite.js", "DatabaseSync"],
  ["scripts/local-sqlite-restore.js", "snapshot.json.gz"],
  ["scripts/local-smtp.js", "STARTTLS"],
  ["README.md", "Production autonome"],
  ["README.md", "Cloudflare D1 n'est plus requis"]
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