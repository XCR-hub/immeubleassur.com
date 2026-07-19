import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SITE = "https://immeubleassur.com";
const OUT = "public";
const PHONE = "01 80 85 57 86";
const PHONE_HREF = "+33180855786";
const EMAIL = "team@immeubleassur.com";
const ORIAS = "11 061 425";

const servicePages = [
  {
    slug: "assurance-immeuble",
    title: "Assurance immeuble multirisque pour bailleurs",
    h1: "Assurance immeuble pour bailleurs, SCI et coproprietes.",
    description:
      "Courtier specialiste assurance immeuble: multirisque, responsabilite civile, PNO, sinistres et audit de garanties.",
    keyword: "assurance immeuble",
    need: "multirisque-immeuble",
    profile: "bailleur",
    bullets: [
      "Parties communes, toiture, facade, halls, escaliers, locaux techniques et dependances.",
      "Responsabilite civile liee au batiment, recours des voisins et tiers.",
      "Lecture des franchises degats des eaux, incendie, vandalisme et evenements climatiques.",
      "Comparaison des plafonds, exclusions et conditions de declaration sinistre."
    ],
    sections: [
      ["Pour quels immeubles ?", "Immeubles d'habitation, immeubles mixtes, SCI familiales, patrimoines locatifs, petites coproprietes et immeubles avec locaux professionnels."],
      ["Notre angle de lecture", "Nous analysons la qualite du risque, l'occupation, les sinistres passes, les travaux prevus et les garanties essentielles avant mise en concurrence."]
    ]
  },
  {
    slug: "assurance-copropriete",
    title: "Assurance copropriete",
    h1: "Assurance copropriete pour syndic professionnel ou benevole.",
    description:
      "Assurance copropriete: RC syndicat, multirisque immeuble, protection juridique et audit de contrat pour conseils syndicaux.",
    keyword: "assurance copropriete",
    need: "copropriete",
    profile: "syndic-professionnel",
    bullets: [
      "RC du syndicat des coproprietaires et couverture des parties communes.",
      "Contrats adaptes aux syndics professionnels, benevoles et petites coproprietes.",
      "Aide a la preparation AG: garanties, franchises, options et budget.",
      "Suivi des immeubles avec ascenseur, gardien, parking, toiture-terrasse ou commerces."
    ],
    sections: [
      ["Point reglementaire", "En copropriete, la responsabilite civile du syndicat et des coproprietaires est un sujet central. Nous evitons les raccourcis et verifions le contrat contre votre situation reelle."],
      ["Pieces utiles", "Contrat actuel, dernier appel de prime, PV d'AG, sinistres sur 36 mois, nombre de lots, surface, adresse et descriptif des parties communes."]
    ]
  },
  {
    slug: "assurance-pno",
    title: "Assurance PNO proprietaire non occupant",
    h1: "Assurance PNO pour proprietaire non occupant.",
    description:
      "Assurance PNO bailleur et SCI: garanties essentielles, vacance locative, copropriete, recours locataire et protection du patrimoine.",
    keyword: "assurance PNO",
    need: "pno",
    profile: "bailleur",
    bullets: [
      "Lot vacant, logement loue, local mixte ou dependance non occupee.",
      "Complement au contrat occupant et au contrat immeuble de la copropriete.",
      "Responsabilite civile proprietaire, degats des eaux, incendie et recours.",
      "Contrats pour bailleurs particuliers, SCI et administrateurs de biens."
    ],
    sections: [
      ["Pourquoi une PNO ?", "La PNO protege le proprietaire quand le bien n'est pas couvert par l'occupant ou quand sa responsabilite est recherchee."],
      ["Comparaison", "Nous verifions notamment les plafonds, franchises, exclusions de vacance, dependances, meubles et locaux annexes."]
    ]
  },
  {
    slug: "multirisque-immeuble",
    title: "Multirisque immeuble",
    h1: "Multirisque immeuble: le contrat central du batiment.",
    description:
      "Multirisque immeuble pour copropriete, SCI et immeuble locatif: RC, dommages, degats des eaux, incendie et protection juridique.",
    keyword: "multirisque immeuble",
    need: "multirisque-immeuble",
    profile: "administrateur-biens",
    bullets: [
      "Dommages aux parties communes et biens immobiliers par destination.",
      "Responsabilite civile immeuble et defense-recours.",
      "Options: bris de glace, vandalisme, recherche de fuite, pertes de loyers selon contrat.",
      "Audit de franchises et seuils d'intervention."
    ],
    sections: [
      ["Contrat a auditer", "Deux contrats affichant les memes garanties peuvent produire des indemnisations tres differentes selon franchises, exclusions et obligations d'entretien."],
      ["Notre livrable", "Une lecture claire des points forts, points faibles et informations manquantes pour solliciter les assureurs."]
    ]
  },
  {
    slug: "rc-syndic",
    title: "Responsabilite civile syndic",
    h1: "RC syndic et responsabilite civile du syndicat.",
    description:
      "RC syndic, syndicat de coproprietaires et conseil syndical: comprendre les responsabilites et structurer les garanties utiles.",
    keyword: "RC syndic",
    need: "rc-syndic",
    profile: "syndic-benevole",
    bullets: [
      "Syndic professionnel, syndic benevole, conseil syndical et delegation de pouvoirs.",
      "Responsabilite civile du syndicat pour les parties communes.",
      "Protection juridique et defense des interets de la copropriete.",
      "Clarification entre RC pro syndic et assurance de l'immeuble."
    ],
    sections: [
      ["Syndic benevole", "Le syndic benevole doit eviter les zones grises: designation, mandat, declarations, archives, sinistres et contrats en cours."],
      ["Conseil syndical", "Nous aidons a distinguer ce qui releve du contrat immeuble, de la RC du syndic et de la responsabilite des coproprietaires."]
    ]
  },
  {
    slug: "assurance-sci",
    title: "Assurance SCI patrimoine immobilier",
    h1: "Assurance SCI pour patrimoine immobilier locatif.",
    description:
      "Assurance SCI: immeuble locatif, PNO, multirisque, locaux mixtes et gestion du risque immobilier patrimonial.",
    keyword: "assurance SCI",
    need: "multirisque-immeuble",
    profile: "sci",
    bullets: [
      "SCI familiale ou patrimoniale, immeuble entier ou lots disperses.",
      "Contrats PNO, multirisque immeuble, protection juridique et pertes financieres selon profil.",
      "Vision portefeuille pour regrouper les lots et eviter les doublons de garanties.",
      "Points sensibles: vacance, locaux commerciaux, dependances, travaux et sinistres."
    ],
    sections: [
      ["SCI et bailleurs", "Une SCI a souvent plusieurs contrats. Notre audit repere les trous de garantie, doublons et incoherences entre immeuble, lots et occupants."],
      ["Approche portefeuille", "Nous preparons les donnees assureur pour obtenir une reponse plus rapide et plus defendable."]
    ]
  },
  {
    slug: "dommages-ouvrage-immeuble",
    title: "Dommages ouvrage immeuble",
    h1: "Dommages ouvrage pour travaux d'immeuble.",
    description:
      "Dommages ouvrage immeuble: ravalement, toiture, renovation lourde, extension, structure et travaux de copropriete.",
    keyword: "dommages ouvrage immeuble",
    need: "dommages-ouvrage",
    profile: "conseil-syndical",
    bullets: [
      "Travaux structurels, renovation lourde, toiture, extension ou modification importante.",
      "Coordination avec maitre d'oeuvre, entreprises et assurances decennales.",
      "Pieces projet: descriptif travaux, devis, planning, diagnostics et intervenants.",
      "Analyse des exclusions et conditions de reception."
    ],
    sections: [
      ["Avant de consulter", "Un dossier DO incomplet ralentit fortement les reponses. Nous structurons les pieces pour eviter les allers-retours inutiles."],
      ["Copropriete", "Les travaux votes en AG doivent etre presentes avec un niveau de detail suffisant pour les assureurs."]
    ]
  },
  {
    slug: "assurance-immeuble-locatif",
    title: "Assurance immeuble locatif bailleur",
    h1: "Assurance immeuble locatif pour bailleurs et administrateurs de biens.",
    description:
      "Assurance immeuble locatif: multirisque, responsabilite civile, vacance, degats des eaux, parties communes et lots loues.",
    keyword: "assurance immeuble locatif",
    need: "multirisque-immeuble",
    profile: "administrateur-biens",
    bullets: [
      "Immeubles de rapport, monopropriete, petites surfaces et biens mixtes.",
      "Gestion des sinistres recurrents et recherche de fuite.",
      "Protection du bailleur et informations utiles pour l'assureur.",
      "Contrats adaptes aux immeubles avec rotation locative."
    ],
    sections: [
      ["Monopropriete", "Un immeuble locatif en monopropriete n'a pas les memes enjeux qu'une copropriete: l'assureur regarde l'occupation, l'entretien et l'historique."],
      ["Risque locatif", "Nous distinguons les garanties batiment, les garanties occupants et la responsabilite du proprietaire."]
    ]
  },
  {
    slug: "assurance-local-commercial",
    title: "Assurance local commercial bailleur",
    h1: "Assurance immeuble avec local commercial.",
    description:
      "Assurance local commercial et immeuble mixte: bailleur, copropriete, commerce en rez-de-chaussee, responsabilite et dommages.",
    keyword: "assurance local commercial",
    need: "audit-contrat",
    profile: "bailleur",
    bullets: [
      "Immeuble mixte habitation-commerce, locaux vacants ou exploites.",
      "Clarification entre contrat du locataire commercial et contrat proprietaire.",
      "Points sensibles: activite exercee, extraction, stock, enseigne, terrasse, accessibilite.",
      "Mise en concurrence avec declaration precise du risque."
    ],
    sections: [
      ["Pourquoi declarer l'activite ?", "Le type de commerce peut modifier l'appetence assureur et les conditions. Un risque mal decrit peut fragiliser le dossier."],
      ["Bailleur", "Nous aidons a aligner bail, assurances locataire et garanties proprietaire."]
    ]
  },
  {
    slug: "gestion-sinistres-immeuble",
    title: "Gestion sinistres immeuble",
    h1: "Gestion des sinistres immeuble et copropriete.",
    description:
      "Accompagnement sinistres immeuble: degat des eaux, incendie, tempete, vandalisme, recherche de fuite et recours.",
    keyword: "sinistre immeuble",
    need: "audit-contrat",
    profile: "syndic-professionnel",
    bullets: [
      "Lecture du contrat avant declaration et priorisation des informations utiles.",
      "Suivi degats des eaux, incendie, vandalisme, tempete et recherche de fuite.",
      "Historique sinistres pour remise en marche d'un dossier assureur.",
      "Preparation des pieces: photos, factures, rapports, devis, declarations et courriers."
    ],
    sections: [
      ["Apres sinistre", "La qualite des elements transmis influence fortement les delais. Nous aidons a constituer un dossier lisible."],
      ["Avant renouvellement", "Un historique sinistre mal presente peut degrader la consultation. Nous le contextualisons."]
    ]
  },
  {
    slug: "prix-assurance-immeuble",
    title: "Prix assurance immeuble",
    h1: "Prix assurance immeuble: les facteurs qui changent la prime.",
    description:
      "Comprendre le prix d'une assurance immeuble: lots, surface, usage, sinistres, localisation, franchises et garanties.",
    keyword: "prix assurance immeuble",
    need: "audit-contrat",
    profile: "bailleur",
    bullets: [
      "Nombre de lots, surface, usage habitation ou mixte et presence de commerces.",
      "Historique sinistres et qualite de l'entretien du batiment.",
      "Franchises degats des eaux, incendie, vandalisme et evenements climatiques.",
      "Options: protection juridique, recherche de fuite, bris de glace, pertes de loyers."
    ],
    sections: [
      ["Pas de tarif unique", "Un prix bas sans lecture des franchises peut etre un mauvais arbitrage. Nous comparons prime, garanties et reste a charge."],
      ["Devis rapide", "Plus le dossier est documente, plus la mise en concurrence est solide."]
    ]
  },
  {
    slug: "audit-contrat-assurance-immeuble",
    title: "Audit contrat assurance immeuble",
    h1: "Audit de contrat assurance immeuble avant renouvellement.",
    description:
      "Audit assurance immeuble: franchises, exclusions, plafonds, sinistres, adequation au risque et preparation de consultation assureurs.",
    keyword: "audit assurance immeuble",
    need: "audit-contrat",
    profile: "conseil-syndical",
    bullets: [
      "Lecture des garanties, franchises, plafonds et exclusions.",
      "Controle de coherence avec l'immeuble reel et les travaux prevus.",
      "Identification des pieces manquantes pour reconsulter le marche.",
      "Synthese claire pour syndic, bailleur, SCI ou conseil syndical."
    ],
    sections: [
      ["Avant echeance", "L'audit doit commencer avant la date limite de resiliation pour garder une vraie marge de negociation."],
      ["Sortie attendue", "Une liste d'actions: conserver, ajuster, consulter, renegocier ou changer."]
    ]
  }
];

