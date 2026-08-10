import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = mkdtempSync(join(tmpdir(), "immeubleassur-action-sync-"));
const dbPath = join(root, "fixture.sqlite");
const funnelPath = join(root, "funnel.json");
const intentPath = join(root, "intent.json");
const backlogPath = join(root, "backlog.json");
const outPath = join(root, "sync.json");
const generatedAt = "2026-08-10T17:00:00.000Z";

writeFileSync(funnelPath, JSON.stringify({ generated_at: generatedAt, summary: {}, recommendations: [] }), "utf8");
writeFileSync(backlogPath, JSON.stringify({ generated_at: generatedAt, source_quality: [] }), "utf8");

function writeIntent(recommendations) {
  writeFileSync(intentPath, JSON.stringify({ generated_at: generatedAt, summary: { lookback_days: 30 }, recommendations }), "utf8");
}

function runSync() {
  return spawnSync(process.execPath, ["scripts/local-conversion-action-sync.js", "--db", dbPath, "--report", funnelPath, "--intent-report", intentPath, "--backlog-report", backlogPath, "--out", outPath], { cwd: process.cwd(), encoding: "utf8" });
}

try {
  writeIntent([{ type: "formulaire-start-sans-submit", severity: "high", target: "recherches-hub", signal: "5 demarrages, 0 tentative", action: "Reduire la friction.", score: 91 }]);
  const first = runSync();
  const firstReport = JSON.parse(readFileSync(outPath, "utf8"));
  const database = new DatabaseSync(dbPath);
  const opened = database.prepare("SELECT url, opportunity_type, status, payload FROM seo_opportunities WHERE opportunity_type = 'conversion-intent-formulaire-start-sans-submit'").get();
  writeIntent([]);
  const second = runSync();
  const stale = database.prepare("SELECT status FROM seo_opportunities WHERE opportunity_type = 'conversion-intent-formulaire-start-sans-submit'").get();
  database.close();
  const payload = opened?.payload ? JSON.parse(opened.payload) : {};
  const checks = [
    ["first-sync-succeeds", first.status === 0],
    ["intent-report-loaded", firstReport.intent_report_loaded === true && firstReport.intent_opportunities_opened === 1],
    ["form-opportunity-targets-hub", opened?.url === "https://immeubleassur.com/recherches-assurance-immeuble"],
    ["form-opportunity-keeps-private-dimension", payload.form_source === "recherches-hub" && payload.source === "local-intent-conversion-monitor"],
    ["form-opportunity-opened", opened?.status === "open"],
    ["second-sync-succeeds", second.status === 0],
    ["resolved-signal-becomes-stale", stale?.status === "stale"]
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  console.log("Conversion action sync contract: " + (failed.length ? "failed" : "passed") + " (" + (checks.length - failed.length) + "/" + checks.length + ").");
  if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }
} finally {
  rmSync(root, { recursive: true, force: true });
}
