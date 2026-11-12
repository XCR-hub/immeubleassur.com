import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { insurerGuides } from '../content/insurer-guides.js';
import { quoteHref } from './site-navigation.js';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const legacyGuides = [
  { slug: 'checklist-documents-assurance-immeuble', title: 'Documents à réunir pour un devis immeuble', description: 'Retrouvez les informations sur le bâtiment, le contrat actuel, les sinistres et les travaux à rassembler pour préparer une étude.' },
  { slug: 'guide-assurance-copropriete-2026', title: 'Comprendre les assurances de la copropriété', description: 'Distinguez le contrat du syndicat, la responsabilité du syndic et l’assurance des copropriétaires avant le renouvellement.' },
  { slug: 'comparateur-assurance-immeuble', title: 'Comparer deux devis d’assurance immeuble', description: 'Comparez vos cotisations et franchises absolues avec un calcul privé, puis repérez les garanties et limites à relire.' }
];
const bySlug = new Map([...insurerGuides, ...legacyGuides].map(guide => [guide.slug, guide]));
export const guideGroups = [
  { id: 'preparer-un-dossier', title: 'Préparer un dossier', introduction: 'Vous souhaitez assurer un bien ou préparer son renouvellement.', slugs: ['checklist-documents-assurance-immeuble', 'guide-questionnaire-visite-risque-immeuble', 'guide-assurance-copropriete-2026'] },
  { id: 'comparer-un-contrat', title: 'Lire et comparer un contrat', introduction: 'Vous avez une offre ou un contrat et souhaitez comprendre ce qu’il prévoit.', slugs: ['guide-lire-documents-assurance-immeuble', 'comparateur-assurance-immeuble', 'guide-indemnisation-vetuste-immeuble'] },
  { id: 'comprendre-un-sinistre', title: 'Comprendre un sinistre', introduction: 'Vous cherchez les postes de dépenses et les justificatifs à distinguer.', slugs: ['guide-recherche-fuite-immeuble', 'guide-bris-machines-ascenseur-immeuble', 'guide-perte-loyers-sinistre-gli'] }
].map(group => ({ ...group, guides: group.slugs.map(slug => {
  const guide = bySlug.get(slug);
  if (!guide) throw new Error(`Unknown guide: ${slug}`);
  return guide;
}) }));

function directoryQuote(intent) {
  return '/devis-assurance-immeuble?' + new URLSearchParams({ intent, source_path: '/guides' });
}

function groupNextStep(group) {
  if (group.id === 'preparer-un-dossier') return '<!-- vacant-authority-bridge:start --><p>Le bâtiment est entièrement vide ? <a href="/assurance-immeuble-vacant">Consultez le parcours assurance immeuble vacant</a>.</p><!-- vacant-authority-bridge:end -->';
  const option = { 'comparer-un-contrat': ['prix', 'Demander un devis à comparer'], 'comprendre-un-sinistre': ['sinistre', 'Préparer une étude d’assurance après sinistre'] }[group.id];
  return option ? `<p><a data-track="guide-topic-quote" href="${escape(directoryQuote(option[0]))}">${escape(option[1])}</a></p>` : '';
}

function directoryMain() {
  return `<main id="main-content" data-guide-directory>
<section class="page-hero compact-hero"><div class="container"><p class="eyebrow">Guides pratiques</p><h1>Guides d’assurance immeuble et de copropriété</h1><p>Documents à réunir, contrats à comparer ou sinistre à comprendre : choisissez votre point de départ.</p></div></section>
<div class="container guide-directory"><nav class="guide-toc guide-topic-nav" aria-label="Choisir un sujet"><strong>De quoi avez-vous besoin ?</strong><ul>${guideGroups.map(group => `<li><a href="#${group.id}">${escape(group.title)}</a></li>`).join('')}</ul></nav>
${guideGroups.map(group => `<section id="${group.id}" aria-labelledby="${group.id}-title"><h2 id="${group.id}-title">${escape(group.title)}</h2><p>${escape(group.introduction)}</p><div class="card-grid">${group.guides.map(guide => `<article class="content-card" data-guide-card><h3><a href="/${guide.slug}">${escape(guide.title)}</a></h3><p>${escape(guide.description)}</p></article>`).join('')}</div>${groupNextStep(group)}</section>`).join('\n')}
<aside class="plain-panel guide-cta" aria-labelledby="guide-help-title"><h2 id="guide-help-title">Vous préférez expliquer votre besoin ?</h2><p>Un téléphone ou un email suffit pour démarrer. Un conseiller précisera avec vous le bien à assurer et les documents utiles.</p><div class="hero-actions"><a class="button primary" data-track="guide-directory-quote" href="${escape(directoryQuote('devis'))}">Demander une étude</a><a class="button secondary" href="tel:+33180855786">Appeler le 01 80 85 57 86</a></div></aside>
</div></main>`;
}

