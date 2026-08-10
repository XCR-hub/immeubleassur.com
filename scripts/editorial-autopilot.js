import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadDefaultEnvFiles } from "./local-env.js";
import { sanitizePublicWatchItems } from "./editorial-public-metadata-policy.js";
import { findEquivalentPendingDraft, sourceSetFingerprint } from "./editorial-draft-dedupe-policy.js";

loadDefaultEnvFiles();

const SITE = "https://immeubleassur.com";
const OUT = process.env.LOCAL_EDITORIAL_OUTPUT_ROOT || "public";
const RUNTIME_ONLY = process.env.LOCAL_RUNTIME_ONLY === "1";
const ASSET_DIR = process.env.LOCAL_RUNTIME_ASSETS_ROOT ? join(process.env.LOCAL_RUNTIME_ASSETS_ROOT, "assets") : join(OUT, "assets");
const REPORT_DIR = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const EMAIL = "team@immeubleassur.com";
const PHONE = "01 80 85 57 86";
const PHONE_HREF = "+33180855786";
const ORIAS = "11 061 425";
const args = new Set(process.argv.slice(2));
const ENABLE_FETCH = args.has("--fetch");
const ENABLE_AI = args.has("--ai");

const SOURCES = [
  ["service-public-particuliers", "Service-Public.fr particuliers", "https://www.service-public.fr/abonnements/rss/actu-actualites-particuliers.rss", "rss", "droit-logement", "official", "rss-summary-only"],
  ["service-public-professionnels", "Entreprendre.Service-Public.fr", "https://www.service-public.gouv.fr/abonnements/rss/actu-actu-pro.rss", "rss", "entreprises-immobilier", "official", "rss-summary-only"],
  ["acpr-actualites", "ACPR Banque de France", "https://acpr.banque-france.fr/fr/actualites", "public-page", "regulateur-assurance", "regulator", "public-title-and-summary"],
  ["acpr-communiques", "ACPR communiques", "https://acpr.banque-france.fr/fr/communiques-de-presse", "public-page", "regulateur-assurance", "regulator", "public-title-and-summary"],
  ["anil-actualites", "ANIL", "https://www.anil.org/actualites-evenements/", "public-page", "logement-copropriete", "official", "public-title-and-summary"],
  ["adil57-syndic-actualites", "ADIL 57 - copropriete et syndic", "https://www.anil.org/adil-57/toutes-nos-actualites/", "public-page", "syndic-copropriete", "official", "public-title-and-summary"],
  ["france-assureurs-actualites", "France Assureurs", "https://www.franceassureurs.fr/actualites", "public-page", "marche-assurance", "industry", "public-title-and-summary"],
  ["legifrance", "Legifrance", "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028779136/", "reference", "droit", "official", "reference-metadata-only"]
].map(([id, name, url, source_type, category, authority, crawl_policy]) => ({ id, name, url, source_type, category, authority, crawl_policy }));

const FALLBACK_ITEMS = [
  ["service-public-particuliers", "Service-Public.fr particuliers", "https://www.service-public.fr/", "Logement, copropriete et demarches: verifier les obligations avant travaux ou sinistre", "https://www.service-public.fr/particuliers/vosdroits/N19808", "Point de veille a transformer en checklist: documents, responsabilites et delais utiles pour syndics, bailleurs et coproprietaires.", "copropriete", 82],
  ["acpr-actualites", "ACPR Banque de France", "https://acpr.banque-france.fr/fr/actualites", "Veille assurance: rester attentif aux communications du regulateur", "https://acpr.banque-france.fr/fr/actualites", "Les communications du regulateur peuvent signaler des points de vigilance sur distribution, information client, contrats et pratiques du marche assurance.", "regulateur", 78],
  ["legifrance", "Legifrance", "https://www.legifrance.gouv.fr/", "Copropriete: suivre les textes applicables avant de publier un conseil juridique", "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028779136/", "Toute page sur l'obligation d'assurance copropriete doit rester prudente et renvoyer vers les textes publics lorsque le sujet est juridique.", "droit", 75]
].map(([source_id, source_name, source_url, title, url, summary, topic, relevance_score]) => ({ source_id, source_name, source_url, title, url, summary, topic, relevance_score }));

const BRIEFS = [
  ["assurance-immeuble-newsletter-syndic", "Newsletter syndic: surveiller les echeances et sinistres immeuble", "newsletter syndic assurance immeuble", "syndics professionnels et benevoles", "Transformer la veille en rappel actionnable avant AG ou echeance."],
  ["assurance-cno-coproprietaire-checklist", "CNO coproprietaire: checklist avant demande de devis", "assurance CNO coproprietaire", "coproprietaires non occupants", "Lister occupation du lot, contrat immeuble, assurance occupant et responsabilites."],
  ["veille-assurance-immeuble-sinistre", "Veille assurance immeuble apres sinistre: quoi surveiller", "veille assurance immeuble sinistre", "bailleurs et syndics apres degat des eaux", "Relier actualite, delais, preuves et preparation du dossier assureur."],
  ["assurance-immeuble-climat-prevention", "Evenements climatiques: prevention et assurance immeuble", "assurance immeuble climat", "coproprietes et SCI", "Expliquer entretien, toiture, facade, franchises et documents de prevention."],
  ["assurance-pno-cno-news", "PNO/CNO: comment utiliser la veille pour eviter les trous de garantie", "PNO CNO garanties", "bailleurs et coproprietaires", "Comparer roles du contrat immeuble, du lot et de l'occupant."],
  ["assurance-sci-newsletter", "SCI immobiliere: organiser une veille assurance utile", "assurance SCI immeuble", "gerants de SCI", "Suivre contrats, echeances, sinistres et evolution du patrimoine."]
];

const FAQS = [
  "Comment savoir si une actualite change mon contrat d'assurance immeuble ?",
  "Faut-il resilier apres une hausse de prime ?",
  "Une veille juridique remplace-t-elle l'audit du contrat ?",
  "Comment utiliser la newsletter avant une assemblee generale ?",
  "Quels signaux indiquent qu'un immeuble devient plus difficile a assurer ?",
  "Quelle difference entre veille assurance, devis et audit de garanties ?"
];
const READINESS_COPY = {
  "veille-page": "Reliez le signal suivi aux pieces du contrat, a l echeance, aux sinistres et aux travaux prevus pour preparer un echange court avec un courtier.",
  "newsletter-page": "Avant de demander un rappel, rassemblez les pieces du contrat, l echeance, les sinistres et les travaux afin que la veille devienne une action utile.",
  "newsletter-issue": "Utilisez ce numero pour identifier la clause, la piece ou l echeance a verifier avant de solliciter une analyse de votre assurance immeuble."
};

