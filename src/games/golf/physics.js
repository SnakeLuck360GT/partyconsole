// Putt Party physics: sphere-vs-triangle-soup golf physics with fixed substeps.
// The course colliders are the exact render triangles of the tile meshes (static grid-hashed soup),
// plus kinematic triangle bodies (windmill blades, movers, spinners) and analytic bumpers.
// Deterministic (fixed dt), no tunnelling (substeps keep travel per step < ball radius).

const G = 9.81;
const CELL = 0.5;
const ROLL_FACTOR = 5 / 7; // solid sphere rolling: a = 5/7 g sin(theta)

export const BALL_R = 0.05;

// Surface tuning
const ROLL_DECEL = 0.62; // m/s^2 rolling resistance on grass
const ROLL_DRAG = 0.28; // 1/s velocity-proportional drag while rolling
const SAND_DECEL = 5.5;
const SAND_DRAG = 2.4;
const STATIC_SLOPE = 0.35; // m/s^2 of (rolling) slope accel that rolling friction can hold
const WALL_E = 0.72; // wall restitution
const GROUND_E = 0.3; // bounce when landing hard

function key(ix, iz) { return (ix + 2048) * 4096 + (iz + 2048); }

/** Closest point on triangle (Ericson). Writes into out[0..2], returns feature code 0=face,1=edge/vertex. */
function closestPtTri(px, py, pz, t, o, out) {
  const ax = t[o], ay = t[o + 1], az = t[o + 2];
  const bx = t[o + 3], by = t[o + 4], bz = t[o + 5];
  const cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return 1; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return 1; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz; return 1;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return 1; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz; return 1;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz); return 1;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w;
  return 0;
}

export class Ball {
  constructor(id, x, y, z) {
    this.id = id;
    this.r = BALL_R;
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.sleeping = true;
    this.active = true; // participates in simulation
    this.still = 0; // time spent slow
    this.age = 0; // time since shot
    this.grounded = false;
    this.gnx = 0; this.gny = 1; this.gnz = 0;
    this.lastImpact = 0;
    this.lipped = 0;
    this.spin = 0; // visual roll angle accumulator helpers
  }
  get speed() { return Math.hypot(this.vx, this.vy, this.vz); }
  wake() { this.sleeping = false; this.still = 0; }
  stop() { this.vx = this.vy = this.vz = 0; this.sleeping = true; }
}

export class GolfWorld {
  constructor() {
    this.tris = new Float32Array(0); // 9 per tri
    this.grid = new Map();
    this.kinematics = [];
    this.bumpers = [];
    this.time = 0;
    this.surfaceAt = () => 0; // (x, z, y) -> 0 normal, 1 sand
    this._tmp = new Float32Array(3);
    this._stamp = new Uint32Array(0);
    this._stampId = 1;
    this.ballCollisions = false;
  }

