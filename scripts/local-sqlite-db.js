import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function quoteIdentifier(value) {
  const name = String(value || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Nom SQL invalide: ${name}`);
  return `"${name.replace(/"/g, "\"\"")}"`;
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? Number(value) : value]));
}

class LocalSqliteStatement {
  constructor(database, sql, binds = []) {
    this.database = database;
    this.sql = sql;
    this.binds = binds;
  }

  bind(...binds) {
    return new LocalSqliteStatement(this.database, this.sql, binds);
  }

  first(columnName) {
    const statement = this.database.prepare(this.sql);
    const row = normalizeRow(statement.get(...this.binds));
    if (columnName) return row ? row[columnName] : null;
    return row;
  }

  all() {
    const statement = this.database.prepare(this.sql);
    const results = statement.all(...this.binds).map(normalizeRow).filter(Boolean);
    return { success: true, results, meta: { rows_read: results.length } };
  }

  run() {
    const statement = this.database.prepare(this.sql);
    const result = statement.run(...this.binds);
    return {
      success: true,
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: typeof result.lastInsertRowid === "bigint" ? Number(result.lastInsertRowid) : result.lastInsertRowid || 0
      }
    };
  }
}

export function openLocalSqlite({ dbPath, schemaPath = "schema.sql" }) {
  const resolvedDbPath = resolve(dbPath);
  mkdirSync(dirname(resolvedDbPath), { recursive: true });
  const database = new DatabaseSync(resolvedDbPath);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
  if (schemaPath && existsSync(schemaPath)) {
    database.exec(readFileSync(schemaPath, "utf8"));
  }
  const brokerageColumns = database.prepare("PRAGMA table_info(brokerage_cases)").all().map((row) => row.name);
  if (!brokerageColumns.includes("client_portal_token_revoked_at")) database.exec("ALTER TABLE brokerage_cases ADD COLUMN client_portal_token_revoked_at TEXT NOT NULL DEFAULT ''");

  return {
    path: resolvedDbPath,
    prepare(sql) {
      return new LocalSqliteStatement(database, sql);
    },
    exec(sql) {
      database.exec(sql);
      return { success: true };
    },
    health() {
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
      const size = existsSync(resolvedDbPath) ? statSync(resolvedDbPath).size : 0;
      return { path: resolvedDbPath, size_bytes: size, tables: tables.map((row) => row.name) };
    },
    close() {
      database.close();
    }
  };
}

export function quoteSqlIdentifier(value) {
  return quoteIdentifier(value);
}
