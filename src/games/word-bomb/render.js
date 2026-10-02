// Canvas renderer for Word Bomb: the static backdrop (arena floor, seat track) and the animated layer
// (bomb, fuse sparks, pointer arrow, explosions, comets, confetti, embers).
// Everything is pooled / sprite-based so 60 fps holds even with a full-screen explosion.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function sprite(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

const SPRITES = {};
function sprites() {
  if (SPRITES.fire) return SPRITES;
  SPRITES.fire = sprite(128, [[0, 'rgba(255,255,230,1)'], [0.18, 'rgba(255,220,120,0.95)'], [0.45, 'rgba(255,120,30,0.55)'], [0.75, 'rgba(200,40,10,0.18)'], [1, 'rgba(120,0,0,0)']]);
  SPRITES.smoke = sprite(128, [[0, 'rgba(40,32,48,0.6)'], [0.5, 'rgba(30,24,38,0.32)'], [1, 'rgba(20,16,28,0)']]);
  SPRITES.glow = sprite(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,240,180,0.7)'], [0.6, 'rgba(255,150,40,0.2)'], [1, 'rgba(255,100,0,0)']]);
  SPRITES.ember = sprite(32, [[0, 'rgba(255,230,160,1)'], [0.4, 'rgba(255,140,40,0.5)'], [1, 'rgba(255,80,0,0)']]);
  return SPRITES;
}

// ---------------------------------------------------------------- seat track geometry

/** Points of a superellipse |x/a|^n + |y/b|^n = 1, evenly spaced by arc length. Starts at the top, clockwise. */
export function superellipsePoints(cx, cy, a, b, n, count, phase = 0) {
  const SAMPLES = 720;
  const pts = [];
  const pow = 2 / n;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = -Math.PI / 2 + (i / SAMPLES) * TAU;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push([cx + a * Math.sign(c) * Math.abs(c) ** pow, cy + b * Math.sign(s) * Math.abs(s) ** pow]);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (((k + phase) / count) % 1) * total;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    if (cum[j] > target) j = 0;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f]);
  }
  return { points: out, perimeter: total, path: pts };
}

// ---------------------------------------------------------------- backdrop

