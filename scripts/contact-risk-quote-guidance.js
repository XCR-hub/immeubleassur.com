const pages = {
  contact: {
    title: 'Contact assurance immeuble | ImmeubleAssur',
    heading: 'Contacter ImmeubleAssur pour votre assurance.',
    description: 'Demandez un devis d’assurance immeuble ou contactez ImmeubleAssur par téléphone ou email. Un conseiller précisera avec vous les informations nécessaires.'
  },
  'assurance-local-commercial': {
    title: 'Assurance local commercial bailleur | ImmeubleAssur',
    heading: 'Assurance immeuble avec local commercial.',
    description: 'Propriétaire d’un local commercial ou d’un immeuble mixte ? Décrivez les activités et les usages pour préparer une étude de l’assurance du bâtiment.'
  },
  'assurance-immeuble-resilie': {
    title: 'Assurance immeuble résiliée : nouveau contrat | ImmeubleAssur',
    heading: 'Assurance immeuble résiliée : demander un nouveau contrat.',
    description: 'Votre assureur a résilié le contrat de l’immeuble ? Indiquez le motif communiqué et la date de fin de couverture pour rechercher une nouvelle assurance.'
  },
  'assurance-immeuble-sinistre': {
    title: 'Assurance immeuble avec sinistres : devis | ImmeubleAssur',
    heading: 'Assurance immeuble avec sinistres : présenter votre historique.',
    description: 'Dégâts des eaux, incendie ou autres dommages : indiquez les événements déclarés, les réparations et la prévention pour étudier l’assurance de l’immeuble.'
  }
};
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function improveContactRiskQuoteGuidance(html, slug) {
  const page = pages[slug];
  if (!page) return html;
  const hero = html.match(/<section\b[^>]*class="[^"]*\bpage-hero\b[^"]*"[^>]*>[\s\S]*?<\/section>/);
  if (!hero) throw new Error(`${slug}: quote guidance hero missing`);
  const lead = slug === 'contact' ? escape(page.description).replace('par téléphone ou email', 'par <a data-contact-hero-phone href="tel:+33180855786" aria-label="Appeler ImmeubleAssur au 01 80 85 57 86">téléphone</a> ou <a data-contact-hero-email href="mailto:team@immeubleassur.com" aria-label="Écrire à ImmeubleAssur">email</a>') : escape(page.description);
  const updated = hero[0].replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/, `<h1>${escape(page.heading)}</h1>`).replace(/(<\/h1>\s*)<p\b[^>]*>[\s\S]*?<\/p>/, `$1<p>${lead}</p>`);
  let next = html.replace(hero[0], updated).replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(page.title)}</title>`);
  next = next.replace(/<form\b[^>]*id="lead-form"[^>]*>/, tag => tag.includes('data-simple-form') ? tag : tag.replace('<form', '<form data-simple-form'));
  next = next.replace(/<meta\b[^>]*(?:name="(?:description|twitter:description|twitter:title)"|property="og:(?:description|title)")[^>]*>/g, tag => tag.replace(/content="[^"]*"/, `content="${escape(/(?:twitter|og):title/.test(tag) ? page.title : page.description)}"`));
  if (slug === 'contact') {
    next = next.replace(/<h2>Coordonnees<\/h2><p class="large-copy">[\s\S]*?<\/p>/, '<h2>Nous joindre</h2><p class="large-copy"><a data-contact-phone href="tel:+33180855786">Appeler le 01 80 85 57 86</a><br><a data-contact-email href="mailto:team@immeubleassur.com">Écrire à team@immeubleassur.com</a><br>ORIAS : 11 061 425</p>');
    next = next.replace(/\s*<div class="growth-lead-magnet">[\s\S]*?<\/div>/, '');
    next = next.replace(/(<form\b[^>]*id="lead-form"[^>]*>[\s\S]*?<h2>)[\s\S]*?(<\/h2>)/, '$1Décrire mon besoin$2');
  }
  const update = node => {
    if (!node || typeof node !== 'object') return;
    const types = [node['@type']].flat();
    if (node.url === `https://immeubleassur.com/${slug}` && types.includes('WebPage')) Object.assign(node, { name: page.title.replace(' | ImmeubleAssur', ''), headline: page.heading, description: page.description });
    if (node.url === `https://immeubleassur.com/${slug}` && types.includes('Service')) node.description = page.description;
    Object.values(node).forEach(value => { if (Array.isArray(value)) value.forEach(update); else if (value && typeof value === 'object') update(value); });
  };
  return next.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, body) => {
    const schema = JSON.parse(body);
    update(schema);
    return `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`;
  });
}
