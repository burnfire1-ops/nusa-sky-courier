// Missions — three visual archetypes. (TDD: tests/missions.test.js)
// Ring Run: collect every ring. Precision: pick up at the first ring, then
// land gently on the runway. Storm Run: same rings, strong wind, time limit.
export const MISSIONS = [
  {
    kind: 'ring',
    title: 'Ring Run — Latihan Cincin',
    brief: 'Terbang melewati 3 cincin emas di atas kepulauan. Jaga kecepatan di atas 55 kts supaya tidak stall.',
    reward: 120,
  },
  {
    kind: 'precision',
    title: 'Precision Delivery — Paket Penting',
    brief: 'Ambil paket di cincin pertama, lalu mendarat dengan lembut di runway Bara Utara. Flare sebelum menyentuh tanah.',
    reward: 150,
  },
  {
    kind: 'storm',
    title: 'Storm Run — Badai Senja',
    brief: 'Kumpulkan 3 cincin di tengah badai senja. Angin kencang, waktu terbatas — 240 detik.',
    reward: 200,
    timeLimit: 240,
  },
];

export function createMissionRun(mission, world) {
  const run = { mission, status: 'active', pickedUp: false, startedAt: world.time };
  if (mission.kind === 'storm') {
    world.wind = { x: 15, z: 8 };
  }
  return run;
}

export function updateMission(run, world) {
  if (run.status !== 'active') return run;
  const plane = world.plane;
  if (plane.crashed) {
    run.status = 'failed';
    return run;
  }
  if (run.mission.kind === 'ring') {
    if (world.collected >= world.rings.length) run.status = 'complete';
  } else if (run.mission.kind === 'precision') {
    if (!run.pickedUp && world.collected >= 1) run.pickedUp = true;
    if (run.pickedUp && plane.landed) run.status = 'complete';
    else if (!run.pickedUp && plane.fuel <= 0) run.status = 'failed';
  } else if (run.mission.kind === 'storm') {
    if (world.time - run.startedAt > run.mission.timeLimit) run.status = 'failed';
    else if (world.collected >= world.rings.length) run.status = 'complete';
  }
  return run;
}

export function missionProgress(run, world) {
  if (run.mission.kind === 'precision') {
    return run.pickedUp
      ? 'Paket di tangan — mendaratlah di runway!'
      : 'Ambil paket di cincin pertama';
  }
  return `Cincin ${world.collected}/${world.rings.length}`;
}
