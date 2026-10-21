'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isAppUrl } = require('./policy.cjs');
const LIMITS = Object.freeze({ keys: 128, key: 256, value: 65536, total: 262144, file: 1048576 });
const fallback = () => ({ version: 1, origin: null, values: { i18nextLng: 'zh' } });

function sanitizeSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== 1 || typeof snapshot.origin !== 'string'
    || !isAppUrl(snapshot.origin, snapshot.origin) || new URL(snapshot.origin).origin !== snapshot.origin
    || !snapshot.values || typeof snapshot.values !== 'object' || Array.isArray(snapshot.values)) throw Error('Invalid preferences');
  const entries = Object.entries(snapshot.values);
  if (entries.length > LIMITS.keys) throw Error('Too many preferences');
  const values = Object.create(null); let total = 0;
  for (const [key, value] of entries) {
    if (!key.length || key.length > LIMITS.key || typeof value !== 'string' || value.length > LIMITS.value) throw Error('Invalid preference entry');
    total += Buffer.byteLength(key) + Buffer.byteLength(value);
    if (total > LIMITS.total) throw Error('Preferences too large');
    if (key === 'micOn') continue;
    const generated = key === 'baseUrl' ? snapshot.origin : key === 'wsUrl' ? snapshot.origin.replace(/^http/, 'ws') + '/client-ws' : null;
    if (generated !== null && (value === generated || value === JSON.stringify(generated))) continue;
    values[key] = value;
  }
  if (!Object.hasOwn(values, 'i18nextLng')) {
    if (Object.keys(values).length >= LIMITS.keys || total + 12 > LIMITS.total) throw Error('Preferences too large');
    values.i18nextLng = 'zh';
  }
  return { version: 1, origin: snapshot.origin, values };
}

class PreferencesStore {
  constructor(file) { this.file = file; }
  async capture(contents, origin, timeoutMs = 2000) {
    let timer;
    try {
      if (contents.isDestroyed() || !isAppUrl(contents.getURL(), origin)) return false;
      const snapshot = await Promise.race([
        contents.executeJavaScript(snapshotScript(origin)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Preferences capture timed out')), timeoutMs); }),
      ]);
      if (contents.isDestroyed() || !isAppUrl(contents.getURL(), origin)) return false;
      return this.save(snapshot);
    } catch { return false; }
    finally { clearTimeout(timer); }
  }
  load() {
    try {
      if (fs.statSync(this.file).size > LIMITS.file) return fallback();
      return sanitizeSnapshot(JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch { return fallback(); }
  }
  save(snapshot) {
    let temporary;
    try {
      const data = JSON.stringify(sanitizeSnapshot(snapshot));
      if (Buffer.byteLength(data) > LIMITS.file) return false;
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      temporary = this.file + '.' + randomUUID() + '.tmp';
      fs.writeFileSync(temporary, data, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, this.file);
      return true;
    } catch { return false; }
    finally { if (temporary) { try { fs.unlinkSync(temporary); } catch { /* Renamed or unavailable. */ } } }
  }
}

function snapshotPage(origin, limits) {
  if (window.location.origin !== origin) throw Error('Foreign preferences origin');
  if (localStorage.length > limits.keys) throw Error('Too many preferences');
  const values = Object.create(null); let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i); const value = localStorage.getItem(key);
    if (typeof key !== 'string' || !key.length || key.length > limits.key || typeof value !== 'string' || value.length > limits.value) throw Error('Invalid preference entry');
    total += key.length + value.length;
    if (total > limits.total) throw Error('Preferences too large');
    values[key] = value;
  }
  return { version: 1, origin, values };
}
function restorePage(origin, values) {
  if (window.location.origin !== origin || window.location.pathname !== '/desktop-bootstrap.html') throw Error('Foreign bootstrap page');
  localStorage.clear();
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
}
function snapshotScript(origin) {
  if (!isAppUrl(origin, origin)) throw Error('Invalid preferences origin');
  return `(${snapshotPage.toString()})(${JSON.stringify(origin)},${JSON.stringify(LIMITS)})`;
}
function rebaseBundledBackground(value, sourceOrigin, origin) {
  if (typeof value !== 'string') return value;
  let url = value; let encoded = false;
  try {
    const decoded = JSON.parse(value);
    if (typeof decoded === 'string') { url = decoded; encoded = true; }
  } catch { /* Raw localStorage URL rather than a JSON-encoded hook value. */ }
  try {
    const parsed = new URL(url);
    if (parsed.origin !== sourceOrigin || !parsed.pathname.startsWith('/bg/')) return value;
    const rebased = origin + parsed.pathname + parsed.search + parsed.hash;
    return encoded ? JSON.stringify(rebased) : rebased;
  } catch { return value; }
}
function restoreScript(snapshot, origin) {
  if (!isAppUrl(origin, origin)) throw Error('Invalid preferences origin');
  const safe = snapshot.origin === null ? fallback() : sanitizeSnapshot(snapshot);
  if (Object.hasOwn(safe.values, 'backgroundUrl')) {
    safe.values.backgroundUrl = rebaseBundledBackground(safe.values.backgroundUrl, safe.origin, origin);
  }
  return `(${restorePage.toString()})(${JSON.stringify(origin)},JSON.parse(${JSON.stringify(JSON.stringify(safe.values))}))`;
}
module.exports = { PreferencesStore, sanitizeSnapshot, snapshotScript, restoreScript, LIMITS };
