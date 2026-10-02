#!/usr/bin/env node
// Deterministic Word Bomb test. Drives a full game through the real phone UI (typing into the input + Enter):
// invalid word, missing letters, blocked word, valid word, reused word, explosion, elimination, a disconnect during
// someone's turn (+ forfeit timeout), a late joiner (spectates, then plays the next game), the iOS keyboard layout,
// winner + results, and "play again".
//
//   node scripts/word-bomb-test.mjs        (screen runs with ?wbfast=1 => short fuses + test hooks on window.__wb)
//   env: SMOKE_URL=http://localhost:5xxx/ to reuse a running dev server
// Screenshots go to scripts/out/word-bomb-test/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isOffensive } from '../src/games/word-bomb/blocklist.js';

const ROOT = resolve(import.meta.dirname, '..');
const out = resolve(import.meta.dirname, 'out', 'word-bomb-test');
mkdirSync(out, { recursive: true });
const words = readFileSync(resolve(ROOT, 'public/assets/word-bomb/words.txt'), 'utf8').split('\n').filter(Boolean);
const used = new Set();
const pickWord = (p) => {
  const c = words.filter((w) => w.includes(p) && !used.has(w) && w.length <= 9 && !isOffensive(w));
  c.sort((a, b) => a.length - b.length);
  const w = c[Math.min(c.length - 1, 2 + Math.floor(Math.random() * 8))];
  used.add(w);
  return w;
};

let server = null;
let base = process.env.SMOKE_URL;
if (!base) {
  const port = 5400 + Math.floor(Math.random() * 600);
  server = spawn('npx', ['vite', '--config', 'scripts/word-bomb-vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  base = `http://localhost:${port}/`;
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); res(); } });
  });
}

