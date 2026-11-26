// Shared helpers (M12-clean N4): one clamp and one DEG for the whole game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, DEG } from '../game/src/util.js';

test('clamp passes through the middle and pins the edges', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

test('DEG is PI/180', () => {
  assert.equal(DEG, Math.PI / 180);
});
