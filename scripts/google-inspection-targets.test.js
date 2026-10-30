import assert from 'node:assert/strict';
import { test } from 'node:test';
import { insurerGuides } from '../content/insurer-guides.js';
import { selectUrlInspectionTargets } from './google-inspection-targets.js';
import { GOOGLE_SEO_INTERVAL_MINUTES } from './runtime-seo-reports.js';
import { connectorReportVersionMatches, URL_INSPECTION_STRATEGY, TURNSTILE_BROWSER_SCENARIO_VERSION } from './live-connector-report-versions.js';

const site = 'https://immeubleassur.com';
const cycleMs = GOOGLE_SEO_INTERVAL_MINUTES * 60000;

test('three scheduled collections cover the guides and hubs without increasing the eight-request budget', () => {
  const batches = [0, 1, 2].map(cycle => selectUrlInspectionTargets({ now: cycle * cycleMs }));
  const covered = new Set(batches.flat());
  for (const batch of batches) {
    assert.equal(batch.length, 8);
    assert.equal(new Set(batch).size, 8);
    for (const slug of ['', 'assurance-immeuble', 'devis-assurance-immeuble', 'courtier-assurance-immeuble']) assert.ok(batch.includes(site + '/' + slug));
  }
  for (const slug of ['guides', 'blog', 'assurance-copropriete', 'assurance-cno', 'assurance-pno-cno', 'tarif-assurance-immeuble', ...insurerGuides.map(guide => guide.slug)]) {
    assert.ok(covered.has(site + '/' + slug), `Not inspected: ${slug}`);
  }
});

test('explicit URLs keep priority and tracking variants do not consume duplicate requests', () => {
  const extraUrls = [site + '/guides?utm_source=test#section', site + '/guides', 'https://other.example/page', 'javascript:alert(1)', 'https://user:pass@immeubleassur.com/hidden'];
  assert.deepEqual(selectUrlInspectionTargets({ extraUrls, limit: 2, now: 0 }), [site + '/guides', site + '/']);
});

test('measured opportunities receive inspection slots and do not starve rotating discovery', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ page: site + '/observed-' + index, opportunity_score: 100 - index }));
  const original = structuredClone(rows);
  const targets = selectUrlInspectionTargets({ rows, now: 0 });
  assert.equal(targets.length, 8);
  assert.ok(targets.includes(site + '/observed-0'));
  assert.ok(targets.includes(site + '/observed-1'));
  assert.ok(targets.includes(site + '/assurance-copropriete'));
  assert.deepEqual(rows, original);
});

test('the budget stays bounded for invalid or extreme configuration and pinned-only runs', () => {
  for (const limit of [NaN, 'invalid', Infinity]) assert.equal(selectUrlInspectionTargets({ limit }).length, 8);
  assert.equal(selectUrlInspectionTargets({ limit: 1 }).length, 1);
  assert.equal(selectUrlInspectionTargets({ limit: 0 }).length, 1);
  assert.ok(selectUrlInspectionTargets({ limit: 100 }).length <= 20);
  assert.equal(selectUrlInspectionTargets({ limit: 8.9 }).length, 8);
});

test('deployment refreshes earlier Google and browser reports once without discarding current empty Google data', () => {
  assert.equal(connectorReportVersionMatches('seo-autopilot-report.json', { gsc: { configured: true, rows_imported: 0, url_inspections: { checked: 8 } } }), false);
  assert.equal(connectorReportVersionMatches('seo-autopilot-report.json', { gsc: { configured: true, rows_imported: 0, url_inspections: { selection_strategy: URL_INSPECTION_STRATEGY } } }), true);
  assert.equal(connectorReportVersionMatches('local-turnstile-browser-smoke-report.json', { status: 'failed' }), false);
  assert.equal(connectorReportVersionMatches('local-turnstile-browser-smoke-report.json', { scenario_version: TURNSTILE_BROWSER_SCENARIO_VERSION }), true);
  assert.equal(connectorReportVersionMatches('local-lighthouse-report.json', {}), true);
});
