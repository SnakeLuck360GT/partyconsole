// A racer: arcade kart physics (front-loaded acceleration, hop + 3-tier drift with mini-turbos, rocket start,
// ramp tricks, items effects, coins) and its visual (tilt, wheels, seated driver, flames, sparks, skids).
import * as THREE from 'three';
import { makeLabel } from '../../sdk/three-kit.js';
import { clamp, angleDiff, glowTexture, smoothstep } from './util.js';

export const KART_SCALE = 2.0;
export const KART_RADIUS = 1.1;
const G = 30;
export const CLASSES = {
  50: { top: 21.5, accel: 1.05, ai: 0.86, drift: 1, label: '50cc' },
  100: { top: 25.5, accel: 1.12, ai: 0.925, drift: 2, label: '100cc' },
  150: { top: 30, accel: 1.18, ai: 0.97, drift: 3, label: '150cc' },
};
const BOOST_MULT = 1.34;
const DRIFT_LEVELS = [0.75, 1.6, 2.6]; // seconds of drift charge for blue / orange / purple
export const DRIFT_COLORS = [0x45b8ff, 0xff9a1f, 0xd35bff];
const TURBO_TIME = [0.6, 1.05, 1.55];
const SPIN_TIME = { peel: 0.95, shell: 1.25, squish: 1.0, zap: 0.6, burnout: 1.1, bump: 0 };

let glowTex = null;
const proj = {};
const aimP = {};

