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
  return `<a href="${href}"${href === path ? ' aria-current="page"' : ""}>${label}</a>`;
}

export function renderSiteNavigation(slug = "") {
  const path = currentPath(slug);
  const quote = ["/devis-assurance-immeuble", "Demander un devis"];
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
        <div class="mobile-navigation-actions"><a class="button primary" data-track="mobile-navigation-quote" href="${quote[0]}"${quote[0] === path ? ' aria-current="page"' : ""}>${quote[1]}</a><a class="mobile-navigation-phone" href="tel:+33180855786">Appeler le 01 80 85 57 86</a></div>
        <div class="mobile-navigation-groups"><div><p class="mobile-navigation-label">Votre assurance</p>${insuranceLinks.map(row => link(row, path)).join("")}</div><div><p class="mobile-navigation-label">Pour préparer votre demande</p>${resourceLinks.map(row => link(row, path)).join("")}</div></div>
      </nav>
    </details>
  </header>`;
}
