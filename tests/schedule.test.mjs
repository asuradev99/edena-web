import test from 'node:test';
import assert from 'node:assert/strict';
import { coalesce } from '../build/index.js';

// `requestAnimationFrame` does not exist in Node, so stand in for the browser's frame clock and
// fire the callbacks by hand. That makes the fold deterministic instead of timing-dependent.
test('coalesce folds rapid calls into one frame and keeps the latest arguments', () => {
  const scheduled = [];
  const previous = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = handler => { scheduled.push(handler); return scheduled.length; };
  try {
    const calls = [];
    const handler = coalesce((a, b) => calls.push([a, b]));
    handler(1, 'a'); handler(2, 'b'); handler(3, 'c');
    assert.equal(calls.length, 0, 'nothing runs until the frame fires');
    assert.equal(scheduled.length, 1, 'rapid calls share one scheduled frame');
    scheduled.shift()();
    assert.deepEqual(calls, [[3, 'c']], 'the last arguments of the frame win');
    handler(4, 'd');
    assert.equal(scheduled.length, 1, 'the next call schedules a fresh frame');
    scheduled.shift()();
    assert.deepEqual(calls, [[3, 'c'], [4, 'd']]);
  } finally {
    if (previous) globalThis.requestAnimationFrame = previous;
    else delete globalThis.requestAnimationFrame;
  }
});
