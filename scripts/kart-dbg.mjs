import { chromium } from 'playwright';
const base = 'http://localhost:5731/';
const [n='1', track='meadow'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const c = await browser.newContext({ viewport: { width: 960, height: 540 } });
const tv = await c.newPage();
tv.on('console', (m) => console.log('[tv]', m.type(), m.text().slice(0, 300)));
tv.on('pageerror', (e) => console.log('[tv] ERR', e.message, e.stack?.slice(0, 400)));
const room = 'D' + Math.random().toString(36).slice(2, 5).toUpperCase();
await tv.goto(`${base}screen.html?local=1&room=${room}&kartAuto=1&kartTrack=${track}&kartLow=1`);
await tv.waitForFunction(() => window.__party?.roomCode);
for (let i = 0; i < Number(n); i++) { const p = await c.newPage(); await p.goto(`${base}controller.html?local=1&room=${room}`); await p.fill('#name-input', 'P' + i); await p.click('#join-btn'); }
await tv.waitForFunction((n) => window.__party.players().length >= n, Number(n));
await tv.evaluate(() => window.__party.loadGame('kart'));
let raceN = 0; for (let i = 0; i < 60; i++) { await tv.waitForTimeout(2000); const ph = await tv.evaluate(() => window.__kart?.phase); console.log('phase', ph, await tv.evaluate(() => [window.__kart?.fps, window.__kart?.raceTime, window.__kart?.cd])); if (ph === 'countdown' || ph === 'race') { const r = await tv.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res([n, window.__kart.renderer.info.render.calls, window.__kart.renderer.info.render.triangles, window.__kart.renderer.info.programs.length]); }; requestAnimationFrame(f); })); console.log('raf frames in 2s', r); } if (ph === 'race' && ++raceN > 2) break; }
await tv.screenshot({ path: '/private/tmp/claude-501/-Users-david-WEB-DEV-airconsoleclone/5068e3cd-8367-4deb-beb0-ebe953569331/scratchpad/kart/dbg.png' });
await browser.close();
