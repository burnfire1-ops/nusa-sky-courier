// Landing-shot staging invariants — locks the 27 Nov fix: the old staging
// aimed at the runway centre with wantAlt -> 0 at the target, so wind drift
// + overshoot turned the plane around (HDG 103) and it touched down hard
// off-runway (HULL 69%), rolling on the sea. The shot must freeze on final:
// aligned with the strip, above the threshold, hull intact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stageShot, autopilotTo } from '../game/src/shots.js';
import { createWorld } from '../game/src/world.js';

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

// V2-A (cut 4 — chase default): the play shot must show the aircraft in
// frame (judge criterion 1), so it is staged chase, not cockpit. The
// cockpit view stays available in live play via the C toggle (input.js).
test('play shot is staged for chase view, other shots are chase too', () => {
  assert.equal(stageShot('play', 1).cockpit, false);
  assert.equal(stageShot('start', 1).cockpit, false);
  assert.equal(stageShot('landing', 1).cockpit, false);
  assert.equal(stageShot('end', 1).cockpit, false);
});

// M12-clean N6: autopilotTo was untested (only stageShot was covered).
test('autopilotTo rolls toward the target heading', () => {
  const w = createWorld({ seed: 1 });
  w.plane.heading = 0; w.plane.speed = 90; w.plane.y = 1000;
  const east = autopilotTo(w, 10000, 1000, w.plane.z);
  assert.ok(east.roll > 0, `target east should roll right, roll=${east.roll}`);
  const north = autopilotTo(w, 0, 1000, 10000);
  assert.ok(Math.abs(north.roll) < 0.05, `target ahead should fly straight, roll=${north.roll}`);
});

test('autopilotTo uses full throttle while climbing hard, cruise throttle otherwise', () => {
  const w = createWorld({ seed: 1 });
  w.plane.speed = 90; w.plane.y = 500;
  assert.equal(autopilotTo(w, 0, 2000, 10000).throttle, 1, 'altErr 1500 > 100');
  const cruise = autopilotTo(w, 0, 500, 10000).throttle;
  assert.ok(cruise >= 0.25 && cruise <= 1, `cruise throttle ${cruise}`);
});

test('autopilotTo clamps pitch to the staging envelope', () => {
  const w = createWorld({ seed: 1 });
  w.plane.y = 100;
  assert.equal(autopilotTo(w, 0, 5000, 10000).pitch, 15);
  w.plane.y = 5000;
  assert.equal(autopilotTo(w, 0, 100, 10000).pitch, -8);
});
