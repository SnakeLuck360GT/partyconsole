// Pooled visual effects: one Points cloud for all particles (dust, stars, sparks, splash, confetti),
// pooled shockwave rings, impact flashes, and hazard warning decals.
import { THREE } from '../../sdk/three-kit.js';

const MAX_P = 1400;

function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  // 0: soft puff (top-left)
  let grd = g.createRadialGradient(64, 64, 0, 64, 64, 60);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // 1: star (top-right)
  g.save();
  g.translate(192, 64);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 22 : 56;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#fff';
  g.shadowColor = 'rgba(255,255,255,0.8)';
  g.shadowBlur = 8;
  g.fill();
  g.restore();
  // 2: hard dot / droplet (bottom-left)
  grd = g.createRadialGradient(64, 192, 0, 64, 192, 40);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.95)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 128, 128, 128);
  // 3: confetti square (bottom-right)
  g.fillStyle = '#fff';
  g.fillRect(192 - 30, 192 - 18, 60, 36);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const pVert = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute float aShape; attribute float aRot; attribute vec3 aColor;
varying float vAlpha; varying float vShape; varying float vRot; varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha; vShape = aShape; vRot = aRot; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const pFrag = /* glsl */`
uniform sampler2D uTex;
varying float vAlpha; varying float vShape; varying float vRot; varying vec3 vColor;
void main() {
  if (vAlpha <= 0.001) discard;
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot); float s = sin(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
  vec2 cell = vec2(mod(vShape, 2.0), floor(vShape / 2.0));
  vec2 uv = (vec2(p.x, 1.0 - p.y) + vec2(cell.x, 1.0 - cell.y)) * 0.5;
  vec4 t = texture2D(uTex, uv);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
  #include <colorspace_fragment>
}`;

