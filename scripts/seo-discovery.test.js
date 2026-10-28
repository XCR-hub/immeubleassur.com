import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { improveDiscovery } from './seo-discovery-pass.js';
import { sitemapModificationDates } from './sitemap-modification-dates.js';

function removeFixture(root) {
  if (!resolve(root).startsWith(join(resolve(tmpdir()), 'immeubleassur-search-'))) throw new Error('Unexpected fixture directory');
  rmSync(root, { recursive: true, force: true });
}
function page(slug, title, noindex = false) {
  return `<html><head><link rel="canonical" href="https://immeubleassur.com/${slug}" /><meta name="robots" content="${noindex ? 'noindex' : 'index'}, follow" /><meta name="description" content="Une description utile." /></head><body><main><h1>${title}</h1></main><footer class="site-footer"></footer></body></html>`;
}
test('existing cities and all articles remain linked across repeated rebuilds', () => {
  const root = mkdtempSync(join(tmpdir(), 'immeubleassur-search-links-'));
  try {
    mkdirSync(join(root, 'blog'));
    for (const hub of ['index', 'blog', 'villes', 'guides', 'faq', 'methodologie-editoriale', 'mentions-legales']) writeFileSync(join(root, hub + '.html'), page(hub === 'index' ? '' : hub, hub));
    writeFileSync(join(root, 'blog/index.html'), page('blog', 'Alias', true));
    for (let i = 0; i < 45; i++) {
      writeFileSync(join(root, `assurance-immeuble-ville-${i}.html`), page(`assurance-immeuble-ville-${i}`, `Assurance immeuble à Ville ${i}`));
      writeFileSync(join(root, `blog/article-${i}.html`), page(`blog/article-${i}`, `Article pratique ${i}`));
    }
    writeFileSync(join(root, 'blog/prive.html'), page('blog/prive', 'Contenu privé', true));
    const first = improveDiscovery(root);
    assert.equal(first.city_links, 45);
    assert.equal(first.article_links, 45);
    const cities = readFileSync(join(root, 'villes.html'), 'utf8');
    const articles = readFileSync(join(root, 'blog.html'), 'utf8');
    for (let i = 0; i < 45; i++) {
      assert.ok(cities.includes(`href="/assurance-immeuble-ville-${i}"`));
      assert.ok(articles.includes(`href="/blog/article-${i}"`));
    }
    assert.ok(!articles.includes('href="/blog/prive"'));
    assert.ok(readFileSync(join(root, 'blog/index.html'), 'utf8').includes('noindex, follow'));
    improveDiscovery(root);
    assert.equal(readFileSync(join(root, 'villes.html'), 'utf8'), cities);
    assert.equal(readFileSync(join(root, 'blog.html'), 'utf8'), articles);
  } finally { removeFixture(root); }
});
test('sitemap dates follow content history rather than checkout modification times', () => {
  const root = mkdtempSync(join(tmpdir(), 'immeubleassur-search-dates-'));
  const git = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_AUTHOR_DATE: '2026-06-12T12:00:00Z', GIT_COMMITTER_DATE: '2026-06-12T12:00:00Z' } }); assert.equal(r.status, 0, r.stderr); };
  try {
    mkdirSync(join(root, 'public'));
    git('init'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'SEO fixture');
    const file = join(root, 'public/index.html');
    writeFileSync(file, '<h1>Original</h1>'); git('add', '.'); git('commit', '-m', 'Original content');
    utimesSync(file, new Date('2026-10-28'), new Date('2026-10-28'));
    assert.equal(sitemapModificationDates(root).get('public/index.html'), '2026-06-12');
    writeFileSync(file, '<h1>Changed</h1>');
    writeFileSync(join(root, 'public/new.html'), '<h1>New</h1>');
    const dates = sitemapModificationDates(root, spawnSync, new Date('2026-10-28T10:00:00Z'));
    assert.equal(dates.get('public/index.html'), '2026-10-28');
    assert.equal(dates.get('public/new.html'), '2026-10-28');
  } finally { removeFixture(root); }
});
test('unavailable content history does not invent a sitemap date', () => {
  assert.equal(sitemapModificationDates('.', () => ({ status: 1, stdout: '' })).size, 0);
});
