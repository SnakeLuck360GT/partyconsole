#!/usr/bin/env node
// Runs Party Board minigames in isolation via the hidden `_mgtest` game: 1 real phone (mashed randomly) + N bots.
//
//   node scripts/party-board-minigames-test.mjs [ids=all] [bots=3] [--shots=4] [--every=ms] [--first=ms] [--dur=s] [--abort=s] [--phones=1] [--log] [--url=…]
//
// Screenshots: scripts/out/mg/<id>/shot-*.png (+ phone.png). Prints errors, final scores, cleanup check.
import { chromium } from 'playwright';
import { mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const pos = args.filter((a) => !a.startsWith('--'));
const root = resolve(import.meta.dirname, '..');
let ids = pos[0] || 'all';
const bots = Number(pos[1] ?? 3);
const SHOTS = Number(flags.shots ?? 4);
const PHONES = Number(flags.phones ?? 1);
const ABORT = flags.abort ? Number(flags.abort) : 0;
if (ids === 'all') {
  ids = readdirSync(resolve(root, 'src/games/party-board/minigames')).filter((f) => f.endsWith('.js') && !f.startsWith('_') && f !== 'index.js').map((f) => f.replace(/\.js$/, '')).join(',');
}
const list = ids.split(',');

let server = null;
let base = flags.url || process.env.SMOKE_URL;
if (!base) {
  // Own Vite server with HMR off, so edits by other agents don't reload the page mid-test.
  const { createServer } = await import('vite');
  const port = 5400 + Math.floor(Math.random() * 600);
  server = await createServer({ root, configFile: resolve(root, 'scripts/party-board-vite.config.mjs'), logLevel: 'error', server: { port, strictPort: true, hmr: false, watch: null } });
  await server.listen();
  base = `http://localhost:${port}/`;
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
let failed = 0;

for (const id of list) {
  const out = resolve(root, 'scripts/out/mg', id);
  mkdirSync(out, { recursive: true });
  const errors = [];
  const context = await browser.newContext();
  const watch = (page, label) => {
    page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}\n${e.stack?.split('\n').slice(0, 4).join('\n')}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${label}] console.error: ${m.text()}`);
      if (flags.log && m.type() === 'log') console.log(`  [${label}] ${m.text()}`);
    });
  };
  const room = 'M' + Math.random().toString(36).slice(2, 5).toUpperCase();
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1280, height: 720 });
  watch(screen, 'screen');
  const t0 = Date.now();
  let run = null;
  try {
    await screen.goto(`${base}screen.html?local=1&room=${room}&mg=${id}&bots=${bots}${ABORT ? `&abort=${ABORT}` : ''}${flags.dur ? `&dur=${flags.dur}` : ''}`);
    await screen.waitForFunction(() => window.__party?.roomCode, null, { timeout: 15000 });
    const phones = [];
    for (let i = 0; i < PHONES; i++) {
      const p = await context.newPage();
      await p.setViewportSize({ width: 844, height: 390 });
      watch(p, `phone${i}`);
      await p.goto(`${base}controller.html?local=1&room=${room}`);
      await p.fill('#name-input', ['Alice', 'Bob', 'Chloe', 'Dmitri'][i % 4]);
      await p.click('#join-btn');
      phones.push(p);
    }
    await screen.waitForFunction((n) => window.__party.players().length >= n, PHONES, { timeout: 10000 });
    await screen.evaluate(() => window.__party.loadGame('_mgtest'));
    await screen.waitForFunction(() => window.__mgtest?.state === 'running', null, { timeout: 30000 });
    const loadMs = Date.now() - t0;
    await screen.waitForTimeout(1500);
    if (phones[0]) await phones[0].screenshot({ path: `${out}/phone.png` });

    const dur = Number(flags.secs || 75) * 1000;
    const tStart = Date.now();
    let shot = 0;
    const shotEvery = Number(flags.every || 7000);
    let nextShot = Number(flags.first || 3000);
    while (Date.now() - tStart < dur) {
      const st = await screen.evaluate(() => window.__mgtest.state === 'done' || window.__mgtest.runs.length > 0);
      if (st) break;
      await Promise.all(phones.map(async (p) => {
        try {
          const stick = await p.$('.pk-stick-zone, .pk-dpad');
          if (stick && Math.random() < 0.4) {
            const b = await stick.boundingBox();
            const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
            await p.mouse.move(cx, cy); await p.mouse.down();
            await p.mouse.move(cx + (Math.random() - 0.5) * 160, cy + (Math.random() - 0.5) * 160, { steps: 3 });
            await p.waitForTimeout(250); await p.mouse.up();
            return;
          }
          const btns = await p.$$('#play-area .pk-btn');
          if (btns.length) {
            const b = await btns[Math.floor(Math.random() * btns.length)].boundingBox();
            if (b) { await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.waitForTimeout(40 + Math.random() * 100); await p.mouse.up(); }
          }
        } catch { /* ignore */ }
      }));
      if (Date.now() - tStart >= nextShot && shot < SHOTS) {
        await screen.screenshot({ path: `${out}/shot-${shot}.png` });
        shot++;
        nextShot += shotEvery;
      }
    }
    await screen.waitForFunction(() => window.__mgtest.runs.length > 0, null, { timeout: 90000 });
    run = await screen.evaluate(() => window.__mgtest.runs[0]);
    const canvases = await screen.evaluate(() => document.querySelectorAll('canvas').length);
    await screen.waitForTimeout(600);
    await screen.screenshot({ path: `${out}/end.png` });
    const err = await screen.evaluate(() => window.__mgtest.error);
    if (err) errors.push(`[run] ${err}`);
    if (run.leftovers) errors.push(`[cleanup] ${run.leftovers} leftover element(s)`);
    if (canvases) errors.push(`[cleanup] ${canvases} canvas(es) still in DOM`);
    console.log(`${errors.length ? '❌' : '✅'} ${id}: load ${loadMs}ms, ran ${run.seconds.toFixed(1)}s${run.aborted ? ' (aborted)' : ''}, scores ${JSON.stringify(run.scores)}`);
  } catch (e) {
    errors.push(`[harness] ${e.message}`);
    console.log(`❌ ${id}: harness error`);
  }
  if (errors.length) { failed++; console.log('   ' + errors.join('\n   ')); }
  await context.close();
}
await browser.close();
await server?.close();
process.exit(failed ? 1 : 0);
