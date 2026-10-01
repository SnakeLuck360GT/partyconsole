// Brain Brawl — phone controller. Fully driven by `state` messages from the screen (stateless-tolerant).
import css from './controller.css?inline';
import { ANSWER_STYLE, TF_STYLE, LENGTHS, fmtNum } from './shared.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function start(ctx) {
  const root = document.createElement('div');
  root.className = 'bbp';
  root.innerHTML = `<style>${css}</style>
    <div class="bbp-strip"><span class="bbp-score">0 pts</span><span class="bbp-streak"></span><span class="bbp-rank"></span><button class="bbp-skip" hidden>Skip ⏭</button></div>
    <div class="bbp-timer"><i></i></div>
    <div class="bbp-body"><div class="bbp-center"><div class="bbp-spin"></div><div class="bbp-sub">Connecting to the show…</div></div></div>
    <div class="bbp-toast" hidden></div>`;
  ctx.container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const body = $('.bbp-body');

  let st = null;
  let key = '';
  let typed = { qid: null, text: '' };
  let pendingLock = null; // optimistic lock-in until the screen confirms
  let toastT = 0;
  let timerRaf = 0;

  function send(d) { ctx.send(d); }

  $('.bbp-skip').addEventListener('click', () => { ctx.vibrate(15); send({ type: 'skip' }); });

  function strip(me) {
    if (!me) return;
    $('.bbp-score').textContent = `${fmtNum(me.score)} pts`;
    $('.bbp-streak').textContent = me.streak >= 2 ? `🔥 ${me.streak}` : '';
    $('.bbp-rank').textContent = me.rank && me.of ? `#${me.rank} of ${me.of}` : '';
  }

  function timer(ms, total) {
    cancelAnimationFrame(timerRaf);
    const bar = $('.bbp-timer');
    const fill = bar.querySelector('i');
    if (!ms) { bar.classList.remove('on'); return; }
    bar.classList.add('on');
    const end = performance.now() + ms;
    const tick = () => {
      const left = Math.max(0, end - performance.now());
      fill.style.transform = `scaleX(${left / total})`;
      bar.classList.toggle('urgent', left < 5000);
      if (left > 0) timerRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  function toast(text) {
    const t = $('.bbp-toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 6000);
  }

  function center(html, cls = '') { body.innerHTML = `<div class="bbp-center ${cls}">${html}</div>`; }

  // ---------------------------------------------------------------- phases

  function renderTitle(m) {
    if (ctx.isAdmin) {
      body.innerHTML = `<div class="bbp-admin">
        <div class="bbp-h">👑 You're the host</div>
        <div class="bbp-sub">How long should the show be?</div>
        <div class="bbp-seg">${Object.entries(LENGTHS).map(([k, L]) => `<button data-len="${k}" class="${m.length === k ? 'on' : ''}"><b>${L.label}</b><small>${L.mins}</small></button>`).join('')}</div>
        <button class="bbp-go">START THE SHOW ▶</button>
      </div>`;
      body.querySelectorAll('[data-len]').forEach((b) => b.addEventListener('click', () => {
        ctx.vibrate(10);
        body.querySelectorAll('[data-len]').forEach((x) => x.classList.toggle('on', x === b));
        send({ type: 'setting', length: b.dataset.len });
      }));
      body.querySelector('.bbp-go').addEventListener('click', () => { ctx.vibrate([20, 30, 20]); send({ type: 'start' }); });
    } else {
      center(`<div class="bbp-big">🧠</div><div class="bbp-h">Brain Brawl</div>
        <div class="bbp-sub">Waiting for the host to start the show…</div>
        <ul class="bbp-tips"><li>⚡ Answer fast for up to 1,000 pts</li><li>🔥 Streaks give up to ×1.5</li><li>👀 Watch the TV for the questions</li></ul>`);
    }
  }

  function renderIntro(m) {
    center(`<div class="bbp-big pop">${m.icon}</div><div class="bbp-kicker">${m.final ? 'Final round' : `Round ${m.round}`}</div><div class="bbp-h">${esc(m.title)}</div>
      <div class="bbp-sub">${esc(m.desc)}</div>${m.final ? '<div class="bbp-x2">2× POINTS</div>' : ''}`);
  }

  function renderVote(m) {
    body.innerHTML = `<div class="bbp-vote"><div class="bbp-h small">Vote for a category</div>
      <div class="bbp-cats n${m.options.length}">${m.options.map((o, i) => `<button class="bbp-cat ${m.myVote === i ? 'on' : ''}" data-i="${i}" style="--c:${o.color}">
        <span class="k">${i + 1}</span><span class="e">${o.emoji}</span><span class="n">${esc(o.name)}</span></button>`).join('')}</div>
      <div class="bbp-sub small">${m.myVote != null ? 'Vote counted! You can still change it.' : 'Tap your favourite'}</div></div>`;
    body.querySelectorAll('.bbp-cat').forEach((b) => b.addEventListener('click', () => {
      ctx.vibrate(20);
      body.querySelectorAll('.bbp-cat').forEach((x) => x.classList.toggle('on', x === b));
      send({ type: 'vote', voteId: m.voteId, choice: Number(b.dataset.i) });
    }));
    timer(m.remaining, 12000);
  }

  function renderSpin(m) {
    if (m.category) center(`<div class="bbp-big pop">${m.category.emoji}</div><div class="bbp-kicker">Category</div><div class="bbp-h">${esc(m.category.name)}</div><div class="bbp-sub">Eyes on the TV!</div>`);
    else center('<div class="bbp-big wheel">🎡</div><div class="bbp-h">Spinning the wheel…</div><div class="bbp-sub">Watch the TV!</div>');
  }

  function qHead(m) {
    return `<div class="bbp-qhead"><span class="bbp-chip" style="--c:${m.category?.color || '#666'}">${m.category?.emoji || ''} ${esc(m.category?.name || '')}</span>
      <span class="bbp-count">${esc(m.count || '')}${m.double ? ' · <b>2×</b>' : ''}</span></div>`;
  }

  function renderRead(m) {
    if (m.late) return renderLate();
    center(`${qHead(m)}<div class="bbp-kicker">${m.kind === 'tf' ? '⚡ True or false?' : m.kind === 'num' ? '🎯 Closest number' : 'Get ready…'}</div>
      <div class="bbp-qtext">${esc(m.text)}</div><div class="bbp-ready"><i style="animation-duration:${m.readMs}ms"></i></div>`, 'top');
    ctx.vibrate(10);
  }

  function renderLate() {
    center('<div class="bbp-big">👋</div><div class="bbp-h">Welcome to the show!</div><div class="bbp-sub">You start at 0 points and play from the next question. Watch this one on the TV!</div>');
  }

  function lockedView(m, label) {
    center(`<div class="bbp-big pop">🔒</div><div class="bbp-h">Locked in!</div><div class="bbp-lockans">${label}</div><div class="bbp-sub">Waiting for the others…</div>`, 'locked');
  }

  function renderAnswer(m) {
    if (m.late) return renderLate();
    const mine = m.myAnswer ?? (pendingLock?.qid === m.qid ? pendingLock.v : null);
    timer(m.remaining, m.dur);
    if (mine !== null && mine !== undefined) {
      if (m.kind === 'num') return lockedView(m, `${fmtNum(mine, m.year)}${m.unit ? ` ${esc(m.unit)}` : ''}`);
      const s = (m.kind === 'tf' ? TF_STYLE : ANSWER_STYLE)[mine];
      return lockedView(m, `<span class="bbp-lockchip" style="--c:${s.color}">${s.shape} ${esc(m.kind === 'tf' ? s.label : m.choices[mine])}</span>`);
    }
    if (m.kind === 'num') return renderKeypad(m);
    const style = m.kind === 'tf' ? TF_STYLE : ANSWER_STYLE;
    const longest = Math.max(...m.choices.map((c) => c.length));
    body.innerHTML = `<div class="bbp-answer">
      <div class="bbp-qmini">${esc(m.text)}</div>
      <div class="bbp-btns ${m.kind === 'tf' ? 'tf' : 'mc'} ${longest > 26 ? 'long' : longest > 14 ? 'mid' : ''}">
        ${m.choices.map((c, i) => `<button class="bbp-ans" data-i="${i}" style="--c:${style[i].color};--d:${style[i].dark}">
          <span class="s">${style[i].shape}</span><span class="t">${esc(m.kind === 'tf' ? style[i].label : c)}</span></button>`).join('')}
      </div></div>`;
    body.querySelectorAll('.bbp-ans').forEach((b) => b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const i = Number(b.dataset.i);
      ctx.vibrate(30);
      b.classList.add('hit');
      pendingLock = { qid: m.qid, v: i };
      send({ type: 'answer', qid: m.qid, choice: i });
      setTimeout(() => { if (st === m) renderAnswer(m); }, 120);
    }));
  }

  function renderKeypad(m) {
    if (typed.qid !== m.qid) typed = { qid: m.qid, text: '' };
    body.innerHTML = `<div class="bbp-num">
      <div class="bbp-num-left"><div class="bbp-qmini">${esc(m.text)}</div>
        <div class="bbp-display"><span class="v"></span><span class="u">${esc(m.unit || '')}</span></div></div>
      <div class="bbp-keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) => `<button data-k="${k}" class="${k === 'OK' ? 'ok' : k === '⌫' ? 'del' : ''}">${k === 'OK' ? 'Lock in' : k}</button>`).join('')}</div>
    </div>`;
    const disp = body.querySelector('.bbp-display .v');
    const ok = body.querySelector('[data-k="OK"]');
    const show = () => {
      disp.textContent = typed.text ? fmtNum(Number(typed.text), m.year) : '?';
      disp.classList.toggle('empty', !typed.text);
      ok.disabled = !typed.text;
    };
    show();
    body.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const k = b.dataset.k;
      ctx.vibrate(8);
      if (k === '⌫') typed.text = typed.text.slice(0, -1);
      else if (k === 'OK') {
        if (!typed.text) return;
        ctx.vibrate(30);
        const v = Number(typed.text);
        pendingLock = { qid: m.qid, v };
        send({ type: 'answer', qid: m.qid, value: v });
        renderAnswer(m);
        return;
      } else if (typed.text.length < 9) typed.text = (typed.text === '0' ? '' : typed.text) + k;
      show();
    }));
  }

  function renderClosed(m) {
    timer(0);
    const a = pendingLock?.qid === m.qid;
    center(`<div class="bbp-big pop">⏰</div><div class="bbp-h">Time's up!</div><div class="bbp-sub">${a ? 'Answer locked. Let\'s see…' : 'Eyes on the TV for the answer…'}</div>`);
  }

  function renderReveal(m) {
    timer(0);
    const r = m.res || {};
    const me = m.me || {};
    const rank = me.rank ? `<div class="bbp-rankline">You're <b>#${me.rank}</b> of ${me.of}</div>` : '';
    if (r.late) return renderLate();
    if (r.num) {
      const win = r.place === 1;
      center(`<div class="bbp-big pop">${r.bullseye ? '🎯' : win ? '🏆' : r.place <= 3 ? '👏' : '📏'}</div>
        <div class="bbp-h">${r.bullseye ? 'BULLSEYE!' : win ? 'Closest!' : `#${r.place} closest`}</div>
        <div class="bbp-sub">You said <b>${fmtNum(r.value, m.year)}</b> · answer <b>${fmtNum(r.answer, m.year)}</b> (off by ${fmtNum(r.err, m.year && false)})</div>
        <div class="bbp-gain">+${fmtNum(r.gain)}</div>${rank}`, win ? 'good' : 'meh');
      ctx.vibrate(win ? [40, 40, 80] : 30);
      return;
    }
    if (r.none) {
      const ans = m.kind === 'num' ? fmtNum(m.answer, m.year) : esc(m.correctText);
      center(`<div class="bbp-big pop">😴</div><div class="bbp-h">No answer</div><div class="bbp-sub">It was <b>${ans}</b></div>${rank}`, 'meh');
      return;
    }
    if (r.ok) {
      center(`<div class="bbp-big pop">✅</div><div class="bbp-h">Correct!</div><div class="bbp-gain">+${fmtNum(r.gain)}</div>
        <div class="bbp-sub">${(r.t / 1000).toFixed(1)}s${r.mult > 1 ? ` · 🔥 streak ×${r.mult.toFixed(1)}` : ''}${r.double ? ' · 2× final' : ''}</div>${rank}`, 'good');
      ctx.vibrate([30, 40, 60]);
    } else {
      center(`<div class="bbp-big pop">❌</div><div class="bbp-h">Not quite!</div><div class="bbp-sub">The answer was<br><b class="bbp-correct">${esc(r.correctText)}</b></div>${rank}`, 'bad');
      ctx.vibrate(200);
    }
  }

  function renderBoard(m) {
    const me = m.me || {};
    const d = me.delta || 0;
    center(`<div class="bbp-kicker">Your position</div><div class="bbp-rankbig">#${me.rank || '–'}</div><div class="bbp-sub">of ${me.of || 0} players</div>
      ${d ? `<div class="bbp-move ${d > 0 ? 'up' : 'down'}">${d > 0 ? `▲ up ${d}` : `▼ down ${-d}`}</div>` : ''}
      <div class="bbp-scorebig">${fmtNum(me.score)} pts</div>${me.streak >= 2 ? `<div class="bbp-sub">🔥 ${me.streak} in a row!</div>` : ''}`);
  }

  function renderFinal(m) {
    const me = m.me || {};
    const place = me.rank === 1 ? '🏆' : me.rank === 2 ? '🥈' : me.rank === 3 ? '🥉' : '🎉';
    center(`<div class="bbp-big pop">${place}</div><div class="bbp-kicker">Final result</div><div class="bbp-rankbig">#${me.rank || '–'}</div><div class="bbp-sub">of ${me.of || 0} · <b>${fmtNum(me.score)}</b> pts</div>
      <div class="bbp-stats"><span><b>${m.stats?.right ?? 0}</b>correct</span><span><b>${m.stats?.best ?? 0}</b>best streak</span></div>`, me.rank === 1 ? 'good' : '');
    if (me.rank === 1) ctx.vibrate([60, 60, 60, 60, 200]);
  }

  function render(m) {
    st = m;
    strip(m.me);
    $('.bbp-skip').hidden = !ctx.isAdmin || m.phase === 'title' || m.phase === 'results';
    const k = `${m.phase}|${m.qid ?? ''}|${m.voteId ?? ''}|${m.myAnswer ?? ''}|${m.myVote ?? ''}|${m.late ? 1 : 0}|${m.phase === 'title' ? `${m.length}${ctx.isAdmin}` : ''}|${m.category?.name ?? ''}`;
    // Avoid rebuilding identical screens (keeps keypad input / animations intact on duplicate pushes).
    if (k === key && m.phase !== 'answer') return;
    if (k === key && m.phase === 'answer' && m.kind === 'num' && (m.myAnswer === null || m.myAnswer === undefined) && pendingLock?.qid !== m.qid) return;
    key = k;
    if (m.phase !== 'answer' && m.phase !== 'vote') timer(0);
    root.dataset.phase = m.phase;
    switch (m.phase) {
      case 'title': return renderTitle(m);
      case 'intro': return renderIntro(m);
      case 'vote': return renderVote(m);
      case 'spin': return renderSpin(m);
      case 'read': return renderRead(m);
      case 'answer': return renderAnswer(m);
      case 'closed': return renderClosed(m);
      case 'reveal': return renderReveal(m);
      case 'board': return renderBoard(m);
      case 'final': return renderFinal(m);
      case 'results': return center('<div class="bbp-big">🏆</div><div class="bbp-h">That\'s the show!</div>');
      default: return undefined;
    }
  }

  ctx.onMessage((m) => {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'state') render(m);
    else if (m.type === 'toast') toast(m.text);
  });
  // Admin status can change (host left) — re-evaluate the skip button and title controls.
  let wasAdmin = ctx.isAdmin;
  const adminIv = setInterval(() => {
    if (ctx.isAdmin !== wasAdmin && st) { wasAdmin = ctx.isAdmin; key = ''; render(st); }
  }, 1000);
  send({ type: 'hello' });

  return {
    destroy() {
      clearInterval(adminIv);
      clearTimeout(toastT);
      cancelAnimationFrame(timerRaf);
      root.remove();
    },
  };
}
