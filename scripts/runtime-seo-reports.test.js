import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { canReuseGoogleSeoSnapshot, hasGoogleSeoSnapshot, localSeoAuditOutputOverrides, monitoringConnectorCommand, searchConsoleReadiness, seoSnapshotMaxAgeMinutes, GOOGLE_SEO_INTERVAL_MINUTES, googleSeoCollectionStatus, googleSeoCollectionFailed } from './runtime-seo-reports.js';

test('an audit without collected Google data cannot postpone Google collection', () => {
  for (const report of [null, {}, { mode: 'local-only', gsc: { configured: false } }, { mode: 'api', gsc: { configured: false } }]) {
    assert.equal(hasGoogleSeoSnapshot(report), false);
    assert.equal(canReuseGoogleSeoSnapshot(report), false);
    assert.deepEqual(localSeoAuditOutputOverrides(report, 'reports', 'runtime'), {});
  }
});

test('a connected property with zero rows keeps its Google snapshot during local audits', () => {
  const report = { mode: 'api', gsc: { configured: true, rows_imported: 0, siteUrl: 'https://immeubleassur.com/' } };
  const original = structuredClone(report);
  assert.equal(canReuseGoogleSeoSnapshot(report), true);
  assert.deepEqual(localSeoAuditOutputOverrides(report, 'runtime-reports', 'runtime'), {
    LOCAL_SEO_AUTOPILOT_REPORT: join('runtime-reports', 'seo-local-audit-report.json'),
    LOCAL_SEO_AUTOPILOT_MARKDOWN: join('runtime-reports', 'seo-local-audit-report.md'),
    LOCAL_SEO_AUTOPILOT_PUBLIC_REPORT: join('runtime', 'assets', 'seo-local-audit-latest.json')
  });
  assert.deepEqual(report, original);
});

test('a Google API failure stays visible and permits a subsequent collection attempt', () => {
  const report = { mode: 'api', gsc: { configured: true, error: 'GSC searchAnalytics 403' } };
  assert.equal(hasGoogleSeoSnapshot(report), true);
  assert.equal(canReuseGoogleSeoSnapshot(report), false);
  assert.ok(localSeoAuditOutputOverrides(report, 'reports', 'runtime').LOCAL_SEO_AUTOPILOT_REPORT.endsWith('seo-local-audit-report.json'));
});

test('monitoring Google collection retains read operations and excludes publication flags', () => {
  const command = ['scripts/seo-autopilot.js', '--gsc-if-configured', '--url-inspection', '--submit-sitemap', '--apply'];
  assert.deepEqual(monitoringConnectorCommand('google-seo', command, true), ['scripts/seo-autopilot.js', '--gsc-if-configured', '--url-inspection']);
  assert.equal(command.length, 5);
});

test('monitoring continues to exclude paid and editorial connectors', () => {
  for (const id of ['serpapi', 'editorial-ai', 'pexels', 'turnstile']) assert.equal(monitoringConnectorCommand(id, ['script.js'], true), null);
  for (const id of ['forms-browser-smoke', 'pagespeed-local']) assert.deepEqual(monitoringConnectorCommand(id, ['script.js'], true), ['script.js']);
});

test('the normal connector mode retains its configured command', () => {
  const command = ['scripts/seo-autopilot.js', '--gsc-if-configured', '--submit-sitemap'];
  assert.deepEqual(monitoringConnectorCommand('google-seo', command, false), command);
});

test('GA4 setup and SerpApi quota actions do not mark a working Search Console connector unavailable', () => {
  const report = {
    status: 'action-required', watched_connectors: ['google-search-console', 'ga4', 'serpapi'], google_connector_count: 3,
    actions: [{ id: 'ga4', reason: 'missing-secret' }, { id: 'serpapi', reason: 'rate-limited' }]
  };
  const before = structuredClone(report);
  assert.equal(searchConsoleReadiness(report).ready, true);
  assert.equal(searchConsoleReadiness(report).configured, true);
  assert.deepEqual(report, before, 'Other connector failures remain in the report');
});

test('Search Console missing credentials, degraded runs and absent evidence remain visible', () => {
  const base = { status: 'degraded', watched_connectors: ['google-search-console'], google_connector_count: 1 };
  const missing = searchConsoleReadiness({ ...base, actions: [{ id: 'google-search-console', reason: 'missing-secret', configured: false }] });
  assert.equal(missing.ready, false);
  assert.equal(missing.missing_configuration, true);
  const degraded = searchConsoleReadiness({ ...base, actions: [{ id: 'google-search-console', reason: 'degraded-run', configured: true }] });
  assert.equal(degraded.ready, false);
  assert.equal(degraded.configured, true);
  for (const report of [null, {}, { status: 'ready', actions: [] }, { ...base, actions: {} }, { ...base, watched_connectors: 'google-search-console', actions: [] }, { ...base, status: 'failed', actions: [] }]) {
    assert.equal(searchConsoleReadiness(report).ready, false);
  }
});

test('Google snapshots have time to reach their next scheduled collection while local audits remain bounded', () => {
  const report = { mode: 'api', gsc: { configured: true, rows_imported: 0 } };
  assert.equal(seoSnapshotMaxAgeMinutes(report), GOOGLE_SEO_INTERVAL_MINUTES + 30);
  assert.ok(180 < seoSnapshotMaxAgeMinutes(report), 'The observed 166-minute snapshot is not prematurely stale');
  assert.ok(211 > seoSnapshotMaxAgeMinutes(report), 'An overdue Google collection still expires');
  for (const local of [null, {}, { mode: 'local-only' }, { mode: 'api', gsc: { configured: false } }]) {
    assert.equal(seoSnapshotMaxAgeMinutes(local), 90);
  }
  assert.equal(canReuseGoogleSeoSnapshot({ ...report, gsc: { configured: true, error: 'GSC searchAnalytics 403' } }), false);
});

test('sanitized public Google summaries retain the collection window without exposing credentials', () => {
  const privateReport = { mode: 'api', gsc: { configured: true, rows_imported: 0, siteUrl: 'https://immeubleassur.com/' } };
  const publicReport = { google_collection: { status: googleSeoCollectionStatus(privateReport) } };
  assert.deepEqual(publicReport, { google_collection: { status: 'collected' } });
  assert.equal(seoSnapshotMaxAgeMinutes(publicReport), 210);
  assert.equal(googleSeoCollectionFailed(publicReport), false);
  const legacyReport = { google_api_health: { search_console_configured: true, url_inspection_checked: 8, search_console_rows: 0 } };
  assert.equal(seoSnapshotMaxAgeMinutes(legacyReport), 210);
  assert.equal(seoSnapshotMaxAgeMinutes({ google_api_health: { search_console_configured: true } }), 90);
});

test('a fresh public API failure is unhealthy immediately and never becomes successful empty data', () => {
  const privateReport = { mode: 'api', gsc: { configured: true, error: 'GSC searchAnalytics 403' } };
  const publicReport = { google_collection: { status: googleSeoCollectionStatus(privateReport) } };
  assert.equal(publicReport.google_collection.status, 'failed');
  assert.equal(googleSeoCollectionFailed(publicReport), true);
  assert.equal(googleSeoCollectionFailed(privateReport), true);
  assert.equal(googleSeoCollectionStatus({ gsc: { configured: false } }), 'not-configured');
  assert.equal(googleSeoCollectionStatus({ gsc: { configured: true } }), 'not-collected');
});
