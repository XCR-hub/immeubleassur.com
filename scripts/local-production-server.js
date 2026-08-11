import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { sendNodeSmtpMail } from "./local-smtp.js";
import { createLocalDocumentScanner } from "./local-document-scanner.js";

loadDefaultEnvFiles();

const root = resolve(env("LOCAL_SITE_ROOT", "public"));
const runtimeAssetsRoot = resolve(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets")));
const runtimePublicationsRoot = resolve(env("LOCAL_RUNTIME_PUBLICATIONS_ROOT", join(runtimeAssetsRoot, "publications")));
const host = env("LOCAL_SITE_HOST", env("HOST", "0.0.0.0"));
const port = Number.parseInt(env("LOCAL_SITE_PORT", env("PORT", "8790")), 10) || 8790;
const dbPath = env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"));
const db = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
const documentScanner = createLocalDocumentScanner({ binary: env("CLAMSCAN_BIN", "C:\\Program Files\\ClamAV\\clamscan.exe"), fallbackBinary: env("DEFENDER_SCAN_BIN", "C:\\Program Files\\Windows Defender\\MpCmdRun.exe"), timeoutMs: Number.parseInt(env("CLAMSCAN_TIMEOUT_MS", "30000"), 10) || 30000 });
const moduleCache = new Map();

function checkoutRevision() {
  try {
    const gitRoot = resolve(".git");
    const head = readFileSync(join(gitRoot, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 40);
    return readFileSync(join(gitRoot, head.slice(5)), "utf8").trim().slice(0, 40);
  } catch { return ""; }
}
const sourceRevision = checkoutRevision();

globalThis.__IMMEUBLEASSUR_SEND_SMTP_MAIL = sendNodeSmtpMail;

const apiRoutes = new Map([
  ["/api/events", "functions/api/events.js"],
  ["/api/leads", "functions/api/leads.js"],
  ["/api/newsletter", "functions/api/newsletter.js"],
  ["/api/client/case", "functions/api/client/case.js"],
  ["/api/partner/consultation", "functions/api/partner/consultation.js"],
  ["/api/admin/auth", "functions/api/admin/auth.js"],
  ["/api/admin/attribution", "functions/api/admin/attribution.js"],
  ["/api/admin/cases", "functions/api/admin/cases.js"],
  ["/api/admin/content", "functions/api/admin/content.js"],
  ["/api/admin/integrations", "functions/api/admin/integrations.js"],
  ["/api/admin/leads", "functions/api/admin/leads.js"],
  ["/api/admin/newsletter", "functions/api/admin/newsletter.js"],
  ["/api/admin/sales", "functions/api/admin/sales.js"],
  ["/api/admin/seo", "functions/api/admin/seo.js"],
  ["/api/admin/runtime-health", "functions/api/admin/runtime-health.js"],
  ["/api/admin/spam", "functions/api/admin/spam.js"]
]);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json; charset=utf-8"
  };
const SECURITY_HEADER_MARKER = "runtime-security-headers-v1";
const REQUEST_BODY_LIMIT_MARKER = "request-body-limit-v1";
const MAX_REQUEST_BODY_BYTES = Number.parseInt(env("LOCAL_MAX_REQUEST_BODY_BYTES", String(12 * 1024 * 1024)), 10) || 12 * 1024 * 1024;

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' https://challenges.cloudflare.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com https://region1.google-analytics.com https://www.google-analytics.com",
    "frame-src https://challenges.cloudflare.com",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests"
  ].join('; ');
}

function isHttpsRequest(request) {
  const forwarded = String(request?.headers?.['x-forwarded-proto'] || '').toLowerCase();
  if (forwarded.split(',').map((item) => item.trim()).includes('https')) return true;
  return env('SITE_ORIGIN', '').startsWith('https://');
}

function applySecurityHeaders(response, request) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', contentSecurityPolicy());
  if (isHttpsRequest(request)) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function safeServerDiagnostic(value, max = 240) {
  return String(value || "server failure")
    .replace(/[\r\n\0]+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email-redacted]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip-redacted]")
    .replace(/\b(bearer|token|password|secret|api[-_ ]?key)\s*[:=]?\s*\S+/gi, "$1 [redacted]")
    .trim()
    .slice(0, max);
}

function json(response, status, body, options = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  if (options.head) {
    response.end();
    return;
  }
  response.end(JSON.stringify(body));
}

