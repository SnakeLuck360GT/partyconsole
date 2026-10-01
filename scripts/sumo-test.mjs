#!/usr/bin/env node
// Deterministic Sumo Smash test: 2 phones; Alice hunts Bob with stick + DASH until Bob is knocked off.
// Verifies: round win registered, phone states, results overlay + phone results, play-again restarts.
//   node scripts/sumo-test.mjs          (env SUMO_URL to reuse a running vite server)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(import.meta.dirname, 'out', 'sumo-test');
mkdirSync(out, { recursive: true });
let server = null;
let base = process.env.SUMO_URL;
if (!base) {
  const port = 6100 + Math.floor(Math.random() * 300);
  server = spawn('npx', ['vite', '--config', 'scripts/sumo-vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  base = `http://localhost:${port}/`;
  await new Promise((res) => server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }));
}
const errors = [];
const fail = (m) => { errors.push(m); throw new Error(m); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext();
const room = 'S' + Math.random().toString(36).slice(2, 5).toUpperCase();
try {
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1280, height: 720 });
  screen.on('pageerror', (e) => errors.push(`[screen] ${e.message}`));
  await screen.goto(`${base}screen.html?local=1&room=${room}`);
  await screen.waitForFunction(() => window.__party?.roomCode);
  const phones = [];
  for (const name of ['Alice', 'Bob']) {
    const p = await context.newPage();
    await p.setViewportSize({ width: 844, height: 390 });
    p.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    await p.goto(`${base}controller.html?local=1&room=${room}`);
    await p.fill('#name-input', name);
    await p.click('#join-btn');
    phones.push(p);
  }
  await screen.waitForFunction(() => window.__party.players().length >= 2);
  await screen.evaluate(() => window.__party.loadGame('sumo'));
  await screen.waitForFunction(() => window.__sumoDebug?.phase === 'play', null, { timeout: 60000 });
  await screen.evaluate(() => window.__sumoDebug.setTarget(1));
  console.log('round 1 playing');
  await screen.screenshot({ path: `${out}/1-play.png` });

  const [alice] = phones;
  const zone = await alice.$('.pk-stick-zone');
  const zb = await zone.boundingBox();
  const cx = zb.x + zb.width / 2;
  const cy = zb.y + zb.height / 2;
  const dash = await alice.$('.b-dash');
  const db = await dash.boundingBox();
  let held = false;
  const t0 = Date.now();
  let shot = false;
  while (Date.now() - t0 < 90000) {
    const st = await screen.evaluate(() => ({ phase: window.__sumoDebug.phase, f: window.__sumoDebug.fighters() }));
    if (st.phase !== 'play') break;
    const a = st.f.find((f) => f.name === 'Alice');
    const b = st.f.find((f) => f.name === 'Bob');
    if (a.state !== 'alive') { await screen.waitForTimeout(200); continue; }
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dz) || 1;
    // steer towards Bob (hold the stick)
    if (!held) { await alice.mouse.move(cx, cy); await alice.mouse.down(); held = true; }
    await alice.mouse.move(cx + (dx / d) * 70, cy + (dz / d) * 70, { steps: 2 });
    if (d < 2.4) {
      // release the stick (Alice keeps facing Bob) and tap DASH
      await alice.mouse.up();
      held = false;
      await alice.mouse.move(db.x + db.width / 2, db.y + db.height / 2);
      await alice.mouse.down();
      await alice.waitForTimeout(50);
      await alice.mouse.up();
      if (!shot && b.dmg > 20) { await screen.screenshot({ path: `${out}/2-fight.png` }); shot = true; }
    }
    await alice.waitForTimeout(120);
  }
  if (held) await alice.mouse.up();
  const after = await screen.evaluate(() => ({ phase: window.__sumoDebug.phase, f: window.__sumoDebug.fighters() }));
  console.log('after fight:', JSON.stringify(after.f.map((f) => [f.name, f.state, Math.round(f.dmg), f.wins])), after.phase);
  await screen.screenshot({ path: `${out}/3-roundend.png` });
  await phones[1].screenshot({ path: `${out}/phone-bob-out.png` });
  const aliceWins = after.f.find((f) => f.name === 'Alice').wins;
  if (aliceWins < 1) fail('Alice did not win the round');
  // results
  await screen.waitForFunction(() => !document.querySelector('#results')?.hidden, null, { timeout: 30000 });
  await screen.waitForTimeout(600);
  await screen.screenshot({ path: `${out}/4-results.png` });
  const resText = await screen.$eval('#results', (e) => e.innerText);
  if (!/Alice/.test(resText)) fail('results do not show Alice');
  await phones[0].waitForTimeout(500);
  await phones[0].screenshot({ path: `${out}/phone-alice-results.png` });
  // play again
  await screen.click('#res-again');
  await screen.waitForFunction(() => window.__sumoDebug?.phase === 'intro' || window.__sumoDebug?.phase === 'countdown', null, { timeout: 10000 });
  const again = await screen.evaluate(() => window.__sumoDebug.fighters().map((f) => f.wins));
  if (again.some((w) => w !== 0)) fail('scores not reset on play again');
  console.log('play again ok');
  await screen.evaluate(() => window.__party.exitGame());
  await screen.waitForTimeout(500);
  if (await screen.evaluate(() => !!window.__sumoDebug)) fail('destroy did not clean up');
} catch (e) {
  if (!errors.includes(e.message)) errors.push(`[harness] ${e.message}`);
} finally {
  await browser.close();
  server?.kill();
  console.log(errors.length ? `❌ ${errors.join('\n')}` : '✅ sumo test passed');
  process.exit(errors.length ? 1 : 0);
}
