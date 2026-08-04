import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const SITE = "https://immeubleassur.com";
const generatedSeoBlockNames = [
  "seo-intent-differentiation",
  "seo-angle-differentiation",
  "seo-opportunity-expansion",
  "cluster-conversion-bridge",
  "internal-link-equity",
  "auto-seo-depth",
  "search-gap-booster",
  "editorial-intent-exits",
  "ux-diagnostic",
  "ux-readiness",
  "ux-conversion-momentum",
  "content-quality-support"
];
const generatedSeoBlockPatterns = generatedSeoBlockNames.map((name) => new RegExp(`<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->`, "gi"));

const ignoredSlugs = new Set(["admin", "mentions-legales", "confidentialite", "merci", "blog/index", "faq/index"]);
const stopwords = new Set("assurance assurances immeuble immeubles immeubleassur pour avec dans depuis cette votre vous nous notre nos vos des les une aux sur par qui que quoi dont plus moins prix devis contrat contrats garantie garanties syndic copropriete proprietaire proprietaires bailleur bailleurs courtier comparateur guide article faq formulaire demande audit page besoin risque risques faire etre sont vers entre sans aussi comme avant apres chaque peut doivent doivent actuel actuelle actuels dossier dossiers assureur assureurs travaux pieces piece franchises franchise prime primes exclusions exclusion echeance usage usages utiles utile information informations analyse analyses occupation responsabilite responsabilites parcours garanties garantie sinistre sinistres obtenir proposition propositions reponse reponses couvrir couvert couvertes declaration declarations clair claire comparable recherche approfondir construire point points fiche fiches methode priorite adresse documents choisir comparer".split(" "));
const auditGenericTerms = "plafond plafonds appel appels concerne concernent concernant consultation consultations manquante manquantes obligation obligations prevu prevus protegee protege proteger questions conseils conseil clarifier clarification lire lecture pieces piece justificatifs justificatif attendu attendus disponible disponibles utile utiles demander pourquoi quelles quel quels entretien locaux local syndics syndicaux syndicat protection juridique vacance accelerera action angle annuelle contenu simple sujet marche mission calendrier relances veille actualite actualites public publics service services particuliers professionnel professionnels heure heures jour jours ferie feries entrepreneur entrepreneurs annuel annuelle annee absence source sources rss signal signaux livret livrets date dates hiver octobre passage passages plusieurs regle regles verifier securite toussaint vacances acces assures autorisation autorisations cadre".split(" ");
for (const term of auditGenericTerms) stopwords.add(term);
for (const term of "aller dernier derniers derniere dernieres accelerent accelere accelerer batiment batiments cache caches changement changements changer chere cher chers temps toute toutes tous chaque relier relie reliee reliees proteger protege protegees utilement vraiment comment complet complete compte consiste contexte clauses comparables".split(" ")) stopwords.add(term);


const primaryByCluster = {
  "assurance-immeuble": ["assurance-immeuble", "multirisque-immeuble", "assurance-batiment-proprietaire", "audit-contrat-assurance-immeuble"],
  "pno-cno": ["pno-cno", "assurance-pno-cno", "devis-pno-cno", "assurance-cno", "assurance-pno"],
  "devis-courtier": ["devis-assurance-immeuble", "devis-assurance-immeuble-en-ligne", "courtier-assurance-immeuble", "comparateur-assurance-immeuble"],
  "prix-tarif": ["prix-assurance-immeuble", "tarif-assurance-immeuble", "blog/prix-assurance-immeuble-au-m2"],
  "copropriete-syndic": ["assurance-copropriete", "assurance-immeuble-syndic-benevole", "rc-syndic", "faq/copropriete"],
  "sinistre-resilie": ["gestion-sinistres-immeuble", "assurance-immeuble-sinistre", "assurance-immeuble-resilie"],
  "sci-bailleur": ["assurance-sci", "assurance-immeuble-de-rapport", "assurance-immeuble-monopropriete", "assurance-immeuble-locatif"],
  "local-commercial": ["assurance-local-commercial", "blog/local-commercial-vacant", "blog/immeuble-mixte-restaurant"],
  "travaux": ["dommages-ouvrage-immeuble", "faq/travaux", "blog/dommages-ouvrage-copropriete-travaux"],
  "newsletter-veille": ["veille-assurance-immeuble", "newsletter-assurance-immeuble", "blog"]
};

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(file) === ".html" ? [file] : [];
  });
}

function stripHtml(value) {
  let html = String(value || "");
  for (const pattern of generatedSeoBlockPatterns) html = html.replace(pattern, " ");
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
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

function readMeta(html, pattern) {
  return ((html.match(pattern) || [])[1] || "").trim();
}

function isNoIndex(html) {
  const robots = readMeta(html, /<meta name="robots" content="([^"]*)"/i).toLowerCase();
  return /(^|,\s*)noindex(\s*,|$)/.test(robots);
}

