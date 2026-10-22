const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

test('portable bridge filters IPC, hides native events and unsubscribes the exact callback', () => {
  const exposed = {}, calls = [], ipc = new EventEmitter();
  ipc.send = (...args) => calls.push(args); ipc.invoke = async channel => ({ channel });
  vm.runInNewContext(fs.readFileSync(require.resolve('../desktop/pet-preload.cjs'), 'utf8'), {
    require: name => { assert.equal(name, 'electron'); return { ipcRenderer: ipc,
      contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value; } } }; },
    process: { platform: 'win32' },
  });
  exposed.electron.ipcRenderer.send('arbitrary-native-action', 'secret');
  exposed.api.setMode('pet');
  assert.deepEqual(calls, [['pre-mode-changed', 'pet']]);
  assert.equal(exposed.electron.ipcRenderer.invoke, undefined);
  let got = null;
  const clean = exposed.api.onPetCursor(p => { got = p; });
  ipc.emit('pet-cursor', { sender: 'native-object' }, { x: 1, y: 2 });
  assert.deepEqual(got, { x: 1, y: 2 });
  clean(); got = null; ipc.emit('pet-cursor', {}, { x: 3, y: 4 });
  assert.equal(got, null);
});
