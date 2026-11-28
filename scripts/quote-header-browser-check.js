import assert from 'node:assert/strict';

const callback = '[data-instant-callback-source="quote-inline-callback"]';
const full = '#lead-form';
const scenarios = [
  { id: 'desktop-phone-sci', width: 1280, contact: '0100000000', intent: 'sci', source: '/assurance-sci', callbackConsent: true },
  { id: 'desktop-email-cno', width: 1280, contact: 'header-callback@example.invalid', intent: 'cno', source: '/assurance-cno', callbackConsent: false },
  { id: 'mobile-phone-cno', width: 320, contact: '0100000000', intent: 'cno', source: '/assurance-cno', callbackConsent: true },
  { id: 'mobile-email-sci', width: 390, contact: 'header-callback@example.invalid', intent: 'sci', source: '/assurance-sci', callbackConsent: false },
  { id: 'mobile-diagnostic-choice', width: 390, contact: '0100000000', intent: 'cno', source: '/assurance-cno', callbackConsent: false, diagnostic: true },
  { id: 'mobile-confirmed-callback', width: 390, contact: '0100000000', intent: 'sci', source: '/assurance-sci', callbackConsent: true, receipt: true },
  { id: 'desktop-native-fallback', width: 1280, intent: 'sci', source: '/assurance-sci', javascript: false },
  { id: 'mobile-native-fallback', width: 320, intent: 'cno', source: '/assurance-cno', javascript: false }
];

