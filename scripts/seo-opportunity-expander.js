import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const SITE = "https://immeubleassur.com";
const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const START = "<!-- seo-opportunity-expansion:start -->";
const END = "<!-- seo-opportunity-expansion:end -->";
const skipSlugs = new Set(["admin", "merci", "mentions-legales", "confidentialite"]);

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

function titleOf(html) {
  return stripHtml((html.match(/<title>(.*?)<\/title>/is) || [])[1] || "Assurance immeuble").replace(/\s+\|\s+ImmeubleAssur$/i, "");
}

function wordCount(html) {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).length : 0;
}

function isCitySlug(slug) {
  return slug.startsWith("assurance-immeuble-") && slug !== "assurance-immeuble-locatif";
}

function topic(slug, title) {
  if (!slug) return "assurance immeuble";
  if (slug.includes("cno") || slug.includes("coproprietaire-non-occupant")) return "assurance CNO coproprietaire non occupant";
  if (slug.includes("pno")) return "assurance PNO proprietaire non occupant";
  if (slug.includes("copro")) return "assurance copropriete";
  if (slug.includes("sci")) return "assurance SCI immobiliere";
  if (slug.includes("sinistre") || slug.includes("degat") || slug.includes("fuite")) return "sinistres immeuble";
  if (slug.includes("prix") || slug.includes("franchise")) return "prix et franchises assurance immeuble";
  if (slug.includes("commerce") || slug.includes("commercial") || slug.includes("mixte")) return "immeuble mixte et local commercial";
  if (slug.includes("travaux") || slug.includes("dommages") || slug.includes("renovation") || slug.includes("ravalement")) return "travaux et assurance immeuble";
  return title.toLowerCase();
}

