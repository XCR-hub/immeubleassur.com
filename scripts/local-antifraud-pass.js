import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const ASSET_DIR = join(PUBLIC_DIR, "assets");
const legacyBlockPattern = /\s*<!-- turnstile-protection:start -->[\s\S]*?<!-- turnstile-protection:end -->\s*/gi;
const legacyScriptPattern = /\s*<script\b[^>]*turnstile\/v0\/api\.js[^>]*><\/script>\s*/gi;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function cleanLegacyChallenge(html) {
  return html.replace(legacyBlockPattern, "\n").replace(legacyScriptPattern, "\n");
}

function inspectPage(file) {
  const original = readFileSync(file, "utf8");
  const html = cleanLegacyChallenge(original);
  const hasForm = html.includes('id="lead-form"');
  const hasAppScript = /<script\b[^>]*\/assets\/app\.js/.test(html);
  const hasHoneypot = /name="company_website"/.test(html);
  const hasLocalBotSignals = hasForm && hasAppScript && hasHoneypot;

  if (html !== original) writeFileSync(file, html, "utf8");

  return {
    file: relative(PUBLIC_DIR, file).replace(/\\/g, "/"),
    has_form: hasForm,
    local_bot_signals: hasLocalBotSignals,
    legacy_removed: html !== original
  };
}

const pages = walk(PUBLIC_DIR).filter((file) => file.endsWith(".html") && !file.endsWith("admin.html"));
const rows = pages.map(inspectPage);
const formRows = rows.filter((row) => row.has_form);
const missingLocalSignals = formRows.filter((row) => !row.local_bot_signals).map((row) => row.file);
const report = {
  generated_at: new Date().toISOString(),
  provider: "local-antifraud",
  configured: true,
  pages_checked: rows.length,
  forms_detected: formRows.length,
  forms_instrumented: formRows.length - missingLocalSignals.length,
  legacy_widgets_removed: rows.filter((row) => row.legacy_removed).length,
  protections: ["honeypot", "js-signal", "session-token", "form-timing", "interaction-count", "ip-email-phone-history"],
  missing_local_signals: missingLocalSignals,
  status: missingLocalSignals.length ? "failed" : "passed"
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(ASSET_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "local-antifraud-report.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(ASSET_DIR, "local-antifraud-latest.json"), JSON.stringify(report, null, 2), "utf8");

if (missingLocalSignals.length) {
  console.error(`Local anti-fraud check failed for ${missingLocalSignals.length} form page(s).`);
  for (const file of missingLocalSignals.slice(0, 40)) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`Local anti-fraud pass cleaned ${report.legacy_widgets_removed} legacy challenge block(s) across ${formRows.length} form page(s).`);
