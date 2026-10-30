// Public widget key; the server-side verification secret never enters markup.
export const PUBLIC_SITE_KEY_FALLBACK = '0x4AAAAAAD_N1OIMC1z63HG2';
const newsletterForms = /<form\b(?=[^>]*\bclass=["'][^"']*\bnewsletter-form\b[^"']*["'])[^>]*>[\s\S]*?<\/form>/gi;
const escapeAttribute = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function turnstileWidgetMarkup(action, { siteKey, theme } = {}) {
  const key = String(siteKey || '').trim() || PUBLIC_SITE_KEY_FALLBACK;
  const color = ['light', 'dark', 'auto'].includes(theme) ? theme : 'light';
  return `<!-- turnstile-hybrid:start -->\n<div class="turnstile-field" data-turnstile-hybrid="cloudflare-optional"><div class="cf-turnstile" data-sitekey="${escapeAttribute(key)}" data-theme="${color}" data-action="${escapeAttribute(action)}"></div></div>\n<!-- turnstile-hybrid:end -->`;
}

export function protectNewsletterForms(html, options) {
  return html.replace(newsletterForms, form => {
    if (/\bcf-turnstile\b/i.test(form)) return form;
    const widget = turnstileWidgetMarkup('newsletter_subscribe', options);
    if (/<button\b[^>]*type=["']submit["'][^>]*>/i.test(form)) {
      return form.replace(/<button\b[^>]*type=["']submit["'][^>]*>/i, `${widget}\n$&`);
    }
    return form.replace(/<\/form>/i, `${widget}\n</form>`);
  });
}

export function hasProtectedNewsletterForms(html) {
  return [...html.matchAll(newsletterForms)].every(([form]) => {
    const widgets = form.match(/<[^>]+\bclass=["'][^"']*\bcf-turnstile\b[^"']*["'][^>]*>/gi) || [];
    return widgets.length === 1 && /\bdata-sitekey=["'][^"']+["']/i.test(widgets[0])
      && /\bdata-action=["']newsletter_subscribe["']/i.test(widgets[0]);
  });
}