const cities = [
  ["paris", "Paris", "syndics, SCI et bailleurs avec immeubles anciens, mixtes ou forte densite locative"],
  ["lyon", "Lyon", "coproprietes urbaines, immeubles de rapport et patrimoines familiaux"],
  ["marseille", "Marseille", "immeubles proches du littoral, coproprietes et locaux mixtes"],
  ["bordeaux", "Bordeaux", "immeubles pierre, coproprietes centrales et investissements locatifs"],
  ["lille", "Lille", "immeubles de rapport, coliving, locaux commerciaux et coproprietes"],
  ["nantes", "Nantes", "bailleurs, syndics et patrimoines locatifs en croissance"],
  ["nice", "Nice", "coproprietes, residences secondaires et immeubles proches littoral"],
  ["toulouse", "Toulouse", "immeubles locatifs, SCI et coproprietes familiales"],
  ["strasbourg", "Strasbourg", "immeubles anciens, syndics et coproprietes centre-ville"],
  ["montpellier", "Montpellier", "coproprietes recentes, bailleurs et locaux mixtes"],
  ["rennes", "Rennes", "immeubles locatifs et coproprietes a forte demande etudiante"],
  ["grenoble", "Grenoble", "immeubles collectifs, risques climatiques et coproprietes anciennes"],
  ["dijon", "Dijon", "patrimoines locatifs, SCI et petites coproprietes"],
  ["rouen", "Rouen", "immeubles anciens et contrats multirisques a auditer"],
  ["reims", "Reims", "SCI, bailleurs et coproprietes avec locaux mixtes"],
  ["angers", "Angers", "immeubles locatifs et coproprietes de taille intermediaire"],
  ["metz", "Metz", "patrimoines immobiliers, syndics benevoles et bailleurs"],
  ["clermont-ferrand", "Clermont-Ferrand", "petites coproprietes, SCI et immeubles de rapport"],
  ["tours", "Tours", "bailleurs, immeubles anciens et coproprietes centre-ville"],
  ["orleans", "Orleans", "immeubles locatifs, SCI et conseils syndicaux"],
  ["toulon", "Toulon", "coproprietes, residences et immeubles proches littoral"],
  ["le-havre", "Le Havre", "immeubles collectifs, locaux mixtes et garanties climatiques"],
  ["brest", "Brest", "immeubles exposes aux evenements climatiques et bailleurs"],
  ["limoges", "Limoges", "petites coproprietes et immeubles patrimoniaux"],
  ["perpignan", "Perpignan", "immeubles locatifs et coproprietes proches littoral"],
  ["amiens", "Amiens", "bailleurs, SCI et immeubles anciens"],
  ["besancon", "Besancon", "coproprietes, petites SCI et immeubles locatifs"],
  ["saint-etienne", "Saint-Etienne", "immeubles de rapport et risques de vacance"],
  ["villeurbanne", "Villeurbanne", "coproprietes urbaines et investissement locatif"],
  ["aix-en-provence", "Aix-en-Provence", "patrimoines locatifs, SCI et residences de standing"]
];

