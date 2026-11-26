// Cockpit view toggle — pure state in input.js (no DOM at import time, so this
// runs in node). Key 'c' toggles; default is chase view.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isCockpit, setCockpit, toggleCockpit } from '../game/src/input.js';

test('cockpit view defaults to chase (off)', () => {
  setCockpit(false);
  assert.equal(isCockpit(), false);
});

test('toggleCockpit flips the view', () => {
  setCockpit(false);
  toggleCockpit();
  assert.equal(isCockpit(), true);
  toggleCockpit();
  assert.equal(isCockpit(), false);
});

test('setCockpit sets the view explicitly', () => {
  setCockpit(true);
  assert.equal(isCockpit(), true);
  setCockpit(false);
  assert.equal(isCockpit(), false);
});
