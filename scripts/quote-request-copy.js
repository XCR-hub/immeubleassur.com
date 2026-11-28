const quotePages = new Set(['devis-assurance-immeuble', 'devis-pno-cno', 'devis-assurance-immeuble-en-ligne']);

export function improveQuoteRequestCopy(html, slug) {
  if (!quotePages.has(slug)) return html;
  return html
    .replace(/<form\b[^>]*data-instant-callback-source="quote-inline-callback"[^>]*>[\s\S]*?<\/form>/, form => form
      .replace(/(<button\b[^>]*type="submit"[^>]*>)[\s\S]*?(<\/button>)/, '$1Envoyer ma demande$2'))
    .replace(/<!-- ux-diagnostic:start -->[\s\S]*?<!-- ux-diagnostic:end -->/, block => block
      .replace(/(<h2 id="diagnostic-title">)[\s\S]*?(<\/h2>)/, '$1Préciser votre besoin, si vous le souhaitez$2')
      .replace(/(<p class="large-copy">)[\s\S]*?(<\/p>)/, '$1Choisissez votre profil, le bien et votre priorité pour préparer le formulaire complet. Aucune demande n’est envoyée à cette étape.$2')
      .replace(/(<a\b[^>]*class="[^"]*\bdiagnostic-cta\b[^"]*"[^>]*>)[\s\S]*?(<\/a>)/, '$1Continuer vers le formulaire complet$2'))
    .replace(/<!-- ux-readiness:start -->[\s\S]*?<!-- ux-readiness:end -->/, block => block
      .replace(/(<p class="eyebrow dark">)[\s\S]*?(<\/p>)/, '$1Documents (facultatif)$2')
      .replace(/(<h2 id="readiness-title">)[\s\S]*?(<\/h2>)/, '$1Indiquez les éléments déjà disponibles$2')
      .replace(/(<p class="large-copy">)[\s\S]*?(<\/p>)/, '$1Cochez uniquement les éléments que vous avez sous la main. Vous pouvez demander un devis sans avoir réuni tous les documents.$2'))
    .replace(/<!-- ux-conversion-momentum:start -->[\s\S]*?<!-- ux-conversion-momentum:end -->/, block => block
      .replace(/(<p class="eyebrow dark">)[\s\S]*?(<\/p>)/, '$1Votre situation$2')
      .replace(/(<p class="large-copy">)[\s\S]*?(<\/p>)/, '$1Choisissez une demande pour un lot, un immeuble ou la relecture de votre contrat.$2'));
}
