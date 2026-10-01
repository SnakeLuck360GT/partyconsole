// Arena layout generation + grid collision queries. Pure logic (no three.js).
import { CELL, EMPTY, WALL, CRATE, BARREL } from './config.js';

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grid size that scales with the number of players (odd dimensions so there is a true centre). */
export function arenaSize(n) {
  const f = Math.max(0.88, (Math.max(2, n) / 4) ** 0.42);
  let cols = Math.round(17 * f);
  let rows = Math.round(11 * f);
  if (cols % 2 === 0) cols++;
  if (rows % 2 === 0) rows++;
  return { cols, rows };
}

export class Arena {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.cells = new Uint8Array(cols * rows);
    this.hp = new Uint8Array(cols * rows);
    this.spawns = [];
    this.halfW = (cols * CELL) / 2;
    this.halfH = (rows * CELL) / 2;
  }

  idx(i, j) { return j * this.cols + i; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.cols && j < this.rows; }
  get(i, j) { return this.inside(i, j) ? this.cells[this.idx(i, j)] : WALL; }
  set(i, j, v) {
    if (!this.inside(i, j)) return;
    this.cells[this.idx(i, j)] = v;
    this.hp[this.idx(i, j)] = v === CRATE ? 2 : v === BARREL ? 1 : 0;
  }
  /** set with 4-way mirror symmetry */
  sym(i, j, v) {
    const { cols, rows } = this;
    this.set(i, j, v);
    this.set(cols - 1 - i, j, v);
    this.set(i, rows - 1 - j, v);
    this.set(cols - 1 - i, rows - 1 - j, v);
  }
  cx(i) { return (i - (this.cols - 1) / 2) * CELL; }
  cz(j) { return (j - (this.rows - 1) / 2) * CELL; }
  ci(x) { return Math.floor(x / CELL + this.cols / 2); }
  cj(z) { return Math.floor(z / CELL + this.rows / 2); }
  cellAtWorld(x, z) { return this.get(this.ci(x), this.cj(z)); }
  solidAt(x, z) { return this.cellAtWorld(x, z) !== EMPTY; }

  /** Push a circle out of solid cells. Returns true if it collided. */
  resolveCircle(p, r) {
    let hit = false;
    const i0 = this.ci(p.x - r); const i1 = this.ci(p.x + r);
    const j0 = this.cj(p.z - r); const j1 = this.cj(p.z + r);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (this.get(i, j) === EMPTY) continue;
        const minX = this.cx(i) - CELL / 2; const maxX = minX + CELL;
        const minZ = this.cz(j) - CELL / 2; const maxZ = minZ + CELL;
        const qx = Math.max(minX, Math.min(p.x, maxX));
        const qz = Math.max(minZ, Math.min(p.z, maxZ));
        let dx = p.x - qx; let dz = p.z - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 < 1e-8) {
          // centre inside the box: push out along the smallest axis
          const pl = p.x - minX; const pr = maxX - p.x; const pt = p.z - minZ; const pb = maxZ - p.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) p.x = minX - r; else if (m === pr) p.x = maxX + r; else if (m === pt) p.z = minZ - r; else p.z = maxZ + r;
          continue;
        }
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        p.x = qx + dx * r;
        p.z = qz + dz * r;
      }
    }
    return hit;
  }

  /** March a ray through the grid; returns {dist, i, j, nx, nz} of the first solid cell or null. */
  raycast(x, z, dx, dz, maxDist) {
    // DDA
    let i = this.ci(x); let j = this.cj(z);
    const stepI = dx > 0 ? 1 : -1; const stepJ = dz > 0 ? 1 : -1;
    const nextX = this.cx(i) + (stepI * CELL) / 2;
    const nextZ = this.cz(j) + (stepJ * CELL) / 2;
    let tMaxX = dx !== 0 ? (nextX - x) / dx : Infinity;
    let tMaxZ = dz !== 0 ? (nextZ - z) / dz : Infinity;
    const tDX = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
    const tDZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let t = 0; let nx = 0; let nz = 0;
    for (let n = 0; n < 400; n++) {
      if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDX; i += stepI; nx = -stepI; nz = 0; } else { t = tMaxZ; tMaxZ += tDZ; j += stepJ; nx = 0; nz = -stepJ; }
      if (t > maxDist) return null;
      if (this.get(i, j) !== EMPTY) return { dist: t, i, j, nx, nz };
    }
    return null;
  }

  freeCells(clear = 0) {
    const out = [];
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        let ok = true;
        for (let dj = -clear; dj <= clear && ok; dj++) for (let di = -clear; di <= clear && ok; di++) if (this.get(i + di, j + dj) !== EMPTY) ok = false;
        if (ok) out.push([i, j]);
      }
    }
    return out;
  }
}

