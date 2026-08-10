import { summarizeDependencyAudit } from "./dependency-security.js";

function audit(vulnerabilities) { return { metadata: { vulnerabilities } }; }
const fixtures = [
  [audit({ total: 0 }), "healthy", 0],
  [audit({ low: 1, total: 1 }), "degraded", 0],
  [audit({ moderate: 2, total: 2 }), "degraded", 0],
  [audit({ high: 1, total: 1 }), "failed", 1],
  [audit({ critical: 2, total: 2 }), "failed", 2]
];
const failures = fixtures.filter(([input, status, blocking]) => { const result = summarizeDependencyAudit(input); return result.status !== status || result.blocking !== blocking; });
if (failures.length) {
  console.error(`Dependency security contract failed: ${failures.length}/${fixtures.length}.`);
  process.exit(1);
}
console.log(`Dependency security contract: passed (${fixtures.length}/${fixtures.length}).`);
