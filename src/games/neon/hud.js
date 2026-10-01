// DOM overlay for Neon Trails: round info, scoreboard, kill feed, banners, countdown, intro card, name labels.
import { escapeHtml } from '../../sdk/screen-kit.js';

const CSS = /* css */`
.nt-hud { position:absolute; inset:0; pointer-events:none; z-index:20; font-family:'Orbitron','Fredoka',system-ui,sans-serif; color:#fff; overflow:hidden; }
.nt-hud * { box-sizing:border-box; }
.nt-labels { position:absolute; inset:0; }
.nt-label { position:absolute; left:0; top:0; white-space:nowrap; font-family:'Fredoka',system-ui,sans-serif; font-weight:600;
  font-size:var(--ls,16px); padding:.12em .6em .16em; border-radius:999px; background:rgba(6,3,16,.62);
  border:2px solid var(--c); color:#fff; text-shadow:0 0 8px var(--c); box-shadow:0 0 12px color-mix(in srgb,var(--c) 55%,transparent);
  transform:translate(-9999px,0); will-change:transform; transition:opacity .25s; }
.nt-label.dead { opacity:0; }
.nt-label.me-bot { border-style:dashed; }
.nt-label .fx { margin-left:.35em; }
.nt-round { position:absolute; left:22px; top:16px; }
.nt-round .r1 { font-size:clamp(20px,2.3vw,40px); font-weight:900; letter-spacing:.12em; line-height:1;
  background:linear-gradient(180deg,#fff 0%,#ffd1f4 45%,#ff3cc8 55%,#7a2cff 100%); -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 10px rgba(255,60,200,.55)); }
.nt-round .r2 { margin-top:6px; font-size:clamp(12px,1.05vw,19px); font-weight:600; letter-spacing:.14em; color:#8ff4ff; text-shadow:0 0 8px #2ee6ff; }
.nt-round .r3 { margin-top:4px; font-size:clamp(10px,.8vw,14px); letter-spacing:.14em; color:rgba(255,255,255,.6); }
.nt-board { position:absolute; right:14px; top:58px; background:linear-gradient(180deg,rgba(20,6,40,.72),rgba(8,4,20,.62)); border:1px solid rgba(255,60,200,.35);
  border-radius:14px; padding:8px 10px; box-shadow:0 0 24px rgba(255,60,200,.18), inset 0 0 18px rgba(46,230,255,.06); backdrop-filter:blur(4px); max-height:calc(100% - 120px); overflow:hidden; }
.nt-board .bt { font-size:11px; letter-spacing:.24em; color:#ff8ae0; margin:0 2px 6px; }
.nt-board .rows { display:grid; grid-template-columns:repeat(var(--cols,1), minmax(0,1fr)); column-gap:14px; }
.nt-row { display:flex; align-items:center; gap:8px; padding:3px 2px; font-family:'Fredoka',system-ui,sans-serif; font-size:var(--fs,17px); font-weight:500; min-width:0; transition:opacity .3s; }
.nt-row .sw { width:5px; height:1.1em; border-radius:3px; background:var(--c); box-shadow:0 0 8px var(--c); flex:none; }
.nt-row .nm { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:9.5em; }
.nt-row .sc { font-family:'Orbitron',system-ui,sans-serif; font-weight:800; font-size:.9em; color:#fff; }
.nt-row .pips { display:flex; gap:3px; }
.nt-row .pip { width:.62em; height:.62em; border-radius:50%; border:1.5px solid color-mix(in srgb,var(--c) 70%,#fff); }
.nt-row .pip.on { background:var(--c); box-shadow:0 0 7px var(--c); }
.nt-row.out { opacity:.38; }
.nt-row.out .nm { text-decoration:line-through; text-decoration-color:rgba(255,255,255,.5); }
.nt-row.off .nm::after { content:' ⚡'; opacity:.6; }
.nt-feed { position:absolute; left:18px; bottom:16px; display:flex; flex-direction:column; gap:6px; align-items:flex-start; }
.nt-feed div { font-family:'Fredoka',system-ui,sans-serif; font-size:clamp(13px,1.05vw,19px); background:rgba(8,4,20,.66); border-left:4px solid var(--c);
  padding:4px 12px; border-radius:0 10px 10px 0; animation:ntIn .3s cubic-bezier(.2,1.4,.4,1); transition:opacity .6s, transform .6s; }
.nt-feed div.gone { opacity:0; transform:translateX(-20px); }
.nt-feed b { color:var(--c); text-shadow:0 0 8px var(--c); font-weight:600; }
.nt-feed i { font-style:normal; color:var(--c2); text-shadow:0 0 8px var(--c2); font-weight:600; }
.nt-legend { position:absolute; bottom:14px; left:50%; transform:translateX(-50%); display:flex; gap:18px; font-family:'Fredoka',system-ui,sans-serif;
  font-size:clamp(11px,.9vw,16px); color:rgba(255,255,255,.72); background:rgba(8,4,20,.5); padding:5px 16px; border-radius:999px; border:1px solid rgba(255,255,255,.08); }
.nt-legend span b { font-weight:600; }
.nt-chip { position:absolute; top:88px; left:50%; transform:translateX(-50%); font-weight:800; letter-spacing:.2em; font-size:clamp(13px,1.3vw,22px);
  padding:6px 20px; border-radius:999px; opacity:0; transition:opacity .3s; }
.nt-chip.on { opacity:1; animation:ntBlink 1s infinite; }
.nt-chip.warn { color:#ff5a7a; border:2px solid #ff3c64; background:rgba(60,0,16,.6); text-shadow:0 0 10px #ff3c64; box-shadow:0 0 20px rgba(255,60,100,.35); }
.nt-chip.ff { top:128px; color:#8ff4ff; border:2px solid #2ee6ff; background:rgba(0,30,50,.55); text-shadow:0 0 10px #2ee6ff; }
.nt-banner { position:absolute; inset:0; display:grid; place-items:center; text-align:center; }
.nt-banner > div { animation:ntPop .55s cubic-bezier(.2,1.5,.35,1); transition:opacity .35s, transform .35s; }
.nt-banner.out > div { opacity:0; transform:scale(1.08); }
.nt-banner .big { font-size:clamp(40px,7vw,128px); font-weight:900; letter-spacing:.08em; line-height:1.05; color:#fff;
  text-shadow:0 0 18px var(--c,#ff3cc8), 0 0 42px var(--c,#ff3cc8), 0 4px 0 rgba(0,0,0,.4); }
.nt-banner .small { margin-top:.6em; font-size:clamp(16px,2vw,34px); font-weight:600; letter-spacing:.22em; color:#bff8ff; text-shadow:0 0 12px #2ee6ff; }
.nt-count { position:absolute; inset:0; display:grid; place-items:center; }
.nt-count span { font-size:min(26vw,38vh); font-weight:900; color:#fff; animation:ntCount .9s cubic-bezier(.2,1.3,.4,1) both;
  text-shadow:0 0 20px var(--c), 0 0 60px var(--c), 0 0 120px var(--c); -webkit-text-stroke:3px rgba(255,255,255,.7); }
.nt-intro { position:absolute; inset:0; display:grid; place-items:center; background:radial-gradient(ellipse at center, rgba(12,4,30,.55), rgba(4,2,12,.88)); transition:opacity .5s; }
.nt-intro.out { opacity:0; }
.nt-card { width:min(1100px,90vw); text-align:center; animation:ntPop .6s cubic-bezier(.2,1.3,.35,1); }
.nt-card h1 { margin:0; font-size:clamp(44px,7vw,120px); font-weight:900; letter-spacing:.1em; line-height:1;
  background:linear-gradient(180deg,#fff 0%,#ffe0f6 40%,#ff3cc8 52%,#7a2cff 100%); -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 16px rgba(255,60,200,.7)) drop-shadow(0 0 40px rgba(122,44,255,.5)); }
.nt-card .tag { margin-top:10px; font-size:clamp(14px,1.5vw,26px); letter-spacing:.3em; color:#8ff4ff; text-shadow:0 0 10px #2ee6ff; }
.nt-steps { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; margin:4vh 0 3vh; }
.nt-step { background:linear-gradient(180deg,rgba(40,12,70,.7),rgba(12,4,28,.7)); border:1px solid rgba(255,60,200,.35); border-radius:18px; padding:18px 12px 16px;
  box-shadow:0 0 30px rgba(255,60,200,.12); }
.nt-step .ic { font-size:clamp(28px,3vw,52px); height:1.3em; display:flex; justify-content:center; align-items:center; gap:.2em; font-family:'Fredoka',system-ui,sans-serif; }
.nt-step .ic .k { display:inline-grid; place-items:center; min-width:1.3em; height:1.2em; padding:0 .25em; border-radius:.25em; font-size:.6em; font-weight:800; border:2px solid #2ee6ff; color:#bff8ff; box-shadow:0 0 12px rgba(46,230,255,.5); }
.nt-step h3 { margin:10px 0 4px; font-size:clamp(13px,1.2vw,20px); letter-spacing:.14em; color:#ff8ae0; }
.nt-step p { margin:0; font-family:'Fredoka',system-ui,sans-serif; font-size:clamp(13px,1.05vw,19px); color:rgba(255,255,255,.82); }
.nt-goal { font-size:clamp(16px,1.6vw,28px); font-weight:700; letter-spacing:.12em; color:#fff; text-shadow:0 0 12px #ff3cc8; }
.nt-bar { margin:22px auto 0; width:min(420px,50vw); height:6px; border-radius:6px; background:rgba(255,255,255,.12); overflow:hidden; }
.nt-bar i { display:block; height:100%; width:100%; background:linear-gradient(90deg,#2ee6ff,#ff3cc8); transform-origin:left; animation:ntBar linear forwards; }
.nt-wait { position:absolute; inset:0; display:grid; place-items:center; font-size:clamp(20px,2.4vw,40px); letter-spacing:.2em; color:#8ff4ff; text-shadow:0 0 12px #2ee6ff; }
@keyframes ntPop { from { opacity:0; transform:scale(.7); } }
@keyframes ntIn { from { opacity:0; transform:translateX(-24px); } }
@keyframes ntCount { 0% { opacity:0; transform:scale(2.2); } 30% { opacity:1; transform:scale(1); } 80% { opacity:1; } 100% { opacity:0; transform:scale(.85); } }
@keyframes ntBlink { 50% { opacity:.55; } }
@keyframes ntBar { from { transform:scaleX(0); } to { transform:scaleX(1); } }
`;

