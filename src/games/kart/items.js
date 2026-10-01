// Rainbow item boxes, coins, item odds, and projectiles / hazards (shells, peels) incl. items dragged behind as shields.
import * as THREE from 'three';
import { canvasTex } from './util.js';
import { KART_SCALE } from './kart.js';

// ------------------------------------------------------------------ odds

/** Position-weighted item odds. p = 0 for the leader .. 1 for last place. */
export function rollItem(p, n, { zapAllowed = true } = {}) {
  let table;
  if (n <= 1) table = { pepper: 25, pepper3: 10, peel: 15, bouncer: 20, homing: 15, star: 5, coins: 10 };
  else if (p < 0.15) table = { peel: 34, bouncer: 28, coins: 22, homing: 6, pepper: 10 };
  else if (p < 0.4) table = { peel: 16, bouncer: 22, homing: 22, pepper: 20, pepper3: 6, coins: 10, star: 3, zap: 1 };
  else if (p < 0.7) table = { pepper: 18, pepper3: 18, homing: 24, bouncer: 10, star: 10, peel: 6, zap: 4, coins: 8 };
  else table = { pepper3: 30, star: 22, homing: 20, zap: 10, pepper: 12, bouncer: 6 };
  if (!zapAllowed) delete table.zap;
  let sum = 0;
  for (const k in table) sum += table[k];
  let x = Math.random() * sum;
  for (const k in table) { x -= table[k]; if (x <= 0) return k; }
  return 'pepper';
}

export const HOLDABLE = new Set(['peel', 'bouncer', 'homing']);

// ------------------------------------------------------------------ meshes

function questionTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.font = '900 104px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 14; g.strokeStyle = 'rgba(40,20,90,0.85)';
    g.strokeText('?', w / 2, h / 2 + 6);
    g.fillStyle = '#ffffff';
    g.fillText('?', w / 2, h / 2 + 6);
  }, { repeat: false });
}

function shellTexture(base, dark) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = dark; g.lineWidth = 6;
    const R = 22;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        const cx = col * R * 1.5 * 1.15 + (row % 2) * R * 0.86; const cy = row * R * 1.15 + 10;
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8); }
        g.closePath(); g.stroke();
      }
    }
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

function makeShellParts(base, dark, emissive) {
  const dome = new THREE.SphereGeometry(0.72, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const tex = shellTexture(base, dark);
  const domeMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.05, emissive, emissiveIntensity: 0.25 });
  const rim = new THREE.TorusGeometry(0.72, 0.13, 10, 28);
  rim.rotateX(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.45 });
  const under = new THREE.CylinderGeometry(0.72, 0.6, 0.22, 24);
  under.translate(0, -0.11, 0);
  return { dome, domeMat, rim, rimMat, under };
}

function makePeelGeo() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.55, emissive: 0x332200, emissiveIntensity: 0.2 });
  const inner = new THREE.MeshStandardMaterial({ color: 0xfff1b0, roughness: 0.7 });
  const petal = new THREE.SphereGeometry(0.5, 12, 8);
  petal.scale(0.42, 0.16, 1);
  petal.translate(0, 0.05, 0.45);
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(petal, mat);
    m.rotation.y = k * (Math.PI * 2 / 3);
    m.rotation.x = -0.25;
    g.add(m);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), inner);
  core.scale.set(1, 1.3, 1);
  core.position.y = 0.25;
  g.add(core);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.28, 8), new THREE.MeshStandardMaterial({ color: 0x6a4a10, roughness: 0.8 }));
  stem.position.y = 0.6;
  g.add(stem);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.25);
  return g;
}

