// V2-G aircraft remodel — pure geometry spec + shaping helpers (no THREE
// import, so this runs in node tests like merge.js). Locks the 27 Nov fix:
// the old plane read as a dark tube with balls/boxes stuck on it (nav-light
// r5 spheres = balloons, V-tail = black box with a red roof, 4 ft wing
// invisible edge-on, gear down in flight, canopy = black ball).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRCRAFT, taperPositions, gearDown, wingThicknessAt, wingChordAt,
  fuselageRadiusAt,
} from '../game/src/aircraft.js';

// A minimal box as a flat positions array: 8 corners, x in [-31, 31]
// (the wing half), y in [-2, 2], z in [-12, 12].
function wingBoxPositions() {
  const p = [];
  for (const x of [-31, 31]) for (const y of [-2, 2]) for (const z of [-12, 12]) p.push(x, y, z);
  return p;
}

test('wing taper: root thick + wide, tip thin + narrow', () => {
  const pos = wingBoxPositions();
  taperPositions(pos, {
    axis: 0, from: -31, to: 31,
    scaleY: [AIRCRAFT.wing.rootThickScale, AIRCRAFT.wing.tipThickScale],
    scaleZ: [AIRCRAFT.wing.rootChordScale, AIRCRAFT.wing.tipChordScale],
  });
  // Float math: 12 * 1.15 is 13.799999999999999, so compare with tolerance.
  assert.equal(pos[10], 3.5, `root y=${pos[10]}`);
  assert.ok(Math.abs(pos[11] - 13.8) < 1e-9, `root z=${pos[11]}`);
  const tip = pos.slice(21, 24);
  assert.equal(tip[1], 1.5, `tip y=${tip[1]}`);
  assert.ok(Math.abs(tip[2] - 7.2) < 1e-9, `tip z=${tip[2]}`);
});

test('wing thickness/chord helpers match the taper', () => {
  assert.equal(wingThicknessAt(0), 7, 'root thickness 7 ft (was 4)');
  assert.equal(wingThicknessAt(1), 3, 'tip thickness 3 ft');
  // Float math: 24 * 1.15 is 27.599999999999998, so compare with tolerance.
  assert.ok(Math.abs(wingChordAt(0) - 27.6) < 1e-9, `root chord ${wingChordAt(0)} (was 24)`);
  assert.ok(Math.abs(wingChordAt(1) - 14.4) < 1e-9, `tip chord ${wingChordAt(1)}`);
});

test('fin taper: chord shrinks and sweeps back toward the tip', () => {
  // Fin box: x in [-1.5, 1.5], y in [-9, 9], z in [-9, 9].
  const pos = [];
  for (const x of [-1.5, 1.5]) for (const y of [-9, 9]) for (const z of [-9, 9]) pos.push(x, y, z);
  taperPositions(pos, {
    axis: 1, from: -9, to: 9,
    scaleZ: [1, AIRCRAFT.fin.tipChordScale],
    shiftZ: [0, -AIRCRAFT.fin.sweepBack],
  });
  // Bottom-front corner (y=-9, z=9) is positions[3..5]; top-front corner
  // (y=9, z=9) is positions[9..11] (corners: x, then y, then z).
  assert.equal(pos[5], 9, `bottom z=${pos[5]}`);
  const top = pos.slice(9, 12);
  assert.ok(Math.abs(top[2] - (-1.95)) < 1e-9, `top z=${top[2]}`);
});

test('taperPositions clamps t outside [from, to]', () => {
  const pos = [-40, 2, 12, 40, 2, 12];
  taperPositions(pos, { axis: 0, from: -31, to: 31, scaleY: [2, 0.5], scaleZ: [1, 1] });
  assert.equal(pos[1], 4, 'below from clamps to root scale');
  assert.equal(pos[4], 1, 'above to clamps to tip scale');
});

test('nav lights are dots, not balloons', () => {
  assert.ok(AIRCRAFT.navLightRadius <= 2, `wingtip r=${AIRCRAFT.navLightRadius} (was 5)`);
  assert.ok(AIRCRAFT.navTailRadius <= 2, `tail r=${AIRCRAFT.navTailRadius} (was 2.5)`);
});

test('span stays 120 ft', () => {
  assert.equal(AIRCRAFT.span, 120);
});

test('gear down on the ground and on final, up in cruise', () => {
  assert.equal(gearDown({ airborne: false, y: 0 }), true, 'parked on the runway');
  assert.equal(gearDown({ airborne: true, y: 700 }), false, 'cruise (start/play alt)');
  assert.equal(gearDown({ airborne: true, y: 350 }), true, 'landing staging (landingAlt)');
  assert.equal(gearDown({ airborne: true, y: 120 }), true, 'freeze on final (freezeAlt)');
  assert.equal(gearDown({ airborne: true, y: 400 }), true, 'threshold inclusive');
  assert.equal(gearDown({ airborne: true, y: 401 }), false, 'above threshold retracts');
});

