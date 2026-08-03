import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

const origin = env("SITE_ORIGIN", "https://immeubleassur.com");
const target = new URL(origin);
const reportPath = resolve(env("LOCAL_TLS_REPORT", "reports/local-tls-certificate-report.json"));
const warningDays = Math.max(7, Number.parseInt(env("LOCAL_TLS_WARNING_DAYS", "45"), 10) || 45);
const criticalDays = Math.max(3, Number.parseInt(env("LOCAL_TLS_CRITICAL_DAYS", "21"), 10) || 21);
const timeoutMs = Math.max(3000, Number.parseInt(env("LOCAL_TLS_TIMEOUT_MS", "10000"), 10) || 10000);

function writeReport(report) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function inspectCertificate() {
  return new Promise((resolveResult) => {
    const socket = tlsConnect({
      host: target.hostname,
      port: Number(target.port || 443),
      servername: target.hostname,
      rejectUnauthorized: true,
      timeout: timeoutMs
    });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveResult(result);
    };
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      const notAfter = Date.parse(certificate.valid_to || "");
      const daysRemaining = Number.isFinite(notAfter) ? Math.floor((notAfter - Date.now()) / 86400000) : -1;
      const status = daysRemaining < 0 ? "failed" : daysRemaining <= criticalDays ? "critical" : daysRemaining <= warningDays ? "warning" : "healthy";
      finish({
        status,
        ok: status !== "failed" && status !== "critical",
        generated_at: new Date().toISOString(),
        origin: `${target.protocol}//${target.host}`,
        subject: certificate.subject?.CN || "",
        issuer: certificate.issuer?.CN || certificate.issuer?.O || "",
        valid_from: certificate.valid_from || "",
        valid_to: certificate.valid_to || "",
        days_remaining: daysRemaining,
        warning_days: warningDays,
        critical_days: criticalDays,
        renewal_provider: "caddy-letsencrypt-automatic"
      });
    });
    socket.once("timeout", () => finish({ status: "failed", ok: false, error: "TLS timeout" }));
    socket.once("error", (error) => finish({ status: "failed", ok: false, error: error.message || "TLS connection failed" }));
  });
}

const report = await inspectCertificate();
writeReport(report);
if (!report.ok) {
  console.error(`TLS certificate monitor ${report.status}: ${report.error || `${report.days_remaining} day(s) remaining`}.`);
  process.exit(1);
}
console.log(`TLS certificate monitor ${report.status}: ${report.days_remaining} day(s) remaining.`);