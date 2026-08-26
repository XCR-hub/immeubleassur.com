import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const SITE = "https://immeubleassur.com";
const START = "<!-- seo-angle-differentiation:start -->";
const END = "<!-- seo-angle-differentiation:end -->";

const profiles = {
  "news/veille-assurance-immeuble-2026-07-28": {
    indexable: false,
    title: "Archive veille immeuble 28 juillet 2026",
    h1: "Archive du 28 juillet 2026: signaux assurance immeuble a relire.",
    description: "Archive courte de veille assurance immeuble du 28 juillet 2026: signaux contrats, syndic, PNO CNO et sinistres a relier a la veille permanente.",
    eyebrow: "Archive de veille",
    angle: "Conserver le contexte sans concurrencer la veille permanente.",
    body: "Cette archive sert a retrouver un signal date. Elle ne vise pas la requete principale de veille assurance immeuble: cette intention reste portee par la page permanente et le dernier numero.",
    bullets: ["Date precise: 28 juillet 2026.", "Role: historique consultable, non page money.", "Suite: page veille permanente ou newsletter."],
    links: [["/veille-assurance-immeuble", "Veille permanente"], ["/newsletter-assurance-immeuble", "Recevoir la veille"]]
  },
  "news/veille-assurance-immeuble-2026-07-29": {
    title: "Veille immeuble 29 juillet 2026: dernier signal",
    h1: "Veille assurance immeuble du 29 juillet 2026.",
    description: "Dernier point de veille assurance immeuble du 29 juillet 2026: signaux utiles pour syndic, PNO CNO, SCI, sinistres et renouvellement.",
    eyebrow: "Dernier numero",
    angle: "Distinguer le dernier numero de l'archive.",
    body: "Cette page concentre le signal du jour et renvoie vers la veille permanente quand le lecteur veut suivre les themes dans la duree.",
    bullets: ["Date precise: 29 juillet 2026.", "Role: dernier numero indexable.", "Suite: abonnement ou audit si une echeance approche."],
    links: [["/veille-assurance-immeuble", "Suivre la veille"], ["/newsletter-assurance-immeuble", "S'abonner"]]
  },
  "assurance-pno": {
    title: "Assurance PNO bailleur : logement loue ou vacant",
    h1: "Assurance PNO bailleur : protéger un logement loué ou vacant.",
    description: "Assurance PNO pour bailleur, maison ou logement hors copropriete: dommages au bien, responsabilite, vacance locative, SCI et devis.",
    eyebrow: "Angle PNO bailleur",
    angle: "Proteger le patrimoine du proprietaire non occupant.",
    body: "La page PNO part du bien du bailleur, notamment maison ou logement hors copropriete. Elle traite les dommages au bien, la responsabilite du proprietaire, les periodes sans locataire et les garanties qui continuent entre deux occupations.",
    bullets: ["Maison ou logement loue hors copropriete.", "Vacance entre deux locataires et maintien des garanties.", "Dommages au bien, recours et responsabilite du bailleur.", "SCI ou proprietaire souhaitant proteger son patrimoine."],
    links: [["/assurance-pno-cno", "Comparer PNO et CNO"], ["/devis-pno-cno?intent=pno", "Devis PNO"]],
    serviceType: "Assurance PNO pour proprietaire bailleur",
    audiences: ["Bailleurs", "SCI", "Proprietaires non occupants"]
  },  "assurance-cno": {
    title: "Assurance CNO lot vacant ou loue en copropriete",
    h1: "Assurance CNO: couvrir le lot du coproprietaire non occupant.",
    description: "Assurance CNO pour lot en copropriete vacant ou loue: responsabilite du coproprietaire, contrat immeuble, occupant et devis specialise.",
    eyebrow: "Angle CNO",
    angle: "Isoler le cas du coproprietaire non occupant.",
    body: "La page CNO traite le lot privatif en copropriete. Elle aide a verifier ce qui reste au coproprietaire quand le contrat immeuble et l'assurance occupant ne suffisent pas.",
    bullets: ["Lot privatif vacant, loue ou occupe gratuitement.", "Responsabilite civile du coproprietaire non occupant.", "Coherence entre contrat immeuble, occupant et CNO."],
    links: [["/assurance-pno-cno", "Comparer PNO CNO"], ["/devis-pno-cno", "Devis CNO"]],
    serviceType: "Assurance CNO pour coproprietaire non occupant",
    audiences: ["Coproprietaires non occupants", "Bailleurs", "SCI"]
  },
  "assurance-coproprietaire-non-occupant": {
    indexable: false,
    title: "Coproprietaire non occupant: page consolidee CNO",
    h1: "Coproprietaire non occupant: continuer vers l'assurance CNO.",
    description: "Page de consolidation pour coproprietaire non occupant: l'intention principale est traitee sur assurance CNO avec devis specialise.",
    eyebrow: "Consolidation CNO",
    angle: "Eviter deux pages concurrentes sur la meme intention.",
    body: "Cette page conserve le parcours utilisateur mais ne concurrence plus la page CNO principale dans l'index. Le visiteur est oriente vers la ressource la plus complete.",
    bullets: ["Intention identique a assurance CNO.", "Conservation des liens et de l'experience utilisateur.", "Indexation concentree sur la page principale."],
    links: [["/assurance-cno", "Page principale CNO"], ["/devis-pno-cno", "Devis CNO"]]
  },  "devis-pno-cno": {
    title: "Devis PNO CNO: qualifier un lot avant rappel",
    h1: "Demander un devis PNO/CNO avec un dossier exploitable.",
    description: "Formulaire de devis PNO CNO: statut du lot, occupation, vacance, contrat immeuble, sinistres et rappel specialise ImmeubleAssur.",
    eyebrow: "Angle formulaire",
    angle: "Separer la conversion du contenu explicatif.",
    body: "Cette page transforme une recherche prete a agir en dossier qualifie. Elle privilegie les champs utiles au rappel, pas l'explication complete du contrat.",
    bullets: ["Statut du demandeur et du lot.", "Occupation, vacance et sinistres.", "Rappel oriente devis plutot que lecture de guide."],
    links: [["/assurance-cno", "Comprendre CNO"], ["/assurance-pno-cno", "Comparer PNO CNO"]]
  },
  "blog/assurance-immeuble-sans-sinistre": {
    title: "Immeuble sans sinistre: valoriser un bon historique",
    h1: "Immeuble sans sinistre: comment valoriser le dossier assureur.",
    description: "Guide pour presenter un immeuble sans sinistre: historique propre, prevention, entretien, documents et argumentaire avant renouvellement.",
    eyebrow: "Dossier favorable",
    angle: "Valoriser la prevention et la stabilite.",
    body: "Cette page s'adresse aux bailleurs qui veulent utiliser un historique propre pour obtenir une lecture plus favorable du risque.",
    bullets: ["Historique 36 mois sans sinistre.", "Preuves d'entretien et prevention.", "Argumentaire avant renouvellement."],
    links: [["/blog/sinistres-recurrents-immeuble", "Cas inverse: sinistres recurrents"], ["/devis-assurance-immeuble", "Devis immeuble"]]
  },
  "blog/sinistres-recurrents-immeuble": {
    title: "Sinistres recurrents immeuble: redresser le dossier",
    h1: "Sinistres recurrents dans un immeuble: reconstruire un dossier credible.",
    description: "Guide sinistres recurrents immeuble: causes, mesures correctives, historique, franchises et presentation du dossier a l'assureur.",
    eyebrow: "Dossier sensible",
    angle: "Prouver les corrections avant consultation.",
    body: "Cette page traite les immeubles qui ont deja un historique complique. L'objectif est de documenter les causes, les corrections et le risque restant.",
    bullets: ["Causes et recurrence des sinistres.", "Mesures correctives prouvables.", "Consultation assureur avec historique prepare."],
    links: [["/gestion-sinistres-immeuble", "Gestion sinistres"], ["/audit-contrat-assurance-immeuble", "Audit contrat"]]
  },
  "assurance-immeuble-resilie": {
    title: "Assurance immeuble resilie: retrouver une solution",
    h1: "Assurance immeuble resiliee: refaire accepter le dossier.",
    description: "Assurance immeuble resiliee ou refusee: causes de resiliation, pieces a reunir, correctifs et consultation assureur specialisee.",
    eyebrow: "Apres resiliation",
    angle: "Traiter la rupture de contrat.",
    body: "Cette page traite la rupture de contrat: preavis, courrier assureur, date d'effet, continuite de couverture et remplacement. Le sujet central est le plan de sauvetage avant interruption, pas l'analyse technique d'un sinistre isole.",
    bullets: ["Preavis, courrier assureur et date d'effet.", "Solution de remplacement avant rupture.", "Argumentaire pour assureur accepteur."],
    links: [["/assurance-immeuble-sinistre", "Immeuble avec sinistres"], ["/gestion-sinistres-immeuble", "Page primaire sinistres"]]
  },
  "assurance-immeuble-sinistre": {
    title: "Assurance immeuble avec sinistres: dossier a defendre",
    h1: "Assurance immeuble avec sinistres: presenter les causes et correctifs.",
    description: "Assurance immeuble avec sinistres: historique, causes, recurrence, franchises, mesures correctives et demande de devis specialisee.",
    eyebrow: "Avec sinistres",
    angle: "Expliquer l'historique sans partir de la resiliation.",
    body: "Cette page analyse le sinistre lui-meme: degat des eaux, incendie, recherche de fuite, montant indemnise, recurrence et prevention. Le contrat peut encore etre actif: le travail consiste a rendre l'historique defendable.",
    bullets: ["Type de sinistre, montant et indemnisation.", "Recherche de fuite, incendie ou recurrence.", "Prevention et preuves apres travaux correctifs."],
    links: [["/assurance-immeuble-resilie", "Cas resilie"], ["/devis-assurance-immeuble?intent=sinistre", "Devis dossier sinistre"]]
  },
  "blog/multirisque-immeuble-vs-pno": {
    title: "Multirisque immeuble vs PNO: qui couvre quoi",
    h1: "Multirisque immeuble ou PNO: separer batiment, lot et occupant.",
    description: "Comparatif multirisque immeuble vs PNO: batiment, parties communes, lot privatif, occupant, bailleur et zones de doublon.",
    eyebrow: "Comparaison contrats",
    angle: "Comparer deux familles de contrats.",
    body: "Cette page clarifie la frontiere entre contrat immeuble et PNO. Elle sert aux lecteurs qui hesitent entre deux natures de couverture.",
    bullets: ["Batiment et parties communes.", "Lot privatif et responsabilite bailleur.", "Zones de doublon ou de trou de garantie."],
    links: [["/assurance-pno-cno", "Comparer PNO CNO"], ["/multirisque-immeuble", "Multirisque immeuble"]]
  },
  "blog/pno-obligatoire-copropriete": {
    title: "PNO obligatoire en copropriete: cas reels",
    h1: "PNO obligatoire en copropriete: quand le coproprietaire doit agir.",
    description: "PNO obligatoire en copropriete: responsabilite civile, lot vacant ou loue, syndic, assurance occupant et verification du contrat immeuble.",
    eyebrow: "Obligation PNO",
    angle: "Traiter l'obligation et non la comparaison.",
    body: "Cette page repond a la question de l'obligation. Elle se concentre sur les cas ou le coproprietaire doit verifier sa responsabilite, sans refaire le comparatif PNO/CNO.",
    bullets: ["Responsabilite civile du coproprietaire.", "Lot vacant, loue ou occupe gratuitement.", "Controle du contrat immeuble et occupant."],
    links: [["/blog/multirisque-immeuble-vs-pno", "Comparer PNO et multirisque"], ["/devis-pno-cno", "Devis PNO CNO"]]
  },
  "assurance-batiment-proprietaire": {
    title: "Assurance batiment proprietaire: murs et locaux",
    h1: "Assurance batiment proprietaire: proteger les murs, locaux et dependances.",
    description: "Assurance batiment proprietaire pour murs, locaux, dependances, SCI ou bailleur: garanties batiment, RC et audit contrat.",
    eyebrow: "Murs et locaux",
    angle: "Centrer la page sur le batiment possede.",
    body: "Cette page traite la protection des murs et dependances d'un proprietaire. Elle n'est pas limitee a la monopropriete familiale.",
    bullets: ["Murs, locaux et dependances.", "RC proprietaire et garanties batiment.", "SCI, bailleur ou proprietaire professionnel."],
    links: [["/assurance-immeuble-monopropriete", "Monopropriete"], ["/assurance-sci", "Assurance SCI"]]
  },
  "assurance-immeuble-monopropriete": {
    title: "Assurance immeuble en monopropriete familiale",
    h1: "Assurance monopropriete: un seul proprietaire, plusieurs responsabilites.",
    description: "Assurance immeuble en monopropriete: proprietaire unique, SCI familiale, lots loues, parties communes internes et devis specialise.",
    eyebrow: "Monopropriete",
    angle: "Distinguer le statut de detention.",
    body: "Cette page cible l'immeuble detenu par un seul proprietaire ou une SCI familiale. Elle organise les garanties autour de la detention unique.",
    bullets: ["Un proprietaire ou une SCI familiale.", "Lots loues, vacants ou mixtes.", "Parties communes internes a organiser."],
    links: [["/assurance-batiment-proprietaire", "Murs et locaux"], ["/assurance-sci", "SCI"]]
  },
  "blog/assurance-copropriete-avant-ag": {
    title: "Assurance copropriete avant AG: points a voter",
    h1: "Avant l'AG de copropriete: verifier les sujets assurance a voter.",
    description: "Assurance copropriete avant assemblee generale: ordre du jour, resolutions, budget, travaux, contrat immeuble et questions au syndic.",
    eyebrow: "Avant AG",
    angle: "Preparer les votes et questions d'assemblee generale.",
    body: "Cette page sert au conseil syndical avant l'AG: ordre du jour, resolutions, budget assurance, travaux votes et questions a poser au syndic professionnel.",
    bullets: ["Ordre du jour et resolutions.", "Budget assurance et appel de fonds.", "Questions au syndic avant vote."],
    links: [["/blog/copropriete-petite-syndic-benevole", "Cas syndic benevole"], ["/assurance-copropriete", "Assurance copropriete"]]
  },
  "blog/copropriete-petite-syndic-benevole": {
    title: "Petite copropriete: assurance du syndic benevole",
    h1: "Petite copropriete avec syndic benevole: tenir le contrat au quotidien.",
    description: "Petite copropriete et syndic benevole: responsabilite, declarations, registre, sinistres, contrat immeuble et documents a conserver.",
    eyebrow: "Syndic benevole",
    angle: "Gerer le contrat hors assemblee generale annuelle.",
    body: "Cette page accompagne le syndic benevole dans la gestion quotidienne: registre, declaration de sinistre, documents conserves, attestations et relation avec les coproprietaires.",
    bullets: ["Mandat et responsabilite du syndic benevole.", "Registre, attestations et declarations.", "Gestion quotidienne des sinistres."],
    links: [["/blog/assurance-copropriete-avant-ag", "Avant AG"], ["/assurance-immeuble-syndic-benevole", "Service syndic benevole"]]
  },  "blog/dommages-ouvrage-copropriete-travaux": {
    title: "Dommages ouvrage copropriete: travaux votes",
    h1: "Dommages ouvrage en copropriete: securiser des travaux votes.",
    description: "Guide dommages ouvrage copropriete: travaux votes, syndic, entreprises, reception, garanties et documents a reunir.",
    eyebrow: "Dommages ouvrage",
    angle: "Se concentrer sur l'assurance chantier.",
    body: "Cette page traite la garantie dommages ouvrage et les documents de chantier. Elle ne couvre pas l'ensemble de la renovation energetique.",
    bullets: ["Travaux votes et reception.", "Syndic, entreprises et attestations.", "Garantie dommages ouvrage et delais."],
    links: [["/blog/renovation-energetique-copropriete-assurance", "Renovation energetique"], ["/dommages-ouvrage-immeuble", "Page dommages ouvrage"]]
  },
  "blog/renovation-energetique-copropriete-assurance": {
    title: "Renovation energetique copropriete: impact assurance",
    h1: "Renovation energetique en copropriete: anticiper l'impact assurance.",
    description: "Renovation energetique copropriete: isolation, toiture, facade, chantier, AG, contrat immeuble et garanties a verifier.",
    eyebrow: "Renovation energetique",
    angle: "Traiter l'impact du projet sur le contrat immeuble.",
    body: "Cette page s'interesse aux consequences assurance d'un projet energetique: modification du risque, documents d'AG et garanties a relire.",
    bullets: ["Isolation, facade, toiture ou equipements.", "Impact sur contrat immeuble existant.", "Documents AG et declaration assureur."],
    links: [["/blog/dommages-ouvrage-copropriete-travaux", "Dommages ouvrage"], ["/assurance-copropriete", "Assurance copropriete"]]
  },
  "blog/cno-coproprietaire-non-occupant-obligatoire": {
    title: "CNO coproprietaire non occupant: obligation RC",
    h1: "CNO obligatoire: verifier la responsabilite civile du coproprietaire.",
    description: "CNO coproprietaire non occupant obligatoire: responsabilite civile, lot vacant ou loue, syndic et articulation avec PNO.",
    eyebrow: "Obligation CNO",
    angle: "Repondre a l'obligation precise.",
    body: "Cette page traite l'obligation de responsabilite civile du coproprietaire non occupant et les preuves a verifier avec le syndic.",
    bullets: ["Responsabilite civile obligatoire.", "Lot en copropriete loue ou vacant.", "Preuves et contrat immeuble a demander."],
    links: [["/blog/pno-cno-differences-garanties", "Comparer PNO et CNO"], ["/assurance-cno", "Assurance CNO"]]
  },
  "blog/pno-cno-differences-garanties": {
    title: "PNO ou CNO: differences de garanties",
    h1: "PNO ou CNO: comprendre les differences de garanties.",
    description: "PNO ou CNO: differences entre proprietaire non occupant et coproprietaire non occupant, garanties, vacance et contrat immeuble.",
    eyebrow: "Comparatif PNO CNO",
    angle: "Comparer les deux notions avant devis.",
    body: "Cette page aide le lecteur a choisir le bon vocabulaire et le bon parcours avant de remplir un devis. Elle ne se limite pas a l'obligation.",
    bullets: ["PNO proprietaire non occupant.", "CNO coproprietaire non occupant.", "Garanties, vacance et contrat immeuble."],
    links: [["/blog/cno-coproprietaire-non-occupant-obligatoire", "Obligation CNO"], ["/devis-pno-cno", "Devis PNO CNO"]]
  },
  "blog/assurance-immeuble-apres-refus-assureur": {
    title: "Refus assureur immeuble: preparer une relance",
    h1: "Apres un refus assureur: retravailler le dossier immeuble.",
    description: "Refus assureur immeuble: causes possibles, pieces correctives, historique sinistres, prevention et relance de consultation.",
    eyebrow: "Apres refus",
    angle: "Traiter le refus ponctuel avant resiliation.",
    body: "Cette page aide a comprendre pourquoi un assureur refuse un dossier et quelles preuves peuvent relancer une consultation.",
    bullets: ["Motif du refus et pieces manquantes.", "Mesures correctives et prevention.", "Nouvelle consultation mieux cadree."],
    links: [["/blog/resiliation-assurance-immeuble", "Cas resiliation"], ["/audit-contrat-assurance-immeuble", "Audit contrat"]]
  },
  "blog/resiliation-assurance-immeuble": {
    title: "Resiliation assurance immeuble: plan de remplacement",
    h1: "Resiliation assurance immeuble: organiser le remplacement du contrat.",
    description: "Resiliation assurance immeuble: echeance, motif, historique sinistres, correctifs, pieces et consultation assureur specialisee.",
    eyebrow: "Contrat resilie",
    angle: "Gerer l'urgence de remplacement.",
    body: "Cette page traite l'organisation concrete apres resiliation: calendrier, justificatifs, priorites et recherche d'une solution acceptable.",
    bullets: ["Date d'effet et motif de resiliation.", "Historique et correctifs.", "Plan de remplacement avant rupture."],
    links: [["/blog/assurance-immeuble-apres-refus-assureur", "Apres refus"], ["/assurance-immeuble-resilie", "Service resilie"]]
  },
  "blog/checklist-sinistre-degat-des-eaux": {
    title: "Checklist degat des eaux immeuble: preuves utiles",
    h1: "Degat des eaux immeuble: checklist des preuves a reunir.",
    description: "Checklist degat des eaux immeuble: recherche de fuite, photos, declarations, factures, mesures correctives et lecture franchise.",
    eyebrow: "Checklist sinistre",
    angle: "Reunir les preuves d'un sinistre precis.",
    body: "Cette page donne une liste d'actions apres degat des eaux. Elle ne traite pas l'historique global de sinistres recurrents.",
    bullets: ["Recherche de fuite et photos.", "Declarations, factures et devis.", "Mesures correctives documentees."],
    links: [["/blog/sinistres-recurrents-immeuble", "Sinistres recurrents"], ["/gestion-sinistres-immeuble", "Gestion sinistres"]]
  }
};

