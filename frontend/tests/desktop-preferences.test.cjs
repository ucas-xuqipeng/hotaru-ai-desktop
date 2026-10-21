const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { PreferencesStore, snapshotScript, restoreScript, sanitizeSnapshot, LIMITS } = require('../desktop/preferences.cjs');
function browser(origin, entries = {}) {
  const values = new Map(Object.entries(entries));
  return { window: { location: { origin, pathname: '/desktop-bootstrap.html' } }, localStorage: {
    get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), clear: () => values.clear(),
  } };
}
test('file snapshot restores raw preferences before app use across different managed ports', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hotaru-prefs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new PreferencesStore(path.join(root, 'data/preferences.json'));
  const previous = 'http://127.0.0.1:41001'; const current = 'http://127.0.0.1:41002';
  const first = browser(previous, { wsUrl: JSON.stringify('ws://127.0.0.1:41001/client-ws'), baseUrl: JSON.stringify(previous), micOn: 'true', theme: '"dark"', i18nextLng: 'ja', scale: '1.2' });
  assert.equal(store.save(vm.runInNewContext(snapshotScript(previous), first)), true);
  const second = browser(current, { stale: 'old-origin-preferences' });
  vm.runInNewContext(restoreScript(store.load(), current), second);
  assert.equal(second.localStorage.getItem('theme'), '"dark"');
  assert.equal(second.localStorage.getItem('i18nextLng'), 'ja');
  assert.equal(second.localStorage.getItem('micOn'), null);
  assert.equal(second.localStorage.getItem('stale'), null);
  assert.equal(second.localStorage.getItem('wsUrl'), null);
  assert.equal(second.localStorage.getItem('baseUrl'), null);
  const { defaultServerEndpoints } = await import('../src/renderer/src/utils/server-endpoints.ts');
  assert.equal(defaultServerEndpoints(current).baseUrl, current);
  assert.equal(defaultServerEndpoints(current).wsUrl, 'ws://127.0.0.1:41002/client-ws');
});
test('default language never makes a bounded saved snapshot unreadable', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hotaru-prefs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new PreferencesStore(path.join(root, 'preferences.json'));
  const values = Object.fromEntries(Array.from({ length: LIMITS.keys }, (_, i) => ['key' + i, 'x']));
  const snapshot = { version: 1, origin: 'http://127.0.0.1:41001', values };
  assert.equal(store.save(snapshot), false);
  delete values.key0;
  assert.equal(store.save(snapshot), true);
  assert.equal(store.load().values.key1, 'x');
  assert.equal(store.load().values.i18nextLng, 'zh');
});
test('hung or failed renderer capture retains previous file and resolves for process cleanup', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hotaru-prefs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'preferences.json'); const store = new PreferencesStore(file);
  const origin = 'http://127.0.0.1:41001';
  store.save({ version: 1, origin, values: { theme: '"dark"' } });
  const original = fs.readFileSync(file, 'utf8');
  const contents = { isDestroyed: () => false, getURL: () => origin, executeJavaScript: () => new Promise(() => {}) };
  assert.equal(await store.capture(contents, origin, 10), false);
  contents.executeJavaScript = async () => { throw Error('renderer unavailable'); };
  assert.equal(await store.capture(contents, origin, 10), false);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});
