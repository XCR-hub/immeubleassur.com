import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { quoteHref } from "./site-navigation.js";

const subjects = {
  "assurance-immeuble": "Votre immeuble",
  "multirisque-immeuble": "Multirisque immeuble",
  "assurance-copropriete": "Votre copropriété",
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
  if (slug === "devis-assurance-immeuble") {
    const select = html.match(/<select\b[^>]*name="property_type"[^>]*>[\s\S]*?<\/select>/);
    if (!select) throw new Error('The quote property selector is missing');
    if (select[0].includes('value="immeuble-vacant"')) return html;
    return html.replace(select[0], select[0].replace('</select>', '<option value="immeuble-vacant">Immeuble entièrement vacant</option></select>'));
  }
  const subject = subjects[slug];
  if (!subject) return html;
  if (!html.includes('id="lead-form"')) throw new Error(`${slug}: the detailed form is missing`);
  const section = html.match(/<section\b[^>]*class="[^"]*\bpage-hero\b[^"]*"[^>]*>[\s\S]*?<\/section>/);
  if (!section) throw new Error(`${slug}: the service hero is missing`);
  const actions = /<div\b[^>]*class="[^"]*\bhero-actions\b[^"]*"[^>]*>[\s\S]*?<\/div>/;
  if (!actions.test(section[0]) && slug !== "comparateur-assurance-immeuble") throw new Error(`${slug}: the service actions are missing`);
  const href = quoteHref(`/${slug}`).replaceAll("&", "&amp;");
  const guide = slug === "assurance-immeuble-vacant" ? ' <a href="/blog/assurance-immeuble-vacant">Lire le guide sur l’immeuble vacant.</a>' : '';
  const replacement = `<div class="hero-actions"><a class="button primary" data-track="service-quote-start" data-short-quote-entry data-quote-subject="${subject}" href="${href}">Demander un devis</a><a class="button secondary" data-track="service-full-form" href="#lead-form">Formulaire complet</a></div>\n        <p data-quote-entry-note>Un téléphone ou un email suffit pour démarrer. Un conseiller précisera votre besoin avec vous.${guide}</p>`;
  const clean = section[0].replace(/\s*<p\b[^>]*data-quote-entry-note[^>]*>[\s\S]*?<\/p>/g, "");
  const hero = actions.test(clean) ? clean.replace(actions, replacement) : clean.replace('</section>', `<div class="container">${replacement}</div></section>`);
  return html.replace(section[0], hero);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let changed = 0;
  const targets = [...Object.keys(subjects), 'devis-assurance-immeuble'];
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
