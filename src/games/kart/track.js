// Track geometry & queries (no rendering). A closed CatmullRom spline sampled every ~1 m.
import * as THREE from 'three';

export class Track {
  constructor(def) {
    this.def = def;
    this.halfWidth = def.halfWidth;
    this.wallDist = def.halfWidth + def.shoulder;
    const pts = def.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.curve = curve;
    const approxL = curve.getLength();
    const N = Math.round(approxL);
    this.N = N;
    const sp = curve.getSpacedPoints(N); // N+1 points, last == first
    this.px = new Float32Array(N);
    this.py = new Float32Array(N);
    this.pz = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.px[i] = sp[i].x; this.py[i] = sp[i].y; this.pz[i] = sp[i].z; }
    // real spacing
    let L = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      L += Math.hypot(this.px[j] - this.px[i], this.pz[j] - this.pz[i]);
    }
    this.L = L;
    this.seg = L / N; // metres per sample
    // tangents / right vectors / heading
    this.tx = new Float32Array(N); this.tz = new Float32Array(N);
    this.rx = new Float32Array(N); this.rz = new Float32Array(N);
    this.hd = new Float32Array(N); this.slope = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N;
      const b = (i + 1) % N;
      let dx = this.px[b] - this.px[a];
      let dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      this.tx[i] = dx; this.tz[i] = dz;
      this.rx[i] = -dz; this.rz[i] = dx;
      this.hd[i] = Math.atan2(dx, dz);
      this.slope[i] = (this.py[b] - this.py[a]) / l;
    }
    // signed curvature (heading change per metre), smoothed
    const curv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const b = (i + 2) % N;
      const a = (i - 2 + N) % N;
      let d = this.hd[b] - this.hd[a];
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      curv[i] = d / (4 * this.seg);
    }
    this.curv = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -4; k <= 4; k++) s += curv[(i + k + N) % N];
      this.curv[i] = s / 9;
    }
    // racing line: lateral offset toward the inside of corners (apex), centred on straights
    this.line = new Float32Array(N);
    const W = Math.max(4, Math.round(16 / this.seg));
    for (let i = 0; i < N; i++) {
      let c = 0;
      for (let k = -W; k <= W; k++) c += this.curv[(i + k + N) % N];
      c /= 2 * W + 1;
      this.line[i] = Math.max(-0.62 * this.halfWidth, Math.min(0.62 * this.halfWidth, -c * 170));
    }
    // features
    this.jumps = (def.jumps || []).map((j) => ({ ...j, s: this.nearestS(j.at[0], j.at[1]) }));
    this.boosts = (def.boosts || []).map((b) => ({ ...b, s: this.nearestS(b.at[0], b.at[1]), len: 7, half: 2.6 }));
    this.items = (def.items || []).map((b) => ({ ...b, s: this.nearestS(b.at[0], b.at[1]) }));
  }

  wrapS(s) { const L = this.L; return ((s % L) + L) % L; }

  nearestIdx(x, z) {
    let best = 0; let bd = Infinity;
    for (let i = 0; i < this.N; i++) {
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  nearestS(x, z) { return this.nearestIdx(x, z) * this.seg; }

  /** Project a world XZ point near hint index. Writes into `out` {idx, s, lat, y, rx, rz, hd}. */
  project(x, z, hint, out, window = 14) {
    const N = this.N;
    let best = hint; let bd = Infinity;
    for (let k = -window; k <= window; k++) {
      const i = (hint + k + N) % N;
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    // refine along the segment toward the neighbour
    const i0 = best;
    const i1 = (best + 1) % N;
    const im = (best - 1 + N) % N;
    const fx = x - this.px[i0];
    const fz = z - this.pz[i0];
    let t = fx * this.tx[i0] + fz * this.tz[i0]; // metres along tangent
    let a = i0; let b = i1;
    if (t < 0) { a = im; b = i0; t += this.seg; }
    const u = Math.min(1, Math.max(0, t / this.seg));
    const cx = this.px[a] + (this.px[b] - this.px[a]) * u;
    const cz = this.pz[a] + (this.pz[b] - this.pz[a]) * u;
    const cy = this.py[a] + (this.py[b] - this.py[a]) * u;
    const rx = this.rx[a] + (this.rx[b] - this.rx[a]) * u;
    const rz = this.rz[a] + (this.rz[b] - this.rz[a]) * u;
    const rl = Math.hypot(rx, rz) || 1;
    out.idx = i0;
    out.s = (a + u) * this.seg;
    out.rx = rx / rl; out.rz = rz / rl;
    out.lat = (x - cx) * out.rx + (z - cz) * out.rz;
    out.y = cy;
    // tangent = (rz, -rx) since r = (-tz, tx); heading convention: forward = (sin hd, cos hd)
    out.hd = Math.atan2(out.rz, -out.rx);
    return out;
  }

  /** Point on the centreline at arc length s, plus lateral offset. */
  pointAt(s, lat = 0, out = {}) {
    s = this.wrapS(s);
    const f = s / this.seg;
    const a = Math.floor(f) % this.N;
    const b = (a + 1) % this.N;
    const u = f - Math.floor(f);
    const rx = this.rx[a] + (this.rx[b] - this.rx[a]) * u;
    const rz = this.rz[a] + (this.rz[b] - this.rz[a]) * u;
    const rl = Math.hypot(rx, rz) || 1;
    out.rx = rx / rl; out.rz = rz / rl;
    out.x = this.px[a] + (this.px[b] - this.px[a]) * u + out.rx * lat;
    out.z = this.pz[a] + (this.pz[b] - this.pz[a]) * u + out.rz * lat;
    out.y = this.py[a] + (this.py[b] - this.py[a]) * u;
    out.hd = Math.atan2(out.rz, -out.rx);
    out.idx = a;
    return out;
  }

  /** Extra ground height from jump ramps at arc length s / lateral lat. */
  rampHeight(s, lat) {
    for (const j of this.jumps) {
      let d = s - (j.s - j.len);
      if (d < -this.L / 2) d += this.L;
      if (d > this.L / 2) d -= this.L;
      if (d >= 0 && d <= j.len && Math.abs(lat) <= j.half) {
        const u = d / j.len;
        return j.h * (u * 0.6 + u * u * 0.4);
      }
    }
    return 0;
  }

  /** True within the last few metres of a jump ramp (so leaving the ground there counts as a ramp jump). */
  onRampLip(s) {
    for (const j of this.jumps) {
      const d = this.deltaS(s, j.s);
      if (d > -3.5 && d < 1.5) return true;
    }
    return false;
  }

  /** Arc length of the centreline point nearest to (x, z), searching around sample `hint`. */
  nearestSFast(x, z, hint) {
    this.project(x, z, hint, this._tmp || (this._tmp = {}), 40);
    return this._tmp.s;
  }

  /** Racing-line lateral offset at arc length s. */
  lineAt(s) {
    const f = this.wrapS(s) / this.seg;
    const a = Math.floor(f) % this.N;
    const b = (a + 1) % this.N;
    const u = f - Math.floor(f);
    return this.line[a] + (this.line[b] - this.line[a]) * u;
  }

  /** Max |curvature| over [s, s+len] (sampled), signed by the dominant direction. */
  curvAhead(s, len) {
    let best = 0;
    const n = Math.max(1, Math.round(len / (this.seg * 2)));
    for (let k = 0; k <= n; k++) {
      const i = Math.floor(this.wrapS(s + (k * len) / n) / this.seg) % this.N;
      const c = this.curv[i];
      if (Math.abs(c) > Math.abs(best)) best = c;
    }
    return best;
  }

  /** Signed difference a-b along the loop, in [-L/2, L/2]. */
  deltaS(a, b) {
    let d = a - b;
    const L = this.L;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return d;
  }
}
