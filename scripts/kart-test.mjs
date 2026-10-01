#!/usr/bin/env node
// Kart Chaos end-to-end test (deterministic driving):
//  - phone 0 is a real phone context held in PORTRAIT (390x844, isMobile, so the platform virtually rotates it):
//    it taps "start engine", falls back to touch steering (no gyro headless) and is steered by dragging the
//    on-screen steer zone toward the screen's suggested steering. Other phones are put on autopilot.
//  - verifies lap counting, finishing, placements, platform results, and "again" -> next track (cup flow).
//   node scripts/kart-test.mjs [players=2] [laps=1] [track=meadow] [maxSeconds=200]
// env: SMOKE_URL=http://localhost:5391/ (start with: npx vite --config scripts/kart-vite.config.mjs --port 5391)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [nP = '2', laps = '1', trackId = 'meadow', maxS = '200'] = process.argv.slice(2);
const N = Number(nP);
const base = process.env.SMOKE_URL || 'http://localhost:5391/';
const out = resolve(import.meta.dirname, 'out', 'kart-test');
mkdirSync(out, { recursive: true });
const errors = [];
const room = 'K' + Math.random().toString(36).slice(2, 5).toUpperCase();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const watch = (p, l) => {
  p.on('pageerror', (e) => errors.push(`[${l}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${l}] console: ${m.text()}`); });
};
let ok = false;
try {
  // one context for everything (the local transport is a BroadcastChannel); mobile + touch so the
  // controller sees a coarse pointer and applies the platform's virtual rotation in portrait
  const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  const tv = await context.newPage();
  await tv.setViewportSize({ width: 960, height: 540 });
  watch(tv, 'tv');
  await tv.goto(`${base}screen.html?local=1&room=${room}&kartLaps=${laps}&kartAuto=1&kartTrack=${trackId}&kartDebug=fastresults&kartFast=8&kartLow=1`);
  await tv.waitForFunction(() => window.__party?.roomCode, null, { timeout: 15000 });
  const phones = [];
  for (let i = 0; i < N; i++) {
    const p = await context.newPage();
    await p.setViewportSize(i === 0 ? { width: 390, height: 844 } : { width: 844, height: 390 });
    watch(p, `phone${i}`);
    await p.goto(`${base}controller.html?local=1&room=${room}`);
    await p.fill('#name-input', `Bot${i + 1}`);
    await p.click('#join-btn');
    phones.push(p);
  }
  await tv.waitForFunction((n) => window.__party.players().length >= n, N, { timeout: 10000 });
  await tv.evaluate(() => window.__party.loadGame('kart'));
  await tv.waitForFunction(() => ['countdown', 'race'].includes(window.__kart?.phase), null, { timeout: 120000 });
  for (const p of phones) await p.click('.kc-key', { timeout: 8000, force: true }).catch((e) => errors.push(`[test] no start-engine overlay: ${e.message}`));
  await phones[0].waitForTimeout(1500);
  await phones[0].screenshot({ path: `${out}/phone0-portrait-pad.png` });
  const ids = await Promise.all(phones.map((p) => p.evaluate(() => window.__party.me.id)));
  await tv.waitForFunction(() => window.__kart?.phase === 'race', null, { timeout: 30000 });
  console.log('race started on', await tv.evaluate(() => window.__kart.track));
  if (N > 1) await tv.evaluate((others) => window.__kart.autopilot(others), ids.slice(1));
  // phone 0: hold the steer zone and drag toward the suggested steering
  const zone = await phones[0].$('.kc-steer');
  if (!zone) throw new Error('touch steering zone missing on phone 0 (tilt fallback failed?)');
  const zb = await zone.boundingBox();
  // the page is rotated 90deg: the zone's local x axis runs along the screen's y axis
  const rot = await phones[0].evaluate(() => Number(document.body.dataset.vrot || 0));
  console.log('phone0 virtual rotation:', rot);
  const cx = zb.x + zb.width / 2; const cy = zb.y + zb.height / 2;
  await phones[0].mouse.move(cx, cy);
  await phones[0].mouse.down();
  const t0 = Date.now();
  let last = 0;
  let shots = 0;
  const along = rot === 90 ? zb.height : rot === -90 ? zb.height : zb.width;
  while (Date.now() - t0 < Number(maxS) * 1000) {
    const [s, st] = await tv.evaluate((id) => [window.__kart.suggestSteer(id), { ...window.__kart.humanState(id), fps: window.__kart.fps }], ids[0]);
    const d = s * along * 0.3;
    // local +x maps to screen +y for vrot=90, -y for vrot=-90
    const [mx, my] = rot === 90 ? [cx, cy + d] : rot === -90 ? [cx, cy - d] : [cx + d, cy];
    await phones[0].mouse.move(mx, my);
    if (Date.now() - last > 4000) {
      last = Date.now();
      console.log(`t=${((Date.now() - t0) / 1000).toFixed(0)}s fps=${st.fps.toFixed(1)} dist=${st.dist.toFixed(0)} v=${st.speed.toFixed(1)} laps=${st.laps} steerIn=${st.input.toFixed(2)} off=${st.offroad} ww=${st.wrongWay}`);
      if (shots < 6) { await tv.screenshot({ path: `${out}/race-${shots}.png` }); shots++; }
    }
    if (st.finished) break;
    await phones[0].waitForTimeout(150);
  }
  await phones[0].mouse.up();
  const fin = await tv.evaluate(() => window.__kart.karts().filter((k) => k.human).map((k) => ({ name: k.name, finished: k.finished, place: k.place, laps: k.laps })));
  console.log('humans:', JSON.stringify(fin));
  if (!fin.every((k) => k.finished && k.laps >= Number(laps))) throw new Error('not every human finished');
  await tv.waitForFunction(() => window.__kart.phase === 'results', null, { timeout: 60000 });
  await tv.waitForTimeout(600);
  await tv.screenshot({ path: `${out}/placements.png` });
  console.log('placements:', (await tv.evaluate(() => window.__kart.ranking())).join(', '));
  // platform results -> admin presses "Play again" -> next track of the cup
  await phones[0].waitForSelector('#res-again', { timeout: 30000 });
  await tv.screenshot({ path: `${out}/results.png` });
  await phones[0].click('#res-again');
  await tv.waitForFunction(() => window.__kart.phase === 'intro', null, { timeout: 90000 });
  const next = await tv.evaluate(() => window.__kart.track);
  console.log('again -> next track:', next);
  if (next === trackId) throw new Error('cup flow did not advance to the next track');
  ok = true;
} catch (err) {
  errors.push(`[test] ${err.message}`);
} finally {
  await browser.close();
  console.log(errors.length ? `❌ ${errors.length} issue(s):\n${errors.slice(0, 25).join('\n')}` : '✅ no errors');
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok && !errors.length ? 0 : 1);
}
