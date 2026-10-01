// Extra comedic sound effects synthesised once at load (OfflineAudioContext -> WAV blob URL),
// played through the SDK's sfx.playFile so the platform mute button still applies.
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

function noiseBuf(ctx, dur) {
  const b = ctx.createBuffer(1, Math.ceil(RATE * dur), RATE);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// Cartoon "waaaaah" falling scream: buzzy voice through vowel formants with vibrato, pitch sliding down.
function scream(pitch) {
  return render(1.5, (ctx) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch, 0);
    o.frequency.linearRampToValueAtTime(pitch * 1.15, 0.12);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.35, 1.45);
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vg = ctx.createGain();
    vg.gain.value = pitch * 0.05;
    vib.connect(vg).connect(o.frequency);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, 0);
    out.gain.linearRampToValueAtTime(0.5, 0.05);
    out.gain.setValueAtTime(0.5, 1.0);
    out.gain.linearRampToValueAtTime(0, 1.45);
    for (const [f, q, g] of [[850, 6, 1], [1250, 8, 0.6], [2600, 10, 0.25]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g;
      o.connect(bp).connect(gg).connect(out);
    }
    out.connect(ctx.destination);
    o.start(0); vib.start(0);
  });
}

function splash() {
  return render(1.0, (ctx) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, 0);
    lp.frequency.exponentialRampToValueAtTime(300, 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, 0);
    g.gain.exponentialRampToValueAtTime(0.001, 0.95);
    src.connect(lp).connect(g).connect(ctx.destination);
    src.start(0);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, 0);
    o.frequency.exponentialRampToValueAtTime(50, 0.3);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6, 0);
    og.gain.exponentialRampToValueAtTime(0.001, 0.35);
    o.connect(og).connect(ctx.destination);
    o.start(0);
  });
}

function boing() {
  return render(0.5, (ctx) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(140, 0);
    o.frequency.exponentialRampToValueAtTime(520, 0.12);
    o.frequency.exponentialRampToValueAtTime(260, 0.45);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lg = ctx.createGain();
    lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, 0);
    g.gain.exponentialRampToValueAtTime(0.001, 0.48);
    o.connect(g).connect(ctx.destination);
    o.start(0); lfo.start(0);
  });
}

function thud() {
  return render(0.5, (ctx) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, 0);
    o.frequency.exponentialRampToValueAtTime(35, 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(1, 0);
    g.gain.exponentialRampToValueAtTime(0.001, 0.45);
    o.connect(g).connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.7, 0);
    ng.gain.exponentialRampToValueAtTime(0.001, 0.28);
    src.connect(lp).connect(ng).connect(ctx.destination);
    o.start(0); src.start(0);
  });
}

function smack() {
  return render(0.25, (ctx) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 0.25);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.2, 0);
    g.gain.exponentialRampToValueAtTime(0.001, 0.18);
    src.connect(bp).connect(g).connect(ctx.destination);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(320, 0);
    o.frequency.exponentialRampToValueAtTime(80, 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.35, 0);
    og.gain.exponentialRampToValueAtTime(0.001, 0.14);
    o.connect(og).connect(ctx.destination);
    src.start(0); o.start(0);
  });
}

export async function createSounds() {
  const urls = {};
  try {
    const [s1, s2, s3, sp, bo, th, sm] = await Promise.all([scream(520), scream(700), scream(380), splash(), boing(), thud(), smack()]);
    Object.assign(urls, { screams: [s1, s2, s3].filter(Boolean), splash: sp, boing: bo, thud: th, smack: sm });
  } catch { /* audio unsupported: fall back to sfx presets */ }
  let lastScream = 0;
  const play = (url, vol, fallback) => {
    if (url) sfx.playFile(url, { volume: vol }).catch(() => {});
    else if (fallback) sfx.play(fallback);
  };
  return {
    scream() {
      const now = performance.now();
      if (now - lastScream < 250) return;
      lastScream = now;
      const list = urls.screams || [];
      play(list[Math.floor(Math.random() * list.length)], 0.7, 'lose');
    },
    splash: () => play(urls.splash, 0.8, 'explosion'),
    boing: () => play(urls.boing, 0.6, 'jump'),
    thud: () => play(urls.thud, 0.9, 'explosion'),
    smack: () => play(urls.smack, 0.8, 'hit'),
    dispose() {
      for (const u of [...(urls.screams || []), urls.splash, urls.boing, urls.thud, urls.smack]) if (u) URL.revokeObjectURL(u);
    },
  };
}
