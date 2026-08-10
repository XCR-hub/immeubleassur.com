import { readFileSync } from "node:fs";
import { selectPublishedWatchItems } from "./editorial-autopilot.js";

const representativeFixture = selectPublishedWatchItems([
  { source_id: "official", title: "Comment creer un syndic benevole", url: "https://example.test/old", published_at: "18 fevrier 2026", relevance_score: 90 },
  { source_id: "official", title: "Futur syndic non fiable", url: "https://example.test/future", published_at: "09 juin 2099", relevance_score: 99 },
  { source_id: "official", title: "L'ADIL accompagne les syndics benevoles", url: "https://example.test/recent", published_at: "09 juin 2026", relevance_score: 49 },
  { source_id: "official", title: "Assurance immeuble et garanties", url: "https://example.test/insurance", published_at: "30 juillet 2026", relevance_score: 70 }
], 3);

const files = {
  factory: readFileSync("scripts/seo-content-factory.js", "utf8"),
  seo: readFileSync("scripts/seo-autopilot.js", "utf8"),
  professional: readFileSync("public/blog/syndic-copropriete-assurance-contrat.html", "utf8"),
  volunteer: readFileSync("public/blog/copropriete-petite-syndic-benevole.html", "utf8"),
  rc: readFileSync("public/rc-syndic.html", "utf8"),
  generator: readFileSync("scripts/generate-site.js", "utf8")
};

const checks = [
  ["professional-generator-angle", files.factory.includes("syndic-copropriete-assurance-contrat|Syndic professionnel et assurance copropriete") && files.factory.includes("Quand un syndic professionnel pilote plusieurs contrats immeuble")],
  ["professional-query-measured", files.seo.includes('["syndic professionnel assurance copropriete", "blog/syndic-copropriete-assurance-contrat"]')],
  ["professional-page-specific", files.professional.includes("Syndic professionnel - guide expert") && files.professional.includes("Centraliser mandats, contrats et echeances par copropriete")],
  ["professional-human-legal-validation", files.professional.includes("Une IA peut-elle valider le contrat ?") && files.professional.includes("decision restent validees humainement")],
  ["professional-official-sources", files.professional.includes("legifrance.gouv.fr") && files.professional.includes("service-public.fr")],
  ["professional-lead-form", files.professional.includes('id="lead-form"') && files.professional.includes('value="syndic-professionnel"')],
  ["volunteer-page-remains-distinct", files.volunteer.includes("Syndic benevole - guide expert") && files.volunteer.includes("mandat du syndic benevole")],
  ["rc-syndic-page-remains-covered", files.rc.includes("Responsabilite civile du syndic") || files.rc.includes("RC syndic")],
  ["rc-syndic-faq-visible-and-structured", files.rc.includes('id="faq-rc-syndic"') && files.rc.includes('"@type":"FAQPage"') && files.rc.includes("Une IA peut-elle determiner seule la responsabilite ?")],
  ["rc-syndic-faq-safe-and-generated", files.generator.includes("RC du syndicat et RC professionnelle du syndic") && files.generator.includes("toute interpretation juridique ou recommandation contractuelle exige une validation humaine") && files.generator.includes("faqSchema")],
  ["rc-syndic-official-sources", files.rc.includes("legifrance.gouv.fr") && files.rc.includes("service-public.fr")],
  ["newest-dated-syndic-signal-selected", representativeFixture.some((item) => item.url === "https://example.test/recent") && representativeFixture[1]?.url === "https://example.test/recent"],
  ["future-dated-syndic-signal-rejected", !representativeFixture.some((item) => item.url === "https://example.test/future")]
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Syndic editorial coverage contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}).`);
if (failed.length) {
  console.error(failed.join(", "));
  process.exitCode = 1;
}
