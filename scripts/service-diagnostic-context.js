const contexts = {
  'assurance-local-commercial': {
    profile: 'bailleur', property: 'local-commercial', intent: 'mixte',
    badge: 'Parcours immeuble mixte', title: 'Commerce, bureau ou local vacant.',
    text: "Declarer l'activite, le bail, les installations techniques et l'assurance du locataire commercial.",
    items: ['Activite exacte', 'Bail et assurance occupant', 'Extraction, stock ou terrasse']
  },
  'assurance-immeuble': {
    profile: 'bailleur', property: 'immeuble-locatif', intent: 'immeuble',
    badge: 'Parcours immeuble', title: 'Immeuble locatif ou monopropriete.',
    text: 'Transformer le batiment en fiche risque: lots, usage, entretien, sinistres et garanties attendues.',
    items: ['Nombre de lots', 'Travaux et entretien', 'Prime, franchises et exclusions']
  },
  'assurance-copropriete': {
    profile: 'syndic-professionnel', property: 'immeuble-locatif', intent: 'copropriete',
    badge: 'Parcours copropriete', title: 'Syndic, conseil syndical ou AG.',
    text: 'Presenter les parties communes, lots, sinistres, travaux et garanties RC du syndicat des coproprietaires.',
    items: ['Nombre de lots', 'Contrat actuel et appel de prime', 'Historique sinistres 36 mois']
  },
  'assurance-sci': {
    profile: 'sci', property: 'immeuble-locatif', intent: 'sci',
    badge: 'Parcours SCI', title: 'Patrimoine locatif ou lots multiples.',
    text: 'Organiser les contrats par bien pour eviter doublons, trous de garantie et declarations inexactes.',
    items: ['Liste des biens', 'Contrats existants', 'Lots regroupes ou disperses']
  }
};

// Set the existing controls and first-paint result together. The browser already
// derives its route from these controls, so hydration retains the same subject.
export function improveServiceDiagnosticContext(html, slug) {
  const context = contexts[slug === 'devis-assurance-immeuble' ? 'assurance-immeuble' : slug];
  if (!context) return html;
  const block = html.match(/<!-- ux-diagnostic:start -->[\s\S]*?<!-- ux-diagnostic:end -->/);
  if (!block) throw new Error(`${slug}: diagnostic block missing`);
  let next = block[0];
  for (const [step, value] of [['profile', context.profile], ['property', context.property]]) {
    let selected = 0;
    next = next.replace(/<button\b[^>]*data-diagnostic-option[^>]*>/g, tag => {
      if (!tag.includes(`data-step="${step}"`)) return tag;
      const active = tag.includes(`data-value="${value}"`);
      if (active) selected++;
      return tag.replace(/class="[^"]*"/, `class="diagnostic-choice${active ? ' is-active' : ''}"`);
    });
    if (selected !== 1) throw new Error(`${slug}: ${step} option missing or duplicated`);
  }
  for (const [className, value] of [['diagnostic-route', context.badge], ['diagnostic-result-title', context.title], ['diagnostic-result-text', context.text]]) {
    const pattern = new RegExp(`(<(?:p|h3) class="${className}">)[\\s\\S]*?(</(?:p|h3)>)`);
    if (!pattern.test(next)) throw new Error(`${slug}: ${className} missing`);
    next = next.replace(pattern, (_, open, close) => open + value + close);
  }
  next = next.replace(/<ul class="diagnostic-next">[\s\S]*?<\/ul>/, `<ul class="diagnostic-next">${[...context.items, 'Echeance et preavis a verifier'].map(item => `<li>${item}</li>`).join('')}</ul>`);
  next = next.replace(/(<a\b[^>]*class="[^"]*\bdiagnostic-cta\b[^"]*"[^>]*href=")[^"]*(")/, `$1/devis-assurance-immeuble?intent=${context.intent}$2`);
  return html.replace(block[0], next);
}
