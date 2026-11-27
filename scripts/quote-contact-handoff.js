import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function addQuoteContactHandoff(html) {
  const version = createHash('sha256').update(readFileSync('public/assets/quote-contact-handoff.js')).digest('hex').slice(0, 10);
  const clean = html.replace(/<!-- quote-contact-handoff:start -->[\s\S]*?<!-- quote-contact-handoff:end -->/g, '');
  return clean.replace('</head>', `<!-- quote-contact-handoff:start --><script type="module" src="/assets/quote-contact-handoff.js?v=${version}"></script><!-- quote-contact-handoff:end --></head>`);
}