const BOX_VERT = `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vPh;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vPh = instanceMatrix[3].x * 0.05 + instanceMatrix[3].z * 0.07;
    vec4 mv = viewMatrix * wp;
    vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const BOX_FRAG = `
  uniform float uTime;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vPh;
  vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  void main() {
    vec2 e = abs(vUv - 0.5) * 2.0;
    float edge = smoothstep(0.78, 0.97, max(e.x, e.y));
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    vec3 c = hue(fract(uTime * 0.35 + vPh + vUv.x * 0.35 + vUv.y * 0.2));
    vec3 col = mix(c * 0.55 + 0.25, vec3(1.0), edge * 0.55) ;
    float a = 0.28 + 0.45 * fres + 0.6 * edge;
    gl_FragColor = vec4(col * (0.9 + edge * 0.9), clamp(a, 0.0, 0.95));
  }`;

// ------------------------------------------------------------------ system

export class ItemSystem {
  constructor({ scene, track, fx, events }) {
    this.scene = scene;
    this.track = track;
    this.fx = fx;
    this.events = events; // (name, data)
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tmp = {};
    this.projectiles = [];
    this.hazards = [];
    this.trails = new Map(); // kart -> mesh dragged behind

    // ---- item boxes (rows across the track)
    const slots = [];
    for (const row of track.items) {
      for (let k = -2; k <= 2; k++) {
        const lat = k * 3.2;
        const p = track.pointAt(row.s, lat);
        slots.push({ x: p.x, y: p.y + 1.55, z: p.z, s: row.s, lat, respawn: 0, phase: Math.random() * 6, scale: 1 });
      }
    }
    this.boxes = slots;
    this.boxUniforms = { uTime: { value: 0 } };
    const boxGeo = new THREE.BoxGeometry(1.75, 1.75, 1.75);
    const boxMat = new THREE.ShaderMaterial({
      uniforms: this.boxUniforms, vertexShader: BOX_VERT, fragmentShader: BOX_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    });
    this.boxMesh = new THREE.InstancedMesh(boxGeo, boxMat, Math.max(1, slots.length));
    this.boxMesh.frustumCulled = false;
    this.boxMesh.renderOrder = 4;
    this.group.add(this.boxMesh);
    // "?" marks: one Points draw call
    const qGeo = new THREE.BufferGeometry();
    this.qPos = new Float32Array(Math.max(1, slots.length) * 3);
    this.qAlpha = new Float32Array(Math.max(1, slots.length));
    this.qPosAttr = new THREE.BufferAttribute(this.qPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.qAlphaAttr = new THREE.BufferAttribute(this.qAlpha, 1).setUsage(THREE.DynamicDrawUsage);
    qGeo.setAttribute('position', this.qPosAttr);
    qGeo.setAttribute('alpha', this.qAlphaAttr);
    this.qUniforms = { map: { value: questionTexture() }, uScale: { value: 400 } };
    this.qPoints = new THREE.Points(qGeo, new THREE.ShaderMaterial({
      uniforms: this.qUniforms, transparent: true, depthWrite: false,
      vertexShader: 'attribute float alpha; uniform float uScale; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = 1.15*uScale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; vA = alpha; }',
      fragmentShader: 'uniform sampler2D map; varying float vA; void main(){ if (vA < 0.01) discard; vec4 t = texture2D(map, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y)); gl_FragColor = vec4(t.rgb, t.a * vA); }',
    }));
    this.qPoints.frustumCulled = false;
    this.qPoints.renderOrder = 5;
    this.group.add(this.qPoints);

    // ---- coins (rows along the racing line)
    const coinSlots = [];
    const L = track.L;
    const nRows = Math.max(4, Math.round(L / 110));
    for (let r = 0; r < nRows; r++) {
      const s0 = (r + 0.55) * (L / nRows);
      const lat0 = (r % 3 - 1) * 4.5;
      for (let k = 0; k < 4; k++) {
        const p = track.pointAt(s0 + k * 3.4, lat0);
        coinSlots.push({ x: p.x, y: p.y + 1.0, z: p.z, respawn: 0 });
      }
    }
    this.coinSlots = coinSlots;
    const coinGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.16, 22);
    coinGeo.rotateX(Math.PI / 2);
    this.coinMesh = new THREE.InstancedMesh(coinGeo, new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 0.75, roughness: 0.25, emissive: 0x7a4a00, emissiveIntensity: 0.55 }), coinSlots.length);
    this.coinMesh.castShadow = true;
    this.coinMesh.frustumCulled = false;
    this.group.add(this.coinMesh);
    this._o = new THREE.Object3D();

    // ---- projectile prototypes
    this.green = makeShellParts('#2fd06a', '#137a35', 0x0b3a18);
    this.red = makeShellParts('#ff3b4f', '#9a1020', 0x5a0010);
    this.peelProto = makePeelGeo();
  }

  makeShell(kind) {
    const p = kind === 'homing' ? this.red : this.green;
    const g = new THREE.Group();
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(p.dome, p.domeMat), new THREE.Mesh(p.rim, p.rimMat), new THREE.Mesh(p.under, p.rimMat));
    spin.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(spin);
    g.userData.spin = spin;
    g.scale.setScalar(1.15);
    return g;
  }

  makePeel() { return this.peelProto.clone(); }

  // ------------------------------------------------------------------ boxes & coins

  updateBoxes(dt, t, karts, onPick) {
    this.boxUniforms.uTime.value = t;
    const o = this._o;
    this.boxes.forEach((b, i) => {
      if (b.respawn > 0) {
        b.respawn -= dt;
        b.scale = b.respawn < 0.45 ? Math.max(0.01, 1 - b.respawn / 0.45) : 0.001;
      } else {
        b.scale = 1;
        for (const k of karts) {
          if (k.finished && k.human === false) continue;
          const dx = k.x - b.x; const dz = k.z - b.z;
          if (dx * dx + dz * dz < 2.4 * 2.4 && Math.abs(k.y + 1 - b.y) < 2.8) {
            b.respawn = 2.4;
            b.scale = 0.001;
            for (let c = 0; c < 6; c++) {
              this.fx.burst(b.x, b.y, b.z, { n: 5, color: [0xff4d4d, 0xffcc00, 0x34d058, 0x3d8bff, 0xb86bff, 0xff5cc8][c], speed: 9, size: 0.7, life: 0.55, grav: 10 });
            }
            onPick(k);
            break;
          }
        }
      }
      const by = b.y + Math.sin(t * 2.3 + b.phase) * 0.22;
      o.position.set(b.x, by, b.z);
      o.rotation.set(Math.sin(t * 1.1 + b.phase) * 0.45, t * 1.4 + b.phase, 0.35);
      o.scale.setScalar(b.scale);
      o.updateMatrix();
      this.boxMesh.setMatrixAt(i, o.matrix);
      this.qPos[i * 3] = b.x; this.qPos[i * 3 + 1] = by; this.qPos[i * 3 + 2] = b.z;
      this.qAlpha[i] = b.scale > 0.7 ? 1 : 0;
    });
    this.boxMesh.instanceMatrix.needsUpdate = true;
    this.qPosAttr.needsUpdate = true;
    this.qAlphaAttr.needsUpdate = true;
  }

  updateCoins(dt, t, karts, onCoin) {
    const o = this._o;
    this.coinSlots.forEach((c, i) => {
      let sc = 1;
      if (c.respawn > 0) {
        c.respawn -= dt;
        sc = c.respawn < 0.4 ? 1 - c.respawn / 0.4 : 0.001;
      } else {
        for (const k of karts) {
          const dx = k.x - c.x; const dz = k.z - c.z;
          if (dx * dx + dz * dz < 1.9 * 1.9 && Math.abs(k.y + 0.8 - c.y) < 2.2) {
            c.respawn = 9;
            sc = 0.001;
            this.fx.burst(c.x, c.y, c.z, { n: 8, color: 0xffd84a, speed: 4, size: 0.5, life: 0.35, grav: 6 });
            onCoin(k);
            break;
          }
        }
      }
      o.position.set(c.x, c.y + Math.sin(t * 3 + i) * 0.12, c.z);
      o.rotation.set(0, t * 3.2 + i * 0.4, 0);
      o.scale.setScalar(sc);
      o.updateMatrix();
      this.coinMesh.setMatrixAt(i, o.matrix);
    });
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  setPointScale(px) { this.qUniforms.uScale.value = px; }

  // ------------------------------------------------------------------ held items (dragged behind)

  hold(kart, kind) {
    this.dropTrail(kart);
    const m = kind === 'peel' ? this.makePeel() : this.makeShell(kind);
    m.position.set(kart.x, kart.y + 0.5, kart.z);
    this.group.add(m);
    this.trails.set(kart, { mesh: m, kind, x: kart.x, y: kart.y, z: kart.z });
    kart.held = kind;
  }

  dropTrail(kart) {
    const tr = this.trails.get(kart);
    if (!tr) return;
    this.group.remove(tr.mesh);
    this.trails.delete(kart);
    kart.held = null;
  }

  /** Fire / drop the held item. aim: -1 forward (swipe up), 0 default, +1 backward. */
  release(kart, aim, ranking) {
    const tr = this.trails.get(kart);
    if (!tr) return false;
    const kind = tr.kind;
    this.group.remove(tr.mesh);
    this.trails.delete(kart);
    kart.held = null;
    this.fire(kart, kind, aim, ranking);
    return true;
  }

  fire(kart, kind, aim, ranking) {
    const sin = Math.sin(kart.heading); const cos = Math.cos(kart.heading);
    const back = kind === 'peel' ? aim > -0.5 : aim > 0.5;
    if (kind === 'peel' && back) {
      const x = kart.x - sin * 2.8; const z = kart.z - cos * 2.8;
      this.addPeel(x, z, kart, kart.idx);
      this.events('drop', kart);
      return;
    }
    if (kind === 'peel') {
      const m = this.makePeel();
      this.group.add(m);
      const sp = Math.max(0, kart.speed) + 15;
      this.projectiles.push({ kind: 'peelThrow', mesh: m, owner: kart, x: kart.x + sin * 2.6, y: kart.y + 1.4, z: kart.z + cos * 2.6, vx: sin * sp, vz: cos * sp, vy: 9, idx: kart.idx, age: 0 });
      this.events('throw', kart);
      return;
    }
    const m = this.makeShell(kind);
    this.group.add(m);
    const dir = back ? -1 : 1;
    let target = null;
    if (kind === 'homing' && !back) {
      const me = ranking.indexOf(kart);
      for (let i = me - 1; i >= 0; i--) { if (!ranking[i].finished) { target = ranking[i]; break; } }
    }
    const sp = back ? 34 : Math.max(52, kart.speed + 24);
    const hd = dir > 0 ? kart.heading : kart.heading + Math.PI;
    this.projectiles.push({
      kind: kind === 'homing' && target ? 'homing' : 'bouncer', color: kind, mesh: m, owner: kart, target,
      x: kart.x + Math.sin(hd) * 2.6, y: kart.y + 0.5, z: kart.z + Math.cos(hd) * 2.6,
      vx: Math.sin(hd) * sp, vz: Math.cos(hd) * sp, heading: hd, speed: sp, idx: kart.idx, s: kart.s, lat: kart.lat, age: 0, bounces: 0,
    });
    this.events('shoot', kart);
  }

  addPeel(x, z, owner, hint) {
    this.track.project(x, z, hint, this.tmp);
    const m = this.makePeel();
    const y = this.tmp.y + this.track.rampHeight(this.tmp.s, this.tmp.lat);
    m.position.set(x, y + 0.05, z);
    m.rotation.y = Math.random() * 6;
    this.group.add(m);
    this.hazards.push({ mesh: m, x, y, z, owner, age: 0 });
    if (this.hazards.length > 18) this.removeHazard(this.hazards[0]);
  }

  removeHazard(h) {
    this.group.remove(h.mesh);
    const i = this.hazards.indexOf(h);
    if (i >= 0) this.hazards.splice(i, 1);
  }

  removeProjectile(p) {
    this.group.remove(p.mesh);
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
  }

  hitKart(k, by, kind) {
    const r = k.hit(kind);
    this.events('hit', { kart: k, by, kind, result: r.result || r, lost: r.lost || 0 });
    return r;
  }

  // ------------------------------------------------------------------ simulation

  update(dt, t, karts) {
    const tr = this.track;
    const tmp = this.tmp;
    // trailing items follow their karts
    for (const [k, h] of this.trails) {
      const sin = Math.sin(k.heading); const cos = Math.cos(k.heading);
      const d = 2.3 * (k.shrinkVis ?? 1) + 0.4;
      const tx = k.x - sin * d; const tz = k.z - cos * d;
      h.x += (tx - h.x) * Math.min(1, dt * 18);
      h.z += (tz - h.z) * Math.min(1, dt * 18);
      h.y = k.y + (h.kind === 'peel' ? 0.05 : 0.45);
      h.mesh.position.set(h.x, h.y, h.z);
      h.mesh.rotation.y = h.kind === 'peel' ? k.heading : 0;
      if (h.mesh.userData.spin) h.mesh.userData.spin.rotation.y += dt * 8;
    }
    // peels on track
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.age += dt;
      for (const k of karts) {
        if (!k.grounded) continue;
        if (k === h.owner && h.age < 0.7) continue;
        const dx = k.x - h.x; const dz = k.z - h.z;
        if (dx * dx + dz * dz < 1.9 * 1.9) {
          this.hitKart(k, h.owner, 'peel');
          this.removeHazard(h);
          break;
        }
      }
    }
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      if (p.kind === 'peelThrow') {
        p.vy -= 28 * dt;
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        tr.project(p.x, p.z, p.idx, tmp);
        p.idx = tmp.idx;
        const lim = tr.wallDist - 1;
        if (Math.abs(tmp.lat) > lim) { p.x -= tmp.rx * (Math.abs(tmp.lat) - lim) * Math.sign(tmp.lat); p.z -= tmp.rz * (Math.abs(tmp.lat) - lim) * Math.sign(tmp.lat); }
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.rotation.y += dt * 9;
        if (p.y < tmp.y + 0.05 && p.vy < 0) {
          this.removeProjectile(p);
          this.addPeel(p.x, p.z, p.owner, p.idx);
        }
        continue;
      }
      let dead = p.age > (p.kind === 'homing' ? 9 : 7);
      if (p.kind === 'homing') {
        const tgt = p.target && !p.target.finished ? p.target : null;
        let dx; let dz;
        const dT = tgt ? Math.hypot(tgt.x - p.x, tgt.z - p.z) : Infinity;
        if (tgt && dT < 28) { dx = tgt.x - p.x; dz = tgt.z - p.z; }
        else {
          const wantLat = tgt ? Math.max(-6, Math.min(6, tgt.lat)) : p.lat * 0.9;
          p.lat += (wantLat - p.lat) * Math.min(1, dt * 2);
          const ahead = tr.pointAt(p.s + 12, p.lat);
          dx = ahead.x - p.x; dz = ahead.z - p.z;
        }
        const want = Math.atan2(dx, dz);
        let da = want - p.heading;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const turn = (dT < 28 ? 9 : 5) * dt;
        p.heading += Math.max(-turn, Math.min(turn, da));
        if (tgt) p.speed = Math.max(p.speed, Math.abs(tgt.speed) + 12);
        p.vx = Math.sin(p.heading) * p.speed; p.vz = Math.cos(p.heading) * p.speed;
        p.x += p.vx * dt; p.z += p.vz * dt;
        tr.project(p.x, p.z, p.idx, tmp);
        p.idx = tmp.idx; p.s = tmp.s;
        const lim = tr.wallDist - 0.9;
        if (Math.abs(tmp.lat) > lim) { p.x -= tmp.rx * (Math.abs(tmp.lat) - lim) * Math.sign(tmp.lat); p.z -= tmp.rz * (Math.abs(tmp.lat) - lim) * Math.sign(tmp.lat); }
        if (Math.random() < 0.7) this.fx.glow.emit(p.x, p.y + 0.3, p.z, 0, 0.5, 0, { color: 0xff5060, size: 0.9, life: 0.25 });
      } else {
        p.x += p.vx * dt; p.z += p.vz * dt;
        tr.project(p.x, p.z, p.idx, tmp);
        p.idx = tmp.idx; p.s = tmp.s;
        const lim = tr.wallDist - 0.9;
        if (Math.abs(tmp.lat) > lim) {
          const sg = Math.sign(tmp.lat);
          const vr = p.vx * tmp.rx + p.vz * tmp.rz;
          if (vr * sg > 0) { p.vx -= 2 * vr * tmp.rx; p.vz -= 2 * vr * tmp.rz; p.bounces++; this.events('bounce', p); }
          p.x -= tmp.rx * (Math.abs(tmp.lat) - lim) * sg; p.z -= tmp.rz * (Math.abs(tmp.lat) - lim) * sg;
          this.fx.burst(p.x, p.y, p.z, { n: 6, color: 0xbfffd0, speed: 4, size: 0.4, life: 0.25, grav: 8 });
          if (p.bounces > 6) dead = true;
        }
      }
      p.y = tmp.y + tr.rampHeight(tmp.s, tmp.lat) + 0.45;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.userData.spin.rotation.y += dt * 14;
      // hits: karts
      for (const k of karts) {
        if (k === p.owner && p.age < 0.45) continue;
        const dx = k.x - p.x; const dz = k.z - p.z;
        const rr = 1.15 * KART_SCALE * (k.shrinkVis ?? 1) * 0.75 + 0.6;
        if (dx * dx + dz * dz < rr * rr && Math.abs(k.y + 0.6 - p.y) < 2.4) {
          this.hitKart(k, p.owner, 'shell');
          this.fx.burst(p.x, p.y + 0.4, p.z, { n: 22, color: p.color === 'homing' ? 0xff6070 : 0x7dffa0, speed: 9, size: 0.8, life: 0.45, grav: 8 });
          dead = true;
          break;
        }
      }
      // hits: items dragged behind karts (shields)
      if (!dead) {
        for (const [k, h] of this.trails) {
          if (k === p.owner && p.age < 0.6) continue;
          const dx = h.x - p.x; const dz = h.z - p.z;
          if (dx * dx + dz * dz < 1.5 * 1.5) {
            this.dropTrail(k);
            this.events('blocked', { kart: k });
            this.fx.burst(h.x, h.y + 0.4, h.z, { n: 20, color: 0xffffff, speed: 7, size: 0.7, life: 0.4, grav: 8 });
            dead = true;
            break;
          }
        }
      }
      // hits: peels on the road
      if (!dead) {
        for (let j = this.hazards.length - 1; j >= 0; j--) {
          const h = this.hazards[j];
          const dx = h.x - p.x; const dz = h.z - p.z;
          if (dx * dx + dz * dz < 1.6 * 1.6) {
            this.removeHazard(h);
            this.fx.burst(h.x, h.y + 0.4, h.z, { n: 14, color: 0xffe060, speed: 6, size: 0.6, life: 0.4, grav: 8 });
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        if (p.age > 6.9) this.fx.burst(p.x, p.y, p.z, { n: 10, color: 0xffffff, speed: 4, size: 0.5, life: 0.3, grav: 4 });
        this.removeProjectile(p);
      }
    }
    // shell vs shell
    for (let a = this.projectiles.length - 1; a >= 0; a--) {
      const A = this.projectiles[a];
      if (A.kind === 'peelThrow') continue;
      for (let b = a - 1; b >= 0; b--) {
        const B = this.projectiles[b];
        if (B.kind === 'peelThrow') continue;
        if ((A.x - B.x) ** 2 + (A.z - B.z) ** 2 < 1.6 * 1.6) {
          this.fx.burst(A.x, A.y, A.z, { n: 16, color: 0xffffff, speed: 7, size: 0.6, life: 0.35, grav: 6 });
          this.removeProjectile(A); this.removeProjectile(B);
          a--; break;
        }
      }
    }
  }

  clearAll() {
    for (const p of [...this.projectiles]) this.removeProjectile(p);
    for (const h of [...this.hazards]) this.removeHazard(h);
    for (const k of [...this.trails.keys()]) this.dropTrail(k);
    for (const b of this.boxes) { b.respawn = 0; b.scale = 1; }
    for (const c of this.coinSlots) c.respawn = 0;
  }

  dispose() {
    this.clearAll();
    this.scene.remove(this.group);
    this.boxMesh.geometry.dispose(); this.boxMesh.material.dispose();
    this.qPoints.geometry.dispose(); this.qPoints.material.dispose(); this.qUniforms.map.value.dispose();
    this.coinMesh.geometry.dispose(); this.coinMesh.material.dispose();
    for (const p of [this.green, this.red]) { p.dome.dispose(); p.rim.dispose(); p.under.dispose(); p.domeMat.map.dispose(); p.domeMat.dispose(); p.rimMat.dispose(); }
    this.peelProto.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}
