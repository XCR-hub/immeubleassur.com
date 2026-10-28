import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'public';
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []); }
const pages = walk(root).map(file => {
  const html = readFileSync(file, 'utf8');
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/i)?.[1];
  return { file, path: relative(root, file).replaceAll('\\', '/'), html, canonical, noindex: /<meta name="robots" content="[^"]*noindex/i.test(html) };
}).filter(p => p.canonical?.startsWith('https://immeubleassur.com/') && !p.noindex && !p.path.endsWith('/index.html'));
const byPath = new Map(pages.map(p => [new URL(p.canonical).pathname, p]));
const reached = new Map([['/', 0]]);
const queue = ['/'];
while (queue.length) {
  const path = queue.shift();
  const page = byPath.get(path);
  if (!page) continue;
  for (const match of page.html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)) {
    let url;
    try { url = new URL(match[1].replaceAll('&amp;', '&'), page.canonical); } catch { continue; }
    if (url.origin !== 'https://immeubleassur.com') continue;
    const target = url.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    if (byPath.has(target) && !reached.has(target)) { reached.set(target, reached.get(path) + 1); queue.push(target); }
  }
}
const unreachable = [...byPath.keys()].filter(path => !reached.has(path));
const report = { success: unreachable.length === 0, generated_at: new Date().toISOString(), indexable_pages: byPath.size, reachable_from_home: reached.size, maximum_link_depth: Math.max(...reached.values()), unreachable };
mkdirSync('reports', { recursive: true });
writeFileSync('reports/search-discovery-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Search discovery: ${reached.size}/${byPath.size} indexable pages reachable; ${unreachable.length} unreachable.`);
if (unreachable.length) { console.error(unreachable.join('\n')); process.exitCode = 1; }
