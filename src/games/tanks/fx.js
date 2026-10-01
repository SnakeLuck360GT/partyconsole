// Visual effects: particles, debris, fading ground decals (tread marks, scorch), light flashes,
// laser beams, shockwave rings, aim dots. Everything is pooled; nothing is allocated per frame.
import { THREE } from '../../sdk/three-kit.js';

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function softDotTexture() {
  return canvasTex(64, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

function puffTexture() {
  return canvasTex(128, (g, s) => {
    for (let k = 0; k < 9; k++) {
      const x = s / 2 + (Math.random() - 0.5) * s * 0.35;
      const y = s / 2 + (Math.random() - 0.5) * s * 0.35;
      const r = s * (0.18 + Math.random() * 0.16);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    }
  });
}

function scorchTexture() {
  return canvasTex(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2; const d = s * (0.25 + Math.random() * 0.25);
      g.beginPath();
      g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * (0.02 + Math.random() * 0.06), 0, Math.PI * 2);
      g.fill();
    }
  });
}

function treadTexture() {
  return canvasTex(64, (g, s) => {
    g.fillStyle = 'rgba(255,255,255,0)';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.fillRect(6, y + 2, s - 12, 9);
    }
  });
}

function ringTexture() {
  return canvasTex(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

function beamTexture() {
  return canvasTex(64, (g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.42, 'rgba(255,255,255,0.8)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(0.58, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  });
}

// ------------------------------------------------------------------ particles
const P_VERT = /* glsl */`
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const P_FRAG = /* glsl */`
uniform sampler2D uTex;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  float a = vColor.a * t.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(scene, { max, tex, additive }) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uScale: { value: 400 } },
      vertexShader: P_VERT,
      fragmentShader: P_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
    this.geo = geo;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, alpha = 1, drag = 0, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i3] = c0.r; this.c0[i3 + 1] = c0.g; this.c0[i3 + 2] = c0.b;
    this.c1[i3] = c1.r; this.c1[i3 + 1] = c1.g; this.c1[i3 + 2] = c1.b;
    this.a0[i] = alpha;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  update(dt) {
    const { pos, vel, life, maxLife, col, size } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (size[i] !== 0) size[i] = 0; continue; }
      life[i] -= dt;
      const i3 = i * 3;
      const k = 1 - Math.max(0, life[i]) / maxLife[i]; // 0 -> 1
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      vel[i3] *= dr; vel[i3 + 1] = vel[i3 + 1] * dr - this.grav[i] * dt; vel[i3 + 2] *= dr;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.02) { pos[i3 + 1] = 0.02; vel[i3 + 1] *= -0.3; }
      size[i] = life[i] <= 0 ? 0 : this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      const i4 = i * 4;
      col[i4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * k;
      col[i4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * k;
      col[i4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * k;
      // quick fade-in, smooth fade-out
      col[i4 + 3] = this.a0[i] * Math.min(1, k * 8) * (1 - k * k);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

// ------------------------------------------------------------------ fading instanced decals
const D_VERT = /* glsl */`
attribute float aBirth;
uniform float uTime;
uniform float uLife;
varying float vA;
varying vec2 vUv;
void main() {
  vUv = uv;
  float age = uTime - aBirth;
  vA = aBirth < 0.0 ? 0.0 : clamp(1.0 - age / uLife, 0.0, 1.0);
  vA = min(vA * 3.0, 1.0) * vA;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const D_FRAG = /* glsl */`
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
varying vec2 vUv;
void main() {
  float a = texture2D(uTex, vUv).a * vA * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

class DecalPool {
  constructor(scene, { max, tex, color, opacity, life, y = 0.02, order = 1 }) {
    this.max = max;
    this.cursor = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.births = new Float32Array(max).fill(-1);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(this.births, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 }, uLife: { value: life } },
      vertexShader: D_VERT,
      fragmentShader: D_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2 - order,
      polygonOffsetUnits: -2 - order,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.y = y;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, zero);
    this.geo = geo;
    scene.add(this.mesh);
  }

  add(x, z, angle, w, l, time) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.q.setFromAxisAngle(this.up, angle);
    this.m.compose(this.v.set(x, this.y, z), this.q, this.s.set(w, 1, l));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.births[i] = time;
    this.geo.attributes.aBirth.needsUpdate = true;
  }

  setTime(t) { this.mat.uniforms.uTime.value = t; }
  clear() { this.births.fill(-1); this.geo.attributes.aBirth.needsUpdate = true; }
}

// ------------------------------------------------------------------ main FX facade
const tmpC = new THREE.Color();
const C = (hex) => new THREE.Color(hex);
const FIRE = [C(0xfff3b0), C(0xffb030), C(0xff5a1a), C(0x7a1a08)];
const SMOKE_DARK = C(0x2a2622);
const SMOKE_MID = C(0x6d655c);
const SMOKE_LIGHT = C(0xb8b0a4);
const WHITE = C(0xffffff);

export class FX {
  constructor(stage, theme) {
    const { scene } = stage;
    this.stage = stage;
    this.scene = scene;
    this.time = 0;
    this.dotTex = softDotTexture();
    this.textures = [this.dotTex];
    const puff = puffTexture();
    this.textures.push(puff);
    this.add = new Particles(scene, { max: 1600, tex: this.dotTex, additive: true });
    this.smoke = new Particles(scene, { max: 1100, tex: puff, additive: false });
    this.dust = new Particles(scene, { max: 500, tex: puff, additive: false });
    const tread = treadTexture();
    const scorch = scorchTexture();
    this.textures.push(tread, scorch);
    this.tracks = new DecalPool(scene, { max: 1600, tex: tread, color: theme.trackColor, opacity: theme.trackOpacity, life: 10, y: 0.015, order: 1 });
    this.scorch = new DecalPool(scene, { max: 50, tex: scorch, color: 0x140e0a, opacity: 0.8, life: 28, y: 0.02, order: 2 });
    this.dustColor = new THREE.Color(theme.dustColor);

    // debris chunks
    this.debrisMax = 180;
    this.debris = [];
    const dg = new THREE.BoxGeometry(1, 1, 1);
    this.debrisMesh = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ roughness: 0.8 }), this.debrisMax);
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.debrisMax; i++) {
      this.debrisMesh.setMatrixAt(i, zero);
      this.debrisMesh.setColorAt(i, WHITE);
      this.debris.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0.2 });
    }
    this.debrisCursor = 0;
    scene.add(this.debrisMesh);

    // flash lights (fixed pool so shader programs never recompile)
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 14, 1.6);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 1, peak: 0 });
    }
    this.lightCursor = 0;

    // shockwave rings
    const ringTex = ringTexture();
    this.textures.push(ringTex);
    this.rings = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc080, toneMapped: false }));
      m.visible = false;
      m.position.y = 0.08;
      m.renderOrder = 5;
      scene.add(m);
      this.rings.push({ m, t: 0, dur: 0.4, size: 5 });
    }

    // laser beams
    const beamTex = beamTexture();
    this.textures.push(beamTex);
    this.beams = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      m.visible = false;
      m.renderOrder = 13;
      scene.add(m);
      this.beams.push({ m, t: 0, dur: 0.45 });
    }

    // aim dots (rebuilt every frame from scratch)
    this.aimMax = 900;
    const ag = new THREE.CircleGeometry(0.11, 10).rotateX(-Math.PI / 2);
    this.aimMesh = new THREE.InstancedMesh(ag, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), this.aimMax);
    this.aimMesh.count = 0;
    this.aimMesh.frustumCulled = false;
    this.aimMesh.renderOrder = 6;
    for (let i = 0; i < this.aimMax; i++) this.aimMesh.setColorAt(i, WHITE);
    scene.add(this.aimMesh);
    this.aimN = 0;

    this.shake = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  setTheme(theme) {
    this.tracks.mat.uniforms.uColor.value.set(theme.trackColor);
    this.tracks.mat.uniforms.uOpacity.value = theme.trackOpacity;
    this.dustColor.set(theme.dustColor);
  }

  clear() {
    this.add.clear(); this.smoke.clear(); this.dust.clear(); this.tracks.clear(); this.scorch.clear();
    for (const d of this.debris) d.life = 0;
    for (const r of this.rings) r.m.visible = false;
    for (const b of this.beams) b.m.visible = false;
  }

  flash(x, y, z, color, intensity, dur = 0.25) {
    const L = this.lights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.lights.length;
    L.l.color.set(color);
    L.l.position.set(x, y, z);
    L.peak = intensity;
    L.t = 0;
    L.dur = dur;
  }

  ring(x, z, size, color = 0xffc080, dur = 0.45) {
    const r = this.rings.find((q) => !q.m.visible) || this.rings[0];
    r.m.visible = true;
    r.m.position.x = x; r.m.position.z = z;
    r.m.material.color.set(color);
    r.t = 0; r.dur = dur; r.size = size;
  }

  beam(x0, z0, x1, z1, color, width = 0.55, y = 0.75) {
    const b = this.beams.find((q) => !q.m.visible) || this.beams[0];
    const dx = x1 - x0; const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    b.m.visible = true;
    b.m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    b.m.rotation.set(0, -Math.atan2(dz, dx), 0);
    b.m.scale.set(len, 1, width);
    b.m.material.color.set(color);
    b.t = 0;
    b.width = width;
  }

  debrisBurst(x, y, z, count, colors, speed = 6, size = 0.22) {
    for (let k = 0; k < count; k++) {
      const d = this.debris[this.debrisCursor];
      this.debrisCursor = (this.debrisCursor + 1) % this.debrisMax;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      d.p.set(x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.5);
      d.v.set(Math.cos(a) * s, 3 + Math.random() * speed, Math.sin(a) * s);
      d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      d.s = size * (0.5 + Math.random());
      d.life = 1.6 + Math.random() * 1.2;
      d.maxLife = d.life;
      this.debrisMesh.setColorAt(this.debris.indexOf(d), tmpC.set(colors[k % colors.length]));
    }
    this.debrisMesh.instanceColor.needsUpdate = true;
  }

  explosion(x, z, scale = 1, { debrisColors = [0x3a3632, 0x5b5148, 0x2a2622], scorch = true } = {}) {
    const S = scale;
    this.flash(x, 1.5, z, 0xff9a40, 60 * S, 0.45);
    this.ring(x, z, 6 * S, 0xffb070, 0.45);
    for (let k = 0; k < 34 * S; k++) {
      const a = Math.random() * Math.PI * 2; const u = Math.random();
      const sp = (1.5 + Math.random() * 4.5) * S;
      const c0 = FIRE[Math.floor(Math.random() * 2)];
      this.add.emit(x + Math.cos(a) * 0.3, 0.5 + u * 0.8, z + Math.sin(a) * 0.3, Math.cos(a) * sp, 1 + u * 4 * S, Math.sin(a) * sp,
        0.45 + Math.random() * 0.45, (1.2 + Math.random() * 1.2) * S, 0.3 * S, c0, FIRE[3], 1, 3.5, -1.5);
    }
    for (let k = 0; k < 18 * S; k++) {
      const a = Math.random() * Math.PI * 2; const sp = 6 + Math.random() * 10;
      this.add.emit(x, 0.7, z, Math.cos(a) * sp, 3 + Math.random() * 7, Math.sin(a) * sp, 0.4 + Math.random() * 0.5, 0.22, 0.05, FIRE[0], FIRE[2], 1, 1.5, 16);
    }
    for (let k = 0; k < 16 * S; k++) {
      const a = Math.random() * Math.PI * 2; const sp = 0.6 + Math.random() * 2.2 * S;
      const c = Math.random() < 0.5 ? SMOKE_DARK : SMOKE_MID;
      this.smoke.emit(x + Math.cos(a) * 0.6, 0.6 + Math.random(), z + Math.sin(a) * 0.6, Math.cos(a) * sp, 1.2 + Math.random() * 1.6, Math.sin(a) * sp,
        1.5 + Math.random() * 1.4, 1.2 * S, (3 + Math.random() * 2) * S, c, SMOKE_LIGHT, 0.75, 1.2, -0.4);
    }
    this.debrisBurst(x, 0.6, z, Math.round(10 * S), debrisColors, 5 * S, 0.24 * S);
    if (scorch) this.scorch.add(x, z, Math.random() * 6, 3.4 * S, 3.4 * S, this.time);
    this.shake = Math.min(1.6, this.shake + 0.55 * S);
  }

  muzzle(x, y, z, dx, dz, color) {
    this.flash(x, y + 0.3, z, 0xffc070, 18, 0.12);
    for (let k = 0; k < 8; k++) {
      const sp = 3 + Math.random() * 7; const sd = (Math.random() - 0.5) * 0.7;
      const vx = dx * sp - dz * sd * sp; const vz = dz * sp + dx * sd * sp;
      this.add.emit(x, y, z, vx, Math.random() * 0.6, vz, 0.07 + Math.random() * 0.08, 0.9, 0.2, FIRE[0], FIRE[1], 1, 6, 0);
    }
    tmpC.set(color);
    for (let k = 0; k < 4; k++) this.add.emit(x, y, z, dx * 9 + (Math.random() - 0.5) * 3, Math.random() * 2, dz * 9 + (Math.random() - 0.5) * 3, 0.25, 0.14, 0.02, FIRE[0], tmpC, 1, 2, 5);
    for (let k = 0; k < 3; k++) this.smoke.emit(x + dx * 0.2, y, z + dz * 0.2, dx * 1.5 + (Math.random() - 0.5), 0.6, dz * 1.5 + (Math.random() - 0.5), 0.7 + Math.random() * 0.4, 0.4, 1.3, SMOKE_LIGHT, SMOKE_LIGHT, 0.5, 2, -0.3);
  }

  sparks(x, y, z, color = 0xffd080, n = 10, speed = 6) {
    tmpC.set(color);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2; const sp = speed * (0.4 + Math.random() * 0.8);
      this.add.emit(x, y, z, Math.cos(a) * sp, 1 + Math.random() * 4, Math.sin(a) * sp, 0.25 + Math.random() * 0.25, 0.2, 0.04, WHITE, tmpC, 1, 2, 12);
    }
  }

  puff(x, y, z, color, n = 6, size = 0.8) {
    tmpC.set(color);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2; const sp = 0.5 + Math.random() * 1.8;
      this.smoke.emit(x, y, z, Math.cos(a) * sp, 0.6 + Math.random(), Math.sin(a) * sp, 0.7 + Math.random() * 0.6, size, size * 2.4, tmpC, tmpC, 0.7, 2, -0.2);
    }
  }

  dustKick(x, z) {
    this.dust.emit(x + (Math.random() - 0.5) * 0.3, 0.15, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6,
      0.8 + Math.random() * 0.5, 0.35, 1.3, this.dustColor, this.dustColor, 0.45, 1.5, 0);
  }

  damageSmoke(x, y, z, heavy) {
    const c = heavy ? SMOKE_DARK : SMOKE_MID;
    this.smoke.emit(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, 1.4 + Math.random(), (Math.random() - 0.5) * 0.4,
      1.1 + Math.random() * 0.6, 0.5, 1.8, c, SMOKE_MID, heavy ? 0.8 : 0.5, 0.8, -0.3);
    if (heavy && Math.random() < 0.3) this.add.emit(x, y, z, (Math.random() - 0.5), 1.5, (Math.random() - 0.5), 0.3, 0.5, 0.1, FIRE[1], FIRE[2], 0.9, 1, 0);
  }

  trail(x, y, z, color, size = 0.35, life = 0.28) {
    tmpC.set(color);
    this.add.emit(x, y, z, 0, 0, 0, life, size, size * 0.2, WHITE, tmpC, 0.9, 0, 0);
  }

  glow(x, y, z, color, size, life = 0.05) {
    tmpC.set(color);
    this.add.emit(x, y, z, 0, 0, 0, life, size, size, tmpC, tmpC, 0.8, 0, 0);
  }

  track(x, z, angle) { this.tracks.add(x, z, angle, 0.32, 0.36, this.time); }

  aimBegin() { this.aimN = 0; }
  aimDot(x, z, color, scale = 1) {
    if (this.aimN >= this.aimMax) return;
    this._m.compose(this._v.set(x, 0.06, z), this._q.identity(), this._s.set(scale, 1, scale));
    this.aimMesh.setMatrixAt(this.aimN, this._m);
    this.aimMesh.setColorAt(this.aimN, tmpC.set(color));
    this.aimN++;
  }
  aimEnd() {
    this.aimMesh.count = this.aimN;
    this.aimMesh.instanceMatrix.needsUpdate = true;
    if (this.aimMesh.instanceColor) this.aimMesh.instanceColor.needsUpdate = true;
  }

  update(dt, camera, renderer) {
    this.time += dt;
    const h = renderer.domElement.height;
    const scale = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.add.mat.uniforms.uScale.value = scale;
    this.smoke.mat.uniforms.uScale.value = scale;
    this.dust.mat.uniforms.uScale.value = scale;
    this.add.update(dt);
    this.smoke.update(dt);
    this.dust.update(dt);
    this.tracks.setTime(this.time);
    this.scorch.setTime(this.time);

    // debris
    let any = false;
    for (let i = 0; i < this.debrisMax; i++) {
      const d = this.debris[i];
      if (d.life <= 0) continue;
      any = true;
      d.life -= dt;
      d.v.y -= 22 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.s / 2) {
        d.p.y = d.s / 2;
        d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6);
      }
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      const s = d.life <= 0 ? 0 : d.s * Math.min(1, d.life / 0.5);
      this._q.setFromEuler(d.r);
      this._m.compose(d.p, this._q, this._s.set(s, s, s));
      this.debrisMesh.setMatrixAt(i, this._m);
    }
    if (any) this.debrisMesh.instanceMatrix.needsUpdate = true;

    for (const L of this.lights) {
      if (L.peak <= 0) continue;
      L.t += dt;
      const k = L.t / L.dur;
      if (k >= 1) { L.peak = 0; L.l.intensity = 0; L.l.position.y = -50; continue; }
      L.l.intensity = L.peak * (1 - k) * (1 - k);
    }
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.m.visible = false; continue; }
      const s = r.size * (0.2 + 0.8 * Math.sqrt(k));
      r.m.scale.set(s, 1, s);
      r.m.material.opacity = 1 - k;
    }
    for (const b of this.beams) {
      if (!b.m.visible) continue;
      b.t += dt;
      const k = b.t / b.dur;
      if (k >= 1) { b.m.visible = false; continue; }
      b.m.material.opacity = 1 - k * k;
      b.m.scale.z = b.width * (1 + k * 0.6);
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  dispose() {
    this.textures.forEach((t) => t.dispose());
  }
}
