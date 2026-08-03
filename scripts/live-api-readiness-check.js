import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();

const REPORT_DIR = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const ASSET_DIR = process.env.LOCAL_RUNTIME_ASSETS_ROOT ? join(process.env.LOCAL_RUNTIME_ASSETS_ROOT, "assets") : join("public", "assets");

const connectors = [
  {
    id: "turnstile",
    label: "Cloudflare Turnstile",
    family: "security",
    required: ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"],
    command: "npm run turnstile:hybrid",
    report: "reports/turnstile-hybrid-report.json",
    objective: "Activer le challenge anti-robot automatique sur les formulaires."
  },
  {
    id: "serpapi",
    label: "SerpApi",
    family: "seo",
    required: ["SERP_API_KEY"],
    command: "npm run search:live",
    report: "reports/search-intelligence-report.json",
    objective: "Mesurer les vraies positions Google par API sans scraping direct."
  },
  {
    id: "pexels",
    label: "Pexels",
    family: "media",
    required: ["PEXELS_API_KEY"],
    command: "npm run media:live",
    report: "reports/media-autopilot-report.json",
    objective: "Injecter des visuels immobiliers attribues sur les pages prioritaires."
  },
  {
    id: "editorial-ai",
    label: "IA editoriale",
    family: "content",
    requiredAny: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "HUGGINGFACE_API_KEY"],
    command: "npm run editorial:live",
    report: "reports/editorial-autopilot-report.json",
    objective: "Synthese de veille assistee par IA avec fallback local."
  },
  {
    id: "google-search-console",
    label: "Google Search Console",
    family: "google",
    required: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY", "GOOGLE_SEARCH_CONSOLE_SITE_URL"],
    command: "npm run seo:apis",
    report: "reports/seo-autopilot-report.json",
    objective: "Importer requetes, CTR, positions, URL Inspection et sitemap."
  },
  {
    id: "pagespeed",
    label: "PageSpeed Insights",
    family: "google",
    required: ["PAGESPEED_API_KEY"],
    command: "npm run seo:apis",
    report: "reports/seo-autopilot-report.json",
    objective: "Mesurer la performance mobile des pages money."
  },
  {
    id: "ga4",
    label: "GA4 Measurement Protocol",
    family: "analytics",
    required: ["GA4_MEASUREMENT_ID"],
    optional: ["GA4_API_SECRET"],
    command: "npm run generate",
    report: "reports/seo-growth-summary.json",
    objective: "Mesurer les evenements et relier les formulaires aux parcours."
  },
  {
    id: "smtp",
    label: "SMTP local",
    family: "email",
    required: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_TO"],
    command: "npm run local:autarky:check",
    report: "reports/local-autarky-report.json",
    objective: "Envoyer les notifications leads et newsletters depuis le serveur local."
  }
];

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function write(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function configured(name) {
  return String(process.env[name] || "").trim().length > 0;
}

function readReport(file) {
  if (!file || !existsSync(file)) return { available: false };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return {
      available: true,
      generated_at: parsed.generated_at || parsed.imported_at || "",
      status: parsed.status || parsed.mode || parsed.provider || "present",
      summary: {
        provider: parsed.provider || "",
        mode: parsed.mode || "",
        configured: Boolean(parsed.configured || parsed.serp_enabled || parsed.pexels_enabled),
        pages_checked: parsed.pages_checked || parsed.keywords_checked || 0,
        forms_detected: parsed.forms_detected || 0,
        forms_instrumented: parsed.forms_instrumented || 0,
        serp_error_count: Number(parsed.serp_error_count || 0),
        serp_request_count: Number(parsed.serp_request_count || 0),
        rate_limited: parsed.rate_limited === true,
        rate_limited_skipped_count: Number(parsed.rate_limited_skipped_count || 0),
        retry_after: parsed.retry_after || ""
      }
    };
  } catch (error) {
    return { available: true, status: "invalid-json", error: error.message || "lecture impossible" };
  }
}

function connectorStatus(connector) {
  const required = connector.required || [];
  const requiredAny = connector.requiredAny || [];
  const optional = connector.optional || [];
  const missingRequired = required.filter((name) => !configured(name));
  const anyConfigured = requiredAny.length ? requiredAny.some(configured) : true;
  const missingAny = requiredAny.length && !anyConfigured ? requiredAny : [];
  const ready = missingRequired.length === 0 && missingAny.length === 0;
  return {
    ...connector,
    ready,
    status: ready ? "ready" : "fallback",
    required_count: required.length + (requiredAny.length ? 1 : 0),
    configured_required: required.filter(configured).length + (requiredAny.length && anyConfigured ? 1 : 0),
    optional_count: optional.length,
    configured_optional: optional.filter(configured).length,
    required_names: required,
    required_any_names: requiredAny,
    optional_names: optional,
    missing_required_names: missingRequired,
    missing_any_names: missingAny,
    last_report: readReport(connector.report),
    recommendation: ready ? `Executer ${connector.command} pour rafraichir le signal live.` : `Configurer ${[...missingRequired, ...(missingAny.length ? ["une cle IA"] : [])].join(", ")} puis executer ${connector.command}.`
  };
}

const rows = connectors.map(connectorStatus);
const ready = rows.filter((row) => row.ready);
const report = {
  generated_at: new Date().toISOString(),
  status: ready.length === rows.length ? "ready" : ready.length ? "partial" : "fallback-only",
  connectors_checked: rows.length,
  ready_count: ready.length,
  fallback_count: rows.length - ready.length,
  rows,
  safeguards: ["no-secret-values-exported", "local-env-files-gitignored", "live-apis-run-only-when-commanded", "fallbacks-remain-operational"]
};

write(join(REPORT_DIR, "live-api-readiness-report.json"), report);
write(join(ASSET_DIR, "live-api-readiness-latest.json"), report);

console.log(`Live API readiness ${report.status}: ${report.ready_count}/${report.connectors_checked} connector(s) ready.`);
