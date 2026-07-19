import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SITE = "https://immeubleassur.com";
const OUT = "public";
const PHONE = "01 80 85 57 86";
const PHONE_HREF = "+33180855786";
const EMAIL = "team@immeubleassur.com";
const ORIAS = "11 061 425";
const HERO_IMAGE = "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80";

const pages = [
  {
    slug: "assurance-cno",
    title: "Assurance CNO coproprietaire non occupant",
    description: "Devis assurance CNO pour coproprietaire non occupant: responsabilite civile, lot vacant ou loue, syndic, bailleur et copropriete.",
    eyebrow: "CNO - coproprietaire non occupant",
    h1: "Assurance CNO pour coproprietaire non occupant.",
    lead: "ImmeubleAssur qualifie les demandes CNO des coproprietaires bailleurs, lots vacants, SCI et syndics qui veulent proteger un lot en copropriete sans doublon avec le contrat immeuble.",
    need: "cno",
    profile: "bailleur",
    intent: "cno"
  },
  {
    slug: "assurance-coproprietaire-non-occupant",
    title: "Assurance coproprietaire non occupant",
    description: "Assurance coproprietaire non occupant: obligations, PNO-CNO, garanties utiles et devis pour bailleurs en copropriete.",
    eyebrow: "Coproprietaire non occupant",
    h1: "Assurance coproprietaire non occupant: proteger son lot loue ou vacant.",
    lead: "Une CNO/PNO doit completer l'assurance de l'occupant et le contrat immeuble, pas les remplacer. Nous verifions les responsabilites, les garanties et les exclusions avant devis.",
    need: "cno",
    profile: "bailleur",
    intent: "cno-obligation"
  },
  {
    slug: "assurance-pno-cno",
    title: "Assurance PNO CNO pour bailleurs et SCI",
    description: "Comparer assurance PNO et CNO: proprietaire non occupant, coproprietaire non occupant, SCI, lots vacants et portefeuille locatif.",
    eyebrow: "PNO + CNO",
    h1: "Assurance PNO CNO: choisir le bon contrat sans trou de garantie.",
    lead: "PNO et CNO couvrent des situations proches mais les responsabilites changent selon le bien, la copropriete, l'occupant, la vacance et les contrats deja souscrits.",
    need: "pno-cno",
    profile: "sci",
    intent: "pno-cno"
  },
  {
    slug: "devis-pno-cno",
    title: "Devis PNO CNO immeuble",
    description: "Demander un devis PNO CNO pour lot en copropriete, logement vacant, SCI, bailleur ou portefeuille de biens immobiliers.",
    eyebrow: "Devis specialise",
    h1: "Devis PNO CNO rapide pour bailleur, SCI ou coproprietaire.",
    lead: "Le formulaire PNO/CNO rassemble les informations utiles pour obtenir une reponse exploitable: situation du lot, occupation, copropriete, sinistres et echeance.",
    need: "pno-cno",
    profile: "bailleur",
    intent: "devis"
  }
];

