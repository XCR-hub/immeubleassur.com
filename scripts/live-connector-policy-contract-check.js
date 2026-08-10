import assert from "node:assert/strict";
import { serpCooldownDecision } from "./live-connector-policy.js";

const generatedAt = "2026-08-10T10:00:00.000Z";
const now = Date.parse("2026-08-10T12:00:00.000Z");
const limited = { rate_limited: true, generated_at: generatedAt, retry_after: "" };

assert.equal(serpCooldownDecision(null, { now, cooldownMinutes: 360 }), null);
assert.equal(serpCooldownDecision({ ...limited, rate_limited: false }, { now, cooldownMinutes: 360 }), null);
assert.equal(serpCooldownDecision(limited, { now, cooldownMinutes: 360, force: true }), null);
const active = serpCooldownDecision(limited, { now, cooldownMinutes: 360 });
assert.equal(active?.cooldown_minutes, 360);
assert.equal(active?.next_retry_after_minutes, 240);
assert.equal(serpCooldownDecision(limited, { now: Date.parse("2026-08-10T16:01:00.000Z"), cooldownMinutes: 360 }), null);
const providerDelay = serpCooldownDecision({ ...limited, retry_after: "86400" }, { now, cooldownMinutes: 360 });
assert.equal(providerDelay?.provider_retry_after_minutes, 1440);
assert.equal(providerDelay?.cooldown_minutes, 1440);
assert.equal(providerDelay?.next_retry_after_minutes, 1320);
assert.equal(serpCooldownDecision({ ...limited, generated_at: "invalid" }, { now, cooldownMinutes: 360 }), null);

console.log("Live connector policy contract: passed (10/10).");
