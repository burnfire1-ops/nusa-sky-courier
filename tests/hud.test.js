// HUD pure helpers — M9.3: formatClock drives the objective panel timer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClock } from '../game/src/hud.js';

test('formatClock formats mm:ss', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(65), '01:05');
  assert.equal(formatClock(240), '04:00');
  assert.equal(formatClock(599), '09:59');
});

test('formatClock clamps negatives and floors fractions', () => {
  assert.equal(formatClock(-5), '00:00');
  assert.equal(formatClock(90.9), '01:30');
});
