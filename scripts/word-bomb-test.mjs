#!/usr/bin/env node
// Deterministic Word Bomb test: phones submit VALID dictionary words and the test checks turn passing, rejections,
// explosions, holder disconnect, a mid-game spectator, the win/results flow and "play again".
//
//   node scripts/word-bomb-test.mjs        (screen runs with ?wbfast=1 => short fuses)
// Screenshots go to scripts/out/word-bomb-test/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(import.meta.dirname, 'out', 'word-bomb-test');
mkdirSync(out, { recursive: true });
const words = readFileSync(resolve(import.meta.dirname, '..', 'public/assets/word-bomb/words.txt'), 'utf8').split('\n').filter(Boolean);
const used = new Set();
const pickWord = (p) => {
  const c = words.filter((w) => w.includes(p) && !used.has(w) && w.length <= 9);
  c.sort((a, b) => a.length - b.length);
  return c[Math.min(c.length - 1, 3 + Math.floor(Math.random() * 10))];
};

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
const checks = [];
const ok = (cond, msg) => { checks.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) errors.push(`check failed: ${msg}`); console.log(cond ? '  ✓' : '  ✗', msg); };
const room = 'W' + Math.random().toString(36).slice(2, 5).toUpperCase();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const context = await browser.newContext();
const watch = (page, label) => {
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] console.error: ${m.text()}`); });
};

try {
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1280, height: 720 });
  watch(screen, 'screen');
  await screen.goto(`${base}screen.html?local=1&room=${room}&wbfast=1`);
  await screen.waitForFunction(() => window.__party?.roomCode, null, { timeout: 20000 });

  const names = ['Alice', 'Bob', 'Chloe'];
  const phones = new Map(); // player id -> page
  for (const name of names) {
    const p = await context.newPage();
    await p.setViewportSize({ width: 390, height: 780 });
    watch(p, name);
    await p.goto(`${base}controller.html?local=1&room=${room}`);
    await p.fill('#name-input', name);
    await p.click('#join-btn');
    await p.waitForFunction(() => window.__party.me, null, { timeout: 10000 });
    phones.set(await p.evaluate(() => window.__party.me.id), p);
  }
  await screen.waitForFunction((n) => window.__party.players().length >= n, names.length, { timeout: 10000 });
  await screen.evaluate(() => window.__party.loadGame('word-bomb'));
  await screen.waitForFunction(() => window.__wb, null, { timeout: 20000 });
  await screen.waitForTimeout(1500);
  await screen.screenshot({ path: `${out}/howto.png` });
  await screen.waitForFunction(() => window.__wb.phase === 'play', null, { timeout: 20000 });
  ok(true, 'how-to + countdown reached play phase');

  const wb = () => screen.evaluate(() => ({ phase: window.__wb.phase, holder: window.__wb.holder, prompt: window.__wb.prompt, turnId: window.__wb.turnId, hearts: window.__wb.hearts(), words: window.__wb.words() }));

  // ---- invalid word first
  let s = await wb();
  let ph = phones.get(s.holder);
  await ph.fill('.wbc-form input', `${s.prompt}qqxq`);
  await ph.press('.wbc-form input', 'Enter');
  await ph.waitForFunction(() => /Not a word/.test(document.querySelector('.wbc-fb')?.textContent || ''), null, { timeout: 4000 }).then(() => ok(true, 'invalid word rejected with "Not a word"'), () => ok(false, 'invalid word rejected'));
  ok(await ph.inputValue('.wbc-form input') !== '', 'input text kept after invalid word');
  await ph.fill('.wbc-form input', 'zzzzzz');
  await ph.press('.wbc-form input', 'Enter');
  ok(/Must contain/.test(await ph.textContent('.wbc-fb')), 'word missing the prompt is caught on the phone');

  // ---- valid words pass the bomb around
  let passes = 0;
  for (let i = 0; i < 6; i++) {
    s = await wb();
    if (s.phase !== 'play') { await screen.waitForFunction(() => window.__wb.phase === 'play', null, { timeout: 15000 }); s = await wb(); }
    ph = phones.get(s.holder);
    const w = pickWord(s.prompt);
    used.add(w);
    await ph.fill('.wbc-form input', '');
    await ph.type('.wbc-form input', w, { delay: 15 });
    if (i === 1) await screen.screenshot({ path: `${out}/typing.png` });
    await ph.press('.wbc-form input', 'Enter');
    const moved = await screen.waitForFunction((t) => window.__wb.turnId !== t, s.turnId, { timeout: 4000 }).then(() => true, () => false);
    const s2 = await wb();
    if (moved && s2.holder !== s.holder && s2.prompt) passes++;
  }
  ok(passes >= 4, `valid words passed the bomb (${passes}/6 passes; misses only if the fuse blew mid-typing)`);
  const totalWords = Object.values((await wb()).words).reduce((a, b) => a + b, 0);
  ok(totalWords >= 3, `words recorded (${totalWords})`);

  // ---- already used
  s = await wb();
  const reuse = [...used].find((w) => w.includes(s.prompt));
  if (reuse && s.phase === 'play') {
    ph = phones.get(s.holder);
    await ph.fill('.wbc-form input', reuse);
    await ph.press('.wbc-form input', 'Enter');
    await ph.waitForFunction(() => /Already used/.test(document.querySelector('.wbc-fb')?.textContent || ''), null, { timeout: 3000 }).then(() => ok(true, 'reused word rejected'), () => ok(false, 'reused word rejected'));
  }

  // ---- explosion
  await screen.waitForFunction(() => window.__wb.phase === 'boom', null, { timeout: 20000 });
  await screen.waitForTimeout(250);
  await screen.screenshot({ path: `${out}/explosion.png` });
  const { sum, ex } = await screen.evaluate(() => ({ sum: Object.values(window.__wb.hearts()).reduce((a, b) => a + b, 0), ex: window.__wb.explosions }));
  ok(sum === names.length * 3 - ex && ex >= 1, `each explosion cost exactly one heart (${ex} explosions, ${sum} hearts left)`);
  await screen.waitForFunction(() => window.__wb.phase === 'play', null, { timeout: 8000 });
  ok(true, 'new bomb armed after explosion');
  await screen.screenshot({ path: `${out}/after-boom.png` });

  // ---- mid-game joiner becomes a spectator
  const late = await context.newPage();
  watch(late, 'late');
  await late.setViewportSize({ width: 390, height: 780 });
  await late.goto(`${base}controller.html?local=1&room=${room}`);
  await late.fill('#name-input', 'Latecomer');
  await late.click('#join-btn');
  await late.waitForFunction(() => /Spectating/.test(document.querySelector('.wbc-status')?.textContent || ''), null, { timeout: 8000 }).then(() => ok(true, 'late joiner sees spectator view'), () => ok(false, 'late joiner sees spectator view'));
  await late.screenshot({ path: `${out}/phone-spectator.png` });

  // ---- holder disconnects -> bomb passes instantly
  s = await wb();
  if (s.phase !== 'play') { await screen.waitForFunction(() => window.__wb.phase === 'play', null, { timeout: 8000 }); s = await wb(); }
  await phones.get(s.holder).screenshot({ path: `${out}/phone-turn.png` });
  await phones.get(s.holder).close({ runBeforeUnload: true });
  phones.delete(s.holder);
  const passed = await screen.waitForFunction((h) => window.__wb.holder !== h || window.__wb.phase !== 'play', s.holder, { timeout: 3000 }).then(() => true, () => false);
  ok(passed, 'disconnected holder skipped instantly');
  for (const [, p] of phones) await p.screenshot({ path: `${out}/phone-waiting.png` }).catch(() => {});

  // ---- nobody answers any more: explosions until a winner (or the lonely-survivor timeout)
  await screen.waitForFunction(() => !document.querySelector('#results').hidden, null, { timeout: 150000, polling: 500 });
  ok(true, 'results overlay shown');
  await screen.screenshot({ path: `${out}/results.png` });
  const resPhone = [...phones.values()][0];
  await resPhone.waitForTimeout(500);
  await resPhone.screenshot({ path: `${out}/phone-results.png` });

  // ---- play again
  await screen.click('#res-again');
  await screen.waitForFunction(() => window.__wb?.phase === 'intro', null, { timeout: 5000 }).then(() => ok(true, 'play again restarts with intro'), () => ok(false, 'play again restarts'));
  const spec = await screen.evaluate(() => window.__wb.spectators().length);
  ok(spec === 0, 'spectators folded into the new game');
  await screen.waitForFunction(() => window.__wb.phase === 'play', null, { timeout: 20000 });
  ok(true, 'second game running');
  await screen.screenshot({ path: `${out}/game2.png` });
  await screen.evaluate(() => window.__party.exitGame());
  await screen.waitForTimeout(400);
  ok(await screen.evaluate(() => !window.__wb), 'destroy() cleaned up');
} catch (err) {
  errors.push(`[harness] ${err.message}`);
} finally {
  await browser.close();
  server?.kill();
  console.log(errors.length ? `❌ ${errors.length} error(s):\n${errors.join('\n')}` : `✅ all ${checks.length} checks passed`);
  console.log(`screenshots: ${out}`);
  process.exit(errors.length ? 1 : 0);
}