const articles = [
  {
    slug: "cno-coproprietaire-non-occupant-obligatoire",
    title: "CNO coproprietaire non occupant: quand l'assurance devient indispensable",
    description: "Responsabilite civile, lot loue ou vacant, syndic et assurance immeuble: comprendre le role de la CNO.",
    category: "CNO",
    keyword: "assurance CNO coproprietaire non occupant",
    body: [
      "La CNO vise le coproprietaire qui ne vit pas dans le lot assure. Elle interesse les bailleurs, SCI, indivisions et proprietaires de lots vacants ou pretes a titre gratuit.",
      "Le point essentiel consiste a verifier l'articulation entre le contrat immeuble de la copropriete, l'assurance de l'occupant et la responsabilite civile du coproprietaire non occupant.",
      "Un devis CNO utile doit donc partir du lot reel: adresse, usage, statut d'occupation, surface, dependances, sinistres et echeance du contrat actuel."
    ]
  },
  {
    slug: "pno-cno-differences-garanties",
    title: "PNO ou CNO: differences, garanties et choix du contrat",
    description: "Comparer PNO et CNO pour choisir une assurance adaptee au lot, a l'immeuble et au statut du proprietaire.",
    category: "PNO CNO",
    keyword: "difference PNO CNO",
    body: [
      "PNO signifie proprietaire non occupant. CNO designe plus precisement le coproprietaire non occupant. Dans les deux cas, l'enjeu est de proteger un bien non occupe par son proprietaire.",
      "La difference pratique vient souvent du contexte: maison individuelle, lot en copropriete, immeuble entier, SCI ou portefeuille de biens. Les garanties doivent etre lues avec ce contexte.",
      "ImmeubleAssur aide a eviter trois erreurs: croire que l'assurance du locataire suffit, supposer que le contrat immeuble couvre tout, ou choisir uniquement sur le prix mensuel."
    ]
  },
  {
    slug: "assurance-lot-vacant-copropriete",
    title: "Lot vacant en copropriete: pourquoi verifier la PNO CNO",
    description: "Vacance locative, responsabilite, degat des eaux et exclusions: les points a verifier pour un lot non occupe.",
    category: "Vacance",
    keyword: "assurance lot vacant copropriete",
    body: [
      "Un lot vacant peut creer une zone grise: pas d'assurance occupant active, surveillance reduite et sinistre decouvert tardivement.",
      "La PNO/CNO permet de cadrer la responsabilite du proprietaire, les dommages au lot et les recours possibles selon les garanties souscrites.",
      "Avant devis, il faut declarer la vacance, sa duree probable, les mesures de securisation et les sinistres passes."
    ]
  }
];

function esc(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function pagePath(slug) {
  return slug === "index" ? "index.html" : `${slug}.html`;
}

function writePage(slug, html) {
  const file = join(OUT, pagePath(slug));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html, "utf8");
}

function nav() {
  return `<header class="site-header" data-elevate><a class="brand" href="/" aria-label="ImmeubleAssur accueil"><span class="brand-mark" aria-hidden="true">IA</span><span><strong>ImmeubleAssur</strong><small>courtier immeuble</small></span></a><nav class="nav" aria-label="Navigation principale"><a href="/assurance-immeuble.html">Immeuble</a><a href="/assurance-pno-cno.html">PNO/CNO</a><a href="/assurance-copropriete.html">Copropriete</a><a href="/villes.html">Villes</a><a href="/blog.html">Blog</a><a href="/devis-pno-cno.html">Devis</a></nav><a class="header-phone" href="tel:${PHONE_HREF}">${PHONE}</a></header>`;
}

function footer() {
  return `<footer class="site-footer" id="contact"><div><strong>ImmeubleAssur</strong><p>Courtier specialiste immeuble, copropriete, CNO, PNO, SCI et syndic.</p></div><address><a href="tel:${PHONE_HREF}">${PHONE}</a><a href="mailto:${EMAIL}">${EMAIL}</a><a href="/confidentialite.html">Confidentialite</a><span>ORIAS ${ORIAS}</span></address></footer>`;
}