const articles = [
  {
    slug: "assurance-copropriete-obligatoire",
    title: "Assurance copropriete obligatoire: ce qu'il faut verifier",
    description: "Responsabilite civile du syndicat, coproprietaires occupants ou non occupants, role du syndic et pieces utiles.",
    category: "Reglementation",
    read: "6 min",
    body: [
      "La copropriete concentre plusieurs responsabilites: celles du syndicat, celles du syndic et celles des coproprietaires. Avant de comparer les prix, il faut donc clarifier qui assure quoi.",
      "La loi encadre notamment l'assurance responsabilite civile du syndicat et des coproprietaires. Pour eviter les mauvaises surprises, ImmeubleAssur verifie le contrat immeuble, les garanties PNO des bailleurs et les contrats professionnels du syndic.",
      "Le bon reflexe: rassembler le contrat actuel, l'appel de prime, les sinistres recents, le nombre de lots, les surfaces et les caracteristiques techniques du batiment."
    ]
  },
  {
    slug: "pno-bailleur-copropriete",
    title: "PNO bailleur: pourquoi elle reste utile en copropriete",
    description: "La PNO complete les assurances occupant et immeuble. Voici les cas ou elle protege le proprietaire.",
    category: "PNO",
    read: "5 min",
    body: [
      "Un proprietaire non occupant ne doit pas supposer que le contrat de la copropriete couvre toutes ses responsabilites. La PNO intervient comme protection du lot et du proprietaire.",
      "Elle peut etre utile pendant une vacance locative, lors d'un defaut d'assurance de l'occupant ou quand la responsabilite du proprietaire est recherchee.",
      "Le point important est la coherence entre contrat PNO, assurance habitation du locataire et multirisque immeuble."
    ]
  },
  {
    slug: "franchise-degat-des-eaux-immeuble",
    title: "Degat des eaux immeuble: franchises et recherche de fuite",
    description: "Pourquoi deux contrats d'immeuble peuvent produire des restes a charge tres differents apres degat des eaux.",
    category: "Sinistres",
    read: "7 min",
    body: [
      "Le degat des eaux est l'un des sinistres les plus frequents en immeuble. Le montant de franchise, les conditions de recherche de fuite et les exclusions peuvent changer radicalement le resultat.",
      "Un audit avant renouvellement doit relire les franchises par evenement, les plafonds de recherche de fuite, les obligations d'entretien et les modalites de declaration.",
      "ImmeubleAssur aide a presenter l'historique sinistres de facon lisible afin de ne pas penaliser inutilement le dossier."
    ]
  },
  {
    slug: "assurance-immeuble-mixte-commerce",
    title: "Immeuble mixte avec commerce: points de vigilance assurance",
    description: "Activite commerciale, extraction, terrasse, stock et garanties bailleur: les questions a poser.",
    category: "Immeuble mixte",
    read: "6 min",
    body: [
      "Un commerce en rez-de-chaussee peut modifier l'appetence de l'assureur. L'activite exercee, les installations techniques et les obligations du bail doivent etre declarees clairement.",
      "Il faut distinguer ce qui releve du locataire commercial, du bailleur et du contrat multirisque immeuble.",
      "Un dossier bien presente limite les refus ou les surprimes tardives."
    ]
  },
  {
    slug: "preparer-renouvellement-assurance-immeuble",
    title: "Preparer le renouvellement de son assurance immeuble",
    description: "Calendrier, pieces, sinistres, travaux et arbitrage prime/franchise avant l'echeance.",
    category: "Audit",
    read: "5 min",
    body: [
      "Le renouvellement se prepare avant l'echeance, pas la semaine de la resiliation. Plus le dossier est propre, plus la mise en concurrence est efficace.",
      "Les assureurs demandent generalement adresse, nombre de lots, usage, surface, sinistres, travaux prevus et contrat actuel.",
      "L'objectif n'est pas seulement de baisser la prime: il faut comparer le cout total, le niveau de garanties et la capacite du contrat a absorber les sinistres probables."
    ]
  },
  {
    slug: "syndic-benevole-assurance",
    title: "Syndic benevole: les reflexes assurance a adopter",
    description: "Contrat immeuble, RC, documents, AG et declarations: un guide pour syndics non professionnels.",
    category: "Syndic",
    read: "6 min",
    body: [
      "Un syndic benevole gere des enjeux concrets: entretien, sinistres, contrats et obligations de la copropriete. La partie assurance doit etre structuree et documentee.",
      "Le syndic doit distinguer assurance de l'immeuble, RC du syndicat et eventuelles responsabilites personnelles ou professionnelles.",
      "ImmeubleAssur simplifie la preparation du dossier et la lecture des propositions."
    ]
  },
  {
    slug: "assurance-sci-patrimoine-locatif",
    title: "SCI et patrimoine locatif: eviter les trous de garantie",
    description: "Regrouper, auditer et comparer les contrats d'une SCI detenant plusieurs biens.",
    category: "SCI",
    read: "5 min",
    body: [
      "Une SCI peut cumuler des contrats PNO, multirisque immeuble, protection juridique et contrats occupants. Sans vision globale, les doublons et trous de garantie apparaissent vite.",
      "Un audit portfolio permet de verifier la coherence entre les biens, leur usage et les garanties en place.",
      "La consultation assureur gagne en qualite lorsque le patrimoine est presente avec une fiche claire par bien."
    ]
  },
  {
    slug: "checklist-documents-devis-immeuble",
    title: "Checklist documents pour un devis assurance immeuble",
    description: "Les pieces a preparer pour obtenir une reponse assureur rapide et fiable.",
    category: "Documents",
    read: "4 min",
    body: [
      "Un devis assurance immeuble se gagne souvent dans la preparation. Les informations manquantes creent des allers-retours et ralentissent la decision.",
      "Preparez au minimum: contrat actuel, appel de prime, adresse, nombre de lots, surface, usage, sinistres 36 mois, photos si besoin et travaux prevus.",
      "Pour une copropriete, ajoutez PV d'AG utile, mandat du syndic et descriptif des parties communes."
    ]
  }
];

