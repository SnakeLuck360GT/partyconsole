#!/usr/bin/env node
// End-to-end Sumo Smash test (Playwright, local transport, HMR-free vite on a random port 5400–5999).
// N phones join; Alice is driven through her real phone controller (stick + DASH) towards the nearest rival,
// everyone else is bot-driven via the screen's test hook. Plays all five arenas (max rounds = 5), then results.
// Checks: spawns on solid floor every round, ring-outs + round wins, standings between rounds, a disconnect
// mid-round (fighter removed), a reconnect + a late join (both fight next round), results, play again, cleanup.
//   node scripts/sumo-test.mjs [players=4]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const N = Number(process.argv[2] || 4);
const out = resolve(import.meta.dirname, 'out', 'sumo-test');
mkdirSync(out, { recursive: true });
const port = 5400 + Math.floor(Math.random() * 600);
const server = spawn('npx', ['vite', '--config', 'scripts/sumo-vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
const base = `http://localhost:${port}/`;
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 30000);
  server.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); res(); } });
});

const errors = [];
const notes = [];
const fail = (m) => { errors.push(m); console.log('FAIL', m); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const room = 'S' + Math.random().toString(36).slice(2, 5).toUpperCase();
const NAMES = ['Alice', 'Bob', 'Chloe', 'Dmitri', 'Eve', 'Farah', 'Gus', 'Hana', 'Ivan', 'Jade', 'Kofi', 'Lena'];
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_CONNECTION/.test(m.text())) errors.push(`[${label}] console: ${m.text()}`); });
}
async function joinPhone(context, name) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 844, height: 390 });
  watch(p, name);
  await p.goto(`${base}controller.html?local=1&room=${room}`);
  await p.fill('#name-input', name);
  await p.click('#join-btn');
  return p;
}

