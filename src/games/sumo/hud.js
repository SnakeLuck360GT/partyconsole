// DOM HUD for the TV: round header, player cards (damage %, wins/points), kill feed, callouts, intro card.
import { escapeHtml } from '../../sdk/screen-kit.js';
import { damageColor } from './fighters.js';

const CSS = `
.sumo-hud { position:absolute; inset:0; pointer-events:none; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color:#fff; z-index:10; overflow:hidden; }
.sumo-top { position:absolute; top:14px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:4px; }
.sumo-pill { background:linear-gradient(180deg, rgba(20,16,40,.82), rgba(20,16,40,.62)); border:2px solid rgba(255,255,255,.18); border-radius:999px; padding:6px 22px; font-weight:900; letter-spacing:.06em; font-size:clamp(14px,1.5vw,24px); text-transform:uppercase; white-space:nowrap; box-shadow:0 6px 20px rgba(0,0,0,.3); }
.sumo-pill b { color:#ffcf3a; }
.sumo-sub { font-size:clamp(12px,1.05vw,17px); font-weight:700; opacity:.9; text-shadow:0 2px 6px rgba(0,0,0,.6); }
.sumo-timer { font-size:clamp(22px,2.6vw,42px); font-weight:900; font-variant-numeric:tabular-nums; text-shadow:0 3px 10px rgba(0,0,0,.6); }
.sumo-timer.low { color:#ff5a4a; animation: sumoPulse .5s infinite alternate; }
.sumo-cards { position:absolute; left:12px; right:12px; bottom:12px; display:flex; flex-wrap:wrap-reverse; justify-content:center; gap:10px; }
.sumo-card { --c:#fff; position:relative; min-width:clamp(110px,10vw,170px); background:linear-gradient(180deg, rgba(18,14,34,.86), rgba(18,14,34,.7)); border-radius:16px; border-bottom:5px solid var(--c); padding:6px 12px 6px 10px; display:grid; grid-template-columns:auto 1fr; grid-template-rows:auto auto; column-gap:8px; align-items:center; box-shadow:0 6px 18px rgba(0,0,0,.35); transition: transform .15s, opacity .3s, filter .3s; }
.sumo-card .av { grid-row:1 / span 2; width:clamp(34px,3vw,50px); height:clamp(34px,3vw,50px); border-radius:50%; display:grid; place-items:center; background:var(--c); font-size:clamp(20px,1.8vw,30px); box-shadow: inset 0 -4px 0 rgba(0,0,0,.2); }
.sumo-card .nm { font-weight:800; font-size:clamp(12px,1vw,16px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:9em; }
.sumo-card .dm { font-weight:900; font-style:italic; font-size:clamp(22px,2.1vw,36px); line-height:1; -webkit-text-stroke: 1.5px rgba(0,0,0,.5); font-variant-numeric:tabular-nums; }
.sumo-card .dm small { font-size:.55em; }
.sumo-card .pips { position:absolute; top:-9px; right:8px; display:flex; gap:3px; }
.sumo-card .pip { width:12px; height:12px; border-radius:50%; background:rgba(255,255,255,.2); border:2px solid rgba(0,0,0,.4); }
.sumo-card .pip.on { background:#ffcf3a; box-shadow:0 0 8px #ffcf3a; }
.sumo-card .pts { position:absolute; top:-11px; right:8px; background:#ffcf3a; color:#2a1a00; font-weight:900; border-radius:999px; padding:1px 8px; font-size:clamp(12px,1vw,16px); }
.sumo-card.out { filter:grayscale(1) brightness(.6); opacity:.75; }
.sumo-card.out .dm { font-size:clamp(16px,1.4vw,24px); }
.sumo-card.hit { animation: sumoShake .25s; }
.sumo-cards.compact .sumo-card { min-width:0; padding:3px 8px 3px 6px; border-radius:12px; }
.sumo-cards.compact .av { width:26px; height:26px; font-size:16px; }
.sumo-cards.compact .dm { font-size:20px; }
.sumo-cards.compact .nm { font-size:12px; max-width:6em; }
.sumo-cards.tiny { gap:6px; }
.sumo-cards.tiny .sumo-card { grid-template-columns:auto auto; grid-template-rows:auto; }
.sumo-cards.tiny .nm { display:none; }
.sumo-feed { position:absolute; top:14px; right:14px; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.sumo-feed div { background:rgba(18,14,34,.78); border-radius:12px; padding:5px 12px; font-weight:800; font-size:clamp(12px,1.05vw,17px); animation: sumoIn .25s ease-out; transition: opacity .4s; }
.sumo-feed .who { color:var(--c); }
.sumo-board { position:absolute; top:70px; left:14px; background:rgba(18,14,34,.72); border-radius:14px; padding:8px 12px; font-weight:800; font-size:clamp(12px,1vw,16px); min-width:170px; }
.sumo-board .row { display:flex; gap:8px; align-items:center; padding:1px 0; }
.sumo-board .row span:nth-child(2) { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:9em; }
.sumo-board .dot { width:12px; height:12px; border-radius:50%; background:var(--c); }
.sumo-board h4 { margin:0 0 4px; color:#ffcf3a; font-size:.9em; letter-spacing:.08em; }
.sumo-callout { position:absolute; left:0; right:0; top:38%; text-align:center; font-weight:900; font-style:italic; font-size:clamp(48px,8vw,140px); letter-spacing:.02em; color:#fff; -webkit-text-stroke: 4px rgba(30,10,40,.85); paint-order: stroke fill; text-shadow: 0 10px 0 rgba(30,10,40,.6), 0 18px 40px rgba(0,0,0,.4); animation: sumoPop .45s cubic-bezier(.2,1.6,.4,1); transition: opacity .3s, transform .3s; }
.sumo-callout small { display:block; font-size:.32em; font-style:normal; -webkit-text-stroke: 2px rgba(30,10,40,.85); margin-top:.2em; }
.sumo-callout.out { opacity:0; transform:scale(1.3); }
.sumo-intro { position:absolute; inset:0; display:grid; place-items:center; background:radial-gradient(ellipse at center, rgba(20,10,40,.55), rgba(10,5,25,.85)); animation: sumoFade .4s; transition: opacity .4s; }
.sumo-intro.out { opacity:0; }
.sumo-intro .card { text-align:center; max-width:min(1100px,92vw); }
.sumo-intro h1 { margin:0; font-size:clamp(48px,7vw,120px); font-weight:900; font-style:italic; -webkit-text-stroke:4px #2a0f3a; paint-order:stroke fill; color:#ffcf3a; text-shadow:0 10px 0 #2a0f3a; }
.sumo-intro p.goal { font-size:clamp(18px,2vw,32px); font-weight:800; margin:10px 0 28px; }
.sumo-intro .moves { display:flex; gap:clamp(12px,2vw,30px); justify-content:center; }
.sumo-intro .mv { background:rgba(255,255,255,.08); border:2px solid rgba(255,255,255,.15); border-radius:22px; padding:18px 22px; width:clamp(150px,17vw,260px); }
.sumo-intro .ic { width:clamp(60px,6vw,96px); height:clamp(60px,6vw,96px); margin:0 auto 10px; border-radius:50%; display:grid; place-items:center; font-weight:900; font-size:clamp(14px,1.3vw,20px); box-shadow:0 6px 0 rgba(0,0,0,.35); }
.sumo-intro .mv b { display:block; font-size:clamp(18px,1.7vw,28px); }
.sumo-intro .mv span { font-size:clamp(13px,1.1vw,18px); opacity:.85; }
.sumo-intro .bar { margin:26px auto 0; width:min(420px,60vw); height:8px; border-radius:8px; background:rgba(255,255,255,.15); overflow:hidden; }
.sumo-intro .bar i { display:block; height:100%; background:#ffcf3a; animation: sumoBar linear forwards; }
.sumo-intro .mode { margin-top:16px; font-weight:800; opacity:.85; font-size:clamp(14px,1.3vw,20px); }
@keyframes sumoPop { from { transform:scale(.3); opacity:0 } to { transform:scale(1); opacity:1 } }
@keyframes sumoIn { from { transform:translateX(30px); opacity:0 } to { transform:none; opacity:1 } }
@keyframes sumoFade { from { opacity:0 } }
@keyframes sumoBar { from { width:0 } to { width:100% } }
@keyframes sumoPulse { to { transform:scale(1.12) } }
@keyframes sumoShake { 0%,100% { transform:none } 25% { transform:translate(-4px,2px) rotate(-2deg) } 75% { transform:translate(4px,-2px) rotate(2deg) } }
`;