test('canopy is a low elongated bubble, not a ball', () => {
  const c = AIRCRAFT.canopy;
  const height = c.radius * c.scaleY;
  const length = 2 * c.radius * c.scaleZ;
  const width = 2 * c.radius * c.scaleX;
  assert.ok(height <= 4, `canopy height ${height} ft above base (was 8)`);
  assert.ok(length > 2 * width, `length ${length} vs width ${width}`);
});

test('fin is a tapered swept fin, not a flat plate with a roof', () => {
  assert.ok(AIRCRAFT.fin.tipChordScale < 0.6, `tip chord scale ${AIRCRAFT.fin.tipChordScale}`);
  assert.ok(AIRCRAFT.fin.sweepBack > 0, `sweep back ${AIRCRAFT.fin.sweepBack} ft`);
  assert.ok(AIRCRAFT.fin.stripeHeight <= 3, `tip stripe height ${AIRCRAFT.fin.stripeHeight} ft (was 5)`);
});

test('trailing strip centreline follows the tapered trailing edge', () => {
  // A straight strip at fixed z floated 4 ft behind the tip (probe 1:
  // the red stick in the zoom crop). The strip now tapers with the chord.
  const s = AIRCRAFT.trailStrip;
  assert.equal(s.rootZ, -13.8);
  assert.equal(s.tipZ, -7.2);
  // Mid-span chord 21 ft -> trailing -10.5; strip must sit within 1 ft.
  const at = (t) => s.rootZ + (s.tipZ - s.rootZ) * t;
  assert.ok(Math.abs(at(0.5) - (-10.5)) < 1);
  // Strip pivots about the wing centre so its dihedral tilt matches
  // the wing's; the old pivot (27.1) tilted it off the surface.
  assert.equal(s.pivotX, AIRCRAFT.wing.halfSpan - 0.5);
});

test('fuselage radius: cone 12 at the tail, 0 at the nose', () => {
  assert.equal(fuselageRadiusAt(-45), 12);
  assert.equal(fuselageRadiusAt(45), 0);
  assert.equal(fuselageRadiusAt(0), 6);
  // Canopy station from the render comment: r ~6.8 at z -6.
  assert.ok(Math.abs(fuselageRadiusAt(-6) - 6.8) < 1e-9);
});

test('taperPositions shiftY lerps a y-offset along the axis', () => {
  // A 40 ft box along z, y in [-1, 1]: shift the centreline down
  // from -0.83 at the tail end to -6.17 at the nose end (spine stripe).
  const pos = [];
  for (const z of [-20, 20]) for (const y of [-1, 1]) pos.push(0, y, z);
  taperPositions(pos, { axis: 2, from: -20, to: 20, shiftY: [-0.8333, -6.1667] });
  assert.ok(Math.abs(pos[1] - (-1.8333)) < 1e-3, `tail bottom y=${pos[1]}`);
  assert.ok(Math.abs(pos[7] - (-7.1667)) < 1e-3, `nose bottom y=${pos[7]}`);
});

test('spine stripe hugs the cone: top exactly proud, never floating', () => {
  const s = AIRCRAFT.spineStripe;
  // Centreline y = r(z) + proud - height/2 at both ends; top = r + proud.
  for (const z of [s.zCenter - s.length / 2, s.zCenter + s.length / 2]) {
    const r = fuselageRadiusAt(z);
    const centre = r + s.proud - s.height / 2;
    const top = centre + s.height / 2;
    assert.ok(Math.abs(top - (r + s.proud)) < 1e-9, `z=${z} top=${top} r=${r}`);
    assert.ok(centre - s.height / 2 < r, `z=${z} bottom buried in fuselage`);
    // Stripe must fit inside the fuselage width at its nose end.
    assert.ok(s.width / 2 < r, `z=${z} half-width ${s.width / 2} < r ${r}`);
  }
  // Old bug: straight 70 ft stripe at constant y 11 floated up to
  // ~9 ft above the nose (r 1.33 at z +35 -> gap 11-1-1.33 = 8.67).
  assert.ok(s.length <= 40, `stripe length ${s.length} (was 70)`);
});

test('fin tip cap is narrower than the fin tip (no red-roof overhang)', () => {
  const tipChord = 18 * AIRCRAFT.fin.tipChordScale; // 8.1 ft
  assert.ok(AIRCRAFT.fin.capDepth < tipChord, 'cap shorter than tip chord');
  assert.ok(AIRCRAFT.fin.capWidth < 3, 'cap narrower than fin thickness');
  assert.equal(AIRCRAFT.fin.stripeHeight, 2);
});
