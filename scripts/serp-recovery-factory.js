import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SITE = "https://immeubleassur.com";
const OUT = "public";
const REPORT_DIR = "reports";
const SEARCH_REPORT = join(REPORT_DIR, "search-intelligence-report.json");
const EMAIL = "team@immeubleassur.com";
const PHONE = "01 80 85 57 86";
const PHONE_HREF = "+33180855786";
const ORIAS = "11 061 425";

const PLANS = {
  "/assurance-copropriete": {
    slug: "blog/dossier-preuve-assurance-copropriete",
    title: "Assurance copropriete: dossier preuve avant consultation assureur",
    description: "Guide dossier preuve assurance copropriete: PV, sinistres, lots, travaux, franchises et note conseil syndical avant devis.",
    eyebrow: "Dossier copropriete",
    audience: "syndics, conseils syndicaux et coproprietaires",
    need: "copropriete",
    profile: "conseil-syndical",
    propertyType: "copropriete",
    distinct: "Le sujet n'est pas la page generale copropriete. Cette page explique comment assembler les preuves qui rendent la demande lisible avant consultation.",
    evidence: ["PV utiles et mandat du syndic.", "Contrat actuel, appel de prime et echeance.", "Historique sinistres commente par cause.", "Travaux votes, devis, reception et mesures correctives."],
    risks: ["Degat des eaux repete", "Toiture ou facade", "Responsabilite du syndicat", "Protection juridique"],
    links: [["/assurance-copropriete", "Comprendre l assurance copropriete"], ["/rc-syndic", "RC syndic"], ["/guide-assurance-copropriete-2026", "Guide copropriete 2026"]]
  },
  "/assurance-pno-cno": {
    slug: "blog/pno-cno-preuves-lot-non-occupant",
    title: "PNO CNO: preuves utiles pour un lot non occupant",
    description: "PNO CNO: documents, statut d'occupation, attestation immeuble, occupant, vacance et responsabilite avant devis.",
    eyebrow: "Lot non occupant",
    audience: "bailleurs, coproprietaires non occupants et SCI",
    need: "pno-cno",
    profile: "bailleur",
    propertyType: "lot-copropriete",
    distinct: "Le sujet n'est pas de redefinir la PNO. Cette page isole les preuves qui evitent les doublons entre contrat du syndicat, occupant et proprietaire.",
    evidence: ["Statut du lot: loue, vacant, prete ou en travaux.", "Attestation immeuble ou informations du syndicat.", "Assurance occupant et bail si disponibles.", "Date de vacance et mesures de surveillance."],
    risks: ["Absence d'occupant", "Responsabilite civile", "Degat des eaux parti du lot", "Doublon avec contrat immeuble"],
    links: [["/assurance-pno-cno", "Comprendre PNO et CNO"], ["/devis-pno-cno", "Devis PNO CNO"], ["/assurance-cno", "Assurance CNO"]]
  },
  "/assurance-coproprietaire-non-occupant": {
    slug: "blog/coproprietaire-non-occupant-documents-devis",
    title: "Coproprietaire non occupant: documents a fournir avant devis",
    description: "Coproprietaire non occupant: checklist documents, statut du lot, assurance occupant, vacance et contrat copropriete.",
    eyebrow: "CNO operationnel",
    audience: "coproprietaires qui n'occupent pas leur lot",
    need: "cno",
    profile: "bailleur",
    propertyType: "lot-copropriete",
    distinct: "Le sujet n'est pas une definition juridique abstraite. Cette page transforme le statut de coproprietaire non occupant en dossier assureur concret.",
    evidence: ["Nature du lot et adresse de la copropriete.", "Occupation reelle et date de changement.", "Assurance locataire ou absence d'occupant.", "Sinistres connus, franchises et contrat precedent."],
    risks: ["Lot vacant", "Responsabilite du coproprietaire", "Recours voisin", "Travaux privatifs"],
    links: [["/assurance-coproprietaire-non-occupant", "Page CNO consolidee"], ["/assurance-cno", "Assurance CNO"], ["/faq/pno", "FAQ PNO CNO"]]
  },
  "/assurance-sci": {
    slug: "blog/assurance-sci-immeuble-cartographie-patrimoine",
    title: "Assurance SCI immeuble: cartographier le patrimoine avant devis",
    description: "Assurance SCI immeuble: gerance, associes, biens, contrats, echeances, PNO et coherence portefeuille avant consultation.",
    eyebrow: "SCI portefeuille",
    audience: "gerants de SCI, foncieres familiales et bailleurs patrimoniaux",
    need: "multirisque-immeuble",
    profile: "sci",
    propertyType: "immeuble-locatif",
    distinct: "Le sujet n'est pas un immeuble locatif unique. Cette page part de la personne morale, des associes, des adresses detenues et de la coherence des contrats.",
    evidence: ["Statuts utiles, gerant et interlocuteur assurance.", "Liste des biens, lots, locaux, parkings et dependances.", "Contrats en cours, echeances, PNO et multirisque.", "Sinistres, travaux et arbitrages patrimoniaux."],
    risks: ["Doublon de contrats", "Trou de garantie par adresse", "Responsabilite du gerant", "Local mixte ou vacant"],
    links: [["/assurance-sci", "Comprendre l assurance SCI"], ["/assurance-immeuble-locatif", "Immeuble locatif"], ["/courtier-assurance-immeuble", "Courtier immeuble"]]
  },
  "/courtier-assurance-immeuble": {
    slug: "blog/mandat-courtier-assurance-immeuble-consultation",
    title: "Courtier assurance immeuble: mandat et consultation du marche",
    description: "Courtier assurance immeuble: mandat, cahier des charges, relances assureurs, refus, exclusions et arbitrage d'offres.",
    eyebrow: "Mission courtage",
    audience: "proprietaires, syndics, SCI et administrateurs de biens",
    need: "audit-contrat",
    profile: "administrateur-biens",
    propertyType: "immeuble-locatif",
    distinct: "Le sujet n'est pas la garantie elle-meme. Cette page explique comment le courtier pilote la consultation, les relances et la comparaison des retours assureur.",
    evidence: ["Interlocuteur mandate et objectif de consultation.", "Cahier des charges: usage, lots, sinistres, echeance.", "Retours assureurs: accord, refus, reserves ou pieces demandees.", "Tableau d'arbitrage entre prime, franchise et exclusions."],
    risks: ["Dossier envoye trop tard", "Multiplication des intermediaires", "Pieces contradictoires", "Comparaison limitee au prix"],
    links: [["/courtier-assurance-immeuble", "Page courtier"], ["/audit-contrat-assurance-immeuble", "Audit contrat"], ["/devis-assurance-immeuble", "Demande de devis"]]
  },
  "/prix-assurance-immeuble": {
    slug: "blog/prix-assurance-immeuble-franchises-reste-a-charge",
    title: "Prix assurance immeuble: lire franchises et reste a charge",
    description: "Prix assurance immeuble: comprendre prime, franchises, exclusions, sinistres, travaux et reste a charge avant comparaison.",
    eyebrow: "Prix utile",
    audience: "bailleurs, syndics et SCI qui comparent des offres",
    need: "multirisque-immeuble",
    profile: "bailleur",
    propertyType: "immeuble-locatif",
    distinct: "Le sujet n'est pas un tarif moyen. Cette page montre comment lire le cout reel apres sinistre, avec franchises, plafonds et exclusions.",
    evidence: ["Prime annuelle et evolution par rapport a l'echeance precedente.", "Franchises par garantie et reste a charge probable.", "Historique sinistres et mesures correctives.", "Garanties retirees, plafonds bas ou exclusions nouvelles."],
    risks: ["Prix bas mais franchise haute", "Exclusion degat des eaux", "Garantie absente", "Service sinistre faible"],
    links: [["/prix-assurance-immeuble", "Page prix"], ["/comparateur-assurance-immeuble", "Comparateur"], ["/tarif-assurance-immeuble", "Tarif assurance immeuble"]]
  },
  "/multirisque-immeuble": {
    slug: "blog/multirisque-immeuble-garanties-batiment-preuves",
    title: "Multirisque immeuble: preuves garanties batiment avant devis",
    description: "Multirisque immeuble: garanties batiment, RC, degat des eaux, incendie, dependances et pieces utiles avant devis.",
    eyebrow: "Garanties batiment",
    audience: "syndics, bailleurs, SCI et proprietaires d'immeubles",
    need: "multirisque-immeuble",
    profile: "bailleur",
    propertyType: "immeuble-locatif",
    distinct: "Le sujet n'est pas de presenter toute l'assurance immeuble. Cette page verifie le socle multirisque: bati, responsabilites, evenements couverts et pieces de preuve.",
    evidence: ["Adresse, annee, surface, lots et dependances.", "Parties communes ou zones gerees par le proprietaire.", "Sinistres: origine, montant, recurrence et correction.", "Equipements: toiture, reseaux, cave, parking, portail ou local technique."],
    risks: ["Degat des eaux", "Incendie", "Vandalisme", "Evenement climatique"],
    links: [["/multirisque-immeuble", "Page multirisque"], ["/assurance-immeuble", "Assurance immeuble"], ["/checklist-documents-assurance-immeuble", "Checklist documents"]]
  },
  "/assurance-immeuble-syndic-benevole": {
    slug: "blog/syndic-benevole-assurance-immeuble-archives-ag",
    title: "Syndic benevole: archives assurance immeuble avant AG",
    description: "Syndic benevole: archives, mandat, PV, sinistres, echeance et note de vote assurance immeuble avant assemblee generale.",
    eyebrow: "Syndic benevole",
    audience: "petites coproprietes autogerees et conseils syndicaux",
    need: "copropriete",
    profile: "syndic-benevole",
    propertyType: "copropriete",
    distinct: "Le sujet n'est pas l'inventaire technique des parties communes. Cette page aide le syndic benevole a ranger les preuves et a preparer une decision d'AG.",
    evidence: ["PV de designation et duree du mandat.", "Contrat actuel, echeance et dernier appel de prime.", "Sinistres, factures, courriers et travaux votes.", "Note simple: conserver, ajuster, consulter ou reporter."],
    risks: ["Mandat incomplet", "Archive introuvable", "Sujet absent de l'AG", "Consultation trop tardive"],
    links: [["/assurance-immeuble-syndic-benevole", "Page syndic benevole"], ["/blog/syndic-benevole-assurance", "Guide syndic benevole"], ["/faq/copropriete", "FAQ copropriete"]]
  }
};

