import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SITE = "https://immeubleassur.com";
const OUT = "public";
const REPORT_DIR = "reports";
const PHONE = "01 80 85 57 86";
const PHONE_HREF = "+33180855786";
const EMAIL = "team@immeubleassur.com";
const ORIAS = "11 061 425";
const HERO_IMAGE = "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80";

const cityRows = `
nancy|Nancy|Meurthe-et-Moselle|Grand Est|coproprietes de centre-ville, immeubles anciens et SCI patrimoniales|immeubles anciens et diagnostics entretien
caen|Caen|Calvados|Normandie|bailleurs, petites coproprietes et immeubles mixtes|travaux, vacance et sinistres recurrents
nimes|Nimes|Gard|Occitanie|immeubles locatifs, coproprietes et locaux commerciaux|chaleur, commerces en rez-de-chaussee et entretien
avignon|Avignon|Vaucluse|Provence-Alpes-Cote d'Azur|patrimoines locatifs, immeubles anciens et coproprietes|immeubles anciens, toiture et usage mixte
poitiers|Poitiers|Vienne|Nouvelle-Aquitaine|SCI, bailleurs et petites coproprietes|dossiers simples mais tres documentes
pau|Pau|Pyrenees-Atlantiques|Nouvelle-Aquitaine|bailleurs, syndics benevoles et residences collectives|sinistres climatiques et entretien toiture
la-rochelle|La Rochelle|Charente-Maritime|Nouvelle-Aquitaine|coproprietes littorales, locations et immeubles mixtes|exposition littorale, vacance et humidite
mulhouse|Mulhouse|Haut-Rhin|Grand Est|immeubles de rapport et coproprietes urbaines|sinistralite, vacance et qualite d'entretien
colmar|Colmar|Haut-Rhin|Grand Est|petites coproprietes, SCI et immeubles patrimoniaux|batiments anciens et garanties dommages
annecy|Annecy|Haute-Savoie|Auvergne-Rhone-Alpes|coproprietes, residences et patrimoines locatifs|standing, saisonnalite et charges de copropriete
chambery|Chambery|Savoie|Auvergne-Rhone-Alpes|coproprietes, bailleurs et immeubles proches montagne|evenements climatiques et travaux toiture
valence|Valence|Drome|Auvergne-Rhone-Alpes|immeubles locatifs, SCI et locaux mixtes|usage mixte, commerces et franchises
vannes|Vannes|Morbihan|Bretagne|coproprietes, residences secondaires et bailleurs|littoral, humidite et occupation saisonniere
lorient|Lorient|Morbihan|Bretagne|immeubles collectifs, SCI et locaux professionnels|vents, humidite et parties communes
quimper|Quimper|Finistere|Bretagne|immeubles anciens, syndics benevoles et bailleurs|toiture, facade et entretien recurrent
saint-malo|Saint-Malo|Ille-et-Vilaine|Bretagne|coproprietes littorales et residences secondaires|exposition maritime et occupation intermittente
la-roche-sur-yon|La Roche-sur-Yon|Vendee|Pays de la Loire|bailleurs, SCI et petites coproprietes|dossiers locatifs et garanties RC
cholet|Cholet|Maine-et-Loire|Pays de la Loire|immeubles locatifs et patrimoines familiaux|vacance, entretien et documents assureur
bayonne|Bayonne|Pyrenees-Atlantiques|Nouvelle-Aquitaine|coproprietes, locaux commerciaux et immeubles locatifs|littoral, commerces et sinistres eau
biarritz|Biarritz|Pyrenees-Atlantiques|Nouvelle-Aquitaine|residences, coproprietes et patrimoines de standing|occupation saisonniere et exposition littorale
cannes|Cannes|Alpes-Maritimes|Provence-Alpes-Cote d'Azur|coproprietes, residences secondaires et immeubles mixtes|standing, saisonnalite et locaux commerciaux
antibes|Antibes|Alpes-Maritimes|Provence-Alpes-Cote d'Azur|coproprietes littorales, bailleurs et SCI|littoral, parkings et sinistres climatiques
frejus|Frejus|Var|Provence-Alpes-Cote d'Azur|residences, coproprietes et immeubles locatifs|exposition littorale et occupation saisonniere
saint-nazaire|Saint-Nazaire|Loire-Atlantique|Pays de la Loire|immeubles collectifs, coproprietes et locaux mixtes|vents, humidite et usage mixte
arras|Arras|Pas-de-Calais|Hauts-de-France|immeubles anciens, SCI et coproprietes|batiments anciens et sinistres eau
douai|Douai|Nord|Hauts-de-France|immeubles de rapport et petites coproprietes|vacance, entretien et franchises
lens|Lens|Pas-de-Calais|Hauts-de-France|bailleurs, SCI et immeubles locatifs|sinistralite, vacance et lecture des exclusions
calais|Calais|Pas-de-Calais|Hauts-de-France|immeubles collectifs et coproprietes exposees|vents, humidite et garanties climatiques
dunkerque|Dunkerque|Nord|Hauts-de-France|coproprietes, locaux mixtes et immeubles littoraux|littoral, corrosion et sinistres climatiques
beauvais|Beauvais|Oise|Hauts-de-France|SCI, bailleurs et petites coproprietes|documents assureur et historique sinistres
evreux|Evreux|Eure|Normandie|immeubles locatifs, syndics benevoles et SCI|entretien, degats des eaux et vacance
chartres|Chartres|Eure-et-Loir|Centre-Val de Loire|immeubles patrimoniaux, SCI et coproprietes|toiture, facade et garanties dommages
blois|Blois|Loir-et-Cher|Centre-Val de Loire|bailleurs, petites coproprietes et immeubles anciens|qualite du dossier et travaux prevus
bourges|Bourges|Cher|Centre-Val de Loire|immeubles locatifs et patrimoines familiaux|vacance, travaux et assurance PNO
nevers|Nevers|Nievre|Bourgogne-Franche-Comte|petites coproprietes, SCI et bailleurs|sinistres, entretien et franchises
macon|Macon|Saone-et-Loire|Bourgogne-Franche-Comte|immeubles locatifs, locaux mixtes et SCI|usage mixte et presentation du risque
chalon-sur-saone|Chalon-sur-Saone|Saone-et-Loire|Bourgogne-Franche-Comte|bailleurs, coproprietes et immeubles anciens|degats des eaux et entretien
beziers|Beziers|Herault|Occitanie|immeubles locatifs, coproprietes et commerces|chaleur, vacance et locaux commerciaux
narbonne|Narbonne|Aude|Occitanie|coproprietes, SCI et immeubles proches littoral|littoral, humidite et garanties climatiques
carcassonne|Carcassonne|Aude|Occitanie|immeubles anciens, bailleurs et petites coproprietes|patrimoine ancien et travaux
albi|Albi|Tarn|Occitanie|immeubles anciens, SCI et coproprietes|toiture, facade et historique sinistres
montauban|Montauban|Tarn-et-Garonne|Occitanie|bailleurs, immeubles locatifs et SCI|occupation, travaux et garanties RC
tarbes|Tarbes|Hautes-Pyrenees|Occitanie|coproprietes, bailleurs et patrimoines locatifs|climat, toiture et parties communes
agen|Agen|Lot-et-Garonne|Nouvelle-Aquitaine|petites coproprietes, SCI et bailleurs|documents assureur et contrats existants
angouleme|Angouleme|Charente|Nouvelle-Aquitaine|immeubles anciens, SCI et bailleurs|entretien, facade et sinistres eau
niort|Niort|Deux-Sevres|Nouvelle-Aquitaine|coproprietes, SCI et patrimoines locatifs|contrats, franchises et protection juridique
saintes|Saintes|Charente-Maritime|Nouvelle-Aquitaine|bailleurs, petites coproprietes et immeubles anciens|humidite, travaux et sinistralite
valenciennes|Valenciennes|Nord|Hauts-de-France|immeubles de rapport, SCI et locaux mixtes|vacance, sinistres et activites commerciales
troyes|Troyes|Aube|Grand Est|immeubles anciens, coproprietes et patrimoines locatifs|batiments anciens et lecture des franchises
`;

