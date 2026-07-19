import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";
const HOME_FILE = join("public", "index.html");
const MARKER_START = "<!-- ux-conversion-router:start -->";
const MARKER_END = "<!-- ux-conversion-router:end -->";

function routerBlock() {
  return `${MARKER_START}
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
${MARKER_END}`;
}

function removeRouter(html) {
  return html.replace(new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}\\s*`, "g"), "");
}

function insertRouter(html) {
  const block = routerBlock();
  if (html.includes("<section class=\"band intro-band\"")) {
    return html.replace(/\s*<section class="band intro-band"/, `\n${block}\n    <section class="band intro-band"`);
  }
  return html.replace(/\s*<\/main>/i, `\n${block}\n</main>`);
}

const original = readFileSync(HOME_FILE, "utf8");
const withoutOld = removeRouter(original);
const next = insertRouter(withoutOld);
if (next !== original) writeFileSync(HOME_FILE, next, "utf8");

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "ux-conversion-report.json"), JSON.stringify({
  generated_at: new Date().toISOString(),
  home_router: next.includes("risk-router"),
  changed: next !== original,
  improvements: ["intent-router", "risk-specific-cta", "lead-prefill-links", "homepage-decision-support"]
}, null, 2), "utf8");

console.log(`UX conversion pass ${next !== original ? "updated" : "checked"} homepage router.`);
