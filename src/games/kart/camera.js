// Per-player third-person chase camera, tuned to feel like a console kart racer:
// close behind and a little above the kart, spring-damped follow with yaw lag, outward swing + roll while
// drifting, FOV kick on boosts, shake on landings / walls / off-road, and never through the scenery.
import * as THREE from 'three';
import { clamp, angleDiff } from './util.js';
import { KART_SCALE } from './kart.js';

const DIST = 7.4; // ~2.6 kart lengths behind the kart's centre (≈3 lengths to the rear bumper view)
const HEIGHT = 3.35; // ~1.25 kart heights above the road
const LOOK_AHEAD = 5.0;
const LOOK_UP = 1.55;
const HFOV = 100; // target horizontal FOV (deg); vertical FOV is derived per viewport aspect

const tmp = {};
const _v = new THREE.Vector3();

export function baseVFov(aspect) {
  const v = (2 * Math.atan(Math.tan((HFOV * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return clamp(v, 46, 70);
}

export class ChaseCam {
  constructor(track) {
    this.track = track;
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.3, 620);
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.yaw = 0;
    this.fovK = 0; // 0..1 boost widening
    this.roll = 0;
    this.side = 0; // lateral swing (m)
    this.vy = 0;
    this.shakeT = 0;
    this.time = Math.random() * 100;
    this.mode = 'chase';
    this.orbit = 0;
    this.aspect = 16 / 9;
  }

  setAspect(aspect) {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.baseFov = baseVFov(aspect);
    this.camera.fov = this.baseFov + this.fovK * 10;
    this.camera.updateProjectionMatrix();
  }

  snap(k) {
    this.yaw = k.heading;
    this.side = 0;
    this.roll = 0;
    this.computeTarget(k, this.pos, this.look);
    this.apply(0);
  }

  computeTarget(k, outPos, outLook) {
    const sin = Math.sin(this.yaw); const cos = Math.cos(this.yaw);
    const rx = -cos; const rz = sin; // right vector
    const sp = clamp(Math.abs(k.speed) / k.cls.top, 0, 1.4);
    const dist = DIST + sp * 0.9 + this.fovK * 1.1;
    const h = HEIGHT + sp * 0.15;
    outPos.set(k.x - sin * dist + rx * this.side, k.y + h, k.z - cos * dist + rz * this.side);
    outLook.set(k.x + sin * LOOK_AHEAD, k.y + LOOK_UP, k.z + cos * LOOK_AHEAD);
  }

  /** Pull the camera toward the kart if the track walls (or terrain) would block the view. */
  clampToTrack(k, pos) {
    const tr = this.track;
    const lim = tr.wallDist - 0.7;
    tr.project(pos.x, pos.z, k.idx, tmp, 30);
    if (Math.abs(tmp.lat) > lim) {
      // binary search along kart -> camera for the last point inside the walls
      let lo = 0; let hi = 1;
      for (let i = 0; i < 7; i++) {
        const m = (lo + hi) / 2;
        const x = k.x + (pos.x - k.x) * m; const z = k.z + (pos.z - k.z) * m;
        tr.project(x, z, k.idx, tmp, 30);
        if (Math.abs(tmp.lat) > lim) hi = m; else lo = m;
      }
      const f = Math.max(0.35, lo);
      pos.x = k.x + (pos.x - k.x) * f;
      pos.z = k.z + (pos.z - k.z) * f;
      pos.y = Math.max(pos.y, k.y + HEIGHT * (1.15 - f * 0.15));
      tr.project(pos.x, pos.z, k.idx, tmp, 30);
    }
    const ground = tmp.y + tr.rampHeight(tmp.s, tmp.lat) + 1.1;
    if (pos.y < ground) pos.y = ground;
  }

  update(dt, k, t) {
    this.time += dt;
    if (this.mode === 'finish') return this.updateFinish(dt, k);
    // yaw lag: weighty turns. Spin-outs don't drag the camera around (heading is unaffected by the visual spin).
    const yawRate = k.drift !== 0 ? 3.6 : 4.6;
    this.yaw += angleDiff(k.heading, this.yaw) * (1 - Math.exp(-dt * yawRate));
    // drift: swing outward + slight roll
    const wantSide = k.drift ? -k.drift * 1.25 : 0;
    this.side += (wantSide - this.side) * (1 - Math.exp(-dt * 3));
    const wantRoll = k.drift ? k.drift * 0.045 : -k.steer * 0.012;
    this.roll += (wantRoll - this.roll) * (1 - Math.exp(-dt * 4));
    // boost FOV kick
    const wantFov = k.boostT > 0 ? 1 : 0;
    this.fovK += (wantFov - this.fovK) * (1 - Math.exp(-dt * (wantFov > this.fovK ? 7 : 2.5)));
    this.computeTarget(k, _v, this.look);
    this.clampToTrack(k, _v);
    // spring-damped follow: horizontal stiff, vertical softer so jumps feel floaty
    const kh = 1 - Math.exp(-dt * 11);
    const kv = 1 - Math.exp(-dt * (k.grounded ? 7 : 3.5));
    this.pos.x += (_v.x - this.pos.x) * kh;
    this.pos.z += (_v.z - this.pos.z) * kh;
    this.pos.y += (_v.y - this.pos.y) * kv;
    this.clampToTrack(k, this.pos);
    // shake
    const sp = clamp(Math.abs(k.speed) / k.cls.top, 0, 1);
    const shake = k.camShake + (k.offroad && k.grounded ? 0.05 * sp : 0) + (k.boostT > 0 ? 0.015 : 0);
    this.apply(shake);
    void t;
  }

  updateFinish(dt, k) {
    this.orbit += dt * 0.35;
    const a = k.heading + Math.PI * 0.82 + Math.sin(this.orbit) * 0.5;
    const r = 6.2 * (KART_SCALE / 2);
    _v.set(k.x + Math.sin(a) * r, k.y + 2.4, k.z + Math.cos(a) * r);
    this.clampToTrack(k, _v);
    this.pos.lerp(_v, 1 - Math.exp(-dt * 2.5));
    this.look.set(k.x, k.y + 1.3, k.z);
    this.roll *= Math.exp(-dt * 3);
    this.fovK *= Math.exp(-dt * 3);
    this.apply(0);
  }

  apply(shake) {
    const c = this.camera;
    c.position.copy(this.pos);
    if (shake > 0.001) {
      const t = this.time;
      c.position.x += (Math.sin(t * 47.3) + Math.sin(t * 23.1)) * 0.5 * shake;
      c.position.y += (Math.sin(t * 53.7) + Math.sin(t * 31.9)) * 0.5 * shake;
      c.position.z += (Math.sin(t * 41.9) + Math.sin(t * 19.3)) * 0.5 * shake;
    }
    c.up.set(0, 1, 0);
    c.lookAt(this.look);
    if (this.roll) c.rotateZ(this.roll);
    const f = (this.baseFov || 68) + this.fovK * 10;
    if (Math.abs(c.fov - f) > 0.05) { c.fov = f; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
  }
}
