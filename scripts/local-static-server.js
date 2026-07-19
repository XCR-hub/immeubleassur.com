import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("public");
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
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function resolvePath(requestUrl) {
  const cleanUrl = decodeURIComponent((requestUrl || "/").split("?")[0]);
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

const server = createServer((request, response) => {
  const file = resolvePath(request.url);
  if (!file) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Content-Length": stat.size
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