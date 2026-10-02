#!/usr/bin/env node
// Deterministic Party Board run: screen + N phones that answer every prompt sensibly.
// Goes through the length picker, a short game (rolls, moving, spaces, shop, duels, star), one forced minigame per
// round (covering team / movement / memory / reflex games), a player leaving, a late join, the bonus stars and results.
//
//   node scripts/party-board-test.mjs [players=4] [turns=3] [maxSeconds=900]
//   env: SMOKE_URL (else starts its own no-HMR vite on a random port 5400-5999), PB_FAST (board speed, default 3),
//        PB_MG (comma list of minigame ids, one per round), PB_SEED (default 7), PB_TAG (output subfolder)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const [nPlayers = '4', nTurns = '3', maxSecs = '900'] = process.argv.slice(2);
const N = Number(nPlayers);
const root = resolve(import.meta.dirname, '..');
const out = resolve(import.meta.dirname, 'out', 'party-board-test', process.env.PB_TAG || `p${N}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const MG = process.env.PB_MG || 'tug-rumble,coin-rush,memory-mix,hot-lava-hop,pump-it-up';
const NAMES = ['Alice', 'Bob', 'Chloe', 'Dmitri', 'Eve', 'Farah', 'Gus', 'Hana', 'Ivan', 'Jade', 'Kofi', 'Lena', 'Milo', 'Nia'];

let server = null;
let base = process.env.SMOKE_URL;
if (!base) {
  const { createServer } = await import('vite');
  const port = 5400 + Math.floor(Math.random() * 600);
  server = await createServer({ root, configFile: resolve(root, 'scripts/party-board-vite.config.mjs'), logLevel: 'error', server: { port, strictPort: true, hmr: false, watch: null } });
  await server.listen();
  base = `http://localhost:${port}/`;
}

const errors = [];
const room = 'PB' + Math.random().toString(36).slice(2, 4).toUpperCase();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
const context = await browser.newContext();
const watch = (page, label) => {
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}\n${e.stack?.split('\n').slice(0, 3).join('\n')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebGL|GPU stall|favicon/i.test(m.text())) errors.push(`[${label}] console.error: ${m.text()}`); });
};

