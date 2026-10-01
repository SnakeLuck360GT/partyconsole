// Neon Trails: deterministic grid simulation (no three.js here).
// Every rider occupies whole cells; the grid stores who owns each cell, so collisions are exact and fair.
// Fixed 60 Hz tick; each rider moves at most one cell per tick (speed accumulator), so interpolation is trivial.

export const TICK = 1 / 60;
export const DX = [1, 0, -1, 0]; // dir 0 = +x (screen right), 1 = +z (screen down), 2 = -x, 3 = -z (screen up)
export const DZ = [0, 1, 0, -1];

export const BASE_SPEED = 11; // cells per second
export const BOOST_MULT = 1.7;
export const SPEED_PU_MULT = 1.4;
export const BOOST_DRAIN = 1 / 1.6; // a full meter lasts 1.6 s
export const BOOST_REGEN = 1 / 5.5; // and refills in 5.5 s
export const BOOST_MIN_START = 0.12;
export const JUMP_TIME = 0.45; // seconds airborne (~5 cells)
export const JUMP_CD = 7;
export const GHOST_TIME = 3.5;
export const SPEED_TIME = 5;
export const SUDDEN_DEATH_AT = 50; // seconds into a round the arena starts collapsing
export const SHRINK_EVERY = 1.1;

export const PICKUPS = ['ghost', 'eraser', 'speed'];

/** Arena size (cells) scales with the number of riders; a wide rectangle fits a TV nicely. */
export function arenaSize(n) {
  const s = 22 * Math.sqrt(Math.max(2, n)) + 22;
  return { W: Math.round((s * 1.25) / 2) * 2, H: Math.round((s * 0.8) / 2) * 2 };
}