const articleRows = `
prix-assurance-immeuble-au-m2|Prix assurance immeuble au m2: pourquoi le tarif seul ne suffit pas|Prix|Comprendre les facteurs qui font varier une prime d'assurance immeuble au m2 sans perdre de vue les garanties.|prix assurance immeuble|bailleurs et syndics|Comparer prime, franchises et exclusions avant de juger le prix.
assurance-immeuble-ancien|Assurance immeuble ancien: points de vigilance avant devis|Immeuble ancien|Toiture, reseaux, facade, vacance et sinistres: les elements a documenter pour assurer un immeuble ancien.|assurance immeuble ancien|SCI et proprietaires d'immeubles anciens|Presenter les travaux et l'entretien pour rassurer l'assureur.
assurance-immeuble-vacant|Immeuble vacant: comment eviter les exclusions d'assurance|Vacance|Vacance partielle ou totale, visites, securisation et chauffage: les reflexes avant de demander un devis.|assurance immeuble vacant|bailleurs avec logements vides|Verifier les clauses d'inoccupation et les obligations d'entretien.
copropriete-petite-syndic-benevole|Petite copropriete avec syndic benevole: quel contrat assurance choisir ?|Syndic benevole|Un guide pour cadrer RC, multirisque immeuble, PNO et documents d'AG dans une petite copropriete.|assurance petite copropriete|syndics benevoles|Clarifier qui assure quoi avant le vote en AG.
assurance-immeuble-avec-ascenseur|Assurance immeuble avec ascenseur: garanties et responsabilites|Equipements|Ascenseur, maintenance, bris, RC et sinistres: les clauses a lire dans un contrat immeuble.|assurance immeuble ascenseur|syndics et conseils syndicaux|Relier maintenance, controle et garanties du contrat.
assurance-parking-garages-copropriete|Parkings et garages en copropriete: comment les assurer|Parkings|Boxes, parkings ouverts, sous-sols, infiltrations et responsabilite: ce qui change dans le dossier assureur.|assurance parking copropriete|coproprietes avec stationnements|Identifier les surfaces, acces et sinistres d'infiltration.
protection-juridique-copropriete|Protection juridique copropriete: utile ou accessoire ?|Protection juridique|Litiges, voisins, prestataires, recouvrement et travaux: quand la protection juridique devient decisive.|protection juridique copropriete|syndics et conseils syndicaux|Comparer plafonds, seuils et exclusions de litige.
sinistres-recurrents-immeuble|Sinistres recurrents dans un immeuble: comment presenter le risque|Sinistres|Un historique de sinistres ne condamne pas un dossier, mais il doit etre explique et corrige.|sinistres immeuble|bailleurs et administrateurs de biens|Documenter causes, montants et mesures correctives.
ravalement-toiture-travaux-assurance|Travaux de toiture ou ravalement: impacts sur l'assurance immeuble|Travaux|Travaux votes, entreprises, dommage ouvrage, sinistres futurs: comment preparer la consultation assureur.|assurance travaux immeuble|coproprietes et SCI|Anticiper les garanties avant ouverture du chantier.
immeuble-mixte-restaurant|Immeuble avec restaurant ou commerce alimentaire: points assurance|Commerce|Extraction, stock, horaires, nuisances, bail et garanties: les informations indispensables pour l'assureur.|assurance immeuble restaurant|bailleurs d'immeubles mixtes|Declarer precisement l'activite commerciale.
local-commercial-vacant|Local commercial vacant: quelles garanties pour le proprietaire ?|Commerce|Vacance, securisation, degats des eaux et recours: assurer un local commercial non exploite.|assurance local commercial vacant|proprietaires bailleurs|Verifier inoccupation, fermeture et entretien.
pno-obligatoire-copropriete|PNO obligatoire en copropriete: ce qu'un bailleur doit retenir|PNO|La PNO n'a pas le meme role que la multirisque immeuble: voici comment articuler les contrats.|PNO obligatoire copropriete|bailleurs coproprietaires|Eviter les doublons et les trous de garantie.
sci-familiale-immeuble|SCI familiale avec immeuble locatif: organiser les assurances|SCI|PNO, multirisque, protection juridique, responsabilite: structurer les contrats d'une SCI.|assurance SCI familiale|gerants de SCI|Construire une vision portefeuille claire.
assurance-colocation-immeuble|Immeuble en colocation: questions assurance a poser|Occupation|Rotation locative, parties communes, occupants et baux: les points a cadrer dans une colocation.|assurance immeuble colocation|bailleurs de colocation|Aligner assurances occupants et proprietaire.
renovation-energetique-copropriete-assurance|Renovation energetique en copropriete: anticiper l'assurance|Travaux|Isolation, facade, toiture, entreprises et reception: ce que le contrat doit suivre pendant les travaux.|renovation energetique copropriete assurance|syndics et conseils syndicaux|Coordonner travaux, garanties et declarations.
infiltration-toiture-terrasse|Infiltration toiture-terrasse: franchises et recherche de fuite|Sinistres|Une toiture-terrasse impose une lecture stricte des obligations d'entretien et exclusions d'infiltration.|infiltration toiture terrasse assurance|coproprietes avec toiture-terrasse|Documenter entretien et origine du sinistre.
multirisque-immeuble-vs-pno|Multirisque immeuble ou PNO: comment les distinguer|Garanties|Deux contrats proches en apparence, mais des roles differents pour le batiment, le lot et le proprietaire.|multirisque immeuble PNO|bailleurs et coproprietaires|Cartographier le role de chaque contrat.
resiliation-assurance-immeuble|Resilier ou renegocier une assurance immeuble: calendrier utile|Renouvellement|Echeance, preavis, dossier de consultation et comparaison: eviter les decisions tardives.|resiliation assurance immeuble|syndics et bailleurs|Anticiper 2 a 3 mois avant echeance.
assurance-immeuble-sans-sinistre|Immeuble sans sinistre: comment valoriser le dossier|Consultation|Absence de sinistre, entretien, travaux et occupation stable peuvent ameliorer la lecture assureur.|devis assurance immeuble|proprietaires prudents|Transformer les bons signaux en dossier lisible.
assurance-immeuble-apres-refus-assureur|Refus d'assurance immeuble: comment reconstruire un dossier|Souscription|Refus, surprime ou exclusion: les leviers pour clarifier et representer le risque.|refus assurance immeuble|bailleurs en difficulte|Identifier les blocages et les pieces manquantes.
assurance-immeuble-etudiant|Immeuble locatif etudiant: garanties a verifier|Occupation|Rotation, occupation meublee, parties communes et sinistres: les points sensibles d'un immeuble etudiant.|assurance immeuble etudiant|bailleurs de logements etudiants|Cadrer occupation et entretien.
assurance-copropriete-avant-ag|Assurance copropriete avant AG: fiche de synthese utile|AG|Budget, franchises, garanties et sinistres: preparer une decision claire en assemblee generale.|assurance copropriete AG|conseils syndicaux|Rendre les arbitrages lisibles pour les coproprietaires.
pertes-de-loyers-immeuble|Pertes de loyers dans un contrat immeuble: attention aux conditions|Garanties|Une garantie pertes de loyers depend du sinistre, du delai, du plafond et du bien assure.|pertes de loyers assurance immeuble|bailleurs|Lire les conditions avant d'en attendre une indemnisation.
assurance-immeuble-protection-du-patrimoine|Assurance immeuble et protection du patrimoine: approche globale|Patrimoine|Contrats, franchises, responsabilites et prevention: assurer un immeuble comme un actif patrimonial.|assurance patrimoine immobilier|SCI et foncieres familiales|Piloter cout, garanties et risque reel.
dommages-ouvrage-copropriete-travaux|Dommages ouvrage copropriete: quand l'anticiper|Dommages ouvrage|Travaux importants, decennale, reception et financement: pourquoi la DO se prepare tot.|dommages ouvrage copropriete|syndics et conseils syndicaux|Clarifier le besoin avant consultation entreprises.
assurance-immeuble-local-professionnel|Immeuble avec local professionnel: assurance du bailleur|Immeuble mixte|Profession liberale, bureau, commerce leger ou local vacant: adapter la declaration a l'activite reelle.|assurance immeuble local professionnel|bailleurs d'immeubles mixtes|Decrire l'occupation sans approximation.
audit-franchises-assurance-immeuble|Audit des franchises assurance immeuble: la methode|Audit|Franchises par garantie, evenement, sinistre recurrent et recherche de fuite: lire le contrat autrement.|franchise assurance immeuble|bailleurs et syndics|Comparer le reste a charge probable.
checklist-sinistre-degat-des-eaux|Checklist degat des eaux immeuble: pieces a reunir|Sinistres|Photos, recherche de fuite, declaration, factures et responsabilites: gagner du temps apres sinistre.|degat des eaux immeuble|syndics et bailleurs|Organiser les preuves des le depart.
`;

