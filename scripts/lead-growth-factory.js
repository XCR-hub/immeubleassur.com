import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SITE = "https://immeubleassur.com";
const OUT = "public";
const PHONE = "01 80 85 57 86";
const PHONE_HREF = "+33180855786";
const EMAIL = "team@immeubleassur.com";
const ORIAS = "11 061 425";

function versionedAsset(path) {
  const file = join(OUT, ...path.replace(/^\//, "").split("/"));
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10);
  return `${path}?v=${hash}`;
}

const STYLES_URL = versionedAsset("/assets/styles.css");
const APP_JS_URL = versionedAsset("/assets/app.js");
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
    intent: "cno",
    decisionTitle: "Qualifier le lot CNO sans le confondre avec une PNO generale.",
    decisionCopy: "Cette page part du lot en copropriete: numero de lot, tantiemes utiles, assurance occupant, contrat du syndicat et responsabilite civile du coproprietaire. Le but est de verifier ce qui reste a votre charge quand le logement est loue, vacant ou prete.",
    decisionBullets: ["Statut exact du lot dans la copropriete.", "Assurance occupant ou absence d occupant.", "Attestation du contrat immeuble du syndicat.", "Vacance, pret gratuit ou location meublee."],
    proofCards: [["Lot privatif", "La CNO isole le lot du coproprietaire non occupant, avec ses dependances, caves, parkings et responsabilites propres."], ["Contrat du syndicat", "La lecture commence par ce que couvre deja la copropriete afin de ne pas doubler les garanties."], ["Occupant", "Locataire, vacant ou pret gratuit changent les justificatifs et les exclusions a verifier."], ["Preuve syndic", "Le devis gagne en qualite quand l attestation immeuble et les informations de copropriete sont jointes."]]
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
    title: "Assurance PNO/CNO : bailleurs et SCI",
    description: "Comparer assurance PNO et CNO: proprietaire non occupant, coproprietaire non occupant, SCI, lots vacants et portefeuille locatif.",
    eyebrow: "PNO + CNO",
    h1: "Assurance PNO/CNO : choisir le bon contrat sans trou de garantie.",
    lead: "PNO et CNO couvrent des situations proches mais les responsabilites changent selon le bien, la copropriete, l'occupant, la vacance et les contrats deja souscrits.",
    need: "pno-cno",
    profile: "sci",
    intent: "pno-cno",
    decisionTitle: "Comparer PNO et CNO avant de choisir le bon parcours.",
    decisionCopy: "Cette page sert a arbitrer entre plusieurs scenarios: proprietaire non occupant hors copropriete, coproprietaire non occupant, SCI multi-lots ou bailleur avec logements vacants. Elle organise la comparaison avant d envoyer le dossier vers le bon formulaire.",
    decisionBullets: ["PNO pour proprietaire non occupant hors contexte strict CNO.", "CNO pour lot en copropriete avec contrat immeuble a lire.", "Portefeuille SCI ou bailleur multi-biens.", "Choix du parcours devis selon occupation et responsabilites."],
    proofCards: [["Arbitrage", "La page compare les situations avant de trancher entre PNO, CNO ou multirisque immeuble."], ["Portefeuille", "SCI et multi-lots doivent eviter les doublons entre contrats par lot et contrat immeuble."], ["Vacance", "La duree d inoccupation et la surveillance orientent les garanties utiles."], ["Parcours", "Le visiteur part ensuite vers le devis CNO, PNO ou audit selon son besoin reel."]]
  },
  {
    slug: "assurance-immeuble-vacant",
    title: "Assurance immeuble vacant ou vide : devis",
    description: "Assurance d'un immeuble vacant ou vide: declarer l'inoccupation, verifier exclusions, vandalisme, degats des eaux, surveillance et obtenir un devis.",
    eyebrow: "Immeuble vacant ou vide",
    h1: "Assurance immeuble vacant : couvrir un bâtiment vide sans zone grise.",
    lead: "Un immeuble totalement vide ne se traite pas comme un seul logement vacant. ImmeubleAssur documente la duree d'inoccupation, les protections, les travaux et les sinistres pour consulter les assureurs avec un risque clairement presente.",
    need: "multirisque-immeuble",
    profile: "bailleur",
    intent: "immeuble-vacant",
    serviceType: "Assurance multirisque pour immeuble vacant ou vide",
    audiences: ["Proprietaires d immeubles vacants", "Bailleurs", "SCI", "Administrateurs de biens"],
    decisionTitle: "Distinguer l'immeuble entier vacant du lot vacant en copropriete.",
    decisionCopy: "La souscription depend de la realite du batiment: vacance totale ou partielle, date de liberation, remise en location, travaux, acces, maintien des fluides et frequence des visites.",
    decisionBullets: ["Immeuble entier vide: parcours multirisque immeuble vacant.", "Un seul lot vide en copropriete: parcours PNO/CNO.", "Travaux importants: signaler leur nature et leur calendrier.", "Surveillance: documenter visites, alarmes, fermetures et mesures hors-gel."],
    proofCards: [["Vacance declaree", "La date de debut, la duree probable et le motif evitent de presenter le batiment comme normalement occupe."], ["Eau et gel", "Chauffage, coupure des fluides, purge et visites conditionnent l'analyse du degat des eaux et du gel."], ["Vol et vandalisme", "Acces, volets, alarme, gardiennage et traces d'effraction doivent etre confrontes aux exclusions du contrat."], ["Remise en occupation", "Travaux, relocation ou vente donnent a l'assureur une trajectoire documentee plutot qu'une vacance indeterminee."]],
    faq: [["Peut-on assurer un immeuble totalement vide ?", "Oui, selon les caracteristiques du risque et l'acceptation de l'assureur. La vacance doit etre declaree avec sa duree, son motif et les mesures de protection."], ["PNO et assurance immeuble vacant sont-elles identiques ?", "Non. Une PNO vise habituellement un proprietaire non occupant ou un lot; un immeuble entier vide demande une analyse du batiment, des parties communes et de la vacance totale."], ["Quelles garanties faut-il verifier ?", "Incendie, degat des eaux, gel, tempete, responsabilite civile, vol ou vandalisme, bris et frais de remise en etat doivent etre lus avec leurs exclusions et franchises."], ["Quels documents preparer ?", "Adresse, surface, nombre de lots, date et motif de vacance, photos, protections, travaux, releve de sinistres et contrat actuel rendent la demande exploitable."]]
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
const pnoArticleAngles = {
  "cno-coproprietaire-non-occupant-obligatoire": {
    summary: ["Cadrer l'obligation du coproprietaire non occupant.", "Verifier le lot, l'attestation immeuble et l'occupant.", "Separer CNO, PNO generale et contrat du syndicat."],
    intentTitle: "Comprendre l'obligation CNO sans la confondre avec une PNO generale.",
    intentCopy: "Cette page part du statut de coproprietaire non occupant. Elle relie lot privatif, responsabilite civile, assurance du syndicat, occupant eventuel et obligation minimale.",
    guaranteeTitle: "Les garanties propres au coproprietaire.",
    guaranteeCopy: "La priorite est de verifier ce qui reste a la charge du coproprietaire: responsabilite civile, degat des eaux parti du lot, recours, dependances et absence d'occupant.",
    responseTitle: "Preparer une demande CNO utile.",
    responseCopy: "Le dossier doit mentionner numero ou nature du lot, statut d'occupation, attestation immeuble, contrat occupant et echeance de la CNO actuelle.",
    faq: [["La CNO est-elle toujours une PNO ?", "Elle est proche, mais l'angle CNO vise le coproprietaire non occupant en copropriete avec le contrat du syndicat a verifier."], ["Quel document prouve le contexte copropriete ?", "L'attestation ou les informations du contrat immeuble du syndicat aident a eviter les doublons."], ["Quand agir ?", "Des que le lot est loue, vacant, prete ou detenu en SCI sans occupation par le proprietaire."]]
  },
  "assurance-lot-vacant-copropriete": {
    summary: ["Traiter la vacance comme un etat temporaire a declarer.", "Documenter surveillance, securisation et absence d'occupant.", "Verifier les exclusions avant un sinistre tardif."],
    intentTitle: "Comprendre le risque propre au lot vacant.",
    intentCopy: "Cette page traite une situation operationnelle: le lot n'est pas occupe, l'assurance occupant peut manquer et un sinistre peut etre decouvert plus tard.",
    guaranteeTitle: "Les garanties sensibles pendant la vacance.",
    guaranteeCopy: "Il faut relire degat des eaux, vandalisme, responsabilite civile, chauffage, visites de surveillance, coupure des fluides et conditions d'inoccupation.",
    responseTitle: "Preparer une demande pour lot vide.",
    responseCopy: "Le devis doit indiquer date de debut de vacance, duree probable, mesures de securisation, travaux prevus, ancien occupant et sinistres deja connus.",
    faq: [["Faut-il declarer une vacance courte ?", "Oui si le contrat pose des conditions d'inoccupation ou de surveillance."], ["Le contrat du syndicat suffit-il ?", "Non, il peut couvrir certaines parties communes sans proteger toute la responsabilite du coproprietaire."], ["Quel signal rend le dossier meilleur ?", "Des visites, une securisation et des travaux suivis reduisent le risque percu."]]
  }
};

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
  return `<header class="site-header" data-elevate><a class="brand" href="/" aria-label="IA ImmeubleAssur courtier immeuble - accueil"><span class="brand-mark" aria-hidden="true">IA</span><span><strong>ImmeubleAssur</strong><small>courtier immeuble</small></span></a><nav class="nav" aria-label="Navigation principale"><a href="/assurance-immeuble.html">Immeuble</a><a href="/assurance-pno-cno.html">PNO/CNO</a><a href="/assurance-copropriete.html">Copropriete</a><a href="/villes.html">Villes</a><a href="/blog.html">Blog</a><a href="/devis-pno-cno.html">Devis</a></nav><a class="header-phone" href="tel:${PHONE_HREF}">${PHONE}</a></header>`;
}

