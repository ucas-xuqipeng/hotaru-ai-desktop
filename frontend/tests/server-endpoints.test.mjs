import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultServerEndpoints, isPortableDesktop } from '../src/renderer/src/utils/server-endpoints.ts';
test('dynamic loopback HTTP ports become the HTTP and websocket defaults', () => {
  assert.deepEqual(defaultServerEndpoints('http://127.0.0.1:49123/?desktop=portable'), {
    baseUrl: 'http://127.0.0.1:49123', wsUrl: 'ws://127.0.0.1:49123/client-ws',
  });
  assert.equal(defaultServerEndpoints('https://localhost:444/').wsUrl, 'wss://localhost:444/client-ws');
});
test('file, invalid, remote and missing contexts keep normal backend fallback', () => {
  for (const url of ['file:///C:/app/index.html', 'invalid', 'https://example.com/', undefined]) {
    assert.equal(defaultServerEndpoints(url).baseUrl, 'http://127.0.0.1:12393');
  }
});
test('only explicit portable marker hides unsupported pet mode', () => {
  assert.equal(isPortableDesktop('?desktop=portable'), true);
  assert.equal(isPortableDesktop('?desktop=legacy'), false);
  assert.equal(isPortableDesktop(''), false);
});