const frenchMonths = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

function newsDateParts(slug) {
  const match = String(slug).match(/^news\/veille-assurance-immeuble-(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return { year, month, day, human: `${Number(day)} ${frenchMonths[Number(month) - 1]} ${year}` };
}

function buildNewsWatchProfiles() {
  const newsDir = join(PUBLIC_DIR, "news");
  if (!existsSync(newsDir)) return {};
  const slugs = readdirSync(newsDir)
    .filter((name) => /^veille-assurance-immeuble-\d{4}-\d{2}-\d{2}\.html$/.test(name))
    .map((name) => `news/${name.replace(/\.html$/, "")}`)
    .sort();
  const latest = slugs[slugs.length - 1];
  return Object.fromEntries(slugs.map((slug) => {
    const date = newsDateParts(slug);
    if (!date) return [slug, null];
    const isLatest = slug === latest;
    const commonLinks = [["/veille-assurance-immeuble", "Veille permanente"], ["/newsletter-assurance-immeuble", "Recevoir la veille"]];
    if (isLatest) {
      return [slug, {
        title: `Veille immeuble ${date.human}: dernier signal`,
        h1: `Veille assurance immeuble du ${date.human}.`,
        description: `Dernier point de veille assurance immeuble du ${date.human}: signaux utiles pour syndic, PNO CNO, SCI, sinistres et renouvellement.`,
        eyebrow: "Dernier numero",
        angle: "Distinguer le dernier numero de la veille permanente.",
        body: "Cette page concentre le signal date le plus recent et renvoie vers la veille permanente quand le lecteur veut suivre les themes dans la duree.",
        bullets: [`Date precise: ${date.human}.`, "Role: dernier numero indexable.", "Suite: abonnement ou audit si une echeance approche."],
        links: commonLinks
      }];
    }
    return [slug, {
      indexable: false,
      title: `Archive veille immeuble ${date.human}`,
      h1: `Archive du ${date.human}: signaux assurance immeuble a relire.`,
      description: `Archive courte de veille assurance immeuble du ${date.human}: signaux contrats, syndic, PNO CNO et sinistres a relier a la veille permanente.`,
      eyebrow: "Archive de veille",
      angle: "Conserver le contexte sans concurrencer la veille permanente.",
      body: "Cette archive sert a retrouver un signal date. Elle ne vise pas la requete principale de veille assurance immeuble: cette intention reste portee par la page permanente et le dernier numero.",
      bullets: [`Date precise: ${date.human}.`, "Role: historique consultable, non page money.", "Suite: page veille permanente ou newsletter."],
      links: commonLinks
    }];
  }).filter(([, profile]) => profile));
}

const newsWatchProfiles = buildNewsWatchProfiles();
Object.assign(profiles, newsWatchProfiles);

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileForSlug(slug) {
  return join(PUBLIC_DIR, `${slug}.html`);
}

function urlForSlug(slug) {
  return `${SITE}/${slug}`;
}

function replaceFirst(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function setMeta(html, selector, content) {
  const escaped = esc(content);
  const pattern = new RegExp(`(<meta ${selector} content=")[^"]*(" \\/>)`, "i");
  return pattern.test(html) ? html.replace(pattern, `$1${escaped}$2`) : html;
}

function setHead(html, slug, profile) {
  const brandedTitle = `${profile.title} | ImmeubleAssur`;
  const canonicalUrl = profile.canonical ? `${SITE}${profile.canonical}` : urlForSlug(slug);
  let next = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(brandedTitle)}</title>`);
  next = setMeta(next, 'name="description"', profile.description);
  next = setMeta(next, 'property="og:title"', brandedTitle);
  next = setMeta(next, 'property="og:description"', profile.description);
  next = setMeta(next, 'name="twitter:title"', profile.title);
  next = setMeta(next, 'name="twitter:description"', profile.description);
  if (profile.indexable === false) {
    if (/<meta name="robots" content="[^"]*" \/>/i.test(next)) {
      next = next.replace(/<meta name="robots" content="[^"]*" \/>/i, '<meta name="robots" content="noindex, follow" />');
    } else {
      next = next.replace(/<meta name="description"/i, '<meta name="robots" content="noindex, follow" /><meta name="description"');
    }
  } else {
    next = next.replace(/<meta name="robots" content="noindex, follow" \/>/i, "");
  }
  if (/<link rel="canonical" href="[^"]*" \/>/i.test(next)) {
    next = next.replace(/<link rel="canonical" href="[^"]*" \/>/i, `<link rel="canonical" href="${canonicalUrl}" />`);
  } else {
    next = next.replace(/<title>[\s\S]*?<\/title>/i, `<link rel="canonical" href="${canonicalUrl}" />\n<title>${esc(brandedTitle)}</title>`);
  }
  return next;
}

function alignStructuredData(html, slug, profile) {
  const url = urlForSlug(slug);
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, source) => {
    try {
      const data = JSON.parse(source);
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        if (node["@id"] === `${url}#webpage`) {
          node.name = profile.title;
          node.headline = profile.title;
          node.description = profile.description;
        }
        const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
        if (node["@id"] === `${url}#service` || types.includes("Service")) {
          node.name = profile.title;
          node.description = profile.description;
          node.serviceType = profile.serviceType || profile.title;
          if (profile.audiences) node.audience = profile.audiences.map((audienceType) => ({ "@type": "Audience", audienceType }));
        }
        Object.values(node).forEach(visit);
      };
      visit(data);
      return `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`;
    } catch {
      return whole;
    }
  });
}
function setHero(html, profile) {
  let next = replaceFirst(html, /<h1([^>]*)>[\s\S]*?<\/h1>/i, `<h1$1>${esc(profile.h1)}</h1>`);
  next = replaceFirst(next, /(<h1[^>]*>[\s\S]*?<\/h1>\s*)<p>[\s\S]*?<\/p>/i, `$1<p>${esc(profile.description)}</p>`);
  return next;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeBlock(html) {
  return html.replace(new RegExp(`\\s*${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\s*`, "g"), "\n");
}

function blockFor(slug, profile) {
  const links = (profile.links || []).map(([href, label]) => `<a href="${esc(href)}">${esc(label)}</a>`).join("");
  const bullets = (profile.bullets || []).map((item) => `<li>${esc(item)}</li>`).join("");
  return `${START}
<section class="band seo-opportunity-expansion angle-differentiation" aria-label="Angle editorial de ${esc(profile.title)}">
  <div class="seo-opportunity-grid">
    <div class="seo-opportunity-copy">
      <p class="eyebrow dark">${esc(profile.eyebrow)}</p>
      <h2>${esc(profile.angle)}</h2>
      <p class="large-copy">${esc(profile.body)}</p>
      <ul class="check-list">${bullets}</ul>
    </div>
    <div class="seo-opportunity-side">
      <div class="seo-link-panel">
        <strong>Parcours distinct</strong>
        ${links}
      </div>
      <p class="seo-expansion-note">Angle SEO protege pour ${esc(slug.replace(/[/-]+/g, " "))}.</p>
    </div>
  </div>
</section>
${END}`;
}

function insertBlock(html, block) {
  if (html.includes("<!-- seo-intent-differentiation:start -->")) {
    return html.replace(/\s*<!-- seo-intent-differentiation:start -->/i, `\n${block}\n<!-- seo-intent-differentiation:start -->`);
  }
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function applyProfile(slug, profile) {
  const file = fileForSlug(slug);
  if (!existsSync(file)) return { slug, changed: false, missing: true };
  const original = readFileSync(file, "utf8");
  let html = removeBlock(original);
  html = setHead(html, slug, profile);
  html = setHero(html, profile);
  html = alignStructuredData(html, slug, profile);
  html = insertBlock(html, blockFor(slug, profile));
  const changed = html !== original;
  if (changed) writeFileSync(file, html, "utf8");
  return {
    slug,
    url: urlForSlug(slug),
    changed,
    indexable: profile.indexable !== false,
    title: profile.title,
    h1: profile.h1
  };
}

function sitemapEntryIsIndexable(url) {
  const path = String(url || "").replace(`${SITE}/`, "");
  const file = path ? join(PUBLIC_DIR, `${path}.html`) : join(PUBLIC_DIR, "index.html");
  if (!existsSync(file)) return false;
  const html = readFileSync(file, "utf8");
  return !/<meta name="robots" content="[^"]*noindex/i.test(html);
}

function removeNoIndexFromSitemap(pages) {
  const sitemapFile = join(PUBLIC_DIR, "sitemap.xml");
  if (!existsSync(sitemapFile)) return { changed: false, removed: 0 };
  let xml = readFileSync(sitemapFile, "utf8");
  let removed = 0;
  for (const page of pages.filter((item) => item.indexable === false)) {
    const url = escapeRegExp(page.url);
    const next = xml.replace(new RegExp(`\\s*<url>\\s*<loc>${url}<\\/loc>[\\s\\S]*?<\\/url>`, "g"), () => {
      removed += 1;
      return "";
    });
    xml = next;
  }
  xml = xml.replace(/\s*<url>[\s\S]*?<\/url>/g, (block) => {
    const loc = (block.match(/<loc>(.*?)<\/loc>/) || [])[1] || "";
    if (sitemapEntryIsIndexable(loc)) return block;
    removed += 1;
    return "";
  });
  if (removed) writeFileSync(sitemapFile, xml.trim() + "\n", "utf8");
  return { changed: removed > 0, removed };
}

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });
mkdirSync(dirname(join(REPORT_DIR, "seo-angle-differentiation-report.json")), { recursive: true });

