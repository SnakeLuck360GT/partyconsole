#!/usr/bin/env node
// Kart Chaos visual check: boots the TV + N phones, starts a race and saves screenshots of the flyover,
// countdown and racing (humans on autopilot), plus phone screenshots and an fps log.
//   node scripts/kart-shots.mjs [players=1] [track=meadow] [raceSeconds=8] [quality=low|high]
// env: SMOKE_URL=http://localhost:5391/ to reuse a running server (use scripts/kart-vite.config.mjs).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [nP = '1', trackId = 'meadow', secs = '8', quality = 'low'] = process.argv.slice(2);
const N = Number(nP);
const out = resolve(import.meta.dirname, 'out', 'kart-shots');
mkdirSync(out, { recursive: true });
let server = null;
let base = process.env.SMOKE_URL;
if (!base) {
  const port = 5600 + Math.floor(Math.random() * 300);
  server = spawn('npx', ['vite', '--config', 'scripts/kart-vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  base = `http://localhost:${port}/`;
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); res(); } });
  });
}
const errors = [];
const room = 'S' + Math.random().toString(36).slice(2, 5).toUpperCase();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext();
const watch = (p, l) => {
  p.on('pageerror', (e) => errors.push(`[${l}] ${e.message}\n${e.stack?.split('\n').slice(0, 3).join('\n')}`));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${l}] ${m.type()}: ${m.text()}`); });
};
const tag = `${N}p-${trackId}`;
try {
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1280, height: 720 });
  watch(screen, 'screen');
  const q = quality === 'high' ? '&kartLow=0' : '';
  const lobbyMode = process.env.LOBBY === '1';
  await screen.goto(`${base}screen.html?local=1&room=${room}${lobbyMode ? '' : '&kartAuto=1'}&kartTrack=${trackId}${q}${process.env.KART_EXTRA || ''}`);
  await screen.waitForFunction(() => window.__party?.roomCode, null, { timeout: 15000 });
  const phones = [];
  for (let i = 0; i < N; i++) {
    const p = await context.newPage();
    await p.setViewportSize({ width: 844, height: 390 });
    watch(p, `phone${i}`);
    await p.goto(`${base}controller.html?local=1&room=${room}`);
    await p.fill('#name-input', ['Alice', 'Bob', 'Chloe', 'Dmitri', 'Eve'][i]);
    await p.click('#join-btn');
    phones.push(p);
  }
  await screen.waitForFunction((n) => window.__party.players().length >= n, N, { timeout: 10000 });
  await screen.evaluate(() => window.__party.loadGame('kart'));
  await screen.waitForFunction(() => window.__kart?.phase === 'lobby', null, { timeout: 60000 });
  await screen.waitForTimeout(lobbyMode ? 6000 : 400);
  if (lobbyMode) {
    // pick a different driver on phone 1 (swipe) and set ready on phone 0
    if (phones[1]) { await phones[1].click('.kc-nav.n').catch(() => {}); await phones[1].waitForTimeout(300); await phones[1].click('.kc-nav.n').catch(() => {}); }
    await phones[0].click('.kc-tabs button[data-t=kart]').catch(() => {});
    await phones[0].click('.kc-nav.n').catch(() => {});
    await phones[0].waitForTimeout(1500);
    await phones[0].screenshot({ path: `${out}/${tag}-phone-select.png` });
    await phones[0].click('.kc-ready').catch(() => {});
    await screen.waitForTimeout(2500);
  }
  await screen.screenshot({ path: `${out}/${tag}-lobby.png` });
  await phones[0].screenshot({ path: `${out}/${tag}-phone-lobby.png` });
  if (lobbyMode) await screen.evaluate(() => window.__kart.start());
  await screen.waitForFunction(() => window.__kart?.phase === 'intro', null, { timeout: 90000 });
  await screen.waitForTimeout(2500);
  await screen.screenshot({ path: `${out}/${tag}-intro.png` });
  await screen.waitForFunction(() => window.__kart?.phase === 'countdown', null, { timeout: 30000 });
  await screen.waitForTimeout(1600);
  await screen.screenshot({ path: `${out}/${tag}-countdown.png` });
  await phones[0].screenshot({ path: `${out}/${tag}-phone-countdown.png` });
  await screen.waitForFunction(() => window.__kart?.phase === 'race', null, { timeout: 30000 });
  await screen.evaluate(() => window.__kart.autopilot('all'));
  const S = Number(secs);
  for (let i = 0; i < 3; i++) {
    await screen.waitForTimeout((S * 1000) / 3);
    await screen.screenshot({ path: `${out}/${tag}-race-${i}.png` });
    const st = await screen.evaluate(() => ({ fps: window.__kart.fps, ms: window.__kart.frameMs, t: window.__kart.raceTime, k: window.__kart.karts().filter((k) => k.human).map((k) => `${k.name} d=${k.dist.toFixed(0)} v=${k.speed.toFixed(1)} vis=${k.visible}`) }));
    console.log(`race ${i}: fps=${st.fps.toFixed(1)} cpu=${st.ms.toFixed(1)}ms t=${st.t.toFixed(1)}`, st.k.join(' | '));
  }
  await phones[0].screenshot({ path: `${out}/${tag}-phone-race.png` });
} catch (err) {
  errors.push(`[harness] ${err.message}`);
} finally {
  await browser.close();
  server?.kill();
  console.log(errors.length ? `❌ ${errors.length} issue(s):\n${errors.slice(0, 30).join('\n')}` : '✅ no errors');
  console.log(`screenshots: ${out}/${tag}-*`);
}
