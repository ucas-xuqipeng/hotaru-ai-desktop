'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const sends = new Set(['pre-mode-changed', 'update-component-hover', 'pet-drag', 'pet-resize',
  'show-context-menu', 'toggle-force-ignore-mouse', 'pet-ready', 'window-close',
  'window-minimize', 'window-maximize', 'window-unfullscreen']);
const events = new Set(['mode-changed', 'force-ignore-mouse-changed', 'pet-cursor',
  'pet-open-input', 'toggle-input-subtitle', 'mic-toggle', 'interrupt',
  'toggle-scroll-to-resize', 'window-maximized-change', 'window-fullscreen-change']);
const listeners = new Map();
function on(channel, callback) {
  if (!events.has(channel) || typeof callback !== 'function') return;
  const listener = (_event, ...args) => callback({}, ...args);
  const entries = listeners.get(channel) || new Map();
  if (entries.has(callback)) ipcRenderer.removeListener(channel, entries.get(callback));
  entries.set(callback, listener); listeners.set(channel, entries); ipcRenderer.on(channel, listener);
}
function remove(channel, callback) {
  const entries = listeners.get(channel), listener = entries?.get(callback);
  if (listener) { ipcRenderer.removeListener(channel, listener); entries.delete(callback); }
}
const send = (channel, ...args) => { if (sends.has(channel)) ipcRenderer.send(channel, ...args); };
const subscribe = (channel, callback) => {
  const handler = (_event, ...args) => callback(...args); on(channel, handler);
  return () => remove(channel, handler);
};
contextBridge.exposeInMainWorld('api', {
  portablePet: true,
  getPetState: () => ipcRenderer.invoke('pet-get-state'),
  setMode: mode => send('pre-mode-changed', mode),
  ready: () => send('pet-ready'),
  updateComponentHover: (id, hover) => send('update-component-hover', id, hover),
  setPetDragging: active => send('pet-drag', active),
  resizePet: direction => send('pet-resize', direction),
  showContextMenu: () => send('show-context-menu'),
  toggleForceIgnoreMouse: () => send('toggle-force-ignore-mouse'),
  onPetCursor: callback => subscribe('pet-cursor', callback),
  onPetOpenInput: callback => subscribe('pet-open-input', callback),
  onToggleInputSubtitle: callback => subscribe('toggle-input-subtitle', callback),
  onForceIgnoreMouseChanged: callback => subscribe('force-ignore-mouse-changed', callback),
});
contextBridge.exposeInMainWorld('electron', {
  process: { platform: process.platform },
  ipcRenderer: { send, on, removeListener: remove,
    removeAllListeners: channel => {
      if (!events.has(channel)) return;
      for (const callback of listeners.get(channel)?.keys() || []) remove(channel, callback);
    } },
});
