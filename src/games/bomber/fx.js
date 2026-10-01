// Blast Arena visual effects: GPU point particles (additive fire/sparks + alpha smoke), flame-cross beams,
// instanced debris, pooled flash lights and scorch decals. Everything is pooled; nothing is allocated per frame.
import { THREE } from '../../sdk/three-kit.js';

function softDot(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function puffTex(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  for (let k = 0; k < 7; k++) {
    const x = size / 2 + (Math.random() - 0.5) * size * 0.35;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.35;
    const r = size * (0.18 + Math.random() * 0.16);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(c);
}

const PARTICLE_VS = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  attribute float aRot;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vRot;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vAlpha = aAlpha;
    vColor = aColor;
    vRot = aRot;
  }
`;
const PARTICLE_FS = /* glsl */`
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vRot;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    p = mat2(c, -s, s, c) * p + 0.5;
    vec4 t = texture2D(uMap, p);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  }
`;

class ParticlePool {
  constructor(scene, max, { additive, map }) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.rot = new Float32Array(max);
    // simulation state
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.spin = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 400 } },
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
    scene.add(this.points);
  }

  spawn(x, y, z, o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    this.life[i] = 0;
    this.maxLife[i] = o.life || 0.5;
    this.s0[i] = o.size0 ?? 1;
    this.s1[i] = o.size1 ?? this.s0[i];
    const c0 = o.c0 || [1, 1, 1];
    const c1 = o.c1 || c0;
    this.c0[i3] = c0[0]; this.c0[i3 + 1] = c0[1]; this.c0[i3 + 2] = c0[2];
    this.c1[i3] = c1[0]; this.c1[i3 + 1] = c1[1]; this.c1[i3 + 2] = c1[2];
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.grav || 0;
    this.drag[i] = o.drag || 0;
    this.spin[i] = o.spin || 0;
    this.rot[i] = Math.random() * 6.28;
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        // swap-remove
        const j = --this.n;
        if (i !== j) this.copy(j, i);
        continue;
      }
      const t = this.life[i] / this.maxLife[i];
      const i3 = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02) { this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -0.3; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      const fadeIn = Math.min(1, t * 8);
      this.alpha[i] = this.a0[i] * fadeIn * (1 - t) * (1 - t * 0.3);
      this.rot[i] += this.spin[i] * dt;
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha', 'aRot']) this.geo.attributes[k].needsUpdate = true;
  }

  copy(from, to) {
    const f3 = from * 3;
    const t3 = to * 3;
    for (const a of [this.pos, this.vel, this.col, this.c0, this.c1]) { a[t3] = a[f3]; a[t3 + 1] = a[f3 + 1]; a[t3 + 2] = a[f3 + 2]; }
    for (const a of [this.life, this.maxLife, this.s0, this.s1, this.a0, this.grav, this.drag, this.size, this.alpha, this.rot, this.spin]) a[to] = a[from];
  }

  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// Flame beam: additive capsule with a hot core and turbulent, flickering edges.
const FLAME_VS = /* glsl */`
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const FLAME_FS = /* glsl */`
  uniform float uLife;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vW;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float n = noise(vW * 3.5 + vec3(0.0, -uTime * 6.0, uTime * 2.0)) * 0.6 + noise(vW * 7.0 - uTime * 4.0) * 0.4;
    float core = smoothstep(0.25, 0.95, facing);
    vec3 hot = vec3(1.0, 0.97, 0.75);
    vec3 mid = vec3(1.0, 0.62, 0.12);
    vec3 edge = vec3(0.95, 0.18, 0.02);
    vec3 col = mix(edge, mid, smoothstep(0.1, 0.55, facing + n * 0.25));
    col = mix(col, hot, core * (0.6 + 0.4 * n));
    float fade = smoothstep(0.0, 0.08, uLife) * (1.0 - smoothstep(0.55, 1.0, uLife));
    float a = (0.35 + 0.65 * facing) * fade * (0.75 + 0.5 * n);
    gl_FragColor = vec4(col * a * 1.6, a);
  }
`;

