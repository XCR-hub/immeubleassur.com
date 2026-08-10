import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SITE = "https://immeubleassur.com";
const OUT = "public";
const REPORT_DIR = "reports";
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
sinistre-immeuble-apres-declaration|Apres un sinistre immeuble: organiser les etapes et les pieces|Sinistres|Declaration, mesures conservatoires, recherche de fuite et suivi assureur: organiser la suite sans perdre les preuves.|sinistre immeuble apres declaration|syndics et bailleurs|Structurer les preuves, les delais et les actions correctives.
refus-assureur-apres-sinistre-immeuble|Refus assureur apres sinistre immeuble: chronologie et mesures correctives|Sinistres|Apres un refus, la chronologie des declarations, les rapports d expertise et les travaux correctifs rendent la sinistralite lisible.|chronologie sinistre mesures correctives|bailleurs et syndics confrontes a plusieurs declarations|Documenter cause racine, expertise, reparation et prevention.
renouvellement-apres-sinistre-immeuble|Renouvellement apres sinistres: preparer une consultation utile|Sinistres|Historique, travaux correctifs, franchise et echeance: les elements a reunir avant de consulter le marche.|renouvellement assurance apres sinistre|syndics et administrateurs de biens|Transformer l historique en fiche risque lisible.
sinistre-recurrent-assurance-immeuble|Sinistre recurrent assurance immeuble: mesurer le risque et les corrections|Sinistres|La recurrence appelle une analyse des causes, de la prevention et du reste a charge avant toute nouvelle proposition.|sinistre recurrent assurance immeuble|coproprietes et bailleurs|Documenter la recurrence et les mesures de prevention.
prix-assurance-immeuble-franchise|Prix assurance immeuble et franchise: calculer le reste a charge|Prix et reste a charge|Comparer une cotisation exige aussi de simuler franchise par evenement, plafond, sous-limite et budget de copropriete.|reste a charge franchise par evenement|syndics et bailleurs qui arbitrent le budget|Simuler dommages, franchise, plafond et cotisation annuelle.
syndic-copropriete-assurance-contrat|Syndic et assurance copropriete: preparer la decision du conseil syndical|Syndic benevole|Contrat, sinistres, franchises et vote en AG: une grille simple pour rendre la decision collective exploitable.|syndic assurance copropriete contrat|syndics et conseils syndicaux|Clarifier les options avant l assemblee generale.
devis-assurance-immeuble-complet|Devis assurance immeuble complet: quelles informations transmettre|Devis courtier|Adresse, lots, occupation, echeance, sinistres et travaux: constituer un dossier exploitable des le premier contact.|devis assurance immeuble complet|syndics, SCI et bailleurs|Limiter les aller retours avec une fiche risque structuree.
devis-courtier-assurance-immeuble|Devis courtier assurance immeuble: placement et validation humaine|Courtage|Le courtier qualifie l appetit des partenaires, trace les consultations et fait valider une recommandation avant presentation client.|placement courtage validation humaine|syndics et bailleurs qui veulent des offres tracees|Comparer appetit, garanties, exclusions, service et validation humaine.
devis-assurance-immeuble-refus|Devis assurance immeuble apres refus: lettre et pieces de resouscription|Devis apres refus|La lettre de refus, le questionnaire, les attestations et les justificatifs de securisation forment le dossier de resouscription.|lettre refus pieces resouscription|bailleurs et SCI apres refus de souscription|Classer motif, reserve, justificatif et partenaire a consulter.
devis-assurance-immeuble-echeance|Devis assurance immeuble avant echeance: organiser le calendrier|Devis courtier|Deux a trois mois avant l echeance, contrat, prime, sinistres et travaux permettent une comparaison plus fiable.|devis assurance immeuble echeance|syndics et administrateurs de biens|Anticiper la consultation et la validation humaine.
devis-assurance-immeuble-comparatif|Devis assurance immeuble comparatif: presenter des garanties comparables|Devis courtier|Une comparaison utile distingue franchises, plafonds, exclusions, sinistres et services avant de retenir une proposition.|devis assurance immeuble comparatif|syndics, SCI et bailleurs|Comparer des offres au meme perimetre de garanties.
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

