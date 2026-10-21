const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createVerification } = require('../desktop/verify.cjs');

test('readiness checks the loaded model instead of an optional debug motion listing', () => {
  const { pageReady } = require('../desktop/verify.cjs');
  assert.equal(typeof pageReady, 'function');
  const vm = require('node:vm');
  const context = { document: { querySelector: () => ({}) }, window: {
    Live2DDebug: { getMotionInfo: () => [] },
    getLAppAdapter: () => ({ getModel: () => ({ _model: {} }) }),
  } };
  assert.equal(vm.runInNewContext(`(${pageReady.toString()})()`, context), true);
  context.window.getLAppAdapter = () => ({ getModel: () => null });
  assert.equal(vm.runInNewContext(`(${pageReady.toString()})()`, context), false);
});

for (const playbackError of [false, true]) test(`verification ${playbackError ? 'rejects failed playback' : 'completes real captioned audio'} and writes only sanitized test evidence`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hotaru-verify-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, 'result.json');
  const wc = new EventEmitter();
  const debug = new EventEmitter();
  let attached = false;
  debug.attach = () => { attached = true; };
  debug.detach = () => { attached = false; };
  debug.isAttached = () => attached;
  debug.sendCommand = async () => {};
  wc.debugger = debug;
  wc.executeJavaScript = async () => true;
  wc.insertText = async text => assert.equal(text, '你好，请简短打招呼并点头。');
  wc.sendInputEvent = event => {
    if (event.type !== 'keyDown') return;
    for (const frame of [
      { type: 'config-files', api_key: 'SECRET' },
      { type: 'audio', audio: 'SECRET', display_text: { text: '你好呀！' }, actions: { motions: ['mtn_nod01_C'] } },
      { type: 'backend-synth-complete' }, { type: 'control', text: 'conversation-chain-end' },
    ]) debug.emit('message', {}, 'Network.webSocketFrameReceived', { response: { payloadData: JSON.stringify(frame) } });
    // Current Electron emits console-message details on the event object.
    wc.emit('console-message', { message: 'Audio playback completed' });
    if (playbackError) wc.emit('console-message', { message: 'Audio playback setup error: SECRET' });
    wc.emit('console-message', { message: 'Received message from server: SECRET' });
  };
  wc.capturePage = async () => ({ toPNG: () => Buffer.from('unit-test screenshot fixture') });
  const verify = await createVerification({ webContents: wc, isDestroyed: () => false }, output);
  await verify();
  const serialized = fs.readFileSync(output, 'utf8');
  const result = JSON.parse(serialized);
  assert.equal(result.status, playbackError ? 'verification-failed' : 'complete');
  assert.equal(result.audioPresent, true);
  assert.equal(result.backendSynthComplete, true);
  assert.deepEqual(result.diagnostics, playbackError ? ['audio-playback-completed', 'audio-setup-error'] : ['audio-playback-completed']);
  assert.equal(result.playbackFailed, playbackError);
  assert.equal(serialized.includes('SECRET'), false);
  assert.equal(fs.existsSync(path.join(root, 'result.png')), true);
  assert.equal(attached, false);
  assert.equal(debug.listenerCount('message'), 0);
  assert.equal(wc.listenerCount('console-message'), 0);
});