// ------------------------------------------------------------------ layout generators

function line(a, i0, j0, i1, j1, v) {
  const di = Math.sign(i1 - i0); const dj = Math.sign(j1 - j0);
  let i = i0; let j = j0;
  for (let n = 0; n < 200; n++) {
    a.sym(i, j, v);
    if (i === i1 && j === j1) break;
    if (i !== i1) i += di;
    if (j !== j1) j += dj;
  }
}

/** Only fill empty cells (don't overwrite walls) */
function soft(a, i, j, v) {
  if (a.get(i, j) === EMPTY && a.inside(i, j)) a.sym(i, j, v);
}

function genDesert(a, rng) {
  const { cols, rows } = a;
  const ci = (cols - 1) / 2; const cj = (rows - 1) / 2;
  // central bunker: ring with gaps on each side
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) === 2 && di !== 0 && dj !== 0 && Math.abs(di) + Math.abs(dj) > 2) a.set(ci + di, cj + dj, WALL);
    }
  }
  a.set(ci, cj, BARREL);
  // L-shaped revetments on a lattice in each quadrant
  for (let bj = 2; bj < cj - 1; bj += 5) {
    for (let bi = 2; bi < ci - 2; bi += 6) {
      const flip = rng() < 0.5;
      const len = 2 + Math.floor(rng() * 2);
      if (flip) { line(a, bi, bj, bi + len, bj, WALL); line(a, bi, bj, bi, bj + 1, WALL); } else { line(a, bi, bj, bi, bj + len - 1, WALL); line(a, bi, bj, bi + 2, bj, WALL); }
      // supplies stacked next to the revetment
      soft(a, bi + 1, bj + 1, rng() < 0.35 ? BARREL : CRATE);
      if (rng() < 0.6) soft(a, bi + 2, bj + 1, CRATE);
    }
  }
  // crate lines along the middle axis
  for (let k = 0; k < Math.max(2, cols / 7); k++) soft(a, Math.floor(rng() * (ci - 3)) + 1, cj, rng() < 0.25 ? BARREL : CRATE);
  for (let k = 0; k < Math.max(1, rows / 8); k++) soft(a, ci, Math.floor(rng() * (cj - 3)) + 1, CRATE);
}

function genSnow(a, rng) {
  const { cols, rows } = a;
  const ci = (cols - 1) / 2; const cj = (rows - 1) / 2;
  // pillars on a lattice: 2x1 or 1x2 blocks
  for (let bj = 2; bj <= cj; bj += 4) {
    for (let bi = 2; bi <= ci; bi += 4) {
      const r = rng();
      if (r < 0.4) { a.sym(bi, bj, WALL); a.sym(bi + 1, bj, WALL); } else if (r < 0.8) { a.sym(bi, bj, WALL); a.sym(bi, bj + 1, WALL); } else { a.sym(bi, bj, WALL); }
    }
  }
  // long snow walls near the outer edge
  const wl = Math.max(2, Math.floor(cols / 6));
  line(a, Math.floor(ci / 2), 1, Math.floor(ci / 2) + wl - 1, 1, WALL);
  // centre: an outpost cross of crates
  a.set(ci, cj, WALL);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) a.set(ci + di, cj + dj, CRATE);
  // random crates/barrels
  const n = Math.round((cols * rows) / 60);
  for (let k = 0; k < n; k++) soft(a, 1 + Math.floor(rng() * (ci - 1)), 1 + Math.floor(rng() * (cj - 1)), rng() < 0.3 ? BARREL : CRATE);
}

function genJungle(a, rng) {
  const { cols, rows } = a;
  const ci = (cols - 1) / 2; const cj = (rows - 1) / 2;
  // broken temple ring
  const ri = Math.max(3, Math.floor(ci * 0.55)); const rj = Math.max(2, Math.floor(cj * 0.55));
  for (let i = ci - ri; i <= ci; i++) {
    if (Math.abs(i - ci) > 1 && rng() < 0.82) a.sym(i, cj - rj, WALL);
  }
  for (let j = cj - rj; j <= cj; j++) {
    if (Math.abs(j - cj) > 1 && rng() < 0.82) a.sym(ci - ri, j, WALL);
  }
  // inner altar
  a.set(ci, cj, WALL);
  a.sym(ci - 1, cj - 1, BARREL);
  // ruin columns scattered in the outer ring
  const n = Math.round((cols * rows) / 45);
  for (let k = 0; k < n; k++) {
    const i = 1 + Math.floor(rng() * (ci - 1)); const j = 1 + Math.floor(rng() * (cj - 1));
    if (Math.abs(i - (ci - ri)) <= 1 || Math.abs(j - (cj - rj)) <= 1) continue;
    const r = rng();
    soft(a, i, j, r < 0.4 ? WALL : r < 0.8 ? CRATE : BARREL);
  }
}