function editorialFaqBlock(source = "editorial") {
  const answers = [
    "La veille signale un point a verifier; elle ne remplace ni la lecture du contrat ni une recommandation personnalisee.",
    "Preparez le contrat actuel, l appel de prime, l echeance, l historique des sinistres et les travaux ou changements d usage.",
    "Un audit permet de relier le signal a votre immeuble, vos responsabilites, vos franchises et les garanties reellement utiles.",
    "Vous pouvez demander une analyse depuis le formulaire devis; les informations sont traitees uniquement pour votre demande et selon votre consentement."
  ];
  return `<section class="band faq-band editorial-faq" aria-labelledby="editorial-faq-${attr(hash(source, 8))}"><div class="container narrow"><p class="eyebrow dark">Questions pratiques</p><h2 id="editorial-faq-${attr(hash(source, 8))}">FAQ veille et assurance immeuble</h2><div class="faq-list">${FAQS.slice(0, 4).map((question, index) => `<details><summary>${esc(question)}</summary><p>${esc(answers[index])}</p></details>`).join("")}</div></div></section>`;
}

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function read(path, fallback = "") { return existsSync(path) ? readFileSync(path, "utf8") : fallback; }
function write(path, value) { ensureDir(dirname(path)); writeFileSync(path, value, "utf8"); }
function esc(value) { return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function attr(value) { return esc(value).replaceAll("'", "&#39;"); }
function stripHtml(value) { return String(value || "").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }
function hash(value, size = 12) { return createHash("sha256").update(String(value || "")).digest("hex").slice(0, size); }
function todayIsoDate() { return new Date().toISOString().slice(0, 10); }
function versionedAsset(path) { const file = join(OUT, ...path.replace(/^\//, "").split("/")); return existsSync(file) ? `${path}?v=${createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10)}` : path; }
function sql(value) { return value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }
const STYLES_URL = versionedAsset("/assets/styles.css");
const APP_JS_URL = versionedAsset("/assets/app.js");
const EDITORIAL_LIVE_JS_URL = versionedAsset("/assets/editorial-live.js");
function siteUrl(slug) { return slug === "index" ? `${SITE}/` : `${SITE}/${String(slug || "").replace(/^\//, "").replace(/\.html$/, "")}`; }
function pathUrl(slug) { return slug === "index" ? "/" : `/${String(slug || "").replace(/^\//, "").replace(/\.html$/, "")}`; }
function nav() {
  return `<header class="site-header" data-elevate><a class="brand" href="/" aria-label="IA ImmeubleAssur courtier immeuble - accueil"><span class="brand-mark" aria-hidden="true">IA</span><span><strong>ImmeubleAssur</strong><small>courtier immeuble</small></span></a><nav class="nav" aria-label="Navigation principale"><a href="/assurance-immeuble">Immeuble</a><a href="/assurance-pno-cno">PNO/CNO</a><a href="/villes">Villes</a><a href="/blog">Blog</a><a href="/veille-assurance-immeuble">Veille</a><a href="/newsletter-assurance-immeuble">Newsletter</a><a href="/devis-assurance-immeuble">Devis</a></nav><a class="header-phone" href="tel:${PHONE_HREF}">${PHONE}</a></header>`;
}

function footer() {
  return `<footer class="site-footer" id="contact"><div><strong>ImmeubleAssur</strong><p>Courtier specialiste immeuble, copropriete, PNO, CNO, SCI et syndic.</p></div><address><a href="tel:${PHONE_HREF}">${PHONE}</a><a href="mailto:${EMAIL}">${EMAIL}</a><a href="/confidentialite">Confidentialite</a><span>ORIAS ${ORIAS}</span></address></footer>`;
}

function layout({ slug, title, description, body, publishedDate = "" }) {
  const canonical = siteUrl(slug);
  const faqItems = [...body.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/gi)].map((match) => ({ "@type": "Question", name: stripHtml(match[1]), acceptedAnswer: { "@type": "Answer", text: stripHtml(match[2]) } }));
  const graph = [
    { "@type": ["InsuranceAgency", "FinancialService"], "@id": `${SITE}/#organization`, name: "ImmeubleAssur", url: SITE, email: EMAIL, telephone: PHONE_HREF },
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "ImmeubleAssur", publisher: { "@id": `${SITE}/#organization` } },
    { "@type": "WebPage", "@id": `${canonical}#webpage`, url: canonical, name: title, description, isPartOf: { "@id": `${SITE}/#website` }, publisher: { "@id": `${SITE}/#organization` } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: title, item: canonical }] },
    publishedDate
      ? { "@type": "NewsArticle", "@id": `${canonical}#article`, headline: title, description, datePublished: publishedDate, dateModified: publishedDate, inLanguage: "fr-FR", mainEntityOfPage: { "@id": `${canonical}#webpage` }, author: { "@id": `${SITE}/#organization` }, publisher: { "@id": `${SITE}/#organization` } }
      : { "@type": "Service", name: title, serviceType: "Assurance immeuble", provider: { "@id": `${SITE}/#organization` }, areaServed: "France", url: canonical }
  ];
  if (faqItems.length) graph.push({ "@type": "FAQPage", mainEntity: faqItems });
  const schema = { "@context": "https://schema.org", "@graph": graph };
  const liveEditorialScript = slug === "veille-assurance-immeuble" ? `<script src="${EDITORIAL_LIVE_JS_URL}" type="module"></script>` : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="index, follow, max-image-preview:large" /><meta name="description" content="${attr(description)}" /><link rel="canonical" href="${canonical}" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="stylesheet" href="${STYLES_URL}" /><title>${esc(title)} | ImmeubleAssur</title><script type="application/ld+json">${JSON.stringify(schema)}</script></head><body><a class="skip-link" href="#main-content">Aller au contenu principal</a>${nav()}<main id="main-content">${body}</main>${footer()}<script src="${APP_JS_URL}" type="module"></script>${liveEditorialScript}</body></html>`;
}

function newsletterForm(source = "editorial-autopilot") {
  return `<form class="newsletter-form" data-newsletter-source="${attr(source)}" novalidate><div class="form-heading"><p>Veille assurance</p><h2>Recevoir la newsletter</h2></div><input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" /><label>Email *<input name="email" type="email" autocomplete="email" required placeholder="contact@exemple.fr" /></label><div class="field-grid"><label>Nom<input name="name" autocomplete="name" placeholder="Jean Dupont" /></label><label>Profil<select name="audience"><option value="assurance-immeuble">Assurance immeuble</option><option value="syndic">Syndic / conseil syndical</option><option value="bailleur">Bailleur / PNO</option><option value="sci">SCI / patrimoine</option><option value="cno">CNO coproprietaire</option></select></label></div><label class="consent-row"><input type="checkbox" name="consent" required /><span>J'accepte de recevoir la veille assurance immeuble ImmeubleAssur et je peux me desinscrire a tout moment.</span></label><button class="submit-button" type="submit">M'abonner</button><p class="form-status" data-newsletter-status role="status" aria-live="polite"></p></form>`;
}

function readinessBlock(source = "editorial") {
  const id = `editorial-readiness-${hash(source, 8)}`;
  return `<section class="band readiness-band" aria-labelledby="${attr(id)}"><div class="readiness-shell" data-readiness data-editorial-readiness="${attr(source)}"><div class="readiness-copy"><p class="eyebrow dark">Dossier pret assureur</p><h2 id="${attr(id)}">Verifier si le signal de veille justifie un audit.</h2><p class="large-copy">La veille devient actionnable quand elle est reliee aux pieces du contrat, a l'echeance, aux sinistres et aux travaux prevus. Ce mini-controle prepare un echange court avec un courtier.</p></div><div class="readiness-panel"><div class="readiness-meter"><span class="readiness-label">Niveau de preparation</span><strong class="readiness-score" data-readiness-score>20%</strong><div class="readiness-bar" aria-hidden="true"><span data-readiness-bar></span></div></div><div class="readiness-checks" aria-label="Pieces disponibles"><label><input type="checkbox" data-readiness-item data-points="22" data-label="contrat actuel" value="contrat-actuel">Contrat actuel</label><label><input type="checkbox" data-readiness-item data-points="20" data-label="appel de prime" value="appel-prime">Appel de prime</label><label><input type="checkbox" data-readiness-item data-points="18" data-label="sinistres 36 mois" value="sinistres-36-mois">Sinistres 36 mois</label><label><input type="checkbox" data-readiness-item data-points="16" data-label="nombre de lots" value="nombre-lots">Nombre de lots</label><label><input type="checkbox" data-readiness-item data-points="14" data-label="echeance" value="echeance">Echeance</label><label><input type="checkbox" data-readiness-item data-points="10" data-label="travaux prevus" value="travaux-prevus">Travaux prevus</label></div><p class="readiness-next" data-readiness-next>Selectionnez les pieces disponibles pour prioriser la prochaine action.</p><a class="button primary readiness-cta" data-track="editorial-readiness-devis" href="/devis-assurance-immeuble?intent=veille&readiness=1">Preparer mon audit</a></div></div></section>`;
}

function intentExitBlock(source = "editorial") {
  return `<section class="band compare-band lead-urgency-exits" data-editorial-intent-exits="${attr(source)}" aria-label="Parcours devis prioritaires"><div class="section-head"><p class="eyebrow dark">Besoin concret</p><h2>Transformer une alerte en demande exploitable.</h2></div><div class="card-grid"><article class="content-card"><h3><a href="/devis-assurance-immeuble?intent=sinistre">Audit sinistre ou resiliation</a></h3><p>Verifier contrat, franchises, exclusions et mesures correctives avant renouvellement.</p></article><article class="content-card"><h3><a href="/devis-assurance-immeuble?intent=travaux">Travaux et garanties</a></h3><p>Anticiper ravalement, toiture, dommages-ouvrage ou changement d'usage.</p></article><article class="content-card"><h3><a href="/devis-pno-cno?intent=pno-cno">Parcours PNO/CNO</a></h3><p>Qualifier un lot loue, vacant ou non occupant avec les bons documents.</p></article></div></section>${readinessBlock(source)}`;
}
function decodeXml(value) {
  return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const WINDOWS_1252_BYTES = new Map([[0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]]);
function mojibakeNoise(value) {
  return (String(value || "").match(/[\u00c3\u00c2]|\u00e2[\u0080-\u2122]|\ufffd/g) || []).length;
}
const MOJIBAKE_SEQUENCE = /(?:\u00c3[\u0080-\u00ff]|\u00c2[\u0080-\u00ff]|\u00e2[\u0080-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]{2})/g;
function decodeWindows1252Fragment(fragment) {
  const bytes = [];
  for (const character of fragment) {
    const code = character.codePointAt(0);
    if (code <= 0xff) bytes.push(code);
    else if (WINDOWS_1252_BYTES.has(code)) bytes.push(WINDOWS_1252_BYTES.get(code));
    else return fragment;
  }
  const repaired = Buffer.from(bytes).toString("utf8");
  return repaired.includes("\ufffd") ? fragment : repaired;
}
function repairMojibake(value) {
  let text = String(value || "");
  for (let pass = 0; pass < 3 && mojibakeNoise(text) > 0; pass += 1) {
    const repaired = text.replace(MOJIBAKE_SEQUENCE, decodeWindows1252Fragment);
    if (repaired === text || mojibakeNoise(repaired) >= mojibakeNoise(text)) break;
    text = repaired;
  }
  return text;
}
function normalizeEditorialText(value) {
  return repairMojibake(value).normalize("NFC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
}

function editorialTextQuality(item) {
  const corpus = `${item.title || ""} ${item.summary || ""} ${item.published_at || ""}`;
  const reasons = [];
  if (/\uFFFD|ï¿½/.test(corpus)) reasons.push("replacement-character");
  if (/Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â(?:€|™|œ|ž)/.test(corpus)) reasons.push("probable-mojibake");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(corpus)) reasons.push("control-character");
  if (/(?:srcset|sizes|loading|width|height|alt)\s*=|(?:png|jpe?g|webp)\s+\d+w|\/div>|&(?:gt|lt|quot|hellip);|components\/|@bdf_/i.test(corpus)) reasons.push("markup-artifact");
  if (normalizeEditorialText(item.title).length < 12) reasons.push("title-too-short");
  return { clean: reasons.length === 0, reasons };
}

function qualityFiltered(items) {
  const clean = items.map((item) => ({ ...item, title: normalizeEditorialText(item.title), summary: sanitizeEditorialSummary(item.summary), published_at: normalizeEditorialText(item.published_at) })).filter((item) => editorialTextQuality(item).clean);
  clean.rejected_text_quality = items.length - clean.length;
  return clean;
}
function editorialBusinessCoverage(items, now = new Date(), maximumAgeDays = 45) {
  const dimensions = [
    ["assurance", /assurance|assureur|contrat|garantie|prime|franchise/i],
    ["copropriete", /copropri|immeuble|logement|habitat/i],
    ["syndic", /syndic|conseil syndical|assembl[Ã©e]e g[Ã©e]n[Ã©e]rale/i],
    ["obligations", /obligation|obligatoire|r[Ã©e]glement|d[Ã©e]cret|loi|jurisprudence|responsabilit[Ã©e]/i]
  ];
  const dimensionsReport = Object.fromEntries(dimensions.map(([id, pattern]) => {
    const matching = items.filter((item) => pattern.test(`${item.title || ""} ${item.summary || ""}`));
    const fresh = matching.filter((item) => {
      const date = publicationDate(item.published_at);
      if (!date) return false;
      const age = now.getTime() - date.getTime();
      return age >= -6 * 3600000 && age <= maximumAgeDays * 86400000;
    });
    const latest = matching.map((item) => publicationDate(item.published_at)).filter(Boolean).sort((a, b) => b - a)[0] || null;
    return [id, { item_count: matching.length, source_count: new Set(matching.map((item) => item.source_id).filter(Boolean)).size, covered: matching.length > 0, fresh_item_count: fresh.length, fresh_source_count: new Set(fresh.map((item) => item.source_id).filter(Boolean)).size, fresh_covered: fresh.length > 0, latest_published_at: latest ? latest.toISOString() : null }];
  }));
  const missing = Object.entries(dimensionsReport).filter(([, value]) => !value.covered).map(([id]) => id);
  const missingFresh = Object.entries(dimensionsReport).filter(([, value]) => !value.fresh_covered).map(([id]) => id);
  return { status: missing.length ? "gaps-detected" : "covered", freshness_status: missingFresh.length ? "freshness-gaps-detected" : "fresh", maximum_age_days: maximumAgeDays, required_dimensions: dimensions.map(([id]) => id), missing_dimensions: missing, missing_fresh_dimensions: missingFresh, dimensions: dimensionsReport };
}
function rssTag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return decodeXml(match?.[1] || "");
}

function editorialSearchText(...values) {
  return normalizeEditorialText(values.join(" ")).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
function relevanceFor(item) {
  const text = editorialSearchText(item.title, item.summary);
  const terms = ["assurance", "assureur", "immeuble", "copro", "logement", "location", "locataire", "bail", "loyer", "proprietaire", "syndic", "sinistre", "incendie", "inondation", "catastrophe", "degat", "dommage", "travaux", "batiment", "renovation", "energie", "diagnostic", "climat", "habitation", "responsabilite", "obligation", "loi", "reglement", "pno", "cno"];
  let score = 15;
  for (const term of terms) if (text.includes(term)) score += 7;
  if (/assurance|logement|copro|immeuble|bail|loyer|syndic|sinistre|habitation/.test(text)) score += 20;
  return Math.min(100, score);
}
function topicFor(item) {
  const text = editorialSearchText(item.title, item.summary);
  if (/copro|syndic|assemblee/.test(text)) return "copropriete";
  if (/pno|cno|non occupant|bailleur/.test(text)) return "pno-cno";
  if (/sinistre|degat|fuite|incendie/.test(text)) return "sinistres";
  if (/travaux|renovation|toiture|ravalement/.test(text)) return "travaux";
  if (/acpr|assurance|contrat|regulateur/.test(text)) return "assurance";
  return "veille";
}

function parseRss(xml, source) {
  const itemLimit = source?.id === "service-public-professionnels" ? 100 : 20;
  const parsed = [...String(xml || "").matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, itemLimit).map((match) => {
    const block = match[0];
    const item = {
      source_id: source.id,
      source_name: source.name,
      source_url: source.url,
      title: stripHtml(rssTag(block, "title")),
      url: stripHtml(rssTag(block, "link")),
      summary: stripHtml(rssTag(block, "description")).slice(0, 500),
      published_at: stripHtml(rssTag(block, "pubDate") || rssTag(block, "dc:date"))
    };
    return { ...item, topic: topicFor(item), relevance_score: relevanceFor(item) };
  }).filter((item) => item.title && item.url);
  const relevant = parsed.filter((item) => sourceContentAllowed(source, item) && item.relevance_score >= 35);
  const filtered = qualityFiltered(relevant);
  filtered.raw_item_count = parsed.length;
  filtered.rejected_content_scope = parsed.length - relevant.length;
  return filtered;
}
function decodeHtml(value) {
  const named = {
    hellip: "\u2026",
    eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â",
    auml: "ä", ugrave: "ù", ucirc: "û", uuml: "ü", ocirc: "ô", ouml: "ö",
    icirc: "î", iuml: "ï", ccedil: "ç", oelig: "œ", laquo: "«", raquo: "»",
    rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—"
  };
  let decoded = decodeXml(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] || entity)
    .replace(/&(?:apos|#0*39);/gi, "'")
    .replace(/&(?:nbsp|#0*160);/gi, " ");
  if (/[ÃÂ]|â[€™œ]/.test(decoded)) {
    const repaired = Buffer.from(decoded, "latin1").toString("utf8");
    const noise = (text) => (text.match(/[ÃÂ�]|â[€™œ]/g) || []).length;
    if (noise(repaired) < noise(decoded)) decoded = repaired;
  }
  return decoded;
}

function trimPartialMarkup(value) {
  let fragment = String(value || "");
  const firstOpen = fragment.indexOf("<");
  const firstClose = fragment.indexOf(">");
  if (firstClose >= 0 && (firstOpen < 0 || firstClose < firstOpen)) fragment = fragment.slice(firstClose + 1);
  const lastOpen = fragment.lastIndexOf("<");
  const lastClose = fragment.lastIndexOf(">");
  if (lastOpen > lastClose) fragment = fragment.slice(0, lastOpen);
  return fragment;
}

function sanitizeEditorialSummary(value) {
  const summary = normalizeEditorialText(stripHtml(decodeHtml(trimPartialMarkup(value)))
    .replace(/(?:^|\s)[^\s,<>]+\.(?:png|jpe?g|webp)(?:\s+\d+w)?(?:\s*,\s*[^\s,<>]+\.(?:png|jpe?g|webp)\s+\d+w)*/gi, " ")
    .replace(/\b(?:srcset|sizes|loading|width|height|alt|class)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, " ")
    .replace(/\s*(?:\/div>|!--|-->|@bdf_[^\s]*|components\/[^\s]*)\s*/gi, " ")
    .replace(/\s+/g, " "));
  const navigationOnly = /^(?:(?:la |les |l['’])?(?:prévention au quotidien|démarches? en cas de sinistre|prévention pour les collectivités territoriales|assurance en pratique pour les particuliers|assurance pour les professionnels|assurance finance|assurance vie|risques climatiques et assurance|nos chiffres clés)\s*)+$/iu;
  if (navigationOnly.test(summary)) return "";
  return summary;
}
function sourceUrlAllowed(source, candidateUrl) {
  const path = String(candidateUrl?.pathname || "").replace(/\/+$/, "").toLowerCase();
  if (source?.id === "acpr-actualites") return /^\/fr\/actualites\/[^/]+$/.test(path);
  if (source?.id === "acpr-communiques") return /^\/fr\/communiques-de-presse\/[^/]+$/.test(path);
  if (source?.id === "adil57-syndic-actualites") return /^\/adil-57\/toutes-nos-actualites\/details\/[^/]+$/.test(path);
  if (source?.id === "france-assureurs-actualites") return /^\/actualites\/[^/]+$/.test(path);
  return true;
}
function sourceContentAllowed(source, item) {
  if (source?.id === "service-public-professionnels") {
    const text = editorialSearchText(item?.title, item?.summary);
    return /bail|loyer|local commercial|immeuble|immobilier|copro|logement|location|locataire|proprietaire|bailleur|diagnostic immobilier|batiment tertiaire/.test(text);
  }
  if (source?.id === "adil57-syndic-actualites") return /syndic|copropriete|conseil syndical|assemblee generale/.test(editorialSearchText(item?.title));
  if (source?.id !== "france-assureurs-actualites") return true;
  const title = editorialSearchText(item?.title);
  const propertySignal = /habitation|logement|immeuble|immobilier|copro|propri[ée]taire|location|sinistre|incendie|inondation|temp[êe]te|catastrophe|climat|d[ée]g[âa]t|dommage|responsabilit[ée]/i.test(title);
  if (/assurance vie|sant[ée]|pr[ée]voyance|retraite|emploi|m[ée]tier|cyber|num[ée]rique|v[ée]hicule|automobile|agricol/i.test(title) && !propertySignal) return false;
  return propertySignal || /assurance|assureur|risque|pr[ée]vention|garantie/i.test(title);
}
function parsePublicPage(html, source) {
  const cleaned = String(html || "").replace(/<(script|style|svg|nav|footer)\b[\s\S]*?<\/\1>/gi, " ");
  const sourceUrl = new URL(source.url);
  const candidates = [];
  let rejectedUrlScope = 0;
  let rejectedContentScope = 0;
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of cleaned.matchAll(anchorPattern)) {
    const accessibleTitle = source?.id === "france-assureurs-actualites" ? match[2].match(/<span\b[^>]*class\s*=\s*["'][^"']*screen-reader-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || "" : "";
    const title = stripHtml(decodeHtml(accessibleTitle || match[2])).replace(/\s+/g, " ").trim();
    if (title.length < 24 || title.length > 220 || /^(lire|voir|en savoir|accueil|actualit|suivant|pr.c.dent)/i.test(title)) continue;
    let url;
    try { url = new URL(decodeHtml(match[1]), source.url); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.hostname !== sourceUrl.hostname || url.href === sourceUrl.href) continue;
    if (!sourceUrlAllowed(source, url)) { rejectedUrlScope += 1; continue; }
    const contextStart = Math.max(0, (match.index || 0) - 350);
    const contextEnd = Math.min(cleaned.length, (match.index || 0) + match[0].length + 700);
    const context = sanitizeEditorialSummary(cleaned.slice(contextStart, contextEnd));
    const afterAnchor = sanitizeEditorialSummary(cleaned.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 700));
    const summary = (afterAnchor || context).replace(title, "").replace(/\s+/g, " ").trim().slice(0, 500);
    const item = {
      source_id: source.id,
      source_name: source.name,
      source_url: source.url,
      title,
      url: url.href,
      summary,
      published_at: (context.match(/\b(?:0?[1-9]|[12]\d|3[01])\s+(?:janvier|f.vrier|mars|avril|mai|juin|juillet|ao.t|septembre|octobre|novembre|d.cembre)\s+20\d{2}\b/i) || [""])[0]
    };
    const enriched = { ...item, topic: topicFor(item), relevance_score: relevanceFor(item) };
    if (!sourceContentAllowed(source, enriched)) { rejectedContentScope += 1; continue; }
    if (enriched.relevance_score >= 35) candidates.push(enriched);
  }
  const unique = new Map();
  for (const item of candidates) {
    const key = item.url.replace(/[?#].*$/, "").replace(/\/$/, "");
    if (!unique.has(key) || unique.get(key).summary.length < item.summary.length) unique.set(key, item);
  }
  const filtered = qualityFiltered([...unique.values()].sort((a, b) => b.relevance_score - a.relevance_score).slice(0, 12));
  filtered.rejected_url_scope = rejectedUrlScope;
  filtered.rejected_content_scope = rejectedContentScope;
  return filtered;
}

function verifyReferencePage(source, html) {
  const identifier = String(source?.url || "").match(/LEGIARTI\d+/)?.[0] || "";
  if (source?.id !== "legifrance") return { verified: false, identifier, title_marker: "", status_marker: "unknown" };
  const text = normalizeEditorialText(stripHtml(decodeHtml(html)));
  const articleMarker = /Article\s+9-1\b/i.test(text);
  const lawMarker = /Loi\s+n[^\s]*\s*65-557\s+du\s+10\s+juillet\s+1965/i.test(text);
  const inForceMarker = /Version\s+en\s+vigueur/i.test(text);
  return { verified: Boolean(identifier && articleMarker && lawMarker && inForceMarker), identifier, title_marker: articleMarker && lawMarker ? "article-9-1-loi-65-557" : "unknown", status_marker: inForceMarker ? "in-force" : "unknown" };
}

function referenceFetchStatus(error) {
  return [401, 403, 429].includes(Number(error?.http_status || 0)) ? "reference-access-restricted" : "reference-unverified";
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "ImmeubleAssur editorial watch (+https://immeubleassur.com)" } });
    if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.http_status = response.status; throw error; }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function collectWatchItems() {
  const errors = [];
  const sourceResults = [];
  if (!ENABLE_FETCH) return { items: FALLBACK_ITEMS.map((item) => ({ ...item, fetched_at: new Date().toISOString() })), errors, sourceResults, mode: "local-fallback" };
  const fetched = [];
  for (const source of SOURCES.filter((item) => item.source_type === "rss" || item.source_type === "public-page")) {
    try {
      const payload = await fetchWithTimeout(source.url);
      const parsed = source.source_type === "rss" ? parseRss(payload, source) : parsePublicPage(payload, source);
      fetched.push(...parsed);
      sourceResults.push({ source_id: source.id, source_name: source.name, source_type: source.source_type, authority: source.authority, status: parsed.length ? "healthy" : Number(parsed.raw_item_count || 0) > 0 ? "no-relevant-items" : "empty", item_count: parsed.length, raw_item_count: Number(parsed.raw_item_count || parsed.length || 0), text_quality_rejected_count: Number(parsed.rejected_text_quality || 0), url_scope_rejected_count: Number(parsed.rejected_url_scope || 0), content_scope_rejected_count: Number(parsed.rejected_content_scope || 0) });
    } catch (error) {
      errors.push({ source: source.id, error: error.message || "fetch failed" });
      sourceResults.push({ source_id: source.id, source_name: source.name, source_type: source.source_type, authority: source.authority, status: "failed", item_count: 0, error: error.message || "fetch failed" });
    }
  }
  for (const source of SOURCES.filter((item) => item.source_type === "reference")) {
    try {
      const payload = await fetchWithTimeout(source.url);
      const reference = verifyReferencePage(source, payload);
      sourceResults.push({ source_id: source.id, source_name: source.name, source_type: source.source_type, authority: source.authority, status: reference.verified ? "reference-verified" : "reference-unverified", item_count: 0, reference });
      if (!reference.verified) errors.push({ source: source.id, error: "reference metadata unverified" });
    } catch (error) {
      const status = referenceFetchStatus(error);
      if (status === "reference-unverified") errors.push({ source: source.id, error: error.message || "reference fetch failed" });
      sourceResults.push({ source_id: source.id, source_name: source.name, source_type: source.source_type, authority: source.authority, status, item_count: 0, reference: { verified: false, identifier: String(source.url || "").match(/LEGIARTI\d+/)?.[0] || "", title_marker: "unknown", status_marker: status === "reference-access-restricted" ? "access-restricted" : "unknown" }, ...(status === "reference-unverified" ? { error: error.message || "reference fetch failed" } : {}) });
    }
  }
  const deduplicated = new Map();
  for (const item of fetched.length ? fetched : FALLBACK_ITEMS) {
    const key = String(item.url || item.title || "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    const enriched = { ...item, topic: item.topic || topicFor(item), relevance_score: item.relevance_score || relevanceFor(item), fetched_at: new Date().toISOString() };
    if (!deduplicated.has(key) || deduplicated.get(key).relevance_score < enriched.relevance_score) deduplicated.set(key, enriched);
  }
  const items = [...deduplicated.values()];
  return { items: items.sort((a, b) => b.relevance_score - a.relevance_score).slice(0, 18), errors, sourceResults, mode: fetched.length ? "fetched" : "fallback-after-fetch" };
}

function aiProviders() {
  const providers = [];
  if (process.env.OPENAI_API_KEY) providers.push({ provider: "openai", model: process.env.OPENAI_MODEL || "gpt-4.1-mini" });
  if (process.env.ANTHROPIC_API_KEY) providers.push({ provider: "anthropic", model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest" });
  if (process.env.GEMINI_API_KEY) providers.push({ provider: "gemini", model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });
  if (process.env.OPENROUTER_API_KEY) providers.push({ provider: "openrouter", model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest" });
  if (process.env.HUGGINGFACE_API_KEY) providers.push({ provider: "huggingface", model: process.env.HUGGINGFACE_MODEL || "mistralai/Mistral-7B-Instruct-v0.3" });
  const explicit = String(process.env.EDITORIAL_AI_PROVIDER_PRIORITY || "").trim().toLowerCase();
  let previous = "";
  try {
    const report = JSON.parse(readFileSync(join(REPORT_DIR, "editorial-autopilot-report.json"), "utf8"));
    const age = Date.now() - Date.parse(report.generated_at || "");
    if (report.ai_status === "completed" && Number.isFinite(age) && age >= 0 && age <= 7 * 86400000) previous = String(report.ai_provider || "").toLowerCase();
  } catch {}
  const preferred = explicit || previous;
  return preferred ? providers.sort((a, b) => Number(b.provider === preferred) - Number(a.provider === preferred)) : providers;
}

function deterministicProvider() {
  return { provider: "deterministic", model: "local-template" };
}

async function callAiProvider(provider, text) {
  if (provider.provider === "openai") return callOpenAi(text, provider.model);
  if (provider.provider === "anthropic") return callAnthropic(text, provider.model);
  if (provider.provider === "gemini") return callGemini(text, provider.model);
  if (provider.provider === "openrouter") return callOpenRouter(text, provider.model);
  if (provider.provider === "huggingface") return callHuggingFace(text, provider.model);
  return "";
}
function prompt(items) {
  return `Tu prepares uniquement un brouillon interne soumis a validation humaine. Ne formule aucun conseil juridique ni interpretation definitive d une loi, d un decret, d une obligation ou d une decision. Produis une synthese originale, sans copier les sources, avec 5 points utiles pour syndics, bailleurs, SCI, PNO/CNO. Reste factuel, prudent et cite les sources a verifier. Donnees: ${JSON.stringify(items.slice(0, 8).map((item) => ({ title: item.title, summary: item.summary, source: item.source_name, url: item.url })))}`;
}

async function callOpenAi(text, model) {
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model, input: text, max_output_tokens: 900 }) });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
  const data = await response.json();
  return data.output_text || data.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n") || "";
}

async function callAnthropic(text, model) {
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, max_tokens: 900, system: "Redaction assurance immeuble utile, originale, prudente.", messages: [{ role: "user", content: text }] }) });
  if (!response.ok) throw new Error(`Anthropic HTTP ${response.status}`);
  const data = await response.json();
  return (data.content || []).map((part) => part.text || "").join("\n");
}

async function callGemini(text, model) {
  const apiKey = process.env.GEMINI_API_KEY;
  const request = (candidate) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text }] }] }) });
  let activeModel = model;
  let response = await request(activeModel);
  if (response.status === 404) {
    const catalog = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
    if (catalog.ok) {
      const data = await catalog.json();
      const available = (data.models || []).filter((item) => Array.isArray(item.supportedGenerationMethods) && item.supportedGenerationMethods.includes("generateContent")).map((item) => String(item.baseModelId || item.name || "").replace(/^models\//, ""));
      const preferred = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"];
      activeModel = preferred.find((candidate) => available.includes(candidate)) || available.find((candidate) => /gemini.*(flash|pro)/i.test(candidate)) || activeModel;
      if (activeModel !== model) response = await request(activeModel);
    }
  }
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
  const data = await response.json();
  return (data.candidates || []).flatMap((candidate) => candidate.content?.parts || []).map((part) => part.text || "").join("\n");
}

async function callOpenRouter(text, model) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "HTTP-Referer": SITE, "X-OpenRouter-Title": "ImmeubleAssur SEO Editorial Autopilot" }, body: JSON.stringify({ model, max_tokens: 900, messages: [{ role: "system", content: "Redaction assurance immeuble utile, originale, prudente." }, { role: "user", content: text }] }) });
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
  const data = await response.json();
  return data.choices?.map((choice) => choice.message?.content || "").join("\n") || "";
}

async function callHuggingFace(text, model) {
  const endpoint = `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`;
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}` }, body: JSON.stringify({ inputs: text, parameters: { max_new_tokens: 900, return_full_text: false } }) });
  if (!response.ok) throw new Error(`HuggingFace HTTP ${response.status}`);
  const data = await response.json();
  if (Array.isArray(data)) return data.map((item) => item.generated_text || item.summary_text || "").join("\n");
  return data.generated_text || data.summary_text || "";
}
function fallbackSynthesis(items) {
  const topics = [...new Set(items.map((item) => item.topic || "veille"))].slice(0, 5).join(", ") || "assurance immeuble";
  return [
    "La veille ImmeubleAssur transforme les signaux publics en actions de verification pour les immeubles, coproprietes, SCI et proprietaires non occupants.",
    `Themes prioritaires cette semaine: ${topics}.`,
    "Avant de demander un devis, relire le contrat actuel, l'appel de prime, les franchises, les exclusions et l'historique sinistres reste le meilleur levier de qualite.",
    "Les actualites ne remplacent pas un audit contractuel: elles servent a declencher les bonnes questions et a preparer les documents utiles.",
    "Le bon objectif n'est pas de publier du volume, mais de produire des pages qui aident vraiment un syndic, un bailleur ou une SCI a agir."
  ].join("\n\n");
}

async function synthesize(items) {
  const attempts = [];
  const providers = ENABLE_AI ? aiProviders() : [];
  const providerOrder = providers.map((item) => item.provider);
  if (!providers.length) return { ...deterministicProvider(), status: "skipped", text: fallbackSynthesis(items), error: "ai-disabled-or-missing-key", attempts, provider_order: providerOrder };
  const input = prompt(items);
  for (const provider of providers) {
    try {
      const raw = await callAiProvider(provider, input);
      const text = String(raw || "").trim().slice(0, 5000);
      if (text) {
        attempts.push({ provider: provider.provider, model: provider.model, status: "completed" });
        return { ...provider, status: "completed", text, attempts, provider_order: providerOrder };
      }
      attempts.push({ provider: provider.provider, model: provider.model, status: "empty" });
    } catch (error) {
      attempts.push({ provider: provider.provider, model: provider.model, status: "failed", error: error.message || "ai failed" });
    }
  }
  const fallback = deterministicProvider();
  return { ...fallback, status: "fallback-after-ai-errors", text: fallbackSynthesis(items), error: "all-ai-providers-failed", attempts, provider_order: providerOrder };
}
function watchCard(item) {
  return `<article class="watch-card"><p class="eyebrow dark">${esc(item.source_name)} - ${esc(item.topic || "veille")}</p><h3><a href="${attr(item.url)}" rel="nofollow noopener">${esc(item.title)}</a></h3><p>${esc(item.summary || "Signal public a transformer en question d'audit assurance immeuble.")}</p><span>Score pertinence ${Number(item.relevance_score || 0)}/100</span></article>`;
}

function buildIssue(items, synthesis) {
  const day = new Date().toISOString().slice(0, 10);
  const slug = `news/veille-assurance-immeuble-${day}`;
  const topTopic = items[0]?.topic || "assurance immeuble";
  const title = `Veille assurance immeuble: ${topTopic}, contrats et devis`;
  const sourceNames = [...new Set(items.map((item) => item.source_name).filter(Boolean))]
    .slice(0, 2)
    .join(" et ");
  const summary = `Veille assurance immeuble du ${day}: signaux ${topTopic}, points contrats et actions devis pour syndics, bailleurs, SCI et PNO/CNO${sourceNames ? `, avec sources ${sourceNames}` : ""}.`;
  const takeaways = [
    "Verifier les contrats avant echeance reste prioritaire.",
    "Relier chaque actualite a une piece de dossier ou une clause a relire.",
    "Produire du contenu utile, source et oriente decision plutot que du volume SEO.",
    "Transformer les questions PNO/CNO, SCI et copropriete en demandes de devis qualifiees."
  ];
  const plain_text = [title, "", summary, "", synthesis.text, "", "Actions:", ...takeaways.map((item) => `- ${item}`), "", siteUrl(slug)].join("\n");
  return { id: `issue-${hash(slug)}`, slug, title, subject: `ImmeubleAssur - veille assurance immeuble ${day}`, summary, day, takeaways, plain_text, html_url: pathUrl(slug), status: "published" };
}

function veillePage(items, publicSynthesis, issue) {
  const paragraphs = publicSynthesis.text.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("");
  const body = `<section class="page-hero compact-hero editorial-hero"><div class="container"><p class="eyebrow">Veille assurance immeuble</p><h1>Actualites, signaux marche et alertes utiles pour immeubles.</h1><p>Une veille orientee action pour syndics, bailleurs, SCI, coproprietaires non occupants et administrateurs de biens.</p><div class="hero-actions"><a class="button primary" href="/newsletter-assurance-immeuble">Recevoir la veille</a><a class="button secondary" href="${pathUrl(issue.slug)}">Lire le dernier numero</a></div></div></section><section class="band editorial-intelligence-band"><div class="split"><div><p class="eyebrow dark">Synthese originale</p><h2>Ce qu'il faut surveiller avant devis ou renouvellement.</h2><div class="editorial-synthesis">${paragraphs}</div></div>${newsletterForm("veille-page")}</div></section><section class="band editorial-watch-band"><div class="section-head"><p class="eyebrow dark">Sources attribuees</p><h2>Signaux publics suivis par l'autopilote editorial.</h2></div><div class="watch-grid">${items.map(watchCard).join("")}</div><p class="seo-expansion-note">Le systeme exploite les flux et pages publiques avec attribution. Il ne recopie pas les articles sources et ne publie pas de contenu juridique sans prudence.</p></section><section class="band compare-band"><div class="container narrow"><h2>Transformation en leads qualifies.</h2><p class="large-copy">Chaque signal de veille est relie a une action: verifier un contrat, preparer un renouvellement, completer une fiche risque, comparer PNO/CNO ou demander un audit immeuble.</p><p><a class="button primary" href="/devis-assurance-immeuble?intent=sinistre">Demander un audit assurance immeuble</a></p></div></section>${intentExitBlock("veille-page")}${editorialFaqBlock("veille-page")}`;
  return layout({ slug: "veille-assurance-immeuble", title: "Veille assurance immeuble et copropriete", description: "Veille assurance immeuble: actualites, signaux regulatoires, copropriete, PNO, CNO, SCI et newsletter pour anticiper devis et renouvellement.", body });
}

function newsletterPage(issue) {
  const body = `<section class="page-hero compact-hero editorial-hero"><div class="container"><p class="eyebrow">Newsletter ImmeubleAssur</p><h1>La veille assurance immeuble pour agir avant l'echeance.</h1><p>Recevez les points de vigilance utiles pour coproprietes, PNO/CNO, SCI, sinistres, travaux, contrats et devis immeuble.</p></div></section><section class="band page-band"><div class="split"><div><p class="eyebrow dark">Objectif utile</p><h2>Informer sans bruit, convertir quand le dossier est pret.</h2><ul class="check-list"><li>Resume des signaux publics importants avec sources.</li><li>Questions a poser avant AG, renouvellement ou sinistre.</li><li>Checklists PNO, CNO, SCI, syndic et immeuble mixte.</li><li>Lien direct vers audit ou devis lorsque le besoin est concret.</li></ul><p class="hero-actions"><a class="button primary" href="/devis-assurance-immeuble?intent=sinistre">Demander un audit</a><a class="button secondary light-button" href="/devis-pno-cno?intent=pno-cno">PNO/CNO</a><a class="button secondary light-button" href="${pathUrl(issue.slug)}">Voir le dernier numero</a></p></div>${newsletterForm("newsletter-page")}</div></section>${intentExitBlock("newsletter-page")}${editorialFaqBlock("newsletter-page")}<section class="band editorial-roadmap-band"><div class="section-head"><p class="eyebrow dark">Production continue</p><h2>Articles, FAQ et villes planifies automatiquement.</h2></div><div class="roadmap-grid">${BRIEFS.map(([slug, title, keyword, audience, action]) => `<article class="content-card"><p class="eyebrow dark">${esc(keyword)}</p><h3>${esc(title)}</h3><p>${esc(audience)}: ${esc(action)}</p></article>`).join("")}</div></section>`;
  return layout({ slug: "newsletter-assurance-immeuble", title: "Newsletter assurance immeuble", description: "Newsletter ImmeubleAssur: veille assurance immeuble, copropriete, PNO, CNO, SCI, sinistres et travaux pour clients et prospects.", body });
}

function issuePage(issue, items, publicSynthesis) {
  const faqAnswers = [
    "Une actualite devient utile lorsqu'elle modifie une question a poser: garantie, franchise, responsabilite, delai ou document a fournir.",
    "La veille ne remplace pas l'audit du contrat. Elle aide a savoir quoi verifier avant de comparer des devis.",
    "Avant AG ou renouvellement, elle sert a preparer les questions au syndic, au bailleur ou a l'assureur.",
    "Les signaux importants sont sinistres recurrents, travaux, vacance, hausse de prime et exclusions mal comprises."
  ];
  const body = `<article class="article-layout rich-article newsletter-issue"><header class="article-head"><p class="eyebrow dark">Newsletter - ${esc(issue.day)}</p><h1>${esc(issue.title)}</h1><p>${esc(issue.summary)}</p></header><div class="article-body"><div class="article-summary"><strong>A retenir</strong><ul>${issue.takeaways.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div><section><h2>Synthese de veille.</h2>${publicSynthesis.text.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("")}</section><section><h2>Sources et signaux suivis.</h2><div class="watch-list-compact">${items.slice(0, 8).map((item) => `<article><strong><a href="${attr(item.url)}" rel="nofollow noopener">${esc(item.title)}</a></strong><span>${esc(item.source_name)} - ${esc(item.topic || "veille")}</span><p>${esc(item.summary || "Signal a surveiller pour l'assurance immeuble.")}</p></article>`).join("")}</div></section><section class="faq-list"><h2>FAQ de la veille</h2>${FAQS.map((q, index) => `<details><summary>${esc(q)}</summary><p>${esc(faqAnswers[index % faqAnswers.length])}</p></details>`).join("")}</section></div><aside class="article-cta">${newsletterForm("newsletter-issue")}<div class="source-box"><strong>Besoin concret ?</strong><a class="button primary" href="/devis-assurance-immeuble?intent=sinistre">Demander un audit ou devis immeuble</a><a href="/devis-pno-cno?intent=pno-cno">Comparer PNO/CNO</a></div></aside></article>`;
  return layout({ slug: issue.slug, title: issue.title, description: issue.summary, body, publishedDate: issue.day });
}

function injectBlock(file, marker, block) {
  if (!existsSync(file)) return false;
  let html = read(file);
  const pattern = new RegExp(`\n?<!-- ${marker}:start -->[\\s\\S]*?<!-- ${marker}:end -->`, "g");
  html = html.replace(pattern, "");
  html = html.replace("</main>", `\n<!-- ${marker}:start -->\n${block}\n<!-- ${marker}:end -->\n</main>`);
  if (!RUNTIME_ONLY) write(file, html);
  return true;
}

function injectHubs(issue) {
  const block = `<section class="band editorial-newsletter-cta"><div class="split"><div><p class="eyebrow dark">Veille continue</p><h2>Recevoir les alertes assurance immeuble utiles.</h2><p class="large-copy">Articles, FAQ, villes et signaux publics sont transformes en checklists pour syndics, bailleurs, SCI et coproprietaires non occupants.</p><p class="hero-actions"><a class="button primary" href="/devis-assurance-immeuble?intent=sinistre">Demander un devis</a><a class="button secondary light-button" href="/devis-pno-cno?intent=pno-cno">PNO/CNO</a><a class="button secondary light-button" href="${pathUrl(issue.slug)}">Dernier numero</a></p></div>${newsletterForm("hub-injection")}</div></section>`;
  for (const fileName of ["index.html", "blog.html", "faq.html", "villes.html", "strategie-seo-continue.html"]) injectBlock(join(OUT, fileName), "editorial-newsletter", block);
}

function injectIssueBacklog() {
  const dir = join(OUT, "news");
  if (!existsSync(dir)) return 0;
  let changed = 0;
  for (const name of readdirSync(dir)) {
    if (/^veille-assurance-immeuble-\d{4}-\d{2}-\d{2}\.html$/.test(name)) {
      if (injectBlock(join(dir, name), "editorial-intent-exits", intentExitBlock("news-backfill"))) changed += 1;
    }
  }
  return changed;
}
function updateSitemap(extraUrls) {
  const file = join(OUT, "sitemap.xml");
  if (!existsSync(file)) return false;
  let xml = read(file);
  const existing = new Set([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]));
  const inserts = [];
  for (const url of extraUrls) {
    const loc = siteUrl(url);
    if (!existing.has(loc)) inserts.push(`  <url><loc>${loc}</loc><lastmod>${todayIsoDate()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
  }
  if (!inserts.length) return false;
  if (!RUNTIME_ONLY) write(file, xml.replace("</urlset>", `${inserts.join("\n")}\n</urlset>`));
  return true;
}

function qualityScore(items, synthesis) {
  let score = 40;
  if (items.length >= 3) score += 20;
  if (items.some((item) => item.source_name.includes("Service-Public"))) score += 10;
  if (items.some((item) => item.source_name.includes("ACPR"))) score += 10;
  if (synthesis.text.length >= 500) score += 10;
  if (synthesis.provider !== "deterministic" && synthesis.status === "completed") score += 10;
  return Math.min(100, score);
}

function validUtcCalendarDate(year, monthIndex, day) {
  const candidate = new Date(Date.UTC(year, monthIndex, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === monthIndex && candidate.getUTCDate() === day;
}

function publicationDate(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  const frenchMonths = { janvier: 0, fevrier: 1, "février": 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, "août": 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11, "décembre": 11 };
  const french = normalized.match(/\b(\d{1,2})\s+([a-zéû]+)\s+(20\d{2})\b/i);
  if (french && frenchMonths[french[2]] !== undefined) {
    const year = Number(french[3]);
    const month = frenchMonths[french[2]];
    const day = Number(french[1]);
    return validUtcCalendarDate(year, month, day) ? new Date(Date.UTC(year, month, day)) : null;
  }
  const isoDate = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:\D|$)/);
  if (isoDate && !validUtcCalendarDate(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function evaluatePublicationGate(items, sourceResults, now = new Date()) {
  const minimums = { healthy_sources: 3, authoritative_sources: 2, attributable_items: 3, fresh_dated_items: 1, maximum_age_days: 45, maximum_future_hours: 6 };
  const healthy = sourceResults.filter((source) => source.status === "healthy");
  const authoritative = healthy.filter((source) => source.authority === "official" || source.authority === "regulator");
  const healthyIds = new Set(healthy.map((source) => source.source_id));
  const attributable = items.filter((item) => healthyIds.has(item.source_id) && item.url && item.source_name);
  const authoritativeIds = new Set(authoritative.map((source) => source.source_id));
  const maximumAgeMs = minimums.maximum_age_days * 86400000;
  const maximumFutureMs = minimums.maximum_future_hours * 3600000;
  const freshDated = attributable.filter((item) => {
    if (!authoritativeIds.has(item.source_id) || /\u00c3|\u00c2|\u00e2\u20ac|\ufffd/.test(`${item.title || ""} ${item.published_at || ""}`)) return false;
    const date = publicationDate(item.published_at);
    if (!date) return false;
    const age = now.getTime() - date.getTime();
    return age >= -maximumFutureMs && age <= maximumAgeMs;
  });
  const futureDatedRejected = attributable.filter((item) => {
    if (!authoritativeIds.has(item.source_id)) return false;
    const date = publicationDate(item.published_at);
    return date && date.getTime() - now.getTime() > maximumFutureMs;
  });
  const reasons = [];
  if (!ENABLE_FETCH) reasons.push("network-fetch-disabled");
  if (healthy.length < minimums.healthy_sources) reasons.push("insufficient-healthy-sources");
  if (authoritative.length < minimums.authoritative_sources) reasons.push("insufficient-official-or-regulator-sources");
  if (attributable.length < minimums.attributable_items) reasons.push("insufficient-attributable-items");
  if (freshDated.length < minimums.fresh_dated_items) reasons.push("no-fresh-dated-official-evidence");
  return {
    ready: reasons.length === 0,
    decision: reasons.length ? "hold-last-valid-publication" : "publish-new-safe-edition",
    reasons,
    minimums,
    observed: { healthy_sources: healthy.length, authoritative_sources: authoritative.length, attributable_items: attributable.length, fresh_dated_items: freshDated.length, future_dated_rejected_items: futureDatedRejected.length, text_quality_rejected_items: sourceResults.reduce((sum, source) => sum + Number(source.text_quality_rejected_count || 0), 0) },
    fresh_evidence: freshDated.slice(0, 8).map((item) => ({ source_id: item.source_id, title: item.title, url: item.url, published_at: item.published_at }))
  };
}
function legalSensitivity(items, synthesis) {
  const corpus = [synthesis?.text || "", ...items.flatMap((item) => [item.title || "", item.summary || "", item.topic || ""])].join(" ").toLowerCase();
  const terms = ["loi", "decret", "arrete", "code civil", "code des assurances", "jurisprudence", "obligation", "obligatoire", "responsabilite", "reglementaire", "legifrance", "service-public"];
  const matched_terms = terms.filter((term) => corpus.includes(term));
  return { sensitive: matched_terms.length > 0, matched_terms, publication_gate: matched_terms.length ? "legal-human-approval" : "editorial-human-approval", human_review_required: true, allowed_publication: false, public_interpretation_allowed: false };
}

function contentDraftPacket(items, synthesis, legalReview) {
  const seed = String(synthesis.text || "").slice(0, 5000);
  const cities = ["Paris", "Lyon", "Marseille", "Bordeaux", "Lille", "Nantes", "Nice", "Toulouse", "Rennes", "Strasbourg", "Montpellier", "Grenoble"];
  return { marker: "editorial-multi-format-draft-packet-v1", generated_at: new Date().toISOString(), publication_status: "quarantined", human_review_required: true, no_auto_publish: true, allowed_publication: false, legal_review: legalReview, ai_provider: synthesis.provider, ai_model: synthesis.model, ai_status: synthesis.status, source_context: items.slice(0,12).map((item)=>({title:item.title,summary:item.summary,source_name:item.source_name,url:item.url,topic:item.topic})), drafts: [
    { type: "article", status: "draft_review", brief: "Article original assurance immeuble relie a une action devis.", seo_requirements: ["intention principale", "sources attribuees", "validation juridique humaine"], ai_seed: seed },
    { type: "faq", status: "draft_review", brief: "Questions et reponses prudentes et sourcables.", seo_requirements: ["questions reelles", "reponses sourcables", "date de mise a jour"], ai_seed: seed },
    ...cities.map((city)=>({ type: "city", city, status: "draft_review", brief: "Angle local assurance immeuble pour " + city + ".", seo_requirements: ["signal local verifiable", "contenu unique", "pas de doorway page"], ai_seed: seed }))
  ] };
  }

function automationPlan(items) {
  return {
    blog_briefs: BRIEFS.map(([slug, title, keyword, audience, action]) => ({ slug, title, keyword, audience, action, status: "planned" })),
    faq_questions: FAQS.map((question) => ({ question, status: "planned" })),
    city_news_angles: ["Paris", "Lyon", "Marseille", "Bordeaux", "Lille", "Nantes", "Nice", "Toulouse", "Rennes", "Strasbourg", "Montpellier", "Grenoble"].map((city) => ({ city, angle: `Veille locale assurance immeuble ${city}`, status: "planned" })),
    source_topics: [...new Set(items.map((item) => item.topic || "veille"))]
  };
}

async function run() {
  ensureDir(OUT);
  ensureDir(join(OUT, "news"));
  ensureDir(REPORT_DIR);
  const { items, errors, sourceResults, mode } = await collectWatchItems();
  const draftsRoot = join(REPORT_DIR, "editorial-drafts");
  const equivalentPendingDraft = findEquivalentPendingDraft(draftsRoot, items);
  const synthesis = equivalentPendingDraft
    ? { ...deterministicProvider(), status: "skipped-equivalent-pending-draft", text: fallbackSynthesis(items), error: "equivalent-pending-draft", attempts: [], provider_order: aiProviders().map((item) => item.provider) }
    : await synthesize(items);
  const aiRequiresReview = synthesis.provider !== "deterministic";
  const humanReviewPending = aiRequiresReview || Boolean(equivalentPendingDraft);
  const legalReview = legalSensitivity(items, synthesis);
  const publicSynthesis = aiRequiresReview
    ? { ...deterministicProvider(), status: "local-safe-public-fallback", text: fallbackSynthesis(items), attempts: synthesis.attempts || [] }
    : synthesis;
  const issue = buildIssue(items, publicSynthesis);
  const publicationGate = evaluatePublicationGate(items, sourceResults);
  const publicWriteEnabled = !RUNTIME_ONLY && publicationGate.ready;
  let issueBackfills = 0;
  if (publicWriteEnabled) {
    write(join(OUT, "veille-assurance-immeuble.html"), veillePage(items, publicSynthesis, issue));
    write(join(OUT, "newsletter-assurance-immeuble.html"), newsletterPage(issue));
    write(join(OUT, `${issue.slug}.html`), issuePage(issue, items, publicSynthesis));
    injectHubs(issue);
    issueBackfills = injectIssueBacklog();
    updateSitemap(["veille-assurance-immeuble", "newsletter-assurance-immeuble", issue.slug]);
  }
  const draftReviewPath = aiRequiresReview ? join(draftsRoot, issue.slug.replace(/\//g, "-") + ".json") : equivalentPendingDraft ? join(draftsRoot, equivalentPendingDraft.file) : "";
  const reportStatus = aiRequiresReview ? "draft_review" : equivalentPendingDraft ? "equivalent_draft_reused" : synthesis.status === "fallback-after-ai-errors" ? "fallback" : "completed";
  if (aiRequiresReview) write(draftReviewPath, JSON.stringify({ marker: "editorial-ai-draft-review-v1", generated_at: new Date().toISOString(), publication_status: "quarantined", human_review_required: true, no_auto_publish: true, allowed_publication: false, legal_review: legalReview, issue: { id: issue.id, slug: issue.slug, title: issue.title }, synthesis, source_items: items.slice(0, 18) }, null, 2));
  const draftPacket = aiRequiresReview ? contentDraftPacket(items, synthesis, legalReview) : null;
  const draftPacketPath = aiRequiresReview ? join(REPORT_DIR, "editorial-drafts", "multi-format-" + todayIsoDate() + ".json") : "";
  if (draftPacket) write(draftPacketPath, JSON.stringify(draftPacket, null, 2));
  const report = {
    generated_at: new Date().toISOString(),
    mode,
    status: reportStatus,
    fetch_enabled: ENABLE_FETCH,
    ai_enabled: ENABLE_AI,
    ai_provider: synthesis.provider,
    ai_model: synthesis.model,
    ai_status: synthesis.status,
    publication_status: RUNTIME_ONLY ? "runtime-preview-only" : !publicationGate.ready ? "held-insufficient-official-evidence" : humanReviewPending ? "safe-fallback-published-ai-quarantined" : "published",
    public_write_enabled: publicWriteEnabled,
    publication_gate: publicationGate,
    published_issue: publicWriteEnabled ? { id: issue.id, slug: issue.slug, title: issue.title, html_url: issue.html_url } : null,
    public_content_provider: publicSynthesis.provider,
    public_content_ai_generated: false,
    ai_draft_publication_status: humanReviewPending ? "quarantined" : "not-created",
    ai_draft_allowed_publication: false,
    legal_sensitive_draft: humanReviewPending && legalReview.sensitive,
    legal_review: humanReviewPending ? legalReview : null,
    human_review_required: humanReviewPending,
    no_auto_publish: humanReviewPending,
    equivalent_pending_draft_reused: Boolean(equivalentPendingDraft),
    equivalent_pending_draft_file: equivalentPendingDraft?.file || "",
    source_set_fingerprint: sourceSetFingerprint(items).slice(0, 20),
    draft_review_path: draftReviewPath,
    draft_packet_path: draftPacketPath,
    draft_packet_count: draftPacket?.drafts?.length || 0,
    ai_attempts: synthesis.attempts || [],
    ai_provider_order: synthesis.provider_order || [],
    quality_score: qualityScore(items, synthesis),
    source_count: SOURCES.length,
    reference_source_count: SOURCES.filter((source) => source.source_type === "reference").length,
    reference_sources: SOURCES.filter((source) => source.source_type === "reference").map(({ id, name, url, authority, crawl_policy }) => ({ id, name, url, authority, crawl_policy, status: "monitored-reference" })),
    monitored_source_count: sourceResults.length,
    fetchable_source_count: sourceResults.filter((source) => source.source_type !== "reference").length,
    reference_verified_count: sourceResults.filter((source) => source.status === "reference-verified").length,
    reference_unverified_count: sourceResults.filter((source) => source.status === "reference-unverified").length,
    reference_access_restricted_count: sourceResults.filter((source) => source.status === "reference-access-restricted").length,
    healthy_source_count: sourceResults.filter((source) => source.status === "healthy").length,
    empty_source_count: sourceResults.filter((source) => source.status === "empty").length,
    no_relevant_source_count: sourceResults.filter((source) => source.status === "no-relevant-items").length,
    failed_source_count: sourceResults.filter((source) => source.status === "failed").length,
    url_scope_rejected_count: sourceResults.reduce((sum, source) => sum + Number(source.url_scope_rejected_count || 0), 0),
    text_quality_rejected_count: sourceResults.reduce((sum, source) => sum + Number(source.text_quality_rejected_count || 0), 0),
    content_scope_rejected_count: sourceResults.reduce((sum, source) => sum + Number(source.content_scope_rejected_count || 0), 0),
    text_quality_status: sourceResults.some((source) => Number(source.text_quality_rejected_count || 0) > 0) ? "filtered" : "clean",
    minimum_healthy_sources: 3,
    collection_status: sourceResults.some((source) => source.status === "failed" || source.status === "reference-unverified") ? "degraded" : sourceResults.filter((source) => source.status === "healthy").length < 3 ? "partial" : "healthy",
    source_results: sourceResults,
    watch_items: items.length,
    source_item_counts: Object.fromEntries(SOURCES.map((source) => [source.id, items.filter((item) => item.source_id === source.id).length])),
    business_coverage: editorialBusinessCoverage(items),
    watch_preview: items.slice(0, 8).map(({ source_id, title, url, topic, relevance_score }) => ({ source_id, title, url, topic, relevance_score })),
    public_watch_items: items.slice(0, 18).map(({ source_id, source_name, title, url, summary, topic, relevance_score, published_at }) => ({ source_id, source_name, title, url, summary, topic, relevance_score, published_at })),
    candidate_issue: { id: issue.id, slug: issue.slug, title: issue.title, html_url: issue.html_url },
    issue: publicWriteEnabled ? { id: issue.id, slug: issue.slug, title: issue.title, html_url: issue.html_url } : null,
    issue_backfills: issueBackfills,
    automation_plan: automationPlan(items),
    compliance: ["rss-and-public-summary-first", "source-attribution-required", "no-copying-third-party-articles", "no-google-results-scraping", "people-first-content-before-seo-volume", "ai-output-held-for-human-review", "local-safe-public-fallback-when-ai-draft-pending", "article-faq-city-ai-seeds-held-for-human-review", "legal-sensitive-ai-drafts-quarantined", "equivalent-source-set-reuses-pending-draft", "public-content-provider-deterministic", "human-approval-required-before-ai-publication", "fresh-official-evidence-required", "last-valid-publication-preserved-on-source-failure", "unicode-nfc-normalized", "corrupted-source-text-excluded", "source-markup-artifacts-sanitized", "regulator-url-scope-filtered"],
    errors
  };
  const publicReport = {
    generated_at: report.generated_at,
    status: "safe-public-metadata",
    publication_status: report.publication_status,
    public_content_provider: report.public_content_provider,
    public_content_ai_generated: false,
    ai_draft_review_pending: report.human_review_required === true,
    legal_sensitive_draft_pending: report.legal_sensitive_draft === true,
    source_count: report.source_count,
    healthy_source_count: report.healthy_source_count,
    empty_source_count: report.empty_source_count,
    no_relevant_source_count: report.no_relevant_source_count,
    reference_verified_count: report.reference_verified_count,
    reference_unverified_count: report.reference_unverified_count,
    reference_access_restricted_count: report.reference_access_restricted_count,

    failed_source_count: report.failed_source_count,
    collection_status: report.collection_status,
    public_watch_items: sanitizePublicWatchItems(report.public_watch_items),
    safeguards: ["no-ai-draft-content", "no-internal-paths", "no-provider-errors", "no-source-summaries", "no-future-publication-dates", "deterministic-public-content-only"]
  };
  write(join(REPORT_DIR, "editorial-autopilot-report.json"), JSON.stringify(report, null, 2));
  write(join(ASSET_DIR, "editorial-autopilot-latest.json"), JSON.stringify(publicReport, null, 2));

  console.log(`Editorial autopilot ${publicWriteEnabled ? "published" : "held"} candidate ${issue.slug} with ${items.length} watch items (${synthesis.provider}/${synthesis.status}); gate=${publicationGate.decision}.`);
  console.log("Editorial collection " + report.collection_status + ": healthy=" + report.healthy_source_count + ", no-relevant=" + report.no_relevant_source_count + ", empty=" + report.empty_source_count + ", failed=" + report.failed_source_count + ".");
}

export { parseRss, parsePublicPage, verifyReferencePage, referenceFetchStatus, sourceUrlAllowed, sourceContentAllowed, repairMojibake, normalizeEditorialText, sanitizeEditorialSummary, editorialTextQuality, qualityFiltered, editorialBusinessCoverage, aiProviders, publicationDate, evaluatePublicationGate };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch((error) => { console.error(error); process.exit(1); });
}