// Every request is confined to the preview or replaced with a fixture. A hash
// change is expected; only a real document request or lost window marker is a reload.
export async function checkQuoteHeaderNavigation(browser, origin, fixture, key) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const rows = [];
  for (const scenario of scenarios) {
    const page = await browser.newPage();
    const submissions = [];
    const documentRequests = [];
    const errors = [];
    const javascript = scenario.javascript !== false;
    const mobile = scenario.width < 600;
    const marker = 'local-quote-header-' + scenario.id;
    const query = new URLSearchParams({ intent: scenario.intent, source_path: scenario.source });
    const initial = new URL(origin + '/devis-assurance-immeuble?' + query);
    try {
      await page.setViewport({ width: scenario.width, height: 844, isMobile: mobile, hasTouch: mobile });
      await page.setJavaScriptEnabled(javascript);
      await page.evaluateOnNewDocument(testKey => {
        new MutationObserver(() => document.querySelectorAll('.cf-turnstile[data-sitekey]').forEach(widget => { widget.dataset.sitekey = testKey; })).observe(document, { childList: true, subtree: true });
      }, key);
      page.on('pageerror', error => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests.push({ path: url.pathname, query: url.search });
        if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') {
          await request.respond({ status: 200, contentType: 'application/javascript', body: fixture });
        } else if (url.pathname.startsWith('/api/')) {
          assert.equal(url.origin, origin, 'Header fixtures cannot reach a production API');
          if (url.pathname === '/api/leads') submissions.push(JSON.parse(request.postData() || await request.fetchPostData()));
          await request.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"reference":"LOCAL-HEADER-FIXTURE"}' });
        } else if (url.origin !== origin) await request.abort();
        else await request.continue();
      });
      assert.equal((await page.goto(initial.href, { waitUntil: 'networkidle0' })).status(), 200);
      const poll = async (probe, message) => {
        const deadline = Date.now() + 5000;
        do {
          if (await probe()) return;
          await new Promise(resolve => setTimeout(resolve, 50));
        } while (Date.now() < deadline);
        assert.fail(message);
      };
      const activate = async selector => {
        await page.focus(selector);
        assert.equal(await page.$eval(selector, element => document.activeElement === element), true, 'Keyboard activation targets the intended control');
        await page.keyboard.press('Enter');
      };
      const replace = async (selector, value) => {
        await page.focus(selector);
        assert.equal(await page.$eval(selector, field => document.activeElement === field), true);
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(value);
        assert.deepEqual(await page.$eval(selector, field => ({ focused: document.activeElement === field, value: field.value })), { focused: true, value });
      };
      const consent = async (selector, checked) => {
        const field = selector + ' [name="consent"]';
        if (await page.$eval(field, control => control.checked) !== checked) {
          await page.focus(field);
          assert.equal(await page.$eval(field, control => document.activeElement === control), true);
          await page.keyboard.press('Space');
        }
        assert.equal(await page.$eval(field, control => control.checked), checked);
      };
      if (javascript) {
        await page.waitForSelector(callback + '[data-bound="1"]');
        const refusal = await page.$('[data-analytics-choice="denied"]');
        if (refusal && await refusal.isVisible()) await activate('[data-analytics-choice="denied"]');
        if (scenario.diagnostic) {
          await activate('[data-diagnostic-option][data-step="profile"][data-value="sci"]');
          await activate('[data-diagnostic-option][data-step="property"][data-value="logement-vacant"]');
          await activate('.diagnostic-cta');
        }
        await replace(callback + ' [name="contact"]', scenario.contact);
        for (const [name, value] of Object.entries({ name: 'Local header fixture', phone: '0100000001', email: 'header-full@example.invalid', city: 'Paris', message: 'Fixture locale : conserver mes informations et mon choix.' })) {
          await replace(full + ' [name="' + name + '"]', value);
        }
        await consent(callback, scenario.callbackConsent);
        await consent(full, !scenario.callbackConsent);
        if (scenario.receipt) {
          await page.waitForFunction(() => window.__localTurnstileFixture?.rendered > 0);
          await page.evaluate(() => window.__localTurnstileFixture.release());
          await page.$eval(callback, form => form.requestSubmit());
          await poll(() => page.$eval(callback, form => form.dataset.received === '1' && form.dataset.submitting === '0'), 'The isolated callback receives its mocked receipt');
          assert.equal(submissions.length, 1);
          assert.equal(submissions[0].intent, scenario.intent);
          assert.equal(submissions[0].source_path, scenario.source);
          assert.match(await page.$eval(callback + ' .form-status', box => box.textContent), /LOCAL-HEADER-FIXTURE/);
        }
      } else {
        assert.equal(await page.$eval(callback + ' [name="contact"]', field => field.getClientRects().length), 0, 'Native fallback does not expose an unusable form');
      }
      const snapshot = () => page.evaluate(() => {
        const callbackForm = document.querySelector('[data-instant-callback-source="quote-inline-callback"]');
        const fullForm = document.querySelector('#lead-form');
        const diagnostic = document.querySelector('[data-diagnostic]');
        const formState = form => ({ values: Object.fromEntries(new FormData(form).entries()), consent: form.elements.consent.checked, received: form.dataset.received || '', status: form.querySelector('.form-status').textContent, disabled: form.querySelector('button[type="submit"]').disabled });
        return { callback: formState(callbackForm), callbackHeading: document.querySelector('[data-quote-context-title]').textContent, full: formState(fullForm), fullIntent: fullForm.dataset.intent || '', diagnosticRoute: { route: diagnostic.dataset.route || '', selected: diagnostic.dataset.routeSelected || '', userSelected: diagnostic.dataset.userSelected || '' }, diagnostic: [...document.querySelectorAll('[data-diagnostic-option].is-active')].map(option => [option.dataset.step, option.dataset.value]) };
      });
      const before = await snapshot();
      if (scenario.diagnostic) {
        assert.ok(before.diagnostic.some(([step, value]) => step === 'profile' && value === 'sci'));
        assert.ok(before.diagnostic.some(([step, value]) => step === 'property' && value === 'logement-vacant'));
      }
      await page.evaluate(value => { window.__localQuoteHeaderDocument = value; }, marker);
      const countBefore = documentRequests.length;
      const leadsBefore = submissions.length;
      if (mobile) {
        await activate('[data-mobile-navigation] > summary');
        await poll(() => page.$eval('[data-mobile-navigation]', menu => menu.open), 'Native menu is open before following its quote link');
      }
      const headerLink = mobile ? '[data-track="mobile-navigation-quote"]' : '.site-header > .nav a:last-child';
      assert.equal(await page.$eval(headerLink, link => link.getAttribute('href')), '#quote-first-contact');
      await activate(headerLink);
      await poll(async () => new URL(page.url()).hash === '#quote-first-contact' || documentRequests.length > countBefore, 'The header follows its native first-contact anchor');
      assert.equal(await page.evaluate(() => window.__localQuoteHeaderDocument), marker, 'The header retains the same document and every entered value');
      assert.equal(documentRequests.length, countBefore, 'The header issues no new document request');
      assert.equal(new URL(page.url()).pathname, initial.pathname);
      assert.equal(new URL(page.url()).search, initial.search, 'The complete insurance/source query is preserved');
      assert.equal(new URL(page.url()).hash, '#quote-first-contact');
      if (mobile && javascript) await poll(() => page.$eval('[data-mobile-navigation]', menu => !menu.open), 'The application closes the mobile menu after following its quote link');
      if (mobile && !javascript) {
        // Native details stays operable without scripts; the visitor can close
        // it with its summary after following the same-document anchor.
        if (await page.$eval('[data-mobile-navigation]', menu => menu.open)) await activate('[data-mobile-navigation] > summary');
        assert.equal(await page.$eval('[data-mobile-navigation]', menu => menu.open), false);
      }
      const visible = javascript
        ? [callback + ' [name="contact"]', callback + ' button[type="submit"]']
        : [callback + ' [data-quote-contact-fallback] a[href="tel:+33180855786"]', callback + ' [data-quote-contact-fallback] a[href="mailto:team@immeubleassur.com"]'];
      for (const selector of visible) {
        await poll(() => page.$eval(selector, element => {
          const box = element.getBoundingClientRect();
          const header = document.querySelector('.site-header').getBoundingClientRect();
          return element.checkVisibility() && box.height > 0 && box.top >= header.bottom - 1 && box.bottom <= innerHeight + 1 && box.left >= -1 && box.right <= innerWidth + 1;
        }), 'The first-contact controls are visible below the actual header: ' + selector);
      }
      assert.deepEqual(await snapshot(), before, 'Header navigation preserves both forms, independent consents, diagnostic selections and any receipt');
      assert.equal(submissions.length, leadsBefore, 'Following the header never submits a quote');
      assert.deepEqual(errors, []);
      rows.push({ scenario: scenario.id, width: scenario.width, javascript, same_document_verified: true, new_document_requests: 0, values_and_selection_preserved: true, contact_visible_below_header: true, callback_receipt_preserved: Boolean(scenario.receipt), lead_requests: submissions.length, production_submissions: 0, passed: true });
    } catch (error) {
      error.message = `${scenario.id}: ${error.message}`;
      throw error;
    } finally { await page.close(); }
  }
  return rows;
}
