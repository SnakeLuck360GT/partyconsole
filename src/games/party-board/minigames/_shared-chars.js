// Player characters for minigames: animated monster models (CC0, shared library) tinted to the player colour,
// with a name label, a coloured foot ring, run/idle blending, jump physics, stun stars, hit flash and squash.
//
//   const chars = await spawnCharacters(s, { height: 1.6 });   // Map pid -> Char
//   c.drive(ix, iz, dt, { speed: 6 });   c.jump(9);   c.integrate(dt);   (c.update(dt) is automatic)
import { THREE, loadModel, animator, makeLabel } from '../../../sdk/three-kit.js';

// Eight distinct cute monsters (Quaternius, CC0). `_Main` material gets the player colour.
export const ROSTER = [
  'characters/monsters/dino.glb',
  'characters/monsters/frog.glb',
  'characters/monsters/yeti.glb',
  'characters/monsters/cactoro.glb',
  'characters/monsters/blue-demon.glb',
  'characters/monsters/alien.glb',
  'characters/monsters/mushroom-king.glb',
  'characters/monsters/orc.glb',
];

// Canonical action -> clip name candidates (first match wins).
const CLIPS = {
  idle: ['Idle'],
  run: ['Run', 'Running', 'sprint'],
  walk: ['Walk', 'Walking', 'walk'],
  jump: ['Jump', 'jump'],
  air: ['Jump_Idle', 'fall', 'Jump'],
  land: ['Jump_Land', 'Jump_Landing'],
  death: ['Death', 'die'],
  hit: ['HitReact', 'HitRecieve', 'Hit_A'],
  punch: ['Punch', 'attack-melee-right', 'Unarmed_Melee_Attack_Punch_A'],
  wave: ['Wave', 'Hello', 'Cheer'],
  yes: ['Yes', 'emote-yes'],
  no: ['No', 'emote-no'],
  duck: ['Duck', 'crouch'],
  weapon: ['Weapon', 'Punch'],
};

/** Which model a player gets: stable per join index, unique within one minigame when possible. */
export function characterFor(player, i = 0) {
  const idx = Number.isInteger(player?.index) ? player.index : i;
  return ROSTER[((idx % ROSTER.length) + ROSTER.length) % ROSTER.length];
}

const ringGeo = new THREE.RingGeometry(0.46, 0.6, 40).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(0.46, 40).rotateX(-Math.PI / 2);
const starGeo = new THREE.OctahedronGeometry(0.11, 0);
const tmp = new THREE.Vector3();
const box = new THREE.Box3();