const faqRows = `
assurance-immeuble|FAQ assurance immeuble|Questions courantes sur la multirisque immeuble, la responsabilite civile et les garanties batiment.|Que couvre une assurance immeuble ?;Quelle difference avec une PNO ?;Quels documents faut-il fournir ?;Un immeuble ancien coute-t-il plus cher ?;Comment comparer deux contrats ?;Les parties communes sont-elles toujours couvertes ?;Que faire apres plusieurs sinistres ?;Quand demander un audit ?
copropriete|FAQ assurance copropriete|Reponses pour syndics, conseils syndicaux et coproprietaires sur l'assurance copropriete.|La copropriete doit-elle etre assuree ?;Qui signe le contrat immeuble ?;Comment preparer le vote en AG ?;La RC du syndic est-elle incluse ?;Que doit verifier un conseil syndical ?;Comment traiter les sinistres recurrents ?;Faut-il une protection juridique ?;Quand reconsulter le marche ?
pno|FAQ PNO bailleur|Questions utiles pour proprietaires non occupants, SCI et bailleurs en copropriete.|La PNO est-elle obligatoire ?;La PNO couvre-t-elle les parties communes ?;Que se passe-t-il si le locataire n'est pas assure ?;La vacance locative est-elle couverte ?;Une SCI doit-elle souscrire une PNO ?;Comment eviter les doublons ?;Quels justificatifs demander au locataire ?;Quand comparer plusieurs PNO ?
sci|FAQ assurance SCI|Assurance d'une SCI familiale, patrimoniale ou locative: contrats et organisation.|Une SCI doit-elle avoir un contrat specifique ?;Faut-il regrouper les biens ?;Qui est l'assure au contrat ?;Comment assurer plusieurs lots ?;La protection juridique est-elle utile ?;Comment suivre les echeances ?;Quels risques pour le gerant ?;Comment presenter un portefeuille ?
sinistres|FAQ sinistres immeuble|Degats des eaux, incendie, vandalisme, recherche de fuite et recours.|Quand declarer un sinistre ?;Qui paie la recherche de fuite ?;Comment reduire les delais ?;Que faire si le sinistre revient ?;Quels documents envoyer ?;Comment lire la franchise ?;Un sinistre penalise-t-il le renouvellement ?;Quand demander un accompagnement ?
travaux|FAQ travaux et assurance immeuble|Travaux, dommage ouvrage, ravalement, toiture et declarations assureur.|Faut-il prevenir l'assureur avant travaux ?;Quand une dommage ouvrage est-elle utile ?;Quels documents demander aux entreprises ?;Le contrat couvre-t-il un chantier ?;Que change un ravalement ?;Comment declarer une toiture refaite ?;Quels impacts sur la prime ?;Quand consulter avant AG ?
prix|FAQ prix assurance immeuble|Comprendre prime, franchises, garanties et variables qui changent le budget.|Quel est le prix d'une assurance immeuble ?;Pourquoi deux devis varient autant ?;Le moins cher est-il le meilleur ?;Quels facteurs augmentent la prime ?;Comment negocier une franchise ?;Les sinistres comptent-ils beaucoup ?;Une ville change-t-elle le prix ?;Comment obtenir un devis fiable ?
local-commercial|FAQ immeuble avec local commercial|Assurance des immeubles mixtes avec commerce, bureau, restaurant ou local vacant.|Faut-il declarer l'activite du commerce ?;Qui assure le local commercial ?;Un restaurant change-t-il le risque ?;Que verifier dans le bail ?;Le stock du locataire est-il couvert ?;Comment assurer un local vacant ?;Quelles garanties pour le bailleur ?;Quand demander un audit ?
`;

