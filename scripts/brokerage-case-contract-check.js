import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REQUIRED = [
  ["schema.sql", "CREATE TABLE IF NOT EXISTS brokerage_cases"],
  ["schema.sql", "CREATE TABLE IF NOT EXISTS case_documents"],
  ["schema.sql", "CREATE TABLE IF NOT EXISTS insurer_consultations"],
  ["schema.sql", "CREATE TABLE IF NOT EXISTS case_mail_queue"],
  ["schema.sql", "CREATE TABLE IF NOT EXISTS case_timeline"],
  ["functions/_shared/brokerage-cases.js", "brokerage-case-orchestrator-v1"],
  ["functions/_shared/brokerage-cases.js", "marketing_automation: \"disabled_until_explicit_opt_in\""],
  ["functions/_shared/brokerage-cases.js", "cross_sell: \"disabled_until_explicit_opt_in\""],
  ["functions/api/admin/cases.js", "Validation humaine requise avant envoi"],
  ["functions/api/admin/cases.js", "approve_mail"],
  ["functions/api/admin/cases.js", "send_mail"],
  ["functions/api/admin/cases.js", "case_timeline"],
  ["functions/api/client/case.js", "client_document_received"],
  ["scripts/brokerage-case-orchestrator.js", "human-review-before-send"],
  ["scripts/local-production-server.js", "/api/admin/cases"],
  ["scripts/local-production-server.js", "/api/client/case"],
  ["public/admin.html", "cases-admin:start"],
  ["public/assets/admin.js", "loadCases"],
  ["public/espace-client.html", "Espace client"],
  ["public/assets/client-portal.js", "markDocumentReceived"],
  ["public/assets/styles.css", "client-portal-main"],
  ["package.json", "brokerage:cases"]
];

const FORBIDDEN = [
  ["functions/api/admin/cases.js", "status = 'sent' WHERE id = ? AND status = 'draft_review'"],
  ["functions/_shared/brokerage-cases.js", "marketing_automation: \"enabled"],
  ["functions/_shared/brokerage-cases.js", "cross_sell: \"enabled"]
];

function read(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

const missing = [];
for (const [file, snippet] of REQUIRED) {
  if (!read(file).includes(snippet)) missing.push(`${file}: ${snippet}`);
}
const forbidden = [];
for (const [file, snippet] of FORBIDDEN) {
  if (read(file).includes(snippet)) forbidden.push(`${file}: ${snippet}`);
}
const report = {
  generated_at: new Date().toISOString(),
  status: missing.length || forbidden.length ? "failed" : "passed",
  required_markers: REQUIRED.length,
  forbidden_markers: FORBIDDEN.length,
  issue_count: missing.length + forbidden.length,
  missing,
  forbidden,
  safeguards: ["human-review-before-send", "client-token-portal", "consent-snapshot", "audit-timeline", "no-unsupervised-cross-sell"]
};
mkdirSync("reports", { recursive: true });
mkdirSync(join("public", "assets"), { recursive: true });
writeFileSync(join("reports", "brokerage-case-contract-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(join("public", "assets", "brokerage-case-contract-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (report.status !== "passed") {
  console.error(`Brokerage case contract failed: ${[...missing, ...forbidden].join(", ")}`);
  process.exit(1);
}
console.log(`Brokerage case contract passed for ${REQUIRED.length} required marker(s) and ${FORBIDDEN.length} forbidden marker(s).`);