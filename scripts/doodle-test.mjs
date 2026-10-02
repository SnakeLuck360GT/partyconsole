#!/usr/bin/env node
// Doodle Dash end-to-end test (deterministic). Boots the TV + N portrait phones on the local transport and plays:
//   Draw & Guess: mode pick → how-to skip → every turn the artist picks a word and draws a real picture (house + sun,
//   colours, sizes, fill, undo), guessers send a wrong guess, a close guess and the right answer → reveal.
//   During turn 2 a guesser leaves and a latecomer joins; in turn 3 the artist disconnects mid-drawing.
//   → results → "Play again" → Telephone: everyone writes / draws / describes → playback with votes → results.
// Screenshots of the TV and phones at every phase go to scripts/out/doodle-test/.
//
//   node scripts/doodle-test.mjs [players=6] [mode=both|dg|tp]
//   env: SMOKE_URL (default: starts its own vite on a random port 5400–5999 with HMR/watch off)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const [nP = '6', MODE = 'both'] = process.argv.slice(2);
const N = Number(nP);
const out = resolve(import.meta.dirname, 'out', 'doodle-test');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let server = null;
let base = process.env.SMOKE_URL;
if (!base) {
  const port = 5400 + Math.floor(Math.random() * 600);
  server = spawn('npx', ['vite', '--config', 'scripts/doodle-vite.config.mjs', '--port', String(port), '--strictPort'], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  base = `http://localhost:${port}/`;
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 30000);
    server.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); res(); } });
  });
}

const errors = [];
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const T0 = Date.now();
const room = 'D' + Math.random().toString(36).slice(2, 5).toUpperCase();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext();
const NAMES = ['Alice', 'Bob', 'Chloe', 'Dmitri', 'Eve', 'Farah', 'Gus', 'Hana', 'Ivan', 'Jade', 'Kofi', 'Lena', 'Milo', 'Nina', 'Omar', 'Pia', 'Quinn', 'Rosa'];
let shotN = 0;
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${String(++shotN).padStart(2, '0')}-${name}.png` }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function watch(page, label) {
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(`[${label}] console.error: ${m.text()}`); });
}

async function until(fn, ms = 20000, what = 'condition') {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${what}`);
}

async function joinPhone(name) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 390, height: 844 });
  watch(p, name);
  await p.goto(`${base}controller.html?local=1&room=${room}`);
  await p.fill('#name-input', name);
  await p.click('#join-btn');
  p.name = name;
  return p;
}

// --- drawing helpers (coordinates in 0..1 of the canvas)
async function stroke(p, pts, steps = 2) {
  const c = await p.$('.ddc-sheet canvas');
  const b = await c.boundingBox();
  const X = (u) => b.x + u * b.width;
  const Y = (v) => b.y + v * b.height;
  await p.mouse.move(X(pts[0][0]), Y(pts[0][1]));
  await p.mouse.down();
  for (let i = 1; i < pts.length; i++) await p.mouse.move(X(pts[i][0]), Y(pts[i][1]), { steps });
  await p.mouse.up();
}
const tapTool = (p, sel) => p.click(`.ddc-draw ${sel}`);
const circle = (cx, cy, r, n = 28) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r * 0.8]);

