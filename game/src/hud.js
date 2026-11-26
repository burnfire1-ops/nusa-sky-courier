// HUD — DOM instruments + 2D mini-radar. (Skill: game-ui-ux — anchored,
// event-driven, readable at a glance; numbers update only when changed.
// M10.6: stealth-fighter green tactical HUD — angular chamfered frames,
// pitch ladder + flight-path marker + gun cross in the cockpit centre.)
import { ISLANDS } from './config.js';

const el = (id) => document.getElementById(id);

let last = {};

function setText(id, value) {
  if (last[id] !== value) {
    last[id] = value;
    const node = el(id);
    if (node) node.textContent = value;
  }
}

export function updateHud(world, econ, missionText, extra = {}) {
  const p = world.plane;
  setText('hud-alt', String(Math.round(p.y)));
  setText('hud-spd', String(Math.round(p.speed)));
  setText('hud-hdg', String(Math.round(p.heading)).padStart(3, '0'));
  setText('hud-fuel', String(Math.round(p.fuel)));
  setText('hud-hull', String(Math.round(p.hull)));
  setText('hud-kr', String(econ.kr));
  setText('hud-mission', missionText);
  const warn = el('hud-warn');
  if (warn) {
    let msg = '';
    if (p.speed < 55 && p.airborne) msg = 'STALL — turunkan hidung, tambah throttle!';
    else if (p.fuel < 20) msg = 'FUEL RENDAH';
    else if (p.hull < 40) msg = 'HULL RUSAK';
    if (last.warn !== msg) {
      last.warn = msg;
      warn.textContent = msg;
      warn.className = msg ? 'warn' : '';
    }
  }
  drawRadar(world);
  // M9.3 — chase-view flight tapes (speed left, altitude right), chase
  // compass tape (reuses the cockpit tape drawing), throttle/fuel/hull
  // bars and the objective panel. DOM/canvas overlay only: 0 extra
  // WebGL draw calls. (game-ui-ux: anchored edge instruments.)
  const spdTape = el('tape-spd');
  if (spdTape) drawTape(spdTape.getContext('2d'), spdTape.width, spdTape.height, p.speed, 0, 200, 60, 20, 40);
  const altTape = el('tape-alt');
  if (altTape) drawTape(altTape.getContext('2d'), altTape.width, altTape.height, p.y, 0, 5000, 1000, 250, 500);
  const chaseTape = el('chase-compass-canvas');
  if (chaseTape) drawCompassTape(chaseTape.getContext('2d'), chaseTape.width, chaseTape.height, world);
  setBar('bar-thr', p.throttle * 100, 0);
  setText('bar-thr-v', `${Math.round(p.throttle * 100)}%`);
  setBar('bar-fuel', p.fuel, 20);
  setText('bar-fuel-v', `${Math.round(p.fuel)}%`);
  setBar('bar-hull', p.hull, 40);
  setText('bar-hull-v', `${Math.round(p.hull)}%`);
  setText('obj-title', extra.title || '—');
  setText('obj-rings', `Cincin ${world.collected}/${world.rings.length}`);
  setText('obj-clock', extra.timeLimit
    ? `Sisa ${formatClock(extra.timeLimit - (extra.elapsed || 0))}`
    : `Waktu ${formatClock(extra.elapsed || 0)}`);
  setText('obj-day', `DAY ${extra.day || 1} · KR ${econ.kr}`);
}

