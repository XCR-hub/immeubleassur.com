import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { quoteSqlIdentifier } from "./local-sqlite-db.js";

loadDefaultEnvFiles();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function snapshotFileFrom(input) {
  const target = resolve(input || env("LOCAL_SQLITE_RESTORE_DIR", join("data", "immeubleassur-snapshot")));
  if (target.endsWith(".gz") && existsSync(target)) return target;
  const direct = join(target, "snapshot.json.gz");
  if (existsSync(direct)) return direct;
  const latest = join(target, "latest.json");
  if (existsSync(latest)) {
    const manifest = JSON.parse(readFileSync(latest, "utf8"));
    const byId = join(target, manifest.snapshot_id || "", "snapshot.json.gz");
    if (existsSync(byId)) return byId;
  }
  throw new Error(`Snapshot introuvable: ${target}`);
}

function readSnapshot(file) {
  const compressed = readFileSync(file);
  const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
  if (!payload || payload.site !== "immeubleassur.com" || !payload.data || typeof payload.data !== "object") {
    throw new Error("Snapshot ImmeubleAssur invalide");
  }
  return payload;
}

function restoreRows(database, data) {
  database.exec("PRAGMA foreign_keys = OFF;");
  for (const table of Object.keys(data).reverse()) {
    database.exec(`DELETE FROM ${quoteSqlIdentifier(table)};`);
  }

  let totalRows = 0;
  const tables = [];
  for (const [table, rows] of Object.entries(data)) {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (!safeRows.length) {
      tables.push({ table, rows: 0 });
      continue;
    }
    const columns = Object.keys(safeRows[0]);
    const sql = `INSERT OR REPLACE INTO ${quoteSqlIdentifier(table)} (${columns.map(quoteSqlIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
    const statement = database.prepare(sql);
    database.exec("BEGIN;");
    try {
      for (const row of safeRows) {
        statement.run(...columns.map((column) => row[column] ?? null));
      }
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }
    totalRows += safeRows.length;
    tables.push({ table, rows: safeRows.length });
  }
  database.exec("PRAGMA foreign_keys = ON;");
  return { tables, totalRows };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function removeIfExists(file) {
  if (existsSync(file)) rmSync(file, { force: true });
}

function run() {
  const snapshotFile = snapshotFileFrom(argValue("--snapshot", ""));
  const payload = readSnapshot(snapshotFile);
  const dbPath = resolve(argValue("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
  const replace = hasFlag("--replace");
  const tmpPath = `${dbPath}.tmp-${process.pid}`;

  if (existsSync(dbPath) && !replace) {
    throw new Error(`La base existe deja: ${dbPath}. Ajouter --replace pour restaurer le snapshot.`);
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  removeIfExists(tmpPath);
  const database = new DatabaseSync(tmpPath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
  database.exec(String(payload.schema || readFileSync("schema.sql", "utf8")));
  const summary = restoreRows(database, payload.data);
  database.close();

  let backupPath = "";
  if (existsSync(dbPath)) {
    backupPath = `${dbPath}.bak-${timestamp()}`;
    copyFileSync(dbPath, backupPath);
    removeIfExists(dbPath);
    removeIfExists(`${dbPath}-wal`);
    removeIfExists(`${dbPath}-shm`);
  }
  renameSync(tmpPath, dbPath);

  const report = {
    success: true,
    restored_at: new Date().toISOString(),
    snapshot_id: payload.snapshot_id,
    source_snapshot: snapshotFile,
    sqlite_db: dbPath,
    backup: backupPath || null,
    table_count: summary.tables.length,
    total_rows: summary.totalRows,
    tables: summary.tables
  };
  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "local-sqlite-restore-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`SQLite restored: ${summary.totalRows} row(s), ${summary.tables.length} table(s), ${dbPath}`);
}

run();
