import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const SITE = "https://immeubleassur.com";
const START = "<!-- editorial-cluster-rescue:start -->";
const END = "<!-- editorial-cluster-rescue:end -->";
const MAX_PER_CLUSTER = 12;

const ignoredSlugs = new Set(["admin", "mentions-legales", "confidentialite", "merci", "index"]);
const nonLocalImmeubleSlugs = new Set([
  "assurance-immeuble-de-rapport",
  "assurance-immeuble-locatif",
  "assurance-immeuble-meuble-colocation",
  "assurance-immeuble-monopropriete",
  "assurance-immeuble-obligatoire",
  "assurance-immeuble-resilie",
  "assurance-immeuble-sinistre",
  "assurance-immeuble-syndic-benevole",
  "assurance-immeuble-syndic-professionnel"
]);

const explicitSlugRules = [
  ["newsletter-veille", /^(newsletter-assurance-immeuble|veille-assurance-immeuble|news\/)/],
  ["pno-cno", /^(assurance-(pno|cno|pno-cno|coproprietaire-non-occupant)|devis-pno-cno|pno-cno|faq\/pno|blog\/.*(pno|cno|non-occupant|lot-vacant))/],
  ["devis-courtier", /^(devis-assurance-immeuble|devis-assurance-immeuble-en-ligne|courtier-assurance-immeuble|comparateur-assurance-immeuble|audit-contrat-assurance-immeuble|checklist-documents-assurance-immeuble|recherches-assurance-immeuble|blog\/checklist-documents-devis-immeuble)/],
  ["prix-tarif", /^(prix-assurance-immeuble|tarif-assurance-immeuble|faq\/prix|blog\/.*(prix|franchise|tarif|pertes-de-loyers))/],
  ["local-commercial", /^(assurance-local-commercial|faq\/local-commercial|blog\/.*(commerce|commercial|restaurant|local-professionnel|mixte))/],
  ["copropriete-syndic", /^(assurance-copropriete|assurance-parties-communes|rc-syndic|guide-assurance-copropriete|faq\/copropriete|blog\/.*(copropriete|syndic|protection-juridique|parking-garages))/],
  ["sinistre-resilie", /^(gestion-sinistres-immeuble|assurance-immeuble-resilie|assurance-immeuble-sinistre|faq\/sinistres|blog\/.*(sinistre|degat|fuite|infiltration|resiliation|refus))/],
  ["travaux", /^(dommages-ouvrage-immeuble|faq\/travaux|blog\/.*(travaux|dommages-ouvrage|renovation|ravalement|toiture))/],
  ["sci-bailleur", /^(assurance-sci|assurance-immeuble-de-rapport|assurance-immeuble-monopropriete|assurance-immeuble-locatif|assurance-immeuble-meuble-colocation|faq\/sci|blog\/.*(sci|locatif|bailleur|colocation|patrimoine|vacant))/],
  ["local", /^(villes|assurance-immeuble-[a-z-]+)$/]
];

const signalRules = [
  ["devis-courtier", /devis|courtier|comparateur|audit contrat|dossier assureur/],
  ["prix-tarif", /prix|tarif|cout|combien|franchise|prime annuelle/],
  ["local-commercial", /commerce|commercial|restaurant|local professionnel|immeuble mixte/],
  ["sinistre-resilie", /sinistre|resilie|resiliation|refus assureur|degat|fuite|incendie|infiltration/],
  ["travaux", /travaux|dommages ouvrage|renovation|ravalement|toiture|chantier/],
  ["copropriete-syndic", /copropriete|syndic|parties communes|assemblee generale|conseil syndical/],
  ["sci-bailleur", /sci|bailleur|immeuble de rapport|monopropriete|locatif|patrimoine|colocation/],
  ["pno-cno", /pno|cno|non[-\s]?occupant|proprietaire non occupant|coproprietaire non occupant/],
  ["newsletter-veille", /newsletter|veille|actualites|signaux marche/]
];