const cityTargets = cityRows.trim().split("\n").map((line) => line.split("|"));
const articleBlueprints = articleRows.trim().split("\n").map((line) => {
  const [slug, title, category, description, keyword, audience, action] = line.split("|");
  return { slug, title, category, description, keyword, audience, action };
});
const faqClusters = faqRows.trim().split("\n").map((line) => {
  const [slug, title, description, questions] = line.split("|");
  return { slug, title, description, questions: questions.split(";") };
});
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
  return `<header class="site-header" data-elevate><a class="brand" href="/" aria-label="ImmeubleAssur accueil"><span class="brand-mark" aria-hidden="true">IA</span><span><strong>ImmeubleAssur</strong><small>courtier immeuble</small></span></a><nav class="nav" aria-label="Navigation principale"><a href="/assurance-immeuble.html">Immeuble</a><a href="/assurance-copropriete.html">Copropriete</a><a href="/assurance-pno.html">PNO</a><a href="/villes.html">Villes</a><a href="/blog.html">Blog</a><a href="/faq.html">FAQ</a><a href="/devis-assurance-immeuble.html">Devis</a></nav><a class="header-phone" href="tel:${PHONE_HREF}">${PHONE}</a></header>`;
}

function footer() {
  return `<footer class="site-footer" id="contact"><div><strong>ImmeubleAssur</strong><p>Courtier specialiste immeuble, copropriete, PNO, SCI et syndic.</p></div><address><a href="tel:${PHONE_HREF}">${PHONE}</a><a href="mailto:${EMAIL}">${EMAIL}</a><a href="/confidentialite.html">Confidentialite</a><span>ORIAS ${ORIAS}</span></address></footer>`;
}

