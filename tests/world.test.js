// RED — flight model tests (TDD). Run: node --test tests/
// Every test must FAIL before game/src/world.js exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, stepWorld, STALL_SPEED, mulberry32 } from '../game/src/world.js';

function fresh(seed = 1) {
  return createWorld({ seed });
}

test('fresh world starts on the runway, stopped, full fuel and hull', () => {
  const w = fresh();
  assert.equal(w.plane.speed, 0);
  assert.equal(w.plane.fuel, 100);
  assert.equal(w.plane.hull, 100);
  assert.equal(w.plane.airborne, false);
  assert.equal(w.plane.y, 0);
});

test('full throttle reaches cruise speed within 30 seconds', () => {
  const w = fresh();
  for (let i = 0; i < 30; i += 1) stepWorld(w, 1, { throttle: 1, pitch: 0, roll: 0 });
  assert.ok(w.plane.speed >= 100, `speed ${w.plane.speed} < 100 kts`);
  assert.ok(w.plane.speed <= 160, `speed ${w.plane.speed} > 160 kts`);
});

test('lift scales with speed squared: no climb at low speed, climb at cruise', () => {
  const slow = fresh();
  slow.plane.speed = 40; slow.plane.y = 500; slow.plane.airborne = true;
  stepWorld(slow, 1, { throttle: 0.4, pitch: 10, roll: 0 });
  const slowVs = slow.plane.vs;
  const fast = fresh();
  fast.plane.speed = 110; fast.plane.y = 500; fast.plane.airborne = true;
  stepWorld(fast, 1, { throttle: 0.7, pitch: 10, roll: 0 });
  assert.ok(slowVs < 0, `slow plane should sink, vs=${slowVs}`);
  assert.ok(fast.plane.vs > 0, `fast plane should climb, vs=${fast.plane.vs}`);
});

test('stall below 55 kts sinks the plane and damps pitch down', () => {
  const w = fresh();
  w.plane.speed = 50; w.plane.y = 500; w.plane.airborne = true; w.plane.pitch = 10;
  stepWorld(w, 1, { throttle: 0.3, pitch: 10, roll: 0 });
  assert.ok(w.plane.y < 500, `stall should lose altitude, y=${w.plane.y}`);
  assert.ok(w.plane.pitch < 10, `stall should damp pitch down, pitch=${w.plane.pitch}`);
  assert.equal(STALL_SPEED, 55);
});

test('fuel burns with throttle and never goes below zero', () => {
  const full = fresh();
  for (let i = 0; i < 10; i += 1) stepWorld(full, 1, { throttle: 1, pitch: 0, roll: 0 });
  const idle = fresh();
  for (let i = 0; i < 10; i += 1) stepWorld(idle, 1, { throttle: 0, pitch: 0, roll: 0 });
  assert.ok(full.plane.fuel < idle.plane.fuel, `full ${full.plane.fuel} should burn more than idle ${idle.plane.fuel}`);
  const dry = fresh();
  dry.plane.fuel = 0.1;
  for (let i = 0; i < 60; i += 1) stepWorld(dry, 1, { throttle: 1, pitch: 0, roll: 0 });
  assert.equal(dry.plane.fuel, 0);
  assert.equal(dry.plane.throttle, 0, 'empty tank forces throttle to zero');
});

test('steady wind displaces the ground track', () => {
  const calm = fresh();
  calm.wind = { x: 0, z: 0 }; calm.gust = { x: 0, z: 0 };
  calm.plane.speed = 100; calm.plane.y = 500; calm.plane.airborne = true;
  const windy = fresh();
  windy.wind = { x: 10, z: 0 }; windy.gust = { x: 0, z: 0 };
  windy.plane.speed = 100; windy.plane.y = 500; windy.plane.airborne = true;
  for (let i = 0; i < 10; i += 1) {
    stepWorld(calm, 1, { throttle: 0.7, pitch: 0, roll: 0 });
    stepWorld(windy, 1, { throttle: 0.7, pitch: 0, roll: 0 });
  }
  assert.ok(windy.plane.x - calm.plane.x > 50, `wind should push east, dx=${windy.plane.x - calm.plane.x}`);
});

test('gusts are deterministic for the same seed', () => {
  const a = fresh(42);
  const b = fresh(42);
  for (let i = 0; i < 20; i += 1) {
    stepWorld(a, 0.5, { throttle: 0.7, pitch: 0, roll: 0 });
    stepWorld(b, 0.5, { throttle: 0.7, pitch: 0, roll: 0 });
  }
  assert.equal(a.plane.x, b.plane.x);
  assert.equal(a.plane.y, b.plane.y);
  assert.equal(mulberry32(42)(), mulberry32(42)());
});