function apiPathOf(url) {
  const pathname = new URL(url || "/", "http://local").pathname.replace(/\/+$/, "") || "/";
  return apiRoutes.has(pathname) ? pathname : "";
}

async function importRoute(pathname) {
  const file = apiRoutes.get(pathname);
  if (!file) return null;
  if (!moduleCache.has(file)) {
    moduleCache.set(file, import(pathToFileURL(resolve(file)).href));
  }
  return moduleCache.get(file);
}

function envForRequest() {
  return {
    ...process.env,
    DB: db,
    SEND_SMTP_MAIL: sendNodeSmtpMail,
    SCAN_DOCUMENT: documentScanner,
    DOCUMENT_SCANNER_STATUS: documentScanner.status
  };
}

function payloadTooLarge() {
  const error = new Error("Corps de requete trop volumineux");
  error.code = "PAYLOAD_TOO_LARGE";
  return error;
}

async function readBody(request) {
  const declared = Number.parseInt(String(request.headers["content-length"] || ""), 10);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) throw payloadTooLarge();
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_REQUEST_BODY_BYTES) throw payloadTooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function requestUrl(request) {
  const configuredOrigin = env("SITE_ORIGIN", "");
  const protocol = request.headers["x-forwarded-proto"] || (configuredOrigin.startsWith("https://") ? "https" : "http");
  const hostHeader = request.headers["x-forwarded-host"] || request.headers.host || `127.0.0.1:${port}`;
  const origin = configuredOrigin || `${protocol}://${hostHeader}`;
  return new URL(request.url || "/", origin).toString();
}

async function toWebRequest(request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (value !== undefined) headers.set(key, value);
  }
  if (!headers.has("x-forwarded-for") && request.socket?.remoteAddress) {
    headers.set("x-forwarded-for", request.socket.remoteAddress);
  }
  const init = { method: request.method, headers };
  if (!["GET", "HEAD"].includes(request.method || "GET")) init.body = await readBody(request);
  return new Request(requestUrl(request), init);
}

async function sendWebResponse(nodeResponse, webResponse) {
  const headers = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });
  nodeResponse.writeHead(webResponse.status, headers);
  if (webResponse.body && nodeResponse.req?.method !== "HEAD") {
    const body = Buffer.from(await webResponse.arrayBuffer());
    nodeResponse.end(body);
  } else {
    nodeResponse.end();
  }
}

async function handleApi(request, response, pathname) {
  const route = await importRoute(pathname);
  if (!route) return json(response, 404, { success: false, error: "Route API inconnue" });
  const method = (request.method || "GET").toLowerCase();
  const handler = route[`onRequest${method[0].toUpperCase()}${method.slice(1)}`];
  if (typeof handler !== "function") return json(response, 405, { success: false, error: "Methode non supportee" });

  const waitTasks = [];
  let webRequest;
  try {
    webRequest = await toWebRequest(request);
  } catch (error) {
    if (error?.code === "PAYLOAD_TOO_LARGE") return json(response, 413, { success: false, error: "Corps de requete trop volumineux", marker: REQUEST_BODY_LIMIT_MARKER, max_bytes: MAX_REQUEST_BODY_BYTES });
    throw error;
  }
  const webResponse = await handler({
    request: webRequest,
    env: envForRequest(),
    waitUntil: (task) => waitTasks.push(Promise.resolve(task))
  });
  await sendWebResponse(response, webResponse);
  if (waitTasks.length) Promise.allSettled(waitTasks).catch(() => {});
  return null;
}

function isInside(base, file) {
  const normalizedBase = base.endsWith(sep) ? base : `${base}${sep}`;
  return file === base || file.startsWith(normalizedBase);
}

function resolveRuntimeStaticPath(requestUrlValue) {
  const cleanUrl = decodeURIComponent((requestUrlValue || "/").split("?")[0]);
  if (!cleanUrl.startsWith("/assets/")) return "";
  const assetRelative = cleanUrl.slice("/assets/".length);
  if (!assetRelative || assetRelative.includes("/") || assetRelative.includes("\\")) return "";
  const direct = normalize(join(runtimeAssetsRoot, cleanUrl.replace(/^\/+/, "")));
  if (!isInside(runtimeAssetsRoot, direct)) return "";
  return existsSync(direct) ? direct : "";
}

