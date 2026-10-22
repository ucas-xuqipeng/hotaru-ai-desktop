const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PetController, fitBounds } = require('../desktop/pet-controller.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hotaru-pet-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const wc = new EventEmitter();
  const sent = []; wc.send = (...args) => sent.push(args);
  wc.getURL = () => 'http://127.0.0.1:49123/?desktop=portable';
  let bounds = { x: 1200, y: 300, width: 460, height: 650 };
  const native = { ignore: false, top: false, taskbar: false, visible: true };
  const win = new EventEmitter();
  Object.assign(win, { webContents: wc, isDestroyed: () => false,
    getBounds: () => ({ ...bounds }), setBounds: b => { bounds = { ...b }; },
    setMinimumSize: () => {}, setResizable: () => {}, setBackgroundColor: () => {},
    setAlwaysOnTop: b => { native.top = b; }, setSkipTaskbar: b => { native.taskbar = b; },
    isAlwaysOnTop: () => native.top,
    setIgnoreMouseEvents: b => { native.ignore = b; },
    show: () => { native.visible = true; }, hide: () => { native.visible = false; },
    isVisible: () => native.visible, focus: () => {}, restore: () => {}, isMinimized: () => false,
  });
  let cursor = { x: 1400, y: 600 };
  const screens = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
    { workArea: { x: -1920, y: 0, width: 1920, height: 1080 } }];
  const screen = { getPrimaryDisplay: () => screens[0], getAllDisplays: () => screens,
    getDisplayMatching: b => b.x < 0 ? screens[1] : screens[0],
    getCursorScreenPoint: () => cursor };
  const controller = new PetController({ window: win, screen,
    statePath: path.join(dir, 'pet.json'), getOrigin: () => 'http://127.0.0.1:49123' });
  const event = { sender: wc, senderFrame: { url: wc.getURL(), parent: null } };
  return { controller, event, win, native, sent, screens, setCursor: v => { cursor = v; } };
}

test('pet mode makes the native overlay topmost and transparent-space click-through; window mode restores input', t => {
  const f = fixture(t); f.controller.setMode('pet');
  assert.equal(f.native.top, true); assert.equal(f.native.taskbar, true); assert.equal(f.native.ignore, true);
  f.controller.handle(f.event, 'update-component-hover', 'live2d-model', true);
  assert.equal(f.native.ignore, false);
  f.controller.handle(f.event, 'update-component-hover', 'live2d-model', false);
  assert.equal(f.native.ignore, true);
  f.controller.setMode('window');
  assert.equal(f.native.top, false); assert.equal(f.native.ignore, false); assert.equal(f.native.taskbar, false);
});

test('foreign origins, iframes and arbitrary hover IDs cannot seize desktop input', t => {
  const f = fixture(t); f.controller.setMode('pet');
  for (const event of [{ ...f.event, sender: {} },
    { ...f.event, senderFrame: { url: 'http://127.0.0.1:9000/', parent: null } },
    { ...f.event, senderFrame: { url: f.event.senderFrame.url, parent: {} } }]) {
    assert.equal(f.controller.handle(event, 'update-component-hover', 'live2d-model', true), false);
  }
  f.controller.handle(f.event, 'update-component-hover', 'arbitrary', true);
  f.controller.handle(f.event, 'update-component-hover', 'live2d-model', 'true');
  assert.equal(f.native.ignore, true);
});

test('native cursor polling continues in passthrough and clears stale hover outside the window', t => {
  const f = fixture(t); f.controller.setMode('pet');
  const b = f.win.getBounds(); f.setCursor({ x: b.x + 40, y: b.y + 60 });
  f.controller.tick();
  assert.deepEqual(f.sent.at(-1), ['pet-cursor', { x: 40, y: 60 }]);
  f.controller.handle(f.event, 'update-component-hover', 'live2d-model', true);
  f.setCursor({ x: b.x - 20, y: b.y - 20 }); f.controller.tick();
  assert.equal(f.native.ignore, true);
});

test('native drag crosses onto negative-coordinate displays and stays recoverable after scaling', t => {
  const f = fixture(t); f.controller.setMode('pet');
  const b = f.win.getBounds(); f.setCursor({ x: b.x + 100, y: b.y + 100 });
  f.controller.handle(f.event, 'pet-drag', true);
  f.setCursor({ x: -500, y: 500 }); f.controller.tick();
  f.controller.handle(f.event, 'pet-drag', false);
  assert.equal(f.win.getBounds().x, -600);
  f.controller.resize(1.2);
  const scaled = f.win.getBounds();
  assert.equal(scaled.width > b.width, true);
  assert.equal(scaled.x >= -1920 && scaled.x + scaled.width <= 0, true);
  assert.equal(scaled.y + scaled.height <= 1080, true);
});

test('mode round trip preserves pet position and persisted offscreen bounds are clamped', t => {
  const f = fixture(t); f.controller.setMode('pet');
  const pet = f.win.getBounds(); f.controller.setMode('window'); f.controller.setMode('pet');
  assert.deepEqual(f.win.getBounds(), pet);
  assert.deepEqual(fitBounds({ x: 9000, y: -1000, width: 460, height: 650 }, f.screens),
    { x: 1460, y: 0, width: 460, height: 650 });
  f.controller.save();
  const persisted = JSON.parse(fs.readFileSync(f.controller.statePath, 'utf8'));
  assert.equal(persisted.mode, 'pet'); assert.deepEqual(persisted.petBounds, pet);
});

test('forced passthrough always has an explicit recovery and hidden windows stop pointer events', t => {
  const f = fixture(t); f.controller.setMode('pet');
  f.controller.handle(f.event, 'update-component-hover', 'live2d-model', true);
  f.controller.toggleForceIgnore(); assert.equal(f.native.ignore, true);
  f.controller.openInput(); assert.equal(f.native.ignore, false);
  assert.equal(f.sent.some(e => e[0] === 'pet-open-input'), true);
  f.win.hide(); const count = f.sent.length; f.controller.tick();
  assert.equal(f.sent.length, count);
});

test('returning from settings synchronizes forced passthrough even if it was changed in window mode', t => {
  const f = fixture(t); f.controller.setMode('pet'); f.controller.toggleForceIgnore();
  f.controller.setMode('window'); f.controller.openInput();
  f.sent.length = 0; f.controller.setMode('pet');
  assert.equal(f.sent.some(e => e[0] === 'force-ignore-mouse-changed' && e[1] === false), true);
});

test('visible pet restores native topmost status after Windows changes the overlay style', t => {
  const f = fixture(t); f.controller.setMode('pet'); f.native.top = false;
  f.controller.tick(); assert.equal(f.native.top, true);
  f.controller.setMode('window'); f.controller.tick(); assert.equal(f.native.top, false);
});
