// CPU racer brain: follows the racing line with personal variance, drifts through tight corners for
// mini-turbos, dodges peels, and uses items sensibly. Writes into kart.input like a phone would.
import { clamp, angleDiff } from './util.js';
import { HOLDABLE } from './items.js';

export class CpuDriver {
  constructor(kart, track, { level = 2, seed = Math.random() } = {}) {
    this.k = kart;
    this.t = track;
    this.level = level; // 1..3 (50/100/150cc)
    this.phase = seed * 100;
    this.bias = (seed - 0.5) * 2 * 2.6; // preferred lateral offset from the racing line
    this.itemDelay = 0;
    this.holdT = 0;
    this.releaseAim = 0;
    this.driftHold = 0;
    this.dodge = 0;
    this.err = 0;
    this.time = 0;
  }

  /** world: { karts, ranking, items, raceTime } */
  update(dt, world) {
    const k = this.k;
    const t = this.t;
    const inp = k.input;
    this.time += dt;
    // lateral target: racing line + personal bias + slow wander + dodge
    const wander = Math.sin(this.time * 0.37 + this.phase) * 1.4 + Math.sin(this.time * 0.11 + this.phase * 2) * 1.1;
    const look = 7 + Math.max(0, k.speed) * 0.42;
    let lat = t.lineAt(k.s + look) + this.bias + wander + this.dodge;
    this.dodge *= Math.exp(-dt * 1.5);
    // dodge peels ahead
    for (const h of world.items.hazards) {
      const ds = t.deltaS(t.nearestSFast(h.x, h.z, k.idx), k.s);
      if (ds > 4 && ds < 28) {
        const hl = (h.x - t.px[k.idx]) * t.rx[k.idx] + (h.z - t.pz[k.idx]) * t.rz[k.idx];
        if (Math.abs(hl - lat) < 2.6) this.dodge += (lat >= hl ? 1 : -1) * 6 * dt * (this.level >= 2 ? 1 : 0.5);
      }
    }
    lat = clamp(lat, -t.halfWidth + 1.4, t.halfWidth - 1.4);
    const p = t.pointAt(k.s + look, lat);
    const want = Math.atan2(p.x - k.x, p.z - k.z);
    const err = angleDiff(want, k.heading);
    let steer = clamp(-err * 2.6, -1, 1);
    if (k.wrongWay) steer = Math.sign(-err) || 1;

    // drifting through tight corners
    const cAhead = t.curvAhead(k.s + 6, 26);
    const tight = Math.abs(cAhead) > 1 / 48;
    if (this.driftHold <= 0 && tight && k.speed > 15 && k.grounded && k.drift === 0 && Math.abs(steer) > 0.3 && Math.random() < dt * 6) {
      this.driftHold = 0.6 + Math.random() * 0.4;
    }
    let drift = false;
    if (this.driftHold > 0) {
      drift = true;
      this.driftHold -= dt;
      const still = Math.abs(t.curvAhead(k.s + 2, 14)) > 1 / 75;
      const maxLvl = this.level;
      if (k.drift !== 0 && still && k.driftLevel < maxLvl) this.driftHold = Math.max(this.driftHold, 0.15);
      if (k.drift !== 0 && (!still || k.driftLevel >= maxLvl)) this.driftHold = Math.min(this.driftHold, 0.05);
      if (k.drift !== 0) {
        // hold the drift direction, modulate tightness with the steering error
        steer = clamp(k.drift * 0.25 + -err * 2.2, -1, 1);
      }
    }
    if (k.rampAir && !k.trickDone && Math.random() < dt * 8) drift = !k.prev.drift; // ramp trick

    inp.steer = steer;
    inp.gas = true;
    inp.brake = false;
    inp.drift = drift;
    this.items(dt, world);
  }

  items(dt, world) {
    const k = this.k;
    const inp = k.input;
    inp.item = false;
    inp.aim = 0;
    if (k.rolling > 0 || (!k.item && !k.held)) { this.itemDelay = 0.6 + Math.random() * 2.2; return; }
    if (this.itemDelay > 0) { this.itemDelay -= dt; return; }
    const { ranking } = world;
    const me = ranking.indexOf(k);
    const ahead = me > 0 ? ranking[me - 1] : null;
    const behind = me < ranking.length - 1 ? ranking[me + 1] : null;
    const gapA = ahead ? ahead.dist - k.dist : Infinity;
    const gapB = behind ? k.dist - behind.dist : Infinity;
    if (k.held) {
      // shield behind: release at a good moment
      this.holdT += dt;
      let release = false;
      if (k.held === 'peel') {
        if (gapB < 14 || this.holdT > 9) { release = true; this.releaseAim = 0; }
      } else if (k.held === 'homing') {
        if (ahead && gapA < 120) { release = true; this.releaseAim = 0; }
        else if (gapB < 10) { release = true; this.releaseAim = 1; }
      } else if (k.held === 'bouncer') {
        const aligned = ahead && gapA < 32 && Math.abs(ahead.lat - k.lat) < 3;
        if (aligned) { release = true; this.releaseAim = 0; }
        else if (gapB < 9) { release = true; this.releaseAim = 1; }
        else if (this.holdT > 10) { release = true; this.releaseAim = 0; }
      }
      inp.item = !release; // keep holding until release
      inp.aim = this.releaseAim;
      if (release) this.holdT = 0;
      return;
    }
    const it = k.item;
    if (HOLDABLE.has(it)) { inp.item = true; this.holdT = 0; return; } // grab it as a shield first
    if (it === 'pepper' || it === 'pepper3') {
      const straight = Math.abs(this.t.curvAhead(k.s, 40)) < 1 / 90;
      if (straight || k.offroad) { inp.item = true; this.itemDelay = 0.7; }
      return;
    }
    inp.item = true; // star, zap, coins: just use it
    this.itemDelay = 0.5;
  }
}
