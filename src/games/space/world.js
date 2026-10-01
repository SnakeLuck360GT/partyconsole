// Star Skirmish simulation + entity visuals. Screen-authoritative, custom arcade physics on the XZ plane.
// Heading angle a: forward = (cos a, -sin a) in (x, z); a = 0 points right, +a turns counter-clockwise on screen.
import * as THREE from 'three';
import { makeLabel } from '../../sdk/three-kit.js';
import { sfx } from '../../sdk/audio.js';
import { glowTexture } from './fx.js';
import { POWERS, POWER_IDS } from './powers.js';

export const TUNE = {
  shipSpeed: 10,
  shipAccel: 2.6,
  turn: 4.3,
  dashSpeed: 25,
  dashTime: 0.2,
  dashCd: 1.0,
  shipR: 0.95,
  pilotR: 0.55,
  pilotSpeed: 4.4,
  pilotTurn: 5.5,
  bulletSpeed: 27,
  bulletLife: 1.05,
  ammoMax: 3,
  ammoRegen: 0.85,
  fireCd: 0.13,
  invuln: 1.6,
  crateEvery: 6.5,
};

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function segDist2(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l2 = dx * dx + dz * dz || 1e-6;
  const t = clamp(((px - x1) * dx + (pz - z1) * dz) / l2, 0, 1);
  const ex = x1 + dx * t - px;
  const ez = z1 + dz * t - pz;
  return ex * ex + ez * ez;
}

let sfxGate = 0;
function sound(name, gap = 40) {
  const now = performance.now();
  if (name === 'shoot' && now - sfxGate < gap) return;
  if (name === 'shoot') sfxGate = now;
  sfx.play(name);
}

export class World {
  constructor({ scene, fx, assets, R, events }) {
    this.scene = scene;
    this.fx = fx;
    this.assets = assets;
    this.R = R;
    this.ev = events;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.ships = new Map();
    this.pilots = new Map();
    this.state = new Map(); // pid -> 'ship' | 'pilot' | 'dead' | 'out'
    this.respawnAt = new Map(); // pid -> time (deathmatch)
    this.players = new Map(); // pid -> { player, index }
    this.inputs = new Map();
    this.bullets = [];
    this.asteroids = [];
    this.crates = [];
    this.mines = [];
    this.missiles = [];
    this.beams = [];
    this.running = false;
    this.mode = 'rounds';
    this.time = 0;
    this.W = 36;
    this.H = 20;
    this.map = null;
    this.crateT = 3;
    this.sudden = false;
    this._initBullets();
    this._initShared();
  }