export function improveGuideDiscovery(html, slug, publicRoot = 'public') {
  if (slug !== 'guides') {
    if (!insurerGuides.some(guide => guide.slug === slug)) return html;
    const panel = html.match(/<section class="plain-panel guide-cta">[\s\S]*?<\/section>/);
    if (!panel) throw new Error(`${slug}: guide next steps missing`);
    const group = guideGroups.find(group => group.slugs.includes(slug));
    let next = panel[0].replace(/href="\/devis-assurance-immeuble\?intent=audit-contrat(?:&amp;[^\"]*)?"/, `href="${escape(quoteHref('/' + slug))}"`)
      .replace(/href="\/devis-assurance-immeuble\?intent=sinistre(?:&amp;[^\"]*)?"/, `href="${escape('/devis-assurance-immeuble?' + new URLSearchParams({ intent: 'sinistre', source_path: '/' + slug }))}"`);
    if (!next.includes('data-guide-directory-return')) next = next.replace('</section>', `<p><a data-guide-directory-return href="/guides#${group.id}">Voir les autres guides : ${escape(group.title.toLowerCase())}</a></p></section>`);
    return html.replace(panel[0], next);
  }
  const main = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/);
  if (!main) throw new Error('Guide directory main content missing');
  let next = html.replace(main[0], directoryMain());
  const title = 'Guides d’assurance immeuble et de copropriété';
  const description = 'Trouvez le guide utile pour préparer un dossier, lire votre contrat ou comprendre un sinistre : documents, franchises, recherche de fuite, ascenseur et loyers.';
  next = next.replace(/<title>[\s\S]*?<\/title>/, `<title>${title} | ImmeubleAssur</title>`);
  next = next.replace(/<meta\b[^>]*(?:name="(?:description|twitter:description|twitter:title)"|property="og:(?:description|title)")[^>]*>/g, tag => tag.replace(/content="[^\"]*"/, `content="${escape(/(?:twitter|og):title/.test(tag) ? title : description)}"`));
  next = next.replace(/<!-- guide-directory-schema:start -->[\s\S]*?<!-- guide-directory-schema:end -->/g, '');
  next = next.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (tag, body) => {
    const schema = JSON.parse(body);
    return ['WebPage', 'FAQPage'].includes(schema['@type']) ? '' : tag;
  });
  const schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': 'https://immeubleassur.com/guides#webpage', url: 'https://immeubleassur.com/guides', name: title, description, inLanguage: 'fr-FR', mainEntity: { '@type': 'ItemList', itemListElement: guideGroups.flatMap(group => group.guides).map((guide, index) => ({ '@type': 'ListItem', position: index + 1, name: guide.title, url: 'https://immeubleassur.com/' + guide.slug })) } };
  next = next.replace('</head>', `<!-- guide-directory-schema:start --><script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script><!-- guide-directory-schema:end --></head>`);
  next = next.replace(/<!-- guide-directory-assets:start -->[\s\S]*?<!-- guide-directory-assets:end -->/g, '');
  const hash = createHash('sha256').update(readFileSync(join(publicRoot, 'assets/guide-directory.css'))).digest('hex').slice(0, 10);
  return next.replace('</head>', `<!-- guide-directory-assets:start --><link rel="stylesheet" href="/assets/guide-directory.css?v=${hash}" /><!-- guide-directory-assets:end --></head>`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let changed = 0;
  for (const slug of ['guides', ...insurerGuides.map(guide => guide.slug)]) {
    const file = join('public', slug + '.html');
    const html = readFileSync(file, 'utf8');
    const next = improveGuideDiscovery(html, slug);
    if (next !== html) { writeFileSync(file, next); changed++; }
  }
  console.log(`Guide discovery: 9 resources, 3 topics, ${changed} pages updated.`);
}
