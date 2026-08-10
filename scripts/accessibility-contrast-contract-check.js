import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => channel(Number.parseInt(value.slice(offset, offset + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith(".html") ? [path] : [];
  });
}

const styles = readFileSync("public/assets/styles.css", "utf8");
const pages = htmlFiles("public");
const pageText = pages.map((path) => readFileSync(path, "utf8"));
const gold = styles.match(/--gold-dark:\s*(#[a-f0-9]{6})/i)?.[1] || "";
const requiredBrandLabel = 'aria-label="IA ImmeubleAssur courtier immeuble - accueil"';
const checks = [
  ["gold-token-present", Boolean(gold)],
  ["gold-contrast-white", contrast(gold, "#ffffff") >= 4.5],
  ["gold-contrast-soft-teal", contrast(gold, "#f0fdfa") >= 4.5],
  ["gold-contrast-soft-gray", contrast(gold, "#f8fafc") >= 4.5],
  ["diagnostic-list-has-explicit-dark-background", /\.diagnostic-next li\s*\{[\s\S]*?color:\s*#edf7f5;[\s\S]*?background-color:\s*#123d42;/i.test(styles)],
  ["legacy-brand-label-removed", pageText.every((html) => !html.includes('aria-label="ImmeubleAssur accueil"'))],
  ["all-branded-pages-have-complete-name", pageText.filter((html) => html.includes('class="brand"')).every((html) => html.includes(requiredBrandLabel))],
  ["homepage-css-is-versioned", /styles\.css\?v=[a-f0-9]{10}/.test(pageText.find((html) => /<link rel="canonical" href="https:\/\/immeubleassur\.com\/"/.test(html)) || "")]
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Accessibility contrast contract: ${failed.length ? "failed" : "passed"} (${checks.length - failed.length}/${checks.length}), pages=${pages.length}, gold=${gold}.`);
if (failed.length) { console.error(failed.join(", ")); process.exitCode = 1; }