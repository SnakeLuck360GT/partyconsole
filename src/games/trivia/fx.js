// Lightweight visual effects for the Brain Brawl screen: a pooled 2D-canvas confetti system and a number tween.

const COLORS = ['#ffd23f', '#ff4fa3', '#4f7bff', '#1fb96b', '#ffffff', '#ff8a3d', '#22d3ee', '#a855f7'];
const MAX = 420;

export function createConfetti(canvas) {
  const g = canvas.getContext('2d');
  const parts = [];
  let raf = 0;
  let last = 0;
  let w = 0;
  let h = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const s = h / 1080;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      p.vy += 900 * s * dt;
      p.vx *= 1 - 1.4 * dt;
      p.vy *= 1 - 0.9 * dt;
      p.x += p.vx * dt + Math.sin(p.life * p.wob) * 30 * s * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.life <= 0 || p.y > h + 40) { parts.splice(i, 1); continue; }
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.scale(1, Math.cos(p.life * p.flip));
      g.globalAlpha = Math.min(1, p.life * 2);
      g.fillStyle = p.c;
      if (p.round) { g.beginPath(); g.arc(0, 0, p.sz * 0.45, 0, Math.PI * 2); g.fill(); } else g.fillRect(-p.sz / 2, -p.sz / 4, p.sz, p.sz / 2);
      g.restore();
    }
    if (parts.length) raf = requestAnimationFrame(frame);
    else { raf = 0; last = 0; g.clearRect(0, 0, w, h); }
  }

  function add(x, y, vx, vy, colors, s) {
    if (parts.length >= MAX) parts.shift();
    parts.push({
      x, y, vx, vy, c: colors[(Math.random() * colors.length) | 0], sz: (10 + Math.random() * 12) * s,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, life: 2.2 + Math.random() * 1.6,
      wob: 2 + Math.random() * 4, flip: 3 + Math.random() * 8, round: Math.random() < 0.25,
    });
  }

  function start() { if (!raf) raf = requestAnimationFrame(frame); }

  return {
    resize,
    /** Burst from a point in container pixels. */
    burst(x, y, { count = 120, power = 1, colors = COLORS } = {}) {
      if (!w) resize();
      const s = h / 1080;
      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const v = (500 + Math.random() * 900) * power * s;
        add(x, y, Math.cos(a) * v, Math.sin(a) * v, colors, s);
      }
      start();
    },
    /** Confetti falling from the top across the screen. */
    rain(count = 200, colors = COLORS) {
      if (!w) resize();
      const s = h / 1080;
      for (let i = 0; i < count; i++) add(Math.random() * w, -20 - Math.random() * h * 0.5, (Math.random() - 0.5) * 300 * s, Math.random() * 200 * s, colors, s);
      start();
    },
    clear() { parts.length = 0; },
    destroy() { cancelAnimationFrame(raf); parts.length = 0; },
  };
}

/** Tween a number in an element's textContent. Returns a cancel fn. */
export function countUp(el, from, to, ms, fmt = (n) => n.toLocaleString('en-US')) {
  const t0 = performance.now();
  let raf = 0;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - (1 - k) ** 3;
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) raf = requestAnimationFrame(step);
  };
  el.textContent = fmt(from);
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
