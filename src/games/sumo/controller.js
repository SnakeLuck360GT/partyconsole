// Sumo Smash phone controller: analog stick (left), DASH + hold-to-charge SLAM (right), status panel (centre).
const CSS = `
.sumo-pad { position:absolute; inset:0; display:grid; grid-template-columns: 1fr minmax(150px, 30%) 1fr; user-select:none; -webkit-user-select:none; touch-action:none;
  background: radial-gradient(ellipse at 50% 120%, color-mix(in srgb, var(--me) 28%, transparent), transparent 60%); }
.sumo-pad .left { position:relative; }
.sumo-pad .left .hint { position:absolute; left:0; right:0; bottom:10px; text-align:center; font-size:12px; opacity:.45; pointer-events:none; }
.sumo-pad .mid { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; text-align:center; padding:6px; pointer-events:none; }
.sumo-pad .dmg { font-size:clamp(44px, 14vmin, 84px); font-weight:900; font-style:italic; line-height:1; -webkit-text-stroke:2px rgba(0,0,0,.4); font-variant-numeric:tabular-nums; transition: transform .1s; }
.sumo-pad .dmg small { font-size:.45em; }
.sumo-pad .dmg.pop { transform: scale(1.25) rotate(-4deg); }
.sumo-pad .score { display:flex; gap:6px; align-items:center; font-weight:800; font-size:15px; }
.sumo-pad .pip { width:14px; height:14px; border-radius:50%; background:rgba(255,255,255,.18); border:2px solid rgba(0,0,0,.35); }
.sumo-pad .pip.on { background:#ffcf3a; box-shadow:0 0 8px #ffcf3a; }
.sumo-pad .status { font-size:clamp(13px, 4vmin, 18px); font-weight:800; min-height:1.3em; padding:4px 10px; border-radius:12px; background:rgba(255,255,255,.08); }
.sumo-pad .power { font-size:13px; font-weight:900; padding:3px 10px; border-radius:999px; color:#1a1030; }
.sumo-pad .right { position:relative; display:flex; align-items:center; justify-content:center; }
.sumo-pad .btns { position:relative; width:min(46vmin, 300px); height:min(70vmin, 300px); }
.sumo-pad .pk-btn { position:absolute; font-size:clamp(16px, 5vmin, 24px); letter-spacing:.04em; font-weight:900; }
.sumo-pad .b-dash { right:0; bottom:4%; width:min(36vmin, 170px) !important; height:min(36vmin, 170px) !important; }
.sumo-pad .b-slam { left:0; top:0; width:min(28vmin, 132px) !important; height:min(28vmin, 132px) !important; overflow:hidden; }
.sumo-pad .b-slam .fill { position:absolute; left:0; right:0; bottom:0; height:0; background:rgba(255,255,255,.45); pointer-events:none; }
.sumo-pad .b-slam.down .fill { height:100%; transition: height 1s linear; }
.sumo-pad .b-slam span, .sumo-pad .b-dash span { position:relative; }
.sumo-pad .b-dash small, .sumo-pad .b-slam small { display:block; font-size:.5em; opacity:.85; font-weight:700; }
.sumo-pad.disabled .right, .sumo-pad.disabled .left { opacity:.35; }
.sumo-over { position:absolute; inset:0; display:none; place-items:center; text-align:center; pointer-events:none; }
.sumo-over.show { display:grid; }
.sumo-over div { background:rgba(10,8,24,.82); border:2px solid rgba(255,255,255,.15); border-radius:22px; padding:16px 26px; font-weight:900; font-size:clamp(20px, 6vmin, 30px); box-shadow:0 10px 30px rgba(0,0,0,.4); }
.sumo-over div small { display:block; font-size:.55em; opacity:.8; font-weight:700; margin-top:4px; }
@media (orientation: portrait) {
  .sumo-pad { grid-template-columns: 1fr; grid-template-rows: auto 1fr 1fr; }
  .sumo-pad .mid { order:1; }
  .sumo-pad .right { order:2; }
  .sumo-pad .left { order:3; }
}
`;

const POWER = { mega: ['MEGA', '#ff9a4a'], feather: ['FEATHER', '#6fe8ff'], spikes: ['SPIKES', '#c08aff'] };

function dmgColor(d) {
  if (d < 40) return '#ffffff';
  if (d < 80) return '#ffe15a';
  if (d < 130) return '#ff9a3a';
  return '#ff4a3a';
}

