// Flight model — pure state, no rendering, no DOM. (TDD: tests/world.test.js)
// Units: positions in feet (x east, y altitude, z north), speed in knots,
// heading in degrees (0 = north), pitch/roll in degrees, time in seconds.
// M12-clean N4: clamp/DEG live in util.js (one copy for the whole game).
import { clamp, DEG } from './util.js';
import { FLIGHT, ISLANDS } from './config.js';

export const STALL_SPEED = FLIGHT.stallSpeed;
export const RUNWAY = { x: 0, z0: -3000, z1: 0, halfWidth: 100 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


// M12-clean N5: the old `mission` option is gone. It only ever carried
// 'ring' (hardcoded at every call site, even on day-2 precision / day-3
// storm) and world.mission was never read — the field lied on days 2–3.
// All three mission kinds need the same 3 rings, so they are always built.
export function createWorld({ seed = 1, upgrades = [] } = {}) {
  const rand = mulberry32(seed);
  // M12-clean N4: ring x/z come from ISLANDS — the K1 root cause was
  // these coordinates living in two places (world.js vs config.js).
  // Ring heights stay here: they are mission tuning, not island data.
  // M12-fix K1: ring 3 was y=700 — its whole disc (bottom 550 ft) sat
  // below Hijau's peak (900 ft), so the ring was buried in the mountain.
  // y=1150 puts the bottom (1000 ft) 100 ft clear of the peak; see
  // tests/world.test.js ring-clearance invariant.
  const RING_HEIGHTS = [1700, 900, 1150];
  const rings = ISLANDS.map((island, i) => ({
    x: island.x, y: RING_HEIGHTS[i], z: island.z,
    r: FLIGHT.ringRadius, collected: false,
  }));
  // V2-B: hangar upgrades, derived once here so stepWorld stays pure
  // arithmetic on world fields. Defaults equal the stock FLIGHT values.
  const owned = new Set(upgrades);
  return {
    seed, time: 0, rand,
    maxSpeed: owned.has('turbine') ? FLIGHT.maxSpeed + 25 : FLIGHT.maxSpeed,
    speedClampMax: owned.has('turbine') ? FLIGHT.speedClampMax + 25 : FLIGHT.speedClampMax,
    fuelBurnScale: owned.has('fuel') ? 1 / 1.4 : 1,
    landingVsMax: owned.has('glider') ? FLIGHT.landingVsMax * 1.4 : FLIGHT.landingVsMax,
    landingSpeedMax: owned.has('glider') ? FLIGHT.landingSpeedMax * 1.4 : FLIGHT.landingSpeedMax,
    plane: {
      x: 0, y: 0, z: -2500, heading: 0, pitch: 0, roll: 0,
      speed: 0, vs: 0, throttle: 0,
      fuel: 100, hull: 100, airborne: false, landed: false, crashed: false,
    },
    wind: { ...FLIGHT.wind },
    gust: { x: 0, z: 0 },
    gustTimer: 0,
    rings,
    collected: 0,
  };
}

export function stepWorld(world, dt, input) {
  const p = world.plane;
  if (p.crashed || p.landed) return world;
  world.time += dt;

  // Gusts: new seeded gust every 2 s.
  world.gustTimer += dt;
  if (world.gustTimer >= FLIGHT.gustIntervalSec) {
    world.gustTimer = 0;
    world.gust.x = (world.rand() * 2 - 1) * FLIGHT.gustMax;
    world.gust.z = (world.rand() * 2 - 1) * FLIGHT.gustMax;
  }

  // Throttle: move toward the input, forced to zero on an empty tank.
  const wantThrottle = p.fuel <= 0 ? 0 : clamp(input.throttle ?? 0, 0, 1);
  p.throttle += (wantThrottle - p.throttle) * Math.min(1, dt * 2);
  if (p.fuel <= 0) p.throttle = 0;

  // Fuel burn scales with throttle (and with Fuel Pods, V2-B).
  p.fuel = Math.max(0, p.fuel - (FLIGHT.burnBase + p.throttle * FLIGHT.burnThrottle) * world.fuelBurnScale * dt);

  // Pitch: move toward the target; below stall speed the nose damps down.
  const wantPitch = clamp(input.pitch ?? 0, FLIGHT.pitchMin, FLIGHT.pitchMax);
  p.pitch += (wantPitch - p.pitch) * Math.min(1, dt * 2);
  const stalled = p.speed < STALL_SPEED && p.airborne;
  if (stalled) p.pitch += (FLIGHT.stallPitch - p.pitch) * Math.min(1, dt * 2);

  // Roll and heading: roll steers, scaled by speed.
  const rollTarget = clamp(input.roll ?? 0, -1, 1) * FLIGHT.rollMaxDeg;
  p.roll += (rollTarget - p.roll) * Math.min(1, dt * 3);
  p.heading += (p.roll / FLIGHT.rollMaxDeg) * FLIGHT.turnRateDegPerSec * dt * clamp(p.speed / FLIGHT.turnRefSpeed, 0, 1);
  p.heading = ((p.heading % 360) + 360) % 360;

  // Speed: throttle pulls toward its top speed (Turbine Boost raises
  // world.maxSpeed, V2-B), pitch costs speed.
  p.speed += (p.throttle * world.maxSpeed - p.speed) * 0.3 * dt
    - Math.sin(p.pitch * DEG) * 8 * dt;
  p.speed = clamp(p.speed, 0, world.speedClampMax);

  // Lift scales with speed squared; below lift the plane sinks.
  const speedFps = p.speed * FLIGHT.ktsToFps;
  const liftRatio = (p.speed / FLIGHT.liftRefSpeed) * (p.speed / FLIGHT.liftRefSpeed);
  const targetVs = speedFps * Math.sin(p.pitch * DEG) * liftRatio
    - (1 - liftRatio) * FLIGHT.sinkRate;
  p.vs += (targetVs - p.vs) * Math.min(1, dt * 3);

  // Position: heading plus wind and gusts.
  const h = p.heading * DEG;
  p.x += Math.sin(h) * speedFps * dt + (world.wind.x + world.gust.x) * dt;
  p.z += Math.cos(h) * speedFps * dt + (world.wind.z + world.gust.z) * dt;
  p.y += p.vs * dt;
  if (p.y > 0.5) p.airborne = true;

  // Rings: flying through the centre collects one.
  for (const ring of world.rings) {
    if (ring.collected) continue;
    const dx = p.x - ring.x, dy = p.y - ring.y, dz = p.z - ring.z;
    if (dx * dx + dy * dy + dz * dz < ring.r * ring.r) {
      ring.collected = true;
      world.collected += 1;
    }
  }

  // Ground contact.
  if (p.y <= 0) {
    p.y = 0;
    const onRunway = Math.abs(p.x - RUNWAY.x) <= RUNWAY.halfWidth
      && p.z >= RUNWAY.z0 && p.z <= RUNWAY.z1;
    // Gentle-landing limits come from the world (Reinforced Glider
    // raises them x1.4, V2-B); stock values equal FLIGHT.
    const gentle = Math.abs(p.vs) <= world.landingVsMax && p.speed < world.landingSpeedMax;
    if (p.airborne && onRunway && gentle) {
      p.landed = true;
      p.airborne = false;
      p.vs = 0;
    } else if (p.airborne) {
      if (Math.abs(p.vs) > world.landingVsMax) p.hull -= (Math.abs(p.vs) - world.landingVsMax) * FLIGHT.damageVsFactor;
      if (p.speed > world.landingSpeedMax) p.hull -= (p.speed - world.landingSpeedMax) * FLIGHT.damageSpeedFactor;
      if (!onRunway) p.hull -= FLIGHT.damageOffRunway;
      p.vs = 0;
      p.speed *= 0.8;
      p.airborne = false;
      if (p.hull <= 0) {
        p.hull = 0;
        p.crashed = true;
      }
    }
  }
  return world;
}