function cityFromSlug(slug) {
  if (!slug.startsWith("assurance-immeuble-")) return "";
  if (/assurance-immeuble-(locatif|de-rapport|monopropriete|resilie|sinistre|obligatoire|syndic-benevole|meuble-colocation)$/.test(slug)) return "";
  return slug.replace("assurance-immeuble-", "").replace(/-/g, " ");
}

function pageType(slug) {
  if (slug === "index") return "home";
  if (slug.startsWith("blog/")) return "blog";
  if (slug.startsWith("faq/") || slug === "faq") return "faq";
  if (slug.startsWith("news/")) return "news";
  if (cityFromSlug(slug)) return "city";
  if (/devis|contact|audit|comparateur|courtier/.test(slug)) return "lead";
  return "service";
}

function detectCluster(slug, title, h1) {
  const city = cityFromSlug(slug);
  if (city) return "local-city";
  const source = `${slug} ${title} ${h1}`;
  if (/newsletter|veille|^news\//i.test(source)) return "newsletter-veille";
  if (/pno|cno|non.?occupant|coproprietaire/i.test(source)) return "pno-cno";
  if (/sinistre|resilie|refus|degat|fuite|incendie|vandalisme/i.test(source)) return "sinistre-resilie";
  if (/prix|tarif|cout|combien|franchise/i.test(source)) return "prix-tarif";
  if (/copro|syndic|parties communes|conseil syndical|ag/i.test(source)) return "copropriete-syndic";
  if (/sci|bailleur|rapport|monopropriete|locatif|patrimoine/i.test(source)) return "sci-bailleur";
  if (/commerce|commercial|restaurant|mixte|local professionnel/i.test(source)) return "local-commercial";
  if (/travaux|toiture|ravalement|renovation|dommages ouvrage|chantier/i.test(source)) return "travaux";
  if (/devis|courtier|comparateur|demande/i.test(source)) return "devis-courtier";
  return "assurance-immeuble";
}

function tokensFor(text) {
  const counts = new Map();
  const tokens = normalizeText(text).split(" ").filter((token) => token.length >= 5 && !stopwords.has(token));
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function topTerms(counts, limit = 18) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

function weightedSimilarity(a, b) {
  const keys = new Set([...a.tokens.keys(), ...b.tokens.keys()]);
  let min = 0;
  let max = 0;
  for (const key of keys) {
    const av = a.tokens.get(key) || 0;
    const bv = b.tokens.get(key) || 0;
    min += Math.min(av, bv);
    max += Math.max(av, bv);
  }
  return max ? min / max : 0;
}

function titleOverlap(a, b) {
  const left = new Set(tokensFor(`${a.title} ${a.h1}`).keys());
  const right = new Set(tokensFor(`${b.title} ${b.h1}`).keys());
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function primaryRank(page) {
  const priorities = primaryByCluster[page.cluster] || [];
  const index = priorities.indexOf(page.slug);
  let score = index >= 0 ? 100 - index * 8 : 0;
  if (page.type === "lead") score += 12;
  if (page.type === "service") score += 8;
  if (page.type === "blog") score -= 4;
  if (page.type === "faq") score -= 6;
  if (page.hasLeadForm) score += 10;
  return score;
}

function recommendationFor(primary, secondary) {
  if (primary.slug === secondary.slug) return "Conserver le role actuel.";
  if (secondary.type === "blog" || secondary.type === "faq") return `Clarifier ${secondary.slug} comme support informationnel et renforcer le lien vers ${primary.slug}.`;
  if (secondary.type === "lead") return `Differencier l'intention formulaire de ${secondary.slug} et confirmer le renvoi vers ${primary.slug} quand le besoin est plus large.`;
  return `Renforcer l'angle unique de ${secondary.slug} et ajouter un lien contextuel vers ${primary.slug}.`;
}

function auditPage(file) {
  const html = readFileSync(file, "utf8");
  if (isNoIndex(html)) return null;
  const slug = slugFromFile(file);
  const text = stripHtml(html);
  const title = stripHtml(readMeta(html, /<title>(.*?)<\/title>/is));
  const h1 = stripHtml((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
  const description = readMeta(html, /<meta name="description" content="([^"]*)"/i);
  const type = pageType(slug);
  const cluster = detectCluster(slug, title, h1);
  const tokens = tokensFor(`${title} ${h1} ${description} ${text}`);
  return {
    slug,
    url: pageUrl(slug),
    type,
    cluster,
    city: cityFromSlug(slug),
    title,
    h1,
    description,
    words: text.split(/\s+/).filter(Boolean).length,
    hasLeadForm: html.includes('id="lead-form"'),
    top_terms: topTerms(tokens),
    tokens
  };
}

function clusterSummary(pages) {
  const buckets = new Map();
  for (const page of pages) {
    const bucket = buckets.get(page.cluster) || { cluster: page.cluster, pages: [], types: new Map(), primary: null };
    bucket.pages.push(page);
    bucket.types.set(page.type, (bucket.types.get(page.type) || 0) + 1);
    if (!bucket.primary || primaryRank(page) > primaryRank(bucket.primary)) bucket.primary = page;
    buckets.set(page.cluster, bucket);
  }
  return [...buckets.values()].map((bucket) => ({
    cluster: bucket.cluster,
    pages: bucket.pages.length,
    primary_slug: bucket.primary?.slug || "",
    type_mix: [...bucket.types.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
    representative_terms: topTerms(tokensFor(bucket.pages.flatMap((page) => page.top_terms).join(" ")), 12)
  })).sort((a, b) => b.pages - a.pages || a.cluster.localeCompare(b.cluster));
}

function buildWatchlist(pages) {
  const watchlist = [];
  const byCluster = new Map();
  for (const page of pages) byCluster.set(page.cluster, [...(byCluster.get(page.cluster) || []), page]);

  for (const [cluster, clusterPages] of byCluster.entries()) {
    if (cluster === "local-city") continue;
    const primary = [...clusterPages].sort((a, b) => primaryRank(b) - primaryRank(a))[0];
    for (let i = 0; i < clusterPages.length; i += 1) {
      for (let j = i + 1; j < clusterPages.length; j += 1) {
        const a = clusterPages[i];
        const b = clusterPages[j];
        const similarity = weightedSimilarity(a, b);
        const heading = titleOverlap(a, b);
        const sameType = a.type === b.type ? 0.08 : 0;
        const riskScore = Math.min(100, Math.round((similarity * 70 + heading * 30 + sameType * 100) * 100) / 100);
        if (riskScore < 38) continue;
        const secondary = primary.slug === a.slug ? b : primary.slug === b.slug ? a : (primaryRank(a) >= primaryRank(b) ? b : a);
        watchlist.push({
          cluster,
          risk: riskScore >= 58 ? "high" : riskScore >= 46 ? "medium" : "watch",
          score: riskScore,
          primary_slug: primary.slug,
          pages: [a.slug, b.slug],
          page_types: [a.type, b.type],
          shared_terms: a.top_terms.filter((term) => b.top_terms.includes(term)).slice(0, 8),
          recommendation: recommendationFor(primary, secondary)
        });
      }
    }
  }

  return watchlist.sort((a, b) => b.score - a.score || a.cluster.localeCompare(b.cluster)).slice(0, 80);
}

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });

const audited = walk(PUBLIC_DIR).map(auditPage);
const noindexSkipped = audited.filter((page) => page === null).length;
const pages = audited.filter(Boolean).filter((page) => !ignoredSlugs.has(page.slug));
const watchlist = buildWatchlist(pages);
const highRisk = watchlist.filter((item) => item.risk === "high");
const mediumRisk = watchlist.filter((item) => item.risk === "medium");
const clusters = clusterSummary(pages);

const report = {
  generated_at: new Date().toISOString(),
  status: highRisk.length ? "watch" : "passed",
  pages_checked: pages.length,
  clusters_checked: clusters.length,
  high_risk_count: highRisk.length,
  medium_risk_count: mediumRisk.length,
  watch_count: watchlist.length,
  generated_block_families_ignored: generatedSeoBlockNames.length,
  generated_block_families: generatedSeoBlockNames,
  cluster_summary: clusters,
  watchlist,
  safeguards: [
    "internal-analysis-only",
    "no-google-scraping",
    "no-hidden-keyword-blocks",
    "local-city-pages-treated-as-distinct-intents",
    "supports-canonical-intent-planning",
    "generated-conversion-blocks-excluded-from-similarity",
    "generic-insurance-terms-excluded-from-similarity",
    "generic-form-and-template-terms-excluded-from-similarity",
    "rss-source-boilerplate-excluded-from-similarity"
  ]
};

writeFileSync(join(REPORT_DIR, "seo-cannibalization-report.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(PUBLIC_DIR, "assets", "seo-cannibalization-latest.json"), JSON.stringify({
  generated_at: report.generated_at,
  status: report.status,
  pages_checked: report.pages_checked,
  clusters_checked: report.clusters_checked,
  high_risk_count: report.high_risk_count,
  medium_risk_count: report.medium_risk_count,
  watch_count: report.watch_count,
  generated_block_families_ignored: report.generated_block_families_ignored,
  generated_block_families: report.generated_block_families,
  cluster_summary: report.cluster_summary.slice(0, 12),
  watchlist: report.watchlist.slice(0, 20),
  safeguards: report.safeguards
}, null, 2), "utf8");

console.log(`SEO cannibalization checked ${report.pages_checked} pages across ${report.clusters_checked} clusters; high=${report.high_risk_count}, medium=${report.medium_risk_count}.`);
