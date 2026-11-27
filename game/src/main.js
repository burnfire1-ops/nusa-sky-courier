// Nusa Sky Courier — game entry point. (Skills: router / threejs-scene-setup /
// game-ui-ux / audio-design / game-feel.) Owns the screen state machine, the
// courier-day loop, the render loop and the ?shot= staging mode.
import * as THREE from 'three';
import { createWorld, stepWorld } from './world.js';
import { createEconomy, addReward, applyLanding, buyUpgrade } from './economy.js';
import { UPGRADES } from './config.js';
import { MISSIONS, createMissionRun, updateMission, missionProgress } from './missions.js';
import { createRenderer, buildScene, updateScene, perfStats, onResize } from './render.js';
import { updateHud, updateCockpit, showToast } from './hud.js';
import { ensureAudio, updateAudio, playRing, playLand, playCrash } from './audio.js';
import { initInput, readFlightInput, getOrbit, isPaused, setPaused, setThrottle, isCockpit, setCockpit } from './input.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 1);

const canvas = document.getElementById('scene');
const renderer = createRenderer(canvas);
const econ = createEconomy();
let world;
let view;
let run = null;
let day = 1;
let mission = MISSIONS[0];
let screen = 'title';
let lastCollected = 0;
let framesRendered = 0;

const screens = {
  title: document.getElementById('screen-title'),
  briefing: document.getElementById('screen-briefing'),
  debrief: document.getElementById('screen-debrief'),
  pause: document.getElementById('screen-pause'),
  hud: document.getElementById('hud'),
};

function showScreen(name) {
  screen = name;
  for (const [key, node] of Object.entries(screens)) {
    if (!node) continue;
    node.classList.toggle('hidden', key !== name && !(name === 'play' && key === 'hud'));
  }
  if (name === 'play') screens.hud.classList.remove('hidden');
}

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem('nusa-best') || '{}');
  } catch {
    return {};
  }
}

function saveBest() {
  try {
    const best = loadBest();
    best.bestRank = econ.bestRank;
    best.kr = Math.max(best.kr || 0, econ.kr);
    best.upgrades = [...econ.upgrades];
    localStorage.setItem('nusa-best', JSON.stringify(best));
  } catch {
    // Storage unavailable — the game still plays.
  }
}

// V2-B hangar shop (game-ui-ux): rows rebuilt from econ state each time
// the briefing shows or a purchase lands. Buttons are disabled when the
// upgrade is owned or KR is short — never a dead click.
function renderShop() {
  const krNode = document.getElementById('shop-kr');
  if (krNode) krNode.textContent = String(econ.kr);
  const list = document.getElementById('shop-list');
  if (!list) return;
  list.replaceChildren(...UPGRADES.map((item) => {
    const row = document.createElement('div');
    row.className = 'shop-row';
    const owned = econ.upgrades.includes(item.id);
    const afford = econ.kr >= item.price;
    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('b');
    name.textContent = item.name;
    const desc = document.createElement('span');
    desc.textContent = ` — ${item.desc} · ${item.price} KR`;
    info.append(name, desc);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = item.id;
    btn.disabled = owned || !afford;
    btn.textContent = owned ? 'TERPASANG' : afford ? 'BELI' : 'KR KURANG';
    row.append(info, btn);
    return row;
  }));
}

document.getElementById('shop-list')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn || btn.disabled) return;
  if (buyUpgrade(econ, btn.dataset.id).ok) {
    saveBest();
    renderShop();
  }
});

function startDay() {
  mission = MISSIONS[(day - 1) % MISSIONS.length];
  lastCollected = 0;
  setThrottle(0);
  document.getElementById('brief-title').textContent = `DAY ${day} — ${mission.title}`;
  document.getElementById('brief-body').textContent = mission.brief;
  document.getElementById('brief-reward').textContent = `Reward: ${mission.reward} KR on completion`;
  renderShop();
  showScreen('briefing');
}

function startMission() {
  // V2-B fix: the world is built HERE, not in startDay — the briefing is
  // where upgrades are bought, so a world built in startDay would predate
  // the purchase and the upgrade would not apply until the next day.
  world = createWorld({ seed: day, upgrades: econ.upgrades });
  view = buildScene(world);
  run = createMissionRun(mission, world);
  ensureAudio();
  showScreen('play');
}

