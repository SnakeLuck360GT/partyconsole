#!/usr/bin/env node
// Kart Chaos garage / thumbnails:
//   node scripts/kart-garage.mjs garage|garage-side   -> screenshot of every driver seated in a kart (calibration)
//   node scripts/kart-garage.mjs thumbs               -> renders public/assets/kart/select/*.jpg for the phone carousel
// env: SMOKE_URL=http://localhost:5391/ (server started with scripts/kart-vite.config.mjs)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.argv[2] || 'garage';
const from = process.argv[3] || '0';
const base = process.env.SMOKE_URL || 'http://localhost:5391/';
const out = resolve(import.meta.dirname, 'out', 'kart-shots');
mkdirSync(out, { recursive: true });
const room = 'G' + Math.random().toString(36).slice(2, 5).toUpperCase();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext();
const errors = [];
try {
  const screen = await ctx.newPage();
  await screen.setViewportSize({ width: 1600, height: 900 });
  screen.on('pageerror', (e) => errors.push(e.message));
  screen.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await screen.goto(`${base}screen.html?local=1&room=${room}&kartDebug=${mode}&kartLow=0&kartFrom=${from}`);
  await screen.waitForFunction(() => window.__party?.roomCode, null, { timeout: 15000 });
  const phone = await ctx.newPage();
  await phone.goto(`${base}controller.html?local=1&room=${room}`);
  await phone.fill('#name-input', 'Cal');
  await phone.click('#join-btn');
  await screen.waitForFunction(() => window.__party.players().length >= 1, null, { timeout: 10000 });
  await screen.evaluate(() => window.__party.loadGame('kart'));
  if (mode === 'thumbs') {
    await screen.waitForFunction(() => window.__kartThumbs, null, { timeout: 120000 });
    const thumbs = await screen.evaluate(() => window.__kartThumbs);
    const dir = resolve(import.meta.dirname, '..', 'public', 'assets', 'kart', 'select');
    mkdirSync(dir, { recursive: true });
    for (const t of thumbs) writeFileSync(`${dir}/${t.name}.jpg`, Buffer.from(t.data.split(',')[1], 'base64'));
    console.log(`wrote ${thumbs.length} thumbnails to ${dir}`);
  } else {
    await screen.waitForTimeout(9000);
    await screen.screenshot({ path: `${out}/${mode}-${from}.png` });
    console.log(`saved ${out}/${mode}-${from}.png`);
  }
} finally {
  await browser.close();
  if (errors.length) console.log(errors.slice(0, 20).join('\n'));
}