const articleAngles = {
  "prix-assurance-immeuble-au-m2": {
    summary: ["Estimer une fourchette budgetaire par surface et usage.", "Relier le prix au m2 aux lots, activites, sinistres et travaux.", "Passer au devis seulement quand les variables tarifaires sont documentees."],
    contextTitle: "Quand le prix au m2 devient une estimation exploitable.",
    context: "Cette page traite la question budgetaire: elle aide a comprendre pourquoi deux immeubles de meme surface peuvent recevoir des primes differentes selon la ville, l'occupation, les commerces, les parties communes et l'historique sinistres.",
    documentsTitle: "Les donnees qui rendent une estimation credible.",
    documents: "Pour travailler un prix au m2, il faut separer surface assuree, nombre de lots, usage habitation ou mixte, presence de commerces, niveaux de franchises et garanties demandees. Sans ces donnees, la comparaison reste trop approximative.",
    contractTitle: "Lire le tarif avec les variables de risque.",
    contract: "Le prix annuel se lit avec les plafonds, les exclusions et la gestion sinistre, mais l'angle principal reste la construction du budget previsionnel. L'objectif est de savoir quelles variables expliquent l'ecart entre deux devis.",
    methodTitle: "La methode ImmeubleAssur pour cadrer le budget.",
    method: "Nous transformons la recherche de prix en grille de variables: surface, lots, usage, ville, sinistres, travaux et garanties attendues. Le devis devient comparable parce que le perimetre tarifaire est stabilise.",
    ctaNeed: "prix"
  },
  "audit-franchises-assurance-immeuble": {
    summary: ["Tester le reste a charge sur des scenarios de sinistre concrets.", "Comparer franchises par garantie, evenement et recurrence.", "Identifier les clauses qui rendent une prime basse moins protectrice."],
    contextTitle: "Quand la franchise change le cout reel du contrat.",
    context: "Cette page ne cherche pas a estimer un prix moyen. Elle analyse ce qui reste a payer apres degat des eaux, recherche de fuite, incendie, vandalisme ou sinistre recurrent, lorsque la franchise et les plafonds deviennent decisifs.",
    documentsTitle: "Les pieces utiles pour auditer les franchises.",
    documents: "L'audit demande les conditions particulieres, le tableau des garanties, les franchises par evenement, les plafonds de recherche de fuite, l'historique sinistre et les mesures correctives. Le sujet central est le reste a charge probable.",
    contractTitle: "Lire les franchises ligne par ligne.",
    contract: "Une franchise peut etre fixe, proportionnelle, appliquee par local, par evenement ou par garantie. L'audit verifie aussi les exclusions, les seuils d'intervention et les cas ou plusieurs franchises peuvent s'additionner.",
    methodTitle: "La methode ImmeubleAssur pour arbitrer les franchises.",
    method: "Nous simulons les scenarios les plus plausibles pour l'immeuble: fuite recurrente, sinistre toiture, local commercial ou incendie. Le contrat est juge sur le reste a charge et la clarte d'indemnisation, pas seulement sur la prime.",
    ctaNeed: "audit-contrat"
  },
  "sci-familiale-immeuble": {
    summary: ["Organiser les contrats autour de la SCI et de son gerant.", "Distinguer patrimoine familial, lots loues et responsabilites.", "Construire une vision portefeuille plutot qu'un devis lot par lot."],
    contextTitle: "Quand une SCI familiale doit structurer ses assurances.",
    context: "Cette page traite la gouvernance d'une SCI familiale: qui souscrit, quels biens sont portes par la societe, quelles responsabilites restent au gerant et comment eviter des contrats disperses entre plusieurs lots.",
    documentsTitle: "Les documents utiles pour une SCI.",
    documents: "Le dossier doit reunir statuts ou informations de gestion, liste des biens, occupation, baux, contrats PNO existants, multirisque immeuble, sinistres et echeances. La question principale est l'organisation patrimoniale.",
    contractTitle: "Lire les garanties a l'echelle du patrimoine.",
    contract: "Une SCI peut avoir plusieurs lots, immeubles ou locaux. L'analyse verifie les responsabilites du gerant, les doublons entre contrats et la coherence entre assurance du batiment, PNO et protection juridique.",
    methodTitle: "La methode ImmeubleAssur pour une SCI familiale.",
    method: "Nous cartographions les biens, les occupants, les contrats et les echeances pour obtenir une vision portefeuille. Le devis devient un outil de pilotage patrimonial, pas seulement une police par adresse.",
    ctaNeed: "audit-contrat"
  },
  "assurance-immeuble-etudiant": {
    summary: ["Cadrer la rotation locative et l'occupation meublee.", "Verifier parties communes, baux, vacance courte et sinistres repetes.", "Adapter le dossier aux bailleurs de logements etudiants."],
    contextTitle: "Quand l'occupation etudiante change le risque immeuble.",
    context: "Cette page traite un immeuble occupe par des etudiants: entrees et sorties frequentes, logements meubles, colocation possible, vacance courte, degats des eaux et usage intensif des parties communes.",
    documentsTitle: "Les informations a reunir pour un immeuble etudiant.",
    documents: "Le dossier doit preciser nombre de logements, rotation annuelle, type de bail, meubles, parties communes, controle des attestations occupants, sinistres repetes et periode de vacance entre deux locataires.",
    contractTitle: "Lire le contrat avec l'occupation reelle.",
    contract: "L'enjeu n'est pas la structure patrimoniale d'une SCI, mais l'exploitation locative: surveillance, entretien, recours contre occupants, dommages aux parties communes et exclusions liees a la vacance.",
    methodTitle: "La methode ImmeubleAssur pour un immeuble etudiant.",
    method: "Nous transformons la rotation locative en informations assureur: occupation, baux, prevention, sinistres et gestion des parties communes. Le dossier devient plus lisible pour un bailleur ou administrateur de biens.",
    ctaNeed: "multirisque-immeuble"
  }
};
const mediumRiskArticleAngles = {
  "assurance-copropriete-avant-ag": {
    summary: ["Preparer une note de vote lisible avant assemblee generale.", "Separer budget, sinistres, franchise et decision des coproprietaires.", "Arriver en AG avec options et consequences pratiques."],
    contextTitle: "Quand l'assurance devient un sujet d'assemblee generale.",
    context: "Cette page sert aux conseils syndicaux qui doivent transformer un contrat technique en decision collective: budget previsionnel, sinistres declares, garanties sensibles et marge de negociation avant l'AG.",
    documentsTitle: "Les pieces a mettre dans le dossier AG.",
    documents: "Le dossier AG doit reunir ordre du jour, contrat en cours, appel de prime, sinistres commentes, travaux votes et options proposees. Le sujet central est la decision collective, pas la simple lecture d'une garantie.",
    contractTitle: "Lire le contrat comme une resolution a voter.",
    contract: "La presentation doit montrer ce que le syndicat accepte: reste a charge, exclusions, protection juridique, gestion des prestataires et calendrier de renouvellement.",
    methodTitle: "La methode ImmeubleAssur avant AG.",
    method: "Nous transformons les clauses en synthese de vote: conserver, ajuster, consulter ou reporter avec pieces manquantes identifiees.",
    ctaNeed: "copropriete",
    faq: [["Quand preparer le sujet assurance avant AG ?", "Deux a trois mois avant l'assemblee laisse le temps de completer les pieces et d'obtenir des options comparables."], ["Que doit comprendre la note au conseil syndical ?", "Budget, sinistres, garanties sensibles, franchise principale, echeance et recommandation d'action."], ["Faut-il voter seulement sur la prime ?", "Non. Le vote doit aussi comprendre reste a charge, exclusions et qualite de gestion sinistre."]]
  },
  "renovation-energetique-copropriete-assurance": {
    summary: ["Relier isolation, toiture, facade et ventilation au contrat immeuble.", "Verifier declarations assureur avant chantier et reception.", "Anticiper l'effet des entreprises et garanties decennales."],
    contextTitle: "Quand la renovation energetique change le risque de copropriete.",
    context: "Cette page traite les chantiers d'isolation, facade, toiture, ventilation ou chauffage collectif. L'enjeu est de declarer le changement technique et de coordonner contrat immeuble, entreprises et garanties de chantier.",
    documentsTitle: "Les documents travaux a joindre.",
    documents: "Descriptif des lots de travaux, devis, planning, entreprises, attestations decennales, vote d'AG et date de reception permettent de presenter le chantier sans approximation.",
    contractTitle: "Lire le contrat pendant la phase travaux.",
    contract: "Le contrat doit etre confronte aux exclusions chantier, obligations de declaration, dommages aux existants, incendie, infiltration et responsabilites des entreprises.",
    methodTitle: "La methode ImmeubleAssur renovation.",
    method: "Nous separons ce qui releve du contrat immeuble, de la dommage ouvrage eventuelle, de la decennale et des declarations a faire avant ouverture du chantier.",
    ctaNeed: "dommages-ouvrage"
  },
  "copropriete-petite-syndic-benevole": {
    summary: ["Cadrer le mandat du syndic benevole et les archives disponibles.", "Verifier RC du syndicat, parties communes et lots non occupants.", "Transformer une petite copropriete en dossier assureur lisible."],
    contextTitle: "Quand une petite copropriete repose sur un syndic benevole.",
    context: "Cette page traite la gouvernance pratique: mandat, archives, declarations, interlocuteur assureur, sinistres et decisions d'AG dans une copropriete avec peu de lots.",
    documentsTitle: "Les pieces specifiques au syndic benevole.",
    documents: "PV de designation, liste des lots, contrat actuel, appel de prime, sinistres, travaux votes et coordonnees du representant evitent les zones floues au moment du devis.",
    contractTitle: "Lire les responsabilites avant les options.",
    contract: "La priorite est de distinguer RC du syndicat, responsabilite du syndic benevole, dommages aux parties communes et assurances PNO des coproprietaires bailleurs.",
    methodTitle: "La methode ImmeubleAssur petite copropriete.",
    method: "Nous remettons de l'ordre dans les acteurs, les documents et les garanties pour que le dossier ne soit pas penalise par une gestion benevole.",
    ctaNeed: "copropriete"
  },
  "dommages-ouvrage-copropriete-travaux": {
    summary: ["Identifier si la dommage ouvrage est necessaire avant signature.", "Relier decennale, reception, financement et vote d'AG.", "Eviter de chercher une solution une fois le chantier lance."],
    contextTitle: "Quand la dommage ouvrage doit etre anticipee en copropriete.",
    context: "Cette page est centree sur le calendrier chantier: nature des travaux, vote, entreprises, maitre d'oeuvre, financement et reception. Elle ne remplace pas la page renovation energetique, plus large.",
    documentsTitle: "Les pieces DO avant consultation.",
    documents: "Descriptif technique, devis signes ou projetes, attestations decennales, planning, mission de maitrise d'oeuvre et PV d'AG structurent la demande.",
    contractTitle: "Lire les garanties avec la date de reception.",
    contract: "La reception, les reserves, les existants et la nature structurelle des travaux changent la lecture de la garantie. Le calendrier est donc le point cle.",
    methodTitle: "La methode ImmeubleAssur dommage ouvrage.",
    method: "Nous classons les travaux selon leur impact assurantiel avant de lancer la consultation, pour eviter refus tardifs et pieces incompletes.",
    ctaNeed: "dommages-ouvrage"
  },
  "protection-juridique-copropriete": {
    summary: ["Evaluer litiges prestataires, voisins, impayes et travaux.", "Lire seuils d'intervention et exclusions de procedure.", "Decider si l'option protege vraiment le syndicat."],
    contextTitle: "Quand la protection juridique devient utile en copropriete.",
    context: "Cette page ne traite pas les dommages au batiment. Elle regarde les conflits: prestataires, recouvrement, voisinage, travaux, assemblee generale et defense des interets du syndicat.",
    documentsTitle: "Les litiges a cartographier.",
    documents: "Historique des procedures, impayes, contrats prestataires, travaux contestes et courriers importants permettent de juger si l'option est pertinente.",
    contractTitle: "Lire les seuils de procedure.",
    contract: "La garantie se juge sur plafonds par litige, seuil d'intervention, delais de carence, choix de l'avocat et exclusions de conflits deja connus.",
    methodTitle: "La methode ImmeubleAssur protection juridique.",
    method: "Nous comparons l'option a la realite contentieuse de la copropriete avant de l'integrer ou non dans l'arbitrage.",
    ctaNeed: "copropriete"
  },
  "assurance-parking-garages-copropriete": {
    summary: ["Decrire box, parkings ouverts, sous-sols et acces.", "Relier infiltration, incendie, vandalisme et responsabilite.", "Verifier si les stationnements sont bien inclus au contrat."],
    contextTitle: "Quand les stationnements changent le dossier copropriete.",
    context: "Cette page cible les parkings, garages, boxes et sous-sols. Le sujet principal est la declaration des surfaces et des acces, avec les sinistres typiques: infiltration, choc, vandalisme ou incendie.",
    documentsTitle: "Les informations stationnement a reunir.",
    documents: "Nombre de places, boxes fermes, surfaces, sous-sol, acces, portail, ventilation, historiques d'infiltration et repartition parties communes/privatives structurent l'analyse.",
    contractTitle: "Lire les garanties des annexes.",
    contract: "Le contrat doit dire si les stationnements, caves et dependances sont couverts comme parties communes, lots privatifs ou annexes declarees.",
    methodTitle: "La methode ImmeubleAssur parkings.",
    method: "Nous isolons le risque stationnement pour eviter qu'il soit dilue dans une page copropriete generale.",
    ctaNeed: "copropriete"
  },
  "assurance-immeuble-avec-ascenseur": {
    summary: ["Separer maintenance, controle technique et assurance immeuble.", "Verifier bris, RC, recours et equipement collectif.", "Documenter contrats d'entretien et incidents."],
    contextTitle: "Quand l'ascenseur impose une lecture technique du contrat.",
    context: "Cette page porte sur un equipement collectif precis: ascenseur, contrat de maintenance, controles, pannes, responsabilites et sinistres associes aux usagers ou au batiment.",
    documentsTitle: "Les pieces ascenseur utiles.",
    documents: "Contrat de maintenance, controles periodiques, incidents, devis de modernisation, rapports techniques et historique de pannes donnent une vision defendable.",
    contractTitle: "Lire les garanties equipements.",
    contract: "Il faut verifier bris de machine eventuel, responsabilite civile, dommages electriques, exclusions de maintenance et recours contre prestataire.",
    methodTitle: "La methode ImmeubleAssur ascenseur.",
    method: "Nous isolons l'ascenseur comme facteur technique afin de ne pas le confondre avec une page multirisque immeuble generale.",
    ctaNeed: "audit-contrat"
  },
  "resiliation-assurance-immeuble": {
    summary: ["Construire un calendrier d'echeance et de preavis.", "Decider entre resiliation, renegociation et consultation marche.", "Eviter les demandes tardives sans pieces."],
    contextTitle: "Quand la resiliation est surtout une question de calendrier.",
    context: "Cette page traite l'echeance: date anniversaire, preavis, marge de consultation, dossier a preparer et decision entre renegocier ou changer de contrat.",
    documentsTitle: "Les preuves de calendrier a reunir.",
    documents: "Conditions particulieres, avis d'echeance, dernier appel, courrier assureur, sinistres et delai restant permettent de savoir si l'action est encore possible.",
    contractTitle: "Lire les clauses de sortie.",
    contract: "La sortie se juge avec delais, forme de notification, consequences sur garanties en cours et risque d'interruption de couverture.",
    methodTitle: "La methode ImmeubleAssur echeance.",
    method: "Nous transformons la recherche resiliation en planning de decision: renegocier, consulter ou maintenir provisoirement selon la date limite.",
    ctaNeed: "audit-contrat"
  },
  "assurance-colocation-immeuble": {
    summary: ["Qualifier rotation, baux et attestations occupants.", "Verifier parties communes sollicitees par la colocation.", "Aligner multirisque immeuble, PNO et assurance locataire."],
    contextTitle: "Quand la colocation modifie l'occupation de l'immeuble.",
    context: "Cette page traite les immeubles avec forte rotation, chambres louees, baux multiples, meubles et usage intensif des parties communes.",
    documentsTitle: "Les informations colocation a preparer.",
    documents: "Nombre d'occupants, type de bail, rotation annuelle, meubles, attestations, vacance entre occupants et sinistres repetes cadrent le dossier.",
    contractTitle: "Lire les contrats avec les occupants.",
    contract: "Il faut articuler assurance des colocataires, responsabilite du bailleur, PNO et contrat immeuble, notamment en cas de degat des eaux ou vandalisme.",
    methodTitle: "La methode ImmeubleAssur colocation.",
    method: "Nous presentons l'exploitation locative reelle pour eviter une lecture trop proche d'un immeuble locatif classique.",
    ctaNeed: "pno-cno"
  },
  "assurance-immeuble-apres-refus-assureur": {
    summary: ["Identifier la cause exacte du refus ou de la surprime.", "Construire un dossier correctif avant nouvelle consultation.", "Separer refus assureur et simple renegociation."],
    contextTitle: "Quand un refus assureur doit etre reconstruit point par point.",
    context: "Cette page part d'une reponse negative: refus, surprime, exclusion ou demande de pieces. L'objectif est d'identifier le blocage et d'apporter des correctifs verifiables.",
    documentsTitle: "Les preuves a reunir apres refus.",
    documents: "Courrier assureur, motif, historique sinistre, photos, factures, travaux correctifs, mesures de prevention et contrat precedent permettent de reouvrir la discussion.",
    contractTitle: "Lire ce qui a fait bloquer le dossier.",
    contract: "Le refus peut venir de sinistralite, vacance, commerce, travaux, non-paiement ou information incomplete. Chaque cause appelle une piece differente.",
    methodTitle: "La methode ImmeubleAssur apres refus.",
    method: "Nous reconstruisons le dossier comme une defense du risque, distincte d'un article general sur les sinistres.",
    ctaNeed: "audit-contrat"
  },
  "assurance-immeuble-sans-sinistre": {
    summary: ["Valoriser une absence de sinistre sans promettre une baisse automatique.", "Montrer entretien, surveillance et occupation stable.", "Transformer un bon historique en argument de consultation."],
    contextTitle: "Quand l'absence de sinistre devient un signal assureur.",
    context: "Cette page traite le cas favorable: immeuble entretenu, pas de sinistre declare, occupation stable et documents propres. Le sujet n'est pas la gestion d'un dossier difficile.",
    documentsTitle: "Les preuves positives a montrer.",
    documents: "Historique vierge, entretien, travaux preventifs, contrats de maintenance, photos et occupation stable renforcent la lecture du risque.",
    contractTitle: "Lire l'offre sans surestimer le bonus.",
    contract: "Un bon historique aide la consultation, mais il doit rester confronte aux franchises, exclusions et garanties attendues par le proprietaire.",
    methodTitle: "La methode ImmeubleAssur dossier propre.",
    method: "Nous transformons les bons signaux en fiche courte et defendable pour obtenir une comparaison plus nette.",
    ctaNeed: "multirisque-immeuble"
  },
  "pertes-de-loyers-immeuble": {
    summary: ["Verifier le fait generateur avant d'attendre une indemnisation.", "Lire delai, duree, plafond et sinistre couvert.", "Separer loyers impayes et pertes apres dommage garanti."],
    contextTitle: "Quand les pertes de loyers dependent du sinistre couvert.",
    context: "Cette page ne parle pas de garantie loyers impayes. Elle traite les pertes de revenus apres dommage garanti: incendie, degat des eaux ou evenement qui rend le bien impropre a la location.",
    documentsTitle: "Les donnees locatives a preparer.",
    documents: "Montant des loyers, baux, duree d'indisponibilite, nature du sinistre, devis de remise en etat et clauses du contrat permettent d'estimer le perimetre.",
    contractTitle: "Lire delai et plafond d'indemnisation.",
    contract: "La garantie se juge sur delai de carence, duree maximale, plafond, franchise et condition que le dommage initial soit lui-meme couvert.",
    methodTitle: "La methode ImmeubleAssur pertes de loyers.",
    method: "Nous separons revenu locatif, dommage materiel et conditions d'indemnisation pour eviter une attente impossible.",
    ctaNeed: "audit-contrat"
  },
  "sinistres-recurrents-immeuble": {
    summary: ["Distinguer incident isole et repetition structurelle.", "Identifier cause, recurrence, montant et correction.", "Presenter un plan de prevention avant renouvellement."],
    contextTitle: "Quand la recurrence pese plus que le montant du sinistre.",
    context: "Cette page vise les immeubles avec plusieurs declarations: fuites, infiltrations, vandalisme ou incidents repetes. Le sujet central est la cause racine et la preuve de correction.",
    documentsTitle: "Les donnees de recurrence a reunir.",
    documents: "Tableau chronologique, causes, montants, franchises, rapports, factures et travaux correctifs permettent de montrer l'evolution du risque.",
    contractTitle: "Lire l'historique comme un assureur.",
    contract: "Un sinistre repete sans correction pese plus lourd qu'un incident ponctuel. La prevention documentee devient donc aussi importante que la garantie.",
    methodTitle: "La methode ImmeubleAssur recurrence.",
    method: "Nous transformons l'historique en plan d'explication et d'action pour eviter une lecture punitive du dossier.",
    ctaNeed: "audit-contrat"
  },
  "checklist-sinistre-degat-des-eaux": {
    summary: ["Organiser les preuves dans les premieres heures.", "Separer origine, declaration, recherche de fuite et remise en etat.", "Reduire les allers-retours avec assureur, syndic et occupant."],
    contextTitle: "Quand le degat des eaux demande une checklist d'urgence.",
    context: "Cette page est operationnelle: photos, coupure, recherche de fuite, voisin, syndic, occupant, declaration et devis. Elle ne traite pas la recurrence longue comme un historique annuel.",
    documentsTitle: "Les preuves a collecter tout de suite.",
    documents: "Photos datees, origine probable, coordonnees des parties, constat, facture de recherche de fuite, devis et mesures conservatoires facilitent l'instruction.",
    contractTitle: "Lire qui declare et qui paie quoi.",
    contract: "Selon origine et parties touchees, le contrat occupant, PNO, copropriete ou immeuble peut intervenir. La checklist evite de perdre cette distinction.",
    methodTitle: "La methode ImmeubleAssur degat des eaux.",
    method: "Nous classons les pieces par ordre d'urgence pour accelerer le dossier sinistre et preparer le renouvellement si l'historique devient sensible.",
    ctaNeed: "audit-contrat"
  },
  "multirisque-immeuble-vs-pno": {
    summary: ["Attribuer chaque risque au batiment, au lot ou au proprietaire.", "Eviter les doublons entre contrat immeuble et PNO.", "Orienter vers PNO/CNO quand le besoin concerne le lot."],
    contextTitle: "Quand deux contrats proches n'ont pas le meme role.",
    context: "Cette page compare la multirisque immeuble et la PNO: l'une porte le batiment ou les parties communes, l'autre protege le proprietaire non occupant sur son lot ou son bien.",
    documentsTitle: "Les contrats a mettre cote a cote.",
    documents: "Contrat immeuble, PNO, assurance occupant, statut de copropriete, bail et sinistres permettent de voir les doublons et les manques.",
    contractTitle: "Lire par responsabilite, pas par intitule.",
    contract: "Le bon arbitrage consiste a rattacher chaque situation: degat des eaux, RC, vacance, parties communes, dependances et recours au contrat pertinent.",
    methodTitle: "La methode ImmeubleAssur PNO vs MRI.",
    method: "Nous cartographions les responsabilites pour orienter le visiteur vers devis PNO/CNO ou audit multirisque selon le besoin reel.",
    ctaNeed: "pno-cno"
  },
  "pno-obligatoire-copropriete": {
    summary: ["Clarifier l'obligation du coproprietaire non occupant.", "Lire le contrat de copropriete avant la PNO.", "Verifier vacance, location et responsabilite civile."],
    contextTitle: "Quand la PNO obligatoire depend du statut en copropriete.",
    context: "Cette page traite le bailleur coproprietaire: obligation, responsabilite civile, contrat du syndicat et assurance occupant. Elle ne compare pas toute la multirisque immeuble.",
    documentsTitle: "Les justificatifs PNO a preparer.",
    documents: "Attestation immeuble, statut d'occupation, bail, assurance locataire, sinistres et echeance du contrat PNO permettent de trancher le besoin.",
    contractTitle: "Lire le chevauchement PNO et copropriete.",
    contract: "La PNO doit completer le contrat du syndicat et l'assurance occupant sans doubler inutilement des garanties deja portees ailleurs.",
    methodTitle: "La methode ImmeubleAssur PNO obligatoire.",
    method: "Nous ramenons la question obligatoire a une situation concrete: lot loue, vacant, occupe gratuitement ou detenu par une SCI.",
    ctaNeed: "pno-cno"
  }
};
Object.assign(articleAngles, mediumRiskArticleAngles);
Object.assign(articleAngles, {
  "assurance-immeuble-local-professionnel": {
    summary: ["Declarer l'activite professionnelle exacte dans l'immeuble.", "Separer bureau, profession liberale, commerce leger et local vacant.", "Aligner bail, garanties locataire et contrat proprietaire."],
    contextTitle: "Quand un local professionnel change le dossier bailleur.",
    context: "Cette page cible les immeubles avec bureau, profession liberale, commerce leger ou local professionnel vacant. L'angle principal est l'activite declaree au bail et son effet sur l'appetence assureur.",
    documentsTitle: "Les informations activite a reunir.",
    documents: "Bail, activite exacte, surface du local, installations techniques, accueil du public, attestation du locataire et periode de vacance permettent d'eviter une declaration approximative.",
    contractTitle: "Lire les garanties du bailleur avec le local.",
    contract: "Le contrat proprietaire doit etre coherent avec ce qui releve du locataire professionnel: responsabilite, dommages, stock, enseigne, amenagements et recours.",
    methodTitle: "La methode ImmeubleAssur local professionnel.",
    method: "Nous isolons l'activite du local pour ne pas confondre cette page avec une approche patrimoine ou SCI globale.",
    ctaNeed: "audit-contrat"
  },
  "assurance-immeuble-protection-du-patrimoine": {
    summary: ["Piloter l'immeuble comme un actif patrimonial.", "Relier prevention, valeur, responsabilites et strategie de conservation.", "Arbitrer cout du risque et protection long terme."],
    contextTitle: "Quand l'assurance sert la protection patrimoniale.",
    context: "Cette page s'adresse aux SCI et foncieres familiales qui veulent proteger une valeur patrimoniale sur plusieurs annees. Le sujet n'est pas l'activite d'un local professionnel mais la preservation de l'actif.",
    documentsTitle: "Les donnees patrimoniales utiles.",
    documents: "Valeur du bati, revenus, travaux planifies, detention, succession, endettement, contrats en place et historique de prevention donnent une lecture globale.",
    contractTitle: "Lire les garanties comme un outil de conservation.",
    contract: "La protection patrimoniale se juge sur la capacite du contrat a absorber un sinistre majeur, financer la remise en etat et preserver la responsabilite du proprietaire.",
    methodTitle: "La methode ImmeubleAssur patrimoine.",
    method: "Nous rapprochons assurance, prevention et strategie de detention pour aider le proprietaire a proteger l'actif au-dela du seul renouvellement annuel.",
    ctaNeed: "audit-contrat"
  }
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
  return `<header class="site-header" data-elevate><a class="brand" href="/" aria-label="IA ImmeubleAssur courtier immeuble - accueil"><span class="brand-mark" aria-hidden="true">IA</span><span><strong>ImmeubleAssur</strong><small>courtier immeuble</small></span></a><nav class="nav" aria-label="Navigation principale"><a href="/assurance-immeuble.html">Immeuble</a><a href="/assurance-copropriete.html">Copropriete</a><a href="/assurance-pno.html">PNO</a><a href="/villes.html">Villes</a><a href="/blog.html">Blog</a><a href="/faq.html">FAQ</a><a href="/devis-assurance-immeuble.html">Devis</a></nav><a class="header-phone" href="tel:${PHONE_HREF}">${PHONE}</a></header>`;
}

function footer() {
  return `<footer class="site-footer" id="contact"><div><strong>ImmeubleAssur</strong><p>Courtier specialiste immeuble, copropriete, PNO, SCI et syndic.</p></div><address><a href="tel:${PHONE_HREF}">${PHONE}</a><a href="mailto:${EMAIL}">${EMAIL}</a><a href="/confidentialite.html">Confidentialite</a><span>ORIAS ${ORIAS}</span></address></footer>`;
}

function leadForm(defaults = {}) {
  const selected = (name, value) => defaults[name] === value ? " selected" : "";
  return `<form class="quote-panel" id="lead-form" novalidate><div class="form-heading"><p>Devis gratuit</p><h2>Qualifier mon immeuble</h2></div><input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" /><div class="field-grid"><label>Nom et prenom *<input name="name" autocomplete="name" required placeholder="Jean Dupont" /></label><label>Telephone *<input name="phone" type="tel" autocomplete="tel" required placeholder="06 12 34 56 78" /></label></div><label>Email (facultatif)<input name="email" type="email" autocomplete="email" placeholder="contact@exemple.fr" /></label><div class="field-grid"><label>Profil *<select name="profile" required><option value="">Choisir</option><option value="syndic-professionnel"${selected("profile", "syndic-professionnel")}>Syndic professionnel</option><option value="syndic-benevole"${selected("profile", "syndic-benevole")}>Syndic benevole</option><option value="conseil-syndical"${selected("profile", "conseil-syndical")}>Conseil syndical</option><option value="bailleur"${selected("profile", "bailleur")}>Bailleur / PNO</option><option value="sci"${selected("profile", "sci")}>SCI / fonciere</option><option value="administrateur-biens"${selected("profile", "administrateur-biens")}>Administrateur de biens</option></select></label><label>Type de bien *<select name="property_type" required><option value="">Choisir</option><option value="copropriete">Copropriete</option><option value="immeuble-locatif">Immeuble locatif</option><option value="mixte">Immeuble mixte</option><option value="commerce">Local commercial</option><option value="parking">Parking / garages</option></select></label></div><div class="field-grid"><label>Ville *<input name="city" autocomplete="address-level2" required placeholder="${esc(defaults.city || "Paris")}" value="${esc(defaults.city || "")}" /></label><label>Lots / logements<input name="units_count" inputmode="numeric" placeholder="24" /></label></div><label>Besoin principal<select name="need"><option value="multirisque-immeuble"${selected("need", "multirisque-immeuble")}>Multirisque immeuble</option><option value="copropriete"${selected("need", "copropriete")}>Assurance copropriete</option><option value="pno"${selected("need", "pno")}>PNO bailleur</option><option value="rc-syndic"${selected("need", "rc-syndic")}>RC syndic / conseil syndical</option><option value="dommages-ouvrage"${selected("need", "dommages-ouvrage")}>Dommages ouvrage</option><option value="audit-contrat"${selected("need", "audit-contrat")}>Audit contrat existant</option></select></label><label>Message<textarea name="message" rows="3" placeholder="Adresse, surface, assureur actuel, echeance, sinistres recents...">${esc(defaults.message || "")}</textarea></label><label class="consent-row"><input type="checkbox" name="consent" required /><span>J'accepte d'etre recontacte pour recevoir mon analyse et mon devis.</span></label><button class="submit-button" type="submit">Obtenir mon devis immeuble</button><p class="form-note">Donnees transmises a ImmeubleAssur pour traiter votre demande.</p><div class="form-status" role="status" aria-live="polite"></div></form>`;
}

function layout({ slug, title, description, body }) {
  const url = slug === "index" ? `${SITE}/` : `${SITE}/${slug}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#0f766e" /><meta name="robots" content="index, follow, max-image-preview:large" /><meta name="description" content="${esc(description)}" /><meta property="og:type" content="website" /><meta property="og:locale" content="fr_FR" /><meta property="og:site_name" content="ImmeubleAssur" /><meta property="og:title" content="${esc(title)} | ImmeubleAssur" /><meta property="og:description" content="${esc(description)}" /><meta property="og:url" content="${url}" /><meta property="og:image" content="${HERO_IMAGE}" /><link rel="canonical" href="${url}" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="manifest" href="/manifest.webmanifest" />
    <link rel="preload" as="image" href="/assets/hero-building.webp" type="image/webp" /><link rel="stylesheet" href="${STYLES_URL}" /><title>${esc(title)} | ImmeubleAssur</title></head><body><a class="skip-link" href="#main-content">Aller au contenu principal</a>${nav()}<main id="main-content">${body}</main>${footer()}<script src="${APP_JS_URL}" type="module"></script></body></html>`;
}

function intentExitBlock() {
  return `<section class="band compare-band lead-urgency-exits" aria-label="Parcours devis prioritaires"><div class="section-head"><p class="eyebrow dark">Conversion prioritaire</p><h2>Relier le pilotage SEO aux demandes de devis.</h2></div><div class="card-grid"><article class="content-card"><h3><a href="/devis-assurance-immeuble?intent=sinistre">Audit sinistre ou resiliation</a></h3><p>Traiter les recherches urgentes avec un rappel prioritaire et une fiche risque claire.</p></article><article class="content-card"><h3><a href="/devis-assurance-immeuble?intent=prix">Devis prix et garanties</a></h3><p>Comparer le cout reel: prime, franchises, plafonds, exclusions et qualite du contrat.</p></article><article class="content-card"><h3><a href="/devis-pno-cno?intent=pno-cno">Parcours PNO/CNO</a></h3><p>Orienter les coproprietaires non occupants et bailleurs vers le bon formulaire.</p></article></div></section>`;
}
function articleFaq(article) {
  return [[`${article.keyword} concerne qui en priorite ?`, `Le sujet concerne surtout ${article.audience}. L'analyse part du bien reel, de son usage, des sinistres et du contrat actuel.`], ["Quel document accelerera le devis ?", "Le contrat actuel et le dernier appel de prime accelerent la lecture. L'historique sinistres et les travaux prevus evitent les questions tardives."], ["Faut-il choisir le prix le plus bas ?", "Non. Il faut comparer la prime avec les franchises, plafonds, exclusions et obligations de declaration."], ["Quand demander un audit ?", "L'audit est utile avant l'echeance, avant une AG, apres plusieurs sinistres ou lorsqu'un changement d'usage modifie le risque."], ["Comment ImmeubleAssur intervient ?", `ImmeubleAssur structure le dossier, repere les informations manquantes et aide a ${article.action.toLowerCase()}`]];
}

function articlePage(article) {
  const angle = articleAngles[article.slug] || {
    summary: [article.action, "La prime doit etre lue avec les franchises, plafonds et exclusions.", "Un dossier complet obtient des reponses assureur plus rapides et plus comparables."],
    contextTitle: `Pourquoi ce sujet compte pour ${article.audience}.`,
    context: `Une recherche comme ${article.keyword} cache rarement une simple demande de prix. Le demandeur veut savoir si son immeuble, son lot, sa SCI ou sa copropriete est correctement protege et si les garanties suivront le jour du sinistre.`,
    documentsTitle: "Les informations a reunir avant consultation.",
    documents: "Preparez le contrat actuel, le dernier appel de prime, l'adresse complete, le nombre de lots, les surfaces, les usages du batiment, les sinistres sur 36 mois et les travaux votes ou prevus.",
    contractTitle: "Les clauses a lire avant de comparer.",
    contract: "La prime annuelle n'est qu'une ligne du contrat. Les franchises, plafonds, exclusions, obligations d'entretien et delais de declaration peuvent changer fortement le cout final.",
    methodTitle: "La methode ImmeubleAssur.",
    method: `Notre methode consiste a transformer une demande de devis en fiche risque lisible. ${article.action} Cette action cree un dossier plus defendable, mesurable et comparable.`,
    ctaNeed: "audit-contrat"
  };
  const faqs = angle.faq || articleFaq(article);
  const summaryItems = (angle.summary || []).map((item) => `<li>${esc(item)}</li>`).join("");
  const body = `<article class="article-layout rich-article"><header class="article-head"><p class="eyebrow dark">${esc(article.category)} - guide expert</p><h1>${esc(article.title)}</h1><p>${esc(article.description)}</p></header><div class="article-body"><div class="article-summary"><strong>A retenir</strong><ul>${summaryItems}</ul></div><nav class="toc-list" aria-label="Sommaire"><a href="#contexte">Contexte</a><a href="#documents">Documents</a><a href="#contrat">Contrat</a><a href="#methode">Methode</a><a href="#faq">FAQ</a></nav><section id="contexte"><h2>${esc(angle.contextTitle)}</h2><p>${esc(angle.context)}</p><p>Le role de cette page est de traiter <strong>${esc(article.keyword)}</strong> avec un angle distinct, puis de renvoyer vers le devis lorsque le besoin devient operationnel.</p></section><section id="documents"><h2>${esc(angle.documentsTitle)}</h2><p>${esc(angle.documents)}</p><p>Les pieces manquantes sont listees avant consultation afin d'eviter les devis incomparables et les reponses assureur trop prudentes.</p></section><section id="contrat"><h2>${esc(angle.contractTitle)}</h2><p>${esc(angle.contract)}</p><p>Cette lecture protege la decision: elle evite de choisir une offre uniquement parce qu'elle semble moins chere ou plus simple a premiere vue.</p></section><section id="methode"><h2>${esc(angle.methodTitle)}</h2><p>${esc(angle.method)}</p><p>${esc(article.action)} Le formulaire transmet ensuite le bon contexte pour obtenir une reponse exploitable.</p></section><section id="faq" class="faq-list"><h2>Questions frequentes</h2>${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section><div class="source-box"><strong>Sources utiles</strong><a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028779136/" rel="nofollow">Legifrance - copropriete et assurance</a><a href="https://www.service-public.fr/particuliers/vosdroits/F2608" rel="nofollow">Service-Public.fr - syndic de copropriete</a></div></div><aside class="article-cta">${leadForm({ need: angle.ctaNeed || "audit-contrat" })}</aside></article>`;
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
  const body = `<section class="page-hero compact-hero"><div class="container"><p class="eyebrow">SEO continu</p><h1>Systeme SEO continu ImmeubleAssur.</h1><p>Le site combine contenus utiles, audit technique, suivi des conversions et connecteurs Google Search Console pour detecter les opportunites sans recourir au spam.</p><div class="hero-actions"><a class="button primary" href="/devis-assurance-immeuble?intent=audit-contrat">Demander un audit immeuble</a><a class="button secondary" href="/recherches-assurance-immeuble">Voir les intentions SEO</a></div></div></section><section class="band page-band"><div class="container narrow"><p class="eyebrow dark">Pilotage utile</p><h2>Un systeme SEO doit aider les visiteurs avant d'aider les robots.</h2><p class="large-copy">La strategie ImmeubleAssur organise les contenus autour de besoins reels: devis immeuble, PNO/CNO, copropriete, SCI, sinistres, prix, travaux et villes. Chaque automatisation doit produire une page lisible, un maillage coherent et une action commerciale claire.</p><p>Les rapports locaux verifient les canonicals, schemas, formulaires, liens internes, opportunites Search Console si l'API est configuree, signaux de conversion et risques de cannibalisation. Les pages qui ne servent qu'a varier un mot-cle sont consolidees ou transformees en support utile.</p></div></section><section class="band page-band"><div class="seo-score-grid"><article><strong>Contenu</strong><span>Articles, FAQ, villes qualifiees et maillage interne.</span></article><article><strong>Technique</strong><span>Canonicals, sitemap, schemas, liens propres et controles HTML.</span></article><article><strong>Performance</strong><span>PageSpeed Insights et Core Web Vitals lorsque l'API est disponible.</span></article><article><strong>Opportunites</strong><span>Search Console: impressions, CTR, position moyenne et pages a renforcer.</span></article></div></section><section class="band compare-band"><div class="container narrow"><h2>Principe de pilotage.</h2><p class="large-copy">Les automatismes doivent aider a produire de meilleures reponses pour les syndics, bailleurs, SCI et coproprietaires. Les pages purement dupliquees, les blocs de villes sans valeur et le trafic automatise vers Google sont exclus du systeme.</p><p>Le site privilegie les contenus explicites, visibles et attribues. Il refuse les textes caches, l'accumulation artificielle de requetes et les promesses artificielles. Le bon indicateur est le lead qualifie: un internaute qui comprend son besoin et transmet assez d'informations pour recevoir une reponse utile.</p><p><a class="button primary" href="/devis-assurance-immeuble?intent=seo-strategy">Transformer une recherche en devis</a></p></div></section><section class="band faq-band"><div class="container narrow"><h2>Questions frequentes sur le pilotage SEO</h2><div class="faq-list"><details><summary>Pourquoi suivre la cannibalisation SEO ?</summary><p>Deux pages trop proches peuvent se concurrencer. Le controle distingue les pages money, les supports d'information et les archives.</p></details><details><summary>Les contenus automatiques sont-ils caches ?</summary><p>Non. Les blocs utiles sont visibles et les controles refusent les pratiques de manipulation comme le texte cache ou l'accumulation artificielle de requetes.</p></details><details><summary>Comment relier SEO et leads ?</summary><p>Chaque page prioritaire doit proposer un parcours clair: devis, audit, appel, newsletter ou page primaire selon l'intention.</p></details></div></div></section>${intentExitBlock()}`;
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
  const block = `<section class="plain-panel admin-seo-panel"><h2>Pilotage SEO continu</h2><div class="admin-toolbar"><button class="submit-button" type="button" id="load-seo">Charger SEO</button><a class="button secondary" href="/strategie-seo-continue.html">Voir systeme public</a></div><div class="seo-admin-grid" id="seo-summary"><p>Charge les derniers signaux SEO, conversions et opportunites SQLite.</p></div><section class="admin-table-wrap" aria-label="Opportunites SEO"><table class="admin-table"><thead><tr><th>Score</th><th>Type</th><th>URL</th><th>Requete</th><th>Action</th></tr></thead><tbody id="seo-opportunities-body"><tr><td colspan="5">Aucun chargement effectue.</td></tr></tbody></table></section></section>`;
  const integrationsBlock = `<section class="plain-panel admin-seo-panel admin-integrations-panel"><h2>Connecteurs API et automatisations</h2><div class="admin-toolbar"><button class="submit-button" type="button" id="load-integrations">Verifier integrations</button><span class="admin-muted">Secrets masques, seuls les etats et noms de variables sont affiches.</span></div><div class="seo-admin-grid" id="integrations-summary"><p>Charge les derniers signaux IA, media, SERP, Google, newsletter et securite.</p></div><section class="admin-table-wrap" aria-label="Connecteurs API"><table class="admin-table admin-integrations-table"><thead><tr><th>Connecteur</th><th>Etat</th><th>Perimetre</th><th>Dernier signal</th><th>Action</th></tr></thead><tbody id="integrations-body"><tr><td colspan="5">Aucun chargement effectue.</td></tr></tbody></table></section></section>`;
  const salesBlock = `<section class="plain-panel admin-seo-panel admin-sales-panel"><h2>Centre de relance commerciale</h2><div class="admin-toolbar"><button class="submit-button" type="button" id="load-sales">Charger relances</button><span class="admin-muted">SLA, scripts de rappel et priorites commerciales depuis SQLite.</span></div><div class="seo-admin-grid" id="sales-summary"><p>Charge relances dues, pipeline estime, leads chauds et scripts de rappel.</p></div><section class="admin-table-wrap" aria-label="Centre de relance commerciale"><table class="admin-table admin-sales-table"><thead><tr><th>Type</th><th>Lead</th><th>Valeur</th><th>Signal</th><th>Action</th></tr></thead><tbody id="sales-body"><tr><td colspan="5">Aucun chargement effectue.</td></tr></tbody></table></section></section>`;
  const attributionBlock = `<section class="plain-panel admin-seo-panel admin-attribution-panel"><h2>Attribution acquisition</h2><div class="admin-toolbar"><button class="submit-button" type="button" id="load-attribution">Charger attribution</button><span class="admin-muted">Sources, landing pages, campagnes et besoins mesures en agregats.</span></div><div class="seo-admin-grid" id="attribution-summary"><p>Charge les canaux, pages et campagnes qui generent les leads les plus qualifies.</p></div><section class="admin-table-wrap" aria-label="Attribution acquisition"><table class="admin-table admin-attribution-table"><thead><tr><th>Type</th><th>Source ou page</th><th>Trafic</th><th>Conversion</th><th>Action</th></tr></thead><tbody id="attribution-body"><tr><td colspan="5">Aucun chargement effectue.</td></tr></tbody></table></section></section>`;
  injectBlock(file, "seo-admin", block);
  const newsletterBlock = `<section class="plain-panel admin-seo-panel admin-newsletter-panel"><h2>Pilotage newsletter</h2><div class="admin-toolbar admin-newsletter-actions"><button class="submit-button" type="button" id="load-newsletter">Charger newsletter</button><button class="button secondary" type="button" id="send-newsletter">Envoyer dernier numero</button></div><div class="seo-admin-grid" id="newsletter-summary"><p>Charge les abonnes, numeros, envois et signaux de veille.</p></div><section class="admin-table-wrap" aria-label="Newsletter et veille"><table class="admin-table admin-newsletter-table"><thead><tr><th>Type</th><th>Statut</th><th>Titre</th><th>Date</th><th>Action</th></tr></thead><tbody id="newsletter-body"><tr><td colspan="5">Aucun chargement effectue.</td></tr></tbody></table></section></section>`;
  const contentBlock = `<section class="plain-panel admin-seo-panel admin-content-panel"><h2>Pipeline contenu SEO</h2><div class="admin-toolbar"><button class="submit-button" type="button" id="load-content">Charger contenu</button><a class="button secondary" href="/recherches-assurance-immeuble.html">Voir hub recherches</a></div><div class="seo-admin-grid" id="content-summary"><p>Charge articles, FAQ, villes, opportunites et veille editoriale.</p></div><section class="admin-table-wrap" aria-label="Pipeline contenu"><table class="admin-table admin-content-table"><thead><tr><th>Type</th><th>Score</th><th>Page</th><th>Signal</th><th>Action</th></tr></thead><tbody id="content-body"><tr><td colspan="5">Aucun chargement effectue.</td></tr></tbody></table></section></section>`;
  const spamBlock = `<section class="plain-panel admin-seo-panel admin-spam-panel"><h2>Bouclier anti-spam</h2><div class="admin-toolbar"><button class="submit-button" type="button" id="load-spam">Charger anti-spam</button><span class="admin-muted">IP masquees, raisons de blocage et signaux robots uniquement.</span></div><div class="seo-admin-grid" id="spam-summary"><p>Charge blocages formulaires, sources repetees, pages ciblees et erreurs de validation.</p></div><section class="admin-table-wrap" aria-label="Bouclier anti-spam"><table class="admin-table admin-spam-table"><thead><tr><th>Type</th><th>Volume</th><th>Signal</th><th>Derniere trace</th><th>Action</th></tr></thead><tbody id="spam-body"><tr><td colspan="5">Aucun chargement effectue.</td></tr></tbody></table></section></section>`;
  injectBlock(file, "sales-admin", salesBlock);
  injectBlock(file, "attribution-admin", attributionBlock);
  injectBlock(file, "integrations-admin", integrationsBlock);
  injectBlock(file, "newsletter-admin", newsletterBlock);
  injectBlock(file, "content-admin", contentBlock);
  injectBlock(file, "spam-admin", spamBlock);
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
  // Keep extensionless hub URLs working with static directory serving.
  for (const slug of ["blog", "faq"]) {
    copyFileSync(join(OUT, `${slug}.html`), join(OUT, slug, "index.html"));
  }
  enhanceAdminPage();

  const report = { generated_at: new Date().toISOString(), articles: articleBlueprints.length, new_city_pages: generatedCities.length, faq_hubs: faqClusters.length, total_pages_written: pages.length, min_quality_score: Math.min(...pages.map((page) => page.quality_score)), average_quality_score: Math.round(pages.reduce((sum, page) => sum + page.quality_score, 0) / pages.length), anti_spam_controls: ["no-google-result-scraping", "no-indexing-api-for-non-job-pages", "no-hidden-keyword-blocks", "city-pages-require-local-angle-and-lead-utility", "faq-pages-serve-user-questions-before-schema"], pages };
  writeFileSync(join(REPORT_DIR, "seo-content-factory.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`SEO content factory wrote ${pages.length} pages (${articleBlueprints.length} articles, ${generatedCities.length} cities, ${faqClusters.length} FAQ hubs).`);
}

run();
