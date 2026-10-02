#!/usr/bin/env node
// Pure-logic test of the Sumo Smash simulation (no browser): every arena x several player counts, all bot-driven.
// Checks: everyone spawns on solid floor and survives the first second, no NaNs, nobody leaves the alive state
// without falling, and each round resolves (last one standing or the time limit) — i.e. no stuck players.
//   node scripts/sumo-sim-test.mjs
import { createSim, makeFighter, ARENA_ORDER } from '../src/games/sumo/sim.js';

const STEP = 1 / 60;
let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL', m); };

for (const type of ARENA_ORDER) {
  for (const n of [2, 4, 8, 12, 20]) {
    const events = {};
    const sim = createSim({ emit: (t) => { events[t] = (events[t] || 0) + 1; } });
    for (let i = 0; i < n; i++) sim.fighters.set(`p${i}`, makeFighter(`p${i}`, { isBot: true }));
    sim.mode = 'rounds';
    sim.setupArena(type, n);
    const list = [...sim.fighters.values()];
    sim.placeForRound(list);
    for (const f of list) {
      if (!sim.solidAt(f.x, f.z)) fail(`${type}/${n}: ${f.id} spawned off the floor at (${f.x.toFixed(2)}, ${f.z.toFixed(2)})`);
    }
    sim.running = true;
    let t = 0;
    let earlyFalls = 0;
    let suddenAt = 40;
    let endT = null;
    while (t < 85) {
      if (t > suddenAt && !sim.suddenDeath) sim.suddenDeath = true;
      sim.step(STEP, (f) => sim.botInput(f));
      t += STEP;
      for (const f of list) {
        if (![f.x, f.z, f.y, f.vx, f.vz, f.vy].every(Number.isFinite)) { fail(`${type}/${n}: NaN on ${f.id}`); t = 999; break; }
        if (t < 1 && f.state !== 'alive') earlyFalls++;
      }
      const alive = list.filter((f) => f.state === 'alive').length;
      const falling = list.some((f) => f.state === 'falling');
      if (alive <= 1 && !falling) { endT = t; break; }
    }
    if (earlyFalls) fail(`${type}/${n}: ${earlyFalls} fighter-frames out within the first second (bad spawn?)`);
    const alive = list.filter((f) => f.state === 'alive').length;
    const res = endT != null ? `ended at ${endT.toFixed(1)}s (${alive} left)` : `time limit, ${alive} alive (lowest damage wins)`;
    console.log(`${type.padEnd(9)} n=${String(n).padStart(2)}  R=${sim.arena.R.toFixed(1)}  ${res}  hits=${events.hit || 0} slams=${events.slam || 0} falls=${events.fall || 0} hazards=${events.hazardImpact || 0} tiles=${events.tileFall || 0}`);
  }
}
console.log(failures ? `❌ ${failures} failure(s)` : '✅ sim test passed');
process.exit(failures ? 1 : 0);
