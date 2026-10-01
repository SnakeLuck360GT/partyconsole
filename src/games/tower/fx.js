// Juice for Tower Topple: pooled soft particles (dust, poofs, confetti), wind leaves and
// synthesized wooden "tok" sounds (the SDK sfx set has no wood knocks).
import { THREE } from '../../sdk/three-kit.js';
import { sfx } from '../../sdk/audio.js';

// ---------------------------------------------------------------- particles

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function createParticles(scene, max = 420) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const tex = softDot();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { map: { value: tex }, scale: { value: 400 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;
      uniform float scale;
      void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a);
      #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  const P = Array.from({ length: max }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0, s1: 0, r: 1, g: 1, b: 1, grav: 0, drag: 0, a0: 1 }));
  let cursor = 0;
  function spawn(o) {
    const p = P[cursor];
    cursor = (cursor + 1) % max;
    Object.assign(p, { grav: 0, drag: 1.5, a0: 0.9 }, o);
    p.life = p.max;
    return p;
  }
  const tmpC = new THREE.Color();
  return {
    dust(at, n = 14, color = 0xf1e3cc, spread = 1) {
      tmpC.set(color);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (1.2 + Math.random() * 2.2) * spread;
        spawn({
          x: at.x + Math.cos(a) * 0.2 * spread, y: at.y + 0.05, z: at.z + Math.sin(a) * 0.2 * spread,
          vx: Math.cos(a) * sp, vy: 0.3 + Math.random() * 0.9, vz: Math.sin(a) * sp,
          max: 0.6 + Math.random() * 0.5, s0: 0.25 * spread, s1: 0.8 * spread, r: tmpC.r, g: tmpC.g, b: tmpC.b, drag: 4, a0: 0.7,
        });
      }
    },
    poof(at, color, n = 26) {
      tmpC.set(color);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(1.5 + Math.random() * 2.5);
        const white = Math.random() < 0.5;
        spawn({
          x: at.x, y: at.y, z: at.z, vx: v.x, vy: v.y + 1, vz: v.z, max: 0.7 + Math.random() * 0.5,
          s0: 0.6, s1: 1.6, r: white ? 1 : tmpC.r, g: white ? 1 : tmpC.g, b: white ? 1 : tmpC.b, drag: 3, a0: 0.9,
        });
      }
    },
    sparkle(at, color, n = 12) {
      tmpC.set(color);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 2);
        spawn({ x: at.x, y: at.y, z: at.z, vx: v.x, vy: v.y + 2, vz: v.z, max: 0.8, s0: 0.25, s1: 0.05, r: tmpC.r, g: tmpC.g, b: tmpC.b, grav: -6, drag: 1, a0: 1 });
      }
    },
    confetti(at, colors, n = 120) {
      for (let i = 0; i < n; i++) {
        tmpC.set(colors[i % colors.length]);
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 5;
        spawn({
          x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * sp, vy: 5 + Math.random() * 7, vz: Math.sin(a) * sp,
          max: 2.2 + Math.random() * 1.2, s0: 0.28, s1: 0.2, r: tmpC.r, g: tmpC.g, b: tmpC.b, grav: -9, drag: 0.8, a0: 1,
        });
      }
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.life <= 0) { alpha[i] = 0; continue; }
        p.life -= dt;
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k; p.vz *= k; p.vy = p.vy * k + p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const u = 1 - Math.max(0, p.life) / p.max;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
        size[i] = p.s0 + (p.s1 - p.s0) * u;
        alpha[i] = p.a0 * (1 - u * u);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
    },
    setScale(pxPerUnitAtDist1) { mat.uniforms.scale.value = pxPerUnitAtDist1; },
    clear() { P.forEach((p) => { p.life = 0; }); },
  };
}

// ---------------------------------------------------------------- wind leaves

