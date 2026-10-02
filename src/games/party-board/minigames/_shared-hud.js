// Minigame HUD: title card, timer, live standings, floating text, FINISH + winner banners.
// DOM only, scoped `pbm-` classes; the <style> lives inside the HUD root so destroy() removes it.
import { escapeHtml } from '../../../sdk/screen-kit.js';

const CSS = `
.pbm-hud { position:absolute; inset:0; pointer-events:none; z-index:20; font-family: Figtree, system-ui, sans-serif; color:#fff; }
.pbm-hud * { box-sizing:border-box; }
.pbm-timer { position:absolute; top:2.2vh; left:50%; transform:translateX(-50%); min-width:10vmin; padding:0.6vmin 2.4vmin; border-radius:999px;
  background:#181a24e8; box-shadow:0 1vmin 3vmin #0005; text-align:center;
  font-weight:800; font-size:5vmin; line-height:1.15; letter-spacing:0.04em; transition:opacity .3s; font-variant-numeric: tabular-nums; }
.pbm-timer.hidden { opacity:0; }
.pbm-timer.low { color:#ff5a5a; animation:pbm-pulse .5s ease-in-out infinite alternate; }
.pbm-timer .bar { position:absolute; left:12%; right:12%; bottom:0.5vmin; height:0.5vmin; border-radius:9px; background:#ffffff22; overflow:hidden; }
.pbm-timer .bar i { display:block; height:100%; background:#ffd23f; transform-origin:left; }
.pbm-title-mini { position:absolute; top:2.4vh; left:2vw; font-weight:800; font-size:2.6vmin; padding:0.8vmin 2vmin; border-radius:1.6vmin;
  background:#0008; letter-spacing:.02em; }
@keyframes pbm-pulse { to { transform:translateX(-50%) scale(1.12); } }
.pbm-stand { position:absolute; top:8.5vh; left:1.2vw; width:clamp(170px, 21vw, 330px); }
.pbm-card { position:absolute; left:0; right:0; height:5.6vmin; display:flex; align-items:center; gap:1vmin; padding:0 1.4vmin 0 0.6vmin;
  border-radius:1.6vmin; background:#14161ed9; box-shadow:inset 0.9vmin 0 0 var(--c), 0 .6vmin 1.6vmin #0005;
  transition: transform .45s cubic-bezier(.3,1.4,.5,1), opacity .3s, filter .3s; }
.pbm-card .rk { width:3.4vmin; margin-left:.8vmin; text-align:center; font-weight:800; font-size:2.4vmin; opacity:.8; }
.pbm-card .av { width:4.4vmin; height:4.4vmin; border-radius:50%; display:grid; place-items:center; font-size:2.3vmin; font-weight:800; background:var(--c); flex:none; position:relative; }
.pbm-card .av img { position:absolute; inset:-16% -8% 0; width:116%; height:116%; object-fit:contain; }
.pbm-card .nm { flex:1; min-width:0; font-weight:700; font-size:2.4vmin; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pbm-card .sc { font-weight:800; font-size:3.2vmin; font-variant-numeric: tabular-nums; }
.pbm-card .sc small { font-size:1.8vmin; opacity:.7; margin-left:.4vmin; font-weight:500; }
.pbm-card.out { filter:grayscale(1); opacity:.5; }
.pbm-card.out .sc::after { content:'OUT'; font-size:1.9vmin; margin-left:.8vmin; color:#ff7b7b; }
.pbm-card.bump { animation: pbm-bump .35s ease-out; }
@keyframes pbm-bump { 30% { filter:brightness(1.8); } }
.pbm-card.lead .rk { opacity:1; color:#ffc61a; }
.pbm-titlecard { position:absolute; left:50%; top:15vh; transform:translateX(-50%); text-align:center; width:min(90vw, 1100px);
  animation: pbm-drop .6s cubic-bezier(.2,1.5,.4,1); transition: opacity .4s, transform .4s; }
.pbm-titlecard h1 { margin:0; font-size:9.5vmin; font-weight:800; line-height:1; color:#fff;
  -webkit-text-stroke:.7vmin #1b1d27; paint-order:stroke fill; text-shadow:0 .9vmin 0 #0006; }
.pbm-titlecard p { margin:2vmin auto 0; display:inline-block; font-size:3.3vmin; font-weight:600; line-height:1.3; padding:1.4vmin 3.4vmin; border-radius:2vmin; background:#14161ee6; max-width:80vw; }
.pbm-titlecard.out { opacity:0; transform:translateX(-50%) translateY(-6vh); }
@keyframes pbm-drop { from { transform:translateX(-50%) translateY(-20vh) scale(.6); opacity:0; } }
.pbm-note { position:absolute; left:50%; bottom:5vh; transform:translateX(-50%); padding:1.2vmin 3.4vmin; border-radius:999px; background:#000b;
  font-weight:800; font-size:3.8vmin; white-space:nowrap; transition: opacity .25s, transform .25s; }
.pbm-note.hidden { opacity:0; transform:translateX(-50%) translateY(2vh); }
.pbm-big { position:absolute; inset:0; display:grid; place-items:center; }
.pbm-big span { font-size:12vmin; font-weight:800; color:#fff; -webkit-text-stroke:.7vmin #1b1d27; paint-order:stroke fill; text-shadow:0 1.2vmin 0 #0005;
  animation: pbm-bigin .5s cubic-bezier(.2,1.6,.4,1); }
@keyframes pbm-bigin { from { transform:scale(2.4); opacity:0; } }
.pbm-finish { position:absolute; inset:0; display:grid; place-items:center; background:radial-gradient(ellipse at center, #0000 30%, #0007); animation: pbm-fade .3s; }
.pbm-finish span { font-size:17vmin; font-weight:800; font-style:italic; letter-spacing:.01em; color:#ffd23f; padding:0 5vmin;
  -webkit-text-stroke:.8vmin #5a2400; paint-order:stroke fill; text-shadow:0 1.6vmin 0 #5a2400; animation: pbm-slam .55s cubic-bezier(.2,1.7,.4,1); }
@keyframes pbm-slam { from { transform: scale(3) rotate(-8deg); opacity:0; } }
@keyframes pbm-fade { from { opacity:0; } }
.pbm-winner { position:absolute; left:50%; bottom:9vh; transform:translateX(-50%); text-align:center; animation: pbm-rise .6s cubic-bezier(.2,1.5,.4,1); }
.pbm-winner .lbl { font-size:3.2vmin; font-weight:800; opacity:.9; text-shadow:0 .4vmin 1vmin #000; }
.pbm-winner .names { display:flex; gap:1.6vmin; justify-content:center; flex-wrap:wrap; margin-top:1vmin; }
.pbm-winner .nm { font-size:6vmin; font-weight:800; padding:.6vmin 3vmin; border-radius:2vmin; background:var(--c); color:#fff; text-shadow:0 .4vmin 0 #0005; box-shadow:0 1vmin 0 #0004; }
@keyframes pbm-rise { from { transform:translateX(-50%) translateY(20vh); opacity:0; } }
.pbm-pop { position:absolute; transform:translate(-50%,-100%); font-weight:800; pointer-events:none; white-space:nowrap; z-index:21;
  -webkit-text-stroke:.35vmin #0009; paint-order:stroke fill; text-shadow:0 .5vmin 0 #0006; animation: pbm-popup 1.05s ease-out forwards; font-family: Figtree, system-ui, sans-serif; }
@keyframes pbm-popup { 0% { transform:translate(-50%,-60%) scale(.3); opacity:0; } 15% { transform:translate(-50%,-110%) scale(1.25); opacity:1; }
  30% { transform:translate(-50%,-120%) scale(1); } 100% { transform:translate(-50%,-260%) scale(.9); opacity:0; } }
`;

