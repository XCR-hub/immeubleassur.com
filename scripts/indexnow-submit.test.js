import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const script = resolve('scripts/local-indexnow-submit.js');
const site = 'https://immeubleassur.test';
const key = 'abcdef0123456789';
const today = new Date().toISOString().slice(0, 10);

function fixture(t) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, 'immeubleassur-indexnow-test-'));
  t.after(() => {
    const checked = relative(parent, realpathSync(root));
    assert.ok(!checked.startsWith('..') && basename(root).startsWith('immeubleassur-indexnow-test-'));
    rmSync(root, { recursive: true, force: true });
  });
  const version = join(root, 'publications', 'versions', 'v1');
  mkdirSync(version, { recursive: true });
  mkdirSync(join(root, 'public'));
  writeFileSync(join(root, 'public', key + '.txt'), key);
  const xml = `<urlset><url><loc>${site}/new-guide</loc><lastmod>${today}</lastmod></url><url><loc>${site}/other-guide</loc><lastmod>${today}</lastmod></url><url><loc>${site}/old</loc><lastmod>2000-01-01</lastmod></url><url><loc>https://other.test/unrelated</loc><lastmod>${today}</lastmod></url></urlset>`;
  writeFileSync(join(version, 'sitemap.xml'), xml);
  writeFileSync(join(root, 'publications', 'current.json'), JSON.stringify({ marker: 'runtime-editorial-publication-v1', version: 'v1', files: [{ path: 'sitemap.xml', sha256: createHash('sha256').update(xml).digest('hex') }] }));
  const mock = join(root, 'network.mjs');
  const callsFile = join(root, 'calls.jsonl');
  writeFileSync(mock, `import { appendFileSync } from 'node:fs';
    globalThis.fetch = async (url, options = {}) => {
      const call = {url:String(url),method:options.method || 'GET',body:options.body ? JSON.parse(options.body) : null};
      appendFileSync(process.env.MOCK_CALLS, JSON.stringify(call)+'\\n');
      if (call.method === 'POST') return new Response('', {status:Number(process.env.MOCK_STATUS || 200)});
      return new Response(process.env.MOCK_PROOF === 'mismatch' ? 'wrong' : process.env.INDEXNOW_KEY, {status:process.env.MOCK_PROOF === 'redirect' ? 302 : 200});
    };`);
  const state = join(root, 'reports', 'state.json');
  const report = join(root, 'reports', 'report.json');
  const run = (extra = {}) => {
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, script], {
      cwd: root, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, SITE_ORIGIN: site, INDEXNOW_KEY: key, INDEXNOW_SUBMIT: '1', INDEXNOW_SITEMAP: '', LOCAL_RUNTIME_PUBLICATIONS_ROOT: join(root, 'publications'), LOCAL_INDEXNOW_STATE: state, LOCAL_INDEXNOW_REPORT: report, MOCK_CALLS: callsFile, MOCK_STATUS: '200', MOCK_PROOF: 'valid', ...extra }
    });
    assert.equal(result.error, undefined, result.error?.message);
    return { exit: result.status, report: JSON.parse(readFileSync(report, 'utf8')), output: result.stdout + result.stderr };
  };
  const calls = () => existsSync(callsFile) ? readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  return { root, state, run, calls };
}

test('IndexNow sends only recent same-site URLs once and keeps its receipt after an unchanged cycle', t => {
  const f = fixture(t);
  const first = f.run();
  assert.equal(first.exit, 0, first.output);
  assert.equal(first.report.status, 'submitted');
  assert.equal(first.report.sitemap_manifest_verified, true);
  assert.equal(first.report.key_publicly_verifiable, true);
  assert.deepEqual(f.calls().filter(call => call.method === 'POST')[0].body.urlList, [site + '/new-guide', site + '/other-guide']);
  const receipt = first.report.last_submission;
  assert.equal(receipt.http_status, 200);
  const second = f.run();
  assert.equal(second.report.status, 'no-changes');
  assert.equal(f.calls().filter(call => call.method === 'POST').length, 1);
  assert.deepEqual(JSON.parse(readFileSync(f.state, 'utf8')).last_submission, receipt);
});

test('existing ledgers continue to notify changed pages without re-sending unchanged URLs', t => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'reports'));
  writeFileSync(f.state, JSON.stringify({ snapshot: { [site + '/new-guide']: today, [site + '/other-guide']: '2000-01-01', [site + '/old']: '2000-01-01' } }));
  assert.equal(f.run().report.first_run, false);
  assert.deepEqual(f.calls().filter(call => call.method === 'POST')[0].body.urlList, [site + '/other-guide']);
});

test('a provider failure preserves pending URLs until an accepted retry', t => {
  const f = fixture(t);
  const failed = f.run({ MOCK_STATUS: '503' });
  assert.equal(failed.report.status, 'provider-degraded');
  assert.equal(existsSync(f.state), false);
  assert.equal(f.run().report.status, 'submitted');
  assert.equal(f.run().report.status, 'no-changes');
  assert.equal(f.calls().filter(call => call.method === 'POST').length, 2);
});

test('an invalid or redirected ownership proof prevents notification and ledger changes', t => {
  const f = fixture(t);
  for (const proof of ['mismatch', 'redirect']) {
    const result = f.run({ MOCK_PROOF: proof });
    assert.equal(result.exit, 1);
    assert.equal(result.report.status, 'key-verification-failed');
    assert.equal(result.report.key_publicly_verifiable, false);
    assert.equal(existsSync(f.state), false);
  }
  assert.equal(f.calls().filter(call => call.method === 'POST').length, 0);
});

test('disabled notifications perform no network call and create no submission state', t => {
  const f = fixture(t);
  assert.equal(f.run({ INDEXNOW_SUBMIT: '0' }).report.status, 'disabled');
  assert.equal(f.calls().length, 0);
  assert.equal(existsSync(f.state), false);
});

test('an unreadable existing ledger cannot be mistaken for a first submission', t => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'reports'));
  writeFileSync(f.state, '{invalid');
  const result = f.run();
  assert.equal(result.exit, 1);
  assert.equal(result.report.status, 'failed');
  assert.equal(f.calls().length, 0);
  assert.equal(readFileSync(f.state, 'utf8'), '{invalid');
});
