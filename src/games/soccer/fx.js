// Pooled particles (one Points cloud): grass/dust puffs, shot trails, sparks, and goal confetti.
// Everything is preallocated; spawning writes into ring-buffer slots, nothing is allocated per frame.
import { THREE } from '../../sdk/three-kit.js';

const MAX = 1600;

function atlas() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.fillRect(64 + 14, 22, 36, 20);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VERT = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute float aShape; attribute float aRot; attribute vec3 aColor;
varying float vAlpha; varying float vShape; varying float vRot; varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha; vShape = aShape; vRot = aRot; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform sampler2D uTex;
varying float vAlpha; varying float vShape; varying float vRot; varying vec3 vColor;
void main() {
  if (vAlpha <= 0.001) discard;
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot); float s = sin(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
  vec2 uv = vec2((p.x + vShape) * 0.5, 1.0 - p.y);
  vec4 t = texture2D(uTex, uv);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.02) discard;
  #include <colorspace_fragment>
}`;

export function createFX(scene, renderer) {
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX);
  const alpha = new Float32Array(MAX);
  const shape = new Float32Array(MAX);
  const rot = new Float32Array(MAX);
  // simulation state
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const age = new Float32Array(MAX);
  const s0 = new Float32Array(MAX);
  const s1 = new Float32Array(MAX);
  const a0 = new Float32Array(MAX);
  const drag = new Float32Array(MAX);
  const grav = new Float32Array(MAX);
  const spin = new Float32Array(MAX);
  let next = 0;
  let live = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aShape', new THREE.BufferAttribute(shape, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const tex = atlas();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    uniforms: { uTex: { value: tex }, uScale: { value: 400 } },
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);
  const tmpC = new THREE.Color();

  function spawn(x, y, z, vx, vy, vz, o) {
    const i = next;
    next = (next + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    tmpC.setHex(o.color);
    col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    life[i] = o.life; age[i] = 0;
    s0[i] = o.size; s1[i] = o.size1 ?? o.size;
    a0[i] = o.alpha ?? 1;
    alpha[i] = a0[i];
    size[i] = s0[i];
    drag[i] = o.drag ?? 1;
    grav[i] = o.grav ?? 0;
    shape[i] = o.shape ?? 0;
    rot[i] = Math.random() * 6.28;
    spin[i] = o.spin ? (Math.random() - 0.5) * o.spin : 0;
  }
  const opt = { color: 0, life: 1, size: 1, size1: 1, alpha: 1, drag: 1, grav: 0, shape: 0, spin: 0 };
  function o(color, lifeV, sz, sz1, al, dr, gr, sh, sp) {
    opt.color = color; opt.life = lifeV; opt.size = sz; opt.size1 = sz1; opt.alpha = al; opt.drag = dr; opt.grav = gr; opt.shape = sh; opt.spin = sp;
    return opt;
  }

  return {
    /** grass divots + dust when kicking / sliding */
    turf(x, z, n = 6, power = 1) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28;
        const s = (1 + Math.random() * 2) * power;
        spawn(x, 0.1, z, Math.cos(a) * s, 1.5 + Math.random() * 2.5 * power, Math.sin(a) * s, o(Math.random() < 0.6 ? 0x3f9a35 : 0x6b5a3a, 0.6 + Math.random() * 0.3, 0.16, 0.12, 1, 1.5, 12, 1, 12));
      }
      spawn(x, 0.2, z, 0, 0.4, 0, o(0xd8e6c8, 0.6, 0.6 * power, 1.6 * power, 0.45, 2, 0, 0, 0));
    },
    puff(x, y, z, color = 0xffffff, sz = 0.5, sz1 = 1.4, lifeV = 0.5, al = 0.5) {
      spawn(x, y, z, (Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4, o(color, lifeV, sz, sz1, al, 2, 0, 0, 0));
    },
    sparks(x, y, z, n, color, speed = 6) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28;
        const e = (Math.random() - 0.3) * 1.5;
        spawn(x, y, z, Math.cos(a) * speed * Math.cos(e), Math.sin(e) * speed + 1, Math.sin(a) * speed * Math.cos(e), o(color, 0.35 + Math.random() * 0.2, 0.2, 0.04, 1, 3, 6, 0, 0));
      }
    },
    /** confetti cannon from (x,y,z) aimed roughly along (dx, dz) */
    confetti(x, y, z, n, colors, dx = 0, dz = 0, spread = 1) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28;
        const s = 2 + Math.random() * 5 * spread;
        const c = colors[i % colors.length];
        spawn(x, y, z, Math.cos(a) * s + dx * (4 + Math.random() * 6), 6 + Math.random() * 8, Math.sin(a) * s + dz * (4 + Math.random() * 6), o(c, 2.6 + Math.random() * 1.6, 0.32, 0.32, 1, 1.6, 7, 1, 16));
      }
    },
    /** gentle confetti rain over an area */
    rain(cx, cz, w, d, n, colors, h = 14) {
      for (let i = 0; i < n; i++) {
        spawn(cx + (Math.random() - 0.5) * w, h + Math.random() * 4, cz + (Math.random() - 0.5) * d, (Math.random() - 0.5), -1.5, (Math.random() - 0.5), o(colors[i % colors.length], 4 + Math.random() * 2, 0.34, 0.34, 1, 0.4, 0.3, 1, 10));
      }
    },
    update(dt) {
      mat.uniforms.uScale.value = renderer.domElement.height * 0.9;
      live = 0;
      for (let i = 0; i < MAX; i++) {
        if (age[i] >= life[i]) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
        live++;
        age[i] += dt;
        const k = age[i] / life[i];
        const dr = Math.max(0, 1 - drag[i] * dt);
        vel[i * 3] *= dr; vel[i * 3 + 1] = vel[i * 3 + 1] * dr - grav[i] * dt; vel[i * 3 + 2] *= dr;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.03) { pos[i * 3 + 1] = 0.03; vel[i * 3 + 1] = 0; vel[i * 3] *= 0.8; vel[i * 3 + 2] *= 0.8; spin[i] *= 0.8; }
        rot[i] += spin[i] * dt;
        size[i] = s0[i] + (s1[i] - s0[i]) * k;
        alpha[i] = a0[i] * (k > 0.7 ? (1 - k) / 0.3 : 1);
      }
      const a = geo.attributes;
      a.position.needsUpdate = true; a.aColor.needsUpdate = true; a.aSize.needsUpdate = true;
      a.aAlpha.needsUpdate = true; a.aShape.needsUpdate = true; a.aRot.needsUpdate = true;
      return live;
    },
    clear() { age.fill(1e9); alpha.fill(0); },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}
