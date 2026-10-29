import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { canReuseGoogleSeoSnapshot, hasGoogleSeoSnapshot, localSeoAuditOutputOverrides, monitoringConnectorCommand } from './runtime-seo-reports.js';

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