const guides = [
  {
    slug: "guide-assurance-copropriete-2026",
    title: "Guide assurance copropriete 2026",
    description: "Guide pratique pour comprendre RC syndicat, multirisque immeuble, syndic, PNO et renouvellement.",
    items: [
      "Identifier les responsabilites: syndicat, syndic, coproprietaires occupants et non occupants.",
      "Relire le contrat multirisque immeuble: dommages, RC, franchises, exclusions.",
      "Comparer PNO, assurance occupant et contrat immeuble sans doublons.",
      "Preparer le renouvellement 2 a 3 mois avant echeance.",
      "Documenter les sinistres avec cause, montant, recurrence et actions correctives."
    ]
  },
  {
    slug: "checklist-documents-assurance-immeuble",
    title: "Checklist documents assurance immeuble",
    description: "Liste des pieces a rassembler avant de demander un devis immeuble, copropriete ou PNO.",
    items: [
      "Contrat actuel et dernier appel de prime.",
      "Adresse complete, annee de construction, nombre de lots et surfaces.",
      "Usage: habitation, mixte, commerce, parking, locaux techniques.",
      "Sinistres sur 36 mois et mesures correctives.",
      "Travaux votes ou prevus: toiture, facade, reseaux, ascenseur, securite.",
      "Coordonnees du syndic, bailleur, SCI ou administrateur de biens."
    ]
  },
  {
    slug: "comparateur-assurance-immeuble",
    title: "Comparateur assurance immeuble",
    description: "Comment comparer un contrat immeuble au-dela du prix: franchises, exclusions, plafonds et services.",
    items: [
      "Comparer la prime annuelle et le reste a charge probable.",
      "Verifier franchises par garantie et par evenement.",
      "Lire les exclusions: inoccupation, entretien, infiltration, activites commerciales.",
      "Controler les plafonds recherche de fuite, bris de glace et protection juridique.",
      "Evaluer le service sinistre et la clarte des obligations de declaration."
    ]
  }
];

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pagePath(slug) {
  return slug === "index" ? "index.html" : `${slug}.html`;
}

function nav() {
  return `
    <header class="site-header" data-elevate>
      <a class="brand" href="/" aria-label="ImmeubleAssur accueil">
        <span class="brand-mark" aria-hidden="true">IA</span>
        <span><strong>ImmeubleAssur</strong><small>courtier immeuble</small></span>
      </a>
      <nav class="nav" aria-label="Navigation principale">
        <a href="/assurance-immeuble.html">Immeuble</a>
        <a href="/assurance-copropriete.html">Copropriete</a>
        <a href="/assurance-pno.html">PNO</a>
        <a href="/assurance-cno.html">CNO</a>
        <a href="/villes.html">Villes</a>
        <a href="/blog.html">Blog</a>
                <a href="/faq.html">FAQ</a>
<a href="/devis-assurance-immeuble.html">Devis</a>
      </nav>
      <a class="header-phone" href="tel:${PHONE_HREF}">${PHONE}</a>
    </header>`;
}

function footer() {
  return `
    <footer class="site-footer" id="contact">
      <div>
        <strong>ImmeubleAssur</strong>
        <p>Courtier specialiste immeuble, copropriete, PNO, SCI et syndic.</p>
      </div>
      <address>
        <a href="tel:${PHONE_HREF}">${PHONE}</a>
        <a href="mailto:${EMAIL}">${EMAIL}</a>
        <a href="/confidentialite.html">Confidentialite</a>
        <span>ORIAS ${ORIAS}</span>
      </address>
    </footer>`;
}

