import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";
const expectations = [
  { file: "functions/api/leads.js", snippets: ["assessSpamSubmission", "loadSpamHistory", "logSpamAttempt", "lead_spam_blocked", "spam_score", "honeypot-rempli", "signal-js-absent", "localChallengeStatus", "local-challenge", "verifyTurnstile", "TURNSTILE_SECRET_KEY", "TURNSTILE_ALLOWED_HOSTNAMES", "lead_form", "hostname-invalide", "action-invalide", "requestOriginStatus", "corsHeadersFor", "corsOriginAllowed", "DEFAULT_CORS_ORIGIN", "Vary", "Origin", "Referer", "origin-failed", "origin-invalide", "referer-invalide", "turnstile-failed", "expectedSessionToken", "jeton-session-invalide", "email-jetable", "rafale-ip", "session-deja-bloquee", "findRecentDuplicateLead", "leadDuplicateReason", "lead_duplicate_filtered", "duplicate_recent"] },
  { file: "public/assets/app.js", snippets: ["botSignalPayload", "anti_bot", "form_elapsed_ms", "interaction_count", "bindBotSignalTracking", "lead_submit_rejected", "challenge", "turnstile_token", "newsletter_turnstile_token", "cf-turnstile-response", "lead_duplicate_returned"] },
  { file: "functions/api/admin/seo.js", snippets: ["lead_spam_blocked", "spam_blocked", "spam_blocks", "spam-bloque", "lead_duplicate_filtered", "duplicate_filtered", "duplicate_leads", "doublon-filtre"] },
  { file: "functions/api/admin/spam.js", snippets: ["lead_spam_blocked", "newsletter_spam_blocked", "lead_duplicate_filtered", "duplicate_filter_rate", "duplicates", "maskIp", "repeat_sources", "privacy", "top_reasons"] },
  { file: "functions/api/admin/integrations.js", snippets: ["lead_duplicate_filtered", "lead_duplicates_30d", "recent_duplicate_leads", "doublons-filtres"] },
  { file: "public/assets/admin.js", snippets: ["Spam bloques", "spam-bloque", "robots filtres", "loadSpam", "/api/admin/spam", "Sources masquees", "Doublons filtres", "Dedupe leads", "doublon-filtre", "Anti-fraude local", "Turnstile"] },
  { file: "functions/api/events.js", snippets: ["lead_spam_blocked", "ia_lead_spam_blocked", "lead_duplicate_returned", "ia_lead_duplicate_returned", "duplicate_reason", "challenge"] },
  { file: "functions/api/newsletter.js", snippets: ["localNewsletterChallengeStatus", "assessNewsletterSpam", "loadNewsletterSpamHistory", "newsletter_spam_blocked", "spam_score", "email-jetable", "volume-ip-newsletter", "blockNewsletterSpam", "verifyNewsletterTurnstile", "TURNSTILE_SECRET_KEY", "TURNSTILE_ALLOWED_HOSTNAMES", "newsletter_subscribe", "hostname-invalide", "action-invalide", "requestOriginStatus", "corsHeadersFor", "corsOriginAllowed", "DEFAULT_CORS_ORIGIN", "Vary", "Origin", "Referer", "origin-failed", "origin-invalide", "referer-invalide", "turnstile-failed", "newsletter_turnstile_token"] },
  { file: "scripts/local-antifraud-pass.js", snippets: ["local-antifraud", "local-antifraud-report.json", "local-antifraud-latest.json", "legacy_widgets_removed"] },
  { file: "scripts/turnstile-hybrid-pass.js", snippets: ["cloudflare-turnstile", "turnstile-hybrid-report.json", "turnstile-hybrid-latest.json", "fallback-local-antifraud", "newsletter_subscribe", "newsletter_forms_detected"] },
  { file: "scripts/lead-dedupe-runtime-check.js", snippets: ["duplicate-does-not-create-new-lead", "lead_duplicate_filtered", "duplicate_site_events", "admin-duplicate-metrics-verified", "getAdminSpam", "getAdminSeo", "getAdminIntegrations"] },
  { file: "package.json", snippets: ["turnstile:hybrid", "turnstile-hybrid-pass.js", "lead:dedupe", "lead-dedupe-runtime-check.js"] },
  { file: "scripts/generate-site.js", snippets: ["spam-admin:start", "load-spam", "Bouclier anti-spam"] }
];

const forbidden = [
  { file: "functions/api/leads.js", snippets: ["\"Access-Control-Allow-Origin\": \"*\""] },
  { file: "functions/api/newsletter.js", snippets: ["\"Access-Control-Allow-Origin\": \"*\""] }
];

const missing = [];
for (const expectation of expectations) {
  const source = readFileSync(expectation.file, "utf8");
  for (const snippet of expectation.snippets) {
    if (!source.includes(snippet)) missing.push({ file: expectation.file, snippet });
  }
}

const forbidden_hits = [];
for (const rule of forbidden) {
  const source = readFileSync(rule.file, "utf8");
  for (const snippet of rule.snippets) {
    if (source.includes(snippet)) forbidden_hits.push({ file: rule.file, snippet });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  checked_files: expectations.map((item) => item.file),
  required_markers: expectations.reduce((sum, item) => sum + item.snippets.length, 0),
  forbidden_markers: forbidden.reduce((sum, item) => sum + item.snippets.length, 0),
  missing,
  forbidden_hits,
  status: missing.length || forbidden_hits.length ? "failed" : "passed"
};

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "spam-shield-report.json"), JSON.stringify(report, null, 2), "utf8");

if (missing.length || forbidden_hits.length) {
  const missingText = missing.map((item) => `${item.file}:${item.snippet}`);
  const forbiddenText = forbidden_hits.map((item) => `forbidden:${item.file}:${item.snippet}`);
  console.error(`Spam shield contract failed: ${[...missingText, ...forbiddenText].join(", ")}`);
  process.exit(1);
}

console.log(`Spam shield contract passed for ${report.required_markers} required markers and ${report.forbidden_markers} forbidden markers.`);