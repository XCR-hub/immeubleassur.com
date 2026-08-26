import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cities = ["paris", "lyon", "marseille", "bordeaux", "lille", "nantes"];
const generators = ["scripts/generate-site.js", "scripts/seo-content-factory.js"];
const failures = [];

for (const city of cities) {
  const file = path.join(root, "public", `assurance-immeuble-${city}.html`);
  const html = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const evidence = html.match(/<section class="band city-evidence-band">[\s\S]*?<\/section>/)?.[0] || "";
  const officialLinks = evidence.match(/https:\/\/(?:www\.)?(?:georisques\.gouv\.fr|paris\.fr|apur\.org|grandlyon\.com|marseille\.fr|bordeaux-metropole\.fr|lille\.fr|metropole\.nantes\.fr)\//g) || [];

  if (!evidence) failures.push(`${city}: bloc de preuve locale absent`);
  if (officialLinks.length < 2) failures.push(`${city}: moins de deux sources publiques`);
  if (!/adresse/i.test(evidence)) failures.push(`${city}: verification a l'adresse absente`);
  if (!/contrat[^<]{0,80}(?:determine|couverture)/i.test(evidence)) failures.push(`${city}: reserve contractuelle absente`);
}

for (const generator of generators) {
  const source = fs.readFileSync(path.join(root, generator), "utf8");
  for (const city of cities) {
    if (!source.includes(`slug === "${city}"`)) failures.push(`${generator}: ${city} absent du generateur`);
  }
}

if (failures.length) {
  console.error(`Priority city evidence contract failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`Priority city evidence contract passed (${cities.length} villes).`);
