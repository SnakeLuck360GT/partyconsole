// Bot brains: fill in `p.input` for bot players each frame (same input shape as humans).
import { clamp, T } from './config.js';

/** Formation slots for k field players: [{u, v}] with u in [-1,0] (own half, 0 = centre line), v in [-1,1] across. */
export function formation(k) {
  if (k <= 0) return [];
  const rows = k <= 2 ? 1 : k <= 5 ? 2 : k <= 9 ? 3 : 4;
  const out = [];
  let left = k;
  for (let r = 0; r < rows; r++) {
    const n = Math.ceil(left / (rows - r));
    left -= n;
    const u = -(0.18 + (0.62 * (r + 0.5)) / rows);
    for (let i = 0; i < n; i++) {
      const v = n === 1 ? 0 : -0.72 + (1.44 * i) / (n - 1);
      out.push({ u: r === 0 && k <= 2 ? -0.35 : u, v: n === 1 ? (r % 2 ? 0.2 : -0.1) : v });
    }
  }
  // attackers first (closest to centre)
  return out.sort((a, b) => b.u - a.u);
}

function steer(p, tx, tz, { urgent = false, arrive = 0.6 } = {}) {
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < arrive) { p.input.x = 0; p.input.z = 0; p.input.b = false; return d; }
  let m = d > 3.5 ? 1 : d / 3.5;
  p.input.b = urgent && d > 2.5 && p.stamina > 0.35 && !p.exhausted;
  p.input.x = (dx / d) * m;
  p.input.z = (dz / d) * m;
  return d;
}

export function updateBots(sim, dt) {
  const { players, ball: b, pitch } = sim;
  const { HL, HW, GW } = pitch;
  if (sim.frozen) {
    for (const p of players) if (p.bot) { p.input.x = 0; p.input.z = 0; p.input.a = false; p.input.b = false; if (p.brain) p.brain.hold = 0; }
    return;
  }
  // Rank field players by distance to the ball per team (humans included). O(n^2) but allocation-free.
  for (const p of players) p._bd = Math.hypot(b.x - p.x, b.z - p.z);
  for (const p of players) {
    let r = 0;
    if (p.role !== 'keeper') {
      for (const q of players) {
        if (q === p || q.team !== p.team || q.role === 'keeper' || q.stun > 0 || !q.onPitch) continue;
        if (q._bd < p._bd || (q._bd === p._bd && q.id < p.id)) r++;
      }
    }
    p._rank = r;
  }

  for (const p of players) {
    if (!p.bot) continue;
    const br = p.brain || (p.brain = { next: 0, hold: 0, charge: 0, aimZ: 0, ownedFor: 0, home: { u: -0.4, v: 0 } });
    br.next -= dt;
    const side = p.team === 0 ? 1 : -1;
    const inp = p.input;

    // Charging a shot: hold until target charge, then release.
    if (br.hold > 0) {
      br.hold -= dt;
      inp.a = br.hold > 0 && (b.owner === p || Math.hypot(b.x - p.x, b.z - p.z) < 1.4);
      if (!inp.a) br.hold = 0;
      // keep facing the goal while charging
      const gx = side * HL;
      const dx = gx - p.x;
      const dz = br.aimZ - p.z;
      const d = Math.hypot(dx, dz) || 1;
      inp.x = (dx / d) * 0.3; inp.z = (dz / d) * 0.3;
      continue;
    }
    inp.a = false;
    if (p.stun > 0 || p.slide > 0) continue;

    if (p.role === 'keeper') { keeper(sim, p, br, side, dt); continue; }

    const own = b.owner === p;
    br.ownedFor = own ? br.ownedFor + dt : 0;
    if (own) {
      const gx = side * HL;
      if (br.aimZ === undefined || br.ownedFor < dt * 1.5) br.aimZ = (Math.random() - 0.5) * GW * 1.2;
      const dGoal = Math.hypot(gx - p.x, br.aimZ - p.z);
      // Steer towards goal, dodge the nearest opponent ahead.
      let tx = gx;
      let tz = br.aimZ;
      let pressure = 99;
      for (const o of players) {
        if (o.team === p.team) continue;
        const ox = o.x - p.x;
        const oz = o.z - p.z;
        const od = Math.hypot(ox, oz);
        const ahead = ox * side > -0.3;
        if (ahead && od < 4.5) {
          pressure = Math.min(pressure, od);
          tz += (oz > 0 ? -1 : 1) * (4.5 - od) * 1.3;
        }
      }
      tz = clamp(tz, -HW + 1.5, HW - 1.5);
      steer(p, tx, tz, { urgent: pressure < 3 });
      const facingGoal = Math.cos(p.face) * side > 0.55;
      const range = Math.min(20, HL * 0.75);
      if (br.next <= 0) {
        br.next = 0.12 + Math.random() * 0.15;
        if (dGoal < range && facingGoal && (dGoal < range * 0.55 || Math.random() < 0.35)) {
          br.hold = T.tapTime + 0.05 + clamp(dGoal / 24, 0.15, 0.75) * T.chargeTime;
          inp.a = true; inp.aDown = true;
          br.aimZ = clamp(br.aimZ, -GW * 0.7, GW * 0.7);
          continue;
        }
        const mate = sim.pickPassTarget(p);
        if (mate && ((pressure < 1.9 && Math.random() < 0.45) || (br.ownedFor > 3.5 && Math.random() < 0.3))) {
          const mateAhead = (mate.x - p.x) * side > -4;
          if (mateAhead) { inp.aDown = true; inp.a = false; }
        }
      }
      continue;
    }

    const rank = p.stun > 0 ? 9 : p._rank;
    const teamHas = b.owner && b.owner.team === p.team;
    const oppHas = b.owner && b.owner.team !== p.team;
    const bd = Math.hypot(b.x - p.x, b.z - p.z);
    if (b.passTarget === p || rank === 0 || (!teamHas && bd < 3.5 && rank <= 1)) {
      // Chase / intercept the ball, approaching from our own side.
      const t = clamp(bd / 8, 0, 0.9);
      let tx = b.x + (b.owner ? b.owner.vx : b.vx) * t;
      let tz = b.z + (b.owner ? b.owner.vz : b.vz) * t;
      if (!b.owner && bd > 1.2) tx -= side * 0.45;
      tx = clamp(tx, -HL + 0.5, HL - 0.5);
      tz = clamp(tz, -HW + 0.5, HW - 0.5);
      steer(p, tx, tz, { urgent: true, arrive: 0.05 });
      if (oppHas && bd < 2.4 && bd > 0.5 && p.tackleCd <= 0 && br.next <= 0) {
        br.next = 0.25;
        const toBall = Math.atan2(b.z - p.z, b.x - p.x);
        const facing = Math.cos(toBall - p.face) > 0.8;
        if (facing && Math.random() < 0.28 * (p.skill ?? 0.9)) inp.bDown = true;
      }
      continue;
    }
    // Positional play.
    const bu = b.x * side / HL; // ball position along our attack axis, -1..1
    let u;
    let v;
    if (oppHas && rank === 1) {
      // Cover: between the ball and our goal.
      const gx = -side * HL;
      u = null;
      const tx = b.x + (gx - b.x) * 0.3;
      const tz = b.z * 0.7;
      steer(p, tx, tz, { urgent: true });
      continue;
    }
    u = br.home.u * 0.75 + bu * 0.55 + (teamHas ? 0.25 : -0.05);
    u = clamp(u, -0.88, 0.85);
    v = br.home.v * 0.85 + (b.z / HW) * 0.3;
    if (teamHas) v += Math.sin(sim.time * 0.7 + p.id.length) * 0.08;
    const tx = u * HL * side;
    const tz = clamp(v * HW, -HW + 1, HW - 1);
    steer(p, tx, tz, { arrive: 1.2 });
  }
}