  // ---------------------------------------------------------------- shared visuals
  _initShared() {
    const glow = glowTexture();
    this.glowTex = glow;
    this.shieldGeo = new THREE.SphereGeometry(1.55, 32, 20);
    this.shieldMatBase = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x4dd2ff) }, uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uTime; uniform float uAlpha; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float hex = 0.5 + 0.5*sin(vP.x*9.0 + uTime*3.0)*sin(vP.z*9.0 - uTime*2.0);
          gl_FragColor = vec4(uColor * (f * 2.2 + hex * 0.12) * uAlpha, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.iceGeo = new THREE.IcosahedronGeometry(1.5, 1);
    this.iceMat = new THREE.MeshStandardMaterial({ color: 0xbff3ff, emissive: 0x3bbbe0, emissiveIntensity: 0.5, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1, flatShading: true, depthWrite: false });
    this.ringGeo = new THREE.RingGeometry(0.62, 0.8, 40);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.beamGeo = new THREE.BoxGeometry(1, 1, 1);
    this.missileGeo = (() => {
      const g = new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8);
      g.rotateZ(-Math.PI / 2);
      return g;
    })();
    this.missileNoseGeo = (() => { const g = new THREE.ConeGeometry(0.14, 0.35, 8); g.rotateZ(-Math.PI / 2); g.translate(0.62, 0, 0); return g; })();
    this.missileMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ee, metalness: 0.7, roughness: 0.3 });
    this.iconCache = new Map();
  }

  iconMaterial(type) {
    if (!this.iconCache.has(type)) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const p = POWERS[type];
      g.fillStyle = 'rgba(8,10,24,0.75)';
      g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
      g.lineWidth = 8; g.strokeStyle = p.color; g.stroke();
      g.font = '64px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(p.icon, 64, 70);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.iconCache.set(type, new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    }
    return this.iconCache.get(type);
  }

  _initBullets() {
    const MAX = 600;
    const geo = new THREE.SphereGeometry(0.17, 10, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.bulletMesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bulletMesh.count = 0;
    this.bulletMesh.frustumCulled = false;
    this.bulletMesh.setColorAt(0, tmpC.set(0xffffff));
    this.bulletMesh.renderOrder = 4;
    this.scene.add(this.bulletMesh);
    this.bulletMax = MAX;
    const hgeo = new THREE.PlaneGeometry(1, 1);
    hgeo.rotateX(-Math.PI / 2);
    const hmat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.bulletGlow = new THREE.InstancedMesh(hgeo, hmat, MAX);
    this.bulletGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bulletGlow.count = 0;
    this.bulletGlow.frustumCulled = false;
    this.bulletGlow.setColorAt(0, tmpC.set(0xffffff));
    this.scene.add(this.bulletGlow);
  }

  // ---------------------------------------------------------------- setup
  setup({ map, W, H, mode, participants }) {
    this.clearEntities();
    this.map = map;
    this.W = W;
    this.H = H;
    this.mode = mode;
    this.sudden = false;
    this.crateT = 3.5;
    this.time = 0;
    for (let i = 0; i < map.asteroids; i++) {
      const p = this.freeSpot(3, 40);
      this.spawnAsteroid(p.x, p.z, 3, rand(-2, 2), rand(-2, 2));
    }
    const n = participants.length;
    const order = [...participants].sort(() => Math.random() - 0.5);
    order.forEach((pid, i) => {
      const ang = (i / n) * Math.PI * 2 + 0.3;
      let x = Math.cos(ang) * W * 0.36;
      let z = Math.sin(ang) * H * 0.34;
      if (this.blocked(x, z, 1.8)) { const p = this.freeSpot(1.8, 60, x, z); x = p.x; z = p.z; }
      // Face tangentially (counter-clockwise), a little toward the centre.
      const face = Math.atan2(z, -x) + Math.PI / 2 + 0.5;
      this.spawnShip(pid, x, z, -ang + Math.PI / 2 + 0.35 || face, { invuln: 0.5, quiet: true });
    });
  }

  addPlayer(p) {
    if (!this.players.has(p.id)) this.players.set(p.id, { player: p, index: p.index });
    else this.players.get(p.id).player = p;
    if (!this.inputs.has(p.id)) this.inputs.set(p.id, { rot: false, run: false, fireQ: 0, dashQ: 0 });
    if (!this.state.has(p.id)) this.state.set(p.id, 'out');
  }

  removePlayer(pid) {
    const s = this.ships.get(pid);
    if (s) { this.fx.flash(s.x, s.z, s.color, { size: 5, light: false }); this.fx.burst(s.x, s.z, s.color, 24, { speed: 6 }); this._removeShip(s); }
    const p = this.pilots.get(pid);
    if (p) this._removePilot(p);
    this.state.set(pid, 'out');
    this.respawnAt.delete(pid);
    this.players.delete(pid);
    this.inputs.delete(pid);
  }

  input(pid) {
    let i = this.inputs.get(pid);
    if (!i) { i = { rot: false, run: false, fireQ: 0, dashQ: 0 }; this.inputs.set(pid, i); }
    return i;
  }

  // ---------------------------------------------------------------- spatial helpers
  blocked(x, z, r) {
    const hx = this.W / 2 - r;
    const hz = this.H / 2 - r;
    if (x < -hx || x > hx || z < -hz || z > hz) return true;
    for (const w of this.map?.walls || []) {
      if (Math.abs(x - w.x) < w.hw + r && Math.abs(z - w.z) < w.hd + r) return true;
    }
    for (const a of this.map?.avoid || []) if (Math.hypot(x - a.x, z - a.z) < a.r + r) return true;
    return false;
  }

  freeSpot(r = 1.5, tries = 40, px = null, pz = null, awayFrom = null) {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < tries; i++) {
      const x = px !== null && i < tries / 2 ? px + rand(-4, 4) : rand(-this.W / 2 + r, this.W / 2 - r);
      const z = pz !== null && i < tries / 2 ? pz + rand(-4, 4) : rand(-this.H / 2 + r, this.H / 2 - r);
      if (this.blocked(x, z, r)) continue;
      let score = 0;
      if (awayFrom) {
        let md = 1e9;
        for (const e of awayFrom) md = Math.min(md, Math.hypot(e.x - x, e.z - z));
        score = md;
      } else {
        for (const s of this.ships.values()) if (Math.hypot(s.x - x, s.z - z) < 3) score -= 10;
        for (const a of this.asteroids) if (Math.hypot(a.x - x, a.z - z) < a.r + r + 1) score -= 10;
        score -= px !== null ? Math.hypot(x - px, z - pz) * 0.1 : 0;
      }
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    return best || { x: 0, z: 0 };
  }

  // Resolve a circle against arena bounds + walls + asteroids. Returns impact speed (0 if none).
  collideStatic(e, r, restitution = 0.55) {
    let hit = 0;
    const hx = this.W / 2 - r;
    const hz = this.H / 2 - r;
    if (e.x < -hx) { e.x = -hx; if (e.vx < 0) { hit = Math.max(hit, -e.vx); e.vx = -e.vx * restitution; } }
    if (e.x > hx) { e.x = hx; if (e.vx > 0) { hit = Math.max(hit, e.vx); e.vx = -e.vx * restitution; } }
    if (e.z < -hz) { e.z = -hz; if (e.vz < 0) { hit = Math.max(hit, -e.vz); e.vz = -e.vz * restitution; } }
    if (e.z > hz) { e.z = hz; if (e.vz > 0) { hit = Math.max(hit, e.vz); e.vz = -e.vz * restitution; } }
    for (const w of this.map.walls) {
      const cx = clamp(e.x, w.x - w.hw, w.x + w.hw);
      const cz = clamp(e.z, w.z - w.hd, w.z + w.hd);
      let dx = e.x - cx;
      let dz = e.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-5) {
        // centre inside the box: push out along the shallowest axis
        const ox = w.hw - Math.abs(e.x - w.x);
        const oz = w.hd - Math.abs(e.z - w.z);
        if (ox < oz) { dx = Math.sign(e.x - w.x) || 1; dz = 0; } else { dz = Math.sign(e.z - w.z) || 1; dx = 0; }
        d = 0;
        e.x = dx ? w.x + dx * (w.hw + r) : e.x;
        e.z = dz ? w.z + dz * (w.hd + r) : e.z;
      } else {
        dx /= d; dz /= d;
        e.x = cx + dx * r;
        e.z = cz + dz * r;
      }
      const vn = e.vx * dx + e.vz * dz;
      if (vn < 0) { hit = Math.max(hit, -vn); e.vx -= (1 + restitution) * vn * dx; e.vz -= (1 + restitution) * vn * dz; }
    }
    return hit;
  }

  pointBlocked(x, z) {
    if (x < -this.W / 2 || x > this.W / 2 || z < -this.H / 2 || z > this.H / 2) return true;
    for (const w of this.map.walls) if (Math.abs(x - w.x) < w.hw && Math.abs(z - w.z) < w.hd) return true;
    return false;
  }

  /** Distance along a ray until it leaves the arena or hits a wall. */
  rayLength(x, z, dx, dz) {
    let t = Infinity;
    const hx = this.W / 2;
    const hz = this.H / 2;
    if (dx > 1e-6) t = Math.min(t, (hx - x) / dx); else if (dx < -1e-6) t = Math.min(t, (-hx - x) / dx);
    if (dz > 1e-6) t = Math.min(t, (hz - z) / dz); else if (dz < -1e-6) t = Math.min(t, (-hz - z) / dz);
    for (const w of this.map.walls) {
      let t0 = -Infinity;
      let t1 = Infinity;
      for (const [o, d, lo, hi] of [[x, dx, w.x - w.hw, w.x + w.hw], [z, dz, w.z - w.hd, w.z + w.hd]]) {
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { t0 = Infinity; } continue; }
        let a = (lo - o) / d;
        let b = (hi - o) / d;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
      }
      if (t0 <= t1 && t0 > 0) t = Math.min(t, t0);
    }
    return Math.max(0, t);
  }

  // ---------------------------------------------------------------- ships
  spawnShip(pid, x, z, a, { invuln = TUNE.invuln, quiet = false } = {}) {
    const rec = this.players.get(pid);
    if (!rec) return null;
    const p = rec.player;
    const group = new THREE.Group();
    const body = new THREE.Group();
    const model = this.assets.ship(rec.index, p.colorHex);
    body.add(model);
    group.add(body);
    // engine glow sprite at the tail
    const glowMat = new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(p.colorHex).lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(-1.25, 0.1, 0);
    glow.scale.set(1.8, 1.8, 1);
    body.add(glow);
    // coloured floor ring for identity
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.colorHex).multiplyScalar(1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.scale.setScalar(1.75);
    ring.position.y = -0.45;
    group.add(ring);
    const label = makeLabel(p.name, { color: '#fff', bg: hexA(p.color, 0.78), size: 44, height: 0.78 });
    label.position.set(0, 1.9, -1.35);
    group.add(label);
    const shieldMat = this.shieldMatBase.clone();
    shieldMat.uniforms.uColor.value = new THREE.Color(p.colorHex).lerp(new THREE.Color(0x9fe8ff), 0.5);
    const shield = new THREE.Mesh(this.shieldGeo, shieldMat);
    shield.visible = false;
    group.add(shield);
    const ice = new THREE.Mesh(this.iceGeo, this.iceMat);
    ice.visible = false;
    ice.scale.set(1.1, 0.75, 1);
    group.add(ice);
    const icon = new THREE.Sprite();
    icon.visible = false;
    icon.scale.set(0.95, 0.95, 1);
    icon.position.set(1.25, 1.2, -1.2);
    icon.renderOrder = 998;
    group.add(icon);
    this.root.add(group);
    const ship = {
      pid, x, z, a, vx: Math.cos(a) * TUNE.shipSpeed * 0.3, vz: -Math.sin(a) * TUNE.shipSpeed * 0.3,
      color: p.colorHex, colorCss: p.color, name: p.name,
      group, body, model, glow, glowMat, ring, ringMat, label, shield, shieldMat, ice, icon,
      ammo: TUNE.ammoMax, ammoT: 0, fireCd: 0, dashT: 0, dashCd: 0, turning: 0, bank: 0,
      power: null, uses: 0, shieldOn: false, frozenT: 0, invulnT: invuln, dying: null, spawnT: 0,
    };
    this.ships.set(pid, ship);
    this.state.set(pid, 'ship');
    this._syncShip(ship, 0);
    if (!quiet) {
      this.fx.flash(x, z, p.colorHex, { size: 7, dur: 0.5, intensity: 2.5 });
      this.fx.shockwave(x, z, p.colorHex, { radius: 3.5, dur: 0.45 });
      sound('powerup');
    }
    this.ev.state(pid);
    return ship;
  }

  _removeShip(s) {
    this.root.remove(s.group);
    s.model.userData.mats?.forEach((m) => m.dispose());
    s.glowMat.dispose();
    s.ringMat.dispose();
    s.shieldMat.dispose();
    s.label.material.map.dispose();
    s.label.material.dispose();
    this.ships.delete(s.pid);
    this.beams = this.beams.filter((b) => { if (b.ship === s) { this._removeBeam(b); return false; } return true; });
  }

  destroyShip(s, killer, cause = 'shot') {
    if (!this.ships.has(s.pid) || s.dying) return;
    const { x, z } = s;
    this.fx.explosion(x, z, s.color, { big: 1 });
    this.fx.chunks(x, z, [s.color, 0xc9ced8, 0x3a4050, s.color], 22, { speed: 11, scale: 1.3 });
    this.R.addShake(0.55);
    sound('explosion');
    const vx = s.vx;
    const vz = s.vz;
    this._removeShip(s);
    this.ev.kill({ killer, victim: s.pid, kind: 'ship', cause });
    if (cause === 'blackhole') {
      this.state.set(s.pid, 'dead');
      this._afterDeath(s.pid);
      this.ev.state(s.pid);
      return;
    }
    // eject the pilot
    const ea = Math.random() * Math.PI * 2;
    this.spawnPilot(s.pid, x, z, vx * 0.35 + Math.cos(ea) * 5, vz * 0.35 + Math.sin(ea) * 5);
  }

  // ---------------------------------------------------------------- pilots
  spawnPilot(pid, x, z, vx, vz) {
    const rec = this.players.get(pid);
    if (!rec) return;
    const p = rec.player;
    const { obj, clips } = this.assets.pilot(rec.index);
    const group = new THREE.Group();
    const body = new THREE.Group();
    body.add(obj);
    group.add(body);
    const mixer = new THREE.AnimationMixer(obj);
    const find = (n) => clips.find((c) => c.name === n) || clips.find((c) => c.name.toLowerCase().includes(n.toLowerCase()));
    const actions = {};
    for (const n of ['Run', 'Idle', 'Jump_Idle']) { const c = find(n); if (c) actions[n] = mixer.clipAction(c); }
    const cur = actions.Jump_Idle || actions.Idle;
    cur?.play();
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.colorHex).multiplyScalar(2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.scale.setScalar(1.1);
    ring.position.y = -0.4;
    group.add(ring);
    // countdown arc under the pilot
    const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.6), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const arc = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 40, 1, 0, Math.PI * 2), arcMat);
    arc.rotation.x = -Math.PI / 2;
    arc.position.y = -0.38;
    group.add(arc);
    const label = makeLabel(p.name, { color: '#fff', bg: hexA(p.color, 0.78), size: 44, height: 0.62 });
    label.position.set(0, 1.9, -0.8);
    group.add(label);
    const ice = new THREE.Mesh(this.iceGeo, this.iceMat);
    ice.visible = false;
    ice.scale.setScalar(0.65);
    ice.position.y = 0.5;
    group.add(ice);
    this.root.add(group);
    const respawn = this.mode === 'dm' ? 3 : 5;
    const pilot = {
      pid, x, z, vx, vz, a: Math.atan2(-vz, vx), color: p.colorHex, group, body, mixer, actions, cur, ring, ringMat, arc, arcMat, label, ice,
      timer: respawn, total: respawn, frozenT: 0, dying: null, running: false, safeT: 0.6,
    };
    this.pilots.set(pid, pilot);
    this.state.set(pid, 'pilot');
    this.ev.state(pid);
  }

  _removePilot(p) {
    this.root.remove(p.group);
    p.mixer.stopAllAction();
    p.ringMat.dispose();
    p.arcMat.dispose();
    p.arc.geometry.dispose();
    p.label.material.map.dispose();
    p.label.material.dispose();
    this.pilots.delete(p.pid);
  }

  killPilot(p, killer, cause = 'shot') {
    if (!this.pilots.has(p.pid) || p.dying) return;
    this.fx.flash(p.x, p.z, p.color, { size: 5, dur: 0.35, intensity: 2.5 });
    this.fx.burst(p.x, p.z, p.color, 30, { speed: 7, size: 0.7 });
    this.fx.burst(p.x, p.z, 0xffffff, 16, { speed: 5, size: 0.5 });
    this.fx.chunks(p.x, p.z, [0xffffff, p.color, 0xdddddd], 8, { speed: 6, scale: 0.8 });
    this.fx.shockwave(p.x, p.z, p.color, { radius: 3, dur: 0.4 });
    this.R.addShake(0.3);
    sound('hit');
    this._removePilot(p);
    this.state.set(p.pid, 'dead');
    this.ev.kill({ killer, victim: p.pid, kind: 'pilot', cause });
    this._afterDeath(p.pid);
    this.ev.state(p.pid);
  }

  _afterDeath(pid) {
    if (this.mode === 'dm') this.respawnAt.set(pid, this.time + 3);
  }

  // ---------------------------------------------------------------- weapons
  fire(s) {
    const fx = Math.cos(s.a);
    const fz = -Math.sin(s.a);
    const nx = s.x + fx * 1.25;
    const nz = s.z + fz * 1.25;
    if (s.power && s.power !== 'shield') {
      const type = s.power;
      s.uses -= 1;
      if (s.uses <= 0) { s.power = null; s.icon.visible = false; }
      this.ev.power(s.pid, s.power, s.uses);
      if (type === 'laser') {
        this.startBeam(s);
        return;
      }
      if (type === 'mines') {
        this.dropMine(s);
        return;
      }
      if (type === 'missile') {
        this.launchMissile(s);
        return;
      }
      if (type === 'freeze') {
        this.spawnBullet(s, nx, nz, s.a, { kind: 'freeze', speed: TUNE.bulletSpeed * 0.85, life: 1.3 });
        this.fx.flash(nx, nz, 0x8fe8ff, { size: 2.5, dur: 0.15, light: false });
        sound('shoot');
        s.fireCd = TUNE.fireCd;
        return;
      }
      if (type === 'triple') {
        if (s.ammo <= 0) { s.uses += 1; if (!s.power) { s.power = 'triple'; } this.ev.power(s.pid, s.power, s.uses); return; }
        s.ammo -= 1;
        this.ev.ammo(s.pid, s.ammo);
        for (const off of [-0.22, 0, 0.22]) this.spawnBullet(s, nx, nz, s.a + off);
        this._muzzle(s, nx, nz);
        return;
      }
    }
    if (s.ammo <= 0) { this.ev.empty(s.pid); return; }
    s.ammo -= 1;
    s.ammoT = 0;
    this.ev.ammo(s.pid, s.ammo);
    this.spawnBullet(s, nx, nz, s.a);
    this._muzzle(s, nx, nz);
  }

  _muzzle(s, nx, nz) {
    s.fireCd = TUNE.fireCd;
    this.fx.flash(nx, nz, s.color, { size: 2.2, dur: 0.12, intensity: 2, light: false });
    // tiny recoil
    s.vx -= Math.cos(s.a) * 0.8;
    s.vz += Math.sin(s.a) * 0.8;
    sound('shoot');
  }

  spawnBullet(s, x, z, a, { kind = 'bolt', speed = TUNE.bulletSpeed, life = TUNE.bulletLife } = {}) {
    if (this.bullets.length >= this.bulletMax) return;
    const col = kind === 'freeze' ? new THREE.Color(0x8fe8ff) : new THREE.Color(s.color);
    this.bullets.push({
      owner: s.pid, x, z, vx: Math.cos(a) * speed + s.vx * 0.25, vz: -Math.sin(a) * speed + s.vz * 0.25,
      life, kind, color: col, age: 0,
    });
  }

  startBeam(s) {
    const col = new THREE.Color(s.color);
    const mat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const outer = new THREE.Mesh(this.beamGeo, mat);
    const core = new THREE.Mesh(this.beamGeo, coreMat);
    const g = new THREE.Group();
    g.add(outer, core);
    this.root.add(g);
    this.beams.push({ ship: s, pid: s.pid, t: 0, charge: 0.45, dur: 0.6, g, outer, core, mat, coreMat, len: 0 });
    sound('powerup');
  }

  _removeBeam(b) {
    this.root.remove(b.g);
    b.mat.dispose();
    b.coreMat.dispose();
  }

  dropMine(s) {
    const obj = this.assets.mine();
    const x = s.x - Math.cos(s.a) * 1.6;
    const z = s.z + Math.sin(s.a) * 1.6;
    obj.position.set(x, 0, z);
    const lightMat = new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(0xff2a2a).multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const light = new THREE.Sprite(lightMat);
    light.scale.set(1.4, 1.4, 1);
    light.position.y = 0.6;
    obj.add(light);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color).multiplyScalar(1.4), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.scale.setScalar(1.2);
    ring.position.y = -0.4;
    obj.add(ring);
    this.root.add(obj);
    this.mines.push({ owner: s.pid, x, z, obj, light, lightMat, ringMat, armT: 0.7, ownerSafe: 2.5, age: 0 });
    sound('blip');
  }

  _removeMine(m) {
    this.root.remove(m.obj);
    m.lightMat.dispose();
    m.ringMat.dispose();
    m.obj.traverse((o) => { if (o.isMesh && o.material !== m.ringMat) o.material.dispose(); });
  }

  detonateMine(m, killer) {
    this.mines = this.mines.filter((x) => x !== m);
    this._removeMine(m);
    this.fx.explosion(m.x, m.z, 0xff5a2a, { big: 0.9 });
    this.R.addShake(0.4);
    sound('explosion');
    this.blast(m.x, m.z, 3.4, killer ?? m.owner, 'mine');
  }

  blast(x, z, r, killer, cause) {
    for (const s of [...this.ships.values()]) {
      if (Math.hypot(s.x - x, s.z - z) < r + TUNE.shipR * 0.5) this.hitShip(s, killer, cause, true);
    }
    for (const p of [...this.pilots.values()]) {
      if (Math.hypot(p.x - x, p.z - z) < r) this.killPilot(p, killer, cause);
    }
    for (const a of [...this.asteroids]) if (Math.hypot(a.x - x, a.z - z) < r + a.r * 0.5) this.breakAsteroid(a, x, z);
  }

  launchMissile(s) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: s.color, metalness: 0.4, roughness: 0.4, emissive: s.color, emissiveIntensity: 0.4 });
    g.add(new THREE.Mesh(this.missileGeo, this.missileMat), new THREE.Mesh(this.missileNoseGeo, mat));
    const glowMat = new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(0xff9a50).multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const glow = new THREE.Sprite(glowMat);
    glow.position.x = -0.6;
    glow.scale.set(1.3, 1.3, 1);
    g.add(glow);
    const x = s.x + Math.cos(s.a) * 1.4;
    const z = s.z - Math.sin(s.a) * 1.4;
    g.position.set(x, 0.2, z);
    this.root.add(g);
    this.missiles.push({ owner: s.pid, x, z, a: s.a, speed: 12, life: 5, g, mat, glowMat, color: s.color });
    sound('whoosh');
  }

  _removeMissile(m) {
    this.root.remove(m.g);
    m.mat.dispose();
    m.glowMat.dispose();
  }

  explodeMissile(m, killer) {
    this.missiles = this.missiles.filter((x) => x !== m);
    this._removeMissile(m);
    this.fx.explosion(m.x, m.z, m.color, { big: 0.6 });
    this.R.addShake(0.3);
    sound('explosion');
    this.blast(m.x, m.z, 1.9, killer ?? m.owner, 'missile');
  }

  /** A projectile/blast touches a ship: shield absorbs, invulnerable ignores, otherwise destroy. */
  hitShip(s, killer, cause, force = false) {
    if (s.dying) return false;
    if (s.invulnT > 0 && !force) return false;
    if (s.invulnT > 0 && force && cause !== 'mine' && cause !== 'missile') return false;
    if (s.shieldOn) {
      s.shieldOn = false;
      s.shield.visible = false;
      if (s.power === 'shield') { s.power = null; this.ev.power(s.pid, null, 0); }
      s.invulnT = 0.4;
      this.fx.shockwave(s.x, s.z, 0x9fe8ff, { radius: 3.5, dur: 0.4 });
      this.fx.burst(s.x, s.z, 0x9fe8ff, 30, { speed: 9, size: 0.6 });
      sound('hit');
      this.ev.shieldPop(s.pid);
      return true;
    }
    this.destroyShip(s, killer, cause);
    return true;
  }

  freezeShip(s) {
    if (s.shieldOn) { this.hitShip(s, null, 'freeze'); return; }
    s.frozenT = 2.6;
    s.ice.visible = true;
    this.fx.burst(s.x, s.z, 0xbff3ff, 30, { speed: 6, size: 0.6 });
    this.fx.shockwave(s.x, s.z, 0x8fe8ff, { radius: 3, dur: 0.4 });
    sound('wrong');
    this.ev.frozen(s.pid);
  }

  // ---------------------------------------------------------------- asteroids + crates
  spawnAsteroid(x, z, size, vx, vz) {
    const r = size === 3 ? 2.1 : size === 2 ? 1.25 : 0.7;
    const obj = this.assets.rock(Math.floor(Math.random() * this.assets.rockCount), r * 1.15);
    const g = new THREE.Group();
    g.add(obj);
    obj.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    g.position.set(x, 0, z);
    this.root.add(g);
    this.asteroids.push({ x, z, vx, vz, r, size, g, obj, spin: rand(-1, 1), spinX: rand(-0.5, 0.5), mass: r * r * r, hitFlash: 0 });
  }

  breakAsteroid(a, fromX, fromZ) {
    if (!this.asteroids.includes(a)) return;
    this.asteroids = this.asteroids.filter((x) => x !== a);
    this.root.remove(a.g);
    this.fx.burst(a.x, a.z, 0xc8a080, 18 * a.size, { speed: 6 + a.size * 2, size: 0.9, intensity: 0.9 });
    this.fx.chunks(a.x, a.z, [0x9a7a5a, 0x7a6048, 0xb89070], 5 * a.size, { speed: 7, scale: 0.6 + a.size * 0.35 });
    this.fx.burst(a.x, a.z, 0x7a7078, 8 * a.size, { speed: 3, life: 1.4, size: 2, intensity: 0.3 });
    this.R.addShake(0.08 * a.size);
    sound('hit');
    if (a.size > 1) {
      const dx = a.x - fromX;
      const dz = a.z - fromZ;
      const base = Math.atan2(dz, dx);
      for (const s of [-1, 1]) {
        const ang = base + s * 1.1 + rand(-0.3, 0.3);
        const sp = 3 + Math.random() * 2.5;
        this.spawnAsteroid(a.x + Math.cos(ang) * a.r * 0.5, a.z + Math.sin(ang) * a.r * 0.5, a.size - 1, a.vx * 0.5 + Math.cos(ang) * sp, a.vz * 0.5 + Math.sin(ang) * sp);
      }
    }
  }

  spawnCrate() {
    const maxCrates = 1 + Math.floor(this.players.size / 3);
    if (this.crates.length >= maxCrates) return;
    const p = this.freeSpot(1.8, 40);
    const obj = this.assets.crate();
    const g = new THREE.Group();
    g.add(obj);
    const haloMat = new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(0xffd070).multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(3.6, 3.6, 1);
    g.add(halo);
    const q = makeLabel('?', { color: '#1a1400', bg: 'rgba(255,208,80,0.95)', size: 56, height: 0.7 });
    q.position.set(0, 1.4, -0.6);
    g.add(q);
    g.position.set(p.x, 0, p.z);
    g.scale.setScalar(0.01);
    this.root.add(g);
    this.crates.push({ x: p.x, z: p.z, g, obj, halo, haloMat, q, age: 0 });
    this.fx.shockwave(p.x, p.z, 0xffd070, { radius: 2.5, dur: 0.5 });
  }

  _removeCrate(c) {
    this.root.remove(c.g);
    c.haloMat.dispose();
    c.q.material.map.dispose();
    c.q.material.dispose();
  }

  pickup(s, c) {
    this.crates = this.crates.filter((x) => x !== c);
    this._removeCrate(c);
    const type = POWER_IDS[Math.floor(Math.random() * POWER_IDS.length)];
    const def = POWERS[type];
    this.fx.burst(c.x, c.z, 0xffd070, 30, { speed: 7, size: 0.7 });
    this.fx.shockwave(c.x, c.z, def.color, { radius: 3, dur: 0.4 });
    sound('powerup');
    if (type === 'shield') {
      s.shieldOn = true;
      s.shield.visible = true;
      s.power = s.power === 'shield' ? null : s.power;
      this.ev.power(s.pid, s.power, s.uses, 'shield');
    } else {
      s.power = type;
      s.uses = def.uses;
      s.icon.material = this.iconMaterial(type);
      s.icon.visible = true;
      this.ev.power(s.pid, type, s.uses, type);
    }
    this.ev.pickup(s.pid, type);
  }

  // ---------------------------------------------------------------- main update
  update(dt, t) {
    this.time += this.running ? dt : 0;
    this.map?.update(dt, t, this.fx);
    for (const s of this.ships.values()) this._shipLogic(s, dt, t);
    if (this.running) {
      this._shipPairs();
      for (const p of [...this.pilots.values()]) this._pilotLogic(p, dt, t);
      this._bullets(dt);
      this._beams(dt);
      this._mines(dt, t);
      this._missiles(dt);
      this._asteroids(dt);
      this._crates(dt, t);
      this._hazards();
      if (this.mode === 'dm') {
        for (const [pid, at] of this.respawnAt) {
          if (this.time >= at && this.players.has(pid) && this.state.get(pid) === 'dead') {
            this.respawnAt.delete(pid);
            const enemies = [...this.ships.values()];
            const p = this.freeSpot(2, 30, null, null, enemies.length ? enemies : null);
            this.spawnShip(pid, p.x, p.z, Math.atan2(p.z, -p.x) + (Math.random() - 0.5));
          }
        }
      }
    } else {
      for (const p of this.pilots.values()) { p.mixer.update(dt); this._syncPilot(p, dt); }
      for (const a of this.asteroids) { a.obj.rotation.y += a.spin * dt; }
      this._crates(dt, t, true);
    }
    this._renderBullets();
    this.shieldMatBase.uniforms.uTime.value = t;
    for (const s of this.ships.values()) s.shieldMat.uniforms.uTime.value = t;
  }

  _shipLogic(s, dt, t) {
    const inp = this.input(s.pid);
    if (s.dying) { this._dying(s, dt); return; }
    if (!this.running) {
      inp.fireQ = 0; inp.dashQ = 0;
      s.turning = 0;
      this._syncShip(s, dt, t);
      return;
    }
    s.invulnT -= dt;
    s.fireCd -= dt;
    s.dashCd -= dt;
    s.dashT -= dt;
    let fx = Math.cos(s.a);
    let fz = -Math.sin(s.a);
    if (s.frozenT > 0) {
      s.frozenT -= dt;
      s.vx *= Math.exp(-1.2 * dt);
      s.vz *= Math.exp(-1.2 * dt);
      inp.fireQ = 0; inp.dashQ = 0;
      s.turning = 0;
      if (s.frozenT <= 0) { s.ice.visible = false; this.fx.burst(s.x, s.z, 0xbff3ff, 24, { speed: 6, size: 0.5 }); sound('hit'); }
    } else {
      s.turning = inp.rot ? 1 : 0;
      if (inp.rot) s.a += TUNE.turn * dt;
      fx = Math.cos(s.a);
      fz = -Math.sin(s.a);
      if (inp.dashQ > 0) {
        inp.dashQ = 0;
        if (s.dashCd <= 0) {
          s.dashT = TUNE.dashTime;
          s.dashCd = TUNE.dashCd;
          s.vx = fx * TUNE.dashSpeed;
          s.vz = fz * TUNE.dashSpeed;
          this.fx.burst(s.x - fx, s.z - fz, s.color, 16, { speed: 5, size: 0.8 });
          this.fx.shockwave(s.x - fx * 0.8, s.z - fz * 0.8, s.color, { radius: 2.2, dur: 0.3 });
          sound('whoosh');
        }
      }
      const target = s.dashT > 0 ? TUNE.dashSpeed : TUNE.shipSpeed;
      const k = Math.min(1, (s.dashT > 0 ? 14 : TUNE.shipAccel) * dt);
      s.vx += (fx * target - s.vx) * k;
      s.vz += (fz * target - s.vz) * k;
      if (inp.fireQ > 0) {
        if (s.fireCd <= 0) { inp.fireQ = 0; this.fire(s); } else if (inp.fireQ > 0 && s.fireCd > 0.2) inp.fireQ = 0;
      }
      // ammo regen
      if (s.ammo < TUNE.ammoMax) {
        s.ammoT += dt * (this.sudden ? 2.2 : 1);
        if (s.ammoT >= TUNE.ammoRegen) { s.ammoT = 0; s.ammo += 1; this.ev.ammo(s.pid, s.ammo); }
      } else s.ammoT = 0;
    }
    this._gravity(s, dt, 1);
    if (s.dying) return;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    const hit = this.collideStatic(s, TUNE.shipR, 0.6);
    if (hit > 2.5) {
      this.fx.burst(s.x, s.z, 0xbfe8ff, Math.min(14, hit | 0), { speed: 5, size: 0.4 });
      if (hit > 6) sound('click');
    }
    // asteroids
    for (const a of this.asteroids) {
      const dx = s.x - a.x;
      const dz = s.z - a.z;
      const rr = a.r + TUNE.shipR * 0.9;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1e-3;
        const nx = dx / d;
        const nz = dz / d;
        const push = rr - d;
        const ms = 1;
        const tot = ms + a.mass;
        s.x += nx * push * (a.mass / tot);
        s.z += nz * push * (a.mass / tot);
        a.x -= nx * push * (ms / tot);
        a.z -= nz * push * (ms / tot);
        const rv = (s.vx - a.vx) * nx + (s.vz - a.vz) * nz;
        if (rv < 0) {
          const j = (-(1.6) * rv) / (1 / ms + 1 / a.mass);
          s.vx += (j / ms) * nx; s.vz += (j / ms) * nz;
          a.vx -= (j / a.mass) * nx; a.vz -= (j / a.mass) * nz;
          if (-rv > 3) { this.fx.burst(s.x - nx * TUNE.shipR, s.z - nz * TUNE.shipR, 0xd8b890, 8, { speed: 4, size: 0.5, intensity: 1 }); sound('click'); }
        }
      }
    }
    // crate pickup
    for (const c of this.crates) {
      if (c.age > 0.4 && Math.hypot(c.x - s.x, c.z - s.z) < 1.9) { this.pickup(s, c); break; }
    }
    this._syncShip(s, dt, t);
  }

  _gravity(e, dt, scale) {
    const g = this.map?.gravity;
    if (!g) return;
    const dx = g.x - e.x;
    const dz = g.z - e.z;
    const d2 = dx * dx + dz * dz;
    const d = Math.sqrt(d2) || 1e-3;
    const acc = Math.min(40, (g.G * scale) / (d2 + 2));
    e.vx += (dx / d) * acc * dt;
    e.vz += (dz / d) * acc * dt;
    if (d < g.horizon && e.pid !== undefined && !e.dying) {
      e.dying = { t: 0, ang: Math.atan2(e.z - g.z, e.x - g.x), r: d };
      sound('whoosh');
    }
  }

  _dying(e, dt) {
    // Spaghettification: stretch radially, spiral in, then vanish in a flash.
    const g = this.map.gravity;
    const d = e.dying;
    d.t += dt;
    const k = Math.min(1, d.t / 0.9);
    d.ang += dt * (4 + k * 10);
    d.r = Math.max(0.05, d.r * (1 - k * 0.6));
    e.x = g.x + Math.cos(d.ang) * d.r;
    e.z = g.z + Math.sin(d.ang) * d.r;
    e.group.position.set(e.x, -k * 0.6, e.z);
    e.group.rotation.set(0, -d.ang, 0);
    e.group.scale.set(1 + k * 3.5, Math.max(0.05, 1 - k), Math.max(0.05, 1 - k * 0.95));
    e.body.rotation.x += dt * 12;
    if (e.label) e.label.visible = false;
    if (Math.random() < 0.8) this.fx.emit(e.x, 0.2, e.z, 0, 0, 0, e.color, { life: 0.5, size: 0.6, intensity: 2.5 });
    if (k >= 1) {
      this.fx.flash(g.x, g.z, 0xffc080, { size: 6, dur: 0.4, intensity: 3 });
      this.fx.shockwave(g.x, g.z, e.color, { radius: 4, dur: 0.5 });
      e.dying = null;
      if (this.ships.get(e.pid) === e) {
        e.dyingDone = true;
        this._removeShip(e);
        this.state.set(e.pid, 'dead');
        this.ev.kill({ killer: null, victim: e.pid, kind: 'ship', cause: 'blackhole' });
        this._afterDeath(e.pid);
        this.ev.state(e.pid);
      } else if (this.pilots.get(e.pid) === e) {
        this._removePilot(e);
        this.state.set(e.pid, 'dead');
        this.ev.kill({ killer: null, victim: e.pid, kind: 'pilot', cause: 'blackhole' });
        this._afterDeath(e.pid);
        this.ev.state(e.pid);
      }
      sound('explosion');
      this.R.addShake(0.3);
    }
  }

  _shipPairs() {
    const arr = [...this.ships.values()];
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (a.dying) continue;
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if (b.dying) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const rr = TUNE.shipR * 2;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const nx = dx / d;
        const nz = dz / d;
        const push = (rr - d) / 2;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) {
          const jj = -1.7 * rv / 2;
          a.vx -= jj * nx; a.vz -= jj * nz;
          b.vx += jj * nx; b.vz += jj * nz;
          this.fx.burst((a.x + b.x) / 2, (a.z + b.z) / 2, 0xffffff, 12, { speed: 6, size: 0.5 });
          this.R.addShake(0.12);
          sound('click');
        }
      }
    }
  }

  _pilotLogic(p, dt, t) {
    if (p.dying) { this._dying(p, dt); return; }
    const inp = this.input(p.pid);
    inp.fireQ = 0; inp.dashQ = 0;
    p.safeT -= dt;
    if (p.frozenT > 0) {
      p.frozenT -= dt;
      p.vx *= Math.exp(-3 * dt); p.vz *= Math.exp(-3 * dt);
      if (p.frozenT <= 0) p.ice.visible = false;
    } else {
      if (inp.rot) p.a += TUNE.pilotTurn * dt;
      p.running = !!inp.run;
      const fx = Math.cos(p.a);
      const fz = -Math.sin(p.a);
      const tx = p.running ? fx * TUNE.pilotSpeed : 0;
      const tz = p.running ? fz * TUNE.pilotSpeed : 0;
      const k = Math.min(1, 3.5 * dt);
      p.vx += (tx - p.vx) * k;
      p.vz += (tz - p.vz) * k;
    }
    this._gravity(p, dt, 0.8);
    if (p.dying) return;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    this.collideStatic(p, TUNE.pilotR, 0.3);
    for (const a of this.asteroids) {
      const dx = p.x - a.x;
      const dz = p.z - a.z;
      const rr = a.r + TUNE.pilotR;
      const d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-3) { p.x = a.x + (dx / d) * rr; p.z = a.z + (dz / d) * rr; }
    }
    // run over by an enemy ship
    for (const s of this.ships.values()) {
      if (s.pid === p.pid || s.dying || p.safeT > 0) continue;
      if (Math.hypot(s.x - p.x, s.z - p.z) < TUNE.shipR + TUNE.pilotR) { this.killPilot(p, s.pid, 'splat'); return; }
    }
    p.timer -= dt;
    if (p.timer <= 0) {
      const { pid, x, z, a } = p;
      this._removePilot(p);
      this.spawnShip(pid, x, z, a);
      this.ev.respawn(pid);
      return;
    }
    p.mixer.update(dt * (p.running ? 1.4 : 1));
    this._syncPilot(p, dt, t);
  }

  _syncPilot(p, dt) {
    p.group.position.set(p.x, 0, p.z);
    p.body.rotation.y = p.a;
    const want = p.running ? p.actions.Run : (p.actions.Jump_Idle || p.actions.Idle);
    if (want && want !== p.cur) { want.reset().fadeIn(0.15).play(); p.cur?.fadeOut(0.15); p.cur = want; }
    const frac = Math.max(0, p.timer / p.total);
    p.arc.geometry.dispose();
    p.arc.geometry = new THREE.RingGeometry(0.95, 1.12, 40, 1, Math.PI / 2, Math.PI * 2 * frac);
    p.ringMat.opacity = 0.6 + Math.sin(this.time * 10) * 0.3;
    p.body.position.y = p.running ? 0 : Math.sin(this.time * 3) * 0.12 + 0.1;
  }

  _syncShip(s, dt, t = 0) {
    s.group.position.set(s.x, Math.sin(t * 2 + s.pid.length) * 0.08, s.z);
    s.body.rotation.y = s.a;
    s.bank += ((s.turning ? -0.5 : 0) - s.bank) * Math.min(1, dt * 8);
    s.body.rotation.x = s.bank;
    const fx = Math.cos(s.a);
    const fz = -Math.sin(s.a);
    const speed = Math.hypot(s.vx, s.vz);
    // engine glow + trail particles
    const flick = 0.85 + Math.random() * 0.3;
    const boost = s.dashT > 0 ? 1.8 : 1;
    s.glow.scale.setScalar(1.6 * flick * boost);
    if (this.running && s.frozenT <= 0 && dt > 0) {
      const tx = s.x - fx * 1.3;
      const tz = s.z - fz * 1.3;
      const n = s.dashT > 0 ? 4 : 2;
      for (let i = 0; i < n; i++) {
        this.fx.emit(tx + rand(-0.12, 0.12), 0.1, tz + rand(-0.12, 0.12), -fx * 3 + rand(-0.6, 0.6), 0, -fz * 3 + rand(-0.6, 0.6), s.color,
          { life: 0.45 * boost, size: 0.75, sizeEnd: 0.1, drag: 2, intensity: 1.8 });
      }
      if (Math.random() < 0.5) this.fx.emit(tx, 0.1, tz, -fx * 2, 0, -fz * 2, 0xffffff, { life: 0.18, size: 0.5, sizeEnd: 0, intensity: 2 });
    }
    // invulnerability blink
    const blink = s.invulnT > 0 && Math.floor(s.invulnT * 12) % 2 === 0;
    s.model.visible = !blink;
    s.shield.visible = s.shieldOn || s.invulnT > 0;
    s.shieldMat.uniforms.uAlpha.value = s.shieldOn ? 1 : 0.45;
    s.ringMat.opacity = 0.35 + 0.15 * Math.sin(t * 4);
    if (s.icon.visible) s.icon.position.y = 1.2 + Math.sin(t * 4) * 0.1;
    void speed;
  }

  _bullets(dt) {
    const g = this.map.gravity;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.age += dt;
      if (g) this._gravity(b, dt, 0.55);
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      let dead = b.life <= 0;
      if (!dead && this.pointBlocked(b.x, b.z)) {
        dead = true;
        this.fx.burst(b.x - b.vx * dt, b.z - b.vz * dt, b.color, 8, { speed: 5, size: 0.4 });
      }
      if (!dead && g && Math.hypot(b.x - g.x, b.z - g.z) < g.horizon) dead = true;
      if (!dead) {
        for (const s of this.ships.values()) {
          if (s.pid === b.owner || s.dying) continue;
          const dx = s.x - b.x;
          const dz = s.z - b.z;
          if (dx * dx + dz * dz < (TUNE.shipR + 0.2) ** 2) {
            if (b.kind === 'freeze') { if (s.invulnT <= 0) this.freezeShip(s); dead = true; break; }
            if (this.hitShip(s, b.owner, 'shot')) { dead = true; break; }
          }
        }
      }
      if (!dead) {
        for (const p of this.pilots.values()) {
          if (p.pid === b.owner || p.dying) continue;
          const dx = p.x - b.x;
          const dz = p.z - b.z;
          if (dx * dx + dz * dz < (TUNE.pilotR + 0.25) ** 2) {
            if (b.kind === 'freeze') { p.frozenT = 2.5; p.ice.visible = true; } else this.killPilot(p, b.owner, 'shot');
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const a of this.asteroids) {
          const dx = a.x - b.x;
          const dz = a.z - b.z;
          if (dx * dx + dz * dz < (a.r + 0.15) ** 2) { this.breakAsteroid(a, b.x - b.vx * 0.05, b.z - b.vz * 0.05); dead = true; break; }
        }
      }
      if (!dead) {
        for (const m of this.mines) {
          if (Math.hypot(m.x - b.x, m.z - b.z) < 0.7) { this.detonateMine(m, b.owner); dead = true; break; }
        }
      }
      if (!dead) {
        for (const m of this.missiles) {
          if (m.owner !== b.owner && Math.hypot(m.x - b.x, m.z - b.z) < 0.7) { this.explodeMissile(m, b.owner); dead = true; break; }
        }
      }
      if (!dead && Math.random() < 0.6) this.fx.emit(b.x, 0.25, b.z, 0, 0, 0, b.color, { life: 0.18, size: 0.45, sizeEnd: 0.05, intensity: 2 });
      if (dead) this.bullets.splice(i, 1);
    }
  }

  _renderBullets() {
    const n = Math.min(this.bullets.length, this.bulletMax);
    for (let i = 0; i < n; i++) {
      const b = this.bullets[i];
      const sp = Math.hypot(b.vx, b.vz) || 1;
      tmpQ.setFromAxisAngle(UP, Math.atan2(-b.vz, b.vx));
      tmpS.set(3.2, 1, 1);
      tmpV.set(b.x, 0.25, b.z);
      this.bulletMesh.setMatrixAt(i, tmpM.compose(tmpV, tmpQ, tmpS));
      tmpC.copy(b.color).lerp(WHITE, 0.45).multiplyScalar(4);
      this.bulletMesh.setColorAt(i, tmpC);
      tmpS.set(2.6, 1, 1.4);
      tmpV.y = 0.2;
      this.bulletGlow.setMatrixAt(i, tmpM.compose(tmpV, tmpQ, tmpS));
      tmpC.copy(b.color).multiplyScalar(1.6);
      this.bulletGlow.setColorAt(i, tmpC);
      void sp;
    }
    this.bulletMesh.count = n;
    this.bulletGlow.count = n;
    this.bulletMesh.instanceMatrix.needsUpdate = true;
    this.bulletGlow.instanceMatrix.needsUpdate = true;
    if (this.bulletMesh.instanceColor) this.bulletMesh.instanceColor.needsUpdate = true;
    if (this.bulletGlow.instanceColor) this.bulletGlow.instanceColor.needsUpdate = true;
  }

  _beams(dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      const s = b.ship;
      if (!this.ships.has(s.pid) || s.dying) { this._removeBeam(b); this.beams.splice(i, 1); continue; }
      b.t += dt;
      const fx = Math.cos(s.a);
      const fz = -Math.sin(s.a);
      const x0 = s.x + fx * 1.1;
      const z0 = s.z + fz * 1.1;
      const len = this.rayLength(x0, z0, fx, fz);
      const firing = b.t >= b.charge;
      const k = firing ? (b.t - b.charge) / b.dur : b.t / b.charge;
      const width = firing ? 1.1 * (1 - Math.pow(k, 3)) * (0.9 + Math.random() * 0.2) : 0.08 + k * 0.1;
      b.g.position.set(x0 + fx * len / 2, 0.3, z0 + fz * len / 2);
      b.g.rotation.y = s.a;
      b.outer.scale.set(len, width * 0.5, width);
      b.core.scale.set(len, width * 0.22, width * 0.35);
      b.mat.opacity = firing ? 1 : 0.4 + 0.4 * Math.sin(b.t * 60);
      b.coreMat.opacity = firing ? 1 : 0.2;
      if (!firing) {
        if (Math.random() < 0.7) this.fx.emit(x0 + rand(-0.6, 0.6), 0.3, z0 + rand(-0.6, 0.6), -fx * 2 + (s.x - x0), 0, -fz * 2, s.color, { life: 0.3, size: 0.5, intensity: 2.5 });
        continue;
      }
      if (b.t - dt < b.charge) { this.R.addShake(0.35); sound('explosion'); this.fx.flash(x0, z0, s.color, { size: 5, dur: 0.3 }); }
      // sparks at the impact point
      this.fx.burst(x0 + fx * len, z0 + fz * len, s.color, 3, { speed: 8, size: 0.6 });
      const x1 = x0 + fx * len;
      const z1 = z0 + fz * len;
      for (const o of [...this.ships.values()]) {
        if (o.pid === s.pid) continue;
        if (segDist2(o.x, o.z, x0, z0, x1, z1) < (TUNE.shipR + 0.45) ** 2) this.hitShip(o, s.pid, 'laser', true);
      }
      for (const p of [...this.pilots.values()]) {
        if (p.pid === s.pid) continue;
        if (segDist2(p.x, p.z, x0, z0, x1, z1) < (TUNE.pilotR + 0.45) ** 2) this.killPilot(p, s.pid, 'laser');
      }
      for (const a of [...this.asteroids]) if (segDist2(a.x, a.z, x0, z0, x1, z1) < (a.r + 0.3) ** 2) this.breakAsteroid(a, s.x, s.z);
      for (const m of [...this.mines]) if (segDist2(m.x, m.z, x0, z0, x1, z1) < 0.8) this.detonateMine(m, s.pid);
      for (const m of [...this.missiles]) if (segDist2(m.x, m.z, x0, z0, x1, z1) < 0.8) this.explodeMissile(m, s.pid);
      if (k >= 1) { this._removeBeam(b); this.beams.splice(i, 1); }
    }
  }

  _mines(dt, t) {
    for (const m of [...this.mines]) {
      m.age += dt;
      m.armT -= dt;
      m.ownerSafe -= dt;
      const armed = m.armT <= 0;
      const blink = armed ? (Math.sin(t * 14) > 0 ? 1 : 0.15) : 0.3;
      m.lightMat.color.setRGB(3 * blink, 0.4 * blink, 0.4 * blink);
      m.obj.rotation.y += dt * 0.8;
      if (!armed) continue;
      let trig = false;
      for (const s of this.ships.values()) {
        if (s.pid === m.owner && m.ownerSafe > 0) continue;
        if (Math.hypot(s.x - m.x, s.z - m.z) < 2.0) { trig = true; break; }
      }
      if (!trig) for (const p of this.pilots.values()) {
        if (p.pid === m.owner && m.ownerSafe > 0) continue;
        if (Math.hypot(p.x - m.x, p.z - m.z) < 1.4) { trig = true; break; }
      }
      if (trig) this.detonateMine(m, m.owner);
      else if (m.age > 25) { this.mines = this.mines.filter((x) => x !== m); this._removeMine(m); this.fx.burst(m.x, m.z, 0xff5a2a, 10, { speed: 3 }); }
    }
  }

  _missiles(dt) {
    for (const m of [...this.missiles]) {
      m.life -= dt;
      // seek the nearest enemy (ship or pilot)
      let best = null;
      let bd = 1e9;
      for (const s of this.ships.values()) { if (s.pid === m.owner || s.dying) continue; const d = Math.hypot(s.x - m.x, s.z - m.z); if (d < bd) { bd = d; best = s; } }
      for (const p of this.pilots.values()) { if (p.pid === m.owner || p.dying) continue; const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < bd) { bd = d; best = p; } }
      if (best) {
        const want = Math.atan2(-(best.z - m.z), best.x - m.x);
        const d = angDiff(m.a, want);
        m.a += clamp(d, -3.2 * dt, 3.2 * dt);
      }
      m.speed = Math.min(17, m.speed + dt * 4);
      m.x += Math.cos(m.a) * m.speed * dt;
      m.z -= Math.sin(m.a) * m.speed * dt;
      m.g.position.set(m.x, 0.25, m.z);
      m.g.rotation.y = m.a;
      m.g.rotation.x += dt * 8;
      this.fx.emit(m.x - Math.cos(m.a) * 0.6, 0.25, m.z + Math.sin(m.a) * 0.6, rand(-1, 1), 0.3, rand(-1, 1), 0xff9040, { life: 0.4, size: 0.7, sizeEnd: 0.1, intensity: 2.2 });
      if (Math.random() < 0.5) this.fx.emit(m.x - Math.cos(m.a) * 0.8, 0.25, m.z + Math.sin(m.a) * 0.8, 0, 0.4, 0, 0x707080, { life: 0.9, size: 0.9, sizeEnd: 1.6, intensity: 0.35, drag: 1 });
      let boom = m.life <= 0 || this.pointBlocked(m.x, m.z);
      if (!boom && best && bd < (best.timer !== undefined ? TUNE.pilotR : TUNE.shipR) + 0.4) boom = true;
      if (!boom) for (const a of this.asteroids) if (Math.hypot(a.x - m.x, a.z - m.z) < a.r) { boom = true; break; }
      if (boom) this.explodeMissile(m, m.owner);
    }
  }

  _asteroids(dt) {
    const arr = this.asteroids;
    for (const a of arr) {
      a.x += a.vx * dt;
      a.z += a.vz * dt;
      const sp = Math.hypot(a.vx, a.vz);
      if (sp > 6) { a.vx *= 6 / sp; a.vz *= 6 / sp; }
      this.collideStatic(a, a.r * 0.95, 0.9);
      a.g.position.set(a.x, 0, a.z);
      a.obj.rotation.y += a.spin * dt;
      a.obj.rotation.x += a.spinX * dt;
    }
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const rr = (a.r + b.r) * 0.92;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const nx = dx / d;
        const nz = dz / d;
        const tot = a.mass + b.mass;
        const push = rr - d;
        a.x -= nx * push * (b.mass / tot); a.z -= nz * push * (b.mass / tot);
        b.x += nx * push * (a.mass / tot); b.z += nz * push * (a.mass / tot);
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) {
          const jj = (-1.8 * rv) / (1 / a.mass + 1 / b.mass);
          a.vx -= (jj / a.mass) * nx; a.vz -= (jj / a.mass) * nz;
          b.vx += (jj / b.mass) * nx; b.vz += (jj / b.mass) * nz;
        }
      }
    }
  }

  _crates(dt, t, idle = false) {
    if (!idle) {
      this.crateT -= dt;
      if (this.crateT <= 0) { this.crateT = TUNE.crateEvery * (0.7 + Math.random() * 0.6); this.spawnCrate(); }
    }
    for (const c of this.crates) {
      c.age += dt;
      const s = Math.min(1, c.age * 3);
      c.g.scale.setScalar(s < 1 ? s * (1.2 - 0.2 * s) : 1);
      c.obj.rotation.y += dt * 1.2;
      c.obj.position.y = Math.sin(t * 2.5 + c.x) * 0.2;
      c.haloMat.opacity = 0.6 + Math.sin(t * 5) * 0.25;
    }
  }

  _hazards() {
    const segs = this.map.segments();
    if (!segs.length) return;
    for (const sg of segs) {
      for (const s of [...this.ships.values()]) {
        if (s.dying) continue;
        if (segDist2(s.x, s.z, sg.x1, sg.z1, sg.x2, sg.z2) < (TUNE.shipR * 0.8 + sg.w) ** 2) {
          if (s.shieldOn) { this.hitShip(s, null, 'gate'); s.invulnT = 1; continue; }
          if (s.invulnT > 0) continue;
          this.destroyShip(s, null, 'gate');
        }
      }
      for (const p of [...this.pilots.values()]) {
        if (segDist2(p.x, p.z, sg.x1, sg.z1, sg.x2, sg.z2) < (TUNE.pilotR + sg.w) ** 2) this.killPilot(p, null, 'gate');
      }
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (segDist2(b.x, b.z, sg.x1, sg.z1, sg.x2, sg.z2) < sg.w * sg.w) { this.fx.burst(b.x, b.z, 0xff2a5a, 5, { speed: 4, size: 0.4 }); this.bullets.splice(i, 1); }
      }
    }
  }

  // ---------------------------------------------------------------- queries + teardown
  alive(pid) { const s = this.state.get(pid); return s === 'ship' || s === 'pilot'; }

  clearEntities() {
    for (const s of [...this.ships.values()]) this._removeShip(s);
    for (const p of [...this.pilots.values()]) this._removePilot(p);
    for (const a of this.asteroids) this.root.remove(a.g);
    for (const c of this.crates) this._removeCrate(c);
    for (const m of this.mines) this._removeMine(m);
    for (const m of this.missiles) this._removeMissile(m);
    for (const b of this.beams) this._removeBeam(b);
    this.asteroids = [];
    this.crates = [];
    this.mines = [];
    this.missiles = [];
    this.beams = [];
    this.bullets = [];
    this.respawnAt.clear();
    for (const pid of this.state.keys()) this.state.set(pid, 'out');
    this._renderBullets();
  }

  dispose() {
    this.clearEntities();
    this.scene.remove(this.root, this.bulletMesh, this.bulletGlow);
    this.iconCache.forEach((m) => { m.map.dispose(); m.dispose(); });
  }
}

const WHITE = new THREE.Color(0xffffff);
function hexA(css, a) {
  const c = new THREE.Color(css);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}
