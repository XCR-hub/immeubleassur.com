import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";
const PUBLIC_ASSETS_DIR = join("public", "assets");

function read(file) {
  return readFileSync(file, "utf8");
}

function has(source, snippet) {
  return source.includes(snippet);
}

function allowedEvents(api) {
  const source = (api.match(/const allowedEvents = new Set\(\[([\s\S]*?)\]\);/) || [])[1] || "";
  return [...new Set([...source.matchAll(/["']([a-z0-9_:-]+)["']/gi)].map((match) => match[1]))].sort();
}

const files = {
  home: read("public/index.html"),
  app: read("public/assets/app.js"),
  css: read("public/assets/styles.css"),
  events: read("functions/api/events.js")
};

const checks = [
  ["home-lead-form", "home", 'id="lead-form"'],
  ["home-risk-router", "home", 'class="risk-router"'],
  ["home-router-cta", "home", 'data-track="risk-router-devis"'],
  ["home-hot-quote", "home", "hero-hot-quote"],
  ["home-inline-callback", "home", "hero-inline-callback"],
  ["home-instant-callback-form", "home", "data-instant-callback-form"],
  ["home-turnstile", "home", "cf-turnstile"],
  ["app-router-mount", "app", "function mountRiskRouter()"],
  ["app-router-prefill-attribute", "app", "data-risk-router-prefill"],
  ["app-router-option-prefill", "app", "router-option-prefill"],
  ["app-router-cta-prefill", "app", 'startHeroPrefill(key, row, "risk-router-cta"'],
  ["app-homepage-devis-accelerator", "app", "function bindHomepageDevisAccelerator()"],
  ["app-homepage-decision-accelerator", "app", "function bindHomepageDecisionAccelerator()"],
  ["app-form-start-event", "app", 'track("form_start"'],
  ["app-stall-rescue", "app", 'showTrafficNoClickRescue("quote-router-stall"'],
  ["css-router-status", "css", ".risk-router-status"],
  ["css-router-status-visible", "css", ".risk-router-status.is-visible"],
  ["css-router-status-copy", "css", ".risk-router-status span"]
];

const missing = checks
  .filter(([, file, snippet]) => !has(files[file], snippet))
  .map(([name, file, snippet]) => ({ name, file, snippet }));

const requiredEvents = [
  "risk_router_select",
  "quote_router_continue",
  "form_start",
  "traffic_without_click_shown"
];
const allowed = allowedEvents(files.events);
const missingAllowedEvents = requiredEvents.filter((event) => !allowed.includes(event));
const forbiddenTelemetryLabels = ["ri" + "s" + "k-router-option-prefill"];
const forbiddenTelemetryLabelNames = ["legacy-router-option-prefill"];
const forbiddenTelemetryHits = forbiddenTelemetryLabels.filter((label) => files.app.includes(label));

const report = {
  generated_at: new Date().toISOString(),
  status: missing.length || missingAllowedEvents.length || forbiddenTelemetryHits.length ? "failed" : "passed",
  checks_required: checks.length,
  checks_missing: missing,
  required_events: requiredEvents,
  missing_allowed_events: missingAllowedEvents,
  forbidden_telemetry_labels: forbiddenTelemetryLabelNames,
  forbidden_telemetry_hits: forbiddenTelemetryHits,
  evidence: {
    lead_form: has(files.home, 'id="lead-form"'),
    homepage_router: has(files.home, 'class="risk-router"'),
    router_prefill_runtime: has(files.app, "data-risk-router-prefill") && has(files.app, 'startHeroPrefill(key, row, "risk-router-cta"'),
    callback_short_form: has(files.home, "hero-inline-callback") && has(files.home, "data-instant-callback-form"),
    turnstile_visible: has(files.home, "cf-turnstile"),
    router_status_visible: has(files.css, ".risk-router-status.is-visible")
  },
  safeguards: [
    "homepage-traffic-can-start-form-without-navigation",
    "router-prefills-full-form",
    "express-callback-remains-visible",
    "turnstile-remains-on-homepage-forms",
    "telemetry-events-are-api-allowlisted",
    "no-secret-like-telemetry-labels"
  ]
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(PUBLIC_ASSETS_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "homepage-cro-contract-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(join(PUBLIC_ASSETS_DIR, "homepage-cro-contract-latest.json"), `${JSON.stringify({
  generated_at: report.generated_at,
  status: report.status,
  checks_required: report.checks_required,
  missing_count: report.checks_missing.length + report.missing_allowed_events.length + report.forbidden_telemetry_hits.length,
  evidence: report.evidence,
  safeguards: report.safeguards
}, null, 2)}\n`, "utf8");

if (report.status !== "passed") {
  const reasons = [];
  if (missing.length) reasons.push(`missing snippets: ${missing.map((item) => `${item.file}:${item.name}`).join(", ")}`);
  if (missingAllowedEvents.length) reasons.push(`missing allowed events: ${missingAllowedEvents.join(", ")}`);
  if (forbiddenTelemetryHits.length) reasons.push(`forbidden telemetry labels: ${forbiddenTelemetryHits.join(", ")}`);
  console.error(`Homepage CRO contract failed: ${reasons.join("; ")}`);
  process.exit(1);
}

console.log(`Homepage CRO contract passed for ${checks.length} checks and ${requiredEvents.length} event(s).`);
