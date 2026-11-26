// Shared pure helpers — no DOM, no THREE, node-testable.
// M12-clean N4: clamp and DEG used to be duplicated (world.js + shots.js
// each had their own clamp; world.js + render.js each had their own DEG).
// One copy now, imported by world.js, shots.js and render.js.
export const DEG = Math.PI / 180;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