function form(defaults = {}) {
  const selected = (name, value) => defaults[name] === value ? " selected" : "";
  return `<form class="quote-panel pno-cno-form" id="lead-form" novalidate><div class="form-heading"><p>Devis PNO/CNO</p><h2>Recevoir mon analyse</h2></div><input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" /><div class="field-grid"><label>Nom et prenom *<input name="name" autocomplete="name" required placeholder="Jean Dupont" /></label><label>Telephone *<input name="phone" type="tel" autocomplete="tel" required placeholder="06 12 34 56 78" /></label></div><label>Email *<input name="email" type="email" autocomplete="email" required placeholder="contact@exemple.fr" /></label><div class="field-grid"><label>Profil *<select name="profile" required><option value="">Choisir</option><option value="bailleur"${selected("profile", "bailleur")}>Bailleur / proprietaire</option><option value="sci"${selected("profile", "sci")}>SCI / fonciere</option><option value="syndic-professionnel"${selected("profile", "syndic-professionnel")}>Syndic professionnel</option><option value="administrateur-biens"${selected("profile", "administrateur-biens")}>Administrateur de biens</option><option value="conseil-syndical"${selected("profile", "conseil-syndical")}>Conseil syndical</option></select></label><label>Situation du bien *<select name="property_type" required><option value="">Choisir</option><option value="lot-copropriete">Lot en copropriete</option><option value="logement-vacant">Logement vacant</option><option value="logement-loue">Logement loue</option><option value="immeuble-locatif">Immeuble locatif</option><option value="local-commercial">Local commercial</option><option value="parking">Parking / box</option></select></label></div><div class="field-grid"><label>Ville *<input name="city" autocomplete="address-level2" required placeholder="Paris" /></label><label>Nombre de lots<input name="units_count" inputmode="numeric" placeholder="1" /></label></div><label>Besoin principal<select name="need"><option value="cno"${selected("need", "cno")}>CNO coproprietaire non occupant</option><option value="pno"${selected("need", "pno")}>PNO proprietaire non occupant</option><option value="pno-cno"${selected("need", "pno-cno")}>Comparer PNO/CNO</option><option value="multirisque-immeuble"${selected("need", "multirisque-immeuble")}>Multirisque immeuble</option><option value="audit-contrat"${selected("need", "audit-contrat")}>Audit contrat actuel</option></select></label><label>Message<textarea name="message" rows="3" placeholder="Lot loue ou vacant, copropriete, assureur actuel, echeance, sinistres, surface...">${esc(defaults.message || "")}</textarea></label><label class="consent-row"><input type="checkbox" name="consent" required /><span>J'accepte d'etre recontacte pour recevoir mon analyse et mon devis.</span></label><button class="submit-button" type="submit">Obtenir mon devis PNO/CNO</button><p class="form-note">Reponse specialisee CNO, PNO ou immeuble.</p><div class="form-status" role="status" aria-live="polite"></div></form>`;
}