function endDay(landed) {
  const title = document.getElementById('debrief-title');
  const body = document.getElementById('debrief-body');
  const rankLine = document.getElementById('debrief-rank');
  if (run && run.status === 'complete') {
    addReward(econ, run.mission.reward);
    const landing = applyLanding(econ, {
      vs: world.plane.vs, speed: world.plane.speed,
      rings: world.collected, ringsTotal: world.rings.length, hull: world.plane.hull,
    });
    title.textContent = 'DELIVERY COMPLETE';
    body.textContent = `${run.mission.title} — selesai! +${run.mission.reward} KR misi, +${landing.points} KR landing.`;
    rankLine.textContent = `Landing Rank ${landing.rank} · Best Rank ${econ.bestRank} · Total KR ${econ.kr}`;
    playLand();
  } else if (world.plane.crashed) {
    title.textContent = 'CRASHED';
    body.textContent = 'Pesawat jatuh. Hull hancur — hari ini tidak ada bayaran.';
    rankLine.textContent = `Best Rank ${econ.bestRank || '—'} · Total KR ${econ.kr}`;
    playCrash();
  } else {
    title.textContent = landed ? 'LANDED' : 'DAY OVER';
    body.textContent = landed
      ? 'Mendarat dengan selamat, tapi misi belum selesai.'
      : 'Misi gagal — bahan bakar habis atau waktu habis.';
    rankLine.textContent = `Best Rank ${econ.bestRank || '—'} · Total KR ${econ.kr}`;
  }
  // M12-fix S1: save AFTER the reward/landing points land, so the best
  // rank/KR on the title screen is current, not one day behind.
  saveBest();
  document.getElementById('btn-next').textContent = day >= 3 ? 'FINISH' : 'NEXT DAY';
  showScreen('debrief');
}

document.getElementById('btn-fly').addEventListener('click', () => {
  day = 1;
  startDay();
});
document.getElementById('btn-start-mission').addEventListener('click', startMission);
document.getElementById('btn-next').addEventListener('click', () => {
  if (day >= 3) {
    day = 1;
    const best = loadBest();
    document.getElementById('title-best').textContent = best.bestRank || '—';
    showScreen('title');
  } else {
    day += 1;
    startDay();
  }
});
document.getElementById('btn-resume').addEventListener('click', () => {
  setPaused(false);
  showScreen('play');
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && screen === 'title') {
    day = 1;
    startDay();
  }
});

initInput(canvas);
window.addEventListener('resize', () => {
  if (view) onResize(renderer, view.camera);
});

const best = loadBest();
document.getElementById('title-best').textContent = best.bestRank || '—';
// V2-B: owned upgrades persist across sessions (KR itself is per
// campaign and starts at 0 — only the unlocks carry over).
econ.upgrades = Array.isArray(best.upgrades) ? [...best.upgrades] : [];

