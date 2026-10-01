// Blast Arena: authoritative game simulation (no rendering, no DOM).
// Grid coordinates: x = column (0..W-1), y = row (0..H-1). Tile centres sit on integers.
// The view maps x -> world X and y -> world Z.

export const T = { EMPTY: 0, PILLAR: 1, CRATE: 2, BLOCK: 3 };
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const DIR = { up: 0, right: 1, down: 2, left: 3 };

export const PU = {
  bomb: { label: '+1 Bomb', weight: 30 },
  fire: { label: '+1 Fire', weight: 30 },
  speed: { label: 'Speed', weight: 16 },
  kick: { label: 'Kick', weight: 8 },
  shield: { label: 'Shield', weight: 6 },
  remote: { label: 'Remote', weight: 2.5 },
  skull: { label: 'Curse!', weight: 5 },
};
export const CURSES = ['slow', 'fast', 'reverse', 'autobomb', 'nobomb', 'weak'];
export const CURSE_LABEL = {
  slow: 'Sluggish', fast: 'Hyper speed', reverse: 'Reversed controls', autobomb: 'Bomb diarrhea', nobomb: 'No bombs', weak: 'Weak fire',
};

export const FUSE = 2.5;
const FIRE_TIME = 0.6;
const BASE_SPEED = 3.3;
const SPEED_STEP = 0.55;
const MAX_SPEED_LVL = 4;
const MAX_BOMBS = 8;
const MAX_FIRE = 8;
const KICK_SPEED = 8;
const BELT_SPEED = 1.7;
const CURSE_TIME = 10;
const EPS = 1e-4;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Map size scales with the player count. */
export function mapSize(n) {
  if (n <= 4) return [13, 11];
  if (n <= 8) return [17, 13];
  if (n <= 16) return [21, 17];
  return [25, 21];
}

/** Evenly spread spawn cells: corners first, then farthest-point sampling over even/even cells. */
function pickSpawns(W, H, n) {
  const cands = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) cands.push([x, y]);
  const chosen = [[0, 0], [W - 1, H - 1], [W - 1, 0], [0, H - 1]].slice(0, n);
  while (chosen.length < n) {
    let best = null;
    let bestD = -1;
    for (const c of cands) {
      let d = Infinity;
      for (const s of chosen) d = Math.min(d, Math.abs(c[0] - s[0]) + Math.abs(c[1] - s[1]));
      // Slight preference for the edges so interior spawns are rarer.
      const edge = Math.min(c[0], W - 1 - c[0], c[1], H - 1 - c[1]);
      const score = d - edge * 0.15;
      if (score > bestD) { bestD = score; best = c; }
    }
    chosen.push(best);
  }
  return chosen;
}

export class Sim {
  /**
   * @param {object} o
   * @param {number} o.W
   * @param {number} o.H
   * @param {'garden'|'factory'|'ice'} o.theme
   * @param {string[]} o.playerIds
   * @param {number} o.seed
   * @param {number} o.suddenDeathAt seconds
   */
  constructor({ W, H, theme = 'garden', playerIds, seed = 1, suddenDeathAt = 120, crateDensity = 0.78 }) {
    this.W = W;
    this.H = H;
    this.theme = theme;
    this.rng = mulberry32(seed);
    this.grid = new Uint8Array(W * H);
    this.belt = new Int8Array(W * H).fill(-1);
    this.ice = new Uint8Array(W * H);
    this.hidden = new Map(); // idx -> powerup type inside a crate
    this.pending = new Map(); // idx -> powerup revealed when the fire on it ends
    this.powerups = new Map(); // idx -> { type, age }
    this.fire = new Float32Array(W * H);
    this.fireOwner = new Array(W * H).fill(null);
    this.bombs = [];
    this.players = new Map();
    this.events = [];
    this.time = 0;
    this.suddenDeathAt = suddenDeathAt;
    this.sudden = null;
    this.falling = []; // { idx, t } blocks in the air
    this.nextBombId = 1;
    this.spawns = [];
    this.stats = { cratesDestroyed: 0, explosions: 0 };
    this.build(playerIds, crateDensity);
  }

