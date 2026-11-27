import assert from 'node:assert/strict';

const callback = '[data-instant-callback-source="quote-inline-callback"]';
const scenarios = [
  ...['/devis-assurance-immeuble', '/devis-pno-cno', '/devis-assurance-immeuble-en-ligne'].map(path => ({ path, kind: 'callback', firstIntent: 'pno', duplicateUpdate: path === '/devis-assurance-immeuble-en-ligne' })),
  { path: '/devis-assurance-immeuble', kind: 'full', firstIntent: 'immeuble' }
];

async function clickVisible(page, selector) {
  await page.$eval(selector, element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click(selector);
}

async function receiptState(page, selector) {
  return page.$eval(selector, form => ({
    received: form.dataset.received === '1',
    sending: form.dataset.submitting === '1',
    disabled: form.querySelector('button[type="submit"]').disabled,
    label: form.querySelector('button[type="submit"]').textContent,
    status: form.querySelector('.form-status').textContent
  }));
}

async function selectWithKeyboard(page, selector, value) {
  const index = await page.$eval(selector, (field, expected) => [...field.options].findIndex(option => option.value === expected), value);
  assert.ok(index >= 0, 'The native select offers ' + value);
  await page.$eval(selector, field => field.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.focus(selector);
  await page.keyboard.press('Home');
  for (let step = 0; step < index; step++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval(selector, field => field.value), value);
}

async function coordinates(page, selector, kind) {
  return page.$eval(selector, (form, type) => ({
    ...(type === 'callback' ? { contact: form.elements.contact.value } : Object.fromEntries(['name', 'phone', 'city'].map(name => [name, form.elements[name].value]))),
    consent: form.elements.consent.checked
  }), kind);
}

export async function checkQuoteReceiptUpdates(browser, origin, turnstileFixture, testKey) {
  assert.equal(new URL(origin).hostname, '127.0.0.1', 'Receipt updates run only in an isolated preview');
  // The supplied fixture stays unchanged. This extra local gate lets a second
  // explicitly requested submission wait for a token again after its receipt.
  const fixture = turnstileFixture + `\n(() => {
    const getResponse = window.turnstile.getResponse.bind(window.turnstile);
    const gate = window.__quoteReceiptTokenGate = {
      held: true,
      hold() { this.held = true; document.querySelectorAll('[name="cf-turnstile-response"]').forEach(field => { field.value = ''; }); },
      release() { this.held = false; window.__localTurnstileFixture.release(); }
    };
    window.turnstile.getResponse = target => gate.held ? '' : getResponse(target);
  })();`;
  const rows = [];
  for (const scenario of scenarios) {
    const page = await browser.newPage();
    const submissions = [];
    const errors = [];
    const selector = scenario.kind === 'callback' ? callback : '#lead-form';
    const sameOption = '[data-diagnostic-option][data-step="profile"][data-value="bailleur"]';
    const sciOption = '[data-diagnostic-option][data-step="profile"][data-value="sci"]';
    const reference = number => `LOCAL-RECEIPT-UPDATE-${number}`;
    const acknowledgedReference = number => scenario.duplicateUpdate && number === 2 ? reference(1) : reference(number);
    try {
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.evaluateOnNewDocument(key => {
        new MutationObserver(() => document.querySelectorAll('.cf-turnstile[data-sitekey]').forEach(widget => { widget.dataset.sitekey = key; })).observe(document, { childList: true, subtree: true });
      }, testKey);
      page.on('pageerror', error => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') {
          void request.respond({ status: 200, contentType: 'application/javascript', body: fixture });
        } else if (url.pathname.startsWith('/api/')) {
          assert.equal(url.origin, origin, 'Every mocked API call stays on localhost');
          if (url.pathname === '/api/leads') submissions.push(JSON.parse(request.postData() || await request.fetchPostData()));
          const duplicate = scenario.duplicateUpdate && url.pathname === '/api/leads' && submissions.length === 2;
          void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, reference: acknowledgedReference(submissions.length), ...(duplicate ? { duplicate: true, duplicate_reason: 'existing_contact_updated' } : {}), notification: 'test-only' }) });
        } else if (url.origin !== origin) void request.abort();
        else void request.continue();
      });
      await page.goto(origin + scenario.path + '?intent=' + scenario.firstIntent, { waitUntil: 'networkidle0' });
      await page.waitForSelector(callback + '[data-bound="1"]');
      await page.waitForFunction(() => document.querySelector('[data-diagnostic]')?.dataset.route);
      const refusal = await page.$('[data-analytics-choice="denied"]');
      if (refusal && await refusal.isVisible()) await refusal.click();
      if (scenario.kind === 'callback') await page.type(selector + ' [name="contact"]', '0100000000');
      else {
        const fullFormLink = '.page-hero .hero-actions a[href="#lead-form"]';
        assert.equal(await page.$eval(fullFormLink, link => link.textContent), 'Remplir le formulaire complet');
        await clickVisible(page, fullFormLink);
        await page.waitForFunction(() => {
          const top = document.querySelector('#lead-form').getBoundingClientRect().top;
          return location.hash === '#lead-form' && top >= 70 && top < 150;
        });
        const firstField = await page.$eval('#lead-form [name="name"]', field => { const box = field.getBoundingClientRect(); return { top: box.top, bottom: box.bottom }; });
        assert.ok(firstField.top >= 70 && firstField.bottom <= 844, 'The full-form CTA reaches visible fields on mobile: ' + JSON.stringify(firstField));
        assert.equal(await page.$eval('#lead-form', form => form.hasAttribute('data-simple-form')), true);
        assert.equal(await page.$('#lead-form .lead-value-preview, #lead-form .form-advisor, #lead-form .ux-form-proof'), null);
        await clickVisible(page, '.diagnostic-cta');
        for (const [name, value] of Object.entries({ name: 'Local receipt fixture', phone: '0100000000', city: 'Paris' })) await page.type(selector + ` [name="${name}"]`, value);
      }
      await clickVisible(page, selector + ' [name="consent"]');
      const original = await coordinates(page, selector, scenario.kind);
      const originalLabel = (await receiptState(page, selector)).label;
      const submit = () => clickVisible(page, selector + ' button[type="submit"]');
      const waitForReceipt = async number => {
        await page.waitForFunction((formSelector, expected) => {
          const form = document.querySelector(formSelector);
          return form.dataset.received === '1' && form.dataset.submitting === '0' && form.querySelector('.form-status').textContent.includes(expected);
        }, {}, selector, acknowledgedReference(number));
        assert.equal((await receiptState(page, selector)).disabled, true);
        assert.equal(submissions.length, number);
      };
      await submit();
      await page.waitForFunction(() => window.__localTurnstileFixture?.rendered > 0);
      assert.equal(submissions.length, 0, 'A request still waits for its initial anti-bot token');
      await page.evaluate(() => window.__quoteReceiptTokenGate.release());
      await waitForReceipt(1);
      assert.equal(submissions[0].intent, scenario.firstIntent);
      assert.equal(submissions[0].profile, 'bailleur');
      await page.evaluate(() => window.__quoteReceiptTokenGate.hold());
      await page.$eval(selector, form => {
        const contact = form.elements.contact || form.elements.phone;
        contact.dispatchEvent(new InputEvent('input', { bubbles: true }));
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        form.append(hidden);
        hidden.dispatchEvent(new InputEvent('input', { bubbles: true }));
        hidden.remove();
        form.dispatchEvent(new Event('input', { bubbles: true }));
      });
      assert.equal((await receiptState(page, selector)).received, true, 'Synthetic inputs and token changes cannot clear a confirmed receipt');
      assert.equal(await page.$eval(sameOption, option => option.classList.contains('is-active')), true);
      await clickVisible(page, sameOption);
      if (scenario.kind === 'full') await clickVisible(page, '.diagnostic-cta');
      await page.$eval(selector, form => form.requestSubmit());
      assert.equal((await receiptState(page, selector)).received, true, 'Choosing the same active option keeps the existing receipt');
      assert.equal((await receiptState(page, selector)).disabled, true);
      assert.equal(submissions.length, 1, 'An identical selection does not duplicate the request');
      await clickVisible(page, sciOption);
      if (scenario.kind === 'full') await clickVisible(page, '.diagnostic-cta');
      const changed = await receiptState(page, selector);
      assert.equal(changed.received, false, 'An actual change of need clears the old receipt');
      assert.equal(changed.disabled, false, 'The changed request can be submitted explicitly');
      assert.equal(changed.label, originalLabel);
      assert.equal(changed.status.includes(reference(1)), false, 'The previous receipt is no longer displayed as current');
      assert.deepEqual(await coordinates(page, selector, scenario.kind), original, 'Changing need preserves contact details and consent');
      assert.equal(submissions.length, 1, 'Changing need alone sends nothing');
      await submit();
      await page.waitForFunction(formSelector => document.querySelector(formSelector).dataset.submitting === '1', {}, selector);
      assert.equal(submissions.length, 1, 'The updated request still waits for its anti-bot token');
      await page.evaluate(() => window.__quoteReceiptTokenGate.release());
      await waitForReceipt(2);
      if (scenario.duplicateUpdate) assert.match((await receiptState(page, selector)).status, /deja recue/);
      assert.deepEqual({ intent: submissions[1].intent, profile: submissions[1].profile, need: submissions[1].need, property: submissions[1].property_type }, { intent: 'sci', profile: 'sci', need: 'multirisque-immeuble', property: 'immeuble-locatif' }, scenario.kind + ' ' + scenario.path + ': the updated request carries SCI throughout');
      assert.ok(submissions.every(payload => payload.phone === '0100000000' && payload.consent === true && /^local-turnstile-fixture-widget-/.test(payload.turnstile_token)));
      await clickVisible(page, sciOption);
      if (scenario.kind === 'full') await clickVisible(page, '.diagnostic-cta');
      await page.$eval(selector, form => form.requestSubmit());
      assert.equal((await receiptState(page, selector)).received, true, 'The repeated SCI selection keeps its new receipt');
      assert.equal((await receiptState(page, selector)).disabled, true);
      assert.equal(submissions.length, 2);
      if (scenario.kind === 'full') {
        await page.evaluate(() => {
          window.__quoteReceiptTokenGate.hold();
          window.__receiptNativeSelectEvents = [];
          document.querySelector('#lead-form').addEventListener('input', event => {
            if (['need', 'profile', 'property_type'].includes(event.target.name)) window.__receiptNativeSelectEvents.push({ name: event.target.name, trusted: event.isTrusted });
          });
        });
        for (const [name, value] of [['need', 'cno'], ['profile', 'bailleur'], ['property_type', 'lot-copropriete']]) await selectWithKeyboard(page, selector + ` [name="${name}"]`, value);
        const nativeEvents = await page.evaluate(() => window.__receiptNativeSelectEvents);
        assert.ok(nativeEvents.length > 0 && nativeEvents.every(event => event.trusted), 'Native select changes use trusted keyboard events');
        for (const name of ['need', 'profile', 'property_type']) assert.ok(nativeEvents.some(event => event.name === name), name + ': a real keyboard selection occurred');
        assert.equal((await receiptState(page, selector)).received, false, 'A native change clears the SCI receipt');
        assert.equal((await receiptState(page, selector)).disabled, false);
        assert.deepEqual(await coordinates(page, selector, scenario.kind), original, 'Native changes preserve contact and consent');
        assert.equal(submissions.length, 2, 'Native selections never submit automatically');
        await submit();
        await page.waitForFunction(formSelector => document.querySelector(formSelector).dataset.submitting === '1', {}, selector);
        assert.equal(submissions.length, 2, 'The native CNO update still needs its anti-bot token');
        await page.evaluate(() => window.__quoteReceiptTokenGate.release());
        await waitForReceipt(3);
        assert.deepEqual({ intent: submissions[2].intent, profile: submissions[2].profile, need: submissions[2].need, property: submissions[2].property_type }, { intent: 'cno', profile: 'bailleur', need: 'cno', property: 'lot-copropriete' }, 'Native CNO selections replace the earlier SCI intention');
        assert.equal(submissions[2].phone, '0100000000');
        assert.equal(submissions[2].consent, true);
        assert.match(submissions[2].turnstile_token, /^local-turnstile-fixture-widget-/);
      }
      assert.deepEqual(errors, []);
      rows.push({ path: scenario.path, form: scenario.kind, first_intent: scenario.firstIntent, updated_intent: 'sci', ...(scenario.kind === 'full' ? { full_form_link_reaches_visible_fields: true, full_form_uncluttered: true, native_selection_updates_intent: 'cno', native_selection_events_trusted: true } : {}), same_selection_preserves_receipt: true, synthetic_inputs_preserve_receipt: true, contact_and_consent_preserved: true, updated_request_requires_explicit_submission_and_token: true, duplicate_response_reuses_existing_reference: Boolean(scenario.duplicateUpdate), local_submissions: submissions.length, production_submissions: 0, passed: true });
    } catch (error) {
      error.message = scenario.kind + ' ' + scenario.path + ': ' + error.message;
      throw error;
    } finally { await page.close(); }
  }
  return rows;
}
