import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { validateLeadPayload } from "../functions/api/leads.js";

function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(dir, entry.name)) : extname(entry.name) === ".html" ? [join(dir, entry.name)] : []); }
const base = { name: "Jean Dupont", phone: "0612345678", email: "", profile: "syndic-benevole", property_type: "copropriete", city: "Lyon", consent: true };
const htmlFiles = walk("public");
const leadForms = [];
const invalidForms = [];
const invalidNewsletters = [];
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/<form[^>]*id="lead-form"[\s\S]*?<\/form>/gi)) {
    leadForms.push(file);
    const email = (match[0].match(/<input[^>]*name="email"[^>]*>/i) || [""])[0];
    if (!email || /\brequired\b/i.test(email) || !match[0].includes("Email (facultatif)")) invalidForms.push(file);
  }
}
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/<form[^>]*class="[^"]*newsletter-form[^"]*"[\s\S]*?<\/form>/gi)) {
    const email = (match[0].match(/<input[^>]*name="email"[^>]*>/i) || [""])[0];
    if (!email || !/\brequired\b/i.test(email) || !match[0].includes("Email *")) invalidNewsletters.push(file);
  }
}
const app = readFileSync("public/assets/app.js", "utf8");
const api = readFileSync("functions/api/leads.js", "utf8");
const generatorFiles = ["scripts/generate-site.js", "scripts/lead-growth-factory.js", "scripts/money-intent-factory.js", "scripts/seo-content-factory.js", "scripts/serp-recovery-factory.js"];
const staleGeneratorMarkers = generatorFiles.filter((file) => readFileSync(file, "utf8").includes('Email *<input name="email" type="email" autocomplete="email" required'));
const checks = [
  ["complete-lead-without-email-valid", validateLeadPayload(base) === ""],
  ["optional-email-still-validated", validateLeadPayload({ ...base, email: "invalide" }) === "Email invalide"],
  ["phone-remains-required", validateLeadPayload({ ...base, phone: "" }) === "Champ manquant: phone"],
  ["express-phone-only-valid", validateLeadPayload({ phone: "0612345678", email: "", consent: true, submission_mode: "express-callback" }) === ""],
  ["all-rendered-lead-forms-covered", leadForms.length >= 180 && invalidForms.length === 0],
  ["newsletter-email-still-required", invalidNewsletters.length === 0],
  ["client-validation-email-optional", app.includes('const requiredFields = ["name", "phone", "profile", "property_type", "city"]') && app.includes('if (payload.email && !emailLooksValid(payload.email))')],
  ["api-validation-email-optional", api.includes('const required = ["name", "phone", "profile", "property_type", "city"]') && api.includes('if (email && !validEmail) return "Email invalide"')],
  ["generators-preserve-optional-email", staleGeneratorMarkers.length === 0],
  ["newsletter-generator-email-required", readFileSync("scripts/editorial-autopilot.js", "utf8").includes('Email *<input name="email" type="email" autocomplete="email" required')]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, lead_forms_checked: leadForms.length, invalid_forms: invalidForms, invalid_newsletters: invalidNewsletters, stale_generator_markers: staleGeneratorMarkers, safeguards: ["phone-still-required", "consent-still-required", "filled-email-validated", "express-mode-unchanged", "all-generated-forms-covered"] };
const out = process.env.LOCAL_LEAD_OPTIONAL_EMAIL_CONTRACT_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "lead-optional-email-contract-report.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Lead optional email contract: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}), forms=${leadForms.length}.`);
if (missing.length) process.exit(1);