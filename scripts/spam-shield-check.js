import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";
const expectations = [
  { file: "functions/api/leads.js", snippets: ["assessSpamSubmission", "loadSpamHistory", "logSpamAttempt", "lead_spam_blocked", "spam_score", "honeypot-rempli", "signal-js-absent", "localChallengeStatus", "local-challenge", "verifyTurnstile", "TURNSTILE_SECRET_KEY", "turnstile-failed", "expectedSessionToken", "jeton-session-invalide", "email-jetable", "rafale-ip", "session-deja-bloquee"] },
  { file: "public/assets/app.js", snippets: ["botSignalPayload", "anti_bot", "form_elapsed_ms", "interaction_count", "bindBotSignalTracking", "lead_submit_rejected", "challenge", "turnstile_token", "newsletter_turnstile_token", "cf-turnstile-response"] },
  { file: "functions/api/admin/seo.js", snippets: ["lead_spam_blocked", "spam_blocked", "spam_blocks", "spam-bloque"] },
  { file: "functions/api/admin/spam.js", snippets: ["lead_spam_blocked", "newsletter_spam_blocked", "maskIp", "repeat_sources", "privacy", "top_reasons"] },
  { file: "public/assets/admin.js", snippets: ["Spam bloques", "spam-bloque", "robots filtres", "loadSpam", "/api/admin/spam", "Sources masquees", "Anti-fraude local", "Turnstile"] },
  { file: "functions/api/events.js", snippets: ["lead_spam_blocked", "ia_lead_spam_blocked", "challenge"] },
  { file: "functions/api/newsletter.js", snippets: ["localNewsletterChallengeStatus", "assessNewsletterSpam", "loadNewsletterSpamHistory", "newsletter_spam_blocked", "spam_score", "email-jetable", "volume-ip-newsletter", "blockNewsletterSpam", "verifyNewsletterTurnstile", "TURNSTILE_SECRET_KEY", "turnstile-failed", "newsletter_turnstile_token"] },
  { file: "scripts/local-antifraud-pass.js", snippets: ["local-antifraud", "local-antifraud-report.json", "local-antifraud-latest.json", "legacy_widgets_removed"] },
  { file: "scripts/turnstile-hybrid-pass.js", snippets: ["cloudflare-turnstile", "turnstile-hybrid-report.json", "turnstile-hybrid-latest.json", "fallback-local-antifraud", "newsletter_subscribe", "newsletter_forms_detected"] },
  { file: "package.json", snippets: ["turnstile:hybrid", "turnstile-hybrid-pass.js"] },
  { file: "scripts/generate-site.js", snippets: ["spam-admin:start", "load-spam", "Bouclier anti-spam"] }
];

const missing = [];
for (const expectation of expectations) {
  const source = readFileSync(expectation.file, "utf8");
  for (const snippet of expectation.snippets) {
    if (!source.includes(snippet)) missing.push({ file: expectation.file, snippet });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  checked_files: expectations.map((item) => item.file),
  required_markers: expectations.reduce((sum, item) => sum + item.snippets.length, 0),
  missing,
  status: missing.length ? "failed" : "passed"
};

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "spam-shield-report.json"), JSON.stringify(report, null, 2), "utf8");

if (missing.length) {
  console.error(`Spam shield contract failed: ${missing.map((item) => `${item.file}:${item.snippet}`).join(", ")}`);
  process.exit(1);
}

console.log(`Spam shield contract passed for ${report.required_markers} required markers.`);