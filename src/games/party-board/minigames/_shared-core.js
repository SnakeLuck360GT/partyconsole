// Shared minigame runtime: stage + camera rig + particles + HUD + timers + abort-safe flow.
//
//   const s = await createSession(env, { title, theme options… });
//   await s.intro();                 // title card + 3-2-1-GO (abortable)
//   await s.play(45, { until })      // runs the timer until time's up, until() is true, or abort
//   await s.finish(winnerIds)        // FINISH! + winners cheer (~2.4 s)
//   s.dispose();                     // removes everything (stage, DOM, timers, frame fns)
//
// Everything created through the session is cleaned up by dispose().
import { THREE, createStage } from '../../../sdk/three-kit.js';
import { countdown } from '../../../sdk/screen-kit.js';
import { sfx } from '../../../sdk/audio.js';
import { createHud } from './_shared-hud.js';

export { THREE, sfx };

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();

export async function createSession(env, opts = {}) {
  const {
    title = 'Minigame',
    background = 0x8fd3ff,
    sky = null, // [topColor, horizonColor]
    fog = null,
    shadowArea = 22,
    fov = 42,
    sunIntensity = 2.4,
    envIntensity = 0.7,
    hud = {},
    camera: camOpts = {},
  } = opts;

  const disposers = [];
  const timers = new Set();
  const frameOffs = [];
  let disposed = false;
  const signal = env.signal;

  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#000';
  env.container.appendChild(root);

  const stage = createStage(root, { background, fog, shadowArea, fov, sunIntensity, envIntensity });
  const { scene, camera, renderer, sun } = stage;
  renderer.toneMappingExposure = opts.exposure ?? 0.95;
  sun.position.set(12, 26, 14);
  if (sky) scene.add(makeSky(sky[0], sky[1], sky[2]));

  const players = env.players.slice(0, 8);
  const byId = new Map(players.map((p) => [p.id, p]));

  const s = {
    env, players, byId, stage, scene, camera, renderer, sun, root,
    get aborted() { return !!signal?.aborted || disposed; },
    get disposed() { return disposed; },
    input: (pid) => env.input.get(pid),
    vibrate: (pid, ms = 40) => { try { env.send?.(pid, { type: 'vibrate', ms }); } catch { /* noop */ } },
    status: (pid, text) => { try { env.send?.(pid, { type: 'status', text }); } catch { /* noop */ } },
    onFrame(fn) { const off = stage.onFrame((dt, t) => { if (!disposed) fn(dt, t); }); frameOffs.push(off); return off; },
    after(ms, fn) {
      const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms);
      timers.add(id);
      return id;
    },
    every(ms, fn) {
      const id = setInterval(() => { if (!disposed) fn(); }, ms);
      timers.add(id);
      return id;
    },
    clear(id) { clearTimeout(id); clearInterval(id); timers.delete(id); },
    /** Sleep that resolves early (never rejects) when aborted. */
    wait(ms) {
      return new Promise((res) => {
        if (s.aborted) { res(); return; }
        const done = () => { signal?.removeEventListener('abort', done); clearTimeout(id); timers.delete(id); res(); };
        const id = setTimeout(done, ms);
        timers.add(id);
        signal?.addEventListener('abort', done, { once: true });
      });
    },
    addDisposer(fn) { disposers.push(fn); },
  };

  // ------------------------------------------------------------------ camera rig
  const cam = {
    center: new THREE.Vector3(),
    dist: camOpts.dist ?? 20,
    pitch: THREE.MathUtils.degToRad(camOpts.pitch ?? 55),
    yaw: THREE.MathUtils.degToRad(camOpts.yaw ?? 0),
    minDist: camOpts.minDist ?? 11,
    maxDist: camOpts.maxDist ?? 34,
    pad: camOpts.pad ?? 3.5,
    lookOffset: new THREE.Vector3(0, camOpts.lookY ?? 0, 0),
    targetCenter: new THREE.Vector3(),
    targetDist: camOpts.dist ?? 20,
    fixed: !!camOpts.fixed,
    lerp: camOpts.lerp ?? 2.5,
    shake: 0,
    /** Frame a set of world points (Vector3). */
    frame(points, { pad = cam.pad, min = cam.minDist, max = cam.maxDist } = {}) {
      if (!points.length) return;
      const box = new THREE.Box3();
      for (const p of points) box.expandByPoint(p);
      box.getCenter(cam.targetCenter);
      const size = box.getSize(tmpV);
      const r = Math.max(size.x, size.z * 1.25) / 2 + pad;
      const vfov = THREE.MathUtils.degToRad(camera.fov) / 2;
      const hfov = Math.atan(Math.tan(vfov) * camera.aspect);
      cam.targetDist = THREE.MathUtils.clamp(r / Math.sin(Math.min(vfov, hfov)), min, max);
    },
    set(center, dist) { cam.targetCenter.copy(center); cam.targetDist = dist; },
    snap() { cam.center.copy(cam.targetCenter); cam.dist = cam.targetDist; cam.apply(0); },
    apply(dt) {
      const k = dt ? 1 - Math.exp(-cam.lerp * dt) : 1;
      cam.center.lerp(cam.targetCenter, k);
      cam.dist += (cam.targetDist - cam.dist) * k;
      const cp = Math.cos(cam.pitch);
      camera.position.set(
        cam.center.x + Math.sin(cam.yaw) * cp * cam.dist,
        cam.center.y + Math.sin(cam.pitch) * cam.dist,
        cam.center.z + Math.cos(cam.yaw) * cp * cam.dist,
      );
      tmpV.copy(cam.center).add(cam.lookOffset);
      camera.lookAt(tmpV);
      if (cam.shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * cam.shake;
        camera.position.y += (Math.random() - 0.5) * cam.shake;
        camera.position.z += (Math.random() - 0.5) * cam.shake * 0.5;
        cam.shake *= Math.exp(-8 * (dt || 0.016));
      }
    },
  };
  s.cam = cam;
  s.shake = (amt = 0.4) => { cam.shake = Math.max(cam.shake, amt); };
  cam.targetCenter.set(0, 0, 0);
  cam.snap();
  s.onFrame((dt) => cam.apply(dt));

  // ------------------------------------------------------------------ particles
  s.fx = createFx(s);

  // ------------------------------------------------------------------ HUD
  s.hud = createHud(root, { title, players, portraits: env.portraits || {}, ...hud });
  disposers.push(() => s.hud.destroy());

  /** Floating text that rises from a world position (DOM, crisp). */
  s.pop = (pos, text, color = '#fff', { size = 1 } = {}) => {
    const v = tmpV.copy(pos).project(camera);
    if (v.z > 1) return;
    const d = document.createElement('div');
    d.className = 'pbm-pop';
    d.textContent = text;
    d.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
    d.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    d.style.color = color;
    d.style.fontSize = `${size * 3.2}vmin`;
    root.appendChild(d);
    s.after(1100, () => d.remove());
  };

  // ------------------------------------------------------------------ flow
  s.intro = async (text) => {
    if (s.aborted) return;
    s.hud.titleCard(title, text ?? opts.instructions ?? '');
    await s.wait(1300);
    if (s.aborted) return;
    await Promise.race([countdown(root), new Promise((r) => { signal?.addEventListener('abort', r, { once: true }); s.after(3300, r); })]);
    s.hud.hideTitleCard();
  };

  /**
   * Main phase clock. Resolves after `seconds`, when until() returns true, or on abort.
   * onTick(secondsLeft) called each frame. Returns elapsed seconds.
   */
  s.play = (seconds, { until, showTimer = true } = {}) => new Promise((resolve) => {
    if (s.aborted) { resolve(0); return; }
    // Wall-clock timer: slow machines (low fps, dt clamped) must not stretch the round past `duration`.
    let t = 0;
    const t0 = performance.now();
    let lastWhole = Math.ceil(seconds);
    let off = null;
    const done = () => { off?.(); signal?.removeEventListener('abort', done); s.hud.setTime(null); resolve(t); };
    signal?.addEventListener('abort', done, { once: true });
    off = s.onFrame(() => {
      t = (performance.now() - t0) / 1000;
      s.elapsed = t;
      const left = Math.max(0, seconds - t);
      if (showTimer) s.hud.setTime(left, seconds);
      const whole = Math.ceil(left);
      if (whole !== lastWhole) { lastWhole = whole; if (whole <= 5 && whole > 0) sfx.play('tick'); }
      if (left <= 0 || until?.()) done();
    });
  });
  s.elapsed = 0;

  /** FINISH! moment; winners (ids) cheer and get confetti. */
  s.finish = async (winnerIds = [], { text = 'FINISH!', chars = null } = {}) => {
    if (s.aborted) return;
    sfx.play('whoosh');
    s.hud.finish(text);
    await s.wait(1200);
    if (s.aborted) return;
    s.hud.hideFinish();
    const names = winnerIds.map((id) => byId.get(id)).filter(Boolean);
    if (names.length) {
      sfx.play('win');
      s.hud.winner(names);
      if (chars) {
        const pts = [];
        for (const id of winnerIds) {
          const c = chars.get?.(id);
          if (!c) continue;
          c.cheer?.();
          pts.push(c.root.position);
          s.fx.confetti(tmpV.copy(c.root.position).add(new THREE.Vector3(0, 2.5, 0)), 40);
        }
        if (pts.length) cam.frame(pts, { pad: 3, min: 7, max: 18 });
      }
    } else {
      sfx.play('lose');
      s.hud.winner([]);
    }
    await s.wait(2200);
  };

  s.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const id of timers) { clearTimeout(id); clearInterval(id); }
    timers.clear();
    frameOffs.forEach((off) => off());
    for (const fn of disposers.splice(0).reverse()) { try { fn(); } catch (e) { console.error(e); } }
    stage.dispose();
    root.remove();
  };
  // Abort → the minigame's own flow will observe s.aborted; ensure DOM is gone even if it forgets.
  return s;
}

