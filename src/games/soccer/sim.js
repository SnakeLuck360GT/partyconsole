// Authoritative match simulation: players, ball physics, possession, kicks, passes, tackles, goals.
// Pure logic (no three.js). The screen feeds inputs and renders the state; events go to `onEvent`.
import { T, clamp } from './config.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export function createSim({ pitch, onEvent = () => {} }) {
  const sim = {
    pitch,
    players: [],
    ball: null,
    time: 0,
    frozen: true, // no player control (pre-kickoff / celebrations)
    goalCooldown: false,
    touches: [], // recent touches {p, t}
  };

  function resetBall(x = 0, z = 0) {
    sim.ball = {
      x, y: T.ballRadius, z, vx: 0, vy: 0, vz: 0, spin: 0,
      owner: null, lastTouch: null, lockP: null, lockUntil: 0,
      passTarget: null, power: 0, // power: 0..1 shot strength for the trail
      inGoal: 0, // side (+1/-1) if the ball is inside a goal box
    };
    sim.touches = [];
  }
  resetBall();

  function addPlayer(opts) {
    const p = {
      id: opts.id,
      pid: opts.pid ?? null,
      bot: !!opts.bot,
      role: opts.role || 'field',
      team: opts.team,
      name: opts.name,
      color: opts.color,
      colorHex: opts.colorHex,
      x: opts.x ?? 0, z: opts.z ?? 0, vx: 0, vz: 0,
      face: opts.team === 0 ? 0 : Math.PI,
      stamina: 1, exhausted: false, sprinting: false,
      charging: false, charge: 0,
      slide: 0, slideDir: 0, slideHit: false, tackleCd: 0, stun: 0, stunKind: '',
      kickAnim: 0, passAnim: 0, protect: 0,
      input: { x: 0, z: 0, a: false, aTap: false, b: false },
      prevA: false,
      stats: { goals: 0, assists: 0, tackles: 0, shots: 0, ownGoals: 0 },
      celebrate: 0,
    };
    sim.players.push(p);
    return p;
  }

  function removePlayer(id) {
    const i = sim.players.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const [p] = sim.players.splice(i, 1);
    const b = sim.ball;
    if (b.owner === p) b.owner = null;
    if (b.lastTouch === p) b.lastTouch = null;
    if (b.lockP === p) b.lockP = null;
    if (b.passTarget === p) b.passTarget = null;
    sim.touches = sim.touches.filter((t) => t.p !== p);
    return p;
  }

  function touch(p) {
    const b = sim.ball;
    b.lastTouch = p;
    const last = sim.touches[sim.touches.length - 1];
    if (!last || last.p !== p) sim.touches.push({ p, t: sim.time });
    else last.t = sim.time;
    if (sim.touches.length > 12) sim.touches.shift();
  }

  function setOwner(p) {
    const b = sim.ball;
    if (b.owner === p) return;
    const prev = b.owner;
    b.owner = p;
    b.passTarget = null;
    b.power = 0;
    if (p) {
      p.protect = T.protectTime;
      touch(p);
      onEvent({ type: 'possess', p, prev });
    }
  }

  // ----------------------------------------------------------------- actions

  const facingVec = (p) => [Math.cos(p.face), Math.sin(p.face)];

  function canReachBall(p, reach = 1.5) {
    const b = sim.ball;
    if (b.owner === p) return true;
    if (b.y > 1.7) return false;
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > reach) return false;
    if (d < 0.6) return true;
    const [fx, fz] = facingVec(p);
    return (dx * fx + dz * fz) / d > 0.2;
  }

  function kick(p, charge) {
    p.kickAnim = 0.35;
    if (!canReachBall(p)) return false;
    const b = sim.ball;
    const { HL, GW } = sim.pitch;
    const side = p.team === 0 ? 1 : -1; // attacking direction
    let [dx, dz] = facingVec(p);
    // Aim assist: if roughly facing the opponent goal, pull the shot into the frame (where you face).
    const gx = side * HL;
    const toGoalX = gx - b.x;
    if (Math.sign(toGoalX) === Math.sign(dx) && Math.abs(toGoalX) < HL * 1.25 && Math.abs(dx) > 0.35) {
      const zAt = b.z + (dz / dx) * toGoalX;
      const zTarget = clamp(zAt, -GW * 0.82, GW * 0.82);
      const tx = gx - b.x;
      const tz = zTarget - b.z;
      const tl = Math.hypot(tx, tz);
      const want = Math.atan2(tz, tx);
      const cur = Math.atan2(dz, dx);
      if (Math.abs(angDiff(cur, want)) < 0.75) {
        const k = 0.75;
        const a = cur + angDiff(cur, want) * k;
        dx = Math.cos(a); dz = Math.sin(a);
      }
      void tl;
    }
    // Over-charged shots get a little wild.
    if (charge > 0.85) {
      const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.09 * charge;
      dx = Math.cos(a); dz = Math.sin(a);
    }
    const speed = 11 + 17 * charge;
    const vy = charge < 0.55 ? 0.6 + charge * 2.2 : 1.8 + (charge - 0.55) * 15;
    b.owner = null;
    b.passTarget = null;
    b.x = p.x + Math.cos(p.face) * 0.55;
    b.z = p.z + Math.sin(p.face) * 0.55;
    b.y = Math.max(b.y, T.ballRadius);
    b.vx = dx * speed + p.vx * 0.25;
    b.vz = dz * speed + p.vz * 0.25;
    b.vy = vy;
    // Curve: running across the shot bends it.
    b.spin = clamp((p.vx * -dz + p.vz * dx) * 0.25, -2.5, 2.5);
    b.lockP = p;
    b.lockUntil = sim.time + T.kickLock;
    b.power = charge;
    touch(p);
    p.stats.shots += 1;
    onEvent({ type: 'kick', p, power: charge, x: b.x, z: b.z });
    return true;
  }

  function pickPassTarget(p) {
    let best = null;
    let bestScore = -Infinity;
    for (const q of sim.players) {
      if (q === p || q.team !== p.team || q.stun > 0) continue;
      const px = q.x + q.vx * 0.45;
      const pz = q.z + q.vz * 0.45;
      const dx = px - p.x;
      const dz = pz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) continue;
      const diff = Math.abs(angDiff(p.face, Math.atan2(dz, dx)));
      // How open is the lane? distance from nearest opponent to the pass segment
      let open = 6;
      for (const o of sim.players) {
        if (o.team === p.team) continue;
        const t = clamp(((o.x - p.x) * dx + (o.z - p.z) * dz) / (d * d), 0, 1);
        const od = Math.hypot(o.x - (p.x + dx * t), o.z - (p.z + dz * t));
        open = Math.min(open, od);
      }
      let score = Math.cos(diff) * 3 - Math.abs(d - 11) / 12 + Math.min(open, 3) * 0.35;
      if (diff > 1.25) score -= 4;
      if (q.role === 'keeper') score -= 1.5;
      if (score > bestScore) { bestScore = score; best = q; }
    }
    return best;
  }

  function pass(p) {
    const b = sim.ball;
    p.passAnim = 0.3;
    const q = pickPassTarget(p);
    let dx; let dz; let dist;
    if (q) {
      const lead = 0.5;
      dx = q.x + q.vx * lead - b.x;
      dz = q.z + q.vz * lead - b.z;
      dist = Math.hypot(dx, dz);
      dx /= dist; dz /= dist;
    } else {
      [dx, dz] = facingVec(p);
      dist = 12;
    }
    const lofted = dist > 22;
    const decel = T.groundDecel + T.groundDrag * 6;
    let speed = clamp(Math.sqrt(16 + 2 * decel * dist), 8, 24);
    let vy = 0.4;
    if (lofted) { speed = clamp(dist * 0.75, 14, 24); vy = clamp(dist * 0.22, 4, 8.5); }
    b.owner = null;
    b.x = p.x + Math.cos(p.face) * 0.5;
    b.z = p.z + Math.sin(p.face) * 0.5;
    b.vx = dx * speed;
    b.vz = dz * speed;
    b.vy = vy;
    b.spin = 0;
    b.lockP = p;
    b.lockUntil = sim.time + 0.25;
    b.passTarget = q;
    b.power = 0;
    touch(p);
    // face the pass direction for the animation
    p.face = Math.atan2(dz, dx);
    onEvent({ type: 'pass', p, to: q });
  }

  function startSlide(p) {
    p.slide = T.slideTime;
    p.slideHit = false;
    const m = Math.hypot(p.input.x, p.input.z);
    p.slideDir = m > 0.3 ? Math.atan2(p.input.z, p.input.x) : p.face;
    p.face = p.slideDir;
    p.tackleCd = T.tackleCooldown;
    onEvent({ type: 'slide', p });
  }

  function stun(p, secs, kind) {
    p.stun = Math.max(p.stun, secs);
    p.stunKind = kind;
    p.charging = false;
    p.charge = 0;
    p.slide = 0;
    if (sim.ball.owner === p) sim.ball.owner = null;
  }

  // ----------------------------------------------------------------- per-step update

  function updatePlayer(p, dt) {
    const inp = p.input;
    p.tackleCd = Math.max(0, p.tackleCd - dt);
    p.kickAnim = Math.max(0, p.kickAnim - dt);
    p.passAnim = Math.max(0, p.passAnim - dt);
    p.protect = Math.max(0, p.protect - dt);
    const b = sim.ball;

    if (sim.frozen) {
      p.vx *= Math.max(0, 1 - dt * 8);
      p.vz *= Math.max(0, 1 - dt * 8);
      p.charging = false; p.charge = 0; p.sprinting = false;
      p.prevA = inp.a;
      p.stamina = Math.min(1, p.stamina + dt * 0.5);
      p.x += p.vx * dt; p.z += p.vz * dt;
      return;
    }

    if (p.stun > 0) {
      p.stun -= dt;
      const k = Math.max(0, 1 - dt * 5);
      p.vx *= k; p.vz *= k;
      p.charging = false; p.charge = 0;
      p.prevA = inp.a;
      p.x += p.vx * dt; p.z += p.vz * dt;
      return;
    }

    if (p.slide > 0) {
      p.slide -= dt;
      const s = T.slideSpeed * Math.max(0.25, p.slide / T.slideTime) + 1.5;
      p.vx = Math.cos(p.slideDir) * s;
      p.vz = Math.sin(p.slideDir) * s;
      p.x += p.vx * dt; p.z += p.vz * dt;
      slideContacts(p);
      p.prevA = inp.a;
      if (p.slide <= 0) { p.stun = 0.22; p.stunKind = 'getup'; }
      return;
    }

    // --- buttons
    const hasBall = b.owner === p;
    if (inp.a && !p.prevA) { p.charging = true; p.charge = 0; }
    if (p.charging) {
      p.charge = Math.min(1, p.charge + dt / T.chargeTime);
      if (!inp.a) {
        p.charging = false;
        kick(p, p.charge);
        p.charge = 0;
      }
    } else if (inp.aTap) {
      kick(p, 0.25);
    }
    inp.aTap = false;
    p.prevA = inp.a;
    if (inp.b) {
      inp.b = false;
      if (hasBall) pass(p);
      else if (p.tackleCd <= 0) { startSlide(p); return; }
    }

    // --- movement
    let mx = inp.x;
    let mz = inp.z;
    let m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; m = 1; }
    const wantsSprint = m > 0.9 && !p.charging;
    if (wantsSprint && !p.exhausted && p.stamina > 0) {
      p.sprinting = true;
      p.stamina = Math.max(0, p.stamina - dt * T.staminaDrain);
      if (p.stamina <= 0) p.exhausted = true;
    } else {
      p.sprinting = false;
      p.stamina = Math.min(1, p.stamina + dt * T.staminaRegen * (m < 0.1 ? 1.6 : 1));
      if (p.exhausted && p.stamina >= T.staminaMinRestart) p.exhausted = false;
    }
    let top = p.sprinting ? T.sprintSpeed : T.speed;
    if (p.charging) top *= T.chargeSpeedMul;
    if (b.owner === p) top *= T.withBallMul;
    if (p.bot) top *= p.role === 'keeper' ? 0.95 : (p.skill ?? 0.9);
    const tvx = mx * top;
    const tvz = mz * top;
    const k = Math.min(1, dt * T.accel);
    p.vx += (tvx - p.vx) * k;
    p.vz += (tvz - p.vz) * k;
    if (m > 0.15) {
      const want = Math.atan2(mz, mx);
      const d = angDiff(p.face, want);
      const step = T.turnRate * dt * (p.charging ? 0.7 : 1);
      p.face += clamp(d, -step, step);
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
  }

  function slideContacts(p) {
    if (p.slideHit) return;
    const b = sim.ball;
    const fx = Math.cos(p.slideDir);
    const fz = Math.sin(p.slideDir);
    const bd = Math.hypot(b.x - p.x, b.z - p.z);
    if (bd < 1.05 && b.y < 0.9 && b.owner !== p) {
      const victim = b.owner && b.owner.team !== p.team ? b.owner : null;
      p.slideHit = true;
      b.owner = null;
      b.passTarget = null;
      b.vx = fx * 8.5 + (Math.random() - 0.5) * 3;
      b.vz = fz * 8.5 + (Math.random() - 0.5) * 3;
      b.vy = 2.2;
      b.lockP = p;
      b.lockUntil = sim.time + 0.2;
      touch(p);
      if (victim) {
        stun(victim, T.tackledStun, 'tackled');
        p.stats.tackles += 1;
        onEvent({ type: 'tackle', p, victim });
      } else {
        onEvent({ type: 'poke', p });
      }
      return;
    }
    for (const q of sim.players) {
      if (q === p || q.team === p.team || q.stun > 0) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < 0.85) {
        p.slideHit = true;
        stun(p, T.foulStun, 'foul');
        stun(q, 0.35, 'bumped');
        q.vx += fx * 3; q.vz += fz * 3;
        onEvent({ type: 'foul', p, victim: q });
        return;
      }
    }
  }

  function collidePlayers() {
    const ps = sim.players;
    const R = T.playerRadius * 2;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      for (let j = i + 1; j < ps.length; j++) {
        const c = ps[j];
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (R - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        c.x += nx * push; c.z += nz * push;
      }
    }
    const { HL, HW, corner } = sim.pitch;
    const r = T.playerRadius;
    for (const p of ps) {
      p.x = clamp(p.x, -HL + r, HL - r);
      p.z = clamp(p.z, -HW + r, HW - r);
      // chamfered corners
      const ax = Math.abs(p.x);
      const az = Math.abs(p.z);
      const over = ax + az - (HL + HW - corner) + r * 1.41;
      if (over > 0) {
        const s = over / 2;
        p.x -= Math.sign(p.x) * s;
        p.z -= Math.sign(p.z) * s;
      }
    }
  }

  function updatePossession(dt) {
    const b = sim.ball;
    const o = b.owner;
    if (o) {
      const d = Math.hypot(b.x - o.x, b.z - o.z);
      if (d > T.keepRadius || o.stun > 0 || o.slide > 0) { b.owner = null; return; }
      // Opponents glued to the ball can poke it away.
      if (o.protect <= 0 && !sim.frozen) {
        for (const q of sim.players) {
          if (q.team === o.team || q.stun > 0 || q.slide > 0) continue;
          const qd = Math.hypot(b.x - q.x, b.z - q.z);
          if (qd < 0.85 && Math.random() < T.stealRate * dt * (q.bot ? 0.7 : 1)) {
            setOwner(q);
            o.protect = 0;
            onEvent({ type: 'steal', p: q, victim: o });
            return;
          }
        }
      }
      return;
    }
    if (b.y > 1.1 || sim.frozen) return;
    const speed = Math.hypot(b.vx, b.vz);
    let best = null;
    let bestD = Infinity;
    for (const p of sim.players) {
      if (p.stun > 0 || p.slide > 0) continue;
      if (b.lockP === p && sim.time < b.lockUntil) continue;
      if (b.lockP && b.lockP !== p && sim.time < b.lockUntil - 0.15) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      let reach = T.controlRadius;
      if (b.passTarget === p) reach += 0.35;
      if (p.role === 'keeper') reach += 0.45;
      // Hard shots are hard to trap.
      const rel = Math.hypot(b.vx - p.vx, b.vz - p.vz);
      if (rel > 17 && p.role !== 'keeper') continue;
      if (rel > 11 && p.role !== 'keeper' && Math.random() < 0.5) continue;
      if (d < reach && d < bestD) { best = p; bestD = d; }
    }
    if (best) {
      if (best.role === 'keeper' && speed > 8) onEvent({ type: 'save', p: best });
      setOwner(best);
    }
  }

  function dribble(dt) {
    const b = sim.ball;
    const p = b.owner;
    if (!p) return;
    const sp = Math.hypot(p.vx, p.vz);
    const lead = 0.62 + sp * 0.045;
    const tx = p.x + Math.cos(p.face) * lead;
    const tz = p.z + Math.sin(p.face) * lead;
    const k = p.sprinting ? 9 : 13;
    b.vx = p.vx + (tx - b.x) * k;
    b.vz = p.vz + (tz - b.z) * k;
    if (b.y > T.ballRadius + 0.02) b.vy -= T.gravity * dt;
    else { b.y = T.ballRadius; b.vy = 0; }
    b.spin = 0;
  }

  // Ball vs arena: side walls, chamfered corners, end walls with goal mouths, posts, crossbar, nets.
  function ballWorld(dt) {
    const b = sim.ball;
    const { HL, HW, GW, GH, GD, corner } = sim.pitch;
    const r = T.ballRadius;
    const e = T.wallBounce;
    let hit = 0;

    // --- inside a goal box
    const inX = Math.abs(b.x) > HL;
    if (inX && Math.abs(b.z) < GW && b.y < GH) {
      const s = Math.sign(b.x);
      b.inGoal = s;
      const backX = HL + GD - r;
      if (Math.abs(b.x) > backX) {
        b.x = s * backX;
        onEvent({ type: 'net', side: s, z: b.z, y: b.y, speed: Math.abs(b.vx) });
        b.vx = -b.vx * 0.12;
        b.vz *= 0.5; b.vy *= 0.5;
      }
      if (Math.abs(b.z) > GW - r) { b.z = Math.sign(b.z) * (GW - r); b.vz = -b.vz * 0.15; b.vx *= 0.6; }
      if (b.y > GH - r) { b.y = GH - r; b.vy = -Math.abs(b.vy) * 0.1; }
      return;
    }
    b.inGoal = 0;

    // --- side walls
    if (b.z > HW - r) { b.z = HW - r; if (b.vz > 0) { hit = Math.abs(b.vz); b.vz = -b.vz * e; } }
    if (b.z < -HW + r) { b.z = -HW + r; if (b.vz < 0) { hit = Math.abs(b.vz); b.vz = -b.vz * e; } }

    // --- end walls (outside the goal mouth, or above the crossbar)
    for (const s of [-1, 1]) {
      if (s * b.x > HL - r) {
        const mouth = Math.abs(b.z) < GW - r * 0.3 && b.y < GH - r * 0.3;
        if (!mouth) {
          // only reflect if we were on the field side (not already in the goal from the side)
          b.x = s * (HL - r);
          if (s * b.vx > 0) { hit = Math.max(hit, Math.abs(b.vx)); b.vx = -b.vx * e; }
        }
      }
    }

    // --- chamfered corners (45deg walls)
    const ax = Math.abs(b.x);
    const az = Math.abs(b.z);
    const lim = HL + HW - corner;
    const pen = (ax + az) - lim + r * 1.41421;
    if (pen > 0 && !(Math.abs(b.z) < GW)) {
      const nx = -Math.sign(b.x) / Math.SQRT2;
      const nz = -Math.sign(b.z) / Math.SQRT2;
      b.x += nx * pen / Math.SQRT2 * 1.0;
      b.z += nz * pen / Math.SQRT2 * 1.0;
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) { hit = Math.max(hit, -vn); b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz; }
    }

    // --- posts & crossbar
    const pr = 0.1;
    for (const s of [-1, 1]) {
      const px = s * HL;
      for (const pz of [-GW, GW]) {
        if (b.y > GH + r) continue;
        const dx = b.x - px;
        const dz = b.z - pz;
        const d = Math.hypot(dx, dz);
        if (d < r + pr && d > 1e-6) {
          const nx = dx / d;
          const nz = dz / d;
          b.x = px + nx * (r + pr);
          b.z = pz + nz * (r + pr);
          const vn = b.vx * nx + b.vz * nz;
          if (vn < 0) {
            b.vx -= (1 + 0.6) * vn * nx; b.vz -= (1 + 0.6) * vn * nz;
            if (-vn > 4) onEvent({ type: 'post', x: px, y: b.y, z: pz, speed: -vn });
          }
        }
      }
      if (Math.abs(b.z) < GW) {
        const dx = b.x - px;
        const dy = b.y - GH;
        const d = Math.hypot(dx, dy);
        if (d < r + pr && d > 1e-6) {
          const nx = dx / d;
          const ny = dy / d;
          b.x = px + nx * (r + pr);
          b.y = GH + ny * (r + pr);
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= (1 + 0.6) * vn * nx; b.vy -= (1 + 0.6) * vn * ny;
            if (-vn > 4) onEvent({ type: 'post', x: px, y: GH, z: b.z, speed: -vn });
          }
        }
      }
    }
    if (hit > 5) onEvent({ type: 'wall', speed: hit, x: b.x, z: b.z });
    void dt;
  }

  function ballBodies() {
    // Loose ball bounces off players' bodies (blocks, deflections).
    const b = sim.ball;
    if (b.owner || b.y > 1.8) return;
    const R = T.playerRadius + T.ballRadius;
    for (const p of sim.players) {
      if (b.lockP === p && sim.time < b.lockUntil) continue;
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-6) continue;
      const nx = dx / d;
      const nz = dz / d;
      b.x = p.x + nx * R;
      b.z = p.z + nz * R;
      const rvx = b.vx - p.vx;
      const rvz = b.vz - p.vz;
      const vn = rvx * nx + rvz * nz;
      if (vn < 0) {
        b.vx -= 1.35 * vn * nx;
        b.vz -= 1.35 * vn * nz;
        if (-vn > 9) { onEvent({ type: 'block', p, speed: -vn }); touch(p); }
      }
    }
  }

  function ballPhysics(dt) {
    const b = sim.ball;
    const r = T.ballRadius;
    if (b.owner) {
      dribble(dt);
    } else {
      const onGround = b.y <= r + 0.01 && Math.abs(b.vy) < 0.5;
      if (onGround) {
        const sp = Math.hypot(b.vx, b.vz);
        if (sp > 0) {
          const dec = T.groundDecel * dt + sp * T.groundDrag * dt;
          const ns = Math.max(0, sp - dec);
          b.vx *= ns / sp;
          b.vz *= ns / sp;
        }
        b.spin *= Math.max(0, 1 - dt * 4);
      } else {
        b.vy -= T.gravity * dt;
        const k = Math.max(0, 1 - T.airDrag * dt);
        b.vx *= k; b.vz *= k;
        // Magnus-ish curve
        if (b.spin) {
          const sp = Math.hypot(b.vx, b.vz) || 1;
          const px = -b.vz / sp;
          const pz = b.vx / sp;
          b.vx += px * b.spin * dt * 3.2;
          b.vz += pz * b.spin * dt * 3.2;
          b.spin *= Math.max(0, 1 - dt * 0.6);
        }
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.y < r) {
      b.y = r;
      if (b.vy < -2.2) {
        onEvent({ type: 'bounce', speed: -b.vy, x: b.x, z: b.z });
        b.vy = -b.vy * T.bounce;
        b.vx *= 0.9; b.vz *= 0.9;
      } else b.vy = 0;
    }
    if (b.power > 0) b.power = Math.max(0, b.power - dt * (Math.hypot(b.vx, b.vz) < 12 ? 2.5 : 0.2));
    ballBodies();
    ballWorld(dt);
    checkGoal();
  }

  function checkGoal() {
    if (sim.goalCooldown) return;
    const b = sim.ball;
    const { HL, GW, GH } = sim.pitch;
    if (Math.abs(b.x) > HL + T.ballRadius && Math.abs(b.z) < GW && b.y < GH) {
      const side = Math.sign(b.x); // +1: right goal (orange's) => blue scores
      const team = side > 0 ? 0 : 1;
      sim.goalCooldown = true;
      b.owner = null;
      const last = b.lastTouch;
      let scorer = null;
      let assist = null;
      let own = false;
      if (last && last.team === team) {
        scorer = last;
        // assist: previous touch by a different teammate with no opponent touch in between
        const ts = sim.touches;
        for (let i = ts.length - 2; i >= 0; i--) {
          const t = ts[i];
          if (t.p.team !== team) break;
          if (t.p !== scorer) { if (sim.time - t.t < 12) assist = t.p; break; }
        }
      } else if (last) {
        own = true;
      }
      if (scorer) scorer.stats.goals += 1;
      if (assist) assist.stats.assists += 1;
      if (own && last) last.stats.ownGoals += 1;
      onEvent({ type: 'goal', team, side, scorer, assist, own, ownBy: own ? last : null, speed: Math.hypot(b.vx, b.vy, b.vz) });
    }
  }

  function step(dt) {
    sim.time += dt;
    for (const p of sim.players) updatePlayer(p, dt);
    collidePlayers();
    updatePossession(dt);
    ballPhysics(dt);
  }

  function update(dt) {
    const h = 1 / 120;
    let n = Math.max(1, Math.round(dt / h));
    n = Math.min(n, 12);
    const sdt = dt / n;
    for (let i = 0; i < n; i++) step(sdt);
  }

  return Object.assign(sim, {
    addPlayer, removePlayer, update, resetBall, stun,
    setPitch(p) { sim.pitch = p; },
    pickPassTarget,
  });
}
