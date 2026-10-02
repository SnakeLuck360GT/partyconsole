// TV HUD: score bug + clock, big callouts, kickoff countdown, goal banner, replay letterbox,
// how-to-play card, team reveal and full-time card. Flat, bold, sparse; readable from the couch.
import { escapeHtml } from '../../sdk/screen-kit.js';
import { TEAMS } from './config.js';

const CSS = `
.sk-hud { position:absolute; inset:0; pointer-events:none; font-family:'Fredoka', system-ui, sans-serif; color:#fff; z-index:10; overflow:hidden; }
.sk-bug { position:absolute; top:18px; left:18px; display:flex; align-items:stretch; height:clamp(44px,4.4vw,64px); border-radius:12px; overflow:hidden; background:#10131c; box-shadow:0 5px 0 rgba(0,0,0,.28); font-weight:700; }
.sk-bug .tm { display:flex; align-items:center; padding:0 clamp(10px,1vw,16px); font-size:clamp(18px,1.7vw,28px); letter-spacing:.04em; background:var(--c); }
.sk-bug .sc { display:flex; align-items:center; justify-content:center; min-width:1.5em; font-size:clamp(26px,2.6vw,42px); font-variant-numeric:tabular-nums; padding:0 .25em; }
.sk-bug .sc.pop { animation: skPop .6s cubic-bezier(.2,1.8,.4,1); color:#ffd23a; }
.sk-bug .clk { display:flex; align-items:center; padding:0 clamp(12px,1.2vw,20px); font-size:clamp(22px,2.1vw,34px); font-variant-numeric:tabular-nums; background:#1d2230; min-width:3.2em; justify-content:center; }
.sk-bug .clk.low { color:#ff6a55; }
.sk-bug .clk.gold { color:#10131c; background:#ffd23a; font-size:clamp(15px,1.4vw,23px); letter-spacing:.06em; }
.sk-feed { position:absolute; top:18px; right:18px; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.sk-feed div { background:#10131c; border-radius:10px; padding:6px 14px 7px; font-weight:600; font-size:clamp(14px,1.15vw,19px); animation: skIn .25s ease-out; transition:opacity .4s; box-shadow:0 3px 0 rgba(0,0,0,.25); }
.sk-feed b { color:var(--c); font-weight:700; }
.sk-call { position:absolute; left:0; right:0; top:36%; text-align:center; font-weight:700; font-size:clamp(52px,8vw,140px); line-height:1; -webkit-text-stroke:5px #10131c; paint-order:stroke fill; text-shadow:0 8px 0 #10131c; animation: skPopIn .45s cubic-bezier(.2,1.6,.4,1); transition:opacity .3s, transform .3s; text-transform:uppercase; }
.sk-call small { display:block; font-size:.3em; -webkit-text-stroke:3px #10131c; text-shadow:0 4px 0 #10131c; margin-top:.4em; text-transform:none; font-weight:600; }
.sk-call.out { opacity:0; transform:scale(1.15); }
.sk-call.num { font-size:clamp(90px,14vw,230px); top:30%; }
.sk-goal { position:absolute; left:0; right:0; top:30%; display:flex; flex-direction:column; align-items:center; gap:14px; transition:opacity .35s; }
.sk-goal.out { opacity:0; }
.sk-goal .big { font-weight:700; font-size:clamp(90px,15vw,250px); line-height:.9; color:#fff; -webkit-text-stroke:7px #10131c; paint-order:stroke fill; text-shadow:0 10px 0 #10131c; animation: skSlam .5s cubic-bezier(.2,1.5,.35,1); letter-spacing:.02em; }
.sk-goal .who { background:var(--c); border-radius:14px; padding:8px 26px 10px; font-weight:700; font-size:clamp(24px,2.6vw,44px); box-shadow:0 6px 0 rgba(0,0,0,.3); animation: skIn .35s .25s both; }
.sk-goal .who small { font-weight:600; opacity:.85; font-size:.62em; margin-left:.5em; }
.sk-goal.gold .big { color:#ffd23a; }
.sk-bars::before, .sk-bars::after { content:''; position:absolute; left:0; right:0; height:9%; background:#000; transition:transform .35s ease; z-index:1; }
.sk-bars::before { top:0; transform:translateY(-100%); }
.sk-bars::after { bottom:0; transform:translateY(100%); }
.sk-bars.on::before, .sk-bars.on::after { transform:none; }
.sk-replay { position:absolute; top:calc(9% + 18px); right:22px; background:#ffd23a; color:#10131c; font-weight:700; letter-spacing:.12em; font-size:clamp(18px,1.6vw,28px); padding:5px 16px 6px; border-radius:10px; z-index:2; }
.sk-shade { position:absolute; inset:0; background:rgba(9,11,18,.66); display:grid; place-items:center; animation: skFade .35s; transition:opacity .35s; z-index:3; }
.sk-shade.out { opacity:0; }
.sk-card { text-align:center; width:min(1120px,92vw); }
.sk-card h1 { margin:0; font-size:clamp(56px,7.5vw,124px); line-height:.95; font-weight:700; color:#fff; -webkit-text-stroke:6px #10131c; paint-order:stroke fill; text-shadow:0 8px 0 #10131c; }
.sk-card .goal { font-size:clamp(20px,2.1vw,34px); font-weight:600; margin:14px 0 28px; }
.sk-moves { display:grid; grid-template-columns:repeat(3,1fr); gap:clamp(14px,2vw,26px); }
.sk-mv { background:#10131c; border-radius:20px; padding:22px 18px 22px; display:flex; flex-direction:column; align-items:center; gap:8px; box-shadow:0 5px 0 rgba(0,0,0,.3); }
.sk-mv .btn { width:clamp(72px,6.6vw,106px); height:clamp(72px,6.6vw,106px); border-radius:50%; display:grid; place-items:center; font-weight:700; font-size:clamp(15px,1.3vw,21px); box-shadow:inset 0 -5px 0 rgba(0,0,0,.22); }
.sk-mv .btn.stick { border:4px solid rgba(255,255,255,.35); }
.sk-mv .btn.stick i { width:46%; height:46%; border-radius:50%; background:#fff; }
.sk-mv b { font-size:clamp(22px,2vw,34px); font-weight:700; }
.sk-mv span { font-size:clamp(15px,1.25vw,21px); font-weight:500; opacity:.85; max-width:17em; line-height:1.3; }
.sk-card .mode { margin-top:22px; font-weight:600; font-size:clamp(17px,1.6vw,26px); }
.sk-card .bar { margin:18px auto 0; width:min(360px,50vw); height:8px; border-radius:8px; background:rgba(255,255,255,.15); overflow:hidden; }
.sk-card .bar i { display:block; height:100%; background:#ffd23a; animation: skBar linear forwards; }
.sk-teams { display:grid; grid-template-columns:1fr auto 1fr; gap:clamp(16px,2.2vw,36px); align-items:start; width:min(1180px,94vw); }
.sk-team { border-radius:22px; overflow:hidden; background:#10131c; box-shadow:0 6px 0 rgba(0,0,0,.3); animation: skIn .4s both; }
.sk-team h2 { margin:0; background:var(--c); font-size:clamp(34px,3.6vw,60px); font-weight:700; padding:12px 0 14px; letter-spacing:.04em; }
.sk-team ul { list-style:none; margin:0; padding:14px 18px 18px; display:grid; gap:6px; }
.sk-team ul.two { grid-template-columns:1fr 1fr; }
.sk-team li { display:flex; align-items:center; gap:12px; font-weight:600; font-size:clamp(18px,1.7vw,28px); background:#1d2230; border-radius:12px; padding:7px 14px; white-space:nowrap; overflow:hidden; animation: skIn .3s both; }
.sk-team li i { width:16px; height:16px; border-radius:50%; background:var(--p); flex:none; }
.sk-team li span { overflow:hidden; text-overflow:ellipsis; }
.sk-team li.bot { opacity:.55; }
.sk-team li em { font-style:normal; margin-left:auto; font-size:.7em; opacity:.7; letter-spacing:.06em; }
.sk-vs { align-self:center; font-weight:700; font-size:clamp(40px,4.4vw,72px); -webkit-text-stroke:5px #10131c; paint-order:stroke fill; text-shadow:0 6px 0 #10131c; }
.sk-final { text-align:center; }
.sk-final .lbl { font-weight:700; font-size:clamp(26px,2.6vw,42px); letter-spacing:.12em; color:#ffd23a; }
.sk-final .score { display:flex; align-items:center; justify-content:center; gap:clamp(16px,2vw,32px); margin:10px 0 16px; }
.sk-final .score .tm { background:var(--c); border-radius:18px; padding:10px 26px 12px; font-weight:700; font-size:clamp(28px,3vw,50px); letter-spacing:.04em; box-shadow:0 6px 0 rgba(0,0,0,.3); }
.sk-final .score .n { font-weight:700; font-size:clamp(80px,10vw,170px); line-height:1; -webkit-text-stroke:6px #10131c; paint-order:stroke fill; text-shadow:0 8px 0 #10131c; font-variant-numeric:tabular-nums; }
.sk-final .win { font-weight:700; font-size:clamp(34px,4vw,66px); -webkit-text-stroke:5px #10131c; paint-order:stroke fill; text-shadow:0 6px 0 #10131c; }
.sk-final .mvp { margin-top:14px; font-weight:600; font-size:clamp(18px,1.8vw,30px); }
@keyframes skPop { 0% { transform:scale(1) } 30% { transform:scale(1.7) } 100% { transform:scale(1) } }
@keyframes skPopIn { from { transform:scale(.3); opacity:0 } to { transform:scale(1); opacity:1 } }
@keyframes skSlam { 0% { transform:scale(2.6); opacity:0 } 60% { opacity:1 } 100% { transform:scale(1) } }
@keyframes skIn { from { transform:translateY(14px); opacity:0 } to { transform:none; opacity:1 } }
@keyframes skFade { from { opacity:0 } }
@keyframes skBar { from { width:0 } to { width:100% } }
`;

