// DOM HUD for the TV: round header, player cards (damage %, wins/points), kill feed, callouts,
// how-to-play card and the between-rounds standings board. Flat, bold, readable from the couch.
import { escapeHtml } from '../../sdk/screen-kit.js';
import { damageColor } from './fighters.js';

const CSS = `
.sumo-hud { position:absolute; inset:0; pointer-events:none; font-family: 'Fredoka', system-ui, sans-serif; color:#fff; z-index:10; overflow:hidden; }
.sumo-top { position:absolute; top:14px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:6px; }
.sumo-pill { background:#15131f; border-radius:14px; padding:6px 20px 7px; font-weight:700; letter-spacing:.03em; font-size:clamp(16px,1.6vw,26px); text-transform:uppercase; white-space:nowrap; box-shadow:0 4px 0 rgba(0,0,0,.25); }
.sumo-pill b { color:#ffc53a; font-weight:700; }
.sumo-sub { font-size:clamp(13px,1.15vw,19px); font-weight:600; text-shadow:0 2px 4px rgba(0,0,0,.55); }
.sumo-timer { font-size:clamp(24px,2.6vw,42px); font-weight:700; font-variant-numeric:tabular-nums; text-shadow:0 3px 6px rgba(0,0,0,.5); }
.sumo-timer.low { color:#ff5a4a; }
.sumo-cards { position:absolute; left:12px; right:12px; bottom:12px; display:flex; flex-wrap:wrap-reverse; justify-content:center; gap:10px; }
.sumo-card { --c:#fff; position:relative; min-width:clamp(120px,10.5vw,180px); background:#15131f; border-radius:14px; overflow:hidden; padding:8px 12px 8px 16px; display:flex; flex-direction:column; gap:1px; box-shadow:0 4px 0 rgba(0,0,0,.25); transition: opacity .3s; }
.sumo-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:7px; background:var(--c); }
.sumo-card .nm { font-weight:600; font-size:clamp(13px,1.05vw,17px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:9em; color:var(--c); filter:brightness(1.25); }
.sumo-card .row { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; }
.sumo-card .dm { font-weight:700; font-size:clamp(24px,2.3vw,38px); line-height:1; font-variant-numeric:tabular-nums; }
.sumo-card .dm small { font-size:.5em; margin-left:1px; }
.sumo-card .pips { display:flex; gap:4px; padding-bottom:5px; }
.sumo-card .pip { width:12px; height:12px; border-radius:50%; background:rgba(255,255,255,.16); }
.sumo-card .pip.on { background:#ffc53a; }
.sumo-card .pts { font-weight:700; font-size:clamp(16px,1.3vw,22px); color:#ffc53a; padding-bottom:2px; }
.sumo-card.out { opacity:.5; }
.sumo-card.out .dm { color:#9a98a8 !important; font-size:clamp(18px,1.6vw,26px); }
.sumo-card.hit { animation: sumoShake .25s; }
.sumo-cards.compact { gap:6px; }
.sumo-cards.compact .sumo-card { min-width:0; padding:5px 9px 5px 13px; border-radius:10px; }
.sumo-cards.compact .dm { font-size:clamp(18px,1.5vw,24px); }
.sumo-cards.compact .nm { font-size:13px; max-width:6.5em; }
.sumo-cards.compact .pip { width:9px; height:9px; }
.sumo-feed { position:absolute; top:14px; left:14px; display:flex; flex-direction:column; align-items:flex-start; gap:6px; }
.sumo-feed div { background:#15131f; border-radius:10px; padding:5px 12px 6px; font-weight:600; font-size:clamp(14px,1.15vw,19px); animation: sumoIn .25s ease-out; transition: opacity .4s; box-shadow:0 3px 0 rgba(0,0,0,.25); }
.sumo-feed .who { color:var(--c); filter:brightness(1.25); }
.sumo-feed .bad { color:#ff7a6a; }
.sumo-board { position:absolute; top:64px; left:14px; background:#15131f; border-radius:12px; padding:8px 12px; font-weight:600; font-size:clamp(13px,1.05vw,17px); min-width:180px; }
.sumo-board .r { display:flex; gap:8px; align-items:center; padding:1px 0; }
.sumo-board .r span:nth-child(3) { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:9em; }
.sumo-board .dot { width:12px; height:12px; border-radius:50%; background:var(--c); }
.sumo-board h4 { margin:0 0 4px; color:#ffc53a; font-size:.9em; letter-spacing:.06em; font-weight:700; }
.sumo-callout { position:absolute; left:0; right:0; top:34%; text-align:center; font-weight:700; font-size:clamp(52px,8vw,140px); line-height:1; color:#fff; -webkit-text-stroke: 5px #1c1030; paint-order: stroke fill; text-shadow: 0 8px 0 #1c1030; animation: sumoPop .45s cubic-bezier(.2,1.6,.4,1); transition: opacity .3s, transform .3s; text-transform:uppercase; }
.sumo-callout small { display:block; font-size:.3em; -webkit-text-stroke: 3px #1c1030; text-shadow:0 4px 0 #1c1030; margin-top:.35em; text-transform:none; font-weight:600; }
.sumo-callout .c { color:var(--c); }
.sumo-callout.out { opacity:0; transform:scale(1.2); }
.sumo-callout.low { top:auto; bottom:17%; font-size:clamp(46px,6.5vw,112px); }

.sumo-shade { position:absolute; inset:0; background:rgba(12,10,22,.6); animation: sumoFade .35s; transition: opacity .35s; display:grid; place-items:center; }
.sumo-shade.out { opacity:0; }
.sumo-intro { text-align:center; width:min(1100px,90vw); }
.sumo-intro h1 { margin:0; font-size:clamp(56px,7.5vw,128px); line-height:.95; font-weight:700; -webkit-text-stroke:6px #1c1030; paint-order:stroke fill; color:#ffc53a; text-shadow:0 8px 0 #1c1030; }
.sumo-intro .goal { font-size:clamp(20px,2.1vw,34px); font-weight:600; margin:14px 0 30px; text-shadow:0 2px 4px rgba(0,0,0,.5); }
.sumo-intro .goal b { color:#ff9a4a; }
.sumo-intro .moves { display:grid; grid-template-columns:repeat(3,1fr); gap:clamp(14px,2vw,28px); }
.sumo-intro .mv { background:#15131f; border-radius:20px; padding:22px 18px 20px; display:flex; flex-direction:column; align-items:center; gap:8px; box-shadow:0 5px 0 rgba(0,0,0,.3); }
.sumo-intro .btn { width:clamp(70px,6.5vw,104px); height:clamp(70px,6.5vw,104px); border-radius:50%; display:grid; place-items:center; font-weight:700; font-size:clamp(15px,1.35vw,22px); box-shadow: inset 0 -5px 0 rgba(0,0,0,.22); }
.sumo-intro .btn.stick { background:transparent; border:4px solid rgba(255,255,255,.35); }
.sumo-intro .btn.stick i { width:46%; height:46%; border-radius:50%; background:#fff; }
.sumo-intro .mv b { font-size:clamp(22px,2vw,34px); font-weight:700; }
.sumo-intro .mv span { font-size:clamp(15px,1.25vw,21px); font-weight:500; opacity:.85; max-width:16em; }
.sumo-intro .mode { margin-top:24px; font-weight:600; font-size:clamp(17px,1.6vw,26px); }
.sumo-intro .bar { margin:18px auto 0; width:min(360px,50vw); height:8px; border-radius:8px; background:rgba(255,255,255,.15); overflow:hidden; }
.sumo-intro .bar i { display:block; height:100%; background:#ffc53a; animation: sumoBar linear forwards; }

.sumo-stand { width:min(860px,90vw); }
.sumo-stand h2 { margin:0 0 4px; text-align:center; font-size:clamp(40px,4.6vw,76px); font-weight:700; -webkit-text-stroke:5px #1c1030; paint-order:stroke fill; text-shadow:0 6px 0 #1c1030; }
.sumo-stand .sub { text-align:center; font-weight:600; font-size:clamp(17px,1.6vw,26px); margin-bottom:18px; text-shadow:0 2px 4px rgba(0,0,0,.5); }
.sumo-stand .list { display:grid; gap:8px; }
.sumo-stand .list.two { grid-template-columns:1fr 1fr; }
.sumo-stand .it { --c:#fff; display:flex; align-items:center; gap:14px; background:#15131f; border-radius:14px; padding:10px 18px 10px 0; overflow:hidden; box-shadow:0 4px 0 rgba(0,0,0,.3); animation: sumoIn .3s both; }
.sumo-stand .it .bar { width:10px; align-self:stretch; background:var(--c); margin-right:4px; }
.sumo-stand .it .rk { width:1.6em; text-align:center; font-weight:700; font-size:clamp(18px,1.6vw,26px); opacity:.6; }
.sumo-stand .it .n { flex:1; font-weight:700; font-size:clamp(20px,1.9vw,32px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sumo-stand .it .plus { font-weight:700; color:#1c1030; background:#ffc53a; border-radius:9px; padding:1px 10px; font-size:clamp(16px,1.4vw,24px); }
.sumo-stand .it .pips { display:flex; gap:7px; }
.sumo-stand .it .pip { width:clamp(16px,1.5vw,24px); height:clamp(16px,1.5vw,24px); border-radius:50%; background:rgba(255,255,255,.14); }
.sumo-stand .it .pip.on { background:#ffc53a; }
.sumo-stand .it .pip.new { animation: sumoPip .5s .35s both; }
.sumo-stand .it .sc { font-weight:700; font-size:clamp(22px,2vw,34px); color:#ffc53a; min-width:2ch; text-align:right; }
.sumo-stand .it.win { outline:4px solid #ffc53a; outline-offset:-4px; }
.sumo-stand.small .it { padding:6px 12px 6px 0; }
.sumo-stand.small .it .n { font-size:clamp(16px,1.4vw,22px); }
.sumo-stand.small .it .pip { width:14px; height:14px; }

@keyframes sumoPop { from { transform:scale(.3); opacity:0 } to { transform:scale(1); opacity:1 } }
@keyframes sumoIn { from { transform:translateY(12px); opacity:0 } to { transform:none; opacity:1 } }
@keyframes sumoFade { from { opacity:0 } }
@keyframes sumoBar { from { width:0 } to { width:100% } }
@keyframes sumoPip { 0% { transform:scale(0); background:#fff } 60% { transform:scale(1.5) } 100% { transform:scale(1) } }
@keyframes sumoShake { 0%,100% { transform:none } 25% { transform:translate(-4px,2px) rotate(-2deg) } 75% { transform:translate(4px,-2px) rotate(2deg) } }
`;

