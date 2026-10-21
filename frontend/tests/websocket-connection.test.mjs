import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketConnection } from '../src/renderer/src/services/websocket-connection.ts';

function fixture() {
  const sockets = [], states = [], messages = [];
  const connection = new WebSocketConnection({
    onState: (state) => states.push(state), onMessage: (message) => messages.push(message),
    retryDelays: [5, 10],
    createSocket: (url) => {
      const socket = { url, readyState: 0, sent: [], onopen: null, onclose: null,
        onerror: null, onmessage: null,
        send(raw) { this.sent.push(JSON.parse(raw)); },
        open() { this.readyState = 1; this.onopen?.({}); },
        close() { this.readyState = 3; this.onclose?.({}); },
      };
      sockets.push(socket);
      return socket;
    },
  });
  return { connection, sockets, states, messages };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('an unexpected disconnect reconnects automatically and accepts new input', async () => {
  const f = fixture();
  try {
    f.connection.connect('ws://local/client-ws'); f.sockets[0].open();
    f.sockets[0].close(); await delay(15);
    assert.equal(f.sockets.length, 2);
    f.sockets[1].open();
    assert.equal(f.connection.send({ type: 'text-input', text: '你好' }), true);
    assert.deepEqual(f.sockets[1].sent, [{ type: 'text-input', text: '你好' }]);
    assert.equal(f.connection.getCurrentState(), 'OPEN');
  } finally { f.connection.disconnect(); }
});

test('microphone data sent offline is rejected and is never replayed after reconnect', async () => {
  const f = fixture();
  try {
    f.connection.connect('ws://local/client-ws'); f.sockets[0].open(); f.sockets[0].close();
    for (let i = 0; i < 100; i++) assert.equal(f.connection.send({type:'mic-audio-data',audio:[0.1]}), false);
    await delay(15); f.sockets[1].open();
    assert.deepEqual(f.sockets[1].sent, []);
  } finally { f.connection.disconnect(); }
});

test('late callbacks from an old socket cannot close or deliver into its replacement', () => {
  const f = fixture();
  try {
    f.connection.connect('ws://one/client-ws'); const old = f.sockets[0]; old.open();
    const staleClose = old.onclose, staleMessage = old.onmessage;
    f.connection.connect('ws://two/client-ws'); f.sockets[1].open();
    staleClose?.({}); staleMessage?.({ data: '{"old":true}' });
    assert.equal(f.connection.getCurrentState(), 'OPEN');
    assert.deepEqual(f.messages, []);
  } finally { f.connection.disconnect(); }
});

test('connecting the same healthy address does not discard the conversation socket', () => {
  const f = fixture();
  try {
    f.connection.connect('ws://local/client-ws'); f.connection.connect('ws://local/client-ws');
    f.sockets[0].open(); f.connection.connect('ws://local/client-ws');
    assert.equal(f.sockets.length, 1);
    assert.equal(f.connection.getCurrentState(), 'OPEN');
  } finally { f.connection.disconnect(); }
});

test('manual disconnect cancels pending retry and publishes CLOSED', async () => {
  const f = fixture();
  f.connection.connect('ws://local/client-ws'); f.sockets[0].close(); f.connection.disconnect();
  await delay(20);
  assert.equal(f.sockets.length, 1);
  assert.equal(f.states.at(-1), 'CLOSED');
});

test('a send failure starts recovery without throwing or claiming the input was sent', async () => {
  const f = fixture();
  try {
    f.connection.connect('ws://local/client-ws'); f.sockets[0].open();
    f.sockets[0].send = () => { throw new Error('network changed'); };
    assert.equal(f.connection.send({type:'text-input',text:'你好'}), false);
    await delay(15);
    assert.equal(f.sockets.length, 2);
  } finally { f.connection.disconnect(); }
});