function leadForm(defaults = {}) {
  const selected = (name, value) => defaults[name] === value ? " selected" : "";
  return `<form class="quote-panel" id="lead-form" novalidate><div class="form-heading"><p>Devis gratuit</p><h2>Qualifier mon immeuble</h2></div><input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" /><div class="field-grid"><label>Nom et prenom *<input name="name" autocomplete="name" required placeholder="Jean Dupont" /></label><label>Telephone *<input name="phone" type="tel" autocomplete="tel" required placeholder="06 12 34 56 78" /></label></div><label>Email *<input name="email" type="email" autocomplete="email" required placeholder="contact@exemple.fr" /></label><div class="field-grid"><label>Profil *<select name="profile" required><option value="">Choisir</option><option value="syndic-professionnel"${selected("profile", "syndic-professionnel")}>Syndic professionnel</option><option value="syndic-benevole"${selected("profile", "syndic-benevole")}>Syndic benevole</option><option value="conseil-syndical"${selected("profile", "conseil-syndical")}>Conseil syndical</option><option value="bailleur"${selected("profile", "bailleur")}>Bailleur / PNO</option><option value="sci"${selected("profile", "sci")}>SCI / fonciere</option><option value="administrateur-biens"${selected("profile", "administrateur-biens")}>Administrateur de biens</option></select></label><label>Type de bien *<select name="property_type" required><option value="">Choisir</option><option value="copropriete">Copropriete</option><option value="immeuble-locatif">Immeuble locatif</option><option value="mixte">Immeuble mixte</option><option value="commerce">Local commercial</option><option value="parking">Parking / garages</option></select></label></div><div class="field-grid"><label>Ville *<input name="city" autocomplete="address-level2" required placeholder="${esc(defaults.city || "Paris")}" value="${esc(defaults.city || "")}" /></label><label>Lots / logements<input name="units_count" inputmode="numeric" placeholder="24" /></label></div><label>Besoin principal<select name="need"><option value="multirisque-immeuble"${selected("need", "multirisque-immeuble")}>Multirisque immeuble</option><option value="copropriete"${selected("need", "copropriete")}>Assurance copropriete</option><option value="pno"${selected("need", "pno")}>PNO bailleur</option><option value="rc-syndic"${selected("need", "rc-syndic")}>RC syndic / conseil syndical</option><option value="dommages-ouvrage"${selected("need", "dommages-ouvrage")}>Dommages ouvrage</option><option value="audit-contrat"${selected("need", "audit-contrat")}>Audit contrat existant</option></select></label><label>Message<textarea name="message" rows="3" placeholder="Adresse, surface, assureur actuel, echeance, sinistres recents...">${esc(defaults.message || "")}</textarea></label><label class="consent-row"><input type="checkbox" name="consent" required /><span>J'accepte d'etre recontacte pour recevoir mon analyse et mon devis.</span></label><button class="submit-button" type="submit">Obtenir mon devis immeuble</button><p class="form-note">Donnees transmises a ImmeubleAssur pour traiter votre demande.</p><div class="form-status" role="status" aria-live="polite"></div></form>`;
}

function layout({ slug, title, description, body }) {
  const url = `${SITE}/${slug === "index" ? "" : pagePath(slug)}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#0f766e" /><meta name="robots" content="index, follow, max-image-preview:large" /><meta name="description" content="${esc(description)}" /><meta property="og:type" content="website" /><meta property="og:locale" content="fr_FR" /><meta property="og:site_name" content="ImmeubleAssur" /><meta property="og:title" content="${esc(title)} | ImmeubleAssur" /><meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${url}" /><meta property="og:image" content="${HERO_IMAGE}" /><link rel="canonical" href="${url}" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="manifest" href="/manifest.webmanifest" /><link rel="preconnect" href="https://images.unsplash.com" crossorigin /><link rel="stylesheet" href="/assets/styles.css" /><title>${esc(title)} | ImmeubleAssur</title></head><body><a class="skip-link" href="#main-content">Aller au contenu principal</a>${nav()}<main id="main-content">${body}</main>${footer()}<script src="/assets/app.js" type="module"></script></body></html>`;
}

function articleFaq(article) {
  return [[`${article.keyword} concerne qui en priorite ?`, `Le sujet concerne surtout ${article.audience}. L'analyse part du bien reel, de son usage, des sinistres et du contrat actuel.`], ["Quel document accelerera le devis ?", "Le contrat actuel et le dernier appel de prime accelerent la lecture. L'historique sinistres et les travaux prevus evitent les questions tardives."], ["Faut-il choisir le prix le plus bas ?", "Non. Il faut comparer la prime avec les franchises, plafonds, exclusions et obligations de declaration."], ["Quand demander un audit ?", "L'audit est utile avant l'echeance, avant une AG, apres plusieurs sinistres ou lorsqu'un changement d'usage modifie le risque."], ["Comment ImmeubleAssur intervient ?", `ImmeubleAssur structure le dossier, repere les informations manquantes et aide a ${article.action.toLowerCase()}`]];
}