export class Char {
  constructor(s, player, model, { height = 1.6, label = true, ring = true } = {}) {
    this.s = s;
    this.player = player;
    this.id = player.id;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.model = model;
    // Normalise height and put feet on y=0.
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const h = Math.max(0.001, box.max.y - box.min.y);
    const k = height / h;
    model.scale.multiplyScalar(k);
    model.position.y = -box.min.y * k;
    this.body.add(model);
    this.height = height;
    this.anim = animator(model);
    this.clipName = {};
    for (const [key, cands] of Object.entries(CLIPS)) {
      this.clipName[key] = cands.find((c) => this.anim.names.includes(c)) || null;
    }
    // Materials: tint *_Main to the player colour; clone the rest so hit flashes stay per-character.
    this.mats = [];
    const col = new THREE.Color(player.colorHex ?? player.color);
    model.traverse((o) => {
      if (!o.isMesh) return;
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      const out = arr.map((m) => {
        const c = m.clone();
        if (/main$/i.test(m.name) || /^main$/i.test(m.name)) c.color = col.clone();
        else if (/secondary$/i.test(m.name)) c.color = c.color.clone().lerp(col, 0.25);
        if (c.emissive) this.mats.push(c);
        return c;
      });
      o.material = out.length === 1 ? out[0] : out;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
    });
    // Foot ring (in scene, stays on the ground while jumping).
    this.ground = new THREE.Group();
    if (ring) {
      const rm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
      const dm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false });
      const r = new THREE.Mesh(ringGeo, rm);
      const d = new THREE.Mesh(discGeo, dm);
      r.renderOrder = 2; d.renderOrder = 1;
      this.ground.add(d, r);
      this.ground.scale.setScalar(height / 1.6);
    }
    if (label) {
      this.label = makeLabel(player.name, { color: '#ffffff', bg: toRgba(player.color, 0.85), size: 44, height: 0.42 });
      this.label.position.y = height + 0.45;
      this.root.add(this.label);
    }
    s.scene.add(this.root, this.ground);

    // State
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.groundY = 0;
    this.grounded = true;
    this.yaw = 0;
    this.targetYaw = 0;
    this.alive = true;
    this.stunT = 0;
    this.lockT = 0;
    this.flashT = 0;
    this.flashColor = new THREE.Color(1, 1, 1);
    this.sq = 0; // squash spring value
    this.sqV = 0;
    this.stars = null;
    this.loco = '';
    this.play('idle');
  }

  get pos() { return this.root.position; }

  play(key, { loop = true, fade = 0.18, timeScale = 1 } = {}) {
    const name = this.clipName[key] || key;
    const a = this.anim.play(name, { loop, fade, timeScale });
    if (a && !loop) a.reset();
    this.loco = key;
    return a;
  }

  /** One-shot action; blocks locomotion anims for `dur` seconds. */
  action(key, dur = 0.6, timeScale = 1) {
    this.lockT = dur;
    const name = this.clipName[key] || key;
    const a = this.anim.play(name, { loop: false, fade: 0.08, timeScale });
    if (a) { a.reset(); a.play(); }
    this.loco = key;
  }

  face(x, z) { if (x * x + z * z > 1e-4) this.targetYaw = Math.atan2(x, z); }

  /** Stick-driven movement with acceleration. Returns speed. */
  drive(ix, iz, dt, { speed = 6, accel = 14, turn = 14 } = {}) {
    if (!this.alive) return 0;
    let mx = ix; let mz = iz;
    if (this.stunT > 0) { mx = 0; mz = 0; }
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;
    this.root.position.x += this.vel.x * dt;
    this.root.position.z += this.vel.z * dt;
    if (m > 0.1) this.face(mx, mz);
    this.turnSpeed = turn;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.autoLoco(sp, speed);
    return sp;
  }

  /** Pick idle/walk/run/air based on speed. */
  autoLoco(sp, maxSpeed = 6) {
    if (this.lockT > 0 || !this.alive || this.stunT > 0) return;
    if (!this.grounded) { if (this.loco !== 'air' && this.loco !== 'jump') this.play('air'); return; }
    if (sp > 0.5) {
      const ts = THREE.MathUtils.clamp(sp / (maxSpeed * 0.8), 0.6, 1.5);
      if (this.loco !== 'run') this.runAction = this.play('run', { timeScale: ts });
      else if (this.runAction) this.runAction.timeScale = ts;
    } else if (this.loco !== 'idle') this.play('idle');
  }

  jump(v = 9) {
    if (!this.grounded || !this.alive || this.stunT > 0) return false;
    this.vy = v;
    this.grounded = false;
    this.sq = -0.25;
    this.action('jump', 0.25, 1.4);
    this.s.fx.dust(this.root.position, 5);
    return true;
  }

  /** Gravity + landing against groundY (or a function of x,z returning ground height or null for a hole). */
  integrate(dt, { gravity = 28, ground = null } = {}) {
    const gy = typeof ground === 'function' ? ground(this.root.position.x, this.root.position.z) : this.groundY;
    if (!this.grounded || gy === null || this.root.position.y > (gy ?? 0) + 0.001) {
      this.vy -= gravity * dt;
      this.root.position.y += this.vy * dt;
      if (gy !== null && this.root.position.y <= gy && this.vy <= 0 && this.root.position.y > gy - 0.6) {
        this.root.position.y = gy;
        if (!this.grounded) this.land();
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }
  }

  land() {
    this.grounded = true;
    this.sq = 0.28;
    if (this.alive && this.lockT <= 0 && this.stunT <= 0) this.play('idle', { fade: 0.1 });
    this.s.fx.dust(this.root.position, 4);
  }

  stun(sec = 1.2) {
    if (!this.alive) return;
    this.stunT = Math.max(this.stunT, sec);
    this.vel.set(0, 0, 0);
    this.play('hit', { loop: false, fade: 0.05 });
    this.flash(0xffffff);
    if (!this.stars) {
      this.stars = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe14d, toneMapped: false });
      for (let i = 0; i < 4; i++) {
        const st = new THREE.Mesh(starGeo, mat);
        const a = (i / 4) * Math.PI * 2;
        st.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
        this.stars.add(st);
      }
      this.stars.position.y = this.height + 0.12;
      this.root.add(this.stars);
    }
    this.stars.visible = true;
  }

  flash(color = 0xffffff, t = 0.25) { this.flashColor.set(color); this.flashT = t; }
  squash(a = 0.25) { this.sq = a; }

  die({ fling = null } = {}) {
    if (!this.alive) return;
    this.alive = false;
    this.stunT = 0;
    if (this.stars) this.stars.visible = false;
    this.play('death', { loop: false, fade: 0.08 });
    this.flash(0xffffff, 0.3);
    if (this.label) this.label.material.opacity = 0.45;
    this.ground.visible = false;
    if (fling) { this.vel.copy(fling); this.vy = fling.y; this.grounded = false; }
  }

  revive() {
    this.alive = true;
    if (this.label) this.label.material.opacity = 1;
    this.ground.visible = true;
    this.play('idle');
  }

  cheer() {
    if (!this.alive) this.revive();
    this.stunT = 0;
    this.lockT = 0;
    if (this.stars) this.stars.visible = false;
    this.play('wave');
    this.face(this.s.camera.position.x - this.root.position.x, this.s.camera.position.z - this.root.position.z);
    this.cheering = true;
  }

  update(dt) {
    this.anim.update(dt);
    if (this.lockT > 0) {
      this.lockT -= dt;
      if (this.lockT <= 0 && this.alive && this.stunT <= 0) this.play(this.grounded ? 'idle' : 'air');
    }
    if (this.stunT > 0) {
      this.stunT -= dt;
      if (this.stars) { this.stars.rotation.y += dt * 7; }
      if (this.stunT <= 0) { if (this.stars) this.stars.visible = false; if (this.alive) this.play('idle'); }
    }
    // yaw smoothing
    let d = this.targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-(this.turnSpeed || 14) * dt));
    this.body.rotation.y = this.yaw;
    // squash spring
    this.sqV += (-this.sq * 180 - this.sqV * 14) * dt;
    this.sq += this.sqV * dt;
    const sy = 1 - this.sq;
    const sxz = 1 + this.sq * 0.5;
    this.body.scale.set(sxz, sy, sxz);
    // flash
    if (this.flashT > 0 || this._flashing) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT) * 4;
      for (const m of this.mats) { m.emissive.copy(this.flashColor); m.emissiveIntensity = k; }
      this._flashing = this.flashT > 0;
    }
    // ground ring follows
    this.ground.position.set(this.root.position.x, (this.groundY ?? 0) + 0.03, this.root.position.z);
    if (this.cheering && this.grounded && Math.random() < dt * 1.2) { this.vy = 6; this.grounded = false; }
    if (this.cheering) this.integrate(dt, { gravity: 22 });
  }

  dispose() {
    this.s.scene.remove(this.root, this.ground);
  }
}

