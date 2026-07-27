import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";
const expectations = [
  { file: "functions/api/leads.js", snippets: ["assessSpamSubmission", "loadSpamHistory", "logSpamAttempt", "lead_spam_blocked", "spam_score", "honeypot-rempli", "signal-js-absent", "verifyTurnstile", "TURNSTILE_SECRET_KEY", "challenges.cloudflare.com/turnstile/v0/siteverify"] },
  { file: "public/assets/app.js", snippets: ["botSignalPayload", "anti_bot", "form_elapsed_ms", "interaction_count", "bindBotSignalTracking", "turnstile_token", "lead_submit_rejected"] },
  { file: "functions/api/admin/seo.js", snippets: ["lead_spam_blocked", "spam_blocked", "spam_blocks", "spam-bloque"] },
  { file: "public/assets/admin.js", snippets: ["Spam bloques", "spam-bloque", "robots filtres"] },
  { file: "functions/api/events.js", snippets: ["lead_spam_blocked", "ia_lead_spam_blocked"] },
  { file: "scripts/turnstile-protection-pass.js", snippets: ["TURNSTILE_SITE_KEY", "turnstile-protection:start", "cf-turnstile", "turnstile-protection-report.json"] }
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