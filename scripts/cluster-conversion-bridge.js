import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const START = "<!-- cluster-conversion-bridge:start -->";
const END = "<!-- cluster-conversion-bridge:end -->";
const MAX_TARGETS = 80;

const ignoredSlugs = new Set(["admin", "mentions-legales", "confidentialite", "merci", "index"]);
const weakClusters = new Set(["newsletter-veille", "travaux", "copropriete-syndic", "local-commercial", "prix-tarif", "sci-bailleur", "devis-courtier", "sinistre-resilie"]);

const profiles = {
  "newsletter-veille": {
    eyebrow: "Passer de la veille a l'action",
    title: "Transformer un signal de veille en audit utile.",
    summary: "Une actualite n'a de valeur commerciale que si elle declenche une verification claire: contrat actuel, echeance, sinistres, travaux ou changement d'occupation.",
    checklist: ["Contrat actuel et appel de prime", "Point signale par la veille", "Echeance ou prochaine AG"],
    primary: ["/devis-assurance-immeuble?intent=veille", "Demander un audit"],
    secondary: ["/newsletter-assurance-immeuble", "Recevoir la veille"]
  },
  travaux: {
    eyebrow: "Travaux et garanties",
    title: "Verifier le contrat avant chantier, reception ou renouvellement.",
    summary: "Les travaux modifient le risque assureur. Le bon parcours relie PV d'AG, entreprises, attestations, reception, contrat immeuble et dommages ouvrage.",
    checklist: ["Nature des travaux et calendrier", "PV d'AG ou devis entreprises", "Contrat immeuble et attestations"],
    primary: ["/devis-assurance-immeuble?intent=travaux", "Verifier mon dossier travaux"],
    secondary: ["/dommages-ouvrage-immeuble", "Dommages ouvrage"]
  },
  "copropriete-syndic": {
    eyebrow: "Syndic et copropriete",
    title: "Passer d'une question copropriete a une fiche risque exploitable.",
    summary: "Le syndic, le conseil syndical ou le coproprietaire doivent relier parties communes, RC, sinistres, travaux et franchises avant de comparer.",
    checklist: ["Nombre de lots et parties communes", "Contrat actuel et PV utiles", "Sinistres et mesures correctives"],
    primary: ["/devis-assurance-immeuble?intent=copropriete", "Qualifier la copropriete"],
    secondary: ["/assurance-copropriete", "Assurance copropriete"]
  },
  "local-commercial": {
    eyebrow: "Immeuble mixte",
    title: "Clarifier le local commercial avant devis immeuble.",
    summary: "Un commerce, restaurant ou local vacant change l'appetence assureur. Le dossier doit expliquer bail, activite, protections et contrats voisins.",
    checklist: ["Activite exacte et bail", "Occupation ou vacance", "Contrat locataire et immeuble"],
    primary: ["/devis-assurance-immeuble?intent=local-commercial", "Etudier l'immeuble mixte"],
    secondary: ["/assurance-local-commercial", "Local commercial"]
  },
  "prix-tarif": {
    eyebrow: "Prix lisible",
    title: "Comparer le tarif avec les vraies conditions du contrat.",
    summary: "Une demande prix doit devenir une comparaison de garanties: franchises, plafonds, exclusions, sinistres et documents disponibles.",
    checklist: ["Prime et echeance actuelle", "Franchises et plafonds", "Historique sinistres"],
    primary: ["/devis-assurance-immeuble?intent=prix", "Obtenir un devis chiffre"],
    secondary: ["/comparateur-assurance-immeuble", "Comparer les garanties"]
  },
  "sci-bailleur": {
    eyebrow: "SCI et patrimoine",
    title: "Structurer le portefeuille avant consultation assureur.",
    summary: "SCI, bailleur et immeuble de rapport doivent presenter lots, occupations, contrats existants, vacance et sinistres pour eviter les doublons.",
    checklist: ["Liste des lots et occupants", "Contrats deja en place", "Sinistres et travaux prevus"],
    primary: ["/devis-assurance-immeuble?intent=sci", "Qualifier mon patrimoine"],
    secondary: ["/assurance-sci", "Assurance SCI"]
  },
  "devis-courtier": {
    eyebrow: "Devis exploitable",
    title: "Reduire les allers-retours avant consultation.",
    summary: "Un devis rapide reste fragile sans informations minimales. Le pont de conversion rappelle ce qui rend la demande comparable et traitable.",
    checklist: ["Adresse et usage du bien", "Contrat actuel si disponible", "Echeance et urgence"],
    primary: ["/devis-assurance-immeuble?intent=devis", "Completer ma demande"],
    secondary: ["/checklist-documents-assurance-immeuble", "Documents utiles"]
  },
  "sinistre-resilie": {
    eyebrow: "Dossier difficile",
    title: "Defendre le dossier apres sinistre, refus ou resiliation.",
    summary: "Ces situations demandent une chronologie claire, des mesures correctives et une lecture fine des exclusions avant de solliciter le marche.",
    checklist: ["Cause et date du sinistre", "Mesures correctives", "Courriers assureur disponibles"],
    primary: ["/devis-assurance-immeuble?intent=sinistre", "Analyser mon dossier"],
    secondary: ["/gestion-sinistres-immeuble", "Gestion sinistres"]
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

function cityFromSlug(slug) {
  if (!slug.startsWith("assurance-immeuble-")) return "";
  if (/assurance-immeuble-(locatif|de-rapport|monopropriete|resilie|sinistre|obligatoire|syndic-benevole|meuble-colocation)$/.test(slug)) return "";
  return slug.replace("assurance-immeuble-", "").replace(/-/g, " ");
}

function titleCase(value) {
  return String(value || "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function pageLabel(page) {
  const title = String(page.title || "").replace(/\s+\|\s+ImmeubleAssur$/i, "").trim();
  if (title) return title;
  const city = cityFromSlug(page.slug);
  if (city) return `Assurance immeuble ${titleCase(city)}`;
  return titleCase(page.slug.split("/").pop() || page.slug).replace(/\s+/g, " ");
}

function contextualSummary(profile, page) {
  const label = pageLabel(page);
  if (page.cluster === "newsletter-veille") return `Sur ${label}, la veille devient utile lorsqu'elle declenche une verification concrete: contrat actuel, echeance, sinistres, travaux ou changement d'occupation.`;
  if (page.cluster === "travaux") return `Sur ${label}, le parcours relie travaux, PV d'AG, entreprises, attestations, reception, contrat immeuble et dommages ouvrage avant consultation assureur.`;
  if (page.cluster === "copropriete-syndic") return `Sur ${label}, syndic, conseil syndical ou coproprietaire relient parties communes, RC, sinistres, travaux et franchises avant de comparer.`;
  if (page.cluster === "local-commercial") return `Sur ${label}, le dossier explique bail, activite, protections, vacance et contrats voisins pour rendre l'immeuble mixte lisible.`;
  if (page.cluster === "prix-tarif") return `Sur ${label}, la comparaison relie prime, franchises, plafonds, exclusions, sinistres et documents disponibles avant arbitrage.`;
  if (page.cluster === "sci-bailleur") return `Pour ${label}, SCI, bailleur ou immeuble de rapport presentent lots, occupations, contrats existants, vacance et sinistres pour eviter les doublons.`;
  if (page.cluster === "devis-courtier") return `Sur ${label}, le pont rappelle les donnees qui rendent la demande comparable: adresse, usage, contrat actuel, echeance et urgence.`;
  if (page.cluster === "sinistre-resilie") return `Sur ${label}, le dossier doit montrer chronologie, mesures correctives et exclusions sensibles avant sollicitation du marche.`;
  return profile.summary;
}

function contextualProfile(profile, page) {
  return { ...profile, summary: contextualSummary(profile, page) };
}

function clusterFor(slug, title, h1) {
  const source = `${slug} ${title} ${h1}`.toLowerCase();
  if (cityFromSlug(slug)) return "local";
  if (/newsletter|veille|^news\//.test(source)) return "newsletter-veille";
  if (/sinistre|resilie|refus|degat|fuite|incendie|vandalisme/.test(source)) return "sinistre-resilie";
  if (/prix|tarif|cout|combien|franchise/.test(source)) return "prix-tarif";
  if (/copro|syndic|parties communes|conseil syndical|ag/.test(source)) return "copropriete-syndic";
  if (/sci|bailleur|rapport|monopropriete|locatif|patrimoine/.test(source)) return "sci-bailleur";
  if (/commerce|commercial|restaurant|mixte|local professionnel/.test(source)) return "local-commercial";
  if (/travaux|toiture|ravalement|renovation|dommages ouvrage|chantier/.test(source)) return "travaux";
  if (/devis|courtier|comparateur|audit/.test(source)) return "devis-courtier";
  return "default";
}

function isNoIndex(html) {
  const robots = readMeta(html, /<meta name="robots" content="([^"]*)"/i).toLowerCase();
  return /(^|,\s*)noindex(\s*,|$)/.test(robots);
}

function pageType(slug) {
  if (slug.startsWith("blog/")) return "blog";
  if (slug.startsWith("faq/") || slug === "faq") return "faq";
  if (slug.startsWith("news/")) return "news";
  if (/newsletter|veille/.test(slug)) return "newsletter";
  if (/devis|contact/.test(slug)) return "lead";
  return "service";
}

function removeExisting(html) {
  return html.replace(new RegExp(`${START}[\\s\\S]*?${END}\\s*`, "g"), "");
}

function block(profile, cluster) {
  const [primaryHref, primaryLabel] = profile.primary;
  const [secondaryHref, secondaryLabel] = profile.secondary;
  return `${START}
<section class="band cluster-conversion-bridge conversion-momentum-band" data-cluster-conversion="${esc(cluster)}" aria-label="Prochaine action assurance immeuble">
  <div class="cluster-conversion-wrap conversion-momentum">
    <div class="cluster-conversion-copy conversion-momentum-copy">
      <p class="eyebrow dark">${esc(profile.eyebrow)}</p>
      <h2>${esc(profile.title)}</h2>
      <p class="large-copy">${esc(profile.summary)}</p>
    </div>
    <div class="cluster-conversion-panel">
      <strong>Avant le rappel, preparez</strong>
      <ul>${profile.checklist.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      <div class="cluster-conversion-actions">
        <a class="button primary" data-track="cluster-conversion-primary" href="${esc(primaryHref)}">${esc(primaryLabel)}</a>
        <a class="button secondary" data-track="cluster-conversion-secondary" href="${esc(secondaryHref)}">${esc(secondaryLabel)}</a>
      </div>
    </div>
  </div>
</section>
${END}`;
}

function insertBridge(html, bridge) {
  if (!/<\/main>/i.test(html)) return html;
  const beforeInternalLinks = /<!-- internal-link-equity:start -->/i;
  if (beforeInternalLinks.test(html)) return html.replace(beforeInternalLinks, `${bridge}\n<!-- internal-link-equity:start -->`);
  return html.replace(/\s*<\/main>/i, `\n${bridge}\n</main>`);
}

function auditFile(file) {
  const html = readFileSync(file, "utf8");
  const slug = slugFromFile(file);
  const title = stripHtml(readMeta(html, /<title>(.*?)<\/title>/is));
  const h1 = stripHtml((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
  const cluster = clusterFor(slug, title, h1);
  return {
    file,
    slug,
    title,
    h1,
    type: pageType(slug),
    cluster,
    noindex: isNoIndex(html),
    has_lead_form: html.includes('id="lead-form"'),
    has_bridge: html.includes(START)
  };
}

function shouldTarget(page) {
  if (ignoredSlugs.has(page.slug)) return false;
  if (page.noindex) return false;
  if (page.has_lead_form && page.type === "service") return false;
  return weakClusters.has(page.cluster) && page.type !== "lead";
}

const files = walk(PUBLIC_DIR).sort((a, b) => a.localeCompare(b));
const pages = files.map(auditFile);
const targets = pages.filter(shouldTarget).slice(0, MAX_TARGETS);
const changedPages = [];

for (const page of targets) {
  const original = readFileSync(page.file, "utf8");
  const cleaned = removeExisting(original);
  const profile = contextualProfile(profiles[page.cluster], page);
  const updated = insertBridge(cleaned, block(profile, page.cluster));
  if (updated !== original) {
    writeFileSync(page.file, updated, "utf8");
    changedPages.push({ slug: page.slug, type: page.type, cluster: page.cluster });
  }
}

const active = files
  .map((file) => readFileSync(file, "utf8"))
  .filter((html) => html.includes(START)).length;

const report = {
  generated_at: new Date().toISOString(),
  status: "passed",
  pages_checked: pages.length,
  pages_targeted: targets.length,
  pages_changed: changedPages.length,
  active_bridges: active,
  cluster_targets: Object.entries(targets.reduce((acc, page) => {
    acc[page.cluster] = (acc[page.cluster] || 0) + 1;
    return acc;
  }, {})).map(([cluster, count]) => ({ cluster, count })).sort((a, b) => b.count - a.count || a.cluster.localeCompare(b.cluster)),
  safeguards: ["visible-cta-only", "idempotent-marker", "no-hidden-text", "no-google-scraping", "lead-pages-not-distracted"],
  pages: changedPages
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });
writeFileSync(join(REPORT_DIR, "cluster-conversion-bridge-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(join(PUBLIC_DIR, "assets", "cluster-conversion-bridge-latest.json"), `${JSON.stringify({ ...report, pages: changedPages.slice(0, 40) }, null, 2)}\n`, "utf8");

console.log(`Cluster conversion bridge targeted ${targets.length} page(s), changed ${changedPages.length}, active=${active}.`);
