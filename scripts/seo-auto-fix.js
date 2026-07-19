import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

const SITE = "https://immeubleassur.com";
const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const BRAND = "ImmeubleAssur";
const TITLE_SUFFIX = ` | ${BRAND}`;
const skipSlugs = new Set(["admin"]);
const legalSlugs = new Set(["mentions-legales", "confidentialite"]);

const titleOverrides = new Map([
  ["mentions-legales", "Mentions legales courtier immeuble"],
  ["confidentialite", "Confidentialite des demandes immeuble"],
  ["guides", "Guides assurance immeuble et copropriete"],
  ["villes", "Assurance immeuble par ville et devis"],
  ["faq/pno", "FAQ assurance PNO bailleur copropriete"],
  ["faq/sci", "FAQ assurance SCI immeuble locatif"],
  ["blog/cno-coproprietaire-non-occupant-obligatoire", "CNO coproprietaire non occupant"],
  ["blog/assurance-copropriete-obligatoire", "Assurance copropriete obligatoire"],
  ["blog/assurance-immeuble-ancien", "Assurance immeuble ancien"],
  ["blog/assurance-immeuble-mixte-commerce", "Assurance immeuble mixte commerce"],
  ["blog/assurance-immeuble-apres-refus-assureur", "Refus assurance immeuble"],
  ["blog/assurance-immeuble-avec-ascenseur", "Assurance immeuble avec ascenseur"],
  ["blog/assurance-immeuble-protection-du-patrimoine", "Assurance immeuble patrimoine"],
  ["blog/copropriete-petite-syndic-benevole", "Petite copropriete syndic benevole"],
  ["blog/franchise-degat-des-eaux-immeuble", "Franchise degat des eaux immeuble"],
  ["blog/immeuble-mixte-restaurant", "Immeuble avec restaurant"],
  ["blog/infiltration-toiture-terrasse", "Infiltration toiture terrasse"],
  ["blog/local-commercial-vacant", "Local commercial vacant"],
  ["blog/pertes-de-loyers-immeuble", "Pertes de loyers immeuble"],
  ["blog/pno-obligatoire-copropriete", "PNO obligatoire copropriete"],
  ["blog/prix-assurance-immeuble-au-m2", "Prix assurance immeuble au m2"],
  ["blog/ravalement-toiture-travaux-assurance", "Toiture ravalement et assurance"],
  ["blog/renovation-energetique-copropriete-assurance", "Renovation energetique copropriete"],
  ["blog/sci-familiale-immeuble", "SCI familiale immeuble locatif"],
  ["blog/sinistres-recurrents-immeuble", "Sinistres recurrents immeuble"]
]);

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
  if (rel === "index.html") return "";
  return rel.replace(/\.html$/, "");
}

function urlFor(slug) {
  return `${SITE}${slug ? `/${slug}` : "/"}`;
}

function readMeta(html, pattern, fallback = "") {
  return ((html.match(pattern) || [])[1] || fallback).trim();
}

function trimWords(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1).replace(/\s+\S*$/, "").replace(/[,:;\s]+$/, "");
  return cut.length >= 20 ? cut : clean.slice(0, max).trim();
}

const weakEndWords = new Set(["a", "au", "aux", "avec", "chez", "dans", "de", "des", "du", "en", "et", "la", "le", "les", "ne", "ou", "pour", "sans", "sur", "un", "une"]);

function titleFromSlug(slug) {
  const source = slug ? slug.split("/").pop() : "assurance-immeuble";
  return source
    .split("-")
    .filter(Boolean)
    .map((word) => (word.length <= 3 && word !== "avec" ? word.toUpperCase() : `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`))
    .join(" ")
    .replace(/\bPno\b/g, "PNO")
    .replace(/\bCno\b/g, "CNO")
    .replace(/\bSci\b/g, "SCI");
}

function cleanWeakEnding(value, slug, maxBase) {
  let clean = String(value || "").replace(/\s+/g, " ").replace(/[,:;\s]+$/, "").trim();
  const last = clean.split(/\s+/).pop()?.toLowerCase() || "";
  if (weakEndWords.has(last)) clean = titleOverrides.get(slug) || titleFromSlug(slug);
  if (clean.length > maxBase) clean = trimWords(clean, maxBase).replace(/[,:;\s]+$/, "");
  return clean;
}

