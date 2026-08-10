import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SITE = "https://immeubleassur.com";
const OUT = "public";
const REPORT_DIR = "reports";
const PHONE = "01 80 85 57 86";
const PHONE_HREF = "+33180855786";
const EMAIL = "team@immeubleassur.com";
const ORIAS = "11 061 425";
const HERO_IMAGE = "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80";

function versionedAsset(path) {
  const file = join(OUT, ...path.replace(/^\//, "").split("/"));
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10);
  return `${path}?v=${hash}`;
}

const STYLES_URL = versionedAsset("/assets/styles.css");
const APP_JS_URL = versionedAsset("/assets/app.js");

const moneyRows = `
assurance-immeuble-obligatoire|Assurance immeuble obligatoire: qui assure quoi|Assurance immeuble obligatoire: RC, copropriete, PNO, syndic, bailleur et garanties utiles avant devis.|Obligation|assurance immeuble obligatoire|syndics, conseils syndicaux, bailleurs et coproprietaires|distinguer l'obligation, la responsabilite civile et les garanties utiles|copropriete|syndic-professionnel|copropriete|/assurance-copropriete,/assurance-pno,/faq/copropriete,/devis-assurance-immeuble?intent=copropriete
 devis-assurance-immeuble-en-ligne|Devis assurance immeuble en ligne avec analyse|Devis assurance immeuble en ligne: formulaire qualifiant, garanties, sinistres, franchises et rappel specialise.|Devis qualifie|devis assurance immeuble en ligne|bailleurs, SCI, syndics et administrateurs de biens|obtenir une reponse exploitable sans dossier incomplet|multirisque-immeuble|bailleur|immeuble-locatif|/devis-assurance-immeuble,/comparateur-assurance-immeuble,/checklist-documents-assurance-immeuble,/prix-assurance-immeuble
 courtier-assurance-immeuble|Courtier assurance immeuble: consultation assureur pilotee|Courtier assurance immeuble: cahier des charges, presentation du risque, relances compagnie et arbitrage d'offres.|Mission courtage|courtier assurance immeuble|proprietaires, SCI, syndics et administrateurs de biens|piloter une consultation assureur avec mandat, calendrier et pieces verifiees|audit-contrat|administrateur-biens|immeuble-locatif|/audit-contrat-assurance-immeuble,/assurance-sci,/gestion-sinistres-immeuble,/contact
 assurance-immeuble-de-rapport|Assurance immeuble de rapport pour bailleur|Assurance immeuble de rapport: multirisque, PNO, vacance, loyers, locaux mixtes, sinistres et audit bailleur.|Immeuble de rapport|assurance immeuble de rapport|bailleurs d'immeubles entiers et proprietaires multi-lots|proteger le bati, les loyers, la responsabilite et les occupants|multirisque-immeuble|bailleur|immeuble-locatif|/assurance-immeuble-locatif,/blog/pertes-de-loyers-immeuble,/assurance-pno,/devis-assurance-immeuble?intent=bailleur
 assurance-immeuble-monopropriete|Assurance immeuble en monopropriete|Assurance immeuble en monopropriete: garanties batiment, RC bailleur, PNO, sinistres et devis proprietaire unique.|Monopropriete|assurance immeuble monopropriete|proprietaires uniques, SCI familiales et bailleurs|couvrir un immeuble entier sans logique de copropriete|multirisque-immeuble|bailleur|immeuble-locatif|/assurance-immeuble,/assurance-sci,/assurance-local-commercial,/checklist-documents-assurance-immeuble
 assurance-batiment-proprietaire|Assurance batiment proprietaire: immeuble, SCI ou local|Assurance batiment proprietaire: garanties immeuble, RC, locaux, SCI, PNO et audit contrat avant devis.|Proprietaire de batiment|assurance batiment proprietaire|proprietaires de batiments, SCI et bailleurs de locaux|qualifier l'usage reel du batiment avant de choisir le contrat|audit-contrat|sci|local-commercial|/assurance-local-commercial,/assurance-sci,/blog/assurance-immeuble-mixte-commerce,/devis-assurance-immeuble?intent=sci
 assurance-parties-communes|Assurance parties communes: toiture, hall, reseaux et equipements|Assurance parties communes: hall, escaliers, toiture, cour, reseaux, compteurs, ascenseur et dommages collectifs.|Parties communes|assurance parties communes immeuble|conseils syndicaux, gestionnaires et coproprietaires|inventorier les zones collectives et leurs equipements avant arbitrage|copropriete|conseil-syndical|copropriete|/assurance-copropriete,/rc-syndic,/blog/assurance-immeuble-avec-ascenseur,/blog/checklist-sinistre-degat-des-eaux
 assurance-immeuble-resilie|Assurance immeuble resilie ou refuse par assureur|Assurance immeuble resilie ou refuse: reconstruire un dossier apres sinistres, aggravation ou refus de souscription.|Dossier difficile|assurance immeuble resilie|syndics, bailleurs et SCI avec refus, surprime ou resiliation|expliquer les causes et presenter les mesures correctives|audit-contrat|syndic-professionnel|copropriete|/blog/assurance-immeuble-apres-refus-assureur,/blog/sinistres-recurrents-immeuble,/gestion-sinistres-immeuble,/audit-contrat-assurance-immeuble
 assurance-immeuble-sinistre|Assurance immeuble avec sinistres: refaire un dossier|Assurance immeuble avec sinistres: historique, causes, franchises, mesures correctives et solution de renouvellement.|Sinistres|assurance immeuble avec sinistres|bailleurs, syndics et administrateurs avec degats des eaux ou incendie|transformer un historique sinistre en dossier assureur lisible|audit-contrat|administrateur-biens|immeuble-locatif|/gestion-sinistres-immeuble,/blog/checklist-sinistre-degat-des-eaux,/blog/audit-franchises-assurance-immeuble,/devis-assurance-immeuble?intent=sinistre
 assurance-immeuble-meuble-colocation|Assurance immeuble meuble ou colocation|Assurance immeuble meuble ou colocation: rotation locative, parties communes, PNO, mobilier, sinistres et garanties utiles.|Meuble et colocation|assurance immeuble colocation|bailleurs d'immeubles meubles, colocations et biens a forte rotation|aligner assurance occupant, PNO/CNO et multirisque immeuble|pno-cno|bailleur|immeuble-locatif|/assurance-pno-cno,/blog/assurance-colocation-immeuble,/blog/assurance-lot-vacant-copropriete,/devis-pno-cno
 tarif-assurance-immeuble|Tarif assurance immeuble: comprendre le cout reel|Tarif assurance immeuble: facteurs de prix, franchises, exclusions, garanties, sinistres et methode de comparaison.|Prix et arbitrage|tarif assurance immeuble|proprietaires, syndics et SCI qui comparent deux devis|comparer le cout reel plutot que la prime seule|multirisque-immeuble|bailleur|immeuble-locatif|/prix-assurance-immeuble,/blog/prix-assurance-immeuble-au-m2,/comparateur-assurance-immeuble,/devis-assurance-immeuble?intent=prix
 assurance-immeuble-syndic-benevole|Assurance immeuble syndic benevole: mandat, archives et AG|Assurance immeuble syndic benevole: mandat, PV, archives, echeance, sinistres et note de vote pour petite copropriete.|Syndic benevole|assurance immeuble syndic benevole|syndics benevoles et petites coproprietes autogerees|securiser la gestion benevole avec mandat, archives et calendrier d'assemblee|copropriete|syndic-benevole|copropriete|/assurance-copropriete,/blog/syndic-benevole-assurance,/guide-assurance-copropriete-2026,/faq/copropriete
`;

const moneyPages = moneyRows.trim().split("\n").map((line) => {
  const [slug, title, description, eyebrow, query, audience, angle, need, profile, propertyType, links] = line.trim().split("|");
  return { slug, title, description, eyebrow, query, audience, angle, need, profile, propertyType, links: links.split(",") };
});

const moneyIntentAngles = {
  "courtier-assurance-immeuble": {
    decisionTitle: "Piloter une consultation assureur avec mandat et calendrier.",
    decisionCopy: "Cette page traite le metier de courtier: qualifier le risque, cadrer le mandat, choisir les marches a consulter, relancer les compagnies et restituer les ecarts. Elle ne vend pas seulement une garantie copropriete; elle explique comment obtenir une reponse exploitable quand plusieurs assureurs doivent arbitrer.",
    checklist: ["Mandat ou accord de consultation et interlocuteur decisionnaire.", "Cahier des charges: adresse, lots, usage, sinistres, echeance et objectif commercial.", "Liste des assureurs sollicites, retours recus, refus, exclusions et delais.", "Synthese d'arbitrage: offre recommandee, points a negocier et pieces encore manquantes."],
    cards: [["Mandat", "Savoir qui autorise la consultation evite les doublons et les reponses contradictoires."], ["Marche", "La valeur vient du ciblage des compagnies adaptees au risque immeuble."], ["Relances", "Un courtier suit les retours, objections, demandes de pieces et dates limites."], ["Arbitrage", "La restitution compare prix, franchises, exclusions et qualite de gestion." ]],
    expertiseTitle: "Pourquoi cette page parle de courtage et pas seulement de contrat.",
    expertiseCopy: "Le visiteur cherche ici un pilote de consultation. Le contenu met donc l'accent sur la methode, le calendrier, les marches interroges et la transformation d'un dossier incomplet en demande defendable.",
    pitfallCopy: "Les erreurs evitees: envoyer le meme dossier a tous les assureurs, multiplier les intermediaires, oublier la date limite ou comparer deux retours sans verifier les exclusions.",
    faq: [["Quel est le role concret du courtier ?", "Il structure le dossier, consulte les assureurs pertinents, suit les objections et aide a arbitrer les offres."], ["Quand faut-il lancer la consultation ?", "Idealement avant la zone de preavis, ou immediatement si un refus, une surprime ou une resiliation arrive."], ["Le courtier remplace-t-il l'audit ?", "Non. L'audit prepare les informations; le courtage transforme ensuite ce dossier en consultation marche."], ["Pourquoi fournir le contrat actuel ?", "Il permet de comparer les ecarts reels: franchises, plafonds, exclusions, echeance et services."], ["Quels dossiers sont prioritaires ?", "Ceux avec echeance proche, refus, sinistres, travaux, commerce, vacance ou plusieurs biens a coordonner."]]
  },
  "assurance-parties-communes": {
    decisionTitle: "Inventorier les zones collectives avant de parler prix.",
    decisionCopy: "Cette page part du plan physique de l'immeuble: hall, escalier, toiture, cave, cour, reseaux, compteur, ascenseur, local technique et acces. Elle ne traite pas le mandat du syndic benevole; elle verifie ce que le contrat rattache vraiment aux zones collectives.",
    checklist: ["Liste des zones collectives: hall, escaliers, toiture, cour, caves, parkings, locaux techniques.", "Equipements: ascenseur, portail, interphone, compteur, chaufferie, VMC ou reseaux sensibles.", "Sinistres localises: infiltration toiture, degat des eaux en gaine, vandalisme hall ou choc parking.", "Frontiere privatif/commun et documents qui prouvent la repartition."],
    cards: [["Cartographie", "Nommer chaque zone evite qu'un equipement reste hors perimetre."], ["Equipements", "Ascenseur, portail ou chaufferie peuvent demander une lecture specifique."], ["Frontieres", "Privatif, commun et jouissance exclusive doivent etre distingues avant sinistre."], ["Preuves", "Photos, plans, diagnostics et PV de travaux accelerent la comprehension." ]],
    expertiseTitle: "Pourquoi cette page reste centree sur le batiment commun.",
    expertiseCopy: "Le contenu sert a verifier les surfaces et equipements collectifs assures. La question principale n'est pas qui gere la copropriete, mais quelles zones et quels dommages entrent dans le contrat.",
    pitfallCopy: "Les erreurs evitees: oublier une cave, supposer qu'un parking est inclus, confondre lot privatif et partie collective ou ne pas declarer un equipement technique.",
    faq: [["Une cour est-elle toujours couverte ?", "Elle doit etre identifiee dans le perimetre du batiment ou des annexes pour eviter une zone floue."], ["Un ascenseur demande-t-il une garantie a part ?", "Il faut verifier bris, maintenance, responsabilite et exclusions techniques selon le contrat."], ["Comment prouver une partie commune ?", "Plans, reglement, photos, PV de travaux et descriptif assureur aident a clarifier."], ["Les caves et parkings sont-ils inclus ?", "Pas automatiquement. Leur statut et leur surface doivent etre declares clairement."], ["Quand refaire le point ?", "Apres travaux, changement d'equipement, sinistre repete ou renouvellement du contrat."]]
  },
  "assurance-immeuble-syndic-benevole": {
    decisionTitle: "Securiser la gestion assurance d'une copropriete autogeree.",
    decisionCopy: "Cette page part du quotidien du syndic benevole: mandat, archives, convocations, PV, echeance, appels de fonds, declarations et suivi des sinistres. Elle ne fait pas l'inventaire des seules parties communes; elle aide un responsable non professionnel a ne pas manquer une etape.",
    checklist: ["PV de designation du syndic benevole et duree du mandat.", "Archive disponible: contrat, appel de prime, sinistres, travaux votes et contacts utiles.", "Calendrier: echeance, assemblee, delai de preavis, relance des coproprietaires.", "Note simple pour expliquer les options avant decision collective."],
    cards: [["Mandat", "La designation et les pouvoirs doivent etre clairs avant toute demarche."], ["Archives", "Un dossier range compense le manque d'outillage d'une petite copropriete."], ["Calendrier", "AG, preavis et echeance imposent une sequence d'action."], ["Transmission", "La note de synthese aide les coproprietaires a voter sans jargon." ]],
    expertiseTitle: "Pourquoi cette page parle de gestion benevole.",
    expertiseCopy: "Le visiteur a besoin d'une methode administrative simple: retrouver les preuves, respecter le calendrier et transmettre une decision claire. L'angle est humain et operationnel, pas seulement technique.",
    pitfallCopy: "Les erreurs evitees: mandat expire, contrat introuvable, sinistre non archive, sujet assurance absent de l'AG ou consultation lancee trop tard.",
    faq: [["Quel document faut-il retrouver en premier ?", "Le PV de designation et le contrat actuel donnent le point de depart."], ["Le syndic benevole peut-il demander un devis ?", "Oui s'il agit dans le cadre de son mandat et avec les informations de la copropriete."], ["Comment preparer l'AG ?", "Une note courte avec prime, echeance, sinistres, options et recommandation suffit souvent."], ["Que faire si les archives sont incompletes ?", "Lister les manques et demander une reconstitution progressive avant consultation."], ["Quand lancer la demarche ?", "Avant l'echeance, avec assez de temps pour valider les pieces et presenter les options."]]
  },
  "assurance-immeuble-de-rapport": {
    decisionTitle: "Assurer un immeuble entier construit pour produire des loyers.",
    decisionCopy: "Cette page part de la logique investisseur: revenus locatifs, lots loues, vacance, rotation, dependances, commerces eventuels et sinistres qui peuvent fragiliser le rendement. Le sujet prioritaire est la protection du revenu et du bati d'un immeuble de rapport, pas seulement le statut du proprietaire.",
    checklist: ["Nombre de logements, loyers, surfaces et dependances.", "Vacance, rotation locative et qualite des baux.", "Garanties utiles aux revenus: pertes de loyers, recours, vandalisme et degats des eaux.", "Contrats occupants, PNO et multirisque immeuble a aligner."],
    cards: [["Rendement", "Relier prime, franchises et pertes possibles au revenu locatif annuel."], ["Lots", "Decrire chaque usage: habitation, commerce, cave, parking ou local technique."], ["Vacance", "Mesurer les periodes sans occupant et les obligations de surveillance."], ["Arbitrage", "Comparer les offres selon le reste a charge probable apres sinistre, pas seulement le tarif affiche."]]
  },
  "assurance-immeuble-monopropriete": {
    decisionTitle: "Couvrir un immeuble detenu par un seul proprietaire sans mecanique de copropriete.",
    decisionCopy: "Cette page traite la responsabilite unique du proprietaire ou de la SCI familiale: parties communes internes, toiture, escaliers, compteurs, cour, locaux annexes et occupants. Le sujet n'est pas le rendement locatif pur: il faut clarifier qui assume chaque partie du batiment lorsqu'il n'existe pas de syndicat de copropriete.",
    checklist: ["Statut du proprietaire: particulier, indivision ou SCI familiale.", "Parties communes internes gerees directement par le proprietaire.", "Contrats occupants et limites de prise en charge hors copropriete.", "Entretien, travaux prevus et responsabilite civile du batiment."],
    cards: [["Responsabilite unique", "Sans syndicat, le proprietaire porte directement les decisions d'entretien et de declaration."], ["Bati commun", "Escaliers, toiture, reseaux, caves et cour doivent etre rattaches au bon contrat."], ["SCI familiale", "Verifier gerance, usage des lots et coherence entre patrimoine et assurance."], ["Prevention", "Documenter entretien, diagnostics et travaux evite une lecture defavorable du risque."]]
  },
  "assurance-immeuble-resilie": {
    decisionTitle: "Traiter une rupture de contrat avant la date d'effet.",
    decisionCopy: "Cette page part du courrier de resiliation ou du refus assureur: motif, date d'effet, preavis, garanties interrompues et solution de remplacement. Le sujet prioritaire est la continuite de couverture, pas l'analyse d'un sinistre isole.",
    checklist: ["Date de fin du contrat et motif exact.", "Courrier assureur, surprime, refus ou exclusion.", "Pieces correctives deja disponibles.", "Plan de remplacement avant interruption."],
    cards: [["Calendrier", "Identifier la date limite et les marges de consultation avant rupture."], ["Motif", "Classer non-paiement, sinistralite, aggravation ou refus de souscription."], ["Correctifs", "Montrer les mesures prises pour redevenir acceptable."], ["Remplacement", "Chercher une solution active plutot qu'un simple audit historique."]]
  },
  "assurance-immeuble-sinistre": {
    decisionTitle: "Defendre un historique de sinistres sans partir d'une resiliation.",
    decisionCopy: "Cette page part des faits techniques: type de sinistre, cause, montant, recurrence, indemnisation, recherche de fuite et travaux correctifs. Le contrat peut encore etre actif: l'objectif est de rendre l'historique comprehensible avant renouvellement.",
    checklist: ["Nature des sinistres et dates declarees.", "Montants indemnises et franchises appliquees.", "Causes identifiees et recurrence eventuelle.", "Travaux, prevention et preuves apres correction."],
    cards: [["Chronologie", "Presenter chaque sinistre dans l'ordre avec cause, montant et issue."], ["Technique", "Distinguer degat des eaux, incendie, infiltration, vandalisme ou recours."], ["Prevention", "Documenter les travaux et mesures qui reduisent le risque futur."], ["Renouvellement", "Comparer le dossier avant echeance sans attendre une resiliation."]]
  },
  "assurance-immeuble-obligatoire": {
    decisionTitle: "Clarifier l'obligation d'assurance selon le statut.",
    decisionCopy: "Cette page repond a une question juridique et pratique: qui doit assurer quoi entre syndicat des coproprietaires, bailleur, coproprietaire non occupant, SCI et occupant. L'objectif est d'identifier le minimum responsabilite civile et les garanties utiles avant devis.",
    checklist: ["Statut: copropriete, bailleur, SCI ou proprietaire unique.", "Contrat du syndicat et responsabilite civile.", "Assurance occupant et PNO/CNO eventuelle.", "Garanties utiles au-dela du minimum obligatoire."],
    cards: [["Acteur", "Identifier qui porte l'obligation: syndicat, coproprietaire, bailleur ou gerant."], ["Minimum", "Verifier la responsabilite civile avant de parler multirisque."], ["Limites", "Distinguer obligation legale et protection vraiment utile."], ["Devis", "Passer au formulaire quand le statut et les contrats voisins sont clairs."]]
  },
  "assurance-immeuble-meuble-colocation": {
    decisionTitle: "Assurer une exploitation meublee ou en colocation.",
    decisionCopy: "Cette page traite la rotation locative, les meubles, les baux, les attestations occupants et les parties communes sollicitees. Le sujet n'est pas l'obligation generale: il s'agit de presenter l'exploitation reelle d'un immeuble meuble ou partage.",
    checklist: ["Type de baux, rotation annuelle et periode de vacance.", "Meubles, equipements, parties communes et dependances.", "Attestations occupants et recours possibles.", "Sinistres frequents: eau, bris, incendie ou vandalisme."],
    cards: [["Rotation", "Les entrees et sorties frequentes changent la surveillance et la preuve d'occupation."], ["Meubles", "Declarer les equipements et zones communes evite les zones floues."], ["Colocation", "Le bail et les attestations occupants doivent etre coherents avec le contrat immeuble."], ["Prevention", "Entretien, detection et suivi des sinistres limitent les refus au renouvellement."]]
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
  return `<header class="site-header" data-elevate><a class="brand" href="/" aria-label="ImmeubleAssur accueil"><span class="brand-mark" aria-hidden="true">IA</span><span><strong>ImmeubleAssur</strong><small>courtier immeuble</small></span></a><nav class="nav" aria-label="Navigation principale"><a href="/assurance-immeuble.html">Immeuble</a><a href="/recherches-assurance-immeuble.html">Recherches</a><a href="/assurance-copropriete.html">Copropriete</a><a href="/assurance-pno.html">PNO</a><a href="/villes.html">Villes</a><a href="/blog.html">Blog</a><a href="/devis-assurance-immeuble.html">Devis</a></nav><a class="header-phone" href="tel:${PHONE_HREF}">${PHONE}</a></header>`;
}

function footer() {
  return `<footer class="site-footer" id="contact"><div><strong>ImmeubleAssur</strong><p>Courtier specialiste immeuble, copropriete, PNO, CNO, SCI et syndic.</p></div><address><a href="tel:${PHONE_HREF}">${PHONE}</a><a href="mailto:${EMAIL}">${EMAIL}</a><a href="/confidentialite.html">Confidentialite</a><span>ORIAS ${ORIAS}</span></address></footer>`;
}

function form(defaults = {}) {
  const selected = (name, value) => defaults[name] === value ? " selected" : "";
  return `<form class="quote-panel money-intent-form" id="lead-form" novalidate><div class="form-heading"><p>Devis immeuble</p><h2>Recevoir mon analyse</h2></div><input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" /><div class="field-grid"><label>Nom et prenom *<input name="name" autocomplete="name" required placeholder="Jean Dupont" /></label><label>Telephone *<input name="phone" type="tel" autocomplete="tel" required placeholder="06 12 34 56 78" /></label></div><label>Email *<input name="email" type="email" autocomplete="email" required placeholder="contact@exemple.fr" /></label><div class="field-grid"><label>Profil *<select name="profile" required><option value="">Choisir</option><option value="bailleur"${selected("profile", "bailleur")}>Bailleur / proprietaire</option><option value="sci"${selected("profile", "sci")}>SCI / fonciere</option><option value="syndic-professionnel"${selected("profile", "syndic-professionnel")}>Syndic professionnel</option><option value="syndic-benevole"${selected("profile", "syndic-benevole")}>Syndic benevole</option><option value="administrateur-biens"${selected("profile", "administrateur-biens")}>Administrateur de biens</option><option value="conseil-syndical"${selected("profile", "conseil-syndical")}>Conseil syndical</option></select></label><label>Type de bien *<select name="property_type" required><option value="">Choisir</option><option value="immeuble-locatif"${selected("property_type", "immeuble-locatif")}>Immeuble locatif</option><option value="copropriete"${selected("property_type", "copropriete")}>Copropriete</option><option value="lot-copropriete"${selected("property_type", "lot-copropriete")}>Lot en copropriete</option><option value="logement-vacant"${selected("property_type", "logement-vacant")}>Logement vacant</option><option value="local-commercial"${selected("property_type", "local-commercial")}>Local commercial</option><option value="parking"${selected("property_type", "parking")}>Parking / box</option></select></label></div><div class="field-grid"><label>Ville *<input name="city" autocomplete="address-level2" required placeholder="Paris" /></label><label>Lots / logements<input name="units_count" inputmode="numeric" placeholder="12" /></label></div><label>Besoin principal<select name="need"><option value="multirisque-immeuble"${selected("need", "multirisque-immeuble")}>Multirisque immeuble</option><option value="copropriete"${selected("need", "copropriete")}>Assurance copropriete</option><option value="pno"${selected("need", "pno")}>PNO bailleur</option><option value="cno"${selected("need", "cno")}>CNO coproprietaire non occupant</option><option value="pno-cno"${selected("need", "pno-cno")}>Comparer PNO/CNO</option><option value="audit-contrat"${selected("need", "audit-contrat")}>Audit contrat actuel</option></select></label><label>Message<textarea name="message" rows="3" placeholder="Adresse, contrat actuel, echeance, sinistres, travaux, lots, usage du batiment..."></textarea></label><label class="consent-row"><input type="checkbox" name="consent" required /><span>J'accepte d'etre recontacte pour recevoir mon analyse et mon devis.</span></label><button class="submit-button" type="submit">Obtenir mon devis immeuble</button><p class="form-note">Demande qualifiee par ImmeubleAssur, courtier specialise immeuble.</p><div class="form-status" role="status" aria-live="polite"></div></form>`;
}

function layout({ slug, title, description, body }) {
  const url = slug === "index" ? `${SITE}/` : `${SITE}/${slug}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#0f766e" /><meta name="robots" content="index, follow, max-image-preview:large" /><meta name="description" content="${esc(description)}" /><meta property="og:type" content="website" /><meta property="og:locale" content="fr_FR" /><meta property="og:site_name" content="ImmeubleAssur" /><meta property="og:title" content="${esc(title)} | ImmeubleAssur" /><meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${url}" /><meta property="og:image" content="${HERO_IMAGE}" /><link rel="canonical" href="${url}" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="manifest" href="/manifest.webmanifest" /><link rel="preload" as="image" href="/assets/hero-building.webp" type="image/webp" /><link rel="stylesheet" href="${STYLES_URL}" /><title>${esc(title)} | ImmeubleAssur</title></head><body><a class="skip-link" href="#main-content">Aller au contenu principal</a>${nav()}<main id="main-content">${body}</main>${footer()}<script src="${APP_JS_URL}" type="module"></script></body></html>`;
}
function linkTitle(href) {
  return href.replace(/^\//, "").replace(/\?.*$/, "").split("-").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function relatedCards(page) {
  return page.links.map((href) => `<article class="content-card"><h3><a href="${href}">${esc(linkTitle(href))}</a></h3><p>Approfondir ce point pour construire un dossier plus clair et plus comparable.</p></article>`).join("");
}

function faq(page) {
  const customRows = moneyIntentAngles[page.slug]?.faq;
  const rows = customRows || [
    [`${page.query}: faut-il demander un devis immediatement ?`, "Oui si l'echeance approche, si le contrat n'est pas clair, si un sinistre vient de se produire ou si l'occupation du bien change."],
    ["Quels documents accelerent la reponse ?", "Contrat actuel, appel de prime, adresse, nombre de lots, surfaces, usage, sinistres 36 mois et travaux votes ou prevus."],
    ["Le prix le plus bas est-il suffisant ?", "Non. Il faut lire la prime avec les franchises, plafonds, exclusions, obligations d'entretien et qualite du service sinistre."],
    ["Pourquoi passer par un specialiste immeuble ?", "Parce qu'un immeuble combine responsabilites, parties communes, occupants, sinistres et contrats voisins. Une demande generale laisse souvent des zones grises."],
    ["Comment ImmeubleAssur transforme la demande ?", "La demande est qualifiee en fiche risque: informations certaines, points manquants, garanties sensibles, priorite commerciale et prochaine action."]
  ];
  return rows.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");
}

function queryList(page) {
  const extras = ["devis assurance immeuble", "prix assurance immeuble", "comparateur assurance immeuble"];
  return [page.query, ...extras].map((query) => `<li>${esc(query)}</li>`).join("");
}

function landingPage(page) {
  const angle = moneyIntentAngles[page.slug] || {};
  const decisionTitle = angle.decisionTitle || `Repondre a ${page.query} avec un dossier exploitable.`;
  const decisionCopy = angle.decisionCopy || `Pour ${page.audience}, cette recherche demande surtout de ${page.angle}. La bonne reponse ne se limite pas a une prime: elle doit expliquer quoi assurer, quelles pieces transmettre et quelles garanties comparer.`;
  const checklist = angle.checklist || ["Identifier le statut du demandeur, le type de bien, l'occupation, les lots et les responsabilites.", "Relire le contrat actuel: prime, echeance, franchises, plafonds, exclusions et delais de declaration.", "Documenter les sinistres, les travaux, la vacance, les locaux commerciaux et les mesures de prevention.", "Transformer la recherche en fiche risque pour obtenir une proposition comparable."];
  const cards = angle.cards || [["Qualification", "Ville, usage, occupation, copropriete, SCI, bail, lots, dependances, parkings et locaux professionnels."], ["Contrat", "Prime, echeance, franchises, exclusions, plafonds, protection juridique et conditions de declaration."], ["Risque", "Historique sinistres, causes, montants, recurrence, travaux, entretien et aggravations eventuelles."], ["Decision", "Conserver, renegocier, ajuster les garanties, consulter le marche ou demander des pieces avant devis."]];
  const expertiseTitle = angle.expertiseTitle || "Pourquoi cette page est differente d'une page mot-cle.";
  const expertiseCopy = angle.expertiseCopy || `Elle clarifie une situation concrete pour ${page.audience}. Elle relie la recherche au bon parcours commercial: devis, audit, PNO/CNO, copropriete, SCI, prix ou sinistre.`;
  const pitfallCopy = angle.pitfallCopy || "Les erreurs evitees sont recurrentes: choisir seulement sur le tarif, oublier la vacance, ne pas declarer un commerce, confondre assurance occupant et contrat immeuble, ou comparer deux devis sans lire les franchises.";
  const checklistHtml = checklist.map((item) => `<li>${esc(item)}</li>`).join("");
  const cardsHtml = cards.map(([title, copy]) => `<article><h3>${esc(title)}</h3><p>${esc(copy)}</p></article>`).join("");
  const body = `<section class="page-hero compact-hero"><div class="container"><p class="eyebrow">${esc(page.eyebrow)}</p><h1>${esc(page.title)}.</h1><p>${esc(page.description)}</p><div class="hero-actions"><a class="button primary" href="#devis">Obtenir un devis</a><a class="button secondary" href="/recherches-assurance-immeuble.html">Voir le guide</a></div></div></section><section class="band page-band" id="devis"><div class="split"><div><p class="eyebrow dark">Intention de recherche</p><h2>${esc(decisionTitle)}</h2><p class="large-copy">${esc(decisionCopy)}</p><div class="article-summary"><strong>Requetes proches traitees</strong><ul>${queryList(page)}</ul></div><ul class="check-list">${checklistHtml}</ul></div>${form({ need: page.need, profile: page.profile, property_type: page.propertyType })}</div></section><section class="band compare-band"><div class="section-head"><p class="eyebrow dark">Methode ImmeubleAssur</p><h2>De la recherche Google au lead qualifie.</h2></div><div class="local-proof-grid">${cardsHtml}</div></section><section class="band seo-band"><div class="container narrow"><p class="eyebrow dark">Expertise utile</p><h2>${esc(expertiseTitle)}</h2><p class="large-copy">${esc(expertiseCopy)}</p><p>${esc(pitfallCopy)}</p></div></section><section class="band faq-band"><div class="container narrow"><h2>Questions frequentes</h2><div class="faq-list">${faq(page)}</div></div></section><section class="band content-expansion-band"><div class="section-head"><p class="eyebrow dark">Maillage interne</p><h2>Pages utiles pour continuer.</h2></div><div class="card-grid">${relatedCards(page)}</div></section>`;
  return layout({ slug: page.slug, title: page.title, description: page.description, body });
}

function hubFaq() {
  const rows = [
    ["Quelle recherche assurance immeuble choisir ?", "Il faut partir du statut et du probleme concret: obligation, prix, devis, sinistre, SCI, monopropriete, immeuble de rapport, PNO/CNO ou syndic benevole."],
    ["Pourquoi separer devis, comparateur et courtier ?", "Le devis transforme une demande prete en dossier. Le comparateur aide a lire les offres. Le courtier structure la consultation assureur et les pieces manquantes."],
    ["Les pages par besoin remplacent-elles un audit ?", "Non. Elles orientent la recherche et preparent les informations. L'audit relit ensuite le contrat, les franchises, les exclusions, les sinistres et l'echeance."],
    ["Comment eviter deux pages trop proches ?", "Chaque page garde un angle propre: rendement, responsabilite unique, obligation, dossier difficile, tarif, parties communes ou parcours PNO/CNO."],
    ["Quand passer au formulaire ?", "Des que le visiteur connait son profil, la ville, le type de bien, le nombre de lots, l'echeance, les sinistres recents ou le contrat a verifier."]
  ];
  return rows.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("");
}

function hubPage() {
  const body = `<section class="page-hero compact-hero"><div class="container"><p class="eyebrow">Guide par intention</p><h1>Recherches assurance immeuble: trouver la bonne reponse selon le besoin.</h1><p>Un hub pour couvrir les recherches principales: obligation, devis, tarif, courtier, immeuble de rapport, monopropriete, parties communes, sinistres, PNO/CNO et syndic benevole.</p><div class="hero-actions"><a class="button primary" href="/devis-assurance-immeuble?intent=devis">Demander un devis</a><a class="button secondary" href="/devis-assurance-immeuble?intent=sinistre">Audit sinistre</a><a class="button secondary" href="/assurance-immeuble.html">Assurance immeuble</a></div></div></section><section class="band page-band"><div class="section-head"><p class="eyebrow dark">Intentions fortes</p><h2>Pages creees pour les recherches prioritaires.</h2></div><div class="card-grid">${moneyPages.map((page) => `<article class="content-card"><p class="eyebrow dark">${esc(page.query)}</p><h3><a href="/${page.slug}.html">${esc(page.title)}</a></h3><p>${esc(page.description)}</p></article>`).join("")}</div></section><section class="band compare-band"><div class="container narrow"><h2>Principe de qualite.</h2><p class="large-copy">Chaque page doit aider un demandeur reel a comprendre quoi assurer, quelles informations transmettre et comment comparer une offre. Les variations de mots-cles sans valeur ajoutee sont evitees.</p><p>Le hub sert de table d'orientation: il evite de forcer toutes les recherches vers une seule page et reduit la cannibalisation entre devis, prix, courtier, SCI, monopropriete et immeuble de rapport.</p></div></section><section class="band faq-band"><div class="container narrow"><h2>Questions frequentes sur les recherches assurance immeuble</h2><div class="faq-list">${hubFaq()}</div></div></section>`;
  return layout({ slug: "recherches-assurance-immeuble", title: "Recherches assurance immeuble par besoin", description: "Guide des recherches assurance immeuble: devis, prix, obligation, courtier, immeuble de rapport, sinistres, syndic et SCI.", body });
}
function injectBlock(file, marker, block) {
  if (!existsSync(file)) return false;
  let html = readFileSync(file, "utf8");
  const pattern = new RegExp(`\n?<!-- ${marker}:start -->[\s\S]*?<!-- ${marker}:end -->`, "g");
  html = html.replace(pattern, "");
  html = html.replace("</main>", `\n<!-- ${marker}:start -->\n${block}\n<!-- ${marker}:end -->\n</main>`);
  writeFileSync(file, html, "utf8");
  return true;
}

function clusterBlock() {
  const topPages = moneyPages.slice(0, 6);
  return `<section class="band money-intent-cluster"><div class="section-head"><p class="eyebrow dark">Recherches prioritaires</p><h2>Les parcours assurance immeuble les plus demandes.</h2></div><div class="card-grid">${topPages.map((page) => `<article class="content-card"><p class="eyebrow dark">${esc(page.query)}</p><h3><a href="/${page.slug}.html">${esc(page.title)}</a></h3><p>${esc(page.description)}</p></article>`).join("")}<article class="content-card"><p class="eyebrow dark">Guide complet</p><h3><a href="/recherches-assurance-immeuble.html">Toutes les recherches assurance immeuble</a></h3><p>Acceder au hub par besoin: prix, obligation, devis, courtier, sinistres, syndic, SCI et immeuble de rapport.</p></article></div></section>`;
}
function enhanceExistingPages() {
  const block = clusterBlock();
  const targets = ["index.html", "assurance-immeuble.html", "devis-assurance-immeuble.html", "prix-assurance-immeuble.html", "comparateur-assurance-immeuble.html", "blog.html", "faq.html", "faq/assurance-immeuble.html"];
  let injections = 0;
  for (const target of targets) {
    if (injectBlock(join(OUT, target), "money-intent-cluster", block)) injections += 1;
  }
  return injections;
}

function qualityScore(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const details = (html.match(/<details>/g) || []).length;
  const h2 = (html.match(/<h2/g) || []).length;
  let score = 35;
  if (words >= 650) score += 30;
  if (details >= 5) score += 15;
  if (h2 >= 4) score += 10;
  if (html.includes('id="lead-form"')) score += 10;
  return Math.min(100, score);
}

function run() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(join(OUT, "assets"), { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });

  const pages = [];
  for (const page of moneyPages) {
    const html = landingPage(page);
    writePage(page.slug, html);
    pages.push({ slug: page.slug, title: page.title, primary_query: page.query, quality_score: qualityScore(html) });
  }
  const hubHtml = hubPage();
  writePage("recherches-assurance-immeuble", hubHtml);
  pages.push({ slug: "recherches-assurance-immeuble", title: "Recherches assurance immeuble par besoin", primary_query: "recherches assurance immeuble", quality_score: qualityScore(hubHtml) });

  const injections = enhanceExistingPages();
  const intentMap = {
    generated_at: new Date().toISOString(),
    objective: "cover high-intent assurance immeuble searches with useful non-duplicate pages",
    pages: pages.map((page) => ({ slug: page.slug, url: `${SITE}/${page.slug}`, primary_query: page.primary_query }))
  };
  writeFileSync(join(OUT, "assets", "insurance-intent-map.json"), JSON.stringify(intentMap, null, 2), "utf8");

  const report = {
    generated_at: intentMap.generated_at,
    pages_written: pages.length,
    existing_pages_enhanced: injections,
    min_quality_score: Math.min(...pages.map((page) => page.quality_score)),
    average_quality_score: Math.round(pages.reduce((sum, page) => sum + page.quality_score, 0) / pages.length),
    safeguards: ["people-first-pages", "no-serp-scraping", "no-hidden-keyword-blocks", "unique-intent-per-page", "lead-form-present", "internal-links-to-existing-authority-pages"],
    pages
  };
  writeFileSync(join(REPORT_DIR, "money-intent-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`Money intent factory wrote ${pages.length} pages and enhanced ${injections} existing pages.`);
}

run();
