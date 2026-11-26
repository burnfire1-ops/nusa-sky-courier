// Landing-shot staging invariants — locks the 27 Nov fix: the old staging
// aimed at the runway centre with wantAlt -> 0 at the target, so wind drift
// + overshoot turned the plane around (HDG 103) and it touched down hard
// off-runway (HULL 69%), rolling on the sea. The shot must freeze on final:
// aligned with the strip, above the threshold, hull intact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stageShot } from '../game/src/shots.js';

test('landing shot freezes on final over the runway', () => {
  const { world } = stageShot('landing', 1);
  const p = world.plane;
  assert.equal(p.airborne, true, 'plane must still be airborne');
  assert.equal(p.hull, 100, `hull=${p.hull}`);
  assert.ok(p.z >= -3000 && p.z <= -2000, `z=${p.z}`);
  assert.ok(p.y >= 60 && p.y <= 400, `y=${p.y}`);
  const hdg = Math.min(p.heading, 360 - p.heading);
  assert.ok(hdg <= 15, `heading=${p.heading}`);
  assert.ok(Math.abs(p.x) <= 100, `x=${p.x}`);
});

test('end shot shares the clean final-approach staging', () => {
  const { world, screen } = stageShot('end', 1);
  assert.equal(screen, 'debrief');
  assert.equal(world.plane.hull, 100);
  assert.ok(world.plane.z >= -3000 && world.plane.z <= -2000, `z=${world.plane.z}`);
});

test('play shot is staged for cockpit view, other shots are chase', () => {
  assert.equal(stageShot('play', 1).cockpit, true);
  assert.equal(stageShot('start', 1).cockpit, false);
  assert.equal(stageShot('landing', 1).cockpit, false);
  assert.equal(stageShot('end', 1).cockpit, false);
});
