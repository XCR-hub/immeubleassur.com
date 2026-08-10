import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const contractOut = process.env.LOCAL_EDITORIAL_AI_PROVIDER_ORDER_CONTRACT_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "editorial-ai-provider-order-contract-report.json");
const root = mkdtempSync(join(tmpdir(), "immeubleassur-editorial-provider-order-"));
for (const name of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"]) process.env[name] = `contract-${name.toLowerCase()}`;
process.env.LOCAL_RUNTIME_REPORTS_ROOT = root;
delete process.env.EDITORIAL_AI_PROVIDER_PRIORITY;
const { aiProviders } = await import(`./editorial-autopilot.js?provider-order-contract=${Date.now()}`);
const reportPath = join(root, "editorial-autopilot-report.json");
function prior({ provider = "openrouter", status = "completed", ageDays = 0 } = {}) {
  writeFileSync(reportPath, JSON.stringify({ generated_at: new Date(Date.now() - ageDays * 86400000).toISOString(), ai_status: status, ai_provider: provider }), "utf8");
}
prior();
const previousFirst = aiProviders().map((item) => item.provider);
process.env.EDITORIAL_AI_PROVIDER_PRIORITY = "anthropic";
const explicitFirst = aiProviders().map((item) => item.provider);
delete process.env.EDITORIAL_AI_PROVIDER_PRIORITY;
prior({ ageDays: 8 });
const staleIgnored = aiProviders().map((item) => item.provider);
prior({ status: "failed" });
const failedIgnored = aiProviders().map((item) => item.provider);
const checks = [
  ["fresh-success-reused", previousFirst[0] === "openrouter"],
  ["explicit-priority-wins", explicitFirst[0] === "anthropic"],
  ["stale-success-ignored", staleIgnored[0] === "openai"],
  ["failed-provider-ignored", failedIgnored[0] === "openai"],
  ["all-configured-fallbacks-preserved", new Set(previousFirst).size === 4 && previousFirst.length === 4]
];
rmSync(root, { recursive: true, force: true });
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing, safeguards: ["fresh-success-only", "explicit-override", "all-fallbacks-preserved", "no-provider-call", "no-secret-values-reported"] };
const out = process.env.LOCAL_EDITORIAL_AI_PROVIDER_ORDER_CONTRACT_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "editorial-ai-provider-order-contract-report.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Editorial AI provider order contract: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (missing.length) process.exit(1);