// RED — economy tests (TDD). Run: node --test tests/economy.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEconomy, buyUpgrade, addReward, landingRank, applyLanding, UPGRADES, RANKS } from '../game/src/economy.js';

test('fresh economy starts at zero KR, rank PEMULA, no upgrades', () => {
  const e = createEconomy();
  assert.equal(e.kr, 0);
  assert.equal(e.rank, 'PEMULA');
  assert.deepEqual(e.upgrades, { engine: 0, tank: 0, hull: 0 });
});

test('buying an upgrade deducts KR and applies it once', () => {
  const e = createEconomy();
  addReward(e, 500);
  assert.equal(buyUpgrade(e, 'engine'), true);
  assert.equal(e.kr, 500 - UPGRADES.engine.cost);
  assert.equal(e.upgrades.engine, 1);
  assert.equal(buyUpgrade(e, 'engine'), false, 'already owned');
});

test('buying without enough KR fails and changes nothing', () => {
  const e = createEconomy();
  assert.equal(buyUpgrade(e, 'tank'), false);
  assert.equal(e.kr, 0);
  assert.equal(e.upgrades.tank, 0);
});

test('landing rank S needs a gentle slow landing with all rings and full hull', () => {
  assert.equal(landingRank({ vs: -2, speed: 70, rings: 3, ringsTotal: 3, hull: 100 }).rank, 'S');
  assert.equal(landingRank({ vs: -6, speed: 70, rings: 3, ringsTotal: 3, hull: 100 }).rank, 'A');
  assert.equal(landingRank({ vs: -7, speed: 85, rings: 1, ringsTotal: 3, hull: 85 }).rank, 'B');
  assert.equal(landingRank({ vs: -8, speed: 89, rings: 0, ringsTotal: 3, hull: 60 }).rank, 'C');
});

test('rank points accumulate and promote the courier tier', () => {
  const e = createEconomy();
  applyLanding(e, { vs: -2, speed: 70, rings: 3, ringsTotal: 3, hull: 100 });
  assert.ok(e.rankPoints >= 100);
  assert.equal(RANKS[0], 'PEMULA');
  assert.equal(RANKS[RANKS.length - 1], 'LEGENDA');
  for (let i = 0; i < 6; i += 1) applyLanding(e, { vs: -2, speed: 70, rings: 3, ringsTotal: 3, hull: 100 });
  assert.equal(e.rank, 'LEGENDA');
});
