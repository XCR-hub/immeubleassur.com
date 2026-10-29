import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
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
const deadline = Date.now() + 30000;
try {
  while (true) {
    if (child.exitCode !== null) throw new Error(`Preview failed: ${output.slice(-300)}`);
    try { if ((await fetch(origin + '/', { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Preview did not start.');
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-first-run'] });
  for (const path of ['/assurance-immeuble', '/devis-assurance-immeuble', '/', '/guide-recherche-fuite-immeuble']) {
    const page = await browser.newPage();
    const errors = [];
    const trackedEvents = [];
    let leadSubmissions = 0;
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/leads') leadSubmissions++;
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
    await page.waitForSelector('.lead-action-bar', { timeout: 10000 });
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
    assert.ok(row.cls <= .1, `${path}: CLS ${row.cls.toFixed(3)} exceeds 0.1 with delayed JavaScript`);
    assert.equal(row.duplicateSelectors, 0, `${path}: duplicate quote selector`);
    assert.equal(row.overflow, false, `${path}: horizontal overflow`);
    assert.equal(row.h1, 1, path);
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
    assert.equal(leadSubmissions, 0, 'The browser check must not submit a lead.');
    assert.deepEqual(errors, [], path);
    rows.push({ path, ...row, lead_submissions: leadSubmissions });
    await page.close();
  }
  const report = { generated_at: new Date().toISOString(), success: true, viewport: { width: 390, height: 844 }, script_delay_ms: 1500, cpu_slowdown: 4, rows };
  const target = resolve(process.env.LOCAL_PAGE_STABILITY_REPORT || 'reports/page-stability-browser-report.json');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  console.log(`Page stability passed: ${rows.length} pages, worst delayed-load CLS=${Math.max(...rows.map(r => r.cls)).toFixed(3)}, quote prefill verified, no lead submitted.`);
} finally {
  if (browser) await browser.close();
  child.kill();
  await new Promise(r => { child.once('exit', r); setTimeout(r, 1500); });
}
