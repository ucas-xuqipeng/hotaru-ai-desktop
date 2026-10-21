const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseDisplayMedia, ownedPermission } = require('../desktop/display-media.cjs');
function fixture() {
  const origin = 'http://127.0.0.1:41001';
  const frame = { url: origin + '/?desktop=portable' };
  const wc = { mainFrame: frame, getURL: () => frame.url, isDestroyed: () => false };
  const window = { webContents: wc, isDestroyed: () => false };
  const sources = [{ id: 'screen:0:0', name: '屏幕 1' }, { id: 'window:10:0', name: '示例窗口' }];
  const request = { frame, securityOrigin: origin, videoRequested: true, audioRequested: true, userGesture: true };
  return { request, boundary: { window, origin, getSources: async () => sources, showDialog: async () => ({ response: 2 }) }, sources };
}
test('only explicit source choice grants selected video and never system audio', async () => {
  const { request, boundary, sources } = fixture();
  boundary.showDialog = async options => {
    assert.equal(options.cancelId, 0); assert.equal(options.defaultId, 0);
    assert.match(options.buttons[2], /示例窗口/); return { response: 2 };
  };
  assert.deepEqual(await chooseDisplayMedia(request, boundary), { video: sources[1] });
});
test('cancellation, bad indices, unknown sources and errors deny capture', async () => {
  for (const response of [0, -1, 99, NaN, 1.5, '1']) {
    const { request, boundary } = fixture(); boundary.showDialog = async () => ({ response });
    assert.equal(await chooseDisplayMedia(request, boundary), null);
  }
  for (const list of [[], [{ id: 'unknown:5', name: 'invalid' }], [{ name: 'missing id' }]]) {
    const { request, boundary } = fixture(); boundary.getSources = async () => list;
    assert.equal(await chooseDisplayMedia(request, boundary), null);
  }
  const { request, boundary } = fixture(); boundary.showDialog = async () => { throw Error('cancel'); };
  assert.equal(await chooseDisplayMedia(request, boundary), null);
});
test('gesture, frame and origin are required before enumeration and rechecked after selection', async () => {
  for (const mutation of [r => { r.userGesture = false; }, r => { r.videoRequested = false; }, r => { r.securityOrigin = 'https://foreign.example'; }, r => { r.frame = { url: r.frame.url }; }]) {
    const { request, boundary } = fixture(); mutation(request);
    boundary.getSources = async () => { throw Error('must not enumerate'); };
    assert.equal(await chooseDisplayMedia(request, boundary), null);
  }
  const { request, boundary } = fixture();
  boundary.showDialog = async () => { request.frame.url = 'https://foreign.example'; return { response: 1 }; };
  assert.equal(await chooseDisplayMedia(request, boundary), null);
});
test('permission gate recognizes display-capture only for owned main frame', () => {
  const { boundary } = fixture(); const wc = boundary.window.webContents;
  assert.equal(ownedPermission(wc, wc, boundary.origin, boundary.origin, { isMainFrame: true, requestingUrl: wc.getURL() }), true);
  assert.equal(ownedPermission(wc, wc, boundary.origin, boundary.origin, { isMainFrame: false, requestingUrl: wc.getURL() }), false);
  assert.equal(ownedPermission({}, wc, boundary.origin, boundary.origin, { isMainFrame: true }), false);
});
test('same-origin navigation or document reload while choosing cancels the pending selection', async () => {
  let epoch = 1;
  const first = fixture(); first.boundary.getNavigationEpoch = () => epoch;
  first.boundary.showDialog = async () => { epoch++; return { response: 1 }; };
  assert.equal(await chooseDisplayMedia(first.request, first.boundary), null);
  const second = fixture();
  second.boundary.showDialog = async () => { second.request.frame.url += '&another=page'; return { response: 1 }; };
  assert.equal(await chooseDisplayMedia(second.request, second.boundary), null);
});
