import assert from 'node:assert/strict';

// Runs only against the isolated static preview. Every API request is intercepted;
// no fake customer, analytics event or challenge token reaches production.
export async function checkLeadSubmissions(browser, origin, turnstileFixture, testKey) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const rows = [];
  for (const kind of ['callback', 'full']) {
    for (const scenario of ['receipt', 'malformed', 'missing-reference', 'timeout', 'rejected']) {
      const page = await browser.newPage();
      const errors = [];
      const requests = [];
      let heldRequest;
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await page.evaluateOnNewDocument((key, fastTimeout) => {
        if (location.hostname !== '127.0.0.1') return;
        const replaceKeys = () => document.querySelectorAll('.cf-turnstile[data-sitekey]').forEach(widget => { widget.dataset.sitekey = key; });
        new MutationObserver(replaceKeys).observe(document, { childList: true, subtree: true });
        document.addEventListener('DOMContentLoaded', replaceKeys, { once: true });
        // Accelerate only the application request deadline in this test browser.
        if (fastTimeout) {
          const setTimer = window.setTimeout.bind(window);
          window.setTimeout = (callback, delay, ...args) => setTimer(callback, delay === 20000 ? 500 : delay, ...args);
        }
      }, testKey, scenario === 'timeout');
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') {
          await request.respond({ status: 200, contentType: 'application/javascript', body: turnstileFixture });
        } else if (url.pathname.startsWith('/api/')) {
          assert.equal(url.origin, origin, 'All API traffic stays on the isolated preview');
          if (url.pathname === '/api/leads') {
            requests.push(JSON.parse(request.postData() || await request.fetchPostData()));
            if (scenario === 'receipt' || (scenario === 'timeout' && requests.length === 1)) {
              heldRequest = request;
              return;
            }
            let status = 200;
            let body = '{"success":true,"reference":"IA-LOCAL-RELIABILITY","notification":"test-only"}';
            if (requests.length === 1) {
              if (scenario === 'malformed') { status = 502; body = '<html>Temporary gateway failure</html>'; }
              if (scenario === 'missing-reference') body = '{"success":true}';
              if (scenario === 'rejected') { status = 422; body = '{"success":false,"error":"Coordonnees a verifier."}'; }
            }
            await request.respond({ status, contentType: 'application/json', body });
          } else await request.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' });
        } else if (url.origin === origin) await request.continue();
        else await request.abort('blockedbyclient');
      });
      try {
        await page.goto(origin + '/devis-assurance-immeuble', { waitUntil: 'networkidle0' });
        const selector = kind === 'callback' ? '[data-instant-callback-source="quote-inline-callback"]' : '#lead-form';
        const other = kind === 'callback' ? '#lead-form' : '[data-instant-callback-source="quote-inline-callback"]';
        await page.waitForSelector('[data-instant-callback-form][data-bound="1"]');
        const refusal = await page.$('[data-analytics-choice="denied"]');
        if (refusal && await refusal.isVisible()) await refusal.click();
        if (kind === 'callback') await page.type(selector + ' [name="contact"]', '0100000000');
        else {
          await page.evaluate(sel => {
            const form = document.querySelector(sel);
            for (const [name, value] of Object.entries({ name: 'Verification locale', phone: '0100000000', profile: 'bailleur', property_type: 'immeuble-locatif', need: 'multirisque-immeuble' })) form.elements[name].value = value;
          }, selector);
        }
        await page.$eval(selector + ' [name="consent"]', field => { field.checked = false; field.scrollIntoView({ block: 'center', behavior: 'instant' }); });
        await page.click(selector + ' [name="consent"]');
        assert.equal(await page.$eval(selector + ' [name="consent"]', field => field.checked), true, `${kind}/${scenario}: the visitor has granted contact consent`);
        const submit = () => page.$eval(selector, form => form.requestSubmit());
        if (kind === 'full' && scenario === 'receipt') {
          await submit();
          assert.match(await page.$eval(selector + ' .form-status', box => box.textContent), /ville/);
          assert.equal(await page.$eval(other + ' .form-status', box => box.textContent), '', 'Full-form validation stays in its own status box');
        }
        if (kind === 'full') await page.type(selector + ' [name="city"]', 'Paris');
        await page.waitForFunction(() => window.__localTurnstileFixture?.rendered > 0);
        if (scenario === 'receipt') {
          await submit();
          await submit();
          assert.equal(await page.$eval(selector, form => form.getAttribute('aria-busy')), 'true');
          assert.equal(requests.length, 0, 'Concurrent submits cannot bypass the challenge');
          await page.click(selector + ' [name="consent"]');
          await page.evaluate(() => window.__localTurnstileFixture.release());
          await page.waitForFunction(sel => document.querySelector(sel).dataset.submitting === '0', {}, selector);
          assert.equal(requests.length, 0, 'Consent withdrawn during the challenge prevents the POST');
          assert.equal(await page.$eval(selector + ' [name="consent"]', field => field.getAttribute('aria-invalid')), 'true');
          assert.equal(await page.$eval(selector + ' [name="consent"]', field => document.activeElement === field), true);
          await page.click(selector + ' [name="consent"]');
        } else await page.evaluate(() => window.__localTurnstileFixture.release());
        await submit();
        if (scenario === 'receipt') {
          await page.waitForFunction(sel => document.querySelector(sel).dataset.submitting === '1', {}, selector);
          const deadline = Date.now() + 5000;
          while (!heldRequest && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
          assert.ok(heldRequest, 'The preview intercepted the lead request');
          await submit();
          await new Promise(resolve => setTimeout(resolve, 150));
          assert.equal(requests.length, 1, 'A second submit during transmission sends no second request');
          assert.equal(await page.$eval(selector + ' button[type="submit"]', button => button.disabled), true);
          await heldRequest.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"reference":"IA-LOCAL-RELIABILITY"}' });
        } else {
          await page.waitForFunction(sel => document.querySelector(sel).dataset.submitting === '0', {}, selector);
          const state = await page.$eval(selector, form => ({ received: form.dataset.received, disabled: form.querySelector('button[type="submit"]').disabled, text: form.querySelector('.form-status').textContent, phone: form.querySelector('.form-status a')?.getAttribute('href') }));
          assert.notEqual(state.received, '1', 'An unsuccessful response cannot confirm receipt');
          assert.equal(state.disabled, false, 'The visitor can explicitly retry');
          if (scenario === 'rejected') assert.match(state.text, /Coordonnees a verifier/);
          else {
            assert.match(state.text, /reception.*pas confirmee/);
            assert.doesNotMatch(state.text, /LOCAL-|sauvegardee/);
            assert.equal(state.phone, 'tel:+33180855786');
          }
          assert.equal(requests.length, 1, 'There is no automatic retry');
          await submit();
        }
        await page.waitForFunction(sel => document.querySelector(sel).dataset.received === '1' && document.querySelector(sel).dataset.submitting === '0', {}, selector);
        assert.match(await page.$eval(selector + ' .form-status', box => box.textContent), /IA-LOCAL-RELIABILITY/);
        assert.equal(await page.$eval(selector, form => form.getAttribute('aria-busy')), 'false');
        assert.equal(await page.$eval(selector + ' button[type="submit"]', button => button.disabled), true);
        const contact = selector + (kind === 'callback' ? ' [name="contact"]' : ' [name="phone"]');
        assert.equal(await page.$eval(contact, field => field.value), '0100000000', 'Entered details survive failures and confirmation');
        const count = requests.length;
        await submit();
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(requests.length, count, 'Confirmed requests cannot be accidentally resubmitted');
        await page.focus(contact);
        await page.keyboard.press('End');
        await page.keyboard.press('Backspace');
        await page.keyboard.type('1');
        assert.equal(await page.$eval(selector + ' button[type="submit"]', button => button.disabled), false, 'An actual visitor edit permits an updated request');
        assert.equal(requests.length, count, 'Editing never sends a request automatically');
        assert.deepEqual(errors, []);
        assert.ok(requests.every(payload => payload.consent === true), `${kind}/${scenario}: every request retains consent`);
        assert.ok(requests.every(payload => /^local-turnstile-fixture-/.test(payload.turnstile_token)), `${kind}/${scenario}: every request retains its released anti-bot token`);
        rows.push({ form: kind, scenario, requests: count, passed: true });
      } finally { await page.close(); }
    }
  }
  return rows;
}
