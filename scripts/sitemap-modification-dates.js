import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const policy = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const normalize = lines => lines.join('\n').replace(/(\/assets\/[^\s"'<>?]+)\?v=[a-z0-9._-]+/gi, '$1').replace(/\s+/g, ' ').trim();

export function validSitemapModificationDate(value) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  return Boolean(match && Number.isFinite(Date.parse(value)) && new Date(match[1] + 'T00:00:00Z').toISOString().slice(0, 10) === match[1] && (match[2] === undefined || (Number(match[2]) <= 23 && Number(match[3]) <= 59 && Number(match[4] || 0) <= 59)));
}

// Only committed content is publishable. Rebuilds, checkout mtimes and shared
// asset cache versions must not make an unchanged page appear recently edited.
export function committedHtmlDates(patch) {
  const dates = new Map();
  let date = '', file = '', before = [], after = [];
  const finish = () => {
    if (file && date && !dates.has(file) && normalize(before) !== normalize(after)) dates.set(file, date);
    before = []; after = [];
  };
  for (const line of patch.split(/\r?\n/)) {
    if (/^@\d{4}-\d{2}-\d{2}T/.test(line)) {
      finish(); file = '';
      const timestamp = new Date(line.slice(1));
      date = Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : '';
    } else if (line.startsWith('diff --git ')) {
      finish();
      file = line.match(/^diff --git a\/(public\/[a-z0-9_./-]+\.html) b\/\1$/i)?.[1] || '';
    } else if (file && !line.startsWith('--- ') && !line.startsWith('+++ ')) {
      if (line.startsWith('-')) before.push(line.slice(1));
      if (line.startsWith('+')) after.push(line.slice(1));
    }
  }
  finish();
  return dates;
}

export function sitemapModificationDates(cwd = process.cwd(), run = spawnSync, now = new Date()) {
  const options = { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024, timeout: 60000 };
  const git = ['-c', `safe.directory=${cwd}`, '--no-pager'];
  const revision = run('git', [...git, 'rev-parse', 'HEAD'], options);
  if (revision.status !== 0) return new Map();
  const head = revision.stdout.trim();
  const cache = join(cwd, 'data', 'sitemap-content-dates-cache.json');
  const validDates = entries => new Map(entries.filter(([path, date]) => /^public\/.+\.html$/.test(path) && validSitemapModificationDate(date) && Date.parse(date) <= now.getTime()));
  if (run === spawnSync && existsSync(cache)) {
    try {
      const saved = JSON.parse(readFileSync(cache, 'utf8'));
      if (saved.revision === head && saved.policy === policy && Array.isArray(saved.dates) && saved.dates.every(row => Array.isArray(row) && row.length === 2 && row.every(value => typeof value === 'string'))) return validDates(saved.dates);
    } catch { /* A cache is optional; committed history remains authoritative. */ }
  }
  const history = run('git', [...git, 'log', '--first-parent', '--format=@%cI', '--no-ext-diff', '--no-renames', '--no-color', '--unified=0', '-p', '--', ':(glob)public/**/*.html'], options);
  if (history.status !== 0) return new Map();
  const dates = [...committedHtmlDates(history.stdout)];
  if (run === spawnSync) {
    try {
      mkdirSync(dirname(cache), { recursive: true });
      const temporary = `${cache}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify({ revision: head, policy, dates }));
      renameSync(temporary, cache);
    } catch { /* Read-only builds do not require a cache. */ }
  }
  return validDates(dates);
}

export function refreshSitemapModificationDates(xml, dates) {
  return xml.replace(/<url>[\s\S]*?<\/url>/g, entry => {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
    let url;
    try { url = new URL(loc); } catch { return entry; }
    if (url.origin !== 'https://immeubleassur.com' || url.search || url.hash) return entry;
    const path = url.pathname === '/' ? 'public/index.html' : 'public' + url.pathname.replace(/\/$/, '') + '.html';
    const date = dates.get(path);
    if (!date || !validSitemapModificationDate(date)) return entry;
    return /<lastmod>[^<]*<\/lastmod>/.test(entry) ? entry.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${date}</lastmod>`) : entry.replace('</loc>', `</loc><lastmod>${date}</lastmod>`);
  });
}