function keeper(sim, p, br, side, dt) {
  const { ball: b, pitch, players } = sim;
  const { HL, GW } = pitch;
  const inp = p.input;
  const gx = -side * HL;
  if (b.owner === p) {
    br.ownedFor = (br.ownedFor || 0) + dt;
    // Face upfield, then clear it or roll it to a teammate.
    const aim = (side > 0 ? 0 : Math.PI) + (b.z > 0 ? 0.35 : -0.35);
    inp.x = Math.cos(aim) * 0.5;
    inp.z = Math.sin(aim) * 0.5;
    if (br.ownedFor > 0.55 && Math.cos(p.face - aim) > 0.9) {
      br.ownedFor = 0;
      const mate = sim.pickPassTarget(p);
      if (mate && Math.random() < 0.55) { inp.aDown = true; inp.a = false; }
      else { br.hold = T.tapTime + 0.5; br.aimZ = b.z; inp.a = true; inp.aDown = true; }
    }
    return;
  }
  br.ownedFor = 0;
  const bd = Math.hypot(b.x - p.x, b.z - p.z);
  const ballDistGoal = Math.hypot(b.x - gx, b.z);
  let nearestOpp = 99;
  for (const o of players) if (o.team !== p.team) nearestOpp = Math.min(nearestOpp, Math.hypot(b.x - o.x, b.z - o.z));
  const loose = !b.owner || b.owner.team !== p.team;
  if (loose && ballDistGoal < 7.5 && bd < nearestOpp + 0.6 && b.y < 1.6) {
    steer(p, b.x, b.z, { urgent: true, arrive: 0.05 });
    return;
  }
  // Stay on the line between ball and goal centre, a bit off the line.
  const off = 1.1 + clamp((ballDistGoal - 8) * 0.06, 0, 1.2);
  const ang = Math.atan2(b.z, b.x - gx);
  let tx = gx + Math.cos(ang) * off;
  let tz = Math.sin(ang) * off + b.z * 0.08;
  // predict incoming shots
  if (!b.owner && Math.abs(b.vx) > 5 && Math.sign(b.vx) === -side) {
    const t = (tx - b.x) / b.vx;
    if (t > 0 && t < 1.5) tz = b.z + b.vz * t;
  }
  tz = clamp(tz, -GW + 0.4, GW - 0.4);
  if (side > 0) tx = Math.max(tx, gx + 0.5); else tx = Math.min(tx, gx - 0.5);
  steer(p, tx, tz, { urgent: true, arrive: 0.15 });
}
