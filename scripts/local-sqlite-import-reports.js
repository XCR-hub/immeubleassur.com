import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

const reportFiles = [
  "reports/seo-autopilot-report.json",
  "reports/search-intelligence-report.json",
  "reports/search-gap-booster-report.json",
  "reports/editorial-autopilot-report.json",
  "reports/media-autopilot-report.json",
  "reports/conversion-intelligence-report.json",
  "reports/cro-experiment-report.json",
  "reports/lead-friction-report.json",
  "reports/lead-intent-routing-report.json",
  "reports/lead-urgency-feedback-report.json",
  "reports/local-antifraud-report.json",
  "reports/content-diversity-report.json",
  "reports/seo-cannibalization-report.json",
  "reports/seo-intent-differentiation-report.json",
  "reports/seo-angle-differentiation-report.json",
  "reports/internal-link-equity-report.json",
  "reports/cluster-conversion-bridge-report.json",
  "reports/live-api-readiness-report.json"
];

function readJsonReport(file) {
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return {
      file,
      status: parsed.status || parsed.ai_status || parsed.provider || "present",
      generated_at: parsed.generated_at || parsed.imported_at || ""
    };
  } catch (error) {
    return { file, status: "invalid-json", error: error.message || "lecture impossible" };
  }
}

function latestGeneratedAt(reports) {
  return reports
    .map((item) => item.generated_at)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function localDatabaseFile(value) {
  return String(value || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1) || "immeubleassur.sqlite";
}

const db = openLocalSqlite({ dbPath: env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite")), schemaPath: "schema.sql" });
const reports = reportFiles.map(readJsonReport).filter(Boolean);
const invalid = reports.filter((item) => item.status === "invalid-json");
const result = {
  success: invalid.length === 0,
  imported_at: latestGeneratedAt(reports),
  imported_at_source: "latest-report-generated-at",
  mode: "local-json-report-check",
  reports,
  database: {
    engine: "sqlite",
    path_source: "LOCAL_SQLITE_DB",
    file: localDatabaseFile(db.path)
  },
  note: "Les rapports sont lus depuis JSON locaux; aucune execution SQL externe n'est necessaire."
};

db.close();
mkdirSync("reports", { recursive: true });
writeFileSync(join("reports", "local-sqlite-import-report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

if (invalid.length) {
  console.error(`SQLite local report check failed: ${invalid.map((item) => item.file).join(", ")}`);
  process.exit(1);
}

console.log(`SQLite local report check complete: ${reports.length} report(s), database ${result.database.file} via ${result.database.path_source}.`);
