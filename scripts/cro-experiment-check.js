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

const files = {
  app: read("public/assets/app.js"),
  events: read("functions/api/events.js"),
  leads: read("functions/api/leads.js"),
  adminSeo: read("functions/api/admin/seo.js"),
  admin: read("public/assets/admin.js"),
  ga4: read("functions/_shared/ga4.js")
};

const checks = [
  ["frontend-variants", files.app, "function experimentVariants()"],
  ["frontend-payload", files.app, "function experimentPayload()"],
  ["frontend-view-event", files.app, "experiment_view"],
  ["frontend-sticky-dataset", files.app, "data-experiment-variant"],
  ["events-allowlist", files.events, '"experiment_view"'],
  ["events-ga4-name", files.events, 'experiment_view: "ia_experiment_view"'],
  ["events-context", files.events, "experiment_variant: clean(payload.experiment_variant"],
  ["leads-record", files.leads, "experiment_variant: clean(payload.experiment_variant"],
  ["leads-email", files.leads, "Test CTA:"],
  ["admin-api-report", files.adminSeo, "cta_experiments"],
  ["admin-ui-card", files.admin, 'metricCard("Tests CTA"'],
  ["ga4-event-param", files.ga4, "experiment_variant: clean(params.experiment_variant"],
  ["ga4-lead-param", files.ga4, "record.experiment_variant || payload.experiment_variant"]
];

const missing = checks.filter(([, source, snippet]) => !has(source, snippet)).map(([name, , snippet]) => ({ name, snippet }));
const variants = [...files.app.matchAll(/variant:\s*"([a-z0-9_-]+)"/gi)].map((match) => match[1]);
const uniqueVariants = [...new Set(variants)].sort();

if (uniqueVariants.length < 3) {
  missing.push({ name: "frontend-variant-count", snippet: "at least 3 CTA variants" });
}

const report = {
  generated_at: new Date().toISOString(),
  status: missing.length ? "failed" : "passed",
  variant_count: uniqueVariants.length,
  variants: uniqueVariants,
  required_contracts: checks.length + 1,
  missing,
  safeguards: [
    "measure-cta-copy-by-lead-quality",
    "session-stable-variant",
    "no-cloaking-or-hidden-seo-text",
    "people-first-content-only"
  ]
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(PUBLIC_ASSETS_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "cro-experiment-report.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(PUBLIC_ASSETS_DIR, "cro-experiment-latest.json"), JSON.stringify({
  generated_at: report.generated_at,
  status: report.status,
  variant_count: report.variant_count,
  variants: report.variants,
  missing: report.missing,
  safeguards: report.safeguards
}, null, 2), "utf8");

if (missing.length) {
  console.error(`CRO experiment contract failed: ${missing.map((item) => item.name).join(", ")}`);
  process.exit(1);
}

console.log(`CRO experiment contract passed for ${uniqueVariants.length} CTA variants.`);