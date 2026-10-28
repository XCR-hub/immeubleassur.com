import { spawnSync } from 'node:child_process';

// Filesystem mtimes change on checkout and rebuild. Use committed content dates;
// locally changed/new pages receive the build date, and an unavailable Git
// history yields no lastmod hint rather than an invented freshness signal.
export function sitemapModificationDates(cwd = process.cwd(), run = spawnSync, now = new Date()) {
  const options = { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 };
  const history = run('git', ['log', '--format=@%cI', '--name-only', '--relative', '--', 'public'], options);
  const dates = new Map();
  if (history.status !== 0) return dates;
  let date = '';
  for (const raw of history.stdout.split(/\r?\n/)) {
    if (/^@\d{4}-\d{2}-\d{2}T/.test(raw)) date = raw.slice(1, 11);
    else if (date && raw.startsWith('public/') && raw.endsWith('.html') && !dates.has(raw)) dates.set(raw, date);
  }
  const changed = run('git', ['diff', '--name-only', 'HEAD', '--', 'public'], options);
  const added = run('git', ['ls-files', '--others', '--exclude-standard', '--', 'public'], options);
  for (const result of [changed, added]) if (result.status === 0) {
    for (const path of result.stdout.split(/\r?\n/)) if (path.startsWith('public/') && path.endsWith('.html')) dates.set(path, now.toISOString().slice(0, 10));
  }
  return dates;
}
