import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasProtectedNewsletterForms, protectNewsletterForms, turnstileWidgetMarkup } from './turnstile-markup.js';

const form = `<form class="newsletter-form" data-newsletter-source="daily"><input name="email" /><button type="submit">M'abonner</button></form>`;

test('daily editorial output protects every newsletter form without loading a third-party script', () => {
  const html = protectNewsletterForms(form + form, { siteKey: 'public-widget-key' });
  assert.equal(hasProtectedNewsletterForms(html), true);
  assert.equal((html.match(/data-action="newsletter_subscribe"/g) || []).length, 2);
  assert.equal(html.includes('<script'), false);
  assert.equal(protectNewsletterForms(html), html, 'The static build must not duplicate runtime widgets');
});

test('publication rejects a missing widget and a widget that belongs to another form', () => {
  assert.equal(hasProtectedNewsletterForms(form), false);
  const misplaced = `<div>${turnstileWidgetMarkup('newsletter_subscribe')}</div>${form}`;
  assert.equal(hasProtectedNewsletterForms(misplaced), false);
  assert.equal(hasProtectedNewsletterForms(form.replace('</form>', turnstileWidgetMarkup('lead_form') + '</form>')), false);
  assert.equal(hasProtectedNewsletterForms(protectNewsletterForms(form) + form), false);
  assert.equal(hasProtectedNewsletterForms('<main>No subscription form</main>'), true);
});

test('widget markup uses only escaped public settings and retains deferred rendering', () => {
  const html = turnstileWidgetMarkup('newsletter_subscribe', { siteKey: 'key" onfocus="unsafe', theme: 'invalid' });
  assert.ok(html.includes('data-sitekey="key&quot; onfocus=&quot;unsafe"'));
  assert.ok(html.includes('data-theme="light"'));
  assert.equal(html.includes('api.js'), false);
});
