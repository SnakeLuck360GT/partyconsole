// Pooled particle systems (normal + additive), skid-mark ribbons and 3D confetti.
import * as THREE from 'three';
import { glowTexture } from './util.js';

class ParticlePool {
  constructor(scene, max, additive, tex) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('color', this.aCol);
    geo.setAttribute('alpha', this.aAlpha);
    geo.setAttribute('size', this.aSize);
    this.uniforms = { map: { value: tex }, uScale: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; uniform float uScale;
        varying vec3 vC; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv; vC = color; vA = alpha; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ if (vA < 0.005) discard; vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, vA * t.a); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, { color = 0xffffff, size = 1, life = 1, grow = 0, grav = 0, drag = 0, alpha = 1 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = typeof color === 'number' ? _c.setHex(color) : color;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = size;
    this.life[i] = life; this.maxLife[i] = life;
    this.grow[i] = grow; this.grav[i] = grav; this.drag[i] = drag; this.a0[i] = alpha;
    this.alpha[i] = alpha;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.a0[i] * Math.min(1, k * 2.2) * (k > 0 ? 1 : 0);
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aAlpha.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}
const _c = new THREE.Color();

class SkidMarks {
  constructor(scene, max = 1400) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.alpha = new Float32Array(max * 4);
    const idx = [];
    for (let q = 0; q < max; q++) { const a = q * 4; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('alpha', this.aAlpha);
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.06,0.06,0.07, vA); }',
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.q = 0;
    this.dirty = false;
  }

  /** Add a quad from (ax,ay,az) to (bx,by,bz) with half-width w. */
  add(ax, ay, az, bx, by, bz, w = 0.22, a = 0.42) {
    let dx = bx - ax; let dz = bz - az;
    const l = Math.hypot(dx, dz);
    if (l < 0.05 || l > 4) return;
    dx /= l; dz /= l;
    const nx = -dz * w; const nz = dx * w;
    const o = this.q * 12;
    const P = this.pos;
    P[o] = ax + nx; P[o + 1] = ay; P[o + 2] = az + nz;
    P[o + 3] = ax - nx; P[o + 4] = ay; P[o + 5] = az - nz;
    P[o + 6] = bx + nx; P[o + 7] = by; P[o + 8] = bz + nz;
    P[o + 9] = bx - nx; P[o + 10] = by; P[o + 11] = bz - nz;
    for (let k = 0; k < 4; k++) this.alpha[this.q * 4 + k] = a;
    this.q = (this.q + 1) % this.max;
    this.dirty = true;
  }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
    this.aPos.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }

  clear() { this.alpha.fill(0); this.aAlpha.needsUpdate = true; }
}

class Confetti {
  constructor(scene, n = 260) {
    this.n = n;
    const geo = new THREE.PlaneGeometry(0.5, 0.32);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const cols = [0xff4d4d, 0xffcc00, 0x34d058, 0x3d8bff, 0xb86bff, 0xff8a1f, 0xffffff, 0xff5cc8];
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, _c.setHex(cols[i % cols.length]));
    scene.add(this.mesh);
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.r = new Float32Array(n * 3); this.w = new Float32Array(n * 3);
    this.t = 0;
    this.obj = new THREE.Object3D();
  }

  burst(x, y, z, spread = 10) {
    this.mesh.count = this.n;
    this.t = 7;
    for (let i = 0; i < this.n; i++) {
      this.p[i * 3] = x + (Math.random() - 0.5) * spread; this.p[i * 3 + 1] = y + Math.random() * 4; this.p[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.v[i * 3] = (Math.random() - 0.5) * 14; this.v[i * 3 + 1] = 10 + Math.random() * 14; this.v[i * 3 + 2] = (Math.random() - 0.5) * 14;
      for (let k = 0; k < 3; k++) { this.r[i * 3 + k] = Math.random() * 6; this.w[i * 3 + k] = (Math.random() - 0.5) * 12; }
    }
  }

  update(dt) {
    if (this.t <= 0) { this.mesh.count = 0; return; }
    this.t -= dt;
    const o = this.obj;
    for (let i = 0; i < this.n; i++) {
      const d = Math.exp(-2.2 * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 2] *= d;
      this.v[i * 3 + 1] = Math.max(-3.2, this.v[i * 3 + 1] - 18 * dt);
      for (let k = 0; k < 3; k++) { this.p[i * 3 + k] += this.v[i * 3 + k] * dt; this.r[i * 3 + k] += this.w[i * 3 + k] * dt; }
      o.position.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
      o.rotation.set(this.r[i * 3], this.r[i * 3 + 1], this.r[i * 3 + 2]);
      o.scale.setScalar(this.t < 1 ? this.t : 1);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function createFx(scene) {
  const tex = glowTexture();
  const smoke = new ParticlePool(scene, 900, false, tex);
  const glow = new ParticlePool(scene, 1400, true, tex);
  const skids = new SkidMarks(scene);
  const confetti = new Confetti(scene);
  return {
    smoke, glow, skids, confetti,
    setScale(px) { smoke.uniforms.uScale.value = px; glow.uniforms.uScale.value = px; },
    burst(x, y, z, { n = 20, color = 0xffaa33, speed = 8, size = 1, life = 0.6, grav = 10, additive = true, up = 4 } = {}) {
      const pool = additive ? glow : smoke;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2; const sp = speed * (0.4 + Math.random() * 0.6);
        pool.emit(x, y, z, Math.cos(a) * sp, up + Math.random() * up, Math.sin(a) * sp, { color, size: size * (0.6 + Math.random() * 0.6), life: life * (0.6 + Math.random() * 0.6), grav, drag: 2 });
      }
    },
    explosion(x, y, z) {
      this.burst(x, y + 0.8, z, { n: 50, color: 0xffb030, speed: 12, size: 2.4, life: 0.7, grav: 2, up: 6 });
      this.burst(x, y + 0.8, z, { n: 30, color: 0xff4010, speed: 8, size: 3.2, life: 0.5, grav: 0, up: 3 });
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2; const sp = 2 + Math.random() * 5;
        smoke.emit(x + Math.cos(a), y + 1, z + Math.sin(a), Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp, { color: 0x555555, size: 3, life: 1.6, grow: 3, drag: 1.5, alpha: 0.7 });
      }
    },
    update(dt) { smoke.update(dt); glow.update(dt); skids.update(); confetti.update(dt); },
  };
}