const profiles = {
  "newsletter-veille": {
    threshold: 78,
    eyebrow: "Veille utile",
    title: "Transformer ce signal de veille en demande exploitable.",
    summary: "Un changement de marche, un sinistre ou une alerte contrat doit devenir une verification courte: immeuble, echeance, garanties, travaux et historique.",
    bullets: ["Point de veille a verifier", "Contrat actuel et echeance", "Impact possible sur prime ou garanties"],
    intent: "veille",
    primary: "Faire analyser ce signal",
    secondary: ["Recevoir la veille", "/newsletter-assurance-immeuble"]
  },
  travaux: {
    threshold: 78,
    eyebrow: "Travaux et contrat",
    title: "Verifier le contrat avant chantier ou renouvellement.",
    summary: "Les travaux changent le risque assureur. Le dossier doit relier PV, devis entreprises, garanties existantes et mesures de prevention.",
    bullets: ["Nature des travaux et calendrier", "PV, devis ou attestations utiles", "Contrat immeuble et dommages ouvrage"],
    intent: "travaux",
    primary: "Qualifier mes travaux",
    secondary: ["Voir dommages ouvrage", "/dommages-ouvrage-immeuble"]
  },
  "local-commercial": {
    threshold: 78,
    eyebrow: "Immeuble mixte",
    title: "Clarifier le local commercial avant devis immeuble.",
    summary: "Commerce, restaurant, local vacant ou activite professionnelle changent l'appetence assureur. La demande doit expliquer usage, bail et protections.",
    bullets: ["Activite et bail en cours", "Occupation ou vacance", "Protections et contrat du locataire"],
    intent: "local-commercial",
    primary: "Etudier l'immeuble mixte",
    secondary: ["Voir local commercial", "/assurance-local-commercial"]
  },
  "assurance-immeuble": {
    threshold: 78,
    eyebrow: "Assurance immeuble",
    title: "Passer de l'information generale a un dossier assureur.",
    summary: "Une question generale devient un lead utile quand elle precise lots, usage, occupants, sinistres, travaux, contrat actuel et date d'echeance.",
    bullets: ["Adresse, lots et usage du batiment", "Garanties et franchise actuelles", "Echeance, urgence et documents disponibles"],
    intent: "immeuble",
    primary: "Demander un devis immeuble",
    secondary: ["Voir PNO/CNO", "/assurance-pno-cno"]
  },
  "copropriete-syndic": {
    threshold: 78,
    eyebrow: "Copropriete",
    title: "Relier la lecture syndic a une fiche risque claire.",
    summary: "Syndic, conseil syndical ou coproprietaire doivent cadrer parties communes, RC, sinistres, travaux et vote avant consultation.",
    bullets: ["Nombre de lots et parties communes", "PV, contrat et echeance", "Sinistres et mesures correctives"],
    intent: "copropriete",
    primary: "Qualifier la copropriete",
    secondary: ["Voir assurance copropriete", "/assurance-copropriete"]
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

function normalizeSignal(value) {
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

function meta(html, pattern) {
  return ((html.match(pattern) || [])[1] || "").trim();
}

function firstH1(html) {
  return stripHtml((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
}

function isCitySlug(slug) {
  return /^assurance-immeuble-[a-z-]+$/.test(slug) && !nonLocalImmeubleSlugs.has(slug);
}

function detectCluster({ slug, title, description, h1 }) {
  const normalizedSlug = normalizeSignal(slug);
  if (isCitySlug(normalizedSlug)) return "local";
  const explicit = explicitSlugRules.find(([, pattern]) => pattern.test(normalizedSlug));
  if (explicit) return explicit[0];
  const source = normalizeSignal(`${slug} ${title} ${description} ${h1}`);
  return (signalRules.find(([, pattern]) => pattern.test(source)) || ["assurance-immeuble"])[0];
}

function pageType(slug) {
  if (slug.startsWith("blog/")) return "blog";
  if (slug.startsWith("faq/") || slug === "faq") return "faq";
  if (slug.startsWith("news/")) return "news";
  if (/newsletter|veille/.test(slug)) return "newsletter";
  if (/devis|contact/.test(slug)) return "lead";
  return "service";
}

function isNoIndex(html) {
  const robots = meta(html, /<meta name="robots" content="([^"]*)"/i).toLowerCase();
  return /(^|,\s*)noindex(\s*,|$)/.test(robots);
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function conversionClusterMap() {
  const report = readJson(join(REPORT_DIR, "conversion-intelligence-report.json"), null) || readJson(join(PUBLIC_DIR, "assets", "conversion-intelligence-latest.json"), null);
  return new Map((report?.cluster_coverage || []).map((row) => [row.cluster, row]));
}

function targetClusters(rows) {
  const selected = new Set();
  for (const [cluster, profile] of Object.entries(profiles)) {
    const row = rows.get(cluster);
    if (!row || Number(row.money_pages || 0) === 0 || Number(row.average_score || 0) < profile.threshold) selected.add(cluster);
  }
  return selected;
}

function removeExisting(html) {
  return html.replace(new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "g"), "");
}

function quoteHref(profile, cluster) {
  const params = new URLSearchParams({
    intent: profile.intent,
    content_bridge: "1",
    content_kind: "editorial-cluster-rescue",
    source_cluster: cluster
  });
  return `/devis-assurance-immeuble?${params.toString()}`;
}

function rescueBlock(profile, cluster) {
  const [secondaryLabel, secondaryHref] = profile.secondary;
  return `${START}
<section class="band editorial-cluster-rescue" data-editorial-cluster-rescue="${esc(cluster)}" aria-label="Transformer cette lecture en demande de devis">
  <div class="editorial-cluster-rescue__inner">
    <div class="editorial-cluster-rescue__copy">
      <p class="eyebrow dark">${esc(profile.eyebrow)}</p>
      <h2>${esc(profile.title)}</h2>
      <p>${esc(profile.summary)}</p>
    </div>
    <div class="editorial-cluster-rescue__panel">
      <strong>Ce que l'on qualifie avec vous</strong>
      <ul>${profile.bullets.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      <div class="editorial-cluster-rescue__actions">
        <a class="button primary" data-track="editorial-cluster-rescue-quote" data-content-kind="editorial-cluster-rescue" href="${esc(quoteHref(profile, cluster))}">${esc(profile.primary)}</a>
        <a class="button secondary" data-track="editorial-cluster-rescue-secondary" href="${esc(secondaryHref)}">${esc(secondaryLabel)}</a>
        <a class="button secondary" data-track="editorial-cluster-rescue-phone" href="tel:+33180855786">01 80 85 57 86</a>
      </div>
    </div>
  </div>
</section>
${END}`;
}

function insertRescue(html, rescue) {
  if (!/<\/main>/i.test(html)) return html;
  const beforeClusterBridge = /<!-- cluster-conversion-bridge:start -->/i;
  if (beforeClusterBridge.test(html)) return html.replace(beforeClusterBridge, `${rescue}\n<!-- cluster-conversion-bridge:start -->`);
  const beforeInternalLinks = /<!-- internal-link-equity:start -->/i;
  if (beforeInternalLinks.test(html)) return html.replace(beforeInternalLinks, `${rescue}\n<!-- internal-link-equity:start -->`);
  return html.replace(/\s*<\/main>/i, `\n${rescue}\n</main>`);
}

function auditFile(file) {
  const html = readFileSync(file, "utf8");
  const slug = slugFromFile(file);
  const title = stripHtml(meta(html, /<title>(.*?)<\/title>/is));
  const description = meta(html, /<meta name="description" content="([^"]*)"/i);
  const h1 = firstH1(html);
  return {
    file,
    slug,
    title,
    description,
    h1,
    type: pageType(slug),
    cluster: detectCluster({ slug, title, description, h1 }),
    noindex: isNoIndex(html),
    has_lead_form: html.includes('id="lead-form"'),
    has_rescue: html.includes(START)
  };
}

function shouldTarget(page, selectedClusters) {
  if (ignoredSlugs.has(page.slug)) return false;
  if (page.noindex || page.has_lead_form || page.type === "lead") return false;
  if (!selectedClusters.has(page.cluster)) return false;
  return ["blog", "faq", "news", "newsletter", "service"].includes(page.type);
}

const files = walk(PUBLIC_DIR);
const clusterRows = conversionClusterMap();
const selectedClusters = targetClusters(clusterRows);
const pages = files.map(auditFile);
const byCluster = new Map();
for (const page of pages.filter((page) => shouldTarget(page, selectedClusters))) {
  const bucket = byCluster.get(page.cluster) || [];
  bucket.push(page);
  byCluster.set(page.cluster, bucket);
}

const targets = [...byCluster.entries()].flatMap(([cluster, clusterPages]) => {
  const row = clusterRows.get(cluster);
  const scoreMap = new Map((row?.top_pages || []).map((item) => [item.slug, Number(item.score || 0)]));
  return clusterPages
    .sort((a, b) => (scoreMap.get(a.slug) || 70) - (scoreMap.get(b.slug) || 70) || a.slug.localeCompare(b.slug))
    .slice(0, MAX_PER_CLUSTER);
});

const targetFiles = new Set(targets.map((page) => page.file));
const targetReports = targets.map((page) => ({ slug: page.slug, type: page.type, cluster: page.cluster, active: true, changed: false }));
const targetReportByFile = new Map(targets.map((page, index) => [page.file, targetReports[index]]));
const changedPages = [];
const removedPages = [];

for (const page of pages) {
  const original = readFileSync(page.file, "utf8");
  const cleaned = removeExisting(original);
  let updated = cleaned;
  if (targetFiles.has(page.file)) updated = insertRescue(cleaned, rescueBlock(profiles[page.cluster], page.cluster));
  if (updated !== original) {
    writeFileSync(page.file, updated, "utf8");
    if (targetFiles.has(page.file)) {
      const entry = targetReportByFile.get(page.file);
      if (entry) entry.changed = true;
      changedPages.push({ slug: page.slug, type: page.type, cluster: page.cluster });
    } else {
      removedPages.push({ slug: page.slug, type: page.type, cluster: page.cluster });
    }
  }
}

const activeRescues = files
  .map((file) => readFileSync(file, "utf8"))
  .filter((html) => html.includes(START)).length;

const clusterTargets = Object.entries(targets.reduce((acc, page) => {
  acc[page.cluster] = (acc[page.cluster] || 0) + 1;
  return acc;
}, {})).map(([cluster, count]) => ({ cluster, count })).sort((a, b) => b.count - a.count || a.cluster.localeCompare(b.cluster));

const clusterInputs = [...selectedClusters].map((cluster) => {
  const row = clusterRows.get(cluster) || {};
  return {
    cluster,
    average_score: Number(row.average_score || 0),
    money_pages: Number(row.money_pages || 0),
    threshold: profiles[cluster]?.threshold || 0
  };
}).sort((a, b) => a.cluster.localeCompare(b.cluster));

const report = {
  generated_at: new Date().toISOString(),
  status: "passed",
  pages_checked: pages.length,
  clusters_targeted: clusterTargets.length,
  pages_targeted: targets.length,
  blocks_written: targets.length,
  blocks_changed: changedPages.length,
  blocks_removed: removedPages.length,
  active_rescues: activeRescues,
  cluster_targets: clusterTargets,
  cluster_inputs: clusterInputs,
  safeguards: ["visible-cta-only", "idempotent-marker", "no-hidden-text", "first-party-pages-only", "lead-pages-not-distracted"],
  pages: targetReports
};

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });
writeFileSync(join(REPORT_DIR, "editorial-cluster-rescue-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(join(PUBLIC_DIR, "assets", "editorial-cluster-rescue-latest.json"), `${JSON.stringify({ ...report, pages: targetReports.slice(0, 40) }, null, 2)}\n`, "utf8");

console.log(`Editorial cluster rescue targeted ${targets.length} page(s), changed ${changedPages.length}, active=${activeRescues}.`);
