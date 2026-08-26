import fs from "node:fs";

const page = fs.readFileSync("public/assurance-immeuble-vacant.html", "utf8");
const factory = fs.readFileSync("scripts/lead-growth-factory.js", "utf8");
const failures = [];

const requiredPageMarkers = [
  ['serviceType":"Assurance multirisque pour immeuble vacant ou vide"', "serviceType vacant"],
  ['"audienceType":"Proprietaires d immeubles vacants"', "audience proprietaire"],
  ['value="immeuble-vacant" selected', "type de bien preselectionne"],
  ["Devis immeuble vacant", "titre formulaire vacant"],
  ["Obtenir mon devis immeuble vacant", "bouton formulaire vacant"],
  ["Un immeuble totalement vide ne se traite pas comme un seul logement vacant.", "distinction immeuble/logement"]
];
for (const [marker, label] of requiredPageMarkers) {
  if (!page.includes(marker)) failures.push(`${label} absent`);
}
if (page.includes('<div class="form-heading"><p>Devis PNO/CNO</p>')) failures.push("formulaire vacant encore titre PNO/CNO");
if (!factory.includes('intent: "immeuble-vacant"') || !factory.includes('serviceType: "Assurance multirisque pour immeuble vacant ou vide"')) failures.push("configuration generateur vacante absente");
if (!factory.includes('defaults.intent === "immeuble-vacant"')) failures.push("variation formulaire vacante absente");
if (!factory.includes('"vacant-authority-bridge"') || !factory.includes('["index.html", "blog.html", "guides.html", "faq.html"]')) failures.push("pont autorite vacant absent du generateur");
for (const file of ["public/index.html", "public/blog.html", "public/guides.html", "public/faq.html"]) {
  const hub = fs.readFileSync(file, "utf8");
  if (!hub.includes('<!-- vacant-authority-bridge:start -->') || !hub.includes('href="/assurance-immeuble-vacant"')) failures.push(`${file}: pont vacant absent`);
}

if (failures.length) {
  console.error(`Vacant insurance contract failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Vacant insurance contract passed.");
