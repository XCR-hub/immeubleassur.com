import { readFileSync } from "node:fs";

const paths = [".github/workflows/seo-autopilot.yml", ".github/workflows/editorial-autopilot.yml"];
const workflows = paths.map((path) => ({ path, text: readFileSync(path, "utf8") }));
const pinnedUse = /^\s*uses:\s+[^\s@]+@[a-f0-9]{40}(?:\s+#.*)?$/gm;
const checks = [];
for (const { path, text } of workflows) {
  const uses = text.match(/^\s*uses:\s+.*$/gm) || [];
  checks.push(
    [`${path}:all-actions-pinned`, uses.length >= 3 && uses.every((line) => /^\s*uses:\s+[^\s@]+@[a-f0-9]{40}(?:\s+#.*)?$/.test(line))],
    [`${path}:node24-action-majors`, ["actions/checkout", "actions/setup-node", "actions/upload-artifact"].every((action) => text.includes(action + "@") && text.includes("# v6"))],
    [`${path}:deterministic-install`, text.includes("run: npm ci --ignore-scripts") && !text.includes("run: npm install")],
    [`${path}:checkout-credentials-not-persisted`, /actions\/checkout@[a-f0-9]{40}[\s\S]*?persist-credentials:\s*false/.test(text)],
    [`${path}:setup-node-cache-explicitly-disabled`, /actions\/setup-node@[a-f0-9]{40}[\s\S]*?package-manager-cache:\s*false/.test(text)],
    [`${path}:least-privilege`, /permissions:\s*\n\s+contents:\s*read/.test(text) && !/pull_request_target:/.test(text)],
    [`${path}:scheduled-and-manual`, /schedule:\s*\n\s+- cron:/.test(text) && /workflow_dispatch:/.test(text)]
  );
}
const editorial = workflows.find(({ path }) => path.includes("editorial"))?.text || "";
checks.push(["editorial-legal-gates-preserved", ["editorial:legal:safety", "editorial:publication:gate", "editorial:text:quality"].every((marker) => editorial.includes(marker))]);
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`GitHub workflow supply-chain contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }

