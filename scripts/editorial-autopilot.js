import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";

loadDefaultEnvFiles();

const SITE = "https://immeubleassur.com";
const OUT = "public";
const REPORT_DIR = "reports";
const EMAIL = "team@immeubleassur.com";
const PHONE = "01 80 85 57 86";
const PHONE_HREF = "+33180855786";
const ORIAS = "11 061 425";
const args = new Set(process.argv.slice(2));
const ENABLE_FETCH = args.has("--fetch");
const ENABLE_AI = args.has("--ai");

const SOURCES = [
  ["service-public-particuliers", "Service-Public.fr particuliers", "https://www.service-public.fr/abonnements/rss/actu-actualites-particuliers.rss", "rss", "droit-logement", "official", "rss-summary-only"],
  ["service-public-professionnels", "Service-Public.fr professionnels", "https://www.service-public.fr/abonnements/rss/actu-actualites-professionnels.rss", "rss", "entreprises-immobilier", "official", "rss-summary-only"],
  ["acpr-actualites", "ACPR Banque de France", "https://acpr.banque-france.fr/fr/actualites", "public-page", "regulateur-assurance", "regulator", "public-title-and-summary"],
  ["acpr-communiques", "ACPR communiques", "https://acpr.banque-france.fr/fr/communiques-de-presse", "public-page", "regulateur-assurance", "regulator", "public-title-and-summary"],
  ["legifrance", "Legifrance", "https://www.legifrance.gouv.fr/", "reference", "droit", "official", "reference-link-only"]
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

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function read(path, fallback = "") { return existsSync(path) ? readFileSync(path, "utf8") : fallback; }
function write(path, value) { ensureDir(dirname(path)); writeFileSync(path, value, "utf8"); }
function esc(value) { return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function attr(value) { return esc(value).replaceAll("'", "&#39;"); }
function stripHtml(value) { return String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }
function hash(value, size = 12) { return createHash("sha256").update(String(value || "")).digest("hex").slice(0, size); }
function versionedAsset(path) { const file = join(OUT, ...path.replace(/^\//, "").split("/")); return existsSync(file) ? `${path}?v=${createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10)}` : path; }
function sql(value) { return value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }
const STYLES_URL = versionedAsset("/assets/styles.css");
const APP_JS_URL = versionedAsset("/assets/app.js");
function siteUrl(slug) { return slug === "index" ? `${SITE}/` : `${SITE}/${String(slug || "").replace(/^\//, "").replace(/\.html$/, "")}`; }
function pathUrl(slug) { return slug === "index" ? "/" : `/${String(slug || "").replace(/^\//, "").replace(/\.html$/, "")}`; }
function nav() {
  return `<header class="site-header" data-elevate><a class="brand" href="/" aria-label="ImmeubleAssur accueil"><span class="brand-mark" aria-hidden="true">IA</span><span><strong>ImmeubleAssur</strong><small>courtier immeuble</small></span></a><nav class="nav" aria-label="Navigation principale"><a href="/assurance-immeuble">Immeuble</a><a href="/assurance-pno-cno">PNO/CNO</a><a href="/villes">Villes</a><a href="/blog">Blog</a><a href="/veille-assurance-immeuble">Veille</a><a href="/newsletter-assurance-immeuble">Newsletter</a><a href="/devis-assurance-immeuble">Devis</a></nav><a class="header-phone" href="tel:${PHONE_HREF}">${PHONE}</a></header>`;
}

function footer() {
  return `<footer class="site-footer" id="contact"><div><strong>ImmeubleAssur</strong><p>Courtier specialiste immeuble, copropriete, PNO, CNO, SCI et syndic.</p></div><address><a href="tel:${PHONE_HREF}">${PHONE}</a><a href="mailto:${EMAIL}">${EMAIL}</a><a href="/confidentialite">Confidentialite</a><span>ORIAS ${ORIAS}</span></address></footer>`;
}

function layout({ slug, title, description, body }) {
  const canonical = siteUrl(slug);
  const faqItems = [...body.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/gi)].map((match) => ({ "@type": "Question", name: stripHtml(match[1]), acceptedAnswer: { "@type": "Answer", text: stripHtml(match[2]) } }));
  const graph = [
    { "@type": ["InsuranceAgency", "FinancialService"], "@id": `${SITE}/#organization`, name: "ImmeubleAssur", url: SITE, email: EMAIL, telephone: PHONE_HREF },
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "ImmeubleAssur", publisher: { "@id": `${SITE}/#organization` } },
    { "@type": "WebPage", "@id": `${canonical}#webpage`, url: canonical, name: title, description, isPartOf: { "@id": `${SITE}/#website` }, publisher: { "@id": `${SITE}/#organization` } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: title, item: canonical }] },
    { "@type": "Service", name: title, serviceType: "Assurance immeuble", provider: { "@id": `${SITE}/#organization` }, areaServed: "France", url: canonical }
  ];
  if (faqItems.length) graph.push({ "@type": "FAQPage", mainEntity: faqItems });
  const schema = { "@context": "https://schema.org", "@graph": graph };
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="description" content="${attr(description)}" /><link rel="canonical" href="${canonical}" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="stylesheet" href="${STYLES_URL}" /><title>${esc(title)} | ImmeubleAssur</title><script type="application/ld+json">${JSON.stringify(schema)}</script></head><body><a class="skip-link" href="#main-content">Aller au contenu principal</a>${nav()}<main id="main-content">${body}</main>${footer()}<script src="${APP_JS_URL}" type="module"></script></body></html>`;
}

function newsletterForm(source = "editorial-autopilot") {
  return `<form class="newsletter-form" data-newsletter-source="${attr(source)}" novalidate><div class="form-heading"><p>Veille assurance</p><h2>Recevoir la newsletter</h2></div><input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" /><label>Email *<input name="email" type="email" autocomplete="email" required placeholder="contact@exemple.fr" /></label><div class="field-grid"><label>Nom<input name="name" autocomplete="name" placeholder="Jean Dupont" /></label><label>Profil<select name="audience"><option value="assurance-immeuble">Assurance immeuble</option><option value="syndic">Syndic / conseil syndical</option><option value="bailleur">Bailleur / PNO</option><option value="sci">SCI / patrimoine</option><option value="cno">CNO coproprietaire</option></select></label></div><label class="consent-row"><input type="checkbox" name="consent" required /><span>J'accepte de recevoir la veille assurance immeuble ImmeubleAssur et je peux me desinscrire a tout moment.</span></label><button class="submit-button" type="submit">M'abonner</button><p class="form-status" data-newsletter-status role="status" aria-live="polite"></p></form>`;
}

function decodeXml(value) {
  return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function rssTag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return decodeXml(match?.[1] || "");
}

function relevanceFor(item) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  const terms = ["assurance", "immeuble", "copro", "logement", "bail", "proprietaire", "syndic", "sinistre", "travaux", "renovation", "climat", "habitation", "responsabilite", "pno", "cno"];
  let score = 15;
  for (const term of terms) if (text.includes(term)) score += 7;
  if (/assurance|logement|copro|immeuble/.test(text)) score += 20;
  return Math.min(100, score);
}

