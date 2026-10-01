// Tiny synthwave loop (bass arpeggio, kick, snare, hats) generated with WebAudio. No audio files.
// Respects the platform mute button (sfx.muted). setFilter() sweeps a low-pass for slow-motion moments.
import { sfx } from '../../sdk/audio.js';

const BPM = 108;
// Am - F - C - G (bass roots in Hz)
const ROOTS = [110, 87.31, 130.81, 98];
const ARP = [0, 12, 7, 12, 0, 12, 7, 3]; // semitone offsets per 8th... (16ths played as pairs)

export function createMusic() {
  let ctx = null;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return stub(); }
  const master = ctx.createGain();
  master.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 18000;
  filter.Q.value = 0.7;
  master.connect(filter).connect(ctx.destination);
  let level = 0.11;
  let running = true;
  let step = 0;
  let nextTime = ctx.currentTime + 0.1;
  const stepDur = 60 / BPM / 4; // 16th notes

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  function bass(t, f) {
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.value = f; o2.frequency.value = f * 0.5;
    o2.detune.value = 6;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + stepDur * 0.9);
    lp.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 0.95);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(master);
    o.start(t); o2.start(t); o.stop(t + stepDur); o2.stop(t + stepDur);
  }
  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    g.gain.setValueAtTime(1.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.32);
  }
  function noise(t, dur, vol, type, freq) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  function pad(t, f) {
    // soft chord stab on each bar
    for (const m of [2, 2 * 1.189, 2 * 1.498]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f * m;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 15);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + stepDur * 16);
    }
  }

  let intensity = 1; // 0 = bass only (menus), 1 = full
  function schedule() {
    if (!running) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const target = sfx.muted ? 0 : level;
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
    while (nextTime < ctx.currentTime + 0.2) {
      const bar = Math.floor(step / 16) % 4;
      const s16 = step % 16;
      const root = ROOTS[bar];
      if (s16 % 2 === 0) bass(nextTime, root * Math.pow(2, ARP[(s16 / 2) % 8] / 12));
      if (s16 === 0) pad(nextTime, root);
      if (intensity > 0.5) {
        if (s16 % 4 === 0) kick(nextTime);
        if (s16 === 4 || s16 === 12) noise(nextTime, 0.18, 0.35, 'bandpass', 1800);
        if (s16 % 2 === 1) noise(nextTime, 0.04, 0.12, 'highpass', 7000);
      }
      step++;
      nextTime += stepDur;
    }
  }
  const timer = setInterval(schedule, 50);
  schedule();

  return {
    setIntensity(v) { intensity = v; },
    setLevel(v) { level = v; },
    setFilter(freq, time = 0.3) {
      filter.frequency.setTargetAtTime(freq, ctx.currentTime, time / 3);
    },
    stop() {
      running = false;
      clearInterval(timer);
      try { master.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch { /* noop */ }
      setTimeout(() => ctx.close().catch(() => {}), 300);
    },
  };
}

function stub() {
  return { setIntensity() {}, setLevel() {}, setFilter() {}, stop() {} };
}
