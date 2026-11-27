import assert from 'node:assert/strict';

// Native form navigation must stay blocked when the application cannot handle
// submission. Every API and external request is intercepted in this preview.
export async function checkQuoteFormNavigation(browser, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const rows = [];
  const scenarios = [
    { path: '/devis-assurance-immeuble', form: 'callback' },
    { path: '/devis-pno-cno', form: 'callback' },
    { path: '/devis-assurance-immeuble-en-ligne', form: 'callback' },
    { path: '/devis-assurance-immeuble', form: 'full' }
  ];
  for (const mode of ['javascript-disabled', 'application-blocked']) {
    for (const scenario of scenarios) {
      const page = await browser.newPage();
      const apiMutations = [];
      const navigations = [];
      let blockedApplicationRequests = 0;
      let policyViolations = 0;
      const selector = scenario.form === 'full' ? '#lead-form' : '[data-instant-callback-source="quote-inline-callback"]';
      try {
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
        await page.setJavaScriptEnabled(mode !== 'javascript-disabled');
        const log = await page.createCDPSession();
        await log.send('Log.enable');
        log.on('Log.entryAdded', ({ entry }) => {
          if (entry.text.includes('form-action')) policyViolations++;
        });
        await page.setRequestInterception(true);
        page.on('request', async request => {
          const url = new URL(request.url());
          if (request.isNavigationRequest()) navigations.push({ method: request.method(), path: url.pathname, queryKeys: [...url.searchParams.keys()] });
          if (mode === 'application-blocked' && url.origin === origin && url.pathname === '/assets/app.js') {
            blockedApplicationRequests++;
            await request.abort();
          } else if (url.pathname.startsWith('/api/')) {
            assert.equal(url.origin, origin);
            if (!['GET', 'HEAD'].includes(request.method())) apiMutations.push(url.pathname);
            await request.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"reference":"LOCAL-NAVIGATION-FIXTURE"}' });
          } else if (url.origin !== origin) await request.abort();
          else await request.continue();
        });
        const response = await page.goto(origin + scenario.path, { waitUntil: 'networkidle0' });
        assert.equal(response.status(), 200);
        assert.match(response.headers()['content-security-policy'], /(?:^|;)\s*form-action 'none'(?:;|$)/);
        assert.match(response.headers()['content-security-policy'], /(?:^|;)\s*connect-src 'self'/);
        if (mode === 'application-blocked') assert.equal(blockedApplicationRequests, 1);
        assert.notEqual(await page.$eval(selector, form => form.dataset.bound), '1');
        if (mode === 'javascript-disabled') {
          const fallback = selector + ' [data-quote-contact-fallback]';
          for (const href of ['tel:+33180855786', 'mailto:team@immeubleassur.com']) {
            const link = await page.$(fallback + ' a[href="' + href + '"]');
            assert.ok(link && await link.isVisible(), 'No-script visitors have a visible way to contact the broker');
          }
          assert.equal(await page.$eval(selector, form => [...form.querySelectorAll('input, select, textarea, button[type="submit"]')].some(control => control.getClientRects().length > 0)), false, 'A no-script visitor is not offered an unusable form');
          // CDP can exercise the browser's native submission even with scripts
          // disabled and the fallback hiding the controls. No API is involved.
          await page.$eval(selector, form => {
            const fields = form.elements.contact ? { contact: 'navigation-fixture@example.invalid' } : { name: 'Local navigation fixture', phone: '0100000000', email: 'navigation-fixture@example.invalid', city: 'Paris', profile: 'bailleur', property_type: 'immeuble-locatif' };
            for (const [name, value] of Object.entries(fields)) form.elements[name].value = value;
            form.elements.consent.checked = true;
          });
        } else {
          if (scenario.form === 'full') {
            for (const [name, value] of Object.entries({ name: 'Local navigation fixture', phone: '0100000000', email: 'navigation-fixture@example.invalid', city: 'Paris' })) {
              await page.type(selector + ' [name="' + name + '"]', value);
            }
            await page.select(selector + ' [name="profile"]', 'bailleur');
            await page.select(selector + ' [name="property_type"]', 'immeuble-locatif');
          } else await page.type(selector + ' [name="contact"]', 'navigation-fixture@example.invalid');
          await page.$eval(selector + ' [name="consent"]', field => { field.checked = false; field.scrollIntoView({ block: 'center', behavior: 'instant' }); });
          await page.click(selector + ' [name="consent"]');
        }
        assert.equal(await page.$eval(selector + ' [name="consent"]', field => field.checked), true);
        assert.equal(await page.$eval(selector + ' button[type="submit"]', button => button.disabled), false);
        const originalUrl = page.url();
        const navigationCount = navigations.length;
        if (mode === 'javascript-disabled') await page.$eval(selector, form => form.requestSubmit());
        else await page.click(selector + ' button[type="submit"]');
        const deadline = Date.now() + 3000;
        while (!policyViolations && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
        assert.ok(policyViolations > 0, scenario.path + ': Chrome blocked native form navigation');
        assert.equal(page.url(), originalUrl, 'Contact details cannot enter browser history or the URL');
        assert.equal(navigations.length, navigationCount, 'No native request can send contact details to the server');
        assert.equal(apiMutations.length, 0, 'A missing application cannot submit an API mutation');
        assert.equal(await page.$eval(selector + (scenario.form === 'full' ? ' [name="email"]' : ' [name="contact"]'), field => field.value), 'navigation-fixture@example.invalid');
        rows.push({ path: scenario.path, form: scenario.form, mode, native_navigation_blocked: true, no_script_contact_fallback_verified: mode === 'javascript-disabled', contact_values_preserved: true, contact_query_exposed: false, api_mutations: 0, production_submissions: 0, passed: true });
      } finally { await page.close(); }
    }
  }
  return rows;
}
