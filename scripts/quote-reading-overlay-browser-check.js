import assert from 'node:assert/strict';

const scenarios = [
  { path: '/assurance-immeuble-obligatoire', quote: true },
  { path: '/assurance-immeuble-de-rapport', quote: true },
  { path: '/blog/assurance-immeuble-ancien', quote: false }
];

// Drive reading time and depth before focusing any form field: formStarted
// would otherwise suppress the popup and conceal the original obstruction.
export async function checkQuoteReadingOverlays(browser, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const rows = [];
  for (const scenario of scenarios) {
    const page = await browser.newPage();
    const events = [];
    const errors = [];
    let leads = 0;
    try {
      await page.setViewport({ width: 320, height: 844, isMobile: true, hasTouch: true });
      await page.evaluateOnNewDocument(() => {
        const timer = window.setTimeout.bind(window);
        window.setTimeout = (callback, delay, ...args) => timer(callback, delay === 20000 ? 250 : delay, ...args);
      });
      page.on('pageerror', error => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/')) {
          assert.equal(url.origin, origin, 'Every overlay fixture API request stays in the isolated preview');
          if (url.pathname === '/api/leads') leads++;
          if (url.pathname === '/api/events') {
            const payload = JSON.parse(request.postData() || await request.fetchPostData());
            events.push(...(Array.isArray(payload) ? payload : [payload]));
          }
          await request.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' });
        } else if (url.origin !== origin) await request.abort();
        else await request.continue();
      });
      assert.equal((await page.goto(origin + scenario.path, { waitUntil: 'networkidle0' })).status(), 200);
      await page.waitForSelector(scenario.quote ? '.lead-action-bar[data-short-quote-bar="1"]' : '.lead-action-bar');
      assert.equal(await page.$('[data-article-reading]'), null, 'The scenario does not rely on the separate reading-layout exclusion');
      if (scenario.quote) assert.equal(await page.$$eval('[data-short-quote-entry]', links => links.length), 1);
      else {
        assert.equal(await page.$('[data-short-quote-entry]'), null);
        assert.ok(await page.$('.rich-article, .article-layout'));
      }
      const poll = async (probe, message) => {
        const deadline = Date.now() + 5000;
        do {
          if (await probe()) return;
          await new Promise(resolve => setTimeout(resolve, 50));
        } while (Date.now() < deadline);
        assert.fail(scenario.path + ': ' + message);
      };
      assert.equal(events.some(event => event.event_type === 'form_start'), false, 'No form interaction masks the reading trigger');
      const scrollable = await page.evaluate(() => {
        const distance = document.documentElement.scrollHeight - innerHeight;
        window.scrollTo({ top: distance * .65, behavior: 'instant' });
        return distance;
      });
      assert.ok(scrollable > 0);
      await poll(() => events.some(event => event.event_type === 'scroll_depth' && event.target === '50'), 'The actual application reaches its fifty-percent reading trigger');
      await new Promise(resolve => setTimeout(resolve, 350));
      assert.equal(events.some(event => event.event_type === 'form_start'), false);
      if (scenario.quote) {
        assert.equal(await page.$('.content-lead-bridge'), null, 'A page already offering the short quote has no extra reading popup');
        assert.equal(events.filter(event => event.event_type === 'content_lead_bridge_shown').length, 0);
        const refusal = await page.$('[data-analytics-choice="denied"]');
        if (refusal && await refusal.isVisible()) {
          await page.focus('[data-analytics-choice="denied"]');
          await page.keyboard.press('Enter');
        }
        const selector = '[data-track="service-full-form"]';
        await page.$eval(selector, link => link.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await poll(() => page.$eval(selector, link => {
          const box = link.getBoundingClientRect();
          const header = document.querySelector('.site-header').getBoundingClientRect().bottom;
          const bar = document.querySelector('.lead-action-bar')?.getBoundingClientRect();
          const bottom = bar?.height ? Math.min(innerHeight, bar.top) : innerHeight;
          const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return box.height > 0 && box.top >= header && box.bottom <= bottom && (target === link || link.contains(target));
        }), 'The centered full-form link receives the actual pointer');
        await page.evaluate(path => { window.__quoteOverlaySourceDocument = path; }, scenario.path);
        await page.click(selector);
        await poll(() => page.$eval('#lead-form', form => {
          const header = document.querySelector('.site-header').getBoundingClientRect().bottom;
          const bar = document.querySelector('.lead-action-bar')?.getBoundingClientRect();
          const bottom = bar?.height ? Math.min(innerHeight, bar.top) : innerHeight;
          return ['name', 'phone'].every(name => {
            const field = form.elements[name];
            const box = field.getBoundingClientRect();
            return box.height > 0 && box.top >= header && box.bottom <= bottom && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === field;
          });
        }), 'Name and phone stay visible and directly reachable below the header and above the sticky bar');
        assert.equal(new URL(page.url()).pathname, scenario.path);
        assert.equal(new URL(page.url()).hash, '#lead-form');
        assert.equal(await page.evaluate(() => window.__quoteOverlaySourceDocument), scenario.path);
        assert.equal(await page.$('.content-lead-bridge'), null);
        assert.equal(events.filter(event => event.event_type === 'content_lead_bridge_shown').length, 0);
      } else {
        await poll(async () => Boolean(await page.$('.content-lead-bridge')), 'A standard reading article retains its useful quote popup');
        const quoteUrl = new URL(await page.$eval('.content-lead-bridge [data-content-bridge-quote]', link => link.href));
        assert.equal(quoteUrl.origin, origin);
        assert.equal(quoteUrl.pathname, '/devis-assurance-immeuble');
        assert.equal(quoteUrl.searchParams.get('source_path'), scenario.path);
        assert.equal(quoteUrl.searchParams.get('content_bridge'), '1');
        await poll(() => events.some(event => event.event_type === 'content_lead_bridge_shown'), 'The eligible article reports its visible prompt');
        assert.equal(events.filter(event => event.event_type === 'content_lead_bridge_shown').length, 1);
      }
      assert.equal(leads, 0, 'Reading and opening a form never submit a lead');
      assert.deepEqual(errors, []);
      rows.push({ path: scenario.path, width: 320, reading_time_and_depth_exercised: true, short_quote_page: scenario.quote, popup_shown: !scenario.quote, full_form_bounds_and_hit_targets_verified: scenario.quote, lead_requests: 0, production_submissions: 0, passed: true });
    } catch (error) {
      error.message = `${scenario.path}: ${error.message}`;
      throw error;
    } finally { await page.close(); }
  }
  return rows;
}
