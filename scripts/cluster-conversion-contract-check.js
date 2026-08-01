import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REPORT_DIR = "reports";
const PUBLIC_ASSET_DIR = join("public", "assets");
const REPORT_PATH = join(REPORT_DIR, "cluster-conversion-contract-report.json");
const ASSET_PATH = join(PUBLIC_ASSET_DIR, "cluster-conversion-contract-latest.json");

const clusterRequirements = {
  "local": { min_score: 94, min_pages: 80, min_money_pages: 80 },
  "pno-cno": { min_score: 95, min_pages: 15, min_money_pages: 13 },
  "sinistre-resilie": { min_score: 81, min_pages: 14, min_money_pages: 7 },
  "prix-tarif": { min_score: 80, min_pages: 9, min_money_pages: 5 },
  "devis-courtier": { min_score: 77, min_pages: 16, min_money_pages: 7 },
  "sci-bailleur": { min_score: 76, min_pages: 12, min_money_pages: 4 },
  "local-commercial": { min_score: 76, min_pages: 6, min_money_pages: 0 },
  "copropriete-syndic": { min_score: 75, min_pages: 16, min_money_pages: 1 },
  "travaux": { min_score: 69, min_pages: 3, min_money_pages: 0 },
  "newsletter-veille": { min_score: 60, min_pages: 7, min_money_pages: 0 }
};

const requiredBridgeClusters = [
  "copropriete-syndic",
  "sci-bailleur",
  "sinistre-resilie",
  "devis-courtier",
  "local-commercial",
  "prix-tarif",
  "newsletter-veille",
  "travaux"
];

const intentMinimums = {
  travaux: 10,
  veille: 5,
  "local-commercial": 8,
  prix: 10,
  sinistre: 30,
  copropriete: 30,
  sci: 15,
  immeuble: 150,
  pno: 8,
  cno: 80
};

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(path, label, issues) {
  if (!existsSync(path)) {
    issues.push({ severity: "high", source: label, rule: "missing-report", message: `${path} absent.` });
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    issues.push({ severity: "high", source: label, rule: "invalid-json", message: `${path} illisible: ${error.message}` });
    return null;
  }
}

function issue(issues, severity, source, rule, message, detail = {}) {
  issues.push({ severity, source, rule, message, ...detail });
}

function clusterMap(report) {
  return new Map((report?.cluster_coverage || []).map((row) => [row.cluster, row]));
}

function bridgeTargetMap(report) {
  return new Map((report?.cluster_targets || []).map((row) => [row.cluster, Number(row.count || 0)]));
}

const issues = [];
const conversion = readJson(join(REPORT_DIR, "conversion-intelligence-report.json"), "conversion-intelligence", issues);
const bridge = readJson(join(PUBLIC_ASSET_DIR, "cluster-conversion-bridge-latest.json"), "cluster-conversion-bridge", issues);
const intent = readJson(join(PUBLIC_ASSET_DIR, "lead-intent-routing-latest.json"), "lead-intent-routing", issues);

const clusters = clusterMap(conversion);
const clusterRows = [];
for (const [cluster, requirement] of Object.entries(clusterRequirements)) {
  const row = clusters.get(cluster);
  if (!row) {
    issue(issues, "high", cluster, "missing-cluster", "Cluster absent du rapport de conversion.");
    continue;
  }
  const score = Number(row.average_score || 0);
  const pages = Number(row.pages || 0);
  const moneyPages = Number(row.money_pages || 0);
  clusterRows.push({ cluster, score, pages, money_pages: moneyPages, ...requirement });
  if (score < requirement.min_score) issue(issues, "high", cluster, "cluster-score", `Score ${score} < seuil ${requirement.min_score}.`, { score, min_score: requirement.min_score });
  if (pages < requirement.min_pages) issue(issues, "high", cluster, "cluster-pages", `Pages ${pages} < seuil ${requirement.min_pages}.`, { pages, min_pages: requirement.min_pages });
  if (moneyPages < requirement.min_money_pages) issue(issues, "high", cluster, "cluster-money-pages", `Pages money ${moneyPages} < seuil ${requirement.min_money_pages}.`, { money_pages: moneyPages, min_money_pages: requirement.min_money_pages });
}

