import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const scenarios = [
  { path: '/devis-pno-cno', width: 320, intent: 'pno-cno', profile: 'bailleur', need: 'pno-cno', property: 'lot-copropriete', label: 'PNO/CNO', phone: true },
  { path: '/devis-pno-cno?intent=pno&source_path=%2Fassurance-pno', intent: 'pno', profile: 'bailleur', need: 'pno', property: 'logement-loue', label: 'PNO' },
  { path: '/devis-pno-cno?intent=cno&source_path=%2Fassurance-cno', width: 1280, intent: 'cno', profile: 'bailleur', need: 'cno', property: 'lot-copropriete', label: 'CNO' },
  { path: '/devis-pno-cno?need=cno&source_path=%2Fassurance-cno', width: 320, intent: 'cno', profile: 'bailleur', need: 'cno', property: 'lot-copropriete', label: 'CNO' },
  { path: '/devis-pno-cno?intent=cno', changeProfile: 'sci', intent: 'sci', profile: 'sci', need: 'multirisque-immeuble', property: 'immeuble-locatif', label: 'SCI' },
  { path: '/devis-pno-cno?intent=pno', changeProperty: 'logement-vacant', width: 320, intent: 'pno', profile: 'bailleur', need: 'pno', property: 'logement-vacant', label: 'PNO' },
  { path: '/devis-assurance-immeuble-en-ligne', width: 320, intent: 'immeuble', profile: 'bailleur', need: 'multirisque-immeuble', property: 'immeuble-locatif' },
  { path: '/devis-assurance-immeuble-en-ligne?intent=sci&source_path=%2Fassurance-sci', width: 1280, intent: 'sci', profile: 'sci', need: 'multirisque-immeuble', property: 'immeuble-locatif', label: 'SCI' },
  { path: '/devis-assurance-immeuble-en-ligne?intent=copropriete&source_path=%2Fassurance-copropriete', intent: 'copropriete', profile: 'syndic-professionnel', need: 'copropriete', property: 'copropriete', label: 'Copropriete' }
];
const callback = '[data-instant-callback-source="quote-inline-callback"]';

