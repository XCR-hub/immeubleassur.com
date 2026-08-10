import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve("public");
const runtimeAssetsRoot = resolve(process.env.LOCAL_RUNTIME_ASSETS_ROOT || join("data", "runtime-assets"));
const port = Number.parseInt(process.env.PORT || "8787", 10);
const host = process.env.HOST || "127.0.0.1";
const types = {
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
  ".webmanifest": "application/manifest+json; charset=utf-8"
};
const SECURITY_HEADER_MARKER = "runtime-security-headers-v1";

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com",
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
  return String(process.env.SITE_ORIGIN || '').startsWith('https://');
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

function isInside(base, file) {
  const normalizedBase = base.endsWith(sep) ? base : `${base}${sep}`;
  return file === base || file.startsWith(normalizedBase);
}

function resolveRuntimePath(requestUrl) {
  const cleanUrl = decodeURIComponent((requestUrl || "/").split("?")[0]);
  if (!cleanUrl.startsWith("/assets/")) return "";
  const assetRelative = cleanUrl.slice("/assets/".length);
  if (!assetRelative || assetRelative.includes("/") || assetRelative.includes("\\")) return "";
  const direct = normalize(join(runtimeAssetsRoot, cleanUrl.replace(/^\/+/, "")));
  if (!isInside(runtimeAssetsRoot, direct)) return "";
  return existsSync(direct) ? direct : "";
}

function resolvePath(requestUrl) {
  const cleanUrl = decodeURIComponent((requestUrl || "/").split("?")[0]);
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

const server = createServer((request, response) => {
  applySecurityHeaders(response, request);
  const runtimeFile = resolveRuntimePath(request.url);
  const file = runtimeFile || resolvePath(request.url);
  if (!file) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error("Not a file");
    const extension = extname(file);
    response.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
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
});

server.listen(port, host, () => {
  console.log(`Static server listening on http://${host}:${port}`);
});