test('explicit user endpoint overrides survive while missing language defaults to raw zh', t => {
  const snapshot = sanitizeSnapshot({ version: 1, origin: 'http://127.0.0.1:41001', values: { wsUrl: '"wss://custom.example/client-ws"', baseUrl: '"https://custom.example"' } });
  const context = browser('http://127.0.0.1:41002');
  vm.runInNewContext(restoreScript(snapshot, context.window.location.origin), context);
  assert.equal(context.localStorage.getItem('wsUrl'), '"wss://custom.example/client-ws"');
  assert.equal(context.localStorage.getItem('baseUrl'), '"https://custom.example"');
  assert.equal(context.localStorage.getItem('i18nextLng'), 'zh');
  const foreign = browser('https://foreign.example', { keep: 'yes' });
  assert.throws(() => vm.runInNewContext(restoreScript(snapshot, context.window.location.origin), foreign));
  assert.equal(foreign.localStorage.getItem('keep'), 'yes');
});
test('raw storage keys and script-like string values round-trip without executing code', () => {
  const values = JSON.parse('{"__proto__":"raw prototype key","quoted":"\\\";globalThis.injected=true;//"}');
  const context = browser('http://127.0.0.1:41002');
  vm.runInNewContext(restoreScript({ version: 1, origin: 'http://127.0.0.1:41001', values }, context.window.location.origin), context);
  assert.equal(context.localStorage.getItem('__proto__'), 'raw prototype key');
  assert.equal(context.localStorage.getItem('quoted'), values.quoted);
  assert.equal(context.injected, undefined);
});
test('bundled background URLs follow the new app origin without changing storage encoding', () => {
  const previous = 'http://127.0.0.1:41001'; const current = 'http://127.0.0.1:41002';
  const asset = '/bg/ceiling-window-room-night.jpeg?variant=night#background';
  for (const encode of [value => value, JSON.stringify]) {
    const snapshot = { version: 1, origin: previous, values: { backgroundUrl: encode(previous + asset) } };
    const context = browser(current);
    vm.runInNewContext(restoreScript(snapshot, current), context);
    assert.equal(context.localStorage.getItem('backgroundUrl'), encode(current + asset));
    assert.equal(snapshot.values.backgroundUrl, encode(previous + asset));
  }
});
test('external and custom backgrounds are preserved exactly instead of rebased by prefix', () => {
  const previous = 'http://127.0.0.1:41001'; const current = 'http://127.0.0.1:41002';
  for (const background of ['https://custom.example/bg/photo.jpeg', 'http://127.0.0.1:41003/bg/photo.jpeg',
    previous + '/custom/photo.jpeg', previous + '/bg-custom/photo.jpeg', previous + '/bg/../custom/photo.jpeg',
    '/bg/relative.jpeg', 'data:image/png;base64,example', 'not a URL']) {
    for (const encode of [value => value, JSON.stringify]) {
      const context = browser(current); const value = encode(background);
      vm.runInNewContext(restoreScript({ version: 1, origin: previous, values: { backgroundUrl: value, customBgUrl: value } }, current), context);
      assert.equal(context.localStorage.getItem('backgroundUrl'), value);
      assert.equal(context.localStorage.getItem('customBgUrl'), value);
    }
  }
});
test('malformed or oversized data cannot replace a previously saved snapshot', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hotaru-prefs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'preferences.json'); const store = new PreferencesStore(file);
  const good = { version: 1, origin: 'http://127.0.0.1:41001', values: { theme: '"dark"' } };
  assert.equal(store.load().values.i18nextLng, 'zh');
  assert.equal(store.save(good), true);
  const original = fs.readFileSync(file, 'utf8');
  for (const values of [[], null, { theme: 42 }, { theme: 'x'.repeat(LIMITS.value + 1) }, Object.fromEntries(Array.from({ length: LIMITS.keys + 1 }, (_, i) => ['key' + i, 'x'])), { ['x'.repeat(LIMITS.key + 1)]: 'x' }, Object.fromEntries(Array.from({ length: 8 }, (_, i) => ['key' + i, 'x'.repeat(LIMITS.value)]))]) {
    assert.equal(store.save({ ...good, values }), false);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
  assert.deepEqual(fs.readdirSync(root), ['preferences.json']);
  fs.writeFileSync(file, '{corrupt');
  assert.equal(store.load().values.i18nextLng, 'zh');
  fs.writeFileSync(file, ' '.repeat(LIMITS.file + 1));
  assert.equal(store.load().values.i18nextLng, 'zh');
});
