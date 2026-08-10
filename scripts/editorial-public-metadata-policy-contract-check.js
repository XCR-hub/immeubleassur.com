import { sanitizePublicWatchItems } from "./editorial-public-metadata-policy.js";

const now = new Date("2026-08-10T12:00:00.000Z");
const items = [
  { source_id: "official", source_name: "Autorite", title: "Mesure applicable en 2027", url: "https://example.test/news", topic: "reglementation", relevance_score: 90, published_at: "30 janvier 2027", summary: "must never be public" },
  { source_id: "official", source_name: "Autorite", title: "Actualite du jour", url: "https://example.test/today", topic: "assurance", relevance_score: 80, published_at: "10 aout 2026", summary: "must never be public" }
];
const sanitized = sanitizePublicWatchItems(items, now);
const checks = [
  ["future-event-date-not-exposed-as-publication-date", sanitized[0].published_at === ""],
  ["current-publication-date-preserved", sanitized[1].published_at === "10 aout 2026"],
  ["useful-future-regulatory-signal-preserved", sanitized[0].title === items[0].title && sanitized[0].url === items[0].url],
  ["source-summary-stripped", sanitized.every((item) => !Object.hasOwn(item, "summary"))],
  ["input-not-mutated", items[0].published_at === "30 janvier 2027"]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (missing.length) {
  console.error(`Editorial public metadata policy failed: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`Editorial public metadata policy passed: ${checks.length}/${checks.length}.`);