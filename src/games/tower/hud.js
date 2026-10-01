// DOM HUD for the TV screen: active-player card with timer, turn-order strip, hearts list,
// height gauge, wind indicator, intro card and small toasts. All classes are prefixed `tt-`.
import { escapeHtml } from '../../sdk/screen-kit.js';

const CSS = `
.tt-hud { position:absolute; inset:0; pointer-events:none; font-family: var(--font, system-ui); color:#fff; z-index:20; }
.tt-hud * { box-sizing:border-box; }
.tt-shadow { text-shadow: 0 2px 10px rgba(0,0,0,.35); }
.tt-glass { background: rgba(18,28,58,.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border:1px solid rgba(255,255,255,.14); border-radius:18px; box-shadow: 0 10px 30px rgba(0,20,60,.25); }

.tt-title { position:absolute; left:18px; top:14px; display:flex; flex-direction:column; gap:6px; }
.tt-logo { font-weight:700; font-size: clamp(20px, 2vw, 34px); letter-spacing:.01em; line-height:1; }
.tt-logo b { color:#ffd23f; }
.tt-chips { display:flex; gap:8px; flex-wrap:wrap; }
.tt-chip { padding:5px 12px; border-radius:999px; font-size: clamp(13px, 1.05vw, 18px); font-weight:600; background:rgba(18,28,58,.55); border:1px solid rgba(255,255,255,.14); display:flex; align-items:center; gap:6px; }
.tt-chip.wind { background: rgba(80,160,255,.45); }
.tt-chip.wind .arrow { display:inline-block; transition: transform .6s; font-size:1.1em; }
.tt-chip.gust { animation: tt-pulse .8s ease-in-out infinite; }

.tt-active { position:absolute; top:14px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:14px; padding:10px 22px 10px 12px; min-width: min(460px, 40vw); transition: opacity .3s, transform .3s; }
.tt-active.hidden { opacity:0; transform:translate(-50%, -20px); }
.tt-av { width: clamp(46px, 4.2vw, 70px); aspect-ratio:1; border-radius:50%; display:grid; place-items:center; font-size: clamp(26px, 2.4vw, 42px); background:var(--c); box-shadow: 0 0 0 4px rgba(255,255,255,.85), 0 6px 18px rgba(0,0,0,.3); flex:none; }
.tt-active-text { flex:1; min-width:0; }
.tt-active-name { font-size: clamp(22px, 2.2vw, 38px); font-weight:700; line-height:1.05; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tt-active-sub { font-size: clamp(13px, 1.1vw, 19px); opacity:.9; margin-top:3px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.tt-piece { padding:2px 10px; border-radius:999px; background:rgba(255,255,255,.18); font-weight:600; }
.tt-special { padding:2px 10px; border-radius:999px; background:var(--sc); color:#10131a; font-weight:700; animation: tt-pulse 1s ease-in-out infinite; }
.tt-timer { position:relative; width: clamp(50px, 4.4vw, 74px); aspect-ratio:1; flex:none; }
.tt-timer svg { width:100%; height:100%; transform: rotate(-90deg); }
.tt-timer .bg { stroke: rgba(255,255,255,.18); }
.tt-timer .fg { stroke: var(--c); transition: stroke-dashoffset .12s linear; }
.tt-timer span { position:absolute; inset:0; display:grid; place-items:center; font-weight:700; font-size: clamp(18px, 1.7vw, 30px); }
.tt-timer.low span { color:#ff6b6b; animation: tt-pulse .5s ease-in-out infinite; }

.tt-players { position:absolute; right:14px; top:62px; padding:10px 12px; max-height: calc(100% - 200px); overflow:hidden; display:grid; gap:2px 14px; font-size: clamp(13px, 1vw, 18px); }
.tt-players.cols2 { grid-template-columns: 1fr 1fr; font-size: clamp(11px, .85vw, 15px); }
.tt-players h4 { margin:0 0 4px; font-size:.85em; color:#ffd23f; letter-spacing:.08em; text-transform:uppercase; grid-column: 1 / -1; }
.tt-prow { display:flex; align-items:center; gap:7px; padding:2px 0; transition: opacity .3s; }
.tt-prow.out { opacity:.4; text-decoration: line-through; }
.tt-prow.active .tt-pname { color:#ffd23f; }
.tt-pdot { width:.95em; height:.95em; border-radius:50%; background:var(--c); flex:none; box-shadow: 0 0 0 2px rgba(255,255,255,.5); }
.tt-pname { flex:1; min-width:0; max-width: 9em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; }
.tt-hearts { white-space:nowrap; letter-spacing:-.05em; font-size:.9em; }
.tt-hearts i { font-style:normal; display:inline-block; }
.tt-hearts i.lost { filter: grayscale(1) brightness(.6); opacity:.5; }
.tt-hearts i.pop { animation: tt-heartpop .8s ease-out; }

.tt-queue { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); display:flex; align-items:flex-end; gap:10px; padding:10px 16px; max-width: calc(100% - 300px); }
.tt-q { display:flex; flex-direction:column; align-items:center; gap:3px; width: clamp(64px, 6vw, 96px); transition: transform .35s; }
.tt-q .tt-av { width: clamp(38px, 3.2vw, 54px); font-size: clamp(22px, 1.8vw, 32px); box-shadow: 0 0 0 3px rgba(255,255,255,.55); }
.tt-q.now .tt-av { width: clamp(52px, 4.4vw, 72px); font-size: clamp(30px, 2.5vw, 44px); box-shadow: 0 0 0 4px #ffd23f, 0 0 24px #ffd23f; }
.tt-q .qn { font-size: clamp(11px, .9vw, 16px); font-weight:600; max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tt-q .qh { font-size: clamp(9px, .75vw, 13px); }
.tt-q .qtag { font-size: clamp(9px, .7vw, 12px); font-weight:700; color:#10131a; background:#ffd23f; border-radius:999px; padding:0 7px; }
.tt-q .qtag.next { background: rgba(255,255,255,.8); }
.tt-more { align-self:center; font-weight:700; font-size: clamp(13px, 1vw, 18px); opacity:.85; padding: 0 6px; }
.tt-arrow { align-self:center; opacity:.5; font-size: clamp(14px, 1.2vw, 22px); }

.tt-gauge { position:absolute; left:22px; top:50%; transform:translateY(-45%); height: 46vh; width: 64px; }
.tt-gauge .bar { position:absolute; left:26px; top:0; bottom:0; width:12px; border-radius:8px; background: rgba(18,28,58,.45); border:1px solid rgba(255,255,255,.2); overflow:hidden; }
.tt-gauge .fill { position:absolute; left:0; right:0; bottom:0; background: linear-gradient(#ffe38a, #ff9f43); transition: height .6s cubic-bezier(.2,1.2,.4,1); }
.tt-gauge .tick { position:absolute; left:18px; width:28px; height:2px; background: rgba(255,255,255,.35); }
.tt-gauge .tick span { position:absolute; left:-20px; top:-8px; font-size:11px; opacity:.8; width:18px; text-align:right; }
.tt-gauge .rec { position:absolute; left:10px; width:44px; height:3px; background:#ffd23f; box-shadow: 0 0 8px #ffd23f; transition: bottom .6s; }
.tt-gauge .rec b { position:absolute; left:48px; top:-10px; font-size:13px; white-space:nowrap; color:#ffd23f; }
.tt-gauge .cur { position:absolute; left:40px; transition: bottom .6s cubic-bezier(.2,1.2,.4,1); font-weight:700; font-size: clamp(16px, 1.4vw, 24px); white-space:nowrap; transform: translateY(50%); }
.tt-gauge .cur::before { content:'◀'; font-size:.7em; margin-right:4px; color:#ffe38a; }
.tt-gauge .lbl { position:absolute; left:0; bottom:-30px; font-size:12px; font-weight:600; opacity:.85; letter-spacing:.08em; }

.tt-toast { position:absolute; left:50%; top: 22%; transform:translate(-50%, 0); padding: 12px 26px; font-size: clamp(22px, 2.4vw, 44px); font-weight:700; border-radius: 22px; background: rgba(18,28,58,.6); animation: tt-toast 2.2s cubic-bezier(.2,1.4,.4,1) forwards; white-space:nowrap; }
.tt-toast.good { background: rgba(40,170,90,.75); }
.tt-toast.bad { background: rgba(220,60,70,.8); }
.tt-toast.gold { background: rgba(255,190,40,.85); color:#2a1a00; text-shadow:none; }

.tt-intro { position:absolute; inset:0; display:grid; place-items:center; background: rgba(10,20,50,.35); animation: tt-fade .4s; }
.tt-intro-card { padding: 3vh 3vw; max-width: min(1000px, 86vw); text-align:center; }
.tt-intro h1 { margin:0 0 1vh; font-size: clamp(40px, 5vw, 90px); line-height:1; }
.tt-intro h1 b { color:#ffd23f; }
.tt-intro .sub { font-size: clamp(16px, 1.6vw, 28px); opacity:.9; margin-bottom: 3vh; }
.tt-steps { display:grid; grid-template-columns: repeat(3, 1fr); gap: 2vw; }
.tt-step { background: rgba(255,255,255,.1); border-radius: 18px; padding: 2vh 1.2vw; }
.tt-step .ic { font-size: clamp(34px, 3.6vw, 64px); }
.tt-step .t { font-size: clamp(16px, 1.5vw, 26px); font-weight:700; margin: .6vh 0 .4vh; }
.tt-step .d { font-size: clamp(12px, 1.05vw, 18px); opacity:.88; line-height:1.3; }
.tt-intro .bar { height:6px; border-radius:6px; background: rgba(255,255,255,.2); margin-top: 3vh; overflow:hidden; }
.tt-intro .bar i { display:block; height:100%; width:100%; background:#ffd23f; transform-origin:left; animation: tt-shrink linear forwards; }

.tt-wait { position:absolute; left:50%; top:45%; transform:translate(-50%,-50%); padding: 20px 34px; font-size: clamp(20px, 2vw, 34px); font-weight:600; }

@keyframes tt-pulse { 50% { transform: scale(1.08); } }
@keyframes tt-heartpop { 0% { transform: scale(1.8); filter:none; opacity:1; } 100% { transform: scale(1); } }
@keyframes tt-toast { 0% { opacity:0; transform: translate(-50%, 20px) scale(.7); } 12% { opacity:1; transform: translate(-50%, 0) scale(1); } 80% { opacity:1; } 100% { opacity:0; transform: translate(-50%, -20px) scale(.95); } }
@keyframes tt-fade { from { opacity:0; } }
@keyframes tt-shrink { to { transform: scaleX(0); } }
`;

