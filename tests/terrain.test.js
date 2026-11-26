// Pure terrain-math tests (M12-clean N1+N6). These helpers used to be
// trapped in render.js behind `import * as THREE`, so they were untestable.
// They now live in game/src/terrain.js (THREE-free).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PALETTE, ISLANDS } from '../game/src/config.js';
import {
  hash2, smoothstep, volcanoAngleMod, lavaFlowMask, tierHex, tierColor,
  tierBounds, islandProfileData, islandSurfaceY,
} from '../game/src/terrain.js';

// Minimal THREE.Color stand-in: setHex/lerp/multiplyScalar in sRGB space.
// Enough to test tierColor's tier choice, blending and jitter logic.
class FakeColor {
  constructor() { this.r = 0; this.g = 0; this.b = 0; }
  setHex(hex) {
    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;
    return this;
  }
  lerp(c, a) {
    this.r += (c.r - this.r) * a;
    this.g += (c.g - this.g) * a;
    this.b += (c.b - this.b) * a;
    return this;
  }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
}

const bara = ISLANDS[0]; // volcano, h 1400
const tanjung = ISLANDS[1]; // city, h 220
const hijau = ISLANDS[2]; // green, h 900

test('hash2 is deterministic and in [0, 1)', () => {
  assert.equal(hash2(3, 7), hash2(3, 7));
  for (const [x, z] of [[0, 0], [1, 2], [-5, 9], [100, 200]]) {
    const v = hash2(x, z);
    assert.ok(v >= 0 && v < 1, `hash2(${x},${z})=${v}`);
  }
  assert.notEqual(hash2(1, 2), hash2(2, 1));
});

test('smoothstep is 0/0.5/1 at the edges/middle and clamps outside', () => {
  assert.equal(smoothstep(0, 1, 0), 0);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(smoothstep(0, 1, 1), 1);
  assert.equal(smoothstep(0, 1, -2), 0);
  assert.equal(smoothstep(0, 1, 3), 1);
});

test('volcanoAngleMod stays within ±15% and widens the east flank', () => {
  let lo = Infinity; let hi = -Infinity;
  for (let i = 0; i <= 360; i += 1) {
    const m = volcanoAngleMod(bara, (i * Math.PI) / 180);
    lo = Math.min(lo, m); hi = Math.max(hi, m);
  }
  assert.ok(lo >= 0.85 && hi <= 1.15, `range ${lo}..${hi}`);
  const eastWest = volcanoAngleMod(bara, 0) - volcanoAngleMod(bara, Math.PI);
  assert.ok(eastWest > 0.10 && eastWest < 0.18, `east-west ${eastWest}`);
});

test('lavaFlowMask is zero off the south face and off the slope band', () => {
  assert.equal(lavaFlowMask(bara, -Math.PI / 2, bara.height * 0.4), 0, 'below 0.5h');
  assert.equal(lavaFlowMask(bara, -Math.PI / 2, bara.height * 0.99), 0, 'above 0.98h');
  assert.equal(lavaFlowMask(bara, Math.PI / 2, bara.height * 0.75), 0, 'north face');
  const south = lavaFlowMask(bara, -Math.PI / 2, bara.height * 0.75);
  assert.ok(south > 0 && south <= 0.85, `south mid-slope ${south}`);
});

test('tierHex picks sand at the beach and the right tier per kind', () => {
  assert.equal(tierHex('volcano', 5, 1400), PALETTE.sand);
  assert.equal(tierHex('volcano', 0.9 * 1400, 1400), PALETTE.snow);
  assert.equal(tierHex('volcano', 0.7 * 1400, 1400), PALETTE.rockLight);
  assert.equal(tierHex('volcano', 0.5 * 1400, 1400), PALETTE.rockMid);
  assert.equal(tierHex('volcano', 0.2 * 1400, 1400), PALETTE.rockDark);
  assert.equal(tierHex('city', 0.8 * 220, 220), 0x8a8578);
  assert.equal(tierHex('city', 0.5 * 220, 220), PALETTE.greenBright);
  assert.equal(tierHex('city', 0.2 * 220, 220), PALETTE.greenDeep);
  assert.equal(tierHex('green', 0.8 * 900, 900), PALETTE.palm);
});

test('tierBounds are the volcano triple and the shared pair otherwise', () => {
  assert.deepEqual(tierBounds('volcano'), [0.35, 0.6, 0.82]);
  assert.deepEqual(tierBounds('city'), [0.35, 0.7]);
  assert.deepEqual(tierBounds('green'), [0.35, 0.7]);
});

test('islandProfileData keeps the beach base, the peak and the crater', () => {
  const v = islandProfileData(bara);
  assert.deepEqual(v[0], [bara.radius * 1.1, 1]);
  assert.equal(Math.max(...v.map((p) => p[1])), bara.height, 'rim crest is exactly h');
  assert.ok(v.some((p) => p[0] === 0 && p[1] === bara.height * 0.92), 'crater floor at 0.92h');
  const c = islandProfileData(tanjung);
  assert.deepEqual(c[c.length - 1], [0, tanjung.height], 'city keeps the pointed peak');
});

test('islandSurfaceY sits on the slope at the village spots, never under it', () => {
  // M12 QA measured 162–204 ft at these spots (old fixed y=0 buried them).
  for (let gx = -2; gx <= 2; gx += 1) {
    for (let gz = -2; gz <= 2; gz += 1) {
      if (gx === 0 && gz === 0) continue;
      const y = islandSurfaceY(tanjung, tanjung.x + gx * 320, tanjung.z + gz * 320);
      assert.ok(y >= 150 && y <= 220, `spot (${gx},${gz}) y=${y}`);
    }
  }
  assert.equal(islandSurfaceY(tanjung, tanjung.x, tanjung.z), tanjung.height);
  assert.equal(islandSurfaceY(bara, bara.x, bara.z), bara.height * 0.92, 'crater floor at centre');
  assert.equal(islandSurfaceY(hijau, hijau.x + 10000, hijau.z), 0, 'outside the beach ring');
});

test('tierColor returns sand times jitter on the beach, and blends at boundaries', () => {
  const out = new FakeColor(); const blend = new FakeColor();
  // y=8 sits exactly ON the sand boundary (t = 8/h), so the blend loop's
  // `d > 0` guard skips it — pure sand × jitter. (Any other beach y is
  // inside the ±0.04 blend zone of that boundary by design.)
  tierColor('volcano', 8, 1400, 10, 20, out, blend);
  const sand = new FakeColor().setHex(PALETTE.sand);
  for (const ch of ['r', 'g', 'b']) {
    const ratio = out[ch] / sand[ch];
    assert.ok(ratio >= 0.93 && ratio <= 1.07, `beach ${ch} ratio ${ratio}`);
  }
  // Just below the 0.35 rock boundary the colour is pulled toward the
  // neighbour tier (not the pure rockDark of tierHex at that height).
  const pure = new FakeColor().setHex(tierHex('volcano', 0.34 * 1400, 1400));
  tierColor('volcano', 0.34 * 1400, 1400, 10, 20, out, blend);
  const dist = Math.abs(out.r - pure.r) + Math.abs(out.g - pure.g) + Math.abs(out.b - pure.b);
  assert.ok(dist > 0.01, `boundary blend should shift the colour, dist=${dist}`);
});
