export const URL_INSPECTION_STRATEGY = 'priority-and-rotating-guides';
export const TURNSTILE_BROWSER_SCENARIO_VERSION = 'scoped-newsletter-page-v2';

export function connectorReportVersionMatches(reportName, report) {
  if (reportName === 'seo-autopilot-report.json') return report?.gsc?.url_inspections?.selection_strategy === URL_INSPECTION_STRATEGY;
  if (reportName === 'local-turnstile-browser-smoke-report.json') return report?.scenario_version === TURNSTILE_BROWSER_SCENARIO_VERSION;
  return true;
}
