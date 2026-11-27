import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const styleVersion = createHash('sha256').update(readFileSync('public/assets/quote-contact-fallback.css')).digest('hex').slice(0, 10);
const fallback = `<noscript data-quote-contact-fallback><link rel="stylesheet" href="/assets/quote-contact-fallback.css?v=${styleVersion}" /><p>Pour envoyer ce formulaire, activez JavaScript. Vous pouvez aussi demander votre devis en <a href="tel:+33180855786">appelant le 01 80 85 57 86</a> ou en <a href="mailto:team@immeubleassur.com">écrivant à team@immeubleassur.com</a>.</p></noscript>`;

export function addQuoteContactFallback(html) {
  return html.replace(/<noscript data-quote-contact-fallback>[\s\S]*?<\/noscript>/g, '')
    .replace(/<form\b(?=[^>]*(?:\bid="lead-form"|\bdata-instant-callback-form(?:\s|>)))[^>]*>/g, tag => tag + fallback);
}
