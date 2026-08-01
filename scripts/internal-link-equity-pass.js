import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const SITE = "https://immeubleassur.com";
const START = "<!-- internal-link-equity:start -->";
const END = "<!-- internal-link-equity:end -->";
const MAX_TARGETS = 90;

const ignoredSlugs = new Set(["admin", "mentions-legales", "confidentialite", "merci"]);

const profiles = {
  "pno-cno": {
    eyebrow: "Parcours PNO/CNO",
    title: "Relier la lecture PNO ou CNO au bon devis.",
    summary: "Quand la recherche porte sur un lot, une vacance ou un coproprietaire non occupant, le maillage doit envoyer vers la page qui qualifie vraiment le dossier.",
    links: [
      ["/devis-pno-cno?intent=cno", "Devis CNO qualifie"],
      ["/devis-pno-cno?intent=pno", "Devis PNO bailleur"],
      ["/assurance-cno", "Comprendre la CNO"],
      ["/faq/pno", "FAQ PNO/CNO"]
    ]
  },
  "copropriete-syndic": {
    eyebrow: "Copropriete",
    title: "Orienter syndic, conseil syndical et coproprietaire.",
    summary: "Une page copropriete doit permettre de passer d'une question juridique ou pratique a un contrat lisible pour l'immeuble et les parties communes.",
    links: [
      ["/devis-assurance-immeuble?intent=copropriete", "Devis copropriete"],
      ["/assurance-copropriete", "Assurance copropriete"],
      ["/rc-syndic", "RC syndic"],
      ["/guide-assurance-copropriete-2026", "Guide copropriete"]
    ]
  },
  "sci-bailleur": {
    eyebrow: "SCI et bailleurs",
    title: "Faire remonter les recherches patrimoine vers le devis immeuble.",
    summary: "Les recherches SCI, immeuble de rapport ou monopropriete doivent converger vers une fiche risque exploitable: occupation, lots, contrats et sinistres.",
    links: [
      ["/devis-assurance-immeuble?intent=sci", "Devis SCI ou bailleur"],
      ["/assurance-sci", "Assurance SCI"],
      ["/assurance-immeuble-monopropriete", "Monopropriete"],
      ["/assurance-immeuble-de-rapport", "Immeuble de rapport"]
    ]
  },
  "sinistre-resilie": {
    eyebrow: "Dossier difficile",
    title: "Transformer sinistre, refus ou resiliation en dossier defendable.",
    summary: "Ces recherches demandent un cadrage rapide: causes, mesures correctives, historique assureur, garanties et calendrier de renouvellement.",
    links: [
      ["/devis-assurance-immeuble?intent=sinistre", "Devis apres sinistre"],
      ["/assurance-immeuble-sinistre", "Immeuble avec sinistres"],
      ["/assurance-immeuble-resilie", "Contrat resilie"],
      ["/gestion-sinistres-immeuble", "Gestion sinistres"]
    ]
  },
  "prix-tarif": {
    eyebrow: "Prix et arbitrage",
    title: "Relier le tarif a la comparaison reelle des garanties.",
    summary: "Le prix seul ne suffit pas: la page doit guider vers franchises, plafonds, exclusions, sinistres et documents qui changent la prime.",
    links: [
      ["/tarif-assurance-immeuble", "Tarif assurance immeuble"],
      ["/prix-assurance-immeuble", "Facteurs de prix"],
      ["/comparateur-assurance-immeuble", "Comparer les offres"],
      ["/devis-assurance-immeuble?intent=prix", "Obtenir un devis chiffre"]
    ]
  },
  travaux: {
    eyebrow: "Travaux",
    title: "Lier travaux, dommages ouvrage et contrat immeuble.",
    summary: "Travaux votes, renovation energetique ou toiture changent le risque. Les liens doivent aider a preparer pieces, garanties et calendrier.",
    links: [
      ["/dommages-ouvrage-immeuble", "Dommages ouvrage immeuble"],
      ["/blog/dommages-ouvrage-copropriete-travaux", "Travaux en copropriete"],
      ["/blog/renovation-energetique-copropriete-assurance", "Renovation energetique"],
      ["/devis-assurance-immeuble?intent=travaux", "Devis apres travaux"]
    ]
  },
  "local-commercial": {
    eyebrow: "Immeuble mixte",
    title: "Clarifier commerce, habitation et responsabilites.",
    summary: "Un local commercial ou restaurant en pied d'immeuble impose de relier bail, activite, contrat locataire et contrat proprietaire.",
    links: [
      ["/assurance-local-commercial", "Local commercial"],
      ["/blog/immeuble-mixte-restaurant", "Immeuble avec restaurant"],
      ["/blog/local-commercial-vacant", "Local commercial vacant"],
      ["/devis-assurance-immeuble?intent=local-commercial", "Devis immeuble mixte"]
    ]
  },
  "newsletter-veille": {
    eyebrow: "Veille utile",
    title: "Relier l'actualite aux actions assurance immeuble.",
    summary: "La veille doit conduire vers une decision: verifier un contrat, preparer une AG, comparer PNO/CNO ou demander un audit.",
    links: [
      ["/newsletter-assurance-immeuble", "Recevoir la veille"],
      ["/veille-assurance-immeuble", "Derniers signaux"],
      ["/devis-assurance-immeuble", "Demander un audit"],
      ["/blog", "Guides assurance immeuble"]
    ]
  },
  local: {
    eyebrow: "Maillage local",
    title: "Passer de la ville au dossier assureur.",
    summary: "Une page locale doit renvoyer vers les garanties centrales, le devis et les situations qui modifient vraiment l'appetence assureur.",
    links: [
      ["/devis-assurance-immeuble?intent=local", "Devis local immeuble"],
      ["/assurance-immeuble", "Assurance immeuble"],
      ["/assurance-pno-cno", "PNO/CNO"],
      ["/comparateur-assurance-immeuble", "Comparer les garanties"]
    ]
  },
  default: {
    eyebrow: "Parcours utiles",
    title: "Continuer vers la page qui qualifie le mieux le besoin.",
    summary: "Chaque page doit aider le visiteur a rejoindre le bon parcours: devis immeuble, PNO/CNO, copropriete, SCI, prix ou dossier difficile.",
    links: [
      ["/devis-assurance-immeuble", "Devis assurance immeuble"],
      ["/assurance-immeuble", "Assurance immeuble"],
      ["/assurance-pno-cno", "PNO/CNO"],
      ["/recherches-assurance-immeuble", "Guide par intention"]
    ]
  }
};

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(file) === ".html" ? [file] : [];
  });
}

