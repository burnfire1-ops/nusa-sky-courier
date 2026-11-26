// Audio — synthesized WebAudio only, no external files. (Skill: audio-design —
// one bus, engine hum tied to throttle, short stingers for events.)
let ctx = null;
let engineOsc = null;
let engineGain = null;
let windSrc = null;
let windGain = null;
let windFilter = null;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    // Wind: looped noise through a bandpass.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 600;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSrc.start();
    return true;
  } catch {
    return false;
  }
}

export function updateAudio(plane) {
  if (!ctx || !engineGain) return;
  const t = ctx.currentTime;
  engineGain.gain.setTargetAtTime(plane.airborne ? 0.02 + plane.throttle * 0.05 : 0.015, t, 0.1);
  engineOsc.frequency.setTargetAtTime(50 + plane.throttle * 70 + plane.speed * 0.2, t, 0.1);
  windGain.gain.setTargetAtTime(Math.min(0.06, plane.speed * 0.0004), t, 0.2);
}

function blip(freq, at, dur, vol) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

export function playRing() {
  if (!ctx) return;
  const t = ctx.currentTime;
  blip(880, t, 0.18, 0.16);
  blip(1318, t + 0.09, 0.25, 0.14);
}

export function playLand() {
  if (!ctx) return;
  const t = ctx.currentTime;
  blip(220, t, 0.3, 0.2);
  blip(330, t + 0.12, 0.35, 0.16);
}

export function playCrash() {
  if (!ctx) return;
  const t = ctx.currentTime;
  blip(110, t, 0.5, 0.22);
  blip(82, t + 0.1, 0.6, 0.2);
}
