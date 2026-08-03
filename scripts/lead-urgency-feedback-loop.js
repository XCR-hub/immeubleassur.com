import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const PUBLIC_ASSET = "public/assets/lead-urgency-feedback-latest.json";
const SITE = "https://immeubleassur.com";

const ignoredSlugs = new Set(["admin", "mentions-legales", "confidentialite", "merci"]);

const intentRules = [
  {
    intent: "sinistre",
    level: "immediate",
    patterns: [/sinistre/, /degat/, /fuite/, /incendie/, /infiltration/, /resili/, /refus assureur/, /sans assurance/],
    expectedIntents: ["sinistre"],
    action: "Orienter vers un audit sinistre/resiliation avec rappel prioritaire."
  },
  {
    intent: "travaux",
    level: "this-month",
    patterns: [/travaux/, /chantier/, /dommages ouvrage/, /renovation/, /ravalement/, /toiture/],
    expectedIntents: ["travaux"],
    action: "Orienter vers la verification travaux et garanties dommages-ouvrage."
  },
  {
    intent: "local-commercial",
    level: "this-month",
    patterns: [/local commercial/, /immeuble mixte/, /commerce/, /restaurant/, /local professionnel/],
    expectedIntents: ["local-commercial"],
    action: "Orienter vers un parcours immeuble mixte ou local commercial."
  },
  {
    intent: "prix",
    level: "quote-ready",
    patterns: [/prix/, /tarif/, /cout/, /franchise/, /prime annuelle/, /comparateur/],
    expectedIntents: ["prix", "devis"],
    action: "Orienter vers un devis comparatif prix, franchises et garanties."
  },
  {
    intent: "pno-cno",
    level: "quote-ready",
    patterns: [/pno/, /cno/, /non occupant/, /coproprietaire non occupant/, /lot en copropriete/],
    expectedIntents: ["pno-cno", "pno", "cno"],
    action: "Orienter vers le parcours PNO/CNO avec pre-remplissage."
  }
];

const contractChecks = [
  {
    file: "public/assets/app.js",
    snippets: [
      "function leadUrgency",
      "lead_urgency_detected",
      "lead_urgency_reason",
      "data-value-urgency",
      "quoteFastTrackIntent"
    ]
  },
  {
    file: "functions/api/leads.js",
    snippets: [
      "function leadUrgency",
      "lead_urgency",
      "lead_urgency_reason",
      "Urgence:",
      "sla_hours"
    ]
  },
  {
    file: "functions/api/admin/leads.js",
    snippets: ["function leadUrgency", "urgency,", "sla_hours"]
  },
  {
    file: "functions/_shared/ga4.js",
    snippets: ["lead_urgency", "lead_urgency_reason"]
  },
  {
    file: "public/assets/admin.js",
    snippets: ["function urgencyLabel", "lead_urgency", "lead_urgency_reason"]
  }
];

function read(file) {
  return readFileSync(file, "utf8");
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(entry.name) === ".html" ? [file] : [];
  });
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slugFromFile(file) {
  const rel = relative(PUBLIC_DIR, file).replace(/\\/g, "/");
  if (rel === "index.html") return "index";
  return rel.replace(/\.html$/, "");
}

function pageUrl(slug) {
  return slug === "index" ? `${SITE}/` : `${SITE}/${slug}`;
}

function meta(html, pattern) {
  return stripHtml((html.match(pattern) || [])[1] || "");
}

function hasIntentLink(html, intent) {
  const escaped = intent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`href="[^"]*[?&]intent=${escaped}(?:["&#]|$)`, "i").test(html);
}

function detectIntents(source) {
  return intentRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(source)))
    .map((rule) => rule.intent);
}

function matchedRule(intent) {
  return intentRules.find((rule) => rule.intent === intent);
}

function auditPage(file) {
  const html = read(file);
  const slug = slugFromFile(file);
  const title = meta(html, /<title>([\s\S]*?)<\/title>/i);
  const description = meta(html, /<meta name="description" content="([^"]*)"/i);
  const noIndex = /<meta name="robots" content="[^"]*noindex/i.test(html);
  const h1 = meta(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const text = normalize(`${slug} ${title} ${description} ${h1}`);
  const intents = detectIntents(text);
  const expectedIntents = [...new Set(intents.flatMap((intent) => matchedRule(intent)?.expectedIntents || []))];
  const linkedIntents = expectedIntents.filter((intent) => hasIntentLink(html, intent));
  const hasLeadForm = html.includes('id="lead-form"');
  const hasPrimaryCta = /class="[^"]*\b(button primary|submit-button)\b/gi.test(html);
  const hasUrgencyCopy = /rappel|urgence|sinistre|resiliation|echeance|devis qualifie/i.test(stripHtml(html));
  const missingIntentLinks = expectedIntents.filter((intent) => !linkedIntents.includes(intent));
  const hasConversionRoute = hasLeadForm || linkedIntents.length > 0;
  return {
    slug,
    url: pageUrl(slug),
    noindex: noIndex,
    title,
    intents,
    expected_intents: expectedIntents,
    linked_intents: linkedIntents,
    has_lead_form: hasLeadForm,
    has_primary_cta: hasPrimaryCta,
    has_conversion_route: hasConversionRoute,
    has_urgency_copy: hasUrgencyCopy,
    missing_intent_links: missingIntentLinks,
    status: intents.length && (!hasConversionRoute || (!hasPrimaryCta && linkedIntents.length === 0)) ? "action-required" : "passed"
  };
}

