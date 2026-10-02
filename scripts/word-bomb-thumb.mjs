#!/usr/bin/env node
// Renders the Word Bomb menu thumbnail: 8 players, a few words played, someone mid-typing.
//   node scripts/word-bomb-thumb.mjs   -> public/assets/word-bomb/thumb.jpg (640x360) + scripts/out/word-bomb-test/thumb-src.png
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const out = resolve(import.meta.dirname, 'out', 'word-bomb-test');
mkdirSync(out, { recursive: true });
const port = 5400 + Math.floor(Math.random() * 600);
const server = spawn('npx', ['vite', '--config', 'scripts/word-bomb-vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 30000);
  server.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); res(); } });
});
const base = `http://localhost:${port}/`;
const room = 'H' + Math.random().toString(36).slice(2, 5).toUpperCase();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
try {
  const context = await browser.newContext();
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1280, height: 720 });
  await screen.goto(`${base}screen.html?local=1&room=${room}&wbfast=1`);
  await screen.waitForFunction(() => window.__party?.roomCode, null, { timeout: 20000 });
  const phones = new Map();
  for (const name of ['Maya', 'Theo', 'Priya', 'Sam', 'Jonas', 'Lena', 'Kofi', 'Ada']) {
    const p = await context.newPage();
    await p.setViewportSize({ width: 375, height: 667 });
    await p.goto(`${base}controller.html?local=1&room=${room}`);
    await p.fill('#name-input', name);
    await p.click('#join-btn');
    await p.waitForFunction(() => window.__party.me, null, { timeout: 10000 });
    phones.set(await p.evaluate(() => window.__party.me.id), p);
  }
  await screen.waitForFunction(() => window.__party.players().length >= 8, null, { timeout: 10000 });
  await screen.evaluate(() => window.__party.loadGame('word-bomb'));
  await screen.waitForFunction(() => window.__wb?.phase === 'play', null, { timeout: 30000 });
  await screen.evaluate(() => window.__wb.freeze(true));
  const plays = [['and', 'candle'], ['ow', 'window'], ['ter', 'butter'], ['ck', 'rocket']];
  for (const [p, w] of plays) {
    const holder = await screen.evaluate(() => window.__wb.holder);
    await screen.evaluate((x) => window.__wb.forcePrompt(x), p);
    const ph = phones.get(holder);
    await ph.fill('.wbc-form input', w);
    await ph.press('.wbc-form input', 'Enter');
    await screen.waitForTimeout(500);
  }
  const holder = await screen.evaluate(() => window.__wb.holder);
  await screen.evaluate(() => window.__wb.forcePrompt('ble'));
  await phones.get(holder).type('.wbc-form input', 'bubbl', { delay: 60 });
  await screen.waitForTimeout(4000);
  await screen.screenshot({ path: `${out}/thumb-src.png` });
  execFileSync('sips', ['-z', '360', '640', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', `${out}/thumb-src.png`, '--out', resolve(ROOT, 'public/assets/word-bomb/thumb.jpg')], { stdio: 'ignore' });
  console.log('wrote public/assets/word-bomb/thumb.jpg');
} finally {
  await browser.close();
  server.kill();
}