function leadForm(defaults = {}) {
  const selected = (name, value) => defaults[name] === value ? " selected" : "";
  return `
    <form class="quote-panel" id="lead-form" novalidate>
      <div class="form-heading">
        <p>Devis gratuit</p>
        <h2>Qualifier mon immeuble</h2>
      </div>
      <input class="hp-field" type="text" name="company_website" tabindex="-1" autocomplete="off" />
      <div class="field-grid">
        <label>Nom et prenom *<input name="name" autocomplete="name" required placeholder="Jean Dupont" /></label>
        <label>Telephone *<input name="phone" type="tel" autocomplete="tel" required placeholder="06 12 34 56 78" /></label>
      </div>
      <label>Email *<input name="email" type="email" autocomplete="email" required placeholder="contact@exemple.fr" /></label>
      <div class="field-grid">
        <label>Profil *
          <select name="profile" required>
            <option value="">Choisir</option>
            <option value="syndic-professionnel"${selected("profile", "syndic-professionnel")}>Syndic professionnel</option>
            <option value="syndic-benevole"${selected("profile", "syndic-benevole")}>Syndic benevole</option>
            <option value="conseil-syndical"${selected("profile", "conseil-syndical")}>Conseil syndical</option>
            <option value="bailleur"${selected("profile", "bailleur")}>Bailleur / PNO</option>
            <option value="sci"${selected("profile", "sci")}>SCI / fonciere</option>
            <option value="administrateur-biens"${selected("profile", "administrateur-biens")}>Administrateur de biens</option>
          </select>
        </label>
        <label>Type de bien *
          <select name="property_type" required>
            <option value="">Choisir</option>
            <option value="copropriete"${selected("property_type", "copropriete")}>Copropriete</option>
            <option value="immeuble-locatif"${selected("property_type", "immeuble-locatif")}>Immeuble locatif</option>
            <option value="mixte"${selected("property_type", "mixte")}>Immeuble mixte</option>
            <option value="commerce"${selected("property_type", "commerce")}>Local commercial</option>
            <option value="parking"${selected("property_type", "parking")}>Parking / garages</option>
          </select>
        </label>
      </div>
      <div class="field-grid">
        <label>Ville *<input name="city" autocomplete="address-level2" required placeholder="${esc(defaults.city || "Paris")}" value="${esc(defaults.city || "")}" /></label>
        <label>Lots / logements<input name="units_count" inputmode="numeric" placeholder="24" /></label>
      </div>
      <label>Besoin principal
        <select name="need">
          <option value="multirisque-immeuble"${selected("need", "multirisque-immeuble")}>Multirisque immeuble</option>
          <option value="copropriete"${selected("need", "copropriete")}>Assurance copropriete</option>
          <option value="pno"${selected("need", "pno")}>PNO bailleur</option>
          <option value="cno"${selected("need", "cno")}>CNO coproprietaire non occupant</option>
          <option value="pno-cno"${selected("need", "pno-cno")}>Comparer PNO/CNO</option>
          <option value="rc-syndic"${selected("need", "rc-syndic")}>RC syndic / conseil syndical</option>
          <option value="dommages-ouvrage"${selected("need", "dommages-ouvrage")}>Dommages ouvrage</option>
          <option value="audit-contrat"${selected("need", "audit-contrat")}>Audit contrat existant</option>
        </select>
      </label>
      <label>Message<textarea name="message" rows="3" placeholder="Adresse, surface, assureur actuel, echeance, sinistres recents...">${esc(defaults.message || "")}</textarea></label>
      <label class="consent-row"><input type="checkbox" name="consent" required /><span>J'accepte d'etre recontacte pour recevoir mon analyse et mon devis.</span></label>
      <button class="submit-button" type="submit">Obtenir mon devis immeuble</button>
      <p class="form-note">Donnees transmises a ImmeubleAssur pour traiter votre demande.</p>
      <div class="form-status" role="status" aria-live="polite"></div>
    </form>`;
}

