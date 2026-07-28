import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";

const expectations = [
  {
    file: "functions/api/admin/attribution.js",
    role: "admin-attribution-api",
    snippets: [
      "buildAttribution",
      "sourceKey",
      "landing_pages",
      "campaigns",
      "visitor_to_lead_rate",
      "form_to_lead_rate",
      "actions",
      "Donnees agregees"
    ]
  },
  {
    file: "public/assets/admin.js",
    role: "admin-attribution-ui",
    snippets: [
      "loadAttribution",
      "/api/admin/attribution",
      "attributionRows",
      "attribution-summary",
      "attribution-body",
      "Top source",
      "Visiteur -> lead",
      "Campagnes"
    ]
  },
  {
    file: "scripts/generate-site.js",
    role: "admin-attribution-generator",
    snippets: ["attribution-admin:start", "load-attribution", "Attribution acquisition", "admin-attribution-table"]
  },
  {
    file: "scripts/seo-content-factory.js",
    role: "admin-attribution-injector",
    snippets: ["attributionBlock", "attribution-admin", "load-attribution", "Attribution acquisition"]
  },
  {
    file: "package.json",
    role: "package-checks",
    snippets: ["functions/api/admin/attribution.js", "scripts/attribution-contract-check.js", "attribution:check"]
  }
];

const missing = [];
for (const expectation of expectations) {
  const source = readFileSync(expectation.file, "utf8");
  for (const snippet of expectation.snippets) {
    if (!source.includes(snippet)) {
      missing.push({ file: expectation.file, role: expectation.role, snippet });
    }
  }
}

const report = {
  generated_at: new Date().toISOString(),
  checked_files: expectations.map((item) => item.file),
  required_contracts: expectations.reduce((sum, item) => sum + item.snippets.length, 0),
  missing,
  status: missing.length ? "failed" : "passed"
};

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "attribution-contract-report.json"), JSON.stringify(report, null, 2), "utf8");

if (missing.length) {
  console.error(`Attribution contract failed: ${missing.map((item) => `${item.file}:${item.snippet}`).join(", ")}`);
  process.exit(1);
}

console.log(`Attribution contract passed for ${report.required_contracts} required markers.`);