export async function checkQuoteLandings(browser, origin, turnstileFixture, testKey, screenshotRoot) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const rows = [];
  for (const scenario of [...scenarios, ...['/devis-pno-cno', '/devis-assurance-immeuble-en-ligne'].flatMap(path => [320, 1280].map(width => ({ path, width, javascript: false })))]) {
    const page = await browser.newPage();
    const submissions = [];
    const errors = [];
    const width = scenario.width || 390;
    const javascript = scenario.javascript !== false;
    try {
      await page.setViewport({ width, height: 844, isMobile: width < 600, hasTouch: width < 600 });
      await page.setJavaScriptEnabled(javascript);
      await page.evaluateOnNewDocument(key => {
        new MutationObserver(() => document.querySelectorAll('.cf-turnstile[data-sitekey]').forEach(widget => { widget.dataset.sitekey = key; })).observe(document, { childList: true, subtree: true });
      }, testKey);
      page.on('pageerror', error => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') {
          void request.respond({ status: 200, contentType: 'application/javascript', body: turnstileFixture });
        } else if (url.pathname.startsWith('/api/')) {
          assert.equal(url.origin, origin, 'No quote fixture can reach a production API');
          if (url.pathname === '/api/leads') submissions.push(JSON.parse(request.postData() || await request.fetchPostData()));
          void request.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"reference":"LOCAL-LANDING-FIXTURE"}' });
        } else if (url.origin !== origin) void request.abort();
        else void request.continue();
      });
      const initial = new URL(origin + scenario.path);
      assert.equal((await page.goto(initial.href, { waitUntil: 'networkidle0' })).status(), 200);
      assert.equal(await page.$$eval(callback, forms => forms.length), 1);
      assert.equal(await page.$$eval('#lead-form', forms => forms.length), 1);
      assert.equal(await page.$eval('#lead-form', form => form.hasAttribute('data-simple-form')), true);
      if (javascript) {
        await page.waitForSelector(callback + '[data-bound="1"]');
        await page.waitForFunction(() => document.querySelector('[data-diagnostic]')?.dataset.route);
        assert.equal(await page.$('.lead-action-bar, .quote-fast-track, .content-lead-bridge'), null);
        assert.equal(await page.$('#lead-form .lead-value-preview, #lead-form .form-advisor, #lead-form .ux-form-proof'), null);
        const refusal = await page.$('[data-analytics-choice="denied"]');
        if (refusal && await refusal.isVisible()) await refusal.click();
      }
      for (const selector of [callback + ' [name="contact"]', callback + ' button[type="submit"]']) {
        const box = await page.$eval(selector, element => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; });
        assert.ok(box.top >= 0 && box.bottom <= 844, scenario.path + ': first contact is visible without scrolling ' + JSON.stringify(box));
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width < 600) await page.click('[data-mobile-navigation] > summary');
      const headerLink = width < 600 ? '[data-track="mobile-navigation-quote"]' : '.site-header > .nav a[href="#quote-first-contact"]';
      assert.equal(await page.$eval(headerLink, link => link.getAttribute('href')), '#quote-first-contact');
      await page.click(headerLink);
      await page.waitForFunction(() => location.hash === '#quote-first-contact');
      assert.equal(new URL(page.url()).pathname, initial.pathname);
      assert.equal(new URL(page.url()).search, initial.search, 'Returning to the contact preserves the selected insurance in the URL');
      if (width < 600 && !javascript) await page.click('[data-mobile-navigation] > summary');
      assert.equal(submissions.length, 0);
      if (!javascript) {
        rows.push({ path: scenario.path, width, javascript, native_contact_link_preserves_query: true, production_submissions: 0, passed: true });
        continue;
      }
      if (scenario.changeProfile || scenario.changeProperty) {
        const step = scenario.changeProfile ? 'profile' : 'property';
        const value = scenario.changeProfile || scenario.changeProperty;
        const selector = `[data-diagnostic-option][data-step="${step}"][data-value="${value}"]`;
        await page.$eval(selector, element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.click(selector);
        await page.click('.diagnostic-cta');
      }
      if (scenario.label) assert.ok((await page.$eval('[data-quote-context-title]', element => element.textContent)).includes(scenario.label), scenario.path + ': visible context is retained');
      await page.$eval(callback, element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      if (screenshotRoot && !initial.search && width === 320) {
        mkdirSync(screenshotRoot, { recursive: true });
        await page.$eval('.page-hero', element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await page.screenshot({ path: join(screenshotRoot, initial.pathname.slice(1) + '-mobile.png') });
      }
      await page.type(callback + ' [name="contact"]', scenario.phone ? '0100000000' : 'landing-fixture@example.invalid');
      await page.click(callback + ' button[type="submit"]');
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(submissions.length, 0, 'A contact without consent cannot submit');
      await page.click(callback + ' [name="consent"]');
      await page.click(callback + ' button[type="submit"]');
      await page.waitForFunction(() => window.__localTurnstileFixture?.rendered > 0);
      assert.equal(submissions.length, 0, 'Consent still requires the anti-bot token');
      await page.evaluate(() => window.__localTurnstileFixture.release());
      await page.waitForFunction(selector => document.querySelector(selector + ' [data-instant-callback-status]').textContent.includes('LOCAL-LANDING-FIXTURE'), {}, callback);
      assert.equal(submissions.length, 1);
      const payload = submissions[0];
      assert.deepEqual({ intent: payload.intent, profile: payload.profile, need: payload.need, property: payload.property_type }, { intent: scenario.intent, profile: scenario.profile, need: scenario.need, property: scenario.property }, scenario.path);
      assert.equal(payload.source, 'quote-inline-callback');
      assert.equal(payload.source_path, initial.searchParams.get('source_path') || scenario.path);
      assert.equal(payload.consent, true);
      assert.equal(payload.submission_mode, 'express-callback');
      assert.equal(payload.phone, scenario.phone ? '0100000000' : '');
      assert.equal(payload.email, scenario.phone ? '' : 'landing-fixture@example.invalid');
      assert.match(payload.turnstile_token, /^local-turnstile-fixture-widget-/);
      assert.deepEqual(errors, []);
      rows.push({ path: scenario.path, width, javascript, intent: payload.intent, need: payload.need, property_type: payload.property_type, native_contact_link_preserves_query: true, mocked_submissions: 1, production_submissions: 0, passed: true });
    } finally { await page.close(); }
  }
  return rows;
}
