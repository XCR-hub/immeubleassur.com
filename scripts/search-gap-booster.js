import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

const PUBLIC_DIR = "public";
const REPORT_DIR = "reports";
const SITE = "https://immeubleassur.com";
const SEARCH_REPORT = join(REPORT_DIR, "search-intelligence-report.json");
const START = "<!-- search-gap-booster:start -->";
const END = "<!-- search-gap-booster:end -->";
const FAQ_SCHEMA_START = "<!-- search-gap-faq-schema:start -->";
const FAQ_SCHEMA_END = "<!-- search-gap-faq-schema:end -->";

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function read(path, fallback = "") { return existsSync(path) ? readFileSync(path, "utf8") : fallback; }
function write(path, value) { ensureDir(dirname(path)); writeFileSync(path, value, "utf8"); }
function esc(value) { return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function stripHtml(value) { return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return extname(file) === ".html" ? [file] : [];
  });
}

function slugFromFile(file) {
  const rel = relative(PUBLIC_DIR, file).replace(/\\/g, "/");
  if (rel === "index.html") return "index";
  return rel.replace(/\.html$/, "");
}

function slugFromTarget(targetUrl) {
  const cleaned = String(targetUrl || "").split("?")[0].replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+|\/+$/g, "");
  return cleaned || "index";
}

function fileForTarget(targetUrl) {
  const slug = slugFromTarget(targetUrl);
  return join(PUBLIC_DIR, slug === "index" ? "index.html" : `${slug}.html`);
}

function titleOf(html) {
  return stripHtml((html.match(/<title>(.*?)<\/title>/is) || [])[1] || "Assurance immeuble").replace(/\s+\|\s+ImmeubleAssur$/i, "");
}

function removeBlock(html) {
  return html.replace(new RegExp(`${START}[\\s\\S]*?${END}\\s*`, "g"), "");
}

function sanitizeLegacyUnmeasuredBlock(html) {
  if (!html.includes(START)) return html;
  return html
    .replaceAll(START, "<!-- evidence-preparation-guide:start -->")
    .replaceAll(END, "<!-- evidence-preparation-guide:end -->")
    .replace(/search-gap-booster/g, "evidence-preparation-guide")
    .replace(/aria-label="Renforcement recherche [^"]*"/g, 'aria-label="Guide de preparation assurance immeuble"')
    .replace(/<p class="eyebrow dark">Objectif top 3 Google<\/p>/g, '<p class="eyebrow dark">Dossier mieux prepare</p>')
    .replace(/<p class="large-copy">Ce renforcement[^<]*<\/p>/g, '<p class="large-copy">Ce guide relie le besoin aux decisions concretes, aux preuves de specialisation, aux documents utiles et au bon parcours de devis.</p>')
    .replace(/<li>Surveiller les concurrents visibles \([^)]*\)[^<]*<\/li>/g, '<li>Verifier les garanties, les responsabilites et les pieces attendues sans reprendre de contenu tiers ni supposer une position Google.</li>')
    .replace(/<summary>Pourquoi cette page cible [^<]* \?<\/summary><p>[^<]*<\/p>/g, "<summary>Pourquoi preparer ce dossier ?</summary><p>Parce qu'un dossier clair aide a comprendre le risque, reunir les pieces et choisir les garanties avant consultation assureur.</p>")
    .replace(/<p class="seo-expansion-note">[^<]*<\/p>/g, '<p class="seo-expansion-note">Guide de preparation fonde sur le besoin utilisateur et les pieces du dossier, sans affirmation de classement Google.</p>');
}

