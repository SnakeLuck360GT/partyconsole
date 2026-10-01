#!/usr/bin/env node
// Deterministic end-to-end test for Brain Brawl: plays a full SHORT show with N phones, screenshots every phase.
//   node scripts/trivia-test.mjs [players=4]
// Output: scripts/out/trivia-test/*.png. Uses the admin "Skip" button to keep runs short.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const N = Number(process.argv[2] || 4);
const W = Number(process.env.W || 1280);
const H = Math.round((W * 9) / 16);
const out = resolve(import.meta.dirname, 'out', 'trivia-test');
mkdirSync(out, { recursive: true });

const port = 5900 + Math.floor(Math.random() * 90);
const server = spawn('npx', ['vite', '--config', 'scripts/trivia-vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
const base = `http://localhost:${port}/`;
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 30000);
  server.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); res(); } });
});

const errors = [];
const room = 'Q' + Math.random().toString(36).slice(2, 5).toUpperCase();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext();
const watch = (page, label) => {
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] console: ${m.text()}`); });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = new Set();

try {
  const screen = await context.newPage();
  await screen.setViewportSize({ width: W, height: H });
  watch(screen, 'screen');
  await screen.goto(`${base}screen.html?local=1&room=${room}`);
  await screen.waitForFunction(() => window.__party?.roomCode);
  const names = ['Alice', 'Bob', 'Chloe', 'Dmitri', 'Eve', 'Farah', 'Gus', 'Hana'];
  const phones = [];
  for (let i = 0; i < N; i++) {
    const p = await context.newPage();
    await p.setViewportSize(i === 1 ? { width: 844, height: 390 } : { width: 390, height: 780 });
    watch(p, `phone${i}`);
    await p.goto(`${base}controller.html?local=1&room=${room}`);
    await p.fill('#name-input', names[i % 8] + (i >= 8 ? i : ''));
    await p.click('#join-btn');
    phones.push(p);
  }
  await screen.waitForFunction((n) => window.__party.players().length >= n, N);
  await screen.evaluate(() => window.__party.loadGame('trivia'));
  await phones[0].waitForSelector('.bbp-go', { timeout: 15000 });
  await sleep(1200);
  await screen.screenshot({ path: `${out}/01-title.png` });
  await phones[0].screenshot({ path: `${out}/p-title-admin.png` });
  await phones[2]?.screenshot({ path: `${out}/p-title.png` });
  await phones[0].click('[data-len="short"]');
  await sleep(300);
  await phones[0].click('.bbp-go');

  const phaseOf = (p) => p.evaluate(() => {
    const r = document.querySelector('.bbp');
    return r ? `${r.dataset.phase}|${r.querySelector('.bbp-keys') ? 'num' : r.querySelector('.bbp-btns.tf') ? 'tf' : r.querySelector('.bbp-ans') ? 'mc' : ''}` : '';
  });
  const skip = () => phones[0].click('.bbp-skip', { timeout: 1000 }).catch(() => {});
  let n = 2;
  let lastPhase = '';
  const t0 = Date.now();
  let lateJoined = false;
  while (Date.now() - t0 < 400000) {
    if (await screen.$('#results:not([hidden])')) { await sleep(1500); await screen.screenshot({ path: `${out}/99-results.png` }); await phones[0].screenshot({ path: `${out}/p-results.png` }); break; }
    const ph = await phaseOf(phones[0]);
    let [phase, kind] = ph.split('|');
    if (phase === 'reveal') kind = await screen.evaluate(() => (document.querySelector('.bb-view:not(.leaving) .bb-nl') ? 'num' : document.querySelector('.bb-view:not(.leaving) .bb-answers.tf') ? 'tf' : 'mc'));
    if (`${phase}|${kind}` === lastPhase && phase !== 'answer') { await sleep(150); continue; }
    lastPhase = `${phase}|${kind}`;
    const tag = `${phase}-${kind}`;
    const first = !shots.has(tag);
    shots.add(tag);
    const shot = async (delay = 0) => {
      if (!first) return;
      if (delay) await sleep(delay);
      const k = String(n++).padStart(2, '0');
      await screen.screenshot({ path: `${out}/${k}-${tag}.png` });
      await phones[0].screenshot({ path: `${out}/p${k}-${tag}.png` });
      if (phones[1]) await phones[1].screenshot({ path: `${out}/p${k}-${tag}-land.png` });
    };
    if (phase === 'vote') {
      await Promise.all(phones.map((p, i) => p.click(`.bbp-cat >> nth=${i % 3}`).catch(() => {})));
      await shot(400);
    } else if (phase === 'answer') {
      if (first) await shot(1500);
      await Promise.all(phones.map(async (p, i) => {
        if (i === N - 1 && kind !== 'num') return; // one player never answers (timeout path)
        if (kind === 'num') {
          const digits = String([1990, 200, 45, 1000, 7][i % 5]);
          for (const d of digits) await p.click(`[data-k="${d}"]`).catch(() => {});
          await p.click('[data-k="OK"]').catch(() => {});
        } else await p.click(`.bbp-ans >> nth=${i % (kind === 'tf' ? 2 : 4)}`).catch(() => {});
      }));
      if (!lateJoined && kind === 'mc') {
        lateJoined = true;
        const late = await context.newPage();
        await late.setViewportSize({ width: 390, height: 780 });
        watch(late, 'late');
        await late.goto(`${base}controller.html?local=1&room=${room}`);
        await late.fill('#name-input', 'Latecomer');
        await late.click('#join-btn');
        await sleep(1500);
        await late.screenshot({ path: `${out}/p-late.png` });
      }
      if (first) { await sleep(500); await screen.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${tag}-locked.png` }); await phones[0].screenshot({ path: `${out}/p-locked-${kind}.png` }); }
      if (kind === 'num' || kind === 'tf' || first) { await sleep(300); }
      await skip(); // last phone didn't answer -> skip the timer
      lastPhase = 'answered';
    } else if (phase === 'reveal') {
      await shot(kind === 'num' ? 3200 : 1800);
      if (!first) await sleep(600);
      await skip();
    } else if (phase === 'board') {
      await shot(3000);
      await skip();
    } else if (phase === 'intro' || phase === 'read' || phase === 'closed') {
      await shot(phase === 'intro' ? 1300 : 700);
      if (phase === 'intro') await skip();
    } else if (phase === 'spin') {
      await shot(2500);
    } else if (phase === 'final') {
      for (let k = 0; k < 4; k++) { await sleep(2000); await screen.screenshot({ path: `${out}/9${k}-final.png` }); }
      await phones[0].screenshot({ path: `${out}/p-final.png` });
    }
    await sleep(150);
  }
  // Play again path
  await screen.click('#res-again').catch(() => {});
  await sleep(2000);
  await screen.screenshot({ path: `${out}/zz-again.png` });
  await screen.evaluate(() => window.__party.exitGame());
  await sleep(500);
} catch (err) {
  errors.push(`[harness] ${err.stack}`);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ errors, shots: [...shots] }, null, 2));
  await browser.close();
  server.kill();
  console.log(errors.length ? `❌ ${errors.length} error(s):\n${errors.join('\n')}` : '✅ no errors');
  console.log('phases:', [...shots].join(', '));
  process.exit(errors.length ? 1 : 0);
}
