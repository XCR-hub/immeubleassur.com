import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const ASSET_DIR = join(PUBLIC_DIR, "assets");
const SITE_KEY = String(process.env.TURNSTILE_SITE_KEY || "").trim();
const THEME = ["light", "dark", "auto"].includes(String(process.env.TURNSTILE_THEME || "light").trim()) ? String(process.env.TURNSTILE_THEME || "light").trim() : "light";
const configured = SITE_KEY.length > 0;
const legacyBlockPattern = /\s*<!-- turnstile-protection:start -->[\s\S]*?<!-- turnstile-protection:end -->\s*/gi;
const hybridBlockPattern = /\s*<!-- turnstile-hybrid:start -->[\s\S]*?<!-- turnstile-hybrid:end -->\s*/gi;
const turnstileScriptPattern = /\s*<script\b[^>]*turnstile\/v0\/api\.js[^>]*><\/script>\s*/gi;
const leadFormPattern = /<form\b[^>]*\bid="lead-form"[^>]*>[\s\S]*?<\/form>/gi;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function escAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanTurnstile(html) {
  return html
    .replace(legacyBlockPattern, "\n")
    .replace(hybridBlockPattern, "\n")
    .replace(turnstileScriptPattern, "\n");
}

function widgetMarkup() {
  return `<!-- turnstile-hybrid:start -->\n<div class="turnstile-field" data-turnstile-hybrid="cloudflare-optional"><div class="cf-turnstile" data-sitekey="${escAttr(SITE_KEY)}" data-theme="${escAttr(THEME)}" data-action="lead_form"></div></div>\n<!-- turnstile-hybrid:end -->`;
}

function injectWidgetInForm(formHtml) {
  if (!configured) return formHtml;
  const widget = widgetMarkup();
  if (/<button\b[^>]*type="submit"[^>]*>/i.test(formHtml)) {
    return formHtml.replace(/<button\b[^>]*type="submit"[^>]*>/i, `${widget}\n$&`);
  }
  return formHtml.replace(/<\/form>/i, `${widget}\n</form>`);
}

function ensureApiScript(html) {
  if (!configured || !html.includes("cf-turnstile")) return html;
  const script = `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `  ${script}\n</head>`);
  return `${html}\n${script}\n`;
}

function inspectPage(file) {
  const original = readFileSync(file, "utf8");
  const cleaned = cleanTurnstile(original);
  const formsDetected = (cleaned.match(leadFormPattern) || []).length;
  let html = cleaned;

  if (configured && formsDetected) {
    html = html.replace(leadFormPattern, (formHtml) => injectWidgetInForm(formHtml));
    html = ensureApiScript(html);
  }

  if (html !== original) writeFileSync(file, html, "utf8");

  const formsInstrumented = configured ? (html.match(/class="cf-turnstile"/g) || []).length : 0;
  return {
    file: relative(PUBLIC_DIR, file).replace(/\\/g, "/"),
    has_form: formsDetected > 0,
    forms_detected: formsDetected,
    forms_instrumented: Math.min(formsInstrumented, formsDetected),
    updated: html !== original
  };
}

const pages = walk(PUBLIC_DIR).filter((file) => file.endsWith(".html") && !file.endsWith("admin.html"));
const rows = pages.map(inspectPage);
const formRows = rows.filter((row) => row.has_form);
const missingWidgets = configured
  ? formRows.filter((row) => row.forms_instrumented < row.forms_detected).map((row) => row.file)
  : [];
const report = {
  generated_at: new Date().toISOString(),
  provider: "cloudflare-turnstile",
  mode: configured ? "hybrid-turnstile-local-antifraud" : "fallback-local-antifraud",
  configured,
  site_key_configured: configured,
  secret_variable: "TURNSTILE_SECRET_KEY",
  fail_open_variable: "TURNSTILE_FAIL_OPEN",
  fallback: "local-antifraud",
  pages_checked: rows.length,
  forms_detected: formRows.reduce((sum, row) => sum + row.forms_detected, 0),
  forms_instrumented: formRows.reduce((sum, row) => sum + row.forms_instrumented, 0),
  pages_updated: rows.filter((row) => row.updated).length,
  missing_widgets: missingWidgets,
  status: configured ? (missingWidgets.length ? "failed" : "passed") : "fallback-local-antifraud",
  protections: configured
    ? ["cloudflare-turnstile", "server-siteverify", "honeypot", "local-js-session", "local-history-filter"]
    : ["honeypot", "local-js-session", "local-history-filter"]
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(ASSET_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "turnstile-hybrid-report.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(ASSET_DIR, "turnstile-hybrid-latest.json"), JSON.stringify(report, null, 2), "utf8");

if (missingWidgets.length) {
  console.error(`Turnstile hybrid failed for ${missingWidgets.length} form page(s).`);
  for (const file of missingWidgets.slice(0, 40)) console.error(`- ${file}`);
  process.exit(1);
}

console.log(configured
  ? `Turnstile hybrid pass instrumented ${report.forms_instrumented}/${report.forms_detected} lead form(s).`
  : `Turnstile hybrid pass kept local anti-fraud fallback for ${report.forms_detected} lead form(s).`);