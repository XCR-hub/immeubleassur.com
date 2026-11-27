import assert from 'node:assert/strict';

const callback = '[data-instant-callback-source="quote-inline-callback"]';
const contact = callback + ' [name="contact"]';
const full = '#lead-form';
const completeLink = '.page-hero .hero-actions a[href="#lead-form"]';
const mainPath = '/devis-assurance-immeuble?intent=sci&source_path=%2Fassurance-sci';
const phoneA = '0100000000';
const phoneB = '0100000001';
const phoneC = '0100000002';
const emailA = 'handoff-a@example.invalid';
const emailB = 'handoff-b@example.invalid';
const scenarios = [
  { id: 'main-phone-mobile', path: mainPath, width: 390, value: phoneA, field: 'phone' },
  { id: 'main-email-desktop', path: '/devis-assurance-immeuble?intent=copropriete&source_path=%2Fassurance-copropriete', width: 1280, value: emailA, field: 'email' },
  { id: 'pno-phone-mobile', path: '/devis-pno-cno?intent=pno&source_path=%2Fassurance-pno', width: 320, value: phoneA, field: 'phone' },
  { id: 'cno-email-desktop', path: '/devis-pno-cno?need=cno&source_path=%2Fassurance-cno', width: 1280, value: emailA, field: 'email' },
  { id: 'online-phone-mobile', path: '/devis-assurance-immeuble-en-ligne?intent=garages&source_path=%2Fassurance-garages-parkings', width: 390, value: phoneA, field: 'phone' },
  { id: 'online-email-desktop', path: '/devis-assurance-immeuble-en-ligne?intent=immeuble-vacant&source_path=%2Fassurance-immeuble-vacant', width: 1280, value: emailA, field: 'email' },
  { id: 'automatic-update-and-type-switch', path: '/devis-pno-cno?intent=pno&source_path=%2Fassurance-pno', width: 390 },
  { id: 'manual-correction-and-clear', path: mainPath, width: 1280 },
  { id: 'existing-manual-fields-and-clear', path: '/devis-assurance-immeuble-en-ligne?intent=sci&source_path=%2Fassurance-sci', width: 390 },
  { id: 'independent-consents', path: mainPath, width: 390 },
  { id: 'invalid-and-empty-source', path: '/devis-pno-cno?intent=cno&source_path=%2Fassurance-cno', width: 1280 },
  { id: 'diagnostic-complete-link', path: '/devis-pno-cno?intent=pno&source_path=%2Fassurance-pno', width: 1280 },
  { id: 'sending-and-confirmed-protection', path: mainPath, width: 390 }
];