function genTest(a) {
  const { cols, rows } = a;
  a.sym(2, 1, CRATE);
  a.sym(Math.floor(cols / 2) - 2, rows - 2, CRATE);
}

const GENERATORS = { desert: genDesert, snow: genSnow, jungle: genJungle, test: genTest };

/** Ensure every empty cell is reachable from the centre by removing blocking walls. */
function connect(a) {
  const { cols, rows } = a;
  for (let pass = 0; pass < 60; pass++) {
    const seen = new Uint8Array(cols * rows);
    let start = -1;
    for (let k = 0; k < cols * rows && start < 0; k++) if (a.cells[k] !== WALL) start = k;
    if (start < 0) return;
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const k = q.pop();
      const i = k % cols; const j = (k / cols) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di; const nj = j + dj;
        if (!a.inside(ni, nj)) continue;
        const nk = a.idx(ni, nj);
        if (seen[nk] || a.cells[nk] === WALL) continue;
        seen[nk] = 1;
        q.push(nk);
      }
    }
    // find a wall between reached and unreached open cells
    let fixed = false;
    let any = false;
    for (let k = 0; k < cols * rows; k++) {
      if (a.cells[k] === WALL || seen[k]) continue;
      any = true;
      const i = k % cols; const j = (k / cols) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const wi = i + di; const wj = j + dj;
        if (a.get(wi, wj) !== WALL || !a.inside(wi, wj)) continue;
        const oi = wi + di; const oj = wj + dj;
        if (a.inside(oi, oj) && seen[a.idx(oi, oj)]) { a.set(wi, wj, EMPTY); fixed = true; break; }
      }
      if (fixed) break;
    }
    if (!any) return;
    if (!fixed) {
      // fallback: open the unreachable pocket entirely
      for (let k = 0; k < cols * rows; k++) if (!seen[k] && a.cells[k] === WALL) { a.cells[k] = EMPTY; break; }
    }
  }
}

function pickSpawns(a, count, rng) {
  let cand = a.freeCells(1).filter(([i, j]) => i > 0 && j > 0 && i < a.cols - 1 && j < a.rows - 1);
  if (cand.length < count) cand = a.freeCells(0);
  if (!cand.length) cand = [[1, 1]];
  const pts = [];
  // start in a corner-ish spot, then farthest-point sampling
  let first = cand.reduce((b, c) => (c[0] + c[1] < b[0] + b[1] ? c : b), cand[0]);
  pts.push(first);
  const d = cand.map((c) => Math.hypot(c[0] - first[0], c[1] - first[1]));
  while (pts.length < Math.min(count, cand.length)) {
    let best = 0;
    for (let k = 1; k < cand.length; k++) if (d[k] + rng() * 0.3 > d[best]) best = k;
    const p = cand[best];
    pts.push(p);
    for (let k = 0; k < cand.length; k++) d[k] = Math.min(d[k], Math.hypot(cand[k][0] - p[0], cand[k][1] - p[1]));
  }
  // keep spawns clear of crates/barrels
  for (const [i, j] of pts) {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = a.get(i + di, j + dj); if (v === CRATE || v === BARREL) a.set(i + di, j + dj, EMPTY); }
  }
  return pts.map(([i, j]) => ({ x: a.cx(i), z: a.cz(j), angle: Math.atan2(-a.cz(j), -a.cx(i)) }));
}

export function buildArena(layout, nPlayers, seed = (Math.random() * 1e9) | 0) {
  const rng = makeRng(seed);
  const { cols, rows } = arenaSize(nPlayers);
  const a = new Arena(cols, rows);
  (GENERATORS[layout] || genDesert)(a, rng);
  connect(a);
  a.spawns = pickSpawns(a, Math.max(8, Math.ceil(nPlayers * 1.5)), rng);
  a.layout = layout;
  return a;
}
