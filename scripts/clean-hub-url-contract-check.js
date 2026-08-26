import fs from "node:fs";

const redirects = [
  ["/blog.html", "/blog"],
  ["/faq.html", "/faq"],
  ["/guides.html", "/guides"]
];
const failures = [];
for (const file of ["scripts/local-static-server.js", "scripts/local-production-server.js"]) {
  const source = fs.readFileSync(file, "utf8");
  for (const [legacy, clean] of redirects) {
    if (!source.includes(`["${legacy}", "${clean}"]`)) failures.push(`${file}: redirection ${legacy} absente`);
  }
  if (!source.includes("`${permanentLocation}${requestTarget.search}`")) failures.push(`${file}: parametres non preserves`);
  if (!source.includes("response.writeHead(301")) failures.push(`${file}: statut 301 absent`);
}
if (failures.length) {
  console.error(`Clean hub URL contract failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Clean hub URL contract passed.");
