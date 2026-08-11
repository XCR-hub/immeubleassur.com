import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const fixture = mkdtempSync(join(tmpdir(), "immeubleassur-content-policy-"));
const checker = resolve("scripts/content-quality-check.js");
function page(slug, title, body) {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="Description distincte et suffisamment informative pour ce controle." /><meta name="robots" content="index, follow" /><link rel="canonical" href="https://immeubleassur.com/${slug}" /></head><body><h1>${title}</h1>${body}</body></html>`;
}
try {
  mkdirSync(join(fixture, "public"), { recursive: true });
  const filler = Array.from({ length: 90 }, (_, index) => `Information utile numero ${index} pour analyser correctement un contrat et preparer un dossier documente.`).join(" ");
  writeFileSync(join(fixture, "public", "mentions-legales.html"), page("mentions-legales", "Mentions legales assurance", "<p>Informations legales de l editeur.</p>"), "utf8");
  writeFileSync(join(fixture, "public", "assurance-test.html"), page("assurance-test", "Assurance immeuble test", `<p>${filler}</p><a class="button primary" href="/devis">Devis</a>`), "utf8");
  const result = spawnSync(process.execPath, [checker], { cwd: fixture, encoding: "utf8" });
  const report = JSON.parse(readFileSync(join(fixture, "reports", "content-quality-report.json"), "utf8"));
  const legal = report.weakest_pages.find((item) => item.slug === "mentions-legales");
  const business = report.weakest_pages.find((item) => item.slug === "assurance-test");
  const checks = [
    ["checker-completes", result.status === 0],
    ["legal-page-does-not-require-faq", !legal?.warnings?.includes("no-visible-faq")],
    ["editorial-insurance-page-still-requires-faq", business?.warnings?.includes("no-visible-faq") === true]
  ];
  const missing = checks.filter(([, passed]) => !passed).map(([name]) => name);
  console.log(JSON.stringify({ status: missing.length ? "failed" : "passed", checks: checks.length, missing }, null, 2));
  if (missing.length) process.exitCode = 1;
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
