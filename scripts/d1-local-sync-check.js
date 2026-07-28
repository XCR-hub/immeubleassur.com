import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const expectations = [
  {
    file: "scripts/d1-local-sync.js",
    role: "d1-exporter",
    snippets: ["LOCAL_DB_SYNC_URL", "192.168.1.70", "wrangler", "snapshot.json.gz", "--push"]
  },
  {
    file: "scripts/local-d1-receiver.js",
    role: "local-receiver",
    snippets: ["LOCAL_DB_SYNC_TOKEN", "/sync/d1", "/health", "snapshot.json.gz", "latest.json"]
  },
  {
    file: "package.json",
    role: "package-scripts",
    snippets: ["db:sync:local", "db:receiver", "db:sync:check", "scripts/d1-local-sync-check.js"]
  },
  {
    file: "README.md",
    role: "documentation",
    snippets: ["192.168.1.70", "LOCAL_DB_SYNC_TOKEN", "npm run db:sync:local", "Cloudflare D1 reste la base active"]
  },
  {
    file: ".gitignore",
    role: "data-safety",
    snippets: ["backups/", "data/", "*.sqlite3"]
  }
];

const missing = [];
for (const expectation of expectations) {
  const source = readFileSync(expectation.file, "utf8");
  for (const snippet of expectation.snippets) {
    if (!source.includes(snippet)) missing.push({ file: expectation.file, role: expectation.role, snippet });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  status: missing.length ? "failed" : "passed",
  checked_files: expectations.map((item) => item.file),
  required_contracts: expectations.reduce((sum, item) => sum + item.snippets.length, 0),
  missing
};

mkdirSync("reports", { recursive: true });
writeFileSync(join("reports", "d1-local-sync-check-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (missing.length) {
  console.error(`D1 local sync contract failed: ${missing.map((item) => `${item.file}:${item.snippet}`).join(", ")}`);
  process.exit(1);
}

console.log(`D1 local sync contract passed for ${report.required_contracts} required markers.`);
