import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import * as chromeLauncher from 'chrome-launcher';

// Delay the application until after first paint: this reproduces the cold-load
// race that previously inserted a second quote selector into the viewport.
const chromePath = process.env.CHROME_PATH || chromeLauncher.Launcher.getInstallations()[0];
if (!chromePath) throw new Error('Chrome is required for the page stability check.');
const reserve = createServer();
await new Promise(r => reserve.listen(0, '127.0.0.1', r));
const port = reserve.address().port;
await new Promise(r => reserve.close(r));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['scripts/local-static-server.js'], { cwd: resolve('.'), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', x => { output += x; });
child.stderr.on('data', x => { output += x; });
let browser;
const rows = [];
const navigationRows = [];
// The external anti-bot service is replaced only inside this isolated browser.
// Tokens are withheld until the test explicitly releases them, so the actual
// application's consent and anti-bot gates are exercised without live CI access.
const turnstileTestKey = '1x00000000000000000000AA';
const turnstileFixture = readFileSync(new URL('./fixtures/turnstile-browser-fixture.js', import.meta.url), 'utf8');
const deadline = Date.now() + 30000;
try {
  while (true) {
    if (child.exitCode !== null) throw new Error(`Preview failed: ${output.slice(-300)}`);
    try { if ((await fetch(origin + '/', { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Preview did not start.');
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-first-run'] });
  for (const path of ['/assurance-immeuble', '/devis-assurance-immeuble', '/', '/guide-recherche-fuite-immeuble', '/assurance-garages-parkings']) {
    const page = await browser.newPage();
    const errors = [];
    const trackedEvents = [];
    let leadSubmissions = 0;
    const localCallbacks = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(testKey => {
      if (location.hostname !== '127.0.0.1') return;
      const useTestKey = () => document.querySelectorAll('.cf-turnstile[data-sitekey]').forEach(widget => { widget.dataset.sitekey = testKey; });
      new MutationObserver(useTestKey).observe(document, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', useTestKey, { once: true });
    }, turnstileTestKey);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') {
        void request.respond({ status: 200, contentType: 'application/javascript', body: turnstileFixture });
      } else if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/leads') {
          assert.equal(url.origin, origin, 'Lead checks are confined to the isolated preview.');
          leadSubmissions++;
          localCallbacks.push(JSON.parse(request.postData() || await request.fetchPostData()));
          void request.respond({ status: 200, contentType: 'application/json', body: '{"success":true,"reference":"LOCAL-CALLBACK-FIXTURE","notification":"test-only"}' });
          return;
        }
        if (url.pathname === '/api/events') {
          try {
            const body = request.postData() || await request.fetchPostData();
            trackedEvents.push(JSON.parse(body || '{}'));
          } catch { /* Assertion below requires valid initial events. */ }
        }
        void request.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' });
      } else if (url.pathname === '/assets/app.js') {
        setTimeout(() => { void request.continue(); }, 1500);
      } else { void request.continue(); }
    });
    await page.evaluateOnNewDocument(() => {
      window.__pageStabilityShifts = [];
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__pageStabilityShifts.push({ value: entry.value, at: entry.startTime });
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const response = await page.goto(origin + path, { waitUntil: 'networkidle0', timeout: 30000 });
    const analyticsRefusal = await page.$('[data-analytics-choice="denied"]');
    if (analyticsRefusal && await analyticsRefusal.isVisible()) await analyticsRefusal.click();
    await page.waitForSelector(path === '/devis-assurance-immeuble' ? '[data-instant-callback-source="quote-inline-callback"][data-bound="1"]' : '.lead-action-bar', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));
    const row = await page.evaluate(() => {
      let cls = 0, sessionValue = 0, sessionStart = 0, previous = 0;
      for (const entry of window.__pageStabilityShifts) {
        if (entry.at - previous < 1000 && entry.at - sessionStart < 5000) sessionValue += entry.value;
        else { sessionValue = entry.value; sessionStart = entry.at; }
        previous = entry.at;
        cls = Math.max(cls, sessionValue);
      }
      return { cls, duplicateSelectors: document.querySelectorAll('.quote-fast-track').length, overflow: document.documentElement.scrollWidth > innerWidth, h1: document.querySelectorAll('h1').length };
    });
    assert.equal(response.status(), 200, path);
    if (process.env.LOCAL_PAGE_STABILITY_SCREENSHOT_ROOT && ['/devis-assurance-immeuble', '/assurance-garages-parkings'].includes(path)) {
      const screenshotRoot = resolve(process.env.LOCAL_PAGE_STABILITY_SCREENSHOT_ROOT);
      mkdirSync(screenshotRoot, { recursive: true });
      await page.screenshot({ path: resolve(screenshotRoot, path.slice(1) + '.png') });
    }
    if (path === '/devis-assurance-immeuble') {
      const startVisible = await page.$eval('[data-instant-callback-source="quote-inline-callback"] input[name="contact"]', field => {
        const box = field.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= innerHeight;
      });
      assert.equal(startVisible, true, 'The first contact field is visible on mobile without scrolling.');
      const submitVisible = await page.$eval('[data-instant-callback-source="quote-inline-callback"] button[type="submit"]', button => {
        const box = button.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= innerHeight;
      });
      assert.equal(submitVisible, true, 'The callback submit button is also visible on the first mobile screen.');
      assert.equal(await page.$('.lead-action-bar'), null, 'A duplicate sticky bar must not cover the callback or consent.');
      row.quoteStartVisible = true;
    }
    const widgetState = await page.evaluate(testKey => {
      const widgets = [...document.querySelectorAll('.cf-turnstile[data-sitekey]')];
      return { count: widgets.length, valid: widgets.every(widget => widget.dataset.sitekey === testKey) };
    }, turnstileTestKey);
    assert.equal(widgetState.valid, true, `${path}: production Turnstile key entered the local test`);
    if (path !== '/guide-recherche-fuite-immeuble') assert.ok(widgetState.count > 0, `${path}: expected Turnstile widget missing`);
    row.turnstileTestKeyVerified = true;
    row.turnstileWidgets = widgetState.count;
    assert.ok(row.cls <= .1, `${path}: CLS ${row.cls.toFixed(3)} exceeds 0.1 with delayed JavaScript`);
    assert.equal(row.duplicateSelectors, 0, `${path}: duplicate quote selector`);
    assert.equal(row.overflow, false, `${path}: horizontal overflow`);
    assert.equal(row.h1, 1, path);
    const menu = '[data-mobile-navigation]';
    assert.equal(await page.$eval(menu, element => element.open), false);
    await page.focus(menu + ' > summary');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval(menu, element => element.open), true, `${path}: the menu opens from the keyboard`);
    assert.ok(await page.$eval(menu + ' .mobile-navigation-panel', element => {
      const box = element.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
    }), `${path}: the menu stays inside the mobile viewport`);
    assert.equal(await page.$eval(menu + ' a[href="tel:+33180855786"]', element => element.checkVisibility()), true);
    if (process.env.LOCAL_PAGE_STABILITY_SCREENSHOT_ROOT && path === '/devis-assurance-immeuble') {
      await page.screenshot({ path: resolve(process.env.LOCAL_PAGE_STABILITY_SCREENSHOT_ROOT, 'mobile-navigation-open.png') });
    }
    assert.equal(await page.$eval(menu + ' .mobile-navigation-panel', panel => {
      const last = [...panel.querySelectorAll('a')].at(-1);
      last.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      const box = last.getBoundingClientRect();
      const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return target === last || last.contains(target);
    }), true, `${path}: floating quote buttons do not cover the last menu link`);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.track), 'mobile-navigation-quote');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval(menu, element => element.open), false);
    assert.equal(await page.$eval(menu + ' > summary', element => document.activeElement === element), true, 'Escape restores focus');
    await page.click(menu + ' > summary');
    await page.evaluate(() => document.querySelector('h1').click());
    assert.equal(await page.$eval(menu, element => element.open), false);
    row.mobileNavigationVerified = true;
    assert.equal(trackedEvents.filter(event => event.event_type === 'page_view').length, 1, `${path}: initial visit missing or duplicated`);
    assert.equal(trackedEvents.filter(event => event.event_type === 'experiment_view').length, 1, `${path}: experiment context missing or duplicated`);
    assert.match(trackedEvents.find(event => event.event_type === 'page_view').viewport, /^\d+x\d+$/, 'Deferred tracking retains measured viewport dimensions');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    await new Promise(r => setTimeout(r, 150));
    assert.equal(trackedEvents.filter(event => event.event_type === 'page_view').length, 1, `${path}: navigation duplicated the initial visit`);
    row.initialTrackingVerified = true;
    if (path === '/assurance-immeuble' || path === '/devis-assurance-immeuble') {
      await page.waitForFunction(() => document.querySelector('[data-diagnostic]')?.dataset.route);
      await page.click('[data-diagnostic-option][data-step="profile"][data-value="sci"]');
      await page.waitForFunction(() => document.querySelector('[data-diagnostic]')?.dataset.route === 'sci');
      await page.click('.diagnostic-cta');
      const values = await page.evaluate(() => ({ profile: document.querySelector('#lead-form [name="profile"]').value, need: document.querySelector('#lead-form [name="need"]').value }));
      assert.equal(values.profile, 'sci');
      assert.equal(values.need, 'multirisque-immeuble');
      row.diagnosticPrefillVerified = true;
    }
    if (path === '/') {
      await page.waitForSelector('.traffic-no-click-rescue', { visible: true, timeout: 15000 });
      const variant = await page.$eval('.traffic-no-click-rescue', panel => panel.dataset.rescueVariant);
      assert.ok(variant, 'The callback panel retains its active variant');
      assert.ok(trackedEvents.some(event => event.event_type === 'traffic_without_click_shown' && event.rescue_variant === variant), 'Callback panel exposure is tracked');
      await page.click('[data-traffic-no-click-close]');
      await page.focus('.hero-inline-callback input[name="contact"]');
      await new Promise(r => setTimeout(r, 150));
      assert.ok(trackedEvents.some(event => event.event_type === 'form_start' && event.source === 'homepage-inline-callback' && event.rescue_variant === variant), 'Inline callback focus retains the active variant without throwing');
      row.instantCallbackVerified = true;
    }
    if (path === '/assurance-immeuble') {
      await page.evaluate(() => {
        const f = document.querySelector('#lead-form');
        f.elements.name.value = 'Verification locale';
        f.elements.phone.value = '0612345678';
        for (const name of ['profile', 'property_type']) f.elements[name].value = [...f.elements[name].options].find(o => o.value).value;
        f.elements.city.value = '';
        f.elements.consent.checked = true;
        f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await new Promise(r => setTimeout(r, 700));
      const validation = await page.evaluate(() => {
        const input = document.querySelector('#lead-form').elements.city;
        const box = input.getBoundingClientRect();
        return { focused: document.activeElement === input, visible: box.top >= 0 && box.bottom <= innerHeight,
          invalid: input.getAttribute('aria-invalid'), message: document.querySelector('#lead-form .form-status').textContent };
      });
      assert.equal(validation.focused, true);
      assert.equal(validation.visible, true);
      assert.equal(validation.invalid, 'true');
      assert.match(validation.message, /ville du bien/);
      row.missingCityVerified = true;
    }
    if (path === '/devis-assurance-immeuble') {
      const callback = '[data-instant-callback-source="quote-inline-callback"]';
      await page.$eval(callback, element => element.scrollIntoView({ block: 'center' }));
      await page.type(callback + ' input[name="contact"]', '0100000000');
      await page.click(callback + ' button[type="submit"]');
      await new Promise(r => setTimeout(r, 400));
      assert.equal(leadSubmissions, 0, 'Consent is required before the callback can be sent.');
      await page.click(callback + ' input[name="consent"]');
      await page.click(callback + ' button[type="submit"]');
      await page.waitForFunction(() => window.__localTurnstileFixture?.rendered > 0);
      await new Promise(r => setTimeout(r, 400));
      assert.equal(leadSubmissions, 0, 'Consent alone cannot submit a protected form without an anti-bot token.');
      await page.evaluate(() => window.__localTurnstileFixture.release());
      await page.waitForFunction(selector => document.querySelector(selector + ' [data-instant-callback-status]').textContent.includes('LOCAL-CALLBACK-FIXTURE'), { timeout: 25000 }, callback);
      assert.equal(localCallbacks.length, 1);
      assert.equal(localCallbacks[0].source, 'quote-inline-callback');
      assert.equal(localCallbacks[0].profile, 'sci', 'The callback retains the selected SCI journey.');
      assert.equal(localCallbacks[0].need, 'multirisque-immeuble');
      assert.equal(localCallbacks[0].phone, '0100000000');
      assert.equal(localCallbacks[0].consent, true);
      assert.equal(localCallbacks[0].submission_mode, 'express-callback');
      assert.match(localCallbacks[0].message, /page de devis/);
      assert.match(localCallbacks[0].turnstile_token, /^local-turnstile-fixture-widget-/, 'Only the released local fixture token reaches the mocked lead endpoint.');
      assert.equal(await page.$('.traffic-no-click-rescue'), null, 'The visible callback is not covered by a duplicate overlay.');
      row.quoteCallbackVerified = true;
      row.antiBotGateVerified = true;
    }
    if (path === '/assurance-garages-parkings') {
      assert.equal(await page.$eval('#lead-form [name="property_type"]', field => field.value), 'parking');
      assert.equal(await page.$eval('#lead-form [name="profile"]', field => field.value), 'bailleur');
      row.parkingPrefillVerified = true;
    }
    assert.equal(leadSubmissions, path === '/devis-assurance-immeuble' ? 1 : 0, 'Only the isolated callback fixture may be submitted.');
    assert.deepEqual(errors, [], path);
    rows.push({ path, ...row, lead_submissions: leadSubmissions });
    await page.close();
  }
  // Also exercise the native disclosure with JavaScript disabled, including
  // archived pages and layouts from each independent content generator.
  const navigationCases = [
    ['/', 320, 720], ['/assurance-sci', 390, 844],
    ['/assurance-pno-cno', 390, 844], ['/recherches-assurance-immeuble', 390, 844],
    ['/blog/assurance-immeuble-ancien', 390, 844],
    ['/news/veille-assurance-immeuble-2026-08-03', 390, 844],
    ['/guides', 1024, 768], ['/faq', 720, 360],
    ['/assurance-immeuble', 1280, 900]
  ];
  for (const [path, width, height] of navigationCases) {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setViewport({ width, height });
    const response = await page.goto(origin + path, { waitUntil: 'networkidle0' });
    assert.equal(response.status(), 200, path);
    const summary = '[data-mobile-navigation] > summary';
    if (width <= 1100) {
      assert.equal(await page.$eval(summary, element => element.checkVisibility()), true, `${path}: menu available without JavaScript`);
      await page.focus(summary);
      await page.keyboard.press('Enter');
      assert.equal(await page.$eval('[data-mobile-navigation]', element => element.open), true);
      const geometry = await page.$eval('.mobile-navigation-panel', element => {
        const box = element.getBoundingClientRect();
        return { inViewport: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
          scrollable: element.scrollHeight > element.clientHeight, overflow: getComputedStyle(element).overflowY };
      });
      assert.equal(geometry.inViewport, true, `${path}: menu fits ${width}x${height}`);
      if (geometry.scrollable) assert.equal(geometry.overflow, 'auto', 'Every link remains reachable in a short viewport');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.track), 'mobile-navigation-quote');
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.keyboard.press('Enter')]);
      assert.equal(new URL(page.url()).pathname, '/devis-assurance-immeuble', 'The native quote link works without JavaScript');
    } else {
      assert.equal(await page.$eval('.site-header > .nav', element => element.checkVisibility()), true);
      assert.equal(await page.$eval(summary, element => element.checkVisibility()), false);
      assert.equal(await page.$eval('.site-header', element => element.scrollWidth > element.clientWidth), false);
    }
    navigationRows.push({ path, width, height, javascript: false, passed: true });
    await page.close();
  }
  const navigationPage = await browser.newPage();
  await navigationPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await navigationPage.setRequestInterception(true);
  navigationPage.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      assert.equal(request.url().startsWith(origin + '/api/'), true);
      void request.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    } else void request.continue();
  });
  await navigationPage.goto(origin + '/', { waitUntil: 'networkidle0' });
  await navigationPage.click('[data-mobile-navigation] > summary');
  await Promise.all([navigationPage.waitForNavigation({ waitUntil: 'networkidle0' }), navigationPage.click('[data-track="mobile-navigation-quote"]')]);
  assert.equal(new URL(navigationPage.url()).pathname, '/devis-assurance-immeuble', 'Header navigation opens the short quote page when JavaScript is enabled');
  await navigationPage.waitForSelector('[data-instant-callback-source="quote-inline-callback"][data-bound="1"]');
  navigationRows.push({ path: '/', width: 390, height: 844, javascript: true, shortQuoteNavigation: true, passed: true });
  await navigationPage.close();
  const report = { generated_at: new Date().toISOString(), success: true, viewport: { width: 390, height: 844 }, script_delay_ms: 1500, cpu_slowdown: 4, rows, navigationRows };
  const target = resolve(process.env.LOCAL_PAGE_STABILITY_REPORT || 'reports/page-stability-browser-report.json');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  console.log(`Page stability passed: ${rows.length} pages, worst delayed-load CLS=${Math.max(...rows.map(r => r.cls)).toFixed(3)}, ${navigationRows.length} navigation checks, callback consent and local fixture verified, no production lead submitted.`);
} finally {
  if (browser) {
    let shutdownTimer;
    const forceClose = () => {
      const browserProcess = browser.process();
      if (browserProcess?.pid && process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(browserProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
      else browserProcess?.kill();
      browser.disconnect();
    };
    try {
      await Promise.race([browser.close().catch(forceClose), new Promise(resolve => {
        shutdownTimer = setTimeout(() => { forceClose(); resolve(); }, 5000);
      })]);
    } finally { clearTimeout(shutdownTimer); }
  }
  child.kill();
  await new Promise(r => { child.once('exit', r); setTimeout(r, 1500); });
}
