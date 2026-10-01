// Shared drawing engine (phone + TV). Every drawing lives on a fixed virtual raster of W×H units, so any
// screen size maps to the same normalised space (x/W, y/H in 0..1) and fills/undo replay identically everywhere.
//
// Op list (history):   { k:'s', c, w, p:[x0,y0,x1,y1,…] }   stroke (c = palette index or ERASER, w = size index)
//                      { k:'f', c, x, y }                   flood fill
//                      { k:'x' }                            clear page
// Live actions (network, phone → TV, batched every ~50 ms):
//   ['b', c, w, x, y]  begin stroke · ['p', x, y, x, y, …] add points · ['e'] end stroke
//   ['f', c, x, y] fill · ['u'] undo · ['x'] clear

export const W = 1000;
export const H = 1250;
export const ASPECT = W / H; // 0.8 (portrait 4:5)
export const PAPER = '#ffffff';
export const ERASER = -1;

export const PALETTE = [
  '#1f1d2b', // ink
  '#8a8794', // pencil grey
  '#ffffff', // white
  '#8d5a3b', // brown
  '#ef3e36', // red
  '#ff9f1c', // orange
  '#ffd23f', // yellow
  '#5fd35b', // green
  '#1b9e4b', // forest
  '#3ec6ff', // sky
  '#2f5bea', // blue
  '#a24df0', // purple
];
export const PALETTE_NAMES = ['black', 'grey', 'white', 'brown', 'red', 'orange', 'yellow', 'green', 'forest', 'sky', 'blue', 'purple'];
export const SIZES = [7, 18, 44];
export const MAX_POINTS = 16000; // per drawing, keeps packed data comfortably small

const clampX = (v) => Math.max(0, Math.min(W, Math.round(v)));
const clampY = (v) => Math.max(0, Math.min(H, Math.round(v)));