async function drawHouse(p, variant = 0) {
  const dx = variant % 2 ? 0.04 : 0;
  // sun
  await tapTool(p, '.ddc-sw[data-c="5"]');
  await tapTool(p, '.ddc-tool[data-s="1"]');
  await stroke(p, circle(0.78 - dx, 0.17, 0.1));
  await tapTool(p, '[data-t="fill"]');
  await tapTool(p, '.ddc-sw[data-c="6"]');
  await stroke(p, [[0.78 - dx, 0.17], [0.78 - dx, 0.17]], 1);
  await tapTool(p, '[data-t="fill"]'); // back to the pen
  await tapTool(p, '.ddc-sw[data-c="5"]');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    await stroke(p, [[0.78 - dx + Math.cos(a) * 0.14, 0.17 + Math.sin(a) * 0.112], [0.78 - dx + Math.cos(a) * 0.2, 0.17 + Math.sin(a) * 0.16]], 2);
  }
  // house walls + roof in ink, thick
  await tapTool(p, '.ddc-sw[data-c="0"]');
  await tapTool(p, '.ddc-tool[data-s="1"]');
  await stroke(p, [[0.2 + dx, 0.5], [0.2 + dx, 0.82], [0.62 + dx, 0.82], [0.62 + dx, 0.5], [0.2 + dx, 0.5]], 6);
  await stroke(p, [[0.15 + dx, 0.5], [0.41 + dx, 0.3], [0.67 + dx, 0.5], [0.15 + dx, 0.5]], 6);
  // fill walls and roof
  await tapTool(p, '[data-t="fill"]');
  await tapTool(p, '.ddc-sw[data-c="9"]');
  await stroke(p, [[0.3 + dx, 0.6], [0.3 + dx, 0.6]], 1);
  await tapTool(p, '.ddc-sw[data-c="4"]');
  await stroke(p, [[0.41 + dx, 0.43], [0.41 + dx, 0.43]], 1);
  await tapTool(p, '[data-t="fill"]'); // back to the pen
  // door + window
  await tapTool(p, '.ddc-sw[data-c="3"]');
  await tapTool(p, '.ddc-tool[data-s="2"]');
  await stroke(p, [[0.36 + dx, 0.8], [0.36 + dx, 0.7]], 3);
  await stroke(p, [[0.46 + dx, 0.8], [0.46 + dx, 0.7]], 3);
  await tapTool(p, '.ddc-sw[data-c="0"]');
  await tapTool(p, '.ddc-tool[data-s="0"]');
  await stroke(p, [[0.5 + dx, 0.58], [0.58 + dx, 0.58], [0.58 + dx, 0.66], [0.5 + dx, 0.66], [0.5 + dx, 0.58]], 3);
  // a mistake + undo
  await stroke(p, [[0.1, 0.1], [0.5, 0.3]], 3);
  await tapTool(p, '[data-a="undo"]');
  // grass
  await tapTool(p, '.ddc-sw[data-c="7"]');
  await tapTool(p, '.ddc-tool[data-s="1"]');
  await stroke(p, Array.from({ length: 16 }, (_, i) => [0.04 + i * 0.062, i % 2 ? 0.86 : 0.9]), 2);
}

async function drawStickFigure(p) {
  await tapTool(p, '.ddc-sw[data-c="10"]');
  await tapTool(p, '.ddc-tool[data-s="1"]');
  await stroke(p, circle(0.5, 0.3, 0.1));
  await stroke(p, [[0.5, 0.38], [0.5, 0.65]], 4);
  await stroke(p, [[0.3, 0.45], [0.5, 0.5], [0.7, 0.45]], 4);
  await stroke(p, [[0.36, 0.85], [0.5, 0.65], [0.64, 0.85]], 4);
  await tapTool(p, '.ddc-sw[data-c="4"]');
  await stroke(p, [[0.45, 0.33], [0.5, 0.36], [0.55, 0.33]], 3);
}

async function guess(p, text) {
  const input = await p.$('.ddc-input input');
  if (!input) return false;
  await input.fill(text);
  await input.press('Enter');
  return true;
}

let phones = [];
const live = () => phones.filter((p) => !p.isClosed());
const findArtist = async () => {
  for (const p of live()) if (await p.$('.ddc-word')) return p;
  return null;
};