const UNIQUE_COPY = {
  "blog/dossier-preuve-assurance-copropriete": {
    takeaway: "Construire un classeur AG: decision, historique, travaux votes et responsabilite du syndicat.",
    signal: "Le besoin copropriete appelle une reponse collective: mandat, assemblee generale, responsabilite des parties communes et tracabilite des decisions. Le contenu se concentre sur la preparation du conseil syndical avant d'interroger le marche.",
    proof: "Le bon angle consiste a ranger les elements comme un dossier de reunion: ce qui a ete vote, ce qui a ete repare, ce qui reste expose et ce que les coproprietaires devront arbitrer.",
    decision: "Quand le conseil syndical dispose du contrat en cours, de l'echeance, du releve de sinistres et des travaux votes, il peut passer vers la page copropriete pour cadrer la consultation.",
    riskGuidance: [
      "Presenter la recurrence par colonne montante, lot concerne et correctif realise evite une lecture confuse du risque commun.",
      "Ajouter devis, ordre de service ou reception de chantier donne du contexte a l'assureur sur l'etat du clos et couvert.",
      "Relier chaque reclamation au syndicat, au syndic ou a un coproprietaire limite les zones grises en responsabilite civile.",
      "Indiquer les litiges en cours et ceux clos aide a evaluer le besoin reel de defense juridique."
    ],
    faq: [
      ["Quel est le premier document a demander au syndic ?", "Le contrat actuel et son echeance, puis le releve de sinistres. Ces deux pieces donnent le point de depart de la consultation."],
      ["Le PV d'assemblee generale est-il utile ?", "Oui lorsqu'il mentionne mandat, travaux, decisions sur les garanties ou autorisation de mise en concurrence."],
      ["Comment presenter les degats des eaux repetes ?", "Il faut separer origine, colonne concernee, montant, indemnite et mesure corrective prise apres chaque episode."],
      ["Comment ce guide complete-t-il l assurance copropriete ?", "Il aide a preparer le classeur de consultation avant d examiner les garanties de l assurance copropriete."],
      ["Quand demander un devis ?", "Quand echeance, nombre de lots, sinistralite et travaux importants sont suffisamment connus pour eviter les allers-retours."]
    ]
  },
  "blog/pno-cno-preuves-lot-non-occupant": {
    takeaway: "Clarifier l'articulation entre contrat du syndicat, occupant, bailleur et lot vacant.",
    signal: "La recherche PNO CNO porte sur une frontiere de garanties. Le contenu explique ce qui releve du proprietaire non occupant, ce qui reste chez l'occupant et ce qui appartient deja au contrat d'immeuble.",
    proof: "La priorite est de decrire le statut reel du lot: loue, libre, prete, en travaux ou partiellement occupe. Cette chronologie evite les contradictions entre bail, attestation locataire et contrat de copropriete.",
    decision: "Lorsque le statut du lot et les garanties deja existantes sont connus, le parcours doit basculer vers PNO/CNO pour comparer sans empiler deux protections identiques.",
    riskGuidance: [
      "Preciser la date de depart, les visites et la securisation du logement reduit l'incertitude sur la vacance.",
      "Verifier le socle RC du bailleur et les recours voisins avant de regarder seulement la prime annuelle.",
      "Documenter l'origine du sinistre depuis le lot permet de separer recours du syndic, occupant et proprietaire.",
      "Lister les garanties deja incluses par l'immeuble aide a eviter une double facturation inutile."
    ],
    faq: [
      ["PNO et CNO designent-ils toujours la meme chose ?", "Dans la pratique commerciale, les termes se croisent, mais l'analyse doit partir du statut du lot et de l'occupation effective."],
      ["Que fournir si le logement est vacant ?", "La date de vacance, les visites prevues, l'etat des arrivees d'eau et les travaux eventuels."],
      ["L'assurance du locataire suffit-elle ?", "Non, elle ne couvre pas toujours la responsabilite du proprietaire ni les periodes sans occupant."],
      ["Comment eviter le doublon avec l'immeuble ?", "En comparant les garanties du contrat de copropriete avec celles demandees pour le lot."],
      ["Quel chemin suivre ensuite ?", "Aller vers la page PNO/CNO lorsque le statut du lot et les contrats existants sont identifies."]
    ]
  },
  "blog/coproprietaire-non-occupant-documents-devis": {
    takeaway: "Passer du statut personnel de coproprietaire a une fiche lot exploitable.",
    signal: "Le besoin coproprietaire non occupant exprime un besoin individuel. Elle demande moins une comparaison generale PNO/CNO qu'une checklist centree sur un lot precis et sa situation actuelle.",
    proof: "Le dossier doit raconter le lot: usage, etage, annexes, bail, periode sans occupant, declaration de sinistre et informations transmises par le syndic.",
    decision: "Des que la situation du lot est claire, la page CNO consolidee permet de formuler une demande de devis courte et coherente.",
    riskGuidance: [
      "Indiquer depuis quand le lot est vide, meuble ou surveille change la perception du risque privatif.",
      "Separateur utile: ce qui vient du proprietaire, du voisin, de la copropriete ou de l'occupant precedent.",
      "Les recours de voisinage doivent etre relies au lot exact, pas seulement a l'adresse de l'immeuble.",
      "Declarer les travaux privatifs en cours evite une mauvaise interpretation d'un chantier interieur."
    ],
    faq: [
      ["Quel document caracterise le lot ?", "Le numero de lot, l'adresse, la nature du bien et les annexes comme cave, parking ou remise."],
      ["Faut-il transmettre le bail ?", "Oui si le lot est loue; sinon il faut expliquer la periode sans occupant et les mesures prises."],
      ["Le syndic doit-il fournir une attestation ?", "Une attestation ou au moins les informations du contrat immeuble aident a comprendre le socle collectif."],
      ["Cette page remplace-t-elle PNO/CNO ?", "Non, elle traite le cas individuel du coproprietaire qui n'occupe pas son lot."],
      ["Quand envoyer la demande ?", "Quand les donnees du lot, l'occupation et l'historique recent sont verifies."]
    ]
  },
  "blog/assurance-sci-immeuble-cartographie-patrimoine": {
    takeaway: "Raisonner portefeuille SCI: adresses, associes, echeances et coherence des contrats.",
    signal: "La recherche assurance SCI immeuble est patrimoniale. Elle ne se limite pas a un batiment: elle concerne une personne morale, des associes, des biens parfois multiples et une gouvernance.",
    proof: "La cartographie doit rapprocher les adresses detenues, les baux, les garanties existantes, les echeances et les decisions du gerant.",
    decision: "Quand le portefeuille est liste proprement, la page SCI peut transformer cette vision globale en consultation assureur par adresse ou par lot.",
    riskGuidance: [
      "Comparer contrats par adresse met en evidence les chevauchements et les zones non couvertes.",
      "Identifier les biens sans police active evite une faille au moment d'un sinistre patrimonial.",
      "Nommer le gerant et son pouvoir de signature fluidifie la souscription et les avenants.",
      "Un local mixte ou vide doit etre isole pour ne pas contaminer tout le portefeuille."
    ],
    faq: [
      ["Pourquoi commencer par une cartographie ?", "Parce qu'une SCI peut posseder plusieurs lots avec des usages et echeances differents."],
      ["Quels elements concernent les associes ?", "La gouvernance, le pouvoir de signature et parfois les decisions patrimoniales prises en assemblee."],
      ["Faut-il regrouper tous les contrats ?", "Pas toujours. L'objectif est d'abord de reperer incoherences, oublis et dates critiques."],
      ["Cette page parle-t-elle d'un seul immeuble ?", "Non, elle traite la lecture portefeuille avant la page assurance SCI."],
      ["Quand consulter le marche ?", "Quand les biens, echeances, usages et incidents recents sont classes par adresse."]
    ]
  },
  "blog/mandat-courtier-assurance-immeuble-consultation": {
    takeaway: "Encadrer la mission de courtage: mandat, cahier des charges, relances et arbitrage.",
    signal: "Le besoin courtier assurance immeuble exprime une demande de pilotage. Le contenu decrit la methode de consultation du marche plutot que les garanties elles-memes.",
    proof: "Le mandat doit fixer qui parle aux assureurs, quels documents circulent, quelles offres sont comparables et comment les refus seront traces.",
    decision: "Une fois le mandat et le cahier des charges stabilises, la page courtier ou devis peut recevoir une demande commerciale precise.",
    riskGuidance: [
      "Anticiper l'echeance laisse le temps de relancer plusieurs compagnies et d'obtenir des reserves ecrites.",
      "Limiter les interlocuteurs evite les doubles saisies du meme dossier sur le marche.",
      "Verifier la coherence des surfaces, lots et sinistres previent un retour assureur contradictoire.",
      "Comparer prime, franchises, plafonds et exclusions donne une decision plus solide que le prix seul."
    ],
    faq: [
      ["A quoi sert le mandat du courtier ?", "Il autorise une consultation ordonnee et evite que plusieurs acteurs presentent le meme risque en parallele."],
      ["Que contient le cahier des charges ?", "Usage de l'immeuble, lots, surfaces, echeance, historique et garanties attendues."],
      ["Comment lire un refus assureur ?", "Il faut identifier si le blocage vient du bien, du timing, des sinistres ou d'une piece manquante."],
      ["Cette page est-elle une page devis ?", "Non, elle explique la mission de consultation avant de passer au formulaire."],
      ["Quand solliciter ImmeubleAssur ?", "Quand le decisionnaire est identifie et que l'objectif de mise en concurrence est clair."]
    ]
  },
  "blog/prix-assurance-immeuble-franchises-reste-a-charge": {
    takeaway: "Lire le cout reel: prime, franchise, plafond, exclusion et scenario de sinistre.",
    signal: "La recherche prix assurance immeuble attire souvent une comparaison rapide. Cette page ramene la discussion vers le reste a charge et les limites de garantie.",
    proof: "Le prix utile se calcule avec un scenario concret: degat des eaux, incendie, responsabilite ou bris d'equipement, puis lecture de la franchise et du plafond.",
    decision: "Quand les offres sont comparables a garantie equivalente, la page prix ou comparateur peut guider l'arbitrage final.",
    riskGuidance: [
      "Une economie apparente peut disparaitre si la franchise absorbe les sinistres frequents.",
      "Une restriction sur les degats des eaux doit etre analysee avant toute acceptation d'offre basse.",
      "Nommer les garanties manquantes evite de comparer deux contrats de nature differente.",
      "Le service sinistre compte dans le cout reel lorsque l'immeuble a deja connu des incidents."
    ],
    faq: [
      ["Pourquoi le prix seul ne suffit-il pas ?", "Parce qu'une franchise haute ou une exclusion peut couter plus cher qu'une prime legerement superieure."],
      ["Quel chiffre comparer en premier ?", "La prime annuelle, puis les franchises par garantie et les plafonds d'indemnisation."],
      ["Comment integrer l'historique ?", "Les sinistres repetes doivent etre relies aux corrections realisees, sinon l'offre peut rester prudente."],
      ["Cette page donne-t-elle un tarif moyen ?", "Non, elle explique comment lire le cout reel avant une comparaison personnalisee."],
      ["Quand demander une analyse ?", "Quand vous avez deux offres, une echeance proche ou une hausse difficile a justifier."]
    ]
  },
  "blog/multirisque-immeuble-garanties-batiment-preuves": {
    takeaway: "Verifier le socle batiment: bati, dependances, equipements et evenements couverts.",
    signal: "Le besoin multirisque immeuble appelle une lecture technique du batiment. Cette page inventorie le socle garanti au lieu de reprendre toute la page assurance immeuble.",
    proof: "L'analyse part du bati: annee, surface, dependances, reseaux, toiture, portail, cave, parking et locaux techniques.",
    decision: "Quand le socle batiment est decrit, la page multirisque peut recevoir une demande complete pour comparer les garanties.",
    riskGuidance: [
      "Reperer les zones d'eau, colonnes et antecedents permet de calibrer la garantie la plus sollicitee.",
      "Le risque incendie depend aussi des locaux techniques, commerces, caves et installations communes.",
      "Les acces, parkings et parties exterieures doivent etre identifies pour traiter le vandalisme correctement.",
      "Toiture, facade et exposition locale orientent la lecture des evenements climatiques."
    ],
    faq: [
      ["Que couvre le socle multirisque ?", "Le bati, certaines responsabilites, les evenements majeurs et parfois des dependances selon contrat."],
      ["Pourquoi decrire les equipements ?", "Ascenseur, portail, cave ou local technique peuvent changer garanties et exclusions."],
      ["Faut-il parler des sinistres anciens ?", "Oui lorsque leur cause ou leur correction explique l'etat actuel du batiment."],
      ["Cette page repete-t-elle assurance immeuble ?", "Non, elle zoome sur l'inventaire technique avant la page multirisque."],
      ["Quand passer au devis ?", "Quand surfaces, lots, dependances et sinistres sont assez precis pour une consultation."]
    ]
  },
  "blog/syndic-benevole-assurance-immeuble-archives-ag": {
    takeaway: "Preparer l'AG d'une petite copropriete: archives, mandat, echeance et vote.",
    signal: "La recherche syndic benevole assurance immeuble correspond a une organisation souvent fragile. Cette page se concentre sur les archives et la decision d'assemblee generale.",
    proof: "Le syndic benevole doit retrouver les pieces qui prouvent sa designation, l'echeance du contrat, les incidents recents et les travaux deja votes.",
    decision: "Quand les archives essentielles sont reunies, la page syndic benevole peut cadrer le besoin et eviter une consultation trop tardive.",
    riskGuidance: [
      "Un mandat date et vote rassure sur la capacite a signer ou a demander une mise en concurrence.",
      "Classer contrat, appel de prime et courrier assureur evite de decouvrir l'echeance au dernier moment.",
      "Rattacher factures et travaux votes aux incidents montre que la copropriete agit sur ses causes de sinistre.",
      "Inscrire le sujet au bon ordre du jour evite une decision reportee faute de pouvoir de vote."
    ],
    faq: [
      ["Quelle archive chercher en premier ?", "Le PV qui designe le syndic benevole et le contrat actuel avec son echeance."],
      ["Pourquoi preparer une note d'AG ?", "Elle permet aux coproprietaires de comprendre le choix: conserver, ajuster ou consulter."],
      ["Que faire si des factures manquent ?", "Lister les incidents connus, demander les doublons disponibles et separer ce qui reste incertain."],
      ["Cette page remplace-t-elle la page copropriete ?", "Non, elle traite l'organisation pratique d'une petite copropriete autogeree."],
      ["Quand lancer la mise en concurrence ?", "Idealement avant l'AG ou des que l'echeance ne laisse plus assez de marge."]
    ]
  }
};

