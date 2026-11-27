// Screenshot staging — the scenes behind ?shot=start|play|landing|end.
// (Skill: prototype-fast greybox discipline + the starter's shots.js pattern.)
// Each scene plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a simple autopilot, so the frame is what a
// short game really looks like and the same seed always gives the same frame.
// M12-clean N4: clamp lives in util.js (one copy for the whole game).
import { createWorld, stepWorld } from './world.js';
import { SHOTS } from './config.js';
import { clamp } from './util.js';


/** Autopilot: steer toward a point (x, y, z in feet), hold ~90 kts. */
export function autopilotTo(world, tx, ty, tz) {
  const p = world.plane;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const wantHeading = (Math.atan2(dx, dz) * 180) / Math.PI;
  let err = wantHeading - p.heading;
  while (err > 180) err -= 360;
  while (err < -180) err += 360;
  const roll = clamp(err / SHOTS.autopilotRollDivisor, -1, 1);
  const altErr = ty - p.y;
  const pitch = clamp(altErr / SHOTS.autopilotPitchDivisor, SHOTS.autopilotPitchMin, SHOTS.autopilotPitchMax);
  // Full throttle while still climbing hard toward the target.
  const throttle = altErr > SHOTS.autopilotClimbAltErr ? SHOTS.autopilotClimbThrottle
    : clamp(SHOTS.autopilotThrottleBase + (SHOTS.autopilotCruiseSpeed - p.speed) / SHOTS.autopilotThrottleSlope, SHOTS.autopilotThrottleMin, 1);
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
  const world = createWorld({ seed });
  if (name !== 'play' && name !== 'landing' && name !== 'end') {
    // Title: level flight over the sea toward the volcano and first ring.
    world.plane.speed = SHOTS.startSpeed;
    world.plane.y = SHOTS.startAlt;
    world.plane.airborne = true;
    world.plane.z = SHOTS.spawnZ;
    for (let i = 0; i < SHOTS.startSeconds / SHOTS.sample; i += 1) {
      const t = nextRingTarget(world);
      stepWorld(world, SHOTS.sample, t ? autopilotTo(world, t.x, t.y, t.z) : { throttle: 0.7, pitch: 0, roll: 0 });
    }
    return { world, screen: 'title', cockpit: false };
  }
  if (name === 'play') {
    world.plane.speed = SHOTS.playSpeed;
    world.plane.y = SHOTS.playAlt;
    world.plane.airborne = true;
    world.plane.z = SHOTS.spawnZ;
    // V2-F lever 2 (bank): two-leg staging. Leg 1 flies at a waypoint
    // beside ring 1; leg 2 switches onto the ring and freezes 1.5 s
    // later — mid-turn, banked (~19 deg roll). A straight-in freeze
    // (V2-F A2) reads static; the bank reads as motion. The waypoint
    // sits BESIDE the ring, not south of it: a south waypoint switches
    // early (t1 ~16-20 s) with the ring still 2000+ ft out (ring
    // 62-88 px); a beside-ring waypoint switches at ~28.6 s with the
    // ring ~760 ft out (ring ~144 px, probe-bank.mjs + beside-ring
    // sweep). playLeg1Cap is a safety cap only.
    const ring1 = world.rings[0];
    const wp = {
      x: ring1.x + SHOTS.playWaypoint.dx,
      y: ring1.y,
      z: ring1.z + SHOTS.playWaypoint.dz,
    };
    for (let i = 0; i < SHOTS.playLeg1Cap / SHOTS.sample; i += 1) {
      const p = world.plane;
      if (Math.hypot(p.x - wp.x, p.y - wp.y, p.z - wp.z) < SHOTS.playSwitchDist) break;
      stepWorld(world, SHOTS.sample, autopilotTo(world, wp.x, wp.y, wp.z));
    }
    for (let i = 0; i < SHOTS.playLeg2Seconds / SHOTS.sample; i += 1) {
      const t = nextRingTarget(world);
      if (!t) break;
      stepWorld(world, SHOTS.sample, autopilotTo(world, t.x, t.y, t.z));
    }
    return { world, screen: 'play', cockpit: false };
  }
  // Landing + end: short final approach, frozen on final over the runway
  // threshold — plane aligned with the strip, ~200 ft up, runway ahead.
  // (Earlier version aimed at the runway centre with wantAlt -> 0 at the
  // target: wind drift + overshoot turned the plane around (HDG 103) and
  // it touched down hard off-runway, HULL 69%, rolling on the sea.)
  world.plane.speed = SHOTS.landingSpeed;
  world.plane.y = SHOTS.landingAlt;
  world.plane.airborne = true;
  world.plane.x = 0;
  world.plane.z = SHOTS.landingZ;
  for (let i = 0; i < SHOTS.landingSeconds / SHOTS.sample; i += 1) {
    stepWorld(world, SHOTS.sample, autopilotTo(world, SHOTS.landingTarget.x, SHOTS.landingTarget.y, SHOTS.landingTarget.z));
    // Freeze on final: just past the threshold, still well above ground.
    if (world.plane.z >= SHOTS.freezeZ || world.plane.y <= SHOTS.freezeAlt || world.plane.landed) break;
  }
  return { world, screen: name === 'end' ? 'debrief' : 'play', cockpit: false };
}