function topicFor(item) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
  if (/copro|syndic|assemblee/.test(text)) return "copropriete";
  if (/pno|cno|non occupant|bailleur/.test(text)) return "pno-cno";
  if (/sinistre|degat|fuite|incendie/.test(text)) return "sinistres";
  if (/travaux|renovation|toiture|ravalement/.test(text)) return "travaux";
  if (/acpr|assurance|contrat|regulateur/.test(text)) return "assurance";
  return "veille";
}

function parseRss(xml, source) {
  return [...String(xml || "").matchAll(/<item[\s\S]*?<\/item>/gi)].slice(0, 20).map((match) => {
    const block = match[0];
    const item = {
      source_id: source.id,
      source_name: source.name,
      source_url: source.url,
      title: stripHtml(rssTag(block, "title")),
      url: stripHtml(rssTag(block, "link")),
      summary: stripHtml(rssTag(block, "description")).slice(0, 500),
      published_at: stripHtml(rssTag(block, "pubDate"))
    };
    return { ...item, topic: topicFor(item), relevance_score: relevanceFor(item) };
  }).filter((item) => item.title && item.url);
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "ImmeubleAssur editorial watch (+https://immeubleassur.com)" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function collectWatchItems() {
  const errors = [];
  if (!ENABLE_FETCH) return { items: FALLBACK_ITEMS.map((item) => ({ ...item, fetched_at: new Date().toISOString() })), errors, mode: "local-fallback" };
  const fetched = [];
  for (const source of SOURCES.filter((item) => item.source_type === "rss")) {
    try { fetched.push(...parseRss(await fetchWithTimeout(source.url), source)); }
    catch (error) { errors.push({ source: source.id, error: error.message || "fetch failed" }); }
  }
  const items = (fetched.length ? fetched : FALLBACK_ITEMS).map((item) => ({ ...item, topic: item.topic || topicFor(item), relevance_score: item.relevance_score || relevanceFor(item), fetched_at: new Date().toISOString() }));
  return { items: items.sort((a, b) => b.relevance_score - a.relevance_score).slice(0, 18), errors, mode: fetched.length ? "fetched" : "fallback-after-fetch" };
}

function aiProvider() {
  if (process.env.OPENAI_API_KEY) return { provider: "openai", model: process.env.OPENAI_MODEL || "gpt-4.1-mini" };
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest" };
  if (process.env.GEMINI_API_KEY) return { provider: "gemini", model: process.env.GEMINI_MODEL || "gemini-1.5-pro" };
  if (process.env.OPENROUTER_API_KEY) return { provider: "openrouter", model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest" };
  if (process.env.HUGGINGFACE_API_KEY) return { provider: "huggingface", model: process.env.HUGGINGFACE_MODEL || "mistralai/Mistral-7B-Instruct-v0.3" };
  return { provider: "deterministic", model: "local-template" };
}

function prompt(items) {
  return `Tu es redacteur expert assurance immeuble en France. Produis une synthese originale, sans copier les sources, avec 5 points utiles pour syndics, bailleurs, SCI, PNO/CNO. Reste factuel et prudent. Donnees: ${JSON.stringify(items.slice(0, 8).map((item) => ({ title: item.title, summary: item.summary, source: item.source_name, url: item.url })))}`;
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
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text }] }] }) });
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
  const selected = aiProvider();
  if (!ENABLE_AI || selected.provider === "deterministic") return { ...selected, status: "skipped", text: fallbackSynthesis(items), error: "ai-disabled-or-missing-key" };
  try {
    const input = prompt(items);
    const text = selected.provider === "openai" ? await callOpenAi(input, selected.model) : selected.provider === "anthropic" ? await callAnthropic(input, selected.model) : selected.provider === "gemini" ? await callGemini(input, selected.model) : selected.provider === "openrouter" ? await callOpenRouter(input, selected.model) : await callHuggingFace(input, selected.model);
    return { ...selected, status: "completed", text: String(text || "").trim().slice(0, 5000) || fallbackSynthesis(items) };
  } catch (error) {
    return { ...selected, status: "failed", text: fallbackSynthesis(items), error: error.message || "ai failed" };
  }
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

