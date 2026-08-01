import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();

const REPORT_DIR = "reports";
const ASSET_DIR = join("public", "assets");
const READINESS_REPORT = join(REPORT_DIR, "live-api-readiness-report.json");
const REPORT_PATH = join(REPORT_DIR, "google-readiness-unlock-report.json");
const ASSET_PATH = join(ASSET_DIR, "google-readiness-unlock-latest.json");

const plans = {
  "google-search-console": {
    severity: "high",
    objective: "Importer requetes, pages, CTR, positions, URL Inspection et sitemap depuis Search Console.",
    variables: ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY", "GOOGLE_SEARCH_CONSOLE_SITE_URL"],
    command: "npm run seo:apis",
    steps: [
      "Ajouter le service account dans la propriete Search Console du domaine.",
      "Renseigner GOOGLE_SERVICE_ACCOUNT_EMAIL et GOOGLE_SERVICE_ACCOUNT_KEY dans .env.local sur le serveur.",
      "Conserver GOOGLE_SEARCH_CONSOLE_SITE_URL=sc-domain:immeubleassur.com sauf choix contraire dans Search Console.",
      "Relancer npm run seo:apis puis npm run live:api:readiness."
    ]
  },
  pagespeed: {
    severity: "medium",
    objective: "Mesurer les performances mobiles des pages money avec PageSpeed Insights.",
    variables: ["PAGESPEED_API_KEY"],
    command: "npm run seo:apis",
    steps: [
      "Activer PageSpeed Insights API dans le projet Google Cloud choisi.",
      "Renseigner PAGESPEED_API_KEY dans .env.local sur le serveur.",
      "Relancer npm run seo:apis pour produire pagespeed.checked et les pages lentes.",
      "Surveiller le budget avec npm run performance:budget."
    ]
  },
  ga4: {
    severity: "medium",
    objective: "Relier les evenements formulaire, intentions et leads qualifies a GA4 sans donnees nominatives.",
    variables: ["GA4_MEASUREMENT_ID", "GA4_API_SECRET"],
    command: "npm run generate",
    steps: [
      "Creer ou choisir un flux Web GA4 pour immeubleassur.com.",
      "Renseigner GA4_MEASUREMENT_ID pour activer le tag client sans page_view automatique.",
      "Renseigner GA4_API_SECRET pour envoyer generate_lead cote serveur via Measurement Protocol.",
      "Relancer npm run generate puis npm run check."
    ]
  },
  serpapi: {
    severity: "medium",
    objective: "Remplacer les estimations locales par des positions Google mesurees via API autorisee.",
    variables: ["SERP_API_KEY"],
    command: "npm run search:live",
    steps: [
      "Verifier que SERP_API_KEY est presente et valide.",
      "Controler le quota et la connectivite sortante du serveur.",
      "Relancer npm run search:live.",
      "Ne traiter les positions fallback que comme signaux faibles."
    ]
  }
};

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function envConfigured(names) {
  return names.some((name) => String(process.env[name] || "").trim().length > 0);
}

function rowById(report, id) {
  return (report?.rows || []).find((row) => row.id === id) || null;
}

function missingFor(row) {
  const missingRequired = row?.missing_required_names || [];
  const missingAny = row?.missing_any_names || [];
  return [...missingRequired, ...missingAny].filter(Boolean);
}

function lastStatus(row) {
  return String(row?.last_report?.status || row?.status || "").trim();
}

function degraded(row) {
  const status = lastStatus(row).toLowerCase();
  return Boolean(row?.ready && /(fallback|unavailable|invalid|failed|error|local-only)/.test(status));
}

function actionFor(id, row, reason) {
  const plan = plans[id];
  const missing = missingFor(row);
  const optionalMissing = [];
  if (id === "ga4" && !envConfigured(["GA4_API_SECRET", "GOOGLE_GA4_API_SECRET"])) optionalMissing.push("GA4_API_SECRET");
  return {
    id,
    label: row?.label || id,
    family: row?.family || (id === "ga4" ? "analytics" : "google"),
    severity: plan.severity,
    reason,
    status: row?.status || "unknown",
    ready: Boolean(row?.ready),
    objective: plan.objective,
    missing_required_names: missing,
    missing_optional_names: optionalMissing,
    command: plan.command,
    signal: reason === "missing-secret"
      ? `Manque: ${missing.join(", ") || optionalMissing.join(", ")}`
      : `Dernier statut: ${lastStatus(row) || "inconnu"}`,
    next_action: plan.steps[0],
    steps: plan.steps,
    secret_names_only: plan.variables
  };
}

const readiness = readJson(READINESS_REPORT);
const actions = [];
const watchedIds = ["google-search-console", "pagespeed", "ga4", "serpapi"];

for (const id of watchedIds) {
  const row = rowById(readiness, id);
  if (!row) {
    actions.push(actionFor(id, { id, label: id, ready: false, status: "missing-report-row", missing_required_names: plans[id].variables }, "missing-report-row"));
    continue;
  }
  if (!row.ready) actions.push(actionFor(id, row, "missing-secret"));
  else if (degraded(row)) actions.push(actionFor(id, row, "degraded-run"));
  else if (id === "ga4" && !envConfigured(["GA4_API_SECRET", "GOOGLE_GA4_API_SECRET"])) actions.push(actionFor(id, row, "measurement-secret-missing"));
}

const googleRows = watchedIds.map((id) => rowById(readiness, id)).filter(Boolean);
const readyRows = googleRows.filter((row) => row.ready && !degraded(row));
const report = {
  generated_at: new Date().toISOString(),
  status: actions.some((item) => item.reason === "missing-secret" || item.reason === "missing-report-row") ? "action-required" : actions.length ? "degraded" : "ready",
  watched_connectors: watchedIds,
  google_ready_count: readyRows.length,
  google_connector_count: googleRows.length,
  blocking_count: actions.filter((item) => item.reason === "missing-secret" || item.reason === "missing-report-row").length,
  degraded_count: actions.filter((item) => item.reason === "degraded-run" || item.reason === "measurement-secret-missing").length,
  actions,
  readiness_status: readiness?.status || "missing",
  readiness_ready_count: readiness?.ready_count || 0,
  readiness_connector_count: readiness?.connectors_checked || 0,
  safeguards: [
    "no-secret-values-exported",
    "secret-names-only",
    "google-apis-use-official-connectors",
    "serp-signals-labelled-measured-or-fallback",
    "ga4-events-without-pii"
  ]
};

writeJson(REPORT_PATH, report);
writeJson(ASSET_PATH, report);

console.log(`Google readiness unlock ${report.status}: ${report.blocking_count} blocking, ${report.degraded_count} degraded.`);