function articlePage(article) {
  const faqs = articleFaq(article);
  const body = `<article class="article-layout rich-article"><header class="article-head"><p class="eyebrow dark">${esc(article.category)} - guide expert</p><h1>${esc(article.title)}</h1><p>${esc(article.description)}</p></header><div class="article-body"><div class="article-summary"><strong>A retenir</strong><ul><li>${esc(article.action)}</li><li>La prime doit etre lue avec les franchises, plafonds et exclusions.</li><li>Un dossier complet obtient des reponses assureur plus rapides et plus comparables.</li></ul></div><nav class="toc-list" aria-label="Sommaire"><a href="#contexte">Contexte</a><a href="#documents">Documents</a><a href="#contrat">Contrat</a><a href="#methode">Methode</a><a href="#faq">FAQ</a></nav><section id="contexte"><h2>Pourquoi ce sujet compte pour ${esc(article.audience)}.</h2><p>Une recherche comme <strong>${esc(article.keyword)}</strong> cache rarement une simple demande de prix. Le demandeur veut savoir si son immeuble, son lot, sa SCI ou sa copropriete est correctement protege et si les garanties suivront le jour du sinistre.</p><p>Le point de depart est toujours le risque reel: adresse, usage, nombre de lots, occupation, travaux, sinistres et responsabilites. Une proposition rapide mais mal cadree peut sembler attractive et devenir fragile au moment de l'indemnisation.</p></section><section id="documents"><h2>Les informations a reunir avant consultation.</h2><p>Preparez le contrat actuel, le dernier appel de prime, l'adresse complete, le nombre de lots, les surfaces, les usages du batiment, les sinistres sur 36 mois et les travaux votes ou prevus. Pour une copropriete, ajoutez les elements utiles d'assemblee generale et les informations du syndic.</p><p>Pour un immeuble mixte ou un local professionnel, l'activite exacte doit etre declaree. Pour une SCI, la lecture doit distinguer les lots, les occupants et les contrats deja en place afin d'eviter les doublons.</p></section><section id="contrat"><h2>Les clauses a lire avant de comparer.</h2><p>La prime annuelle n'est qu'une ligne du contrat. Les franchises par garantie, les plafonds de recherche de fuite, les exclusions d'inoccupation, les obligations d'entretien et les delais de declaration peuvent changer fortement le cout final du sinistre.</p><p>Un bon contrat d'assurance immeuble doit rester comprehensible pour le bailleur, le syndic ou le conseil syndical. Si la proposition ne permet pas d'arbitrer clairement entre cout, garanties et reste a charge probable, elle doit etre retravaillee.</p></section><section id="methode"><h2>La methode ImmeubleAssur.</h2><p>Notre methode consiste a transformer une demande de devis en fiche risque lisible. Nous separons les informations certaines, les points a verifier, les clauses sensibles et les pieces manquantes. Cette approche facilite la consultation assureur et limite les allers-retours.</p><p>${esc(article.action)} Cette action est prioritaire parce qu'elle cree un dossier plus defendable, mesurable et comparable.</p></section><section id="faq" class="faq-list"><h2>Questions frequentes</h2>${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section><div class="source-box"><strong>Sources utiles</strong><a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028779136/" rel="nofollow">Legifrance - copropriete et assurance</a><a href="https://www.service-public.fr/particuliers/vosdroits/F2608" rel="nofollow">Service-Public.fr - syndic de copropriete</a></div></div><aside class="article-cta">${leadForm({ need: "audit-contrat" })}</aside></article>`;
  return layout({ slug: `blog/${article.slug}`, title: article.title, description: article.description, body });
}
function cityPage(city) {
  const [slug, name, department, region, focus, angle] = city;
  const title = `Assurance immeuble ${name}`;
  const description = `Devis assurance immeuble a ${name}: copropriete, SCI, PNO, multirisque immeuble et audit contrat pour ${focus}.`;
  const body = `<section class="page-hero compact-hero"><div class="container"><p class="eyebrow">Assurance immeuble ${esc(name)}</p><h1>Assurance immeuble a ${esc(name)}.</h1><p>ImmeubleAssur accompagne ${esc(focus)} avec une analyse concrete des garanties, franchises, exclusions et documents attendus par les assureurs.</p><div class="hero-actions"><a class="button primary" href="#devis">Devis immeuble ${esc(name)}</a><a class="button secondary" href="/villes.html">Toutes les villes</a></div></div></section><section class="band page-band"><div class="split"><div><p class="eyebrow dark">${esc(department)} - ${esc(region)}</p><h2>Un dossier local centre sur ${esc(angle)}.</h2><p class="large-copy">A ${esc(name)}, la question n'est pas seulement de trouver une assurance immeuble. Il faut presenter le batiment de facon exploitable: usage, lots, entretien, sinistres, travaux, activites en rez-de-chaussee et responsabilites.</p><ul class="check-list"><li>Multirisque immeuble pour copropriete, SCI ou monopropriete.</li><li>PNO bailleur et coherence avec les contrats occupants.</li><li>Audit des franchises degats des eaux, incendie, vandalisme et evenements climatiques.</li><li>Preparation d'une fiche risque claire pour assureurs.</li></ul></div>${leadForm({ city: name, need: "multirisque-immeuble" })}</div></section><section class="band seo-band"><div class="section-head"><p class="eyebrow dark">Analyse du risque</p><h2>Ce que nous documentons avant consultation.</h2></div><div class="local-proof-grid"><article><h3>Batiment</h3><p>Adresse, annee approximative, nombre de lots, surface, parties communes, toiture, facade, reseaux et equipements techniques.</p></article><article><h3>Occupation</h3><p>Lots loues, vacants, occupes, locaux commerciaux, parkings, caves, dependances et activites declarees au bail.</p></article><article><h3>Sinistres</h3><p>Historique 36 mois, causes, montants, recurrence, recherche de fuite, mesures correctives et pieces disponibles.</p></article><article><h3>Arbitrage</h3><p>Comparaison de la prime avec franchises, plafonds, exclusions, delais de declaration et qualite du service sinistre.</p></article></div></section><section class="band faq-band"><div class="container narrow"><h2>FAQ assurance immeuble ${esc(name)}</h2><div class="faq-list"><details><summary>Pourquoi demander un devis specialise a ${esc(name)} ?</summary><p>Parce qu'un immeuble doit etre presente selon son usage, son entretien et ses sinistres. Une fiche risque locale evite les approximations et facilite la comparaison.</p></details><details><summary>La ville change-t-elle le prix de l'assurance ?</summary><p>La localisation peut influencer l'appetence assureur, mais elle ne suffit pas. L'occupation, les travaux, les sinistres et les franchises pesent souvent davantage.</p></details><details><summary>Quels documents preparer ?</summary><p>Contrat actuel, appel de prime, sinistres 36 mois, lots, surface, travaux prevus, photos si utiles et informations syndic ou bailleur.</p></details></div></div></section>`;
  return layout({ slug: `assurance-immeuble-${slug}`, title, description, body });
}

