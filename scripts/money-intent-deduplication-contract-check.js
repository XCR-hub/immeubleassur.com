import { readFileSync } from "node:fs";

const targets = ["index.html", "assurance-immeuble.html", "devis-assurance-immeuble.html", "prix-assurance-immeuble.html", "comparateur-assurance-immeuble.html", "blog.html", "faq.html", "faq/assurance-immeuble.html"];
const failures = [];
for (const file of targets) {
  const html = readFileSync(`public/${file}`, "utf8");
  const starts = html.match(/<!-- money-intent-cluster:start -->/g)?.length || 0;
  const ends = html.match(/<!-- money-intent-cluster:end -->/g)?.length || 0;
  if (starts !== 1 || ends !== 1) failures.push(`${file}: start=${starts}, end=${ends}`);
}
if (failures.length) {
  console.error(`Money intent deduplication failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`Money intent deduplication passed (${targets.length} pages).`);