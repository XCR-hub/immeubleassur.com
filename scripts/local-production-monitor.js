import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { sendNodeSmtpMail } from "./local-smtp.js";

loadDefaultEnvFiles();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function numberEnv(name, fallback) {
  const number = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(number) ? number : fallback;
}

function check(name, ok, details = {}, severity = "fail") {
  return { name, ok: Boolean(ok), severity, ...details };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeout_ms || 12000));
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 ImmeubleAssurMonitor",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {}
    return { response, text, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHomepage(origin) {
  try {
    const response = await fetch(`${origin}/`, {
      headers: { "User-Agent": "Mozilla/5.0 ImmeubleAssurMonitor" },
      signal: AbortSignal.timeout(12000)
    });
    const html = await response.text();
    return check("homepage_https", response.ok && html.includes("ImmeubleAssur"), {
      status: response.status,
      bytes: html.length
    });
  } catch (error) {
    return check("homepage_https", false, { error: error.message || "homepage unavailable" });
  }
}

async function checkHealth(origin) {
  try {
    const { response, body } = await fetchJson(`${origin}/health`);
    return check("public_health", response.ok && body?.success === true && body?.status === "ok", {
      status: response.status,
      mode: body?.mode || ""
    });
  } catch (error) {
    return check("public_health", false, { error: error.message || "health unavailable" });
  }
}

async function checkTelemetryFilter(origin) {
  try {
    const payload = {
      event_type: "page_view",
      page_url: "https://invalid-monitor-origin.example/",
      path: "/",
      session_id: `monitor-${Date.now().toString(36)}`,
      target: "production-monitor",
      label: "telemetry-filter-check"
    };
    const { response, body } = await fetchJson(`${origin}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return check("telemetry_filter", response.ok && body?.sampled === false, {
      status: response.status,
      reason: body?.reason || ""
    });
  } catch (error) {
    return check("telemetry_filter", false, { error: error.message || "events unavailable" });
  }
}

function inspectSqlite(dbPath) {
  if (!existsSync(dbPath)) return check("sqlite_database", false, { path: dbPath, error: "missing" });
  const database = new DatabaseSync(dbPath);
  try {
    const integrity = database.prepare("PRAGMA integrity_check").get()?.integrity_check || "unknown";
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => row.name);
    const leads24h = database.prepare("SELECT COUNT(*) AS count FROM leads WHERE created_at >= datetime('now', '-24 hours')").get()?.count || 0;
    const spam24h = database.prepare("SELECT COUNT(*) AS count FROM site_events WHERE event_type IN ('lead_spam_blocked', 'newsletter_spam_blocked') AND created_at >= datetime('now', '-24 hours')").get()?.count || 0;
    return check("sqlite_database", integrity === "ok" && tables.length >= 10, {
      path: dbPath,
      size_bytes: statSync(dbPath).size,
      integrity,
      table_count: tables.length,
      leads_24h: Number(leads24h || 0),
      spam_blocks_24h: Number(spam24h || 0)
    });
  } catch (error) {
    return check("sqlite_database", false, { path: dbPath, error: error.message || "sqlite inspection failed" });
  } finally {
    database.close();
  }
}

function inspectBackup(manifestPath, maxAgeHours) {
  if (!existsSync(manifestPath)) return check("sqlite_backup_age", false, { manifest: manifestPath, error: "missing" });
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const generated = new Date(manifest.generated_at).getTime();
    const ageHours = generated ? Math.round(((Date.now() - generated) / 3600000) * 10) / 10 : 9999;
    return check("sqlite_backup_age", manifest.integrity === "ok" && ageHours <= maxAgeHours, {
      manifest: manifestPath,
      backup_file: manifest.backup_file || "",
      integrity: manifest.integrity || "",
      table_count: manifest.table_count || 0,
      age_hours: ageHours,
      max_age_hours: maxAgeHours
    });
  } catch (error) {
    return check("sqlite_backup_age", false, { manifest: manifestPath, error: error.message || "backup manifest unreadable" });
  }
}

function mailConfig() {
  const from = env("SMTP_FROM", env("SMTP_USER", ""));
  const to = env("LOCAL_MONITOR_ALERT_TO", env("SMTP_TO", from));
  return {
    host: env("SMTP_HOST", ""),
    port: numberEnv("SMTP_PORT", 587),
    username: env("SMTP_USER", from),
    password: env("SMTP_PASS", ""),
    from,
    to: String(to || "").split(/[;,]/).map((item) => item.trim()).filter(Boolean).slice(0, 6),
    secureTransport: numberEnv("SMTP_PORT", 587) === 465 ? "on" : "starttls"
  };
}

async function maybeAlert(report) {
  if (env("LOCAL_MONITOR_ALERTS", "0") !== "1" || report.success) return { attempted: false, status: "skipped" };
  const config = mailConfig();
  if (!config.host || !config.username || !config.password || !config.from || !config.to.length) {
    return { attempted: false, status: "missing-smtp-config" };
  }
  const failed = report.checks.filter((item) => !item.ok);
  const text = [
    `Alerte ImmeubleAssur production monitor`,
    `Date: ${report.generated_at}`,
    `Origin: ${report.origin}`,
    "",
    ...failed.map((item) => `- ${item.name}: ${item.error || item.reason || item.status || "failed"}`)
  ].join("\n");
  const message = [
    `From: ImmeubleAssur Monitor <${config.from}>`,
    `To: ${config.to.join(", ")}`,
    `Subject: Alerte ImmeubleAssur production`,
    `Date: ${new Date(report.generated_at).toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text
  ].join("\r\n");
  const receipt = await sendNodeSmtpMail(config, message);
  return { attempted: true, status: "sent", receipt };
}

async function run() {
  const origin = cleanUrl(argValue("--origin", env("SITE_ORIGIN", "https://immeubleassur.com")));
  const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
  const backupDir = resolve(argValue("--backup-dir", env("LOCAL_SQLITE_BACKUP_DIR", join("backups", "sqlite"))));
  const backupManifest = resolve(argValue("--backup-manifest", join(backupDir, "latest.json")));
  const maxBackupAgeHours = numberEnv("LOCAL_SQLITE_BACKUP_MAX_AGE_HOURS", 8);
  const out = resolve(argValue("--out", env("LOCAL_PRODUCTION_MONITOR_REPORT", join("reports", "local-production-monitor-report.json"))));

  const checks = [
    await checkHomepage(origin),
    await checkHealth(origin),
    await checkTelemetryFilter(origin),
    inspectSqlite(dbPath),
    inspectBackup(backupManifest, maxBackupAgeHours)
  ];

  const report = {
    success: checks.every((item) => item.ok || item.severity === "warn"),
    generated_at: new Date().toISOString(),
    origin,
    checks,
    summary: {
      ok: checks.filter((item) => item.ok).length,
      failed: checks.filter((item) => !item.ok && item.severity !== "warn").length,
      warnings: checks.filter((item) => !item.ok && item.severity === "warn").length
    }
  };
  report.alert = await maybeAlert(report).catch((error) => ({ attempted: true, status: "failed", error: error.message || "alert failed" }));

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Production monitor: ${report.success ? "ok" : "failed"} (${report.summary.ok}/${checks.length} checks ok)`);
  console.log(`Report: ${out}`);
  if (!report.success) process.exit(1);
}

run();