export function createHUD(container) {
  const style = document.createElement('style');
  style.textContent = CSS;
  container.appendChild(style);
  const root = document.createElement('div');
  root.className = 'sk-hud sk-bars';
  root.innerHTML = `<div class="sk-bug" hidden>
      <div class="tm" style="--c:${TEAMS[0].css}">${TEAMS[0].short}</div><div class="sc s0">0</div>
      <div class="sc s1">0</div><div class="tm" style="--c:${TEAMS[1].css}">${TEAMS[1].short}</div>
      <div class="clk">3:00</div></div>
    <div class="sk-feed"></div>`;
  container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const bug = $('.sk-bug');
  const s0 = $('.s0');
  const s1 = $('.s1');
  const clk = $('.clk');
  const feedEl = $('.sk-feed');
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  let lastClock = '';
  let callEl = null;
  let goalEl = null;
  let shadeEl = null;
  let replayEl = null;

  function shade(html, ms) {
    if (shadeEl) shadeEl.remove();
    const d = document.createElement('div');
    d.className = 'sk-shade';
    d.innerHTML = html;
    root.appendChild(d);
    shadeEl = d;
    if (ms) later(() => { d.classList.add('out'); later(() => { d.remove(); if (shadeEl === d) shadeEl = null; }, 380); }, ms);
    return d;
  }

  return {
    showBug(v) { bug.hidden = !v; },
    setScore(a, b, pop = -1) {
      s0.textContent = a; s1.textContent = b;
      const el = pop === 0 ? s0 : pop === 1 ? s1 : null;
      if (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    },
    setClock(sec, golden = false) {
      let txt;
      if (golden) txt = 'GOLDEN GOAL';
      else { const s = Math.max(0, Math.ceil(sec)); txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
      if (txt === lastClock) return;
      lastClock = txt;
      clk.textContent = txt;
      clk.classList.toggle('gold', golden);
      clk.classList.toggle('low', !golden && sec <= 10);
    },
    feed(html) {
      const d = document.createElement('div');
      d.innerHTML = html;
      feedEl.prepend(d);
      while (feedEl.children.length > 3) feedEl.lastChild.remove();
      later(() => { d.style.opacity = '0'; later(() => d.remove(), 450); }, 3600);
    },
    callout(html, ms = 1400, cls = '') {
      if (callEl) callEl.remove();
      const d = document.createElement('div');
      d.className = `sk-call ${cls}`;
      d.innerHTML = html;
      root.appendChild(d);
      callEl = d;
      later(() => { d.classList.add('out'); later(() => d.remove(), 320); }, ms);
    },
    goal({ teamCss, scorer, assist, own, golden }, ms) {
      if (goalEl) goalEl.remove();
      const d = document.createElement('div');
      d.className = `sk-goal${golden ? ' gold' : ''}`;
      const who = scorer ? `${escapeHtml(scorer)}${own ? '<small>own goal</small>' : assist ? `<small>assist ${escapeHtml(assist)}</small>` : ''}` : '';
      d.innerHTML = `<div class="big">${golden ? 'GOLDEN GOAL!' : 'GOAL!'}</div>${who ? `<div class="who" style="--c:${teamCss}">${who}</div>` : ''}`;
      root.appendChild(d);
      goalEl = d;
      later(() => { d.classList.add('out'); later(() => d.remove(), 360); }, ms);
    },
    replay(on) {
      root.classList.toggle('on', on);
      if (on && !replayEl) { replayEl = document.createElement('div'); replayEl.className = 'sk-replay'; replayEl.textContent = 'REPLAY'; root.appendChild(replayEl); }
      if (!on && replayEl) { replayEl.remove(); replayEl = null; }
    },
    intro({ ms, modeText }) {
      shade(`<div class="sk-card">
        <h1>SUPER KICKOFF</h1>
        <div class="goal">Score more than the other team before the clock runs out.</div>
        <div class="sk-moves">
          <div class="sk-mv"><div class="btn stick"><i></i></div><b>Move</b><span>Drag the stick on your phone</span></div>
          <div class="sk-mv"><div class="btn" style="background:#ff5a3c">KICK</div><b>Tap to pass, hold to shoot</b><span>Hold longer for a harder shot</span></div>
          <div class="sk-mv"><div class="btn" style="background:#3d6bff">SPRINT</div><b>Hold to sprint</b><span>Press it next to the ball carrier to slide tackle</span></div>
        </div>
        <div class="mode">${modeText}</div>
        <div class="bar"><i style="animation-duration:${ms}ms"></i></div>
      </div>`, ms);
    },
    /** teams: [[{name, color, bot, keeper}], [...]] */
    teams(teams, ms) {
      const col = (t, list, delay) => {
        const two = list.length > 6;
        return `<div class="sk-team" style="--c:${TEAMS[t].css}; animation-delay:${delay}ms"><h2>${TEAMS[t].name}</h2><ul class="${two ? 'two' : ''}">${list.map((p, i) => `<li class="${p.bot ? 'bot' : ''}" style="--p:${p.color}; animation-delay:${delay + 120 + i * 60}ms"><i></i><span>${escapeHtml(p.name)}</span>${p.keeper ? '<em>GK</em>' : p.bench ? '<em>SUB</em>' : ''}</li>`).join('')}</ul></div>`;
      };
      shade(`<div class="sk-teams">${col(0, teams[0], 0)}<div class="sk-vs">VS</div>${col(1, teams[1], 150)}</div>`, ms);
    },
    final({ score, winner, mvp }, ms) {
      const win = winner == null ? 'It’s a draw' : `${TEAMS[winner].name} wins`;
      shade(`<div class="sk-final">
        <div class="lbl">FULL TIME</div>
        <div class="score"><div class="tm" style="--c:${TEAMS[0].css}">${TEAMS[0].name}</div><div class="n">${score[0]} – ${score[1]}</div><div class="tm" style="--c:${TEAMS[1].css}">${TEAMS[1].name}</div></div>
        <div class="win" ${winner != null ? `style="color:${TEAMS[winner].css}"` : ''}>${win}</div>
        ${mvp ? `<div class="mvp">${mvp}</div>` : ''}
      </div>`, ms);
    },
    clearOverlays() {
      for (const el of [shadeEl, callEl, goalEl]) el?.remove();
      shadeEl = callEl = goalEl = null;
      this.replay(false);
    },
    destroy() {
      timers.forEach(clearTimeout);
      style.remove();
      root.remove();
    },
  };
}
