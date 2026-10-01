// Tiny pitched synth for minigames that need notes (sdk/audio.js only has fixed effects).
let ctx = null;
let master = null;
function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Play a note: freq Hz, duration s, type oscillator. */
export function note(freq, { dur = 0.25, type = 'triangle', vol = 0.35, delay = 0, slide = 0 } = {}) {
  try {
    const a = ac();
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch { /* audio unavailable */ }
}

/** Short chord / arpeggio. */
export function arp(freqs, { step = 0.07, ...o } = {}) { freqs.forEach((f, i) => note(f, { ...o, delay: (o.delay || 0) + i * step })); }
