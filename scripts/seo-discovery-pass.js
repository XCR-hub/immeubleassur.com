import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { insurerGuides } from '../content/insurer-guides.js';

const SITE = 'https://immeubleassur.com';
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const plain = value => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : []); }
function setBlock(html, marker, block, closing = '</main>') {
  const pattern = new RegExp(`\\s*<!-- ${marker}:start -->[\\s\\S]*?<!-- ${marker}:end -->\\s*`, 'g');
  return html.replace(pattern, '').replace(closing, `\n<!-- ${marker}:start -->\n${block}\n<!-- ${marker}:end -->\n${closing}`);
}
export function improveDiscovery(root = 'public') {
  const pages = walk(root).map(file => {
    const html = readFileSync(file, 'utf8');
    const path = relative(root, file).replaceAll('\\', '/');
    const canonical = html.match(/<link rel="canonical" href="([^"]*)"/i)?.[1];
    return { file, html, path, canonical, title: plain(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ''), description: html.match(/<meta name="description" content="([^"]*)"/i)?.[1] || '', noindex: /<meta name="robots" content="[^"]*noindex/i.test(html) };
  });
  const indexable = pages.filter(p => !p.noindex && p.canonical?.startsWith(SITE + '/') && !p.path.endsWith('/index.html'));
  const unique = [...new Map(indexable.map(p => [p.canonical, p])).values()];
  const cards = rows => rows.sort((a, b) => a.title.localeCompare(b.title, 'fr')).map(p => `<article class="content-card"><h3><a href="${esc(new URL(p.canonical).pathname)}">${esc(p.title)}</a></h3><p>${p.description}</p></article>`).join('');
  const cities = unique.filter(p => /^assurance-immeuble-[a-z0-9-]+\.html$/.test(p.path) && /^Assurance immeuble (?:a|à)\s/i.test(p.title));
  const articles = unique.filter(p => /^blog\/[^/]+\.html$/.test(p.path));
  const guides = unique.filter(p => insurerGuides.some(g => p.path === `${g.slug}.html`));
  const targets = [
    ['villes.html', 'Toutes les villes', 'Retrouvez les informations disponibles pour préparer une étude de votre bâtiment.', cities, ['seo-content-factory-cities']],
    ['blog.html', 'Tous les articles pratiques', 'Choisissez un sujet : garanties, documents, travaux ou gestion des sinistres.', articles, ['seo-content-factory-blog']],
    ['guides.html', 'Lire les garanties et préparer le dossier', 'Des grilles de lecture documentées pour poser les bonnes questions avant une consultation.', guides, []]
  ];
  for (const [path, title, intro, rows, oldMarkers] of targets) {
    const page = pages.find(p => p.path === path);
    if (!page) continue;
    let html = page.html;
    for (const marker of oldMarkers) html = html.replace(new RegExp(`\\s*<!-- ${marker}:start -->[\\s\\S]*?<!-- ${marker}:end -->`, 'g'), '');
    // Replace the incomplete original list, keeping a single complete directory.
    if (path !== 'guides.html') html = html.replace(/<section class="band page-band">\s*<div class="card-grid">[\s\S]*?<\/div>\s*<\/section>/, '');
    const block = `<section class="band content-expansion-band"><div class="section-head"><h2>${esc(title)}</h2><p>${esc(intro)}</p></div><div class="card-grid">${cards(rows)}</div></section>`;
    page.html = setBlock(html, 'complete-directory', block);
  }
  const footerLinks = [['guides', 'Guides pratiques'], ['faq', 'Questions fréquentes'], ['methodologie-editoriale', 'Méthode documentaire'], ['mentions-legales', 'Mentions légales']].filter(([slug]) => existsSync(join(root, `${slug}.html`)));
  const footerBlock = `<nav class="footer-documentation" aria-label="Documentation et informations légales">${footerLinks.map(([slug, label]) => `<a href="/${slug}">${label}</a>`).join('')}</nav>`;
  let changed = 0;
  for (const page of pages) {
    // Add public documentation links without changing private portal pages.
    const updated = !page.noindex && page.html.includes('</footer>') ? setBlock(page.html, 'documentation-links', footerBlock, '</footer>') : page.html;
    if (updated !== readFileSync(page.file, 'utf8')) { writeFileSync(page.file, updated, 'utf8'); changed++; }
  }
  // The server resolves /blog and /faq through these directory index files.
  for (const hub of ['blog', 'faq']) if (existsSync(join(root, hub, 'index.html'))) {
    let html = readFileSync(join(root, `${hub}.html`), 'utf8');
    html = html.replace(/(<meta name="robots" content=")[^"]*(")/i, '$1noindex, follow$2');
    const file = join(root, hub, 'index.html');
    if (readFileSync(file, 'utf8') !== html) writeFileSync(file, html, 'utf8');
  }
  return { changed, city_links: cities.length, article_links: articles.length, new_guide_links: guides.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(improveDiscovery()));