export class Kart {
  constructor({ racer, model, track, scene, fx, night }) {
    this.racer = racer; // { id, name, color, colorHex, human, playerId, rosterIndex }
    this.id = racer.id;
    this.human = racer.human;
    this.track = track;
    this.fx = fx;
    this.scene = scene;
    this.model = model;
    this.cls = CLASSES[150];
    this.skill = 1; // AI top-speed factor (rubber band applied on top)
    this.rubber = 1;
    // physics
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.heading = 0;
    this.grounded = true;
    this.idx = 0; this.s = 0; this.lat = 0;
    this.dist = 0; // progress along the track (m), negative on the grid
    this.lapsDone = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.finished = false;
    this.finishTime = 0;
    this.place = 0;
    this.steer = 0;
    this.speed = 0;
    this.slip = 0;
    this.offroad = false;
    this.drift = 0; this.driftCharge = 0; this.driftLevel = 0; this.driftGrace = 0;
    this.hopping = false;
    this.boostT = 0; this.boostKind = 0; // 0 = item/pad (orange), 1..3 drift tiers
    this.spinT = 0; this.spinMax = 1; this.spinDir = 1; this.tumble = false;
    this.starT = 0; this.shrinkT = 0; this.ghostT = 0; this.squashT = 0;
    this.trickT = 0; this.trickKind = 0; this.trickDone = false; this.rampAir = false; this.airT = 0;
    this.coins = 0;
    this.item = null; this.itemCount = 0; this.rolling = 0; this.rollItem = null;
    this.held = null; // trailing item kind while ITEM is held
    this.wrongT = 0; this.wrongWay = false;
    this.flashT = 0;
    this.input = { steer: 0, gas: false, brake: false, drift: false, item: false, aim: 0 };
    this.prev = { drift: false, item: false };
    this.autopilot = !racer.human;
    this.disconnected = false;
    // visual state
    this.visYaw = 0; this.roll = 0; this.pitch = 0; this.squash = 0;
    this.wheelSpin = 0; this.smokeT = 0; this.lastWheel = [null, null];
    this.camShake = 0;
    this.stats = { speed: 3, accel: 3, handling: 3, weight: 3, turbo: 3 };
    this.mass = 1.2;
    this.smart = false; // Smart Steering assist (humans, toggle on the phone)
    this.assist = 0;
    this.draftT = 0; this.drafting = false;

    // ---------------- visuals
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // pitch / roll / squash / tricks
    this.root.add(this.body);
    model.root.scale.setScalar(KART_SCALE);
    this.body.add(model.root);
    glowTex ||= glowTexture();
    // blob shadow + player-colour ring keep the kart grounded and identifiable from any distance
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.8), new THREE.MeshBasicMaterial({
      map: glowTex, color: 0x000000, transparent: true, opacity: night ? 0.5 : 0.42, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,
    }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.06;
    blob.renderOrder = 2;
    this.blob = blob;
    this.root.add(blob);
    if (racer.human) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.05, 40), new THREE.MeshBasicMaterial({
        color: racer.colorHex, transparent: true, opacity: 0.75, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -9, polygonOffsetUnits: -9,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.07;
      ring.renderOrder = 3;
      this.root.add(ring);
      this.ring = ring;
      // name tag shown in the OTHER players' viewports
      this.label = makeLabel(racer.name, { color: '#fff', bg: hexToRgba(racer.colorHex, 0.85), size: 44, height: 0.55 });
      this.label.position.y = 3.6;
      this.label.material.depthTest = true;
      this.root.add(this.label);
      this.labelAspect = this.label.scale.x / this.label.scale.y;
      // "this one is you" arrow, shown during the pre-race who's-who
      this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: arrowTexture(racer.color), depthTest: false, transparent: true }));
      this.marker.renderOrder = 1000;
      this.marker.visible = false;
      this.root.add(this.marker);
    }
    if (night) {
      const hl = new THREE.Mesh(new THREE.PlaneGeometry(5, 11), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xfff0c8, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending }));
      hl.rotation.x = -Math.PI / 2;
      hl.position.set(0, 0.1, 6.5);
      this.root.add(hl);
    }
    // boost flames at the exhausts
    this.flameMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flames = [-0.2, 0.2].map((ox) => {
      const sp = new THREE.Sprite(this.flameMat);
      sp.position.set(ox * KART_SCALE, 0.42 * KART_SCALE, -0.68 * KART_SCALE);
      sp.visible = false;
      this.body.add(sp);
      return sp;
    });
    // Smart Steering antenna (lights up while the assist is helping)
    if (racer.human) {
      const ant = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.42, 6), new THREE.MeshStandardMaterial({ color: 0x333844, roughness: 0.5 }));
      pole.position.y = 0.21;
      this.antTip = new THREE.MeshStandardMaterial({ color: 0x1a3a1a, emissive: 0x2aff6a, emissiveIntensity: 0.2, roughness: 0.3 });
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), this.antTip);
      tip.position.y = 0.44;
      ant.add(pole, tip);
      ant.position.set(0.3, 0.42, -0.5);
      ant.rotation.x = -0.25;
      model.root.add(ant);
      this.antenna = ant;
      ant.visible = false;
    }
    // star aura
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    this.aura.scale.setScalar(6);
    this.aura.position.y = 1.4;
    this.aura.visible = false;
    this.root.add(this.aura);
    scene.add(this.root);
  }

  /** Place on the track at arc length s (dist = progress) with lateral offset. */
  placeAt(s, lat, dist) {
    const p = this.track.pointAt(s, lat);
    this.x = p.x; this.z = p.z; this.y = p.y;
    this.heading = p.hd;
    this.idx = p.idx;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.dist = dist;
    this.s = this.track.wrapS(s);
    this.lat = lat;
    this.lastWheel = [null, null];
    this.syncVisual(0, 0);
  }

  get topSpeed() {
    return this.cls.top;
  }

  /** Item / hazard hit. Returns 'hit' | 'immune' | 'ghost'. */
  hit(kind) {
    if (this.starT > 0) return 'immune';
    if (this.ghostT > 0 || this.finished) return 'ghost';
    const t = SPIN_TIME[kind] ?? 1;
    if (kind === 'zap') {
      this.shrinkT = 4.5;
    }
    if (t > 0) {
      this.spinT = t; this.spinMax = t;
      this.spinDir = Math.random() < 0.5 ? -1 : 1;
    }
    this.tumble = kind === 'shell';
    if (kind === 'shell') { this.vy = 7; this.grounded = false; this.rampAir = false; }
    if (kind === 'squish') this.squashT = 1.2;
    this.drift = 0; this.driftCharge = 0; this.driftLevel = 0;
    this.boostT = 0;
    this.flashT = 0.35;
    this.ghostT = Math.max(this.ghostT, t * 0.9 + 0.3);
    const lost = Math.min(this.coins, kind === 'zap' ? 1 : 3);
    this.coins -= lost;
    return { result: 'hit', lost };
  }

  startBoost(t, kind = 0) {
    if (this.boostT <= 0 || t > this.boostT) this.boostKind = kind;
    this.boostT = Math.max(this.boostT, t);
  }

  /** Physics step. ev(name, data) receives gameplay events (sounds, haptics, fx). */
  update(dt, racing, ev) {
    const tr = this.track;
    const inp = this.input;
    const canDrive = racing && this.spinT <= 0 && !this.finished;
    const steerIn = canDrive ? clamp(inp.steer, -1, 1) : (this.finished ? clamp(inp.steer, -1, 1) : 0);
    const gas = (canDrive || (this.finished && racing)) && inp.gas;
    const brake = canDrive && inp.brake;
    // rate-limited steering: smooth but responsive (0 -> full lock in ~0.2 s)
    const rate = (Math.abs(steerIn) < Math.abs(this.steer) ? 7 : 5.5) * dt;
    this.steer += clamp(steerIn - this.steer, -rate, rate);

    const sin = Math.sin(this.heading); const cos = Math.cos(this.heading);
    let vf = this.vx * sin + this.vz * cos;
    let vl = this.vx * -cos + this.vz * sin;

    tr.project(this.x, this.z, this.idx, proj);
    this.offroad = Math.abs(proj.lat) > tr.halfWidth + 1.3;

    // ---- target speed
    const S = this.stats;
    const base = this.cls.top * this.skill * this.rubber * (1 + 0.005 * this.coins) * (1 + (S.speed - 3) * 0.022);
    let top = base;
    if (this.shrinkT > 0) top *= 0.72;
    if (this.starT > 0) top *= 1.16;
    if (this.offroad && this.starT <= 0 && this.boostT <= 0) top *= 0.5;
    if (this.drift !== 0) top *= 0.985;
    else top *= 1 - 0.065 * Math.abs(this.steer) * clamp(vf / base, 0, 1);
    if (this.boostT > 0) top = Math.max(top, base * BOOST_MULT);

    if (this.grounded) {
      if (brake) {
        if (vf > 0.5) vf -= 30 * dt;
        else vf = Math.max(-8, vf - 12 * dt); // reverse
      } else if (gas) {
        if (vf < top) vf += Math.max(4, (top - vf) * this.cls.accel * (1 + (S.accel - 3) * 0.12) * (this.boostT > 0 ? 2.6 : 1)) * dt;
        if (vf > top) vf -= (vf - top) * 1.6 * dt;
      } else {
        vf *= Math.exp(-0.55 * dt);
        if (vf > top) vf -= (vf - top) * 1.6 * dt;
      }
    }

    // ---- hop & drift
    const driftDown = canDrive && inp.drift;
    const driftEdge = driftDown && !this.prev.drift;
    this.prev.drift = driftDown;
    if (driftEdge && this.grounded && vf > 5) {
      this.vy = 4.6; this.grounded = false; this.hopping = true; this.rampAir = false;
      this.squash = 0.18;
      this.driftGrace = 0.3;
      ev('hop');
    } else if (driftEdge && !this.grounded && this.rampAir && !this.trickDone) {
      this.doTrick(ev);
    }
    if (this.driftGrace > 0) this.driftGrace -= dt;
    if (this.drift === 0 && driftDown && Math.abs(this.steer) > 0.22 && vf > 9 && (this.hopping || this.driftGrace > 0)) {
      this.drift = Math.sign(this.steer);
      this.driftCharge = 0; this.driftLevel = 0;
    }
    if (this.drift !== 0 && (!driftDown || vf < 6 || !canDrive)) {
      if (this.driftLevel > 0 && canDrive && vf > 5) {
        const lvl = Math.min(this.driftLevel, this.human ? 3 : this.cls.drift);
        this.startBoost(TURBO_TIME[lvl - 1] * (1 + (S.turbo - 3) * 0.1), lvl);
        ev('turbo', lvl);
      }
      this.drift = 0; this.driftCharge = 0; this.driftLevel = 0;
    }

    // ---- steering / yaw
    const top0 = this.cls.top;
    const vAbs = Math.abs(vf);
    const speedK = clamp(vAbs / 4, 0, 1);
    const handK = 1 + (S.handling - 3) * 0.07;
    let steerUse = this.steer;
    let assistErr = null;
    this.assist = Math.max(0, this.assist - dt * 3);
    if (this.smart && canDrive && this.grounded && vAbs > 3) {
      // Smart Steering: look ahead along the road, keep the kart inside the edges and fit drifts to the corner
      const hw = tr.halfWidth;
      const la = 7 + vAbs * 0.45;
      const aimLat = this.drift !== 0 ? clamp(this.lat * 0.7 + tr.lineAt(this.s + la) * 0.3, -hw + 2, hw - 2) : clamp(this.lat, -hw + 2.2, hw - 2.2);
      tr.pointAt(this.s + la, aimLat, aimP);
      assistErr = angleDiff(Math.atan2(aimP.x - this.x, aimP.z - this.z), this.heading); // + = turn left
      if (this.drift === 0) {
        const edge = smoothstep(hw - 3.2, hw + 0.6, Math.abs(this.lat));
        const fr = Math.sin(this.heading) * proj.rx + Math.cos(this.heading) * proj.rz; // heading toward +lat
        const outward = Math.sign(this.lat) * this.steer > 0.05 || Math.sign(this.lat) * fr > 0.04;
        if (edge > 0 && outward) {
          const fix = clamp(-assistErr * 2.4, -1, 1);
          steerUse += (fix - steerUse) * edge * 0.85;
          this.assist = Math.max(this.assist, edge);
        }
        if (this.offroad && this.starT <= 0) {
          const push = 2.6 * dt * Math.sign(this.lat);
          this.x -= proj.rx * push; this.z -= proj.rz * push;
          this.assist = 1;
        }
      }
    }
    let yawRate;
    if (this.drift !== 0) {
      const into = this.steer * this.drift; // -1 (wide) .. +1 (tight)
      if (assistErr != null) {
        // drift assist: the turn rate auto-fits the corner; steering still widens / tightens a little
        const want = clamp(assistErr * 3.2, -2.6, 2.6);
        const mag = clamp(-this.drift * want + 0.4 * into, 0.15, 2.3);
        yawRate = -this.drift * mag * speedK * (1 + (handK - 1) * 0.5);
        this.assist = Math.max(this.assist, 0.6);
      } else yawRate = -this.drift * (1.1 + 0.85 * into) * speedK * (1 + (handK - 1) * 0.7);
      if (this.grounded) {
        this.driftCharge += dt * (1 + 0.55 * Math.max(0, into));
        const lvl = this.driftCharge > DRIFT_LEVELS[2] ? 3 : this.driftCharge > DRIFT_LEVELS[1] ? 2 : this.driftCharge > DRIFT_LEVELS[0] ? 1 : 0;
        if (lvl > this.driftLevel) { this.driftLevel = lvl; ev('driftLevel', lvl); }
      }
    } else {
      // steering authority falls with speed, but full lock still turns decisively
      const auth = (2.5 - 1.05 * clamp((vAbs - 6) / (top0 - 6), 0, 1)) * handK;
      yawRate = -steerUse * auth * speedK * (vf < -0.5 ? -1 : 1);
    }
    if (!this.grounded) yawRate *= this.hopping ? 0.9 : 0.45;
    if (this.spinT > 0) {
      yawRate = 0;
      this.spinT -= dt;
      vf *= Math.exp(-2.6 * dt);
      if (this.spinT <= 0) this.tumble = false;
    }
    this.heading += yawRate * dt;

    // ---- lateral grip
    const grip = this.spinT > 0 ? 2 : this.drift !== 0 ? 3.4 : this.offroad ? 7 : 12;
    if (this.grounded) vl *= Math.exp(-grip * dt);
    if (this.drift !== 0 && this.grounded) vl += this.drift * 3.2 * dt * clamp(vf / 20, 0, 1); // slide outward
    const ns = Math.sin(this.heading); const nc = Math.cos(this.heading);
    this.vx = ns * vf + -nc * vl;
    this.vz = nc * vf + ns * vl;
    this.speed = vf;
    this.slip = vl;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // ---- re-project after movement
    tr.project(this.x, this.z, this.idx, proj);
    const prevS = this.s;
    this.idx = proj.idx;
    this.s = proj.s;
    this.lat = proj.lat;
    this.dist += tr.deltaS(this.s, prevS);

    // ---- walls
    const lim = tr.wallDist - KART_RADIUS;
    if (Math.abs(proj.lat) > lim) {
      const sign = Math.sign(proj.lat);
      const pen = Math.abs(proj.lat) - lim;
      this.x -= proj.rx * pen * sign;
      this.z -= proj.rz * pen * sign;
      const vr = this.vx * proj.rx + this.vz * proj.rz;
      if (vr * sign > 0) {
        this.vx -= 1.5 * vr * proj.rx;
        this.vz -= 1.5 * vr * proj.rz;
        this.vx *= 0.9; this.vz *= 0.9;
        if (Math.abs(vr) > 3.5) {
          ev('wall', Math.abs(vr));
          const wx = this.x + proj.rx * sign * KART_RADIUS; const wz = this.z + proj.rz * sign * KART_RADIUS;
          this.fx.burst(wx, this.y + 0.7, wz, { n: Math.min(28, 8 + Math.abs(vr) * 1.6), color: 0xffd060, speed: 7, size: 0.45, life: 0.4, grav: 18 });
          this.camShake = Math.max(this.camShake, Math.min(0.5, Math.abs(vr) * 0.03));
          if (this.drift) this.driftCharge *= 0.6;
        }
      }
      this.lat = sign * lim;
    }

    // ---- vertical
    const ground = proj.y + tr.rampHeight(this.s, this.lat);
    if (this.grounded) {
      const gv = (ground - this.y) / Math.max(dt, 1e-3);
      if (ground < this.y - 0.2 && gv < -5 && this.vy > gv) {
        this.grounded = false; // ground fell away (ramp lip / crest): fly!
        this.rampAir = this.vy > 3.5 || tr.onRampLip(this.s);
        this.trickDone = false;
        this.airT = 0;
      } else {
        this.vy = clamp(gv, -30, 30);
        this.y = ground;
      }
    }
    if (!this.grounded) {
      this.airT += dt;
      this.vy -= G * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        const impact = -this.vy;
        this.y = ground;
        this.vy = 0;
        this.grounded = true;
        if (this.hopping) {
          this.hopping = false;
          this.driftGrace = Math.max(this.driftGrace, 0.18);
          this.squash = 0.12;
        } else {
          if (impact > 6) {
            this.squash = Math.min(0.32, impact * 0.022);
            this.camShake = Math.max(this.camShake, Math.min(0.6, impact * 0.04));
            ev('land', impact);
            this.fx.burst(this.x, ground + 0.2, this.z, { n: 12, color: 0xb8a890, speed: 5, size: 1.4, life: 0.5, grav: 2, additive: false, up: 1 });
          }
          if (this.trickDone) {
            this.startBoost(0.8, 0);
            ev('trickBoost');
          }
        }
        this.rampAir = false; this.trickDone = false; this.trickT = 0;
      }
    }
    this.groundY = ground;

    // ---- boost pads
    if (this.grounded) {
      for (const b of tr.boosts) {
        const d = tr.deltaS(this.s, b.s);
        if (Math.abs(d) < b.len / 2 && Math.abs(this.lat - b.lat) < b.half + 0.4) {
          if (this.boostT < 0.9) ev('pad');
          this.startBoost(1.1, 0);
        }
      }
    }

    // ---- wrong way
    // track tangent t = (rz, -rx); forward = (sin, cos)
    const along = Math.sin(this.heading) * proj.rz + Math.cos(this.heading) * -proj.rx;
    if (racing && !this.finished && along < -0.25 && Math.abs(vf) > 2 && this.spinT <= 0) this.wrongT += dt;
    else this.wrongT = Math.max(0, this.wrongT - dt * 2);
    const ww = this.wrongT > 1.1;
    if (ww !== this.wrongWay) { this.wrongWay = ww; ev('wrongWay', ww); }

    // ---- timers
    if (this.boostT > 0) this.boostT -= dt;
    if (this.starT > 0) { this.starT -= dt; if (this.starT <= 0) ev('starEnd'); }
    if (this.shrinkT > 0) this.shrinkT -= dt;
    if (this.ghostT > 0) this.ghostT -= dt;
    if (this.squashT > 0) this.squashT -= dt;
    if (this.trickT > 0) this.trickT -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    this.camShake = Math.max(0, this.camShake - dt * 2.2);
  }

  doTrick(ev) {
    this.trickDone = true;
    this.trickT = 0.5;
    this.trickKind = Math.floor(Math.random() * 3);
    ev('trick');
  }

  // ------------------------------------------------------------------ visuals

  syncVisual(dt, t) {
    const r = this.root;
    r.position.set(this.x, this.y, this.z);
    // visual yaw: drift angle + spin-out
    const targetYaw = this.drift !== 0 ? this.drift * -0.5 : clamp(-this.slip * 0.035, -0.3, 0.3);
    this.visYaw += (targetYaw - this.visYaw) * Math.min(1, dt * 9);
    let spin = 0;
    if (this.spinT > 0) spin = this.spinDir * (1 - this.spinT / this.spinMax) * Math.PI * (this.tumble ? 4 : 2);
    r.rotation.y = this.heading + this.visYaw + spin;
    // pitch with slope, roll into turns
    const slope = this.track.slope[this.idx] || 0;
    const targetPitch = this.grounded ? -Math.atan(slope) : clamp(-this.vy * 0.022, -0.3, 0.3);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 9);
    const targetRoll = clamp(this.steer * Math.min(1, Math.abs(this.speed || 0) / 15) * 0.1 + (this.drift ? this.drift * 0.12 : 0), -0.25, 0.25);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 7);
    let tx = this.pitch; let tz = this.roll; let ty = 0;
    if (this.trickT > 0) {
      const u = 1 - this.trickT / 0.5;
      const a = Math.sin(u * Math.PI / 2) * Math.PI * 2;
      if (this.trickKind === 0) tz += a * (this.spinDir > 0 ? 1 : -1);
      else if (this.trickKind === 1) ty += a;
      else tx -= a;
    }
    if (this.tumble && this.spinT > 0) tx += (1 - this.spinT / this.spinMax) * Math.PI * 2;
    this.body.rotation.set(tx, ty, tz, 'YXZ');
    // squash & stretch + shrink
    this.squash *= Math.exp(-dt * 7);
    const sq = Math.sin(Math.min(1, this.squash * 4) * Math.PI) * this.squash;
    const shrinkTarget = this.shrinkT > 0 ? 0.55 : 1;
    this.shrinkVis = (this.shrinkVis ?? 1) + (shrinkTarget - (this.shrinkVis ?? 1)) * Math.min(1, dt * 6);
    const flat = this.squashT > 0 ? 0.35 : 1;
    const sc = this.shrinkVis;
    this.body.scale.set(sc * (1 + sq * 0.5) * (flat < 1 ? 1.3 : 1), sc * (1 - sq) * flat, sc * (1 + sq * 0.5));
    // engine vibration
    this.body.position.y = this.grounded ? Math.sin(t * 52 + this.racer.rosterIndex) * 0.014 * Math.min(1, Math.abs(this.speed || 0) / 5) : 0;
    // wheels
    const w = this.model.wheels;
    this.wheelSpin += (this.speed || 0) * dt / 0.4;
    for (const k of ['fl', 'fr', 'bl', 'br']) {
      const wh = w[k];
      if (!wh) continue;
      wh.rotation.x = this.wheelSpin;
      if (k[0] === 'f') wh.rotation.y = -this.steer * 0.42;
    }
    for (const wh of w.extra) wh.rotation.x = this.wheelSpin;
    // driver: lean into turns, a little bounce, animation
    const d = this.model.driver;
    if (d) {
      const lean = this.steer * 0.16 + (this.drift ? this.drift * 0.08 : 0);
      d.obj.rotation.z += (lean - d.obj.rotation.z) * Math.min(1, dt * 8);
      d.obj.rotation.y += (-this.steer * 0.28 - d.obj.rotation.y) * Math.min(1, dt * 8);
      const bounce = this.grounded ? Math.abs(Math.sin(t * 11 + this.racer.rosterIndex)) * 0.012 * Math.min(1, Math.abs(this.speed) / 8) : 0.02;
      d.obj.position.y = d.base.y + bounce + sq * 0.05;
      d.anim?.update(dt);
    }
    // shell/flash/star material uniforms
    const fx = this.model.fx;
    fx.flash.value = this.flashT > 0 ? this.flashT * 2.2 : 0;
    fx.star.value = this.starT > 0 ? Math.min(1, this.starT * 2) : 0;
    fx.time.value = t;
    this.aura.visible = this.starT > 0;
    if (this.aura.visible) {
      this.aura.material.color.setHSL((t * 0.9) % 1, 1, 0.6);
      this.aura.scale.setScalar(5.5 + Math.sin(t * 20) * 0.5);
    }
    // flames
    const boosting = this.boostT > 0;
    for (const f of this.flames) {
      f.visible = boosting;
      if (boosting) {
        const s = (1.2 + Math.random() * 0.8) * (this.boostT > 0.2 ? 1 : this.boostT / 0.2 + 0.3);
        f.scale.set(s, s * 1.2, 1);
      }
    }
    if (boosting) this.flameMat.color.setHex(this.boostKind > 0 ? DRIFT_COLORS[this.boostKind - 1] : 0xff7a18);
    if (this.antenna) {
      this.antenna.visible = this.smart;
      if (this.smart) {
        this.antTip.emissiveIntensity = 0.25 + this.assist * 3;
        this.antenna.rotation.z = Math.sin(t * 9) * 0.06 * Math.min(1, Math.abs(this.speed) / 10) - this.steer * 0.15;
      }
    }
    // ghost blink (after a hit)
    const blink = this.ghostT > 0 && this.spinT <= 0 && Math.sin(t * 30) > 0.3;
    this.body.visible = !blink;
  }

  /**
   * Size the name tag for one viewport: a fixed on-screen height (a fraction of the viewport, capped in CSS px),
   * so it is readable far away but never covers the view up close. Fades out when the kart is right in front.
   */
  fitLabel(cam, viewH = 720, maxPx = 30) {
    if (!this.label) return;
    const p = cam.position;
    const d = Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z);
    const px = Math.min(maxPx, Math.max(15, viewH * 0.042)); // label height on screen, CSS px
    const worldPerPx = (2 * d * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, viewH);
    const hgt = px * worldPerPx;
    this.label.scale.set(hgt * this.labelAspect, hgt, 1);
    this.label.position.y = 2.9 + hgt * 0.5;
    this.label.material.opacity = Math.min(1, Math.max(0, (d - 9) / 9)) * (this.disconnected ? 0.5 : 1);
    this.label.visible = d > 9 && d < 220;
  }

  /** Size / bob the who's-who arrow for one viewport (fixed on-screen size, above the name tag if shown). */
  fitMarker(cam, viewH, t) {
    if (!this.marker?.visible) return;
    const p = cam.position;
    const d = Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z);
    const px = Math.min(64, Math.max(30, viewH * 0.085));
    const h = px * (2 * d * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, viewH);
    this.marker.scale.set(h, h, 1);
    const top = this.label?.visible ? this.label.position.y + this.label.scale.y * 0.5 : 2.6;
    this.marker.position.y = top + h * (0.65 + 0.12 * Math.sin(t * 7));
  }

  /** Particles + skid marks (call after update). */
  emitFx(dt) {
    const fx = this.fx;
    const yaw = this.heading + this.visYaw;
    const sin = Math.sin(yaw); const cos = Math.cos(yaw);
    const sc = this.shrinkVis ?? 1;
    const back = -0.62 * KART_SCALE * sc;
    const wheels = [-0.36 * KART_SCALE * sc, 0.36 * KART_SCALE * sc];
    const rp = this._rp || (this._rp = [[0, 0], [0, 0]]);
    for (let i = 0; i < 2; i++) { rp[i][0] = this.x + sin * back + -cos * wheels[i]; rp[i][1] = this.z + cos * back + sin * wheels[i]; }
    // drift sparks
    if (this.drift !== 0 && this.grounded) {
      const lvl = this.driftLevel;
      const col = lvl > 0 ? DRIFT_COLORS[lvl - 1] : 0xfff2c0;
      const n = lvl > 0 ? 2 : 1;
      for (let w = 0; w < 2; w++) {
        const x = rp[w][0]; const z = rp[w][1];
        for (let i = 0; i < n; i++) {
          fx.glow.emit(x, this.y + 0.2, z, (Math.random() - 0.5) * 5 - this.vx * 0.12, 2 + Math.random() * 4, (Math.random() - 0.5) * 5 - this.vz * 0.12,
            { color: col, size: lvl > 0 ? 0.45 + lvl * 0.1 : 0.3, life: 0.26, grav: 22, drag: 1 });
        }
        if (lvl > 0 && Math.random() < 0.6) fx.glow.emit(x, this.y + 0.35, z, 0, 0.4, 0, { color: col, size: 1.5 + lvl * 0.35, life: 0.1 });
      }
    }
    // skid marks while drifting / sliding hard / spinning
    const skidding = this.grounded && (this.drift !== 0 || Math.abs(this.slip || 0) > 4.5 || this.spinT > 0) && !this.offroad;
    for (let k = 0; k < 2; k++) {
      const last = this.lastWheel[k];
      const x = rp[k][0]; const z = rp[k][1];
      if (skidding && last) fx.skids.add(last[0], last[1], last[2], x, this.y + 0.05, z);
      if (skidding) { if (!last) this.lastWheel[k] = [x, this.y + 0.05, z]; else { last[0] = x; last[1] = this.y + 0.05; last[2] = z; } } else this.lastWheel[k] = null;
    }
    // tyre smoke while drifting
    if (this.drift !== 0 && this.grounded && Math.random() < 0.35) {
      const w = rp[this.drift > 0 ? 0 : 1];
      fx.smoke.emit(w[0], this.y + 0.3, w[1], (Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 1.5, { color: 0xeeeeee, size: 1.0, life: 0.6, grow: 2.4, drag: 2, alpha: 0.35 });
    }
    // exhaust smoke / boost fire
    this.smokeT -= dt;
    const ex = this.x + sin * (back - 0.15); const ez = this.z + cos * (back - 0.15);
    if (this.boostT > 0) {
      const col = this.boostKind > 0 ? DRIFT_COLORS[this.boostKind - 1] : 0xff6a10;
      for (let i = 0; i < 2; i++) {
        fx.glow.emit(ex + (Math.random() - 0.5) * 0.6, this.y + 0.8 * sc, ez + (Math.random() - 0.5) * 0.6, -sin * 7 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.5, -cos * 7 + (Math.random() - 0.5) * 2,
          { color: Math.random() < 0.5 ? col : 0xffd060, size: 1.2, life: 0.28, grow: -2, drag: 3 });
      }
    } else if (this.smokeT <= 0 && Math.abs(this.speed || 0) > 1 && Math.abs(this.speed) < 14) {
      this.smokeT = 0.1;
      fx.smoke.emit(ex, this.y + 0.75 * sc, ez, -sin * 2, 1.1, -cos * 2, { color: 0xdedede, size: 0.5, life: 0.6, grow: 2, drag: 2, alpha: 0.35 });
    }
    // off-road dust
    if (this.offroad && this.grounded && Math.abs(this.speed || 0) > 5 && Math.random() < 0.7) {
      const w = rp[Math.random() < 0.5 ? 0 : 1];
      fx.smoke.emit(w[0], this.y + 0.3, w[1], (Math.random() - 0.5) * 2.5, 1.6, (Math.random() - 0.5) * 2.5, { color: this.dustColor ?? 0xc8b48a, size: 1.1, life: 0.8, grow: 2.6, drag: 2, alpha: 0.55 });
    }
    // star sparkles
    if (this.starT > 0 && Math.random() < 0.8) {
      fx.glow.emit(this.x + (Math.random() - 0.5) * 2.5, this.y + 0.5 + Math.random() * 2, this.z + (Math.random() - 0.5) * 2.5, 0, 1.5, 0,
        { color: [0xff4d4d, 0xffcc00, 0x34d058, 0x3d8bff, 0xb86bff][Math.floor(Math.random() * 5)], size: 0.6, life: 0.4, drag: 1 });
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.isSprite && o.material !== this.flameMat) { if (o !== this.marker) o.material.map?.dispose(); o.material.dispose(); }
      if (o.isMesh && (o === this.blob || o === this.ring)) { o.geometry.dispose(); o.material.dispose(); }
    });
    this.flameMat.dispose();
  }
}

const arrowCache = new Map();
function arrowTexture(color) {
  if (arrowCache.has(color)) return arrowCache.get(color);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.beginPath();
  g.moveTo(64, 116); g.lineTo(14, 42); g.lineTo(42, 42); g.lineTo(42, 10); g.lineTo(86, 10); g.lineTo(86, 42); g.lineTo(114, 42);
  g.closePath();
  g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = color; g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  arrowCache.set(color, t);
  return t;
}

export function hexToRgba(hex, a) {
  return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
}

export { angleDiff };