function drawRadar(world) {
  const canvas = el('radar');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const p = world.plane;
  // Radar covers 40000 ft around the plane, north up.
  const scale = W / 40000;
  const toX = (x) => W / 2 + (x - p.x) * scale;
  const toY = (z) => H / 2 - (z - p.z) * scale;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(6, 42, 26, 0.9)';
  ctx.fillRect(0, 0, W, H);
  for (const island of ISLANDS) {
    ctx.fillStyle = '#c9a06b';
    ctx.beginPath();
    ctx.arc(toX(island.x), toY(island.z), Math.max(4, island.radius * scale), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#0a2a1a';
  ctx.fillRect(toX(-100), toY(0), 200 * scale, 3000 * scale);
  for (const ring of world.rings) {
    if (ring.collected) continue;
    ctx.strokeStyle = '#3dff7a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toX(ring.x), toY(ring.z), 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Plane arrow, rotated by heading.
  ctx.save();
  ctx.translate(toX(p.x), toY(p.z));
  ctx.rotate((p.heading * Math.PI) / 180);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---- M9.3 chase-view instruments: tapes, bars, objective ----
// Pure helper (unit-tested in tests/hud.test.js).
export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Vertical aviation tape: a moving scale centred on the current value,
// major ticks labelled, current value in an amber box. value is clamped
// to [min, max]; span is the half-window shown above/below centre.
function drawTape(ctx, W, H, value, min, max, span, majorStep, labelStep) {
  const v = Math.max(min, Math.min(max, value));
  const cy = H / 2;
  const pxPerUnit = H / (span * 2);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(16, 10, 30, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255, 194, 51, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  for (let t = Math.ceil((v - span) / majorStep) * majorStep; t <= v + span; t += majorStep) {
    if (t < min || t > max) continue;
    const y = cy - (t - v) * pxPerUnit;
    const labelled = t % labelStep === 0;
    ctx.strokeStyle = labelled ? GREEN : '#5a8a72';
    ctx.lineWidth = labelled ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(W - 14, y);
    ctx.lineTo(W - (labelled ? 4 : 8), y);
    ctx.stroke();
    if (labelled) {
      ctx.fillStyle = '#c8ffe0';
      ctx.fillText(String(t), 4, y + 4);
    }
  }
  // Current-value box + pointer.
  ctx.fillStyle = 'rgba(16, 10, 30, 0.95)';
  ctx.fillRect(0, cy - 13, W, 26);
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.5, cy - 13.5, W - 1, 27);
  ctx.fillStyle = GREEN;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(v)), W / 2, cy + 5);
  ctx.beginPath();
  ctx.moveTo(W - 2, cy - 5);
  ctx.lineTo(W - 2, cy + 5);
  ctx.lineTo(W - 9, cy);
  ctx.closePath();
  ctx.fill();
}

function setBar(id, pct, warnAt) {
  const node = el(id);
  if (!node) return;
  const key = `bar:${id}`;
  const v = Math.round(Math.max(0, Math.min(100, pct)));
  if (last[key] !== v) {
    last[key] = v;
    node.style.width = `${v}%`;
    node.classList.toggle('low', v < warnAt);
  }
}

// ---- Cockpit view: 6 live analog dials + compass tape (canvas) ----
// (Skill: game-ui-ux — one scaling policy, anchored bottom; game-feel —
// instruments are the juice for a flight sim, so they stay lit and live.)
const GREEN = '#3dff7a';
const GREEN_DIM = '#8affb0';
const FACE = '#141026';
const CARDINALS = ['N', '030', '060', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];

function dialFace(ctx, cx, cy, r, label) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = FACE;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = GREEN;
  ctx.stroke();
  // M10.6: angular MFD bezel — octagon ring around the round dial.
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const x = cx + Math.sin(a) * (r + 5);
    const y = cy - Math.cos(a) * (r + 5);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = GREEN;
  ctx.stroke();
  ctx.fillStyle = GREEN;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, cy + r - 8);
}

function dialTicks(ctx, cx, cy, r, count, startDeg, sweepDeg) {
  ctx.strokeStyle = '#c8ffe0';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= count; i += 1) {
    const a = ((startDeg + (sweepDeg * i) / count) * Math.PI) / 180;
    const r1 = r - 4, r2 = r - (i % 5 === 0 ? 12 : 8);
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    ctx.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
    ctx.stroke();
  }
}

function dialNeedle(ctx, cx, cy, r, deg, color = '#ffffff') {
  const a = (deg * Math.PI) / 180;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(a) * (r - 14), cy - Math.cos(a) * (r - 14));
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}

