import assert from 'node:assert/strict';

const callback = '[data-instant-callback-source="quote-inline-callback"]';
const reference = 'LOCAL-TURNSTILE-LOAD-FIXTURE';

// These are browser/network failures, not lead API failures. Challenge traffic
// never leaves the intercepted preview and every lead API response is mocked.
export async function checkTurnstileLoading(browser, origin, fixture, key) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const rows = [];
  const gatedFixture = fixture + `\n(() => {
    const response = window.turnstile.getResponse.bind(window.turnstile);
    const gate = window.__localTurnstileLoadGate = {
      held: true,
      hold() { this.held = true; document.querySelectorAll('[name="cf-turnstile-response"]').forEach(field => { field.value = ''; }); },
      release() { this.held = false; window.__localTurnstileFixture.release(); }
    };
    window.turnstile.getResponse = target => gate.held ? '' : response(target);
  })();`;
  for (const kind of ['callback', 'full']) {
    for (const mode of ['held-script', 'script-error']) {
      const page = await browser.newPage();
      const selector = kind === 'callback' ? callback : '#lead-form';
      const requests = [];
      const oldRequests = [];
      const errors = [];
      let retry = false;
      let scriptRequests = 0;
      let lastScriptStartedAt = 0;
      try {
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
        await page.evaluateOnNewDocument(testKey => {
          window.__localTurnstileLoadScripts = [];
          new MutationObserver(records => {
            document.querySelectorAll('.cf-turnstile[data-sitekey]').forEach(widget => { widget.dataset.sitekey = testKey; });
            for (const record of records) for (const node of record.addedNodes) {
              if (node.nodeName === 'SCRIPT' && node.src.startsWith('https://challenges.cloudflare.com/turnstile/v0/api.js')) window.__localTurnstileLoadScripts.push(node);
            }
          }).observe(document, { childList: true, subtree: true });
        }, key);
        page.on('pageerror', error => errors.push(error.message));
        await page.setRequestInterception(true);
        page.on('request', async request => {
          const url = new URL(request.url());
          if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') {
            scriptRequests++;
            lastScriptStartedAt = Date.now();
            if (retry) await request.respond({ status: 200, contentType: 'application/javascript', headers: { 'Cache-Control': 'no-store' }, body: gatedFixture });
            else if (mode === 'script-error') await request.abort('failed');
            else oldRequests.push(request);
          } else if (url.pathname.startsWith('/api/')) {
            assert.equal(url.origin, origin, 'No challenge-recovery fixture can reach production');
            if (url.pathname === '/api/leads') requests.push(JSON.parse(request.postData() || await request.fetchPostData()));
            await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, reference }) });
          } else if (url.origin !== origin) await request.abort();
          else await request.continue();
        });
        assert.equal((await page.goto(origin + '/devis-assurance-immeuble?intent=sci&source_path=%2Fassurance-sci', { waitUntil: 'networkidle0' })).status(), 200);
        await page.waitForSelector(callback + '[data-bound="1"]');
        const focus = async field => {
          await page.focus(field);
          assert.equal(await page.$eval(field, element => document.activeElement === element), true);
        };
        const refusal = await page.$('[data-analytics-choice="denied"]');
        if (refusal && await refusal.isVisible()) { await focus('[data-analytics-choice="denied"]'); await page.keyboard.press('Enter'); }
        const fields = kind === 'callback' ? { contact: '0100000000' } : { name: 'Local challenge fixture', phone: '0100000000', city: 'Paris' };
        for (const [name, value] of Object.entries(fields)) {
          const field = selector + ' [name="' + name + '"]';
          await focus(field);
          await page.keyboard.type(value);
          assert.equal(await page.$eval(field, element => element.value), value);
        }
        await focus(selector + ' [name="consent"]');
        await page.keyboard.press('Space');
        assert.equal(await page.$eval(selector + ' [name="consent"]', field => field.checked), true);
        const values = await page.$eval(selector, form => Object.fromEntries(new FormData(form).entries()));
        const started = Date.now();
        await focus(selector + ' button[type="submit"]');
        await page.keyboard.press('Enter');
        const recovered = () => page.$eval(selector, form => form.dataset.submitting === '0' && form.getAttribute('aria-busy') === 'false' && !form.querySelector('button[type="submit"]').disabled && /Verification anti-robot indisponible/.test(form.querySelector('.form-status').textContent));
        const failureDeadline = Date.now() + 14000;
        while (!await recovered() && Date.now() < failureDeadline) await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(await recovered(), true, kind + '/' + mode + ': failed challenge loading releases the form after its bounded deadline');
        const failureDuration = Date.now() - started;
        const failedScriptAge = Date.now() - lastScriptStartedAt;
        if (mode === 'held-script') assert.ok(failedScriptAge >= 9500 && failedScriptAge < 14000, 'The held script is bounded by the ten-second loading deadline');
        assert.notEqual(await page.$eval(selector, form => form.dataset.received), '1');
        assert.deepEqual(await page.$eval(selector, form => Object.fromEntries(new FormData(form).entries())), values);
        assert.equal(requests.length, 0, 'A failed challenge never submits a lead');
        assert.ok(scriptRequests > 0);
        const obsoleteCount = await page.evaluate(() => {
          window.__localObsoleteTurnstileScripts = [...window.__localTurnstileLoadScripts];
          return window.__localObsoleteTurnstileScripts.length;
        });
        assert.ok(obsoleteCount > 0, 'The recovery scenario retains the actual obsolete script element');
        // A held transport may complete after the UI timeout. Deliver only the
        // fixture; a removed/cancelled browser request may reject this response.
        for (const request of oldRequests) {
          if (request.isInterceptResolutionHandled() || request.failure()) continue;
          try { await request.respond({ status: 200, contentType: 'application/javascript', headers: { 'Cache-Control': 'no-store' }, body: gatedFixture }); }
          catch (error) { if (!/intercept|cancel|request.*handled|resource.*identifier/i.test(error.message)) throw error; }
        }
        if (mode === 'held-script') {
          const lateDeadline = Date.now() + 1000;
          while (!await page.evaluate(() => Boolean(window.__localTurnstileLoadGate)) && Date.now() < lateDeadline) await new Promise(resolve => setTimeout(resolve, 25));
          await page.evaluate(() => window.__localTurnstileLoadGate?.release());
          await new Promise(resolve => setTimeout(resolve, 250));
          assert.equal(requests.length, 0, 'A late script and token cannot revive an expired submission');
          await page.evaluate(() => window.__localTurnstileLoadGate?.hold());
        }
        retry = true;
        await focus(selector + ' button[type="submit"]');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.__localTurnstileFixture?.rendered > 0);
        assert.equal(await page.$eval(selector, form => form.dataset.submitting), '1');
        assert.equal(requests.length, 0, 'The explicit retry still waits for a token');
        await page.evaluate(() => {
          for (const script of window.__localObsoleteTurnstileScripts) {
            script.dispatchEvent(new Event('error'));
            script.dispatchEvent(new Event('load'));
          }
        });
        assert.equal(await page.$eval(selector, form => form.dataset.submitting), '1', 'Obsolete script events cannot cancel the new attempt');
        assert.equal(requests.length, 0);
        await page.evaluate(() => window.__localTurnstileLoadGate.release());
        await page.waitForFunction(selector => document.querySelector(selector).dataset.received === '1' && document.querySelector(selector).dataset.submitting === '0', {}, selector);
        assert.equal(requests.length, 1, 'Only the explicit recovered attempt reaches the mocked API');
        assert.equal(requests[0].phone, '0100000000');
        assert.equal(requests[0].consent, true);
        assert.equal(requests[0].intent, 'sci');
        assert.equal(requests[0].source_path, '/assurance-sci');
        assert.match(requests[0].turnstile_token, /^local-turnstile-fixture-/);
        assert.match(await page.$eval(selector + ' .form-status', box => box.textContent), new RegExp(reference));
        assert.equal(await page.$eval(selector + ' button[type="submit"]', button => button.disabled), true);
        assert.deepEqual(await page.$eval(selector, form => Object.fromEntries(new FormData(form).entries())), values);
        assert.deepEqual(errors, []);
        rows.push({ form: kind, scenario: mode, failed_load_recovery_ms: failureDuration, failed_script_age_ms: failedScriptAge, initial_lead_requests: 0, values_and_consent_preserved: true, late_obsolete_events_verified: true, manual_retry_confirmed: true, mocked_lead_requests: 1, production_submissions: 0, passed: true });
      } catch (error) {
        error.message = `${kind}/${mode}: ${error.message}`;
        throw error;
      } finally { await page.close(); }
    }
  }
  return rows;
}