function profile(slug, title) {
  const t = topic(slug, title);
  if (slug.startsWith("faq/")) {
    return {
      eyebrow: "FAQ specialisee",
      heading: `Reponses utiles avant devis ${t}.`,
      intro: "Une FAQ performante doit rapprocher la question de l'action: comprendre le risque, preparer les pieces et declencher une demande qualifiee.",
      bullets: ["Verifier l'usage exact du bien et l'occupation.", "Identifier les contrats deja en place.", "Comparer franchises, plafonds et exclusions.", "Preparer les documents avant rappel."],
      faqs: [
        ["Quand demander un devis ?", "Des qu'une echeance approche, qu'un sinistre a modifie le dossier ou qu'un lot devient vacant, loue ou transforme."],
        ["Qu'est-ce qui change le prix ?", "La surface, le nombre de lots, l'occupation, l'historique sinistre, les travaux, les franchises et les garanties demandees."],
        ["Comment obtenir une reponse plus rapide ?", "Transmettre adresse, contrat actuel, echeance, sinistres et situation du bien permet de qualifier le dossier sans aller-retour inutile."]
      ]
    };
  }
  if (slug.includes("cno") || slug.includes("pno")) {
    return {
      eyebrow: "PNO CNO",
      heading: "Passer d'une recherche prix a une comparaison de garanties.",
      intro: "Un dossier PNO/CNO doit expliquer qui occupe le lot, ce que couvre le contrat immeuble et quelles responsabilites restent au proprietaire.",
      bullets: ["Lot loue, vacant, meuble ou occupe gratuitement.", "Contrat occupant, contrat immeuble et garanties du proprietaire.", "Responsabilite civile, degat des eaux, incendie et recours.", "Echeance, sinistres et documents disponibles."],
      faqs: [
        ["PNO ou CNO: que choisir ?", "La CNO cible le coproprietaire non occupant. La PNO couvre plus largement le proprietaire non occupant selon le bien et l'occupation."],
        ["Un lot vacant doit-il etre signale ?", "Oui. La vacance peut changer les conditions de garantie, les exclusions et l'appetence assureur."],
        ["Le contrat immeuble suffit-il ?", "Pas toujours. Il faut verifier les parties communes, le lot privatif, l'occupant et la responsabilite du proprietaire."]
      ]
    };
  }
  if (slug.includes("copro")) {
    return {
      eyebrow: "Copropriete",
      heading: "Clarifier syndicat, syndic, lots privatifs et parties communes.",
      intro: "Une copropriete bien presentee aide l'assureur a comprendre le batiment, les responsabilites, les sinistres et les travaux votes ou prevus.",
      bullets: ["Nombre de lots, surface et usage des parties communes.", "PV d'AG, contrat actuel et appel de prime.", "Historique sinistres, mesures correctives et travaux.", "RC du syndicat, dommages, protection juridique et franchises."],
      faqs: [
        ["Quels documents sont prioritaires ?", "Contrat actuel, dernier appel de prime, sinistres, lots, surfaces et informations sur les travaux."],
        ["Pourquoi presenter les travaux ?", "Les travaux votes ou prevus peuvent rassurer l'assureur ou modifier les garanties utiles."],
        ["Le syndic benevole est-il concerne ?", "Oui. Il doit disposer d'un contrat lisible et d'une responsabilite correctement encadree."]
      ]
    };
  }
  if (slug.includes("sci")) {
    return {
      eyebrow: "SCI et patrimoine",
      heading: "Organiser les contrats autour du patrimoine reel.",
      intro: "Une SCI peut detenir un immeuble entier, plusieurs lots ou des locaux mixtes. Le bon contrat depend de cette organisation patrimoniale.",
      bullets: ["Liste des biens, lots, villes et usages.", "Contrats PNO, immeuble, occupant et local commercial.", "Sinistres, travaux et echeances par bien.", "Arbitrage entre regroupement, audit et garanties dediees."],
      faqs: [
        ["Faut-il regrouper les lots ?", "Cela depend du portefeuille, des assureurs disponibles et de la coherence des garanties recherchees."],
        ["Pourquoi auditer l'existant ?", "L'audit revele les doublons, exclusions et franchises qui peuvent fragiliser le patrimoine."],
        ["Quels profils sont concernes ?", "SCI familiale, SCI patrimoniale, bailleur multi-lots et administrateur de biens." ]
      ]
    };
  }
  return {
    eyebrow: "Decision assurance",
    heading: `Construire un dossier solide pour ${t}.`,
    intro: "Le contenu utile doit aider le visiteur a comprendre son risque et a transmettre les informations qui permettront une reponse assureur exploitable.",
    bullets: ["Adresse, surface, nombre de lots et usage du batiment.", "Contrat actuel, echeance et garanties presentes.", "Sinistres des 36 derniers mois et mesures correctives.", "Travaux prevus, locaux mixtes, vacance ou particularites."],
    faqs: [
      ["Pourquoi le prix seul ne suffit pas ?", "Deux contrats proches en prime peuvent etre tres differents en franchises, exclusions, plafonds et gestion sinistre."],
      ["Quelles pieces accelerent le rappel ?", "Contrat actuel, appel de prime, sinistres, adresse, lots, surface et usage du bien."],
      ["Quel est le bon moment pour consulter ?", "Avant l'echeance, apres un sinistre, lors de travaux ou quand l'occupation du bien change."]
    ]
  };
}

function linksFor(slug) {
  const base = [
    ["Devis immeuble", "/devis-assurance-immeuble"],
    ["PNO CNO", "/assurance-pno-cno"],
    ["Comparer", "/comparateur-assurance-immeuble"],
    ["Documents", "/checklist-documents-assurance-immeuble"]
  ];
  if (slug.includes("pno") || slug.includes("cno")) return [["Devis PNO CNO", "/devis-pno-cno"], ["Assurance CNO", "/assurance-cno"], ["FAQ PNO", "/faq/pno"], ["Comparer", "/comparateur-assurance-immeuble"]];
  if (slug.includes("copro")) return [["Assurance copropriete", "/assurance-copropriete"], ["Guide copropriete", "/guide-assurance-copropriete-2026"], ["RC syndic", "/rc-syndic"], ["Devis", "/devis-assurance-immeuble"]];
  if (slug.includes("sci")) return [["Assurance SCI", "/assurance-sci"], ["PNO CNO", "/assurance-pno-cno"], ["Audit contrat", "/audit-contrat-assurance-immeuble"], ["Devis", "/devis-assurance-immeuble?intent=sci"]];
  return base;
}

