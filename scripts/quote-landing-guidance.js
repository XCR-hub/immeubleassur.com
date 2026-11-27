import { turnstileWidgetMarkup } from './turnstile-markup.js';

const pages = {
  'devis-pno-cno': {
    title: 'Devis PNO/CNO : étude et rappel | ImmeubleAssur',
    heading: 'Devis PNO / CNO', defaultIntent: 'pno-cno',
    lead: 'Un téléphone ou un email suffit pour démarrer. Un conseiller précise ensuite votre situation.',
    description: 'Demandez une étude PNO/CNO pour votre bien. Vous pouvez commencer par un téléphone ou un email ; un conseiller précisera les informations utiles avec vous.',
    callbackHeading: 'Votre demande : PNO/CNO'
  },
  'devis-assurance-immeuble-en-ligne': {
    title: 'Devis assurance immeuble en ligne : demande et rappel | ImmeubleAssur',
    heading: 'Devis assurance immeuble en ligne', defaultIntent: '',
    lead: 'Démarrez avec un téléphone ou un email. Les informations sur l’immeuble se précisent ensuite.',
    description: 'Demandez votre devis d’assurance immeuble en ligne. Un téléphone ou un email suffit pour démarrer ; un conseiller précise ensuite votre besoin avec vous.',
    callbackHeading: 'Un rappel pour votre devis'
  }
};
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const diagnosticPattern = /<!-- ux-diagnostic:start -->[\s\S]*?<!-- ux-diagnostic:end -->/;

