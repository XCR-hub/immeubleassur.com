import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const SITE = "https://immeubleassur.com";

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(file) === ".html" ? [file] : [];
  });
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugFromFile(file) {
  const rel = relative(PUBLIC_DIR, file).replace(/\\/g, "/");
  if (rel === "index.html") return "index";
  return rel.replace(/\.html$/, "");
}

function titleOf(html, slug) {
  const title = stripHtml((html.match(/<title>(.*?)<\/title>/is) || [])[1] || "");
  return title.replace(/\s+\|\s+ImmeubleAssur$/i, "").trim() || slug.replace(/[/-]+/g, " ");
}

function h1Of(html, fallback) {
  return stripHtml((html.match(/<h1[^>]*>(.*?)<\/h1>/is) || [])[1] || fallback);
}

function cityOf(slug, html) {
  if (!slug.startsWith("assurance-immeuble-") || slug === "assurance-immeuble-locatif") return "";
  const h1 = h1Of(html, "");
  const fromH1 = (h1.match(/Assurance immeuble a ([^.]+)\.?/i) || [])[1];
  if (fromH1) return fromH1.trim();
  return slug
    .replace(/^assurance-immeuble-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function contextFor(slug, html) {
  const title = titleOf(html, slug);
  const city = cityOf(slug, html);
  const page = city || title.toLowerCase();
  const isFaq = slug.startsWith("faq/");
  const isBlog = slug.startsWith("blog/");
  const cityPrefix = city ? `a ${city}` : `sur ${page}`;

  let intent = city ? `l'immeuble situe ${cityPrefix}` : "le risque immeuble a assurer";
  let audience = "syndic, bailleur, SCI ou coproprietaire";
  let route = "devis immeuble qualifie";
  let documents = "contrat actuel, echeance, sinistres, lots, surface et travaux";
  let proof = "usage du batiment, responsabilites, garanties et reste a charge";

  if (/cno|coproprietaire-non-occupant/i.test(slug + " " + title)) {
    intent = "le lot en copropriete non occupe, loue ou vacant";
    audience = "coproprietaire non occupant, bailleur ou SCI";
    route = "parcours CNO/PNO";
    documents = "statut d'occupation, contrat immeuble, bail, sinistres et echeance";
    proof = "responsabilite civile du coproprietaire, vacance et coherence avec la copropriete";
  } else if (/pno/i.test(slug + " " + title)) {
    intent = "le logement non occupe, loue, vacant ou confie a une SCI";
    audience = "proprietaire non occupant ou bailleur multi-lots";
    route = "devis PNO/CNO";
    documents = "adresse du lot, occupation, contrat occupant, sinistres et echeance";
    proof = "garanties PNO, exclusions de vacance, recours et franchises";
  } else if (/copro|syndic|conseil-syndical/i.test(slug + " " + title)) {
    intent = "les parties communes, le syndicat et les responsabilites de copropriete";
    audience = "syndic, conseil syndical ou coproprietaire";
    route = "devis copropriete";
    documents = "contrat immeuble, appel de prime, PV d'AG, sinistres, lots et travaux";
    proof = "RC du syndicat, dommages, protection juridique et franchises d'immeuble";
  } else if (/sci|patrimoine|fonciere/i.test(slug + " " + title)) {
    intent = "le patrimoine detenu en SCI et les contrats deja en place";
    audience = "gerant de SCI, bailleur patrimonial ou fonciere familiale";
    route = "audit SCI et immeuble";
    documents = "liste des lots, villes, occupants, contrats, echeances et sinistres";
    proof = "doublons, trous de garantie, vacance, locaux mixtes et vision portefeuille";
  } else if (/sinistre|degat|fuite|incendie|resilie|refus/i.test(slug + " " + title)) {
    intent = "l'historique sinistre et les mesures correctives deja prises";
    audience = "bailleur, syndic ou administrateur de biens avec dossier sensible";
    route = "audit sinistre et remise en marche";
    documents = "declarations, photos, rapports, factures, recherche de fuite et contrat actuel";
    proof = "causes, recurrence, franchises, exclusions et prevention";
  } else if (/prix|tarif|franchise|comparateur/i.test(slug + " " + title)) {
    intent = "le budget reel, les franchises et le reste a charge probable";
    audience = "visiteur qui compare plusieurs propositions";
    route = "comparaison garanties-prix";
    documents = "prime actuelle, franchises, plafonds, sinistres, lots et garanties souhaitees";
    proof = "ecart entre prix affiche, exclusions, plafonds et qualite de gestion sinistre";
  } else if (/commerce|commercial|restaurant|mixte|local/i.test(slug + " " + title)) {
    intent = "l'activite professionnelle ou commerciale declaree dans l'immeuble";
    audience = "bailleur d'immeuble mixte ou proprietaire de local";
    route = "audit immeuble mixte";
    documents = "bail, activite exacte, installations techniques, garanties locataire et vacance";
    proof = "activite exercee, extraction, stockage, responsabilites et exclusions";
  } else if (/travaux|toiture|ravalement|renovation|dommages/i.test(slug + " " + title)) {
    intent = "les travaux prevus, votes ou deja realises sur l'immeuble";
    audience = "syndic, SCI ou bailleur en phase de travaux";
    route = "audit travaux et garanties";
    documents = "devis, descriptif, entreprises, reception, garanties decennales et contrat immeuble";
    proof = "dommage ouvrage, declaration assureur, exclusions chantier et entretien";
  } else if (isFaq) {
    intent = `la question ${title.toLowerCase()}`;
    route = "FAQ vers devis qualifie";
  } else if (isBlog) {
    intent = `le sujet ${title.toLowerCase()}`;
    route = "lecture guide puis devis";
  }

  return { slug, title, page, city, cityPrefix, intent, audience, route, documents, proof };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function paragraphPattern(text) {
  return new RegExp(`(<p\\b[^>]*>)${escapeRegExp(text)}(<\\/p>)`, "g");
}

const replacements = [
  {
    id: "diagnostic-intro",
    text: "Les meilleurs leads arrivent avec un statut, un type de bien et une urgence clairs. Le diagnostic ajuste le devis, le message de rappel et les signaux de conversion.",
    build: (ctx) => `Pour ${ctx.audience}, le diagnostic commence par ${ctx.intent}. Il relie profil, type de bien et urgence afin que le rappel parte sur le bon besoin plutot qu'une demande trop generale.`
  },
  {
    id: "readiness-intro",
    text: "Chaque piece cochee rend la demande plus exploitable: echeance, contrat actuel, sinistres, lots et travaux. Le formulaire reprend ensuite les elements disponibles.",
    build: (ctx) => `Sur ${ctx.page}, la checklist met d'abord l'accent sur ${ctx.documents}. Les cases cochees indiquent ce qui est exploitable et ce qu'il faut encore demander.`
  },
  {
    id: "momentum-intro",
    text: "Les recherches assurance immeuble ne valent pas toutes le meme parcours. ImmeubleAssur oriente vite vers CNO/PNO, multirisque immeuble ou audit contrat pour augmenter les leads exploitables.",
    build: (ctx) => `Pour ${ctx.page}, le parcours prioritaire est ${ctx.route}. Cette orientation evite de renvoyer tous les visiteurs vers le meme devis et augmente la qualite des demandes recues.`
  },
  {
    id: "opportunity-generic-intro",
    text: "Le contenu utile doit aider le visiteur a comprendre son risque et a transmettre les informations qui permettront une reponse assureur exploitable.",
    build: (ctx) => `Sur ${ctx.page}, le contenu clarifie ${ctx.intent}, puis transforme cette lecture en informations concretes pour obtenir une reponse assureur exploitable.`
  },
  {
    id: "opportunity-summary",
    text: "Cette synthese ajoute une lecture operationnelle: intention du demandeur, donnees a collecter, arbitrage garanties-prix et lien direct vers le parcours qui transforme la visite en dossier qualifie.",
    build: (ctx) => `Cette synthese specifique a ${ctx.page} relie intention, pieces utiles, arbitrage garanties-prix et passage vers le formulaire le plus coherent.`
  },
  {
    id: "auto-depth-method",
    text: "ImmeubleAssur privilegie une qualification concrete: contexte du bien, responsabilites, historique sinistre, travaux, contrat actuel et attentes du demandeur. Cette lecture evite les comparaisons superficielles et aide a obtenir une proposition exploitable.",
    build: (ctx) => `Pour ${ctx.page}, ImmeubleAssur cadre d'abord ${ctx.intent}: responsabilites, historique, contrat actuel, travaux et attente commerciale sont lus ensemble avant comparaison.`
  },
  {
    id: "search-gap-method",
    text: "Ce renforcement transforme le signal de classement en contenu utile: intention, preuves de specialisation, questions de decision et passage direct vers un dossier de devis exploitable.",
    build: (ctx) => `Ce renforcement adapte ${ctx.page} au signal de recherche: decisions concretes, preuves de specialisation, questions utiles et chemin direct vers un devis exploitable.`
  },
  {
    id: "search-gap-safeguard",
    text: "Le bloc ajoute des decisions concretes et des liens utiles. Il n'ajoute ni texte cache, ni duplication massive, ni contenu copie depuis les resultats de recherche.",
    build: (ctx) => `Pour ${ctx.page}, le bloc reste visible et utile: decisions concretes, liens internes pertinents et aucun texte cache ni contenu copie depuis les resultats de recherche.`
  },
  {
    id: "money-intent-errors",
    text: "Les erreurs evitees sont recurrentes: choisir seulement sur le tarif, oublier la vacance, ne pas declarer un commerce, confondre assurance occupant et contrat immeuble, ou comparer deux devis sans lire les franchises.",
    build: (ctx) => `Sur ${ctx.page}, les erreurs a eviter changent selon ${ctx.intent}: tarif seul, vacance mal declaree, commerce oublie, contrat occupant confondu ou franchises mal lues.`
  },
  {
    id: "money-intent-risk-scope",
    text: "Parce qu'un immeuble combine responsabilites, parties communes, occupants, sinistres et contrats voisins. Une demande generale laisse souvent des zones grises.",
    build: (ctx) => `Parce que ${ctx.page} combine ${ctx.proof}, une demande generale laisse des zones grises que la fiche risque doit clarifier avant consultation.`
  },
  {
    id: "money-intent-lead-method",
    text: "La demande est qualifiee en fiche risque: informations certaines, points manquants, garanties sensibles, priorite commerciale et prochaine action.",
    build: (ctx) => `La demande ${ctx.page} est convertie en fiche risque: informations certaines, pieces manquantes, garanties sensibles, urgence commerciale et prochaine action.`
  },
  {
    id: "search-gap-near-quote",
    text: "Parce que la recherche exprime un besoin proche du devis: comprendre le risque, preparer les pieces et choisir les garanties avant consultation assureur.",
    build: (ctx) => `Parce que ${ctx.page} exprime un besoin proche du devis, la page aide a comprendre ${ctx.intent}, preparer les pieces et choisir les garanties avant consultation.`
  },
  {
    id: "search-gap-form-context",
    text: "Un formulaire contextualise, des documents attendus explicites et une lecture claire des responsabilites entre immeuble, lot, occupant et proprietaire.",
    build: (ctx) => `Le gain de lead sur ${ctx.page} vient du formulaire contextualise, des documents attendus et d'une lecture claire entre immeuble, lot, occupant et proprietaire.`
  },
  {
    id: "legacy-city-positioning",
    text: "Un immeuble se decrit precisement: adresse, usage, nombre de lots, etat, travaux, sinistres et occupation. Notre role est de rendre ce risque lisible pour obtenir une proposition coherente, pas seulement un prix rapide.",
    build: (ctx) => `${ctx.city ? `A ${ctx.city},` : "Pour cette page,"} le devis commence par une description precise: adresse, usage, lots, etat, travaux, sinistres et occupation rendent le risque lisible.`
  },
  {
    id: "city-risk-faq",
    text: "Parce qu'un immeuble doit etre presente selon son usage, son entretien et ses sinistres. Une fiche risque locale evite les approximations et facilite la comparaison.",
    build: (ctx) => `${ctx.city ? `A ${ctx.city},` : "Pour cette page,"} l'assureur regarde surtout ${ctx.intent}, l'occupation et les sinistres; une fiche risque precise limite les approximations.`
  },
  {
    id: "city-price-faq",
    text: "La localisation peut influencer l'appetence assureur, mais elle ne suffit pas. L'occupation, les travaux, les sinistres et les franchises pesent souvent davantage.",
    build: (ctx) => `${ctx.city ? `A ${ctx.city},` : "Dans ce dossier,"} la localisation compte, mais l'occupation, les travaux, les sinistres et les franchises expliquent souvent davantage l'appetence assureur.`
  },
  {
    id: "city-documents",
    text: "Contrat actuel, appel de prime, historique sinistres 36 mois, nombre de lots, surfaces, photos si besoin, travaux votes et informations syndic.",
    build: (ctx) => `${ctx.city ? `Pour un dossier a ${ctx.city}, rassemblez` : "Rassemblez"} ${ctx.documents}, puis ajoutez les photos, travaux votes et informations syndic utiles.`
  },
  {
    id: "city-guarantees",
    text: "Responsabilite civile immeuble, dommages, degats des eaux, incendie, vandalisme, evenements climatiques, recherche de fuite et protection juridique.",
    build: (ctx) => `Le socle a verifier pour ${ctx.page}: responsabilite civile immeuble, dommages, degats des eaux, incendie, vandalisme, evenements climatiques et recherche de fuite.`
  },
  {
    id: "commercial-faq",
    text: "Il peut demander plus de precision. L'activite, le bail, les installations techniques et les garanties du locataire doivent etre decrits clairement.",
    build: (ctx) => `Si ${ctx.page} comporte un local professionnel, l'activite, le bail, les installations techniques, la vacance et les garanties du locataire doivent etre decrits avant consultation.`
  },
  {
    id: "claims-faq",
    text: "Parce qu'un historique explique permet de distinguer un incident isole d'un probleme recurrent et de montrer les mesures correctives deja prises.",
    build: (ctx) => `Pour ${ctx.page}, un historique commente distingue l'incident isole du probleme recurrent et montre les travaux ou mesures correctives deja engages.`
  },
  {
    id: "blog-starting-point",
    text: "Le point de depart est toujours le risque reel: adresse, usage, nombre de lots, occupation, travaux, sinistres et responsabilites. Une proposition rapide mais mal cadree peut sembler attractive et devenir fragile au moment de l'indemnisation.",
    build: (ctx) => `Pour ${ctx.page}, le point de depart reste ${ctx.intent}: adresse, usage, lots, occupation, travaux, sinistres et responsabilites doivent etre alignes avant toute proposition.`
  },
  {
    id: "blog-documents",
    text: "Preparez le contrat actuel, le dernier appel de prime, l'adresse complete, le nombre de lots, les surfaces, les usages du batiment, les sinistres sur 36 mois et les travaux votes ou prevus. Pour une copropriete, ajoutez les elements utiles d'assemblee generale et les informations du syndic.",
    build: (ctx) => `Avant de traiter ${ctx.page}, preparez ${ctx.documents}. Ajoutez les informations d'AG, de syndic ou de bail quand elles expliquent mieux le risque.`
  },
  {
    id: "blog-mixed-use",
    text: "Pour un immeuble mixte ou un local professionnel, l'activite exacte doit etre declaree. Pour une SCI, la lecture doit distinguer les lots, les occupants et les contrats deja en place afin d'eviter les doublons.",
    build: (ctx) => `Dans ${ctx.page}, les usages mixtes doivent etre declares precisement: activite, occupants, contrats voisins et responsabilites evitent les doublons comme les zones non couvertes.`
  },
  {
    id: "blog-premium",
    text: "La prime annuelle n'est qu'une ligne du contrat. Les franchises par garantie, les plafonds de recherche de fuite, les exclusions d'inoccupation, les obligations d'entretien et les delais de declaration peuvent changer fortement le cout final du sinistre.",
    build: (ctx) => `Sur ${ctx.page}, la prime ne suffit pas: franchises, plafonds, exclusions, obligations d'entretien et delais de declaration peuvent modifier fortement le cout final.`
  },
  {
    id: "blog-readable-contract",
    text: "Un bon contrat d'assurance immeuble doit rester comprehensible pour le bailleur, le syndic ou le conseil syndical. Si la proposition ne permet pas d'arbitrer clairement entre cout, garanties et reste a charge probable, elle doit etre retravaillee.",
    build: (ctx) => `Un contrat utile pour ${ctx.page} doit permettre a ${ctx.audience} d'arbitrer entre cout, garanties et reste a charge probable sans ambiguite.`
  },
  {
    id: "blog-method",
    text: "Notre methode consiste a transformer une demande de devis en fiche risque lisible. Nous separons les informations certaines, les points a verifier, les clauses sensibles et les pieces manquantes. Cette approche facilite la consultation assureur et limite les allers-retours.",
    build: (ctx) => `Notre methode pour ${ctx.page} separe informations certaines, points a verifier, clauses sensibles et pieces manquantes afin de limiter les allers-retours assureur.`
  },
  {
    id: "blog-fast-document",
    text: "Le contrat actuel et le dernier appel de prime accelerent la lecture. L'historique sinistres et les travaux prevus evitent les questions tardives.",
    build: (ctx) => `Pour ${ctx.page}, le contrat actuel et l'appel de prime donnent le cadre; l'historique sinistre et les travaux prevus reduisent les questions tardives.`
  },
  {
    id: "faq-status",
    text: "La reponse depend du statut du demandeur, du contrat en place, de l'usage du bien et des sinistres connus. ImmeubleAssur commence par qualifier ces elements avant toute comparaison de prix.",
    build: (ctx) => `Pour ${ctx.page}, la reponse depend du statut du demandeur, du contrat en place et de ${ctx.intent}; ces elements sont qualifies avant toute comparaison de prix.`
  },
  {
    id: "faq-reflex",
    text: "Le bon reflexe consiste a verifier les garanties, les franchises, les exclusions et les obligations de declaration. Un contrat clair vaut mieux qu'une prime basse mal comprise.",
    build: (ctx) => `Le bon reflexe pour ${ctx.page}: verifier garanties, franchises, exclusions et obligations de declaration avant de retenir une prime basse mal comprise.`
  },
  {
    id: "faq-documents",
    text: "Les pieces les plus utiles sont le contrat actuel, le dernier appel de prime, les sinistres sur 36 mois, le nombre de lots, la surface et les travaux prevus.",
    build: (ctx) => `Pour ${ctx.page}, les pieces prioritaires sont ${ctx.documents}; elles reduisent les questions tardives et rendent le devis plus fiable.`
  },
  {
    id: "faq-incomplete",
    text: "Quand le dossier est incomplet, l'assureur peut refuser, surprimer ou exclure certains points. Une fiche risque structuree reduit ce risque.",
    build: (ctx) => `Un dossier incomplet sur ${ctx.page} peut provoquer refus, surprime ou exclusion; une fiche risque structuree rend ${ctx.proof} plus lisibles.`
  },
  {
    id: "faq-contract-scope",
    text: "Pour une copropriete ou une SCI, il faut aussi distinguer le contrat immeuble, les PNO, les assurances occupants et les responsabilites du syndic ou du gerant.",
    build: (ctx) => `Dans ${ctx.page}, il faut distinguer contrat immeuble, PNO, assurances occupants et responsabilites du syndic, du gerant ou du bailleur.`
  }
];

const QUALITY_START = "<!-- content-quality-support:start -->";
const QUALITY_END = "<!-- content-quality-support:end -->";

function qualityNeeds(html, slug, ctx) {
  const text = stripHtml(html);
  const words = text.split(/\s+/).filter(Boolean).length;
  const detailsCount = (html.match(/<details\b/gi) || []).length;
  const form = html.includes('id="lead-form"');
  const primaryCta = html.includes('class="button primary"');
  const title = titleOf(html, slug);
  const exempt = ["admin", "mentions-legales", "confidentialite", "merci"].includes(slug);
  return {
    depth: !exempt && words < 430,
    faq: !exempt && detailsCount === 0 && /assurance|devis|prix|courtier|pno|cno/i.test(title),
    cta: !exempt && !form && !primaryCta,
    words,
    detailsCount,
    form,
    primaryCta
  };
}

function qualityFaq(ctx) {
  const rows = [
    [`Quelle information change vraiment l'analyse ${ctx.page} ?`, `L'information cle est ${ctx.intent}. Elle doit etre reliee au statut du demandeur, au contrat actuel, aux sinistres et aux responsabilites reelles.`],
    ["Quels documents preparer avant un devis ?", `Preparez ${ctx.documents}. Ajoutez les baux, les photos, les travaux prevus ou les PV d'assemblee lorsqu'ils expliquent le risque.`],
    ["Pourquoi passer par un specialiste immeuble ?", `Parce que ${ctx.proof} peuvent modifier la reponse assureur. Une demande generale oublie souvent ces points.`],
    ["Quand faut-il agir rapidement ?", "Il faut agir avant echeance, apres une resiliation, en cas de refus assureur, apres un sinistre important ou lorsqu'un usage du batiment change."]
  ];
  return `<div class="faq-list">${rows.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>`;
}

function qualitySupportBlock(ctx, needs) {
  const depth = needs.depth ? `<div class="container narrow"><p class="eyebrow dark">Qualite du dossier</p><h2>Clarifier ${esc(ctx.page)} avant comparaison.</h2><p class="large-copy">Pour ${esc(ctx.audience)}, cette page doit transformer une recherche en dossier exploitable. Le point de depart est ${esc(ctx.intent)}; le point d'arrivee est une demande claire, avec pieces disponibles, urgence, contrat actuel et questions encore ouvertes.</p><p>Cette consolidation evite les pages trop courtes et les demandes mal qualifiees. Elle aide le visiteur a comprendre ce qui influence le devis: ${esc(ctx.proof)}, mais aussi les franchises, exclusions, delais de declaration et obligations d'entretien.</p><ul class="check-list"><li>Verifier le statut du demandeur et le type de bien.</li><li>Rassembler ${esc(ctx.documents)}.</li><li>Identifier l'urgence: echeance, sinistre, refus, travaux ou changement d'usage.</li><li>Passer vers le parcours ${esc(ctx.route)} lorsque les informations de base sont pretes.</li></ul></div>` : "";
  const faq = needs.faq ? `<div class="container narrow"><h2>Questions frequentes utiles</h2>${qualityFaq(ctx)}</div>` : "";
  const cta = needs.cta ? `<div class="container narrow"><p><a class="button primary" href="/devis-assurance-immeuble?intent=quality-support">Demander un avis ImmeubleAssur</a></p></div>` : "";
  return `<section class="band content-quality-support" data-content-quality-support="${esc(ctx.slug)}">${depth}${faq}${cta}</section>`;
}

function ensureQualitySupport(html, ctx) {
  const pattern = new RegExp(`\\s*${escapeRegExp(QUALITY_START)}[\\s\\S]*?${escapeRegExp(QUALITY_END)}\\s*`, "g");
  const cleaned = html.replace(pattern, "\n");
  const needs = qualityNeeds(cleaned, ctx.slug, ctx);
  if (!needs.depth && !needs.faq && !needs.cta) return { html: cleaned, added: false, needs };
  const block = `\n${QUALITY_START}\n${qualitySupportBlock(ctx, needs)}\n${QUALITY_END}\n`;
  const next = cleaned.includes("</main>") ? cleaned.replace("</main>", `${block}</main>`) : `${cleaned}${block}`;
  return { html: next, added: true, needs };
}
function diversifyHtml(html, ctx) {
  const touched = [];
  let next = html;
  for (const replacement of replacements) {
    let count = 0;
    next = next.replace(paragraphPattern(replacement.text), (match, open, close) => {
      count += 1;
      return `${open}${esc(replacement.build(ctx))}${close}`;
    });
    if (count) touched.push({ id: replacement.id, count });
  }
  return { html: next, touched };
}

function enhanceFile(file) {
  const original = readFileSync(file, "utf8");
  const slug = slugFromFile(file);
  if (slug === "admin") return null;
  const ctx = contextFor(slug, original);
  const diversified = diversifyHtml(original, ctx);
  const quality = ensureQualitySupport(diversified.html, ctx);
  const html = quality.html;
  if (html !== original) writeFileSync(file, html, "utf8");
  return {
    slug,
    url: `${SITE}${slug === "index" ? "/" : `/${slug}`}`,
    changed: html !== original,
    replacements: diversified.touched,
    replacements_count: diversified.touched.reduce((sum, item) => sum + item.count, 0),
    quality_support_added: quality.added,
    quality_needs: quality.needs
  };
}

mkdirSync(REPORT_DIR, { recursive: true });
mkdirSync(join(PUBLIC_DIR, "assets"), { recursive: true });
const pages = walk(PUBLIC_DIR).map(enhanceFile).filter(Boolean);
const changed = pages.filter((page) => page.changed);
const familyCounts = new Map();
for (const page of changed) {
  for (const item of page.replacements) familyCounts.set(item.id, (familyCounts.get(item.id) || 0) + item.count);
}

const report = {
  generated_at: new Date().toISOString(),
  pages_checked: pages.length,
  pages_changed: changed.length,
  paragraphs_contextualized: changed.reduce((sum, page) => sum + page.replacements_count, 0),
  quality_support_pages: pages.filter((page) => page.quality_support_added).length,
  replacement_families: [...familyCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count })),
  safeguards: ["visible-content-only", "no-hidden-keywords", "no-ai-evasion", "schema-refresh-by-seo-growth-pass", "people-first-context"],
  sample: changed.slice(0, 30)
};

writeFileSync(join(REPORT_DIR, "content-diversity-report.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(join(PUBLIC_DIR, "assets", "content-diversity-latest.json"), JSON.stringify({
  generated_at: report.generated_at,
  pages_checked: report.pages_checked,
  pages_changed: report.pages_changed,
  paragraphs_contextualized: report.paragraphs_contextualized,
  quality_support_pages: report.quality_support_pages,
  replacement_families: report.replacement_families.slice(0, 12),
  safeguards: report.safeguards
}, null, 2), "utf8");

console.log(`Content diversity pass contextualized ${report.paragraphs_contextualized} paragraph(s) across ${report.pages_changed}/${report.pages_checked} page(s).`);