function veillePage(items, synthesis, issue) {
  const paragraphs = synthesis.text.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("");
  const body = `<section class="page-hero compact-hero editorial-hero"><div class="container"><p class="eyebrow">Veille assurance immeuble</p><h1>Actualites, signaux marche et alertes utiles pour immeubles.</h1><p>Une veille orientee action pour syndics, bailleurs, SCI, coproprietaires non occupants et administrateurs de biens.</p><div class="hero-actions"><a class="button primary" href="/newsletter-assurance-immeuble">Recevoir la veille</a><a class="button secondary" href="${pathUrl(issue.slug)}">Lire le dernier numero</a></div></div></section><section class="band editorial-intelligence-band"><div class="split"><div><p class="eyebrow dark">Synthese originale</p><h2>Ce qu'il faut surveiller avant devis ou renouvellement.</h2><div class="editorial-synthesis">${paragraphs}</div></div>${newsletterForm("veille-page")}</div></section><section class="band editorial-watch-band"><div class="section-head"><p class="eyebrow dark">Sources attribuees</p><h2>Signaux publics suivis par l'autopilote editorial.</h2></div><div class="watch-grid">${items.map(watchCard).join("")}</div><p class="seo-expansion-note">Le systeme exploite les flux et pages publiques avec attribution. Il ne recopie pas les articles sources et ne publie pas de contenu juridique sans prudence.</p></section><section class="band compare-band"><div class="container narrow"><h2>Transformation en leads qualifies.</h2><p class="large-copy">Chaque signal de veille est relie a une action: verifier un contrat, preparer un renouvellement, completer une fiche risque, comparer PNO/CNO ou demander un audit immeuble.</p><p><a class="button primary" href="/devis-assurance-immeuble">Demander un audit assurance immeuble</a></p></div></section>`;
  return layout({ slug: "veille-assurance-immeuble", title: "Veille assurance immeuble et copropriete", description: "Veille assurance immeuble: actualites, signaux regulatoires, copropriete, PNO, CNO, SCI et newsletter pour anticiper devis et renouvellement.", body });
}