function closeMetaSentence(value) {
  let clean = String(value || "").replace(/\s+/g, " ").replace(/\s+([.,;:])/g, "$1").replace(/[,:;\s]+$/, "").trim();
  let words = clean.split(/\s+/).filter(Boolean);
  while (words.length > 3 && weakEndWords.has(words[words.length - 1].replace(/[.?!]$/, "").toLowerCase())) words = words.slice(0, -1);
  clean = words.join(" ").replace(/[,:;\s]+$/, "");
  if (!/[.!?]$/.test(clean)) clean += ".";
  if (clean.length < 120) clean = `${clean.replace(/[.\s]*$/, ".")} Devis et rappel par un courtier specialise immeuble.`;
  if (clean.length > 170) clean = `${trimWords(clean, 166).replace(/[,:;\s]+$/, "")}.`;
  return clean;
}

function humanTopic(slug, title) {
  if (!slug) return "assurance immeuble";
  if (slug.includes("cno")) return "assurance CNO coproprietaire non occupant";
  if (slug.includes("pno")) return "assurance PNO proprietaire non occupant";
  if (slug.includes("copro")) return "assurance copropriete";
  if (slug.includes("sci")) return "assurance SCI";
  if (slug.includes("sinistre") || slug.includes("degat") || slug.includes("fuite")) return "sinistres immeuble";
  if (slug.includes("commerce") || slug.includes("commercial")) return "immeuble avec local commercial";
  if (slug.includes("prix") || slug.includes("franchise")) return "prix et franchises assurance immeuble";
  if (slug.includes("dommages") || slug.includes("travaux") || slug.includes("renovation")) return "travaux et assurance immeuble";
  if (slug.startsWith("assurance-immeuble-")) return `assurance immeuble ${title.replace(/\s+\|\s+ImmeubleAssur$/, "")}`;
  return title.replace(/\s+\|\s+ImmeubleAssur$/, "").toLowerCase();
}

function normalizeTitle(rawTitle, slug) {
  const maxBase = 72 - TITLE_SUFFIX.length;
  let base = titleOverrides.get(slug) || stripHtml(rawTitle).replace(/\s+\|\s+ImmeubleAssur$/i, "").trim();
  if (!base) base = slug ? slug.replace(/[/-]+/g, " ") : "Assurance immeuble et copropriete";
  base = base.replace(/\s+/g, " ").trim();
  if (base.length > maxBase) base = trimWords(base, maxBase);
  base = cleanWeakEnding(base, slug, maxBase);
  if (`${base}${TITLE_SUFFIX}`.length < 35) base = `${base}: devis et garanties`;
  if (base.length > maxBase) base = trimWords(base, maxBase);
  base = cleanWeakEnding(base, slug, maxBase);
  return `${base}${TITLE_SUFFIX}`;
}

function normalizeDescription(rawDescription, slug, title) {
  const topic = humanTopic(slug, title);
  let description = stripHtml(rawDescription).replace(/\s+/g, " ").trim();
  if (!description) description = `${BRAND} accompagne les demandes de ${topic}.`;
  if (description.length < 120) {
    const suffix = " Analyse des garanties, franchises, sinistres, documents utiles et rappel pour obtenir un devis specialise.";
    description = `${description.replace(/[.\s]*$/, ".")}${suffix}`;
  }
  if (description.length < 120) description = `${description} Service dedie aux syndics, SCI, bailleurs et coproprietaires non occupants.`;
  if (description.length > 170) description = trimWords(description, 162).replace(/[,:;\s]+$/, "") + ".";
  return description;
}

function setHeadMeta(html, { title, description, slug }) {
  let next = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  if (/<meta name="description" content="[^"]*" \/>/i.test(next)) {
    next = next.replace(/<meta name="description" content="[^"]*" \/>/i, `<meta name="description" content="${esc(description)}" />`);
  } else {
    next = next.replace(/<title>[\s\S]*?<\/title>/i, `<meta name="description" content="${esc(description)}" />\n    <title>${esc(title)}</title>`);
  }
  next = next.replace(/<meta property="og:title" content="[^"]*" \/>/i, `<meta property="og:title" content="${esc(title)}" />`);
  next = next.replace(/<meta property="og:description" content="[^"]*" \/>/i, `<meta property="og:description" content="${esc(description)}" />`);
  next = next.replace(/<meta property="og:url" content="[^"]*" \/>/i, `<meta property="og:url" content="${urlFor(slug)}" />`);
  next = next.replace(/<link rel="canonical" href="[^"]*" \/>/i, `<link rel="canonical" href="${urlFor(slug)}" />`);
  return next;
}

