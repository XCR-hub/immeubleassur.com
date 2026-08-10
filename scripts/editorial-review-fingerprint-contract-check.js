import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const fixture = mkdtempSync(join(tmpdir(), "immeubleassur-editorial-review-fingerprint-"));
const drafts = join(fixture, "drafts");
const report = join(fixture, "report.json");
const state = join(fixture, "state.json");
mkdirSync(drafts, { recursive: true });
const draftPath = join(drafts, "news-fixture.json");

function draft(generatedAt, title) {
  return {
    marker: "editorial-ai-draft-review-v1", generated_at: generatedAt, publication_status: "quarantined",
    human_review_required: true, no_auto_publish: true, allowed_publication: false,
    issue: { title: "Obligations assurance immeuble" },
    legal_review: { sensitive: true, matched_terms: ["obligation"] },
    source_items: [{ source_id: "official", title, url: "https://example.test/official" }],
    synthesis: { provider: "fixture", model: "fixture", text: title }
  };
}
function run() {
  const result = spawnSync(process.execPath, [join(root, "scripts", "local-editorial-review-monitor.js")], {
    cwd: root, encoding: "utf8",
    env: { ...process.env, LOCAL_EDITORIAL_DRAFT_ROOT: drafts, LOCAL_EDITORIAL_REVIEW_REPORT: report, LOCAL_EDITORIAL_REVIEW_ALERT_STATE: state, LOCAL_EDITORIAL_REVIEW_ALERTS: "0" }
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `monitor exit ${result.status}`);
  return JSON.parse(readFileSync(report, "utf8"));
}
try {
  writeFileSync(draftPath, JSON.stringify(draft("2026-08-10T08:00:00.000Z", "Texte officiel A")), "utf8");
  const first = run();
  writeFileSync(draftPath, JSON.stringify(draft("2026-08-10T09:00:00.000Z", "Texte officiel A")), "utf8");
  const timestampOnly = run();
  writeFileSync(draftPath, JSON.stringify(draft("2026-08-10T09:00:00.000Z", "Texte officiel B")), "utf8");
  const changed = run();
  writeFileSync(join(drafts, "news-old.json"), JSON.stringify(draft("2026-07-20T08:00:00.000Z", "Texte officiel ancien")), "utf8");
  const sla = run();
  const checks = [
    ["same-content-stable-across-timestamp", first.signature === timestampOnly.signature],
    ["material-content-change-detected", changed.signature !== first.signature],
    ["legal-draft-remains-quarantined", changed.newest_pending?.legal_sensitive === true && changed.newest_pending?.publication_status === "quarantined"],
    ["fingerprint-exported-without-content", /^[a-f0-9]{20}$/.test(changed.newest_pending?.review_fingerprint || "") && !JSON.stringify(changed).includes("Texte officiel B")],
    ["alerts-disabled-in-fixture", changed.alert?.status === "skipped" && changed.alert?.attempted === false],
    ["old-draft-escalates-status", sla.status === "review-overdue" && sla.critical_count === 1],
    ["old-critical-draft-prioritized", sla.priority_pending?.file === "news-old.json" && sla.priority_pending?.review_severity === "critical"],
    ["queue-exports-age-without-content", sla.review_queue?.every((item) => Number.isFinite(item.age_days)) && !JSON.stringify(sla).includes("Texte officiel ancien")],
    ["critical-alert-policy-is-faster-than-warning", Number(sla.alert_policy?.critical_cooldown_minutes) === 360 && Number(sla.alert_policy?.warning_cooldown_minutes) === 1440]
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  console.log(`Editorial review fingerprint contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
  if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}