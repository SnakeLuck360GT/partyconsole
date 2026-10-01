// Light-wall ribbons. One growing BufferGeometry per rider: each straight run (between turns/jumps) is a
// segment of 10 vertices (3-row vertical wall + a bright top cap). Only the open head segment changes
// per frame, so the per-frame cost is a tiny buffer update. The same geometry is drawn a second time,
// mirrored under the floor, as a cheap glossy reflection.
import * as THREE from 'three';

export const WALL_H = 1.15;
const VPS = 10; // vertices per segment
const IPS = 18; // indices per segment
const MID = 0.55;
const CAP = 0.1;
const GLOW = [0.95, 0.95, 0.28, 0.28, 0.85, 0.85, 2.6, 2.6, 2.6, 2.6];

const vert = /* glsl */`
  attribute float aGlow;
  varying float vGlow;
  varying float vY;
  void main() {
    vGlow = aGlow;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vY = wp.y;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const frag = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uReflect;
  uniform float uFlicker;
  varying float vGlow;
  varying float vY;
  void main() {
    vec3 c = uColor * vGlow;
    if (uReflect > 0.5) {
      float f = clamp(1.0 + vY / 1.4, 0.0, 1.0);
      c *= f * f * 0.32;
    }
    gl_FragColor = vec4(c * uOpacity * uFlicker, 1.0);
  }`;

export function trailMaterial(color, reflect = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uReflect: { value: reflect ? 1 : 0 },
      uFlicker: { value: 1 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export class Trail {
  constructor(parent, reflParent, color, capacity = 64) {
    this.mat = trailMaterial(color, false);
    this.reflMat = trailMaterial(color, true);
    this.count = 0;
    this.capacity = 0;
    this.open = false;
    this.geo = null;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.refl = new THREE.Mesh(this.mesh.geometry, this.reflMat);
    for (const m of [this.mesh, this.refl]) { m.frustumCulled = false; m.renderOrder = 2; }
    this.refl.renderOrder = -5;
    parent.add(this.mesh);
    reflParent.add(this.refl);
    this.allocate(capacity);
  }

  allocate(cap) {
    const old = this.geo;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(cap * VPS * 3);
    const glow = new Float32Array(cap * VPS);
    const idx = new Uint32Array(cap * IPS);
    for (let s = 0; s < cap; s++) {
      for (let v = 0; v < VPS; v++) glow[s * VPS + v] = GLOW[v];
      const b = s * VPS;
      idx.set([b, b + 1, b + 3, b, b + 3, b + 2, b + 2, b + 3, b + 5, b + 2, b + 5, b + 4, b + 6, b + 7, b + 9, b + 6, b + 9, b + 8], s * IPS);
    }
    if (old) pos.set(old.attributes.position.array.subarray(0, this.count * VPS * 3));
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, this.count * IPS);
    this.geo = g;
    this.capacity = cap;
    this.mesh.geometry = g;
    this.refl.geometry = g;
    old?.dispose();
  }

  reset() {
    this.count = 0;
    this.open = false;
    this.geo.setDrawRange(0, 0);
  }

  /** Start a new straight run at (x,z). */
  start(x, z) {
    if (this.count >= this.capacity) this.allocate(this.capacity * 2);
    this.count++;
    this.open = true;
    this.ax = x;
    this.az = z;
    this.write(this.count - 1, x, z, x, z);
    this.geo.setDrawRange(0, this.count * IPS);
  }

  /** Move the open head segment's end to (x,z). */
  head(x, z) {
    if (!this.open || !this.count) return;
    this.write(this.count - 1, this.ax, this.az, x, z);
  }

  close(x, z) {
    this.head(x, z);
    this.open = false;
  }

  write(s, ax, az, bx, bz) {
    const p = this.geo.attributes.position.array;
    let dx = bx - ax;
    let dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    // extend the cap a hair past the ends so corners join cleanly
    const nx = -dz * CAP;
    const nz = dx * CAP;
    const ex = dx * CAP;
    const ez = dz * CAP;
    const o = s * VPS * 3;
    const put = (i, x, y, z) => { p[o + i * 3] = x; p[o + i * 3 + 1] = y; p[o + i * 3 + 2] = z; };
    put(0, ax, 0, az); put(1, bx, 0, bz);
    put(2, ax, WALL_H * MID, az); put(3, bx, WALL_H * MID, bz);
    put(4, ax, WALL_H, az); put(5, bx, WALL_H, bz);
    put(6, ax + nx - ex, WALL_H, az + nz - ez); put(7, bx + nx + ex, WALL_H, bz + nz + ez);
    put(8, ax - nx - ex, WALL_H, az - nz - ez); put(9, bx - nx + ex, WALL_H, bz - nz + ez);
    const attr = this.geo.attributes.position;
    attr.needsUpdate = true;
  }

  setOpacity(v) { this.mat.uniforms.uOpacity.value = v; this.reflMat.uniforms.uOpacity.value = v; }
  setFlicker(v) { this.mat.uniforms.uFlicker.value = v; this.reflMat.uniforms.uFlicker.value = v; }

  /** Evenly spaced points along the trail (for derez sparkles). */
  samplePoints(maxN) {
    const p = this.geo.attributes.position.array;
    let total = 0;
    for (let s = 0; s < this.count; s++) {
      const o = s * VPS * 3;
      total += Math.hypot(p[o + 3] - p[o], p[o + 5] - p[o + 2]);
    }
    const out = [];
    if (total <= 0) return out;
    const step = Math.max(0.5, total / maxN);
    for (let s = 0; s < this.count; s++) {
      const o = s * VPS * 3;
      const len = Math.hypot(p[o + 3] - p[o], p[o + 5] - p[o + 2]);
      for (let d = Math.random() * step; d < len; d += step) {
        const t = d / len;
        out.push([p[o] + (p[o + 3] - p[o]) * t, p[o + 2] + (p[o + 5] - p[o + 2]) * t]);
      }
    }
    return out;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.refl.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
    this.reflMat.dispose();
  }
}
