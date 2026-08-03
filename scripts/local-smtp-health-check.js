import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { verifyNodeSmtpConnection } from "./local-smtp.js";

loadDefaultEnvFiles();

const reportPath = resolve(env("LOCAL_SMTP_HEALTH_REPORT", "reports/local-smtp-health-report.json"));
const host = env("SMTP_HOST", "");
const port = Number.parseInt(env("SMTP_PORT", "587"), 10) || 587;
const username = env("SMTP_USER", "");
const password = env("SMTP_PASS", "");
const report = {
  generated_at: new Date().toISOString(),
  status: "failed",
  host: host ? "configured" : "missing",
  port,
  username: username ? "configured" : "missing",
  password: password ? "configured" : "missing",
  secure_transport: port === 465 ? "tls" : "starttls",
  authenticated: false,
  error: ""
};

try {
  const result = await verifyNodeSmtpConnection({ host, port, username, password, secureTransport: port === 465 ? "on" : "starttls" });
  report.status = result.status;
  report.authenticated = result.authenticated === true;
} catch (error) {
  report.error = String(error?.message || "SMTP verification failed").replace(/[\\r\\n]/g, " ").slice(0, 500);
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`SMTP health ${report.status}: ${report.authenticated ? "authenticated" : report.error || "not ready"}.`);

