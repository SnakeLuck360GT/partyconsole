// Minigame test harness (hidden). Runs Party Board minigames in isolation through the minigame contract.
//   screen.html?local=1&room=ABCD&mg=<id|all>&bots=3[&abort=5][&loop=1]
// - real phones get the minigame's gamepad spec; `bots` adds fake players with random input
// - `abort=N` aborts env.signal after N seconds (tests abort cleanup)
// - window.__mgtest exposes { id, state, scores, runs, error, leftovers } for scripts
import { minigames } from '../party-board/minigames/index.js';
import { trackInput, banner, escapeHtml } from '../../sdk/screen-kit.js';
import { playerColor, colorToHex, AVATARS } from '../../sdk/colors.js';

const BOT_NAMES = ['Botty', 'Robo', 'Chip', 'Sprocket', 'Widget', 'Gizmo', 'Bolt', 'Nano', 'Pixel', 'Servo', 'Zap'];

export default async function start(ctx) {
  const params = new URLSearchParams(location.search);
  const want = params.get('mg') || 'all';
  const nBots = Number(params.get('bots') || 0);
  const abortAfter = Number(params.get('abort') || 0);
  const durOverride = Number(params.get('dur') || 0); // shorten minigames for quick tests
  const list = want === 'all' ? minigames : want.split(',').map((id) => minigames.find((m) => m.id === id)).filter(Boolean);
  const input = trackInput(ctx);
  const state = { id: null, state: 'idle', scores: null, runs: [], error: null, list: minigames.map((m) => m.id) };
  window.__mgtest = state;

  const humans = () => ctx.players();
  const bots = Array.from({ length: nBots }, (_, i) => {
    const idx = 1 + i;
    const color = playerColor(idx);
    return { id: `bot${i}`, name: BOT_NAMES[i % BOT_NAMES.length], color, colorHex: colorToHex(color), avatar: AVATARS[idx % AVATARS.length], index: idx, bot: true };
  });

  // Random-but-plausible bot input.
  const botState = new Map(bots.map((b) => [b.id, { x: 0, y: 0, b: {}, edges: new Set(), next: 0 }]));
  let currentControls = null;
  const botTimer = setInterval(() => {
    const now = performance.now();
    for (const s of botState.values()) {
      if (now > s.next) {
        s.next = now + 300 + Math.random() * 1200;
        if (currentControls?.stick === 'dpad') {
          const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
          [s.x, s.y] = dirs[Math.floor(Math.random() * dirs.length)];
        } else if (currentControls?.stick === 'analog') {
          const a = Math.random() * Math.PI * 2;
          const m = Math.random() < 0.15 ? 0 : 0.6 + Math.random() * 0.4;
          s.x = Math.cos(a) * m; s.y = Math.sin(a) * m;
        }
      }
      for (const btn of currentControls?.buttons || []) {
        if (s.b[btn.id]) { s.b[btn.id] = false; continue; }
        if (Math.random() < 0.18) { s.b[btn.id] = true; s.edges.add(btn.id); }
      }
    }
  }, 90);

  const envInput = {
    get(pid) {
      const s = botState.get(pid);
      if (!s) return input.get(pid);
      return { x: s.x, y: s.y, b: { ...s.b }, pressed(id) { if (s.edges.has(id)) { s.edges.delete(id); return true; } return false; } };
    },
  };

  let destroyed = false;
  const outer = new AbortController();
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:50%;bottom:6px;transform:translateX(-50%);z-index:50;font:600 12px system-ui;color:#fff8;pointer-events:none';
  ctx.container.appendChild(hud);

  ctx.onMessage((pid, m) => {
    if (m?.type === 'hello' && currentControls) ctx.send(pid, { type: 'controls', controls: currentControls, name: state.id });
  });

  async function runOne(mg) {
    state.id = mg.id;
    state.state = 'running';
    currentControls = mg.controls || { stick: 'analog', buttons: [{ id: 'a', label: 'A' }] };
    ctx.broadcast({ type: 'controls', controls: currentControls, name: mg.name });
    hud.textContent = `[test] ${mg.id} · ${humans().length} phones + ${bots.length} bots`;
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;inset:0;overflow:hidden';
    ctx.container.appendChild(container);
    const ac = new AbortController();
    const onOuter = () => ac.abort();
    outer.signal.addEventListener('abort', onOuter);
    let abortTimer = null;
    if (abortAfter) abortTimer = setTimeout(() => ac.abort(), abortAfter * 1000);
    const players = [...humans(), ...bots];
    const teams = mg.mode === 'teams' ? [players.filter((_, i) => i % 2 === 0).map((p) => p.id), players.filter((_, i) => i % 2 === 1).map((p) => p.id)] : null;
    const t0 = performance.now();
    let scores = null;
    try {
      const target = durOverride ? Object.create(mg, { duration: { value: durOverride } }) : mg;
      scores = await target.run({
        container, players, teams, input: envInput,
        send: (pid, data) => { if (!pid.startsWith('bot')) ctx.send(pid, data); },
        sharedAsset: ctx.sharedAsset,
        signal: ac.signal,
      });
    } catch (err) {
      console.error(err);
      state.error = String(err?.stack || err);
    }
    clearTimeout(abortTimer);
    outer.signal.removeEventListener('abort', onOuter);
    const leftovers = container.childElementCount;
    container.remove();
    const run = { id: mg.id, scores, seconds: (performance.now() - t0) / 1000, leftovers, aborted: ac.signal.aborted };
    state.runs.push(run);
    state.scores = scores;
    if (leftovers) console.error(`[mgtest] ${mg.id} left ${leftovers} element(s) in its container`);
    return run;
  }

  async function main() {
    for (const mg of list) {
      if (destroyed) return;
      const run = await runOne(mg);
      if (destroyed) return;
      const players = [...humans(), ...bots];
      const rows = players.map((p) => ({ player: p, score: run.scores?.[p.id] ?? 0 })).sort((a, b) => b.score - a.score);
      await banner(ctx.container, `${escapeHtml(mg.name)}: ${rows[0] ? escapeHtml(rows[0].player.name) : '?'} wins`, 1200);
    }
    state.state = 'done';
    if (destroyed) return;
    const last = state.runs[state.runs.length - 1];
    const rows = [...humans(), ...bots].map((p) => ({ player: p.bot ? { ...p } : p.id, score: Math.round((last?.scores?.[p.id] ?? 0) * 10) / 10 }))
      .sort((a, b) => b.score - a.score);
    // Bots aren't platform players; showResults accepts player objects too.
    const choice = await ctx.showResults(rows, { title: list.length === 1 ? list[0].name : 'All minigames done' });
    if (choice === 'again' && !destroyed) { state.runs = []; main(); }
  }
  main();

  return {
    destroy() {
      destroyed = true;
      outer.abort();
      clearInterval(botTimer);
      hud.remove();
    },
  };
}
