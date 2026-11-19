import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const cases = [
  { path: '/assurance-immeuble', route: 'immeuble', badge: 'Parcours immeuble', profile: 'bailleur', need: 'multirisque-immeuble', property: 'immeuble-locatif' },
  { path: '/assurance-copropriete', route: 'copropriete', badge: 'Parcours copropriete', profile: 'syndic-professionnel', need: 'copropriete', property: 'copropriete' },
  { path: '/assurance-sci', route: 'sci', badge: 'Parcours SCI', profile: 'sci', need: 'multirisque-immeuble', property: 'immeuble-locatif' }
];

export async function checkServiceDiagnostics(browser, origin, screenshotRoot) {
  assert.equal(new URL(origin).hostname, '127.0.0.1', 'Diagnostic interactions require an isolated preview');
  const rows = [];
  for (const scenario of cases) {
    for (const javascript of [false, true]) {
      const page = await browser.newPage();
      let leads = 0;
      const errors = [];
      try {
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
        await page.setJavaScriptEnabled(javascript);
        await page.setRequestInterception(true);
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => {
          const url = new URL(request.url());
          if (url.pathname.startsWith('/api/')) {
            if (url.pathname === '/api/leads') leads++;
            void request.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' });
          } else if (url.origin !== origin) void request.abort();
          else void request.continue();
        });
        const response = await page.goto(origin + scenario.path, { waitUntil: 'networkidle0', timeout: 30000 });
        assert.equal(response.status(), 200);
        if (javascript) await page.waitForFunction(() => document.querySelector('[data-diagnostic]')?.dataset.route, { timeout: 15000 });
        assert.equal(await page.$eval('.diagnostic-route', element => element.textContent), scenario.badge, `${scenario.path}: the initial subject survives JavaScript loading`);
        assert.equal(await page.$eval('[data-step="profile"].is-active', element => element.dataset.value), scenario.profile);
        assert.equal(new URL(await page.$eval('.diagnostic-cta', element => element.href)).searchParams.get('intent'), scenario.route);
        const initial = await page.$eval('[data-diagnostic]', element => ({ title: element.querySelector('h3').textContent, text: element.querySelector('.diagnostic-result-text').textContent, items: [...element.querySelectorAll('.diagnostic-next li')].map(item => item.textContent) }));
        const prior = rows.find(row => row.path === scenario.path && !row.javascript);
        if (prior) assert.deepEqual(initial, prior.initial, 'Server and browser describe the same insurance subject');
        if (javascript) {
          const refusal = await page.$('[data-analytics-choice="denied"]');
          if (refusal && await refusal.isVisible()) await refusal.click();
          await page.$eval('.diagnostic-cta', element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
          await page.click('.diagnostic-cta');
          const values = await page.$eval('#lead-form', form => ({ profile: form.elements.profile.value, need: form.elements.need.value, property: form.elements.property_type.value }));
          assert.deepEqual(values, { profile: scenario.profile, need: scenario.need, property: scenario.property }, 'Continuing retains the service in the detailed quote');
          assert.equal(new URL(page.url()).pathname, scenario.path);
          if (screenshotRoot) {
            mkdirSync(screenshotRoot, { recursive: true });
            await (await page.$('[data-diagnostic]')).screenshot({ path: join(screenshotRoot, scenario.path.slice(1) + '-diagnostic.png') });
          }
          await page.$eval('[data-diagnostic]', element => element.scrollIntoView({ behavior: 'instant' }));
          await page.click('[data-step="profile"][data-value="bailleur"]');
          await page.click('[data-step="property"][data-value="lot-copropriete"]');
          assert.equal(await page.$eval('[data-diagnostic]', element => element.dataset.route), 'cno', 'A deliberate change of need remains available');
        }
        assert.equal(leads, 0, 'Choosing a diagnostic never sends a lead');
        assert.deepEqual(errors, []);
        rows.push({ path: scenario.path, javascript, initial, route: scenario.route, detailed_form_verified: javascript, production_leads_submitted: 0, passed: true });
      } finally { await page.close(); }
    }
  }
  return rows;
}
