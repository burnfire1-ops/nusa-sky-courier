// Tuning and world layout for Nusa Sky Courier. One source of truth for
// colours, islands and camera — render.js and main.js both read it.
export const PALETTE = {
  skyDusk: 0x2a1e3f,
  skyHorizon: 0xff8c42,
  sand: 0xd8b47e,
  lava: 0xff5a1e,
  palm: 0x1f5230,
  runwayLine: 0xf2f2e8,
  ringGold: 0xffc233,
  planeOrange: 0xe86a2c,
  // M8 visual additions (palette only — no layout change).
  snow: 0xefe9dc,
  rockDark: 0x4a3423,
  rockLight: 0xa88a5f,
  // M9 detailing: sharper tier separation (rock mid, deep/bright green).
  rockMid: 0x7a4a28,
  greenDeep: 0x2a5c2e,
  greenBright: 0x3f8a37,
  roofRed: 0xb5502e,
  villageCream: 0xe8d9b0,
  villageTan: 0xc9a06b,
  lighthouseWhite: 0xf2f2e8,
  lighthouseRed: 0xc23b2e,
  cloudWhite: 0xfff2e0,
  cloudPink: 0xf2c8e0,
  gearDark: 0x2b2b33,
  hangarGrey: 0x9aa0a8,
  // M10 stealth: matte grey airframe (F-22 "air superiority gray" —
  // the first charcoal 0x2e3238 read as a black spider against the dark
  // volcano; the lighter grey keeps the stealth read with contrast).
  stealth: 0x4b5158,
  stealthDark: 0x191c21,
  // M10.6 stealth HUD green (DCS F/A-18 / Falcon 4 F-16 classic green).
  hudGreen: 0x3dff7a,
};

// Islands: x/z in feet — the mission rings sit over these
// (world.js derives ring x/z from here, heights stay there).
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
export const PERF = { maxDrawCalls: 30, maxTriangles: 40000 };

// Flight-model tuning (world.js reads these). M12-clean N2: the numbers
// used to be literals scattered through stepWorld; the VALUES are
// unchanged since M5 — only the names moved here.
export const FLIGHT = {
  stallSpeed: 55,
  maxSpeed: 150,
  speedClampMax: 170,
  liftRefSpeed: 100,
  sinkRate: 15,
  pitchMin: -15,
  pitchMax: 25,
  stallPitch: -8,
  rollMaxDeg: 25,
  turnRateDegPerSec: 30,
  turnRefSpeed: 80,
  burnBase: 0.05,
  burnThrottle: 0.30,
  gustIntervalSec: 2,
  gustMax: 6,
  wind: { x: 3, z: 1 },
  ringRadius: 150,
  landingVsMax: 8,
  landingSpeedMax: 90,
  damageVsFactor: 4,
  damageSpeedFactor: 0.5,
  damageOffRunway: 10,
  ktsToFps: 1.68781,
};

// Screenshot-staging tuning (shots.js reads these; values unchanged).
export const SHOTS = {
  sample: 1 / 30,
  startSeconds: 5,
  playSeconds: 18,
  landingSeconds: 40,
  spawnZ: -2500,
  startSpeed: 100,
  startAlt: 700,
  playSpeed: 100,
  playAlt: 700,
  landingSpeed: 85,
  landingAlt: 350,
  landingZ: -4200,
  landingTarget: { x: 0, y: 100, z: -2600 },
  freezeZ: -2900,
  freezeAlt: 120,
  autopilotCruiseSpeed: 90,
  autopilotThrottleBase: 0.6,
  autopilotThrottleMin: 0.25,
  autopilotThrottleSlope: 60,
  autopilotClimbAltErr: 100,
  autopilotClimbThrottle: 1,
  autopilotPitchMin: -8,
  autopilotPitchMax: 15,
  autopilotPitchDivisor: 40,
  autopilotRollDivisor: 25,
};

// Input tuning (input.js reads these; values unchanged).
export const INPUT = {
  orbitYaw: 0.15,
  orbitPitch: 0.08,
  orbitPitchMin: -6,
  orbitPitchMax: 14,
  throttleRate: 0.5,
  pitchUp: -8,
  pitchDown: 10,
};

// HUD tuning (hud.js reads these; values unchanged).
export const HUD_TUNING = {
  radarRangeFt: 40000,
  dialXs: [80, 240, 400, 560, 720, 880],
  dialCy: 118,
  dialR: 58,
  dialAirspeedMax: 200,
  dialAltMax: 5000,
  vsiMax: 2000,
  fuelWarn: 20,
  hullWarn: 40,
  speedTape: { min: 0, max: 200, span: 60, major: 20, label: 40 },
  altTape: { min: 0, max: 5000, span: 1000, major: 250, label: 500 },
};

// Landing-rank points (economy.js reads these; values unchanged).
export const LANDING_POINTS = { S: 100, A: 70, B: 40, C: 20 };

// M8 landmarks — visual only, positions chosen on existing terrain/runway.
// Lighthouse sits on Bara's south shore; viaduct spans Tanjung's south bay;
// hangar + windsock + ILS sit beside the runway strip (sea-plane base apron).
export const LANDMARKS = {
  lighthouse: { x: 1200, z: 1800, y: 50 },
  viaduct: { x: 400, z: 9800 },
  hangar: { x: 350, z: 320 },
  windsock: { x: -220, z: -2400 },
  ils: { x: 140, z: -2800 },
};