function layout({ slug, title, description, body }) {
  const url = `${SITE}/${slug === "index" ? "" : pagePath(slug)}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#0f766e" /><meta name="robots" content="index, follow, max-image-preview:large" /><meta name="description" content="${esc(description)}" /><meta property="og:type" content="website" /><meta property="og:locale" content="fr_FR" /><meta property="og:site_name" content="ImmeubleAssur" /><meta property="og:title" content="${esc(title)} | ImmeubleAssur" /><meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${url}" /><meta property="og:image" content="${HERO_IMAGE}" /><link rel="canonical" href="${url}" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="manifest" href="/manifest.webmanifest" /><link rel="preconnect" href="https://images.unsplash.com" crossorigin /><link rel="stylesheet" href="/assets/styles.css" /><title>${esc(title)} | ImmeubleAssur</title></head><body><a class="skip-link" href="#main-content">Aller au contenu principal</a>${nav()}<main id="main-content">${body}</main>${footer()}<script src="/assets/app.js" type="module"></script></body></html>`;
}
function landingPage(page) {
  const body = `<section class="page-hero compact-hero pno-cno-hero"><div class="container"><p class="eyebrow">${esc(page.eyebrow)}</p><h1>${esc(page.h1)}</h1><p>${esc(page.lead)}</p><div class="hero-actions"><a class="button primary" href="#devis">Obtenir un devis</a><a class="button secondary" href="/assurance-pno-cno.html">Comprendre PNO/CNO</a></div></div></section><section class="band page-band" id="devis"><div class="split"><div><p class="eyebrow dark">Objectif leads qualifies</p><h2>Une demande PNO/CNO doit etre qualifiee avant le prix.</h2><p class="large-copy">Pour repondre vite, il faut savoir si le bien est un lot en copropriete, un logement vacant, un bien loue, un local commercial ou un portefeuille SCI. Le bon contrat depend aussi de l'assurance occupant, du contrat immeuble, de la responsabilite civile et des sinistres passes.</p><ul class="check-list"><li>CNO pour coproprietaire non occupant en copropriete.</li><li>PNO pour logement loue, vacant ou occupe a titre gratuit.</li><li>Lecture des franchises, exclusions de vacance et garanties dommages.</li><li>Comparaison du contrat actuel avec les besoins reels du bien.</li></ul></div>${form({ need: page.need, profile: page.profile })}</div></section><section class="band pno-cno-band"><div class="section-head"><p class="eyebrow dark">Questions qui convertissent</p><h2>Le parcours reduit les hesitations avant contact.</h2></div><div class="local-proof-grid"><article><h3>Obligation</h3><p>En copropriete, le minimum responsabilite civile du coproprietaire doit etre traite avec attention. Le formulaire identifie la situation exacte.</p></article><article><h3>Vacance</h3><p>Un logement vacant peut etre exclu ou limite si le contrat ne l'encadre pas. La demande precise duree, surveillance et sinistres.</p></article><article><h3>Portefeuille</h3><p>SCI et bailleurs multi-lots doivent eviter les doublons entre PNO, CNO et contrats immeuble.</p></article><article><h3>Sinistre</h3><p>Degat des eaux, recherche de fuite, incendie et recours imposent de comparer garanties, plafonds et franchises.</p></article></div></section><section class="band faq-band"><div class="container narrow"><h2>FAQ ${esc(page.eyebrow)}</h2><div class="faq-list"><details><summary>CNO et PNO veulent-elles dire la meme chose ?</summary><p>La PNO vise le proprietaire non occupant. La CNO designe plus precisement le coproprietaire non occupant. Les garanties peuvent etre proches, mais le contexte copropriete change les responsabilites et le contrat immeuble a verifier.</p></details><details><summary>Quel contrat pour un lot loue en copropriete ?</summary><p>Il faut verifier le contrat de l'occupant, le contrat immeuble de la copropriete et la responsabilite du coproprietaire. Une PNO/CNO evite souvent une zone non couverte.</p></details><details><summary>Quel document fournir pour obtenir un devis utile ?</summary><p>Contrat actuel, adresse, statut d'occupation, surface, dependances, sinistres, echeance et informations de copropriete si disponibles.</p></details><details><summary>Peut-on assurer plusieurs lots avec une meme demande ?</summary><p>Oui. Pour une SCI ou un bailleur multi-biens, la demande doit lister les lots, villes, usages et contrats existants pour construire une vision portefeuille.</p></details></div></div></section>`;
  return layout({ slug: page.slug, title: page.title, description: page.description, body });
}

function articlePage(article) {
  const body = `<article class="article-layout rich-article"><header class="article-head"><p class="eyebrow dark">${esc(article.category)} - PNO/CNO</p><h1>${esc(article.title)}</h1><p>${esc(article.description)}</p></header><div class="article-body"><div class="article-summary"><strong>A retenir</strong><ul><li>La CNO concerne le coproprietaire non occupant.</li><li>La PNO/CNO complete l'assurance occupant et le contrat immeuble.</li><li>Le devis doit partir du bien, pas seulement du prix mensuel.</li></ul></div><section><h2>Comprendre l'intention de recherche.</h2><p>Une requete comme <strong>${esc(article.keyword)}</strong> exprime souvent un besoin immediat: savoir si le proprietaire est oblige de s'assurer, ce qui est couvert, combien coute le contrat et comment obtenir un devis fiable.</p><p>${esc(article.body[0])}</p></section><section><h2>Les garanties a verifier.</h2><p>${esc(article.body[1])}</p><p>Les points les plus sensibles sont la responsabilite civile, le degat des eaux, la recherche de fuite, l'incendie, le vandalisme, la vacance locative, les dependances, les parkings et les exclusions liees a l'absence d'occupant.</p></section><section><h2>Comment obtenir une reponse rapide.</h2><p>${esc(article.body[2])}</p><p>ImmeubleAssur transforme ces informations en fiche risque pour comparer les contrats sans multiplier les allers-retours.</p></section><section class="faq-list"><h2>Questions frequentes</h2><details><summary>Pourquoi le prix seul ne suffit pas ?</summary><p>Parce que deux contrats au meme prix peuvent avoir des franchises, plafonds et exclusions tres differents.</p></details><details><summary>Faut-il declarer un lot vacant ?</summary><p>Oui, la vacance peut modifier l'appetence assureur et les conditions de garantie.</p></details><details><summary>Qui doit remplir le formulaire ?</summary><p>Le proprietaire, le gerant de SCI, l'administrateur de biens ou le syndic qui centralise une demande PNO/CNO.</p></details></section><div class="source-box"><strong>Sources utiles</strong><a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028779136/" rel="nofollow">Legifrance - assurance en copropriete</a><a href="https://www.service-public.fr/particuliers/vosdroits/F2028" rel="nofollow">Service-Public.fr - logement et location</a></div></div><aside class="article-cta">${form({ need: "pno-cno", profile: "bailleur" })}</aside></article>`;
  return layout({ slug: `blog/${article.slug}`, title: article.title, description: article.description, body });
}

