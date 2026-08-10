import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function quoteIdentifier(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function writeReport(path, report) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function run() {
  const backupDir = resolve(env("LOCAL_SQLITE_BACKUP_DIR", join("backups", "sqlite")));
  const manifestPath = resolve(env("LOCAL_SQLITE_BACKUP_MANIFEST", join(backupDir, "latest.json")));
  const drillDir = resolve(env("LOCAL_SQLITE_RESTORE_DRILL_DIR", join("data", "restore-drill")));
  const reportPath = resolve(env("LOCAL_SQLITE_RESTORE_DRILL_REPORT", join("reports", "local-sqlite-restore-drill-report.json")));
  const preferMirror = env("LOCAL_SQLITE_RESTORE_DRILL_PREFER_MIRROR", "1") === "1";
  const retainCopy = env("LOCAL_SQLITE_RESTORE_DRILL_RETAIN_COPY", "0") === "1";
  let restoredPath = "";
  const report = { generated_at: new Date().toISOString(), status: "failed", manifest: manifestPath };

  try {
    if (!existsSync(manifestPath)) throw new Error(`Manifest de sauvegarde introuvable: ${manifestPath}`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const useMirror = preferMirror && manifest.mirror?.verified === true && existsSync(manifest.mirror.backup_file || "");
    const sourcePath = resolve(useMirror ? manifest.mirror.backup_file : manifest.backup_file || "");
    if (!existsSync(sourcePath)) throw new Error(`Sauvegarde source introuvable: ${sourcePath}`);
    const expectedHash = useMirror ? manifest.mirror.sha256 : manifest.sha256;

    mkdirSync(drillDir, { recursive: true });
    restoredPath = join(drillDir, `restore-drill-${Date.now()}.sqlite`);
    copyFileSync(sourcePath, restoredPath);
    const restoredHash = sha256(restoredPath);
    if (!expectedHash || restoredHash !== expectedHash) throw new Error("Empreinte de la restauration differente de la sauvegarde");

    const database = new DatabaseSync(restoredPath, { readOnly: true });
    try {
      const integrity = database.prepare("PRAGMA integrity_check").get()?.integrity_check || "unknown";
      const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all().length;
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
      let totalRows = 0;
      for (const table of tables) totalRows += Number(database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get()?.count || 0);
      if (integrity !== "ok" || foreignKeyViolations !== 0 || tables.length < 10) throw new Error(`Restauration invalide: integrity=${integrity}, foreign_keys=${foreignKeyViolations}, tables=${tables.length}`);
      Object.assign(report, { status: "passed", source_type: useMirror ? "mirror" : "primary", source_file: sourcePath, restored_file: restoredPath, source_hash_verified: true, sha256: restoredHash, size_bytes: statSync(restoredPath).size, integrity, foreign_key_violations: foreignKeyViolations, table_count: tables.length, total_rows: totalRows });
    } finally {
      database.close();
    }
  } catch (error) {
    report.error = error.message || "restore drill failed";
  } finally {
    if (restoredPath && existsSync(restoredPath) && !retainCopy) rmSync(restoredPath, { force: true });
    report.copy_retained = Boolean(retainCopy && restoredPath && existsSync(restoredPath));
    writeReport(reportPath, report);
  }

  console.log(`SQLite restore drill: ${report.status} (${report.source_type || "none"}, ${report.table_count || 0} tables).`);
  if (report.status !== "passed") process.exit(1);
}

run();
