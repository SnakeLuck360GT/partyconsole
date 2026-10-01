// Tower Topple — phone controller. Joystick + SPIN / TIP / DROP on your turn; status and a
// "BLOW" button (nudges the hanging piece) while you wait or spectate.
const CSS = `
.ttc { position:absolute; inset:0; display:flex; flex-direction:column; background:
  radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--me) 28%, transparent), transparent 60%), linear-gradient(#1a2446, #0d1020); }
.ttc-status { flex:none; display:flex; align-items:center; gap:12px; padding:10px 14px 8px; position:relative; }
.ttc-stext { flex:1; min-width:0; }
.ttc-title { font-size: clamp(20px, 6vmin, 32px); font-weight:700; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ttc-sub { font-size: clamp(13px, 3.6vmin, 17px); color:#b9c2e6; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ttc-hearts { font-size: clamp(18px, 5vmin, 26px); letter-spacing:-2px; flex:none; }
.ttc-hearts .lost { filter: grayscale(1) brightness(.5); opacity:.5; }
.ttc-timer { position:absolute; left:14px; right:14px; bottom:0; height:6px; border-radius:6px; background:rgba(255,255,255,.12); overflow:hidden; }
.ttc-timer i { display:block; height:100%; background: var(--me); transform-origin:left; }
.ttc-timer.low i { background:#ff5a5a; }
.ttc-body { flex:1; min-height:0; position:relative; }
.ttc-turn { position:absolute; inset:0; display:grid; grid-template-columns: 1fr 1fr; }
.ttc-stick { position:relative; }
.ttc-stick-hint { position:absolute; left:0; right:0; bottom:8px; text-align:center; color:#8f9ac4; font-size:13px; pointer-events:none; }
.ttc-btns { display:grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr; gap: 3vmin; padding: 3vmin 4vmin 4vmin; align-items:center; justify-items:center; }
.ttc-btns .pk-btn-round { width: min(22vmin, 110px); height: min(22vmin, 110px); font-size: clamp(14px, 4.4vmin, 22px); line-height:1.1; }
.ttc-btns .ttc-drop { grid-column: 1 / -1; width: 100%; height: 100%; min-height: 90px; max-height: 190px; border-radius: 28px; font-size: clamp(28px, 9vmin, 48px); letter-spacing:.05em; }
@media (orientation: portrait) {
  .ttc-turn { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .ttc-btns { order:1; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; }
  .ttc-btns .ttc-drop { height: 16vh; }
  .ttc-stick { order:2; }
}
.ttc-wait { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap: 3vmin; padding: 14px; text-align:center; }
.ttc-av { width: clamp(64px, 20vmin, 110px); aspect-ratio:1; border-radius:50%; display:grid; place-items:center; font-size: clamp(36px, 12vmin, 64px); background: var(--c); box-shadow: 0 0 0 4px rgba(255,255,255,.8), 0 8px 24px rgba(0,0,0,.4); }
.ttc-big { font-size: clamp(22px, 7vmin, 36px); font-weight:700; }
.ttc-small { font-size: clamp(14px, 4vmin, 19px); color:#b9c2e6; }
.ttc-row { display:flex; align-items:center; gap: 5vmin; }
.ttc-blow { width: min(34vmin, 170px) !important; height: min(34vmin, 170px) !important; font-size: clamp(18px, 6vmin, 30px) !important; }
.ttc-blow small { display:block; font-size:.5em; font-weight:600; opacity:.9; }
.ttc-pulse { animation: ttc-pulse 1s ease-in-out infinite; }
.ttc-skip { margin-top: 2vmin; padding: 12px 26px; border-radius: 14px; border:0; background: rgba(255,255,255,.14); color:#fff; font-size:18px; font-weight:600; font-family:inherit; }
.ttc-flash { position:absolute; inset:0; pointer-events:none; background: var(--me); opacity:0; }
.ttc-flash.on { animation: ttc-flash .7s ease-out; }
.ttc-flash.hurt { background:#ff3b3b; }
@keyframes ttc-pulse { 50% { transform: scale(1.06); } }
@keyframes ttc-flash { 0% { opacity:.55; } 100% { opacity:0; } }
`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default function start(ctx) {
  const { kit } = ctx;
  const root = document.createElement('div');
  root.className = 'ttc';
  root.innerHTML = `<style>${CSS}</style>
    <div class="ttc-status"><div class="ttc-stext"><div class="ttc-title">Tower Topple</div><div class="ttc-sub">Connecting…</div></div>
      <div class="ttc-hearts"></div><div class="ttc-timer" hidden><i></i></div></div>
    <div class="ttc-body"></div><div class="ttc-flash"></div>`;
  ctx.container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const body = $('.ttc-body');
  let mode = null;
  let widgets = [];
  let state = null;
  let timerEnd = 0;
  let timerTotal = 12;
  let raf = 0;
  let moveTimer = 0;
  let lastMove = { x: 0, y: 0 };
  let pendingMove = null;
  let lastSentAt = 0;

  function flash(cls = '') {
    const f = $('.ttc-flash');
    f.className = `ttc-flash ${cls}`;
    void f.offsetWidth;
    f.classList.add('on');
  }

  function sendMove(x, y, force) {
    pendingMove = { x, y };
    const now = performance.now();
    if (force || now - lastSentAt > 50) {
      clearTimeout(moveTimer);
      flushMove();
    } else if (!moveTimer) {
      moveTimer = setTimeout(flushMove, 50 - (now - lastSentAt));
    }
  }
  function flushMove() {
    moveTimer = 0;
    if (!pendingMove) return;
    if (pendingMove.x === lastMove.x && pendingMove.y === lastMove.y) return;
    lastMove = pendingMove;
    lastSentAt = performance.now();
    ctx.send({ type: 'move', x: pendingMove.x, y: pendingMove.y });
  }

  function clearBody() {
    widgets.forEach((w) => w.destroy?.());
    widgets = [];
    body.innerHTML = '';
    clearTimeout(moveTimer);
    moveTimer = 0;
  }

  function buildTurn() {
    const wrap = document.createElement('div');
    wrap.className = 'ttc-turn';
    const stick = document.createElement('div');
    stick.className = 'ttc-stick';
    const btns = document.createElement('div');
    btns.className = 'ttc-btns';
    wrap.append(stick, btns);
    body.appendChild(wrap);
    widgets.push(kit.joystick(stick, { color: ctx.player.color, onMove: (x, y) => sendMove(x, y, x === 0 && y === 0) }));
    const hint = document.createElement('div');
    hint.className = 'ttc-stick-hint';
    hint.textContent = 'drag to move the piece';
    stick.appendChild(hint);
    widgets.push(kit.button(btns, { label: '⟳<br>SPIN', color: '#5c6cff', onDown: () => ctx.send({ type: 'spin' }) }));
    widgets.push(kit.button(btns, { label: '⤵<br>TIP', color: '#1fb5b5', onDown: () => ctx.send({ type: 'tip' }) }));
    const drop = kit.button(btns, { label: 'DROP ⬇', color: '#ff9f43', shape: 'rect', onDown: () => { ctx.send({ type: 'drop' }); ctx.vibrate(40); } });
    drop.el.classList.add('ttc-drop');
    widgets.push(drop);
  }

  function buildWait() {
    const w = document.createElement('div');
    w.className = 'ttc-wait';
    w.innerHTML = `<div class="ttc-row"><div class="ttc-av"></div><div style="text-align:left"><div class="ttc-big ttc-who"></div><div class="ttc-small ttc-what"></div></div></div>
      <div class="ttc-blowbox"></div><div class="ttc-small ttc-note"></div>`;
    body.appendChild(w);
    const b = kit.button(w.querySelector('.ttc-blowbox'), {
      label: '💨<small>BLOW!</small>', color: '#3d8bff',
      onDown: () => { if (state?.canBlow) ctx.send({ type: 'blow' }); },
    });
    b.el.classList.add('ttc-blow');
    widgets.push(b);
  }

  function buildMessage(html, withSkip) {
    const w = document.createElement('div');
    w.className = 'ttc-wait';
    w.innerHTML = html;
    body.appendChild(w);
    if (withSkip) {
      const s = document.createElement('button');
      s.className = 'ttc-skip';
      s.textContent = 'Skip intro ▶';
      s.onclick = () => { ctx.send({ type: 'skip' }); ctx.vibrate(15); };
      w.appendChild(s);
    }
  }

  function heartsHtml(h, max) {
    let s = '';
    for (let i = 0; i < max; i++) s += `<span class="${i < h ? '' : 'lost'}">${i < h ? '❤️' : '🖤'}</span>`;
    return s;
  }

  function setStatus(title, sub) {
    $('.ttc-title').innerHTML = title;
    $('.ttc-sub').innerHTML = sub;
  }

  function tickTimer() {
    raf = requestAnimationFrame(tickTimer);
    const t = $('.ttc-timer');
    if (mode !== 'turn') { t.hidden = true; return; }
    t.hidden = false;
    const left = Math.max(0, (timerEnd - performance.now()) / 1000);
    t.querySelector('i').style.transform = `scaleX(${left / timerTotal})`;
    t.classList.toggle('low', left < 3.5);
  }
  tickTimer();

  function render(s) {
    state = s;
    const newMode = s.phase === 'turn' ? 'turn' : s.phase === 'intro' ? 'intro' : s.phase === 'over' ? 'over' : 'wait';
    const modeKey = newMode === 'intro' ? `intro-${s.isAdmin}` : newMode;
    if (modeKey !== mode) {
      clearBody();
      mode = newMode === 'intro' ? 'intro' : newMode;
      if (newMode === 'turn') buildTurn();
      else if (newMode === 'wait') buildWait();
      else if (newMode === 'intro') {
        buildMessage(`<div class="ttc-big">🏗️ Get ready!</div><div class="ttc-small">Steer the hanging piece with the joystick,<br>SPIN / TIP to rotate, then DROP it on the tower.<br>Topple anything and you lose a ❤️.</div>`, s.isAdmin);
      } else {
        buildMessage(`<div class="ttc-big">${s.youWon ? '🏆 You win!' : '🏁 Game over'}</div><div class="ttc-small">${s.winner ? `${esc(s.winner)} wins!` : ''}</div>`);
      }
      mode = modeKey;
    }
    $('.ttc-hearts').innerHTML = s.maxHearts ? heartsHtml(s.hearts, s.maxHearts) : '';
    const special = s.special ? ` · ${s.special.icon} ${s.special.label}` : '';
    if (newMode === 'turn') {
      timerEnd = performance.now() + s.timeLeft * 1000;
      timerTotal = s.turnTime || 12;
      setStatus('<span class="ttc-pulse" style="display:inline-block">YOUR TURN!</span>', `${esc(s.piece || '')}${special}${s.wind ? ` · 💨 wind ${s.wind}` : ''}`);
    } else if (newMode === 'intro') {
      setStatus('Tower Topple', s.solo ? 'Solo: build as high as you can!' : 'Last builder standing wins');
    } else if (newMode === 'wait') {
      const a = s.active;
      const av = body.querySelector('.ttc-av');
      const who = body.querySelector('.ttc-who');
      const what = body.querySelector('.ttc-what');
      const note = body.querySelector('.ttc-note');
      const blow = body.querySelector('.ttc-blow');
      if (s.phase === 'dropped') {
        setStatus('Dropped! 🤞', 'Waiting for the tower to settle…');
        av.style.setProperty('--c', ctx.player.color);
        av.textContent = ctx.player.avatar || '🙂';
        who.textContent = 'Fingers crossed…';
        what.textContent = s.piece ? `your ${s.piece}` : '';
      } else {
        if (!s.alive) setStatus("You're out 💀", 'Spectating — blow the pieces around!');
        else if (s.turnsUntil === 1) setStatus("You're next!", 'Get ready…');
        else if (s.turnsUntil > 1) setStatus(`Next up in ${s.turnsUntil} turns`, s.wind ? `💨 wind level ${s.wind}` : 'Watch the tower…');
        else setStatus('Waiting…', '');
        if (a) {
          av.style.setProperty('--c', a.color);
          av.textContent = a.avatar;
          who.textContent = a.name;
          what.textContent = `is dropping${s.piece ? ` a ${s.piece}` : ''}${special}`;
        } else {
          av.style.setProperty('--c', '#555');
          av.textContent = '⏳';
          who.textContent = 'Get ready';
          what.textContent = '';
        }
      }
      blow.style.opacity = s.canBlow ? '1' : '0.35';
      note.textContent = s.canBlow ? 'Mash BLOW to make their piece swing!' : '';
    } else {
      setStatus(s.youWon ? 'Champion builder!' : 'Game over', s.record ? `Tallest tower: ${s.record} m` : '');
    }
  }

  ctx.onMessage((msg) => {
    if (!msg) return;
    if (msg.type === 'state') render(msg);
    else if (msg.type === 'yourTurn') { ctx.vibrate([80, 60, 80]); flash(); }
    else if (msg.type === 'hurt') { ctx.vibrate([200, 80, 200]); flash('hurt'); }
    else if (msg.type === 'over') {
      if (state) render({ ...state, phase: 'over', winner: msg.winner, youWon: msg.youWon, record: msg.record });
      if (msg.youWon) ctx.vibrate([60, 40, 60, 40, 160]);
    }
  });
  ctx.send({ type: 'hello' });

  return {
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(moveTimer);
      clearBody();
      root.remove();
    },
  };
}
