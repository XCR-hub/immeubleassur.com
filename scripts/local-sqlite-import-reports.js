import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openLocalD1 } from "./local-d1-sqlite.js";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

const reportFiles = [
  "reports/seo-autopilot-d1.sql",
  "reports/search-intelligence-d1.sql",
  "reports/editorial-autopilot-d1.sql",
  "reports/media-autopilot-d1.sql"
];

const db = openLocalD1({ dbPath: env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite")), schemaPath: "schema.sql" });
const imported = [];

try {
  for (const file of reportFiles) {
    if (!existsSync(file)) continue;
    const sql = readFileSync(file, "utf8").trim();
    if (!sql) continue;
    db.exec(sql);
    imported.push(file);
  }
  const result = { success: true, imported_at: new Date().toISOString(), imported, database: db.path };
  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "local-sqlite-import-report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`SQLite report import complete: ${imported.length} file(s).`);
} finally {
  db.close();
}
