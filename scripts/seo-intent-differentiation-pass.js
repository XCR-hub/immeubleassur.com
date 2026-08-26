import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const SITE = "https://immeubleassur.com";
const START = "<!-- seo-intent-differentiation:start -->";
const END = "<!-- seo-intent-differentiation:end -->";
const REPORT_FILE = join(REPORT_DIR, "seo-cannibalization-report.json");

const clusterProfiles = {
  "newsletter-veille": {
    label: "veille assurance immeuble",
    primary: "veille-assurance-immeuble",
    quote: "/newsletter-assurance-immeuble",
    focus: "dater le signal, citer le contexte de veille et renvoyer vers la page pilier de suivi"
  },
  "pno-cno": {
    label: "PNO CNO",
    primary: "assurance-pno-cno",
    quote: "/devis-pno-cno",
    focus: "separer obligation, statut du lot, occupation, vacance et parcours de devis"
  },
  "sinistre-resilie": {
    label: "sinistre ou dossier resilie",
    primary: "gestion-sinistres-immeuble",
    quote: "/devis-assurance-immeuble?intent=sinistre",
    focus: "separer prevention, remise en marche, refus assureur et historique sinistre"
  },
  "sci-bailleur": {
    label: "SCI et bailleur",
    primary: "assurance-sci",
    quote: "/devis-assurance-immeuble?intent=sci",
    focus: "distinguer patrimoine SCI, monopropriete, immeuble de rapport et batiment proprietaire"
  },
  "copropriete-syndic": {
    label: "copropriete et syndic",
    primary: "assurance-copropriete",
    quote: "/devis-assurance-immeuble?intent=copropriete",
    focus: "separer AG, syndic benevole, travaux, RC syndic et parties communes"
  },
  "assurance-immeuble": {
    label: "assurance immeuble",
    primary: "assurance-immeuble",
    quote: "/devis-assurance-immeuble",
    focus: "clarifier le role entre page service, guide, obligation, garanties et demande de devis"
  },
  "local-commercial": {
    label: "local commercial et immeuble mixte",
    primary: "assurance-local-commercial",
    quote: "/devis-assurance-immeuble?intent=local-commercial",
    focus: "distinguer local vacant, restaurant, activite professionnelle et immeuble mixte"
  },
  "prix-tarif": {
    label: "prix et tarif",
    primary: "prix-assurance-immeuble",
    quote: "/tarif-assurance-immeuble",
    focus: "separer estimation budget, comparaison de franchises et demande de tarif"
  },
  "devis-courtier": {
    label: "devis et courtage",
    primary: "devis-assurance-immeuble",
    quote: "/devis-assurance-immeuble",
    focus: "distinguer formulaire, courtier, comparateur et audit avant consultation assureur"
  },
  travaux: {
    label: "travaux et assurance",
    primary: "dommages-ouvrage-immeuble",
    quote: "/devis-assurance-immeuble?intent=travaux",
    focus: "separer chantier, dommage ouvrage, renovation, toiture et obligations de declaration"
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
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function fileForSlug(slug) {
  return join(PUBLIC_DIR, slug === "index" ? "index.html" : `${slug}.html`);
}

function pageUrl(slug) {
  return slug === "index" ? `${SITE}/` : `${SITE}/${slug}`;
}

function hrefForSlug(slug) {
  return slug === "index" ? "/" : `/${slug}`;
}

function titleOf(html, slug) {
  return stripHtml((html.match(/<title>(.*?)<\/title>/is) || [])[1] || slug.replace(/[/-]+/g, " ")).replace(/\s+\|\s+ImmeubleAssur$/i, "");
}

function pageType(slug) {
  if (slug.startsWith("news/")) return "news";
  if (slug.startsWith("blog/")) return "blog";
  if (slug.startsWith("faq/") || slug === "faq") return "faq";
  if (/devis|contact|audit|comparateur|courtier/.test(slug)) return "lead";
  return "service";
}

function pagePriority(slug) {
  const type = pageType(slug);
  if (type === "news") return 50;
  if (type === "blog") return 45;
  if (type === "faq") return 40;
  if (type === "service") return 25;
  if (type === "lead") return 15;
  return 10;
}

function chooseSecondary(item) {
  const pages = Array.isArray(item.pages) ? item.pages : [];
  if (pages.length < 2) return "";
  const primary = item.primary_slug || clusterProfiles[item.cluster]?.primary || "";
  if (pages.includes(primary)) return pages.find((slug) => slug !== primary) || "";
  return [...pages].sort((a, b) => pagePriority(b) - pagePriority(a) || b.localeCompare(a))[0] || "";
}

function roleFor(slug, cluster) {
  const type = pageType(slug);
  const name = slug.replace(/^blog\//, "").replace(/^news\//, "").replace(/-/g, " ");
  const serviceIntents = {
    "assurance-cno": "le cas CNO du coproprietaire non occupant",
    "assurance-pno-cno": "la comparaison PNO/CNO cote contrat",
    "assurance-coproprietaire-non-occupant": "la responsabilite du coproprietaire non occupant",
    "assurance-immeuble-monopropriete": "l'immeuble detenu seul ou en SCI familiale",
    "assurance-immeuble-obligatoire": "les obligations reelles avant souscription",
    "assurance-immeuble-sinistre": "le dossier avec historique de sinistre",
    "comparateur-assurance-immeuble": "la comparaison avant consultation du marche"
  };
  if (type === "news") return {
    intent: `le signal date ${name}`,
    job: "informer sur une actualite precise avant de renvoyer vers la veille permanente"
  };
  if (type === "blog") return {
    intent: `le guide specialise ${name}`,
    job: "repondre a une question de decision sans remplacer la page service primaire"
  };
  if (type === "faq") return {
    intent: `la question FAQ ${name}`,
    job: "traiter une objection courte avant orientation vers le parcours complet"
  };
  if (type === "lead") return {
    intent: `la conversion formulaire ${name}`,
    job: "transformer un besoin mur en dossier de devis qualifie"
  };
  return {
    intent: serviceIntents[slug] || `la page service ${name}`,
    job: `cadrer un angle distinct du cluster ${clusterProfiles[cluster]?.label || cluster}`
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeBlock(html) {
  return html.replace(new RegExp(`\\s*${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\s*`, "g"), "\n");
}

function quoteLabel(href) {
  if (/newsletter/i.test(href)) return "S'inscrire a la veille";
  if (/tarif|prix/i.test(href)) return "Consulter le tarif";
  if (/devis/i.test(href)) return "Demander un devis adapte";
  return "Continuer le parcours";
}

function buildLinks(target) {
  const links = [];
  const seen = new Set();
  const push = (href, label) => {
    if (!href || seen.has(href)) return;
    links.push([href, label]);
    seen.add(href);
  };
  push(hrefForSlug(target.primary), `Page primaire: ${target.primary.replace(/[/-]+/g, " ")}`);
  push(target.profile.quote, quoteLabel(target.profile.quote));
  for (const slug of target.related) push(hrefForSlug(slug), `A distinguer: ${slug.replace(/[/-]+/g, " ")}`);
  return links.slice(0, 4);
}

function blockFor(target, title) {
  const role = roleFor(target.slug, target.cluster);
  const terms = [...new Set(target.sharedTerms)].slice(0, 8).join(", ") || target.profile.label;
  const links = buildLinks(target);
  return `${START}
<section class="band seo-opportunity-expansion intent-differentiation" aria-label="Role SEO de ${esc(title)}">
  <div class="seo-opportunity-grid">
    <div class="seo-opportunity-copy">
      <p class="eyebrow dark">Intention differenciee</p>
      <h2>Le role exact de cette page dans le cluster ${esc(target.profile.label)}.</h2>
      <p class="large-copy">Cette page traite ${esc(role.intent)}. Elle ne remplace pas ${esc(target.primary.replace(/[/-]+/g, " "))}: elle sert a ${esc(role.job)}.</p>
      <ul class="check-list">
        <li>Termes proches surveilles: ${esc(terms)}.</li>
        <li>Angle a proteger: ${esc(target.profile.focus)}.</li>
        <li>Suite logique: renvoyer vers la page primaire ou le devis quand le besoin devient concret.</li>
      </ul>
    </div>
    <div class="seo-opportunity-side">
      <div class="seo-link-panel">
        <strong>Maillage anti-cannibalisation</strong>
        ${links.map(([href, label]) => `<a href="${esc(href)}">${esc(label)}</a>`).join("")}
      </div>
      <div class="faq-list compact-faq">
        <details><summary>Pourquoi cette page existe-t-elle en plus de la page primaire ?</summary><p>Elle isole une intention plus precise pour eviter de melanger information, comparaison et demande de devis.</p></details>
        <details><summary>Quand passer a l'etape suivante ?</summary><p>Lorsque le visiteur connait son statut, ses documents et son urgence, le lien de devis ou la page primaire prend le relais.</p></details>
      </div>
    </div>
  </div>
</section>
${END}`;
}

function insertBeforeMainEnd(html, block) {
  if (!html.includes("</main>")) return html;
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function readReport() {
  if (!existsSync(REPORT_FILE)) return null;
  return JSON.parse(readFileSync(REPORT_FILE, "utf8"));
}

function buildTargets(report) {
  const targets = new Map();
  const items = (report?.watchlist || []).filter((item) => item.risk === "high" || (item.risk === "medium" && Number(item.score || 0) >= 54));
  for (const item of items.slice(0, 36)) {
    const slug = chooseSecondary(item);
    if (!slug || !existsSync(fileForSlug(slug))) continue;
    const profile = clusterProfiles[item.cluster] || {
      label: item.cluster || "assurance immeuble",
      primary: item.primary_slug || "assurance-immeuble",
      quote: "/devis-assurance-immeuble",
      focus: "clarifier l'intention de recherche et le maillage interne"
    };
    const primary = item.primary_slug || profile.primary;
    const existing = targets.get(slug) || { slug, cluster: item.cluster, profile, primary, related: [], sharedTerms: [], conflicts: [] };
    for (const page of item.pages || []) {
      if (page !== slug && !existing.related.includes(page)) existing.related.push(page);
    }
    for (const term of item.shared_terms || []) {
      if (!existing.sharedTerms.includes(term)) existing.sharedTerms.push(term);
    }
    existing.conflicts.push({ risk: item.risk, score: item.score, pages: item.pages || [], primary_slug: primary });
    targets.set(slug, existing);
  }
  return [...targets.values()].sort((a, b) => b.conflicts.length - a.conflicts.length || a.slug.localeCompare(b.slug));
}

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });

const report = readReport();
const targets = buildTargets(report);
const targetMap = new Map(targets.map((target) => [target.slug, target]));
const pages = walk(PUBLIC_DIR).map((file) => {
  const slug = slugFromFile(file);
  const original = readFileSync(file, "utf8");
  const cleaned = removeBlock(original);
  const target = targetMap.get(slug);
  const title = titleOf(cleaned, slug);
  const html = target ? insertBeforeMainEnd(cleaned, blockFor(target, title)) : cleaned;
  if (html !== original) writeFileSync(file, html, "utf8");
  return {
    slug,
    url: pageUrl(slug),
    changed: html !== original,
    differentiated: Boolean(target),
    conflicts_addressed: target?.conflicts.length || 0,
    primary_slug: target?.primary || ""
  };
});

const differentiated = pages.filter((page) => page.differentiated);
const changed = pages.filter((page) => page.changed);
const output = {
  generated_at: new Date().toISOString(),
  status: "passed",
  source_report_generated_at: report?.generated_at || "",
  pages_checked: pages.length,
  target_pages: differentiated.length,
  pages_changed: changed.length,
  pages_changed_this_run: changed.length,
  pages_with_active_blocks: differentiated.length,
  conflicts_addressed: differentiated.reduce((sum, page) => sum + page.conflicts_addressed, 0),
  safeguards: ["visible-content-only", "no-hidden-keyword-blocks", "no-google-scraping", "links-secondary-to-primary-intent", "idempotent-marker"],
  pages: differentiated
};

writeFileSync(join(REPORT_DIR, "seo-intent-differentiation-report.json"), JSON.stringify(output, null, 2), "utf8");
writeFileSync(join(PUBLIC_DIR, "assets", "seo-intent-differentiation-latest.json"), JSON.stringify({
  generated_at: output.generated_at,
  status: output.status,
  target_pages: output.target_pages,
  pages_changed: output.pages_changed,
  pages_changed_this_run: output.pages_changed_this_run,
  pages_with_active_blocks: output.pages_with_active_blocks,
  conflicts_addressed: output.conflicts_addressed,
  safeguards: output.safeguards,
  pages: output.pages.slice(0, 30)
}, null, 2), "utf8");

console.log(`SEO intent differentiation confirmed ${output.pages_with_active_blocks} active page(s), changed ${output.pages_changed_this_run}, addressed ${output.conflicts_addressed} overlap signal(s).`);