function topicProfile(slug, title) {
  const topic = humanTopic(slug, title);
  if (legalSlugs.has(slug)) {
    return {
      eyebrow: "Confiance et conformite",
      heading: slug === "confidentialite" ? "Traitement clair des demandes transmises." : "Informations utiles avant contact.",
      intro: `Cette page precise le cadre ${BRAND} afin que les visiteurs identifient le service, le contact et l'usage des informations transmises.`,
      proof: ["Contact direct par email ou telephone.", "Demande traitee pour l'assurance immeuble uniquement.", "Informations indicatives avant analyse contractuelle."],
      questions: [
        ["Qui contacter pour une demande ?", "L'equipe ImmeubleAssur est joignable via le formulaire, par telephone ou par email pour qualifier le besoin."],
        ["Les informations du site remplacent-elles un contrat ?", "Non. Elles servent a preparer l'echange et doivent etre confirmees par l'analyse du dossier et des garanties."],
        ["Pourquoi transmettre des informations precises ?", "Un dossier clair permet de mieux identifier les garanties utiles, les exclusions et les pieces attendues."]
      ]
    };
  }
  if (slug.includes("cno") || slug.includes("pno")) {
    return {
      eyebrow: "PNO CNO",
      heading: "Qualifier le lot avant de comparer le prix.",
      intro: `Pour une recherche ${topic}, la situation du lot change tout: logement loue, vacant, occupe gratuitement, copropriete ou portefeuille SCI.`,
      proof: ["Responsabilite civile du proprietaire non occupant.", "Coherence avec assurance occupant et contrat immeuble.", "Controle des exclusions de vacance et franchises."],
      questions: [
        ["PNO et CNO couvrent-elles le meme besoin ?", "Elles se rejoignent sur la protection du non occupant, mais la CNO cible le coproprietaire non occupant et doit etre articulee avec la copropriete."],
        ["Quelles pieces preparer ?", "Adresse, usage du lot, bail ou vacance, contrat actuel, sinistres recents et echeance facilitent une reponse rapide."],
        ["Pourquoi passer par un courtier specialise ?", "Le courtier presente le risque aux assureurs et compare les garanties au-dela du simple montant de prime."]
      ]
    };
  }
  if (slug.includes("copro")) {
    return {
      eyebrow: "Copropriete",
      heading: "Rendre le dossier lisible pour syndic et assureur.",
      intro: `Un sujet ${topic} doit distinguer syndicat, coproprietaires, parties communes, lots privatifs et responsabilites.`,
      proof: ["RC du syndicat et garanties dommages.", "Pieces AG, sinistres, lots et travaux.", "Lecture des franchises degats des eaux."],
      questions: [
        ["Que verifie-t-on en priorite ?", "La responsabilite civile, les dommages aux parties communes, les franchises et les exclusions liees au batiment."],
        ["Le syndic doit-il fournir des pieces ?", "Oui, le contrat actuel, les sinistres, les lots, les surfaces et travaux prevus aident a consulter correctement."],
        ["Le prix suffit-il pour choisir ?", "Non. Il faut comparer les franchises, plafonds, exclusions et la capacite de gestion sinistre."]
      ]
    };
  }
  if (slug.includes("sci")) {
    return {
      eyebrow: "SCI",
      heading: "Eviter les doublons et les trous de garantie.",
      intro: `Une ${topic} peut concerner un immeuble entier, plusieurs lots ou des locaux mixtes. La vision portefeuille aide a mieux arbitrer.`,
      proof: ["Contrats PNO, immeuble et occupants coordonnes.", "Lots regroupes ou disperses documentes.", "Sinistres et travaux integres a la consultation."],
      questions: [
        ["Une SCI doit-elle tout regrouper ?", "Pas toujours. Le bon montage depend des lots, de l'occupation, des baux et des contrats existants."],
        ["Quels risques sont sensibles ?", "Vacance, locaux commerciaux, sinistres recurrents, travaux et incoherences entre contrats."],
        ["Pourquoi auditer les contrats ?", "L'audit identifie les doublons, exclusions et franchises qui peuvent fragiliser le patrimoine."]
      ]
    };
  }
  return {
    eyebrow: "Analyse assurance immeuble",
    heading: "Transformer la recherche en dossier assureur exploitable.",
    intro: `Pour ${topic}, la reponse utile depend de l'usage du bien, des lots, de l'entretien, des sinistres et des garanties deja en place.`,
    proof: ["Description du batiment, de l'occupation et des lots.", "Franchises, plafonds, exclusions et garanties utiles.", "Documents assureur prepares avant mise en concurrence."],
    questions: [
      ["Quels elements accelerent le devis ?", "Adresse, nombre de lots, surface, usage, contrat actuel, echeance et sinistres des 36 derniers mois."],
      ["Pourquoi parler des sinistres ?", "Un historique explique et documente permet de defendre le dossier et d'eviter les refus automatiques."],
      ["Comment comparer deux offres ?", "Il faut lire la prime avec les franchises, plafonds, exclusions, garanties de recours et service sinistre."]
    ]
  };
}