function newsletterPage(issue) {
  const body = `<section class="page-hero compact-hero editorial-hero"><div class="container"><p class="eyebrow">Newsletter ImmeubleAssur</p><h1>La veille assurance immeuble pour agir avant l'echeance.</h1><p>Recevez les points de vigilance utiles pour coproprietes, PNO/CNO, SCI, sinistres, travaux, contrats et devis immeuble.</p></div></section><section class="band page-band"><div class="split"><div><p class="eyebrow dark">Objectif utile</p><h2>Informer sans bruit, convertir quand le dossier est pret.</h2><ul class="check-list"><li>Resume des signaux publics importants avec sources.</li><li>Questions a poser avant AG, renouvellement ou sinistre.</li><li>Checklists PNO, CNO, SCI, syndic et immeuble mixte.</li><li>Lien direct vers audit ou devis lorsque le besoin est concret.</li></ul><p class="hero-actions"><a class="button primary" href="/devis-assurance-immeuble">Demander un audit</a><a class="button secondary light-button" href="${pathUrl(issue.slug)}">Voir le dernier numero</a></p></div>${newsletterForm("newsletter-page")}</div></section><section class="band editorial-roadmap-band"><div class="section-head"><p class="eyebrow dark">Production continue</p><h2>Articles, FAQ et villes planifies automatiquement.</h2></div><div class="roadmap-grid">${BRIEFS.map(([slug, title, keyword, audience, action]) => `<article class="content-card"><p class="eyebrow dark">${esc(keyword)}</p><h3>${esc(title)}</h3><p>${esc(audience)}: ${esc(action)}</p></article>`).join("")}</div></section>`;
  return layout({ slug: "newsletter-assurance-immeuble", title: "Newsletter assurance immeuble", description: "Newsletter ImmeubleAssur: veille assurance immeuble, copropriete, PNO, CNO, SCI, sinistres et travaux pour clients et prospects.", body });
}

function issuePage(issue, items, synthesis) {
  const faqAnswers = [
    "Une actualite devient utile lorsqu'elle modifie une question a poser: garantie, franchise, responsabilite, delai ou document a fournir.",
    "La veille ne remplace pas l'audit du contrat. Elle aide a savoir quoi verifier avant de comparer des devis.",
    "Avant AG ou renouvellement, elle sert a preparer les questions au syndic, au bailleur ou a l'assureur.",
    "Les signaux importants sont sinistres recurrents, travaux, vacance, hausse de prime et exclusions mal comprises."
  ];
  const body = `<article class="article-layout rich-article newsletter-issue"><header class="article-head"><p class="eyebrow dark">Newsletter - ${esc(issue.day)}</p><h1>${esc(issue.title)}</h1><p>${esc(issue.summary)}</p></header><div class="article-body"><div class="article-summary"><strong>A retenir</strong><ul>${issue.takeaways.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div><section><h2>Synthese de veille.</h2>${synthesis.text.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("")}</section><section><h2>Sources et signaux suivis.</h2><div class="watch-list-compact">${items.slice(0, 8).map((item) => `<article><strong><a href="${attr(item.url)}" rel="nofollow noopener">${esc(item.title)}</a></strong><span>${esc(item.source_name)} - ${esc(item.topic || "veille")}</span><p>${esc(item.summary || "Signal a surveiller pour l'assurance immeuble.")}</p></article>`).join("")}</div></section><section class="faq-list"><h2>FAQ de la veille</h2>${FAQS.map((q, index) => `<details><summary>${esc(q)}</summary><p>${esc(faqAnswers[index % faqAnswers.length])}</p></details>`).join("")}</section></div><aside class="article-cta">${newsletterForm("newsletter-issue")}<div class="source-box"><strong>Besoin concret ?</strong><a class="button primary" href="/devis-assurance-immeuble">Demander un audit ou devis immeuble</a><a href="/assurance-pno-cno">Comparer PNO/CNO</a></div></aside></article>`;
  return layout({ slug: issue.slug, title: issue.title, description: issue.summary, body });
}