function footer() {
  return `<footer class="site-footer" id="contact"><div><strong>ImmeubleAssur</strong><p>Courtier specialiste immeuble, copropriete, CNO, PNO, SCI et syndic.</p></div><address><a href="tel:${PHONE_HREF}">${PHONE}</a><a href="mailto:${EMAIL}">${EMAIL}</a><a href="/confidentialite.html">Confidentialite</a><span>ORIAS ${ORIAS}</span></address></footer>`;
}

function form(defaults = {}) {
  const vacant = defaults.intent === "immeuble-vacant";
  const selected = (name, value) => defaults[name] === value ? " selected" : "";
  return `<form class="quote-panel pno-cno-form" id="lead-form" novalidate><div class="form-heading"><p>${vacant ? "Devis immeuble vacant" : "Devis PNO/CNO"}</p><h2>Recevoir mon analyse</h2></div><input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" /><div class="field-grid"><label>Nom et prenom *<input name="name" autocomplete="name" required placeholder="Jean Dupont" /></label><label>Telephone *<input name="phone" type="tel" autocomplete="tel" required placeholder="06 12 34 56 78" /></label></div><label>Email (facultatif)<input name="email" type="email" autocomplete="email" placeholder="contact@exemple.fr" /></label><div class="field-grid"><label>Profil *<select name="profile" required><option value="">Choisir</option><option value="bailleur"${selected("profile", "bailleur")}>Bailleur / proprietaire</option><option value="sci"${selected("profile", "sci")}>SCI / fonciere</option><option value="syndic-professionnel"${selected("profile", "syndic-professionnel")}>Syndic professionnel</option><option value="administrateur-biens"${selected("profile", "administrateur-biens")}>Administrateur de biens</option><option value="conseil-syndical"${selected("profile", "conseil-syndical")}>Conseil syndical</option></select></label><label>Situation du bien *<select name="property_type" required><option value="">Choisir</option><option value="lot-copropriete">Lot en copropriete</option><option value="logement-vacant">Logement vacant</option><option value="logement-loue">Logement loue</option><option value="immeuble-locatif"${selected("property_type", "immeuble-locatif")}>Immeuble locatif</option><option value="immeuble-vacant"${selected("property_type", "immeuble-vacant")}>Immeuble entier vacant</option><option value="local-commercial">Local commercial</option><option value="parking">Parking / box</option></select></label></div><div class="field-grid"><label>Ville *<input name="city" autocomplete="address-level2" required placeholder="Paris" /></label><label>Nombre de lots<input name="units_count" inputmode="numeric" placeholder="1" /></label></div><label>Besoin principal<select name="need"><option value="cno"${selected("need", "cno")}>CNO coproprietaire non occupant</option><option value="pno"${selected("need", "pno")}>PNO proprietaire non occupant</option><option value="pno-cno"${selected("need", "pno-cno")}>Comparer PNO/CNO</option><option value="multirisque-immeuble"${selected("need", "multirisque-immeuble")}>Multirisque immeuble</option><option value="audit-contrat"${selected("need", "audit-contrat")}>Audit contrat actuel</option></select></label><label>Message<textarea name="message" rows="3" placeholder="Lot loue ou vacant, copropriete, assureur actuel, echeance, sinistres, surface...">${esc(defaults.message || "")}</textarea></label><label class="consent-row"><input type="checkbox" name="consent" required /><span>J'accepte d'etre recontacte pour recevoir mon analyse et mon devis.</span></label><button class="submit-button" type="submit">${vacant ? "Obtenir mon devis immeuble vacant" : "Obtenir mon devis PNO/CNO"}</button><p class="form-note">${vacant ? "Analyse specialisee du batiment vide, de la vacance et des protections." : "Reponse specialisee CNO, PNO ou immeuble."}</p><div class="form-status" role="status" aria-live="polite"></div></form>`;
}

