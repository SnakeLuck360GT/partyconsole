// Tiny synthesized sound effects (no audio files needed) + optional file playback.
// Usage (screen side): import { sfx } from '../../sdk/audio.js'; sfx.play('coin');

let ctx = null;
let master = null;
let muted = false;
const buffers = new Map();

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() { ac(); }

function tone({ type = 'square', from = 440, to = from, dur = 0.12, vol = 0.3, delay = 0 }) {
  const a = ac();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.4, filter = 1200, delay = 0 }) {
  const a = ac();
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filter;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const LIB = {
  click: () => tone({ type: 'triangle', from: 900, to: 700, dur: 0.05, vol: 0.2 }),
  blip: () => tone({ type: 'square', from: 660, to: 880, dur: 0.08, vol: 0.15 }),
  coin: () => { tone({ type: 'square', from: 988, dur: 0.07, vol: 0.15 }); tone({ type: 'square', from: 1319, dur: 0.18, vol: 0.15, delay: 0.07 }); },
  jump: () => tone({ type: 'square', from: 300, to: 700, dur: 0.15, vol: 0.15 }),
  hit: () => { noise({ dur: 0.12, vol: 0.4, filter: 2500 }); tone({ type: 'sawtooth', from: 200, to: 60, dur: 0.12, vol: 0.2 }); },
  explosion: () => { noise({ dur: 0.7, vol: 0.6, filter: 900 }); tone({ type: 'sine', from: 120, to: 30, dur: 0.6, vol: 0.4 }); },
  shoot: () => tone({ type: 'sawtooth', from: 900, to: 150, dur: 0.12, vol: 0.12 }),
  powerup: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.1, vol: 0.18, delay: i * 0.07 })),
  countdown: () => tone({ type: 'sine', from: 660, dur: 0.18, vol: 0.3 }),
  go: () => tone({ type: 'sine', from: 1320, dur: 0.4, vol: 0.3 }),
  win: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.16, vol: 0.2, delay: i * 0.12 })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.22, vol: 0.2, delay: i * 0.18 })),
  correct: () => { tone({ type: 'sine', from: 880, dur: 0.1, vol: 0.25 }); tone({ type: 'sine', from: 1320, dur: 0.2, vol: 0.25, delay: 0.1 }); },
  wrong: () => tone({ type: 'sawtooth', from: 180, to: 120, dur: 0.35, vol: 0.2 }),
  join: () => { tone({ type: 'sine', from: 600, dur: 0.08, vol: 0.2 }); tone({ type: 'sine', from: 900, dur: 0.12, vol: 0.2, delay: 0.08 }); },
  whoosh: () => noise({ dur: 0.25, vol: 0.25, filter: 3000 }),
  tick: () => tone({ type: 'square', from: 1500, dur: 0.02, vol: 0.08 }),
};

export const sfx = {
  play(name) {
    if (muted) return;
    try { LIB[name]?.(); } catch { /* audio not unlocked yet */ }
  },
  // Play an audio file (e.g. an asset URL). Decoded buffers are cached.
  async playFile(url, { volume = 1, loop = false } = {}) {
    if (muted) return null;
    const a = ac();
    let buf = buffers.get(url);
    if (!buf) {
      const res = await fetch(url);
      buf = await a.decodeAudioData(await res.arrayBuffer());
      buffers.set(url, buf);
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const g = a.createGain();
    g.gain.value = volume;
    src.connect(g).connect(master);
    src.start();
    return { stop: () => { try { src.stop(); } catch { /* already stopped */ } } };
  },
  // Continuous engine-like hum; returns {set(pitch 0..1), stop()}.
  engine() {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 60;
    g.gain.value = muted ? 0 : 0.04;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    o.connect(f).connect(g).connect(master);
    o.start();
    return {
      set(p) { o.frequency.setTargetAtTime(50 + p * 160, a.currentTime, 0.05); },
      stop() { try { o.stop(); } catch { /* noop */ } },
    };
  },
  setMuted(m) { muted = m; },
  get muted() { return muted; },
};
