import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const app = readFileSync('public/assets/app.js', 'utf8');
const format = app.match(/function formatEuro\(value\) \{[\s\S]*?\n\}/)?.[0];
const bind = app.match(/function bindGrowthTracking\(\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(format && bind, 'Expected browser functions are available');

test('whole and fractional euro values retain the French display', () => {
  const context = vm.createContext({});
  vm.runInContext(format, context);
  for (const value of [0, 14, 1000, 25000, 123456789, -1234567, '1800', null, undefined, 1500.1254, NaN, Infinity]) {
    context.input = value;
    assert.equal(vm.runInContext('formatEuro(input)', context), `${Number(value || 0).toLocaleString('fr-FR')} EUR`, String(value));
  }
});
test('whole-euro estimates do not call locale formatting', () => {
  const context = vm.createContext({});
  vm.runInContext(format + ';Number.prototype.toLocaleString = () => { throw new Error("Locale initialization on integer path"); };', context);
  assert.equal(vm.runInContext('formatEuro(25000)', context), '25\u202f000 EUR');
});

function trackingFixture(withFrames = true) {
  const frames = [], timers = [], events = [], listeners = new Map();
  const window = { setTimeout: fn => { timers.push(fn); }, addEventListener: (name, fn) => { listeners.set(name, fn); } };
  if (withFrames) window.requestAnimationFrame = fn => { frames.push(fn); };
  const context = vm.createContext({ window, document: { title: 'Insurance guide', addEventListener() {} }, form: null, track: (type, data) => events.push({ type, data }), currentLeadIntent: () => 'immeuble', isPrivateAppPage: () => false, ctaExperiment: { id: 'fixture', variant: 'audit' } });
  vm.runInContext('let experimentViewSent = false;\n' + bind + '\nbindGrowthTracking();', context);
  return { frames, timers, events, listeners };
}
test('initial analytics wait for the paint opportunity and keep their context', () => {
  const fixture = trackingFixture();
  assert.equal(fixture.events.length, 0);
  fixture.frames.shift()();
  assert.equal(fixture.events.length, 0);
  fixture.timers.shift()();
  assert.deepEqual(fixture.events.map(e => e.type), ['page_view', 'experiment_view']);
  assert.equal(fixture.events[0].data.target, 'Insurance guide');
  assert.equal(fixture.events[1].data.label, 'audit');
});
test('early navigation sends the visit once and a later callback cannot duplicate it', () => {
  const fixture = trackingFixture();
  fixture.listeners.get('pagehide')();
  fixture.frames.shift()(); fixture.timers.shift()();
  assert.deepEqual(fixture.events.map(e => e.type), ['page_view', 'experiment_view']);
});
test('browsers without animation frames retain the initial tracking fallback', () => {
  const fixture = trackingFixture(false);
  fixture.timers.shift()();
  assert.deepEqual(fixture.events.map(e => e.type), ['page_view', 'experiment_view']);
});

const scrollBinding = app.match(/function bindScrollDepthTracking\(\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(scrollBinding, 'Expected reading-depth binding is available');

function scrollFixture(initialScroll = 0) {
  const frames = [], events = [], listeners = new Map(), bridges = [];
  let heightReads = 0;
  const window = { location: { pathname: '/guide-recherche-fuite-immeuble' }, scrollY: initialScroll, innerHeight: 1000 };
  const document = { documentElement: { get scrollHeight() { heightReads++; return 3000; } }, addEventListener: (name, fn) => listeners.set(name, fn) };
  const context = vm.createContext({ window, document, scrollDepthSent: new Set(), requestAnimationFrame: fn => frames.push(fn), track: (type, data) => events.push({ type, data }), showContentLeadBridge: reason => bridges.push(reason) });
  vm.runInContext(scrollBinding + '\nbindScrollDepthTracking();', context);
  return { window, frames, events, listeners, bridges, heightReads: () => heightReads };
}

test('reading-depth tracking avoids document layout at the top and coalesces scrolls', () => {
  const fixture = scrollFixture();
  assert.equal(fixture.heightReads(), 0);
  fixture.listeners.get('scroll')();
  fixture.listeners.get('scroll')();
  assert.equal(fixture.frames.length, 1);
  fixture.frames.shift()();
  assert.equal(fixture.heightReads(), 0);
  fixture.window.scrollY = 1000;
  fixture.listeners.get('scroll')(); fixture.frames.shift()();
  assert.deepEqual(fixture.events.map(e => e.data.target), ['50']);
  fixture.window.scrollY = 1900;
  fixture.listeners.get('scroll')(); fixture.frames.shift()();
  fixture.listeners.get('scroll')(); fixture.frames.shift()();
  assert.deepEqual(fixture.events.map(e => e.data.target), ['50', '90']);
  assert.deepEqual(fixture.bridges, ['scroll-50']);
});

test('restored reading positions retain their initial depth milestones', () => {
  const fixture = scrollFixture(1900);
  assert.equal(fixture.heightReads(), 1);
  assert.deepEqual(fixture.events.map(e => e.data.target), ['50', '90']);
  assert.equal(fixture.events[0].type, 'scroll_depth');
  assert.equal(fixture.events[0].data.label, '/guide-recherche-fuite-immeuble');
});