export function createFX(scene, camera, renderer) {
  const group = new THREE.Group();
  scene.add(group);

  // ------------------------------------------------------------ particles
  const pos = new Float32Array(MAX_P * 3);
  const size = new Float32Array(MAX_P);
  const alpha = new Float32Array(MAX_P);
  const shape = new Float32Array(MAX_P);
  const rot = new Float32Array(MAX_P);
  const color = new Float32Array(MAX_P * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aShape', new THREE.BufferAttribute(shape, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage));
  const atlas = makeAtlas();
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: atlas }, uScale: { value: 400 } },
    vertexShader: pVert, fragmentShader: pFrag, transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  group.add(points);

  const P = [];
  for (let i = 0; i < MAX_P; i++) P.push({ life: 0 });
  let cursor = 0;
  const tmpC = new THREE.Color();

  function spawn(o) {
    // find a free slot (ring buffer, overwrite oldest if full)
    let p = null;
    for (let k = 0; k < MAX_P; k++) {
      const idx = (cursor + k) % MAX_P;
      if (P[idx].life <= 0) { p = P[idx]; cursor = (idx + 1) % MAX_P; p.i = idx; break; }
    }
    if (!p) { p = P[cursor]; p.i = cursor; cursor = (cursor + 1) % MAX_P; }
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.g = o.g ?? 0; p.drag = o.drag ?? 0;
    p.life = p.max = o.life || 0.6;
    p.s0 = o.size || 1; p.s1 = o.size1 ?? p.s0;
    p.a0 = o.alpha ?? 1;
    p.shape = o.shape || 0;
    p.rot = o.rot ?? Math.random() * 6.28; p.vr = o.vr || 0;
    tmpC.set(o.color ?? 0xffffff);
    p.r = tmpC.r; p.gc = tmpC.g; p.b = tmpC.b;
    p.floor = o.floor ?? -999;
    return p;
  }

  // ------------------------------------------------------------ shockwave rings
  const ringGeo = new THREE.RingGeometry(0.85, 1, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.visible = false;
    m.renderOrder = 4;
    group.add(m);
    rings.push({ m, t: 0, dur: 0.5, r0: 0.3, r1: 3 });
  }
  function ring(x, y, z, r1, { color = 0xffffff, dur = 0.45, r0 = 0.3, opacity = 0.9 } = {}) {
    const rg = rings.find((q) => !q.m.visible) || rings[0];
    rg.m.visible = true;
    rg.m.position.set(x, y + 0.06, z);
    rg.m.material.color.set(color);
    rg.t = 0; rg.dur = dur; rg.r0 = r0; rg.r1 = r1; rg.op = opacity;
  }

  // ------------------------------------------------------------ impact flashes (big additive star sprites)
  const flashTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,240,180,0.8)');
    grd.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = grd;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 22 : 64;
      const a = (i / 16) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const flashes = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    s.visible = false;
    s.renderOrder = 6;
    group.add(s);
    flashes.push({ s, t: 0, dur: 0.25, size: 2 });
  }
  function flash(x, y, z, sizeF = 2.2, color = 0xffffff) {
    const f = flashes.find((q) => !q.s.visible) || flashes[0];
    f.s.visible = true;
    f.s.position.set(x, y, z);
    f.s.material.color.set(color);
    f.s.material.rotation = Math.random() * 6;
    f.t = 0; f.size = sizeF; f.dur = 0.22;
  }

  // ------------------------------------------------------------ hazard warning decals
  const warnTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.strokeStyle = '#fff';
    g.lineWidth = 8;
    g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
    g.font = '900 64px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText('!', 64, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const warnGeo = new THREE.PlaneGeometry(2, 2);
  warnGeo.rotateX(-Math.PI / 2);
  const warns = new Map();
  function addWarn(id, x, y, z, radius) {
    const m = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ map: warnTex, color: 0xff3322, transparent: true, depthWrite: false }));
    m.position.set(x, y + 0.05, z);
    m.scale.setScalar(radius);
    m.renderOrder = 3;
    group.add(m);
    warns.set(id, { m, t: 0 });
  }
  function removeWarn(id) {
    const w = warns.get(id);
    if (!w) return;
    group.remove(w.m);
    w.m.material.dispose();
    warns.delete(id);
  }

  // ------------------------------------------------------------ presets
  const api = {
    group,
    spawn,
    ring,
    flash,
    addWarn,
    removeWarn,
    dust(x, y, z, n = 6, color = 0xe8dcc8, spread = 1) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = (1 + Math.random() * 2) * spread;
        spawn({ x: x + Math.cos(a) * 0.2, y: y + 0.15, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * s, vy: 0.4 + Math.random() * 0.8, vz: Math.sin(a) * s, drag: 3, life: 0.5 + Math.random() * 0.3, size: 0.5, size1: 1.3, alpha: 0.7, color, shape: 0 });
      }
    },
    stars(x, y, z, n = 8, power = 1) {
      const cols = [0xffe14d, 0xffffff, 0xffb02e];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = (3 + Math.random() * 5) * power;
        spawn({ x, y, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 4 * power, vz: Math.sin(a) * s, g: -14, drag: 1.5, life: 0.5 + Math.random() * 0.35, size: 0.9 + Math.random() * 0.5, size1: 0.2, color: cols[i % 3], shape: 1, vr: (Math.random() - 0.5) * 12 });
      }
    },
    sparks(x, y, z, n = 10, color = 0xffd070, speed = 7) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 0.8);
        spawn({ x, y, z, vx: Math.cos(a) * s, vy: 1 + Math.random() * 5, vz: Math.sin(a) * s, g: -16, drag: 1, life: 0.35 + Math.random() * 0.3, size: 0.35, size1: 0.05, color, shape: 2 });
      }
    },
    speedLine(x, y, z, color = 0xffffff) {
      spawn({ x: x + (Math.random() - 0.5) * 0.4, y: y + 0.5 + Math.random() * 0.8, z: z + (Math.random() - 0.5) * 0.4, life: 0.35, size: 0.55, size1: 0.1, alpha: 0.85, color, shape: 2 });
    },
    splash(x, y, z, kind = 0) {
      // kind 0 water, 1 lava, 2 cloud
      const cols = kind === 1 ? [0xffd24a, 0xff7a1a, 0xff4a10] : kind === 2 ? [0xffffff, 0xffe6fa, 0xf0e0ff] : [0xffffff, 0xbfefff, 0x6fd0ff];
      const n = kind === 2 ? 26 : 40;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * 3.5;
        const up = kind === 2 ? 2 + Math.random() * 3 : 7 + Math.random() * 9;
        spawn({ x, y, z, vx: Math.cos(a) * s, vy: up, vz: Math.sin(a) * s, g: kind === 2 ? -3 : -22, drag: kind === 2 ? 2 : 0.3, life: 0.9 + Math.random() * 0.6, size: kind === 2 ? 2.2 : 0.7, size1: kind === 2 ? 3.5 : 0.3, color: cols[i % 3], shape: kind === 2 ? 0 : 2, floor: kind === 2 ? -999 : y - 0.2 });
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        spawn({ x, y: y + 0.3, z, vx: Math.cos(a) * 2.5, vy: 1, vz: Math.sin(a) * 2.5, drag: 2, life: 1.1, size: 1.6, size1: 3.2, alpha: 0.6, color: kind === 1 ? 0x553333 : 0xffffff, shape: 0 });
      }
      ring(x, y + 0.2, z, 4.5, { color: kind === 1 ? 0xffa040 : 0xffffff, dur: 0.9, r0: 0.5 });
    },
    confetti(x, y, z, n = 80, spread = 5) {
      const cols = [0xff4d4d, 0x3d8bff, 0x34d058, 0xffcc00, 0xb86bff, 0xff8a1f, 0x1fd6d6, 0xff5cc8];
      for (let i = 0; i < n; i++) {
        spawn({ x: x + (Math.random() - 0.5) * spread, y: y + Math.random() * 2, z: z + (Math.random() - 0.5) * spread, vx: (Math.random() - 0.5) * 6, vy: 5 + Math.random() * 7, vz: (Math.random() - 0.5) * 6, g: -9, drag: 1.4, life: 2 + Math.random() * 1.5, size: 0.35, color: cols[i % cols.length], shape: 3, vr: (Math.random() - 0.5) * 16 });
      }
    },
    update(dt) {
      pMat.uniforms.uScale.value = renderer.domElement.height * 0.9;
      let any = false;
      for (const p of P) {
        const i = p.i;
        if (p.life <= 0) { if (i !== undefined && alpha[i] !== 0) { alpha[i] = 0; any = true; } continue; }
        any = true;
        p.life -= dt;
        const k = Math.max(0, p.life / p.max);
        p.vy += p.g * dt;
        const dr = Math.max(0, 1 - p.drag * dt);
        p.vx *= dr; p.vy *= p.drag ? dr : 1; p.vz *= dr;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor) p.life = 0;
        p.rot += p.vr * dt;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        size[i] = p.s1 + (p.s0 - p.s1) * k;
        alpha[i] = p.life > 0 ? p.a0 * Math.min(1, k * 2.5) : 0;
        shape[i] = p.shape;
        rot[i] = p.rot;
        color[i * 3] = p.r; color[i * 3 + 1] = p.gc; color[i * 3 + 2] = p.b;
      }
      if (any) for (const n of ['position', 'aSize', 'aAlpha', 'aShape', 'aRot', 'aColor']) geo.attributes[n].needsUpdate = true;
      for (const rg of rings) {
        if (!rg.m.visible) continue;
        rg.t += dt;
        const k = rg.t / rg.dur;
        if (k >= 1) { rg.m.visible = false; continue; }
        const e = 1 - (1 - k) ** 3;
        rg.m.scale.setScalar(rg.r0 + (rg.r1 - rg.r0) * e);
        rg.m.material.opacity = rg.op * (1 - k);
      }
      for (const f of flashes) {
        if (!f.s.visible) continue;
        f.t += dt;
        const k = f.t / f.dur;
        if (k >= 1) { f.s.visible = false; continue; }
        f.s.scale.setScalar(f.size * (0.6 + k * 0.8));
        f.s.material.opacity = 1 - k;
      }
      for (const w of warns.values()) {
        w.t += dt;
        w.m.material.opacity = 0.55 + Math.sin(w.t * 18) * 0.35;
        w.m.rotation.y += dt * 1.5;
      }
    },
    clear() {
      for (const p of P) p.life = 0;
      for (const id of [...warns.keys()]) removeWarn(id);
      rings.forEach((r) => { r.m.visible = false; });
      flashes.forEach((f) => { f.s.visible = false; });
    },
    dispose() {
      atlas.dispose(); flashTex.dispose(); warnTex.dispose();
    },
  };
  return api;
}