export function createHUD(container) {
  const style = document.createElement('style');
  style.textContent = CSS;
  container.appendChild(style);
  const root = document.createElement('div');
  root.className = 'sumo-hud';
  root.innerHTML = '<div class="sumo-top"><div class="sumo-pill"></div><div class="sumo-timer" hidden></div><div class="sumo-sub"></div></div><div class="sumo-board" hidden></div><div class="sumo-feed"></div><div class="sumo-cards"></div>';
  container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const pill = $('.sumo-pill');
  const sub = $('.sumo-sub');
  const timer = $('.sumo-timer');
  const cards = $('.sumo-cards');
  const feed = $('.sumo-feed');
  const board = $('.sumo-board');
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

  let callEl = null;
  return {
    setHeader(html, subHtml = '') { pill.innerHTML = html; sub.innerHTML = subHtml; pill.hidden = !html; },
    setTimer(sec) {
      if (sec == null) { timer.hidden = true; return; }
      timer.hidden = false;
      const s = Math.max(0, Math.ceil(sec));
      timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      timer.classList.toggle('low', s <= 10);
    },
    /** rows: [{ id, name, color, avatar, dmg, out, wins, target, pts, hit }] */
    setCards(rows, mode) {
      cards.classList.toggle('compact', rows.length > 8);
      cards.classList.toggle('tiny', rows.length > 16);
      cards.innerHTML = rows.map((r) => `
        <div class="sumo-card ${r.out ? 'out' : ''} ${r.hit ? 'hit' : ''}" style="--c:${r.color}">
          <div class="av">${r.avatar}</div>
          <div class="nm">${escapeHtml(r.name)}</div>
          <div class="dm" style="color:${r.out ? '#bbb' : damageColor(r.dmg)}">${r.out ? (r.outText || 'OUT') : `${Math.round(r.dmg)}<small>%</small>`}</div>
          ${mode === 'rounds' ? `<div class="pips">${Array.from({ length: r.target }, (_, i) => `<div class="pip ${i < r.wins ? 'on' : ''}"></div>`).join('')}</div>` : `<div class="pts">${r.pts}</div>`}
        </div>`).join('');
    },
    setBoard(rows) {
      if (!rows) { board.hidden = true; return; }
      board.hidden = false;
      board.innerHTML = '<h4>KNOCKOUTS</h4>' + rows.map((r, i) => `<div class="row" style="--c:${r.color}"><span>${i + 1}</span><span class="dot"></span><span>${escapeHtml(r.name)}</span><b>${r.pts}</b></div>`).join('');
    },
    feed(html, color) {
      const d = document.createElement('div');
      d.innerHTML = html;
      if (color) d.style.borderLeft = `4px solid ${color}`;
      feed.prepend(d);
      while (feed.children.length > 5) feed.lastChild.remove();
      later(() => { d.style.opacity = '0'; later(() => d.remove(), 450); }, 3800);
    },
    callout(html, ms = 1400) {
      if (callEl) callEl.remove();
      const d = document.createElement('div');
      d.className = 'sumo-callout';
      d.innerHTML = html;
      root.appendChild(d);
      callEl = d;
      later(() => { d.classList.add('out'); later(() => d.remove(), 320); }, ms);
    },
    intro({ ms, modeText }) {
      const d = document.createElement('div');
      d.className = 'sumo-intro';
      d.innerHTML = `<div class="card">
        <h1>SUMO SMASH!</h1>
        <p class="goal">Shove everyone off the floating arena. The higher your <b style="color:#ff8a3a">%</b>, the farther you fly!</p>
        <div class="moves">
          <div class="mv"><div class="ic" style="background:#3a3f5c">STICK</div><b>Move</b><span>Steer your brawler around the ring</span></div>
          <div class="mv"><div class="ic" style="background:#ff6b3d">DASH</div><b>Dash-Shove</b><span>Burst forward and send someone flying</span></div>
          <div class="mv"><div class="ic" style="background:#5a6bff">SLAM</div><b>Charge Slam</b><span>Hold to charge, release to hop and ground-pound everyone nearby</span></div>
          <div class="mv"><div class="ic" style="background:#2ac46a">★</div><b>Power-ups</b><span>Mega size, Feather dash and Spikes. Grab them!</span></div>
        </div>
        <div class="bar"><i style="animation-duration:${ms}ms"></i></div>
        <div class="mode">${modeText}</div>
      </div>`;
      root.appendChild(d);
      later(() => { d.classList.add('out'); later(() => d.remove(), 420); }, ms);
    },
    destroy() {
      timers.forEach(clearTimeout);
      style.remove();
      root.remove();
    },
  };
}
