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
const DIAGNOSTIC_FILES = [
  "index.html",
  "devis-assurance-immeuble.html",
  "devis-pno-cno.html",
  "assurance-immeuble.html",
  "assurance-pno-cno.html",
  "assurance-cno.html",
  "assurance-pno.html",
  "assurance-copropriete.html",
  "assurance-sci.html",
  "assurance-local-commercial.html",
  "prix-assurance-immeuble.html"
];

function routerBlock() {
  return `${ROUTER_START}
<section class="band risk-router-band" aria-labelledby="risk-router-title">
  <div class="risk-router" data-active-risk="cno">
    <div class="risk-router-copy">
      <p class="eyebrow dark">Orientation rapide</p>
      <h2 id="risk-router-title">Identifier le bon parcours assurance immeuble.</h2>
      <p class="large-copy">Un proprietaire non occupant, une SCI, un syndic ou un bailleur n'a pas le meme dossier assureur. Le parcours adapte reduit les allers-retours et augmente la qualite du lead.</p>
    </div>
    <div class="risk-router-panel">
      <div class="risk-options" aria-label="Situations assurance immeuble">
        <button class="risk-option is-active" type="button" data-risk="cno">CNO</button>
        <button class="risk-option" type="button" data-risk="pno">PNO</button>
        <button class="risk-option" type="button" data-risk="copropriete">Copropriete</button>
        <button class="risk-option" type="button" data-risk="sci">SCI</button>
        <button class="risk-option" type="button" data-risk="mixte">Immeuble mixte</button>
      </div>
      <div class="risk-result" aria-live="polite">
        <p class="risk-result-label">Parcours prioritaire</p>
        <h3>Coproprietaire non occupant</h3>
        <p>Verifier le lot, la vacance, le bail, le contrat immeuble et la responsabilite civile du coproprietaire.</p>
        <ul><li>Adresse et usage du lot</li><li>Contrat occupant ou vacance</li><li>Echeance et sinistres recents</li></ul>
        <a class="button primary" data-track="risk-router-devis" href="/devis-pno-cno?intent=cno">Demander le bon devis</a>
      </div>
    </div>
  </div>
</section>
${ROUTER_END}`;
}

function diagnosticBlock() {
  return `${DIAGNOSTIC_START}
<section class="band diagnostic-band" aria-labelledby="diagnostic-title">
  <div class="diagnostic-shell" data-diagnostic>
    <div class="diagnostic-copy">
      <p class="eyebrow dark">Diagnostic express</p>
      <h2 id="diagnostic-title">Transformer une demande en parcours assureur qualifie.</h2>
      <p class="large-copy">Les meilleurs leads arrivent avec un statut, un type de bien et une urgence clairs. Le diagnostic ajuste le devis, le message de rappel et les signaux de conversion.</p>
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
        <ul class="diagnostic-next"><li>Contrat actuel</li><li>Statut d'occupation</li><li>Sinistres recents</li></ul>
        <a class="button primary diagnostic-cta" data-track="diagnostic-devis" href="/devis-pno-cno?intent=cno">Continuer vers le devis qualifie</a>
      </div>
    </div>
  </div>
</section>
${DIAGNOSTIC_END}`;
}

function readinessBlock() {
  return `${READINESS_START}
<section class="band readiness-band" aria-labelledby="readiness-title">
  <div class="readiness-shell" data-readiness>
    <div class="readiness-copy">
      <p class="eyebrow dark">Dossier pret assureur</p>
      <h2 id="readiness-title">Voir en 30 secondes ce qui manque avant l'envoi aux assureurs.</h2>
      <p class="large-copy">Chaque piece cochee rend la demande plus exploitable: echeance, contrat actuel, sinistres, lots et travaux. Le formulaire reprend ensuite les elements disponibles.</p>
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
function removeMarked(html, start, end) {
  return html.replace(new RegExp(`${start}[\\s\\S]*?${end}\\s*`, "g"), "");
}

function insertRouter(html) {
  const block = routerBlock();
  if (html.includes("<section class=\"band intro-band\"")) {
    return html.replace(/\s*<section class="band intro-band"/, `\n${block}\n    <section class="band intro-band"`);
  }
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function insertDiagnostic(html) {
  const block = diagnosticBlock();
  if (html.includes("<section class=\"band page-band\"")) {
    return html.replace(/\s*<section class="band page-band"/, `\n${block}\n    <section class="band page-band"`);
  }
  if (html.includes(ROUTER_END)) {
    return html.replace(ROUTER_END, `${ROUTER_END}\n${block}`);
  }
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

function insertReadiness(html) {
  const block = readinessBlock();
  if (html.includes(DIAGNOSTIC_END)) {
    return html.replace(DIAGNOSTIC_END, `${DIAGNOSTIC_END}\n${block}`);
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

const routerChanged = updateFile(HOME_FILE, (html) => insertRouter(removeMarked(html, ROUTER_START, ROUTER_END)));
let diagnosticChanged = 0;
let diagnosticChecked = 0;
let readinessChanged = 0;
let readinessChecked = 0;
for (const fileName of DIAGNOSTIC_FILES) {
  const file = join("public", fileName);
  const existed = existsSync(file);
  const changed = updateFile(file, (html) => {
    const cleaned = removeMarked(removeMarked(html, DIAGNOSTIC_START, DIAGNOSTIC_END), READINESS_START, READINESS_END);
    return insertReadiness(insertDiagnostic(cleaned));
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

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "ux-conversion-report.json"), JSON.stringify({
  generated_at: new Date().toISOString(),
  home_router: existsSync(HOME_FILE) && readFileSync(HOME_FILE, "utf8").includes("risk-router"),
  router_changed: routerChanged,
  diagnostic_pages_checked: diagnosticChecked,
  diagnostic_pages_changed: diagnosticChanged,
  readiness_pages_checked: readinessChecked,
  readiness_pages_changed: readinessChanged,
  improvements: ["intent-router", "risk-specific-cta", "lead-prefill-links", "homepage-decision-support", "diagnostic-express", "diagnostic-prefill", "diagnostic-event-loop", "readiness-checklist", "readiness-prefill", "readiness-event-loop"]
}, null, 2), "utf8");

console.log(`UX conversion pass ${routerChanged ? "updated" : "checked"} homepage router, injected ${diagnosticChanged}/${diagnosticChecked} diagnostic blocks and ${readinessChanged}/${readinessChecked} readiness blocks.`);