export function createLeaves(scene, max = 70) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.12);
  shape.quadraticCurveTo(0.1, 0, 0, 0.12);
  shape.quadraticCurveTo(-0.1, 0, 0, -0.12);
  const geo = new THREE.ShapeGeometry(shape, 4);
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const cols = [0x8bc34a, 0xcddc39, 0xffb74d, 0xff8a65, 0xa5d66b];
  const L = Array.from({ length: max }, (_, i) => {
    mesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    return { on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0 };
  });
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) mesh.setMatrixAt(i, hide);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  let acc = 0;
  return {
    /** wind: Vector3 direction*strength (0..~5), focus: centre point to blow leaves around */
    update(dt, wind, focus, extraRate = 0) {
      const strength = wind.length();
      acc += dt * (strength * 5 + extraRate);
      while (acc > 1) {
        acc -= 1;
        const l = L.find((x) => !x.on);
        if (!l) break;
        const dir = strength > 0.01 ? wind.clone().normalize() : new THREE.Vector3(1, 0, 0);
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        l.on = true;
        l.life = 5;
        l.p.copy(focus).addScaledVector(dir, -12).addScaledVector(side, (Math.random() - 0.5) * 14);
        l.p.y += (Math.random() - 0.3) * 8;
        l.v.copy(dir).multiplyScalar(3 + strength * 1.6 + Math.random() * 2);
        l.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      }
      for (let i = 0; i < max; i++) {
        const l = L[i];
        if (!l.on) continue;
        l.life -= dt;
        l.p.addScaledVector(l.v, dt);
        l.p.y += Math.sin(l.life * 3 + i) * dt * 0.8;
        l.rot.x += l.spin.x * dt; l.rot.y += l.spin.y * dt; l.rot.z += l.spin.z * dt;
        if (l.life <= 0) { l.on = false; mesh.setMatrixAt(i, hide); continue; }
        q.setFromEuler(l.rot);
        m4.compose(l.p, q, one);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { L.forEach((l, i) => { l.on = false; mesh.setMatrixAt(i, hide); }); mesh.instanceMatrix.needsUpdate = true; },
  };
}

// ---------------------------------------------------------------- sounds

let actx = null;
let bus = null;
function ac() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      bus = actx.createGain();
      bus.gain.value = 0.5;
      bus.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
  } catch { return null; }
  return actx;
}

let lastKnock = 0;
let knocksThisWindow = 0;
/** Wooden block knock; intensity 0..1, pitch varies per material. */
export function knock(intensity = 0.5, kind = 'wood') {
  if (sfx.muted) return;
  const now = performance.now();
  if (now - lastKnock < 45) return;
  if (now - lastKnock > 400) knocksThisWindow = 0;
  if (++knocksThisWindow > 8) return;
  lastKnock = now;
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const vol = Math.min(1, 0.15 + intensity * 0.85) * 0.5;
  const base = kind === 'heavy' ? 130 : kind === 'ice' ? 1400 : kind === 'bouncy' ? 260 : 520;
  const f = base * (0.8 + Math.random() * 0.45) * (1.15 - intensity * 0.3);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = kind === 'ice' ? 'sine' : 'triangle';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(kind === 'bouncy' ? f * 2.2 : f * 0.7, t + 0.12);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'heavy' ? 0.25 : kind === 'bouncy' ? 0.18 : 0.09));
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.3);
  // click transient
  const len = Math.floor(a.sampleRate * 0.02);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * 3;
  bp.Q.value = 2;
  const g2 = a.createGain();
  g2.gain.value = vol * 0.9;
  src.connect(bp).connect(g2).connect(bus);
  src.start(t);
}

/** Soft whoosh for wind gusts / audience blows. */
export function windWhoosh(strength = 0.5) {
  if (sfx.muted) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const dur = 0.9;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(300, t);
  f.frequency.linearRampToValueAtTime(900 + strength * 600, t + dur * 0.4);
  f.frequency.linearRampToValueAtTime(250, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.12 + strength * 0.2, t + dur * 0.35);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t);
}

export function closeAudio() {
  try { actx?.close(); } catch { /* noop */ }
  actx = null;
  bus = null;
}
