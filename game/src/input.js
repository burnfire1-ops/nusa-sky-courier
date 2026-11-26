// Input — keyboard + mouse. (Skills: camera-systems for the orbit, and the
// thesis §3.4 control map.) Keys are read per frame; the mouse drags the
// chase-camera orbit. No pointer lock — desktop browser, plain events.
// M12-clean N2: the tuning numbers live in config.js (INPUT).
import { INPUT } from './config.js';
const keys = new Set();
let orbit = { yaw: 0, pitch: 0 };
let dragging = false;
let lastX = 0;
let lastY = 0;
let throttle = 0;
let paused = false;
let cockpit = false;

/** Cockpit view toggle — pure state, no DOM at import time (node-testable). */
export function isCockpit() {
  return cockpit;
}

export function setCockpit(value) {
  cockpit = !!value;
}

export function toggleCockpit() {
  cockpit = !cockpit;
}

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
    // M12-fix K3: ignore key auto-repeat — holding P/C must not
    // spam-toggle pause/cockpit.
    if (!e.repeat && (e.key.toLowerCase() === 'p' || e.key === 'Escape')) paused = !paused;
    if (!e.repeat && e.key.toLowerCase() === 'c') toggleCockpit();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    orbit.yaw += (e.clientX - lastX) * INPUT.orbitYaw;
    orbit.pitch = Math.max(INPUT.orbitPitchMin, Math.min(INPUT.orbitPitchMax, orbit.pitch - (e.clientY - lastY) * INPUT.orbitPitch));
    lastX = e.clientX;
    lastY = e.clientY;
  });
}

export function readFlightInput(dt) {
  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  if (keys.has('shift')) throttle = Math.min(1, throttle + dt * INPUT.throttleRate);
  if (keys.has('control')) throttle = Math.max(0, throttle - dt * INPUT.throttleRate);
  if (keys.has(' ')) throttle = 0;
  return {
    pitch: up ? INPUT.pitchUp : down ? INPUT.pitchDown : 0,
    roll: left ? -1 : right ? 1 : 0,
    throttle,
  };
}

export function getOrbit() {
  return orbit;
}

export function isPaused() {
  return paused;
}

export function setPaused(value) {
  paused = value;
}

export function setThrottle(value) {
  throttle = value;
}
