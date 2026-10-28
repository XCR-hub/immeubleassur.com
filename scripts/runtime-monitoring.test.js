import assert from "node:assert/strict";
import { test } from "node:test";
import { runStep } from "./local-runtime-report-cycle.js";

test("monitoring launches children with outbound mail and deletion disabled", () => {
  const keys = ["NEWSLETTER_AUTO_SEND", "LOCAL_MONITOR_ALERTS", "LOCAL_EDITORIAL_REVIEW_ALERTS", "LOCAL_IMAP_UNMATCHED_ALERTS", "LOCAL_LEAD_SLA_ALERTS", "LOCAL_PRIVACY_RETENTION_APPLY", "INDEXNOW_SUBMIT"];
  const unsafeEnvironment = Object.fromEntries(keys.map((key) => [key, "1"]));
  const child = `const keys=${JSON.stringify(keys)}; if(keys.some(k=>process.env[k]!=='0')||process.env.LOCAL_RUNTIME_MONITORING_ONLY!=='1') process.exit(7); console.log('observation-verified');`;
  const result = runStep("newsletter_delivery", ["--eval", child], unsafeEnvironment, true);
  assert.equal(result.ok, true, result.stderr);
  assert.equal(result.stdout, "observation-verified");
});
test("monitoring checks notification retries without sending", () => {
  const result = runStep("lead_notification_retry", ["--eval", "if(!process.argv.includes('--dry-run'))process.exit(9);", "--"], {}, true);
  assert.equal(result.ok, true, result.stderr);
  assert.match(result.command, /--dry-run$/);
});
for (const name of ["brokerage_cases", "client_contracts"]) {
  test(`monitoring does not execute ${name}`, () => {
    const result = runStep(name, ["--eval", "throw new Error('Business workflow must not run');"], {}, true);
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
  });
}
test("full mode preserves the existing delivery settings", () => {
  const result = runStep("newsletter_delivery", ["--eval", "if(process.env.NEWSLETTER_AUTO_SEND!=='1') process.exit(4);"], { NEWSLETTER_AUTO_SEND: "1" }, false);
  assert.equal(result.ok, true, result.stderr);
});
