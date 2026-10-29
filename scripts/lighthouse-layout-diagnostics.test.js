import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutShiftDiagnostics } from './lighthouse-layout-diagnostics.js';

test('Lighthouse 13 cluster tables retain actual elements without counting cluster totals', () => {
  const rows = layoutShiftDiagnostics({ 'cls-culprits-insight': { details: { type: 'list', items: [
    { type: 'table', items: [{ node: { type: 'text', value: 'Total' }, score: .29 }, { node: { type: 'node', snippet: '<section class="diagnostic-band">' }, score: .27, subItems: { items: [{ cause: 'Injected content' }] } }] },
    { type: 'table', items: [{ node: { type: 'text', value: 'Total' }, score: .02 }, { node: { type: 'node', selector: '.form-heading' }, score: .02 }] }
  ] } } });
  assert.deepEqual(rows, [{ score: .27, node: '<section class="diagnostic-band">', causes: ['Injected content'] }, { score: .02, node: '.form-heading', causes: [] }]);
});
test('older flat reports still return the element and cause', () => {
  assert.deepEqual(layoutShiftDiagnostics({ 'layout-shifts': { details: { type: 'table', items: [{ score: .12, node: { snippet: '<img>' }, subItems: { items: [{ extra: { type: 'url', value: 'https://example.invalid/image.webp' } }] } }] } } }), [{ score: .12, node: '<img>', causes: ['https://example.invalid/image.webp'] }]);
});
test('a page with no recorded shifts has no invented culprit', () => {
  assert.deepEqual(layoutShiftDiagnostics({}), []);
  assert.deepEqual(layoutShiftDiagnostics({ 'cls-culprits-insight': { details: { type: 'list', items: [] } } }), []);
});
