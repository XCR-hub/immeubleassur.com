import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const origin = 'https://immeubleassur.com';
const bootstrapVersion = createHash('sha256').update(readFileSync(new URL('../public/assets/ga4-init.js', import.meta.url))).digest('hex').slice(0, 10);
const privatePath = /^(?:admin[^/]*|espace-client|espace-assureur|questionnaire-immeuble|merci)(?:\/|$)/i;
export function analyticsMeasurementId(config = JSON.parse(readFileSync(new URL('../config/analytics.json', import.meta.url), 'utf8'))) {
  if (config.site_origin !== origin) return '';
  const id = String(config.measurement_id || '').trim();
  return /^G-[A-Z0-9]+$/i.test(id) ? id : '';
}
export function analyticsTagBlock(slug = '', config) {
  const path = String(slug).replace(/^\/+/, '').replace(/\.html$/, '');
  if (privatePath.test(path)) return '';
  const id = analyticsMeasurementId(config);
  if (!id) return '';
  return '<!-- analytics:start -->\n<meta name="ia-ga4-measurement-id" content=' + JSON.stringify(id)
    + '>\n<script defer src="/assets/ga4-init.js?v=' + bootstrapVersion + '"></script>\n<!-- analytics:end -->';
}
