// Nusa Sky Courier — game entry point. (Skills: router / threejs-scene-setup /
// game-ui-ux / audio-design / game-feel.) Owns the screen state machine, the
// courier-day loop, the render loop and the ?shot= staging mode.
import * as THREE from 'three';
import { createWorld, stepWorld } from './world.js';
import { createEconomy, addReward, applyLanding } from './economy.js';
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
    best.rank = econ.rank;
    best.kr = Math.max(best.kr || 0, econ.kr);
    localStorage.setItem('nusa-best', JSON.stringify(best));
  } catch {
    // Storage unavailable — the game still plays.
  }
}

function startDay() {
  const mission = MISSIONS[(day - 1) % MISSIONS.length];
  world = createWorld({ seed: day, mission: 'ring' });
  view = buildScene(world);
  run = createMissionRun(mission, world);
  lastCollected = 0;
  setThrottle(0);
  document.getElementById('brief-title').textContent = `DAY ${day} — ${mission.title}`;
  document.getElementById('brief-body').textContent = mission.brief;
  document.getElementById('brief-reward').textContent = `Reward: ${mission.reward} KR on completion`;
  showScreen('briefing');
}

function startMission() {
  ensureAudio();
  showScreen('play');
}

function endDay(landed) {
  saveBest();
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
    rankLine.textContent = `Landing Rank ${landing.rank} · Courier ${econ.rank} · Total KR ${econ.kr}`;
    playLand();
  } else if (world.plane.crashed) {
    title.textContent = 'CRASHED';
    body.textContent = 'Pesawat jatuh. Hull hancur — hari ini tidak ada bayaran.';
    rankLine.textContent = `Courier ${econ.rank} · Total KR ${econ.kr}`;
    playCrash();
  } else {
    title.textContent = landed ? 'LANDED' : 'DAY OVER';
    body.textContent = landed
      ? 'Mendarat dengan selamat, tapi misi belum selesai.'
      : 'Misi gagal — bahan bakar habis atau waktu habis.';
    rankLine.textContent = `Courier ${econ.rank} · Total KR ${econ.kr}`;
  }
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
    document.getElementById('title-best').textContent = best.rank || 'PEMULA';
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
document.getElementById('title-best').textContent = best.rank || 'PEMULA';

// Shot staging mode: deterministic scene, a few frames, then report.
if (shotName) {
  const staged = stageShot(shotName, seed);
  world = staged.world;
  view = buildScene(world);
  // Cockpit view comes from the shot staging (play = cockpit in M8).
  setCockpit(!!staged.cockpit);
  document.body.classList.toggle('cockpit', isCockpit());
  // M8-fix, shot 1 only: dock the title card left so the volcano + sea +
  // runway read beside it on the cover image. Normal play is untouched.
  if (shotName === 'start') document.body.classList.add('shot-start');
  // M8-fix, shot 3 only: 2° three-quarter rear chase (breaks the tail's
  // "red cross" read) + a lower camera (pulls the ILS mast up into the
  // frame so it reads as an antenna, not a clipped glitch). Other shots
  // keep the straight chase; shot 4/end is untouched.
  const shotOrbit = shotName === 'landing' ? { yaw: 2, pitch: -80 } : { yaw: 0, pitch: 0 };
  if (shotName === 'end') {
    run = createMissionRun(MISSIONS[0], world);
    run.status = 'complete';
    world.collected = world.rings.length;
    endDay(true);
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
      else updateHud(world, econ, missionText);
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
  world = createWorld({ seed: 1, mission: 'ring' });
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
        else updateHud(world, econ, missionText);
      }
      if (world.plane.landed || world.plane.crashed) endDay(world.plane.landed);
      else if (run && run.status === 'failed') endDay(false);
    }
    document.body.classList.toggle('cockpit', screen === 'play' && isCockpit());
    if (screen === 'pause' || isPaused()) {
      if (screen === 'play' && isPaused()) showScreen('pause');
    } else if (screen === 'pause' && !isPaused()) {
      showScreen('play');
    }
    updateScene(view, world, dt, getOrbit(), isCockpit());
    renderer.render(view.scene, view.camera);
  });
}

Object.assign(window, { __game: { get world() { return world; }, econ, renderer, get view() { return view; } } });