/** Gradient sky dome. */
export function makeSky(top = 0x4aa8ff, bottom = 0xcfeaff, radius = 400) {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.4+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.8)),1.0); }',
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// ==================================================================== particles
class ParticlePool {
  constructor(scene, { max = 300, geometry, material }) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = max;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) { this.mesh.setColorAt(i, white); this.mesh.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); }
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.r = new Float32Array(max * 3); // rotation
    this.w = new Float32Array(max * 3); // spin
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.cursor = 0;
    this.active = 0;
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, { color, size = 0.2, life = 0.8, gravity = 12, drag = 1, spin = 6 }) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.r[i3] = Math.random() * 6; this.r[i3 + 1] = Math.random() * 6; this.r[i3 + 2] = Math.random() * 6;
    this.w[i3] = (Math.random() - 0.5) * spin; this.w[i3 + 1] = (Math.random() - 0.5) * spin; this.w[i3 + 2] = (Math.random() - 0.5) * spin;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grav[i] = gravity; this.drag[i] = drag;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      const i3 = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.mesh.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); continue; }
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[i3] *= dr; this.v[i3 + 2] *= dr; this.v[i3 + 1] = this.v[i3 + 1] * dr - this.grav[i] * dt;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.p[i3 + 1] < 0.03 && this.grav[i] > 0) { this.p[i3 + 1] = 0.03; this.v[i3 + 1] *= -0.3; this.v[i3] *= 0.7; this.v[i3 + 2] *= 0.7; }
      this.r[i3] += this.w[i3] * dt; this.r[i3 + 1] += this.w[i3 + 1] * dt; this.r[i3 + 2] += this.w[i3 + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      const sc = this.size[i] * Math.min(1, k * 3);
      tmpQ.setFromEuler(tmpE.set(this.r[i3], this.r[i3 + 1], this.r[i3 + 2]));
      tmpM.compose(tmpV.set(this.p[i3], this.p[i3 + 1], this.p[i3 + 2]), tmpQ, tmpS.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, tmpM);
    }
    if (any || this.active) this.mesh.instanceMatrix.needsUpdate = true;
    this.active = any;
  }
}