function destinationLinks(row) {
  const query = `${row.query || ""} ${row.target_url || ""}`.toLowerCase();
  if (/pno|cno|coproprietaire/.test(query)) return [
    ["/devis-pno-cno", "Devis PNO/CNO"],
    ["/assurance-cno", "Assurance CNO"],
    ["/faq/pno", "FAQ PNO"],
    ["/comparateur-assurance-immeuble", "Comparer"]
  ];
  if (/prix|tarif|cout|compar/.test(query)) return [
    ["/devis-assurance-immeuble", "Devis immeuble"],
    ["/prix-assurance-immeuble", "Prix immeuble"],
    ["/tarif-assurance-immeuble", "Tarif"],
    ["/checklist-documents-assurance-immeuble", "Pieces utiles"]
  ];
  if (/sci|bailleur|rapport|locatif/.test(query)) return [
    ["/devis-assurance-immeuble?intent=sci", "Audit SCI"],
    ["/assurance-sci", "Assurance SCI"],
    ["/assurance-pno-cno", "PNO/CNO"],
    ["/courtier-assurance-immeuble", "Courtier"]
  ];
  if (/copro|syndic/.test(query)) return [
    ["/devis-assurance-immeuble?intent=copropriete", "Devis copropriete"],
    ["/assurance-copropriete", "Copropriete"],
    ["/rc-syndic", "RC syndic"],
    ["/guide-assurance-copropriete-2026", "Guide 2026"]
  ];
  return [
    ["/devis-assurance-immeuble", "Devis immeuble"],
    ["/comparateur-assurance-immeuble", "Comparer"],
    ["/audit-contrat-assurance-immeuble", "Audit contrat"],
    ["/checklist-documents-assurance-immeuble", "Checklist"]
  ];
}

function intentText(intent) {
  if (intent === "lead") return "demande de devis immediate";
  if (intent === "comparison") return "comparaison prix garanties";
  if (intent === "niche") return "requete specialisee a forte qualification";
  return "intention business assurance immeuble";
}

function faqRows(row, query) {
  return [
    [`Pourquoi cette page cible ${query} ?`, "Parce que la recherche exprime un besoin proche du devis: comprendre le risque, preparer les pieces et choisir les garanties avant consultation assureur."],
    ["Quel element fait gagner un lead qualifie ?", "Un formulaire contextualise, des documents attendus explicites et une lecture claire des responsabilites entre immeuble, lot, occupant et proprietaire."],
    ["Comment eviter une page SEO artificielle ?", "Le bloc ajoute des decisions concretes et des liens utiles. Il n'ajoute ni texte cache, ni duplication massive, ni contenu copie depuis les resultats de recherche."]
  ];
}