try {
  const screenCtx = await browser.newContext();
  // Simulated network drop for a phone: tell the host the connection closed (like a phone locking), keep the page.
  const dropPhone = (p) => p.evaluate(() => {
    const orig = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = function (m) { if (m?.kind === 'close' && m.to === 'host') window.__myConnId = m.from; return orig.call(this, m); };
    window.dispatchEvent(new Event('beforeunload'));
    BroadcastChannel.prototype.postMessage = orig;
  });
  // ...and later let the phone notice and run its reconnect loop (same clientId → onJoin with rejoin: true)
  const restorePhone = (p, code) => p.evaluate((code) => { const bc = new BroadcastChannel('partyconsole-v1-' + code); bc.postMessage({ to: window.__myConnId, kind: 'close' }); setTimeout(() => bc.close(), 500); }, code);
  const screen = await screenCtx.newPage();
  await screen.setViewportSize({ width: 1280, height: 720 });
  watch(screen, 'screen');
  await screen.goto(`${base}screen.html?local=1&room=${room}`);
  await screen.waitForFunction(() => window.__party?.roomCode);
  // one browser context (the local BroadcastChannel transport doesn't cross contexts)
  const phones = {};
  for (const name of NAMES.slice(0, N)) phones[name] = await joinPhone(screenCtx, name);
  await screen.waitForFunction((n) => window.__party.players().length >= n, N);
  await screen.evaluate(() => window.__party.loadGame('sumo'));
  await screen.waitForFunction(() => window.__sumoDebug?.phase === 'intro', null, { timeout: 60000 });
  await screen.evaluate(() => { window.__sumoDebug.setMaxRounds(5); window.__sumoDebug.setTarget(9); window.__sumoDebug.autopilot(true); });
  await screen.waitForTimeout(1800);
  await shot(screen, '00-intro');
  await shot(phones.Alice, 'phone-intro');
  const dbg = () => screen.evaluate(() => ({ phase: window.__sumoDebug.phase, round: window.__sumoDebug.round, arena: window.__sumoDebug.arena, slowmo: window.__sumoDebug.slowmo, f: window.__sumoDebug.fighters() }));

  // Alice's phone: drive toward the nearest rival with the stick, tap DASH when close
  const A = phones.Alice;
  let stick = null;
  let dashBtn = null;
  let held = false;
  async function driveAlice(st) {
    const a = st.f.find((f) => f.name === 'Alice');
    if (!a || a.state !== 'alive' || st.phase !== 'play') { if (held) { await A.mouse.up(); held = false; } return; }
    if (!stick) {
      const zb = await (await A.$('.pk-stick-zone')).boundingBox();
      stick = { x: zb.x + zb.width / 2, y: zb.y + zb.height / 2 };
      const db = await (await A.$('.b-dash')).boundingBox();
      dashBtn = { x: db.x + db.width / 2, y: db.y + db.height / 2 };
    }
    let best = null;
    for (const o of st.f) if (o.name !== 'Alice' && o.state === 'alive') { const d = Math.hypot(o.x - a.x, o.z - a.z); if (!best || d < best.d) best = { o, d }; }
    if (!best) return;
    const dx = (best.o.x - a.x) / best.d;
    const dz = (best.o.z - a.z) / best.d;
    if (best.d < 2.3) {
      if (held) { await A.mouse.up(); held = false; }
      await A.mouse.move(dashBtn.x, dashBtn.y);
      await A.mouse.down();
      await A.waitForTimeout(40);
      await A.mouse.up();
    } else {
      if (!held) { await A.mouse.move(stick.x, stick.y); await A.mouse.down(); held = true; }
      await A.mouse.move(stick.x + dx * 70, stick.y + dz * 70, { steps: 2 });
    }
  }

  let aliceDashHits = 0;
  let disconnected = false;
  let rejoined = false;
  let lateJoined = false;
  let sawSlowmo = false;
  let sawOutPhone = false;
  for (let round = 1; round <= 5; round++) {
    await screen.waitForFunction((r) => window.__sumoDebug.round === r && window.__sumoDebug.phase === 'countdown', round, { timeout: 90000 });
    const pre = await dbg();
    console.log(`round ${round}: ${pre.arena}, ${pre.f.filter((f) => f.inMatch).length} fighters`);
    await screen.waitForTimeout(700);
    await shot(screen, `r${round}-0-${pre.arena}-intro`);
    await screen.waitForFunction(() => window.__sumoDebug.phase === 'play', null, { timeout: 30000 });
    const start = await dbg();
    for (const f of start.f) if (f.inMatch && (f.state !== 'alive' || !f.solid)) fail(`round ${round} ${start.arena}: ${f.name} not alive on solid floor at start (${f.state}, solid=${f.solid})`);
    if (round === 4) {
      for (const nm of ['Late', NAMES[N - 1]]) {
        const f = start.f.find((x) => x.name === nm);
        if (!f || !f.inMatch || f.state !== 'alive') fail(`round 4: ${nm} should be fighting (late join / reconnect)`); else notes.push(`${nm} fighting in round 4`);
      }
    }
    // Alice fights for real; everyone else on autopilot
    await screen.evaluate(() => window.__sumoDebug.autopilot(window.__sumoDebug.fighters().filter((f) => f.name !== 'Alice').map((f) => f.name)));
    const t0 = Date.now();
    let fightShot = false;
    let ringShot = false;
    let prevAliceDmgs = 0;
    while (Date.now() - t0 < 150000) {
      const st = await dbg();
      if (st.phase !== 'play') break;
      await driveAlice(st);
      const el = (Date.now() - t0) / 1000;
      if (!fightShot && el > 3) { await shot(screen, `r${round}-1-${st.arena}-fight`); fightShot = true; await shot(A, `phone-alice-r${round}`); }
      if (!ringShot && st.f.some((f) => f.state === 'falling' && f.y < -1 && f.y > -6)) { await shot(screen, `r${round}-2-${st.arena}-ringout`); ringShot = true; }
      if (st.slowmo && !sawSlowmo) { sawSlowmo = true; await shot(screen, `r${round}-3-${st.arena}-final-slowmo`); }
      const dmgSum = st.f.filter((f) => f.name !== 'Alice').reduce((s, f) => s + f.dmg, 0);
      if (dmgSum > prevAliceDmgs) prevAliceDmgs = dmgSum;
      // a knocked-out human's phone
      if (!sawOutPhone) {
        const outH = st.f.find((f) => !f.bot && f.state === 'out' && phones[f.name] && !(disconnected && !rejoined && f.name === NAMES[N - 1]));
        if (outH) { await phones[outH.name].waitForTimeout(250); await shot(phones[outH.name], 'phone-out-spectating'); sawOutPhone = true; }
      }
      // round 2: the last phone disconnects mid-round
      if (round === 2 && !disconnected && el > 2) {
        const victim = NAMES[N - 1];
        const before = st.f.find((f) => f.name === victim);
        await dropPhone(phones[victim]);
        disconnected = true;
        await screen.waitForTimeout(600);
        const after = (await dbg()).f.find((f) => f.name === victim);
        if (before.state === 'alive' && after.state === 'alive') fail('disconnected fighter still alive in the arena');
        else notes.push(`disconnect: ${victim} ${before.state} -> ${after.state}`);
        await shot(screen, 'r2-disconnect');
      }
      // round 3: the disconnected player comes back + a brand-new player joins mid-round
      if (round === 3 && !lateJoined && el > 2) {
        const victim = NAMES[N - 1];
        await restorePhone(phones[victim], room);
        rejoined = true;
        phones.Late = await joinPhone(screenCtx, 'Late');
        lateJoined = true;
        await phones.Late.waitForTimeout(1800);
        await shot(phones.Late, 'phone-late-wait');
        await shot(phones[victim], 'phone-rejoin-wait');
        await shot(screen, 'r3-latejoin');
        const lf = (await dbg()).f.find((f) => f.name === 'Late');
        if (!lf || lf.state === 'alive') fail('late joiner should wait for the next round');
      }
      await screen.waitForTimeout(90);
    }
    if (held) { await A.mouse.up(); held = false; }
    await screen.waitForFunction(() => window.__sumoDebug.phase !== 'play', null, { timeout: 10000 });
    await screen.waitForTimeout(900);
    await shot(screen, `r${round}-4-roundend`);
    if (round === 1) await shot(A, 'phone-alice-roundend');
    const end = await dbg();
    const wins = end.f.reduce((s, f) => s + f.wins, 0);
    console.log(`  -> ${end.f.filter((f) => f.wins).map((f) => `${f.name}:${f.wins}`).join(' ')} (total wins ${wins})`);
    if (round < 5) {
      await screen.waitForTimeout(2600);
      await shot(screen, `r${round}-5-standings`);
    }
  }
  if (!sawSlowmo) notes.push('no final slow-mo captured (round may have ended by a self-fall or time)');
  // results
  await screen.waitForFunction(() => window.__sumoDebug.phase === 'results', null, { timeout: 30000 });
  await screen.waitForTimeout(1200);
  await shot(screen, '90-champion');
  await screen.waitForFunction(() => !document.querySelector('#results')?.hidden, null, { timeout: 30000 });
  await screen.waitForTimeout(800);
  await shot(screen, '91-results');
  await shot(A, 'phone-alice-results');
  const totalWins = (await dbg()).f.reduce((s, f) => s + f.wins, 0);
  if (totalWins < 1) fail('no round wins over 5 rounds');
  // play again
  await screen.click('#res-again');
  await screen.waitForFunction(() => ['intro', 'countdown'].includes(window.__sumoDebug?.phase), null, { timeout: 10000 });
  const again = await dbg();
  if (again.f.some((f) => f.wins)) fail('scores not reset on play again');
  else notes.push(`play again ok with ${again.f.length} fighters`);
  await screen.evaluate(() => window.__party.exitGame());
  await screen.waitForTimeout(600);
  if (await screen.evaluate(() => !!window.__sumoDebug)) fail('destroy did not clean up');
  console.log(notes.map((n) => `  · ${n}`).join('\n'));
  if (!disconnected || !rejoined || !lateJoined) fail('disconnect/rejoin/late-join steps did not run');
} catch (e) {
  errors.push(`[harness] ${e.message}`);
} finally {
  await browser.close();
  server.kill();
  console.log(errors.length ? `❌ ${errors.join('\n')}` : '✅ sumo e2e test passed');
  process.exit(errors.length ? 1 : 0);
}