function expansionBlock(slug, title, beforeWords) {
  const data = profile(slug, title);
  const links = linksFor(slug);
  return `${START}
<section class="band seo-opportunity-expansion" aria-label="Approfondissement ${esc(title)}">
  <div class="seo-opportunity-grid">
    <div class="seo-opportunity-copy">
      <p class="eyebrow dark">${esc(data.eyebrow)}</p>
      <h2>${esc(data.heading)}</h2>
      <p class="large-copy">${esc(data.intro)}</p>
      <ul class="check-list">${data.bullets.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      <p>Cette synthese ajoute une lecture operationnelle: intention du demandeur, donnees a collecter, arbitrage garanties-prix et lien direct vers le parcours qui transforme la visite en dossier qualifie.</p>
    </div>
    <div class="seo-opportunity-side">
      <div class="seo-link-panel">
        <strong>Parcours associes</strong>
        ${links.map(([label, href]) => `<a href="${esc(href)}">${esc(label)}</a>`).join("")}
      </div>
      <div class="faq-list compact-faq">${data.faqs.map(([question, answer]) => `<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join("")}</div>
    </div>
  </div>
  <p class="seo-expansion-note">Page renforcee automatiquement apres audit de profondeur: ${beforeWords} mots avant extension.</p>
</section>
${END}`;
}

function removeExpansion(html) {
  return html.replace(new RegExp(`${START}[\\s\\S]*?${END}\\s*`, "g"), "");
}

function insertBeforeMainEnd(html, block) {
  if (!html.includes("</main>")) return html;
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function shouldExpand(slug, words) {
  if (skipSlugs.has(slug)) return false;
  if (slug.startsWith("faq/")) return true;
  if (["faq", "blog", "guides", "villes", "contact", "devis-assurance-immeuble", "devis-pno-cno", "comparateur-assurance-immeuble", "checklist-documents-assurance-immeuble"].includes(slug)) return true;
  if (isCitySlug(slug)) return words < 620;
  return words < 760;
}

function enhanceFile(file) {
  const slug = slugFromFile(file);
  const original = readFileSync(file, "utf8");
  const cleaned = removeExpansion(original);
  const title = titleOf(cleaned);
  const beforeWords = wordCount(cleaned);
  let html = cleaned;
  let expanded = false;
  if (shouldExpand(slug, beforeWords)) {
    html = insertBeforeMainEnd(cleaned, expansionBlock(slug, title, beforeWords));
    expanded = true;
  }
  if (html !== original) writeFileSync(file, html, "utf8");
  return {
    slug: slug || "index",
    url: `${SITE}${slug ? `/${slug}` : "/"}`,
    before_words: beforeWords,
    after_words: wordCount(html),
    expanded,
    changed: html !== original
  };
}

mkdirSync(REPORT_DIR, { recursive: true });
const pages = walk(PUBLIC_DIR).map(enhanceFile);
const expanded = pages.filter((page) => page.expanded);
const report = {
  generated_at: new Date().toISOString(),
  pages_checked: pages.length,
  pages_expanded: expanded.length,
  words_added_estimate: expanded.reduce((sum, page) => sum + Math.max(0, page.after_words - page.before_words), 0),
  safeguards: ["idempotent-markers", "legal-pages-skipped", "no-serp-scraping", "decision-useful-content"],
  pages: expanded
};
writeFileSync(join(REPORT_DIR, "seo-opportunity-expansion-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`SEO opportunity expander checked ${pages.length} pages, expanded ${expanded.length} pages.`);