function copyFor(plan) {
  return UNIQUE_COPY[plan.slug] || {
    takeaway: "Qualifier le besoin avec un angle distinct avant passage au devis.",
    signal: "Ce besoin precis demande une reponse pratique, reliee aux garanties et aux pieces du dossier.",
    proof: "Le contenu doit separer le contexte du bien, les elements contractuels et la prochaine decision commerciale.",
    decision: "Lorsque les informations majeures sont reunies, le visiteur peut continuer vers la page principale ou le formulaire.",
    riskGuidance: plan.risks.map((risk) => `Documenter ${risk.toLowerCase()} avec le contexte du bien aide a cadrer la consultation.`)
  };
}

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function read(path, fallback = "") { return existsSync(path) ? readFileSync(path, "utf8") : fallback; }
function write(path, value) { ensureDir(dirname(path)); writeFileSync(path, value, "utf8"); }
function esc(value) { return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function attr(value) { return esc(value).replaceAll("'", "&#39;"); }
function stripHtml(value) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function hash(value, size = 10) { return createHash("sha256").update(String(value || "")).digest("hex").slice(0, size); }
function today() { return new Date().toISOString().slice(0, 10); }
function pathForSlug(slug) { return slug === "index" ? "index.html" : `${slug}.html`; }
function siteUrl(slug) { return slug === "index" ? `${SITE}/` : `${SITE}/${slug}`; }
function publicPath(slug) { return `/${slug}`; }
function versionedAsset(path) { const file = join(OUT, ...path.replace(/^\//, "").split("/")); return existsSync(file) ? `${path}?v=${hash(readFileSync(file))}` : path; }
function normalizeTarget(targetUrl) { return String(targetUrl || "").split("?")[0].replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+|\/+$/g, "") || "index"; }

function nav() {
  return `<header class="site-header" data-elevate><a class="brand" href="/" aria-label="IA ImmeubleAssur courtier immeuble - accueil"><span class="brand-mark" aria-hidden="true">IA</span><span><strong>ImmeubleAssur</strong><small>courtier immeuble</small></span></a><nav class="nav" aria-label="Navigation principale"><a href="/assurance-immeuble">Immeuble</a><a href="/recherches-assurance-immeuble">Recherches</a><a href="/assurance-copropriete">Copropriete</a><a href="/assurance-pno-cno">PNO/CNO</a><a href="/villes">Villes</a><a href="/blog">Blog</a><a href="/devis-assurance-immeuble">Devis</a></nav><a class="header-phone" href="tel:${PHONE_HREF}">${PHONE}</a></header>`;
}

function footer() {
  return `<footer class="site-footer" id="contact"><div><strong>ImmeubleAssur</strong><p>Courtier specialiste immeuble, copropriete, PNO, CNO, SCI et syndic.</p></div><address><a href="tel:${PHONE_HREF}">${PHONE}</a><a href="mailto:${EMAIL}">${EMAIL}</a><a href="/confidentialite">Confidentialite</a><span>ORIAS ${ORIAS}</span></address></footer>`;
}

function selected(defaults, name, value) { return defaults[name] === value ? " selected" : ""; }
function leadForm(defaults = {}) {
  return `<form class="quote-panel serp-recovery-form" id="lead-form" novalidate><div class="form-heading"><p>Devis immeuble</p><h2>Transformer ce dossier en reponse assureur</h2></div><input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" /><div class="field-grid"><label>Nom et prenom *<input name="name" autocomplete="name" required placeholder="Jean Dupont" /></label><label>Telephone *<input name="phone" type="tel" autocomplete="tel" required placeholder="06 12 34 56 78" /></label></div><label>Email (facultatif)<input name="email" type="email" autocomplete="email" placeholder="contact@exemple.fr" /></label><div class="field-grid"><label>Profil *<select name="profile" required><option value="">Choisir</option><option value="bailleur"${selected(defaults, "profile", "bailleur")}>Bailleur / proprietaire</option><option value="sci"${selected(defaults, "profile", "sci")}>SCI / fonciere</option><option value="syndic-professionnel"${selected(defaults, "profile", "syndic-professionnel")}>Syndic professionnel</option><option value="syndic-benevole"${selected(defaults, "profile", "syndic-benevole")}>Syndic benevole</option><option value="administrateur-biens"${selected(defaults, "profile", "administrateur-biens")}>Administrateur de biens</option><option value="conseil-syndical"${selected(defaults, "profile", "conseil-syndical")}>Conseil syndical</option></select></label><label>Type de bien *<select name="property_type" required><option value="">Choisir</option><option value="immeuble-locatif"${selected(defaults, "property_type", "immeuble-locatif")}>Immeuble locatif</option><option value="copropriete"${selected(defaults, "property_type", "copropriete")}>Copropriete</option><option value="lot-copropriete"${selected(defaults, "property_type", "lot-copropriete")}>Lot en copropriete</option><option value="logement-vacant"${selected(defaults, "property_type", "logement-vacant")}>Logement vacant</option><option value="local-commercial"${selected(defaults, "property_type", "local-commercial")}>Local commercial</option></select></label></div><div class="field-grid"><label>Ville *<input name="city" autocomplete="address-level2" required placeholder="Paris" /></label><label>Lots / logements<input name="units_count" inputmode="numeric" placeholder="12" /></label></div><label>Besoin principal<select name="need"><option value="multirisque-immeuble"${selected(defaults, "need", "multirisque-immeuble")}>Multirisque immeuble</option><option value="copropriete"${selected(defaults, "need", "copropriete")}>Assurance copropriete</option><option value="pno-cno"${selected(defaults, "need", "pno-cno")}>Comparer PNO/CNO</option><option value="cno"${selected(defaults, "need", "cno")}>CNO coproprietaire</option><option value="audit-contrat"${selected(defaults, "need", "audit-contrat")}>Audit contrat actuel</option></select></label><label>Message<textarea name="message" rows="3" placeholder="Contrat actuel, echeance, sinistres, travaux, occupation, documents deja disponibles..."></textarea></label><label class="consent-row"><input type="checkbox" name="consent" required /><span>J'accepte d'etre recontacte pour recevoir mon analyse et mon devis.</span></label><button class="submit-button" type="submit">Recevoir une analyse immeuble</button><p class="form-note">Demande qualifiee par ImmeubleAssur, courtier specialise immeuble.</p><div class="form-status" role="status" aria-live="polite"></div></form>`;
}

function faqRows(plan, row) {
  const custom = copyFor(plan).faq;
  if (Array.isArray(custom) && custom.length) return custom;
  const query = row.query || plan.title;
  return [
    [`Pourquoi traiter ${query} dans un guide dedie ?`, `Parce que ce besoin precis merite une checklist operationnelle reliee a ${plan.links[0][1]}.`],
    ["Quels elements changent vraiment la qualite de la reponse ?", `Les informations les plus utiles sont: ${plan.evidence.slice(0, 3).join(" ")} Elles donnent un contexte court, controle et actionnable.`],
    ["Cette page remplace-t-elle la page principale ?", `Non. Elle oriente le lecteur vers ${plan.links[0][1]} lorsque le besoin devient commercial.`],
    ["Quand passer au formulaire ?", "Des que le statut, la ville, l'occupation, l'echeance et les sinistres recents sont assez clairs."],
    ["Comment eviter une demande mal qualifiee ?", "Il faut separer contexte, documents disponibles, points incertains et prochaine decision."]
  ];
}

function schema({ slug, title, description, faq, row }) {
  const url = siteUrl(slug);
  const date = today();
  const graph = [
    { "@type": ["InsuranceAgency", "FinancialService"], "@id": `${SITE}/#organization`, name: "ImmeubleAssur", url: SITE, email: EMAIL, telephone: PHONE_HREF },
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: "ImmeubleAssur", publisher: { "@id": `${SITE}/#organization` } },
    { "@type": "WebPage", "@id": `${url}#webpage`, url, name: title, description, isPartOf: { "@id": `${SITE}/#website` }, publisher: { "@id": `${SITE}/#organization` }, about: [row.query || "assurance immeuble", "devis assurance immeuble", "dossier assureur"] },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` }, { "@type": "ListItem", position: 3, name: title, item: url }] },
    { "@type": "Article", headline: title, description, datePublished: date, dateModified: date, author: { "@id": `${SITE}/#organization` }, publisher: { "@id": `${SITE}/#organization` }, mainEntityOfPage: { "@id": `${url}#webpage` } },
    { "@type": "FAQPage", mainEntity: faq.map(([question, answer]) => ({ "@type": "Question", name: stripHtml(question), acceptedAnswer: { "@type": "Answer", text: stripHtml(answer) } })) }
  ];
  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>`;
}

function layout({ slug, title, description, body, faq, row }) {
  const styles = versionedAsset("/assets/styles.css");
  const app = versionedAsset("/assets/app.js");
  const canonical = siteUrl(slug);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="description" content="${attr(description)}" /><meta name="robots" content="index, follow, max-image-preview:large" /><meta property="og:type" content="article" /><meta property="og:locale" content="fr_FR" /><meta property="og:site_name" content="ImmeubleAssur" /><meta property="og:title" content="${attr(title)} | ImmeubleAssur" /><meta property="og:description" content="${attr(description)}" /><meta property="og:url" content="${canonical}" /><link rel="canonical" href="${canonical}" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="stylesheet" href="${styles}" /><title>${esc(title)} | ImmeubleAssur</title>${schema({ slug, title, description, faq, row })}</head><body><a class="skip-link" href="#main-content">Aller au contenu principal</a>${nav()}<main id="main-content">${body}</main>${footer()}<script src="${app}" type="module"></script></body></html>`;
}

function competitorText(row) {
  const competitors = (row.top_domains || []).filter(Boolean).slice(0, 3);
  if (!competitors.length) return "Le suivi API n'a pas remonte de domaine concurrent suffisamment stable sur cette requete.";
  return `Le suivi API observe surtout des acteurs generalistes comme ${competitors.join(", ")}. L'angle ImmeubleAssur doit donc prouver une specialisation immeuble plus concrete: pieces, garanties, responsabilites et passage au devis.`;
}

function pageBody(plan, row, faq) {
  const copy = copyFor(plan);
  const rank = Number.isFinite(row.position) ? `position ${row.position}` : "presence non detectee dans les resultats suivis";
  const evidence = plan.evidence.map((item) => `<li>${esc(item)}</li>`).join("");
  const risks = plan.risks.map((item, index) => `<article><h3>${esc(item)}</h3><p>${esc(copy.riskGuidance?.[index] || `Documenter ${item.toLowerCase()} avec le contexte du bien aide a cadrer la consultation.`)}</p></article>`).join("");
  const links = plan.links.map(([href, label]) => `<a href="${attr(href)}">${esc(label)}</a>`).join("");
  const faqHtml = faq.map(([question, answer]) => `<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join("");
  return `<article class="article-layout rich-article serp-recovery-page" data-serp-recovery="${attr(row.query || plan.title)}"><header class="article-head"><p class="eyebrow dark">${esc(plan.eyebrow)}</p><h1>${esc(plan.title)}.</h1><p>${esc(plan.description)}</p></header><div class="article-body"><div class="article-summary"><strong>A retenir</strong><ul><li>${esc(plan.distinct)}</li><li>${esc(copy.takeaway)}</li></ul></div><nav class="toc-list" aria-label="Sommaire"><a href="#signal">Signal</a><a href="#preuves">Preparation</a><a href="#risques">Risques</a><a href="#decision">Decision</a><a href="#faq">FAQ</a></nav><section id="signal"><h2>Clarifier le besoin et les garanties a verifier.</h2><p>${esc(copy.signal)}</p><p>${esc(competitorText(row))}</p></section><section id="preuves"><h2>Preparation concrete du dossier.</h2><p>${esc(copy.proof)}</p><ul class="check-list">${evidence}</ul><p>La sortie attendue est une fiche courte: contexte certain, zones a verifier, declaration necessaire et arbitrage a prendre.</p></section><section id="risques"><h2>Points de risque a expliciter.</h2><div class="local-proof-grid">${risks}</div></section><section id="decision"><h2>Passer de la preparation a la demande de devis.</h2><p>${esc(copy.decision)}</p><div class="source-box"><strong>Parcours recommande</strong>${links}<a class="button primary" href="${attr(row.target_url || "/devis-assurance-immeuble")}">Voir la solution recommandee</a></div></section><section id="faq" class="faq-list"><h2>Questions frequentes</h2>${faqHtml}</section></div><aside class="article-cta">${leadForm({ need: plan.need, profile: plan.profile, property_type: plan.propertyType })}</aside></article>`;
}

function fallbackPlan(row) {
  const target = normalizeTarget(row.target_url);
  return {
    slug: `blog/${target}-dossier-preuve-devis`,
    title: `${row.query || target}: dossier preuve avant devis`,
    description: `${row.query || target}: documents, risques, garanties et formulaire qualifie pour obtenir une reponse assureur exploitable.`,
    eyebrow: "Dossier preuve",
    audience: "proprietaires, syndics, SCI et bailleurs",
    need: "audit-contrat",
    profile: "bailleur",
    propertyType: "immeuble-locatif",
    distinct: "Cette page complete la page principale avec une methode de dossier et non une repetition de mots cles.",
    evidence: ["Contrat actuel et echeance.", "Adresse, surface, lots et occupation.", "Sinistres, travaux et mesures correctives.", "Garanties attendues et priorite commerciale."],
    risks: ["Dossier incomplet", "Franchise mal lue", "Exclusion sensible", "Echeance proche"],
    links: [[`/${target}`, "Page principale"], ["/devis-assurance-immeuble", "Devis immeuble"], ["/audit-contrat-assurance-immeuble", "Audit contrat"]]
  };
}

function loadSearchReport() {
  try { return JSON.parse(read(SEARCH_REPORT, "{}")); }
  catch { return {}; }
}

function candidateRows(report) {
  const rankings = Array.isArray(report.rankings) ? report.rankings : [];
  return rankings.filter((row) => row.measured === true && row.data_source === "serpapi" && row.confidence === "measured" && row.target_url && (!Number.isFinite(row.position) || row.position > 3)).slice(0, 12);
}

function sanitizeLegacyFallbackPages() {
  let sanitized = 0;
  for (const relativePath of readdirSync(OUT, { recursive: true }).map(String).filter((file) => file.endsWith(".html"))) {
    const file = join(OUT, relativePath);
    const html = read(file);
    if (!html.includes("data-serp-recovery=")) continue;
    const next = html
      .replace('class="article-layout rich-article serp-recovery-page"', 'class="article-layout rich-article evidence-guide-page"')
      .replace("data-serp-recovery=", "data-evidence-guide=")
      .replace(/ - SERP recovery/g, "")
      .replace(/<li>Signal SerpApi:[\s\S]*?<\/li>/g, "")
      .replace(/Lire le signal de recherche sans creer de doublon\./g, "Clarifier le besoin et les garanties a verifier.")
      .replace(/<a href="#signal">Signal<\/a>/g, '<a href="#signal">Besoin</a>')
      .replace(/<p>Le suivi API observe surtout[\s\S]*?<\/p>/g, "<p>Le guide se concentre sur les pieces, les garanties, les responsabilites et le passage vers un dossier de devis exploitable, sans affirmer de position Google non mesuree.</p>");
    if (next !== html) { write(file, next); sanitized += 1; }
  }
  return sanitized;
}

function writePage(slug, html) {
  const file = join(OUT, pathForSlug(slug));
  write(file, html);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateSitemap(slugs) {
  const file = join(OUT, "sitemap.xml");
  if (!existsSync(file)) return false;
  let xml = read(file);
  const date = today();
  for (const slug of slugs) {
    const loc = siteUrl(slug);
    xml = xml.replace(new RegExp(`\\n?\\s*<url><loc>${escapeRegExp(loc)}</loc>[\\s\\S]*?<\\/url>`, "g"), "");
    const entry = `  <url><loc>${loc}</loc><lastmod>${date}</lastmod><changefreq>weekly</changefreq><priority>0.65</priority></url>`;
    xml = xml.replace(/\s*<\/urlset>/, `\n${entry}\n</urlset>`);
  }
  write(file, xml);
  return true;
}

function updateSearchIndex(entries) {
  const file = join(OUT, "assets", "search-index.json");
  let index = [];
  try { index = JSON.parse(read(file, "[]")); }
  catch { index = []; }
  const urls = new Set(entries.map((entry) => entry.url));
  index = index.filter((entry) => !urls.has(entry.url));
  index.push(...entries);
  index.sort((a, b) => a.url.localeCompare(b.url));
  write(file, JSON.stringify(index, null, 2));
  return entries.length;
}

function build() {
  ensureDir(OUT);
  ensureDir(join(OUT, "blog"));
  ensureDir(join(OUT, "assets"));
  ensureDir(REPORT_DIR);
  const report = loadSearchReport();
  const rows = candidateRows(report);
  const legacyFallbackPagesSanitized = sanitizeLegacyFallbackPages();
  const entries = [];
  const pages = [];

  for (const row of rows) {
    const target = `/${normalizeTarget(row.target_url)}`;
    const plan = PLANS[target] || fallbackPlan(row);
    const faq = faqRows(plan, row);
    const body = pageBody(plan, row, faq);
    const html = layout({ slug: plan.slug, title: plan.title, description: plan.description, body, faq, row });
    writePage(plan.slug, html);
    entries.push({ title: plan.title, description: plan.description, url: publicPath(plan.slug) });
    pages.push({ slug: plan.slug, url: siteUrl(plan.slug), query: row.query || "", target_url: row.target_url || "", position: row.position || null, status: Number.isFinite(row.position) ? "near-top3" : "missing", word_count: stripHtml(html).split(/\s+/).filter(Boolean).length });
  }

  updateSitemap(pages.map((page) => page.slug));
  updateSearchIndex(entries);
  const out = {
    generated_at: new Date().toISOString(),
    source_run_id: report.run_id || "",
    provider: report.provider || "unknown",
    status: rows.length ? "measured-input-applied" : "held-no-measured-input",
    measured_input_required: true,
    legacy_fallback_pages_sanitized: legacyFallbackPagesSanitized,
    candidates: rows.length,
    pages_written: pages.length,
    search_index_entries: entries.length,
    sitemap_updated: pages.length > 0,
    pages,
    safeguards: ["serpapi-signal-only", "no-google-scraping", "support-pages-not-doorways", "visible-cta", "faq-schema", "canonical-self", "sitemap-lastmod", "serpapi-measured-input-only", "no-fallback-driven-pages", "legacy-fallback-claims-sanitized"]
  };
  write(join(REPORT_DIR, "serp-recovery-report.json"), JSON.stringify(out, null, 2));
  write(join(OUT, "assets", "serp-recovery-latest.json"), JSON.stringify(out, null, 2));
  console.log(`SERP recovery wrote ${out.pages_written} support page(s) from ${out.candidates} ranking gap(s).`);
}

build();