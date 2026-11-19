import fs from "node:fs";

const intent = fs.readFileSync("scripts/seo-intent-differentiation-pass.js", "utf8");
const angle = fs.readFileSync("scripts/seo-angle-differentiation-pass.js", "utf8");
const cannibal = fs.readFileSync("scripts/seo-cannibalization-check.js", "utf8");
const ux = fs.readFileSync("scripts/ux-conversion-pass.js", "utf8");
const pillar = fs.readFileSync("public/assurance-immeuble.html", "utf8");
const multi = fs.readFileSync("public/multirisque-immeuble.html", "utf8");
const failures = [];

if (!intent.includes('primary: "assurance-immeuble"')) failures.push("page pilier du cluster incorrecte");
if (!angle.includes('"assurance-immeuble": {') || !angle.includes('"multirisque-immeuble": {')) failures.push("angles sources absents");
if (!cannibal.includes("primarySlugs.includes(slug)")) failures.push("priorite des slugs strategiques absente du classificateur");
const diagnostic = pillar.match(/<!-- ux-diagnostic:start -->[\s\S]*?<!-- ux-diagnostic:end -->/)?.[0] || "";
if (!ux.includes("improveServiceDiagnosticContext") ||
    !diagnostic.includes('<p class="diagnostic-route">Parcours immeuble</p>') ||
    !/<button class="diagnostic-choice is-active"[^>]*data-step="property" data-value="immeuble-locatif"/.test(diagnostic) ||
    !diagnostic.includes('href="/devis-assurance-immeuble?intent=immeuble"') ||
    !diagnostic.includes("Nombre de lots</li><li>Travaux et entretien</li><li>Prime, franchises et exclusions</li><li>Echeance et preavis a verifier")) failures.push("etat initial du diagnostic immeuble non aligne avec le parcours du batiment");

const pillarMarkers = [
  ["Page pilier assurance immeuble", "marqueur pilier"],
  ["Qualifier le bâtiment avant de comparer les contrats.", "angle pilier"],
  ['serviceType":"Courtage et devis en assurance immeuble"', "serviceType pilier"],
  ['href="/multirisque-immeuble"', "lien vers multirisque"],
  ['href="/devis-assurance-immeuble"', "lien vers devis"]
];
const multiMarkers = [
  ["Contrat multirisque immeuble", "marqueur multirisque"],
  ["Comparer les garanties, franchises et exclusions du contrat.", "angle contrat"],
  ['serviceType":"Audit et comparaison multirisque immeuble"', "serviceType multirisque"],
  ['href="/assurance-immeuble"', "retour vers page pilier"],
  ['href="/audit-contrat-assurance-immeuble"', "lien vers audit"]
];
for (const [marker, label] of pillarMarkers) if (!pillar.includes(marker)) failures.push(`${label} absent`);
for (const [marker, label] of multiMarkers) if (!multi.includes(marker)) failures.push(`${label} absent`);

if (failures.length) {
  console.error(`Assurance immeuble pillar contract failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Assurance immeuble pillar contract passed.");
