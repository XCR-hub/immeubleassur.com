import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = mkdtempSync(join(tmpdir(), "immeubleassur-metadata-outliers-"));
const publicDir = join(root, "public");
mkdirSync(publicDir, { recursive: true });
const body = '<main><h1>Contenu contractuel preserve</h1><p data-proof="unchanged">Corps de page intact.</p></main>';
const validDescription = "Cette description respecte volontairement la plage attendue et doit rester strictement identique apres le correcteur cible SEO.";
writeFileSync(join(publicDir, "valid.html"), `<html><head><title>Titre assurance immeuble deja conforme | ImmeubleAssur</title><meta name="description" content="${validDescription}" /></head><body>${body}</body></html>`, "utf8");
writeFileSync(join(publicDir, "invalid.html"), `<html><head><title>Trop court</title><meta name="description" content="Breve d&amp;#39;offres" /><meta property="og:title" content="Ancien" /><meta property="og:description" content="Ancienne" /></head><body>${body}</body></html>`, "utf8");
writeFileSync(join(publicDir, "confidentialite.html"), `<html><head><title>Confidentialite des demandes | ImmeubleAssur</title><meta name="description" content="Breve" /></head><body>${body}</body></html>`, "utf8");
const script = resolve("scripts", "seo-auto-fix.js");
function run() { return spawnSync(process.execPath, [script, "--metadata-outliers-only"], { cwd: root, encoding: "utf8" }); }
const first = run();
const firstReport = JSON.parse(readFileSync(join(root, "reports", "seo-auto-fix-report.json"), "utf8"));
const valid = readFileSync(join(publicDir, "valid.html"), "utf8");
const invalid = readFileSync(join(publicDir, "invalid.html"), "utf8");
const legal = readFileSync(join(publicDir, "confidentialite.html"), "utf8");
const second = run();
const secondReport = JSON.parse(readFileSync(join(root, "reports", "seo-auto-fix-report.json"), "utf8"));
function meta(html, regex) { return ((html.match(regex) || [])[1] || "").trim(); }
const checks = [
  ["first-run-succeeds", first.status === 0],
  ["valid-metadata-unchanged", meta(valid, /<title>(.*?)<\/title>/is) === "Titre assurance immeuble deja conforme | ImmeubleAssur" && meta(valid, /name="description" content="([^"]*)"/i) === validDescription],
  ["outliers-corrected", meta(invalid, /<title>(.*?)<\/title>/is).length >= 35 && meta(invalid, /<title>(.*?)<\/title>/is).length <= 72 && meta(invalid, /name="description" content="([^"]*)"/i).length >= 110 && meta(invalid, /name="description" content="([^"]*)"/i).length <= 170],
  ["entity-encoding-idempotent", invalid.includes("d&#39;offres") && !invalid.includes("&amp;#39;")],
  ["body-content-preserved", [valid, invalid, legal].every((html) => html.includes(body))],
  ["legal-page-no-content-injection", !legal.includes("auto-seo-depth") && !legal.includes("auto-conversion")],
  ["mode-and-safeguards-reported", firstReport.mode === "metadata-outliers-only" && firstReport.safeguards?.includes("no-content-block-changes") && firstReport.pages_changed === 2],
  ["second-run-idempotent", second.status === 0 && secondReport.pages_changed === 0]
];
rmSync(root, { recursive: true, force: true });
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
const report = { generated_at: new Date().toISOString(), status: missing.length ? "failed" : "passed", checks: checks.length, missing };
const out = process.env.LOCAL_SEO_METADATA_OUTLIERS_CONTRACT_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "seo-metadata-outliers-contract-report.json");
mkdirSync(resolve(out, ".."), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`SEO metadata outliers contract: ${report.status} (${checks.filter(([, ok]) => ok).length}/${checks.length}).`);
if (missing.length) process.exit(1);