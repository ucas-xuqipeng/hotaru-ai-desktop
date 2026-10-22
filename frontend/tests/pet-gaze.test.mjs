import test from 'node:test';
import assert from 'node:assert/strict';
import { idleGaze } from '../src/renderer/src/utils/pet-gaze.ts';

test('idle gaze follows the global cursor direction with bounded head and eye motion', () => {
  assert.deepEqual(idleGaze({ x: 230, y: 149.5 }, 460, 650, 'idle', false, false, 4000), { x: 0, y: 0 });
  const right = idleGaze({ x: 4000, y: -1000 }, 460, 650, 'idle', false, false, 4000);
  assert.deepEqual(right, { x: 0.65, y: 0.45 });
  const left = idleGaze({ x: -3000, y: 1000 }, 460, 650, 'idle', false, false, 4000);
  assert.deepEqual(left, { x: -0.65, y: -0.45 });
});

test('typing, dragging, speaking and recent interaction return the gaze to center', () => {
  for (const [state, dragging, editing, elapsed] of [['thinking-speaking', false, false, 5000],
    ['idle', true, false, 5000], ['idle', false, true, 5000], ['idle', false, false, 1000]]) {
    assert.deepEqual(idleGaze({ x: 900, y: 50 }, 460, 650, state, dragging, editing, elapsed), { x: 0, y: 0 });
  }
});
