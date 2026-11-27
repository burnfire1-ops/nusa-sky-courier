// Courier economy — KR currency, landing rank. (TDD: tests/economy.test.js)
// M12-clean N2: the rank-point table lives in config.js (LANDING_POINTS).
import { LANDING_POINTS, UPGRADES } from './config.js';
// M12-clean N3: the hangar shop (UPGRADES/buyUpgrade) is deleted — it had
// no UI, so KR was unspendable in production and the code was only kept
// alive by its own tests. Deleted together with those tests.
// V2-B: the shop is back, WITH a UI — the briefing overlay carries the
// hangar panel (main.js renderShop), so KR is spendable in production.
// V2-C (cut 3): one Rank per landing, no reputation ladder. The old
// RANKS/RANK_POINTS tier ladder (PEMULA → LEGENDA) is deleted — the
// debrief and title show the best landing Rank (S/A/B/C) instead.
const RANK_ORDER = ['C', 'B', 'A', 'S'];

export function createEconomy() {
  return { kr: 0, bestRank: null, upgrades: [] };
}

export function addReward(econ, kr) {
  econ.kr += kr;
  return econ.kr;
}

/**
 * Buy one hangar upgrade with KR. Returns { ok } or { ok: false, reason }.
 * 'unknown' = no such upgrade, 'owned' = already bought, 'funds' = KR
 * short. A bought upgrade stays in econ.upgrades (persisted by main.js)
 * and is applied by createWorld for the next mission.
 */
export function buyUpgrade(econ, id) {
  const item = UPGRADES.find((u) => u.id === id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (econ.upgrades.includes(id)) return { ok: false, reason: 'owned' };
  if (econ.kr < item.price) return { ok: false, reason: 'funds' };
  econ.kr -= item.price;
  econ.upgrades.push(id);
  return { ok: true };
}

export function landingRank({ vs, speed, rings, ringsTotal, hull }) {
  const avs = Math.abs(vs);
  let rank = 'C';
  if (avs <= 3 && speed < 80 && rings >= ringsTotal && hull >= 99) rank = 'S';
  else if (avs <= 6 && speed < 85 && hull >= 90) rank = 'A';
  else if (avs <= 8 && hull >= 70) rank = 'B';
  return { rank, points: LANDING_POINTS[rank] };
}

export function applyLanding(econ, landing) {
  const { rank, points } = landingRank(landing);
  econ.kr += points;
  if (econ.bestRank === null || RANK_ORDER.indexOf(rank) > RANK_ORDER.indexOf(econ.bestRank)) {
    econ.bestRank = rank;
  }
  return { rank, points };
}
