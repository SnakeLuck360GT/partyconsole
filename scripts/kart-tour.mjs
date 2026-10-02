#!/usr/bin/env node
// Kart Chaos visual tour: real-hardware-like settings (kartLow=0, deviceScaleFactor 2), N humans on autopilot,
// teleported to several spots around the track; saves a screenshot at each spot.
//   node scripts/kart-tour.mjs [players=1] [track=meadow] [spots=5] [tag=]
// env: SMOKE_URL=http://localhost:5391/ (server started with scripts/kart-vite.config.mjs), DPR=2
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [nP = '1', trackId = 'meadow', spotsArg = '5', tagArg = ''] = process.argv.slice(2);
const N = Number(nP);
const SPOTS = Number(spotsArg);
const base = process.env.SMOKE_URL || 'http://localhost:5391/';
const out = resolve(import.meta.dirname, 'out', 'kart-tour');
mkdirSync(out, { recursive: true });
const errors = [];
const room = 'V' + Math.random().toString(36).slice(2, 5).toUpperCase();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const watch = (p, l) => {
  p.on('pageerror', (e) => errors.push(`[${l}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${l}] console: ${m.text()}`); });
};
const tag = `${N}p-${trackId}${tagArg ? `-${tagArg}` : ''}`;
try {
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: Number(process.env.DPR || 2) });
  const tv = await tvCtx.newPage();
  watch(tv, 'tv');
  await tv.goto(`${base}screen.html?local=1&room=${room}&kartAuto=1&kartTrack=${trackId}&kartLow=0&kartDebug=nofly${process.env.KART_EXTRA || ''}`);
  await tv.waitForFunction(() => window.__party?.roomCode, null, { timeout: 15000 });
  const phones = [];
  for (let i = 0; i < N; i++) {
    const p = await tvCtx.newPage();
    await p.setViewportSize({ width: 844, height: 390 });
    watch(p, `phone${i}`);
    await p.goto(`${base}controller.html?local=1&room=${room}`);
    await p.fill('#name-input', ['Alice', 'Bob', 'Chloe', 'Dmitri', 'Eve', 'Farah', 'Gus', 'Hana'][i]);
    await p.click('#join-btn');
    phones.push(p);
  }
  await tv.waitForFunction((n) => window.__party.players().length >= n, N, { timeout: 10000 });
  await tv.evaluate(() => window.__party.loadGame('kart'));
  await tv.waitForFunction(() => window.__kart?.phase === 'race', null, { timeout: 180000 });
  const ids = await Promise.all(phones.map((p) => p.evaluate(() => window.__party.me.id)));
  await tv.evaluate(() => window.__kart.autopilot('all'));
  await tv.waitForTimeout(2500);
  await tv.screenshot({ path: `${out}/${tag}-start.png` });
  const L = await tv.evaluate(() => window.__kart.trackL());
  for (let s = 0; s < SPOTS; s++) {
    const d = ((s + 0.5) / SPOTS) * L * 0.98;
    // spread the humans a little apart so every viewport shows a different spot
    await tv.evaluate(([list, dist, Lt]) => list.forEach((id, i) => window.__kart.setDist(id, (dist + i * Lt * 0.07) % Lt)), [ids, d, L]);
    await tv.waitForTimeout(2600);
    await tv.screenshot({ path: `${out}/${tag}-spot${s}.png` });
    const fps = await tv.evaluate(() => window.__kart.fps);
    console.log(`spot ${s} d=${d.toFixed(0)} fps=${fps.toFixed(1)}`);
  }
} catch (err) {
  errors.push(`[harness] ${err.message}`);
} finally {
  await browser.close();
  console.log(errors.length ? `issues (${errors.length}):\n${errors.slice(0, 20).join('\n')}` : 'no errors');
  console.log(`screenshots: ${out}/${tag}-*`);
}
