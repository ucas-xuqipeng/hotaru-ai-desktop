'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { isAppUrl } = require('./policy.cjs');

function fitBounds(bounds, displays) {
  const areas = displays.map(d => d.workArea);
  const b = bounds && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(bounds[k]))
    ? bounds : { x: 0, y: 0, width: 460, height: 650 };
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const distance = a => Math.max(a.x - cx, 0, cx - a.x - a.width) ** 2
    + Math.max(a.y - cy, 0, cy - a.y - a.height) ** 2;
  const a = areas.reduce((best, next) => distance(next) < distance(best) ? next : best, areas[0]);
  const width = Math.round(Math.min(a.width, Math.max(260, b.width)));
  const height = Math.round(Math.min(a.height, Math.max(300, b.height)));
  return { x: Math.round(Math.max(a.x, Math.min(a.x + a.width - width, b.x))),
    y: Math.round(Math.max(a.y, Math.min(a.y + a.height - height, b.y))), width, height };
}

class PetController {
  constructor({ window, screen, statePath, getOrigin, initialMode }) {
    Object.assign(this, { window, screen, statePath, getOrigin });
    let saved = {};
    try { if (fs.statSync(statePath).size < 8192) saved = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
    const a = screen.getPrimaryDisplay().workArea;
    this.petBounds = fitBounds(saved.petBounds || { x: a.x + a.width - 484,
      y: a.y + a.height - 674, width: 460, height: 650 }, screen.getAllDisplays());
    this.windowBounds = fitBounds(saved.windowBounds || { x: a.x + 80, y: a.y + 60,
      width: 1280, height: 850 }, screen.getAllDisplays());
    this.mode = initialMode || (saved.mode === 'window' ? 'window' : 'pet');
    this.hover = new Set(); this.forceIgnore = false; this.drag = null;
    this.ignore = null; this.lastHover = 0;
  }
  state() { return { mode: this.mode, forceIgnore: this.forceIgnore, bounds: this.window.getBounds(),
    visible: this.window.isVisible(), topmost: this.window.isAlwaysOnTop(), opacity: this.window.getOpacity?.() }; }
  owns(event) {
    return event.sender === this.window.webContents && event.senderFrame
      && !event.senderFrame.parent && isAppUrl(event.senderFrame.url, this.getOrigin());
  }
  emit(channel, ...args) {
    if (!this.window.isDestroyed()) this.window.webContents.send(channel, ...args);
  }
  setMode(mode) {
    if (!['pet', 'window'].includes(mode)) return;
    if (this.applied) {
      if (this.mode === 'pet') this.petBounds = this.window.getBounds();
      else this.windowBounds = this.window.getBounds();
    }
    this.mode = mode; this.applied = true; this.hover.clear(); this.drag = null;
    const pet = mode === 'pet';
    this.window.setMinimumSize(260, 300);
    // Keep the transparent native window style fixed; CSS paints the full-window background.
    // Toggling resizable/background styles can leave the Windows compositor with a blank surface.
    this.window.setAlwaysOnTop(pet);
    this.window.setSkipTaskbar(pet);
    this.window.setBounds(fitBounds(pet ? this.petBounds : this.windowBounds, this.screen.getAllDisplays()));
    this.updateIgnore(); this.emit('mode-changed', mode);
    this.emit('force-ignore-mouse-changed', this.forceIgnore); this.save();
    this.onStateChange?.();
  }
  updateIgnore() {
    const ignore = this.mode === 'pet' && (this.forceIgnore || (!this.drag && this.hover.size === 0));
    if (ignore !== this.ignore) {
      this.window.setIgnoreMouseEvents(ignore, { forward: true }); this.ignore = ignore;
    }
  }
  handle(event, channel, ...args) {
    if (!this.owns(event)) return false;
    if (channel === 'pet-get-state') return this.state();
    if (channel === 'pre-mode-changed' && ['pet', 'window'].includes(args[0])) this.setMode(args[0]);
    else if (channel === 'update-component-hover' && ['live2d-model', 'input-subtitle'].includes(args[0])
      && typeof args[1] === 'boolean') {
      if (args[1]) this.hover.add(args[0]); else this.hover.delete(args[0]);
      this.lastHover = Date.now(); this.updateIgnore();
    } else if (channel === 'pet-drag' && typeof args[0] === 'boolean' && this.mode === 'pet') {
      if (args[0] && !this.forceIgnore) this.drag = { cursor: this.screen.getCursorScreenPoint(),
        bounds: this.window.getBounds(), started: Date.now() };
      else { this.drag = null; this.recover(); this.save(); }
      this.updateIgnore();
    } else if (channel === 'pet-resize' && [1, -1].includes(args[0])) this.resize(args[0] > 0 ? 1.08 : 1 / 1.08);
    else if (channel === 'toggle-force-ignore-mouse') this.toggleForceIgnore();
    else if (channel === 'show-context-menu') this.showMenu?.();
    else if (channel === 'pet-ready') { this.emit('mode-changed', this.mode); this.onReady?.(); }
    else if (channel === 'window-close') this.quit?.();
    else if (channel === 'window-minimize') this.window.minimize?.();
    else if (channel === 'window-maximize' && this.mode === 'window') {
      if (this.window.isMaximized()) this.window.unmaximize(); else this.window.maximize();
    } else if (channel === 'window-unfullscreen') this.window.setFullScreen(false);
    return true;
  }
  tick() {
    if (this.window.isDestroyed() || !this.window.isVisible() || this.mode !== 'pet') return;
    // Keep the visible overlay topmost after native window transitions.
    if (!this.window.isAlwaysOnTop()) this.window.setAlwaysOnTop(true);
    const cursor = this.screen.getCursorScreenPoint();
    if (this.drag) {
      if (Date.now() - this.drag.started > 15000) { this.drag = null; this.recover(); this.save(); }
      else this.window.setBounds({ ...this.drag.bounds,
        x: Math.round(this.drag.bounds.x + cursor.x - this.drag.cursor.x),
        y: Math.round(this.drag.bounds.y + cursor.y - this.drag.cursor.y) });
    }
    const b = this.window.getBounds();
    if (!this.drag && (cursor.x < b.x || cursor.y < b.y || cursor.x >= b.x + b.width
      || cursor.y >= b.y + b.height || Date.now() - this.lastHover > 1000)) {
      this.hover.clear(); this.updateIgnore();
    }
    this.emit('pet-cursor', { x: cursor.x - b.x, y: cursor.y - b.y });
  }
  resize(factor) {
    if (this.mode !== 'pet' || !Number.isFinite(factor) || factor < 0.5 || factor > 2) return;
    const b = this.window.getBounds();
    const height = Math.max(360, Math.min(1000, Math.round(b.height * factor)));
    const width = Math.round(height * 460 / 650);
    this.window.setBounds(fitBounds({ x: b.x + (b.width - width) / 2,
      y: b.y + b.height - height, width, height }, this.screen.getAllDisplays()));
    this.save();
  }
  recover() {
    this.window.setBounds(fitBounds(this.window.getBounds(), this.screen.getAllDisplays()));
  }
  reset() {
    const a = this.screen.getPrimaryDisplay().workArea;
    this.petBounds = { x: a.x + a.width - 484, y: a.y + a.height - 674, width: 460, height: 650 };
    this.applied = false; this.setMode('pet'); this.show();
  }
  show() {
    if (this.window.isMinimized()) this.window.restore();
    this.window.show(); this.window.setAlwaysOnTop(this.mode === 'pet');
  }
  openInput(toggle = false) {
    this.forceIgnore = false; this.emit('force-ignore-mouse-changed', false);
    this.show(); this.window.focus();
    this.hover.add('input-subtitle'); this.lastHover = Date.now(); this.updateIgnore();
    this.emit(toggle ? 'toggle-input-subtitle' : 'pet-open-input');
  }
  toggleForceIgnore() {
    this.forceIgnore = !this.forceIgnore; this.drag = null;
    this.emit('force-ignore-mouse-changed', this.forceIgnore); this.updateIgnore(); this.onStateChange?.();
  }
  save() {
    if (this.applied && !this.window.isDestroyed()) {
      if (this.mode === 'pet') this.petBounds = this.window.getBounds();
      else this.windowBounds = this.window.getBounds();
    }
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath + '.tmp', JSON.stringify({ mode: this.mode,
        petBounds: this.petBounds, windowBounds: this.windowBounds }));
      fs.renameSync(this.statePath + '.tmp', this.statePath);
    } catch { /* Read-only or full disks must not take away the tray/exit recovery path. */ }
  }
}
module.exports = { PetController, fitBounds };