function contractMissing() {
  return contractChecks.flatMap((check) => {
    const source = existsSync(check.file) ? read(check.file) : "";
    return check.snippets
      .filter((snippet) => !source.includes(snippet))
      .map((snippet) => ({ file: check.file, snippet }));
  });
}

function coverageByIntent(pages) {
  return intentRules.map((rule) => {
    const matchedPages = pages.filter((page) => page.intents.includes(rule.intent));
    const withLinks = matchedPages.filter((page) => page.linked_intents.some((intent) => rule.expectedIntents.includes(intent)));
    const withRoutes = matchedPages.filter((page) => page.has_conversion_route);
    return {
      intent: rule.intent,
      urgency_level: rule.level,
      pages: matchedPages.length,
      pages_with_intent_link: withLinks.length,
      pages_with_conversion_route: withRoutes.length,
      missing_pages: matchedPages.filter((page) => !withRoutes.includes(page)).slice(0, 12).map((page) => page.slug),
      action: rule.action
    };
  });
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(read(file));
  } catch {
    return fallback;
  }
}

const pages = walk(PUBLIC_DIR).map(auditPage).filter((page) => !ignoredSlugs.has(page.slug) && !page.noindex);
const urgentPages = pages.filter((page) => page.intents.length);
const missingCtaPages = urgentPages.filter((page) => page.status !== "passed");
const missingContracts = contractMissing();
const leadIntent = readJson("reports/lead-intent-routing-report.json", {});
const conversion = readJson("reports/conversion-intelligence-report.json", {});
const funnel = readJson("reports/local-conversion-funnel-report.json", {});
const coverage = coverageByIntent(pages);
const status = missingContracts.length || missingCtaPages.length || urgentPages.length < 20 ? "failed" : "passed";

const report = {
  generated_at: new Date().toISOString(),
  status,
  pages_checked: pages.length,
  urgent_pages: urgentPages.length,
  missing_cta_count: missingCtaPages.length,
  contract_missing_count: missingContracts.length,
  coverage_by_intent: coverage,
  weakest_pages: missingCtaPages.slice(0, 25).map((page) => ({
    slug: page.slug,
    url: page.url,
    intents: page.intents,
    missing_intent_links: page.missing_intent_links,
    has_lead_form: page.has_lead_form,
    has_primary_cta: page.has_primary_cta,
    has_urgency_copy: page.has_urgency_copy
  })),
  conversion_signals: {
    lead_intent_routing: leadIntent.status || "missing",
    lead_intent_active_bridges: leadIntent.active_bridges || 0,
    money_score: conversion.average_money_score || 0,
    funnel_leads_30d: funnel.summary?.leads_db || 0,
    funnel_form_starts_30d: funnel.summary?.form_starts || 0
  },
  missing_contracts: missingContracts,
  safeguards: [
    "visible CTAs only",
    "no hidden keyword stuffing",
    "no automated Google SERP scraping",
    "lead urgency measured from form, API and GA4 contract markers",
    "urgent SEO pages must keep intent links toward quote forms"
  ]
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });
writeFileSync(join(REPORT_DIR, "lead-urgency-feedback-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(PUBLIC_ASSET, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (status !== "passed") {
  const reasons = [];
  if (missingContracts.length) reasons.push(`${missingContracts.length} contrat(s) code manquant(s)`);
  if (missingCtaPages.length) reasons.push(`${missingCtaPages.length} page(s) urgente(s) sans lien intent complet`);
  if (urgentPages.length < 20) reasons.push(`${urgentPages.length} page(s) urgente(s), minimum attendu 20`);
  console.error(`Lead urgency feedback failed: ${reasons.join("; ")}`);
  process.exit(1);
}

console.log(`Lead urgency feedback passed: ${urgentPages.length} urgent page(s), ${missingCtaPages.length} missing CTA, ${missingContracts.length} missing contract.`);



