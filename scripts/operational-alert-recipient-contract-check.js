import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requireOperationalTeamRecipient } from "./local-smtp.js";

assert.throws(() => requireOperationalTeamRecipient({ to: ["wrong@example.test"] }), /team@immeubleassur\.com absent/);
assert.throws(() => requireOperationalTeamRecipient({ to: [] }), /team@immeubleassur\.com absent/);
assert.equal(requireOperationalTeamRecipient({ to: ["TEAM@IMMEUBLEASSUR.COM"] }).to[0], "TEAM@IMMEUBLEASSUR.COM");
const sla = readFileSync("scripts/local-lead-sla-monitor.js", "utf8");
const production = readFileSync("scripts/local-production-monitor.js", "utf8");
assert(sla.includes("requireOperationalTeamRecipient(config)"));
assert(production.includes("requireOperationalTeamRecipient(config)"));
console.log("Operational alert recipient contract: passed (5/5).");