export function createHud(parent, { title = '', players = [], portraits = {}, scoreLabel = '', showStandings = true, sort = 'desc', format = (v) => v } = {}) {
  const root = document.createElement('div');
  root.className = 'pbm-hud';
  root.innerHTML = `<style>${CSS}</style>
    <div class="pbm-title-mini">${escapeHtml(title)}</div>
    <div class="pbm-timer hidden"><span class="t">0</span><div class="bar"><i></i></div></div>
    <div class="pbm-stand"></div>
    <div class="pbm-note hidden"></div>`;
  parent.appendChild(root);
  const $ = (q) => root.querySelector(q);
  const timerEl = $('.pbm-timer');
  const timerT = $('.pbm-timer .t');
  const timerBar = $('.pbm-timer .bar i');
  const stand = $('.pbm-stand');
  const note = $('.pbm-note');
  if (!showStandings) stand.style.display = 'none';

  const cards = new Map();
  const state = new Map(players.map((p) => [p.id, { score: 0, out: false, extra: '' }]));
  players.forEach((p) => {
    const c = document.createElement('div');
    c.className = 'pbm-card';
    c.style.setProperty('--c', p.color);
    const pt = portraits[p.id];
    c.innerHTML = `<span class="rk"><span></span></span><span class="av">${pt ? `<img src="${pt}" alt="">` : escapeHtml((p.name || '?').trim().charAt(0).toUpperCase())}</span><span class="nm">${escapeHtml(p.name)}</span><span class="sc"></span>`;
    stand.appendChild(c);
    cards.set(p.id, c);
  });

  function layout() {
    const rows = players.map((p) => ({ p, ...state.get(p.id) }));
    if (sort) {
      rows.sort((a, b) => {
        if (a.out !== b.out) return a.out ? 1 : -1;
        return sort === 'desc' ? b.score - a.score : a.score - b.score;
      });
    }
    let rank = 0;
    let prev = null;
    rows.forEach((r, i) => {
      if (prev === null || r.score !== prev) rank = i + 1;
      prev = r.score;
      const c = cards.get(r.p.id);
      c.style.transform = `translateY(${i * 6.3}vmin)`;
      c.classList.toggle('out', r.out);
      c.classList.toggle('lead', !!sort && rank === 1 && !r.out && r.score !== 0 && rows.length > 1);
      c.querySelector('.rk span').textContent = r.out ? '' : rank;
      c.querySelector('.sc').innerHTML = `${escapeHtml(format(r.score))}${scoreLabel ? `<small>${escapeHtml(scoreLabel)}</small>` : ''}${r.extra ? ` <small>${escapeHtml(r.extra)}</small>` : ''}`;
    });
  }
  layout();

  let finishEl = null;
  let winnerEl = null;
  let titleEl = null;
  let noteTimer = null;
  let lastTimeShown = null;

  return {
    el: root,
    setScore(pid, score, { bump = true, extra } = {}) {
      const st = state.get(pid);
      if (!st) return;
      const changed = st.score !== score;
      st.score = score;
      if (extra !== undefined) st.extra = extra;
      if (changed && bump) {
        const c = cards.get(pid);
        c.classList.remove('bump');
        void c.offsetWidth;
        c.classList.add('bump');
      }
      layout();
    },
    setScores(map) { for (const [pid, v] of Object.entries(map)) { const st = state.get(pid); if (st) st.score = v; } layout(); },
    setOut(pid, out = true) { const st = state.get(pid); if (st) { st.out = out; layout(); } },
    setTime(left, total) {
      if (left == null) { timerEl.classList.add('hidden'); return; }
      timerEl.classList.remove('hidden');
      const whole = Math.ceil(left);
      if (whole !== lastTimeShown) {
        lastTimeShown = whole;
        timerT.textContent = whole;
        timerEl.classList.toggle('low', whole <= 5);
      }
      timerBar.style.transform = `scaleX(${total ? left / total : 1})`;
    },
    note(text, ms = 0) {
      clearTimeout(noteTimer);
      if (!text) { note.classList.add('hidden'); return; }
      note.innerHTML = text;
      note.classList.remove('hidden');
      if (ms) noteTimer = setTimeout(() => note.classList.add('hidden'), ms);
    },
    big(html, ms = 1100) {
      const d = document.createElement('div');
      d.className = 'pbm-big';
      d.innerHTML = `<span>${html}</span>`;
      root.appendChild(d);
      setTimeout(() => d.remove(), ms);
      return d;
    },
    titleCard(t, text) {
      titleEl?.remove();
      titleEl = document.createElement('div');
      titleEl.className = 'pbm-titlecard';
      titleEl.innerHTML = `<h1>${escapeHtml(t)}</h1>${text ? `<p>${text}</p>` : ''}`;
      root.appendChild(titleEl);
    },
    hideTitleCard() {
      const el = titleEl;
      titleEl = null;
      if (!el) return;
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    },
    finish(text = 'FINISH!') {
      finishEl?.remove();
      finishEl = document.createElement('div');
      finishEl.className = 'pbm-finish';
      finishEl.innerHTML = `<span>${escapeHtml(text)}</span>`;
      root.appendChild(finishEl);
    },
    hideFinish() { finishEl?.remove(); finishEl = null; },
    winner(ps) {
      winnerEl?.remove();
      winnerEl = document.createElement('div');
      winnerEl.className = 'pbm-winner';
      winnerEl.innerHTML = ps.length
        ? `<div class="lbl">${ps.length > 1 ? 'Winners' : 'Winner'}</div><div class="names">${ps.map((p) => `<span class="nm" style="--c:${p.color}">${escapeHtml(p.name)}</span>`).join('')}</div>`
        : '<div class="names"><span class="nm" style="--c:#555">No winner!</span></div>';
      root.appendChild(winnerEl);
    },
    destroy() { clearTimeout(noteTimer); root.remove(); },
  };
}
