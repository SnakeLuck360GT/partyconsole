#!/usr/bin/env node
// Render PartyConsole cover key art.
//   node scripts/keyart/render.mjs <id|all|sheet> [--ss=2] [--only=cover|wide] [--preview]
// Writes public/assets/<id>/cover.jpg (1024x1024) and cover-wide.jpg (1600x900).
// --preview writes to scripts/keyart/out/<id>-*.jpg instead (fast, ss=1 unless given).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const ALL = ['kart', 'party-board', 'sumo', 'trivia', 'tower', 'word-bomb', 'soccer', 'doodle', 'bluff', 'golf', 'bomber', 'tanks', 'space', 'neon'];
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const ids = args.filter((a) => !a.startsWith('--'));
const preview = !!flags.preview;
const SS = Number(flags.ss || (preview ? 1 : 2));
const targets = ids.includes('all') ? ALL : ids.filter((i) => i !== 'sheet');
const sizes = [
  { name: 'cover', w: 1024, h: 1024, max: 220 * 1024 },
  { name: 'cover-wide', w: 1600, h: 900, max: 260 * 1024 },
].filter((s) => !flags.only || (flags.only === 'wide' ? s.name === 'cover-wide' : s.name === 'cover'));

const port = 5333;
let server;
async function up() {
  try { const r = await fetch(`http://127.0.0.1:${port}/scripts/keyart/index.html`); if (r.ok) return; } catch {}
  server = spawn('npx', ['vite', '--config', 'scripts/keyart/vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', (d) => { if (!String(d).includes('(client)')) process.stderr.write(d); });
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try { const r = await fetch(`http://127.0.0.1:${port}/scripts/keyart/index.html`); if (r.ok) return; } catch {}
  }
  throw new Error('vite did not start');
}
await up();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const outDir = resolve(import.meta.dirname, 'out');
mkdirSync(outDir, { recursive: true });

async function renderOne(id, s) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GL Driver')) logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/scripts/keyart/index.html?scene=${id}&w=${s.w}&h=${s.h}&ss=${SS}${flags.q ? '&' + flags.q : ''}`);
  await page.waitForFunction(() => window.__done || window.__error, null, { timeout: 600000, polling: 500 });
  const err = await page.evaluate(() => window.__error);
  if (err) { console.error(id, s.name, 'ERROR', err, logs.join('\n')); await page.close(); return; }
  let q = 0.88, buf;
  for (;;) {
    const data = await page.evaluate((qq) => window.__out.toDataURL('image/jpeg', qq), q);
    buf = Buffer.from(data.split(',')[1], 'base64');
    if (buf.length <= s.max || q < 0.6) break;
    q -= 0.03;
  }
  const file = preview ? resolve(outDir, `${flags.name || id}-${s.name}.jpg`) : resolve(ROOT, 'public/assets', id, `${s.name}.jpg`);
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, buf);
  console.log(`${id} ${s.name} q=${q.toFixed(2)} ${(buf.length / 1024).toFixed(0)}KB ${((Date.now() - t0) / 1000).toFixed(1)}s ${logs.length ? '\n  ' + logs.slice(0, 6).join('\n  ') : ''}`);
  await page.close();
}

try {
  for (const id of targets) for (const s of sizes) await renderOne(id, s);
  if (ids.includes('sheet') || ids.includes('all')) {
    // contact sheet of all covers (+ wide row) for family review
    const page = await browser.newPage({ viewport: { width: 1400, height: 1500 } });
    const cells = ALL.map((id) => `<figure><img src="/assets/${id}/cover.jpg?${Date.now()}"><figcaption>${id}</figcaption></figure>`).join('');
    const wides = ALL.map((id) => `<img class="w" src="/assets/${id}/cover-wide.jpg?${Date.now()}">`).join('');
    await page.goto(`http://127.0.0.1:${port}/scripts/keyart/index.html?scene=__none`).catch(() => {});
    await page.setContent(`<html><body style="margin:0;background:#e9edf3;font:12px sans-serif;padding:16px">
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px">${cells}</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:18px">${wides}</div>
      <style>figure{margin:0}img{width:100%;display:block;border-radius:18px;box-shadow:0 4px 14px rgba(0,0,0,.18)}img.w{border-radius:10px}figcaption{text-align:center;padding-top:4px;color:#556}</style></body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
    await page.evaluate((base) => { for (const i of document.images) if (!i.src.startsWith('http')) i.src = base + i.getAttribute('src'); }, `http://127.0.0.1:${port}`);
    await page.screenshot({ path: resolve(outDir, 'sheet.jpg'), type: 'jpeg', quality: 85, fullPage: true });
    console.log('sheet written');
    await page.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
