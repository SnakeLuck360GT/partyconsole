#!/usr/bin/env node
// Kart Chaos AI / track audit: one human on autopilot + 7 CPUs race every track (or the given ones) until ALL
// karts finish. Flags karts that get stuck (little progress over 5 s of race time), spend long off-road or
// wrong-way, laps that don't add up, and slow finishers.
//   node scripts/kart-audit.mjs [laps=3] [tracks=meadow,canyon,frost] [cc=150]
// env: SMOKE_URL=http://localhost:5391/ (server started with scripts/kart-vite.config.mjs)
import { chromium } from 'playwright';

const [laps = '3', trackList = 'meadow,canyon,frost', cc = '150'] = process.argv.slice(2);
const base = process.env.SMOKE_URL || 'http://localhost:5391/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let failures = 0;
for (const trackId of trackList.split(',')) {
  const errors = [];
  const room = 'A' + Math.random().toString(36).slice(2, 5).toUpperCase();
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const tv = await context.newPage();
  tv.on('pageerror', (e) => errors.push(e.message));
  tv.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await tv.goto(`${base}screen.html?local=1&room=${room}&kartLaps=${laps}&kartAuto=1&kartTrack=${trackId}&kartCC=${cc}&kartDebug=nofly,waitall,fastresults&kartFast=8&kartLow=1`);
  await tv.waitForFunction(() => window.__party?.roomCode, null, { timeout: 15000 });
  const ph = await context.newPage();
  await ph.goto(`${base}controller.html?local=1&room=${room}`);
  await ph.fill('#name-input', 'Audit');
  await ph.click('#join-btn');
  await tv.waitForFunction(() => window.__party.players().length >= 1, null, { timeout: 10000 });
  await tv.evaluate(() => window.__party.loadGame('kart'));
  await tv.waitForFunction(() => window.__kart?.phase === 'race', null, { timeout: 120000 });
  await tv.evaluate(() => window.__kart.autopilot('all'));
  const hist = new Map(); // id -> [{t, dist}]
  const offT = new Map(); const wwT = new Map();
  const stuck = new Set();
  let lastT = 0;
  const L = await tv.evaluate(() => window.__kart.trackL());
  const t0 = Date.now();
  while (Date.now() - t0 < 20 * 60 * 1000) {
    const st = await tv.evaluate(() => ({ phase: window.__kart.phase, t: window.__kart.raceTime, k: window.__kart.karts() }));
    if (st.phase !== 'race') break;
    const dt = st.t - lastT; lastT = st.t;
    for (const k of st.k) {
      if (k.finished) continue;
      const h = hist.get(k.id) || [];
      h.push({ t: st.t, d: k.dist });
      while (h.length && st.t - h[0].t > 5) h.shift();
      hist.set(k.id, h);
      if (st.t > 6 && h.length > 2 && st.t - h[0].t > 4 && k.dist - h[0].d < 12 && k.spinT <= 0) {
        if (!stuck.has(k.id)) console.log(`  STUCK? ${k.name} t=${st.t.toFixed(1)} dist=${k.dist.toFixed(0)} (lap s=${(((k.dist % L) + L) % L).toFixed(0)}) lat=${k.lat.toFixed(1)} v=${k.speed.toFixed(1)} ww=${k.wrongWay}`);
        stuck.add(k.id);
      }
      if (k.offroad) offT.set(k.id, (offT.get(k.id) || 0) + dt);
      if (k.wrongWay) wwT.set(k.id, (wwT.get(k.id) || 0) + dt);
    }
    await tv.waitForTimeout(400);
  }
  const fin = await tv.evaluate(() => window.__kart.karts());
  const times = fin.filter((k) => k.finished).map((k) => k.finishTime);
  const best = Math.min(...times);
  console.log(`${trackId}: L=${L.toFixed(0)}m, ${fin.filter((k) => k.finished).length}/${fin.length} finished, best ${best.toFixed(1)}s`);
  for (const k of fin.sort((a, b) => (a.place || 99) - (b.place || 99))) {
    const flags = [];
    if (!k.finished) flags.push('DID NOT FINISH');
    if (k.laps !== Number(laps) && k.finished) flags.push(`laps=${k.laps}`);
    if (k.finished && k.finishTime > best * 1.25) flags.push('SLOW');
    if ((offT.get(k.id) || 0) > 8) flags.push(`offroad ${offT.get(k.id).toFixed(0)}s`);
    if ((wwT.get(k.id) || 0) > 2) flags.push(`wrong-way ${wwT.get(k.id).toFixed(0)}s`);
    if (stuck.has(k.id)) flags.push('stuck');
    console.log(`  ${String(k.place).padStart(2)} ${k.name.padEnd(12)} ${k.finished ? k.finishTime.toFixed(1).padStart(6) + 's' : '   ---'} ${flags.join(', ')}`);
    if (flags.some((f) => f !== 'SLOW' && !f.startsWith('offroad'))) failures++;
  }
  if (errors.length) { console.log('  page errors:', errors.slice(0, 5).join(' | ')); failures++; }
  await context.close();
}
await browser.close();
console.log(failures ? `FAIL (${failures})` : 'PASS');
process.exit(failures ? 1 : 0);