function dialValue(ctx, cx, cy, text) {
  ctx.fillStyle = GREEN;
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, cy + 22);
}

export function updateCockpit(world, econ, missionText) {
  const canvas = el('cockpit-dials');
  if (canvas) drawDials(canvas.getContext('2d'), canvas.width, canvas.height, world, econ, missionText);
  const tape = el('compass-tape-canvas');
  if (tape) drawCompassTape(tape.getContext('2d'), tape.width, tape.height, world);
  // M10.6: centre fighter HUD — pitch ladder + flight-path marker +
  // gun cross, drawn over the forward view (DCS F/A-18 / Falcon 4
  // symbology: ladder in 5° steps, solid above the horizon, dashed
  // below; FPM = circle with wings; gun cross = nose reference).
  const center = el('hud-center-canvas');
  if (center) drawCenterHud(center.getContext('2d'), center.width, center.height, world);
}

function drawCenterHud(ctx, W, H, world) {
  const p = world.plane;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((-p.roll * Math.PI) / 180);
  const pxPerDeg = 4;
  ctx.strokeStyle = GREEN;
  ctx.fillStyle = GREEN;
  ctx.lineWidth = 1.5;
  ctx.font = 'bold 11px monospace';
  // Pitch ladder: line for angle deg sits at (pitch - deg) * pxPerDeg.
  for (const deg of [-20, -15, -10, -5, 0, 5, 10, 15, 20]) {
    const y = (p.pitch - deg) * pxPerDeg;
    if (Math.abs(y) > H / 2 - 14) continue;
    const len = deg === 0 ? 90 : deg % 10 === 0 ? 64 : 44;
    ctx.strokeStyle = deg === 0 ? GREEN : GREEN_DIM;
    ctx.setLineDash(deg < 0 ? [6, 4] : []);
    ctx.beginPath();
    ctx.moveTo(-len, y);
    ctx.lineTo(len, y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (deg % 10 === 0 && deg !== 0) {
      ctx.fillStyle = GREEN_DIM;
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.abs(deg)), len + 5, y + 4);
    }
  }
  ctx.restore();
  // Flight-path marker (velocity vector): circle with wings + dot,
  // fixed at the centre of the HUD frame.
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2 - 34, H / 2);
  ctx.lineTo(W / 2 - 15, H / 2);
  ctx.moveTo(W / 2 + 15, H / 2);
  ctx.lineTo(W / 2 + 34, H / 2);
  ctx.stroke();
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Gun cross (nose reference) above the marker.
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 7, H / 2 - 78);
  ctx.lineTo(W / 2 + 7, H / 2 - 78);
  ctx.moveTo(W / 2, H / 2 - 85);
  ctx.lineTo(W / 2, H / 2 - 71);
  ctx.stroke();
}

