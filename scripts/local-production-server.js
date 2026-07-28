import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openLocalD1 } from "./local-d1-sqlite.js";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { sendNodeSmtpMail } from "./local-smtp.js";

loadDefaultEnvFiles();

const root = resolve(env("LOCAL_SITE_ROOT", "public"));
const host = env("LOCAL_SITE_HOST", env("HOST", "0.0.0.0"));
const port = Number.parseInt(env("LOCAL_SITE_PORT", env("PORT", "8790")), 10) || 8790;
const dbPath = env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"));
const db = openLocalD1({ dbPath, schemaPath: "schema.sql" });
const moduleCache = new Map();

globalThis.__IMMEUBLEASSUR_SEND_SMTP_MAIL = sendNodeSmtpMail;

const apiRoutes = new Map([
  ["/api/events", "functions/api/events.js"],
  ["/api/leads", "functions/api/leads.js"],
  ["/api/newsletter", "functions/api/newsletter.js"],
  ["/api/admin/attribution", "functions/api/admin/attribution.js"],
  ["/api/admin/content", "functions/api/admin/content.js"],
  ["/api/admin/integrations", "functions/api/admin/integrations.js"],
  ["/api/admin/leads", "functions/api/admin/leads.js"],
  ["/api/admin/newsletter", "functions/api/admin/newsletter.js"],
  ["/api/admin/sales", "functions/api/admin/sales.js"],
  ["/api/admin/seo", "functions/api/admin/seo.js"],
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

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
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
    SEND_SMTP_MAIL: sendNodeSmtpMail
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
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
  const webRequest = await toWebRequest(request);
  const webResponse = await handler({
    request: webRequest,
    env: envForRequest(),
    waitUntil: (task) => waitTasks.push(Promise.resolve(task))
  });
  await sendWebResponse(response, webResponse);
  if (waitTasks.length) Promise.allSettled(waitTasks).catch(() => {});
  return null;
}

function resolveStaticPath(requestUrlValue) {
  const cleanUrl = decodeURIComponent((requestUrlValue || "/").split("?")[0]);
  const pathname = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const direct = normalize(join(root, pathname));
  if (!direct.startsWith(root)) return "";
  if (existsSync(direct)) return direct;
  if (!extname(direct)) {
    const html = `${direct}.html`;
    if (html.startsWith(root) && existsSync(html)) return html;
  }
  return direct;
}

function handleStatic(request, response) {
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  const file = resolveStaticPath(request.url);
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
      "Cache-Control": file.includes(`${join("public", "assets")}`) ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
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

const server = createServer((request, response) => {
  const pathname = apiPathOf(request.url);
  if (request.method === "GET" && new URL(request.url || "/", "http://local").pathname === "/health") {
    return json(response, 200, { success: true, service: "immeubleassur-local-site", mode: "sqlite", database: db.health() });
  }
  if (pathname) {
    handleApi(request, response, pathname).catch((error) => {
      json(response, 500, { success: false, error: error.message || "Erreur serveur local" });
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