function resolveRuntimePublicationPath(requestUrlValue) {
  const cleanUrl = decodeURIComponent((requestUrlValue || "/").split("?")[0]);
  const requestPath = cleanUrl === "/" ? "index.html" : cleanUrl.replace(/^\/+/, "");
  const relative = extname(requestPath) ? requestPath : `${requestPath}.html`;
  const manifestPath = join(runtimePublicationsRoot, "current.json");
  if (!existsSync(manifestPath)) return "";
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!Array.isArray(manifest.allowed_files) || !manifest.allowed_files.includes(relative)) return "";
    const versionRoot = normalize(join(runtimePublicationsRoot, "versions", String(manifest.version || "")));
    const file = normalize(join(versionRoot, relative));
    if (!isInside(versionRoot, file) || !existsSync(file) || !statSync(file).isFile()) return "";
    return file;
  } catch {
    return "";
  }
}
function resolveStaticPath(requestUrlValue) {
  const cleanUrl = decodeURIComponent((requestUrlValue || "/").split("?")[0]);
  const pathname = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const direct = normalize(join(root, pathname));
  if (!isInside(root, direct)) return "";
  if (existsSync(direct)) {
    if (statSync(direct).isDirectory()) {
      const index = join(direct, "index.html");
      if (existsSync(index)) return index;
    } else return direct;
  }
  if (!extname(direct)) {
    const html = `${direct}.html`;
    if (isInside(root, html) && existsSync(html)) return html;
  }
  return direct;
}

function handleStatic(request, response) {
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  const runtimeFile = resolveRuntimeStaticPath(request.url) || resolveRuntimePublicationPath(request.url);
  const file = runtimeFile || resolveStaticPath(request.url);
  if (!file) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error("Not a file");
    const extension = extname(file);
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": runtimeFile || file.endsWith(join("public", "admin.html")) || /-latest\.json$/i.test(file) ? "no-store" : (file.includes(`${join("public", "assets")}`) ? "public, max-age=31536000, immutable" : "public, max-age=300"),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": file.endsWith(join("public", "admin.html")) ? "no-referrer" : "strict-origin-when-cross-origin"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function healthSnapshot() {
  try {
    const database = db.health();
    const databaseReady = Number(database.size_bytes || 0) > 0 && Array.isArray(database.tables) && database.tables.length >= 10;
    const scanner = typeof documentScanner.status === "function" ? documentScanner.status() : { available: false, configured: false };
    return {
      ready: databaseReady,
      database: { ready: databaseReady, table_count: database.tables?.length || 0 },
      document_scanner: { available: scanner.available === true, configured: scanner.configured === true, engine_count: Number(scanner.engine_count || 0) }
    };
  } catch {
    return { ready: false, database: { ready: false, table_count: 0 }, document_scanner: { available: false, configured: false, engine_count: 0 } };
  }
}
const server = createServer((request, response) => {
  applySecurityHeaders(response, request);
  const requestTarget = new URL(request.url || "/", "http://local");
  if (["GET", "HEAD"].includes(request.method || "GET") && requestTarget.pathname.length > 1 && requestTarget.pathname.endsWith("/")) {
    const location = `${requestTarget.pathname.replace(/\/+$/, "")}${requestTarget.search}`;
    response.writeHead(308, { Location: location, "Cache-Control": "public, max-age=86400" });
    response.end();
    return;
  }
  const pathname = apiPathOf(request.url);
  if (["GET", "HEAD"].includes(request.method || "GET") && new URL(request.url || "/", "http://local").pathname === "/health") {
    const health = healthSnapshot();
    return json(
      response,
      health.ready ? 200 : 503,
      {
        success: health.ready,
        service: "immeubleassur-local-site",
        status: health.ready ? "ok" : "degraded",
        mode: "sqlite",
        source_revision: sourceRevision,
        checks: health,
        generated_at: new Date().toISOString()
      },
      { head: request.method === "HEAD" }
    );
  }
  if (pathname) {
    handleApi(request, response, pathname).catch((error) => {
      console.error("api-handler-failed", safeServerDiagnostic(error.message));
      json(response, 500, { success: false, error: "Erreur interne du service.", code: "api-handler-failed" });
    });
    return;
  }
  handleStatic(request, response);
});

server.listen(port, host, () => {
  mkdirSync(root, { recursive: true });
  console.log(`ImmeubleAssur local site listening on http://${host}:${port}`);
  console.log(`SQLite database: ${db.health().path}`);
});

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  db.close();
  process.exit(0);
});