const pages = Object.entries(profiles).map(([slug, profile]) => applyProfile(slug, profile));
const sitemap = removeNoIndexFromSitemap(pages);
const changedPages = pages.filter((page) => page.changed);
const output = {
  generated_at: new Date().toISOString(),
  status: "passed",
  pages_targeted: pages.length,
  pages_changed: changedPages.length,
  noindex_pages: pages.filter((page) => page.indexable === false).length,
  news_watch_pages: pages.filter((page) => page.slug.startsWith("news/veille-assurance-immeuble-")).length,
  news_watch_latest_slug: pages.find((page) => page.slug.startsWith("news/veille-assurance-immeuble-") && page.indexable !== false)?.slug || "",
  news_archive_noindex_count: pages.filter((page) => page.slug.startsWith("news/veille-assurance-immeuble-") && page.indexable === false).length,
  sitemap_entries_removed: sitemap.removed,
  safeguards: ["visible-content-only", "title-h1-meta-differentiation", "no-hidden-keyword-blocks", "no-google-scraping", "noindex-only-for-duplicate-archive", "dynamic-news-archive-consolidation"],
  pages
};

writeFileSync(join(REPORT_DIR, "seo-angle-differentiation-report.json"), JSON.stringify(output, null, 2), "utf8");
writeFileSync(join(PUBLIC_DIR, "assets", "seo-angle-differentiation-latest.json"), JSON.stringify({
  generated_at: output.generated_at,
  status: output.status,
  pages_targeted: output.pages_targeted,
  pages_changed: output.pages_changed,
  noindex_pages: output.noindex_pages,
  sitemap_entries_removed: output.sitemap_entries_removed,
  news_watch_pages: output.news_watch_pages,
  news_watch_latest_slug: output.news_watch_latest_slug,
  news_archive_noindex_count: output.news_archive_noindex_count,
  safeguards: output.safeguards,
  pages: output.pages
}, null, 2), "utf8");

console.log(`SEO angle differentiation updated ${output.pages_changed} page(s), noindex=${output.noindex_pages}, sitemap_removed=${output.sitemap_entries_removed}.`);