export function injectFont() {
  if (document.getElementById('nt-font')) return null;
  const l = document.createElement('link');
  l.id = 'nt-font';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&display=swap';
  document.head.appendChild(l);
  return l;
}

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export function createHud(container) {
  const style = el('style', null, document.head, CSS);
  const root = el('div', 'nt-hud', container);
  const labels = el('div', 'nt-labels', root);
  const round = el('div', 'nt-round', root, '<div class="r1"></div><div class="r2"></div><div class="r3"></div>');
  const board = el('div', 'nt-board', root, '<div class="bt"></div><div class="rows"></div>');
  const feed = el('div', 'nt-feed', root);
  const legend = el('div', 'nt-legend', root, `
    <span>👻 <b style="color:#dff">Ghost</b> ride through walls</span>
    <span>✦ <b style="color:#ffe14d">Eraser</b> wipe your trail</span>
    <span>⚡ <b style="color:#5dff8a">Speed</b> turbo</span>`);
  const warn = el('div', 'nt-chip warn', root, '⚠ ARENA COLLAPSING');
  const ff = el('div', 'nt-chip ff', root, '▶▶ FAST FORWARD');
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

  return {
    root,
    setRound(title, sub, extra = '') {
      round.querySelector('.r1').textContent = title;
      round.querySelector('.r2').textContent = sub;
      round.querySelector('.r3').textContent = extra;
    },
    /** rows: [{name, color, score, target (pips) | null, out, off}] */
    setBoard(title, rows) {
      board.querySelector('.bt').textContent = title;
      const n = rows.length;
      const cols = n > 26 ? 3 : n > 12 ? 2 : 1;
      const fs = n > 26 ? 12 : n > 12 ? 14 : n > 8 ? 16 : 18;
      board.style.setProperty('--cols', cols);
      board.style.setProperty('--fs', `${fs}px`);
      const maxRows = cols * 16;
      const shown = rows.slice(0, maxRows);
      board.querySelector('.rows').innerHTML = shown.map((r) => {
        const score = r.target
          ? `<span class="pips">${Array.from({ length: r.target }, (_, i) => `<i class="pip ${i < r.score ? 'on' : ''}"></i>`).join('')}</span>`
          : `<span class="sc">${r.score}</span>`;
        return `<div class="nt-row ${r.out ? 'out' : ''} ${r.off ? 'off' : ''}" style="--c:${r.color}"><span class="sw"></span><span class="nm">${escapeHtml(r.name)}</span>${score}</div>`;
      }).join('') + (rows.length > maxRows ? `<div class="nt-row"><span class="nm">+${rows.length - maxRows} more</span></div>` : '');
    },
    feed(html) {
      const d = el('div', null, feed, html);
      while (feed.children.length > 5) feed.firstChild.remove();
      later(() => { d.classList.add('gone'); later(() => d.remove(), 700); }, 4200);
      return d;
    },
    clearFeed() { feed.innerHTML = ''; },
    warn(on) { warn.classList.toggle('on', on); },
    fastForward(on) { ff.classList.toggle('on', on); },
    showLegend(on) { legend.style.display = on ? '' : 'none'; },
    banner(big, small = '', color = '#ff3cc8', ms = 2000) {
      const b = el('div', 'nt-banner', root, `<div style="--c:${color}"><div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}</div>`);
      return new Promise((res) => later(() => { b.classList.add('out'); later(() => { b.remove(); res(); }, 350); }, ms));
    },
    countNumber(text, color) {
      const c = el('div', 'nt-count', root, `<span style="--c:${color}">${text}</span>`);
      later(() => c.remove(), 950);
    },
    intro(html, ms) {
      const d = el('div', 'nt-intro', root, `<div class="nt-card">${html}<div class="nt-bar"><i style="animation-duration:${ms}ms"></i></div></div>`);
      return new Promise((res) => later(() => { d.classList.add('out'); later(() => { d.remove(); res(); }, 500); }, ms));
    },
    waiting(text) {
      root.querySelector('.nt-wait')?.remove();
      if (text) el('div', 'nt-wait', root, text);
    },
    label(name, color, bot) {
      const d = el('div', `nt-label ${bot ? 'me-bot' : ''}`, labels);
      d.style.setProperty('--c', color);
      d.innerHTML = `${escapeHtml(name)}<span class="fx"></span>`;
      return d;
    },
    setLabelSize(px) { labels.style.setProperty('--ls', `${px}px`); },
    destroy() {
      timers.forEach(clearTimeout);
      timers.clear();
      root.remove();
      style.remove();
    },
  };
}
