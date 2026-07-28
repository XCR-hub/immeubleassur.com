import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function backupFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => /^immeubleassur-\d{4}-.*\.sqlite$/.test(name))
    .map((name) => {
      const file = join(directory, name);
      return { name, file, mtimeMs: statSync(file).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function pruneBackups(directory, keep) {
  const files = backupFiles(directory);
  const pruned = [];
  for (const file of files.slice(keep)) {
    rmSync(file.file, { force: true });
    pruned.push(file.name);
  }
  return { retained: files.slice(0, keep).map((file) => file.name), pruned };
}

function inspectBackup(file) {
  const database = new DatabaseSync(file);
  try {
    const integrity = database.prepare("PRAGMA integrity_check").get()?.integrity_check || "unknown";
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => row.name);
    return { integrity, table_count: tables.length, tables };
  } finally {
    database.close();
  }
}

function run() {
  const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
  const backupDir = resolve(argValue("--out", env("LOCAL_SQLITE_BACKUP_DIR", join("backups", "sqlite"))));
  const keep = Number.parseInt(argValue("--keep", env("LOCAL_SQLITE_BACKUP_KEEP", "30")), 10) || 30;

  if (!existsSync(dbPath)) throw new Error(`Base SQLite introuvable: ${dbPath}`);
  mkdirSync(backupDir, { recursive: true });
  mkdirSync(dirname(join(backupDir, "latest.json")), { recursive: true });

  const backupPath = join(backupDir, `immeubleassur-${timestamp()}.sqlite`);
  const database = new DatabaseSync(dbPath);
  try {
    database.exec("PRAGMA busy_timeout = 10000;");
    database.exec("PRAGMA wal_checkpoint(PASSIVE);");
    database.exec(`VACUUM INTO ${sqlString(backupPath)};`);
  } finally {
    database.close();
  }

  const inspection = inspectBackup(backupPath);
  if (inspection.integrity !== "ok") throw new Error(`Sauvegarde SQLite invalide: ${inspection.integrity}`);

  const retention = pruneBackups(backupDir, keep);
  const report = {
    success: true,
    generated_at: new Date().toISOString(),
    sqlite_db: dbPath,
    backup_file: backupPath,
    size_bytes: statSync(backupPath).size,
    sha256: sha256(backupPath),
    keep,
    retained: retention.retained,
    pruned: retention.pruned,
    integrity: inspection.integrity,
    table_count: inspection.table_count,
    tables: inspection.tables
  };
  writeFileSync(join(backupDir, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`SQLite backup: ${backupPath}`);
  console.log(`Integrity: ${inspection.integrity}, tables: ${inspection.table_count}, retained: ${retention.retained.length}`);
}

run();