function buildDepthSection(slug, title) {
  const profile = topicProfile(slug, title);
  return `<!-- auto-seo-depth:start -->
<section class="band auto-seo-depth">
  <div class="container auto-seo-grid">
    <div>
      <p class="eyebrow dark">${esc(profile.eyebrow)}</p>
      <h2>${esc(profile.heading)}</h2>
      <p class="large-copy">${esc(profile.intro)}</p>
      <p>ImmeubleAssur privilegie une qualification concrete: contexte du bien, responsabilites, historique sinistre, travaux, contrat actuel et attentes du demandeur. Cette lecture evite les comparaisons superficielles et aide a obtenir une proposition exploitable.</p>
      <ul class="check-list">${profile.proof.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
    </div>
    <div class="faq-list">${profile.questions.map(([question, answer]) => `<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join("")}</div>
  </div>
</section>
<!-- auto-seo-depth:end -->`;
}

function buildConversionSection(slug, title) {
  const topic = humanTopic(slug, title);
  return `<!-- auto-conversion:start -->
<section class="band auto-conversion-band">
  <div class="auto-conversion-panel">
    <div>
      <p class="eyebrow">Devis specialise</p>
      <h2>Faire analyser votre besoin ${esc(topic)}.</h2>
      <p>Un courtier ImmeubleAssur vous rappelle avec les informations utiles pour comparer garanties, franchises et documents attendus.</p>
    </div>
    <div class="hero-actions"><a class="button primary" data-track="auto-conversion-devis" href="/devis-pno-cno">Demander un devis</a><a class="button secondary" data-track="auto-conversion-contact" href="/contact">Contact</a></div>
  </div>
</section>
<!-- auto-conversion:end -->`;
}

function removeAutoBlocks(html) {
  return html
    .replace(/<!-- auto-seo-depth:start -->[\s\S]*?<!-- auto-seo-depth:end -->\s*/g, "")
    .replace(/<!-- auto-conversion:start -->[\s\S]*?<!-- auto-conversion:end -->\s*/g, "");
}

function insertBeforeMainEnd(html, block) {
  if (!html.includes("</main>")) return html;
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function hasStrongConversion(html) {
  return html.includes('id="lead-form"') || html.includes('class="button primary"') || html.includes("submit-button");
}

function enhanceFile(file) {
  const slug = slugFromFile(file);
  if (skipSlugs.has(slug)) return null;
  const original = readFileSync(file, "utf8");
  let html = removeAutoBlocks(original);
  const fixes = [];
  const currentTitle = readMeta(html, /<title>([\s\S]*?)<\/title>/i, BRAND);
  const normalizedTitle = normalizeTitle(currentTitle, slug);
  const currentDescription = readMeta(html, /<meta name="description" content="([^"]*)"/i, "");
  const normalizedDescription = normalizeDescription(currentDescription, slug, normalizedTitle);

  if (stripHtml(currentTitle) !== normalizedTitle) fixes.push("title-normalized");
  if (currentDescription !== normalizedDescription) fixes.push("description-normalized");
  html = setHeadMeta(html, { title: normalizedTitle, description: normalizedDescription, slug });

  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  const faqCount = [...html.matchAll(/<details>/gi)].length;
  if ((words < 520 || faqCount < 2) && !slug.startsWith("faq/") && slug !== "merci") {
    html = insertBeforeMainEnd(html, buildDepthSection(slug, normalizedTitle));
    fixes.push(words < 520 ? "content-depth" : "faq-depth");
  }

  if (!legalSlugs.has(slug) && slug !== "merci" && !hasStrongConversion(html)) {
    html = insertBeforeMainEnd(html, buildConversionSection(slug, normalizedTitle));
    fixes.push("conversion-panel");
  }

  if (html !== original) writeFileSync(file, html, "utf8");
  return {
    slug: slug || "index",
    url: urlFor(slug),
    fixes,
    title: normalizedTitle,
    description: normalizedDescription,
    changed: html !== original
  };
}

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(dirname(join(REPORT_DIR, "seo-auto-fix-report.json")), { recursive: true });
const pages = walk(PUBLIC_DIR).map(enhanceFile).filter(Boolean);
const changed = pages.filter((page) => page.changed);
const fixesApplied = changed.reduce((sum, page) => sum + page.fixes.length, 0);
const report = {
  generated_at: new Date().toISOString(),
  pages_checked: pages.length,
  pages_changed: changed.length,
  fixes_applied: fixesApplied,
  safeguards: ["idempotent-markers", "legal-pages-no-commercial-panel", "no-serp-scraping", "people-first-depth-sections"],
  pages: changed
};
writeFileSync(join(REPORT_DIR, "seo-auto-fix-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`SEO auto-fix checked ${pages.length} pages, changed ${changed.length}, applied ${fixesApplied} fixes.`);
