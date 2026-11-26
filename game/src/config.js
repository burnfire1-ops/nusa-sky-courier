// Tuning and world layout for Nusa Sky Courier. One source of truth for
// colours, islands and camera — render.js and main.js both read it.
export const PALETTE = {
  skyDusk: 0x2a1e3f,
  skyHorizon: 0xff8c42,
  sea: 0x14506b,
  seaDeep: 0x0e3a52,
  sand: 0xc9a06b,
  rockBara: 0x5a4632,
  lava: 0xff5a1e,
  cityGrey: 0x8a8f98,
  cityLight: 0xffd27a,
  greenHijau: 0x2e6b34,
  palm: 0x1f5230,
  runway: 0x2b2b33,
  runwayLine: 0xf2f2e8,
  ringGold: 0xffc233,
  planeCream: 0xf2e3c6,
  planeOrange: 0xe86a2c,
  hudAmber: 0xffc233,
};

// Islands: x/z in feet, matching the mission rings in world.js.
export const ISLANDS = [
  {
    name: 'Bara Utara', x: 0, z: 3500, radius: 2200, height: 1400,
    kind: 'volcano', color: 0x5a4632, lava: true,
  },
  {
    name: 'Tanjung Kota', x: 400, z: 12000, radius: 2200, height: 220,
    kind: 'city', color: 0x6b6257,
  },
  {
    name: 'Hijau Selatan', x: -300, z: 18000, radius: 2400, height: 900,
    kind: 'green', color: 0x2e6b34,
  },
];

export const CAMERA = { distance: 190, height: 70, lookAhead: 300, lerp: 0.12 };
export const PERF = { maxDrawCalls: 30, maxTriangles: 40000, captureDpr: 1.0 };