function faqDetails(row, query) {
  return faqRows(row, query).map(([question, answer]) => `<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join("\n        ");
}

function removeSearchGapFaqSchema(html) {
  return html.replace(new RegExp(`${FAQ_SCHEMA_START}[\\s\\S]*?${FAQ_SCHEMA_END}\\s*`, "g"), "");
}

function hasFaqSchema(html) {
  return /"@type"\s*:\s*"FAQPage"/i.test(html) || /"@type"\s*:\s*\[[^\]]*"FAQPage"/i.test(html);
}

function ensureSearchGapFaqSchema(html, row, query) {
  const cleaned = removeSearchGapFaqSchema(html);
  if (hasFaqSchema(cleaned)) return cleaned;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqRows(row, query).map(([question, answer]) => ({
      "@type": "Question",
      name: stripHtml(question),
      acceptedAnswer: { "@type": "Answer", text: stripHtml(answer) }
    }))
  };
  const script = `${FAQ_SCHEMA_START}\n<script type="application/ld+json">${JSON.stringify(schema)}</script>\n${FAQ_SCHEMA_END}\n`;
  return cleaned.includes("</head>") ? cleaned.replace(/\s*<\/head>/i, `\n${script}</head>`) : `${script}${cleaned}`;
}

function block(row, pageTitle) {
  const competitors = (row.top_domains || []).filter(Boolean).slice(0, 3).join(", ") || "concurrents generalistes";
  const rankLabel = row.position ? `position estimee ${row.position}` : "presence non detectee";
  const links = destinationLinks(row);
  const query = row.query || pageTitle;
  return `${START}
<section class="band seo-opportunity-expansion search-gap-booster" aria-label="Renforcement recherche ${esc(query)}">
  <div class="seo-opportunity-grid">
    <div class="seo-opportunity-copy">
      <p class="eyebrow dark">Objectif top 3 Google</p>
      <h2>Mieux repondre a ${esc(query)}.</h2>
      <p class="large-copy">Ce renforcement transforme le signal de classement en contenu utile: intention, preuves de specialisation, questions de decision et passage direct vers un dossier de devis exploitable.</p>
      <ul class="check-list">
        <li>Clarifier l'intention ${esc(intentText(row.intent))} avant de parler uniquement de tarif.</li>
        <li>Comparer les garanties, franchises, exclusions et documents a fournir pour eviter les demandes incompletes.</li>
        <li>Renvoyer vers le bon parcours de lead selon le profil: bailleur, SCI, syndic, coproprietaire non occupant ou gestionnaire.</li>
        <li>Surveiller les concurrents visibles (${esc(competitors)}) sans copier leurs contenus ni automatiser de scraping Google.</li>
      </ul>
    </div>
    <div class="seo-opportunity-side">
      <div class="seo-link-panel">
        <strong>Parcours a renforcer</strong>
        ${links.map(([href, label]) => `<a href="${esc(href)}">${esc(label)}</a>`).join("")}
      </div>
      <div class="faq-list compact-faq">
        ${faqDetails(row, query)}
      </div>
    </div>
  </div>
  <p class="seo-expansion-note">Renforcement pilote par search-intelligence: ${esc(rankLabel)}, objectif top 3 et hausse des demandes de devis qualifiees.</p>
</section>
${END}`;
}

function insertBlock(html, nextBlock, row, query) {
  const cleaned = ensureSearchGapFaqSchema(removeBlock(html), row, query);
  if (cleaned.includes("<!-- seo-opportunity-expansion:end -->")) {
    return cleaned.replace("<!-- seo-opportunity-expansion:end -->", `<!-- seo-opportunity-expansion:end -->\n${nextBlock}`);
  }
  if (cleaned.includes("</main>")) return cleaned.replace(/\s*<\/main>/i, `\n${nextBlock}\n</main>`);
  return cleaned;
}

function readSearchReport() {
  try { return JSON.parse(read(SEARCH_REPORT, "{}")); }
  catch { return {}; }
}

function run() {
  ensureDir(REPORT_DIR);
  ensureDir(join(PUBLIC_DIR, "assets"));
  const searchReport = readSearchReport();
  const rankings = Array.isArray(searchReport.rankings) ? searchReport.rankings : [];
  const candidates = rankings
    .filter((row) => row.measured === true && row.data_source === "serpapi" && row.confidence === "measured" && row.target_url && (!Number.isFinite(row.position) || row.position > 3))
    .slice(0, 12);

  const pages = walk(PUBLIC_DIR);
  const pageMap = new Map(pages.map((file) => [slugFromFile(file), file]));
  let unmeasuredBlocksSanitized = 0;
  for (const file of pages) {
    const html = read(file);
    const cleaned = sanitizeLegacyUnmeasuredBlock(html);
    if (cleaned !== html) { write(file, cleaned); unmeasuredBlocksSanitized += 1; }
  }
  const actions = [];

  for (const row of candidates) {
    const slug = slugFromTarget(row.target_url);
    const file = existsSync(fileForTarget(row.target_url)) ? fileForTarget(row.target_url) : pageMap.get(slug);
    if (!file || !existsSync(file)) {
      actions.push({ query: row.query, target_url: row.target_url, status: "missing-file" });
      continue;
    }
    const html = read(file);
    const pageTitle = titleOf(html);
    const query = row.query || pageTitle;
    const next = insertBlock(html, block(row, pageTitle), row, query);
    if (next !== html) write(file, next);
    actions.push({
      query: row.query,
      target_url: row.target_url,
      slug,
      status: next !== html ? "boosted" : "already-current",
      position: row.position || null,
      intent: row.intent || "",
      competitors: (row.top_domains || []).slice(0, 5)
    });
  }

  const boosted = actions.filter((item) => item.status === "boosted" || item.status === "already-current");
  const report = {
    generated_at: new Date().toISOString(),
    source_run_id: searchReport.run_id || "",
    provider: searchReport.provider || "unknown",
    status: candidates.length ? "measured-input-applied" : "held-no-measured-input",
    measured_input_required: true,
    unmeasured_blocks_sanitized: unmeasuredBlocksSanitized,
    candidates: candidates.length,
    pages_boosted: boosted.length,
    missing_files: actions.filter((item) => item.status === "missing-file").length,
    actions,
    safeguards: ["idempotent-marker", "no-hidden-text", "no-google-scraping", "people-first-search-gap-content", "lead-paths-contextualized", "faq-schema-for-visible-search-gap-questions", "serpapi-measured-input-only", "unmeasured-blocks-sanitized"]
  };
  write(join(REPORT_DIR, "search-gap-booster-report.json"), JSON.stringify(report, null, 2));
  write(join(PUBLIC_DIR, "assets", "search-gap-booster-latest.json"), JSON.stringify(report, null, 2));
  console.log(`Search gap booster processed ${report.candidates} ranking gap(s), boosted ${report.pages_boosted} page(s).`);
}

run();