export class FX {
  constructor(stage) {
    this.stage = stage;
    const { scene } = stage;
    this.scene = scene;
    this.fire = new ParticlePool(scene, 2200, { additive: true, map: softDot() });
    this.smoke = new ParticlePool(scene, 900, { additive: false, map: puffTex() });
    this.time = 0;
    this.shake = 0;

    // Flame beams
    this.flameGeo = new THREE.CapsuleGeometry(0.5, 1, 6, 14);
    this.flameGeo.rotateZ(Math.PI / 2); // lie along X
    this.flames = [];
    for (let k = 0; k < 40; k++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uLife: { value: 1 }, uTime: { value: 0 } },
        vertexShader: FLAME_VS,
        fragmentShader: FLAME_FS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const g = new THREE.Group();
      g.visible = false;
      const parts = [];
      for (let a = 0; a < 5; a++) {
        const m = new THREE.Mesh(this.flameGeo, mat);
        m.renderOrder = 15;
        m.frustumCulled = false;
        g.add(m);
        parts.push(m);
      }
      scene.add(g);
      this.flames.push({ g, mat, parts, t: 1, dur: 0.6 });
    }

    // Debris (instanced little chunks)
    this.debrisMax = 400;
    const dgeo = new THREE.BoxGeometry(1, 1, 1);
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    this.debris = new THREE.InstancedMesh(dgeo, this.debrisMat, this.debrisMax);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.castShadow = true;
    this.debris.count = 0;
    this.debris.frustumCulled = false;
    this.debris.setColorAt(0, new THREE.Color());
    scene.add(this.debris);
    this.chunks = [];
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpE = new THREE.Euler();
    this.tmpV = new THREE.Vector3();
    this.tmpS = new THREE.Vector3();
    this.tmpC = new THREE.Color();

    // Flash lights (fixed pool so shader programs never recompile)
    this.lights = [];
    for (let k = 0; k < 4; k++) {
      const l = new THREE.PointLight(0xff9a3c, 0, 7, 1.6);
      l.position.set(0, -10, 0);
      scene.add(l);
      this.lights.push({ l, t: 0 });
    }
    this.lightIdx = 0;

    // Scorch decals
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    const g2 = sc.getContext('2d');
    const grd = g2.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(20,12,8,0.85)');
    grd.addColorStop(0.5, 'rgba(25,15,10,0.45)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd;
    g2.fillRect(0, 0, 128, 128);
    const scTex = new THREE.CanvasTexture(sc);
    scTex.colorSpace = THREE.SRGBColorSpace;
    this.scorchGeo = new THREE.PlaneGeometry(1, 1);
    this.scorchGeo.rotateX(-Math.PI / 2);
    this.scorches = [];
    for (let k = 0; k < 60; k++) {
      const m = new THREE.Mesh(this.scorchGeo, new THREE.MeshBasicMaterial({ map: scTex, transparent: true, depthWrite: false, opacity: 0 }));
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.scorches.push({ m, t: 0 });
    }
    this.scorchIdx = 0;
    this.updateScale();
  }

  updateScale() {
    const h = this.stage.renderer.domElement.height;
    const s = h * this.stage.camera.projectionMatrix.elements[5] / 2;
    this.fire.mat.uniforms.uScale.value = s;
    this.smoke.mat.uniforms.uScale.value = s;
  }