function layout({ slug, title, description, body, faq = [], serviceType = "Assurance immeuble", audiences = ["Syndics", "Bailleurs", "SCI", "Coproprietaires"] }) {
  const url = slug === "index" ? `${SITE}/` : `${SITE}/${slug}`;
  const graph = [{ "@type": "InsuranceAgency", "@id": `${SITE}/#organization`, name: "ImmeubleAssur", url: SITE, telephone: PHONE, email: EMAIL, identifier: `ORIAS ${ORIAS}`, areaServed: "France" }, { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "ImmeubleAssur", publisher: { "@id": `${SITE}/#organization` }, inLanguage: "fr-FR" }, { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [{ "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: title, item: url }] }, { "@type": "WebPage", "@id": `${url}#webpage`, url, name: title, description, isPartOf: { "@id": `${SITE}/#website` }, breadcrumb: { "@id": `${url}#breadcrumb` }, inLanguage: "fr-FR" }, { "@type": "Service", "@id": `${url}#service`, name: title, description, provider: { "@id": `${SITE}/#organization` }, serviceType, areaServed: "France", audience: audiences.map((audienceType) => ({ "@type": "Audience", audienceType })), url }];
  if (faq.length) graph.push({ "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: faq.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) });
  const schema = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#0f766e" /><meta name="robots" content="index, follow, max-image-preview:large" /><meta name="description" content="${esc(description)}" /><meta property="og:type" content="website" /><meta property="og:locale" content="fr_FR" /><meta property="og:site_name" content="ImmeubleAssur" /><meta property="og:title" content="${esc(title)} | ImmeubleAssur" /><meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${url}" /><meta property="og:image" content="${HERO_IMAGE}" /><link rel="canonical" href="${url}" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="manifest" href="/manifest.webmanifest" />
    <link rel="preload" as="image" href="/assets/hero-building.webp" type="image/webp" /><link rel="stylesheet" href="${STYLES_URL}" /><title>${esc(title)} | ImmeubleAssur</title><script type="application/ld+json">${schema}</script></head><body><a class="skip-link" href="#main-content">Aller au contenu principal</a>${nav()}<main id="main-content">${body}</main>${footer()}<script src="${APP_JS_URL}" type="module"></script></body></html>`;
}
function landingDecisionBlock(page) {
  const title = page.decisionTitle || "Une demande PNO/CNO doit etre qualifiee avant le prix.";
  const copy = page.decisionCopy || "Pour repondre vite, il faut savoir si le bien est un lot en copropriete, un logement vacant, un bien loue, un local commercial ou un portefeuille SCI. Le bon contrat depend aussi de l'assurance occupant, du contrat immeuble, de la responsabilite civile et des sinistres passes.";
  const bullets = page.decisionBullets || ["CNO pour coproprietaire non occupant en copropriete.", "PNO pour logement loue, vacant ou occupe a titre gratuit.", "Lecture des franchises, exclusions de vacance et garanties dommages.", "Comparaison du contrat actuel avec les besoins reels du bien."];
  return `<p class="eyebrow dark">Objectif leads qualifies</p><h2>${esc(title)}</h2><p class="large-copy">${esc(copy)}</p><ul class="check-list">${bullets.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

function landingProofGrid(page) {
  const cards = page.proofCards || [["Obligation", "En copropriete, le minimum responsabilite civile du coproprietaire doit etre traite avec attention. Le formulaire identifie la situation exacte."], ["Vacance", "Un logement vacant peut etre exclu ou limite si le contrat ne l'encadre pas. La demande precise duree, surveillance et sinistres."], ["Portefeuille", "SCI et bailleurs multi-lots doivent eviter les doublons entre PNO, CNO et contrats immeuble."], ["Sinistre", "Degat des eaux, recherche de fuite, incendie et recours imposent de comparer garanties, plafonds et franchises."]];
  return `<div class="local-proof-grid">${cards.map(([title, body]) => `<article><h3>${esc(title)}</h3><p>${esc(body)}</p></article>`).join("")}</div>`;
}

function landingPage(page) {
  const faq = page.faq || [["CNO et PNO veulent-elles dire la meme chose ?", "La PNO vise le proprietaire non occupant. La CNO designe plus precisement le coproprietaire non occupant. Le contexte copropriete change les responsabilites et le contrat immeuble a verifier."], ["Quel contrat pour un lot loue en copropriete ?", "Il faut verifier le contrat de l'occupant, le contrat immeuble de la copropriete et la responsabilite du proprietaire."], ["Quel document fournir pour obtenir un devis utile ?", "Contrat actuel, adresse, statut d'occupation, surface, dependances, sinistres et echeance."], ["Peut-on assurer plusieurs lots avec une meme demande ?", "Oui. La demande doit lister les lots, villes, usages et contrats existants."]];
  const vacant = page.intent === "immeuble-vacant";
  const secondaryHref = vacant ? "/blog/assurance-immeuble-vacant.html" : "/assurance-pno-cno.html";
  const secondaryLabel = vacant ? "Guide immeuble vacant" : "Comprendre PNO/CNO";
  const body = `<section class="page-hero compact-hero pno-cno-hero"><div class="container"><p class="eyebrow">${esc(page.eyebrow)}</p><h1>${esc(page.h1)}</h1><p>${esc(page.lead)}</p><div class="hero-actions"><a class="button primary" href="#devis">Obtenir un devis</a><a class="button secondary" href="${secondaryHref}">${secondaryLabel}</a></div></div></section><section class="band page-band" id="devis"><div class="split"><div>${landingDecisionBlock(page)}</div>${form({ need: page.need, profile: page.profile, property_type: vacant ? "immeuble-vacant" : "", intent: page.intent, message: vacant ? "Je souhaite assurer un immeuble vacant ou vide." : "" })}</div></section><section class="band pno-cno-band"><div class="section-head"><p class="eyebrow dark">Analyse du risque</p><h2>Les points qui permettent de comparer les contrats.</h2></div>${landingProofGrid(page)}</section><section class="band faq-band"><div class="container narrow"><h2>FAQ ${esc(page.eyebrow)}</h2><div class="faq-list">${faq.map(([question, answer]) => `<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join("")}</div></div></section>`;
  return layout({ slug: page.slug, title: page.title, description: page.description, body, faq, serviceType: page.serviceType, audiences: page.audiences });
}

function articlePage(article) {
  const angle = pnoArticleAngles[article.slug] || {
    summary: ["Comparer le statut PNO/CNO avant de choisir.", "Verifier occupant, lot, copropriete et contrat immeuble.", "Transformer la lecture en demande de devis exploitable."],
    intentTitle: "Comprendre l'intention de recherche.",
    intentCopy: `Une requete comme ${article.keyword} exprime souvent un besoin immediat: savoir quel contrat choisir, ce qui est couvert et comment obtenir un devis fiable.`,
    guaranteeTitle: "Les garanties a verifier.",
    guaranteeCopy: "Les points sensibles sont responsabilite civile, degat des eaux, recherche de fuite, incendie, vandalisme, dependances, parkings et conditions d'absence d'occupant.",
    responseTitle: "Comment obtenir une reponse rapide.",
    responseCopy: "ImmeubleAssur transforme ces informations en fiche risque pour comparer les contrats sans multiplier les allers-retours.",
    faq: [["Pourquoi le prix seul ne suffit pas ?", "Deux contrats au meme prix peuvent avoir des franchises et exclusions tres differentes."], ["Qui doit remplir le formulaire ?", "Le proprietaire, le gerant de SCI, l'administrateur de biens ou le syndic qui centralise la demande."], ["Quel document aide le plus ?", "Le contrat actuel, l'attestation immeuble et le statut d'occupation accelerent la reponse."]]
  };
  const body = `<article class="article-layout rich-article"><header class="article-head"><p class="eyebrow dark">${esc(article.category)} - PNO/CNO</p><h1>${esc(article.title)}</h1><p>${esc(article.description)}</p></header><div class="article-body"><div class="article-summary"><strong>A retenir</strong><ul>${angle.summary.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div><section><h2>${esc(angle.intentTitle)}</h2><p>${esc(angle.intentCopy)}</p><p>${esc(article.body[0])}</p></section><section><h2>${esc(angle.guaranteeTitle)}</h2><p>${esc(article.body[1])}</p><p>${esc(angle.guaranteeCopy)}</p></section><section><h2>${esc(angle.responseTitle)}</h2><p>${esc(article.body[2])}</p><p>${esc(angle.responseCopy)}</p></section><section class="faq-list"><h2>Questions frequentes</h2>${angle.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section><div class="source-box"><strong>Sources utiles</strong><a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028779136/" rel="nofollow">Legifrance - assurance en copropriete</a><a href="https://www.service-public.fr/particuliers/vosdroits/F2028" rel="nofollow">Service-Public.fr - logement et location</a></div></div><aside class="article-cta">${form({ need: "pno-cno", profile: "bailleur" })}</aside></article>`;
  return layout({ slug: `blog/${article.slug}`, title: article.title, description: article.description, body });
}

function hubPage() {
  const body = `<section class="page-hero compact-hero pno-cno-hero"><div class="container"><p class="eyebrow">Hub PNO/CNO</p><h1>Assurance CNO, PNO et immeuble: trouver le bon contrat.</h1><p>Un hub specialise pour capter les recherches des coproprietaires non occupants, proprietaires bailleurs, SCI et syndics qui veulent comparer sans perdre de temps.</p><div class="hero-actions"><a class="button primary" data-track="cta-primary" href="#devis">Devis PNO/CNO</a><a class="button secondary" data-track="cta-secondary" href="tel:${PHONE_HREF}">Appeler</a></div></div></section><section class="band page-band" id="devis"><div class="split"><div><p class="eyebrow dark">Capture directe</p><h2>Transformer une recherche PNO/CNO en demande exploitable.</h2><p class="large-copy">Le hub ne doit pas seulement orienter: il doit capter les visiteurs prets a comparer. Le formulaire qualifie le profil, la situation du lot, la ville, l'occupation, l'echeance et les sinistres avant rappel.</p><ul class="check-list"><li>CNO pour coproprietaire non occupant en copropriete.</li><li>PNO pour logement loue, vacant ou occupe gratuitement.</li><li>SCI ou bailleur multi-lots avec besoin de vision portefeuille.</li><li>Audit si le prix, les franchises ou les exclusions ne sont pas lisibles.</li></ul></div>${form({ need: "pno-cno", profile: "bailleur", message: "Je souhaite comparer PNO/CNO pour un lot ou un portefeuille immobilier." })}</div></section><section class="band page-band"><div class="card-grid">${pages.map((page) => `<article class="content-card"><p class="eyebrow dark">${esc(page.eyebrow)}</p><h3><a href="/${page.slug}.html">${esc(page.title)}</a></h3><p>${esc(page.description)}</p></article>`).join("")}${articles.map((article) => `<article class="content-card"><p class="eyebrow dark">${esc(article.category)}</p><h3><a href="/blog/${article.slug}.html">${esc(article.title)}</a></h3><p>${esc(article.description)}</p></article>`).join("")}</div></section><section class="band faq-band"><div class="container narrow"><h2>Questions frequentes PNO/CNO</h2><div class="faq-list"><details><summary>Le hub remplace-t-il une demande de devis ?</summary><p>Non. Le hub oriente vers le bon parcours: CNO, PNO, comparaison ou devis. Le formulaire reste necessaire pour qualifier le lot, l'occupation et l'echeance.</p></details><details><summary>Quand choisir la page CNO ?</summary><p>Quand le besoin concerne un lot en copropriete et la responsabilite du coproprietaire non occupant.</p></details><details><summary>Quand choisir le parcours PNO/CNO ?</summary><p>Quand le visiteur hesite entre plusieurs statuts: proprietaire non occupant, coproprietaire, SCI ou bailleur multi-lots.</p></details><details><summary>Quels elements accelerent le rappel ?</summary><p>Adresse, statut du lot, occupation, contrat actuel, attestation immeuble, echeance et sinistres recents.</p></details></div></div></section><section class="band compare-band"><div class="container narrow"><h2>Priorite conversion.</h2><p class="large-copy">Chaque page du cluster renvoie vers un formulaire court mais qualifiant. Le scoring lead valorise les besoins CNO/PNO, les lots en copropriete, les biens vacants et les portefeuilles multi-lots.</p></div></section>`;
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
  const cluster = `<section class="band pno-cno-cluster"><div class="section-head"><p class="eyebrow dark">PNO/CNO</p><h2>Demandes prioritaires proprietaires non occupants.</h2></div><div class="card-grid"><article class="content-card"><h3><a href="/assurance-cno.html">Assurance CNO</a></h3><p>Coproprietaire non occupant: responsabilite civile, lot loue ou vacant et articulation avec le contrat immeuble.</p></article><article class="content-card"><h3><a href="/assurance-pno-cno.html">Comparer PNO/CNO</a></h3><p>Comprendre le bon contrat selon copropriete, SCI, logement vacant ou immeuble locatif.</p></article><article class="content-card"><h3><a href="/devis-pno-cno.html">Devis PNO/CNO</a></h3><p>Formulaire court pour recevoir une analyse et etre recontacte rapidement.</p></article><article class="content-card"><h3><a href="/assurance-immeuble-vacant.html">Immeuble vacant</a></h3><p>Batiment entier vide: vacance declaree, surveillance, eau, gel, vandalisme et travaux.</p></article></div></section>`;
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

function enhancePnoCnoAuthority() {
  const block = `<section class="band pno-cno-authority"><div class="container narrow"><p class="eyebrow dark">PNO, CNO et copropriete</p><h2>Qui doit assurer quoi ?</h2><p>En copropriete, chaque coproprietaire, occupant ou non occupant, doit etre assure au minimum contre les risques de responsabilite civile dont il repond. Hors copropriete, cette obligation legale ne s'applique pas de la meme facon : les garanties dommages d'une PNO restent un choix de protection a analyser selon le bien et son occupation.</p><div class="table-wrap"><table><thead><tr><th>Situation</th><th>Parcours principal</th><th>Point a verifier</th></tr></thead><tbody><tr><td>Lot loue en copropriete</td><td><a href="/assurance-cno">CNO / PNO du coproprietaire</a></td><td>RC du coproprietaire, contrat du syndicat et assurance du locataire.</td></tr><tr><td>Lot vacant en copropriete</td><td><a href="/assurance-cno">CNO avec vacance declaree</a></td><td>Duree d'inoccupation, degat des eaux, gel, vol et surveillance.</td></tr><tr><td>Maison ou logement hors copropriete</td><td><a href="/assurance-pno">PNO</a></td><td>Dommages au bien, responsabilite du bailleur et absence d'occupant.</td></tr><tr><td>Immeuble entier vide</td><td><a href="/assurance-immeuble-vacant">Multirisque immeuble vacant</a></td><td>Vacance totale, parties communes, acces, fluides, travaux et securisation.</td></tr></tbody></table></div><div class="source-box"><strong>Textes et informations de reference</strong><a href="https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000028779136" rel="noopener">Legifrance - article 9-1 de la loi du 10 juillet 1965</a><a href="https://www.service-public.fr/particuliers/vosdroits/F21532" rel="noopener">Service-Public.fr - assurance incendie du proprietaire et logement vacant</a><a href="https://www.anil.org/adil-44/les-info-semaines-de-ladil/220526-lassurance-habitation-est-elle-obligatoire/" rel="noopener">ANIL - obligation d'assurance et proprietaire bailleur</a></div><p class="legal-note">Information generale, a confirmer avec les conditions du contrat et la situation exacte du bien.</p></div></section>`;
  for (const fileName of ["assurance-pno.html", "assurance-cno.html", "assurance-pno-cno.html"]) {
    injectBlock(join(OUT, fileName), "pno-cno-authority", block);
  }
}
function run() {
  mkdirSync(join(OUT, "blog"), { recursive: true });
  for (const page of pages) writePage(page.slug, landingPage(page));
  for (const article of articles) writePage(`blog/${article.slug}`, articlePage(article));
  enhanceCoreServiceDepth();
  enhancePnoCnoAuthority();
  enhanceExistingPages();
  console.log(`Lead growth factory wrote ${pages.length + articles.length + 1} PNO/CNO pages and injected conversion clusters.`);
}

run();