const pipsHtml = (n, on, cls = 'pip', fresh = -1) => {
  let h = '';
  for (let i = 0; i < n; i++) h += `<div class="${cls}${i < on ? ' on' : ''}${i === fresh ? ' new' : ''}"></div>`;
  return h;
};

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
  const cardEls = new Map(); // id -> { el, nm, dm, side, key }
  let lastTimer = '';
  let lastBoard = '';
  let callEl = null;
  let shadeEl = null;

  function shade(html, ms) {
    if (shadeEl) shadeEl.remove();
    const d = document.createElement('div');
    d.className = 'sumo-shade';
    d.innerHTML = html;
    root.appendChild(d);
    shadeEl = d;
    later(() => { d.classList.add('out'); later(() => { d.remove(); if (shadeEl === d) shadeEl = null; }, 380); }, ms);
    return d;
  }

  return {
    setHeader(html, subHtml = '') { pill.innerHTML = html; sub.innerHTML = subHtml; pill.hidden = !html; },
    setTimer(sec) {
      if (sec == null) { timer.hidden = true; lastTimer = ''; return; }
      timer.hidden = false;
      const s = Math.max(0, Math.ceil(sec));
      const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (txt === lastTimer) return;
      lastTimer = txt;
      timer.textContent = txt;
      timer.classList.toggle('low', s <= 10);
    },
    /** rows: [{ id, name, color, dmg, out, outText, wins, target, pts, hit }] — DOM is reused, only changed fields are touched. */
    setCards(rows, mode) {
      cards.classList.toggle('compact', rows.length > 8);
      const seen = new Set();
      rows.forEach((r, i) => {
        seen.add(r.id);
        let c = cardEls.get(r.id);
        if (!c) {
          const el = document.createElement('div');
          el.className = 'sumo-card';
          el.innerHTML = '<div class="nm"></div><div class="row"><div class="dm"></div><div class="side"></div></div>';
          c = { el, nm: el.querySelector('.nm'), dm: el.querySelector('.dm'), side: el.querySelector('.side'), key: '', name: '', side_: '', hit: false };
          cardEls.set(r.id, c);
        }
        if (cards.children[i] !== c.el) cards.insertBefore(c.el, cards.children[i] || null);
        if (c.name !== r.name + r.color) { c.name = r.name + r.color; c.nm.textContent = r.name; c.el.style.setProperty('--c', r.color); }
        const dmg = Math.round(r.dmg);
        const key = r.out ? `o${r.outText}` : `d${dmg}`;
        if (key !== c.key) {
          c.key = key;
          c.el.classList.toggle('out', !!r.out);
          if (r.out) { c.dm.textContent = r.outText || 'OUT'; c.dm.style.color = ''; } else { c.dm.innerHTML = `${dmg}<small>%</small>`; c.dm.style.color = damageColor(dmg); }
        }
        const sideKey = mode === 'rounds' ? `w${r.wins}/${r.target}` : `p${r.pts}`;
        if (sideKey !== c.side_) {
          c.side_ = sideKey;
          c.side.className = mode === 'rounds' ? 'pips' : 'pts';
          c.side.innerHTML = mode === 'rounds' ? pipsHtml(r.target, r.wins) : `${r.pts}`;
        }
        if (!!r.hit !== c.hit) { c.hit = !!r.hit; c.el.classList.toggle('hit', c.hit); }
      });
      for (const [id, c] of cardEls) if (!seen.has(id)) { c.el.remove(); cardEls.delete(id); }
    },
    setBoard(rows) {
      if (!rows) { board.hidden = true; lastBoard = ''; return; }
      const html = '<h4>TOP KNOCKOUTS</h4>' + rows.map((r, i) => `<div class="r" style="--c:${r.color}"><span>${i + 1}</span><span class="dot"></span><span>${escapeHtml(r.name)}</span><b>${r.pts}</b></div>`).join('');
      if (html === lastBoard) return;
      lastBoard = html;
      board.hidden = false;
      board.innerHTML = html;
    },
    feed(html) {
      const d = document.createElement('div');
      d.innerHTML = html;
      feed.prepend(d);
      while (feed.children.length > 4) feed.lastChild.remove();
      later(() => { d.style.opacity = '0'; later(() => d.remove(), 450); }, 3800);
    },
    callout(html, ms = 1400, cls = '') {
      if (callEl) callEl.remove();
      const d = document.createElement('div');
      d.className = `sumo-callout ${cls}`;
      d.innerHTML = html;
      root.appendChild(d);
      callEl = d;
      later(() => { d.classList.add('out'); later(() => d.remove(), 320); }, ms);
    },
    intro({ ms, modeText }) {
      shade(`<div class="sumo-intro">
        <h1>SUMO SMASH</h1>
        <div class="goal">Shove everyone off the arena. The higher your <b>%</b>, the farther you fly.</div>
        <div class="moves">
          <div class="mv"><div class="btn stick"><i></i></div><b>Move</b><span>Drag the stick on your phone</span></div>
          <div class="mv"><div class="btn" style="background:#ff6b3d">DASH</div><b>Tap to shove</b><span>Lunge forward and launch anyone you hit</span></div>
          <div class="mv"><div class="btn" style="background:#4b63ff">SLAM</div><b>Hold to slam</b><span>Charge up, let go to ground-pound everyone near you</span></div>
        </div>
        <div class="mode">${modeText}</div>
        <div class="bar"><i style="animation-duration:${ms}ms"></i></div>
      </div>`, ms);
    },
    /** Between-round standings. rows: [{ name, color, wins, pts, fresh }] best first. */
    standings({ title, subtitle = '', rows, mode, target, ms = 3200 }) {
      const two = rows.length > 8;
      const items = rows.map((r, i) => `
        <div class="it${r.fresh ? ' win' : ''}" style="--c:${r.color}; animation-delay:${Math.min(i, 12) * 40}ms">
          <div class="bar"></div><div class="rk">${i + 1}</div><div class="n">${escapeHtml(r.name)}</div>
          ${r.fresh && mode === 'rounds' ? '<div class="plus">+1</div>' : ''}
          ${mode === 'rounds' ? `<div class="pips">${pipsHtml(target, r.wins, 'pip', r.fresh ? r.wins - 1 : -1)}</div>` : `<div class="sc">${r.pts}</div>`}
        </div>`).join('');
      shade(`<div class="sumo-stand${rows.length > 8 ? ' small' : ''}"><h2>${title}</h2>${subtitle ? `<div class="sub">${subtitle}</div>` : ''}<div class="list${two ? ' two' : ''}">${items}</div></div>`, ms);
    },
    clearOverlays() { if (shadeEl) { shadeEl.remove(); shadeEl = null; } if (callEl) { callEl.remove(); callEl = null; } },
    destroy() {
      timers.forEach(clearTimeout);
      style.remove();
      root.remove();
    },
  };
}
