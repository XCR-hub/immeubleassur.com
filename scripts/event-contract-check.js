import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";
const app = readFileSync("public/assets/app.js", "utf8");
const api = readFileSync("functions/api/events.js", "utf8");

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

const trackedEvents = unique([...app.matchAll(/track\(\s*["']([a-z0-9_:-]+)["']/gi)].map((match) => match[1]));
const allowlistSource = (api.match(/const allowedEvents = new Set\(\[([\s\S]*?)\]\);/) || [])[1] || "";
const allowedEvents = unique([...allowlistSource.matchAll(/["']([a-z0-9_:-]+)["']/gi)].map((match) => match[1]));
const missing = trackedEvents.filter((event) => !allowedEvents.includes(event));
const unused = allowedEvents.filter((event) => trackedEvents.includes(event) === false && ["post", "options", "application/json"].includes(event) === false);

const report = {
  generated_at: new Date().toISOString(),
  tracked_events: trackedEvents,
  allowed_events: allowedEvents,
  missing,
  unused_front_optional: unused,
  status: missing.length ? "failed" : "passed"
};

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "event-contract-report.json"), JSON.stringify(report, null, 2), "utf8");

if (missing.length) {
  console.error(`Event contract failed. Missing API allowlist: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Event contract passed for ${trackedEvents.length} tracked event types.`);