if (conversion) {
  const weakMoneyCount = Array.isArray(conversion.weak_money_pages) ? conversion.weak_money_pages.length : 0;
  if (Number(conversion.average_money_score || 0) < 95) issue(issues, "high", "conversion-intelligence", "average-money-score", `Score money moyen ${conversion.average_money_score} < 95.`);
  if (Number(conversion.average_conversion_score || 0) < 85) issue(issues, "medium", "conversion-intelligence", "average-conversion-score", `Score conversion moyen ${conversion.average_conversion_score} < 85.`);
  if (weakMoneyCount > 0) issue(issues, "high", "conversion-intelligence", "weak-money-pages", `${weakMoneyCount} page(s) money sous le seuil.`);
}

const bridgeTargets = bridgeTargetMap(bridge);
if (bridge) {
  if (bridge.status !== "passed") issue(issues, "high", "cluster-conversion-bridge", "bridge-status", `Statut ${bridge.status}.`);
  if (Number(bridge.active_bridges || 0) < 50) issue(issues, "high", "cluster-conversion-bridge", "active-bridges", `Ponts actifs ${bridge.active_bridges || 0} < 50.`);
  for (const cluster of requiredBridgeClusters) {
    const count = bridgeTargets.get(cluster) || 0;
    if (count < 1) issue(issues, "high", cluster, "missing-bridge-target", "Aucun pont de conversion actif pour ce cluster.");
  }
}

const intentCounts = intent?.intent_link_counts || {};
if (intent) {
  if (intent.status !== "passed") issue(issues, "high", "lead-intent-routing", "intent-status", `Statut ${intent.status}.`);
  for (const [name, minimum] of Object.entries(intentMinimums)) {
    const count = Number(intentCounts[name] || 0);
    if (count < minimum) issue(issues, "high", `intent:${name}`, "intent-link-count", `Liens intent ${count} < seuil ${minimum}.`, { count, minimum });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  status: issues.some((item) => item.severity === "high") ? "failed" : "passed",
  average_conversion_score: conversion?.average_conversion_score || 0,
  average_money_score: conversion?.average_money_score || 0,
  weak_money_pages: Array.isArray(conversion?.weak_money_pages) ? conversion.weak_money_pages.length : 0,
  cluster_requirements: clusterRows.sort((a, b) => b.min_money_pages - a.min_money_pages || b.min_score - a.min_score),
  bridge_status: bridge?.status || "missing",
  active_bridges: Number(bridge?.active_bridges || 0),
  bridge_clusters: requiredBridgeClusters.map((cluster) => ({ cluster, count: bridgeTargets.get(cluster) || 0 })),
  intent_minimums: Object.entries(intentMinimums).map(([name, minimum]) => ({ intent: name, count: Number(intentCounts[name] || 0), minimum })),
  issue_count: issues.length,
  issues,
  safeguards: [
    "visible-conversion-paths",
    "cluster-score-regression-gate",
    "money-pages-no-weak-page",
    "intent-link-minimums",
    "bridge-clusters-covered",
    "no-hidden-seo-text"
  ]
};

writeJson(REPORT_PATH, report);
writeJson(ASSET_PATH, report);

if (report.status !== "passed") {
  console.error(`Cluster conversion contract failed: ${issues.length} issue(s).`);
  for (const item of issues.slice(0, 16)) console.error(`${item.source}: ${item.rule} - ${item.message}`);
  process.exit(1);
}

console.log(`Cluster conversion contract passed: money=${report.average_money_score}, active bridges=${report.active_bridges}, intents=${report.intent_minimums.length}.`);