function selectDefault(html, field, value) {
  const pattern = new RegExp(`<select\\b[^>]*name="${field}"[^>]*>[\\s\\S]*?<\\/select>`);
  return html.replace(pattern, select => select.replace(/<option\b[^>]*>/g, tag => {
    const clean = tag.replace(/\s+selected(?:="[^"]*")?/g, '');
    return clean.includes(`value="${value}"`) ? clean.replace('>', ' selected>') : clean;
  }));
}

export function improveQuoteLandingGuidance(html, slug, quoteReference) {
  const page = pages[slug];
  if (!page) return html;
  const widget = turnstileWidgetMarkup('lead_form', { siteKey: html.match(/data-sitekey="([^"]+)"/)?.[1] });
  const hero = `<section class="page-hero compact-hero" data-quote-acquisition><div class="container"><p class="eyebrow">Votre demande de devis</p><h1>${escape(page.heading)}</h1><p>${escape(page.lead)}</p>
<div class="hero-inline-callback" id="quote-first-contact" style="scroll-margin-top:96px" tabindex="-1" data-instant-callback-context aria-label="Premier contact pour votre devis">
<div><strong data-quote-context-title>${escape(page.callbackHeading)}</strong><span>Un conseiller complète le dossier avec vous.</span></div>
<form class="instant-callback-form hero-inline-callback-form" data-instant-callback-form data-instant-callback-source="quote-inline-callback" data-instant-callback-content-kind="${slug}" novalidate>
<input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" />
<label>Téléphone ou email *<input name="contact" autocomplete="tel" inputmode="email" required placeholder="06 12 34 56 78" /></label>
<label class="consent-row"><input type="checkbox" name="consent" required /><span>J’accepte d’être recontacté pour mon devis.</span></label>
${widget}
<button class="submit-button" type="submit" data-track="quote-landing-callback-submit">Me rappeler</button>
<p class="form-status" data-instant-callback-status role="status" aria-live="polite"></p></form></div>
<div class="hero-actions"><a class="button secondary" data-track="quote-landing-full-form" href="#lead-form">Formulaire complet</a><a class="button secondary" href="tel:+33180855786">Appeler le 01 80 85 57 86</a></div></div></section>`;
  const heroPattern = /<section\b[^>]*class="[^"]*\bpage-hero\b[^"]*"[^>]*>[\s\S]*?<\/section>/;
  if (!heroPattern.test(html)) throw new Error(slug + ': quote hero missing');
  let next = html.replace(heroPattern, hero);
  let diagnostic = quoteReference.match(diagnosticPattern)?.[0];
  if (!diagnostic) throw new Error(slug + ': reference diagnostic missing');
  diagnostic = diagnostic.replace(/<h2 id="diagnostic-title">[\s\S]*?<\/h2>/, '<h2 id="diagnostic-title">Préciser votre besoin, si vous le souhaitez</h2>').replace(/<p class="large-copy">[\s\S]*?<\/p>/, '<p class="large-copy">Vous pouvez préciser votre profil et le bien à assurer avant de remplir le formulaire complet.</p>');
  if (page.defaultIntent) {
    diagnostic = diagnostic.replace(/<button\b[^>]*data-step="property"[^>]*>/g, tag => tag.replace(/class="[^"]*"/, `class="diagnostic-choice${tag.includes('data-value="lot-copropriete"') ? ' is-active' : ''}"`));
    const replacements = { 'diagnostic-route': 'Parcours PNO/CNO', 'diagnostic-result-title': 'PNO ou CNO a cadrer', 'diagnostic-result-text': 'Lot loue, vacant ou non occupe: qualifier occupation, contrat immeuble et assurance occupant.' };
    for (const [className, text] of Object.entries(replacements)) diagnostic = diagnostic.replace(new RegExp(`(<(?:p|h3) class="${className}">)[\\s\\S]*?(</(?:p|h3)>)`), `$1${text}$2`);
    diagnostic = diagnostic.replace(/<ul class="diagnostic-next">[\s\S]*?<\/ul>/, '<ul class="diagnostic-next"><li>Pieces cles: occupation du lot, contrat immeuble, bail ou attestation occupant.</li></ul>').replace(/(<a\b[^>]*class="[^"]*\bdiagnostic-cta\b[^"]*"[^>]*href=")[^"]*(")/, '$1/devis-pno-cno?intent=pno-cno$2');
  }
  next = diagnosticPattern.test(next) ? next.replace(diagnosticPattern, diagnostic) : next.replace(hero, hero + '\n' + diagnostic);
  next = next.replace(/\s*<!-- ux-conversion-momentum:start -->[\s\S]*?<!-- ux-conversion-momentum:end -->/, '');
  next = next.replace(/<form\b[^>]*id="lead-form"[^>]*>/, tag => {
    let clean = tag.replace(/\s+data-(?:simple-form|default-intent)(?:="[^"]*")?/g, '');
    return clean.replace('<form', `<form data-simple-form${page.defaultIntent ? ` data-default-intent="${page.defaultIntent}"` : ''}`);
  });
  next = next.replace(/<select\b[^>]*name="property_type"[^>]*>[\s\S]*?<\/select>/, select => {
    for (const [value, label] of [['lot-copropriete', 'Lot en copropriété'], ['logement-loue', 'Logement loué'], ['logement-vacant', 'Logement vacant'], ['immeuble-vacant', 'Immeuble entièrement vacant']]) {
      if (!select.includes(`value="${value}"`)) select = select.replace('</select>', `<option value="${value}">${label}</option></select>`);
    }
    return select;
  });
  for (const [field, value] of [['profile', page.defaultIntent ? 'bailleur' : ''], ['property_type', page.defaultIntent ? 'lot-copropriete' : 'immeuble-locatif'], ['need', page.defaultIntent || 'multirisque-immeuble']]) next = selectDefault(next, field, value);
  next = next.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(page.title)}</title>`);
  next = next.replace(/<meta\b[^>]*(?:name="(?:description|twitter:description|twitter:title)"|property="og:(?:description|title)")[^>]*>/g, tag => tag.replace(/content="[^"]*"/, `content="${escape(/(?:twitter|og):title/.test(tag) ? page.title : page.description)}"`));
  const update = node => {
    if (!node || typeof node !== 'object') return;
    if (node.url === `https://immeubleassur.com/${slug}` && [node['@type']].flat().includes('WebPage')) Object.assign(node, { name: page.title.replace(' | ImmeubleAssur', ''), headline: page.heading, description: page.description });
    if (node.url === `https://immeubleassur.com/${slug}` && [node['@type']].flat().includes('Service')) node.description = page.description;
    Object.values(node).forEach(value => { if (Array.isArray(value)) value.forEach(update); else if (value && typeof value === 'object') update(value); });
  };
  return next.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, body) => { const schema = JSON.parse(body); update(schema); return `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`; });
}
