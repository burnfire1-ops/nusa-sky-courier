// Screenshot staging — the scenes behind ?shot=start|play|landing|end.
// (Skill: prototype-fast greybox discipline + the starter's shots.js pattern.)
// Each scene plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a simple autopilot, so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { createWorld, stepWorld } from './world.js';

const SAMPLE = 1 / 30;
const START_SECONDS = 5;
const PLAY_SECONDS = 18;
const LANDING_SECONDS = 40;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Autopilot: steer toward a point (x, y, z in feet), hold ~90 kts. */
export function autopilotTo(world, tx, ty, tz) {
  const p = world.plane;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const wantHeading = (Math.atan2(dx, dz) * 180) / Math.PI;
  let err = wantHeading - p.heading;
  while (err > 180) err -= 360;
  while (err < -180) err += 360;
  const roll = clamp(err / 25, -1, 1);
  const altErr = ty - p.y;
  const pitch = clamp(altErr / 40, -8, 15);
  // Full throttle while still climbing hard toward the target.
  const throttle = altErr > 100 ? 1 : clamp(0.6 + (90 - p.speed) / 60, 0.25, 1);
  return { throttle, pitch, roll };
}

function nextRingTarget(world) {
  const ring = world.rings.find((r) => !r.collected);
  return ring ? { x: ring.x, y: ring.y, z: ring.z } : null;
}

/**
 * Set `world` to the named scene (start, play, landing, end) and return the
 * screen to draw over it.
 */
export function stageShot(name, seed = 1) {
  const world = createWorld({ seed, mission: 'ring' });
  if (name !== 'play' && name !== 'landing' && name !== 'end') {
    // Title: level flight over the sea toward the volcano and first ring.
    world.plane.speed = 100;
    world.plane.y = 700;
    world.plane.airborne = true;
    world.plane.z = -2500;
    for (let i = 0; i < START_SECONDS / SAMPLE; i += 1) {
      const t = nextRingTarget(world);
      stepWorld(world, SAMPLE, t ? autopilotTo(world, t.x, t.y, t.z) : { throttle: 0.7, pitch: 0, roll: 0 });
    }
    return { world, screen: 'title', cockpit: false };
  }
  if (name === 'play') {
    world.plane.speed = 100;
    world.plane.y = 700;
    world.plane.airborne = true;
    world.plane.z = -2500;
    for (let i = 0; i < PLAY_SECONDS / SAMPLE; i += 1) {
      const t = nextRingTarget(world);
      if (!t) break;
      stepWorld(world, SAMPLE, autopilotTo(world, t.x, t.y, t.z));
    }
    return { world, screen: 'play', cockpit: true };
  }
  // Landing + end: short final approach, frozen on final over the runway
  // threshold — plane aligned with the strip, ~200 ft up, runway ahead.
  // (Earlier version aimed at the runway centre with wantAlt -> 0 at the
  // target: wind drift + overshoot turned the plane around (HDG 103) and
  // it touched down hard off-runway, HULL 69%, rolling on the sea.)
  world.plane.speed = 85;
  world.plane.y = 350;
  world.plane.airborne = true;
  world.plane.x = 0;
  world.plane.z = -4200;
  for (let i = 0; i < LANDING_SECONDS / SAMPLE; i += 1) {
    stepWorld(world, SAMPLE, autopilotTo(world, 0, 100, -2600));
    // Freeze on final: just past the threshold, still well above ground.
    if (world.plane.z >= -2900 || world.plane.y <= 120 || world.plane.landed) break;
  }
  return { world, screen: name === 'end' ? 'debrief' : 'play', cockpit: false };
}
