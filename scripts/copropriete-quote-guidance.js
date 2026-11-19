import { quoteHref } from './site-navigation.js';

const url = 'https://immeubleassur.com/assurance-copropriete';
const title = 'Assurance copropriété : devis et garanties';
const heading = 'Assurance copropriété : préparer votre devis.';
const description = 'Syndic bénévole ou professionnel : préparez un devis d’assurance copropriété avec les informations sur l’immeuble, les garanties et les pièces du dossier.';
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const questions = [
  ['Quelles informations donner pour un devis d’assurance copropriété ?', 'Présentez l’adresse de l’immeuble, le nombre de lots, les usages des locaux et les équipements à assurer. Indiquez aussi l’échéance du contrat, les sinistres connus et les travaux prévus. Ces informations permettent de préparer le premier échange.'],
  ['Faut-il avoir tous les documents avant de demander une étude ?', 'Vous pouvez commencer par un téléphone ou un email. Si vous les avez, réunissez le contrat actuel, le dernier appel de cotisation, l’historique des sinistres et les procès-verbaux utiles aux travaux. Un conseiller précisera avec vous les pièces manquantes.'],
  ['Comment comparer deux devis de copropriété ?', 'Présentez le même bâtiment, les mêmes usages et la même période aux assureurs. Comparez ensuite la cotisation, les garanties, les franchises, les plafonds et les exclusions. Un montant annuel seul ne décrit pas la protection proposée ; les conditions du contrat restent à relire.'],
  ['Devis de copropriété et PNO : s’agit-il du même besoin ?', 'Le contrat du syndicat et celui d’un propriétaire non occupant ne décrivent pas le même périmètre. Précisez si vous demandez une étude pour la copropriété, un lot ou un bien hors copropriété. Les garanties et exclusions de chaque contrat doivent être relues.']
];
const checklist = [
  'Bâtiment, nombre de lots, usages et équipements à assurer.',
  'Contrat actuel, cotisation annuelle, franchises et plafonds à comparer.',
  'Sinistres connus, travaux prévus et mesures de prévention.',
  'Échéance du contrat et informations utiles au syndic ou au conseil syndical.'
];
const entities = () => questions.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } }));
const serialize = value => JSON.stringify(value).replaceAll('<', '\\u003c');

function guidance() {
  return `<!-- core-service-depth:start -->
<section class="band faq-band" id="faq-devis-copropriete" data-copropriete-quote-guide data-article-reading aria-labelledby="copropriete-quote-title"><div class="container narrow">
<p class="eyebrow dark">Votre demande de devis</p><h2 id="copropriete-quote-title">Questions sur votre devis de copropriété</h2>
<p>Un devis utile décrit le même bâtiment et les mêmes usages que les autres offres comparées. Vous pouvez commencer par un contact ; les pièces disponibles seront précisées avec un conseiller.</p>
<div class="faq-list">${questions.map(([question, answer]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join('')}</div>
<div class="hero-actions"><a class="button primary" data-track="copropriete-faq-quote" href="${escape(quoteHref('/assurance-copropriete'))}">Demander un devis de copropriété</a><a class="button secondary" data-track="copropriete-faq-phone" href="tel:+33180855786">Appeler le 01 80 85 57 86</a></div>
<p>Pour préparer l’échange, consultez <a href="/checklist-documents-assurance-immeuble">la liste des documents à réunir</a> et <a href="/comparateur-assurance-immeuble">le comparateur de cotisations et franchises</a>.</p>
<div class="source-box"><strong>Pour vérifier les périmètres et comparer les garanties</strong><a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F2027" rel="noopener">Service Public : assurances des parties communes et privatives</a><a href="https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/assurance-les-details-connaitre-avant-de-sengager" rel="noopener">DGCCRF : les informations à lire avant de s’engager</a></div>
</div></section>
<!-- core-service-depth:end -->`;
}

export function improveCoproprieteQuoteGuidance(html) {
  let next = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title} | ImmeubleAssur</title>`);
  next = next.replace(/<meta\b[^>]*(?:name="(?:description|twitter:description|twitter:title)"|property="og:(?:description|title)")[^>]*>/g, tag => tag.replace(/content="[^"]*"/, `content="${escape(/(?:twitter|og):title/.test(tag) ? title + ' | ImmeubleAssur' : description)}"`));
  const hero = next.match(/<section\b[^>]*class="[^"]*\bpage-hero\b[^"]*"[^>]*>[\s\S]*?<\/section>/);
  if (!hero) throw new Error('Copropriete quote guidance: service hero missing');
  const updatedHero = hero[0].replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/, `<h1>${heading}</h1>`).replace(/(<\/h1>\s*)<p\b[^>]*>[\s\S]*?<\/p>/, `$1<p>${description}</p>`);
  next = next.replace(hero[0], updatedHero);
  const dossier = next.match(/<section\b[^>]*id="devis"[^>]*>[\s\S]*?<\/section>/);
  if (!dossier) throw new Error('Copropriete quote guidance: detailed quote section missing');
  next = next.replace(dossier[0], dossier[0].replace(/<ul class="check-list">[\s\S]*?<\/ul>/, `<ul class="check-list">${checklist.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`));
  const depth = /<!-- core-service-depth:start -->[\s\S]*?<!-- core-service-depth:end -->/;
  next = depth.test(next) ? next.replace(depth, guidance()) : next.replace('</main>', guidance() + '</main>');
  let faqCount = 0;
  const update = node => {
    if (!node || typeof node !== 'object') return;
    const types = [node['@type']].flat();
    if (node.url === url && types.includes('WebPage')) Object.assign(node, { name: title, headline: heading, description });
    if (node.url === url && types.includes('Service')) node.description = description;
    if (types.includes('FAQPage')) { node.mainEntity = entities(); faqCount++; }
    Object.values(node).forEach(value => { if (Array.isArray(value)) value.forEach(update); else if (value && typeof value === 'object') update(value); });
  };
  next = next.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, body) => {
    const schema = JSON.parse(body);
    update(schema);
    return `<script type="application/ld+json">${serialize(schema)}</script>`;
  });
  if (!faqCount) next = next.replace('</head>', `<script type="application/ld+json">${serialize({ '@context': 'https://schema.org', '@type': 'FAQPage', '@id': url + '#faq', mainEntity: entities() })}</script></head>`);
  return next;
}
