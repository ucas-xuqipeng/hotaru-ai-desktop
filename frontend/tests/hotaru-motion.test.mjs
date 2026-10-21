import test from 'node:test';
import assert from 'node:assert/strict';
import { playDialogueMotion } from '../src/renderer/src/utils/dialogue-motion.ts';

function modelAdapter(groups) {
  const calls = [];
  return { calls, getMotionGroups: () => groups, getMotionCount: () => 1,
    startMotion: (...args) => calls.push(args) };
}

test('a selected thinking motion reaches the model with force priority', () => {
  const adapter = modelAdapter(['mtn_idle01_C', 'mtn_thinking01_C']);
  assert.equal(playDialogueMotion(adapter, ['mtn_thinking01_C']), 'mtn_thinking01_C');
  assert.deepEqual(adapter.calls, [['mtn_thinking01_C', 0, 3]]);
});

test('an unknown or path-like motion uses an existing idle motion', () => {
  const adapter = modelAdapter(['mtn_idle01_C', '../../not-a-motion']);
  assert.equal(playDialogueMotion(adapter, ['../../not-a-motion']), 'mtn_idle01_C');
  assert.deepEqual(adapter.calls, [['mtn_idle01_C', 0, 3]]);
});

test('missing models and absent motion groups cause no playback', () => {
  assert.equal(playDialogueMotion(null, ['mtn_nod01_C']), null);
  const adapter = modelAdapter([]);
  assert.equal(playDialogueMotion(adapter, ['mtn_nod01_C']), null);
  assert.deepEqual(adapter.calls, []);
});

test('upstream models without Hotaru groups retain Talk fallback', () => {
  const adapter = modelAdapter(['Idle', 'Talk']);
  assert.equal(playDialogueMotion(adapter), 'Talk');
  assert.deepEqual(adapter.calls, [['Talk', 0, 3]]);
});
