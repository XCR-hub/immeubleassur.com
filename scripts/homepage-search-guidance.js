const title = 'Assurance immeuble et copropriété : courtier et devis | ImmeubleAssur';
const description = 'Courtier en assurance immeuble et copropriété pour syndics, bailleurs et SCI. Un téléphone ou un email suffit pour demander une étude de votre contrat.';
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const questions = [
  ['Comment demander un devis d’assurance immeuble ?', 'Commencez par un téléphone ou un email dans le formulaire court. Précisez ensuite avec un conseiller le bâtiment à assurer, son occupation et les garanties recherchées.'],
  ['Faut-il avoir tous les documents pour commencer ?', 'Vous pouvez démarrer avec un contact. Si vous les avez, préparez le contrat actuel, le dernier appel de cotisation et les informations sur les lots, les usages, les sinistres connus et les travaux. Un conseiller précisera les pièces utiles à votre situation.'],
  ['Quel est le rôle du courtier pour préparer le devis ?', 'Le courtier recueille les informations sur l’immeuble et les garanties recherchées. Il précise avec vous les documents disponibles et les points à comparer dans les propositions : cotisation, franchises, plafonds et exclusions.'],
  ['Que se passe-t-il après l’envoi de la demande ?', 'Le formulaire affiche le résultat de l’envoi. Lorsque l’enregistrement est confirmé, un conseiller reprend avec vous les informations sur le bien et les pièces utiles pour préparer l’étude.']
];
function quoteFaq() {
  return `<!-- auto-seo-depth:start -->
<section class="band faq-band" id="questions-devis-immeuble" data-home-quote-faq data-article-reading aria-labelledby="home-quote-faq-title"><div class="container narrow">
<p class="eyebrow dark">Votre demande de devis</p><h2 id="home-quote-faq-title">Questions sur votre devis d’assurance immeuble</h2>
<div class="faq-list">${questions.map(([question, answer]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join('')}</div>
<div class="hero-actions"><a class="button primary" data-track="homepage-faq-quote" data-short-quote-entry href="/devis-assurance-immeuble?intent=immeuble&amp;source_path=%2F">Demander un devis</a><a class="button secondary light-button" data-track="homepage-faq-phone" href="tel:+33180855786">Appeler le 01 80 85 57 86</a></div>
<p>Pour préparer l’échange, consultez <a href="/checklist-documents-assurance-immeuble">la liste des documents utiles</a> et <a href="/courtier-assurance-immeuble">le rôle du courtier en assurance immeuble</a>.</p>
</div></section>
<!-- auto-seo-depth:end -->`;
}
const guidance = `<!-- homepage-courtier:start -->
      <div data-home-courtier-guidance data-article-reading><p>Un conseiller précise avec vous le bâtiment à assurer, les garanties recherchées et les documents disponibles. Découvrez comment se prépare la consultation des assureurs.</p>
      <p><a class="button primary" data-home-courtier-link href="/courtier-assurance-immeuble">Comprendre le rôle du courtier</a></p></div>
      <!-- homepage-courtier:end -->`;

export function improveHomepageSearchGuidance(html) {
  let next = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  next = next.replace(/<meta\b[^>]*(?:name="(?:description|twitter:description|twitter:title)"|property="og:(?:description|title)")[^>]*>/g, tag => tag.replace(/content="[^"]*"/, `content="${escape(/(?:twitter|og):title/.test(tag) ? title : description)}"`));
  const section = [...next.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)].find(([body]) => body.includes('class="solution-grid"'))?.[0];
  if (!section) throw new Error('Homepage guidance: the insurance solutions section is missing');
  const clean = section.replace(/\s*<!-- homepage-courtier:start -->[\s\S]*?<!-- homepage-courtier:end -->/, '');
  const updated = clean.replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/, '<h2>Un courtier pour préparer votre assurance immeuble</h2>').replace(/\s*<div class="solution-grid">/, `\n      ${guidance}\n      <div class="solution-grid">`);
  next = next.replace(section, updated);
  const depth = /<!-- auto-seo-depth:start -->[\s\S]*?<!-- auto-seo-depth:end -->/;
  next = depth.test(next) ? next.replace(depth, quoteFaq()) : next.replace('</main>', quoteFaq() + '</main>');
  let faqCount = 0;
  const update = node => {
    if (!node || typeof node !== 'object') return;
    if (node.url === 'https://immeubleassur.com/' && [node['@type']].flat().includes('WebPage')) Object.assign(node, { name: title.replace(' | ImmeubleAssur', ''), description });
    if ([node['@type']].flat().includes('FAQPage')) {
      node.mainEntity = questions.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } }));
      faqCount++;
    }
    Object.values(node).forEach(value => { if (Array.isArray(value)) value.forEach(update); else if (value && typeof value === 'object') update(value); });
  };
  next = next.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, body) => {
    const schema = JSON.parse(body);
    update(schema);
    return `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`;
  });
  if (faqCount !== 1) throw new Error('Homepage guidance: exactly one FAQ schema must match the visible answers');
  return next;
}
