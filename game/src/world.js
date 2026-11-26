// Flight model — pure state, no rendering, no DOM. (TDD: tests/world.test.js)
// Units: positions in feet (x east, y altitude, z north), speed in knots,
// heading in degrees (0 = north), pitch/roll in degrees, time in seconds.
export const STALL_SPEED = 55;
export const CRUISE_SPEED = 110;
export const MAX_SPEED = 150;
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

const KTS_TO_FPS = 1.68781;
const DEG = Math.PI / 180;

export function createWorld({ seed = 1, mission = 'ring' } = {}) {
  const rand = mulberry32(seed);
  const rings = mission === 'ring'
    ? [
        { x: 0, y: 1700, z: 3500, r: 150, collected: false },
        { x: 400, y: 900, z: 12000, r: 150, collected: false },
        { x: -300, y: 700, z: 18000, r: 150, collected: false },
      ]
    : [];
  return {
    seed, mission, time: 0, rand,
    plane: {
      x: 0, y: 0, z: -2500, heading: 0, pitch: 0, roll: 0,
      speed: 0, vs: 0, throttle: 0,
      fuel: 100, hull: 100, airborne: false, landed: false, crashed: false,
    },
    wind: { x: 3, z: 1 },
    gust: { x: 0, z: 0 },
    gustTimer: 0,
    rings,
    collected: 0,
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function stepWorld(world, dt, input) {
  const p = world.plane;
  if (p.crashed || p.landed) return world;
  world.time += dt;

  // Gusts: new seeded gust every 2 s.
  world.gustTimer += dt;
  if (world.gustTimer >= 2) {
    world.gustTimer = 0;
    world.gust.x = (world.rand() * 2 - 1) * 6;
    world.gust.z = (world.rand() * 2 - 1) * 6;
  }

  // Throttle: move toward the input, forced to zero on an empty tank.
  const wantThrottle = p.fuel <= 0 ? 0 : clamp(input.throttle ?? 0, 0, 1);
  p.throttle += (wantThrottle - p.throttle) * Math.min(1, dt * 2);
  if (p.fuel <= 0) p.throttle = 0;

  // Fuel burn scales with throttle.
  p.fuel = Math.max(0, p.fuel - (0.05 + p.throttle * 0.30) * dt);

  // Pitch: move toward the target; below stall speed the nose damps down.
  const wantPitch = clamp(input.pitch ?? 0, -15, 25);
  p.pitch += (wantPitch - p.pitch) * Math.min(1, dt * 2);
  const stalled = p.speed < STALL_SPEED && p.airborne;
  if (stalled) p.pitch += (-8 - p.pitch) * Math.min(1, dt * 2);

  // Roll and heading: roll steers, scaled by speed.
  const rollTarget = clamp(input.roll ?? 0, -1, 1) * 25;
  p.roll += (rollTarget - p.roll) * Math.min(1, dt * 3);
  p.heading += (p.roll / 25) * 30 * dt * clamp(p.speed / 80, 0, 1);
  p.heading = ((p.heading % 360) + 360) % 360;

  // Speed: throttle pulls toward its top speed, pitch costs speed.
  p.speed += (p.throttle * MAX_SPEED - p.speed) * 0.3 * dt
    - Math.sin(p.pitch * DEG) * 8 * dt;
  p.speed = clamp(p.speed, 0, 170);

  // Lift scales with speed squared; below lift the plane sinks.
  const speedFps = p.speed * KTS_TO_FPS;
  const liftRatio = (p.speed / 100) * (p.speed / 100);
  const targetVs = speedFps * Math.sin(p.pitch * DEG) * liftRatio
    - (1 - liftRatio) * 15;
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
    const gentle = Math.abs(p.vs) <= 8 && p.speed < 90;
    if (p.airborne && onRunway && gentle) {
      p.landed = true;
      p.airborne = false;
      p.vs = 0;
    } else if (p.airborne) {
      if (Math.abs(p.vs) > 8) p.hull -= (Math.abs(p.vs) - 8) * 4;
      if (p.speed > 90) p.hull -= (p.speed - 90) * 0.5;
      if (!onRunway) p.hull -= 10;
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