function hubPage() {
  const body = `<section class="page-hero compact-hero pno-cno-hero"><div class="container"><p class="eyebrow">Hub PNO/CNO</p><h1>Assurance CNO, PNO et immeuble: trouver le bon contrat.</h1><p>Un hub specialise pour capter les recherches des coproprietaires non occupants, proprietaires bailleurs, SCI et syndics qui veulent comparer sans perdre de temps.</p><div class="hero-actions"><a class="button primary" href="/devis-pno-cno.html">Devis PNO/CNO</a><a class="button secondary" href="tel:${PHONE_HREF}">Appeler</a></div></div></section><section class="band page-band"><div class="card-grid">${pages.map((page) => `<article class="content-card"><p class="eyebrow dark">${esc(page.eyebrow)}</p><h3><a href="/${page.slug}.html">${esc(page.title)}</a></h3><p>${esc(page.description)}</p></article>`).join("")}${articles.map((article) => `<article class="content-card"><p class="eyebrow dark">${esc(article.category)}</p><h3><a href="/blog/${article.slug}.html">${esc(article.title)}</a></h3><p>${esc(article.description)}</p></article>`).join("")}</div></section><section class="band compare-band"><div class="container narrow"><h2>Priorite conversion.</h2><p class="large-copy">Chaque page du cluster renvoie vers un formulaire court mais qualifiant. Le scoring lead valorise les besoins CNO/PNO, les lots en copropriete, les biens vacants et les portefeuilles multi-lots.</p></div></section>`;
  return layout({ slug: "pno-cno", title: "Hub assurance PNO CNO immeuble", description: "Hub assurance PNO CNO immeuble: devis, guides, differences PNO/CNO et pages specialisees pour proprietaires non occupants.", body });
}

function injectBlock(file, marker, block) {
  let html = readFileSync(file, "utf8");
  const pattern = new RegExp(`\\n?<!-- ${marker}:start -->[\\s\\S]*?<!-- ${marker}:end -->`, "g");
  html = html.replace(pattern, "");
  html = html.replace("</main>", `\n<!-- ${marker}:start -->\n${block}\n<!-- ${marker}:end -->\n</main>`);
  writeFileSync(file, html, "utf8");
}

function enhanceExistingPages() {
  const cluster = `<section class="band pno-cno-cluster"><div class="section-head"><p class="eyebrow dark">PNO/CNO</p><h2>Demandes prioritaires proprietaires non occupants.</h2></div><div class="card-grid"><article class="content-card"><h3><a href="/assurance-cno.html">Assurance CNO</a></h3><p>Coproprietaire non occupant: responsabilite civile, lot loue ou vacant et articulation avec le contrat immeuble.</p></article><article class="content-card"><h3><a href="/assurance-pno-cno.html">Comparer PNO/CNO</a></h3><p>Comprendre le bon contrat selon copropriete, SCI, logement vacant ou immeuble locatif.</p></article><article class="content-card"><h3><a href="/devis-pno-cno.html">Devis PNO/CNO</a></h3><p>Formulaire court pour recevoir une analyse et etre recontacte rapidement.</p></article></div></section>`;
  for (const fileName of ["index.html", "assurance-pno.html", "assurance-immeuble.html", "faq.html", "blog.html"]) {
    injectBlock(join(OUT, fileName), "lead-growth-pno-cno", cluster);
  }
}

