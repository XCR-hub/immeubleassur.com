import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { verifyNodeSmtpRecipients } from "./local-smtp.js";
import { verifyResendConnection } from "../functions/_shared/smtp.js";

loadDefaultEnvFiles();

const reportPath = resolve(env("LOCAL_SMTP_HEALTH_REPORT", "reports/local-smtp-health-report.json"));
const transport = env("EMAIL_TRANSPORT", "smtp").toLowerCase();
const resendKey = env("RESEND_API_KEY", "");
const resendUrl = env("RESEND_API_URL", "https://api.resend.com/emails");
const host = env("SMTP_HOST", "");
const port = Number.parseInt(env("SMTP_PORT", "587"), 10) || 587;
const username = env("SMTP_USER", "");
const password = env("SMTP_PASS", "");
const from = env("SMTP_FROM", username);
const recipients = String(env("SMTP_TO", env("CONTACT_EMAIL", from))).split(/[;,]/).map((item) => item.trim()).filter(Boolean).slice(0, 6);
const teamRecipientConfigured = recipients.some((item) => item.toLowerCase() === "team@immeubleassur.com");
const report = {
  generated_at: new Date().toISOString(),
  status: "failed",
  transport,
  provider: transport === "resend" ? "resend" : "smtp",
  host: host ? "configured" : "missing",
  port,
  username: username ? "configured" : "missing",
  password: password ? "configured" : "missing",
  secure_transport: transport === "resend" ? "https" : (port === 465 ? "tls" : "starttls"),
  api_key: transport === "resend" ? (resendKey ? "configured" : "missing") : "not-used",
  authenticated: false,
  team_recipient_configured: teamRecipientConfigured,
  recipient_count: recipients.length,
  recipient_accepted: false,
  envelope_test_only: transport !== "resend",
  message_sent: false,
  error: ""
};

try {
  if (!teamRecipientConfigured) throw new Error("Destinataire operationnel team@immeubleassur.com absent");
  const result = transport === "resend"
    ? await verifyResendConnection({ apiKey: resendKey, apiUrl: resendUrl })
    : await verifyNodeSmtpRecipients({ host, port, username, password, from, to: recipients, secureTransport: port === 465 ? "on" : "starttls" });
  report.status = result.status;
  report.authenticated = result.authenticated === true;
  report.recipient_accepted = result.recipient_accepted === true;
} catch (error) {
  report.error = String(error?.message || "SMTP verification failed").replace(/[\\r\\n]/g, " ").slice(0, 500);
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(report.provider + " health " + report.status + ": " + (report.authenticated ? "authenticated" : report.error || "not ready") + ".");