// Tiny deterministic-ish RNG so the sim doesn't depend on Math.random ordering elsewhere.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export class Sim {
  constructor(W, H, seed = (Math.random() * 1e9) | 0) {
    this.W = W;
    this.H = H;
    this.grid = new Int16Array(W * H); // 0 empty, else rider slot + 1
    this.riders = [];
    this.pickups = [];
    this.nextPickupId = 1;
    this.rand = rng(seed);
    this.time = 0;
    this.tickNo = 0;
    this.shrink = 0;
    this.shrinkTimer = 0;
    this.pickupTimer = 4 + this.rand() * 2;
    this.events = [];
    this.crashOrder = 0;
    this.stamp = new Int32Array(W * H); // flood-fill visited stamps (AI)
    this.stampNo = 1;
    this.bfsQueue = new Int32Array(W * H);
    this.enablePickups = true;
    this.enableShrink = true;
  }

  idx(x, z) { return z * this.W + x; }
  inBounds(x, z) {
    const k = this.shrink;
    return x >= k && z >= k && x < this.W - k && z < this.H - k;
  }
  free(x, z) { return this.inBounds(x, z) && this.grid[z * this.W + x] === 0; }

  /** Place riders evenly on an ellipse, each facing (roughly) inward, offset so nobody spawns head-on. */
  addRiders(list) {
    const n = list.length;
    const cx = this.W / 2;
    const cz = this.H / 2;
    const rx = this.W * 0.39;
    const rz = this.H * 0.37;
    const spacing = (Math.PI * 2) / n;
    const offset = spacing * 0.18 + 0.12;
    const used = new Set();
    list.forEach((info, i) => {
      const a = offset + i * spacing;
      const vx = Math.cos(a);
      const vz = Math.sin(a);
      let x = Math.max(2, Math.min(this.W - 3, Math.round(cx + vx * rx - 0.5)));
      let z = Math.max(2, Math.min(this.H - 3, Math.round(cz + vz * rz - 0.5)));
      // Heading toward the centre along the dominant axis.
      const dir = Math.abs(vx * rx) >= Math.abs(vz * rz) ? (vx > 0 ? 2 : 0) : (vz > 0 ? 3 : 1);
      // Nudge off already-used cells (dense lobbies).
      for (let tries = 0; used.has(this.idx(x, z)) && tries < 40; tries++) {
        x = Math.max(2, Math.min(this.W - 3, x + (tries % 2 ? 1 : -1) * (1 + (tries >> 1))));
      }
      used.add(this.idx(x, z));
      const r = {
        ...info,
        slot: this.riders.length,
        alive: true,
        x, z, px: x - DX[dir], pz: z - DZ[dir],
        dir,
        queue: [],
        progress: 0,
        speed: BASE_SPEED,
        boost: 1,
        boostHeld: false,
        boosting: false,
        jumpT: 0,
        jumpCd: 0,
        jumpReq: false,
        ghostT: 0,
        speedT: 0,
        cells: [],
        crashedAt: -1,
        place: 0,
        outlived: 0,
        distance: 0,
        killer: null,
        invulnerable: false,
        ai: info.bot ? { skill: info.skill ?? 0.8, boostT: 0 } : null,
      };
      this.riders.push(r);
      this.grid[this.idx(x, z)] = r.slot + 1;
      r.cells.push(this.idx(x, z));
    });
  }

  aliveRiders() { return this.riders.filter((r) => r.alive); }

  /** Queue a relative turn (-1 left, +1 right). Up to 3 queued so quick double taps give U-turns. */
  turn(r, t) {
    if (!r.alive || r.queue.length >= 3) return;
    r.queue.push(t);
  }

  /** Absolute direction request (swipe mode): converted to a relative turn from the last queued heading. */
  steer(r, d) {
    if (!r.alive || r.queue.length >= 3) return;
    let h = r.dir;
    for (const t of r.queue) h = (h + t + 4) % 4;
    if (d === h || d === (h + 2) % 4) return;
    r.queue.push(d === (h + 1) % 4 ? 1 : -1);
  }

  jump(r) {
    if (r.alive && r.jumpCd <= 0 && r.jumpT <= 0) r.jumpReq = true;
  }

  tick() {
    const ev = this.events;
    this.time += TICK;
    this.tickNo++;
    const movers = [];

    // Sudden death: the arena collapses one ring at a time.
    if (this.enableShrink && this.time > SUDDEN_DEATH_AT) {
      this.shrinkTimer -= TICK;
      const minHalf = 5;
      if (this.shrinkTimer <= 0 && this.W - 2 * (this.shrink + 1) > minHalf * 2 && this.H - 2 * (this.shrink + 1) > minHalf * 2) {
        this.shrinkTimer = SHRINK_EVERY;
        this.shrink++;
        ev.push({ type: 'shrink', level: this.shrink });
        for (const r of this.riders) {
          if (r.alive && !this.inBounds(r.x, r.z)) {
            if (r.invulnerable) continue;
            this.crash(r, null, 'zone');
          }
        }
        this.pickups = this.pickups.filter((p) => {
          if (this.inBounds(p.x, p.z)) return true;
          ev.push({ type: 'pickupGone', id: p.id });
          return false;
        });
      }
    }

    // Pickups spawn over time.
    if (this.enablePickups) {
      this.pickupTimer -= TICK;
      const maxP = Math.min(8, 1 + Math.ceil(this.riders.length / 4));
      if (this.pickupTimer <= 0) {
        this.pickupTimer = Math.max(2.5, 7 - this.riders.length * 0.12) * (0.7 + this.rand() * 0.6);
        if (this.pickups.length < maxP) this.spawnPickup();
      }
    }

    for (const r of this.riders) {
      if (!r.alive) continue;
      // Timers
      if (r.jumpCd > 0) r.jumpCd = Math.max(0, r.jumpCd - TICK);
      if (r.ghostT > 0) { r.ghostT -= TICK; if (r.ghostT <= 0) { r.ghostT = 0; ev.push({ type: 'fxEnd', r, kind: 'ghost' }); } }
      if (r.speedT > 0) { r.speedT -= TICK; if (r.speedT <= 0) { r.speedT = 0; ev.push({ type: 'fxEnd', r, kind: 'speed' }); } }
      if (r.ai) this.aiThink(r);
      // Boost meter
      const wantBoost = r.boostHeld && (r.boosting ? r.boost > 0 : r.boost >= BOOST_MIN_START);
      if (wantBoost !== r.boosting) {
        r.boosting = wantBoost;
        ev.push({ type: 'boost', r, on: wantBoost });
      }
      if (r.boosting) {
        r.boost -= BOOST_DRAIN * TICK;
        if (r.boost <= 0) { r.boost = 0; r.boosting = false; ev.push({ type: 'boost', r, on: false, empty: true }); }
      } else if (r.boost < 1) {
        r.boost = Math.min(1, r.boost + BOOST_REGEN * TICK);
        if (r.boost === 1) ev.push({ type: 'boostFull', r });
      }
      // Jump
      if (r.jumpReq) {
        r.jumpReq = false;
        if (r.jumpCd <= 0 && r.jumpT <= 0) {
          r.jumpT = JUMP_TIME;
          r.jumpCd = JUMP_CD;
          ev.push({ type: 'takeoff', r });
        }
      }
      if (r.jumpT > 0) {
        r.jumpT -= TICK;
        if (r.jumpT <= 0) { r.jumpT = 0; r.landPending = true; }
      }
      r.speed = BASE_SPEED * (r.boosting ? BOOST_MULT : 1) * (r.speedT > 0 ? SPEED_PU_MULT : 1);
      r.progress += r.speed * TICK;
      if (r.progress >= 1) {
        r.progress -= 1;
        movers.push(r);
      }
    }

    // Decide targets.
    for (const r of movers) {
      if (r.ai) this.aiDecide(r);
      if (r.queue.length) {
        const t = r.queue.shift();
        r.dir = (r.dir + t + 4) % 4;
        r.turned = true;
      } else r.turned = false;
      r.tx = r.x + DX[r.dir];
      r.tz = r.z + DZ[r.dir];
    }

    // Resolve collisions against the grid as it was before this tick, plus same-tick head-ons.
    const claims = new Map();
    for (const r of movers) {
      if (r.jumpT > 0 || r.ghostT > 0) continue;
      if (!this.inBounds(r.tx, r.tz)) continue;
      const k = this.idx(r.tx, r.tz);
      if (claims.has(k)) claims.get(k).push(r); else claims.set(k, [r]);
    }
    const crashed = new Set();
    for (const r of movers) {
      if (!this.inBounds(r.tx, r.tz)) {
        if (r.invulnerable) { r.stopped = true; continue; }
        crashed.add(r); r._reason = 'arena'; r._by = null;
        continue;
      }
      if (r.jumpT > 0 || r.ghostT > 0) continue;
      const k = this.idx(r.tx, r.tz);
      const owner = this.grid[k];
      if (owner) {
        if (r.invulnerable) { r.stopped = true; continue; }
        crashed.add(r);
        r._by = this.riders[owner - 1];
        r._reason = r._by === r ? 'self' : 'trail';
      } else if (claims.get(k).length > 1) {
        if (r.invulnerable) { r.stopped = true; continue; }
        crashed.add(r);
        r._by = claims.get(k).find((o) => o !== r) || null;
        r._reason = 'headon';
      }
    }

    // Move survivors.
    for (const r of movers) {
      if (crashed.has(r)) continue;
      if (r.stopped) { r.stopped = false; r.px = r.x; r.pz = r.z; continue; }
      const cornerX = r.x;
      const cornerZ = r.z;
      r.px = r.x; r.pz = r.z;
      r.x = r.tx; r.z = r.tz;
      r.distance++;
      if (r.turned) ev.push({ type: 'turn', r, x: cornerX, z: cornerZ });
      if (r.jumpT > 0) continue; // airborne: leaves a gap
      if (r.landPending) {
        r.landPending = false;
        ev.push({ type: 'land', r, x: cornerX, z: cornerZ });
        const ck = this.idx(cornerX, cornerZ);
        if (this.grid[ck] === 0) { this.grid[ck] = r.slot + 1; r.cells.push(ck); }
      }
      const k = this.idx(r.x, r.z);
      if (this.grid[k] === 0) {
        this.grid[k] = r.slot + 1;
        r.cells.push(k);
      }
      // Pickups (lenient: adjacent cells count).
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i];
        if (Math.abs(p.x - r.x) <= 1 && Math.abs(p.z - r.z) <= 1) {
          this.pickups.splice(i, 1);
          this.applyPickup(r, p);
        }
      }
    }
    for (const r of crashed) this.crash(r, r._by, r._reason);
  }

  crash(r, by, reason) {
    if (!r.alive) return;
    r.alive = false;
    r.boosting = false;
    r.killer = by;
    r.crashedAt = this.tickNo;
    // Everyone who already crashed on an earlier tick has been outlived by this rider.
    r.outlived = this.riders.filter((o) => o !== r && !o.alive && o.crashedAt < this.tickNo).length;
    this.events.push({ type: 'crash', r, by, reason, x: r.x + DX[r.dir] * 0.5, z: r.z + DZ[r.dir] * 0.5 });
  }

  /** Remove a crashed rider's wall (derez) so the space opens up again. */
  clearTrail(r) {
    const me = r.slot + 1;
    for (const k of r.cells) if (this.grid[k] === me) this.grid[k] = 0;
    r.cells.length = 0;
  }

  applyPickup(r, p) {
    if (p.kind === 'ghost') r.ghostT = GHOST_TIME;
    else if (p.kind === 'speed') r.speedT = SPEED_TIME;
    else if (p.kind === 'eraser') {
      this.clearTrail(r);
      const k = this.idx(r.x, r.z);
      if (this.grid[k] === 0) { this.grid[k] = r.slot + 1; r.cells.push(k); }
    }
    this.events.push({ type: 'pickup', r, kind: p.kind, id: p.id, x: p.x, z: p.z });
  }

  spawnPickup() {
    for (let tries = 0; tries < 40; tries++) {
      const m = this.shrink + 4;
      const x = m + Math.floor(this.rand() * (this.W - 2 * m));
      const z = m + Math.floor(this.rand() * (this.H - 2 * m));
      if (!this.free(x, z)) continue;
      if (this.pickups.some((p) => Math.abs(p.x - x) + Math.abs(p.z - z) < 8)) continue;
      if (this.riders.some((r) => r.alive && Math.abs(r.x - x) + Math.abs(r.z - z) < 6)) continue;
      const kind = PICKUPS[Math.floor(this.rand() * PICKUPS.length)];
      const p = { id: this.nextPickupId++, x, z, kind };
      this.pickups.push(p);
      this.events.push({ type: 'pickupSpawn', p });
      return;
    }
  }

  // ------------------------------------------------------------------ AI

  /** Free cells reachable from (x,z), capped at `limit`. */
  flood(x, z, limit) {
    if (!this.free(x, z)) return 0;
    const st = ++this.stampNo;
    const q = this.bfsQueue;
    const W = this.W;
    let head = 0;
    let tail = 0;
    q[tail++] = z * W + x;
    this.stamp[z * W + x] = st;
    let count = 0;
    while (head < tail && count < limit) {
      const k = q[head++];
      count++;
      const cx = k % W;
      const cz = (k / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d];
        const nz = cz + DZ[d];
        if (!this.inBounds(nx, nz)) continue;
        const nk = nz * W + nx;
        if (this.stamp[nk] === st || this.grid[nk] !== 0) continue;
        this.stamp[nk] = st;
        q[tail++] = nk;
      }
    }
    return count;
  }

  runLength(x, z, d, max) {
    let n = 0;
    let cx = x;
    let cz = z;
    while (n < max) {
      cx += DX[d];
      cz += DZ[d];
      if (!this.free(cx, cz)) break;
      n++;
    }
    return n;
  }

  aiThink(r) {
    const ai = r.ai;
    if (ai.boostT > 0) { ai.boostT -= TICK; r.boostHeld = ai.boostT > 0; }
  }

  aiDecide(r) {
    if (r.queue.length) return;
    const ai = r.ai;
    const straightRun = this.runLength(r.x, r.z, r.dir, 24);
    const lookahead = 3 + Math.floor(ai.skill * 6);
    const nearPickup = this.pickups.find((p) => Math.abs(p.x - r.x) + Math.abs(p.z - r.z) < 14);
    const wander = this.rand() < 0.035;
    if (straightRun > lookahead && !wander && !nearPickup) {
      if (!r.invulnerable && ai.boostT <= 0 && straightRun > 16 && r.boost > 0.8 && this.rand() < 0.03) ai.boostT = 0.4 + this.rand() * 0.6;
      return;
    }
    const limit = 60 + Math.floor(ai.skill * 140);
    let best = 0;
    let bestScore = -Infinity;
    for (const t of [0, -1, 1]) {
      const d = (r.dir + t + 4) % 4;
      const nx = r.x + DX[d];
      const nz = r.z + DZ[d];
      if (!this.free(nx, nz)) continue;
      const area = this.flood(nx, nz, limit);
      const run = this.runLength(r.x, r.z, d, 20);
      let score = area * 1.0 + run * 1.5 + (t === 0 ? 2 : 0) + this.rand() * (6 - ai.skill * 4);
      // Avoid cells right in front of other riders' heads.
      for (const o of this.riders) {
        if (o === r || !o.alive) continue;
        const ox = o.x + DX[o.dir];
        const oz = o.z + DZ[o.dir];
        if (Math.abs(ox - nx) + Math.abs(oz - nz) <= 1) score -= 25;
      }
      if (nearPickup) {
        const before = Math.abs(nearPickup.x - r.x) + Math.abs(nearPickup.z - r.z);
        const after = Math.abs(nearPickup.x - nx) + Math.abs(nearPickup.z - nz);
        if (after < before) score += 8;
      }
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (bestScore === -Infinity) {
      // Boxed in: try a jump if it's ready.
      if (r.jumpCd <= 0 && !r.invulnerable) this.jump(r);
      return;
    }
    if (best !== 0) r.queue.push(best);
  }
}
