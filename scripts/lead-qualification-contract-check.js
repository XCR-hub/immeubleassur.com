import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";

const expectations = [
  {
    file: "functions/api/leads.js",
    role: "lead-api",
    snippets: [
      "readinessSignals",
      "dossier assureur prepare",
      "pieces assureur disponibles",
      "Reprendre les pieces disponibles"
    ]
  },
  {
    file: "functions/api/admin/leads.js",
    role: "admin-leads",
    snippets: [
      "readinessSignals",
      "dossier assureur prepare",
      "pieces assureur disponibles",
      "Reprendre les pieces disponibles"
    ]
  },
  {
    file: "public/assets/app.js",
    role: "lead-form-runtime",
    snippets: [
      "readinessSignals",
      "dossier assureur prepare",
      "pieces assureur disponibles",
      "readiness_complete",
      "Dossier pret assureur"
    ]
  },
  {
    file: "functions/api/events.js",
    role: "event-api",
    snippets: ["readiness_start", "readiness_update", "readiness_complete"]
  },
  {
    file: "functions/api/admin/seo.js",
    role: "seo-admin",
    snippets: ["readiness_paths", "readiness_completion_rate", "dossier-friction", "dossier-gagnant"]
  },
  {
    file: "public/assets/admin.js",
    role: "admin-dashboard",
    snippets: ["Dossier pret", "readiness_paths", "dossier-pret"]
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
writeFileSync(join(REPORT_DIR, "lead-qualification-contract-report.json"), JSON.stringify(report, null, 2), "utf8");

if (missing.length) {
  console.error(`Lead qualification contract failed: ${missing.map((item) => `${item.file}:${item.snippet}`).join(", ")}`);
  process.exit(1);
}

console.log(`Lead qualification contract passed for ${report.required_contracts} required markers.`);