// Aircraft geometry spec + pure shaping helpers (V2-G remodel, 27 Nov 2026).
// No THREE import here — like merge.js, this runs in node tests. render.js
// applies these numbers to THREE geometries and merges them as before.
//
// Why each number changed (parent diagnosis from the 3x zoom crop):
// - Nav lights were unlit r5 spheres at the wingtips: at chase distance
//   they read as green/red balloons glued to the plane (M10-fix already
//   admitted the r5 tail light read as a white ball; the wingtips kept r5).
// - The V-tail was a flat 18x18 plate with a 19-long orange cap: from
//   behind it read as a black box with a red roof.
// - The wing was a 4 ft slab: edge-on from the chase camera it vanished,
//   leaving only the orange trailing strip (a red stick).
// - The 4 wheels + legs were merged into the body, so they showed in
//   flight as black balls under the fuselage.
// - The canopy was a black r8 hemisphere: a ball on the fuselage.
//
// Note: nav colours stay green-left / red-right per the V2-G brief (the
// thesis Q3.5 line "merah/kiri hijau/kanan" reads as the aviation standard
// red-left/green-right, but swapping the lights is out of scope here).
export const AIRCRAFT = {
  span: 120,
  navLightRadius: 2, // wingtip light radius, ft (was 5)
  navTailRadius: 1.5, // tail light radius, ft (was 2.5)
  // Gear is down on the ground, on final approach, or before takeoff.
  // 400 ft covers the landing staging (landingAlt 350, freezeAlt 120)
  // while cruise (start/play alt 700) keeps it retracted. Thesis L3:
  // "GEAR DOWN saat approach".
  gearDownAlt: 400,
  wing: {
    halfSpan: 31, // box half-length before the 30.5 ft translate
    thickness: 4, // base box thickness, ft
    chord: 24, // base box chord, ft
    rootThickScale: 1.75, // root 7 ft thick — reads as a wing, not a plate
    tipThickScale: 0.75, // tip 3 ft
    rootChordScale: 1.15, // root chord 27.6 ft
    tipChordScale: 0.6, // tip chord 14.4 ft
    dihedral: 0.06, // ~3.4 deg: tips rise so the top surface reads from behind
    sweep: 0.29, // ~17 deg sweep back (unchanged from M10.5)
  },
  fin: {
    tipChordScale: 0.45, // top chord 45% of the root chord — a tapered fin
    sweepBack: 6, // top edge shifts 6 ft aft — swept, not a flat plate
    cant: 0.49, // ~28 deg outward cant (unchanged from M10.5)
    stripeHeight: 2, // orange tip cap height, ft (was 5 — the "red roof"; V2-G2: 2.5 still overhung)
    capWidth: 2.8, // narrower than the fin tip (3 ft) — no overhang
    capDepth: 7, // shorter than the tip chord (8.1 ft) — an edge, not a slab
  },
  // Orange trailing-edge strip: centreline tapers with the chord so it
  // sits ON the trailing edge (root -13.8, tip -7.2, wing-local z) and
  // pivots about the wing centre (x 30.5) so its dihedral matches.
  trailStrip: { rootZ: -13.8, tipZ: -7.2, pivotX: 30.5, y: 2.8 },
  // Orange spine stripe — V2-G3: hugs the cone fuselage (was a straight
  // 70 ft box at constant y 11: the cone tapers 12 -> 0, so the stripe
  // floated up to ~9 ft above the nose and read as a red rod — the
  // "red stick" in the play zoom crop, proven by the spine-only probe).
  // 40 ft long (z -35..+5), centreline follows r(z) so its top sits
  // exactly `proud` above the cone surface along the whole length.
  spineStripe: { length: 40, zCenter: -15, width: 2.5, height: 2, proud: 0.5, yBase: 11 },
  canopy: {
    radius: 7,
    scaleX: 0.7, // half-width 4.9 ft — inside the fuselage at its station
    scaleY: 0.5, // dome height 3.5 ft above its base — low bubble, not a ball
    scaleZ: 1.6, // half-length 11.2 ft — elongated fore-aft
    y: 6, // base height on the fuselage
    z: -6, // sits where the fuselage (r ~6.8) is wider than the canopy
    color: 0x2a3a4a, // dark blue-grey glass (was near-black 0x0a0f16)
  },
};

/**
 * Taper a flat [x, y, z, ...] positions array along one axis. `t` goes
 * 0 at `from` to 1 at `to` (clamped); y scales by lerp(scaleY) plus
 * lerp(shiftY), z by lerp(scaleZ) plus lerp(shiftZ). Used for the wing
 * (axis 0: thickness + chord taper along the span), the fin (axis 1:
 * chord taper + sweep back along the height), the trailing strip
 * (axis 0: centreline follows the tapered trailing edge) and the
 * spine stripe (axis 2: centreline follows the cone fuselage).
 * Mutates and returns the array.
 */
export function taperPositions(positions, opts) {
  const {
    axis = 0, from, to, scaleY = [1, 1], scaleZ = [1, 1],
    shiftY = [0, 0], shiftZ = [0, 0],
  } = opts;
  const span = to - from;
  for (let i = 0; i < positions.length; i += 3) {
    let t = (positions[i + axis] - from) / span;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const sy = scaleY[0] + (scaleY[1] - scaleY[0]) * t;
    const sz = scaleZ[0] + (scaleZ[1] - scaleZ[0]) * t;
    const dy = shiftY[0] + (shiftY[1] - shiftY[0]) * t;
    const dz = shiftZ[0] + (shiftZ[1] - shiftZ[0]) * t;
    positions[i + 1] = positions[i + 1] * sy + dy;
    positions[i + 2] = positions[i + 2] * sz + dz;
  }
  return positions;
}

/**
 * Fuselage radius (ft) at station z. The fuselage is a cone:
 * ConeGeometry(12, 90, 12) rotated so the base (r 12) is at the tail
 * (z -45) and the tip at the nose (z +45). r(-6) = 6.8 — the canopy
 * station in the render comment.
 */
export function fuselageRadiusAt(z) {
  return 12 * (45 - z) / 90;
}

/** Wing thickness (ft) at span fraction t (0 = root, 1 = tip). */
export function wingThicknessAt(t) {
  const w = AIRCRAFT.wing;
  return w.thickness * (w.rootThickScale + (w.tipThickScale - w.rootThickScale) * t);
}

/** Wing chord (ft) at span fraction t (0 = root, 1 = tip). */
export function wingChordAt(t) {
  const w = AIRCRAFT.wing;
  return w.chord * (w.rootChordScale + (w.tipChordScale - w.rootChordScale) * t);
}

/**
 * Gear down? On the ground (not airborne), on final approach (at or
 * below gearDownAlt), or before takeoff. In cruise the gear is up.
 * `plane` is the world.plane state ({ airborne, y }).
 */
export function gearDown(plane) {
  return !plane.airborne || plane.y <= AIRCRAFT.gearDownAlt;
}