const shots = new Set();
async function shot(page, name) { if (shots.has(name)) return; shots.add(name); try { await page.screenshot({ path: `${out}/${name}.png` }); } catch { /* closed */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function joinPhone(name, { portrait = false } = {}) {
  const p = await context.newPage();
  await p.setViewportSize(portrait ? { width: 390, height: 844 } : { width: 844, height: 390 });
  watch(p, name);
  await p.goto(`${base}controller.html?local=1&room=${room}`);
  await p.fill('#name-input', name);
  await p.click('#join-btn');
  return p;
}

/** One phone acts on whatever it currently shows. Returns the view it handled. */
async function act(p, i) {
  const sel = await p.evaluate(() => {
    const q = (s) => { const e = document.querySelector(s); return e && !e.disabled ? s : null; };
    if (document.querySelector('.pk-gamepad')) return 'pad';
    return q('[data-t]') || q('.pbc-hit') || q('.pbc-duel.go') || q('.pbc-ready') || q('[data-y="1"]')
      || q('.pbc-card .pbc-btn:not([disabled])') || q('[data-leave]') || q('.pbc-row [data-i]') || null;
  });
  if (!sel) return null;
  if (sel === 'pad') {
    const btns = await p.$$('#play-area .pk-btn');
    const stick = await p.$('#play-area .pk-stick-zone, #play-area .pk-dpad');
    if (stick && Math.random() < 0.45) {
      const b = await stick.boundingBox();
      if (!b) return 'pad';
      const cx = b.x + b.width / 2; const cy = b.y + b.height / 2;
      await p.mouse.move(cx, cy); await p.mouse.down();
      await p.mouse.move(cx + (Math.random() - 0.5) * 120, cy + (Math.random() - 0.5) * 120, { steps: 2 });
      await sleep(200); await p.mouse.up();
    } else if (btns.length) {
      for (let k = 0; k < 4; k++) { // mash
        const b = await btns[Math.floor(Math.random() * btns.length)].boundingBox();
        if (!b) break;
        await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await sleep(35); await p.mouse.up(); await sleep(35);
      }
    }
    return 'pad';
  }
  const view = await p.evaluate(() => {
    const m = document.querySelector('.pbc-main');
    if (document.querySelector('.pbc-shop')) return 'shop';
    if (document.querySelector('.pbc-turns')) return 'setup';
    if (document.querySelector('.pbc-hit')) return 'roll';
    if (document.querySelector('.pbc-duel')) return 'duel';
    if (document.querySelector('.pbc-ready')) return 'mgintro';
    if (document.querySelector('[data-y]')) return 'confirm';
    if (document.querySelector('.pbc-row [data-i]')) return 'choice';
    return m ? 'other' : null;
  });
  await shot(p, `phone-${view}`);
  if (view === 'mgintro' && SCREEN) await shot(SCREEN, `mg-intro-card-${mgIntroCount}`);
  if (['shop', 'confirm', 'choice', 'duel'].includes(view) && SCREEN) await shot(SCREEN, `tv-${view}`);
  await sleep(120 + i * 50);
  const target = sel === '[data-t]' ? '[data-t="5"]' : sel; // pick the Quick game
  const el = await p.$(target);
  const b = el && await el.boundingBox();
  if (b) { await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.up(); }
  return view;
}

let ok = false;
let SCREEN = null;
let mgIntroCount = 0;
try {
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1280, height: 720 });
  watch(screen, 'screen');
  SCREEN = screen;
  const q = `local=1&room=${room}&pbfast=${process.env.PB_FAST || 3}&pbseed=${process.env.PB_SEED || 7}&pbturns=${nTurns}&pbsetup=1&pbmg=${MG}`;
  await screen.goto(`${base}screen.html?${q}`);
  await screen.waitForFunction(() => window.__party?.roomCode, null, { timeout: 15000 });
  const phones = [];
  for (let i = 0; i < N; i++) phones.push(await joinPhone(NAMES[i % NAMES.length] + (i >= NAMES.length ? i : '')));
  await screen.waitForFunction((n) => window.__party.players().length >= n, N, { timeout: 20000 });
  await screen.evaluate(() => window.__party.loadGame('party-board'));
  await screen.waitForFunction(() => window.__pb, null, { timeout: 90000 });
  console.log('game loaded');
  await sleep(2500);
  await shot(screen, 'setup');
  await shot(phones[0], 'phone-setup-admin');
  if (phones[1]) await shot(phones[1], 'phone-setup-wait');

  const t0 = Date.now();
  let lastPhase = '';
  let lastTurn = -1;
  let logSeen = 0;
  const mgShots = new Map();
  let left = false;
  let late = null;
  let loop = 0;
  while (Date.now() - t0 < Number(maxSecs) * 1000) {
    loop++;
    const st = await screen.evaluate(() => ({ phase: window.__pb?.phase, turn: window.__pb?.turn, mg: window.__pb?.minigame, log: window.__pb?.log || [], results: !!document.querySelector('#results') && !document.querySelector('#results').hidden, modal: !!document.querySelector('.pb-modal'), banner: !!document.querySelector('.pb-banner') }));
    if (st.results) { await sleep(1500); await shot(screen, 'final-results'); await shot(phones[0], 'phone-results'); ok = true; break; }
    if (st.phase !== lastPhase || st.turn !== lastTurn) { console.log(`t=${((Date.now() - t0) / 1000).toFixed(0)}s phase=${st.phase} turn=${st.turn}`); lastPhase = st.phase; lastTurn = st.turn; }
    // screenshot the first occurrence of every logged event
    for (; logSeen < st.log.length; logSeen++) {
      const ev = st.log[logSeen];
      const key = ev.replace(/:\d+$/, '').replace(/^roll.*/, 'roll');
      if (!shots.has(`ev-${key}`)) { await sleep(450); await shot(screen, `ev-${key}`); }
    }
    if (st.phase === 'turns' && st.turn === 1 && st.banner) await shot(screen, 'turn-banner');
    if (st.phase === 'turns' && !st.modal && !st.banner && loop % 5 === 0) await shot(screen, `board-t${st.turn}`);
    if (st.phase === 'minigame' && st.modal && !st.mg) {
      const card = await screen.evaluate(() => !!document.querySelector('.pb-ready'));
      if (card) await shot(screen, `mg-intro-${st.log.filter((l) => l.startsWith('minigame:')).length}`);
    }
    mgIntroCount = st.log.filter((l) => l.startsWith('minigame:')).length;
    if (st.mg) {
      const id = st.log.filter((l) => l.startsWith('minigame:')).pop()?.split(':')[1] || 'mg';
      const n = mgShots.get(id) || 0;
      const since = mgShots.get(`${id}-t`) || Date.now();
      if (!mgShots.has(`${id}-t`)) mgShots.set(`${id}-t`, Date.now());
      if (n < 3 && Date.now() - since > 9000 + n * 9000) { await shot(screen, `mg-${id}-${n}`); mgShots.set(id, n + 1); if (n === 0) await shot(phones[0], `phone-pad-${id}`); }
    }
    if (st.phase === 'minigame' && !st.mg && st.modal) {
      const res = await screen.evaluate(() => [...document.querySelectorAll('.pb-sheet h1')].some((h) => h.textContent === 'Results'));
      if (res) { await shot(screen, `mg-results-${st.log.filter((l) => l.startsWith('minigame:')).length}`); for (const p of phones) { const v = await p.evaluate(() => !!document.querySelector('.pbc-place')).catch(() => false); if (v) { await shot(p, 'phone-mgresult'); break; } } }
    }
    if (st.phase === 'end') await shot(screen, `end-${Math.floor((Date.now() - t0) / 4000)}`);
    // A player leaves during turn 2, and a latecomer joins (gets a piece at the next turn).
    if (!left && st.phase === 'turns' && st.turn >= 2 && N >= 3) {
      left = true;
      const gone = phones.pop();
      await gone.close({ runBeforeUnload: true });
      console.log('phone left');
      late = await joinPhone('Latecomer', { portrait: true });
      phones.push(late);
      console.log('late join');
      await sleep(2500);
      await shot(late, 'phone-late-portrait');
      await shot(screen, 'after-leave-join');
    }
    await Promise.all(phones.map((p, i) => act(p, i).catch(() => null)));
    await sleep(250);
  }
  const final = await screen.evaluate(() => ({ pieces: window.__pb?.pieces, log: window.__pb?.log }));
  console.log('pieces', JSON.stringify(final.pieces));
  const counts = {};
  for (const l of final.log || []) { const k = l.replace(/:\d+$/, ''); counts[k] = (counts[k] || 0) + 1; }
  console.log('events', JSON.stringify(counts));
  writeFileSync(`${out}/log.json`, JSON.stringify(final, null, 2));
  if (!ok) errors.push('[harness] did not reach the results screen in time');
  await screen.evaluate(() => window.__party.exitGame());
  await sleep(800);
  const leftovers = await screen.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length, pb: !!window.__pb, styles: [...document.querySelectorAll('style')].filter((s) => /pb-hud|pbc/.test(s.textContent)).length }));
  if (leftovers.pb || leftovers.styles) errors.push(`[cleanup] leftovers after exit: ${JSON.stringify(leftovers)}`);
} catch (err) {
  errors.push(`[harness] ${err.message}`);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ players: N, errors }, null, 2));
  await browser.close();
  await server?.close();
  console.log(errors.length ? `FAIL ${errors.length} error(s):\n${errors.slice(0, 30).join('\n')}` : 'OK no errors');
  process.exit(errors.length ? 1 : 0);
}