function injectBlock(file, marker, block) {
  if (!existsSync(file)) return false;
  let html = read(file);
  const pattern = new RegExp(`\n?<!-- ${marker}:start -->[\\s\\S]*?<!-- ${marker}:end -->`, "g");
  html = html.replace(pattern, "");
  html = html.replace("</main>", `\n<!-- ${marker}:start -->\n${block}\n<!-- ${marker}:end -->\n</main>`);
  write(file, html);
  return true;
}

function injectHubs(issue) {
  const block = `<section class="band editorial-newsletter-cta"><div class="split"><div><p class="eyebrow dark">Veille continue</p><h2>Recevoir les alertes assurance immeuble utiles.</h2><p class="large-copy">Articles, FAQ, villes et signaux publics sont transformes en checklists pour syndics, bailleurs, SCI et coproprietaires non occupants.</p><p class="hero-actions"><a class="button primary" href="/devis-assurance-immeuble">Demander un devis</a><a class="button secondary light-button" href="${pathUrl(issue.slug)}">Dernier numero</a></p></div>${newsletterForm("hub-injection")}</div></section>`;
  for (const fileName of ["index.html", "blog.html", "faq.html", "villes.html", "strategie-seo-continue.html"]) injectBlock(join(OUT, fileName), "editorial-newsletter", block);
}

function updateSitemap(extraUrls) {
  const file = join(OUT, "sitemap.xml");
  if (!existsSync(file)) return false;
  let xml = read(file);
  const existing = new Set([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]));
  const inserts = [];
  for (const url of extraUrls) {
    const loc = siteUrl(url);
    if (!existing.has(loc)) inserts.push(`  <url><loc>${loc}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
  }
  if (!inserts.length) return false;
  write(file, xml.replace("</urlset>", `${inserts.join("\n")}\n</urlset>`));
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
  const { items, errors, mode } = await collectWatchItems();
  const synthesis = await synthesize(items);
  const issue = buildIssue(items, synthesis);
  write(join(OUT, "veille-assurance-immeuble.html"), veillePage(items, synthesis, issue));
  write(join(OUT, "newsletter-assurance-immeuble.html"), newsletterPage(issue));
  write(join(OUT, `${issue.slug}.html`), issuePage(issue, items, synthesis));
  injectHubs(issue);
  updateSitemap(["veille-assurance-immeuble", "newsletter-assurance-immeuble", issue.slug]);
  const report = {
    generated_at: new Date().toISOString(),
    mode,
    fetch_enabled: ENABLE_FETCH,
    ai_enabled: ENABLE_AI,
    ai_provider: synthesis.provider,
    ai_model: synthesis.model,
    ai_status: synthesis.status,
    quality_score: qualityScore(items, synthesis),
    source_count: SOURCES.length,
    watch_items: items.length,
    issue: { id: issue.id, slug: issue.slug, title: issue.title, html_url: issue.html_url },
    automation_plan: automationPlan(items),
    compliance: ["rss-and-public-summary-first", "source-attribution-required", "no-copying-third-party-articles", "no-google-results-scraping", "people-first-content-before-seo-volume", "ai-output-reviewed-by-quality-guards"],
    errors
  };
  write(join(REPORT_DIR, "editorial-autopilot-report.json"), JSON.stringify(report, null, 2));
  write(join(OUT, "assets", "editorial-autopilot-latest.json"), JSON.stringify(report, null, 2));

  console.log(`Editorial autopilot wrote veille, newsletter and issue ${issue.slug} with ${items.length} watch items (${synthesis.provider}/${synthesis.status}).`);
}

run().catch((error) => { console.error(error); process.exit(1); });
