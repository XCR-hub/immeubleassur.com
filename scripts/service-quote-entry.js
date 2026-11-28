import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { quoteHref, renderSiteNavigation } from "./site-navigation.js";
import { improveCoproprieteQuoteGuidance } from "./copropriete-quote-guidance.js";
import { improveHomepageSearchGuidance } from "./homepage-search-guidance.js";
import { improveContactRiskQuoteGuidance } from "./contact-risk-quote-guidance.js";
import { improveQuoteLandingGuidance } from "./quote-landing-guidance.js";
import { improveSciQuoteGuidance } from "./sci-quote-guidance.js";
import { addQuoteContactFallback } from "./quote-contact-fallback.js";
import { addQuoteContactHandoff } from "./quote-contact-handoff.js";

const subjects = {
  "contact": "Votre demande de devis",
  "assurance-local-commercial": "Votre immeuble avec commerce",
  "assurance-immeuble-resilie": "Votre contrat résilié",
  "assurance-immeuble-sinistre": "Votre immeuble avec sinistres",
  "assurance-immeuble": "Votre immeuble",
  "courtier-assurance-immeuble": "Votre assurance immeuble",
  "assurance-immeuble-locatif": "Votre immeuble locatif",
  "dommages-ouvrage-immeuble": "Vos travaux d’immeuble",
  "multirisque-immeuble": "Multirisque immeuble",
  "assurance-copropriete": "Votre copropriété",
  "assurance-immeuble-syndic-professionnel": "Vos copropriétés",
  "assurance-sci": "Votre SCI",
  "assurance-pno": "Votre assurance PNO",
  "assurance-cno": "Votre assurance CNO",
  "assurance-pno-cno": "Votre assurance PNO / CNO",
  "assurance-garages-parkings": "Garages et parkings",
  "assurance-immeuble-vacant": "Immeuble entièrement vacant",
  "prix-assurance-immeuble": "Votre devis immeuble",
  "comparateur-assurance-immeuble": "Votre comparatif de devis",
  "tarif-assurance-immeuble": "Votre tarif immeuble",
  "audit-contrat-assurance-immeuble": "Votre contrat immeuble"
};

export function improveServiceQuoteEntry(html, slug) {
  if (["devis-pno-cno", "devis-assurance-immeuble-en-ligne"].includes(slug)) return improveQuoteLandingGuidance(html, slug, readFileSync(join("public", "devis-assurance-immeuble.html"), "utf8"));
  if (slug === "index") return improveHomepageSearchGuidance(html);
  if (slug === "devis-assurance-immeuble") {
    const select = html.match(/<select\b[^>]*name="property_type"[^>]*>[\s\S]*?<\/select>/);
    if (!select) throw new Error('The quote property selector is missing');
    let options = select[0];
    for (const [value, label] of [['lot-copropriete', 'Lot en copropriété'], ['logement-loue', 'Logement loué'], ['logement-vacant', 'Logement vacant'], ['immeuble-vacant', 'Immeuble entièrement vacant']]) {
      if (!options.includes(`value="${value}"`)) options = options.replace('</select>', `<option value="${value}">${label}</option></select>`);
    }
    return addQuoteContactHandoff(addQuoteContactFallback(html.replace(select[0], options)
      .replace(/<form\b[^>]*id="lead-form"[^>]*>/, tag => tag.includes('data-simple-form') ? tag : tag.replace('<form', '<form data-simple-form'))
      .replace(/(<a\b[^>]*href=")#devis("[^>]*>Remplir le formulaire complet<\/a>)/, '$1#lead-form$2')
      .replace(/<div class="hero-inline-callback"([^>]*)>/, (_, attributes) => `<div class="hero-inline-callback" id="quote-first-contact" style="scroll-margin-top:96px" tabindex="-1"${attributes.replace(/\s+(?:id|style|tabindex)="[^"]*"/g, '')}>`)
      .replace(/<header\b[^>]*class="site-header"[^>]*>[\s\S]*?<\/header>/, renderSiteNavigation(slug))));
  }
  const subject = subjects[slug];
  if (!subject) return html;
  if (!html.includes('id="lead-form"')) throw new Error(`${slug}: the detailed form is missing`);
  const section = html.match(/<section\b[^>]*class="[^"]*\bpage-hero\b[^"]*"[^>]*>[\s\S]*?<\/section>/);
  if (!section) throw new Error(`${slug}: the service hero is missing`);
  const actions = /<div\b[^>]*class="[^"]*\bhero-actions\b[^"]*"[^>]*>[\s\S]*?<\/div>/;
  if (!actions.test(section[0]) && !["comparateur-assurance-immeuble", "contact"].includes(slug)) throw new Error(`${slug}: the service actions are missing`);
  const href = quoteHref(`/${slug}`).replaceAll("&", "&amp;");
  const guide = slug === "assurance-immeuble-vacant" ? ' <a href="/blog/assurance-immeuble-vacant">Lire le guide sur l’immeuble vacant.</a>' : '';
  const replacement = `<div class="hero-actions"><a class="button primary" data-track="service-quote-start" data-short-quote-entry data-quote-subject="${subject}" href="${href}">Demander un devis</a><a class="button secondary" data-track="service-full-form" href="#lead-form">Formulaire complet</a></div>\n        <p data-quote-entry-note>Un téléphone ou un email suffit pour démarrer. Un conseiller précisera votre besoin avec vous.${guide}</p>`;
  const clean = section[0].replace(/\s*<p\b[^>]*data-quote-entry-note[^>]*>[\s\S]*?<\/p>/g, "");
  const hero = actions.test(clean) ? clean.replace(actions, replacement) : clean.replace('</section>', `<div class="container">${replacement}</div></section>`);
  const readingPage = ["courtier-assurance-immeuble", "assurance-immeuble-locatif", "dommages-ouvrage-immeuble", "contact", "assurance-local-commercial", "assurance-immeuble-resilie", "assurance-immeuble-sinistre"].includes(slug);
  const readableHero = readingPage && !hero.includes('data-article-reading') ? hero.replace('<section', '<section data-article-reading') : hero;
  let next = html.replace(section[0], readableHero);
  if (slug === "assurance-immeuble-syndic-professionnel") {
    next = next.replace(/<form\b[^>]*id="lead-form"[^>]*>/, tag => tag.replace(/\s+data-(?:simple-form|default-intent)(?:="[^"]*")?/g, '').replace('<form', '<form data-simple-form data-default-intent="copropriete"'));
  }
  return slug === "assurance-copropriete" ? improveCoproprieteQuoteGuidance(next) : slug === "assurance-sci" ? improveSciQuoteGuidance(next) : improveContactRiskQuoteGuidance(next, slug);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let changed = 0;
  const targets = ['index', ...Object.keys(subjects), 'devis-assurance-immeuble', 'devis-pno-cno', 'devis-assurance-immeuble-en-ligne'];
  for (const slug of targets) {
    const file = join("public", `${slug}.html`);
    if (!existsSync(file)) throw new Error(`${slug}: the service page is missing`);
    const html = readFileSync(file, "utf8");
    const next = improveServiceQuoteEntry(html, slug);
    if (next === html) continue;
    writeFileSync(file, next);
    changed++;
  }
  console.log(`Short quote entry: ${targets.length} pages checked, ${changed} updated.`);
}
