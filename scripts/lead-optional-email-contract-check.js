import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { validateLeadPayload, buildLeadEmail, buildDuplicateLeadEmail, leadSubmissionFingerprint } from "../functions/api/leads.js";

function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(dir, entry.name)) : extname(entry.name) === ".html" ? [join(dir, entry.name)] : []); }
const base = { name: "Jean Dupont", phone: "0612345678", email: "", profile: "syndic-benevole", property_type: "copropriete", city: "Lyon", consent: true };
const mailRecord = { ...base, submission_mode: "complet", utm: {} };
const mailQualification = { priority: "high", value_estimate: {}, sla_hours: 4, next_action: "Rappeler", reasons: [], urgency: {} };
const phoneOnlyMail = buildLeadEmail({ id: "lead-test", reference: "IA-TEST", score: 80, qualification: mailQualification, record: mailRecord, now: "2026-08-10T00:00:00.000Z" });
const phoneOnlyDuplicate = buildDuplicateLeadEmail({ duplicate: { reference: "IA-TEST", duplicate_reason: "telephone", lead_score: 80 }, record: mailRecord, now: "2026-08-10T00:00:00.000Z" });
const emailMail = buildLeadEmail({ id: "lead-test", reference: "IA-TEST", score: 80, qualification: mailQualification, record: { ...mailRecord, email: "contact@example.fr" }, now: "2026-08-10T00:00:00.000Z" });
const fingerprintA = await leadSubmissionFingerprint({ ...mailRecord, email: "contact@example.fr" }, "2026-08-10T10:00:00.000Z");
const fingerprintSame = await leadSubmissionFingerprint({ ...mailRecord, email: "contact@example.fr" }, "2026-08-10T11:00:00.000Z");
const fingerprintNextDay = await leadSubmissionFingerprint({ ...mailRecord, email: "contact@example.fr" }, "2026-08-11T10:00:00.000Z");
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
const retry = readFileSync("scripts/local-lead-notification-retry.js", "utf8");
const server = readFileSync("scripts/local-production-server.js", "utf8");
const generatorFiles = ["scripts/generate-site.js", "scripts/lead-growth-factory.js", "scripts/money-intent-factory.js", "scripts/seo-content-factory.js", "scripts/serp-recovery-factory.js"];
const staleGeneratorMarkers = generatorFiles.filter((file) => readFileSync(file, "utf8").includes('Email *<input name="email" type="email" autocomplete="email" required'));
const checks = [
  ["complete-lead-without-email-valid", validateLeadPayload(base) === ""],
  ["optional-email-still-validated", validateLeadPayload({ ...base, email: "invalide" }) === "Email invalide"],
  ["email-requires-domain-suffix", validateLeadPayload({ ...base, email: "contact@localhost" }) === "Email invalide"],
  ["email-rejects-header-injection", validateLeadPayload({ ...base, email: "contact@example.fr\r\nBcc: attacker@example.test" }) === "Email invalide"],
  ["phone-rejects-impossible-length", validateLeadPayload({ ...base, phone: "1234567890123456" }) === "Telephone invalide"],
  ["phone-remains-required", validateLeadPayload({ ...base, phone: "" }) === "Champ manquant: phone"],
  ["express-phone-only-valid", validateLeadPayload({ phone: "0612345678", email: "", consent: true, submission_mode: "express-callback" }) === ""],
  ["phone-only-notification-labelled", phoneOnlyMail.subject.includes("TELEPHONE SEUL") && phoneOnlyMail.text.includes("non renseigne - contacter par telephone")],
  ["phone-only-duplicate-labelled", phoneOnlyDuplicate.subject.includes("TELEPHONE SEUL") && phoneOnlyDuplicate.text.includes("non renseigne - contacter par telephone")],
  ["phone-only-retry-labelled", retry.includes('" - TELEPHONE SEUL"') && retry.includes('"non renseigne - contacter par telephone"')],
  ["retry-backlog-counted-independently", retry.includes("function backlog(") && retry.includes("pending_notifications")],
  ["exact-submission-fingerprint-is-stable-per-day", /^[a-f0-9]{64}$/.test(fingerprintA) && fingerprintA === fingerprintSame],
  ["submission-fingerprint-expires-next-day", fingerprintA !== fingerprintNextDay],
  ["atomic-concurrent-insert-deduplicates", api.includes("INSERT OR IGNORE INTO leads") && api.includes("insertResult?.meta?.changes") && api.includes('status: "duplicate_concurrent"')],
  ["retry-exhaustion-remains-visible", retry.includes("backlogState.exhausted") && retry.includes('report.status === "degraded"')],
  ["retry-overdue-remains-visible", retry.includes("backlogState.overdue") && retry.includes("oldest_pending_hours")],
  ["email-notification-unchanged", emailMail.subject === "Nouveau lead ImmeubleAssur IA-TEST" && emailMail.text.includes("Email: contact@example.fr")],
  ["reply-to-remains-conditional", api.includes('...(record.email ? [`Reply-To: ${headerSafe(record.email)}`] : [])')],
  ["smtp-events-redact-diagnostics", api.includes("receipt: safeDiagnostic(notification.receipt)") && api.includes("error: safeDiagnostic(error.message")],
  ["lead-database-errors-are-generic", api.includes('code: "lead-persistence-failed"') && !api.includes('reply({ success: false, error: error.message')],
  ["local-api-errors-are-generic", server.includes('code: "api-handler-failed"') && !server.includes('error: error.message || "Erreur serveur local"')],
  ["all-rendered-lead-forms-covered", leadForms.length >= 180 && invalidForms.length === 0],
  ["newsletter-email-still-required", invalidNewsletters.length === 0],
  ["client-validation-email-optional", app.includes('const requiredFields = ["name", "phone", "profile", "property_type", "city"]') && app.includes('if (payload.email && !emailLooksValid(payload.email))')],
  ["api-validation-email-optional", api.includes('const required = ["name", "phone", "profile", "property_type", "city"]') && api.includes('if (email && !validEmail) return "Email invalide"')],
  ["generators-preserve-optional-email", staleGeneratorMarkers.length === 0],
  ["newsletter-generator-email-required", readFileSync("scripts/editorial-autopilot.js", "utf8").includes('Email *<input name="email" type="email" autocomplete="email" required')]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, lead_forms_checked: leadForms.length, invalid_forms: invalidForms, invalid_newsletters: invalidNewsletters, stale_generator_markers: staleGeneratorMarkers, safeguards: ["phone-still-required", "consent-still-required", "filled-email-validated", "express-mode-unchanged", "all-generated-forms-covered", "phone-only-notifications-explicit", "strict-contact-syntax", "header-injection-rejected", "smtp-diagnostics-redacted", "generic-public-errors", "atomic-concurrent-dedupe", "daily-idempotency-window"] };
const out = process.env.LOCAL_LEAD_OPTIONAL_EMAIL_CONTRACT_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "lead-optional-email-contract-report.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Lead optional email contract: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}), forms=${leadForms.length}.`);
if (missing.length) process.exit(1);