// Visual juice for the TV: paper texture, animated background scribbles, confetti, floating reactions.
import { el } from './util.js';

let paperUrl = null;
/** A subtle fibrous paper texture as a data URL (generated once). */
export function paperTexture() {
  if (paperUrl) return paperUrl;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 60;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 0.95;
    img.data[i + 3] = 22;
  }
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.06;
  g.strokeStyle = '#6b5a3a';
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const a = rnd() * Math.PI;
    const l = 4 + rnd() * 14;
    g.lineWidth = 0.5 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rnd() * 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  paperUrl = c.toDataURL('image/png');
  return paperUrl;
}

// Hand-drawn doodle shapes (viewBox 0 0 100 100).
export const DOODLES = {
  star: 'M50 8 L61 38 L93 39 L67 58 L77 90 L50 71 L23 90 L33 58 L7 39 L39 38 Z',
  heart: 'M50 86 C20 64 8 48 12 30 C16 14 38 10 50 30 C62 10 84 14 88 30 C92 48 80 64 50 86 Z',
  spiral: 'M50 50 C52 46 58 48 57 54 C56 62 44 62 42 53 C39 42 54 34 64 42 C75 51 68 70 52 71 C34 72 26 54 32 40 C39 24 64 20 76 34',
  bolt: 'M58 6 L28 54 L50 54 L40 94 L74 40 L52 40 Z',
  cloud: 'M26 70 C10 70 10 48 26 48 C24 30 46 24 54 38 C60 26 82 30 80 48 C94 48 94 70 78 70 Z',
  smile: 'M50 10 C74 10 90 28 90 50 C90 74 72 90 50 90 C26 90 10 72 10 50 C10 28 28 10 50 10 M34 38 L34 44 M66 38 L66 44 M30 60 C40 74 60 74 70 60',
  squiggle: 'M6 50 C16 30 26 30 30 50 C34 70 44 70 50 50 C56 30 66 30 70 50 C74 70 84 70 94 50',
  arrow: 'M10 70 C30 40 56 34 84 36 M70 22 L86 36 L72 50',
  sun: 'M50 34 C60 34 66 42 66 50 C66 60 58 66 50 66 C40 66 34 58 34 50 C34 42 42 34 50 34 M50 8 L50 22 M50 78 L50 92 M8 50 L22 50 M78 50 L92 50 M20 20 L30 30 M70 70 L80 80 M80 20 L70 30 M30 70 L20 80',
  pencil: 'M20 80 L28 60 L70 18 L82 30 L40 72 Z M28 60 L40 72 M20 80 L32 76',
  flower: 'M50 50 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M50 44 C40 24 60 24 50 44 M56 50 C76 40 76 60 56 50 M50 56 C60 76 40 76 50 56 M44 50 C24 60 24 40 44 50 M50 62 L50 94',
  swirl: 'M20 60 C20 30 60 20 70 44 C78 64 54 74 46 60 C40 50 54 42 58 52',
};
const DOODLE_COLORS = ['#ff9f1c', '#ef3e36', '#2f5bea', '#1b9e4b', '#a24df0', '#3ec6ff', '#ff5ca8'];

export function doodleSvg(name, color = '#1f1d2b', width = 5, cls = '') {
  return `<svg class="dd-doodle ${cls}" viewBox="0 0 100 100" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"><path pathLength="1" d="${DOODLES[name] || DOODLES.star}"/></svg>`;
}

/** Background scribbles that draw themselves around the edges of the screen, then fade and re-draw elsewhere. */
export class Scribbles {
  constructor(parent, count = 9) {
    this.layer = el('div', 'dd-scribbles', parent);
    this.items = [];
    this.names = Object.keys(DOODLES);
    for (let i = 0; i < count; i++) this.items.push(this._spawn(el('div', 'dd-scribble', this.layer), i * 0.35));
    this.timer = setInterval(() => {
      const it = this.items[Math.floor(Math.random() * this.items.length)];
      it.classList.add('out');
      setTimeout(() => this._spawn(it, 0), 900);
    }, 3200);
  }

