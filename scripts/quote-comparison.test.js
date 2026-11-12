import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEuroCents, compareQuoteCosts } from '../public/assets/quote-comparison.js';

const example = { premiumA: '1000', deductibleA: '600', premiumB: '1200', deductibleB: '200', loss: '1000' };
test('a lower annual premium can have a higher total in a specified covered-loss scenario', () => {
  const value = compareQuoteCosts(example);
  assert.deepEqual([value.premiumA, value.premiumB, value.retainedA, value.retainedB, value.totalA, value.totalB], [100000, 120000, 60000, 20000, 160000, 140000]);
});
test('the retained amount never exceeds the damage, including zero and boundary losses', () => {
  for (const loss of ['0', '50', '200', '600', '2000']) {
    const value = compareQuoteCosts({ ...example, loss });
    assert.equal(value.retainedA, Math.min(Number(loss), 600) * 100);
    assert.equal(value.retainedB, Math.min(Number(loss), 200) * 100);
  }
  assert.equal(compareQuoteCosts({ ...example, deductibleA: '0' }).retainedA, 0);
});
test('French decimal amounts and copied currency values retain cent precision', () => {
  assert.equal(parseEuroCents('1\u202f200,10 €'), 120010);
  assert.equal(parseEuroCents('1 200.10'), 120010);
  assert.equal(parseEuroCents(0), 0);
  const value = compareQuoteCosts({ ...example, premiumA: '1000,10', deductibleA: '0,20', loss: '0,10' });
  assert.equal(value.totalA, 100020);
});
test('invalid, percentage and out-of-range amounts are rejected rather than guessed', () => {
  for (const value of ['', ' ', undefined, '-1', '1e3', 'Infinity', 'NaN', '1,2,3', '1,000.00', '1.000', '10%', '1.999', '100000000,01', '99999999999999999999']) assert.throws(() => parseEuroCents(value), RangeError);
  assert.equal(parseEuroCents('100000000'), 10_000_000_000);
  assert.throws(() => compareQuoteCosts({ ...example, deductibleB: '10%' }), error => error.field === 'deductibleB');
});
