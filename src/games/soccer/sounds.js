// Stadium sounds synthesised once at load (OfflineAudioContext -> WAV blob URLs), played through the SDK's
// sfx.playFile so the platform mute applies: kicks, referee whistles, crowd bed + goal roar, post ping.
import { sfx } from '../../sdk/audio.js';

const RATE = 22050;

function wavUrl(buf) {
  const data = buf.getChannelData(0);
  const n = data.length;
  const ab = new ArrayBuffer(44 + n * 2);
  const v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  return URL.createObjectURL(new Blob([ab], { type: 'audio/wav' }));
}

async function render(dur, build) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx(1, Math.ceil(RATE * dur), RATE);
  build(ctx);
  return wavUrl(await ctx.startRendering());
}

function noise(ctx, dur, pink = false) {
  const b = ctx.createBuffer(1, Math.ceil(RATE * dur), RATE);
  const d = b.getChannelData(0);
  let l = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    l = pink ? l * 0.96 + w * 0.2 : w;
    d[i] = l;
  }
  const s = ctx.createBufferSource();
  s.buffer = b;
  return s;
}

const kick = (hard) => render(0.3, (ctx) => {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(hard ? 150 : 190, 0);
  o.frequency.exponentialRampToValueAtTime(45, 0.16);
  const g = ctx.createGain();
  g.gain.setValueAtTime(hard ? 1 : 0.7, 0);
  g.gain.exponentialRampToValueAtTime(0.001, 0.22);
  o.connect(g).connect(ctx.destination);
  o.start(0);
  const n = noise(ctx, 0.08);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = hard ? 1400 : 2200; f.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(hard ? 0.7 : 0.4, 0);
  ng.gain.exponentialRampToValueAtTime(0.001, 0.07);
  n.connect(f).connect(ng).connect(ctx.destination);
  n.start(0);
});

const whistle = (len, blasts = 1) => render(len * blasts + 0.3 * (blasts - 1) + 0.1, (ctx) => {
  for (let b = 0; b < blasts; b++) {
    const t0 = b * (len + 0.3);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 2900;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 38;
    const lg = ctx.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.35, t0 + 0.02);
    g.gain.setValueAtTime(0.35, t0 + len - 0.05);
    g.gain.linearRampToValueAtTime(0, t0 + len);
    o.connect(g).connect(ctx.destination);
    o.start(t0); lfo.start(t0); o.stop(t0 + len); lfo.stop(t0 + len);
  }
});

const crowdBed = () => render(6, (ctx) => {
  const n = noise(ctx, 6, true);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.5;
  const g = ctx.createGain();
  g.gain.value = 0.22;
  // slow swells, loop-friendly (whole cycles over 6 s)
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1 / 3;
  const lg = ctx.createGain();
  lg.gain.value = 0.06;
  lfo.connect(lg).connect(g.gain);
  n.connect(f).connect(g).connect(ctx.destination);
  n.start(0); lfo.start(0);
});

const roar = () => render(3.6, (ctx) => {
  const n = noise(ctx, 3.6, true);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.setValueAtTime(500, 0); f.frequency.linearRampToValueAtTime(1100, 0.5); f.frequency.linearRampToValueAtTime(700, 3.4); f.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(1.0, 0.35);
  g.gain.setValueAtTime(0.9, 1.6);
  g.gain.linearRampToValueAtTime(0, 3.6);
  n.connect(f).connect(g).connect(ctx.destination);
  n.start(0);
});

const groan = () => render(1.6, (ctx) => {
  const n = noise(ctx, 1.6, true);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.setValueAtTime(900, 0); f.frequency.linearRampToValueAtTime(350, 1.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.8, 0.2); g.gain.linearRampToValueAtTime(0, 1.6);
  n.connect(f).connect(g).connect(ctx.destination);
  n.start(0);
});

const ping = () => render(0.8, (ctx) => {
  for (const [fr, v] of [[1180, 0.4], [2650, 0.2], [4100, 0.1]]) {
    const o = ctx.createOscillator();
    o.frequency.value = fr;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, 0);
    g.gain.exponentialRampToValueAtTime(0.001, 0.75);
    o.connect(g).connect(ctx.destination);
    o.start(0);
  }
});

export async function createSounds() {
  let urls = {};
  try {
    const [k1, k2, w1, w3, wl, bed, ro, gr, pi] = await Promise.all([kick(false), kick(true), whistle(0.35), whistle(0.28, 3), whistle(0.9), crowdBed(), roar(), groan(), ping()]);
    urls = { k1, k2, w1, w3, wl, bed, ro, gr, pi };
  } catch { /* audio unsupported: stay silent */ }
  let bedH = null;
  let dead = false;
  const play = (u, vol = 1) => { if (u && !dead) sfx.playFile(u, { volume: vol }).catch(() => {}); };
  return {
    kick(hard) { play(hard ? urls.k2 : urls.k1, hard ? 0.9 : 0.6); },
    whistle() { play(urls.w1, 0.5); },
    fullTime() { play(urls.w3, 0.5); },
    longWhistle() { play(urls.wl, 0.5); },
    roar() { play(urls.ro, 0.8); },
    groan() { play(urls.gr, 0.5); },
    post() { play(urls.pi, 0.6); },
    async startCrowd() {
      if (bedH || !urls.bed || dead) return;
      try { bedH = await sfx.playFile(urls.bed, { volume: 0.35, loop: true }); if (dead) bedH?.stop(); } catch { /* not unlocked */ }
    },
    dispose() {
      dead = true;
      bedH?.stop();
      for (const u of Object.values(urls)) if (u) URL.revokeObjectURL(u);
    },
  };
}
