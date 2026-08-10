import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";
loadDefaultEnvFiles();
const delivery = readFileSync("scripts/local-newsletter-delivery.js", "utf8");
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
  ["failure-retry-cooldown", delivery.includes("f.created_at >= datetime('now', '-60 minutes')")],
  ["unsubscribe-header", delivery.includes("List-Unsubscribe")],
  ["recipient-pii-absent-from-report", delivery.includes("no-recipient-pii-in-report")],
  ["admin-never-sends-draft", admin.includes("status = 'published'") && !admin.includes("status IN ('published', 'draft')")],
  ["admin-excludes-already-sent", admin.includes("NOT EXISTS (SELECT 1 FROM newsletter_events")],
  ["admin-requires-deterministic-payload", admin.includes("json_extract(payload, '$.provider') = 'deterministic'")],
  ["runtime-delivery-enabled", runtime.includes('runStep("newsletter_delivery"') && task.includes("NEWSLETTER_AUTO_SEND = '1'")],
  ["dry-run-supported", delivery.includes('process.argv.includes("--dry-run")')]
];
const missing=checks.filter(([,ok])=>!ok).map(([name])=>name);
const report={generated_at:new Date().toISOString(),status:missing.length?"failed":"passed",checks:checks.length,missing,safeguards:["validated-editions-only","idempotent-delivery","subscriber-consent-status","unsubscribe","no-draft-send","no-ai-legal-publication"]};
const out=process.env.LOCAL_NEWSLETTER_DELIVERY_CONTRACT_REPORT||join(process.env.LOCAL_RUNTIME_REPORTS_ROOT||"reports","newsletter-delivery-contract-report.json");
mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,`${JSON.stringify(report,null,2)}\n`,`utf8`); console.log(`Newsletter delivery contract: ${report.status} (${checks.filter(([,ok])=>ok).length}/${checks.length}).`); if(missing.length)process.exit(1);