export class Surface {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.g = canvas.getContext('2d');
    this.g.lineCap = 'round';
    this.g.lineJoin = 'round';
    this.ops = [];
    this.live = null;
    this.points = 0;
    this.onChange = null;
    this.wipe();
  }

  wipe() {
    this.g.fillStyle = PAPER;
    this.g.fillRect(0, 0, W, H);
  }

  _style(c, w) {
    const g = this.g;
    const color = c === ERASER ? PAPER : (PALETTE[c] ?? PALETTE[0]);
    const width = (SIZES[w] ?? SIZES[1]) * (c === ERASER ? 1.7 : 1);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = width;
    return width;
  }

  // --- stroke segments (identical sequence for live drawing and full replay → pixel-identical result)
  _dot(s) {
    const r = this._style(s.c, s.w) / 2;
    const g = this.g;
    g.beginPath();
    g.arc(s.p[0], s.p[1], r, 0, Math.PI * 2);
    g.fill();
  }

  _seg(s, n) {
    // n = number of points now in the stroke (>=2); draws the piece that became final with point n-1
    const p = s.p;
    const g = this.g;
    this._style(s.c, s.w);
    g.beginPath();
    if (n === 2) {
      g.moveTo(p[0], p[1]);
      g.lineTo((p[0] + p[2]) / 2, (p[1] + p[3]) / 2);
    } else {
      const i = (n - 3) * 2;
      g.moveTo((p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
      g.quadraticCurveTo(p[i + 2], p[i + 3], (p[i + 2] + p[i + 4]) / 2, (p[i + 3] + p[i + 5]) / 2);
    }
    g.stroke();
  }

  _tail(s) {
    const p = s.p;
    const n = p.length / 2;
    if (n < 2) return;
    const g = this.g;
    this._style(s.c, s.w);
    const i = (n - 2) * 2;
    g.beginPath();
    g.moveTo((p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
    g.lineTo(p[i + 2], p[i + 3]);
    g.stroke();
  }

  _drawStroke(s) {
    this._dot(s);
    const n = s.p.length / 2;
    for (let k = 2; k <= n; k++) this._seg(s, k);
    this._tail(s);
  }

  // --- live API
  begin(c, w, x, y) {
    if (this.live) this.end();
    this.live = { k: 's', c: c | 0, w: w | 0, p: [clampX(x), clampY(y)] };
    this.points++;
    this._dot(this.live);
  }

  add(x, y) {
    const s = this.live;
    if (!s) return false;
    x = clampX(x);
    y = clampY(y);
    const n0 = s.p.length;
    if (s.p[n0 - 2] === x && s.p[n0 - 1] === y) return false;
    s.p.push(x, y);
    this.points++;
    this._seg(s, s.p.length / 2);
    return true;
  }

  end() {
    const s = this.live;
    if (!s) return;
    this.live = null;
    this._tail(s);
    this.ops.push(s);
    this.onChange?.();
  }

  fill(c, x, y) {
    if (this.live) this.end();
    const op = { k: 'f', c: c | 0, x: clampX(x), y: clampY(y) };
    this.ops.push(op);
    this._flood(op);
    this.onChange?.();
  }

  clear() {
    if (this.live) this.end();
    if (!this.ops.length || this.ops[this.ops.length - 1].k === 'x') return;
    this.ops.push({ k: 'x' });
    this.wipe();
    this.onChange?.();
  }

  undo() {
    if (this.live) { this.live = null; this.redraw(); return; }
    if (!this.ops.length) return;
    this.ops.pop();
    this.redraw();
    this.onChange?.();
  }

  load(ops) {
    this.live = null;
    this.ops = ops.slice();
    this.redraw();
  }

  reset() {
    this.live = null;
    this.ops = [];
    this.points = 0;
    this.wipe();
  }

  redraw() {
    // Start after the last clear (everything before it is invisible anyway).
    let from = 0;
    for (let i = this.ops.length - 1; i >= 0; i--) if (this.ops[i].k === 'x') { from = i + 1; break; }
    this.wipe();
    let pts = 0;
    for (let i = 0; i < this.ops.length; i++) if (this.ops[i].k === 's') pts += this.ops[i].p.length / 2;
    this.points = pts;
    for (let i = from; i < this.ops.length; i++) this.drawOp(this.ops[i]);
  }

  drawOp(op) {
    if (op.k === 's') this._drawStroke(op);
    else if (op.k === 'f') this._flood(op);
    else if (op.k === 'x') this.wipe();
  }

  isBlank() {
    let from = 0;
    for (let i = this.ops.length - 1; i >= 0; i--) if (this.ops[i].k === 'x') { from = i + 1; break; }
    return from >= this.ops.length;
  }

  // Scanline flood fill with colour tolerance, then a 1px dilation so anti-aliased edges don't leave halos.
  _flood(op) {
    const g = this.g;
    const x0 = Math.min(W - 1, op.x);
    const y0 = Math.min(H - 1, op.y);
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    const hex = op.c === ERASER ? PAPER : (PALETTE[op.c] ?? PALETTE[0]);
    const fr = parseInt(hex.slice(1, 3), 16);
    const fg = parseInt(hex.slice(3, 5), 16);
    const fb = parseInt(hex.slice(5, 7), 16);
    const si = (y0 * W + x0) * 4;
    const tr = d[si];
    const tg = d[si + 1];
    const tb = d[si + 2];
    if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) < 12) return;
    const TOL = 110;
    const mask = new Uint8Array(W * H);
    const match = (i) => {
      const j = i * 4;
      return Math.abs(d[j] - tr) + Math.abs(d[j + 1] - tg) + Math.abs(d[j + 2] - tb) <= TOL;
    };
    const stack = [x0, y0];
    while (stack.length) {
      const y = stack.pop();
      let x = stack.pop();
      let i = y * W + x;
      while (x >= 0 && !mask[i] && match(i)) { x--; i--; }
      x++; i++;
      let up = false;
      let down = false;
      while (x < W && !mask[i] && match(i)) {
        mask[i] = 1;
        if (y > 0) {
          const u = i - W;
          if (!mask[u] && match(u)) { if (!up) { stack.push(x, y - 1); up = true; } } else up = false;
        }
        if (y < H - 1) {
          const dn = i + W;
          if (!mask[dn] && match(dn)) { if (!down) { stack.push(x, y + 1); down = true; } } else down = false;
        }
        x++; i++;
      }
    }
    // paint + dilate by one pixel
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        if (mask[i] === 1 || (mask[i] === 0 && ((x > 0 && mask[i - 1] === 1) || (x < W - 1 && mask[i + 1] === 1) || (y > 0 && mask[i - W] === 1) || (y < H - 1 && mask[i + W] === 1)))) {
          const j = i * 4;
          d[j] = fr; d[j + 1] = fg; d[j + 2] = fb; d[j + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
  }
}

// ------------------------------------------------------------------ live action application

/** Apply one live action to a surface immediately. */
export function applyAction(surface, a) {
  switch (a[0]) {
    case 'b': surface.begin(a[1], a[2], a[3], a[4]); break;
    case 'p': for (let i = 1; i + 1 < a.length; i += 2) surface.add(a[i], a[i + 1]); break;
    case 'e': surface.end(); break;
    case 'f': surface.fill(a[1], a[2], a[3]); break;
    case 'u': surface.undo(); break;
    case 'x': surface.clear(); break;
    default:
  }
}

/**
 * TV-side smoother: batches arrive every ~50 ms; instead of dumping each batch at once we spread its points over
 * the interval until the next batch, so strokes grow fluidly like real pen motion.
 */
export class LivePlayer {
  constructor(surface) {
    this.surface = surface;
    this.queue = []; // { t, a }
    this.lastArrival = 0;
  }

  push(actions) {
    const now = performance.now();
    const gap = this.lastArrival ? Math.min(90, Math.max(30, now - this.lastArrival)) : 50;
    this.lastArrival = now;
    // explode point runs into single-point items for smooth pacing
    const items = [];
    for (const a of actions) {
      if (!Array.isArray(a)) continue;
      if (a[0] === 'p') for (let i = 1; i + 1 < a.length; i += 2) items.push(['p', a[i], a[i + 1]]);
      else items.push(a);
    }
    if (!items.length) return;
    // if we're lagging behind (>250 ms queued) catch up instantly
    if (this.queue.length && this.queue[this.queue.length - 1].t - now > 250) this.flush();
    const start = Math.max(now, this.queue.length ? this.queue[this.queue.length - 1].t : now);
    items.forEach((a, i) => this.queue.push({ t: start + (gap * (i + 1)) / items.length, a }));
  }

  step(now = performance.now()) {
    let n = 0;
    while (this.queue.length && this.queue[0].t <= now) {
      applyAction(this.surface, this.queue.shift().a);
      n++;
    }
    return n;
  }

  flush() {
    while (this.queue.length) applyAction(this.surface, this.queue.shift().a);
  }

  reset() {
    this.queue = [];
    this.lastArrival = 0;
  }
}

/** Animated replay of a finished op list (Telephone playback). Call step() every frame; done when it returns true. */
export class Replayer {
  constructor(surface, ops, durationMs = 3500) {
    this.surface = surface;
    this.items = [];
    for (const op of ops) {
      if (op.k === 's') {
        this.items.push(['b', op.c, op.w, op.p[0], op.p[1]]);
        for (let i = 2; i + 1 < op.p.length; i += 2) this.items.push(['p', op.p[i], op.p[i + 1]]);
        this.items.push(['e']);
      } else if (op.k === 'f') this.items.push(['f', op.c, op.x, op.y]);
      else if (op.k === 'x') this.items.push(['x']);
    }
    this.i = 0;
    this.t0 = performance.now();
    this.dur = Math.max(600, Math.min(durationMs, this.items.length * 12));
    surface.reset();
  }

  step(now = performance.now()) {
    const target = Math.min(this.items.length, Math.ceil(((now - this.t0) / this.dur) * this.items.length));
    while (this.i < target) applyAction(this.surface, this.items[this.i++]);
    return this.i >= this.items.length;
  }

  finish() { this.step(Infinity); }

  get done() { return this.i >= this.items.length; }
}

// ------------------------------------------------------------------ compact wire format

/** ops → compact arrays with delta-encoded points: ['s', c, w, x0, y0, dx1, dy1, …] | ['f', c, x, y] | ['x'] */
export function packOps(ops) {
  return ops.map((op) => {
    if (op.k === 's') {
      const out = ['s', op.c, op.w, op.p[0], op.p[1]];
      for (let i = 2; i + 1 < op.p.length; i += 2) out.push(op.p[i] - op.p[i - 2], op.p[i + 1] - op.p[i - 1]);
      return out;
    }
    if (op.k === 'f') return ['f', op.c, op.x, op.y];
    return ['x'];
  });
}

/** Inverse of packOps, with validation (data may come from any phone). */
export function unpackOps(packed, maxPoints = MAX_POINTS) {
  const ops = [];
  if (!Array.isArray(packed)) return ops;
  let budget = maxPoints;
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const col = (c) => (c === ERASER ? ERASER : Math.max(0, Math.min(PALETTE.length - 1, num(c) | 0)));
  for (const a of packed) {
    if (!Array.isArray(a)) continue;
    if (a[0] === 's' && a.length >= 5 && budget > 0) {
      let x = clampX(num(a[3]));
      let y = clampY(num(a[4]));
      const p = [x, y];
      for (let i = 5; i + 1 < a.length && budget > 0; i += 2) {
        x = clampX(x + num(a[i]));
        y = clampY(y + num(a[i + 1]));
        p.push(x, y);
        budget--;
      }
      ops.push({ k: 's', c: col(a[1]), w: Math.max(0, Math.min(SIZES.length - 1, num(a[2]) | 0)), p });
    } else if (a[0] === 'f') {
      ops.push({ k: 'f', c: col(a[1]), x: clampX(num(a[2])), y: clampY(num(a[3])) });
    } else if (a[0] === 'x') {
      ops.push({ k: 'x' });
    }
  }
  return ops;
}

/** Does this op list produce anything visible? */
export function opsBlank(ops) {
  let from = 0;
  for (let i = ops.length - 1; i >= 0; i--) if (ops[i].k === 'x') { from = i + 1; break; }
  return from >= ops.length;
}

/** Render ops once into a (possibly small) canvas. Uses a shared full-size scratch surface. */
let scratch = null;
export function renderThumb(target, ops) {
  if (!scratch) scratch = new Surface(document.createElement('canvas'));
  scratch.load(ops);
  const g = target.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(scratch.canvas, 0, 0, target.width, target.height);
}
