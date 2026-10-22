'use strict';
// Developer-only integration checks, enabled exclusively by --verify-pet=<absolute JSON>.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function verifyPet(window, pet, outputPath) {
  if (!path.isAbsolute(outputPath) || path.extname(outputPath) !== '.json') throw Error('验证输出必须是绝对路径的 JSON 文件。');
  const result = { status: 'running', checks: {}, errors: [] };
  const wc = window.webContents;
  const waitFor = async source => {
    const end = Date.now() + 180000;
    while (Date.now() < end) { if (await wc.executeJavaScript(source)) return; await delay(250); }
    throw Error('renderer-ready-timeout');
  };
  try {
    await waitFor(`(() => { const m = window.getLAppAdapter?.()?.getModel?.(); return Boolean(m?._model
      && m._textureCount > 0 && m._textureCount >= m._modelSetting.getTextureCount()
      && document.documentElement.dataset.petMode === 'pet'); })()`);
    await delay(3000);
    pet.show();
    pet.setMode('pet');
    await delay(300);
    result.nativeProperties = { alwaysOnTop: window.isAlwaysOnTop(), resizable: window.isResizable(),
      visible: window.isVisible(), opacity: window.getOpacity(), bounds: window.getBounds(), controllerMode: pet.mode };
    assert.equal(window.isAlwaysOnTop(), true, 'native-topmost');
    assert.equal(window.isResizable(), false, 'native-resizable');
    result.checks.nativePetWindow = true;
    const screenshot = await wc.capturePage();
    const bitmap = screenshot.getBitmap();
    let transparent = 0, opaque = 0;
    for (let i = 3; i < bitmap.length; i += 4) { if (bitmap[i] === 0) transparent++; if (bitmap[i] > 200) opaque++; }
    assert.ok(transparent > bitmap.length / 4 * 0.2); assert.ok(opaque > bitmap.length / 4 * 0.12);
    result.checks.transparentPixels = transparent; result.checks.characterPixels = opaque;
    fs.writeFileSync(outputPath.replace(/\.json$/, '-character.png'), screenshot.toPNG());
    const before = window.getBounds(); pet.resize(1.12);
    assert.ok(window.getBounds().width > before.width); result.checks.nativeResize = true;
    window.setBounds(before); pet.save();
    pet.setMode('window');
    await waitFor(`document.documentElement.dataset.petMode === 'window'`);
    assert.equal(window.isAlwaysOnTop(), false); result.checks.fullWindowMode = true;
    pet.toggleForceIgnore(); pet.openInput(); pet.setMode('pet');
    await waitFor(`document.documentElement.dataset.petMode === 'pet'`);
    assert.equal(pet.forceIgnore, false); result.checks.modeRoundtrip = true;
    pet.openInput();
    await waitFor(`Boolean(document.querySelector('[data-hotaru-input]'))`);
    await delay(1000);
    fs.writeFileSync(outputPath.replace(/\.json$/, '-after-switch.png'), (await wc.capturePage()).toPNG());
    result.checks.chineseInputReady = true;
    await wc.executeJavaScript(`window.inputSubtitle?.close(); document.activeElement?.blur()`);
    await delay(2600);
    const nativeScreen = pet.screen;
    result.checks.idleGazeSimulatedCursor = true;
    const originalCursor = nativeScreen.getCursorScreenPoint;
    try {
      const b = window.getBounds();
      nativeScreen.getCursorScreenPoint = () => ({ x: b.x + b.width * 3, y: b.y - b.height });
      await delay(600);
      result.checks.idleGazeRight = await wc.executeJavaScript(`window.getLAppAdapter().getModel()._dragManager.getX() > 0.3`);
      nativeScreen.getCursorScreenPoint = () => ({ x: b.x - b.width * 3, y: b.y + b.height * 2 });
      await delay(1000);
      result.checks.idleGazeLeft = await wc.executeJavaScript(`window.getLAppAdapter().getModel()._dragManager.getX() < -0.3`);
      assert.equal(result.checks.idleGazeRight, true); assert.equal(result.checks.idleGazeLeft, true);
    } finally { nativeScreen.getCursorScreenPoint = originalCursor; }
    result.status = 'complete';
  } catch (error) { result.status = 'failed'; result.errors.push(error.message || error.code || 'verification-error'); }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  return result;
}
module.exports = { verifyPet };
