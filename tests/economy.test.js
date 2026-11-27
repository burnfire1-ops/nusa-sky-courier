// RED — economy tests (TDD). Run: node --test tests/economy.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEconomy, addReward, landingRank, applyLanding, buyUpgrade } from '../game/src/economy.js';

test('fresh economy starts at zero KR, no best rank yet', () => {
  const e = createEconomy();
  assert.equal(e.kr, 0);
  assert.equal(e.bestRank, null);
  assert.deepEqual(e.upgrades, []);
});

test('landing rank S needs a gentle slow landing with all rings and full hull', () => {
  assert.equal(landingRank({ vs: -2, speed: 70, rings: 3, ringsTotal: 3, hull: 100 }).rank, 'S');
  assert.equal(landingRank({ vs: -6, speed: 70, rings: 3, ringsTotal: 3, hull: 100 }).rank, 'A');
  assert.equal(landingRank({ vs: -7, speed: 85, rings: 1, ringsTotal: 3, hull: 85 }).rank, 'B');
  assert.equal(landingRank({ vs: -8, speed: 89, rings: 0, ringsTotal: 3, hull: 60 }).rank, 'C');
});

// V2-C (cut 3): one Rank per landing, no reputation ladder — bestRank
// keeps the best landing Rank (S > A > B > C) and never drops.
test('bestRank keeps the best landing rank and KR accumulates', () => {
  const e = createEconomy();
  applyLanding(e, { vs: -2, speed: 70, rings: 3, ringsTotal: 3, hull: 100 });
  assert.equal(e.bestRank, 'S');
  assert.equal(e.kr, 100);
  applyLanding(e, { vs: -8, speed: 89, rings: 0, ringsTotal: 3, hull: 60 });
  assert.equal(e.bestRank, 'S', 'a later C landing must not lower the best rank');
  assert.equal(e.kr, 120);
  const e2 = createEconomy();
  applyLanding(e2, { vs: -7, speed: 85, rings: 1, ringsTotal: 3, hull: 85 });
  assert.equal(e2.bestRank, 'B');
  applyLanding(e2, { vs: -6, speed: 70, rings: 3, ringsTotal: 3, hull: 100 });
  assert.equal(e2.bestRank, 'A');
});

// V2-B (cut 3 — hangar shop): 3 upgrades, bought with KR, effects are
// real (wired into world.js), cheapest affordable after Mission 1.
test('buyUpgrade refuses without enough KR and leaves KR untouched', () => {
  const e = createEconomy();
  const r = buyUpgrade(e, 'glider');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'funds');
  assert.equal(e.kr, 0);
  assert.deepEqual(e.upgrades, []);
});

test('buyUpgrade deducts KR, records the upgrade, refuses a second buy', () => {
  const e = createEconomy();
  addReward(e, 120);
  const r = buyUpgrade(e, 'glider');
  assert.equal(r.ok, true);
  assert.equal(e.kr, 0);
  assert.deepEqual(e.upgrades, ['glider']);
  const again = buyUpgrade(e, 'glider');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'owned');
});

test('buyUpgrade refuses an unknown upgrade id', () => {
  const e = createEconomy();
  addReward(e, 9999);
  assert.equal(buyUpgrade(e, 'warp-drive').ok, false);
  assert.equal(buyUpgrade(e, 'warp-drive').reason, 'unknown');
});

test('cheapest upgrade costs no more than the Mission 1 reward', async () => {
  const { UPGRADES } = await import('../game/src/config.js');
  const { MISSIONS } = await import('../game/src/missions.js');
  assert.equal(UPGRADES.length, 3, 'exactly 3 upgrades (cut 3)');
  const cheapest = Math.min(...UPGRADES.map((u) => u.price));
  assert.ok(cheapest <= MISSIONS[0].reward,
    `cheapest ${cheapest} KR must be <= Mission 1 reward ${MISSIONS[0].reward} KR`);
});
