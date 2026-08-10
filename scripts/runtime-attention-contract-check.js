import { outputNeedsAttention } from "./runtime-attention.js";

const fixtures = [
  ["Lead notification retry completed: candidates=0, sent=0, failed=0, dry_run=false.", false],
  ["Newsletter delivery synced-awaiting-auto-send: pending=0, sent=0, failed=0, dry_run=false.", false],
  ["Live ready connectors completed: executed=0, skipped=7, failed=0, attention=0.", false],
  ["Live ready connectors degraded: executed=1, skipped=6, failed=0, attention=1.", true],
  ["Live API readiness partial: 6/8 connector(s) ready.", true],
  ["Google readiness unlock action-required: 2 blocking, 1 degraded.", true],
  ["Newsletter delivery failed=2.", true],
  ["2 failures detected.", true],
  ["Production monitor passed: errors=0.", false],
  ["Editorial review monitor: review-aging, pending=3.", true],
  ["Editorial review monitor: review-overdue, pending=1.", true]
];

const failed = fixtures.filter(([output, expected]) => outputNeedsAttention(output) !== expected);
if (failed.length) {
  console.error(`Runtime attention contract failed: ${failed.length}/${fixtures.length} fixture(s).`);
  process.exit(1);
}
console.log(`Runtime attention contract: passed (${fixtures.length}/${fixtures.length}).`);