let tv;
try {
  tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  watch(tv, 'tv');
  await tv.goto(`${base}screen.html?local=1&room=${room}`);
  await tv.waitForFunction(() => window.__party?.roomCode, null, { timeout: 15000 });
  for (let i = 0; i < N; i++) phones.push(await joinPhone(NAMES[i]));
  await tv.waitForFunction((n) => window.__party.players().length >= n, N, { timeout: 15000 });
  await tv.evaluate(() => window.__party.loadGame('doodle'));
  await until(() => tv.$('.dd-mode-card'), 15000, 'mode select');
  await until(() => phones[0].$('.ddc-mode'), 15000, 'admin mode buttons');
  await sleep(900);
  await shot(tv, 'tv-mode');
  await shot(phones[0], 'phone-admin-mode');
  await shot(phones[1], 'phone-mode-wait');

  if (MODE !== 'tp') {
    // ------------------------------------------------------------ Draw & Guess
    await phones[0].click('.ddc-mode[data-mode="dg"]');
    await until(() => tv.$('.dd-howto-card'), 8000, 'how-to');
    await sleep(1600);
    await shot(tv, 'tv-howto');
    await shot(phones[0], 'phone-howto-admin');
    await phones[0].click('[data-go]');
    log('how-to skipped');

    let turn = 0;
    let latePhone = null;
    let ended = false;
    while (!ended && turn < 12) {
      // wait for an artist or results
      const who = await until(async () => {
        if (await tv.$('#results:not([hidden])')) return 'results';
        const a = await findArtist();
        return a || null;
      }, 40000, 'next artist');
      if (who === 'results') { ended = true; break; }
      turn++;
      const artist = who;
      log(`turn ${turn}: artist ${artist.name}`);
      if (turn === 1) { await sleep(500); await shot(artist, 'phone-choose'); await shot(tv, 'tv-choosing'); }
      const word = (await artist.textContent('.ddc-word[data-i="1"] .w')).trim();
      await artist.click('.ddc-word[data-i="1"]');
      await until(() => artist.$('.ddc-sheet canvas'), 8000, 'artist canvas');
      log(`  word: ${word}`);
      const guessers = live().filter((p) => p !== artist);

      if (turn === 3) {
        // artist disconnects mid-drawing → TV waits a grace period, then moves on
        await drawStickFigure(artist);
        await sleep(800);
        await artist.close({ runBeforeUnload: true });
        log('  artist left mid-drawing');
        await sleep(2500);
        await shot(tv, 'tv-artist-left');
        await until(() => tv.$('.dg-reveal:not([hidden])'), 15000, 'reveal after artist left');
        await shot(tv, 'tv-reveal-artist-left');
        continue;
      }

      if (turn % 2) await drawHouse(artist, turn); else await drawStickFigure(artist);
      await sleep(400);
      if (turn === 1) {
        await shot(artist, 'phone-drawing');
        await guess(guessers[0], 'banana bread');
        await guess(guessers[1], 'castle');
        await guess(guessers[2], word.length > 3 ? word.slice(0, -1) : `${word}s`);
        await sleep(600);
        await shot(guessers[2], 'phone-guess-close');
        await shot(tv, 'tv-drawing-guesses');
      }
      if (turn === 2) {
        // mid-turn: a guesser leaves, and a latecomer joins
        const leaver = guessers.pop();
        await leaver.close({ runBeforeUnload: true });
        log(`  ${leaver.name} left`);
        latePhone = await joinPhone('Latecomer');
        phones.push(latePhone);
        await until(() => latePhone.$('.ddc-input input, .ddc-got'), 15000, 'late joiner guess view');
        log('  latecomer has the guess view');
        await guess(latePhone, 'house');
        await sleep(800);
        await shot(latePhone, 'phone-latecomer-guess');
        await shot(tv, 'tv-after-leave-join');
        guessers.push(latePhone);
      }
      // everyone (incl. latecomer) guesses right, one by one
      const gs = live().filter((p) => p !== artist);
      for (let i = 0; i < gs.length; i++) {
        await guess(gs[i], i === 0 ? word.toUpperCase() : word);
        await sleep(250);
        if (turn === 1 && i === 0) { await sleep(400); await shot(gs[0], 'phone-guessed'); await shot(artist, 'phone-artist-gotit'); }
      }
      await until(() => tv.$('.dg-reveal:not([hidden])'), 15000, 'reveal');
      await sleep(1100);
      if (turn <= 2) { await shot(tv, `tv-reveal-${turn}`); await shot(gs[0], `phone-reveal-${turn}`); await shot(artist, `phone-reveal-artist-${turn}`); }
    }
    await until(() => tv.$('#results:not([hidden])'), 40000, 'results');
    await sleep(1200);
    await shot(tv, 'tv-results-dg');
    await shot(live()[0], 'phone-results-dg');
    log('Draw & Guess finished');
    if (MODE === 'both') {
      await tv.click('#res-again');
      await until(() => tv.$('.dd-mode-card'), 15000, 'mode select again');
    }
  }

  if (MODE !== 'dg') {
    // ------------------------------------------------------------ Telephone
    const admin = await until(async () => {
      for (const p of live()) if (await p.$('.ddc-mode')) return p;
      return null;
    }, 15000, 'admin phone');
    await admin.click('.ddc-mode[data-mode="tp"]');
    await until(() => tv.$('.dd-howto-card'), 8000, 'tp how-to');
    await sleep(1500);
    await shot(tv, 'tv-tp-howto');
    await admin.click('[data-go]');
    const players = live();
    let step = 0;
    let stepShots = 0;
    while (step < 8) {
      const next = await until(async () => {
        if (await tv.$('.tpp')) return 'play';
        const t = await tv.$('.tp-steptitle b');
        if (!t) return null;
        const n = Number(await t.textContent());
        return n > step ? n : null;
      }, 90000, 'telephone step');
      if (next === 'play') break;
      const vis = async (p, sel) => { const e = await p.$(sel); return e && e.isVisible(); };
      const kind = await until(async () => {
        const p0 = players[0];
        if (await vis(p0, '.ddc-ideas')) return 'write';
        if (await vis(p0, '.ddc-pic')) return 'describe';
        if (await vis(p0, '.ddc-draw [data-done]')) return 'draw';
        return null;
      }, 10000, 'telephone phone view');
      step = next;
      log(`telephone step ${step}: ${kind}`);
      await sleep(500);
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (i === players.length - 1 && step === 2) continue; // one player never finishes step 2 → timeout path
        if (kind === 'write') {
          if (i % 2) await p.click('.ddc-idea');
          else await p.fill('.ddc-textarea', ['a dragon eating spaghetti', 'grandma on a skateboard', 'a cat in space', 'a haunted toaster', 'a snowman at the beach', 'a pirate duck'][i % 6]);
          await p.click('[data-send]');
        } else if (kind === 'describe') {
          await p.fill('.ddc-textarea', ['a house with a sun', 'a happy man', 'a sad potato', 'my neighbour', 'a lighthouse?', 'abstract art'][i % 6]);
          await p.click('[data-send]');
        } else {
          if (i % 2) await drawStickFigure(p); else await drawHouse(p, i);
          await p.click('[data-done]');
        }
        if (i === 1 && stepShots < 3) { await sleep(500); await shot(p, `phone-tp-${kind}-done`); }
        if (i === 0 && stepShots < 3) {
          await shot(tv, `tv-tp-${kind}`);
        }
      }
      if (stepShots < 3) {
        const last = players[players.length - 1];
        await shot(last, `phone-tp-${kind}`);
      }
      stepShots++;
      if (step === 2) log('  waiting for the timeout (one player idle)…');
    }
    // playback
    await until(() => tv.$('.tpp-entry'), 70000, 'playback');
    log('playback');
    await sleep(1500);
    await shot(tv, 'tv-tp-play-1');
    for (const p of players.slice(1)) { const b = await p.$('[data-vote]'); if (b) await b.click(); }
    await sleep(800);
    await shot(players[1], 'phone-tp-vote');
    const admin2 = await until(async () => { for (const p of live()) if (await p.$('[data-nav]')) return p; return null; }, 10000, 'admin nav');
    await shot(admin2, 'phone-tp-admin');
    for (let k = 0; k < 3; k++) {
      await admin2.click('[data-nav="next"]');
      await sleep(400);
      await admin2.click('[data-nav="next"]');
      await sleep(1600);
      for (const p of players.slice(1)) { const b = await p.$('[data-vote]'); if (b) await b.click(); }
      await sleep(700);
      await shot(tv, `tv-tp-play-${k + 2}`);
    }
    await admin2.click('[data-nav="skip"]');
    await until(() => tv.$('.tpp-strip'), 10000, 'chain overview');
    await sleep(1800);
    await shot(tv, 'tv-tp-overview');
    await admin2.click('[data-nav="end"]');
    await sleep(1500);
    await shot(tv, 'tv-tp-awards');
    await until(() => tv.$('#results:not([hidden])'), 20000, 'tp results');
    await sleep(1200);
    await shot(tv, 'tv-results-tp');
    log('Telephone finished');
  }
  await tv.evaluate(() => window.__party.exitGame());
  await sleep(500);
} catch (err) {
  errors.push(`[harness] ${err.message}`);
  try { await shot(tv, 'zz-tv-failure'); } catch { /* */ }
  for (const p of live()) { try { await shot(p, `zz-${p.name}-failure`); } catch { /* */ } }
} finally {
  await browser.close();
  server?.kill();
  console.log(errors.length ? `FAIL ${errors.length} error(s):\n${errors.join('\n')}` : 'OK no errors');
  console.log(`screenshots: ${out}`);
  process.exit(errors.length ? 1 : 0);
}
