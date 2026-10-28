import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { insurerGuides } from '../content/insurer-guides.js';

const SITE = 'https://immeubleassur.com';
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const jsonLd = value => `<script type="application/ld+json">${JSON.stringify(value).replaceAll('<', '\\u003c')}</script>`;
export function renderInsurerGuide(guide, template) {
  const url = `${SITE}/${guide.slug}`;
  const header = template.match(/<header\b[^>]*class="site-header"[^>]*>[\s\S]*?<\/header>/)?.[0];
  const footer = template.match(/<footer\b[^>]*class="site-footer"[^>]*>[\s\S]*?<\/footer>/)?.[0];
  const styles = template.match(/<link\s+rel="stylesheet"[^>]*>/)?.[0];
  const app = template.match(/<script\b[^>]*src="\/assets\/app\.js[^>]*><\/script>/)?.[0];
  if (!header || !footer || !styles || !app) throw new Error('Site template is missing required navigation or assets.');
  const analytics = template.match(/<!-- analytics:start -->[\s\S]*?<!-- analytics:end -->/)?.[0] || '';
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', '@id': `${url}#faq`, mainEntity: guide.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const article = { '@context': 'https://schema.org', '@type': 'Article', '@id': `${url}#article`, headline: guide.title, description: guide.description, url, mainEntityOfPage: url, datePublished: guide.published, dateModified: guide.modified, inLanguage: 'fr-FR', author: { '@type': 'Organization', name: 'XCR (EXCELLENCE COVERAGE RISKS)' }, publisher: { '@type': 'Organization', name: 'ImmeubleAssur', url: SITE }, citation: guide.sources.map(s => s.url) };
  const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Accueil', '/'], ['Guides', '/guides'], [guide.title, `/${guide.slug}`]].map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })) };
  const sections = guide.sections.map((section, i) => `<section id="section-${i + 1}"><h2>${esc(section.title)}</h2>${section.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}${section.table ? `<div class="guide-table-wrap" role="region" aria-label="${esc(section.title)}" tabindex="0"><table class="guide-table"><thead><tr>${section.table.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map(row => `<tr>${row.map((cell, j) => j === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}${section.checklist ? `<ul>${section.checklist.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${section.sourceIds?.length ? `<p class="guide-source-ref">Références : ${section.sourceIds.map(id => `<a href="#source-${id}">${esc(guide.sources.find(s => s.id === id).label)}</a>`).join(' ; ')}.</p>` : ''}</section>`).join('\n');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="index, follow, max-image-preview:large" /><meta name="description" content="${esc(guide.description)}" />
<title>${esc(guide.title)} | ImmeubleAssur</title><link rel="canonical" href="${url}" />
<meta property="og:type" content="article" /><meta property="og:locale" content="fr_FR" /><meta property="og:site_name" content="ImmeubleAssur" /><meta property="og:url" content="${url}" /><meta property="og:title" content="${esc(guide.title)}" /><meta property="og:description" content="${esc(guide.description)}" />
<meta property="article:published_time" content="${guide.published}" /><meta property="article:modified_time" content="${guide.modified}" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />${styles}
${jsonLd(article)}${jsonLd(faq)}${jsonLd(breadcrumb)}${analytics}</head>
<body><a class="skip-link" href="#main-content">Aller au contenu principal</a>${header}<main id="main-content">
<article class="container insurer-guide"><nav aria-label="Fil d’Ariane"><a href="/">Accueil</a> / <a href="/guides">Guides</a> / ${esc(guide.category)}</nav>
<header class="article-head"><p class="eyebrow dark">Guide pratique · ${esc(guide.category)}</p><h1>${esc(guide.title)}</h1><p class="large-copy">${esc(guide.intro)}</p><p>Équipe XCR · Publié le <time datetime="${guide.published}">28 octobre 2026</time> · Sources consultées le 28 octobre 2026</p></header>
<nav class="guide-toc" aria-label="Sommaire"><strong>Dans ce guide</strong><ul>${guide.sections.map((s, i) => `<li><a href="#section-${i + 1}">${esc(s.title)}</a></li>`).join('')}</ul></nav>
${sections}<section class="faq-list" id="faq"><h2>Questions fréquentes</h2>${guide.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
<section class="source-box" aria-label="Sources documentaires"><h2>Documents consultés</h2>${guide.sources.map(s => `<div id="source-${s.id}"><a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a><p>${esc(s.note)}</p></div>`).join('')}<p>Ces explications aident à préparer une étude. Les références citées ne prouvent ni la disponibilité d’une offre pour votre bien ni l’acceptation d’un risque. Le devis et les documents contractuels applicables précisent les garanties retenues.</p><a href="/methodologie-editoriale">Notre méthode documentaire</a></section>
<section class="guide-related"><h2>Pour compléter votre dossier</h2><ul>${guide.related.map(([slug, label]) => `<li><a href="/${esc(slug)}">${esc(label)}</a></li>`).join('')}</ul></section>
<section class="plain-panel guide-cta"><h2>Faire relire les garanties de votre immeuble</h2><p>Décrivez le bâtiment et le point à vérifier. Nous pourrons demander les pièces utiles à l’étude et vous préciser les informations encore nécessaires.</p><a class="button primary" data-track="cta-primary" href="/devis-assurance-immeuble?intent=audit-contrat">Demander une étude du contrat</a><p>Votre bâtiment a déjà subi un sinistre ? <a href="/devis-assurance-immeuble?intent=sinistre">Préparer une étude après sinistre</a>.</p></section>
</article></main>${footer}${app}</body></html>\n`;
}

export function writeInsurerGuides(out = 'public') {
  const template = readFileSync(join(out, 'guides.html'), 'utf8');
  const files = [];
  for (const guide of insurerGuides) {
    const file = join(out, `${guide.slug}.html`);
    const html = renderInsurerGuide(guide, template);
    mkdirSync(out, { recursive: true });
    if (!existsSync(file) || readFileSync(file, 'utf8') !== html) writeFileSync(file, html, 'utf8');
    files.push(file);
  }
  return files;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(`Wrote ${writeInsurerGuides().length} documented insurer reading guides.`);
