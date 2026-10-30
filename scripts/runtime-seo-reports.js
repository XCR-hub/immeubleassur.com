import { join } from 'node:path';

export const GOOGLE_SEO_INTERVAL_MINUTES = 180;

export function hasGoogleSeoSnapshot(report) {
  return report?.mode === 'api' && report?.gsc?.configured === true;
}

export function canReuseGoogleSeoSnapshot(report) {
  return hasGoogleSeoSnapshot(report) && !report.gsc.error;
}

export function seoSnapshotMaxAgeMinutes(report) {
  const publicStatus = report?.google_collection?.status;
  const publicSnapshot = ['collected', 'failed'].includes(publicStatus);
  // Older public summaries did not include collection status. URL inspections
  // or imported rows prove that their Google snapshot was actually collected.
  const legacySnapshot = !report?.google_collection
    && report?.google_api_health?.search_console_configured === true
    && (Number(report.google_api_health.url_inspection_checked) > 0 || Number(report.google_api_health.search_console_rows) > 0);
  return hasGoogleSeoSnapshot(report) || publicSnapshot || legacySnapshot ? GOOGLE_SEO_INTERVAL_MINUTES + 30 : 90;
}

export function googleSeoCollectionStatus(report) {
  if (report?.gsc?.configured !== true) return 'not-configured';
  if (report.gsc.error) return 'failed';
  return Number.isFinite(report.gsc.rows_imported) ? 'collected' : 'not-collected';
}

export function googleSeoCollectionFailed(report) {
  return Boolean(report?.gsc?.error || report?.google_collection?.status === 'failed');
}

export function searchConsoleReadiness(report) {
  const actions = Array.isArray(report?.actions) ? report.actions : [];
  const action = actions.find(item => item?.id === 'google-search-console');
  const inspected = Array.isArray(report?.watched_connectors) && report.watched_connectors.includes('google-search-console')
    && Number(report.google_connector_count) > 0 && Array.isArray(report.actions);
  const recognized = ['ready', 'degraded', 'action-required'].includes(report?.status);
  const ready = Boolean(inspected && recognized && !action);
  return {
    ready,
    configured: ready || action?.configured === true,
    missing_configuration: action?.reason === 'missing-secret',
    status: ready ? 'ready' : action?.reason || report?.status || 'unknown',
    connector_signal: action?.signal || (ready ? 'Search Console connector ready' : 'Search Console readiness not confirmed')
  };
}

export function localSeoAuditOutputOverrides(report, reportsRoot, assetsRoot) {
  if (!hasGoogleSeoSnapshot(report)) return {};
  return {
    LOCAL_SEO_AUTOPILOT_REPORT: join(reportsRoot, 'seo-local-audit-report.json'),
    LOCAL_SEO_AUTOPILOT_MARKDOWN: join(reportsRoot, 'seo-local-audit-report.md'),
    LOCAL_SEO_AUTOPILOT_PUBLIC_REPORT: join(assetsRoot, 'assets', 'seo-local-audit-latest.json')
  };
}

export function monitoringConnectorCommand(id, command, monitoringOnly) {
  if (!monitoringOnly) return [...command];
  if (id === 'google-seo') {
    const readFlags = new Set(['--gsc-if-configured', '--gsc', '--url-inspection']);
    return command.filter((argument, index) => index === 0 || readFlags.has(argument));
  }
  return ['forms-browser-smoke', 'pagespeed-local'].includes(id) ? [...command] : null;
}