const errors = [];
const checks = [];
const ok = (cond, msg) => { checks.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) errors.push(`check failed: ${msg}`); console.log(cond ? '  ✓' : '  ✗', msg); };
const room = 'W' + Math.random().toString(36).slice(2, 5).toUpperCase();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const context = await browser.newContext({ hasTouch: true });
const watch = (page, label) => {
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] console.error: ${m.text()}`); });
};
const PHONE = { width: 375, height: 667 }; // iPhone SE / 8: the smallest common portrait phone

async function joinPhone(name) {
  const p = await context.newPage();
  await p.setViewportSize(PHONE);
  watch(p, name);
  await p.goto(`${base}controller.html?local=1&room=${room}`);
  await p.fill('#name-input', name);
  await p.click('#join-btn');
  await p.waitForFunction(() => window.__party.me, null, { timeout: 10000 });
  return p;
}

try {
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1280, height: 720 });
  watch(screen, 'screen');
  await screen.goto(`${base}screen.html?local=1&room=${room}&wbfast=1`);
  await screen.waitForFunction(() => window.__party?.roomCode, null, { timeout: 20000 });

  const names = ['Alice', 'Bob', 'Chloe', 'Dan Moss'];
  const phones = new Map(); // player id -> page
  for (const name of names) {
    const p = await joinPhone(name);
    phones.set(await p.evaluate(() => window.__party.me.id), p);
  }
  await screen.waitForFunction((n) => window.__party.players().length >= n, names.length, { timeout: 10000 });
  await screen.evaluate(() => window.__party.loadGame('word-bomb'));
  await screen.waitForFunction(() => window.__wb, null, { timeout: 20000 });
  await screen.waitForTimeout(1200);
  await screen.screenshot({ path: `${out}/01-howto.png` });
  await [...phones.values()][0].screenshot({ path: `${out}/p01-intro.png` });
  await screen.waitForFunction(() => window.__wb.phase === 'play', null, { timeout: 25000 });
  ok(true, 'how-to + countdown reached play phase');

  const wb = () => screen.evaluate(() => ({ phase: window.__wb.phase, holder: window.__wb.holder, prompt: window.__wb.prompt, turnId: window.__wb.turnId, roster: window.__wb.roster(), explosions: window.__wb.explosions }));
  const waitPlay = () => screen.waitForFunction(() => window.__wb.phase === 'play', null, { timeout: 15000 });
  const fbText = (ph) => ph.textContent('.wbc-fb');
  const submit = async (ph, text, { slow = false } = {}) => {
    await ph.fill('.wbc-form input', '');
    if (slow) await ph.type('.wbc-form input', text, { delay: 40 });
    else await ph.fill('.wbc-form input', text);
    await ph.press('.wbc-form input', 'Enter');
  };
  const expectFb = (ph, re, label) => ph.waitForFunction((src) => new RegExp(src).test(document.querySelector('.wbc-fb')?.textContent || ''), re.source, { timeout: 4000 })
    .then(() => ok(true, label), async () => ok(false, `${label} (feedback: "${await fbText(ph)}")`));
  const force = (p) => screen.evaluate((x) => window.__wb.forcePrompt(x), p);

  // ---- phone views: your turn vs waiting (fuse held while the test types, released for explosions)
  await screen.evaluate(() => window.__wb.freeze(true));
  let s = await wb();
  let ph = phones.get(s.holder);
  await ph.waitForFunction(() => document.querySelector('.wbc')?.classList.contains('mine'), null, { timeout: 4000 });
  ok(/Your turn/i.test(await ph.textContent('.wbc-turn')), 'holder phone says "Your turn!"');
  const other = [...phones.entries()].find(([id]) => id !== s.holder)[1];
  ok(/has the bomb/.test(await other.textContent('.wbc-turn')), 'other phones say who has the bomb');
  ok((await other.textContent('.wbc-prompt .letters')).trim() === s.prompt.toUpperCase(), 'other phones show the current letters');

  // ---- invalid word
  await force('ing');
  s = await wb();
  await submit(ph, 'singqqx');
  await expectFb(ph, /Not a word/, 'invalid word rejected with "Not a word"');
  ok(await ph.inputValue('.wbc-form input') !== '', 'input text kept after an invalid word');
  await submit(ph, 'zzzzzz');
  await expectFb(ph, /Needs/, 'word missing the letters is caught on the phone');

  // ---- blocked word
  const bad = words.find((w) => isOffensive(w) && w.length >= 4);
  await force(bad.slice(1, 3));
  await ph.waitForTimeout(200); // the screen ignores submits closer than 150 ms apart
  await submit(ph, bad);
  await expectFb(ph, /Keep it clean/, 'offensive word rejected');

  // ---- live typing (TV pill + phone feedback) then a valid word
  await force('ing');
  await ph.fill('.wbc-form input', '');
  await ph.type('.wbc-form input', 'sin', { delay: 30 });
  await screen.waitForTimeout(250);
  ok(/Needs/.test(await fbText(ph)), 'live feedback: "Needs ING" while the letters are missing');
  await ph.type('.wbc-form input', 'ger', { delay: 30 });
  await screen.waitForTimeout(250);
  ok(/Got the letters/.test(await fbText(ph)), 'live feedback: letters found');
  ok(/SINGER/.test(await screen.textContent('.wb-pill')), 'TV shows the live typing');
  await screen.screenshot({ path: `${out}/02-typing.png` });
  await ph.screenshot({ path: `${out}/p02-turn-typing.png` });
  await other.screenshot({ path: `${out}/p03-waiting.png` });
  await ph.press('.wbc-form input', 'Enter');
  used.add('singer');
  await screen.waitForFunction((t) => window.__wb.turnId !== t, s.turnId, { timeout: 4000 });
  let s2 = await wb();
  ok(s2.holder !== s.holder, 'valid word passed the bomb to the next player');
  ok(s2.roster.find((r) => r.id === s.holder).words === 1, 'word recorded for the player');

  // ---- reused word
  await force('ing');
  ph = phones.get(s2.holder);
  await submit(ph, 'singer');
  await expectFb(ph, /Already used/, 'reused word rejected with "Already used"');

  // ---- a few more valid passes
  let passes = 0;
  for (let i = 0; i < 4; i++) {
    s = await wb();
    if (s.phase !== 'play') { await waitPlay(); s = await wb(); }
    ph = phones.get(s.holder);
    await submit(ph, pickWord(s.prompt), { slow: i === 0 });
    const moved = await screen.waitForFunction((t) => window.__wb.turnId !== t, s.turnId, { timeout: 4000 }).then(() => true, () => false);
    if (moved && (await wb()).holder !== s.holder) passes++;
  }
  ok(passes >= 3, `valid words keep passing the bomb (${passes}/4; a miss means the fuse blew mid-typing)`);

  // ---- explosion
  await screen.evaluate(() => window.__wb.freeze(false));
  s = await wb();
  if (s.phase !== 'play') { await waitPlay(); s = await wb(); }
  const before = s.roster.find((r) => r.id === s.holder).hearts;
  await screen.evaluate(() => window.__wb.fuseNow());
  await screen.waitForFunction(() => window.__wb.phase === 'boom', null, { timeout: 3000 });
  await screen.waitForTimeout(280);
  await screen.screenshot({ path: `${out}/03-explosion.png` });
  await phones.get(s.holder).screenshot({ path: `${out}/p04-boom.png` });
  s2 = await wb();
  ok(s2.roster.find((r) => r.id === s.holder).hearts === before - 1, 'explosion cost the holder exactly one life');
  await waitPlay();
  ok(true, 'new bomb armed after the explosion');
  await screen.waitForTimeout(600);
  await screen.screenshot({ path: `${out}/04-after-boom.png` });

  // ---- elimination: blow up whoever holds it until someone is out
  let victim = null;
  for (let i = 0; i < 12 && !victim; i++) {
    await waitPlay();
    s = await wb();
    await screen.evaluate(() => window.__wb.fuseNow());
    await screen.waitForFunction(() => window.__wb.phase !== 'play', null, { timeout: 3000 });
    victim = (await wb()).roster.find((r) => !r.alive && phones.has(r.id));
  }
  ok(!!victim, `a player was eliminated (${victim?.name})`);
  const vph = phones.get(victim.id);
  await vph.waitForFunction(() => /You're out/.test(document.querySelector('.wbc-out')?.textContent || ''), null, { timeout: 4000 })
    .then(() => ok(true, 'eliminated phone says "You\'re out" + spectating'), () => ok(false, 'eliminated phone says "You\'re out"'));
  await waitPlay();
  await vph.waitForTimeout(300);
  await vph.screenshot({ path: `${out}/p05-out.png` });
  ok((await wb()).holder !== victim.id, 'eliminated player is skipped');

  // ---- iOS keyboard: the visible area shrinks to ~330px; input + letters + status must stay visible
  await screen.evaluate(() => window.__wb.freeze(true));
  s = await wb();
  ph = phones.get(s.holder);
  await ph.focus('.wbc-form input');
  await ph.evaluate(() => {
    const vv = window.visualViewport;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => 330 });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => 0 });
    vv.dispatchEvent(new Event('resize'));
  });
  await ph.type('.wbc-form input', s.prompt, { delay: 20 });
  await ph.waitForTimeout(250);
  const kb = await ph.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    return { compact: document.querySelector('.wbc').classList.contains('compact'), input: r('.wbc-form input').bottom, letters: r('.wbc-prompt .letters').top, turn: r('.wbc-turn').top, go: r('.wbc-form button').bottom };
  });
  ok(kb.compact && kb.input <= 330 && kb.go <= 330 && kb.letters > 0 && kb.turn > 0, `keyboard up: status, letters, input and Go fit above the keyboard (input bottom ${Math.round(kb.input)}px of 330)`);
  await ph.screenshot({ path: `${out}/p06-keyboard.png`, clip: { x: 0, y: 0, width: PHONE.width, height: 330 } });
  await ph.evaluate(() => { const vv = window.visualViewport; delete vv.height; delete vv.offsetTop; vv.dispatchEvent(new Event('resize')); });

  // ---- late joiner spectates
  const late = await joinPhone('Latecomer');
  await late.waitForFunction(() => /Spectating/.test(document.querySelector('.wbc-out')?.textContent || ''), null, { timeout: 8000 })
    .then(() => ok(true, 'late joiner sees the spectating view'), () => ok(false, 'late joiner sees the spectating view'));
  await late.screenshot({ path: `${out}/p07-spectator.png` });
  ok((await screen.evaluate(() => window.__wb.spectators())).includes('Latecomer'), 'TV lists the late joiner for the next game');

  // ---- holder disconnects mid-turn -> bomb skips them instantly, same letters
  await screen.evaluate(() => window.__wb.freeze(false));
  await waitPlay();
  s = await wb();
  const leaver = s.holder;
  await phones.get(leaver).close({ runBeforeUnload: true });
  phones.delete(leaver);
  const skipped = await screen.waitForFunction((h) => window.__wb.holder !== h || window.__wb.phase !== 'play', leaver, { timeout: 2000 }).then(() => true, () => false);
  ok(skipped, 'disconnected holder is skipped instantly');
  s2 = await wb();
  if (s2.phase === 'play') ok(s2.prompt === s.prompt, 'the letters carry over to the next player');
  await screen.waitForTimeout(400);
  await screen.screenshot({ path: `${out}/05-disconnect.png` });
  // after the (fast) forfeit timeout the leaver is out for good, so they can't win by being away
  await screen.waitForFunction((id) => window.__wb.roster().find((r) => r.id === id)?.alive === false || window.__wb.phase === 'over', leaver, { timeout: 12000 })
    .then(() => ok(true, 'disconnected player forfeits after the timeout'), () => ok(false, 'disconnected player forfeits after the timeout'));

  // ---- play it out: blow up holders until there's a winner
  for (let i = 0; i < 20; i++) {
    const ph2 = await screen.evaluate(() => window.__wb.phase);
    if (ph2 === 'over') break;
    if (ph2 === 'play') await screen.evaluate(() => window.__wb.fuseNow());
    await screen.waitForTimeout(ph2 === 'play' ? 400 : 700);
  }
  await screen.waitForFunction(() => window.__wb.phase === 'over', null, { timeout: 10000 });
  await screen.waitForTimeout(900);
  await screen.screenshot({ path: `${out}/06-winner.png` });
  const fin = await wb();
  const winner = fin.roster.find((r) => r.alive && r.connected);
  ok(!!winner && fin.roster.filter((r) => r.alive).length === 1, `one survivor wins (${winner?.name})`);
  const wph = phones.get(winner.id);
  await wph.waitForFunction(() => /You win/.test(document.querySelector('.wbc-turn')?.textContent || ''), null, { timeout: 3000 })
    .then(() => ok(true, 'winner phone says "You win!"'), () => ok(false, 'winner phone says "You win!"'));
  await screen.waitForFunction(() => !document.querySelector('#results').hidden, null, { timeout: 15000 });
  ok(true, 'results overlay shown');
  const firstRow = await screen.evaluate(() => document.querySelector('#results')?.innerText || '');
  ok(firstRow.includes(winner.name), 'results list the winner');
  await screen.waitForTimeout(800);
  await screen.screenshot({ path: `${out}/07-results.png` });

  // ---- play again: the late joiner is in now
  await screen.click('#res-again');
  await screen.waitForFunction(() => window.__wb?.phase === 'intro', null, { timeout: 5000 }).then(() => ok(true, 'play again restarts with the intro'), () => ok(false, 'play again restarts'));
  const r2 = await screen.evaluate(() => ({ spec: window.__wb.spectators().length, names: window.__wb.roster().map((r) => r.name) }));
  ok(r2.spec === 0 && r2.names.includes('Latecomer') && !r2.names.includes(fin.roster.find((r) => r.id === leaver).name), 'late joiner plays the new game, the leaver is gone');
  await screen.waitForFunction(() => window.__wb.phase === 'play', null, { timeout: 25000 });
  ok(true, 'second game running');
  await screen.evaluate(() => window.__wb.freeze(true));
  s = await wb();
  const lateId = await late.evaluate(() => window.__party.me.id);
  const holderPage = s.holder === lateId ? late : phones.get(s.holder);
  await submit(holderPage, pickWord(s.prompt));
  await screen.waitForFunction((t) => window.__wb.turnId !== t, s.turnId, { timeout: 4000 }).then(() => ok(true, 'words work in the second game'), () => ok(false, 'words work in the second game'));
  await screen.waitForTimeout(500);
  await screen.screenshot({ path: `${out}/08-game2.png` });
  await screen.evaluate(() => window.__party.exitGame());
  await screen.waitForTimeout(400);
  ok(await screen.evaluate(() => !window.__wb && !document.querySelector('.wb-root')), 'destroy() cleaned up');
} catch (err) {
  errors.push(`[harness] ${err.stack || err.message}`);
} finally {
  await browser.close();
  server?.kill();
  console.log(errors.length ? `FAILED: ${errors.length} error(s):\n${errors.join('\n')}` : `OK: all ${checks.length} checks passed`);
  console.log(`screenshots: ${out}`);
  process.exit(errors.length ? 1 : 0);
}
