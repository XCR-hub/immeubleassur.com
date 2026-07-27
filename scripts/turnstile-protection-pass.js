import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const ASSET_DIR = join(PUBLIC_DIR, "assets");
const siteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();
const blockPattern = /\s*<!-- turnstile-protection:start -->[\s\S]*?<!-- turnstile-protection:end -->\s*/g;
const scriptPattern = /\s*<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js" async defer><\/script>/g;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function escAttr(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function turnstileBlock() {
  return `\n      <!-- turnstile-protection:start -->\n      <div class="turnstile-field" data-turnstile-protection="optional">\n        <div class="cf-turnstile" data-sitekey="${escAttr(siteKey)}" data-theme="light" data-size="normal"></div>\n      </div>\n      <!-- turnstile-protection:end -->\n      `;
}

function cleanPrevious(html) {
  return html.replace(blockPattern, "\n").replace(scriptPattern, "\n");
}

function protectPage(file) {
  const original = readFileSync(file, "utf8");
  let html = cleanPrevious(original);
  const hasForm = html.includes('id="lead-form"');
  let instrumented = false;

  if (siteKey && hasForm) {
    html = html.replace(/(<button[^>]*type="submit"[^>]*>)/i, `${turnstileBlock()}$1`);
    instrumented = html.includes("turnstile-protection:start");
    if (instrumented && !html.includes("challenges.cloudflare.com/turnstile/v0/api.js")) {
      html = html.replace("</head>", `    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>\n  </head>`);
    }
  }

  if (html !== original) writeFileSync(file, html, "utf8");
  return {
    file: relative(PUBLIC_DIR, file).replace(/\\/g, "/"),
    has_form: hasForm,
    instrumented,
    changed: html !== original
  };
}

const pages = walk(PUBLIC_DIR).filter((file) => file.endsWith(".html") && !file.endsWith("admin.html"));
const rows = pages.map(protectPage);
const forms = rows.filter((row) => row.has_form);
const instrumented = rows.filter((row) => row.instrumented);
const missing = siteKey ? forms.filter((row) => !row.instrumented).map((row) => row.file) : [];
const report = {
  generated_at: new Date().toISOString(),
  configured: Boolean(siteKey),
  pages_checked: rows.length,
  forms_detected: forms.length,
  forms_instrumented: instrumented.length,
  files_changed: rows.filter((row) => row.changed).length,
  missing,
  runtime_secret_required: "TURNSTILE_SECRET_KEY",
  public_site_key_required: "TURNSTILE_SITE_KEY",
  status: missing.length ? "failed" : "passed"
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(ASSET_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "turnstile-protection-report.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(ASSET_DIR, "turnstile-protection-latest.json"), JSON.stringify(report, null, 2), "utf8");

if (missing.length) {
  console.error(`Turnstile protection failed for ${missing.length} form page(s).`);
  for (const file of missing.slice(0, 40)) console.error(`- ${file}`);
  process.exit(1);
}

console.log(siteKey
  ? `Turnstile protection instrumented ${instrumented.length}/${forms.length} form pages.`
  : `Turnstile protection skipped: TURNSTILE_SITE_KEY not configured (${forms.length} form pages detected).`);