// Small shared helpers: cancellable async flow, DOM, fonts, style injection.

export const TIMEOUT = Symbol('timeout');

/** Owns every timer of a game flow. After destroy() pending sleeps/gates never resolve, so flows just stop. */
export class Runner {
  constructor() {
    this.dead = false;
    this.timers = new Set();
    this.intervals = new Set();
  }

  sleep(ms) {
    return new Promise((res) => {
      if (this.dead) return;
      const t = setTimeout(() => { this.timers.delete(t); if (!this.dead) res(); }, ms);
      this.timers.add(t);
    });
  }

  /** A one-shot promise opened by gate.open(value) or by timeout (resolves TIMEOUT). ms=null → no timeout. */
  gate(ms = null) {
    let resolveFn;
    let done = false;
    let t = null;
    const promise = new Promise((res) => { resolveFn = res; });
    const g = {
      promise,
      get done() { return done; },
      open: (v) => {
        if (done) return;
        done = true;
        if (t) { clearTimeout(t); this.timers.delete(t); }
        if (!this.dead) resolveFn(v);
      },
    };
    if (ms != null) {
      t = setTimeout(() => { this.timers.delete(t); g.open(TIMEOUT); }, ms);
      this.timers.add(t);
    }
    return g;
  }

  every(ms, fn) {
    const i = setInterval(() => { if (!this.dead) fn(); }, ms);
    this.intervals.add(i);
    return () => { clearInterval(i); this.intervals.delete(i); };
  }

  after(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); if (!this.dead) fn(); }, ms);
    this.timers.add(t);
    return () => { clearTimeout(t); this.timers.delete(t); };
  }

  destroy() {
    this.dead = true;
    this.timers.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.timers.clear();
    this.intervals.clear();
  }
}

export function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Gochi+Hand&family=Patrick+Hand&display=swap';

/** Inject the doodle fonts + a stylesheet; returns a cleanup function. Waits (bounded) for fonts to load. */
export async function installStyle(css, waitMs = 2500) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_URL;
  document.head.appendChild(link);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  try {
    await Promise.race([
      Promise.all([document.fonts.load('40px "Gochi Hand"'), document.fonts.load('20px "Patrick Hand"')]),
      new Promise((r) => setTimeout(r, waitMs)),
    ]);
  } catch { /* offline: fallback fonts */ }
  return () => { link.remove(); style.remove(); };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Fit a box of aspect (w/h) inside a parent's content box. */
export function fitBox(box, parent, aspect, pad = 0) {
  const r = parent.getBoundingClientRect();
  const aw = Math.max(10, r.width - pad * 2);
  const ah = Math.max(10, r.height - pad * 2);
  let w = aw;
  let h = w / aspect;
  if (h > ah) { h = ah; w = h * aspect; }
  box.style.width = `${Math.floor(w)}px`;
  box.style.height = `${Math.floor(h)}px`;
}