test('gentle touchdown on the runway lands the plane', () => {
  const w = fresh();
  w.plane.speed = 70; w.plane.y = 5; w.plane.vs = -5; w.plane.airborne = true;
  w.plane.x = 0; w.plane.z = -1500; // over the runway
  // Flare (pitch up) to soften the sink rate, like a real landing.
  for (let i = 0; i < 40 && !w.plane.landed; i += 1) stepWorld(w, 0.1, { throttle: 0.2, pitch: 8, roll: 0 });
  assert.equal(w.plane.landed, true);
  assert.equal(w.plane.hull, 100);
});

test('hard touchdown damages the hull', () => {
  const w = fresh();
  w.plane.speed = 70; w.plane.y = 5; w.plane.vs = -25; w.plane.airborne = true;
  w.plane.x = 0; w.plane.z = -1500;
  for (let i = 0; i < 20 && w.plane.y > 0; i += 1) stepWorld(w, 0.1, { throttle: 0.2, pitch: 0, roll: 0 });
  assert.ok(w.plane.hull < 100, `hard landing should damage hull, hull=${w.plane.hull}`);
  assert.equal(w.plane.landed, false);
});

test('flying through a ring collects it', () => {
  const w = fresh();
  const ring = w.rings[0];
  assert.ok(ring, 'mission has at least one ring');
  w.plane.x = ring.x; w.plane.y = ring.y; w.plane.z = ring.z;
  w.plane.speed = 100; w.plane.airborne = true;
  stepWorld(w, 0.1, { throttle: 0.7, pitch: 0, roll: 0 });
  assert.equal(ring.collected, true);
  assert.equal(w.collected, 1);
});

// V2-B (cut 3 — hangar shop): upgrade effects are real, wired into the
// flight model — Turbine raises the speed ceiling, Fuel Pods stretch the
// tank, Reinforced Glider tolerates a harder touchdown.
test('Turbine Boost raises the top speed past the stock 150 kts ceiling', () => {
  const base = fresh();
  const fast = createWorld({ seed: 1, upgrades: ['turbine'] });
  for (let i = 0; i < 30; i += 1) {
    stepWorld(base, 1, { throttle: 1, pitch: 0, roll: 0 });
    stepWorld(fast, 1, { throttle: 1, pitch: 0, roll: 0 });
  }
  assert.ok(base.plane.speed <= 155, `stock should cap near 150, got ${base.plane.speed}`);
  assert.ok(fast.plane.speed >= 165, `turbine should pass 165, got ${fast.plane.speed}`);
});

test('Fuel Pods burn slower: same full-throttle hour leaves more fuel', () => {
  const base = fresh();
  const pods = createWorld({ seed: 1, upgrades: ['fuel'] });
  for (const w of [base, pods]) { w.plane.y = 500; w.plane.airborne = true; w.plane.speed = 100; }
  for (let i = 0; i < 60; i += 1) {
    stepWorld(base, 1, { throttle: 1, pitch: 0, roll: 0 });
    stepWorld(pods, 1, { throttle: 1, pitch: 0, roll: 0 });
  }
  assert.ok(pods.plane.fuel - base.plane.fuel > 4,
    `pods ${pods.plane.fuel} should keep >4 more fuel than base ${base.plane.fuel}`);
});

test('Reinforced Glider lands a touchdown that would damage the stock plane', () => {
  const setup = (upgrades) => {
    const w = createWorld({ seed: 1, upgrades });
    w.plane.speed = 80; w.plane.y = 0.5; w.plane.vs = -10; w.plane.airborne = true;
    w.plane.x = 0; w.plane.z = -1500; // over the runway
    for (let i = 0; i < 10 && w.plane.y > 0; i += 1) stepWorld(w, 0.05, { throttle: 0, pitch: 0, roll: 0 });
    return w;
  };
  const stock = setup([]);
  assert.equal(stock.plane.landed, false, 'stock |vs| ~8.7 exceeds the 8 ft/s limit');
  assert.ok(stock.plane.hull < 100, `stock should take damage, hull=${stock.plane.hull}`);
  const glider = setup(['glider']);
  assert.equal(glider.plane.landed, true, 'glider tolerates |vs| ~8.7 (limit 11.2)');
  assert.equal(glider.plane.hull, 100);
});
test('every ring clears the peak of the island it sits over', async () => {
  const { ISLANDS } = await import('../game/src/config.js');
  const w = fresh();
  assert.ok(w.rings.length > 0, 'mission has rings');
  for (const ring of w.rings) {
    for (const island of ISLANDS) {
      const d = Math.hypot(ring.x - island.x, ring.z - island.z);
      if (d > island.radius + ring.r) continue;
      assert.ok(
        ring.y - ring.r > island.height,
        `ring at (${ring.x},${ring.y},${ring.z}) bottom ${ring.y - ring.r} ft `
        + `is below ${island.name} peak ${island.height} ft`,
      );
    }
  }
});
