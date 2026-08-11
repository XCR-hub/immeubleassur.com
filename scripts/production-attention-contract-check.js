import { buildProductionAttention } from "./production-attention.js";

const rows = buildProductionAttention([
  { name: "homepage_https", ok: true, status: 200 },
  { name: "google_search_console", ok: false, severity: "warn", status: "missing-secret" },
  { name: "serp_measurement", ok: false, severity: "warn", status: "serpapi-rate-limited-fallback" },
  { name: "editorial_review_sla", ok: false, severity: "warn", status: "review-aging" },
  { name: "imap_inbox_review", ok: false, severity: "warn", reason: "imap-review-backlog-alerted" },
  { name: "github_workflow_health", ok: false, severity: "warn", reason: "scheduled-run-awaiting-proof", proof_due_at: "2026-08-12T05:17:00.000Z" },
  { name: "unknown_failure", ok: false, severity: "fail", error: "broken" }
], "2026-08-11T21:00:00.000Z");

const byName = Object.fromEntries(rows.map((row) => [row.check, row]));
const assertions = [
  ["only-non-ok", rows.length === 6 && !byName.homepage_https],
  ["critical-first", rows[0]?.check === "unknown_failure" && rows[0]?.priority === "critical"],
  ["gsc-human-config", byName.google_search_console?.owner === "configuration" && byName.google_search_console?.intervention === "human-required"],
  ["serp-automatic-retry", byName.serp_measurement?.intervention === "automatic-retry" && byName.serp_measurement?.due_at === "2026-08-11T22:00:00.000Z"],
  ["legal-review-human", byName.editorial_review_sla?.owner === "editorial-legal-review" && byName.editorial_review_sla?.action.includes("aucune interpretation juridique IA")],
  ["imap-no-content", byName.imap_inbox_review?.contains_personal_data === false && byName.imap_inbox_review?.action.includes("sans lire ni exporter")],
  ["github-proof-deadline", byName.github_workflow_health?.due_at === "2026-08-12T05:17:00.000Z"],
  ["no-secrets", rows.every((row) => row.secret_values_exported === false)]
];
const failed = assertions.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`Production attention contract failed: ${failed.map(([name]) => name).join(", ")}`);
  process.exit(1);
}
console.log(`Production attention contract: passed (${assertions.length}/${assertions.length}).`);