export function drawBackdrop(canvas, W, H, dpr, layout) {
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#141519';
  g.fillRect(0, 0, W, H);

  const { cx, cy, rings, bomb } = layout;
  const outer = rings[0];
  const tracePath = (ring, k) => {
    g.beginPath();
    ring.path.forEach(([x, y], i) => {
      const px = cx + (x - cx) * k;
      const py = cy + (y - cy) * k;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    });
    g.closePath();
  };

  // the table: a flat disc inside the seat ring, a darker lip, and a faint inner ring
  tracePath(outer, 1.14);
  g.fillStyle = '#18191e';
  g.fill();
  tracePath(outer, 0.8);
  g.fillStyle = '#1e2026';
  g.fill();
  g.lineWidth = Math.max(2, outer.a * 0.006);
  g.strokeStyle = 'rgba(244,241,234,0.07)';
  g.stroke();
  tracePath(outer, 0.62);
  g.setLineDash([Math.max(6, outer.a * 0.012), Math.max(10, outer.a * 0.02)]);
  g.strokeStyle = 'rgba(244,241,234,0.05)';
  g.stroke();
  g.setLineDash([]);

  // seat track
  for (const ring of rings) {
    tracePath(ring, 1);
    g.setLineDash([2, Math.max(12, ring.a * 0.03)]);
    g.lineCap = 'round';
    g.lineWidth = Math.max(2, ring.a * 0.007);
    g.strokeStyle = 'rgba(244,241,234,0.16)';
    g.stroke();
    g.setLineDash([]);
  }

  // stand under the bomb
  const pr = bomb.R * 1.5;
  g.save();
  g.translate(bomb.x, bomb.y + bomb.R * 0.98);
  g.scale(1, 0.3);
  g.beginPath();
  g.arc(0, 0, pr, 0, TAU);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fill();
  for (let i = 1; i <= 2; i++) {
    g.beginPath();
    g.arc(0, 0, pr * (0.7 + i * 0.25), 0, TAU);
    g.lineWidth = 3;
    g.strokeStyle = `rgba(244,241,234,${0.07 - i * 0.025})`;
    g.stroke();
  }
  g.restore();

  // soft vignette so the corners recede behind the HUD
  const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- animated layer

export class FX {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.W = 1;
    this.H = 1;
    this.dpr = 1;
    this.t = 0;
    this.parts = []; // generic particles
    this.rings = []; // shockwaves
    this.comets = [];
    this.embers = [];
    this.flash = 0;
    this.bomb = {
      x: 0, y: 0, R: 60,
      visible: false,
      spawnT: 1, // 0..1 drop-in animation progress
      fuse: 1, // visible fuse fraction
      heat: 0, // 0..1 tension (wobble, glow)
      pulse: 0, // decays after each tick
      rim: '#ffffff',
      angle: -Math.PI / 2, // pointer angle
      targetAngle: -Math.PI / 2,
      angVel: 0,
      pointerAlpha: 0,
      target: null, // {x, y, r} seat to point at
      sparkAcc: 0,
    };
    sprites();
  }

  resize(W, H, dpr) {
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    if (!this.embers.length) {
      for (let i = 0; i < 0; i++) this.embers.push({ x: Math.random() * W, y: Math.random() * H, v: rand(8, 26), s: rand(2, 5), ph: Math.random() * TAU });
    }
  }

  // ------------------------------------------------ emitters
  add(p) {
    if (this.parts.length > 900) this.parts.shift();
    this.parts.push(p);
  }

  explode(x, y, scale = 1) {
    const S = sprites();
    const R = this.bomb.R * scale;
    this.flash = 1;
    this.rings.push({ x, y, r: R * 0.5, vr: Math.min(this.W, this.H) * 1.6, life: 0.6, max: 0.6, w: R * 0.22, color: '255,200,140' });
    this.rings.push({ x, y, r: R * 0.3, vr: Math.min(this.W, this.H) * 0.9, life: 0.9, max: 0.9, w: R * 0.18, color: '255,120,60' });
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU;
      const sp = rand(0.5, 1) * R * 7;
      this.add({ kind: 'fire', img: S.fire, x: x + Math.cos(a) * R * 0.3, y: y + Math.sin(a) * R * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - R, drag: 3.2, g: -R * 0.5, size: rand(0.9, 1.8) * R, grow: 1.2, life: rand(0.45, 0.85), add: true });
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU;
      const sp = rand(0.2, 1) * R * 3;
      this.add({ kind: 'smoke', img: S.smoke, x: x + Math.cos(a) * R * 0.6, y: y + Math.sin(a) * R * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - R * 0.8, drag: 1.4, g: -R * 0.6, size: rand(1.1, 2) * R, grow: 0.9, life: rand(1.4, 2.2), delay: rand(0.05, 0.3) });
    }
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * TAU;
      const sp = rand(0.3, 1) * R * 14;
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - R * 2, drag: 1.2, g: R * 9, size: rand(1.5, 3.5), life: rand(0.6, 1.4), color: Math.random() < 0.5 ? '255,220,120' : '255,140,50' });
    }
    // chunky shell fragments
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU;
      const sp = rand(0.4, 1) * R * 10;
      this.add({ kind: 'chunk', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - R * 3, drag: 0.6, g: R * 14, size: rand(0.08, 0.2) * R, rot: Math.random() * TAU, vrot: rand(-12, 12), life: rand(1, 1.6) });
    }
  }

  burst(x, y, color, n = 24, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rand(0.3, 1) * 380 * speed;
      this.add({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, g: 300, size: rand(2, 4.5), life: rand(0.4, 0.9), color });
    }
  }

  ringPulse(x, y, color, r = 40) {
    this.rings.push({ x, y, r, vr: r * 5, life: 0.5, max: 0.5, w: 6, color });
  }

  comet(from, to, color, dur = 0.42) {
    // bow the arc toward the bomb so the pass visibly goes "through the table"
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const cx = mx + (this.bomb.x - mx) * 0.55;
    const cy = my + (this.bomb.y - my) * 0.55 - Math.hypot(to.x - from.x, to.y - from.y) * 0.12;
    this.comets.push({ from, to, cx, cy, t: 0, dur, color, last: null });
  }

  confetti(n = 160) {
    const cols = ['#ff4d6a', '#ffcc00', '#34d058', '#3d8bff', '#b86bff', '#ff8a1f', '#1fd6d6', '#ffffff'];
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'confetti', x: Math.random() * this.W, y: rand(-this.H * 0.4, -10), vx: rand(-60, 60), vy: rand(80, 260), drag: 0.4, g: 160, size: rand(6, 12), rot: Math.random() * TAU, vrot: rand(-8, 8), life: rand(3, 5), fill: cols[i % cols.length], wob: Math.random() * TAU });
    }
  }

  // ------------------------------------------------ frame
  update(dt) {
    this.t += dt;
    const b = this.bomb;
    b.pulse = Math.max(0, b.pulse - dt * 5);
    b.spawnT = Math.min(1, b.spawnT + dt * 2.2);
    // pointer: critically-damped spring toward target angle (shortest way round)
    let d = b.targetAngle - b.angle;
    d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
    b.angVel += d * 160 * dt - b.angVel * 18 * dt;
    b.angle += b.angVel * dt;
    b.pointerAlpha += ((b.visible && b.target ? 1 : 0) - b.pointerAlpha) * Math.min(1, dt * 8);

    // fuse sparks
    if (b.visible && b.spawnT >= 1) {
      b.sparkAcc += dt * (40 + b.heat * 60);
      const tip = this.fuseTip();
      while (b.sparkAcc > 1) {
        b.sparkAcc -= 1;
        const a = -Math.PI / 2 + rand(-1.4, 1.4);
        const sp = rand(60, 220) * (b.R / 80);
        this.add({ kind: 'spark', x: tip.x, y: tip.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.5, g: 260, size: rand(1.2, 2.6), life: rand(0.25, 0.6), color: Math.random() < 0.6 ? '255,230,140' : '255,150,60' });
      }
    }

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.age = (p.age || 0) + dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      const k = Math.exp(-(p.drag || 0) * dt);
      p.vx *= k;
      p.vy = p.vy * k + (p.g || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vrot) p.rot += p.vrot * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.r += r.vr * dt * (r.life / r.max + 0.2);
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.t += dt / c.dur;
      const pos = this.cometPos(c, Math.min(1, c.t));
      for (let k = 0; k < 3; k++) this.add({ kind: 'spark', x: pos.x + rand(-4, 4), y: pos.y + rand(-4, 4), vx: rand(-40, 40), vy: rand(-40, 40), drag: 4, g: 0, size: rand(2, 5), life: rand(0.25, 0.5), color: c.color });
      if (c.t >= 1) { this.comets.splice(i, 1); this.ringPulse(c.to.x, c.to.y, c.color, 30); }
    }
    this.flash = Math.max(0, this.flash - dt * 4.5);
    for (const e of this.embers) {
      e.y -= e.v * dt;
      e.x += Math.sin(this.t * 0.8 + e.ph) * 6 * dt;
      if (e.y < -10) { e.y = this.H + 10; e.x = Math.random() * this.W; }
    }
  }

  cometPos(c, t) {
    const u = 1 - t;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const s = 1 - e;
    return { x: s * s * c.from.x + 2 * s * e * c.cx + e * e * c.to.x, y: s * s * c.from.y + 2 * s * e * c.cy + e * e * c.to.y, u };
  }

  // Fuse is a cubic curve from the cap, curling up and to the right; only the first `fuse` fraction is drawn.
  fuseCurve() {
    const b = this.bomb;
    const R = b.R;
    return [
      [0, -R * 1.08],
      [R * 0.05, -R * 1.55],
      [R * 0.6, -R * 1.35],
      [R * 0.62, -R * 1.72],
    ];
  }

  fuseAt(t) {
    const [p0, p1, p2, p3] = this.fuseCurve();
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  }

  bombTransform() {
    const b = this.bomb;
    const s = b.spawnT;
    const drop = s < 1 ? (1 - easeOutBounce(s)) * -this.H * 0.6 : 0;
    const wob = Math.sin(this.t * (10 + b.heat * 16)) * (0.015 + b.heat * 0.11);
    const bob = Math.sin(this.t * 2.2) * b.R * 0.03;
    const sq = 1 + b.pulse * 0.07;
    return { x: b.x, y: b.y + drop + bob, rot: wob, sx: sq, sy: 2 - sq };
  }

  fuseTip() {
    const tr = this.bombTransform();
    const [fx, fy] = this.fuseAt(clamp(this.bomb.fuse, 0.02, 1));
    const c = Math.cos(tr.rot);
    const s = Math.sin(tr.rot);
    return { x: tr.x + (fx * c - fy * s) * tr.sx, y: tr.y + (fx * s + fy * c) * tr.sy };
  }

  draw() {
    const g = this.g;
    const { W, H, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const S = sprites();

    // embers
    g.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      g.globalAlpha = 0.25 + 0.2 * Math.sin(this.t * 3 + e.ph);
      g.drawImage(S.ember, e.x - e.s * 2, e.y - e.s * 2, e.s * 4, e.s * 4);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    const b = this.bomb;
    if (b.pointerAlpha > 0.01 && b.target) this.drawPointer(g);
    if (b.visible) this.drawBomb(g);

    // particles
    for (const p of this.parts) {
      if (p.delay > 0) continue;
      const k = p.age / p.life;
      if (p.kind === 'spark') {
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = `rgba(${p.color},${(1 - k).toFixed(3)})`;
        g.lineWidth = p.size;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        g.stroke();
      } else if (p.kind === 'fire' || p.kind === 'smoke') {
        g.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
        const sz = p.size * (1 + k * p.grow);
        g.globalAlpha = p.kind === 'fire' ? 0.75 * (1 - k) ** 1.6 : 0.8 * Math.min(1, k * 6) * (1 - k);
        g.drawImage(p.img, p.x - sz / 2, p.y - sz / 2, sz, sz);
        g.globalAlpha = 1;
      } else if (p.kind === 'chunk') {
        g.globalCompositeOperation = 'source-over';
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.globalAlpha = 1 - k * k;
        g.fillStyle = '#23262f';
        g.strokeStyle = 'rgba(255,140,60,0.35)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(-p.size, -p.size * 0.6);
        g.lineTo(p.size, -p.size * 0.3);
        g.lineTo(p.size * 0.4, p.size * 0.8);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      } else if (p.kind === 'confetti') {
        g.globalCompositeOperation = 'source-over';
        g.save();
        g.translate(p.x + Math.sin(this.t * 4 + p.wob) * 8, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.abs(Math.cos(this.t * 5 + p.wob)));
        g.globalAlpha = Math.min(1, (1 - k) * 3);
        g.fillStyle = p.fill;
        g.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        g.restore();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const a = r.life / r.max;
      g.strokeStyle = `rgba(${r.color},${(a * 0.8).toFixed(3)})`;
      g.lineWidth = Math.max(1, r.w * a);
      g.beginPath();
      g.arc(r.x, r.y, r.r, 0, TAU);
      g.stroke();
    }
    for (const c of this.comets) {
      const p = this.cometPos(c, Math.min(1, c.t));
      const s = b.R * 0.7;
      g.drawImage(S.glow, p.x - s, p.y - s, s * 2, s * 2);
    }
    g.globalCompositeOperation = 'source-over';
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,236,210,${(this.flash ** 3 * 0.7).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
  }

  drawPointer(g) {
    const b = this.bomb;
    const tr = this.bombTransform();
    const a = b.angle;
    const r0 = b.R * 1.42;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const px = tr.x + ca * r0;
    const py = tr.y + sa * r0;
    g.save();
    g.globalAlpha = b.pointerAlpha;
    // beam to the seat
    if (b.target) {
      const dist = Math.hypot(b.target.x - px, b.target.y - py) - b.target.r * 1.1;
      if (dist > 10) {
        const ex = px + ca * dist;
        const ey = py + sa * dist;
        const grad = g.createLinearGradient(px, py, ex, ey);
        grad.addColorStop(0, hexA(b.rim, 0.55));
        grad.addColorStop(1, hexA(b.rim, 0));
        g.strokeStyle = grad;
        g.lineWidth = Math.max(3, b.R * 0.07);
        g.lineCap = 'round';
        g.setLineDash([b.R * 0.12, b.R * 0.14]);
        g.lineDashOffset = -this.t * b.R * 1.6;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(ex, ey);
        g.stroke();
        g.setLineDash([]);
      }
    }
    // orbit ring
    g.strokeStyle = hexA(b.rim, 0.25);
    g.lineWidth = Math.max(2, b.R * 0.035);
    g.beginPath();
    g.arc(tr.x, tr.y, r0 - b.R * 0.05, a + 0.5, a - 0.5 + TAU);
    g.stroke();
    // arrow head
    g.translate(px, py);
    g.rotate(a);
    const s = b.R * 0.34 * (1 + b.pulse * 0.15);
    g.fillStyle = b.rim;
    g.beginPath();
    g.moveTo(s * 1.1, 0);
    g.quadraticCurveTo(s * 0.1, -s * 0.2, -s * 0.5, -s * 0.85);
    g.quadraticCurveTo(-s * 0.2, 0, -s * 0.5, s * 0.85);
    g.quadraticCurveTo(s * 0.1, s * 0.2, s * 1.1, 0);
    g.fill();
    g.lineWidth = Math.max(2, s * 0.1);
    g.strokeStyle = '#141519';
    g.stroke();
    g.restore();
  }

  drawBomb(g) {
    const b = this.bomb;
    const R = b.R;
    const tr = this.bombTransform();

    // danger halo
    g.save();
    g.globalCompositeOperation = 'lighter';
    const hal = R * (1.5 + b.heat * 0.5 + b.pulse * 0.15);
    const halo = g.createRadialGradient(tr.x, tr.y, R * 0.9, tr.x, tr.y, hal);
    halo.addColorStop(0, `rgba(255,${Math.round(70 - b.heat * 40)},30,${(b.heat * b.heat * 0.4 + b.pulse * b.heat * 0.2).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(255,40,20,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(tr.x, tr.y, hal, 0, TAU);
    g.fill();
    g.restore();

    // ground shadow (doesn't wobble)
    const sh = g.createRadialGradient(b.x, b.y + R * 0.98, 0, b.x, b.y + R * 0.98, R);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(b.x, b.y + R * 0.98);
    g.scale(1, 0.24);
    g.translate(-b.x, -(b.y + R * 0.98));
    g.fillStyle = sh;
    g.beginPath();
    g.arc(b.x, b.y + R * 0.98, R * (b.spawnT < 1 ? 0.5 + b.spawnT * 0.5 : 1), 0, TAU);
    g.fill();
    g.restore();

    g.save();
    g.translate(tr.x, tr.y);
    g.rotate(tr.rot);
    g.scale(tr.sx, tr.sy);

    // fuse (behind cap)
    const f = clamp(b.fuse, 0.02, 1);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const steps = 28;
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [x, y] = this.fuseAt((i / steps) * f);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.strokeStyle = '#5a3d1e';
    g.lineWidth = R * 0.13;
    g.stroke();
    g.strokeStyle = '#d9b27a';
    g.lineWidth = R * 0.085;
    g.stroke();
    g.setLineDash([R * 0.05, R * 0.06]);
    g.strokeStyle = '#8a6334';
    g.lineWidth = R * 0.085;
    g.stroke();
    g.setLineDash([]);
    // charred tip
    const [tx, ty] = this.fuseAt(f);
    g.fillStyle = '#2a1a10';
    g.beginPath();
    g.arc(tx, ty, R * 0.06, 0, TAU);
    g.fill();

    // body
    const body = g.createRadialGradient(-R * 0.38, -R * 0.42, R * 0.05, 0, 0, R * 1.02);
    body.addColorStop(0, '#6f7894');
    body.addColorStop(0.22, '#343a4f');
    body.addColorStop(0.62, '#15171f');
    body.addColorStop(1, '#040406');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();

    // rim light in the holder's colour
    g.save();
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.clip();
    const rim = g.createRadialGradient(R * 0.55, R * 0.6, R * 0.6, R * 0.2, R * 0.2, R * 1.4);
    rim.addColorStop(0, hexA(b.rim, 0));
    rim.addColorStop(0.55, hexA(b.rim, 0));
    rim.addColorStop(0.8, hexA(b.rim, 0.55));
    rim.addColorStop(1, hexA(b.rim, 0));
    g.fillStyle = rim;
    g.fillRect(-R, -R, R * 2, R * 2);
    // hot red glow as tension rises
    if (b.heat > 0.05) {
      g.globalCompositeOperation = 'lighter';
      const hot = g.createRadialGradient(0, R * 0.2, 0, 0, 0, R);
      const hA = (b.heat * 0.4 + b.pulse * 0.15) * (0.75 + 0.25 * Math.sin(this.t * 14));
      hot.addColorStop(0, `rgba(255,60,30,${hA.toFixed(3)})`);
      hot.addColorStop(1, 'rgba(255,30,10,0)');
      g.fillStyle = hot;
      g.fillRect(-R, -R, R * 2, R * 2);
    }
    g.restore();

    // specular highlights
    g.save();
    g.translate(-R * 0.4, -R * 0.45);
    g.rotate(-0.65);
    const spec = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.32);
    spec.addColorStop(0, 'rgba(255,255,255,0.85)');
    spec.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.scale(1, 0.55);
    g.fillStyle = spec;
    g.beginPath();
    g.arc(0, 0, R * 0.32, 0, TAU);
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.arc(-R * 0.18, -R * 0.62, R * 0.045, 0, TAU);
    g.fill();

    // cap
    const cw = R * 0.52;
    const ch = R * 0.3;
    const capGrad = g.createLinearGradient(-cw / 2, 0, cw / 2, 0);
    capGrad.addColorStop(0, '#5b6272');
    capGrad.addColorStop(0.3, '#d7dce6');
    capGrad.addColorStop(0.55, '#8b93a5');
    capGrad.addColorStop(1, '#353a46');
    g.fillStyle = capGrad;
    roundRect(g, -cw / 2, -R * 1.12, cw, ch, R * 0.06);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = Math.max(1, R * 0.02);
    g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(-cw / 2, -R * 1.12 + ch * 0.55, cw, ch * 0.12);
    g.restore();

    // spark at the fuse tip
    if (b.spawnT >= 1) {
      const tip = this.fuseTip();
      const S = sprites();
      g.save();
      g.globalCompositeOperation = 'lighter';
      const fl = 0.8 + Math.random() * 0.4;
      const s = R * (0.9 + b.heat * 0.4) * fl;
      g.drawImage(S.glow, tip.x - s, tip.y - s, s * 2, s * 2);
      g.translate(tip.x, tip.y);
      g.rotate(this.t * 7);
      g.strokeStyle = 'rgba(255,245,200,0.9)';
      g.lineWidth = Math.max(1.5, R * 0.025);
      for (let i = 0; i < 4; i++) {
        g.rotate(Math.PI / 4);
        const l = R * (0.25 + Math.random() * 0.2);
        g.beginPath();
        g.moveTo(-l, 0);
        g.lineTo(l, 0);
        g.stroke();
      }
      g.restore();
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function easeOutBounce(x) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

const colorCache = new Map();
/** css colour (hex or hsl) + alpha -> rgba string */
export function hexA(css, a) {
  let rgb = colorCache.get(css);
  if (!rgb) {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = '#000';
    c.fillStyle = css;
    const v = c.fillStyle;
    if (v.startsWith('#')) rgb = [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    else rgb = (v.match(/\d+/g) || [255, 255, 255]).slice(0, 3).map(Number);
    colorCache.set(css, rgb);
  }
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}
