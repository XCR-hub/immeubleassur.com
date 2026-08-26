import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";
const HOME_FILE = join("public", "index.html");
const ROUTER_START = "<!-- ux-conversion-router:start -->";
const ROUTER_END = "<!-- ux-conversion-router:end -->";
const DIAGNOSTIC_START = "<!-- ux-diagnostic:start -->";
const DIAGNOSTIC_END = "<!-- ux-diagnostic:end -->";
const READINESS_START = "<!-- ux-readiness:start -->";
const READINESS_END = "<!-- ux-readiness:end -->";
const MOMENTUM_START = "<!-- ux-conversion-momentum:start -->";
const MOMENTUM_END = "<!-- ux-conversion-momentum:end -->";
const HERO_HOT_QUOTE_START = "<!-- ux-homepage-hot-quote:start -->";
const HERO_HOT_QUOTE_END = "<!-- ux-homepage-hot-quote:end -->";
const CONVERSION_REPORT = join(REPORT_DIR, "conversion-intelligence-report.json");
const UX_REPORT = join(REPORT_DIR, "ux-conversion-report.json");
const REPORT_DRIVEN_LIMIT = 40;
const REPORT_DRIVEN_MAX_SCORE = 81;
const SAFE_SLUG = /^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/;
const SAFE_HTML_FILE = /^[a-z0-9-]+(?:\/[a-z0-9-]+)?\.html$/;
const DIAGNOSTIC_FILES = [
  "index.html",
  "devis-assurance-immeuble.html",
  "devis-pno-cno.html",
  "assurance-immeuble.html",
  "assurance-pno-cno.html",
  "pno-cno.html",
  "assurance-cno.html",
  "assurance-pno.html",
  "assurance-copropriete.html",
  "assurance-sci.html",
  "assurance-local-commercial.html",
  "prix-assurance-immeuble.html"
];
const MOMENTUM_FILES = [
  "index.html",
  "assurance-immeuble.html",
  "devis-assurance-immeuble.html",
  "devis-assurance-immeuble-en-ligne.html",
  "devis-pno-cno.html",
  "assurance-pno-cno.html",
  "pno-cno.html",
  "assurance-cno.html",
  "assurance-pno.html",
  "assurance-copropriete.html",
  "courtier-assurance-immeuble.html",
  "comparateur-assurance-immeuble.html",
  "tarif-assurance-immeuble.html",
  "assurance-immeuble-resilie.html",
  "assurance-immeuble-sinistre.html"
];

function uniqueFiles(files) {
  return [...new Set(files.filter(Boolean))];
}

function htmlFileFromSlug(slug) {
  if (slug === "index") return "index.html";
  if (!SAFE_SLUG.test(slug)) return "";
  return `${slug}.html`;
}

function existingHtmlFile(fileName) {
  const normalized = String(fileName || "").replace(/\\/g, "/");
  if (!SAFE_HTML_FILE.test(normalized)) return "";
  return existsSync(join("public", normalized)) ? normalized : "";
}

