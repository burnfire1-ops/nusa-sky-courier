// Pure terrain math for Nusa Sky Courier — no DOM, no THREE, node-testable.
// M12-clean N1: these helpers used to live in render.js, trapped behind
// its `import * as THREE from 'three'`, so node --test could not import
// them (the repo has no node_modules). render.js now imports them from
// here; the math is byte-for-byte the same, only the container moved.
//
// One deliberate exception: tierColor takes its scratch colour as a
// parameter (`blend`) instead of closing over a module-level THREE.Color,
// so this file stays THREE-free. render.js passes its _tierBlend.
import { PALETTE } from './config.js';

// Deterministic 2D hash (0..1) — seeded terrain noise without storing state.
export function hash2(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// M11.1: low-frequency angular asymmetry for the volcano (threejs-geometry:
// a lathe is symmetric by construction, so the radius is modulated per
// angle with a seeded sum of sines). The fixed cos term guarantees the
// east flank reads wider than the west from the front camera (shot 1
// looks north): mod(0) - mod(PI) ≈ 0.14 for Bara (probed in node before
// coding). Range over all angles is 0.89..1.13, inside the ±15% guide.
// Exported for the unit test (tests/terrain.test.js) — pure math.
export function volcanoAngleMod(island, a) {
  const p2 = hash2(island.x * 0.01 + island.z * 0.01, 23) * Math.PI * 2;
  const p3 = hash2(island.x * 0.01 + island.z * 0.01, 37) * Math.PI * 2;
  return 1 + 0.08 * Math.cos(a - 0.3) + 0.04 * Math.sin(2 * a + p2) + 0.03 * Math.sin(3 * a + p3);
}

// M11.2: lava-flow mask (0..1) — a wavy orange tongue down the south
// face (a = -PI/2, facing the runway / shot-1 camera), spilling from
// the crater notch to mid-slope, so the crater lava reads from the
// front (shots 1/3), not only from above (shot 2). Pure + seeded.
export function lavaFlowMask(island, a, y) {
  const h = island.height;
  if (y < h * 0.5 || y > h * 0.98) return 0;
  const da = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2));
  const halfW = 0.13 + 0.05 * Math.sin(y * 0.02 + hash2(island.x * 0.01, 71) * 6);
  const edge = smoothstep(halfW, halfW * 0.5, Math.abs(da));
  if (edge <= 0) return 0;
  const vertical = smoothstep(0.5, 0.65, y / h);
  return edge * vertical * 0.85;
}

// Pure tier colour at height y (no jitter, no blending) — shared by
// tierColor and its boundary blend.
export function tierHex(kind, y, h) {
  const t = y / h;
  if (y <= 8) return PALETTE.sand;
  if (kind === 'volcano') {
    if (t > 0.82) return PALETTE.snow;
    if (t > 0.6) return PALETTE.rockLight;
    if (t > 0.35) return PALETTE.rockMid;
    return PALETTE.rockDark;
  }
  if (kind === 'city') {
    if (t > 0.7) return 0x8a8578;
    if (t > 0.35) return PALETTE.greenBright;
    return PALETTE.greenDeep;
  }
  if (t > 0.7) return PALETTE.palm;
  if (t > 0.35) return PALETTE.greenBright;
  return PALETTE.greenDeep;
}

// Tiered colour by height fraction. M9: sharper, more separated tiers
// (rockDark/mid/light and deep/bright green are far apart in value) so
// the bands read as 3-4 distinct stripes, not one brown gradient. The
// fine jitter is kept small — the bands, not the noise, must read.
// M10.1: the hard step is softened ±0.04 around each boundary (blend
// rings inserted in islandProfileData give the blend vertices to land
// on), so the slope reads smooth while the 4 zones stay readable.
// `out` is a THREE.Color in production (duck-typed: setHex/lerp/
// multiplyScalar); `blend` is the caller's scratch colour of the same
// shape. Returns `out`.
export function tierColor(kind, y, h, x, z, out, blend) {
  const t = y / h;
  const jitter = 0.94 + 0.12 * hash2(x, z);
  out.setHex(tierHex(kind, y, h));
  const bounds = [...tierBounds(kind), 8 / h];
  for (const b of bounds) {
    const d = Math.abs(t - b);
    if (d < 0.04 && d > 0) {
      const ny = Math.min(h, Math.max(0, (t + (t < b ? 0.06 : -0.06)) * h));
      blend.setHex(tierHex(kind, ny, h));
      out.lerp(blend, (1 - d / 0.04) * 0.5);
    }
  }
  out.multiplyScalar(jitter);
  return out;
}

