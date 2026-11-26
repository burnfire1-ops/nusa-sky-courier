// HUD — DOM instruments + 2D mini-radar. (Skill: game-ui-ux — anchored,
// event-driven, readable at a glance; numbers update only when changed.)
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

export function updateHud(world, econ, missionText) {
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
  ctx.fillStyle = 'rgba(20, 80, 107, 0.9)';
  ctx.fillRect(0, 0, W, H);
  for (const island of ISLANDS) {
    ctx.fillStyle = '#c9a06b';
    ctx.beginPath();
    ctx.arc(toX(island.x), toY(island.z), Math.max(4, island.radius * scale), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2b2b33';
  ctx.fillRect(toX(-100), toY(0), 200 * scale, 3000 * scale);
  for (const ring of world.rings) {
    if (ring.collected) continue;
    ctx.strokeStyle = '#ffc233';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toX(ring.x), toY(ring.z), 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Plane arrow, rotated by heading.
  ctx.save();
  ctx.translate(toX(p.x), toY(p.z));
  ctx.rotate((p.heading * Math.PI) / 180);
  ctx.fillStyle = '#f2e3c6';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fill();
  ctx.restore();
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