  /** Flame cross at grid-world position. arms = [up, right, down, left] lengths in tiles. */
  explosion(wx, wz, arms, dirs) {
    const f = this.flames.find((o) => o.t >= o.dur) || this.flames[0];
    f.t = 0;
    f.g.visible = true;
    f.g.position.set(wx, 0.45, wz);
    const [c, ...armMeshes] = f.parts;
    c.scale.set(0.95, 0.95, 0.95);
    c.position.set(0, 0, 0);
    c.rotation.set(0, 0, 0);
    c.userData.base = c.scale.clone();
    for (let d = 0; d < 4; d++) {
      const m = armMeshes[d];
      const L = arms[d];
      if (L <= 0) { m.visible = false; continue; }
      m.visible = true;
      const len = L; // from centre to tile centre L
      const [dx, dz] = dirs[d];
      m.position.set(dx * len / 2, 0, dz * len / 2);
      m.rotation.set(0, dx !== 0 ? 0 : Math.PI / 2, 0);
      // capsule of length (1+... ) along X: scale x so its total length ~= len + 0.8
      m.scale.set((len + 0.7) / 2, 0.72, 0.72);
      m.userData.base = m.scale.clone();
    }
    f.dur = 0.65;
    // particles along the cross
    const cells = [[0, 0, -1]];
    for (let d = 0; d < 4; d++) for (let r = 1; r <= arms[d]; r++) cells.push([dirs[d][0] * r, dirs[d][1] * r, d]);
    const budget = Math.max(1, Math.floor(260 / cells.length));
    for (const [cx, cz, d] of cells) {
      const n = Math.min(6, budget);
      for (let k = 0; k < n; k++) {
        const dx = d >= 0 ? dirs[d][0] : (Math.random() - 0.5);
        const dz = d >= 0 ? dirs[d][1] : (Math.random() - 0.5);
        const sp = 1 + Math.random() * 2.5;
        this.fire.spawn(wx + cx + (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.5, wz + cz + (Math.random() - 0.5) * 0.5, {
          vx: dx * sp + (Math.random() - 0.5), vy: 1 + Math.random() * 2.5, vz: dz * sp + (Math.random() - 0.5),
          life: 0.35 + Math.random() * 0.35, size0: 0.9 + Math.random() * 0.6, size1: 1.6 + Math.random() * 0.8,
          c0: [1, 0.9, 0.55], c1: [0.9, 0.2, 0.02], alpha: 0.9, drag: 3, spin: (Math.random() - 0.5) * 4,
        });
      }
      if (Math.random() < 0.8) {
        this.smoke.spawn(wx + cx + (Math.random() - 0.5) * 0.4, 0.5, wz + cz + (Math.random() - 0.5) * 0.4, {
          vx: (Math.random() - 0.5) * 0.6, vy: 0.8 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.6,
          life: 1.1 + Math.random() * 0.8, size0: 0.8, size1: 2.2 + Math.random(), c0: [0.35, 0.33, 0.32], c1: [0.6, 0.58, 0.56],
          alpha: 0.55, drag: 1.2, spin: (Math.random() - 0.5) * 1.5,
        });
      }
    }
    // sparks
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      this.fire.spawn(wx, 0.5, wz, {
        vx: Math.cos(a) * sp, vy: 2 + Math.random() * 5, vz: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.5,
        size0: 0.22, size1: 0.08, c0: [1, 0.95, 0.6], c1: [1, 0.4, 0.05], grav: 9, drag: 1,
      });
    }
    // light flash
    const L = this.lights[this.lightIdx++ % this.lights.length];
    L.t = 0.35;
    L.l.position.set(wx, 1.4, wz);
    this.scorch(wx, wz, 1.3);
    this.shake = Math.min(0.5, this.shake + 0.22);
  }

  scorch(wx, wz, size) {
    const s = this.scorches[this.scorchIdx++ % this.scorches.length];
    s.t = 7;
    s.m.visible = true;
    s.m.position.set(wx + (Math.random() - 0.5) * 0.1, 0.012 + Math.random() * 0.004, wz + (Math.random() - 0.5) * 0.1);
    s.m.rotation.y = Math.random() * 6.28;
    s.m.scale.setScalar(size);
  }

