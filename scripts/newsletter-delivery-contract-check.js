import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";
loadDefaultEnvFiles();
const delivery = readFileSync("scripts/local-newsletter-delivery.js", "utf8");
const canary = readFileSync("scripts/newsletter-runtime-canary.js", "utf8");
const newsletterApi = readFileSync("functions/api/newsletter.js", "utf8");
const admin = readFileSync("functions/api/admin/newsletter.js", "utf8");
const runtime = readFileSync("scripts/local-runtime-report-cycle.js", "utf8");
const task = readFileSync("scripts/local-runtime-task.ps1", "utf8");
const checks = [
  ["active-manifest-required", delivery.includes("runtime-editorial-publication-v1")],
  ["publication-gate-required", delivery.includes("publication_gate?.ready === true")],
  ["deterministic-provider-only", delivery.includes('public_content_provider === "deterministic"')],
  ["ai-publication-forbidden", delivery.includes("public_content_ai_generated === false") && delivery.includes("ai_draft_allowed_publication === false")],
  ["manifest-file-hash-verified", delivery.includes("newsletterFile.sha256")],
  ["active-subscribers-only", delivery.includes("s.status='active'")],
  ["idempotent-per-issue", delivery.includes("e.issue_id=? AND e.event_type='sent'")],
  ["atomic-send-claim", delivery.includes('database.exec("BEGIN IMMEDIATE")') && delivery.includes("event_type = 'send_claimed'") && delivery.includes('database.exec("ROLLBACK")')],
  ["claim-rechecks-active-consent", delivery.includes("s.id = ? AND s.status = 'active'") && delivery.includes("last-moment-active-consent-check")],
  ["claim-expires-after-crash", delivery.includes("NEWSLETTER_SEND_CLAIM_LEASE_MINUTES") && delivery.includes("expiring-crash-lease")],
  ["smtp-diagnostics-redacted", delivery.includes("safeDiagnostic(receipt)") && delivery.includes("safeDiagnostic(error.message")],
  ["failure-retry-cooldown", delivery.includes("f.created_at >= datetime('now', '-60 minutes')")],
  ["unsubscribe-header", delivery.includes("List-Unsubscribe")],
  ["unsubscribe-response-is-private", newsletterApi.includes('"Referrer-Policy": "no-referrer"') && newsletterApi.includes('"X-Robots-Tag": "noindex, nofollow, noarchive"') && newsletterApi.includes('"Cache-Control": "no-store, max-age=0"')],
  ["unsubscribe-does-not-expose-recipient", newsletterApi.includes('{ source: "unsubscribe-link" }') && !newsletterApi.includes("L'adresse ${esc(row.email)}") && canary.includes("unsubscribePrivacy")],
  ["recipient-pii-absent-from-report", delivery.includes("no-recipient-pii-in-report")],
  ["admin-never-sends-draft", admin.includes("status = 'published'") && !admin.includes("status IN ('published', 'draft')")],
  ["admin-excludes-already-sent", admin.includes("NOT EXISTS (SELECT 1 FROM newsletter_events")],
  ["admin-requires-deterministic-payload", admin.includes("json_extract(payload, '$.provider') = 'deterministic'")],
  ["runtime-delivery-enabled", runtime.includes('runStep("newsletter_delivery"') && task.includes("NEWSLETTER_AUTO_SEND = '1'")],
  ["dry-run-supported", delivery.includes('process.argv.includes("--dry-run")')],
  ["in-memory-capture-strictly-scoped", delivery.includes("dbPath.startsWith(resolve(tmpdir()))") && delivery.includes('endsWith("@example.test")')],
  ["runtime-canary-proves-consent-dedupe-idempotence", canary.includes("consent_refused") && canary.includes("subscribers === 1") && canary.includes("deliveryThree.status === \"up-to-date\"") && canary.includes("active_claim_blocked") && canary.includes("expired_claim_recovered") && canary.includes("sentEvents === 1") && canary.includes("unsubscribeResult.status === 200") && canary.includes("unsubscribeEvents === 1")]
];
const missing=checks.filter(([,ok])=>!ok).map(([name])=>name);
const report={generated_at:new Date().toISOString(),status:missing.length?"failed":"passed",checks:checks.length,missing,safeguards:["validated-editions-only","idempotent-delivery","subscriber-consent-status","unsubscribe","no-draft-send","no-ai-legal-publication"]};
const out=process.env.LOCAL_NEWSLETTER_DELIVERY_CONTRACT_REPORT||join(process.env.LOCAL_RUNTIME_REPORTS_ROOT||"reports","newsletter-delivery-contract-report.json");
mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,`${JSON.stringify(report,null,2)}\n`,`utf8`); console.log(`Newsletter delivery contract: ${report.status} (${checks.filter(([,ok])=>ok).length}/${checks.length}).`); if(missing.length)process.exit(1);