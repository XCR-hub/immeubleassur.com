import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const DEFAULT_DATABASE = "immeubleassur-db";
const DEFAULT_TARGET_URL = "http://192.168.1.70:8789/sync/d1";
const REPORT_PATH = join("reports", "d1-local-sync-report.json");
function loadEnvFile(file = ".env.local") {
  if (!existsSync(file)) return;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeName(value) {
  const name = String(value || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Nom SQL invalide: ${name}`);
  return name;
}

function quoteIdentifier(value) {
  return `"${safeName(value).replace(/"/g, "\"\"")}"`;
}

function snapshotId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeJson(file, body) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

function tablesFromSchema(schemaText) {
  const tables = [...schemaText.matchAll(/CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]);
  return [...new Set(tables)].filter((table) => table !== "sqlite_sequence");
}

function configuredTables(schemaText) {
  const override = env("D1_SYNC_TABLES");
  if (override) return override.split(",").map((item) => safeName(item.trim())).filter(Boolean);
  return tablesFromSchema(schemaText);
}

function rowsFromWranglerJson(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) {
    if (parsed.every((item) => item && Array.isArray(item.results))) {
      return parsed.flatMap((item) => item.results);
    }
    return parsed;
  }
  if (Array.isArray(parsed.results)) return parsed.results;
  if (parsed.result && Array.isArray(parsed.result)) {
    return parsed.result.flatMap((item) => Array.isArray(item.results) ? item.results : []);
  }
  return [];
}

function queryTable({ database, remote, table, rowLimit }) {
  const suffix = rowLimit > 0 ? ` LIMIT ${rowLimit}` : "";
  const command = `SELECT * FROM ${quoteIdentifier(table)}${suffix};`;
  const args = ["wrangler", "d1", "execute", database, remote ? "--remote" : "--local", "--json", "--command", command];
  const commandName = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(commandName, args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `code ${result.status}`;
    throw new Error(`Export D1 impossible pour ${table}: ${detail.slice(0, 1200)}`);
  }
  return rowsFromWranglerJson(result.stdout);
}

function rowCount(data) {
  return Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
}

async function pushSnapshot({ targetUrl, token, gzipPayload, manifest }) {
  if (!token) throw new Error("LOCAL_DB_SYNC_TOKEN manquant pour pousser vers le serveur local.");
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "X-ImmeubleAssur-Snapshot": manifest.snapshot_id
    },
    body: gzipPayload
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok || body.success === false) {
    throw new Error(`Push serveur local refuse (${response.status}): ${body.error || text.slice(0, 500)}`);
  }
  return { status: response.status, body };
}

async function run() {
  const dryRun = hasFlag("--dry-run") || hasFlag("--plan");
  const push = hasFlag("--push");
  const remote = !hasFlag("--local");
  const database = env("D1_DATABASE_NAME", DEFAULT_DATABASE);
  const targetUrl = env("LOCAL_DB_SYNC_URL", DEFAULT_TARGET_URL);
  const outputRoot = env("D1_SYNC_OUTPUT_DIR", join("backups", "d1"));
  const rowLimit = Number.parseInt(env("D1_SYNC_ROW_LIMIT", "0"), 10) || 0;
  const schemaText = readFileSync("schema.sql", "utf8");
  const tables = configuredTables(schemaText);
  const id = snapshotId();
  const report = {
    generated_at: new Date().toISOString(),
    status: dryRun ? "planned" : "running",
    source: remote ? "cloudflare-d1-remote" : "cloudflare-d1-local",
    database,
    target_url: targetUrl,
    snapshot_id: id,
    output_root: outputRoot,
    tables,
    row_limit: rowLimit || null,
    receiver_token_configured: Boolean(env("LOCAL_DB_SYNC_TOKEN")),
    pushed: false,
    warnings: []
  };

  mkdirSync("reports", { recursive: true });
  if (dryRun) {
    writeJson(REPORT_PATH, report);
    console.log(`D1 local sync plan: ${tables.length} table(s), target ${targetUrl}`);
    return;
  }

  const dir = join(outputRoot, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "schema.sql"), schemaText, "utf8");

  const data = {};
  const tableReports = [];
  for (const table of tables) {
    const rows = queryTable({ database, remote, table, rowLimit });
    data[table] = rows;
    const jsonl = rows.map((row) => JSON.stringify(row)).join("\n");
    const content = jsonl ? `${jsonl}\n` : "";
    const file = join(dir, `${table}.jsonl`);
    writeFileSync(file, content, "utf8");
    tableReports.push({ table, rows: rows.length, file, sha256: sha256(content) });
    console.log(`exported ${table}: ${rows.length} row(s)`);
  }

  const manifest = {
    site: "immeubleassur.com",
    database,
    source: report.source,
    snapshot_id: id,
    generated_at: report.generated_at,
    schema_sha256: sha256(schemaText),
    tables: tableReports,
    total_rows: rowCount(data)
  };
  const payload = { ...manifest, schema: schemaText, data };
  const rawPayload = JSON.stringify(payload);
  const gzipPayload = gzipSync(rawPayload);
  writeFileSync(join(dir, "snapshot.json.gz"), gzipPayload);
  writeJson(join(dir, "manifest.json"), { ...manifest, payload_sha256: sha256(rawPayload), gzip_bytes: gzipPayload.length });

  report.status = "exported";
  report.snapshot_dir = dir;
  report.tables = tableReports;
  report.total_rows = manifest.total_rows;
  report.gzip_bytes = gzipPayload.length;

  if (push) {
    const pushResult = await pushSnapshot({ targetUrl, token: env("LOCAL_DB_SYNC_TOKEN"), gzipPayload, manifest });
    report.pushed = true;
    report.receiver = pushResult.body;
    report.status = "synced";
  } else {
    report.warnings.push("Snapshot cree localement seulement; ajouter --push pour envoyer vers 192.168.1.70.");
  }

  writeJson(REPORT_PATH, report);
  console.log(`D1 local sync ${report.status}: ${manifest.total_rows} row(s), ${tableReports.length} table(s).`);
}

run().catch((error) => {
  const report = {
    generated_at: new Date().toISOString(),
    status: "failed",
    error: error.message,
    target_url: env("LOCAL_DB_SYNC_URL", DEFAULT_TARGET_URL),
    database: env("D1_DATABASE_NAME", DEFAULT_DATABASE)
  };
  writeJson(REPORT_PATH, report);
  console.error(error.message);
  process.exit(1);
});
