import { articleQuoteHref } from './article-reading-paths.js';

const insuranceLinks = [
  ["/assurance-immeuble", "Immeuble"],
  ["/assurance-copropriete", "Copropriété"],
  ["/assurance-pno-cno", "PNO / CNO"],
  ["/assurance-sci", "SCI"],
  ["/assurance-garages-parkings", "Garages et parkings"]
];
const resourceLinks = [
  ["/guides", "Guides pratiques"],
  ["/blog", "Conseils et actualités"],
  ["/faq", "Questions fréquentes"],
  ["/villes", "Assurance par ville"]
];

function currentPath(slug) {
  const path = `/${String(slug || "").replace(/^\/+/, "").replace(/\.html$/, "")}`;
  return path === "/index" ? "/" : path;
}

function link([href, label], path) {
  return `<a href="${href.replaceAll("&", "&amp;")}"${href === path ? ' aria-current="page"' : ""}>${label}</a>`;
}

export function quoteHref(path) {
  const base = "/devis-assurance-immeuble";
  if (path === "/" || path.startsWith("/devis-") || path === "/admin") return base;
  const articleQuote = articleQuoteHref(path);
  if (articleQuote) return articleQuote;
  const intent = {
    "/assurance-immeuble": "immeuble", "/multirisque-immeuble": "immeuble",
    "/assurance-copropriete": "copropriete", "/assurance-sci": "sci",
    "/assurance-pno": "pno", "/assurance-cno": "cno", "/assurance-pno-cno": "pno-cno",
    "/assurance-garages-parkings": "garages", "/prix-assurance-immeuble": "prix",
    "/comparateur-assurance-immeuble": "prix", "/tarif-assurance-immeuble": "prix",
    "/audit-contrat-assurance-immeuble": "audit-contrat",
    "/dommages-ouvrage-immeuble": "travaux", "/assurance-immeuble-mixte-commerce": "local-commercial",
    "/guide-assurance-copropriete-2026": "copropriete", "/checklist-documents-assurance-immeuble": "audit-contrat",
    "/guide-recherche-fuite-immeuble": "audit-contrat", "/guide-indemnisation-vetuste-immeuble": "audit-contrat",
    "/guide-bris-machines-ascenseur-immeuble": "audit-contrat", "/guide-perte-loyers-sinistre-gli": "audit-contrat",
    "/guide-questionnaire-visite-risque-immeuble": "audit-contrat", "/guide-lire-documents-assurance-immeuble": "audit-contrat"
  }[path];
  const params = new URLSearchParams({ ...(intent ? { intent } : {}), source_path: path });
  return `${base}?${params}`;
}

export function renderSiteNavigation(slug = "") {
  const path = currentPath(slug);
  const quote = [quoteHref(path), "Demander un devis"];
  const desktopLinks = [...insuranceLinks.slice(0, 4), ["/guides", "Guides"], ["/blog", "Blog"], [quote[0], "Devis"]];
  // Native details keeps every link available before JavaScript loads and when
  // it is disabled. The panel is a disclosure, not a modal or ARIA menu.
  return `<header class="site-header" data-elevate>
    <a class="brand" href="/" aria-label="IA ImmeubleAssur courtier immeuble - accueil"><span class="brand-mark" aria-hidden="true">IA</span><span><strong>ImmeubleAssur</strong><small>courtier immeuble</small></span></a>
    <nav class="nav" aria-label="Navigation principale">${desktopLinks.map(row => link(row, path)).join("")}</nav>
    <a class="header-phone" href="tel:+33180855786">01 80 85 57 86</a>
    <details class="mobile-navigation" data-mobile-navigation>
      <summary aria-controls="mobile-navigation-panel"><span class="mobile-navigation-icon" aria-hidden="true"></span>Menu</summary>
      <nav class="mobile-navigation-panel" id="mobile-navigation-panel" aria-label="Navigation mobile">
        <div class="mobile-navigation-actions"><a class="button primary" data-track="mobile-navigation-quote" href="${quote[0].replaceAll("&", "&amp;")}"${quote[0] === path ? ' aria-current="page"' : ""}>${quote[1]}</a><a class="mobile-navigation-phone" href="tel:+33180855786">Appeler le 01 80 85 57 86</a></div>
        <div class="mobile-navigation-groups"><div><p class="mobile-navigation-label">Votre assurance</p>${insuranceLinks.map(row => link(row, path)).join("")}</div><div><p class="mobile-navigation-label">Pour préparer votre demande</p>${resourceLinks.map(row => link(row, path)).join("")}</div></div>
      </nav>
    </details>
  </header>`;
}