  /** Crate/block chunks flying out. */
  debrisBurst(wx, wy, wz, colors, n = 14, power = 1) {
    for (let k = 0; k < n; k++) {
      if (this.chunks.length >= this.debrisMax) this.chunks.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 3) * power;
      this.chunks.push({
        p: new THREE.Vector3(wx + (Math.random() - 0.5) * 0.6, wy + Math.random() * 0.5, wz + (Math.random() - 0.5) * 0.6),
        v: new THREE.Vector3(Math.cos(a) * sp, (2.5 + Math.random() * 4) * power, Math.sin(a) * sp),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18),
        s: new THREE.Vector3(0.1 + Math.random() * 0.14, 0.05 + Math.random() * 0.08, 0.1 + Math.random() * 0.2),
        c: colors[k % colors.length],
        t: 1.6 + Math.random() * 0.8,
      });
    }
    for (let k = 0; k < 6; k++) {
      this.smoke.spawn(wx + (Math.random() - 0.5) * 0.6, 0.4, wz + (Math.random() - 0.5) * 0.6, {
        vx: (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 1.2,
        life: 0.9 + Math.random() * 0.6, size0: 0.6, size1: 1.8, c0: [0.75, 0.7, 0.62], c1: [0.85, 0.83, 0.8], alpha: 0.5, drag: 2,
      });
    }
  }

  /** Coloured sparkle burst (pickups, spawns). */
  sparkle(wx, wy, wz, rgb, n = 26) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      this.fire.spawn(wx, wy, wz, {
        vx: Math.cos(a) * sp, vy: 1.5 + Math.random() * 3, vz: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4,
        size0: 0.35, size1: 0.1, c0: [1, 1, 1], c1: rgb, grav: 5, drag: 1.5,
      });
    }
  }

  poof(wx, wz, n = 14, tint = [0.9, 0.9, 0.95]) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.spawn(wx + Math.cos(a) * 0.2, 0.3 + Math.random() * 0.5, wz + Math.sin(a) * 0.2, {
        vx: Math.cos(a) * 1.5, vy: 0.5 + Math.random(), vz: Math.sin(a) * 1.5, life: 0.8 + Math.random() * 0.5,
        size0: 0.7, size1: 1.8, c0: tint, c1: tint, alpha: 0.7, drag: 3,
      });
    }
  }

  fuseSpark(x, y, z) {
    this.fire.spawn(x, y, z, {
      vx: (Math.random() - 0.5) * 1.5, vy: 0.8 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.5,
      life: 0.18 + Math.random() * 0.2, size0: 0.28, size1: 0.05, c0: [1, 0.95, 0.6], c1: [1, 0.35, 0.05], grav: 4,
    });
  }

  update(dt) {
    this.time += dt;
    this.fire.update(dt);
    this.smoke.update(dt);
    for (const f of this.flames) {
      if (f.t >= f.dur) { if (f.g.visible) f.g.visible = false; continue; }
      f.t += dt;
      const life = Math.min(1, f.t / f.dur);
      f.mat.uniforms.uLife.value = life;
      f.mat.uniforms.uTime.value = this.time;
      // punchy grow then thin out
      const grow = life < 0.12 ? 0.4 + 0.6 * (life / 0.12) : 1 - 0.35 * (life - 0.12) / 0.88;
      for (const m of f.parts) {
        if (!m.userData.base) continue;
        const b = m.userData.base;
        m.scale.set(b.x, b.y * grow, b.z * grow);
      }
    }
    // debris
    const M = this.tmpM;
    let n = 0;
    for (let k = this.chunks.length - 1; k >= 0; k--) {
      const c = this.chunks[k];
      c.t -= dt;
      if (c.t <= 0) { this.chunks.splice(k, 1); continue; }
      c.v.y -= 16 * dt;
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < c.s.y / 2) {
        c.p.y = c.s.y / 2;
        c.v.y *= -0.35;
        c.v.x *= 0.6; c.v.z *= 0.6;
        c.w.multiplyScalar(0.6);
      }
      c.r.addScaledVector(c.w, dt);
      const fade = Math.min(1, c.t / 0.4);
      this.tmpE.set(c.r.x, c.r.y, c.r.z);
      this.tmpQ.setFromEuler(this.tmpE);
      this.tmpS.copy(c.s).multiplyScalar(fade);
      M.compose(c.p, this.tmpQ, this.tmpS);
      this.debris.setMatrixAt(n, M);
      this.debris.setColorAt(n, this.tmpC.setHex(c.c));
      n++;
    }
    this.debris.count = n;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    for (const L of this.lights) {
      if (L.t > 0) { L.t -= dt; L.l.intensity = Math.max(0, L.t / 0.35) ** 2 * 40; } else if (L.l.intensity) L.l.intensity = 0;
    }
    for (const s of this.scorches) {
      if (!s.m.visible) continue;
      s.t -= dt;
      s.m.material.opacity = Math.min(1, s.t / 2) * 0.9;
      if (s.t <= 0) s.m.visible = false;
    }
    this.shake = Math.max(0, this.shake - dt * 1.4);
  }

  clear() {
    this.fire.clear();
    this.smoke.clear();
    this.chunks.length = 0;
    this.debris.count = 0;
    for (const f of this.flames) { f.t = f.dur; f.g.visible = false; }
    for (const s of this.scorches) s.m.visible = false;
    for (const L of this.lights) { L.t = 0; L.l.intensity = 0; }
    this.shake = 0;
  }
}