function drawDials(ctx, W, H, world, econ, missionText) {
  const p = world.plane;
  ctx.clearRect(0, 0, W, H);
  // Mission line across the top of the panel.
  ctx.fillStyle = GREEN;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(missionText, W / 2, 18);
  const cy = 118, r = 58;
  const xs = [80, 240, 400, 560, 720, 880];
  // 1. Airspeed (0–200 kts, needle sweeps -120°..+120°).
  dialFace(ctx, xs[0], cy, r, 'AIRSPEED');
  dialTicks(ctx, xs[0], cy, r, 20, -120, 240);
  dialNeedle(ctx, xs[0], cy, r, -120 + (Math.min(p.speed, 200) / 200) * 240);
  dialValue(ctx, xs[0], cy, `${Math.round(p.speed)}`);
  // 2. Attitude — artificial horizon, rotated by roll, shifted by pitch.
  dialFace(ctx, xs[1], cy, r, 'ATTITUDE');
  ctx.save();
  ctx.beginPath();
  ctx.arc(xs[1], cy, r - 3, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(xs[1], cy);
  ctx.rotate((-p.roll * Math.PI) / 180);
  ctx.translate(0, (p.pitch / 20) * r);
  ctx.fillStyle = '#3a6a9a';
  ctx.fillRect(-r, -r, r * 2, r);
  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(-r, 0, r * 2, r);
  ctx.strokeStyle = '#c8ffe0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xs[1] - 18, cy);
  ctx.lineTo(xs[1] + 18, cy);
  ctx.stroke();
  // 3. Altitude (0–5000 ft).
  dialFace(ctx, xs[2], cy, r, 'ALTITUDE');
  dialTicks(ctx, xs[2], cy, r, 20, -120, 240);
  dialNeedle(ctx, xs[2], cy, r, -120 + (Math.min(p.y, 5000) / 5000) * 240);
  dialValue(ctx, xs[2], cy, `${Math.round(p.y)}`);
  // 4. VSI (-2000..+2000 ft/min; vs is ft/s).
  dialFace(ctx, xs[3], cy, r, 'VSI');
  dialTicks(ctx, xs[3], cy, r, 20, -120, 240);
  const vs = Math.max(-2000, Math.min(2000, p.vs * 60));
  dialNeedle(ctx, xs[3], cy, r, (vs / 2000) * 90);
  dialValue(ctx, xs[3], cy, vs >= 0 ? `+${Math.round(vs)}` : `${Math.round(vs)}`);
  // 5. Heading — compass rose with a pointer at current heading.
  dialFace(ctx, xs[4], cy, r, 'HEADING');
  ctx.save();
  ctx.translate(xs[4], cy);
  ctx.rotate((-p.heading * Math.PI) / 180);
  ctx.fillStyle = '#c8ffe0';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  const dirs = ['N', 'E', 'S', 'W'];
  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2;
    ctx.fillText(dirs[i], Math.sin(a) * (r - 16), -Math.cos(a) * (r - 16) + 4);
  }
  ctx.restore();
  dialNeedle(ctx, xs[4], cy, r, 0, GREEN);
  dialValue(ctx, xs[4], cy, `${String(Math.round(p.heading)).padStart(3, '0')}°`);
  // 6. Fuel (0–100%).
  dialFace(ctx, xs[5], cy, r, 'FUEL');
  dialTicks(ctx, xs[5], cy, r, 10, -120, 240);
  dialNeedle(ctx, xs[5], cy, r, -120 + (p.fuel / 100) * 240, p.fuel < 20 ? '#ff5555' : '#ffffff');
  dialValue(ctx, xs[5], cy, `${Math.round(p.fuel)}%`);
}

function drawCompassTape(ctx, W, H, world) {
  const hdg = world.plane.heading;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(16, 10, 30, 0.85)';
  ctx.fillRect(0, 0, W, H);
  const pxPerDeg = W / 120;
  const center = W / 2;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 5) {
    const h = Math.round(((hdg + d) % 360 + 360) % 360);
    const x = center + d * pxPerDeg;
    const isCard = h % 30 === 0;
    ctx.strokeStyle = isCard ? GREEN : '#5a8a72';
    ctx.lineWidth = isCard ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, H - 4);
    ctx.lineTo(x, H - (isCard ? 13 : 8));
    ctx.stroke();
    if (isCard) {
      ctx.fillStyle = GREEN;
      ctx.fillText(CARDINALS[Math.round(h / 30) % 12], x, 13);
    }
  }
  // Center caret + digital heading in its own box (never collides with a
  // cardinal label — the box covers the centre ticks).
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.moveTo(center - 7, 0);
  ctx.lineTo(center + 7, 0);
  ctx.lineTo(center, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(16, 10, 30, 0.95)';
  ctx.fillRect(center - 30, H - 20, 60, 16);
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 1;
  ctx.strokeRect(center - 30, H - 20, 60, 16);
  ctx.fillStyle = GREEN;
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`${String(Math.round(hdg)).padStart(3, '0')}°`, center, H - 8);
}

let toastTimer = 0;
export function showToast(message, ms = 2500) {
  const node = el('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.remove('hidden');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.add('hidden'), ms);
}