// Tier boundaries per island kind — a ring is inserted at each boundary
// in islandProfileData so the colour step lands on vertices (crisp bands)
// instead of interpolating across one big triangle.
export function tierBounds(kind) {
  if (kind === 'volcano') return [0.35, 0.6, 0.82];
  return [0.35, 0.7];
}

// Tiered island profile: beach ring at the base, slope tiers, peak.
// (level-design: dress last — the profile keeps the old cone's footprint so
// rings, city and palms still sit where the sim expects them.)
// Pure data: an array of [radius, height] pairs, radius descending.
// render.js wraps these into THREE.Vector2 for LatheGeometry.
export function islandProfileData(island) {
  const r = island.radius;
  const h = island.height;
  // M9: a wider beach apron (base 1.10r -> 1.03r over 6 ft) so the sand
  // ring reads from the air; the old 1.08r/4 ft lip was invisible.
  const base = [
    [r * 1.1, 1],
    [r * 1.03, 6],
    [r * 0.8, h * 0.3],
    [r * 0.55, h * 0.6],
    [r * 0.3, h * 0.85],
  ];
  // M11.2: the volcano summit is a crater, not a point — rim crest at
  // exactly h (max height unchanged), inner wall down to a lava floor
  // at 0.92h. Other islands keep the old pointed peak. islandSurfaceY
  // still works on this profile: its d-lookup finds the inner-wall
  // segment for d in [0.14r, 0.20r] and the floor segment below that.
  if (island.kind === 'volcano') {
    base.push(
      [r * 0.24, h * 0.93],
      [r * 0.2, h],
      [r * 0.14, h * 0.93],
      [0, h * 0.92],
    );
  } else {
    base.push([0, h]);
  }
  const radiusAt = (y) => {
    for (let i = 0; i < base.length - 1; i += 1) {
      if (y >= base[i][1] && y <= base[i + 1][1]) {
        const f = (y - base[i][1]) / (base[i + 1][1] - base[i][1]);
        return base[i][0] + (base[i + 1][0] - base[i][0]) * f;
      }
    }
    return 0;
  };
  // Extra rings: sand edge (y=10, crisp beach cutoff) + each tier
  // boundary. Inserted points lie exactly on the old piecewise lines, so
  // islandSurfaceY (landmark heights) is unchanged.
  // M10.1: blend rings at b±0.04 around every boundary so the tier
  // softening in tierColor has vertices to land on.
  const extra = [10, ...tierBounds(island.kind).map((b) => h * b)];
  for (const b of [...tierBounds(island.kind), 8 / h]) {
    for (const off of [-0.04, 0.04]) {
      const y = h * (b + off);
      if (y > 2 && y < h - 2) extra.push(y);
    }
  }
  for (const y of extra) {
    if (base.some((p) => p[1] === y)) continue;
    const idx = base.findIndex((p) => p[1] > y);
    base.splice(idx === -1 ? base.length : idx, 0, [radiusAt(y), y]);
  }
  return base;
}

// Height of the island's tiered profile at world (x, z) — piecewise linear
// over the profile radii, so landmarks sit ON the slope, not under it.
// M12-clean N5 note: this deliberately ignores the M11 volcano angle
// modulation (±13%) and crater notch (−8%) — its only consumers are the
// village (city island) and the palms (green island), and the modulation
// is volcano-only by design, so for those islands the value is exact.
export function islandSurfaceY(island, x, z) {
  const d = Math.hypot(x - island.x, z - island.z);
  const profile = islandProfileData(island);
  for (let i = 0; i < profile.length - 1; i += 1) {
    const r0 = profile[i][0];
    const y0 = profile[i][1];
    const r1 = profile[i + 1][0];
    const y1 = profile[i + 1][1];
    if (d <= r0 && d >= r1) {
      const f = (r0 - d) / (r0 - r1);
      return y0 + (y1 - y0) * f;
    }
  }
  return d <= profile[0][0] ? profile[0][1] : 0;
}
