import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { improveDiscovery } from './seo-discovery-pass.js';
import { sitemapModificationDates, refreshSitemapModificationDates, validSitemapModificationDate } from './sitemap-modification-dates.js';

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
  let committedAt = '2026-06-12T12:00:00Z';
  const git = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_AUTHOR_DATE: committedAt, GIT_COMMITTER_DATE: committedAt } }); assert.equal(r.status, 0, r.stderr); };
  try {
    mkdirSync(join(root, 'public'));
    git('init'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'SEO fixture');
    const file = join(root, 'public/index.html');
    writeFileSync(file, '<h1>Original</h1><script src="/assets/app.js?v=abc111"></script>'); git('add', 'public'); git('commit', '-m', 'Original content');
    utimesSync(file, new Date('2026-10-28'), new Date('2026-10-28'));
    assert.equal(sitemapModificationDates(root).get('public/index.html'), '2026-06-12T12:00:00.000Z');
    writeFileSync(file, '<h1>Changed</h1><script src="/assets/app.js?v=abc111"></script>');
    writeFileSync(join(root, 'public/new.html'), '<h1>New</h1>');
    const dates = sitemapModificationDates(root, spawnSync, new Date('2026-10-28T10:00:00Z'));
    assert.equal(dates.get('public/index.html'), '2026-06-12T12:00:00.000Z', 'Unpublished rebuilds do not change a published date');
    assert.equal(dates.has('public/new.html'), false, 'Uncommitted pages do not get an invented date');
    committedAt = '2026-10-28T09:00:00Z';
    git('add', 'public'); git('commit', '-m', 'Updated page and new resource');
    assert.equal(sitemapModificationDates(root).get('public/index.html'), '2026-10-28T09:00:00.000Z');
    assert.equal(sitemapModificationDates(root).get('public/new.html'), '2026-10-28T09:00:00.000Z');
    committedAt = '2026-10-28T10:00:00Z';
    writeFileSync(file, '<h1>Changed</h1><script src="/assets/app.js?v=def222"></script>');
    git('add', 'public'); git('commit', '-m', 'Shared asset cache refresh');
    assert.equal(sitemapModificationDates(root).get('public/index.html'), '2026-10-28T09:00:00.000Z', 'A cache version is not a new content date');
    committedAt = '2026-10-28T11:00:00Z';
    writeFileSync(file, '<h1>Changed</h1><a href="/devis-assurance-immeuble">Request a quote</a><script src="/assets/app.js?v=def222"></script>');
    git('add', 'public'); git('commit', '-m', 'Add a useful quote link');
    assert.equal(sitemapModificationDates(root).get('public/index.html'), '2026-10-28T11:00:00.000Z', 'A second real update on the same day keeps its exact time');
  } finally { removeFixture(root); }
});
test('unavailable content history does not invent a sitemap date', () => {
  assert.equal(sitemapModificationDates('.', () => ({ status: 1, stdout: '' })).size, 0);
});

test('sitemap timestamps accept W3C dates and reject invalid calendar dates or missing timezones', () => {
  for (const value of ['2026-11-12', '2024-02-29', '2026-11-13T23:19:30.000Z', '2026-11-14T00:19:30+01:00', '2026-11-19T09:30Z']) assert.equal(validSitemapModificationDate(value), true, value);
  for (const value of ['', '2026-02-29', '2026-02-30', '2026-13-01', '2026-11-19T24:00:00Z', '2026-11-19T10:30:00', '<script>']) assert.equal(validSitemapModificationDate(value), false, value);
});

test('sitemap refresh preserves unknown URLs and the active editorial edition', () => {
  const xml = '<urlset><url><loc>https://immeubleassur.com/</loc><lastmod>2026-11-07</lastmod><priority>1</priority></url><url><loc>https://immeubleassur.com/devis-assurance-immeuble</loc></url><url><loc>https://immeubleassur.com/news/retained</loc><lastmod>2026-11-18</lastmod></url><url><loc>https://other.test/</loc><lastmod>2020-01-01</lastmod></url></urlset>';
  const dates = new Map([['public/index.html', '2026-11-13T23:19:30.000Z'], ['public/devis-assurance-immeuble.html', '2026-11-13T12:28:02.000Z']]);
  const refreshed = refreshSitemapModificationDates(xml, dates);
  assert.ok(refreshed.includes('<lastmod>2026-11-13T23:19:30.000Z</lastmod><priority>1</priority>'));
  assert.ok(refreshed.includes('/devis-assurance-immeuble</loc><lastmod>2026-11-13T12:28:02.000Z</lastmod>'));
  assert.ok(refreshed.includes('/news/retained</loc><lastmod>2026-11-18</lastmod>'));
  assert.ok(refreshed.includes('https://other.test/</loc><lastmod>2020-01-01</lastmod>'));
  assert.equal(refreshSitemapModificationDates(refreshed, dates), refreshed);
  assert.equal(refreshSitemapModificationDates(xml, new Map()), xml);
});
