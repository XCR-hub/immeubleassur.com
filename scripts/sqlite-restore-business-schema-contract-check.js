import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = mkdtempSync(join(tmpdir(), "immeubleassur-restore-business-schema-"));
const source = join(root, "backup.sqlite");
const manifest = join(root, "latest.json");
const reportPath = join(root, "restore-report.json");
const drillDir = join(root, "drill");
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const writeManifest = () => writeFileSync(manifest, JSON.stringify({ backup_file: source, sha256: sha256(source), mirror: { verified: false } }), "utf8");
const runDrill = () => spawnSync(process.execPath, ["scripts/local-sqlite-restore-drill.js"], { cwd: process.cwd(), env: { ...process.env, LOCAL_SQLITE_BACKUP_MANIFEST: manifest, LOCAL_SQLITE_RESTORE_DRILL_DIR: drillDir, LOCAL_SQLITE_RESTORE_DRILL_REPORT: reportPath, LOCAL_SQLITE_RESTORE_DRILL_PREFER_MIRROR: "0", LOCAL_SQLITE_RESTORE_DRILL_RETAIN_COPY: "0" }, encoding: "utf8" });

try {
  let database = new DatabaseSync(source);
  for (let index = 0; index < 12; index += 1) database.exec(`CREATE TABLE dummy_${index} (id TEXT PRIMARY KEY)`);
  database.close();
  writeManifest();
  let result = runDrill();
  if (result.status === 0) throw new Error("structurally valid backup without business tables must fail");
  let report = JSON.parse(readFileSync(reportPath, "utf8"));
  const missingDetected = report.status === "failed" && report.integrity === "ok" && report.table_count === 12 && report.missing_required_tables?.includes("leads") && report.missing_required_tables?.includes("client_contracts");
  if (!missingDetected) throw new Error("missing business tables were not diagnosed");

  rmSync(source, { force: true });
  database = new DatabaseSync(source);
  database.exec(readFileSync("schema.sql", "utf8"));
  database.close();
  writeManifest();
  result = runDrill();
  if (result.status !== 0) throw new Error(result.stderr || "valid business schema restore drill failed");
  report = JSON.parse(readFileSync(reportPath, "utf8"));
  const checks = [
    ["valid-schema-passes", report.status === "passed" && report.integrity === "ok"],
    ["all-required-business-tables-present", report.required_table_count === 10 && report.missing_required_tables.length === 0],
    ["source-hash-verified", report.source_hash_verified === true],
    ["foreign-keys-clean", report.foreign_key_violations === 0],
    ["temporary-restore-copy-removed", report.copy_retained === false && (!existsSync(drillDir) || readdirSync(drillDir).filter((name) => name.endsWith(".sqlite")).length === 0)]
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length) throw new Error(`Restore business schema contract failed: ${missing.join(", ")}`);
  console.log(`SQLite restore business schema contract passed: ${checks.length + 2}/${checks.length + 2}.`);
} finally {
  if (root.startsWith(tmpdir())) rmSync(root, { recursive: true, force: true });
}