// Courier economy — KR currency, hangar shop, landing rank. (TDD: tests/economy.test.js)
export const RANKS = ['PEMULA', 'PERAK', 'EMAS', 'LEGENDA'];
export const RANK_POINTS = { PEMULA: 0, PERAK: 100, EMAS: 250, LEGENDA: 500 };

export const UPGRADES = {
  engine: { cost: 150, name: 'Mesin Turbo', desc: '+15% thrust, faster climb' },
  tank: { cost: 120, name: 'Tangki Besar', desc: '+40% fuel capacity' },
  hull: { cost: 100, name: 'Lambung Baja', desc: '+30 max hull' },
};

export function createEconomy() {
  return { kr: 0, rank: 'PEMULA', rankPoints: 0, upgrades: { engine: 0, tank: 0, hull: 0 } };
}

export function addReward(econ, kr) {
  econ.kr += kr;
  return econ.kr;
}

export function buyUpgrade(econ, key) {
  const up = UPGRADES[key];
  if (!up || econ.upgrades[key] >= 1 || econ.kr < up.cost) return false;
  econ.kr -= up.cost;
  econ.upgrades[key] = 1;
  return true;
}

const RANK_POINTS_TABLE = { S: 100, A: 70, B: 40, C: 20 };

export function landingRank({ vs, speed, rings, ringsTotal, hull }) {
  const avs = Math.abs(vs);
  let rank = 'C';
  if (avs <= 3 && speed < 80 && rings >= ringsTotal && hull >= 99) rank = 'S';
  else if (avs <= 6 && speed < 85 && hull >= 90) rank = 'A';
  else if (avs <= 8 && hull >= 70) rank = 'B';
  return { rank, points: RANK_POINTS_TABLE[rank] };
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
