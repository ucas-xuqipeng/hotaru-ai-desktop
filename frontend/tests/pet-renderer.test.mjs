import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { petHitTarget, petModelPoint, fitPetProjection } from '../src/renderer/src/utils/pet-hit.ts';

test('blank space and points outside the pet window pass through while visible panels stay interactive', () => {
  const panel = { left: 20, top: 400, right: 440, bottom: 630 };
  const hitModel = (x, y) => x > 150 && x < 300 && y > 50 && y < 350;
  assert.equal(petHitTarget({ x: 5, y: 5 }, 460, 650, [panel], hitModel), null);
  assert.equal(petHitTarget({ x: 200, y: 200 }, 460, 650, [panel], hitModel), 'live2d-model');
  assert.equal(petHitTarget({ x: 30, y: 500 }, 460, 650, [panel], hitModel), 'input-subtitle');
  assert.equal(petHitTarget({ x: -1, y: 500 }, 460, 650, [panel], () => true), null);
  assert.equal(petHitTarget({ x: 470, y: 500 }, 460, 650, [panel], () => true), null);
});

test('portrait and landscape pointer coordinates invert the actual fitted projection', () => {
  assert.deepEqual(petModelPoint({ x: 230, y: 325 }, 460, 650), { x: 0, y: 0 });
  const portrait = petModelPoint({ x: 230, y: 127.2 }, 460, 650);
  assert.ok(Math.abs(portrait.y - 1) < 0.000001);
  const landscape = petModelPoint({ x: 627.8, y: 230 }, 860, 460);
  assert.ok(Math.abs(landscape.x - 1) < 0.000001);
});

test('hit coordinates round-trip through the real Cubism projection without overwriting its aspect ratio', () => {
  const bundled = buildSync({ entryPoints: [fileURLToPath(new URL('../src/renderer/WebSDK/Framework/src/math/cubismmatrix44.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  const m = { exports: {} }; new Function('module', 'exports', bundled)(m, m.exports);
  for (const [width, height] of [[460, 650], [860, 460]]) {
    const projection = new m.exports.CubismMatrix44();
    projection.scale(width < height ? 1 : height / width, width < height ? width / height : 1);
    fitPetProjection(projection);
    const px = width / 2 + projection.transformX(0.4) * width / 2;
    const py = height / 2 - projection.transformY(0.8) * height / 2;
    const restored = petModelPoint({ x: px, y: py }, width, height);
    assert.ok(Math.abs(restored.x - 0.4) < 0.000001);
    assert.ok(Math.abs(restored.y - 0.8) < 0.000001);
  }
});

test('unloaded or throwing Live2D model cannot create an invisible input blocker', () => {
  assert.equal(petHitTarget({ x: 200, y: 200 }, 460, 650, [], () => { throw Error('not loaded'); }), null);
  assert.equal(petHitTarget({ x: NaN, y: 200 }, 460, 650, [], () => true), null);
});
