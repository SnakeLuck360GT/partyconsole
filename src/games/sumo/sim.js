// Sumo Smash simulation: custom 2.5D circle physics (x/z plane + a vertical hop/fall axis).
// Pure game logic — no three.js. The screen renders fighter state and reacts to emitted events.

export const BODY_R = 0.55;
const GRAVITY = 30;
const FALL_KILL_Y = -13;
const DASH_TIME = 0.2;
const CHARGE_TIME = 1.0;
const KO_CREDIT_WINDOW = 5;
const POWER_TIME = { mega: 6, feather: 6, spikes: 7 };

export const ARENA_RULES = {
  dohyo: { name: 'Clay Dohyo', accel: 34, friction: 18, kbFriction: 8.5, kbMul: 1, rest: 0.45 },
  ice: { name: 'Icy Disc', accel: 8, friction: 1.1, kbFriction: 2.4, kbMul: 0.85, rest: 0.75 },
  crumble: { name: 'Crumbling Ruins', accel: 34, friction: 18, kbFriction: 8.5, kbMul: 1, rest: 0.45 },
  spinner: { name: 'Spin Cycle', accel: 32, friction: 16, kbFriction: 8, kbMul: 1, rest: 0.5 },
  mushroom: { name: 'Bouncy Mushroom', accel: 30, friction: 14, kbFriction: 7, kbMul: 1.2, rest: 1.25 },
};
export const ARENA_ORDER = ['dohyo', 'ice', 'crumble', 'spinner', 'mushroom'];

