#!/usr/bin/env node
// Deterministic Party Board run: screen + N phones that answer every prompt sensibly.
// Plays a short game (?pbturns=N, default 2) incl. minigames and the ending, saving screenshots.
//
//   node scripts/party-board-test.mjs [players=3] [turns=2] [maxSeconds=420]
//   env: SMOKE_URL (else starts vite), PB_FAST (animation speed, default 3), PB_MG (force minigame id)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [nPlayers = '3', nTurns = '2', maxSecs = '420'] = process.argv.slice(2);
const N = Number(nPlayers);
const out = resolve(import.meta.dirname, 'out', 'party-board-test');
mkdirSync(out, { recursive: true });

let server = null;
let base = process.env.SMOKE_URL;
if (!base) {
  const port = 5300 + Math.floor(Math.random() * 600);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  base = `http://localhost:${port}/`;
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); res(); } });
  });
}

const errors = [];
const room = 'PB' + Math.random().toString(36).slice(2, 4).toUpperCase();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext();
const watch = (page, label) => {
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] console.error: ${m.text()}`); });
};

const shots = new Set();
async function shot(page, name) { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${out}/${name}.png` }); }

try {
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1280, height: 720 });
  watch(screen, 'screen');
  const q = `local=1&room=${room}&pbfast=${process.env.PB_FAST || 3}&pbseed=7&pbturns=${nTurns}${process.env.PB_MG ? `&pbmg=${process.env.PB_MG}` : ''}`;
  await screen.goto(`${base}screen.html?${q}`);
  await screen.waitForFunction(() => window.__party?.roomCode, null, { timeout: 15000 });
  const phones = [];
  for (let i = 0; i < N; i++) {
    const p = await context.newPage();
    await p.setViewportSize({ width: 844, height: 390 });
    watch(p, `phone${i}`);
    await p.goto(`${base}controller.html?local=1&room=${room}`);
    await p.fill('#name-input', ['Alice', 'Bob', 'Chloe', 'Dmitri', 'Eve', 'Farah', 'Gus', 'Hana', 'Ivan', 'Jade'][i % 10]);
    await p.click('#join-btn');
    phones.push(p);
  }
  await screen.waitForFunction((n) => window.__party.players().length >= n, N, { timeout: 15000 });
  await screen.evaluate(() => window.__party.loadGame('party-board'));
  await screen.waitForFunction(() => window.__pb, null, { timeout: 60000 });
  console.log('game loaded');

  const t0 = Date.now();
  let lastPhase = '';
  let lastTurn = -1;
  let n = 0;
  let mgShots = 0;
  while (Date.now() - t0 < Number(maxSecs) * 1000) {
    const st = await screen.evaluate(() => ({ phase: window.__pb?.phase, turn: window.__pb?.turn, mg: window.__pb?.minigame, results: !document.querySelector('#results')?.hidden }));
    if (st.results) { await screen.waitForTimeout(1200); await shot(screen, 'final-results'); await shot(phones[0], 'phone-results'); break; }
    if (st.phase !== lastPhase || st.turn !== lastTurn) { console.log(`t=${((Date.now() - t0) / 1000).toFixed(0)}s phase=${st.phase} turn=${st.turn}`); lastPhase = st.phase; lastTurn = st.turn; }
    if (st.mg && mgShots < 3 && n % 6 === 0) { await shot(screen, `minigame-${mgShots}`); if (mgShots === 0) await shot(phones[0], 'phone-gamepad'); mgShots++; }
    // Phones act
    await Promise.all(phones.map(async (p, i) => {
      try {
        const sel = await p.evaluate(() => {
          const q = (s) => { const e = document.querySelector(s); return e && !e.disabled ? s : null; };
          return q('.pbc-hit') || q('.pbc-duel.go') || q('.pbc-ready') || q('[data-y="1"]') || q('.pbc-card .pbc-btn:not([disabled])') || q('[data-leave]') || q('.pbc-row [data-i="0"]') || q('[data-t="10"]') || (document.querySelector('.pk-gamepad') ? 'pad' : null);
        });
        if (!sel) return;
        if (sel === 'pad') {
          const btn = await p.$('.pk-btn');
          const stick = await p.$('.pk-stick-zone');
          if (stick && Math.random() < 0.5) {
            const b = await stick.boundingBox();
            await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
            await p.mouse.down();
            await p.mouse.move(b.x + b.width / 2 + (Math.random() - 0.5) * 150, b.y + b.height / 2 + (Math.random() - 0.5) * 150, { steps: 2 });
            await p.waitForTimeout(250);
            await p.mouse.up();
          } else if (btn) {
            const b = await btn.boundingBox();
            await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
            await p.mouse.down();
            await p.waitForTimeout(40);
            await p.mouse.up();
          }
          return;
        }
        // screenshot each phone view type once
        const view = sel.replace(/[^a-z]/gi, '').slice(0, 12);
        if (i === 0 || !shots.has(`phone-${view}`)) await shot(p, `phone-${view}`);
        await p.waitForTimeout(150 + i * 60);
        const el = await p.$(sel);
        const b = el && await el.boundingBox();
        if (b) { await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.up(); }
      } catch { /* re-rendered */ }
    }));
    n++;
    if (n % 4 === 0) await screen.screenshot({ path: `${out}/screen-${String(n / 4).padStart(3, '0')}.png` });
    await screen.waitForTimeout(300);
  }
  const pieces = await screen.evaluate(() => window.__pb?.pieces);
  console.log('pieces', JSON.stringify(pieces));
  await screen.evaluate(() => window.__party.exitGame());
  await screen.waitForTimeout(500);
} catch (err) {
  errors.push(`[harness] ${err.message}`);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ players: N, errors }, null, 2));
  await browser.close();
  server?.kill();
  console.log(errors.length ? `❌ ${errors.length} error(s):\n${errors.slice(0, 30).join('\n')}` : '✅ no errors');
  process.exit(errors.length ? 1 : 0);
}