function enhanceCoreServiceDepth() {
  const targets = [
    ["assurance-immeuble.html", "assurance immeuble", "bailleurs, SCI, syndics et proprietaires d'immeubles", "multirisque immeuble, responsabilite civile, dommages, sinistres et audit contrat"],
    ["assurance-copropriete.html", "assurance copropriete", "syndics professionnels, syndics benevoles et conseils syndicaux", "RC du syndicat, parties communes, PNO/CNO, protection juridique et preparation AG"],
    ["assurance-pno.html", "assurance PNO", "proprietaires non occupants, SCI et bailleurs", "logement loue, vacant, occupe gratuitement, local commercial, parking et recours"],
    ["assurance-sci.html", "assurance SCI", "gerants de SCI familiales ou patrimoniales", "vision portefeuille, PNO, multirisque, locaux mixtes et trous de garantie"],
    ["assurance-local-commercial.html", "assurance local commercial", "bailleurs d'immeubles mixtes et proprietaires de locaux", "activite du locataire, bail, extraction, stock, vacance et responsabilites"],
    ["assurance-immeuble-locatif.html", "assurance immeuble locatif", "bailleurs d'immeubles de rapport et administrateurs de biens", "occupation, rotation locative, sinistres recurrents, lots et garanties batiment"]
  ];
  for (const [fileName, topic, audience, focus] of targets) {
    const file = join(OUT, fileName);
    let html = readFileSync(file, "utf8");
    html = html.replace(/\n?<!-- core-service-depth:start -->[\s\S]*?<!-- core-service-depth:end -->/g, "");
    const block = `<section class="band core-depth-band"><div class="container narrow"><p class="eyebrow dark">Expertise ${esc(topic)}</p><h2>Ce que regarde ImmeubleAssur avant de comparer.</h2><p class="large-copy">Cette page s'adresse aux ${esc(audience)}. L'objectif n'est pas de produire un tarif approximatif, mais de transformer une demande en dossier assureur lisible autour de ${esc(focus)}.</p><div class="local-proof-grid"><article><h3>Situation</h3><p>Statut du demandeur, adresse, usage, occupation, copropriete, SCI, bail, lots et dependances.</p></article><article><h3>Contrat actuel</h3><p>Prime, echeance, franchises, exclusions, plafonds, protection juridique et conditions de declaration.</p></article><article><h3>Sinistres</h3><p>Historique 36 mois, causes, montants, recurrence, recherche de fuite et mesures correctives.</p></article><article><h3>Decision</h3><p>Conserver, renegocier, ajuster les garanties ou consulter le marche avec un dossier complet.</p></article></div><div class="faq-list"><details><summary>Pourquoi remplir un formulaire specialise ?</summary><p>Parce qu'une demande claire permet d'eviter les devis incomparables et les allers-retours. Les assureurs ont besoin de contexte avant de chiffrer.</p></details><details><summary>Le prix est-il le critere principal ?</summary><p>Non. Le bon arbitrage compare le prix, le reste a charge probable, les franchises, les exclusions et la qualite du service sinistre.</p></details><details><summary>Quand demander un audit ?</summary><p>Avant l'echeance, apres un sinistre important, avant une AG, lors d'une vacance locative ou lorsqu'un changement d'usage modifie le risque.</p></details></div></div></section>`;
    html = html.replace("</main>", `\n<!-- core-service-depth:start -->\n${block}\n<!-- core-service-depth:end -->\n</main>`);
    writeFileSync(file, html, "utf8");
  }
}

function run() {
  mkdirSync(join(OUT, "blog"), { recursive: true });
  for (const page of pages) writePage(page.slug, landingPage(page));
  for (const article of articles) writePage(`blog/${article.slug}`, articlePage(article));
  writePage("pno-cno", hubPage());
  enhanceCoreServiceDepth();
  enhanceExistingPages();
  console.log(`Lead growth factory wrote ${pages.length + articles.length + 1} PNO/CNO pages and injected conversion clusters.`);
}

run();