export default function start(ctx) {
  const { kit } = ctx;
  const style = document.createElement('style');
  style.textContent = CSS;
  ctx.container.appendChild(style);
  const root = document.createElement('div');
  root.className = 'sumo-pad';
  root.innerHTML = `
    <div class="left"><div class="hint">drag anywhere to move</div></div>
    <div class="mid">
      <div class="dmg">0<small>%</small></div>
      <div class="score"></div>
      <div class="power" hidden></div>
      <div class="status">Get ready…</div>
    </div>
    <div class="right"><div class="btns"></div></div>
    <div class="sumo-over"><div></div></div>`;
  ctx.container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const dmgEl = $('.dmg');
  const scoreEl = $('.score');
  const statusEl = $('.status');
  const powerEl = $('.power');
  const over = $('.sumo-over');

  // --- input (same protocol as kit.gamepad so the screen can use trackInput)
  const state = { x: 0, y: 0, b: { a: false, b: false } };
  let pending = null;
  let lastSend = 0;
  const flush = () => { pending = null; lastSend = performance.now(); ctx.send({ type: 'input', x: state.x, y: state.y, b: { ...state.b } }); };
  const schedule = (now) => {
    if (now) { if (pending) clearTimeout(pending); flush(); return; }
    if (pending) return;
    pending = setTimeout(flush, Math.max(0, 33 - (performance.now() - lastSend)));
  };
  const stick = kit.joystick($('.left'), { color: ctx.player.color, onMove: (x, y) => { state.x = x; state.y = y; schedule(x === 0 && y === 0); } });
  const btns = $('.btns');
  const slam = kit.button(btns, {
    label: '<div class="fill"></div><span>SLAM<small>hold</small></span>', color: '#5a6bff',
    onDown: () => { state.b.b = true; schedule(true); },
    onUp: () => { state.b.b = false; schedule(true); ctx.vibrate(25); },
  });
  slam.el.classList.add('b-slam');
  const dash = kit.button(btns, {
    label: '<span>DASH<small>shove</small></span>', color: '#ff6b3d',
    onDown: () => { state.b.a = true; schedule(true); },
    onUp: () => { state.b.a = false; schedule(true); },
  });
  dash.el.classList.add('b-dash');

  // --- status from the screen
  let respawnTimer = 0;
  let lastDmg = 0;
  function showOver(html) {
    over.classList.toggle('show', !!html);
    over.firstElementChild.innerHTML = html || '';
  }
  function render(s) {
    clearInterval(respawnTimer);
    dmgEl.innerHTML = `${s.dmg}<small>%</small>`;
    dmgEl.style.color = dmgColor(s.dmg);
    if (s.dmg > lastDmg) { dmgEl.classList.add('pop'); setTimeout(() => dmgEl.classList.remove('pop'), 140); }
    lastDmg = s.dmg;
    scoreEl.innerHTML = s.mode === 'rounds'
      ? `${Array.from({ length: s.target }, (_, i) => `<span class="pip ${i < s.wins ? 'on' : ''}"></span>`).join('')}<span style="margin-left:4px">${s.wins}/${s.target} wins</span>`
      : `⭐ ${s.pts} pts`;
    if (s.power && POWER[s.power]) {
      powerEl.hidden = false;
      powerEl.textContent = `${POWER[s.power][0]}!`;
      powerEl.style.background = POWER[s.power][1];
    } else powerEl.hidden = true;
    const disabled = !['alive'].includes(s.st) || s.phase === 'intro';
    root.classList.toggle('disabled', disabled && s.phase !== 'countdown');
    let st = '';
    let ov = '';
    switch (s.st) {
      case 'intro': st = 'How to play is on the TV!'; break;
      case 'alive': st = s.phase === 'countdown' ? `Round ${s.round} · ${s.arena}` : s.phase === 'roundEnd' ? 'Round over!' : 'Shove them off!'; break;
      case 'falling': st = 'Aaaaaah!'; ov = '😱 Falling!'; break;
      case 'out': st = 'Knocked out! Watching…'; ov = s.phase === 'roundEnd' ? '' : '💦 Knocked out!<small>Watching… back next round</small>'; break;
      case 'respawn': {
        let left = Math.ceil(s.respawnIn);
        st = `Respawning in ${left}`;
        ov = `💦 Splash!<small>Respawning in ${left}</small>`;
        respawnTimer = setInterval(() => {
          left -= 1;
          if (left <= 0) { clearInterval(respawnTimer); return; }
          statusEl.textContent = `Respawning in ${left}`;
          over.firstElementChild.innerHTML = `💦 Splash!<small>Respawning in ${left}</small>`;
        }, 1000);
        break;
      }
      case 'wait': st = 'You join next round!'; ov = '⏳ Hang tight!<small>You join next round</small>'; break;
      case 'roundEnd': st = 'Round over!'; break;
      case 'results': st = 'Match over!'; ov = '🏆 Match over!<small>Check the TV</small>'; break;
      default: st = '';
    }
    statusEl.textContent = st;
    showOver(ov);
  }

  ctx.onMessage((m) => {
    if (m?.type === 'st') render(m);
    else if (m?.type === 'buzz') ctx.vibrate(m.p);
  });
  ctx.send({ type: 'hello' });

  return {
    destroy() {
      clearInterval(respawnTimer);
      if (pending) clearTimeout(pending);
      stick.destroy(); slam.destroy(); dash.destroy();
      root.remove();
      style.remove();
    },
  };
}
