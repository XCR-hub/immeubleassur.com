const path = (intent, cluster, title, summary, checklist, guide) => ({ intent, cluster, title, summary, checklist, guide });

export const articleReadingPaths = {
  'blog/assurance-copropriete-obligatoire': path('copropriete', 'copropriete-syndic', 'Préparer l’étude de votre copropriété', 'Rassemblez le contrat du syndicat et les informations sur les lots pour préciser les garanties à étudier.', ['Contrat du syndicat et appel de prime', 'Lots, usages et occupations', 'Sinistres et travaux connus'], ['/guide-assurance-copropriete-2026', 'Comprendre les assurances de la copropriété']),
  'blog/franchise-degat-des-eaux-immeuble': path('audit-contrat', 'sinistre-resilie', 'Relire les garanties dégâts des eaux', 'Repérez les franchises, plafonds et frais de recherche de fuite dans votre contrat avant de comparer les propositions.', ['Conditions du contrat et franchises', 'Postes de recherche et de réparation', 'Historique des dégâts des eaux'], ['/guide-recherche-fuite-immeuble', 'Lire le guide sur la recherche de fuite']),
  'blog/assurance-immeuble-mixte-commerce': path('local-commercial', 'local-commercial', 'Présenter le bâtiment et ses activités', 'Décrivez les activités présentes dans le bâtiment et distinguez les contrats du propriétaire et des occupants.', ['Activités et usages des locaux', 'Baux et occupations', 'Contrats déjà en place'], ['/guide-questionnaire-visite-risque-immeuble', 'Préparer les informations sur le bâtiment']),
  'blog/preparer-renouvellement-assurance-immeuble': path('audit-contrat', 'devis-courtier', 'Préparer la comparaison au renouvellement', 'Réunissez les pièces disponibles pour relire le contrat actuel et comparer les conditions proposées.', ['Contrat actuel et échéance', 'Dernier appel de prime', 'Sinistres et travaux connus'], ['/guide-lire-documents-assurance-immeuble', 'Lire un contrat et ses avenants']),
  'blog/assurance-sci-patrimoine-locatif': path('sci', 'sci-bailleur', 'Présenter les biens de votre SCI', 'Listez les biens, leurs occupants et les assurances existantes pour préparer une étude du patrimoine de la SCI.', ['Liste des biens et de leurs occupants', 'Contrats déjà en place', 'Échéances et sinistres connus'], ['/guide-questionnaire-visite-risque-immeuble', 'Préparer les informations sur les biens']),
  'blog/cno-coproprietaire-non-occupant-obligatoire': path('cno', 'copropriete-syndic', 'Préparer l’étude CNO de votre lot', 'Décrivez le lot, son occupation et le contrat de la copropriété pour préciser le besoin du copropriétaire non occupant.', ['Adresse et caractéristiques du lot', 'Occupation ou vacance', 'Contrat actuel et attestation de copropriété'], ['/guide-lire-documents-assurance-immeuble', 'Repérer les documents du contrat']),
  'blog/checklist-documents-devis-immeuble': path('devis', 'devis-courtier', 'Démarrer votre demande avec les pièces disponibles', 'Un téléphone ou un email suffit pour ouvrir une première demande. Les documents disponibles aideront ensuite à préciser le dossier.', ['Adresse et usage du bâtiment', 'Contrat actuel si disponible', 'Échéance et point à vérifier'], ['/checklist-documents-assurance-immeuble', 'Consulter la liste des documents utiles']),
  'blog/audit-franchises-assurance-immeuble': path('prix', 'prix-tarif', 'Comparer les montants et les conditions', 'Rapprochez les cotisations, franchises et conditions d’application avant de choisir une proposition.', ['Cotisations annuelles des propositions', 'Franchises et conditions d’application', 'Plafonds et exclusions à relire'], ['/comparateur-assurance-immeuble', 'Comparer vos cotisations et franchises'])
};

const normalized = value => String(value).replace(/^\/+/, '').replace(/\.html$/, '');
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function articleQuoteHref(value) {
  const slug = normalized(value);
  const topic = articleReadingPaths[slug];
  return topic ? '/devis-assurance-immeuble?' + new URLSearchParams({ intent: topic.intent, source_path: '/' + slug }) : '';
}

export function improveArticleReading(html, value) {
  const slug = normalized(value);
  const topic = articleReadingPaths[slug];
  if (!topic) return html;
  const block = `<!-- cluster-conversion-bridge:start -->
<section class="band cluster-conversion-bridge conversion-momentum-band" data-cluster-conversion="${topic.cluster}" data-article-reading aria-labelledby="article-reading-title">
<div class="cluster-conversion-wrap conversion-momentum"><div class="cluster-conversion-copy conversion-momentum-copy"><p class="eyebrow dark">La suite de votre lecture</p><h2 id="article-reading-title">${escape(topic.title)}</h2><p class="large-copy">${escape(topic.summary)}</p></div>
<div class="cluster-conversion-panel"><strong>Pour préparer l’étude</strong><ul>${topic.checklist.map(item => `<li>${escape(item)}</li>`).join('')}</ul><div class="cluster-conversion-actions"><a class="button primary" data-track="cluster-conversion-primary" href="${escape(articleQuoteHref(slug))}">Demander une étude adaptée</a><a class="button secondary light-button" data-track="cluster-conversion-secondary" href="${topic.guide[0]}">${escape(topic.guide[1])}</a><a class="cluster-conversion-general-link" data-track="cluster-conversion-general" href="tel:+33180855786">Appeler le 01 80 85 57 86</a></div></div></div>
</section>
<!-- cluster-conversion-bridge:end -->`;
  const existing = /<!-- cluster-conversion-bridge:start -->[\s\S]*?<!-- cluster-conversion-bridge:end -->/;
  if (existing.test(html)) return html.replace(existing, () => block);
  if (html.includes('<!-- internal-link-equity:start -->')) return html.replace('<!-- internal-link-equity:start -->', () => block + '\n<!-- internal-link-equity:start -->');
  if (!html.includes('</main>')) throw new Error(`${slug}: article main content missing`);
  return html.replace('</main>', () => block + '\n</main>');
}
