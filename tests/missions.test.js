// RED — mission tests (TDD). Run: node --test tests/missions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld } from '../game/src/world.js';
import { MISSIONS, createMissionRun, updateMission } from '../game/src/missions.js';

test('three mission archetypes exist with distinct goals and rewards', () => {
  assert.equal(MISSIONS.length, 3);
  const kinds = MISSIONS.map((m) => m.kind).sort();
  assert.deepEqual(kinds, ['precision', 'ring', 'storm']);
  for (const m of MISSIONS) {
    assert.ok(m.reward > 0, `${m.kind} has a reward`);
    assert.ok(m.title.length > 0 && m.brief.length > 0, `${m.kind} has text`);
  }
});

test('ring run completes when every ring is collected', () => {
  const world = createWorld({ seed: 1, mission: 'ring' });
  const run = createMissionRun(MISSIONS.find((m) => m.kind === 'ring'), world);
  assert.equal(run.status, 'active');
  for (const ring of world.rings) {
    world.plane.x = ring.x; world.plane.y = ring.y; world.plane.z = ring.z;
    world.plane.speed = 100; world.plane.airborne = true;
    stepWorld(world, 0.1, { throttle: 0.7, pitch: 0, roll: 0 });
    updateMission(run, world);
  }
  assert.equal(run.status, 'complete');
});

test('ring run fails when the plane crashes', () => {
  const world = createWorld({ seed: 1, mission: 'ring' });
  const run = createMissionRun(MISSIONS.find((m) => m.kind === 'ring'), world);
  world.plane.crashed = true;
  updateMission(run, world);
  assert.equal(run.status, 'failed');
});

test('precision delivery completes on a gentle landing after the pickup ring', () => {
  const world = createWorld({ seed: 1, mission: 'ring' });
  const run = createMissionRun(MISSIONS.find((m) => m.kind === 'precision'), world);
  const ring = world.rings[0];
  world.plane.x = ring.x; world.plane.y = ring.y; world.plane.z = ring.z;
  world.plane.speed = 100; world.plane.airborne = true;
  stepWorld(world, 0.1, { throttle: 0.7, pitch: 0, roll: 0 });
  updateMission(run, world);
  assert.equal(run.pickedUp, true);
  world.plane.speed = 70; world.plane.y = 5; world.plane.vs = -5;
  world.plane.x = 0; world.plane.z = -1500;
  for (let i = 0; i < 40 && !world.plane.landed; i += 1) {
    stepWorld(world, 0.1, { throttle: 0.2, pitch: 8, roll: 0 });
    updateMission(run, world);
  }
  assert.equal(world.plane.landed, true);
  assert.equal(run.status, 'complete');
});

test('storm run fails when the time limit expires', () => {
  const world = createWorld({ seed: 1, mission: 'ring' });
  const mission = MISSIONS.find((m) => m.kind === 'storm');
  const run = createMissionRun(mission, world);
  world.time = mission.timeLimit + 1;
  updateMission(run, world);
  assert.equal(run.status, 'failed');
});