  idx(x, y) { return y * this.W + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  cell(x, y) { return this.inside(x, y) ? this.grid[this.idx(x, y)] : T.PILLAR; }
  emit(e) { this.events.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  build(playerIds, density) {
    const { W, H, rng } = this;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x % 2 === 1 && y % 2 === 1) this.grid[this.idx(x, y)] = T.PILLAR;
    }
    const spawns = pickSpawns(W, H, Math.max(1, playerIds.length));
    const safe = new Set();
    for (const [sx, sy] of spawns) {
      safe.add(this.idx(sx, sy));
      // Guaranteed free L: one horizontal and one vertical neighbour, pointing inward.
      let ddx = sx < W / 2 ? 1 : -1;
      if (!this.inside(sx + ddx, sy)) ddx = -ddx;
      let ddy = sy < H / 2 ? 1 : -1;
      if (!this.inside(sx, sy + ddy)) ddy = -ddy;
      for (const [x, y] of [[sx + ddx, sy], [sx, sy + ddy]]) if (this.inside(x, y)) safe.add(this.idx(x, y));
    }
    // Theme mechanics.
    if (this.theme === 'factory') this.layBelts(spawns);
    if (this.theme === 'ice') {
      for (let i = 0; i < W * H; i++) this.ice[i] = 1;
      // Snowy (grippy) patches around spawns.
      for (const [sx, sy] of spawns) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (this.inside(sx + dx, sy + dy)) this.ice[this.idx(sx + dx, sy + dy)] = 0;
      }
    }
    // Crates.
    const crateCells = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = this.idx(x, y);
      if (this.grid[i] !== T.EMPTY || safe.has(i)) continue;
      if (rng() < density) { this.grid[i] = T.CRATE; crateCells.push(i); }
    }
    // Hidden power-ups (~38% of crates).
    const total = Object.values(PU).reduce((s, p) => s + p.weight, 0);
    const nPU = Math.round(crateCells.length * 0.38);
    for (let k = 0; k < nPU && crateCells.length; k++) {
      const j = Math.floor(rng() * crateCells.length);
      const i = crateCells.splice(j, 1)[0];
      let r = rng() * total;
      let type = 'bomb';
      for (const [name, p] of Object.entries(PU)) { r -= p.weight; if (r <= 0) { type = name; break; } }
      this.hidden.set(i, type);
    }
    this.spawns = spawns;
    playerIds.forEach((id, k) => {
      const [x, y] = spawns[k];
      this.players.set(id, {
        id, x, y, spawn: [x, y], alive: true, facing: 2,
        bombsMax: 1, bombsOut: 0, fire: 2, speedLvl: 0, kick: false, remote: false, shield: false,
        curse: null, curseT: 0, invuln: 0, moveDir: -1, moveSpeed: 0, moving: false, kills: 0,
        input: { x: 0, y: 0 }, deathT: 0,
      });
    });
  }

  layBelts(spawns) {
    const { W, H } = this;
    const nearSpawn = (x, y) => spawns.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) <= 2);
    // Horizontal belts on even rows, alternating directions; vertical belts on some even columns for big maps.
    const rows = [];
    for (let y = 2; y < H - 2; y += 4) rows.push(y);
    rows.forEach((y, k) => {
      const dir = k % 2 === 0 ? DIR.right : DIR.left;
      for (let x = 1; x < W - 1; x++) if (!nearSpawn(x, y)) this.belt[this.idx(x, y)] = dir;
    });
    if (W >= 17) {
      const mid = Math.floor(W / 2) - (Math.floor(W / 2) % 2);
      for (const [x, dir] of [[mid, DIR.down]]) {
        for (let y = 1; y < H - 1; y++) if (!nearSpawn(x, y) && this.belt[this.idx(x, y)] < 0) this.belt[this.idx(x, y)] = dir;
      }
    }
  }

  // ------------------------------------------------------------------ queries
  bombAt(x, y) {
    for (const b of this.bombs) if (b.cx === x && b.cy === y) return b;
    return null;
  }

  playerAt(x, y, exceptId) {
    for (const p of this.players.values()) {
      if (p.alive && p.id !== exceptId && Math.round(p.x) === x && Math.round(p.y) === y) return p;
    }
    return null;
  }

  /** Whether a player may enter cell (x, y). May trigger a kick. */
  blockedFor(p, x, y, dir, allowKick = true) {
    if (!this.inside(x, y)) return true;
    const g = this.grid[this.idx(x, y)];
    if (g !== T.EMPTY) return true;
    const b = this.bombAt(x, y);
    if (b && !b.passers.has(p.id)) {
      if (allowKick && p.kick && dir >= 0 && b.slide === null) this.kick(b, dir, p.id);
      return true;
    }
    return false;
  }

  /** Solid for sliding bombs. */
  blockedForBomb(b, x, y) {
    if (!this.inside(x, y)) return true;
    if (this.grid[this.idx(x, y)] !== T.EMPTY) return true;
    for (const o of this.bombs) if (o !== b && o.cx === x && o.cy === y) return true;
    if (this.playerAt(x, y)) return true;
    return false;
  }

  speedOf(p) {
    let s = BASE_SPEED + p.speedLvl * SPEED_STEP;
    if (p.curse === 'slow') s = 2.0;
    if (p.curse === 'fast') s = 7.5;
    return s;
  }

  // ------------------------------------------------------------------ movement
  /** Move a player `dist` tiles in `dir` with grid alignment + corner assist. Returns distance moved. */
  tryMove(p, dir, dist, allowKick = true) {
    const dx = DX[dir];
    const dy = DY[dir];
    const horiz = dx !== 0;
    const main = horiz ? 'x' : 'y';
    const perp = horiz ? 'y' : 'x';
    const pv = p[perp];
    const rp = Math.round(pv);
    const off = pv - rp;
    if (Math.abs(off) > EPS) {
      // Misaligned on the perpendicular axis: slide toward a lane whose next cell is free.
      const mc = Math.round(p[main]);
      const laneFree = (lane) => {
        const cx = horiz ? mc + dx : lane;
        const cy = horiz ? lane : mc + dy;
        return !this.blockedFor(p, cx, cy, dir, false);
      };
      const far = rp + Math.sign(off);
      let target = null;
      if (laneFree(rp)) target = rp;
      else if (Math.abs(off) > 0.18 && laneFree(far)) target = far;
      if (target === null) return 0;
      const d = target - pv;
      const step = Math.sign(d) * Math.min(Math.abs(d), dist);
      p[perp] = pv + step;
      if (Math.abs(p[perp] - target) < EPS) p[perp] = target;
      return Math.abs(step);
    }
    p[perp] = rp;
    const v = p[main];
    const s = horiz ? dx : dy;
    let target = v + s * dist;
    if (s > 0) {
      const c = Math.floor(v + EPS);
      const next = c + 1;
      const nx = horiz ? next : p.x;
      const ny = horiz ? p.y : next;
      if (this.blockedFor(p, Math.round(nx), Math.round(ny), dir, allowKick)) target = Math.min(target, Math.max(v, c));
      else if (target > next && this.blockedFor(p, horiz ? next + 1 : p.x, horiz ? p.y : next + 1, dir, allowKick)) target = next;
    } else {
      const c = Math.ceil(v - EPS);
      const next = c - 1;
      const nx = horiz ? next : p.x;
      const ny = horiz ? p.y : next;
      if (this.blockedFor(p, Math.round(nx), Math.round(ny), dir, allowKick)) target = Math.max(target, Math.min(v, c));
      else if (target < next && this.blockedFor(p, horiz ? next - 1 : p.x, horiz ? p.y : next - 1, dir, allowKick)) target = next;
    }
    const moved = Math.abs(target - v);
    p[main] = target;
    return moved;
  }

  kick(b, dir, byId) {
    const nx = b.cx + DX[dir];
    const ny = b.cy + DY[dir];
    if (this.blockedForBomb(b, nx, ny)) return;
    b.slide = dir;
    b.slideSpeed = KICK_SPEED;
    b.passers.clear();
    this.emit({ t: 'kick', bomb: b, by: byId });
  }

  // ------------------------------------------------------------------ actions
  setInput(id, x, y) {
    const p = this.players.get(id);
    if (p) { p.input.x = x; p.input.y = y; }
  }

  placeBomb(id) {
    const p = this.players.get(id);
    if (!p || !p.alive) return false;
    if (p.curse === 'nobomb') return false;
    if (p.bombsOut >= p.bombsMax) return false;
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    if (this.cell(cx, cy) !== T.EMPTY || this.bombAt(cx, cy)) return false;
    const passers = new Set();
    for (const o of this.players.values()) {
      if (o.alive && Math.abs(o.x - cx) < 0.98 && Math.abs(o.y - cy) < 0.98) passers.add(o.id);
    }
    const b = {
      id: this.nextBombId++, owner: id, x: cx, y: cy, cx, cy, fuse: FUSE, fuseMax: FUSE,
      range: p.curse === 'weak' ? 1 : p.fire, remote: p.remote, passers, slide: null, slideSpeed: 0, age: 0,
    };
    this.bombs.push(b);
    p.bombsOut++;
    this.emit({ t: 'bomb', bomb: b });
    return true;
  }

  /** B button: detonate oldest remote bomb, or kick the bomb in front. */
  special(id) {
    const p = this.players.get(id);
    if (!p || !p.alive) return false;
    if (p.remote) {
      const b = this.bombs.find((o) => o.owner === id && o.remote);
      if (b) { b.fuse = 0; b.remote = false; return true; }
    }
    if (p.kick) {
      const cx = Math.round(p.x) + DX[p.facing];
      const cy = Math.round(p.y) + DY[p.facing];
      const b = this.bombAt(cx, cy) || this.bombAt(Math.round(p.x), Math.round(p.y));
      if (b && b.slide === null) { this.kick(b, p.facing, id); return b.slide !== null; }
    }
    return false;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.alive) {
      p.alive = false;
      this.emit({ t: 'leave', pid: id, x: p.x, y: p.y });
    }
    for (const b of this.bombs) if (b.owner === id && b.remote) { b.remote = false; b.fuse = Math.min(b.fuse, 1); }
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    // Sub-step so fast movers never tunnel.
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / steps;
    for (let k = 0; k < steps; k++) this.step(h);
  }

  step(dt) {
    this.time += dt;
    for (const p of this.players.values()) if (p.alive) this.stepPlayer(p, dt);
    this.stepBombs(dt);
    this.stepFire(dt);
    this.stepSudden(dt);
    this.checkHits();
  }

  inputDirs(p) {
    let { x, y } = p.input;
    if (p.curse === 'reverse') { x = -x; y = -y; }
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (Math.max(ax, ay) < 0.3) return [];
    const hd = x > 0 ? DIR.right : DIR.left;
    const vd = y > 0 ? DIR.down : DIR.up;
    const dirs = ax >= ay ? [hd] : [vd];
    const minor = Math.min(ax, ay);
    if (minor > 0.28) dirs.push(ax >= ay ? vd : hd);
    return dirs;
  }

  stepPlayer(p, dt) {
    if (p.invuln > 0) p.invuln -= dt;
    if (p.curse) {
      p.curseT -= dt;
      if (p.curse === 'autobomb' && this.rng() < dt * 3) this.placeBomb(p.id);
      if (p.curseT <= 0) { this.emit({ t: 'curseEnd', pid: p.id }); p.curse = null; }
    }
    const dirs = this.inputDirs(p);
    const cxi = Math.round(p.x);
    const cyi = Math.round(p.y);
    const ci = this.idx(cxi, cyi);
    const onIce = this.ice[ci] === 1;
    const maxS = this.speedOf(p);
    let moved = 0;
    if (!onIce) {
      p.moveSpeed = dirs.length ? maxS : 0;
      for (const d of dirs) {
        moved = this.tryMove(p, d, maxS * dt);
        if (moved > EPS) { p.moveDir = d; p.facing = d; break; }
      }
      if (dirs.length && moved <= EPS) p.facing = dirs[0];
    } else {
      const want = dirs.length ? dirs[0] : -1;
      if (p.moveDir < 0 || p.moveSpeed <= 0.05) {
        if (want >= 0) { p.moveDir = want; p.moveSpeed = Math.max(p.moveSpeed, 0.8); }
      } else if (want === p.moveDir) {
        p.moveSpeed = Math.min(maxS * 1.1, p.moveSpeed + 5 * dt);
      } else if (want < 0) {
        p.moveSpeed = Math.max(0, p.moveSpeed - 1.6 * dt);
      } else if (want === (p.moveDir + 2) % 4) {
        p.moveSpeed -= 7 * dt;
        if (p.moveSpeed <= 0) { p.moveDir = want; p.moveSpeed = 0.5; }
      } else {
        // Perpendicular turn on ice: only when close to an open lane, otherwise keep sliding.
        const horizNow = DX[p.moveDir] !== 0;
        const v = horizNow ? p.x : p.y;
        const lane = Math.round(v);
        if (Math.abs(v - lane) < 0.14) {
          const tx = horizNow ? lane + DX[want] : Math.round(p.x) + DX[want];
          const ty = horizNow ? Math.round(p.y) + DY[want] : lane + DY[want];
          if (!this.blockedFor(p, tx, ty, want, false)) {
            if (horizNow) p.x = lane; else p.y = lane;
            p.moveDir = want;
            p.moveSpeed = Math.max(0.8, p.moveSpeed * 0.8);
          }
        }
      }
      if (moved <= EPS && p.moveDir >= 0 && p.moveSpeed > 0) {
        const want2 = p.moveSpeed * dt;
        moved = this.tryMove(p, p.moveDir, want2);
        if (moved < want2 * 0.25) p.moveSpeed = 0;
      }
      if (p.moveDir >= 0 && p.moveSpeed > 0) p.facing = p.moveDir;
      else if (want >= 0) p.facing = want;
    }
    // Conveyor belts carry players standing on them.
    const bi = this.idx(Math.round(p.x), Math.round(p.y));
    if (this.belt[bi] >= 0) this.tryMove(p, this.belt[bi], BELT_SPEED * dt, false);
    p.moving = moved > EPS;
    // Leave bombs we were standing on.
    for (const b of this.bombs) {
      if (b.passers.has(p.id) && (Math.abs(p.x - b.x) >= 0.98 || Math.abs(p.y - b.y) >= 0.98)) b.passers.delete(p.id);
    }
    // Pick up power-ups.
    const pi = this.idx(Math.round(p.x), Math.round(p.y));
    const pu = this.powerups.get(pi);
    if (pu) {
      this.powerups.delete(pi);
      this.applyPowerup(p, pu.type);
      this.emit({ t: 'pickup', pid: p.id, type: pu.type, x: Math.round(p.x), y: Math.round(p.y) });
    }
    // Curses spread on contact.
    if (p.curse) {
      for (const o of this.players.values()) {
        if (o === p || !o.alive || o.curse) continue;
        if (Math.abs(o.x - p.x) < 0.6 && Math.abs(o.y - p.y) < 0.6) {
          o.curse = p.curse;
          o.curseT = p.curseT;
          this.emit({ t: 'curse', pid: o.id, kind: o.curse, spread: true });
        }
      }
    }
  }

  applyPowerup(p, type) {
    switch (type) {
      case 'bomb': p.bombsMax = Math.min(MAX_BOMBS, p.bombsMax + 1); break;
      case 'fire': p.fire = Math.min(MAX_FIRE, p.fire + 1); break;
      case 'speed': p.speedLvl = Math.min(MAX_SPEED_LVL, p.speedLvl + 1); break;
      case 'kick': p.kick = true; break;
      case 'remote': p.remote = true; break;
      case 'shield': p.shield = true; break;
      case 'skull': {
        p.curse = CURSES[Math.floor(this.rng() * CURSES.length)];
        p.curseT = CURSE_TIME;
        this.emit({ t: 'curse', pid: p.id, kind: p.curse });
        break;
      }
      default:
    }
  }

  stepBombs(dt) {
    for (const b of [...this.bombs]) {
      if (!this.bombs.includes(b)) continue;
      b.age += dt;
      // Remote bombs tick very slowly (safety net so nothing lingers forever).
      b.fuse -= b.remote ? dt * 0.08 : dt;
      // Sliding (kicked) or carried by a belt.
      let dir = b.slide;
      let speed = b.slideSpeed;
      const bi = this.idx(b.cx, b.cy);
      if (dir === null && this.belt[bi] >= 0) { dir = this.belt[bi]; speed = BELT_SPEED; }
      if (dir !== null && dir !== undefined) {
        const dx = DX[dir];
        const dy = DY[dir];
        const horiz = dx !== 0;
        const s = horiz ? dx : dy;
        const v = horiz ? b.x : b.y;
        let target = v + s * speed * dt;
        const c = s > 0 ? Math.floor(v + EPS) : Math.ceil(v - EPS);
        const next = c + s;
        const nx = horiz ? next : b.cx;
        const ny = horiz ? b.cy : next;
        if (this.blockedForBomb(b, nx, ny)) {
          target = s > 0 ? Math.min(target, Math.max(v, c)) : Math.max(target, Math.min(v, c));
          if (Math.abs(target - c) < EPS && b.slide !== null) { b.slide = null; b.slideSpeed = 0; this.emit({ t: 'bombStop', bomb: b }); }
        }
        if (horiz) b.x = target; else b.y = target;
        b.cx = Math.round(b.x);
        b.cy = Math.round(b.y);
      }
      // Fire touching a bomb sets it off.
      if (this.fire[this.idx(b.cx, b.cy)] > 0) b.fuse = Math.min(b.fuse, 0.06);
      if (b.fuse <= 0) this.explode(b);
    }
  }

  setFire(x, y, owner) {
    const i = this.idx(x, y);
    this.fire[i] = FIRE_TIME;
    this.fireOwner[i] = owner;
  }

  explode(b) {
    const k = this.bombs.indexOf(b);
    if (k < 0) return;
    this.bombs.splice(k, 1);
    const owner = this.players.get(b.owner);
    if (owner) owner.bombsOut = Math.max(0, owner.bombsOut - 1);
    this.stats.explosions++;
    const x0 = b.cx;
    const y0 = b.cy;
    const arms = [0, 0, 0, 0];
    const crates = [];
    this.setFire(x0, y0, b.owner);
    this.burnPowerup(x0, y0);
    for (let d = 0; d < 4; d++) {
      for (let r = 1; r <= b.range; r++) {
        const x = x0 + DX[d] * r;
        const y = y0 + DY[d] * r;
        if (!this.inside(x, y)) break;
        const i = this.idx(x, y);
        const g = this.grid[i];
        if (g === T.PILLAR || g === T.BLOCK) break;
        if (g === T.CRATE) {
          this.grid[i] = T.EMPTY;
          this.stats.cratesDestroyed++;
          if (this.hidden.has(i)) { this.pending.set(i, this.hidden.get(i)); this.hidden.delete(i); }
          this.setFire(x, y, b.owner);
          crates.push({ x, y });
          arms[d] = r;
          break;
        }
        this.setFire(x, y, b.owner);
        arms[d] = r;
        const ob = this.bombAt(x, y);
        if (ob) { ob.fuse = Math.min(ob.fuse, 0.07); break; }
        if (this.burnPowerup(x, y)) break;
      }
    }
    this.emit({ t: 'explode', x: x0, y: y0, arms, owner: b.owner, bombId: b.id, crates });
    for (const c of crates) this.emit({ t: 'crate', x: c.x, y: c.y, hasPowerup: this.pending.has(this.idx(c.x, c.y)) });
  }

  burnPowerup(x, y) {
    const i = this.idx(x, y);
    if (!this.powerups.has(i)) return false;
    this.powerups.delete(i);
    this.emit({ t: 'burn', x, y });
    return true;
  }

  stepFire(dt) {
    for (let i = 0; i < this.fire.length; i++) {
      if (this.fire[i] <= 0) continue;
      this.fire[i] -= dt;
      if (this.fire[i] <= 0) {
        this.fire[i] = 0;
        this.fireOwner[i] = null;
        if (this.pending.has(i)) {
          const type = this.pending.get(i);
          this.pending.delete(i);
          if (this.grid[i] === T.EMPTY) {
            this.powerups.set(i, { type, age: 0 });
            this.emit({ t: 'powerup', x: i % this.W, y: Math.floor(i / this.W), type });
          }
        }
      }
    }
  }

  checkHits() {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const i = this.idx(Math.round(p.x), Math.round(p.y));
      if (this.fire[i] <= 0) continue;
      if (p.invuln > 0) continue;
      if (p.shield) {
        p.shield = false;
        p.invuln = 1.6;
        this.emit({ t: 'shieldPop', pid: p.id });
        continue;
      }
      this.kill(p, this.fireOwner[i], 'fire');
    }
  }

  kill(p, killerId, cause) {
    p.alive = false;
    p.deathT = this.time;
    const killer = killerId && killerId !== p.id ? this.players.get(killerId) : null;
    if (killer) killer.kills++;
    this.emit({ t: 'death', pid: p.id, killer: killer ? killer.id : null, cause, x: p.x, y: p.y });
    for (const b of this.bombs) if (b.owner === p.id && b.remote) { b.remote = false; b.fuse = Math.min(b.fuse, 1.2); }
    // Scatter some of the victim's upgrades so the fight keeps its fuel.
    const drops = [];
    for (let k = 1; k < p.bombsMax; k++) drops.push('bomb');
    for (let k = 2; k < p.fire; k++) drops.push('fire');
    for (let k = 0; k < p.speedLvl; k++) drops.push('speed');
    if (p.kick) drops.push('kick');
    if (p.remote) drops.push('remote');
    const free = [];
    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] === T.EMPTY && !this.powerups.has(i) && this.fire[i] <= 0 && !this.pending.has(i)
        && !this.bombAt(i % this.W, Math.floor(i / this.W))) free.push(i);
    }
    const n = Math.min(3, drops.length, free.length);
    for (let k = 0; k < n; k++) {
      const type = drops.splice(Math.floor(this.rng() * drops.length), 1)[0];
      const i = free.splice(Math.floor(this.rng() * free.length), 1)[0];
      this.powerups.set(i, { type, age: 0 });
      this.emit({ t: 'powerup', x: i % this.W, y: Math.floor(i / this.W), type, fromX: p.x, fromY: p.y });
    }
  }

  // ------------------------------------------------------------------ sudden death
  spiralOrder() {
    const { W, H } = this;
    const out = [];
    let x0 = 0; let y0 = 0; let x1 = W - 1; let y1 = H - 1;
    while (x0 <= x1 && y0 <= y1) {
      for (let x = x0; x <= x1; x++) out.push([x, y0]);
      for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]);
      if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]);
      if (x1 > x0) for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
      x0++; y0++; x1--; y1--;
    }
    return out.filter(([x, y]) => this.grid[this.idx(x, y)] !== T.PILLAR);
  }

  startSudden() {
    const order = this.spiralOrder();
    // Whole map fills in ~45 s no matter its size.
    this.sudden = { order, next: 0, timer: 0, interval: Math.max(0.05, 45 / order.length) };
    this.emit({ t: 'sudden' });
  }

  stepSudden(dt) {
    if (!this.sudden && this.time >= this.suddenDeathAt) this.startSudden();
    if (this.sudden) {
      const s = this.sudden;
      s.timer -= dt;
      while (s.timer <= 0 && s.next < s.order.length) {
        s.timer += s.interval;
        const [x, y] = s.order[s.next++];
        const i = this.idx(x, y);
        if (this.grid[i] === T.PILLAR || this.grid[i] === T.BLOCK) continue;
        this.falling.push({ i, t: 0.55 });
        this.emit({ t: 'blockDrop', x, y, dur: 0.55 });
      }
    }
    for (let k = this.falling.length - 1; k >= 0; k--) {
      const f = this.falling[k];
      f.t -= dt;
      if (f.t > 0) continue;
      this.falling.splice(k, 1);
      const x = f.i % this.W;
      const y = Math.floor(f.i / this.W);
      const wasCrate = this.grid[f.i] === T.CRATE;
      this.grid[f.i] = T.BLOCK;
      this.hidden.delete(f.i);
      this.pending.delete(f.i);
      if (this.powerups.delete(f.i)) this.emit({ t: 'burn', x, y, silent: true });
      const b = this.bombAt(x, y);
      if (b) {
        this.bombs.splice(this.bombs.indexOf(b), 1);
        const o = this.players.get(b.owner);
        if (o) o.bombsOut = Math.max(0, o.bombsOut - 1);
        this.emit({ t: 'bombCrushed', bomb: b });
      }
      this.emit({ t: 'blockLand', x, y, wasCrate });
      for (const p of this.players.values()) {
        if (p.alive && Math.round(p.x) === x && Math.round(p.y) === y) this.kill(p, null, 'crush');
      }
    }
  }

  get suddenDone() { return !!this.sudden && this.sudden.next >= this.sudden.order.length && this.falling.length === 0; }

  alive() { return [...this.players.values()].filter((p) => p.alive); }

  /** Compact per-player stats for phones/HUD. */
  statsOf(id) {
    const p = this.players.get(id);
    if (!p) return null;
    return {
      bombs: p.bombsMax, fire: p.fire, speed: p.speedLvl, kick: p.kick, remote: p.remote, shield: p.shield,
      curse: p.curse, alive: p.alive,
    };
  }
}