function layout({ slug, title, description, body, canonical, schema = "" }) {
  const url = `${SITE}/${slug === "index" ? "" : pagePath(slug)}`;
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0f766e" />
    <meta name="robots" content="${slug === "admin" ? "noindex, nofollow" : "index, follow, max-image-preview:large"}" />
    <meta name="description" content="${esc(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:site_name" content="ImmeubleAssur" />
    <meta property="og:title" content="${esc(title)} | ImmeubleAssur" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80" />
    <link rel="canonical" href="${canonical || url}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="preconnect" href="https://images.unsplash.com" crossorigin />
    <link rel="preload" as="image" href="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=70" crossorigin />
    <link rel="stylesheet" href="/assets/styles.css" />
    <title>${esc(title)} | ImmeubleAssur</title>
    ${schema}
  </head>
  <body>
    <a class="skip-link" href="#main-content">Aller au contenu principal</a>
    ${nav()}
    <main id="main-content">
      ${body}
    </main>
    ${footer()}
    <script src="/assets/app.js" type="module"></script>
  </body>
</html>`;
}

function organizationSchema() {
  return `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": ["InsuranceAgency", "FinancialService"],
    "@id": `${SITE}/#organization`,
    name: "ImmeubleAssur",
    url: SITE,
    telephone: PHONE_HREF,
    email: EMAIL,
    areaServed: "France",
    description: "Courtier specialiste en assurance immeuble, copropriete, PNO, SCI, multirisque immeuble et RC syndic.",
    knowsAbout: ["Assurance immeuble", "Assurance copropriete", "Multirisque immeuble", "Assurance PNO", "Responsabilite civile syndic", "Dommages ouvrage immeuble"],
    hasCredential: {
      "@type": "EducationalOccupationalCredential",
      credentialCategory: "ORIAS",
      identifier: ORIAS.replace(/\s/g, "")
    }
  })}</script>`;
}

function homePage() {
  const body = `
    <section class="hero">
      <div class="hero-media" aria-hidden="true"></div>
      <div class="hero-overlay" aria-hidden="true"></div>
      <div class="hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">Specialiste assurance immeuble</p>
          <h1>Assurance immeuble, copropriete et PNO sans angle mort.</h1>
          <p class="hero-lead">ImmeubleAssur compare les garanties multirisque immeuble, responsabilite civile, PNO, protection juridique et contrats pour syndics, SCI, bailleurs et conseils syndicaux.</p>
          <div class="hero-actions">
            <a class="button primary" href="/devis-assurance-immeuble.html">Demander un devis</a>
            <a class="button secondary" href="/assurance-pno-cno.html">PNO / CNO</a>
          </div>
          <div class="hero-intent-grid" aria-label="Acces rapides assurance immeuble">
            <a class="intent-card" data-track="intent-immeuble" href="/assurance-immeuble.html"><strong>Immeuble</strong><span>Multirisque, franchises, sinistres.</span></a>
            <a class="intent-card" data-track="intent-copro" href="/assurance-copropriete.html"><strong>Copropriete</strong><span>Syndic, AG, parties communes.</span></a>
            <a class="intent-card" data-track="intent-pno-cno" href="/assurance-pno-cno.html"><strong>PNO / CNO</strong><span>Lot loue, vacant, non occupant.</span></a>
            <a class="intent-card" data-track="intent-sci" href="/assurance-sci.html"><strong>SCI</strong><span>Patrimoine et lots multiples.</span></a>
          </div>
          <dl class="proof-strip" aria-label="Indicateurs">
            <div><dt>15 min</dt><dd>rappel expert</dd></div>
            <div><dt>Maillage</dt><dd>national</dd></div>
            <div><dt>Audit</dt><dd>contrat</dd></div>
          </dl>
        </div>
        ${leadForm({ need: "multirisque-immeuble" })}
      </div>
    </section>
    <section class="conversion-strip" aria-label="Preuves de specialisation">
      <div class="conversion-strip-inner">
        <article><strong>ORIAS ${ORIAS}</strong><span>Courtier identifie pour vos demandes immeuble.</span></article>
        <article><strong>CNO / PNO</strong><span>Parcours dedie coproprietaires et bailleurs.</span></article>
        <article><strong>24-48h</strong><span>Dossier qualifie puis consultation assureur.</span></article>
        <article><strong>France</strong><span>Pages locales, syndics, SCI et coproprietes.</span></article>
      </div>
    </section>
    <section class="band intro-band">
      <div class="section-head">
        <p class="eyebrow dark">Solutions immeuble</p>
        <h2>Une plateforme specialisee pour transformer les demandes immeuble en dossiers exploitables.</h2>
      </div>
      <div class="solution-grid">
        ${servicePages.slice(0, 8).map((page) => `<article><span class="icon">${page.title.split(" ").map(w => w[0]).join("").slice(0,2)}</span><h3><a href="/${page.slug}.html">${esc(page.title)}</a></h3><p>${esc(page.description)}</p></article>`).join("")}
      </div>
    </section>
    <section class="band compare-band">
      <div class="split">
        <div>
          <p class="eyebrow dark">Analyse immeuble</p>
          <h2>Un devis exploitable commence par une description precise du risque.</h2>
          <p>Nous cadrons les informations attendues par les assureurs: occupation, lots, travaux, sinistres, garanties, franchises et responsabilites.</p>
        </div>
        <ul class="check-list">
          <li>Lecture des franchises, exclusions et plafonds.</li>
          <li>Preparation des informations assureur avant consultation.</li>
          <li>Approche adaptee aux syndics, SCI, bailleurs et PNO.</li>
          <li>Suivi des sinistres et travaux prevus dans l'analyse.</li>
        </ul>
      </div>
    </section>
    <section class="band process-band">
      <div class="section-head"><p class="eyebrow dark">Parcours</p><h2>Du trafic SEO au dossier assureur.</h2></div>
      <ol class="steps">
        <li><strong>Attirer</strong><span>Pages services, villes, guides et articles specialises assurance immeuble.</span></li>
        <li><strong>Qualifier</strong><span>Formulaire adapte copropriete, PNO, SCI, syndic et immeuble mixte.</span></li>
        <li><strong>Comparer</strong><span>Consultation assureurs, analyse des garanties et arbitrage prime/franchise.</span></li>
      </ol>
    </section>
    <section class="band seo-band">
      <div class="section-head"><p class="eyebrow dark">Maillage local</p><h2>Pages assurance immeuble par ville.</h2></div>
      <div class="city-tags">${cities.map(([slug, city]) => `<a href="/assurance-immeuble-${slug}.html">${city}</a>`).join("")}</div>
    </section>
    <section class="band faq-band">
      <div class="section-head"><p class="eyebrow dark">Guides</p><h2>Ressources pour syndics, bailleurs et SCI.</h2></div>
      <div class="card-grid">${guides.map((guide) => `<article class="content-card"><h3><a href="/${guide.slug}.html">${esc(guide.title)}</a></h3><p>${esc(guide.description)}</p></article>`).join("")}</div>
    </section>`;
  return layout({
    slug: "index",
    title: "Assurance Immeuble et Copropriete - Devis Gratuit",
    description: "ImmeubleAssur, courtier specialiste assurance immeuble, copropriete, PNO, multirisque immeuble, SCI et RC syndic.",
    body,
    schema: organizationSchema()
  });
}

function servicePage(page) {
  const body = `
    <section class="page-hero compact-hero">
      <div class="container">
        <p class="eyebrow">${esc(page.keyword)}</p>
        <h1>${esc(page.h1)}</h1>
        <p>${esc(page.description)}</p>
        <div class="hero-actions"><a class="button primary" href="#devis">Demander un devis</a><a class="button secondary" href="/guides.html">Guides immeuble</a></div>
      </div>
    </section>
    <section class="band page-band">
      <div class="split">
        <div>
          <p class="eyebrow dark">Garanties et analyse</p>
          <h2>Ce que nous verifions pour votre dossier.</h2>
          <ul class="check-list">${page.bullets.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </div>
        ${leadForm({ need: page.need, profile: page.profile })}
      </div>
    </section>
    ${page.sections.map(([title, text]) => `<section class="band ${title.length % 2 ? "intro-band" : "compare-band"}"><div class="container narrow"><p class="eyebrow dark">${esc(page.title)}</p><h2>${esc(title)}</h2><p class="large-copy">${esc(text)}</p></div></section>`).join("")}
    <section class="band faq-band">
      <div class="section-head"><p class="eyebrow dark">Pages liees</p><h2>Approfondir le sujet.</h2></div>
      <div class="card-grid">
        ${servicePages.filter((item) => item.slug !== page.slug).slice(0, 4).map((item) => `<article class="content-card"><h3><a href="/${item.slug}.html">${esc(item.title)}</a></h3><p>${esc(item.description)}</p></article>`).join("")}
      </div>
    </section>`;
  return layout({ slug: page.slug, title: page.title, description: page.description, body });
}

function cityPage([slug, city, focus]) {
  const title = `Assurance immeuble ${city}`;
  const description = `Devis assurance immeuble a ${city}: copropriete, PNO, SCI, multirisque immeuble et audit contrat pour ${focus}.`;
  const body = `
    <section class="page-hero compact-hero">
      <div class="container">
        <p class="eyebrow">Assurance immeuble ${esc(city)}</p>
        <h1>Assurance immeuble a ${esc(city)}.</h1>
        <p>ImmeubleAssur accompagne ${esc(focus)} avec une lecture claire des garanties, franchises et informations attendues par les assureurs.</p>
        <div class="hero-actions"><a class="button primary" href="#devis">Devis immeuble ${esc(city)}</a><a class="button secondary" href="/villes.html">Toutes les villes</a></div>
      </div>
    </section>
    <section class="band page-band">
      <div class="split">
        <div>
          <p class="eyebrow dark">Local</p>
          <h2>Un dossier adapte au marche immobilier de ${esc(city)}.</h2>
          <ul class="check-list">
            <li>Coproprietes, syndics, SCI, bailleurs et administrateurs de biens.</li>
            <li>Contrats multirisque immeuble, PNO et responsabilite civile.</li>
            <li>Analyse des sinistres, travaux, lots, usage mixte et franchises.</li>
            <li>Preparation d'une fiche risque pour solliciter les assureurs.</li>
          </ul>
        </div>
        ${leadForm({ city, need: "multirisque-immeuble" })}
      </div>
    </section>
    <section class="band seo-band"><div class="container narrow"><h2>Pourquoi passer par ImmeubleAssur a ${esc(city)} ?</h2><p class="large-copy">Un immeuble se decrit precisement: adresse, usage, nombre de lots, etat, travaux, sinistres et occupation. Notre role est de rendre ce risque lisible pour obtenir une proposition coherente, pas seulement un prix rapide.</p></div></section>`;
  return layout({ slug: `assurance-immeuble-${slug}`, title, description, body });
}

function articlePage(article) {
  const body = `
    <article class="article-layout">
      <header class="article-head">
        <p class="eyebrow dark">${esc(article.category)} - ${esc(article.read)}</p>
        <h1>${esc(article.title)}</h1>
        <p>${esc(article.description)}</p>
      </header>
      <div class="article-body">
        ${article.body.map((p) => `<p>${esc(p)}</p>`).join("")}
        <div class="source-box">
          <strong>Sources utiles</strong>
          <a href="https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000028779136/" rel="nofollow">Legifrance - article 9-1 loi copropriete</a>
          <a href="https://www.service-public.fr/particuliers/vosdroits/F2608" rel="nofollow">Service-Public.fr - syndic de copropriete</a>
        </div>
      </div>
      <aside class="article-cta">${leadForm({ need: "audit-contrat" })}</aside>
    </article>`;
  return layout({ slug: `blog/${article.slug}`, title: article.title, description: article.description, body });
}

function guidePage(guide) {
  const body = `
    <section class="page-hero compact-hero">
      <div class="container"><p class="eyebrow">Guide pratique</p><h1>${esc(guide.title)}</h1><p>${esc(guide.description)}</p></div>
    </section>
    <section class="band page-band">
      <div class="split">
        <div>
          <p class="eyebrow dark">Checklist</p>
          <h2>Les points a traiter.</h2>
          <ol class="number-list">${guide.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>
        </div>
        ${leadForm({ need: "audit-contrat" })}
      </div>
    </section>`;
  return layout({ slug: guide.slug, title: guide.title, description: guide.description, body });
}

function listingPage({ slug, title, description, intro, cards }) {
  const body = `
    <section class="page-hero compact-hero"><div class="container"><p class="eyebrow">ImmeubleAssur</p><h1>${esc(title)}</h1><p>${esc(intro)}</p></div></section>
    <section class="band page-band"><div class="card-grid">${cards.join("")}</div></section>`;
  return layout({ slug, title, description, body });
}

function faqPage() {
  const faqs = [
    ["Une copropriete doit-elle s'assurer ?", "La responsabilite civile du syndicat des coproprietaires et des coproprietaires doit etre traitee avec attention. Nous verifions le contrat en place et les garanties complementaires utiles."],
    ["La PNO remplace-t-elle le contrat immeuble ?", "Non. La PNO protege le proprietaire non occupant pour son lot ou son bien. Le contrat immeuble couvre le batiment et les parties communes selon le contexte."],
    ["Quel delai pour un devis ?", "Un dossier complet peut etre qualifie rapidement. Les reponses assureurs dependent ensuite du risque, de la sinistralite et des pieces fournies."],
    ["Pouvez-vous auditer mon contrat actuel ?", "Oui. Le formulaire permet de demander un audit contrat avec les informations essentielles, puis nous demandons les pieces manquantes."],
    ["Conservez-vous les donnees ?", "Les demandes sont traitees par ImmeubleAssur pour qualifier le dossier, recontacter le demandeur et suivre la demande commerciale."]
  ];
  const body = `
    <section class="page-hero compact-hero"><div class="container"><p class="eyebrow">FAQ</p><h1>Questions frequentes assurance immeuble.</h1><p>Reponses courtes pour syndics, coproprietaires, bailleurs, SCI et administrateurs de biens.</p></div></section>
    <section class="band faq-band"><div class="faq-list">${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div></section>
    <section class="band page-band"><div class="container narrow">${leadForm({ need: "audit-contrat" })}</div></section>`;
  return layout({ slug: "faq", title: "FAQ assurance immeuble", description: "Questions frequentes sur assurance immeuble, copropriete, PNO, SCI, syndic et multirisque immeuble.", body });
}

function contactPage() {
  const body = `
    <section class="page-hero compact-hero"><div class="container"><p class="eyebrow">Contact</p><h1>Contacter ImmeubleAssur.</h1><p>Un besoin immeuble, copropriete, PNO, SCI ou audit contrat ? Envoyez les informations essentielles.</p></div></section>
    <section class="band page-band"><div class="split"><div><h2>Coordonnees</h2><p class="large-copy">Telephone: ${PHONE}<br>Email: ${EMAIL}<br>ORIAS: ${ORIAS}</p></div>${leadForm({ need: "audit-contrat" })}</div></section>`;
  return layout({ slug: "contact", title: "Contact assurance immeuble", description: "Contact ImmeubleAssur pour devis assurance immeuble, copropriete, PNO, SCI et audit contrat.", body });
}

function simplePage(slug, title, description, content) {
  const body = `<section class="plain-main"><div class="plain-panel"><p class="eyebrow dark">ImmeubleAssur</p><h1>${esc(title)}</h1>${content}</div></section>`;
  return layout({ slug, title, description, body });
}

function adminPage() {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/assets/styles.css" />
    <title>Admin leads - ImmeubleAssur</title>
  </head>
  <body class="plain-page">
    ${nav()}
    <main class="plain-main">
      <h1>Leads immeuble</h1>
      <p>Acces protege par le secret Cloudflare Pages ADMIN_API_TOKEN.</p>
      <section class="plain-panel">
        <form class="admin-toolbar" id="admin-form">
          <label>Token admin<input id="admin-token" type="password" autocomplete="current-password" required placeholder="Token admin" /></label>
          <button class="submit-button" type="submit">Charger</button>
        </form>
        <p class="form-status" role="status" aria-live="polite"></p>
      </section>
      <section class="admin-table-wrap" aria-label="Derniers leads">
        <table class="admin-table">
          <thead><tr><th>Date</th><th>Reference</th><th>Contact</th><th>Profil</th><th>Bien</th><th>Ville</th><th>Besoin</th><th>Statut</th><th>Score</th><th>Message</th></tr></thead>
          <tbody id="leads-body"><tr><td colspan="10">Aucun chargement effectue.</td></tr></tbody>
        </table>
      </section>
    </main>
    <script src="/assets/admin.js" type="module"></script>
  </body>
</html>`;
}

function write(slug, html) {
  const file = join(OUT, pagePath(slug));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html, "utf8");
}

function writeStatic() {
  mkdirSync(join(OUT, "blog"), { recursive: true });
  write("index", homePage());
  for (const page of servicePages) write(page.slug, servicePage(page));
  for (const city of cities) write(`assurance-immeuble-${city[0]}`, cityPage(city));
  for (const article of articles) write(`blog/${article.slug}`, articlePage(article));
  for (const guide of guides) write(guide.slug, guidePage(guide));
  write("blog", listingPage({
    slug: "blog",
    title: "Blog assurance immeuble",
    description: "Articles assurance immeuble, copropriete, PNO, SCI, syndic et sinistres.",
    intro: "Conseils pratiques pour mieux assurer un immeuble et preparer les dossiers assureurs.",
    cards: articles.map((article) => `<article class="content-card"><p class="eyebrow dark">${esc(article.category)}</p><h3><a href="/blog/${article.slug}.html">${esc(article.title)}</a></h3><p>${esc(article.description)}</p></article>`)
  }));
  write("villes", listingPage({
    slug: "villes",
    title: "Assurance immeuble par ville",
    description: "Pages locales assurance immeuble pour Paris, Lyon, Marseille, Bordeaux, Lille, Nantes et grandes villes.",
    intro: "Maillage local pour capter les recherches des syndics, bailleurs, SCI et coproprietaires.",
    cards: cities.map(([slug, city, focus]) => `<article class="content-card"><h3><a href="/assurance-immeuble-${slug}.html">Assurance immeuble ${esc(city)}</a></h3><p>${esc(focus)}.</p></article>`)
  }));
  write("guides", listingPage({
    slug: "guides",
    title: "Guides assurance immeuble",
    description: "Guides pratiques assurance immeuble, copropriete, documents, comparateur et renouvellement.",
    intro: "Des supports simples pour preparer une consultation assureur et comprendre les garanties.",
    cards: guides.map((guide) => `<article class="content-card"><h3><a href="/${guide.slug}.html">${esc(guide.title)}</a></h3><p>${esc(guide.description)}</p></article>`)
  }));
  write("devis-assurance-immeuble", simplePage("devis-assurance-immeuble", "Devis assurance immeuble", "Demander un devis assurance immeuble, copropriete, PNO ou SCI avec ImmeubleAssur.", `<p>Remplissez le formulaire pour qualifier votre besoin. Nous revenons vers vous pour les pieces manquantes et la consultation assureur.</p>${leadForm({ need: "multirisque-immeuble" })}`));
  write("faq", faqPage());
  write("contact", contactPage());
  write("merci", simplePage("merci", "Votre demande est enregistree", "Confirmation demande ImmeubleAssur.", `<p>Un conseiller ImmeubleAssur vous rappelle rapidement pour qualifier le risque et preparer la suite.</p><p><a class="button primary" href="/">Retour accueil</a></p>`));
  write("confidentialite", simplePage("confidentialite", "Politique de confidentialite", "Politique de confidentialite ImmeubleAssur.", `<p>Les donnees transmises via le formulaire sont utilisees pour qualifier la demande d'assurance immeuble, recontacter le demandeur et suivre le dossier commercial.</p><ul><li>Donnees formulaire: identite, coordonnees, profil, ville, type de bien, besoin et message.</li><li>Evenements de navigation: pages vues, clics CTA, demarrage et envoi de formulaire, sans revente publicitaire.</li><li>Conservation: duree limitee aux besoins de traitement commercial, suivi du dossier et amelioration du service.</li><li>Contact: ${EMAIL}.</li></ul>`));
  write("mentions-legales", simplePage("mentions-legales", "Mentions legales", "Mentions legales ImmeubleAssur.", `<p>ImmeubleAssur est une marque specialisee assurance immeuble. Les informations du site sont indicatives et ne remplacent pas l'analyse contractuelle d'un dossier.</p><p>Contact: ${EMAIL}. ORIAS: ${ORIAS}.</p>`));
  write("admin", adminPage());
  const urls = [
    "",
    ...servicePages.map((p) => pagePath(p.slug)),
    ...cities.map(([slug]) => pagePath(`assurance-immeuble-${slug}`)),
    "blog.html",
    ...articles.map((a) => `blog/${a.slug}.html`),
    "guides.html",
    ...guides.map((g) => pagePath(g.slug)),
    "villes.html",
    "devis-assurance-immeuble.html",
    "faq.html",
    "contact.html",
    "confidentialite.html",
    "mentions-legales.html"
  ];
  writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${SITE}/${url}</loc><changefreq>weekly</changefreq><priority>${url === "" ? "1.0" : "0.8"}</priority></url>`).join("\n")}\n</urlset>\n`, "utf8");
  writeFileSync(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`, "utf8");
}

writeStatic();
console.log(`Generated ${servicePages.length + cities.length + articles.length + guides.length + 9} public pages.`);