function titleCase(value) {
  return String(value || "")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function humanizeFile(fileName) {
  const slug = String(fileName || "index.html").replace(/\\/g, "/").replace(/\.html$/, "");
  const cleanSlug = slug.replace(/^blog\//, "article ").replace(/^faq\//, "faq ").replace(/-/g, " ");
  return titleCase(cleanSlug || "accueil");
}

function cityFromFile(fileName) {
  const slug = String(fileName || "").replace(/\\/g, "/").replace(/\.html$/, "");
  const match = slug.match(/^assurance-immeuble-(.+)$/);
  if (!match) return "";
  const value = match[1];
  if (["de-rapport", "obligatoire", "resilie", "sinistre"].includes(value)) return "";
  return titleCase(value);
}

function pageContext(fileName = "index.html") {
  const slug = String(fileName || "index.html").replace(/\\/g, "/").replace(/\.html$/, "");
  const label = humanizeFile(fileName);
  const city = cityFromFile(fileName);
  if (city) {
    return {
      diagnosticLead: `A ${city}, la demande doit relier adresse, usage, lots, sinistres et echeance pour obtenir un devis immeuble exploitable rapidement.`,
      readinessLead: `Pour un immeuble situe a ${city}, chaque piece cochee rend la demande plus lisible: contrat actuel, appel de prime, lots, sinistres et travaux.`,
      momentumLead: `Les recherches locales sur ${city} doivent basculer vite vers un dossier qualifie: PNO/CNO, copropriete, SCI ou multirisque immeuble selon le batiment.`
    };
  }
  if (/pno|cno/.test(slug)) {
    return {
      diagnosticLead: `Sur ${label}, le visiteur doit preciser occupation, statut du lot, contrat immeuble et responsabilite du coproprietaire pour eviter les allers-retours.`,
      readinessLead: `Sur ${label}, les pieces utiles sont le bail, la vacance, l'attestation occupant, le contrat immeuble et l'echeance.`,
      momentumLead: `Sur ${label}, les recherches PNO/CNO convertissent mieux quand le parcours distingue lot loue, vacant, coproprietaire non occupant et audit du contrat immeuble.`
    };
  }
  if (/copro|syndic/.test(slug)) {
    return {
      diagnosticLead: `Sur ${label}, le diagnostic doit separer syndic, conseil syndical, lots, parties communes, travaux votes et responsabilite civile du syndicat.`,
      readinessLead: `Sur ${label}, les pieces qui accelerent le devis sont PV d'AG, nombre de lots, contrat actuel, sinistres 36 mois et travaux prevus.`,
      momentumLead: `Sur ${label}, les recherches copropriete doivent conduire vers un dossier assureur clair: RC syndicat, multirisque immeuble, PNO des lots et franchises.`
    };
  }
  if (/sci|patrimoine/.test(slug)) {
    return {
      diagnosticLead: `Sur ${label}, la qualification doit cartographier biens, occupants, contrats existants et priorite patrimoniale avant consultation assureur.`,
      readinessLead: `Sur ${label}, chaque document coche relie patrimoine, lots, baux, contrats et echeances pour construire une demande SCI coherente.`,
      momentumLead: `Sur ${label}, les recherches SCI transforment mieux quand elles orientent vers un audit de portefeuille, une multirisque immeuble ou une PNO par lot.`
    };
  }
  if (/sinistre|resilie|refus|degat|infiltration/.test(slug)) {
    return {
      diagnosticLead: `Sur ${label}, il faut qualifier cause, historique, mesures correctives et urgence avant de presenter le risque a un assureur.`,
      readinessLead: `Sur ${label}, releve sinistres, courriers assureur, photos, travaux correctifs et contrat actuel sont prioritaires.`,
      momentumLead: `Sur ${label}, les recherches difficiles doivent proposer rappel rapide, audit contrat et parcours devis adapte aux refus, sinistres ou echeances proches.`
    };
  }
  if (/prix|tarif|comparateur|franchise|prime/.test(slug)) {
    return {
      diagnosticLead: `Sur ${label}, le parcours doit relier prix, garanties, franchises, plafonds et qualite de gestion pour eviter une comparaison incomplete.`,
      readinessLead: `Sur ${label}, l'appel de prime, le contrat, les lots, la surface et les franchises rendent le tarif immeuble vraiment comparable.`,
      momentumLead: `Sur ${label}, les recherches prix doivent envoyer vers un devis qualifie, pas seulement vers une prime: garanties, exclusions et franchise changent la decision.`
    };
  }
  if (/local-commercial|commerce|mixte|restaurant/.test(slug)) {
    return {
      diagnosticLead: `Sur ${label}, il faut cadrer activite commerciale, bail, extraction, vacance et assurance occupant avant la multirisque immeuble.`,
      readinessLead: `Sur ${label}, bail, activite, surface, contrat occupant, travaux et sinistres reduisent les blocages assureur.`,
      momentumLead: `Sur ${label}, les recherches local commercial doivent orienter vers un devis qui traite l'activite, les responsabilites du bailleur et le contrat immeuble.`
    };
  }
  if (/devis|contact/.test(slug)) {
    return {
      diagnosticLead: `Sur ${label}, le formulaire doit capter le bon besoin en moins d'une minute puis laisser le conseiller completer les donnees techniques.`,
      readinessLead: `Sur ${label}, les pieces cochees indiquent au conseiller quoi demander en priorite lors du rappel.`,
      momentumLead: `Sur ${label}, la page devis doit reduire la friction: choix PNO/CNO, immeuble, SCI ou audit, puis rappel expert sans imposer tout le dossier.`
    };
  }
  if (/^blog\//.test(slug)) {
    return {
      diagnosticLead: `Depuis ${label}, le lecteur doit passer de la question lue a un parcours devis qui reprend le risque, l'urgence et les pieces utiles.`,
      readinessLead: `Depuis ${label}, le visiteur coche les documents disponibles puis complete le dossier avec un conseiller.`,
      momentumLead: `Depuis ${label}, l'article transforme l'intention de recherche en action: audit contrat, devis immeuble, PNO/CNO ou rappel selon le sujet consulte.`
    };
  }
  return {
    diagnosticLead: `Sur ${label}, le parcours qualifie statut, type de bien, urgence et pieces disponibles pour creer un lead assurance immeuble exploitable.`,
    readinessLead: `Chaque piece cochee rend la demande ${label.toLowerCase()} plus exploitable: echeance, contrat actuel, sinistres, lots et travaux.`,
    momentumLead: `Les recherches assurance immeuble doivent aller vite vers le bon parcours: CNO/PNO, multirisque, SCI, copropriete ou audit contrat.`
  };
}

function previousReportFiles() {
  if (!existsSync(UX_REPORT)) return [];
  try {
    const report = JSON.parse(readFileSync(UX_REPORT, "utf8"));
    return (report.report_driven_files || []).map(existingHtmlFile).filter(Boolean);
  } catch {
    return [];
  }
}

function reportDrivenFiles() {
  if (!existsSync(CONVERSION_REPORT)) return previousReportFiles();
  try {
    const report = JSON.parse(readFileSync(CONVERSION_REPORT, "utf8"));
    const weakFiles = (report.weak_money_pages || [])
      .filter((page) => Number(page.score) <= REPORT_DRIVEN_MAX_SCORE)
      .map((page) => htmlFileFromSlug(String(page.slug || "")))
      .map(existingHtmlFile)
      .filter(Boolean)
      .slice(0, REPORT_DRIVEN_LIMIT);
    return uniqueFiles([...previousReportFiles(), ...weakFiles]);
  } catch {
    return previousReportFiles();
  }
}

function routerBlock() {
  return `${ROUTER_START}
<section class="band risk-router-band" aria-labelledby="risk-router-title">
  <div class="risk-router" data-active-risk="copropriete">
    <div class="risk-router-copy">
      <p class="eyebrow dark">Orientation rapide</p>
      <h2 id="risk-router-title">Identifier le bon parcours assurance immeuble.</h2>
      <p class="large-copy">Un proprietaire non occupant, une SCI, un syndic ou un bailleur n'a pas le meme dossier assureur. Le parcours adapte reduit les allers-retours et augmente la qualite du lead.</p>
    </div>
    <div class="risk-router-panel">
      <div class="risk-options" aria-label="Situations assurance immeuble">
        <button class="risk-option" type="button" data-risk="cno">CNO</button>
        <button class="risk-option" type="button" data-risk="pno">PNO</button>
        <button class="risk-option is-active" type="button" data-risk="copropriete">Copropriete</button>
        <button class="risk-option" type="button" data-risk="sci">SCI</button>
        <button class="risk-option" type="button" data-risk="mixte">Immeuble mixte</button>
      </div>
      <div class="risk-result" aria-live="polite">
        <p class="risk-result-label">Parcours prioritaire</p>
        <h3>Syndic ou conseil syndical</h3>
        <p>Presenter les lots, parties communes, sinistres, travaux et garanties RC du syndicat.</p>
        <ul><li>Nombre de lots</li><li>PV d AG et contrat actuel</li><li>Historique sinistres 36 mois</li></ul>
        <a class="button primary" data-track="risk-router-devis" href="/devis-assurance-immeuble?intent=copropriete">Pre-remplir mon devis</a>
      </div>
    </div>
  </div>
</section>
${ROUTER_END}`;
}

function diagnosticBlock(context = pageContext()) {
  return `${DIAGNOSTIC_START}
<section class="band diagnostic-band" aria-labelledby="diagnostic-title">
  <div class="diagnostic-shell" data-diagnostic>
    <div class="diagnostic-copy">
      <p class="eyebrow dark">Diagnostic express</p>
      <h2 id="diagnostic-title">Transformer une demande en parcours assureur qualifie.</h2>
      <p class="large-copy">${context.diagnosticLead}</p>
      <div class="diagnostic-proof" aria-label="Elements qualifies"><span>Statut</span><span>Bien</span><span>Priorite</span><span>Pieces</span></div>
    </div>
    <div class="diagnostic-panel">
      <fieldset class="diagnostic-step">
        <legend>Profil</legend>
        <button class="diagnostic-choice is-active" type="button" data-diagnostic-option data-step="profile" data-value="bailleur">Bailleur</button>
        <button class="diagnostic-choice" type="button" data-diagnostic-option data-step="profile" data-value="sci">SCI</button>
        <button class="diagnostic-choice" type="button" data-diagnostic-option data-step="profile" data-value="syndic-professionnel">Syndic</button>
        <button class="diagnostic-choice" type="button" data-diagnostic-option data-step="profile" data-value="administrateur-biens">Admin. biens</button>
      </fieldset>
      <fieldset class="diagnostic-step">
        <legend>Bien</legend>
        <button class="diagnostic-choice is-active" type="button" data-diagnostic-option data-step="property" data-value="lot-copropriete">Lot copro</button>
        <button class="diagnostic-choice" type="button" data-diagnostic-option data-step="property" data-value="immeuble-locatif">Immeuble</button>
        <button class="diagnostic-choice" type="button" data-diagnostic-option data-step="property" data-value="logement-vacant">Vacant</button>
        <button class="diagnostic-choice" type="button" data-diagnostic-option data-step="property" data-value="local-commercial">Commerce</button>
      </fieldset>
      <fieldset class="diagnostic-step">
        <legend>Priorite</legend>
        <button class="diagnostic-choice is-active" type="button" data-diagnostic-option data-step="urgency" data-value="echeance">Echeance</button>
        <button class="diagnostic-choice" type="button" data-diagnostic-option data-step="urgency" data-value="sinistre">Sinistre</button>
        <button class="diagnostic-choice" type="button" data-diagnostic-option data-step="urgency" data-value="prix">Prix</button>
        <button class="diagnostic-choice" type="button" data-diagnostic-option data-step="urgency" data-value="creation">Nouveau bien</button>
      </fieldset>
      <div class="diagnostic-result" aria-live="polite">
        <p class="diagnostic-route">Parcours CNO</p>
        <h3 class="diagnostic-result-title">Lot en copropriete non occupe.</h3>
        <p class="diagnostic-result-text">Prioriser la responsabilite civile du coproprietaire, la vacance, le bail et la coherence avec le contrat immeuble.</p>
        <ul class="diagnostic-next"><li>Contrat immeuble copropriete</li><li>Statut d'occupation du lot</li><li>Attestation occupant ou vacance</li><li>Echeance et preavis a verifier</li></ul>
        <a class="button primary diagnostic-cta" data-track="diagnostic-devis" href="/devis-pno-cno?intent=cno">Continuer vers le devis qualifie</a>
      </div>
    </div>
  </div>
</section>
${DIAGNOSTIC_END}`;
}

function readinessBlock(context = pageContext()) {
  return `${READINESS_START}
<section class="band readiness-band" aria-labelledby="readiness-title">
  <div class="readiness-shell" data-readiness>
    <div class="readiness-copy">
      <p class="eyebrow dark">Dossier pret assureur</p>
      <h2 id="readiness-title">Voir en 30 secondes ce qui manque avant l'envoi aux assureurs.</h2>
      <p class="large-copy">${context.readinessLead}</p>
    </div>
    <div class="readiness-panel">
      <div class="readiness-meter" aria-live="polite">
        <span class="readiness-label">Dossier a cadrer</span>
        <strong class="readiness-score">20%</strong>
        <span class="readiness-bar"><span></span></span>
      </div>
      <div class="readiness-checks" aria-label="Pieces disponibles">
        <label><input type="checkbox" data-readiness-item data-points="22" data-label="contrat actuel" value="contrat-actuel">Contrat actuel</label>
        <label><input type="checkbox" data-readiness-item data-points="20" data-label="appel de prime" value="appel-prime">Appel de prime</label>
        <label><input type="checkbox" data-readiness-item data-points="18" data-label="sinistres 36 mois" value="sinistres-36-mois">Sinistres 36 mois</label>
        <label><input type="checkbox" data-readiness-item data-points="16" data-label="nombre de lots" value="nombre-lots">Nombre de lots</label>
        <label><input type="checkbox" data-readiness-item data-points="14" data-label="echeance" value="echeance">Echeance</label>
        <label><input type="checkbox" data-readiness-item data-points="10" data-label="travaux prevus" value="travaux-prevus">Travaux prevus</label>
      </div>
      <p class="readiness-next">Cochez les pieces deja disponibles pour prioriser le rappel.</p>
      <a class="button primary readiness-cta" data-track="readiness-devis" href="/devis-assurance-immeuble?intent=immeuble">Preparer ma demande</a>
    </div>
  </div>
</section>
${READINESS_END}`;
}
function momentumBlock(context = pageContext()) {
  return `${MOMENTUM_START}
<section class="band conversion-momentum-band" aria-labelledby="conversion-momentum-title">
  <div class="conversion-momentum">
    <div class="conversion-momentum-copy">
      <p class="eyebrow dark">Priorite business</p>
      <h2 id="conversion-momentum-title">Diriger chaque visiteur vers le devis qui convertit.</h2>
      <p class="large-copy">${context.momentumLead}</p>
    </div>
    <div class="momentum-grid" aria-label="Parcours prioritaires">
      <article>
        <strong>CNO / PNO</strong>
        <span>Lot loue, vacant ou coproprietaire non occupant.</span>
        <a class="button primary" data-track="momentum-pno-cno" href="/devis-pno-cno?intent=pno-cno">Devis PNO/CNO</a>
      </article>
      <article>
        <strong>Immeuble</strong>
        <span>SCI, bailleur, syndic, immeuble de rapport ou monopropriete.</span>
        <a class="button primary" data-track="momentum-immeuble" href="/devis-assurance-immeuble?intent=immeuble">Devis immeuble</a>
      </article>
      <article>
        <strong>Dossier difficile</strong>
        <span>Sinistre, resiliation, refus assureur ou franchise a auditer.</span>
        <a class="button primary" data-track="momentum-audit" href="/audit-contrat-assurance-immeuble">Audit contrat</a>
      </article>
    </div>
  </div>
</section>
${MOMENTUM_END}`;
}
function heroHotQuoteBlock() {
  return `${HERO_HOT_QUOTE_START}
          <div class="hero-hot-quote" aria-label="Devis assurance immeuble immediat">
            <div class="hero-hot-copy">
              <span>Devis immediat</span>
              <strong>Pre-remplir le formulaire sans quitter la page.</strong>
              <small>Choisissez le dossier: syndic, PNO/CNO, SCI ou audit. Le rappel part avec le bon besoin.</small>
            </div>
            <div class="hero-hot-actions">
              <a class="button primary" data-track="homepage-hot-copropriete" href="/devis-assurance-immeuble?intent=copropriete">Copropriete</a>
              <a class="button primary" data-track="homepage-hot-pno-cno" href="/devis-pno-cno?intent=pno-cno">PNO/CNO</a>
              <a class="button secondary" data-track="homepage-hot-audit" href="/devis-assurance-immeuble?intent=audit-contrat">Audit echeance</a>
              <a class="button secondary" data-track="homepage-hot-phone" href="tel:+33180855786">Appeler</a>
            </div>
          </div>
${HERO_HOT_QUOTE_END}`;
}
function removeMarked(html, start, end) {
  return html.replace(new RegExp(`${start}[\\s\\S]*?${end}\\s*`, "g"), "");
}

function insertHeroHotQuote(html) {
  const block = heroHotQuoteBlock();
  if (html.includes("<div class=\"hero-decision-accelerator\"")) {
    return html.replace(/\s*<div class="hero-decision-accelerator"/, `\n${block}\n          <div class="hero-decision-accelerator"`);
  }
  if (html.includes("<div class=\"hero-actions\"")) {
    return html.replace(/\s*<div class="hero-actions"/, `\n${block}\n          <div class="hero-actions"`);
  }
  return html;
}
function insertRouter(html) {
  const block = routerBlock();
  if (html.includes("<section class=\"band intro-band\"")) {
    return html.replace(/\s*<section class="band intro-band"/, `\n${block}\n    <section class="band intro-band"`);
  }
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function insertDiagnostic(html, context = pageContext()) {
  const block = diagnosticBlock(context);
  if (html.includes("<section class=\"band page-band\"")) {
    return html.replace(/\s*<section class="band page-band"/, `\n${block}\n    <section class="band page-band"`);
  }
  if (html.includes(ROUTER_END)) {
    return html.replace(ROUTER_END, `${ROUTER_END}\n${block}`);
  }
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function insertReadiness(html, context = pageContext()) {
  const block = readinessBlock(context);
  if (html.includes(DIAGNOSTIC_END)) {
    return html.replace(DIAGNOSTIC_END, `${DIAGNOSTIC_END}\n${block}`);
  }
  if (html.includes("<section class=\"band page-band\"")) {
    return html.replace(/\s*<section class="band page-band"/, `\n${block}\n    <section class="band page-band"`);
  }
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function insertMomentum(html, context = pageContext()) {
  const block = momentumBlock(context);
  if (html.includes(READINESS_END)) {
    return html.replace(READINESS_END, `${READINESS_END}\n${block}`);
  }
  if (html.includes("<section class=\"band page-band\"")) {
    return html.replace(/\s*<section class="band page-band"/, `\n${block}\n    <section class="band page-band"`);
  }
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function updateFile(file, transform) {
  if (!existsSync(file)) return false;
  const original = readFileSync(file, "utf8");
  const next = transform(original);
  if (next !== original) writeFileSync(file, next, "utf8");
  return next !== original;
}

const heroHotQuoteChanged = updateFile(HOME_FILE, (html) => insertHeroHotQuote(removeMarked(html, HERO_HOT_QUOTE_START, HERO_HOT_QUOTE_END)));
const routerChanged = updateFile(HOME_FILE, (html) => insertRouter(removeMarked(html, ROUTER_START, ROUTER_END)));
const reportFiles = reportDrivenFiles();
const diagnosticTargets = uniqueFiles([...DIAGNOSTIC_FILES, ...reportFiles]);
const momentumTargets = uniqueFiles([...MOMENTUM_FILES, ...reportFiles]);
let diagnosticChanged = 0;
let diagnosticChecked = 0;
let readinessChanged = 0;
let readinessChecked = 0;
for (const fileName of diagnosticTargets) {
  const file = join("public", fileName);
  const context = pageContext(fileName);
  const existed = existsSync(file);
  const changed = updateFile(file, (html) => {
    const cleaned = removeMarked(removeMarked(html, DIAGNOSTIC_START, DIAGNOSTIC_END), READINESS_START, READINESS_END);
    return insertReadiness(insertDiagnostic(cleaned, context), context);
  });
  if (existed) {
    diagnosticChecked += 1;
    readinessChecked += 1;
  }
  if (changed) {
    diagnosticChanged += 1;
    readinessChanged += 1;
  }
}

let momentumChanged = 0;
let momentumChecked = 0;
for (const fileName of momentumTargets) {
  const file = join("public", fileName);
  const context = pageContext(fileName);
  const existed = existsSync(file);
  const changed = updateFile(file, (html) => insertMomentum(removeMarked(html, MOMENTUM_START, MOMENTUM_END), context));
  if (existed) momentumChecked += 1;
  if (changed) momentumChanged += 1;
}
mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "ux-conversion-report.json"), JSON.stringify({
  generated_at: new Date().toISOString(),
  home_router: existsSync(HOME_FILE) && readFileSync(HOME_FILE, "utf8").includes("risk-router"),
  home_hot_quote: existsSync(HOME_FILE) && readFileSync(HOME_FILE, "utf8").includes("hero-hot-quote"),
  home_hot_quote_changed: heroHotQuoteChanged,
  router_changed: routerChanged,
  report_driven_pages: reportFiles.length,
  report_driven_files: reportFiles,
  diagnostic_pages_checked: diagnosticChecked,
  diagnostic_pages_changed: diagnosticChanged,
  readiness_pages_checked: readinessChecked,
  readiness_pages_changed: readinessChanged,
  improvements: ["intent-router", "risk-specific-cta", "lead-prefill-links", "homepage-decision-support", "homepage-hot-quote", "diagnostic-express", "diagnostic-prefill", "diagnostic-event-loop", "readiness-checklist", "readiness-prefill", "readiness-event-loop", "conversion-intelligence-feedback-loop"]
}, null, 2), "utf8");

console.log(`UX conversion pass ${routerChanged ? "updated" : "checked"} homepage router, ${heroHotQuoteChanged ? "updated" : "checked"} hot quote, injected ${diagnosticChanged}/${diagnosticChecked} diagnostic blocks, ${readinessChanged}/${readinessChecked} readiness blocks and ${momentumChanged}/${momentumChecked} momentum blocks.`);
