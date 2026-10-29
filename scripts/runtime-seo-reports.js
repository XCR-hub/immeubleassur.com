import { join } from 'node:path';

export function hasGoogleSeoSnapshot(report) {
  return report?.mode === 'api' && report?.gsc?.configured === true;
}

export function canReuseGoogleSeoSnapshot(report) {
  return hasGoogleSeoSnapshot(report) && !report.gsc.error;
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
