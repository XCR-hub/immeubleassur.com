import { insurerGuides } from '../content/insurer-guides.js';
import { GOOGLE_SEO_INTERVAL_MINUTES } from './runtime-seo-reports.js';

const coreSlugs = ['', 'assurance-immeuble', 'devis-assurance-immeuble', 'courtier-assurance-immeuble'];
const coverageSlugs = ['assurance-copropriete', 'assurance-cno', 'assurance-pno-cno', 'tarif-assurance-immeuble', 'guides', 'blog', ...insurerGuides.map(guide => guide.slug)];

export function selectUrlInspectionTargets({ site = 'https://immeubleassur.com', rows = [], extraUrls = [], limit = 8, now = Date.now() } = {}) {
  const origin = new URL(site).origin;
  const normalize = value => {
    if (!String(value || '').trim()) return '';
    try {
      const url = new URL(value, origin);
      if (url.origin !== origin || url.username || url.password) return '';
      url.hash = '';
      url.search = '';
      return url.href;
    } catch { return ''; }
  };
  const unique = values => [...new Set(values.map(normalize).filter(Boolean))];
  const requested = Number(limit);
  const budget = Number.isFinite(requested) ? Math.max(1, Math.min(20, Math.floor(requested))) : 8;
  const selected = unique([...extraUrls, ...coreSlugs.map(slug => origin + '/' + slug)]).slice(0, budget);
  const measured = unique(rows.filter(row => Number(row.opportunity_score) >= 40)
    .sort((a, b) => Number(b.opportunity_score) - Number(a.opportunity_score)).map(row => row.page));
  // Retain capacity for discovery even when many measured opportunities exist.
  selected.push(...measured.filter(url => !selected.includes(url)).slice(0, Math.min(2, Math.max(0, budget - selected.length - 1))));
  const pool = unique([...coverageSlugs.map(slug => origin + '/' + slug), ...measured]).filter(url => !selected.includes(url));
  const slots = Math.min(budget - selected.length, pool.length);
  const timestamp = Number(now);
  const cycle = Number.isFinite(timestamp) ? Math.floor(timestamp / (GOOGLE_SEO_INTERVAL_MINUTES * 60000)) : 0;
  const start = pool.length ? ((cycle * slots) % pool.length + pool.length) % pool.length : 0;
  for (let index = 0; index < slots; index++) selected.push(pool[(start + index) % pool.length]);
  return selected;
}