export const heartsHtml = (h, max, popIndex = -1) => {
  let s = '';
  for (let i = 0; i < max; i++) s += `<i class="${i < h ? '' : 'lost'} ${i === popIndex ? 'pop' : ''}">${i < h ? '❤️' : '🖤'}</i>`;
  return s;
};

export function createHud(container) {
  const root = document.createElement('div');
  root.className = 'tt-hud tt-shadow';
  root.innerHTML = `<style>${CSS}</style>
    <div class="tt-title"><div class="tt-logo">Tower <b>Topple</b></div><div class="tt-chips"><span class="tt-chip round">Round 1</span><span class="tt-chip wind" hidden></span><span class="tt-chip mode" hidden></span></div></div>
    <div class="tt-active tt-glass hidden"></div>
    <div class="tt-players tt-glass"></div>
    <div class="tt-queue tt-glass"></div>
    <div class="tt-gauge"><div class="bar"><div class="fill"></div></div><div class="ticks"></div><div class="rec" hidden><b></b></div><div class="cur">0.0m</div><div class="lbl">HEIGHT</div></div>
  `;
  container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const active = $('.tt-active');
  let timerEls = null;
  let gaugeMax = 0;

  function setGaugeScale(max) {
    if (max === gaugeMax) return;
    gaugeMax = max;
    const step = max <= 8 ? 1 : max <= 16 ? 2 : 5;
    let html = '';
    for (let v = step; v < max; v += step) html += `<div class="tick" style="bottom:${(v / max) * 100}%"><span>${v}</span></div>`;
    $('.tt-gauge .ticks').innerHTML = html;
  }

  return {
    el: root,
    setRound(n, extra = '') { $('.round').textContent = `Round ${n}${extra}`; },
    setMode(text) { const m = $('.mode'); m.hidden = !text; m.textContent = text || ''; },
    setWind(level, angleDeg, gust) {
      const w = $('.wind');
      w.hidden = level <= 0;
      if (level > 0) {
        w.innerHTML = `💨 Wind <span class="arrow" style="transform:rotate(${angleDeg}deg)">➜</span> ${'▮'.repeat(level)}${'▯'.repeat(Math.max(0, 5 - level))}`;
        w.classList.toggle('gust', !!gust);
      }
    },
    showActive(p, pieceName, special, turnTime) {
      if (!p) { active.classList.add('hidden'); return; }
      active.style.setProperty('--c', p.color);
      active.innerHTML = `
        <div class="tt-av">${p.avatar}</div>
        <div class="tt-active-text">
          <div class="tt-active-name">${escapeHtml(p.name)}</div>
          <div class="tt-active-sub"><span>is dropping</span><span class="tt-piece">${escapeHtml(pieceName)}</span>
          ${special ? `<span class="tt-special" style="--sc:${special.color}">${special.icon} ${special.label}</span>` : ''}</div>
        </div>
        <div class="tt-timer"><svg viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="17" fill="none" stroke-width="4"/><circle class="fg" cx="20" cy="20" r="17" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="106.8" stroke-dashoffset="0"/></svg><span>${Math.ceil(turnTime)}</span></div>`;
      active.classList.remove('hidden');
      timerEls = { box: active.querySelector('.tt-timer'), fg: active.querySelector('.fg'), txt: active.querySelector('.tt-timer span'), last: -1 };
    },
    setActiveStatus(text) {
      const s = active.querySelector('.tt-active-sub span');
      if (s) s.textContent = text;
      if (timerEls && text !== 'is dropping') timerEls.box.style.visibility = 'hidden';
    },
    setTimer(left, total) {
      if (!timerEls) return;
      timerEls.fg.style.strokeDashoffset = String(106.8 * (1 - Math.max(0, left) / total));
      const s = Math.max(0, Math.ceil(left));
      if (s !== timerEls.last) {
        timerEls.last = s;
        timerEls.txt.textContent = s;
        timerEls.box.classList.toggle('low', left <= 3.5);
      }
    },
    hideActive() { active.classList.add('hidden'); timerEls = null; },
    renderPlayers(rows, activeId, maxHearts, popId) {
      const el = $('.tt-players');
      el.classList.toggle('cols2', rows.length > 12);
      el.hidden = rows.length === 0;
      el.innerHTML = `<h4>Players</h4>` + rows.map((r) => `
        <div class="tt-prow ${r.alive ? '' : 'out'} ${r.id === activeId ? 'active' : ''}" style="--c:${r.color}">
          <span class="tt-pdot"></span><span class="tt-pname">${escapeHtml(r.name)}${r.connected ? '' : ' 📵'}</span>
          <span class="tt-hearts">${r.alive ? heartsHtml(r.hearts, maxHearts, r.id === popId ? r.hearts : -1) : '💀'}</span>
        </div>`).join('');
    },
    renderQueue(list, more, maxHearts) {
      const el = $('.tt-queue');
      el.hidden = list.length === 0;
      el.innerHTML = list.map((r, i) => `${i === 1 ? '<span class="tt-arrow">‹</span>' : ''}
        <div class="tt-q ${i === 0 ? 'now' : ''}" style="--c:${r.color}">
          ${i === 0 ? '<span class="qtag">NOW</span>' : i === 1 ? '<span class="qtag next">NEXT</span>' : ''}
          <div class="tt-av">${r.avatar}</div>
          <div class="qn">${escapeHtml(r.name)}</div>
          <div class="qh tt-hearts">${heartsHtml(r.hearts, maxHearts)}</div>
        </div>`).join('') + (more > 0 ? `<span class="tt-more">+${more}</span>` : '');
    },
    setHeight(cur, record) {
      const max = Math.max(6, Math.ceil(Math.max(cur, record) * 1.25 / 2) * 2);
      setGaugeScale(max);
      $('.tt-gauge .fill').style.height = `${Math.min(100, (cur / max) * 100)}%`;
      const c = $('.tt-gauge .cur');
      c.style.bottom = `${Math.min(100, (cur / max) * 100)}%`;
      c.textContent = `${cur.toFixed(1)}m`;
      const r = $('.tt-gauge .rec');
      r.hidden = record <= 0.01;
      r.style.bottom = `${Math.min(100, (record / max) * 100)}%`;
      r.querySelector('b').textContent = `🏆 ${record.toFixed(1)}m`;
    },
    toast(html, cls = '', ms = 2200) {
      root.querySelectorAll('.tt-toast').forEach((t) => t.remove());
      const t = document.createElement('div');
      t.className = `tt-toast ${cls}`;
      t.innerHTML = html;
      t.style.animationDuration = `${ms}ms`;
      root.appendChild(t);
      setTimeout(() => t.remove(), ms + 50);
    },
    intro(ms, solo, hearts) {
      const d = document.createElement('div');
      d.className = 'tt-intro';
      d.innerHTML = `<div class="tt-intro-card tt-glass">
        <h1>Tower <b>Topple</b></h1>
        <div class="sub">${solo ? 'Build the tallest tower you can!' : 'Take turns stacking one wobbly tower. Last builder standing wins!'}</div>
        <div class="tt-steps">
          <div class="tt-step"><div class="ic">🕹️</div><div class="t">Aim</div><div class="d">On your turn, steer the hanging piece with the joystick. The ghost shows where it lands.</div></div>
          <div class="tt-step"><div class="ic">🔄</div><div class="t">Spin &amp; Tip</div><div class="d">Rotate it to fit, then hit <b>DROP</b> before the timer runs out.</div></div>
          <div class="tt-step"><div class="ic">💔</div><div class="t">Don't topple!</div><div class="d">Knock any piece off the island and you lose a heart. You have ${hearts} ${hearts === 1 ? 'heart' : 'hearts'}.</div></div>
        </div>
        <div class="bar"><i style="animation-duration:${ms}ms"></i></div>
      </div>`;
      root.appendChild(d);
      return { remove() { d.style.transition = 'opacity .3s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 300); } };
    },
    waiting(text) {
      let d = root.querySelector('.tt-wait');
      if (!text) { d?.remove(); return; }
      if (!d) { d = document.createElement('div'); d.className = 'tt-wait tt-glass'; root.appendChild(d); }
      d.innerHTML = text;
    },
    destroy() { root.remove(); },
  };
}
