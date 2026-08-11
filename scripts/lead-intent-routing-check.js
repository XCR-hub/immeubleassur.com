import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const REPORT_DIR = "reports";
const PUBLIC_ASSET = "public/assets/lead-intent-routing-latest.json";

const requiredIntents = ["travaux", "veille", "local-commercial", "prix", "sinistre", "copropriete", "sci", "immeuble", "pno", "cno"];
const moneyIntents = ["travaux", "veille", "local-commercial", "prix", "sinistre"];

function read(file) {
  return readFileSync(file, "utf8");
}

function listHtml(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return listHtml(file);
    return extname(entry.name) === ".html" ? [file] : [];
  });
}

function missingSnippets(file, snippets) {
  const source = read(file);
  return snippets.filter((snippet) => !source.includes(snippet)).map((snippet) => ({ file, snippet }));
}

const snippetChecks = [
  {
    file: "public/assets/app.js",
    snippets: [
      "normalizeLeadIntent",
      "queryLeadIntent",
      "currentLeadIntent",
      "leadSourceFromAttribution",
      "lead_intent_prefill",
      "conversionFormSource",
      "form_source",
      "source_path",
      "landing_path",
      "travaux: \"dommages-ouvrage\"",
      "\"local-commercial\": \"multirisque-immeuble\"",
      "sinistre: \"audit-contrat\"",
      "quoteFastTrackIntent"
    ]
  },
  {
    file: "functions/api/leads.js",
    snippets: [
      "payload.intent || payload.utm?.intent",
      "intention SEO qualifiee",
      "Chemin source",
      "intent: record.intent",
      "form_source: record.form_source",
      "source_path: record.source_path"
    ]
  },
  {
    file: "functions/api/events.js",
    snippets: ["\"lead_intent_prefill\"", "ia_lead_intent_prefill", "form_source: clean(payload.form_source, 80)"]
  },
  {
    file: "functions/_shared/ga4.js",
    snippets: ["lead_intent", "source_path", "landing_path"]
  },
  {
    file: "public/recherches-assurance-immeuble.html",
    snippets: ['href="#devis-hub"', 'id="devis-hub"', 'id="lead-form"', 'data-conversion-source="recherches-hub"', "Email facultatif", 'name="phone"', 'name="consent"']
  },
  {
    file: "scripts/money-intent-factory.js",
    snippets: ['href="#devis-hub"', 'id="devis-hub"', "Aucune interpretation juridique IA publiee automatiquement"]
  },
  {
    file: "public/devis-assurance-immeuble.html",
    snippets: ['id="lead-form"', '<select name="need">', 'data-quote-priority-contact', 'data-track="quote-priority-phone"', 'href="tel:+33180855786"']
  }
];

const missing = snippetChecks.flatMap((check) => missingSnippets(check.file, check.snippets));
const htmlFiles = listHtml("public");
const intentCounts = Object.fromEntries(requiredIntents.map((intent) => [intent, 0]));

for (const file of htmlFiles) {
  const source = read(file);
  for (const intent of requiredIntents) {
    const pattern = new RegExp(`[?&]intent=${intent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[\"'&#?]|$)`, "g");
    const matches = source.match(pattern);
    if (matches) intentCounts[intent] += matches.length;
  }
}

let bridge = null;
if (existsSync("public/assets/cluster-conversion-bridge-latest.json")) {
  bridge = JSON.parse(read("public/assets/cluster-conversion-bridge-latest.json"));
}

const missingRequiredIntentLinks = requiredIntents.filter((intent) => intentCounts[intent] === 0);
const missingMoneyIntentLinks = moneyIntents.filter((intent) => intentCounts[intent] === 0);
const bridgeHealthy = Boolean(bridge && bridge.status === "passed" && Number(bridge.active_bridges || 0) > 0);
const status = missing.length || missingRequiredIntentLinks.length || missingMoneyIntentLinks.length || !bridgeHealthy ? "failed" : "passed";

const report = {
  generated_at: new Date().toISOString(),
  status,
  checked_files: snippetChecks.map((check) => check.file),
  required_intents: requiredIntents,
  money_intents: moneyIntents,
  intent_link_counts: intentCounts,
  missing_required_intent_links: missingRequiredIntentLinks,
  missing_money_intent_links: missingMoneyIntentLinks,
  bridge_status: bridge ? bridge.status : "missing",
  active_bridges: bridge ? bridge.active_bridges || 0 : 0,
  missing,
  safeguards: [
    "query intent prefills form",
    "lead payload persists intent/source_path/form_source",
    "GA4 receives lead_intent",
    "visible bridge links remain present"
  ]
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync("public/assets", { recursive: true });
writeFileSync(join(REPORT_DIR, "lead-intent-routing-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(PUBLIC_ASSET, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (status !== "passed") {
  const reasons = [];
  if (missing.length) reasons.push(`missing snippets: ${missing.map((item) => `${item.file}:${item.snippet}`).join(", ")}`);
  if (missingRequiredIntentLinks.length) reasons.push(`missing required intent links: ${missingRequiredIntentLinks.join(", ")}`);
  if (missingMoneyIntentLinks.length) reasons.push(`missing money intent links: ${missingMoneyIntentLinks.join(", ")}`);
  if (!bridgeHealthy) reasons.push(`bridge unhealthy: ${report.bridge_status}`);
  console.error(`Lead intent routing failed: ${reasons.join("; ")}`);
  process.exit(1);
}

console.log(`Lead intent routing passed for ${requiredIntents.length} intents, ${bridge.active_bridges} bridge(s), ${htmlFiles.length} HTML page(s).`);
