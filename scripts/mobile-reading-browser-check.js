import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const channel = value => value / 255 <= .04045 ? value / 255 / 12.92 : ((value / 255 + .055) / 1.055) ** 2.4;
const luminance = rgb => rgb.slice(0, 3).map(channel).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
export function contrast(color, background, panel) {
  const rgb = value => value.match(/[\d.]+/g).map(Number);
  const foreground = rgb(color), layer = rgb(background), base = rgb(panel);
  const opacity = layer[3] ?? 1;
  const actual = layer.slice(0, 3).map((value, index) => value * opacity + base[index] * (1 - opacity));
  const first = luminance(foreground), second = luminance(actual);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

export async function checkMobileReading(browser, origin, screenshotRoot) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const rows = [];
  for (const [path, width, columns] of [['/blog', 320, 1], ['/villes', 390, 1], ['/blog', 800, 2], ['/blog', 1280, 3], ['/blog/assurance-immeuble-ancien', 320, 1]]) {
    const page = await browser.newPage();
    let leadRequests = 0;
    try {
      await page.setJavaScriptEnabled(false);
      await page.setViewport({ width, height: 844 });
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/')) {
          if (url.pathname === '/api/leads') leadRequests++;
          void request.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' });
        } else if (url.origin === origin) void request.continue();
        else void request.abort('blockedbyclient');
      });
      const response = await page.goto(origin + path, { waitUntil: 'networkidle0' });
      assert.equal(response.status(), 200, path);
      const grids = await page.$$('.card-grid');
      let checked = 0;
      for (const grid of grids) {
        if (await grid.evaluate(element => element.children.length < 3)) continue;
        await grid.evaluate(element => element.firstElementChild.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await new Promise(resolve => setTimeout(resolve, 100));
        const cards = await grid.evaluate(element => [...element.children].slice(0, 3).map(card => {
          const box = card.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, text: card.textContent.trim().length };
        }));
        assert.ok(cards.every(card => card.text > 0 && card.left >= 0 && card.right <= width + 1 && card.width >= (columns === 1 ? width - 130 : 150)), `${path}: cards remain readable at ${width}px`);
        const firstRow = cards.filter(card => Math.abs(card.top - cards[0].top) < 1);
        assert.equal(firstRow.length, columns, `${path}: ${columns} columns expected at ${width}px`);
        if (columns === 1) assert.ok(cards.every((card, index) => index === 0 || card.top >= cards[index - 1].bottom), 'Cards stack without overlap');
        checked++;
      }
      if (path === '/blog' || path === '/villes') assert.ok(checked > 0, 'The complete resource directory is present');
      const colors = await page.$$eval('.cluster-conversion-panel .button.secondary', links => links.map(link => ({
        text: link.textContent.trim(), color: getComputedStyle(link).color, background: getComputedStyle(link).backgroundColor, panel: getComputedStyle(link.closest('.cluster-conversion-panel')).backgroundColor
      })));
      if (path.includes('assurance-immeuble-ancien')) assert.ok(colors.length > 0, 'A standard article retains its secondary reading action');
      const ratios = colors.map(button => contrast(button.color, button.background, button.panel));
      assert.ok(ratios.every(ratio => ratio >= 4.5), `${path}: secondary actions contrast ${ratios.map(value => value.toFixed(2)).join(', ')}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, path);
      assert.equal(leadRequests, 0);
      if (screenshotRoot && width === 320) {
        mkdirSync(screenshotRoot, { recursive: true });
        if (path === '/blog') await page.$eval('.card-grid > :first-child', card => card.scrollIntoView({ block: 'center', behavior: 'instant' }));
        else await page.$eval('.cluster-conversion-panel .button.secondary', link => link.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.screenshot({ path: resolve(screenshotRoot, path === '/blog' ? 'blog-cards-mobile.png' : 'standard-reading-action-mobile.png') });
      }
      rows.push({ path, width, columns, grids_checked: checked, contrast_minimum: ratios.length ? Number(Math.min(...ratios).toFixed(2)) : null, javascript: false, passed: true });
    } finally { await page.close(); }
  }
  return rows;
}