function createFx(s) {
  const puff = new ParticlePool(s.scene, {
    max: 260,
    geometry: new THREE.IcosahedronGeometry(1, 0),
    material: new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }),
  });
  const spark = new ParticlePool(s.scene, {
    max: 260,
    geometry: new THREE.OctahedronGeometry(1, 0),
    material: new THREE.MeshBasicMaterial({ toneMapped: false }),
  });
  const confettiMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5 });
  const confetti = new ParticlePool(s.scene, { max: 300, geometry: new THREE.PlaneGeometry(1, 0.6), material: confettiMat });
  // shockwave rings
  const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    m.visible = false;
    m.userData = { t: 0, dur: 0.5, r: 3 };
    s.scene.add(m);
    return m;
  });
  let ringCursor = 0;
  const col = new THREE.Color();
  const CONF = [0xff4d4d, 0xffcc00, 0x3d8bff, 0x34d058, 0xff5cc8, 0xb86bff, 0xffffff];
  s.onFrame((dt) => {
    puff.update(dt); spark.update(dt); confetti.update(dt);
    for (const r of rings) {
      if (!r.visible) continue;
      const u = r.userData;
      u.t += dt;
      const k = u.t / u.dur;
      if (k >= 1) { r.visible = false; continue; }
      const e = 1 - (1 - k) ** 3;
      r.scale.setScalar(0.2 + e * u.r);
      r.material.opacity = (1 - k) * 0.9;
    }
  });
  const fx = {
    /** Chunky smoke/dust/debris burst. */
    burst(pos, { color = 0xffffff, count = 12, speed = 4, up = 3, size = 0.18, life = 0.7, gravity = 10, spread = 0.3, drag = 2, glow = false } = {}) {
      const pool = glow ? spark : puff;
      const cols = Array.isArray(color) ? color : [color];
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = speed * (0.4 + Math.random() * 0.6);
        col.set(cols[i % cols.length]);
        pool.spawn(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * spread, pos.z + (Math.random() - 0.5) * spread,
          Math.cos(a) * sp, up * (0.5 + Math.random()), Math.sin(a) * sp,
          { color: col, size: size * (0.6 + Math.random() * 0.8), life: life * (0.6 + Math.random() * 0.6), gravity, drag });
      }
    },
    /** Dust puff at feet (soft, no gravity). */
    dust(pos, count = 4, color = 0xe8e2d0) {
      fx.burst(pos, { color, count, speed: 1.2, up: 0.8, size: 0.14, life: 0.45, gravity: -1, drag: 4 });
    },
    confetti(pos, count = 50) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 4;
        col.set(CONF[i % CONF.length]);
        confetti.spawn(pos.x, pos.y, pos.z, Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp,
          { color: col, size: 0.16 + Math.random() * 0.1, life: 2 + Math.random(), gravity: 6, drag: 1.8, spin: 14 });
      }
    },
    ring(pos, color = 0xffffff, radius = 3, dur = 0.45) {
      const r = rings[ringCursor];
      ringCursor = (ringCursor + 1) % rings.length;
      r.position.set(pos.x, pos.y + 0.06, pos.z);
      r.material.color.set(color);
      Object.assign(r.userData, { t: 0, dur, r: radius });
      r.scale.setScalar(0.2);
      r.visible = true;
    },
  };
  return fx;
}

// ==================================================================== small utils
export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function easeOutBack(t) { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }
export function easeOutCubic(t) { return 1 - (1 - t) ** 3; }

/** Tween helper bound to a session: tween(s, dur, (k)=>{}, ease) → Promise. */
export function tween(s, dur, fn, ease = easeOutCubic) {
  return new Promise((res) => {
    let t = 0;
    const off = s.onFrame((dt) => {
      t += dt;
      const k = Math.min(1, t / dur);
      fn(ease(k), k);
      if (k >= 1) { off(); res(); }
    });
    if (s.aborted) { off(); res(); }
  });
}

/** Turn a per-player "rank value" map into scores (higher = better), keeping ties equal. */
export function rankScores(values) {
  return { ...values };
}

/** Place n points evenly on a circle. */
export function ringPositions(n, radius, y = 0, offset = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = offset + (i / Math.max(1, n)) * Math.PI * 2;
    return new THREE.Vector3(Math.sin(a) * radius, y, Math.cos(a) * radius);
  });
}

export function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
