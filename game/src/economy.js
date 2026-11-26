// Courier economy — KR currency, landing rank. (TDD: tests/economy.test.js)
// M12-clean N2: the rank-point table lives in config.js (LANDING_POINTS).
import { LANDING_POINTS } from './config.js';
// M12-clean N3: the hangar shop (UPGRADES/buyUpgrade) is deleted — it had
// no UI, so KR was unspendable in production and the code was only kept
// alive by its own tests. Deleted together with those tests.
export const RANKS = ['PEMULA', 'PERAK', 'EMAS', 'LEGENDA'];
export const RANK_POINTS = { PEMULA: 0, PERAK: 100, EMAS: 250, LEGENDA: 500 };

export function createEconomy() {
  return { kr: 0, rank: 'PEMULA', rankPoints: 0 };
}

export function addReward(econ, kr) {
  econ.kr += kr;
  return econ.kr;
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
  econ.rankPoints += points;
  econ.kr += points;
  let tier = 'PEMULA';
  for (const name of RANKS) {
    if (econ.rankPoints >= RANK_POINTS[name]) tier = name;
  }
  econ.rank = tier;
  return { rank, points };
}
