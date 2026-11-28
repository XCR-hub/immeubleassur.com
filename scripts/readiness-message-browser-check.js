import assert from 'node:assert/strict';

const personal = 'Message personnel local : huit logements, un commerce et des travaux a expliquer au conseiller.';
const formSelector = '#lead-form';
const messageSelector = '#lead-form [name="message"]';
const checklist = value => `[data-readiness-item][value="${value}"]`;

async function clickVisible(page, selector) {
  await page.$eval(selector, field => field.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.click(selector);
}

async function message(page) {
  return page.$eval(messageSelector, field => field.value);
}

async function formState(page) {
  return page.$eval(formSelector, form => ({
    values: Object.fromEntries(['name', 'phone', 'city', 'profile', 'property_type', 'need', 'message'].map(name => [name, form.elements[name].value])),
    consent: form.elements.consent.checked,
    received: form.dataset.received === '1',
    submitting: form.dataset.submitting === '1',
    disabled: form.querySelector('button[type="submit"]').disabled,
    status: form.querySelector('.form-status').textContent
  }));
}

async function selectWithKeyboard(page, name, value) {
  const selector = '#lead-form [name="' + name + '"]';
  const index = await page.$eval(selector, (field, expected) => [...field.options].findIndex(option => option.value === expected), value);
  assert.ok(index >= 0);
  await page.$eval(selector, field => field.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.focus(selector);
  await page.keyboard.press('Home');
  for (let step = 0; step < index; step++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval(selector, field => field.value), value);
}

export async function checkReadinessMessages(browser, origin, turnstileFixture, testKey) {
  assert.equal(new URL(origin).hostname, '127.0.0.1', 'Readiness checks require an isolated preview');
  const rows = [];
  for (const width of [320, 390]) for (const scenario of ['manual-first', 'generated-update', 'manual-edit-clear', 'received', 'sending']) {
    const page = await browser.newPage();
    const submissions = [];
    const errors = [];
    let pendingRequest;
    try {
      await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true });
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
          assert.equal(url.origin, origin, 'All API calls stay on localhost');
          if (url.pathname === '/api/leads') {
            submissions.push(JSON.parse(request.postData() || await request.fetchPostData()));
            if (scenario === 'sending') { pendingRequest = request; return; }
          }
          void request.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"reference":"LOCAL-READINESS-GUARD","notification":"test-only"}' });
        } else if (url.origin !== origin) void request.abort();
        else void request.continue();
      });
      await page.goto(origin + '/devis-assurance-immeuble', { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('[data-readiness]')?.dataset.level);
      const refusal = await page.$('[data-analytics-choice="denied"]');
      if (refusal && await refusal.isVisible()) await refusal.click();
      assert.equal(await message(page), '', 'The initial full-form message is empty');
      await page.$eval(messageSelector, field => {
        window.__readinessMessageInputs = [];
        for (const type of ['input', 'change']) field.addEventListener(type, event => window.__readinessMessageInputs.push({ type, trusted: event.isTrusted }));
      });
      if (scenario === 'manual-first') await page.type(messageSelector, personal);
      await clickVisible(page, checklist('contrat-actuel'));
      await clickVisible(page, '.readiness-cta');
      const first = await message(page);
      if (scenario === 'manual-first') {
        assert.equal(first, personal, 'A message entered before using the checklist remains authoritative');
        await clickVisible(page, checklist('appel-prime'));
        await clickVisible(page, '.readiness-cta');
        assert.equal(await message(page), personal);
      } else {
        assert.match(first, /Pieces disponibles: contrat actuel\./);
      }
      if (scenario === 'generated-update') {
        await clickVisible(page, checklist('appel-prime'));
        await clickVisible(page, '.readiness-cta');
        const updated = await message(page);
        assert.notEqual(updated, first, 'An unchanged checklist-owned summary follows the new choices');
        assert.match(updated, /Pieces disponibles: contrat actuel, appel de prime\./);
        assert.equal((updated.match(/Dossier pret assureur/g) || []).length, 1, 'The generated summary is updated without duplication');
        await clickVisible(page, checklist('contrat-actuel'));
        await clickVisible(page, '.readiness-cta');
        assert.match(await message(page), /Pieces disponibles: appel de prime\./);
      }
      if (scenario === 'manual-edit-clear') {
        await page.focus(messageSelector);
        await page.keyboard.press('End');
        await page.keyboard.type(' ' + personal);
        const edited = await message(page);
        await clickVisible(page, checklist('appel-prime'));
        await clickVisible(page, '.readiness-cta');
        assert.equal(await message(page), edited, 'A native correction to a generated summary is preserved');
        await page.focus(messageSelector);
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        assert.equal(await message(page), '');
        await clickVisible(page, checklist('sinistres-36-mois'));
        await clickVisible(page, '.readiness-cta');
        assert.equal(await message(page), '', 'A native clearing of the message is also authoritative');
        const events = await page.evaluate(() => window.__readinessMessageInputs);
        assert.ok(events.some(event => event.type === 'input' && event.trusted));
        assert.ok(events.some(event => event.type === 'change' && event.trusted));
      }
      if (scenario === 'received' || scenario === 'sending') {
        for (const [name, value] of Object.entries({ name: 'Local readiness fixture', phone: '0100000000', city: 'Paris' })) await page.type('#lead-form [name="' + name + '"]', value);
        await selectWithKeyboard(page, 'profile', 'bailleur');
        await selectWithKeyboard(page, 'property_type', 'immeuble-locatif');
        await clickVisible(page, '#lead-form [name="consent"]');
        await page.waitForFunction(() => window.__localTurnstileFixture?.rendered > 0);
        await page.evaluate(() => window.__localTurnstileFixture.release());
        await clickVisible(page, '#lead-form button[type="submit"]');
        if (scenario === 'received') {
          await page.waitForFunction(() => document.querySelector('#lead-form').dataset.received === '1' && document.querySelector('#lead-form').dataset.submitting === '0');
        } else {
          await page.waitForFunction(() => document.querySelector('#lead-form').dataset.submitting === '1');
          const deadline = Date.now() + 5000;
          while (!pendingRequest && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
          assert.ok(pendingRequest);
        }
        const protectedState = await formState(page);
        await clickVisible(page, checklist('appel-prime'));
        await clickVisible(page, '.readiness-cta');
        assert.deepEqual(await formState(page), protectedState, 'The checklist cannot change a received or in-flight form');
        assert.equal(submissions.length, 1, 'Checklist actions send no additional lead');
        assert.equal(submissions[0].message, first);
        assert.equal(submissions[0].consent, true);
        assert.match(submissions[0].turnstile_token, /^local-turnstile-fixture-widget-/);
        if (pendingRequest) {
          await pendingRequest.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"reference":"LOCAL-READINESS-GUARD","notification":"test-only"}' });
          pendingRequest = null;
          await page.waitForFunction(() => document.querySelector('#lead-form').dataset.received === '1' && document.querySelector('#lead-form').dataset.submitting === '0');
        }
      } else {
        assert.equal(submissions.length, 0, 'Preparing a message never submits a lead');
        assert.equal((await formState(page)).consent, false, 'Preparing a message cannot grant consent');
      }
      assert.deepEqual(errors, []);
      rows.push({ width, scenario, manual_input_preserved: scenario === 'manual-first' || scenario === 'manual-edit-clear', generated_message_updates: scenario === 'generated-update', protected_form_unchanged: scenario === 'received' || scenario === 'sending', local_submissions: submissions.length, production_submissions: 0, passed: true });
    } catch (error) {
      error.message = width + 'px ' + scenario + ': ' + error.message;
      throw error;
    } finally { await page.close(); }
  }
  return rows;
}