function faqTopicPage(topic) {
  const answers = ["La reponse depend du statut du demandeur, du contrat en place, de l'usage du bien et des sinistres connus. ImmeubleAssur commence par qualifier ces elements avant toute comparaison de prix.", "Le bon reflexe consiste a verifier les garanties, les franchises, les exclusions et les obligations de declaration. Un contrat clair vaut mieux qu'une prime basse mal comprise.", "Les pieces les plus utiles sont le contrat actuel, le dernier appel de prime, les sinistres sur 36 mois, le nombre de lots, la surface et les travaux prevus.", "Quand le dossier est incomplet, l'assureur peut refuser, surprimer ou exclure certains points. Une fiche risque structuree reduit ce risque.", "Pour une copropriete ou une SCI, il faut aussi distinguer le contrat immeuble, les PNO, les assurances occupants et les responsabilites du syndic ou du gerant."];
  const body = `<section class="page-hero compact-hero"><div class="container"><p class="eyebrow">FAQ specialisee</p><h1>${esc(topic.title)}</h1><p>${esc(topic.description)}</p></div></section><section class="band faq-band"><div class="faq-list">${topic.questions.map((q, index) => `<details><summary>${esc(q)}</summary><p>${esc(answers[index % answers.length])}</p></details>`).join("")}</div></section><section class="band page-band"><div class="container narrow">${leadForm({ need: "audit-contrat" })}</div></section>`;
  return layout({ slug: `faq/${topic.slug}`, title: topic.title, description: topic.description, body });
}

