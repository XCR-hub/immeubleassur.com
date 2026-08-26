import fs from "node:fs";

const failures = [];
const servers = ["scripts/local-static-server.js", "scripts/local-production-server.js"].map((file) => [file, fs.readFileSync(file, "utf8")]);
const factory = fs.readFileSync("scripts/lead-growth-factory.js", "utf8");
const intentPass = fs.readFileSync("scripts/seo-intent-differentiation-pass.js", "utf8");
const anglePass = fs.readFileSync("scripts/seo-angle-differentiation-pass.js", "utf8");
const sitemap = fs.readFileSync("public/sitemap.xml", "utf8");
const publicFiles = [
  "public/assurance-cno.html",
  "public/blog/multirisque-immeuble-vs-pno.html"
];

for (const [file, server] of servers) {
  if (!server.includes('["/pno-cno", "/assurance-pno-cno"]')) failures.push(`${file}: redirect extensionless absent`);
  if (!server.includes('["/pno-cno.html", "/assurance-pno-cno"]')) failures.push(`${file}: redirect .html absent`);
  if (!server.includes("response.writeHead(301")) failures.push(`${file}: statut 301 absent`);
}
if (!servers[1][1].includes('pathname === "/sitemap.xml"') || !servers[1][1].includes('const sitemap = readFileSync(file, "utf8").replace(')) failures.push("filtre sitemap runtime absent");
if (factory.includes('writePage("pno-cno", hubPage())')) failures.push("le generateur recree encore le hub duplique");
if (!intentPass.includes('primary: "assurance-pno-cno"')) failures.push("page principale du cluster PNO/CNO incorrecte");
if (!anglePass.includes('"assurance-pno": {') || !anglePass.includes('Angle PNO bailleur')) failures.push("angle PNO bailleur absent");
if (sitemap.includes("<loc>https://immeubleassur.com/pno-cno</loc>")) failures.push("ancienne URL encore dans le sitemap");
if (!sitemap.includes("<loc>https://immeubleassur.com/assurance-pno-cno</loc>")) failures.push("URL principale absente du sitemap");
if (fs.existsSync("public/pno-cno.html")) failures.push("fichier public duplique encore present");

for (const file of publicFiles) {
  const html = fs.readFileSync(file, "utf8");
  if (html.includes('href="/pno-cno"')) failures.push(`${file}: lien interne vers ancienne URL`);
  if (!html.includes('href="/assurance-pno-cno"')) failures.push(`${file}: lien vers URL principale absent`);
}

if (failures.length) {
  console.error(`PNO/CNO consolidation contract failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("PNO/CNO consolidation contract passed.");
