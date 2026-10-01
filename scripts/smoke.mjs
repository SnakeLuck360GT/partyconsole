#!/usr/bin/env node
// Headless smoke test: boots the screen + N phone controllers (local BroadcastChannel transport),
// starts a game, mashes random inputs, and saves screenshots + console errors.
//
//   node scripts/smoke.mjs <gameId> [players=3] [seconds=12]
//   env: SMOKE_URL (default: starts its own vite dev server), SMOKE_SHOTS=4 (screen screenshots over the run)
//
// Output: scripts/out/<gameId>/screen-*.png, phone-*.png, report.json. Exit code 1 on page errors.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [gameId = '_demo', nPlayers = '3', secs = '12'] = process.argv.slice(2);
const N = Number(nPlayers);
const SECONDS = Number(secs);
const SHOTS = Number(process.env.SMOKE_SHOTS || 4);
const out = resolve(import.meta.dirname, 'out', gameId);
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
const room = 'T' + Math.random().toString(36).slice(2, 5).toUpperCase();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext();

function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}\n${e.stack?.split('\n').slice(0, 4).join('\n')}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] console.error: ${m.text()}`); });
}

try {
  const screen = await context.newPage();
  await screen.setViewportSize({ width: 1280, height: 720 });
  watch(screen, 'screen');
  await screen.goto(`${base}screen.html?local=1&room=${room}`);
  await screen.waitForFunction(() => window.__party?.roomCode, null, { timeout: 15000 });

  const phones = [];
  for (let i = 0; i < N; i++) {
    const p = await context.newPage();
    await p.setViewportSize({ width: 844, height: 390 }); // landscape phone
    watch(p, `phone${i}`);
    await p.goto(`${base}controller.html?local=1&room=${room}`);
    await p.fill('#name-input', ['Alice', 'Bob', 'Chloe', 'Dmitri', 'Eve', 'Farah', 'Gus', 'Hana'][i % 8] + (i >= 8 ? i : ''));
    await p.click('#join-btn');
    phones.push(p);
  }
  await screen.waitForFunction((n) => window.__party.players().length >= n, N, { timeout: 10000 });
  await screen.screenshot({ path: `${out}/lobby.png` });

  await screen.evaluate((id) => window.__party.loadGame(id), gameId);
  await screen.waitForFunction(() => window.__party.current, null, { timeout: 10000 });
  await Promise.all(phones.map((p) => p.waitForFunction((id) => window.__party.game === id, gameId, { timeout: 10000 })));
  await screen.waitForTimeout(1500);
  for (let i = 0; i < Math.min(N, 2); i++) await phones[i].screenshot({ path: `${out}/phone-${i}.png` });

  // Mash inputs: tap random buttons, drag joysticks, answer choices, type into text inputs.
  const t0 = Date.now();
  let shot = 0;
  const shotEvery = (SECONDS * 1000) / SHOTS;
  let nextShot = 0;
  while (Date.now() - t0 < SECONDS * 1000) {
    await Promise.all(phones.map(async (p) => {
      try {
        const vp = p.viewportSize();
        const r = Math.random();
        const stick = await p.$('.pk-stick-zone');
        if (stick && r < 0.4) {
          const b = await stick.boundingBox();
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height / 2;
          await p.mouse.move(cx, cy);
          await p.mouse.down();
          await p.mouse.move(cx + (Math.random() - 0.5) * 160, cy + (Math.random() - 0.5) * 160, { steps: 3 });
          await p.waitForTimeout(150);
          await p.mouse.up();
          return;
        }
        const input = await p.$('.pk-text input, #play-area input:not([type=hidden])');
        if (input && r < 0.6 && await input.isVisible()) {
          await input.fill(['cat', 'banana', 'rocket', 'test', 'hello'][Math.floor(Math.random() * 5)]);
          await input.press('Enter');
          return;
        }
        const clickables = await p.$$('#play-area button:visible, #play-area .pk-btn, #play-area .pk-choice, #play-area [data-tap]');
        if (clickables.length) {
          const c = clickables[Math.floor(Math.random() * clickables.length)];
          const b = await c.boundingBox();
          if (b) {
            await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
            await p.mouse.down();
            await p.waitForTimeout(60 + Math.random() * 200);
            await p.mouse.up();
          }
          return;
        }
        const canvas = await p.$('#play-area canvas');
        if (canvas) {
          const b = await canvas.boundingBox();
          await p.mouse.move(b.x + Math.random() * b.width, b.y + Math.random() * b.height);
          await p.mouse.down();
          await p.mouse.move(b.x + Math.random() * b.width, b.y + Math.random() * b.height, { steps: 6 });
          await p.mouse.up();
          return;
        }
        await p.mouse.click(Math.random() * vp.width, 60 + Math.random() * (vp.height - 60));
      } catch { /* page navigated or element vanished */ }
    }));
    if (Date.now() - t0 >= nextShot && shot < SHOTS) {
      await screen.screenshot({ path: `${out}/screen-${shot}.png` });
      shot++;
      nextShot += shotEvery;
    }
  }
  await screen.screenshot({ path: `${out}/screen-final.png` });
  for (let i = 0; i < Math.min(N, 2); i++) await phones[i].screenshot({ path: `${out}/phone-${i}-end.png` });

  // Late join + leave during the game.
  const late = await context.newPage();
  watch(late, 'late');
  await late.setViewportSize({ width: 390, height: 844 });
  await late.goto(`${base}controller.html?local=1&room=${room}`);
  await late.fill('#name-input', 'Latecomer');
  await late.click('#join-btn');
  await late.waitForTimeout(1500);
  await late.screenshot({ path: `${out}/phone-late-portrait.png` });
  await phones[0].close({ runBeforeUnload: true });
  await screen.waitForTimeout(1500);
  await screen.screenshot({ path: `${out}/screen-after-leave.png` });
  await screen.evaluate(() => window.__party.exitGame());
  await screen.waitForTimeout(500);
} catch (err) {
  errors.push(`[harness] ${err.message}`);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ gameId, players: N, errors }, null, 2));
  await browser.close();
  server?.kill();
  console.log(errors.length ? `❌ ${errors.length} error(s):\n${errors.join('\n')}` : '✅ no errors');
  console.log(`screenshots: ${out}`);
  process.exit(errors.length ? 1 : 0);
}
