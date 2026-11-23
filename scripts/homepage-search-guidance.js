const title = 'Assurance immeuble et copropriété : courtier et devis | ImmeubleAssur';
const description = 'Courtier en assurance immeuble et copropriété pour syndics, bailleurs et SCI. Un téléphone ou un email suffit pour demander une étude de votre contrat.';
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
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
  const update = node => {
    if (!node || typeof node !== 'object') return;
    if (node.url === 'https://immeubleassur.com/' && [node['@type']].flat().includes('WebPage')) Object.assign(node, { name: title.replace(' | ImmeubleAssur', ''), description });
    Object.values(node).forEach(value => { if (Array.isArray(value)) value.forEach(update); else if (value && typeof value === 'object') update(value); });
  };
  return next.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, body) => {
    const schema = JSON.parse(body);
    update(schema);
    return `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`;
  });
}
