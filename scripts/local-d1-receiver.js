import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8789;
const DEFAULT_DIR = join("data", "immeubleassur-d1");
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

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanName(value, fallback = "unknown") {
  const name = String(value || fallback).trim().replace(/[^A-Za-z0-9_.-]/g, "-");
  return name || fallback;
}

function authorized(request) {
  const expected = env("LOCAL_DB_SYNC_TOKEN");
  if (!expected) return false;
  return (request.headers.authorization || "") === `Bearer ${expected}`;
}

async function readBody(request) {
  const maxBytes = (Number.parseInt(env("LOCAL_DB_SYNC_MAX_MB", "100"), 10) || 100) * 1024 * 1024;
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw new Error(`Payload trop volumineux: limite ${maxBytes} octets`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Payload invalide");
  if (payload.site !== "immeubleassur.com") throw new Error("Site inattendu");
  if (!payload.snapshot_id) throw new Error("snapshot_id manquant");
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) throw new Error("data manquant");
  if (!Array.isArray(payload.tables)) throw new Error("tables manquant");
}

function savePayload(root, compressed, payload) {
  const snapshot = cleanName(payload.snapshot_id);
  const dir = join(root, snapshot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "snapshot.json.gz"), compressed);
  writeFileSync(join(dir, "schema.sql"), String(payload.schema || ""), "utf8");

  const tables = [];
  for (const [table, rows] of Object.entries(payload.data || {})) {
    const tableName = cleanName(table);
    const safeRows = Array.isArray(rows) ? rows : [];
    const jsonl = safeRows.map((row) => JSON.stringify(row)).join("\n");
    const content = jsonl ? `${jsonl}\n` : "";
    writeFileSync(join(dir, `${tableName}.jsonl`), content, "utf8");
    tables.push({ table: tableName, rows: safeRows.length, sha256: sha256(content) });
  }

  const manifest = {
    site: payload.site,
    database: payload.database || "immeubleassur-db",
    snapshot_id: snapshot,
    received_at: new Date().toISOString(),
    generated_at: payload.generated_at || "",
    gzip_bytes: compressed.length,
    payload_sha256: sha256(compressed),
    tables,
    total_rows: tables.reduce((sum, table) => sum + table.rows, 0)
  };
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(join(root, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function handleSync(request, response) {
  if (!authorized(request)) return json(response, 401, { success: false, error: "Acces refuse" });
  try {
    const compressed = await readBody(request);
    const raw = request.headers["content-encoding"] === "gzip" ? gunzipSync(compressed) : compressed;
    const payload = JSON.parse(raw.toString("utf8"));
    validatePayload(payload);
    const manifest = savePayload(env("LOCAL_DB_SYNC_DIR", DEFAULT_DIR), compressed, payload);
    return json(response, 200, { success: true, ...manifest });
  } catch (error) {
    return json(response, 422, { success: false, error: error.message });
  }
}

const host = env("LOCAL_DB_SYNC_HOST", DEFAULT_HOST);
const port = Number.parseInt(env("LOCAL_DB_SYNC_PORT", String(DEFAULT_PORT)), 10) || DEFAULT_PORT;

if (!env("LOCAL_DB_SYNC_TOKEN")) {
  console.error("LOCAL_DB_SYNC_TOKEN doit etre defini avant de lancer le recepteur.");
  process.exit(1);
}

mkdirSync(env("LOCAL_DB_SYNC_DIR", DEFAULT_DIR), { recursive: true });

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, { success: true, service: "immeubleassur-d1-receiver", storage_dir: env("LOCAL_DB_SYNC_DIR", DEFAULT_DIR) });
  }
  if (request.method === "POST" && url.pathname === "/sync/d1") return handleSync(request, response);
  return json(response, 404, { success: false, error: "Route inconnue" });
}).listen(port, host, () => {
  console.log(`D1 receiver listening on http://${host}:${port}`);
});
