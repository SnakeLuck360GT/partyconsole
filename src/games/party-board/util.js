// Small shared helpers: debug flags, seeded RNG, tween/timer runtime that can be torn down in one go.

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const DEBUG = {
  fast: params.has('pbfast') ? Number(params.get('pbfast')) || 4 : 1, // animation/timer speed multiplier
  turns: Number(params.get('pbturns')) || 0, // skip the admin's turn-count pick
  setup: params.has('pbsetup'), // show the length picker anyway (the pick is then overridden by pbturns)
  seed: params.has('pbseed') ? Number(params.get('pbseed')) : null,
  minigame: params.get('pbmg') || null, // force a minigame id
  board: params.get('pbboard') || null,
};

/** mulberry32 seeded RNG with helpers. */
export function makeRng(seed = (Math.random() * 2 ** 31) | 0) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      const a2 = [...arr];
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
    weighted(items) { // [{w, ...}]
      const total = items.reduce((s, i) => s + i.w, 0);
      let r = next() * total;
      for (const it of items) { r -= it.w; if (r <= 0) return it; }
      return items[items.length - 1];
    },
  };
  return rng;
}

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
  backOut: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  elasticOut: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

/**
 * Runtime: timers + tweens that all die together. `speed` scales everything (debug fast mode).
 * Promises from a dead runtime never resolve, so async game flows simply stop.
 */
export function makeRuntime(speed = 1) {
  const timers = new Set();
  const intervals = new Set();
  const tweens = new Set();
  let dead = false;
  const never = new Promise(() => {});
  const rt = {
    speed,
    get dead() { return dead; },
    wait(ms) {
      if (dead) return never;
      return new Promise((res) => {
        const t = setTimeout(() => { timers.delete(t); if (!dead) res(); }, ms / speed);
        timers.add(t);
      });
    },
    /** Real-time timeout (not scaled) that is cleared on kill. */
    timeout(fn, ms) {
      const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, ms);
      timers.add(t);
      return () => { clearTimeout(t); timers.delete(t); };
    },
    interval(fn, ms) {
      const t = setInterval(() => { if (!dead) fn(); }, ms);
      intervals.add(t);
      return () => { clearInterval(t); intervals.delete(t); };
    },
    /** tween(seconds, t => ..., easeFn) resolves when done. */
    tween(dur, fn, e = ease.inOut) {
      if (dead) return never;
      return new Promise((res) => {
        const tw = { t: 0, dur: Math.max(0.0001, dur), fn, e, res };
        tweens.add(tw);
        fn(e(0));
      });
    },
    update(dt) {
      if (dead) return;
      const sdt = dt * speed;
      for (const tw of tweens) {
        tw.t += sdt;
        const k = Math.min(1, tw.t / tw.dur);
        try { tw.fn(tw.e(k)); } catch (err) { console.error(err); }
        if (k >= 1) { tweens.delete(tw); tw.res(); }
      }
    },
    guard(p) { return Promise.resolve(p).then((v) => (dead ? never : v)); },
    kill() {
      dead = true;
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      timers.clear();
      intervals.clear();
      tweens.clear();
    },
  };
  return rt;
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
