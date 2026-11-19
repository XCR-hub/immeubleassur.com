import assert from 'node:assert/strict';

const scenarios = [
  ['sci', 'sci', 'multirisque-immeuble', 'immeuble-locatif'],
  ['copropriete', 'syndic-professionnel', 'copropriete', 'copropriete'],
  ['immeuble', 'bailleur', 'multirisque-immeuble', 'immeuble-locatif'],
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
  for (const [intent, profile, need, property, urgency] of scenarios) {
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
      const query = new URLSearchParams({ intent, source_path: '/guides' });
      await page.goto(origin + '/devis-assurance-immeuble?' + query, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('[data-diagnostic]')?.dataset.route);
      const getValues = () => page.$eval('#lead-form', form => ({ profile: form.elements.profile.value, need: form.elements.need.value, property: form.elements.property_type.value }));
      const expected = { profile, need, property };
      assert.deepEqual(await getValues(), { ...expected, profile: intent === 'immeuble' ? '' : profile }, intent + ': the arriving quote is prefilled');
      const refusal = await page.$('[data-analytics-choice="denied"]');
      if (refusal && await refusal.isVisible()) await refusal.click();
      if (urgency) {
        await page.$eval('[data-diagnostic]', element => element.scrollIntoView({ behavior: 'instant' }));
        await page.click(`[data-step="urgency"][data-value="${urgency}"]`);
      }
      await page.$eval('.diagnostic-cta', element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await page.click('.diagnostic-cta');
      assert.deepEqual(await getValues(), expected, intent + ': continuing the diagnostic retains the selected insurance');
      assert.equal(submissions.length, 0, 'Continuing never submits a quote');
      await page.type('#lead-form [name="name"]', 'Local diagnostic fixture');
      await page.type('#lead-form [name="phone"]', '0100000000');
      await page.type('#lead-form [name="city"]', 'Paris');
      await page.click('#lead-form [name="consent"]');
      await page.waitForFunction(() => window.__localTurnstileFixture?.rendered > 0);
      await page.evaluate(() => window.__localTurnstileFixture.release());
      await page.$eval('#lead-form', form => form.requestSubmit());
      await page.waitForFunction(() => document.querySelector('#lead-form .form-status').textContent.includes('LOCAL-DIAGNOSTIC-FIXTURE'));
      assert.equal(submissions.length, 1);
      const payload = submissions[0];
      assert.deepEqual({ profile: payload.profile, need: payload.need, property: payload.property_type }, expected);
      assert.equal(payload.intent, intent);
      assert.equal(payload.source_path, '/guides');
      assert.equal(payload.consent, true);
      assert.deepEqual(errors, []);
      rows.push({ intent, urgency: urgency || 'unchanged', profile, need, property_type: property, local_submissions: 1, production_submissions: 0, passed: true });
    } finally { await page.close(); }
  }
  return rows;
}
