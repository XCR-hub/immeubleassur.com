import fs from "node:fs";

const failures = [];
const server = fs.readFileSync("scripts/local-static-server.js", "utf8");
const factory = fs.readFileSync("scripts/lead-growth-factory.js", "utf8");
const sitemap = fs.readFileSync("public/sitemap.xml", "utf8");
const publicFiles = [
  "public/assurance-cno.html",
  "public/blog/multirisque-immeuble-vs-pno.html"
];

if (!server.includes('["/pno-cno", "/assurance-pno-cno"]')) failures.push("redirect extensionless absent");
if (!server.includes('["/pno-cno.html", "/assurance-pno-cno"]')) failures.push("redirect .html absent");
if (!server.includes("response.writeHead(301")) failures.push("statut 301 absent");
if (factory.includes('writePage("pno-cno", hubPage())')) failures.push("le generateur recree encore le hub duplique");
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