  _spawn(node, delay) {
    // keep scribbles in a border band so they never sit behind the main content
    const edge = Math.floor(Math.random() * 4);
    const along = 4 + Math.random() * 88;
    const across = 0.5 + Math.random() * 5;
    const [x, y] = edge === 0 ? [along, across] : edge === 1 ? [along, 92 - across] : edge === 2 ? [across, along] : [95 - across, along];
    const size = 3.5 + Math.random() * 3;
    const name = this.names[Math.floor(Math.random() * this.names.length)];
    const color = DOODLE_COLORS[Math.floor(Math.random() * DOODLE_COLORS.length)];
    node.className = 'dd-scribble';
    node.style.cssText = `left:${x}vw;top:${y}vh;width:${size}vw;height:${size}vw;--rot:${(Math.random() * 40 - 20).toFixed(0)}deg;animation-delay:${delay}s`;
    node.innerHTML = doodleSvg(name, color, 4.5);
    return node;
  }

  destroy() {
    clearInterval(this.timer);
    this.layer.remove();
  }
}

/** Canvas confetti with paper strips + tiny squiggles. Only animates while particles are alive. */
export class Confetti {
  constructor(parent) {
    this.canvas = el('canvas', 'dd-confetti', parent);
    this.g = this.canvas.getContext('2d');
    this.parts = [];
    this.raf = 0;
    this.colors = ['#ef3e36', '#ff9f1c', '#ffd23f', '#5fd35b', '#3ec6ff', '#2f5bea', '#a24df0', '#ff5ca8'];
    this.resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = this.canvas.clientWidth * dpr;
      this.canvas.height = this.canvas.clientHeight * dpr;
      this.dpr = dpr;
    };
    this.resize();
    window.addEventListener('resize', this.resize);
    this.loop = this.loop.bind(this);
  }

  /** Burst from a point in CSS px (relative to the viewport). */
  burst(x, y, n = 60, power = 1) {
    for (let i = 0; i < n && this.parts.length < 500; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const v = (6 + Math.random() * 9) * power;
      this.parts.push(this._part(x, y, Math.cos(a) * v, Math.sin(a) * v));
    }
    this._kick();
  }

  rain(n = 140) {
    const w = this.canvas.clientWidth;
    for (let i = 0; i < n && this.parts.length < 500; i++) {
      this.parts.push(this._part(Math.random() * w, -20 - Math.random() * 300, (Math.random() - 0.5) * 3, 2 + Math.random() * 3));
    }
    this._kick();
  }

  _part(x, y, vx, vy) {
    return {
      x, y, vx, vy,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.35,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      c: this.colors[Math.floor(Math.random() * this.colors.length)],
      squig: Math.random() < 0.2,
      life: 0,
    };
  }

  _kick() {
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); }
  }

  loop(now) {
    const dt = Math.min(3, (now - this.last) / 16.67);
    this.last = now;
    const g = this.g;
    const d = this.dpr;
    const H = this.canvas.clientHeight;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.parts = this.parts.filter((p) => p.y < H + 40 && p.life < 600);
    for (const p of this.parts) {
      p.life += dt;
      p.vy += 0.28 * dt;
      p.vx *= 0.985;
      p.vy = Math.min(p.vy, 7);
      p.x += p.vx * dt + Math.sin((p.life + p.rot * 10) * 0.08) * 0.6;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      g.setTransform(d, 0, 0, d, p.x * d, p.y * d);
      g.rotate(p.rot);
      if (p.squig) {
        g.strokeStyle = p.c;
        g.lineWidth = 2.5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-8, 0);
        g.bezierCurveTo(-4, -6, 0, 6, 4, 0);
        g.bezierCurveTo(6, -3, 8, 2, 9, 0);
        g.stroke();
      } else {
        g.fillStyle = p.c;
        g.scale(1, Math.cos(p.life * 0.15 + p.rot));
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
    }
    if (this.parts.length) this.raf = requestAnimationFrame(this.loop);
    else { this.raf = 0; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }
}

/** Emoji floating up from a point inside `parent` (coordinates relative to parent, px). */
export function floatEmoji(parent, emoji, x, y, label = '') {
  const f = el('div', 'dd-float', parent);
  f.innerHTML = `<span>${emoji}</span>${label ? `<small>${label}</small>` : ''}`;
  f.style.left = `${x}px`;
  f.style.top = `${y}px`;
  f.style.setProperty('--dx', `${(Math.random() - 0.5) * 80}px`);
  setTimeout(() => f.remove(), 2600);
}
