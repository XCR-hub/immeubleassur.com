import { quoteHref } from './site-navigation.js';
import { addQuoteContactFallback } from './quote-contact-fallback.js';

const url = 'https://immeubleassur.com/assurance-sci';
const title = 'Assurance SCI : devis pour vos biens immobiliers';
const heading = 'Assurance SCI : préparer votre devis.';
const description = 'Immeuble entier ou lots détenus par une SCI : demandez une étude avec un téléphone ou un email. Précisez ensuite le bien et les documents disponibles.';
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const serialize = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const questions = [
  ['Quelles informations donner pour un devis d’assurance SCI ?', 'Indiquez le nom de la SCI, votre rôle dans la demande et les biens à assurer. Précisez les adresses, le nombre de lots, les usages, l’occupation et les travaux prévus. Le gérant ou l’interlocuteur désigné pourra compléter ces informations avec un conseiller.'],
  ['Faut-il avoir tous les documents avant de demander une étude ?', 'Vous pouvez commencer par un téléphone ou un email. Si vous les avez, réunissez le contrat actuel, le dernier appel de cotisation et l’historique des sinistres. Un conseiller précisera avec vous les pièces manquantes pour chaque bien.'],
  ['Comment distinguer un immeuble entier et un lot détenu par la SCI ?', 'Précisez si la demande concerne un immeuble entier, des lots en copropriété ou plusieurs adresses. Pour un lot non occupé par la SCI, indiquez aussi s’il est loué ou vacant. Le conseiller examinera les contrats du bâtiment, du propriétaire et de l’occupant selon votre situation.'],
  ['Comment comparer deux devis pour les biens d’une SCI ?', 'Présentez les mêmes biens, usages et périodes aux assureurs. Comparez la cotisation avec les garanties, les franchises, les plafonds et les exclusions de chaque offre. Pour plusieurs adresses, vérifiez aussi les biens mentionnés dans chaque document. Les conditions générales et particulières permettent de préciser le périmètre proposé.']
];
const checklist = [
  'Nom de la SCI, rôle du demandeur et interlocuteur pour le dossier.',
  'Adresses, nombre de lots, usages et occupation des biens à assurer.',
  'Contrats disponibles, cotisations, échéances et sinistres connus par bien.',
  'Travaux prévus et questions à éclaircir avec le conseiller.'
];
const entities = () => questions.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } }));

function guidance() {
  return `<!-- core-service-depth:start -->
<section class="band faq-band" id="faq-devis-sci" data-sci-quote-guide data-article-reading aria-labelledby="sci-quote-title"><div class="container narrow">
<p class="eyebrow dark">Votre demande de devis SCI</p><h2 id="sci-quote-title">Préparer une étude pour les biens de votre SCI</h2>
<p>Un immeuble entier, un lot en copropriété et plusieurs adresses demandent des informations différentes. Décrivez les biens concernés ; vous pouvez commencer par un contact et compléter le dossier avec un conseiller.</p>
<div class="faq-list">${questions.map(([question, answer]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join('')}</div>
<div class="hero-actions"><a class="button primary" data-track="sci-faq-quote" href="${escape(quoteHref('/assurance-sci'))}">Demander un devis pour ma SCI</a><a class="button secondary" data-track="sci-faq-phone" href="tel:+33180855786">Appeler le 01 80 85 57 86</a></div>
<p>Pour préparer l’échange, consultez <a href="/checklist-documents-assurance-immeuble">la liste des documents à réunir</a>. Pour un lot, vous pouvez aussi <a href="/assurance-pno-cno">préciser votre besoin PNO/CNO</a>. Le <a href="/comparateur-assurance-immeuble">comparateur de cotisations et franchises</a> aide à relire vos propres montants.</p>
<div class="source-box"><strong>Pour vérifier les périmètres et comparer les contrats</strong><a href="https://www.service-public.gouv.fr/particuliers/vosdroits/F2027" rel="noopener">Service Public : assurances des parties communes et privatives</a><a href="https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/assurance-les-details-connaitre-avant-de-sengager" rel="noopener">DGCCRF : les informations à lire avant de s’engager</a></div>
</div></section>
<!-- core-service-depth:end -->`;
}

export function improveSciQuoteGuidance(html) {
  let next = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title} | ImmeubleAssur</title>`);
  next = next.replace(/<meta\b[^>]*(?:name="(?:description|twitter:description|twitter:title)"|property="og:(?:description|title)")[^>]*>/g, tag => tag.replace(/content="[^"]*"/, `content="${escape(/(?:twitter|og):title/.test(tag) ? title + ' | ImmeubleAssur' : description)}"`));
  const hero = next.match(/<section\b[^>]*class="[^"]*\bpage-hero\b[^"]*"[^>]*>[\s\S]*?<\/section>/);
  if (!hero) throw new Error('SCI quote guidance: service hero missing');
  next = next.replace(hero[0], hero[0].replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/, `<h1>${heading}</h1>`).replace(/(<\/h1>\s*)<p\b[^>]*>[\s\S]*?<\/p>/, `$1<p>${description}</p>`));
  const dossier = next.match(/<section\b[^>]*id="devis"[^>]*>[\s\S]*?<\/section>/);
  if (!dossier) throw new Error('SCI quote guidance: detailed quote section missing');
  next = next.replace(dossier[0], dossier[0].replace(/<ul class="check-list">[\s\S]*?<\/ul>/, `<ul class="check-list">${checklist.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`));
  next = next.replace(/(?:\r?\n)?<!-- seo-opportunity-expansion:start -->[\s\S]*?<!-- seo-opportunity-expansion:end -->(?:\r?\n)?/g, '');
  const depth = /<!-- core-service-depth:start -->[\s\S]*?<!-- core-service-depth:end -->/;
  next = depth.test(next) ? next.replace(depth, guidance()) : next.replace('</main>', guidance() + '</main>');
  let faqCount = 0;
  const update = node => {
    if (!node || typeof node !== 'object') return;
    const types = [node['@type']].flat();
    const pageNode = node.url === url || node['@id'] === url + '#webpage';
    const serviceNode = node.url === url || node['@id'] === url + '#service';
    if (pageNode && types.includes('WebPage')) Object.assign(node, { name: title, headline: heading, description });
    if (serviceNode && types.includes('Service')) Object.assign(node, { name: title, description, serviceType: 'Courtage et devis d’assurance pour les biens d’une SCI', audience: ['SCI familiales', 'SCI patrimoniales', 'Gérants de SCI'].map(audienceType => ({ '@type': 'Audience', audienceType })) });
    if (types.includes('FAQPage')) { node.mainEntity = entities(); faqCount++; }
    Object.values(node).forEach(value => { if (Array.isArray(value)) value.forEach(update); else if (value && typeof value === 'object') update(value); });
  };
  next = next.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, body) => {
    const schema = JSON.parse(body);
    update(schema);
    return `<script type="application/ld+json">${serialize(schema)}</script>`;
  });
  if (!faqCount) next = next.replace('</head>', `<script type="application/ld+json">${serialize({ '@context': 'https://schema.org', '@type': 'FAQPage', '@id': url + '#faq', mainEntity: entities() })}</script></head>`);
  return addQuoteContactFallback(next);
}