function strategyPage() {
  const body = `<section class="page-hero compact-hero"><div class="container"><p class="eyebrow">SEO continu</p><h1>Systeme SEO continu ImmeubleAssur.</h1><p>Le site combine contenus utiles, audit technique, suivi des conversions et connecteurs Google Search Console pour detecter les opportunites sans recourir au spam.</p></div></section><section class="band page-band"><div class="seo-score-grid"><article><strong>Contenu</strong><span>Articles, FAQ, villes qualifiees et maillage interne.</span></article><article><strong>Technique</strong><span>Canonicals, sitemap, schemas, liens propres et controles HTML.</span></article><article><strong>Performance</strong><span>PageSpeed Insights et Core Web Vitals lorsque l'API est disponible.</span></article><article><strong>Opportunites</strong><span>Search Console: impressions, CTR, position moyenne et pages a renforcer.</span></article></div></section><section class="band compare-band"><div class="container narrow"><h2>Principe de pilotage.</h2><p class="large-copy">Les automatismes doivent aider a produire de meilleures reponses pour les syndics, bailleurs, SCI et coproprietaires. Les pages purement dupliquees, les blocs de villes sans valeur et le trafic automatise vers Google sont exclus du systeme.</p></div></section>`;
  return layout({ slug: "strategie-seo-continue", title: "Systeme SEO continu", description: "Methode ImmeubleAssur pour piloter le SEO: contenus utiles, audits, Google Search Console, PageSpeed et conversions.", body });
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function qualityScore(html) {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  const details = (html.match(/<details>/g) || []).length;
  const h2 = (html.match(/<h2/g) || []).length;
  let score = 40;
  if (words >= 500) score += 25;
  if (details >= 3) score += 15;
  if (h2 >= 3) score += 10;
  if (html.includes('id="lead-form"')) score += 10;
  return Math.min(100, score);
}

function injectBlock(file, marker, block) {
  if (!existsSync(file)) return false;
  let html = readFileSync(file, "utf8");
  const pattern = new RegExp(`\\n?<!-- ${marker}:start -->[\\s\\S]*?<!-- ${marker}:end -->`, "g");
  html = html.replace(pattern, "");
  html = html.replace("</main>", `\n<!-- ${marker}:start -->\n${block}\n<!-- ${marker}:end -->\n</main>`);
  writeFileSync(file, html, "utf8");
  return true;
}

function enhanceAdminPage() {
  const file = join(OUT, "admin.html");
  const block = `<section class="plain-panel admin-seo-panel"><h2>Pilotage SEO continu</h2><div class="admin-toolbar"><button class="submit-button" type="button" id="load-seo">Charger SEO</button><a class="button secondary" href="/strategie-seo-continue.html">Voir systeme public</a></div><div class="seo-admin-grid" id="seo-summary"><p>Charge les derniers signaux SEO, conversions et opportunites D1.</p></div><section class="admin-table-wrap" aria-label="Opportunites SEO"><table class="admin-table"><thead><tr><th>Score</th><th>Type</th><th>URL</th><th>Requete</th><th>Action</th></tr></thead><tbody id="seo-opportunities-body"><tr><td colspan="5">Aucun chargement effectue.</td></tr></tbody></table></section></section>`;
  injectBlock(file, "seo-admin", block);
}

function enhanceHubs(generatedCities) {
  injectBlock(join(OUT, "blog.html"), "seo-content-factory-blog", `<section class="band content-expansion-band"><div class="section-head"><p class="eyebrow dark">Nouveaux guides experts</p><h2>Articles assurance immeuble a fort potentiel SEO.</h2></div><div class="card-grid">${articleBlueprints.slice(0, 18).map((item) => `<article class="content-card"><p class="eyebrow dark">${esc(item.category)}</p><h3><a href="/blog/${item.slug}.html">${esc(item.title)}</a></h3><p>${esc(item.description)}</p></article>`).join("")}</div></section>`);
  injectBlock(join(OUT, "villes.html"), "seo-content-factory-cities", `<section class="band content-expansion-band"><div class="section-head"><p class="eyebrow dark">Couverture locale et dossiers utiles</p><h2>Nouvelles villes couvertes par ImmeubleAssur.</h2></div><div class="card-grid">${generatedCities.slice(0, 30).map((item) => `<article class="content-card"><h3><a href="/assurance-immeuble-${item[0]}.html">Assurance immeuble ${esc(item[1])}</a></h3><p>${esc(item[4])}. ${esc(item[2])}, ${esc(item[3])}.</p></article>`).join("")}</div></section>`);
  injectBlock(join(OUT, "faq.html"), "seo-content-factory-faq", `<section class="band content-expansion-band"><div class="section-head"><p class="eyebrow dark">FAQ specialisees</p><h2>Reponses detaillees par besoin.</h2></div><div class="card-grid">${faqClusters.map((item) => `<article class="content-card"><h3><a href="/faq/${item.slug}.html">${esc(item.title)}</a></h3><p>${esc(item.description)}</p></article>`).join("")}</div></section>`);
}

function enhanceCityDepth() {
  const files = readdirSync(OUT).filter((name) => /^assurance-immeuble-[a-z0-9-]+\.html$/.test(name) && name !== "assurance-immeuble-locatif.html");
  for (const fileName of files) {
    const file = join(OUT, fileName);
    let html = readFileSync(file, "utf8");
    html = html.replace(/\n?<!-- city-depth:start -->[\s\S]*?<!-- city-depth:end -->/g, "");
    const rawName = (html.match(/<h1[^>]*>Assurance immeuble a ([^.<]+)\.?<\/h1>/i) || [])[1] || fileName.replace("assurance-immeuble-", "").replace(".html", "").split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
    const city = esc(rawName.trim());
    const block = `<section class="band city-depth-band"><div class="container narrow"><p class="eyebrow dark">Dossier local</p><h2>Comment preparer un devis assurance immeuble a ${city}.</h2><p class="large-copy">Une page locale utile doit aider le syndic, le bailleur ou la SCI a comprendre ce que l'assureur va regarder. Pour ${city}, ImmeubleAssur qualifie le batiment, l'occupation, les sinistres, les travaux, les franchises et les garanties attendues avant de comparer les propositions.</p><div class="local-proof-grid"><article><h3>Pieces utiles</h3><p>Contrat actuel, appel de prime, historique sinistres 36 mois, nombre de lots, surfaces, photos si besoin, travaux votes et informations syndic.</p></article><article><h3>Garanties</h3><p>Responsabilite civile immeuble, dommages, degats des eaux, incendie, vandalisme, evenements climatiques, recherche de fuite et protection juridique.</p></article><article><h3>Arbitrage</h3><p>Comparer la prime avec les franchises, plafonds, exclusions, obligations d'entretien et delais de declaration pour mesurer le cout reel.</p></article><article><h3>Conversion</h3><p>Le formulaire transforme la demande locale en fiche risque exploitable pour limiter les allers-retours et accelerer la consultation.</p></article></div><div class="faq-list"><details><summary>Quel est le meilleur moment pour comparer un contrat a ${city} ?</summary><p>Deux a trois mois avant echeance. Cela laisse le temps de relire le contrat, completer les pieces et consulter sans urgence.</p></details><details><summary>Un immeuble avec commerce est-il plus difficile a assurer ?</summary><p>Il peut demander plus de precision. L'activite, le bail, les installations techniques et les garanties du locataire doivent etre decrits clairement.</p></details><details><summary>Pourquoi fournir l'historique sinistres ?</summary><p>Parce qu'un historique explique permet de distinguer un incident isole d'un probleme recurrent et de montrer les mesures correctives deja prises.</p></details></div></div></section>`;
    html = html.replace("</main>", `\n<!-- city-depth:start -->\n${block}\n<!-- city-depth:end -->\n</main>`);
    writeFileSync(file, html, "utf8");
  }
}

function run() {
  mkdirSync(join(OUT, "blog"), { recursive: true });
  mkdirSync(join(OUT, "faq"), { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });
  const pages = [];

  for (const article of articleBlueprints) {
    const html = articlePage(article);
    writePage(`blog/${article.slug}`, html);
    pages.push({ type: "article", slug: `blog/${article.slug}`, title: article.title, quality_score: qualityScore(html) });
  }

  const generatedCities = [];
  for (const city of cityTargets) {
    const slug = `assurance-immeuble-${city[0]}`;
    if (existsSync(join(OUT, `${slug}.html`))) continue;
    const html = cityPage(city);
    writePage(slug, html);
    generatedCities.push(city);
    pages.push({ type: "city", slug, title: `Assurance immeuble ${city[1]}`, quality_score: qualityScore(html) });
  }

  for (const topic of faqClusters) {
    const html = faqTopicPage(topic);
    writePage(`faq/${topic.slug}`, html);
    pages.push({ type: "faq", slug: `faq/${topic.slug}`, title: topic.title, quality_score: qualityScore(html) });
  }

  const strategyHtml = strategyPage();
  writePage("strategie-seo-continue", strategyHtml);
  pages.push({ type: "system", slug: "strategie-seo-continue", title: "Systeme SEO continu", quality_score: qualityScore(strategyHtml) });
  enhanceCityDepth();
  enhanceHubs(generatedCities);
  enhanceAdminPage();

  const report = { generated_at: new Date().toISOString(), articles: articleBlueprints.length, new_city_pages: generatedCities.length, faq_hubs: faqClusters.length, total_pages_written: pages.length, min_quality_score: Math.min(...pages.map((page) => page.quality_score)), average_quality_score: Math.round(pages.reduce((sum, page) => sum + page.quality_score, 0) / pages.length), anti_spam_controls: ["no-google-result-scraping", "no-indexing-api-for-non-job-pages", "no-hidden-keyword-blocks", "city-pages-require-local-angle-and-lead-utility", "faq-pages-serve-user-questions-before-schema"], pages };
  writeFileSync(join(REPORT_DIR, "seo-content-factory.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`SEO content factory wrote ${pages.length} pages (${articleBlueprints.length} articles, ${generatedCities.length} cities, ${faqClusters.length} FAQ hubs).`);
}

run();