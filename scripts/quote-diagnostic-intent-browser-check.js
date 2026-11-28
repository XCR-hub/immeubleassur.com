import assert from 'node:assert/strict';

const scenarios = [
  ['sci', 'sci', 'multirisque-immeuble', 'immeuble-locatif'],
  ['copropriete', 'syndic-professionnel', 'copropriete', 'copropriete'],
  ['copropriete', 'syndic-professionnel', 'copropriete', 'copropriete', null, '/assurance-immeuble-syndic-professionnel'],
  ['copropriete', 'syndic-professionnel', 'copropriete', 'copropriete', null, '/assurance-immeuble-obligatoire'],
  ['immeuble', 'bailleur', 'multirisque-immeuble', 'immeuble-locatif'],
  ['immeuble', 'bailleur', 'multirisque-immeuble', 'immeuble-locatif', null, '/assurance-immeuble-de-rapport'],
  ['cno', 'bailleur', 'cno', 'lot-copropriete'],
  ['pno', 'bailleur', 'pno', 'logement-loue'],
  ['pno-cno', 'bailleur', 'pno-cno', 'lot-copropriete'],
  ['garages', 'bailleur', 'multirisque-immeuble', 'parking'],
  ['immeuble-vacant', 'bailleur', 'multirisque-immeuble', 'immeuble-vacant'],
  ['travaux', 'syndic-professionnel', 'dommages-ouvrage', 'copropriete'],
  ['local-commercial', 'bailleur', 'multirisque-immeuble', 'commerce'],
  ['prix', 'bailleur', 'multirisque-immeuble', 'immeuble-locatif'],
  ['sinistre', 'bailleur', 'audit-contrat', 'immeuble-locatif'],
  ['audit-contrat', 'bailleur', 'audit-contrat', 'immeuble-locatif'],
  ['sci', 'sci', 'multirisque-immeuble', 'immeuble-locatif', 'prix'],
  ['garages', 'bailleur', 'multirisque-immeuble', 'parking', 'echeance'],
  ['immeuble-vacant', 'bailleur', 'multirisque-immeuble', 'immeuble-vacant', 'creation']
];

export async function checkQuoteDiagnosticIntents(browser, origin, turnstileFixture, testKey) {
  assert.equal(new URL(origin).hostname, '127.0.0.1', 'Quote submissions require an isolated preview');
  const rows = [];
  for (const [intent, profile, need, property, urgency, path] of scenarios) {
    const page = await browser.newPage();
    const submissions = [];
    const errors = [];
    try {
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.evaluateOnNewDocument(key => {
        new MutationObserver(() => document.querySelectorAll('.cf-turnstile[data-sitekey]').forEach(widget => { widget.dataset.sitekey = key; })).observe(document, { childList: true, subtree: true });
      }, testKey);
      await page.setRequestInterception(true);
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', async request => {
        const url = new URL(request.url());
        if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') {
          void request.respond({ status: 200, contentType: 'application/javascript', body: turnstileFixture });
        } else if (url.pathname.startsWith('/api/')) {
          assert.equal(url.origin, origin);
          if (url.pathname === '/api/leads') submissions.push(JSON.parse(request.postData() || await request.fetchPostData()));
          void request.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"reference":"LOCAL-DIAGNOSTIC-FIXTURE","notification":"test-only"}' });
        } else if (url.origin !== origin) void request.abort();
        else void request.continue();
      });
      const sourcePath = path || '/guides';
      const query = new URLSearchParams({ intent, source_path: sourcePath });
      await page.goto(origin + (path || '/devis-assurance-immeuble?' + query), { waitUntil: 'networkidle0' });
      if (path) await page.evaluate(value => { window.__quoteDirectSourceDocument = value; }, path);
      if (!path) await page.waitForFunction(() => document.querySelector('[data-diagnostic]')?.dataset.route);
      const focus = async selector => {
        await page.focus(selector);
        assert.equal(await page.$eval(selector, element => document.activeElement === element), true, 'Keyboard interaction targets the intended control');
      };
      const getValues = () => page.$eval('#lead-form', form => ({ profile: form.elements.profile.value, need: form.elements.need.value, property: form.elements.property_type.value }));
      const expected = { profile, need, property };
      assert.deepEqual(await getValues(), { ...expected, profile: !path && intent === 'immeuble' ? '' : profile }, intent + ': the arriving quote is prefilled');
      const refusal = await page.$('[data-analytics-choice="denied"]');
      if (refusal && await refusal.isVisible()) await refusal.click();
      if (urgency) {
        await page.$eval('[data-diagnostic]', element => element.scrollIntoView({ behavior: 'instant' }));
        await page.click(`[data-step="urgency"][data-value="${urgency}"]`);
      }
      const continueLink = path ? '[data-track="service-full-form"]' : '.diagnostic-cta';
      await page.$eval(continueLink, element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await focus(continueLink);
      await page.keyboard.press('Enter');
      if (path) {
        assert.equal(new URL(page.url()).pathname, path);
        assert.equal(new URL(page.url()).search, '', 'The source form is used without an intent query');
        assert.notEqual(await page.evaluate(() => document.querySelector('[data-diagnostic]')?.dataset.userSelected), '1', 'The source form does not depend on a diagnostic interaction');
      }
      assert.deepEqual(await getValues(), expected, intent + ': continuing retains the selected insurance');
      assert.equal(submissions.length, 0, 'Continuing never submits a quote');
      for (const [name, value] of Object.entries({ name: 'Local diagnostic fixture', phone: '0100000000', city: 'Paris' })) {
        const field = '#lead-form [name="' + name + '"]';
        await focus(field);
        await page.keyboard.type(value);
        assert.equal(await page.$eval(field, element => element.value), value, 'The visitor actually entered the expected value');
      }
      await focus('#lead-form [name="consent"]');
      await page.keyboard.press('Space');
      assert.equal(await page.$eval('#lead-form [name="consent"]', field => field.checked), true);
      if (path) assert.equal(await page.evaluate(() => window.__quoteDirectSourceDocument), path, 'The local form remains in its original document');
      await page.waitForFunction(() => window.__localTurnstileFixture?.rendered > 0);
      await page.evaluate(() => window.__localTurnstileFixture.release());
      await page.$eval('#lead-form', form => form.requestSubmit());
      await page.waitForFunction(() => document.querySelector('#lead-form .form-status').textContent.includes('LOCAL-DIAGNOSTIC-FIXTURE'));
      assert.equal(submissions.length, 1);
      const payload = submissions[0];
      assert.deepEqual({ profile: payload.profile, need: payload.need, property: payload.property_type }, expected);
      assert.equal(payload.intent, intent);
      assert.equal(payload.source_path, sourcePath);
      assert.equal(payload.utm.source_path, sourcePath);
      assert.equal(payload.consent, true);
      if (path) {
        assert.equal(new URL(page.url()).pathname, path);
        assert.equal(new URL(page.url()).search, '');
        assert.equal(await page.evaluate(() => window.__quoteDirectSourceDocument), path);
      }
      assert.deepEqual(errors, []);
      rows.push({ intent, path: path || '/devis-assurance-immeuble', direct_source_form: Boolean(path), urgency: urgency || 'unchanged', profile, need, property_type: property, source_path: payload.source_path, local_submissions: 1, production_submissions: 0, passed: true });
    } finally { await page.close(); }
  }
  return rows;
}