  /** Static triangles: Float32Array of 9 floats per triangle (world space). */
  setStatic(tris) {
    this.tris = tris;
    this.grid.clear();
    const n = tris.length / 9;
    this._stamp = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const minx = Math.min(tris[o], tris[o + 3], tris[o + 6]) - 0.01;
      const maxx = Math.max(tris[o], tris[o + 3], tris[o + 6]) + 0.01;
      const minz = Math.min(tris[o + 2], tris[o + 5], tris[o + 8]) - 0.01;
      const maxz = Math.max(tris[o + 2], tris[o + 5], tris[o + 8]) + 0.01;
      for (let ix = Math.floor(minx / CELL); ix <= Math.floor(maxx / CELL); ix++) {
        for (let iz = Math.floor(minz / CELL); iz <= Math.floor(maxz / CELL); iz++) {
          const k = key(ix, iz);
          let arr = this.grid.get(k);
          if (!arr) { arr = []; this.grid.set(k, arr); }
          arr.push(i);
        }
      }
    }
  }

  /**
   * Kinematic triangle body. `local` = Float32Array (9/tri) in body space; `pose(t)` returns
   * {m: [16 col-major matrix elements]} for time t. `bounce` multiplies restitution.
   */
  addKinematic(body) {
    body.m = new Float64Array(16);
    body.mPrev = new Float64Array(16);
    body.inv = new Float64Array(16);
    body.bounce = body.bounce ?? 1;
    // bounding sphere in local space
    let cx = 0, cy = 0, cz = 0;
    const L = body.local;
    const n = L.length / 3;
    for (let i = 0; i < L.length; i += 3) { cx += L[i]; cy += L[i + 1]; cz += L[i + 2]; }
    cx /= n; cy /= n; cz /= n;
    let rad = 0;
    for (let i = 0; i < L.length; i += 3) rad = Math.max(rad, Math.hypot(L[i] - cx, L[i + 1] - cy, L[i + 2] - cz));
    body.center = [cx, cy, cz];
    body.radius = rad;
    body.world = new Float32Array(L.length);
    this.kinematics.push(body);
    this._poseKinematic(body, this.time);
    body.mPrev.set(body.m);
    this._bake(body);
    return body;
  }

  addBumper(b) { this.bumpers.push({ boost: 1.25, minOut: 2.2, h: 0.2, ...b, hit: 0 }); }

  _poseKinematic(body, t) {
    body.mPrev.set(body.m);
    body.pose(t, body.m);
  }

  _bake(body) {
    const m = body.m, L = body.local, W = body.world;
    for (let i = 0; i < L.length; i += 3) {
      const x = L[i], y = L[i + 1], z = L[i + 2];
      W[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      W[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      W[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    const [cx, cy, cz] = body.center;
    body.wc = [m[0] * cx + m[4] * cy + m[8] * cz + m[12], m[1] * cx + m[5] * cy + m[9] * cz + m[13], m[2] * cx + m[6] * cy + m[10] * cz + m[14]];
    // inverse of rigid transform (rotation + translation; bodies may have uniform scale s)
    const s2 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
    const inv = body.inv;
    inv[0] = m[0] / s2; inv[1] = m[4] / s2; inv[2] = m[8] / s2; inv[3] = 0;
    inv[4] = m[1] / s2; inv[5] = m[5] / s2; inv[6] = m[9] / s2; inv[7] = 0;
    inv[8] = m[2] / s2; inv[9] = m[6] / s2; inv[10] = m[10] / s2; inv[11] = 0;
    inv[12] = -(inv[0] * m[12] + inv[4] * m[13] + inv[8] * m[14]);
    inv[13] = -(inv[1] * m[12] + inv[5] * m[13] + inv[9] * m[14]);
    inv[14] = -(inv[2] * m[12] + inv[6] * m[13] + inv[10] * m[14]);
    inv[15] = 1;
  }

  /** Velocity of a kinematic body's surface at world point p (finite difference of poses). */
  _surfVel(body, px, py, pz, dt, out) {
    const inv = body.inv, mp = body.mPrev;
    const lx = inv[0] * px + inv[4] * py + inv[8] * pz + inv[12];
    const ly = inv[1] * px + inv[5] * py + inv[9] * pz + inv[13];
    const lz = inv[2] * px + inv[6] * py + inv[10] * pz + inv[14];
    const qx = mp[0] * lx + mp[4] * ly + mp[8] * lz + mp[12];
    const qy = mp[1] * lx + mp[5] * ly + mp[9] * lz + mp[13];
    const qz = mp[2] * lx + mp[6] * ly + mp[10] * lz + mp[14];
    out[0] = (px - qx) / dt; out[1] = (py - qy) / dt; out[2] = (pz - qz) / dt;
  }

  /** Advance the world by dt seconds (balls: array of Ball). hooks.post(ball, h) runs every substep. */
  step(balls, dt, hooks = {}) {
    let maxV = 0;
    for (const b of balls) if (b.active && !b.sleeping) maxV = Math.max(maxV, b.speed);
    const base = 1 / 240;
    let n = Math.max(1, Math.ceil(dt / base));
    const needed = Math.ceil((maxV * dt) / (BALL_R * 0.45));
    if (needed > n) n = Math.min(needed, 40);
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      this.time += h;
      for (const k of this.kinematics) { this._poseKinematic(k, this.time); this._bake(k); }
      for (const b of balls) {
        if (!b.active) continue;
        if (b.sleeping) { this._pokeSleeper(b, h); if (b.sleeping) continue; }
        this._integrate(b, h);
        hooks.post?.(b, h);
      }
      if (this.ballCollisions) this._ballBall(balls, hooks);
      for (const bp of this.bumpers) bp.hit = Math.max(0, bp.hit - h);
    }
  }

  /** Sleeping balls can be shoved by moving obstacles. */
  _pokeSleeper(b, h) {
    const t = this._tmp;
    const sv = [0, 0, 0];
    for (const k of this.kinematics) {
      const dx = b.x - k.wc[0], dy = b.y - k.wc[1], dz = b.z - k.wc[2];
      const rr = k.radius + b.r;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      const W = k.world;
      for (let o = 0; o < W.length; o += 9) {
        closestPtTri(b.x, b.y, b.z, W, o, t);
        const ex = b.x - t[0], ey = b.y - t[1], ez = b.z - t[2];
        if (ex * ex + ey * ey + ez * ez < (b.r - 0.002) * (b.r - 0.002)) {
          this._surfVel(k, t[0], t[1], t[2], h, sv);
          if (Math.hypot(sv[0], sv[1], sv[2]) > 0.01) { b.wake(); return; }
        }
      }
    }
  }

  _integrate(b, h) {
    b.age += h;
    // gravity (reduced along the support plane for rolling)
    let gx = 0, gy = -G, gz = 0;
    if (b.grounded) {
      const nx = b.gnx, ny = b.gny, nz = b.gnz;
      const gn = gy * ny; // g . n
      // tangential component
      const tx = gx - gn * nx, ty = gy - gn * ny, tz = gz - gn * nz;
      gx -= (1 - ROLL_FACTOR) * tx; gy -= (1 - ROLL_FACTOR) * ty; gz -= (1 - ROLL_FACTOR) * tz;
    }
    b.vx += gx * h; b.vy += gy * h; b.vz += gz * h;

    // rolling resistance
    if (b.grounded) {
      const nx = b.gnx, ny = b.gny, nz = b.gnz;
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      const tvx = b.vx - vn * nx, tvy = b.vy - vn * ny, tvz = b.vz - vn * nz;
      const sp = Math.hypot(tvx, tvy, tvz);
      const sand = this.surfaceAt(b.x, b.z, b.y) === 1;
      const decel = (sand ? SAND_DECEL : ROLL_DECEL) * Math.max(0.3, ny) + (sand ? SAND_DRAG : ROLL_DRAG) * sp;
      if (sp > 1e-6) {
        const k = Math.max(0, sp - decel * h) / sp;
        b.vx = vn * nx + tvx * k; b.vy = vn * ny + tvy * k; b.vz = vn * nz + tvz * k;
      }
      // static hold on gentle slopes
      const slopeAcc = G * ROLL_FACTOR * Math.sqrt(Math.max(0, 1 - ny * ny));
      const hold = sand ? STATIC_SLOPE * 4 : STATIC_SLOPE;
      if (sp < 0.06 && slopeAcc < hold) {
        b.still += h;
        if (b.still > 0.25) { b.stop(); b.grounded = true; return; }
      } else if (sp < 0.03 && ny > 0.99) {
        b.still += h;
        if (b.still > 0.4) { b.stop(); return; }
      } else b.still = 0;
    } else b.still = 0;

    b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
    if (b.age > 25) { b.stop(); return; } // safety: nothing rolls forever

    this._collide(b, h);
  }

  _collide(b, h) {
    const r = b.r;
    const t = this._tmp;
    const sv = [0, 0, 0];
    b.grounded = false;
    let gnx = 0, gny = 0, gnz = 0;
    let impact = 0;
    // candidate static triangles
    const cand = this._cand || (this._cand = []);
    cand.length = 0;
    const stamp = ++this._stampId;
    const x0 = Math.floor((b.x - r) / CELL), x1 = Math.floor((b.x + r) / CELL);
    const z0 = Math.floor((b.z - r) / CELL), z1 = Math.floor((b.z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.grid.get(key(ix, iz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const ti = arr[i];
          if (this._stamp[ti] === stamp) continue;
          this._stamp[ti] = stamp;
          cand.push(ti);
        }
      }
    }
    const T = this.tris;
    for (let iter = 0; iter < 4; iter++) {
      let any = false;
      // pass 1: face contacts, pass 2: edge/vertex contacts (avoids internal-edge snags)
      for (let pass = 0; pass < 2; pass++) {
        for (let c = 0; c < cand.length; c++) {
          const o = cand[c] * 9;
          if (Math.abs(T[o + 1] - b.y) > 2 && Math.abs(T[o + 4] - b.y) > 2 && Math.abs(T[o + 7] - b.y) > 2) continue;
          const feat = closestPtTri(b.x, b.y, b.z, T, o, t);
          if (feat !== pass) continue;
          const dx = b.x - t[0], dy = b.y - t[1], dz = b.z - t[2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2);
          if (pass === 1 && r - d < 2e-4) continue;
          let nx, ny, nz;
          if (d > 1e-7) { nx = dx / d; ny = dy / d; nz = dz / d; } else { nx = 0; ny = 1; nz = 0; }
          const pen = r - d;
          b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;
          const im = this._respond(b, nx, ny, nz, 0, 0, 0, 1);
          if (im > impact) impact = im;
          if (ny > 0.35) { gnx += nx; gny += ny; gnz += nz; b.grounded = true; } else if (ny > -0.2 && d < r) { /* wall */ }
          if (ny <= 0.35) { gnx += nx * 0.5; gny += ny * 0.5; gnz += nz * 0.5; if (ny < -0.35) b.grounded = true; }
          any = true;
        }
      }
      // kinematic bodies
      for (const k of this.kinematics) {
        const dx0 = b.x - k.wc[0], dy0 = b.y - k.wc[1], dz0 = b.z - k.wc[2];
        const rr = k.radius + r + 0.05;
        if (dx0 * dx0 + dy0 * dy0 + dz0 * dz0 > rr * rr) continue;
        const W = k.world;
        for (let o = 0; o < W.length; o += 9) {
          closestPtTri(b.x, b.y, b.z, W, o, t);
          const dx = b.x - t[0], dy = b.y - t[1], dz = b.z - t[2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2);
          let nx, ny, nz;
          if (d > 1e-7) { nx = dx / d; ny = dy / d; nz = dz / d; } else { nx = 0; ny = 1; nz = 0; }
          const pen = r - d;
          b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;
          this._surfVel(k, t[0], t[1], t[2], h, sv);
          const im = this._respond(b, nx, ny, nz, sv[0], sv[1], sv[2], k.bounce);
          if (im > impact) impact = im;
          if (ny > 0.35) { gnx += nx; gny += ny; gnz += nz; b.grounded = true; }
          k.hit = 0.2;
          any = true;
        }
      }
      if (!any) break;
    }
    // bumpers (vertical cylinders)
    for (const bp of this.bumpers) {
      if (b.y < bp.y - 0.02 || b.y > bp.y + bp.h + r) continue;
      const dx = b.x - bp.x, dz = b.z - bp.z;
      const d = Math.hypot(dx, dz);
      const R = bp.radius + r;
      if (d >= R || d < 1e-6) continue;
      const nx = dx / d, nz = dz / d;
      b.x = bp.x + nx * R; b.z = bp.z + nz * R;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        const out = Math.max(-vn * bp.boost, bp.minOut);
        b.vx += (out - vn) * nx; b.vz += (out - vn) * nz;
        impact = Math.max(impact, out + 10);
        bp.hit = 0.25;
        b.bumped = bp;
      }
    }
    if (b.grounded) {
      const l = Math.hypot(gnx, gny, gnz) || 1;
      b.gnx = gnx / l; b.gny = gny / l; b.gnz = gnz / l;
    }
    if (impact > 0) b.lastImpact = impact;
  }

  /** Impulse response against a surface with normal n moving at velocity s. Returns impact speed. */
  _respond(b, nx, ny, nz, sx, sy, sz, bounce) {
    const rvx = b.vx - sx, rvy = b.vy - sy, rvz = b.vz - sz;
    const vn = rvx * nx + rvy * ny + rvz * nz;
    if (vn >= 0) return 0;
    let e;
    if (ny > 0.6) e = vn < -1.2 ? GROUND_E : 0;
    else e = (vn < -0.25 ? WALL_E : 0.2) * bounce;
    let nvx = rvx - (1 + e) * vn * nx;
    let nvy = rvy - (1 + e) * vn * ny;
    let nvz = rvz - (1 + e) * vn * nz;
    if (ny <= 0.6 && ny >= -0.6) {
      // wall friction: slightly damp tangential speed on hard hits
      const f = 1 - Math.min(0.12, -vn * 0.02);
      const vn2 = nvx * nx + nvy * ny + nvz * nz;
      nvx = vn2 * nx + (nvx - vn2 * nx) * f;
      nvy = vn2 * ny + (nvy - vn2 * ny) * f;
      nvz = vn2 * nz + (nvz - vn2 * nz) * f;
    }
    b.vx = nvx + sx; b.vy = nvy + sy; b.vz = nvz + sz;
    return ny > 0.6 ? 0 : -vn;
  }

  _ballBall(balls, hooks) {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.active || a.ghost) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const c = balls[j];
        if (!c.active || c.ghost || (a.sleeping && c.sleeping)) continue;
        const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const R = a.r + c.r;
        if (d2 >= R * R || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const pen = (R - d) / 2;
        a.x -= nx * pen; a.y -= ny * pen; a.z -= nz * pen;
        c.x += nx * pen; c.y += ny * pen; c.z += nz * pen;
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny + (c.vz - a.vz) * nz;
        if (rv < 0) {
          const jimp = -(1 + 0.9) * rv / 2;
          a.vx -= jimp * nx; a.vy -= jimp * ny; a.vz -= jimp * nz;
          c.vx += jimp * nx; c.vy += jimp * ny; c.vz += jimp * nz;
          a.wake(); c.wake();
          hooks.clack?.(a, c, -rv);
        }
      }
    }
  }

  /** Predict a ball's path (no side effects). Returns [x,y,z,...] points every `every` seconds. */
  predict(x, y, z, vx, vy, vz, { seconds = 0.8, every = 0.03, maxLen = 3 } = {}) {
    const b = new Ball('p', x, y, z);
    b.vx = vx; b.vy = vy; b.vz = vz; b.sleeping = false; b.grounded = true;
    const pts = [x, y, z];
    const saveT = this.time;
    const h = 1 / 240;
    let acc = 0, len = 0, px = x, py = y, pz = z;
    for (let t = 0; t < seconds; t += h) {
      this._integrate(b, h);
      if (b.sleeping) break;
      acc += h;
      len += Math.hypot(b.x - px, b.y - py, b.z - pz);
      px = b.x; py = b.y; pz = b.z;
      if (acc >= every) { acc = 0; pts.push(b.x, b.y, b.z); }
      if (len > maxLen || b.y < -1) break;
    }
    this.time = saveT;
    return pts;
  }
}
