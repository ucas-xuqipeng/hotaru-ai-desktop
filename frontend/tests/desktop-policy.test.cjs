const test = require('node:test');
const assert = require('node:assert/strict');
const { isAppUrl, requestedMedia, sanitizeFrame, consoleDiagnostic, verificationComplete } = require('../desktop/policy.cjs');
test('navigation and permissions accept only the selected loopback origin', () => {
  const origin = 'http://127.0.0.1:49123';
  assert.equal(isAppUrl(origin + '/?desktop=portable', origin), true);
  for (const url of ['http://127.0.0.1:49124', 'http://127.0.0.1.evil:49123', 'https://example.com', 'file:///a', 'invalid']) assert.equal(isAppUrl(url, origin), false);
  assert.deepEqual(requestedMedia('media', { mediaTypes: ['audio', 'video'] }), ['audio', 'video']);
  assert.deepEqual(requestedMedia('notifications', {}), []);
  assert.deepEqual(requestedMedia('media', { mediaTypes: ['unknown'] }), []);
  assert.deepEqual(requestedMedia('media', {}), []);
});
test('verification requires actual captioned audio and completed playback without errors', () => {
  const good = { audioPresent: true, backendSynthComplete: true, idle: true,
    events: [{ type: 'audio', audioPresent: true, reply: '你好呀！' }, { type: 'conversation-end' }], diagnostics: ['audio-playback-completed'] };
  assert.equal(verificationComplete(good), true);
  for (const key of ['audioPresent', 'backendSynthComplete', 'idle']) assert.equal(verificationComplete({ ...good, [key]: false }), false);
  for (const events of [[{ type: 'reply', reply: 'Thinking...' }, { type: 'conversation-end' }], [{ type: 'audio', audioPresent: true, reply: ' ' }, { type: 'conversation-end' }], [{ type: 'audio', audioPresent: true, reply: '你好' }]]) assert.equal(verificationComplete({ ...good, events }), false);
  assert.equal(verificationComplete({ ...good, diagnostics: [] }), false);
  assert.equal(verificationComplete({ ...good, diagnostics: ['audio-playback-completed', 'audio-playback-error'] }), false);
  assert.equal(consoleDiagnostic('Audio play error: PRIVATE ARGUMENT'), 'audio-playback-error');
  assert.equal(consoleDiagnostic('Audio playback setup error: PRIVATE ARGUMENT'), 'audio-setup-error');
  assert.equal(consoleDiagnostic('Dialogue motion: mtn_nod01_C'), 'dialogue-motion:mtn_nod01_C');
  assert.equal(consoleDiagnostic('Dialogue motion: ../../secret'), null);
});
test('verification drops config and audio payloads, retaining only reply/action summaries', () => {
  assert.equal(sanitizeFrame({ type: 'set-model-and-conf', conf: { api_key: 'SECRET' } }), null);
  const result = sanitizeFrame({ type: 'audio', audio: 'BASE64SECRET', display_text: { text: '你好' }, actions: { motions: ['mtn_nod01_C'], expressions: ['smile'], arbitrary: 'SECRET' } });
  assert.deepEqual(result, { type: 'audio', audioPresent: true, reply: '你好', motions: ['mtn_nod01_C'], expressions: ['smile'] });
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
  assert.equal(consoleDiagnostic('Received message from server: SECRET'), null);
  assert.equal(consoleDiagnostic('Audio playback completed'), 'audio-playback-completed');
});
