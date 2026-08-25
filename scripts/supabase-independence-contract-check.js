import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const forbidden = /supabase|SUPABASE_|\.supabase\.co|postgrest|gotrue|@supabase\//i;
const files = [".env.example", "package-lock.json"];
const directories = [".github", "config", "dns", "functions", "public", "scripts"];
const ignored = new Set([
  "scripts/local-autarky-check.js",
  "scripts/supabase-independence-contract-check.js"
]);
const extensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".mjs", ".ps1", ".ts", ".tsx", ".yml", ".yaml"]);

function collect(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (extensions.has(extname(entry.name).toLowerCase())) files.push(relative(root, path).replaceAll("\\", "/"));
  }
}

for (const directory of directories) collect(join(root, directory));
const violations = [];
for (const file of [...new Set(files)].sort()) {
  if (ignored.has(file)) continue;
  const source = readFileSync(join(root, file), "utf8");
  const match = source.match(forbidden);
  if (match) violations.push({ file, marker: match[0] });
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dependencyNames = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.optionalDependencies });
const dependencyViolations = dependencyNames.filter((name) => forbidden.test(name));
const checks = [
  ["no-runtime-or-build-markers", violations.length === 0],
  ["no-supabase-package", dependencyViolations.length === 0],
  ["sqlite-runtime-declared", readFileSync(join(root, "scripts", "local-production-server.js"), "utf8").includes("LOCAL_SQLITE_DB")],
  ["sqlite-schema-present", existsSync(join(root, "schema.sql"))]
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Supabase independence contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
if (violations.length) console.error(`Forbidden markers: ${violations.map((item) => `${item.file}:${item.marker}`).join(", ")}`);
if (dependencyViolations.length) console.error(`Forbidden dependencies: ${dependencyViolations.join(", ")}`);
if (failed.length) process.exitCode = 1;