// Shot staging mode: deterministic scene, a few frames, then report.
if (shotName) {
  const staged = stageShot(shotName, seed);
  world = staged.world;
  view = buildScene(world);
  // Cockpit view comes from the shot staging (play = cockpit in M8).
  setCockpit(!!staged.cockpit);
  document.body.classList.toggle('cockpit', isCockpit());
  // M9.3: chase HUD (tapes/bars/objective/compass) shows in play shots
  // that are not cockpit. Title/debrief shots keep it hidden.
  document.body.classList.toggle('chase', staged.screen === 'play' && !isCockpit());
  // M8-fix, shot 1 only: dock the title card left so the volcano + sea +
  // runway read beside it on the cover image. Normal play is untouched.
  if (shotName === 'start') document.body.classList.add('shot-start');
  // M8-fix, shot 3 only: 2° three-quarter rear chase (breaks the tail's
  // "red cross" read) + a lower camera (pulls the ILS mast up into the
  // frame so it reads as an antenna, not a clipped glitch). M9-fix Rank 2:
  // pull back 40 ft (zoom) on landing AND end — probe showed Y+2 moves
  // bar2 by ~2 px (no-op) and pitch can't clear it, but zoom+40 lifts
  // bar2 ~35 px into frame (mast + both bars visible); the ILS pad stays
  // below frame, so the mast exits the bottom edge like a grounded pole.
  // V2-D: the play shot gets the landing recipe's yaw + zoom — dead-astern
  // (yaw 0) read the stealth jet as a dark cross/blob against the lava
  // slope, and the 190 ft chase put the plane huge with the ring small.
  // Pitch stays 0: pitch -80 (tried first) levels the camera so the ring
  // falls INSIDE the plane's silhouette and is occluded by the fuselage —
  // with the camera 70 ft above, the ring sits clear above the plane.
  // Yaw 2° (tried second) was too subtle at 230 ft to break the symmetry;
  // yaw 10° shows a real three-quarter rear profile (fuselage length +
  // swept wing + V-tail from the side) while the ring stays centred —
  // the lookAt ignores yaw, so the target does not drift.
  // V2-F: play staging is now 30 s (ring 548 ft ahead, ~3.3x the v2
  // size) — at that range the ring's bottom dips into the plane's
  // silhouette at pitch 0 (probe gap -35 px). Pitch +40 RAISES the
  // camera (opposite direction from the V2-D -80 failure: lowering the
  // camera occludes, raising it clears) and opens a 26 px gap while the
  // ring stays fully in frame; the higher camera also pulls more lava
  // slope into the lower frame. Verified by probe-frame.mjs, not by eye.
  const shotOrbit = shotName === 'play'
    ? { yaw: 10, pitch: 40, zoom: 40 }
    : shotName === 'landing'
      ? { yaw: 2, pitch: -80, zoom: 40 }
      : shotName === 'end' ? { yaw: 0, pitch: 0, zoom: 40 } : { yaw: 0, pitch: 0 };
  if (shotName === 'end') {
    run = createMissionRun(MISSIONS[0], world);
    run.status = 'complete';
    world.collected = world.rings.length;
    // M12-clean N5: the staged 'end' shot reuses endDay to render the
    // debrief panel — the plane is still on final approach, not landed,
    // and the argument is ignored here anyway (the run is complete, so
    // endDay takes the DELIVERY COMPLETE branch either way).
    endDay(false);
  } else if (staged.screen === 'title') {
    showScreen('title');
  } else {
    showScreen('play');
  }
  const pre = document.createElement('pre');
  pre.id = 'result';
  pre.style.cssText = 'position:fixed;left:-9999px;top:0';
  pre.textContent = 'PENDING';
  document.body.appendChild(pre);
  renderer.setAnimationLoop(() => {
    updateScene(view, world, 1 / 30, shotOrbit, isCockpit());
    if (staged.screen === 'play') {
      const missionText = shotName === 'landing' ? 'Final approach — flare before touchdown' : `Cincin ${world.collected}/${world.rings.length}`;
      if (isCockpit()) updateCockpit(world, econ, missionText);
      else updateHud(world, econ, missionText, { day: 1, title: MISSIONS[0].title, elapsed: 0, timeLimit: null });
    }
    renderer.render(view.scene, view.camera);
    framesRendered += 1;
    if (framesRendered === 90) {
      const stats = perfStats(renderer);
      pre.textContent = `RESULT ${JSON.stringify({ ...stats, frames: framesRendered })}`;
      document.title = 'SHOT READY';
      renderer.setAnimationLoop(null);
    }
  });
} else {
  showScreen('title');
  world = createWorld({ seed: 1 });
  view = buildScene(world);
  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1);
    if (screen === 'play' && !isPaused()) {
      const input = readFlightInput(dt);
      stepWorld(world, dt, input);
      if (run) updateMission(run, world);
      if (world.collected > lastCollected) {
        lastCollected = world.collected;
        playRing();
        showToast(`Cincin ${world.collected}/${world.rings.length} — bagus!`);
      }
      updateAudio(world.plane);
      if (run) {
        const missionText = missionProgress(run, world);
        if (isCockpit()) updateCockpit(world, econ, missionText);
        else updateHud(world, econ, missionText, {
          day,
          title: run.mission.title,
          elapsed: world.time - run.startedAt,
          timeLimit: run.mission.timeLimit ?? null,
        });
      }
      if (world.plane.landed || world.plane.crashed) endDay(world.plane.landed);
      else if (run && run.status === 'failed') endDay(false);
      // M12-fix K2: fuel-out, stopped on the ground — the day is over for
      // every kind. Without this the ring mission has no fail path at all
      // and the game soft-locks on the play screen (fuel 0, speed 0,
      // airborne false, landed/crashed false). A gliding plane is NOT
      // failed — it can still land. Also covers precision-after-pickup
      // (missions.js only fails fuel-out before pickup) and the
      // complete-but-stuck case (endDay pays the reward then).
      else if (run && world.plane.fuel <= 0 && world.plane.speed < 1
        && !world.plane.airborne && !world.plane.landed && !world.plane.crashed) {
        endDay(false);
      }
    }
    document.body.classList.toggle('cockpit', screen === 'play' && isCockpit());
    document.body.classList.toggle('chase', screen === 'play' && !isCockpit());
    // M12-fix K3: sync the visible screen to the pause flag. The old
    // `screen === 'pause' || isPaused()` swallowed the resume branch —
    // pressing P on the pause screen never returned to play.
    if (screen === 'play' && isPaused()) showScreen('pause');
    else if (screen === 'pause' && !isPaused()) showScreen('play');
    updateScene(view, world, dt, getOrbit(), isCockpit());
    renderer.render(view.scene, view.camera);
  });
}

Object.assign(window, { __game: { get world() { return world; }, econ, renderer, get view() { return view; } } });