function esc(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugFromFile(file) {
  const rel = relative(PUBLIC_DIR, file).replace(/\\/g, "/");
  if (rel === "index.html") return "index";
  return rel.replace(/\.html$/, "");
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

function titleCase(value) {
  return String(value || "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function pageLabel(page) {
  const city = cityFromSlug(page.slug);
  if (city) return `assurance immeuble ${titleCase(city)}`;
  return (page.h1 || page.title || page.slug.replace(/[/-]+/g, " ")).toLowerCase();
}

function contextualSummary(page, fallback) {
  const label = pageLabel(page);
  if (page.cluster === "pno-cno") return `Sur ${label}, le maillage doit conduire vers le parcours qui qualifie le lot, la vacance, l'occupation et le contrat immeuble.`;
  if (page.cluster === "copropriete-syndic") return `Sur ${label}, la question juridique ou pratique doit mener vers un contrat lisible pour l'immeuble, les lots et les parties communes.`;
  if (page.cluster === "sci-bailleur") return `Sur ${label}, le maillage fait remonter patrimoine, lots, contrats existants, vacance et sinistres vers une fiche risque exploitable.`;
  if (page.cluster === "sinistre-resilie") return `Sur ${label}, le parcours relie causes, mesures correctives, historique assureur, garanties et calendrier de renouvellement.`;
  if (page.cluster === "prix-tarif") return `Sur ${label}, le tarif doit etre relie aux franchises, plafonds, exclusions, sinistres et documents qui changent la prime.`;
  if (page.cluster === "travaux") return `Sur ${label}, les liens aident a preparer pieces travaux, garanties chantier, dommages ouvrage eventuelle et calendrier assureur.`;
  if (page.cluster === "local-commercial") return `Sur ${label}, le maillage clarifie bail, activite, contrat locataire, responsabilites du bailleur et contrat immeuble.`;
  if (page.cluster === "newsletter-veille") return `Sur ${label}, la veille doit conduire vers une action: verifier un contrat, preparer une AG, comparer PNO/CNO ou demander un audit.`;
  if (page.cluster === "local") return `Sur ${label}, les liens renvoient vers garanties centrales, devis et situations qui modifient vraiment l'appetence assureur locale.`;
  return `Sur ${label}, le visiteur doit rejoindre le bon parcours: devis immeuble, PNO/CNO, copropriete, SCI, prix ou dossier difficile.` || fallback;
}

function contextualProfile(profile, page) {
  return { ...profile, summary: contextualSummary(page, profile.summary) };
}

function pageType(slug) {
  if (slug === "index") return "home";
  if (slug.startsWith("blog/")) return "blog";
  if (slug.startsWith("faq/") || slug === "faq") return "faq";
  if (slug.startsWith("news/")) return "news";
  if (cityFromSlug(slug)) return "city";
  if (/devis|contact|comparateur|courtier/.test(slug)) return "lead";
  return "service";
}

function clusterFor(slug, title, h1) {
  const source = `${slug} ${title} ${h1}`.toLowerCase();
  if (cityFromSlug(slug)) return "local";
  if (/newsletter|veille|^news\//.test(source)) return "newsletter-veille";
  if (/pno|cno|non.?occupant|coproprietaire/.test(source)) return "pno-cno";
  if (/sinistre|resilie|refus|degat|fuite|incendie|vandalisme/.test(source)) return "sinistre-resilie";
  if (/prix|tarif|cout|combien|franchise/.test(source)) return "prix-tarif";
  if (/copro|syndic|parties communes|conseil syndical|ag/.test(source)) return "copropriete-syndic";
  if (/sci|bailleur|rapport|monopropriete|locatif|patrimoine/.test(source)) return "sci-bailleur";
  if (/commerce|commercial|restaurant|mixte|local professionnel/.test(source)) return "local-commercial";
  if (/travaux|toiture|ravalement|renovation|dommages ouvrage|chantier/.test(source)) return "travaux";
  return "default";
}

function existingInternalLinks(html) {
  const links = [...html.matchAll(/<a\s+[^>]*href="([^"]+)"/gi)].map((match) => match[1]);
  return links.filter((href) => href.startsWith("/") && !href.startsWith("//")).length;
}

function sameSlug(href, slug) {
  const path = String(href || "").split("?")[0].replace(/^\/+/, "").replace(/\/$/, "");
  const cleanSlug = slug === "index" ? "" : slug;
  return path === cleanSlug;
}

function linkBlock(profile, slug) {
  const links = profile.links.filter(([href]) => !sameSlug(href, slug)).slice(0, 4);
  return `${START}
<section class="band internal-link-equity-band" aria-label="Pages assurance immeuble associees">
  <div class="container narrow">
    <p class="eyebrow dark">${esc(profile.eyebrow)}</p>
    <h2>${esc(profile.title)}</h2>
    <p class="large-copy">${esc(profile.summary)}</p>
    <div class="seo-link-panel">
      <strong>Pages a consulter ensuite</strong>
      ${links.map(([href, label]) => `<a href="${esc(href)}" data-track="internal-link-equity">${esc(label)}</a>`).join("")}
    </div>
  </div>
</section>
${END}`;
}

function removeExistingBlock(html) {
  return html.replace(new RegExp(`${START}[\\s\\S]*?${END}\\s*`, "g"), "");
}

function insertBeforeMainEnd(html, block) {
  if (!/<\/main>/i.test(html)) return html;
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function shouldTarget(page) {
  if (ignoredSlugs.has(page.slug)) return false;
  if (page.noindex) return false;
  if (page.type === "lead") return false;
  if (page.slug === "index") return false;
  if (page.internal_links < 4) return true;
  if (!page.has_quote_link) return true;
  return page.type === "blog" || page.type === "faq" || page.type === "news";
}

function activeLinkStats(file) {
  const html = readFileSync(file, "utf8");
  const match = html.match(new RegExp(`${START}[\\s\\S]*?${END}`, "i"));
  if (!match) return { active: false, links: 0 };
  return { active: true, links: (match[0].match(/<a\s+/g) || []).length };
}
function auditFile(file) {
  const html = readFileSync(file, "utf8");
  const slug = slugFromFile(file);
  const title = stripHtml(readMeta(html, /<title>(.*?)<\/title>/is));
  const h1 = stripHtml((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
  const type = pageType(slug);
  const cluster = clusterFor(slug, title, h1);
  const internalLinks = existingInternalLinks(html);
  return {
    file,
    slug,
    type,
    cluster,
    title,
    h1,
    noindex: isNoIndex(html),
    internal_links: internalLinks,
    has_quote_link: /href="\/devis-|href="\/devis\//i.test(html),
    already_instrumented: html.includes(START)
  };
}

const files = walk(PUBLIC_DIR).sort((a, b) => a.localeCompare(b));
const pages = files.map(auditFile);
const targets = pages.filter(shouldTarget).slice(0, MAX_TARGETS);
const changedPages = [];
let linksAdded = 0;

for (const page of targets) {
  const original = readFileSync(page.file, "utf8");
  const cleaned = removeExistingBlock(original);
  const profile = contextualProfile(profiles[page.cluster] || profiles.default, page);
  const block = linkBlock(profile, page.slug);
  const updated = insertBeforeMainEnd(cleaned, block);
  if (updated !== original) {
    writeFileSync(page.file, updated, "utf8");
    const added = (block.match(/<a\s+/g) || []).length;
    linksAdded += added;
    changedPages.push({
      slug: page.slug,
      type: page.type,
      cluster: page.cluster,
      previous_internal_links: page.internal_links,
      links_added: added
    });
  }
}

const activeStats = files.map(activeLinkStats);
const pagesWithActiveBlocks = activeStats.filter((item) => item.active).length;
const activeInternalLinks = activeStats.reduce((sum, item) => sum + item.links, 0);

const report = {
  generated_at: new Date().toISOString(),
  status: "passed",
  pages_checked: pages.length,
  pages_targeted: targets.length,
  pages_changed: changedPages.length,
  links_added: linksAdded,
  pages_with_active_blocks: pagesWithActiveBlocks,
  active_internal_links: activeInternalLinks,
  noindex_skipped: pages.filter((page) => page.noindex).length,
  lead_pages_skipped: pages.filter((page) => page.type === "lead").length,
  cluster_targets: Object.entries(targets.reduce((acc, page) => {
    acc[page.cluster] = (acc[page.cluster] || 0) + 1;
    return acc;
  }, {})).map(([cluster, count]) => ({ cluster, count })).sort((a, b) => b.count - a.count || a.cluster.localeCompare(b.cluster)),
  safeguards: ["visible-links-only", "no-hidden-keyword-blocks", "no-google-scraping", "noindex-pages-skipped", "lead-form-pages-not-distracted", "idempotent-marker"],
  pages: changedPages
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });
writeFileSync(join(REPORT_DIR, "internal-link-equity-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(join(PUBLIC_DIR, "assets", "internal-link-equity-latest.json"), `${JSON.stringify({ ...report, pages: changedPages.slice(0, 30) }, null, 2)}\n`, "utf8");

console.log(`Internal link equity pass targeted ${targets.length} page(s), changed ${changedPages.length}, links_added=${linksAdded}.`);
