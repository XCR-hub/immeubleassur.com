import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const runtimeHealthApi = readFileSync(join(root, "functions", "api", "admin", "runtime-health.js"), "utf8");
const admin = readFileSync(join(root, "public", "assets", "admin.js"), "utf8");
const adminHtml = readFileSync(join(root, "public", "admin.html"), "utf8");
const reviewMonitor = readFileSync(join(root, "scripts", "local-editorial-review-monitor.js"), "utf8");
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
  const invalidRecipientRun = spawnSync(process.execPath, [join(root, "scripts", "local-editorial-review-monitor.js")], {
    cwd: root, encoding: "utf8",
    env: { ...process.env, LOCAL_EDITORIAL_DRAFT_ROOT: drafts, LOCAL_EDITORIAL_REVIEW_REPORT: report, LOCAL_EDITORIAL_REVIEW_ALERT_STATE: state, LOCAL_EDITORIAL_REVIEW_ALERTS: "1", LOCAL_EDITORIAL_REVIEW_ALERT_TO: "wrong-recipient@example.invalid" }
  });
  const invalidRecipientReport = JSON.parse(readFileSync(report, "utf8"));
  const oldDraft = draft("2026-07-20T08:00:00.000Z", "Texte officiel ancien");
  oldDraft.source_items[0].url = "https://example.test/distinct-old-official";
  writeFileSync(join(drafts, "news-old.json"), JSON.stringify(oldDraft), "utf8");
  writeFileSync(join(drafts, "news-overlap.json"), JSON.stringify(draft("2026-08-09T08:00:00.000Z", "Texte officiel remplace")), "utf8");
  const sla = run();
  const checks = [
    ["same-content-stable-across-timestamp", first.signature === timestampOnly.signature],
    ["material-content-change-detected", changed.signature !== first.signature],
    ["legal-draft-remains-quarantined", changed.newest_pending?.legal_sensitive === true && changed.newest_pending?.publication_status === "quarantined"],
    ["fingerprint-exported-without-content", /^[a-f0-9]{20}$/.test(changed.newest_pending?.review_fingerprint || "") && !JSON.stringify(changed).includes("Texte officiel B")],
    ["official-source-url-exported-without-source-text", changed.newest_pending?.source_urls?.includes("https://example.test/official") && !JSON.stringify(changed).includes("Texte officiel B")],
    ["alerts-disabled-in-fixture", changed.alert?.status === "skipped" && changed.alert?.attempted === false],
    ["non-team-alert-recipient-rejected", invalidRecipientRun.status !== 0 && invalidRecipientReport.alert?.status === "failed" && invalidRecipientReport.alert?.error?.includes("Destinataire operationnel") && invalidRecipientReport.alert?.error?.includes("[email-redacted]")],
    ["old-draft-escalates-status", sla.status === "review-overdue" && sla.critical_count === 1],
    ["old-critical-draft-prioritized", sla.priority_pending?.file === "news-old.json" && sla.priority_pending?.review_severity === "critical"],
    ["overlapping-older-draft-superseded", sla.pending_count === 2 && sla.total_quarantined_count === 3 && sla.superseded_count === 1 && sla.superseded?.[0]?.file === "news-overlap.json" && sla.superseded?.[0]?.superseded_by === "news-fixture.json"],
    ["supersession-remains-quarantined-and-nondestructive", sla.superseded?.[0]?.retained_quarantined === true && sla.safeguards?.includes("non-destructive-supersession") && sla.retention?.automatic_deletion === false],
    ["queue-exports-age-without-content", sla.review_queue?.every((item) => Number.isFinite(item.age_days)) && !JSON.stringify(sla).includes("Texte officiel ancien")],
    ["report-does-not-export-local-draft-paths", !JSON.stringify(sla).includes(drafts) && sla.review_queue?.every((item) => !("path" in item))],
    ["operational-diagnostics-privacy-declared", sla.safeguards?.includes("no-local-paths-in-report-or-alert") && sla.safeguards?.includes("smtp-diagnostics-redacted")],
    ["review-alert-declares-actionable-links", sla.safeguards?.includes("actionable-source-links") && sla.safeguards?.includes("admin-review-link")],
    ["admin-api-sanitizes-editorial-review-metadata", runtimeHealthApi.includes("sanitizeEditorialReviewReport") && runtimeHealthApi.includes("LOCAL_EDITORIAL_REVIEW_REPORT") && runtimeHealthApi.includes("source_urls: (item.source_urls || []).map(safeUrl)") && runtimeHealthApi.includes("LOCAL_RUNTIME_REPORTS_ROOT") && runtimeHealthApi.includes("LOCAL_MONITOR_ROOT") && runtimeHealthApi.includes("reportAt(runtimeReportsRoot")],
    ["admin-exposes-supersession-aggregates-only", runtimeHealthApi.includes("total_quarantined_count: Number(report.total_quarantined_count") && runtimeHealthApi.includes("superseded_count: Number(report.superseded_count") && admin.includes("e.superseded_count||0") && !admin.includes("e.superseded?.")],
    ["admin-renders-quarantined-review-with-safe-links", admin.includes("Revue IA quarantinee") && admin.includes("editorial_review.review_queue") && admin.includes("noopener noreferrer")],
    ["admin-review-alert-anchor-resolves", reviewMonitor.includes("https://immeubleassur.com/admin#editorial-review") && reviewMonitor.includes("admin-review-anchor-resolves") && adminHtml.includes('id="editorial-review"')],
    ["admin-review-link-autoloads-with-existing-session", admin.includes("admin-editorial-review-autoload-v1") && admin.includes('location.hash==="#editorial-review"') && admin.includes("sessionStorage.getItem") && admin.includes("loadContent().catch")],
    ["critical-alert-policy-is-faster-than-warning", Number(sla.alert_policy?.critical_cooldown_minutes) === 360 && Number(sla.alert_policy?.warning_cooldown_minutes) === 1440]
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  console.log(`Editorial review fingerprint contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
  if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}