/** Arena radius scales with player count: 2 players feel tight, 20+ still fit. */
export function arenaRadius(n) {
  return 5 + 1.2 * Math.sqrt(Math.max(2, n));
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makeFighter(id, { isBot = false } = {}) {
  return {
    id, isBot,
    x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0,
    face: 0, // radians, 0 = +z (towards camera)
    radius: BODY_R, mass: 1, scale: 1,
    damage: 0,
    state: 'idle', // idle (not in round) | alive | falling | out | respawning
    airborne: false,
    dashT: 0, dashCd: 0, dashDir: [0, 1], dashHit: new Set(),
    charging: false, charge: 0, slamCharge: 0, slamCd: 0,
    stun: 0, invuln: 0,
    power: null, powerT: 0,
    lastHitter: null, lastHitAt: -99,
    respawnT: 0, armCd: 0, hitFlash: 0,
    speed: 0, // for animation
    active: true, // false = disconnected (idles, no input)
    ai: { t: 0, dashWait: rand(0.2, 0.6), chargeFor: 0, target: null },
    stats: { kos: 0, falls: 0 },
  };
}

export function createSim({ emit }) {
  const sim = {
    fighters: new Map(),
    arena: null, // { type, R, Reff, rules, t, ... }
    time: 0,
    powerups: [],
    hazards: [],
    running: false,
    mode: 'rounds', // rounds | points
    suddenDeath: false,
  };
  let puId = 0;
  let hzId = 0;

  // ---------------------------------------------------------------- arena

  sim.setupArena = function setupArena(type, nPlayers) {
    const R = arenaRadius(nPlayers);
    const rules = ARENA_RULES[type];
    const a = { type, R, Reff: R, rules, t: 0, rot: 0, armAngle: 0, spin: 0, armSpeed: 0, tiles: null, nextDrop: 7, hub: 0 };
    if (type === 'spinner') {
      a.spin = 0.32;
      a.armSpeed = -1.05 - Math.min(0.5, nPlayers * 0.02);
      a.hub = 1.0;
    }
    if (type === 'crumble') a.tiles = buildTiles(R);
    sim.arena = a;
    sim.powerups.length = 0;
    sim.hazards.length = 0;
    sim.suddenDeath = false;
    sim.nextPowerup = rand(5, 8);
    sim.nextHazard = 16;
    return a;
  };

  function buildTiles(R) {
    const w = 1.45;
    const coreR = 1.8;
    const rings = [];
    let outer = R;
    let idx = 0;
    // Rings run from the rim inward and the innermost ring must reach the solid core exactly;
    // otherwise an invisible floorless gap is left where players spawn (r ≈ 2.2) and everyone drops instantly.
    while (outer > coreR + 0.01) {
      let inner = outer - w;
      if (inner - coreR < w * 0.6) inner = coreR; // last ring absorbs the remainder
      const mid = (inner + outer) / 2;
      const n = Math.max(6, Math.round((2 * Math.PI * mid) / 1.7));
      const tiles = [];
      for (let s = 0; s < n; s++) tiles.push({ ring: idx, seg: s, n, inner, outer, a0: (s / n) * Math.PI * 2, a1: ((s + 1) / n) * Math.PI * 2, state: 'solid', t: 0, regrow: 0 });
      rings.push({ inner, outer, n, tiles });
      outer = inner;
      idx++;
    }
    return { rings, coreR };
  }

  /** Tile under (x,z) for the crumble arena: null = core (always solid), false = none. */
  sim.tileAt = function tileAt(x, z) {
    const t = sim.arena.tiles;
    const r = Math.hypot(x, z);
    if (r < t.coreR) return null;
    for (const ring of t.rings) {
      if (r >= ring.inner && r < ring.outer) {
        let ang = Math.atan2(z, x);
        if (ang < 0) ang += Math.PI * 2;
        return ring.tiles[Math.floor((ang / (Math.PI * 2)) * ring.n) % ring.n];
      }
    }
    return false;
  };

  /** Is there floor under this point? */
  sim.solidAt = function solidAt(x, z) {
    const a = sim.arena;
    const r = Math.hypot(x, z);
    if (r > a.Reff) return false;
    if (a.type === 'crumble') {
      const tile = sim.tileAt(x, z);
      if (tile === false) return false;
      if (tile && (tile.state === 'falling' || tile.state === 'gone')) return false;
    }
    return true;
  };

  sim.groundY = function groundY(x, z) {
    const a = sim.arena;
    if (a?.type !== 'mushroom') return 0;
    const q = Math.min(1, (x * x + z * z) / (a.Reff * a.Reff));
    return 0.9 * (1 - q);
  };

  sim.randomFreeSpot = function randomFreeSpot(maxFrac = 0.7) {
    const a = sim.arena;
    let best = [0, 0];
    let bestD = -1;
    for (let k = 0; k < 24; k++) {
      const r = Math.sqrt(Math.random()) * a.Reff * maxFrac;
      const ang = Math.random() * Math.PI * 2;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (!sim.solidAt(x, z)) continue;
      if (a.type === 'spinner' && r < a.hub + 0.8) continue;
      let dmin = 99;
      for (const f of sim.fighters.values()) if (f.state === 'alive' || f.state === 'respawning') dmin = Math.min(dmin, Math.hypot(f.x - x, f.z - z));
      if (dmin > bestD) { bestD = dmin; best = [x, z]; }
      if (dmin > 2.2) break;
    }
    return best;
  };

  // ---------------------------------------------------------------- fighters

  sim.placeForRound = function placeForRound(list) {
    const a = sim.arena;
    const n = list.length;
    const ringR = n <= 1 ? 0 : Math.min(a.R * 0.62, Math.max(2.2, (n * BODY_R * 2.6) / (Math.PI * 2)));
    // big groups: two rings
    const inner = n > 14 ? Math.ceil(n * 0.35) : 0;
    list.forEach((f, i) => {
      resetFighter(f);
      let r = ringR;
      let k = i;
      let cnt = n;
      if (inner) {
        if (i < inner) { r = ringR * 0.5; cnt = inner; } else { k = i - inner; cnt = n - inner; }
      }
      const ang = (k / cnt) * Math.PI * 2 + (inner && i < inner ? 0.3 : 0) + Math.PI / 2;
      f.x = Math.cos(ang) * r;
      f.z = Math.sin(ang) * r;
      if (a.type === 'spinner' && Math.hypot(f.x, f.z) < a.hub + 0.7) { f.x = 0; f.z = a.hub + 1; }
      f.face = Math.atan2(-f.x, -f.z);
      f.state = 'alive';
    });
  };

  function resetFighter(f) {
    Object.assign(f, {
      vx: 0, vz: 0, vy: 0, y: 0, damage: 0, airborne: false, dashT: 0, dashCd: 0, charging: false, charge: 0, slamCd: 0,
      stun: 0, invuln: 0, power: null, powerT: 0, lastHitter: null, lastHitAt: -99, respawnT: 0, mass: 1, radius: BODY_R, scale: 1, hitFlash: 0,
    });
    f.dashHit.clear();
  }
  sim.resetFighter = resetFighter;

  sim.spawnFromSky = function spawnFromSky(f) {
    resetFighter(f);
    const [x, z] = sim.randomFreeSpot(0.55);
    f.x = x; f.z = z; f.y = 14; f.vy = -4;
    f.airborne = true;
    f.state = 'alive';
    f.invuln = 2.2;
    f.face = Math.atan2(-x, -z);
    emit('spawn', { f });
  };

  function setPower(f, kind) {
    f.power = kind;
    f.powerT = POWER_TIME[kind];
    f.mass = kind === 'mega' ? 3 : 1;
    f.radius = kind === 'mega' ? BODY_R * 1.6 : BODY_R;
    emit('pickup', { f, kind });
  }
  function clearPower(f) {
    const kind = f.power;
    f.power = null;
    f.mass = 1;
    f.radius = BODY_R;
    emit('powerEnd', { f, kind });
  }

  function registerHit(target, attacker) {
    if (!attacker) return;
    target.lastHitter = attacker;
    target.lastHitAt = sim.time;
  }

  function knock(f, dx, dz, kb, dmg, byId, meta = {}) {
    if (f.invuln > 0 || f.state !== 'alive') return false;
    const len = Math.hypot(dx, dz) || 1;
    const massK = 1 / Math.sqrt(f.mass);
    const k = kb * massK * sim.arena.rules.kbMul;
    f.vx = (dx / len) * k;
    f.vz = (dz / len) * k;
    f.stun = 0.12 + k * 0.028;
    f.damage = Math.min(999, f.damage + dmg);
    f.charging = false;
    f.charge = 0;
    f.dashT = 0;
    f.slamming = false;
    f.hitFlash = 0.25;
    if (!f.airborne && k > 9) { f.vy = Math.min(6, k * 0.25); f.airborne = true; }
    registerHit(f, byId);
    emit('hurt', { f, kb: k, by: byId, ...meta });
    return k;
  }
  sim.knock = knock;

  // ---------------------------------------------------------------- step

  sim.step = function step(dt, getInput) {
    const a = sim.arena;
    sim.time += dt;
    a.t += dt;
    a.rot += a.spin * dt;
    a.armAngle += a.armSpeed * dt;

    const list = [...sim.fighters.values()];
    const alive = list.filter((f) => f.state === 'alive');

    // --- per-fighter control + integration
    for (const f of list) {
      if (f.state === 'respawning') {
        f.respawnT -= dt;
        if (f.respawnT <= 0) sim.spawnFromSky(f);
        continue;
      }
      if (f.state === 'falling') {
        f.vy -= GRAVITY * dt;
        f.y += f.vy * dt;
        f.x += f.vx * dt;
        f.z += f.vz * dt;
        f.vx *= 0.99; f.vz *= 0.99;
        if (f.y < FALL_KILL_Y) {
          f.state = 'out';
          emit('splash', { f });
          const credit = f.lastHitter && sim.time - f.lastHitAt < KO_CREDIT_WINDOW ? f.lastHitter : null;
          emit('ko', { victim: f, killer: credit });
        }
        continue;
      }
      if (f.state !== 'alive') continue;

      const inp = f.active ? getInput(f) : { x: 0, y: 0, dash: false, slam: false };
      f.dashCd -= dt; f.slamCd -= dt; f.stun -= dt; f.invuln -= dt; f.armCd -= dt; f.hitFlash -= dt;
      if (f.power) { f.powerT -= dt; if (f.powerT <= 0) clearPower(f); }
      const targetScale = f.power === 'mega' ? 1.6 : 1;
      f.scale += (targetScale - f.scale) * Math.min(1, dt * 8);

      let ix = inp.x;
      let iz = inp.y;
      const mag = Math.hypot(ix, iz);
      if (mag > 1) { ix /= mag; iz /= mag; }
      if (mag > 0.2 && f.stun <= 0) f.face = lerpAngle(f.face, Math.atan2(ix, iz), Math.min(1, dt * 14));

      // slam charge
      if (!f.airborne && f.stun <= 0 && f.slamCd <= 0) {
        if (inp.slam && !f.charging && f.dashT <= 0) { f.charging = true; f.charge = 0; emit('chargeStart', { f }); }
        if (f.charging) {
          f.charge = Math.min(1, f.charge + dt / CHARGE_TIME);
          if (!inp.slam) {
            f.charging = false;
            f.slamCharge = f.charge;
            f.vy = 7.5 + f.charge * 2.5;
            f.airborne = true;
            f.slamming = true;
            emit('hop', { f });
          }
        }
      } else if (f.charging && (f.stun > 0 || f.airborne)) { f.charging = false; f.charge = 0; }

      // dash
      if (inp.dash && f.dashCd <= 0 && f.stun <= 0 && !f.charging) {
        const dmag = Math.hypot(inp.x, inp.y);
        f.dashDir = dmag > 0.3 ? [inp.x / dmag, inp.y / dmag] : [Math.sin(f.face), Math.cos(f.face)];
        f.face = Math.atan2(f.dashDir[0], f.dashDir[1]);
        f.dashT = DASH_TIME;
        f.dashCd = f.power === 'feather' ? 0.35 : 0.8;
        f.dashHit.clear();
        const sp = f.power === 'feather' ? 23 : 15;
        f.vx = f.dashDir[0] * sp;
        f.vz = f.dashDir[1] * sp;
        emit('dash', { f });
      }

      // movement
      const rules = a.rules;
      const onIce = a.type === 'ice';
      if (f.dashT > 0) {
        f.dashT -= dt;
        if (f.dashT <= 0) {
          const s = Math.hypot(f.vx, f.vz);
          const cap = onIce ? 9 : 6;
          if (s > cap) { f.vx *= cap / s; f.vz *= cap / s; }
        }
      } else {
        const maxSp = (f.charging ? 2.4 : 6.2) * (f.power === 'mega' ? 0.85 : 1);
        const ctrl = f.stun > 0 ? 0.12 : f.airborne ? 0.5 : 1;
        const tvx = ix * maxSp;
        const tvz = iz * maxSp;
        if (f.stun > 0) {
          // launched: glide with low friction, slight steering (DI)
          const s = Math.hypot(f.vx, f.vz);
          const ns = Math.max(0, s - rules.kbFriction * dt);
          if (s > 0) { f.vx *= ns / s; f.vz *= ns / s; }
          f.vx += ix * rules.accel * ctrl * dt;
          f.vz += iz * rules.accel * ctrl * dt;
        } else if (mag > 0.05) {
          const acc = rules.accel * ctrl * dt;
          f.vx = approach(f.vx, tvx, acc);
          f.vz = approach(f.vz, tvz, acc);
          const s = Math.hypot(f.vx, f.vz);
          if (s > maxSp && !onIce) { const ns = Math.max(maxSp, s - rules.kbFriction * dt); f.vx *= ns / s; f.vz *= ns / s; }
          if (onIce && s > maxSp * 1.6) { f.vx *= (maxSp * 1.6) / s; f.vz *= (maxSp * 1.6) / s; }
        } else {
          const s = Math.hypot(f.vx, f.vz);
          const fr = (s > 7 ? rules.kbFriction : rules.friction) * (f.airborne ? 0.3 : 1);
          const ns = Math.max(0, s - fr * dt);
          if (s > 0) { f.vx *= ns / s; f.vz *= ns / s; }
        }
      }
      // mushroom dome pushes outward gently
      if (a.type === 'mushroom' && !f.airborne) {
        const r = Math.hypot(f.x, f.z) || 1;
        const push = 2.2 * (r / a.Reff);
        f.vx += (f.x / r) * push * dt;
        f.vz += (f.z / r) * push * dt;
      }

      f.x += f.vx * dt;
      f.z += f.vz * dt;

      // rotating platform carries grounded fighters
      if (a.spin && !f.airborne) {
        const c = Math.cos(a.spin * dt);
        const s = Math.sin(a.spin * dt);
        const nx = f.x * c - f.z * s;
        const nz = f.x * s + f.z * c;
        f.x = nx; f.z = nz;
      }

      // vertical
      const gy = sim.groundY(f.x, f.z);
      if (f.airborne) {
        f.vy -= GRAVITY * dt;
        f.y += f.vy * dt;
        if (f.y <= gy && f.vy < 0) {
          if (sim.solidAt(f.x, f.z)) {
            f.y = gy;
            f.airborne = false;
            const wasSlam = f.slamming;
            f.slamming = false;
            emit('land', { f, vy: f.vy });
            f.vy = 0;
            if (wasSlam) doSlam(f, alive);
            else if (a.type === 'mushroom' && f.stun > 0) { f.vy = 4; f.airborne = true; }
          } else if (f.y < gy - 0.3) startFall(f);
        }
      } else {
        f.y = gy;
        if (!sim.solidAt(f.x, f.z)) {
          f.airborne = true;
          f.vy = 0;
          f.y = gy;
        }
      }
      f.speed = Math.hypot(f.vx, f.vz);
    }

    // --- dash hits + body collisions
    for (let i = 0; i < alive.length; i++) {
      const p = alive[i];
      if (p.state !== 'alive') continue;
      for (let j = i + 1; j < alive.length; j++) {
        const q = alive[j];
        if (q.state !== 'alive') continue;
        if (Math.abs(p.y - q.y) > 1.1) continue;
        let dx = q.x - p.x;
        let dz = q.z - p.z;
        const minD = p.radius + q.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD) continue;
        const d = Math.sqrt(d2) || 0.001;
        dx /= d; dz /= d;
        // dash strikes
        const pd = p.dashT > 0 && !p.dashHit.has(q.id);
        const qd = q.dashT > 0 && !q.dashHit.has(p.id);
        if (pd && (!qd || p.speed >= q.speed)) { dashStrike(p, q, dx, dz); continue; }
        if (qd) { dashStrike(q, p, -dx, -dz); continue; }
        // separate
        const overlap = minD - d;
        const im1 = 1 / p.mass;
        const im2 = 1 / q.mass;
        const tot = im1 + im2;
        p.x -= dx * overlap * (im1 / tot);
        p.z -= dz * overlap * (im1 / tot);
        q.x += dx * overlap * (im2 / tot);
        q.z += dz * overlap * (im2 / tot);
        // impulse
        const rv = (q.vx - p.vx) * dx + (q.vz - p.vz) * dz;
        if (rv < 0) {
          const e = a.rules.rest;
          const jimp = (-(1 + e) * rv) / tot;
          p.vx -= jimp * dx * im1; p.vz -= jimp * dz * im1;
          q.vx += jimp * dx * im2; q.vz += jimp * dz * im2;
          const hard = -rv;
          if (hard > 5) {
            // body-check: whoever was faster gets credit, the other gets a bit of stun
            const fast = p.speed > q.speed ? p : q;
            const slow = fast === p ? q : p;
            slow.stun = Math.max(slow.stun, 0.15 + hard * 0.02);
            registerHit(slow, fast.id);
            if (fast.stun > 0 && fast.lastHitter && fast.lastHitter !== slow.id) registerHit(slow, fast.lastHitter);
            slow.damage += Math.round(hard * 0.35);
            emit('bump', { p, q, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2, y: Math.max(p.y, q.y), hard, spikes: slow.power === 'spikes' || fast.power === 'spikes' });
            // spikes hurt on contact
            for (const [s, o] of [[p, q], [q, p]]) if (s.power === 'spikes' && o.power !== 'spikes' && o.invuln <= 0) knock(o, o.x - s.x, o.z - s.z, 8 + o.damage * 0.06, 6, s.id, { spikes: true });
          }
        }
      }
    }

    // --- spinner arm + hub
    if (a.type === 'spinner') {
      const ca = Math.cos(a.armAngle);
      const sa = Math.sin(a.armAngle);
      const len = a.Reff + 0.4;
      for (const f of alive) {
        if (f.state !== 'alive') continue;
        const r = Math.hypot(f.x, f.z);
        // hub
        if (r < a.hub + f.radius && f.y < 1.5) {
          const nx = f.x / (r || 1);
          const nz = f.z / (r || 1);
          f.x = nx * (a.hub + f.radius);
          f.z = nz * (a.hub + f.radius);
          const vn = f.vx * nx + f.vz * nz;
          if (vn < 0) { f.vx -= vn * nx * 1.5; f.vz -= vn * nz * 1.5; }
        }
        if (f.y > 0.45 || f.armCd > 0) continue;
        // distance to the arm segment
        const along = f.x * ca + f.z * sa;
        if (along < a.hub - 0.2 || along > len) continue;
        const perp = -f.x * sa + f.z * ca; // signed
        if (Math.abs(perp) < f.radius + 0.28) {
          const dir = Math.sign(a.armSpeed) || 1;
          // push in the direction of travel (+perp side if moving +)
          const tx = -sa * dir;
          const tz = ca * dir;
          const tang = Math.abs(a.armSpeed) * Math.max(1, along);
          const k = knock(f, tx + (f.x / (r || 1)) * 0.35, tz + (f.z / (r || 1)) * 0.35, 5 + tang * 0.55 + f.damage * 0.05, 6, 'arena', { arm: true });
          if (k) { f.armCd = 0.7; f.x += tx * 0.3; f.z += tz * 0.3; emit('armHit', { f, x: f.x, z: f.z }); }
        }
      }
    }

    // --- edge check: fall when centre leaves solid ground (grounded only)
    for (const f of alive) {
      if (f.state !== 'alive' || f.airborne) continue;
      if (!sim.solidAt(f.x, f.z)) startFall(f);
    }
    for (const f of alive) {
      if (f.state === 'alive' && f.airborne && f.y < sim.groundY(f.x, f.z) - 0.3 && !sim.solidAt(f.x, f.z)) startFall(f);
    }

    // --- power-ups
    stepPowerups(dt, alive);
    // --- hazards
    stepHazards(dt, alive);
    // --- crumble tiles
    if (a.tiles) stepTiles(dt);
    // --- sudden death shrink
    if (sim.suddenDeath && a.type !== 'crumble') a.Reff = Math.max(1.6, a.Reff - dt * 0.22);
  };

  function dashStrike(att, tgt, dx, dz) {
    att.dashHit.add(tgt.id);
    const spikes = tgt.power === 'spikes' && att.power !== 'spikes';
    if (spikes) {
      // ouch: attacker bounces off the spikes
      knock(att, -dx, -dz, 9 + att.damage * 0.1, 12, tgt.id, { spikes: true });
      emit('hit', { att: tgt, tgt: att, x: (att.x + tgt.x) / 2, z: (att.z + tgt.z) / 2, y: att.y, kb: 12, spikes: true });
      return;
    }
    if (tgt.invuln > 0) return;
    const ddx = att.dashDir[0] * 0.55 + dx * 0.45;
    const ddz = att.dashDir[1] * 0.55 + dz * 0.45;
    const feather = att.power === 'feather' ? 1.3 : 1;
    const mega = att.power === 'mega' ? 1.35 : 1;
    const kb = (7 + tgt.damage * 0.105) * feather * mega * Math.sqrt(att.mass);
    const dmg = 9 + Math.round(Math.random() * 3) + (att.power === 'spikes' ? 6 : 0) + (att.power === 'mega' ? 4 : 0);
    const k = knock(tgt, ddx, ddz, kb, dmg, att.id, { dash: true });
    // recoil: attacker stops dead
    att.vx *= 0.15; att.vz *= 0.15;
    att.dashT = 0;
    emit('hit', { att, tgt, x: (att.x + tgt.x) / 2, z: (att.z + tgt.z) / 2, y: tgt.y, kb: k || 0, spikes: false });
  }

  function doSlam(f, alive) {
    const c = f.slamCharge;
    const radius = (2.0 + 2.4 * c) * (f.power === 'mega' ? 1.5 : 1) * (sim.arena.type === 'mushroom' ? 1.15 : 1);
    f.slamCd = 0.9;
    let hits = 0;
    for (const o of alive) {
      if (o === f || o.state !== 'alive' || o.airborne) continue;
      const dx = o.x - f.x;
      const dz = o.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d > radius + o.radius) continue;
      const fall = 1 - Math.min(1, d / (radius + o.radius)) * 0.55;
      const kb = (5 + 8.5 * c + o.damage * (0.045 + 0.06 * c)) * fall * (f.power === 'mega' ? 1.4 : 1);
      if (o.power === 'spikes' && f.power !== 'spikes') continue;
      if (knock(o, d > 0.01 ? dx : 1, d > 0.01 ? dz : 0, kb, Math.round(4 + 9 * c), f.id, { slam: true })) hits++;
    }
    emit('slam', { f, x: f.x, z: f.z, radius, charge: c, hits });
    if (sim.arena.type === 'mushroom') { f.vy = 3.5; f.airborne = true; }
  }

  function startFall(f) {
    if (f.state !== 'alive') return;
    f.state = 'falling';
    f.charging = false;
    f.airborne = true;
    if (f.vy > 0) f.vy = 0;
    // guarantee visible drift away from the arena
    const r = Math.hypot(f.x, f.z) || 1;
    const out = f.vx * (f.x / r) + f.vz * (f.z / r);
    if (out < 2) { f.vx += (f.x / r) * (2 - out); f.vz += (f.z / r) * (2 - out); }
    f.stats.falls++;
    emit('fall', { f });
  }

  function stepPowerups(dt, alive) {
    const a = sim.arena;
    sim.nextPowerup -= dt;
    const maxCount = 1 + Math.floor(sim.fighters.size / 6);
    if (sim.nextPowerup <= 0 && sim.running) {
      sim.nextPowerup = rand(8, 13);
      if (sim.powerups.length < maxCount) {
        const [x, z] = sim.randomFreeSpot(0.65);
        const kinds = ['mega', 'feather', 'spikes'];
        const pu = { id: ++puId, kind: kinds[Math.floor(Math.random() * 3)], x, z, t: 0, life: 13 };
        sim.powerups.push(pu);
        emit('powerupSpawn', { pu });
      }
    }
    for (let i = sim.powerups.length - 1; i >= 0; i--) {
      const pu = sim.powerups[i];
      pu.t += dt;
      if (a.spin) { const c = Math.cos(a.spin * dt); const s = Math.sin(a.spin * dt); const nx = pu.x * c - pu.z * s; pu.z = pu.x * s + pu.z * c; pu.x = nx; }
      let taken = null;
      if (pu.t > 0.6) {
        for (const f of alive) {
          if (f.state !== 'alive' || f.y > 1.2) continue;
          if (Math.hypot(f.x - pu.x, f.z - pu.z) < f.radius + 0.55) { taken = f; break; }
        }
      }
      const gone = !taken && (pu.t > pu.life || !sim.solidAt(pu.x, pu.z));
      if (taken || gone) {
        sim.powerups.splice(i, 1);
        emit('powerupGone', { pu, by: taken });
        if (taken) setPower(taken, pu.kind);
      }
    }
  }

  function stepHazards(dt, alive) {
    const a = sim.arena;
    if (sim.running && a.t > sim.nextHazard) {
      const n = 1 + Math.floor(sim.fighters.size / 7) + (sim.suddenDeath ? 1 : 0);
      for (let k = 0; k < n; k++) {
        // target a random living fighter's area, or a random spot
        const pool = alive.filter((f) => f.state === 'alive');
        let x;
        let z;
        if (pool.length && Math.random() < 0.6) {
          const f = pool[Math.floor(Math.random() * pool.length)];
          x = f.x + rand(-1.2, 1.2) + f.vx * 0.6;
          z = f.z + rand(-1.2, 1.2) + f.vz * 0.6;
        } else {
          [x, z] = sim.randomFreeSpot(0.9);
        }
        const r = Math.hypot(x, z);
        if (r > a.Reff * 0.9) { x *= (a.Reff * 0.9) / r; z *= (a.Reff * 0.9) / r; }
        const hz = { id: ++hzId, x, z, t: 0, warn: 1.5, radius: 1.7 };
        sim.hazards.push(hz);
        emit('hazardWarn', { hz });
      }
      sim.nextHazard = a.t + rand(4.5, 7.5) * (sim.suddenDeath ? 0.6 : 1);
    }
    for (let i = sim.hazards.length - 1; i >= 0; i--) {
      const hz = sim.hazards[i];
      hz.t += dt;
      if (hz.t >= hz.warn) {
        sim.hazards.splice(i, 1);
        for (const f of alive) {
          if (f.state !== 'alive' || f.y > 1.5) continue;
          const dx = f.x - hz.x;
          const dz = f.z - hz.z;
          const d = Math.hypot(dx, dz);
          if (d < hz.radius + f.radius) knock(f, d > 0.05 ? dx : 1, d > 0.05 ? dz : 0, 9 + f.damage * 0.08, 12, 'arena', { hazard: true });
        }
        emit('hazardImpact', { hz });
      }
    }
  }

  function stepTiles(dt) {
    const a = sim.arena;
    const t = a.tiles;
    const interval = sim.suddenDeath ? 0.7 : Math.max(1.1, 2.6 - sim.fighters.size * 0.05);
    if (sim.running && a.t > a.nextDrop) {
      a.nextDrop = a.t + interval;
      // outermost ring that still has solid tiles
      for (let ri = 0; ri < t.rings.length; ri++) {
        let ring = t.rings[ri];
        let solid = ring.tiles.filter((x) => x.state === 'solid');
        if (!solid.length) continue;
        if (Math.random() < 0.25 && t.rings[ri + 1]) {
          const next = t.rings[ri + 1].tiles.filter((x) => x.state === 'solid');
          if (next.length) { ring = t.rings[ri + 1]; solid = next; }
        }
        const count = Math.min(solid.length, 1 + (sim.fighters.size > 8 ? 1 : 0));
        for (let k = 0; k < count; k++) {
          const tile = solid.splice(Math.floor(Math.random() * solid.length), 1)[0];
          tile.state = 'shaking';
          tile.t = 0;
          emit('tileShake', { tile });
        }
        break;
      }
    }
    for (const ring of t.rings) {
      for (const tile of ring.tiles) {
        if (tile.state === 'shaking') {
          tile.t += dt;
          if (tile.t > 1.3) { tile.state = 'falling'; tile.t = 0; emit('tileFall', { tile }); }
        } else if (tile.state === 'falling') {
          tile.t += dt;
          if (tile.t > 2) { tile.state = 'gone'; tile.regrow = sim.mode === 'points' ? 7 : 0; }
        } else if (tile.state === 'gone' && tile.regrow > 0) {
          tile.regrow -= dt;
          if (tile.regrow <= 0) { tile.state = 'solid'; emit('tileRegrow', { tile }); }
        }
      }
    }
  }

  // ---------------------------------------------------------------- bots

  sim.botInput = function botInput(f) {
    const a = sim.arena;
    const ai = f.ai;
    const out = { x: 0, y: 0, dash: false, slam: ai.holdSlam > 0 };
    const r = Math.hypot(f.x, f.z);
    // pick target
    let best = null;
    let bd = 1e9;
    let near = 0;
    for (const o of sim.fighters.values()) {
      if (o === f || o.state !== 'alive') continue;
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (d < 2.6) near++;
      const score = d - (o.x * o.x + o.z * o.z > (a.Reff * 0.7) ** 2 ? 2 : 0);
      if (score < bd) { bd = score; best = o; }
    }
    let tx = 0;
    let tz = 0;
    if (best) { tx = best.x - f.x; tz = best.z - f.z; }
    // power-ups are tempting
    const pu = sim.powerups[0];
    if (pu && Math.hypot(pu.x - f.x, pu.z - f.z) < 4) { tx = pu.x - f.x; tz = pu.z - f.z; }
    // stay away from the edge / holes
    const lookX = f.x + f.vx * 0.35;
    const lookZ = f.z + f.vz * 0.35;
    const danger = !sim.solidAt(lookX, lookZ) || r > a.Reff * 0.78;
    if (danger) { tx = -f.x * 3; tz = -f.z * 3; }
    // avoid hazard warnings
    for (const hz of sim.hazards) {
      const d = Math.hypot(f.x - hz.x, f.z - hz.z);
      if (d < hz.radius + 1) { tx += (f.x - hz.x) * 4; tz += (f.z - hz.z) * 4; }
    }
    const m = Math.hypot(tx, tz) || 1;
    const jitter = Math.sin(sim.time * 1.7 + f.x) * 0.25;
    out.x = tx / m + jitter;
    out.y = tz / m - jitter;
    ai.t -= 1 / 60;
    if (ai.holdSlam > 0) {
      ai.holdSlam -= 1 / 60;
      out.slam = ai.holdSlam > 0;
    } else if (!danger && best && bd < 2.4 && f.dashCd <= 0) {
      ai.dashWait -= 1 / 60;
      if (ai.dashWait <= 0) { out.dash = true; ai.dashWait = rand(0.25, 0.9); }
    } else if (!danger && near >= 2 && f.slamCd <= 0 && Math.random() < 0.02) {
      ai.holdSlam = rand(0.3, 0.9);
      out.slam = true;
    }
    // hop over the sweeper
    if (a.type === 'spinner' && !f.airborne && f.slamCd <= 0) {
      const armX = Math.cos(a.armAngle);
      const armZ = Math.sin(a.armAngle);
      const along = f.x * armX + f.z * armZ;
      const perp = -f.x * armZ + f.z * armX;
      const dir = Math.sign(a.armSpeed);
      if (along > 0 && perp * dir > 0 && perp * dir < 1.6 && Math.random() < 0.6) { ai.holdSlam = 0.05; out.slam = true; }
    }
    return out;
  };

  return sim;
}

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export { clamp, rand };
