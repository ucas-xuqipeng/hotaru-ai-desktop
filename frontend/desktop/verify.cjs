'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { sanitizeFrame, consoleDiagnostic, verificationComplete } = require('./policy.cjs');
const PROMPT = '你好，请简短打招呼并点头。';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function pageReady() {
  return Boolean(document.querySelector('[data-hotaru-input]')
    && document.querySelector('[data-ai-state="idle"]')
    && window.getLAppAdapter?.()?.getModel?.()?._model);
}

// Attached only for explicit developer verification, before loading the real page.
async function createVerification(window, outputPath) {
  if (!path.isAbsolute(outputPath) || path.extname(outputPath).toLowerCase() !== '.json') throw new Error('验证输出必须是绝对路径的 JSON 文件。');
  const wc = window.webContents;
  const result = { prompt: PROMPT, status: 'waiting', events: [], diagnostics: [], audioPresent: false, backendSynthComplete: false, idle: false, playbackFailed: false };
  let submitted = false;
  const listener = (_event, method, params) => {
    if (!submitted || method !== 'Network.webSocketFrameReceived') return;
    try {
      const summary = sanitizeFrame(JSON.parse(params.response.payloadData));
      if (!summary) return;
      if (summary.audioPresent) result.audioPresent = true;
      if (summary.type === 'backend-synth-complete') result.backendSynthComplete = true;
      if (result.events.length < 100) result.events.push(summary);
    } catch { /* Ignore non-JSON/binary frames, never persist raw frames. */ }
  };
  const consoleListener = (event) => {
    if (!submitted) return;
    const diagnostic = consoleDiagnostic(event.message);
    if (diagnostic === 'audio-playback-error' || diagnostic === 'audio-setup-error') result.playbackFailed = true;
    if (diagnostic && result.diagnostics.length < 100) result.diagnostics.push(diagnostic);
  };
  wc.debugger.attach('1.3');
  wc.debugger.on('message', listener);
  wc.on('console-message', consoleListener);
  await wc.debugger.sendCommand('Network.enable');
  return async function verify() {
    try {
      const deadline = Date.now() + 180000;
      let ready = false;
      while (Date.now() < deadline) {
        ready = await wc.executeJavaScript(`(${pageReady.toString()})()`);
        if (ready) break;
        await delay(500);
      }
      if (!ready) throw new Error('ui-not-ready');
      const found = await wc.executeJavaScript(`(() => { const input = document.querySelector('[data-hotaru-input]'); if (!input) return false; input.focus(); return true; })()`);
      if (!found) throw new Error('ui-not-ready');
      // Native input events follow the same React handlers as a person typing.
      window.show?.(); window.focus?.(); wc.focus?.();
      await wc.insertText(PROMPT);
      await delay(100);
      submitted = true;
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      const replyDeadline = Date.now() + 240000;
      while (Date.now() < replyDeadline) {
        result.idle = await wc.executeJavaScript(`Boolean(document.querySelector('[data-ai-state="idle"]'))`);
        if (result.playbackFailed) { result.status = 'verification-failed'; break; }
        if (verificationComplete(result)) { result.status = 'complete'; break; }
        await delay(500);
      }
      if (result.status === 'waiting') result.status = 'timeout';
    } catch { result.status = 'verification-failed'; }
    finally {
      wc.debugger.removeListener('message', listener);
      wc.removeListener('console-message', consoleListener);
      if (wc.debugger.isAttached()) wc.debugger.detach();
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      if (!window.isDestroyed()) {
        const screenshotPath = outputPath.replace(/\.json$/i, '.png');
        fs.writeFileSync(screenshotPath, (await wc.capturePage()).toPNG());
        result.screenshot = path.basename(screenshotPath);
      }
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    }
  };
}
module.exports = { createVerification, pageReady };
