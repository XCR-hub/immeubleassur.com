import { readFileSync } from "node:fs";

const generator = readFileSync("scripts/generate-site.js", "utf8");
const rc = readFileSync("public/rc-syndic.html", "utf8");
const claims = readFileSync("public/gestion-sinistres-immeuble.html", "utf8");

const checks = [
  ["generator-supports-page-specific-faq", generator.includes("const faqRows = page.faq || []") && generator.includes("const faqSources = page.faqSources ||")],
  ["generator-builds-visible-and-structured-faq", generator.includes("const faqBlock =") && generator.includes("const faqSchema =")],
  ["rc-faq-remains-generated", generator.includes("RC du syndicat et RC professionnelle du syndic") && rc.includes('id="faq-rc-syndic"')],
  ["claims-faq-visible", claims.includes('id="faq-gestion-sinistres"') && claims.includes("Quelles pieces reunir des le premier signalement ?")],
  ["claims-faq-structured", claims.includes('"@id":"https://immeubleassur.com/gestion-sinistres-immeuble#faq"') && claims.includes('"@type":"FAQPage"')],
  ["claims-human-validation-required", claims.includes("Une IA peut-elle confirmer qu un sinistre est garanti ?") && claims.includes("validation humaine des professionnels competents")],
  ["claims-official-sources", claims.includes("LEGIARTI000035731302") && claims.includes("service-public.fr/particuliers/vosdroits/N44")],
  ["claims-source-configuration-persistent", generator.includes("LEGIARTI000035731302") && generator.includes("service-public.fr/particuliers/vosdroits/N44")]
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Service FAQ coverage contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
if (failed.length) {
  console.error(failed.join(", "));
  process.exitCode = 1;
}