function toRgba(css, a) {
  const c = new THREE.Color(css);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

/**
 * Load one character per session player (in parallel). Returns Map pid -> Char.
 * Characters auto-update each frame (animation, squash, flash, ring).
 */
export async function spawnCharacters(s, opts = {}) {
  const used = new Set();
  const paths = s.players.map((p, i) => {
    let path = characterFor(p, i);
    // keep models unique inside one minigame
    let k = 0;
    while (used.has(path) && k < ROSTER.length) { path = ROSTER[(ROSTER.indexOf(path) + 1) % ROSTER.length]; k++; }
    used.add(path);
    return path;
  });
  const models = await Promise.all(paths.map((p) => loadModel(s.env.sharedAsset(p))));
  const map = new Map();
  s.players.forEach((p, i) => map.set(p.id, new Char(s, p, models[i], opts)));
  s.onFrame((dt) => { for (const c of map.values()) c.update(dt); });
  return map;
}

/** Push overlapping characters apart (circle vs circle on xz). Returns list of [a,b,impactSpeed] contacts. */
export function separate(chars, radius = 0.5, { bounce = 0 } = {}) {
  const arr = [...chars].filter((c) => c.alive);
  const hits = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i].root.position;
      const b = arr[j].root.position;
      if (Math.abs(a.y - b.y) > 1.2) continue;
      tmp.set(b.x - a.x, 0, b.z - a.z);
      const d = tmp.length();
      const min = radius * 2;
      if (d < min && d > 1e-5) {
        tmp.multiplyScalar(1 / d);
        const push = (min - d) / 2;
        a.x -= tmp.x * push; a.z -= tmp.z * push;
        b.x += tmp.x * push; b.z += tmp.z * push;
        const va = arr[i].vel; const vb = arr[j].vel;
        const rel = (vb.x - va.x) * tmp.x + (vb.z - va.z) * tmp.z;
        if (rel < 0) {
          const imp = -rel * (1 + bounce) / 2;
          va.x -= tmp.x * imp; va.z -= tmp.z * imp;
          vb.x += tmp.x * imp; vb.z += tmp.z * imp;
          hits.push([arr[i], arr[j], -rel, tmp.clone()]);
        }
      }
    }
  }
  return hits;
}