// The actual module must be supplied by the reviewed HTML. No script injection,
// production endpoint, customer lead or external challenge service is used here.
export async function checkQuoteContactHandoff(browser, origin, fixture, testKey) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const rows = [];
  for (const scenario of scenarios) {
    const page = await browser.newPage();
    const submissions = [];
    const errors = [];
    const manualContactEdits = [];
    let focusCorrections = 0;
    let heldLead;
    try {
      await page.setViewport({ width: scenario.width, height: 844, isMobile: scenario.width < 600, hasTouch: scenario.width < 600 });
      await page.evaluateOnNewDocument(key => {
        new MutationObserver(() => document.querySelectorAll('.cf-turnstile[data-sitekey]').forEach(widget => { widget.dataset.sitekey = key; })).observe(document, { childList: true, subtree: true });
        window.__localHandoffStorage = { active: false, writes: [] };
        window.__localHandoffInputs = [];
        document.addEventListener('input', event => {
          if (event.target.matches?.('#lead-form [name="phone"], #lead-form [name="email"]')) window.__localHandoffInputs.push({ field: event.target.name, value: event.target.value, trusted: event.isTrusted });
        }, { capture: true });
        for (const method of ['setItem', 'removeItem', 'clear']) {
          const original = Storage.prototype[method];
          Storage.prototype[method] = function (...args) {
            const fromModule = (new Error().stack || '').includes('/assets/quote-contact-handoff.js');
            if (window.__localHandoffStorage.active || fromModule) window.__localHandoffStorage.writes.push({ method, fromModule });
            return original.apply(this, args);
          };
        }
      }, testKey);
      page.on('pageerror', error => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') {
          await request.respond({ status: 200, contentType: 'application/javascript', body: fixture });
        } else if (url.pathname.startsWith('/api/')) {
          assert.equal(url.origin, origin, 'Every API request stays in the isolated preview');
          if (url.pathname === '/api/leads') {
            submissions.push(JSON.parse(request.postData() || await request.fetchPostData()));
            if (scenario.id === 'sending-and-confirmed-protection') { heldLead = request; return; }
          }
          await request.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"reference":"LOCAL-HANDOFF-FIXTURE"}' });
        } else if (url.origin !== origin) await request.abort();
        else await request.continue();
      });
      const initial = new URL(origin + scenario.path);
      assert.equal((await page.goto(initial.href, { waitUntil: 'networkidle0' })).status(), 200);
      assert.ok(await page.$('script[type="module"][src^="/assets/quote-contact-handoff.js"]'), 'The page includes its real handoff module');
      await page.waitForSelector(callback + '[data-bound="1"]');
      const refusal = await page.$('[data-analytics-choice="denied"]');
      if (refusal && await refusal.isVisible()) await refusal.click();
      await page.evaluate(() => { window.__localHandoffStorage.active = true; });
      const insurance = () => page.$eval(full, form => ({ profile: form.elements.profile.value, need: form.elements.need.value, property: form.elements.property_type.value }));
      const originalInsurance = await insurance();
      const values = () => page.$eval(full, form => ({ phone: form.elements.phone.value, email: form.elements.email.value }));
      const replace = async (selector, value) => {
        const inputOffset = await page.evaluate(() => window.__localHandoffInputs.length);
        await page.$eval(selector, field => field.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.click(selector);
        if (!await page.$eval(selector, field => document.activeElement === field)) focusCorrections++;
        await page.focus(selector);
        assert.equal(await page.$eval(selector, field => document.activeElement === field), true, 'Keyboard edits target the selected field even while the page scrolls');
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        if (value) await page.keyboard.type(value);
        assert.deepEqual(await page.$eval(selector, field => ({ focused: document.activeElement === field, value: field.value })), { focused: true, value }, 'The actual keyboard edit completed before another handoff');
        if (selector === full + ' [name="phone"]' || selector === full + ' [name="email"]') {
          const field = selector.includes('phone') ? 'phone' : 'email';
          const events = await page.evaluate(offset => window.__localHandoffInputs.slice(offset), inputOffset);
          assert.ok(events.some(event => event.field === field && event.trusted && event.value === value), 'Manual edits, including clearing a field, emit a real trusted input event');
          manualContactEdits.push({ field, verified_value: value, trusted_input_events: events.filter(event => event.field === field && event.trusted).length });
        }
      };
      const consent = async (selector, checked) => {
        const field = selector + ' [name="consent"]';
        if (await page.$eval(field, control => control.checked) !== checked) {
          await page.$eval(field, control => control.scrollIntoView({ block: 'center', behavior: 'instant' }));
          await page.focus(field);
          assert.equal(await page.$eval(field, control => document.activeElement === control), true, 'The consent choice has keyboard focus');
          await page.keyboard.press('Space');
        }
        assert.equal(await page.$eval(field, control => control.checked), checked);
      };
      const continueToFull = async () => {
        const count = submissions.length;
        await page.$eval(completeLink, link => link.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.click(completeLink);
        assert.equal(new URL(page.url()).pathname, initial.pathname);
        assert.equal(new URL(page.url()).search, initial.search, 'Handing off contact details preserves the source and insurance query');
        assert.equal(new URL(page.url()).hash, '#lead-form');
        assert.deepEqual(await insurance(), originalInsurance, 'The contact handoff never changes the insurance selection');
        assert.equal(submissions.length, count, 'Continuing never submits a lead');
      };
      const expectValues = async (phone, email) => assert.deepEqual(await values(), { phone, email });
      const transfer = async (value, phone, email) => {
        await replace(contact, value);
        await continueToFull();
        await expectValues(phone, email);
      };
      if (scenario.field) {
        await transfer(scenario.value, scenario.field === 'phone' ? scenario.value : '', scenario.field === 'email' ? scenario.value : '');
        await consent(callback, false);
        await consent(full, false);
      } else if (scenario.id === 'automatic-update-and-type-switch') {
        await transfer(phoneA, phoneA, '');
        await transfer(phoneB, phoneB, '');
        await transfer(emailA, '', emailA);
        await transfer(emailB, '', emailB);
        await transfer(phoneC, phoneC, '');
      } else if (scenario.id === 'manual-correction-and-clear') {
        await transfer(phoneA, phoneA, '');
        await replace(full + ' [name="phone"]', phoneB);
        await transfer(phoneC, phoneB, '');
        await replace(full + ' [name="phone"]', '');
        await transfer(phoneA, '', '');
      } else if (scenario.id === 'existing-manual-fields-and-clear') {
        await replace(full + ' [name="phone"]', phoneC);
        await replace(full + ' [name="email"]', emailB);
        await transfer(phoneA, phoneC, emailB);
        await transfer(emailA, phoneC, emailB);
        await replace(full + ' [name="email"]', '');
        await transfer(emailB, phoneC, '');
      } else if (scenario.id === 'independent-consents') {
        await consent(callback, true);
        await transfer(phoneA, phoneA, '');
        assert.equal(await page.$eval(full + ' [name="consent"]', control => control.checked), false);
        await consent(full, true);
        await consent(callback, false);
        await transfer(emailA, '', emailA);
        assert.equal(await page.$eval(full + ' [name="consent"]', control => control.checked), true);
        assert.equal(await page.$eval(callback + ' [name="consent"]', control => control.checked), false);
      } else if (scenario.id === 'invalid-and-empty-source') {
        await transfer(phoneA, phoneA, '');
        await transfer('contact@', phoneA, '');
        await transfer('', phoneA, '');
        await transfer(phoneB, phoneB, '');
      } else if (scenario.id === 'diagnostic-complete-link') {
        const profile = '[data-diagnostic-option][data-step="profile"][data-value="sci"]';
        await page.$eval(profile, option => option.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.click(profile);
        await replace(contact, phoneA);
        await expectValues('', '');
        await page.$eval('.diagnostic-cta', link => link.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.click('.diagnostic-cta');
        await expectValues(phoneA, '');
        assert.deepEqual(await insurance(), { profile: 'sci', need: 'multirisque-immeuble', property: 'immeuble-locatif' });
        assert.equal(new URL(page.url()).pathname, initial.pathname);
        assert.equal(new URL(page.url()).search, initial.search);
        assert.equal(await page.$eval(full + ' [name="consent"]', control => control.checked), false);
        assert.equal(await page.$eval(callback + ' [name="consent"]', control => control.checked), false);
      } else if (scenario.id === 'sending-and-confirmed-protection') {
        await transfer(phoneA, phoneA, '');
        await replace(full + ' [name="name"]', 'Local handoff fixture');
        await replace(full + ' [name="city"]', 'Paris');
        await consent(full, true);
        await page.waitForFunction(() => window.__localTurnstileFixture?.rendered > 0);
        await page.evaluate(() => window.__localTurnstileFixture.release());
        await page.$eval(full, form => form.requestSubmit());
        const deadline = Date.now() + 5000;
        while (!heldLead && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
        assert.ok(heldLead, 'The real full-form handler reached only the mocked API');
        assert.equal(submissions.length, 1);
        const payload = submissions[0];
        assert.deepEqual({ phone: payload.phone, email: payload.email, intent: payload.intent, source_path: payload.source_path, consent: payload.consent }, { phone: phoneA, email: '', intent: 'sci', source_path: '/assurance-sci', consent: true });
        assert.match(payload.turnstile_token, /^local-turnstile-fixture-/);
        const receiptState = () => page.$eval(full, form => ({ phone: form.elements.phone.value, email: form.elements.email.value, consent: form.elements.consent.checked, received: form.dataset.received || '', submitting: form.dataset.submitting, status: form.querySelector('.form-status').textContent, disabled: form.querySelector('button[type="submit"]').disabled }));
        const sending = await receiptState();
        assert.equal(sending.submitting, '1');
        assert.equal(sending.disabled, true);
        await replace(contact, phoneB);
        await continueToFull();
        assert.deepEqual(await receiptState(), sending, 'Contact handoff cannot modify a request already being transmitted');
        await heldLead.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"reference":"LOCAL-HANDOFF-FIXTURE"}' });
        await page.waitForFunction(() => document.querySelector('#lead-form').dataset.received === '1' && document.querySelector('#lead-form').dataset.submitting === '0');
        const received = await receiptState();
        assert.equal(received.disabled, true);
        await replace(contact, emailA);
        await continueToFull();
        assert.deepEqual(await receiptState(), received, 'Contact handoff cannot modify or reopen a confirmed request');
        assert.equal(submissions.length, 1);
      }
      assert.deepEqual(await page.evaluate(() => window.__localHandoffStorage.writes), [], 'The contact handoff never writes contact details or state to storage');
      assert.deepEqual(errors, []);
      assert.equal(submissions.length, scenario.id === 'sending-and-confirmed-protection' ? 1 : 0);
      rows.push({ scenario: scenario.id, path: scenario.path, width: scenario.width, contact_handoff_verified: true, insurance_and_source_preserved: true, trusted_manual_contact_edits: manualContactEdits, explicit_focus_corrections: focusCorrections, lead_requests: submissions.length, storage_writes: 0, production_submissions: 0, passed: true });
    } catch (error) {
      error.message = `${scenario.id}: ${error.message}`;
      throw error;
    } finally { await page.close(); }
  }
  return rows;
}
