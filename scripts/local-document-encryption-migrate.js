import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { decryptDocumentBase64, documentEncryptionConfigured, encryptDocumentBase64, DOCUMENT_ENCRYPTION_MARKER } from "../functions/_shared/document-crypto.js";

loadDefaultEnvFiles();

const MIGRATION_MARKER = "document-encryption-migration-v1";
const apply = process.argv.includes("--apply");
const dbPath = resolve(process.env.LOCAL_SQLITE_DB || join("data", "immeubleassur.sqlite"));
const reportPath = resolve(process.env.DOCUMENT_ENCRYPTION_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "local-document-encryption-migration.json"));

function rows(database, table) {
  return database.prepare("SELECT id, payload FROM " + table + " WHERE payload IS NOT NULL AND payload <> ''").all()?.results || [];
}

async function migrateTable(database, table, report) {
  for (const row of rows(database, table)) {
    const payload = (() => { try { return JSON.parse(row.payload || "{}"); } catch { return {}; } })();
    const attachment = payload.attachment;
    if (!attachment || typeof attachment !== "object") continue;
    if (attachment.storage_marker === DOCUMENT_ENCRYPTION_MARKER) {
      report.already_encrypted += 1;
      continue;
    }
    if (!attachment.content_base64) {
      report.skipped += 1;
      continue;
    }
    report.candidates += 1;
    if (!apply) continue;
    const encrypted = await encryptDocumentBase64(attachment.content_base64, process.env);
    if (!encrypted) throw new Error("Chiffrement indisponible");
    delete attachment.content_base64;
    attachment.storage_marker = encrypted.marker;
    attachment.algorithm = encrypted.algorithm;
    attachment.iv_base64 = encrypted.iv_base64;
    attachment.ciphertext_base64 = encrypted.ciphertext_base64;
    attachment.migration_marker = MIGRATION_MARKER;
    attachment.migrated_at = new Date().toISOString();
    payload.attachment = attachment;
    database.prepare("UPDATE " + table + " SET payload = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(payload), new Date().toISOString(), row.id).run();
    report.migrated += 1;
  }
}

async function main() {
  if (!existsSync(dbPath)) throw new Error("Base SQLite introuvable: " + dbPath);
  if (!documentEncryptionConfigured(process.env)) throw new Error("DOCUMENT_ENCRYPTION_KEY absent ou invalide");
  const database = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  const report = { generated_at: new Date().toISOString(), marker: MIGRATION_MARKER, mode: apply ? "apply" : "dry-run", database: dbPath, tables: ["case_documents", "contract_documents"], candidates: 0, migrated: 0, already_encrypted: 0, skipped: 0 };
  try {
    for (const table of report.tables) await migrateTable(database, table, report);
  } finally {
    database.close();
  }
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log("Document encryption " + report.mode + ": " + report.candidates + " candidate(s), " + report.migrated + " migrated, " + report.already_encrypted + " already encrypted.");
}

main().catch((error) => { console.error(error.message || error); process.exit(1); });
