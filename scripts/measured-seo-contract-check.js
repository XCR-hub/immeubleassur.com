import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();
const source = readFileSync("scripts/local-source-quality-monitor.js", "utf8");
const backlog = readFileSync("scripts/local-seo-backlog-monitor.js", "utf8");
const funnel = readFileSync("scripts/local-conversion-funnel-monitor.js", "utf8");
const reconciliation = readFileSync("scripts/local-seo-opportunity-reconcile.js", "utf8");
const admin = readFileSync("public/assets/admin.js", "utf8");
const runtime = readFileSync("scripts/local-runtime-report-cycle.js", "utf8");
const searchIntelligence = readFileSync("scripts/search-intelligence.js", "utf8");
const searchGap = readFileSync("scripts/search-gap-booster.js", "utf8");
const serpRecovery = readFileSync("scripts/serp-recovery-factory.js", "utf8");
const seoAutopilot = readFileSync("scripts/seo-autopilot.js", "utf8");
const checks = [
  ["engagement-event-set", source.includes("ENGAGEMENT_EVENTS") && source.includes("engaged_sessions: new Set()")],
  ["passive-pageviews-kept-separate", source.includes("sessions: totals.sessions") && source.includes("engaged_sessions: totals.engaged_sessions")],
  ["engaged-conversion-rate", source.includes("engaged_session_to_lead_rate")],
  ["recommendations-require-engagement", source.includes("row.engaged_sessions >= 10")],
  ["backlog-sql-counts-engaged-sessions", backlog.includes("AS engaged_sessions")],
  ["raw-pageview-weight-capped", backlog.includes("Math.min(Number(row.page_views || 0) * 0.1, 10)")],
  ["single-start-is-low-confidence", backlog.includes('key: "early-start-signal"') && backlog.includes('severity: "low"')],
  ["blocked-form-requires-sample", backlog.includes("formStarts >= 3")],
  ["backlog-exports-engaged-summary", backlog.includes("top_qualified_source_engaged_sessions")],
  ["backlog-deduplicates-logical-actions", backlog.includes("CREATE TEMP VIEW seo_opportunities_effective") && backlog.includes("ROW_NUMBER() OVER")],
  ["backlog-reports-suppressed-duplicates", backlog.includes("suppressed: Math.max(0, raw - effective)") && backlog.includes('mode: "sqlite-readonly-deduplicated"')],
  ["funnel-counts-engaged-sessions", funnel.includes("engagedSessionCount") && funnel.includes("AS engaged_sessions")],
  ["funnel-keeps-raw-traffic-separate", funnel.includes("raw-traffic-kept-separate")],
  ["funnel-requires-minimum-samples", funnel.includes("row.engaged_sessions >= 3") && funnel.includes("summary.form_starts >= 3")],
  ["admin-shows-engaged-versus-raw", admin.includes("session(s) engagee(s)")],
  ["admin-consumes-measured-actionable-serp-only", admin.includes('!0===e.measured&&e.actionable===!0&&"serpapi"===e.data_source&&"measured"===e.confidence')],
  ["admin-does-not-invent-serp-recommendations", !admin.includes('recommendation:e.recommendation||"Renforcer contenu, preuves, FAQ, maillage et CTA devis."')],
  ["runtime-runs-source-quality", runtime.includes('runStep("source_quality_monitor"')],
  ["runtime-runs-backlog-after-sync", runtime.includes('runStep("seo_backlog_monitor_after_sync"')],
  ["runtime-refreshes-conversion-before-reconciliation", runtime.includes('runStep("conversion_intelligence_runtime"') && runtime.includes('runStep("seo_opportunity_reconciliation"')],
  ["reconciliation-is-transactional", reconciliation.includes('BEGIN IMMEDIATE') && reconciliation.includes('ROLLBACK') && reconciliation.includes('COMMIT')],
  ["reconciliation-preserves-history", reconciliation.includes("status = 'resolved'") && reconciliation.includes("no-content-publication")],
  ["primary-serp-metrics-are-measured-only", searchIntelligence.includes("average_position: measuredAverage") && searchIntelligence.includes("top3_count: measuredFound.filter") && searchIntelligence.includes('coverage_status: measured.length ? "measured-data-available" : "no-measured-data"')],
  ["estimated-serp-metrics-explicitly-separated", searchIntelligence.includes("estimated_average_position: estimatedAverage") && searchIntelligence.includes("estimated_top3_count:") && searchIntelligence.includes("estimated_priority_queries:")],
  ["estimated-average-excludes-measured-rows", searchIntelligence.includes("estimatedAverage = estimatedFound.length") && searchIntelligence.includes("estimated_first_page_count: estimatedFound.filter")],
  ["fallback-rankings-are-never-actionable", searchIntelligence.includes("recommendation: null, actionable: false") && searchIntelligence.includes("Aucune action de classement autorisee sans mesure SERP reelle")],
  ["competitor-intelligence-is-measured-only", searchIntelligence.includes("enriched.filter((row) => row.measured === true).flatMap") && searchIntelligence.includes('competitor_coverage: measured.length ? "measured-only" : "held-no-measured-data"')],
  ["search-gap-requires-measured-serpapi-input", searchGap.includes('row.measured === true && row.data_source === "serpapi" && row.confidence === "measured"') && searchGap.includes("unmeasured_blocks_sanitized") && searchGap.includes("sanitizeLegacyUnmeasuredBlock") && searchGap.includes("held-no-measured-input")],
  ["serp-recovery-requires-measured-serpapi-input", serpRecovery.includes('row.measured === true && row.data_source === "serpapi" && row.confidence === "measured"') && serpRecovery.includes("no-fallback-driven-pages") && serpRecovery.includes("legacy-fallback-claims-sanitized") && serpRecovery.includes("sanitizeLegacyFallbackPages")],
  ["seo-autopilot-recomputes-measured-rank-counts", seoAutopilot.includes("row.measured === true && Number.isFinite(row.position) && row.position <= 3") && seoAutopilot.includes("average_position: report.measured_average_position || null")],
  ["seo-autopilot-feedback-requires-measured-actionable-serp", seoAutopilot.includes('item.measured === true && item.actionable === true && item.data_source === "serpapi" && item.confidence === "measured"')],
  ["seo-autopilot-feedback-does-not-invent-ranking-advice", !seoAutopilot.includes('row.recommendation || "Renforcer contenu, preuves, FAQ, maillage et CTA devis."')],
  ["static-seo-score-is-not-ranking-proof", seoAutopilot.includes('report.score_scope = "on-page-technical"') && seoAutopilot.includes('status: gscMeasured > 0 ? "gsc-measured" : serpMeasured > 0 ? "serpapi-measured" : "awaiting-measured-data"') && seoAutopilot.includes('ranking_improvement_verified: false') && seoAutopilot.includes('static_score_is_ranking_proof: false')],
  ["seo-autopilot-supports-runtime-search-input", seoAutopilot.includes("LOCAL_SEARCH_INTELLIGENCE_REPORT") && seoAutopilot.includes("SEARCH_INTELLIGENCE_REPORT")],
  ["seo-autopilot-supports-runtime-safe-outputs", seoAutopilot.includes("LOCAL_SEO_AUTOPILOT_REPORT") && seoAutopilot.includes("LOCAL_SEO_AUTOPILOT_PUBLIC_REPORT")],
  ["seo-autopilot-skips-noindex-opportunities", seoAutopilot.includes("const noindex =") && seoAutopilot.includes("const indexablePages = pages.filter((page) => !page.noindex)") && seoAutopilot.includes("noindex_pages_skipped")],
  ["seo-autopilot-recognizes-jsonld-graphs", seoAutopilot.includes("const hasPageSchema =") && seoAutopilot.includes("!hasPageSchema") && !seoAutopilot.includes("jsonLd < 2")],
  ["runtime-refreshes-public-seo-report", runtime.includes('runStep("seo_autopilot_runtime", ["scripts/seo-autopilot.js", "--local-only"]') && runtime.includes("LOCAL_SEO_AUTOPILOT_PUBLIC_REPORT")]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, safeguards: ["raw-traffic-not-treated-as-commercial-intent", "minimum-sample-before-high-friction-alert", "first-party-events-only", "no-pii-in-seo-reports", "serp-primary-metrics-measured-only", "no-fallback-driven-content", "no-fallback-driven-actions", "measured-only-competitor-intelligence", "noindex-pages-excluded-from-seo-actions"] };
const out = process.env.LOCAL_MEASURED_SEO_CONTRACT_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "measured-seo-contract-report.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Measured SEO contract: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (missing.length) process.exit(1);