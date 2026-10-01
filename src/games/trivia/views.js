// Brain Brawl screen views. Each function renders into the UI shell and returns a small controller object.
import { sfx } from '../../sdk/audio.js';
import { escapeHtml as esc } from '../../sdk/screen-kit.js';
import { ANSWER_STYLE, TF_STYLE, LENGTHS, catStyle, fmtNum } from './shared.js';
import { avatar } from './ui.js';
import { countUp } from './fx.js';

const RING_C = 2 * Math.PI * 88;
const later = (fn, ms, ui) => { const t = setTimeout(fn, ms); ui.onLeave(() => clearTimeout(t)); return t; };

// ------------------------------------------------------------------ title

export function titleView(ui, { players, adminName, length, autoIn }) {
  ui.theme('title');
  ui.header({ show: false });
  const v = ui.view(`
    <div class="bb-title">
      <div class="bb-marquee"><div class="bb-bulbs"></div><div class="bb-logo-big">BRAIN BRAWL</div></div>
      <div class="bb-tagline">The trivia showdown · grab your phone, it's your buzzer!</div>
      <div class="bb-howto">
        <div class="bb-how"><i>⚡</i><div><b>Fast = more points</b><small>Answer on your phone. Correct answers score up to 1,000.</small></div></div>
        <div class="bb-how"><i>🔥</i><div><b>Build a streak</b><small>Correct in a row? Up to ×1.5 bonus. Don't break the chain!</small></div></div>
        <div class="bb-how"><i>🎯</i><div><b>4 kinds of rounds</b><small>Classic · True/False Lightning · Closest Number · Double-points Final</small></div></div>
      </div>
      <div class="bb-waiting"></div>
      <div class="bb-joined"></div>
      <div class="bb-credit">Questions: Open Trivia DB (CC BY-SA 4.0) + originals</div>
    </div>`);
  // Marquee light bulbs around the logo frame.
  const bulbs = v.querySelector('.bb-bulbs');
  const nx = 22;
  const ny = 6;
  let html = '';
  let k = 0;
  const bulb = (l, t) => { html += `<i class="bb-bulb" style="left:${l}%;top:${t}%;animation-delay:${(k++ % 2) * 0.6}s"></i>`; };
  for (let i = 0; i <= nx; i++) bulb((i / nx) * 100, 0);
  for (let i = 1; i <= ny; i++) bulb(100, (i / ny) * 100);
  for (let i = nx - 1; i >= 0; i--) bulb((i / nx) * 100, 100);
  for (let i = ny - 1; i >= 1; i--) bulb(0, (i / ny) * 100);
  bulbs.innerHTML = html;

  const ctl = {
    update({ players: ps = players, adminName: an = adminName, length: len = length, autoIn: ai = autoIn } = {}) {
      players = ps; adminName = an; length = len; autoIn = ai;
      const L = LENGTHS[length];
      v.querySelector('.bb-waiting').innerHTML = `👑 <b>${esc(adminName || 'The host')}</b>&nbsp;picks the length &amp; starts the show
        <span class="bb-len">${L.label.toUpperCase()} · ${L.mins}</span>
        <span style="opacity:.6;font-size:26px">(auto-start in ${Math.max(0, Math.ceil(autoIn))}s)</span>`;
      const box = v.querySelector('.bb-joined');
      const shown = players.slice(0, 40);
      box.innerHTML = shown.map((p) => avatar(p)).join('') + (players.length > 40 ? `<span class="bb-more" style="height:56px">+${players.length - 40}</span>` : '');
    },
  };
  ctl.update();
  return ctl;
}

// ------------------------------------------------------------------ round intro

export const ROUND_INFO = {
  classic: { theme: 'classic', icon: '🧠', name: 'Classic', desc: 'Four answers, 15 seconds. The faster you lock in the right one, the more you score. Chain answers for 🔥 streak bonuses!' },
  tf: { theme: 'tf', icon: '⚡', name: 'True or False Lightning', desc: '5 rapid-fire statements. 6 seconds each. Trust your gut!' },
  num: { theme: 'num', icon: '🎯', name: 'Closest Number', desc: 'Type a number on your phone. The closest guess wins 1,000 points. Everyone else scores by how close they got.' },
  final: { theme: 'final', icon: '👑', name: 'The Final', desc: 'Every question is worth DOUBLE points. The leaderboard can still flip!' },
};

export function introView(ui, { index, info, double }) {
  ui.theme(info.theme);
  ui.header({ show: false });
  ui.view(`
    <div class="bb-intro">
      <div class="bb-intro-lines"></div>
      <div class="bb-intro-inner">
        <div class="bb-intro-num">${double ? 'Final round' : `Round ${index}`}</div>
        <div class="bb-intro-icon">${info.icon}</div>
        <div class="bb-intro-name">${esc(info.name)}</div>
        <div class="bb-intro-desc">${esc(info.desc).replace('🔥', '🔥')}</div>
        ${double ? '<div class="bb-x2 bb-intro-x2">2× POINTS</div>' : ''}
      </div>
    </div>`, 'bb-intro');
  sfx.play('whoosh');
  later(() => sfx.play('powerup'), 350, ui);
}

// ------------------------------------------------------------------ category vote + wheel

export function voteView(ui, { options, seconds, header }) {
  ui.header(header);
  const v = ui.view(`
    <div class="bb-vote">
      <div class="bb-h1">Pick the category!</div>
      <div class="bb-h2">Vote on your phone · <span class="bb-vote-left">${seconds}</span>s</div>
      <div class="bb-cats">
        ${options.map((o, i) => {
          const s = catStyle(o);
          return `<div class="bb-cat" style="--c:${s.color}" data-i="${i}">
            <div class="bb-cat-key">${i + 1}</div>
            <div class="bb-cat-emoji">${s.emoji}</div>
            <div class="bb-cat-name">${esc(o)}</div>
            <div class="bb-cat-votes"><div class="bb-cat-bar"><i></i></div><div class="bb-cat-count">0 votes</div></div>
          </div>`;
        }).join('')}
      </div>
    </div>`);
  const t0 = performance.now();
  const iv = setInterval(() => {
    const left = Math.max(0, Math.ceil(seconds - (performance.now() - t0) / 1000));
    const el = v.querySelector('.bb-vote-left');
    if (el && el.textContent !== String(left)) { el.textContent = left; if (left <= 3 && left > 0) sfx.play('tick'); }
  }, 200);
  ui.onLeave(() => clearInterval(iv));
  return {
    el: v,
    tally(counts, total) {
      const cards = v.querySelectorAll('.bb-cat');
      counts.forEach((c, i) => {
        cards[i].querySelector('.bb-cat-bar i').style.width = `${total ? (c / total) * 100 : 0}%`;
        cards[i].querySelector('.bb-cat-count').textContent = `${c} vote${c === 1 ? '' : 's'}`;
      });
    },
    unanimous(i) {
      clearInterval(iv);
      v.querySelector('.bb-h2').textContent = 'Unanimous!';
      v.querySelectorAll('.bb-cat').forEach((c, j) => c.classList.add(j === i ? 'win' : 'lose'));
      sfx.play('powerup');
      ui.burstAt(v.querySelectorAll('.bb-cat')[i], { count: 120 });
    },
  };
}

/** Spinning roulette wheel. segments: [{name, weight, votes}], resolves after landing on winner index. */
export function wheelView(ui, { segments, winner, header, total }) {
  ui.header(header);
  const W = segments.reduce((a, s) => a + s.weight, 0);
  let a = 0;
  const segs = segments.map((s) => {
    const span = (s.weight / W) * 360;
    const seg = { ...s, a0: a, a1: a + span, style: catStyle(s.name) };
    a += span;
    return seg;
  });
  const pt = (deg, r) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r];
  const paths = segs.map((s, i) => {
    const R = 96;
    const big = s.a1 - s.a0 > 180 ? 1 : 0;
    const [x0, y0] = pt(s.a0, R);
    const [x1, y1] = pt(s.a1, R);
    const d = segs.length === 1 ? `M0,-${R} A${R},${R} 0 1 1 -0.01,-${R} Z` : `M0,0 L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${big} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
    const mid = (s.a0 + s.a1) / 2;
    const span = s.a1 - s.a0;
    const name = s.name.length > 14 ? s.name.split(' ')[0] : s.name;
    const fs = Math.min(10, (span / 360) * 2 * Math.PI * 58 / Math.max(4, name.length * 0.62));
    const shade = i % 2 ? 'color-mix(in srgb, ' + s.style.color + ' 80%, #000)' : s.style.color;
    return `<path d="${d}" fill="${shade}" stroke="#fff" stroke-width="1.2"/>
      <g transform="rotate(${mid.toFixed(2)})">
        <text y="-66" text-anchor="middle" dominant-baseline="middle" font-size="${Math.min(24, span / 3).toFixed(1)}" style="stroke:none">${s.style.emoji}</text>
        ${fs >= 5 ? `<text y="-40" text-anchor="middle" dominant-baseline="middle" font-size="${fs.toFixed(1)}">${esc(name)}</text>` : ''}
      </g>`;
  }).join('');
  const studs = Array.from({ length: 24 }, (_, i) => { const [x, y] = pt(i * 15, 98.5); return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="#fff6c9"/>`; }).join('');
  const v = ui.view(`
    <div class="bb-wheel-wrap">
      <div class="bb-wheel-box">
        <svg class="bb-pointer" viewBox="0 0 70 90"><path d="M35 88 L6 20 A30 30 0 1 1 64 20 Z" fill="#ffd23f" stroke="#fff" stroke-width="5"/><circle cx="35" cy="26" r="10" fill="#fff"/></svg>
        <svg class="bb-wheel" viewBox="-104 -104 208 208">
          <circle r="103" fill="#1b1340" stroke="#ffd23f" stroke-width="3"/>
          <g class="bb-wheel-rot">${paths}</g>
          ${studs}
        </svg>
        <div class="bb-hub">🎲</div>
      </div>
      <div class="bb-wheel-side">
        <div class="bb-h1" style="font-size:72px;text-align:left">Spin the wheel!</div>
        <div class="bb-h2" style="text-align:left">${total ? 'More votes = a bigger slice.' : 'Nobody voted, so every category gets a fair slice.'}</div>
        <div class="bb-wheel-list" style="margin-top:30px;display:flex;flex-direction:column;gap:14px">
          ${segs.map((s) => `<div style="display:flex;align-items:center;gap:16px;font-size:36px;font-weight:600">
            <span style="width:56px;height:56px;border-radius:14px;display:grid;place-items:center;background:${s.style.color}">${s.style.emoji}</span>
            <span style="flex:1">${esc(s.name)}</span><span style="font-family:var(--display);color:var(--gold)">${Math.round((s.weight / W) * 100)}%</span></div>`).join('')}
        </div>
        <div class="bb-wheel-result"></div>
      </div>
    </div>`);
  const rot = v.querySelector('.bb-wheel-rot');
  const pointer = v.querySelector('.bb-pointer');
  const w = segs[winner];
  const target = w.a0 + (w.a1 - w.a0) * (0.2 + Math.random() * 0.6);
  const total_ = 360 * 5 + (360 - target);
  const T = 4800;
  return new Promise((resolve) => {
    const t0 = performance.now();
    let lastSeg = -1;
    let raf = 0;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / T);
      const e = 1 - (1 - k) ** 4;
      const ang = total_ * e;
      rot.setAttribute('transform', `rotate(${ang.toFixed(2)})`);
      const at = ((360 - (ang % 360)) + 360) % 360;
      const si = segs.findIndex((s) => at >= s.a0 && at < s.a1);
      if (si !== lastSeg) {
        if (lastSeg !== -1) {
          sfx.play('tick');
          pointer.classList.remove('flick');
          void pointer.getBoundingClientRect();
          pointer.classList.add('flick');
        }
        lastSeg = si;
      }
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        sfx.play('powerup');
        const res = v.querySelector('.bb-wheel-result');
        res.innerHTML = `<div class="bb-cat win" style="--c:${w.style.color};flex-direction:row;gap:24px;padding:24px 30px">
          <div class="bb-cat-emoji" style="margin:0;font-size:90px">${w.style.emoji}</div>
          <div class="bb-cat-name" style="margin:0;min-height:0;font-size:56px;text-align:left">${esc(w.name)}</div></div>`;
        res.classList.add('show');
        ui.burstAt(res, { count: 140 });
        resolve();
      }
    };
    raf = requestAnimationFrame(step);
    ui.onLeave(() => { cancelAnimationFrame(raf); resolve(); });
  });
}

// ------------------------------------------------------------------ question

function sizeClass(text) {
  const n = text.length;
  return n < 55 ? 's1' : n < 100 ? 's2' : n < 160 ? 's3' : 's4';
}
function ansClass(choices) {
  const n = Math.max(...choices.map((c) => c.length));
  return n <= 18 ? 'a1' : n <= 32 ? 'a2' : 'a3';
}

export function questionView(ui, { q, header, readMs }) {
  ui.theme(header.theme);
  ui.header(header);
  const cs = catStyle(q.category);
  const style = q.kind === 'tf' ? TF_STYLE : ANSWER_STYLE;
  const tiles = q.kind === 'num' ? `
      <div class="bb-numhint">Type your guess on your phone <span class="bb-keys"><i>1</i><i>2</i><i>3</i></span> closest wins!</div>` : `
      <div class="bb-answers ${q.kind === 'tf' ? 'tf' : ansClass(q.choices)}">
        ${q.choices.map((c, i) => `<div class="bb-ans" style="--c:${style[i].color};--d:${style[i].dark}">
          <div class="bb-ans-badge">${style[i].shape}</div>
          <div class="bb-ans-text">${esc(q.kind === 'tf' ? style[i].label : c)}</div>
          <div class="bb-ans-stat"><div class="bb-ans-avs"></div><div class="bb-ans-count">0</div></div>
        </div>`).join('')}
      </div>`;
  const v = ui.view(`
    <div class="bb-q reading">
      <div class="bb-ring"><svg viewBox="0 0 200 200"><circle class="bg" cx="100" cy="100" r="88"/><circle class="fg" cx="100" cy="100" r="88" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="0"/></svg><span></span></div>
      <div class="bb-qwrap">
        <div class="bb-qcat" style="--c:${cs.color}"><i>${cs.emoji}</i>${esc(q.category)}${q.difficulty ? `<span class="diff">${esc(q.difficulty)}</span>` : ''}</div>
        <div class="bb-qpanel ${sizeClass(q.text)}">${esc(q.text)}<div class="bb-readbar"><i></i></div></div>
      </div>
      ${tiles}
    </div>`);
  const qEl = v.querySelector('.bb-q');
  const bar = v.querySelector('.bb-readbar i');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = `transform ${readMs}ms linear`;
    bar.style.transform = 'scaleX(0)';
  }));
  sfx.play('whoosh');
  let iv = 0;
  ui.onLeave(() => clearInterval(iv));

  return {
    el: v,
    startAnswering(ms) {
      qEl.classList.remove('reading');
      v.querySelectorAll('.bb-ans').forEach((t, i) => { t.classList.add('anim-in'); t.style.animationDelay = `${0.1 + i * 0.08}s`; });
      sfx.play('go');
      const ring = v.querySelector('.bb-ring');
      const fg = ring.querySelector('.fg');
      const num = ring.querySelector('span');
      const t0 = performance.now();
      num.textContent = Math.ceil(ms / 1000);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fg.style.transition = `stroke-dashoffset ${ms}ms linear, stroke 0.3s`;
        fg.style.strokeDashoffset = RING_C.toFixed(1);
      }));
      let lastSec = Math.ceil(ms / 1000);
      iv = setInterval(() => {
        const left = Math.max(0, Math.ceil((ms - (performance.now() - t0)) / 1000));
        if (left !== lastSec) {
          lastSec = left;
          num.textContent = left;
          ring.classList.toggle('urgent', left <= 5);
          if (left <= 5 && left > 0) sfx.play(left <= 3 ? 'countdown' : 'tick');
        }
      }, 100);
    },
    stop(reason) {
      clearInterval(iv);
      const ring = v.querySelector('.bb-ring');
      const fg = ring.querySelector('.fg');
      fg.style.transition = 'none';
      fg.style.strokeDashoffset = getComputedStyle(fg).strokeDashoffset;
      ring.classList.add('done');
      const stamp = document.createElement('div');
      stamp.className = `bb-stamp ${reason === 'all' ? 'good' : ''}`;
      stamp.textContent = reason === 'all' ? 'ALL LOCKED IN!' : "TIME'S UP!";
      qEl.appendChild(stamp);
      sfx.play(reason === 'all' ? 'blip' : 'whoosh');
      later(() => stamp.remove(), 1200, ui);
    },
    /** stats: { counts[], pickers[[player]], correct, total, pctRight, fastest:{p, t}|null } */
    reveal({ counts, pickers, correct, answered, pctRight, fastest, eligible }) {
      qEl.classList.add('bb-reveal');
      const tiles = v.querySelectorAll('.bb-ans');
      tiles.forEach((t, i) => {
        t.classList.remove('anim-in');
        t.style.animationDelay = '';
        t.classList.add(i === correct ? 'right' : 'dim');
        t.style.setProperty('--pct', answered ? counts[i] / answered : 0);
        t.querySelector('.bb-ans-count').textContent = counts[i];
        const ps = pickers[i];
        t.querySelector('.bb-ans-avs').innerHTML = ps.slice(0, 5).map((p, k) => avatar(p, 'sm', `animation-delay:${(0.4 + k * 0.06).toFixed(2)}s`)).join('')
          + (ps.length > 5 ? `<span class="bb-more" style="margin-left:6px">+${ps.length - 5}</span>` : '');
        if (i === correct && q.kind !== 'tf') t.querySelector('.bb-ans-badge').textContent = '✔';
      });
      const right = tiles[correct];
      if (pctRight > 0) { sfx.play('correct'); later(() => ui.burstAt(right, { count: Math.round(60 + pctRight * 120) }), 250, ui); } else sfx.play('wrong');
      const info = document.createElement('div');
      info.className = 'bb-revealinfo';
      info.innerHTML = `<div>${pctRight > 0 ? '✅' : '😱'} <b>${Math.round(pctRight * 100)}%</b> got it right${eligible ? ` · ${answered}/${eligible} answered` : ''}</div>
        ${fastest ? `<div>⚡ Fastest: ${avatar(fastest.p, 'sm')} ${esc(fastest.p.name)} <b>${(fastest.t / 1000).toFixed(1)}s</b></div>` : ''}`;
      qEl.appendChild(info);
    },
  };
}

// ------------------------------------------------------------------ leaderboard

const ROW_H = 76;

/** entries: [{p, rec, oldIdx, newIdx, gain, oldScore, score, streak, lastOk}] (all players), stats for the pack panel. */
export function boardView(ui, { entries, header, title = 'Leaderboard', packStats }) {
  ui.header(header);
  const top = entries.filter((e) => e.newIdx < 10 || e.oldIdx < 10);
  const rest = entries.filter((e) => e.newIdx >= 10).sort((a, b) => a.newIdx - b.newIdx);
  const wide = entries.length > 10;
  const yFor = (idx) => (idx < 10 ? idx * ROW_H : 10 * ROW_H + 40);
  const v = ui.view(`
    <div class="bb-board ${wide ? 'wide' : ''}">
      <div class="bb-board-title"><div class="bb-h1">${esc(title)}</div></div>
      <div class="bb-rows">
        ${top.map((e) => `<div class="bb-row ${e.p.connected === false ? 'off' : ''}" data-id="${esc(e.p.id)}" style="--c:${e.p.color};transform:translateY(${yFor(e.oldIdx)}px);opacity:${e.oldIdx < 10 ? 1 : 0}">
          <div class="bb-row-rank">${e.oldRank}</div>
          ${avatar(e.p)}
          <div class="bb-row-name">${esc(e.p.name)}</div>
          <div class="bb-row-streak">${e.streak >= 2 ? `🔥${e.streak}` : ''}</div>
          <div class="bb-row-gain">${e.gain > 0 ? `+${fmtNum(e.gain)}` : ''}</div>
          <div class="bb-row-move"></div>
          <div class="bb-row-score">${fmtNum(e.oldScore)}</div>
        </div>`).join('')}
      </div>
      ${wide ? `<div class="bb-pack">
        <h3>The pack</h3><p>${rest.length} more player${rest.length === 1 ? '' : 's'} · ${packStats.okLabel}</p>
        <div class="bb-dots">${rest.slice(0, 260).map((e, i) => `<span class="bb-dot ${e.lastOk === true ? 'ok' : e.lastOk === false ? 'no' : ''}" style="--c:${e.p.color};animation-delay:${Math.min(1, i * 0.006).toFixed(3)}s" title="${esc(e.p.name)}"></span>`).join('')}</div>
        ${rest.length > 260 ? `<p style="margin-top:10px">+${rest.length - 260} more</p>` : ''}
        <div class="bb-pack-stat"><span><b>${packStats.pct}%</b>right</span><span><b>${fmtNum(packStats.avg)}</b>avg score</span></div>
      </div>` : ''}
    </div>`);
  const rows = new Map([...v.querySelectorAll('.bb-row')].map((r) => [r.dataset.id, r]));
  later(() => {
    let any = false;
    for (const e of top) {
      const g = rows.get(e.p.id)?.querySelector('.bb-row-gain');
      if (g && e.gain > 0 && e.oldIdx < 10) { g.classList.add('show'); any = true; }
    }
    if (any) sfx.play('coin');
  }, 450, ui);
  later(() => {
    sfx.play('whoosh');
    for (const e of top) {
      const r = rows.get(e.p.id);
      if (!r) continue;
      r.style.transform = `translateY(${yFor(e.newIdx)}px)`;
      r.style.opacity = e.newIdx < 10 ? 1 : 0;
      r.classList.toggle('lead', e.newIdx === 0 && e.score > 0);
      r.querySelector('.bb-row-rank').textContent = e.newRank;
      if (e.gain > 0) r.querySelector('.bb-row-gain').classList.add('show');
      const mv = r.querySelector('.bb-row-move');
      const d = e.oldIdx - e.newIdx;
      if (d !== 0 && e.oldIdx < entries.length) { mv.textContent = d > 0 ? `▲${d}` : `▼${-d}`; mv.className = `bb-row-move ${d > 0 ? 'up' : 'down'}`; }
      const stop = countUp(r.querySelector('.bb-row-score'), e.oldScore, e.score, 1100, fmtNum);
      ui.onLeave(stop);
    }
  }, 1300, ui);
  return { el: v };
}

// ------------------------------------------------------------------ closest number reveal

function niceStep(range) {
  const raw = range / 6;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

/** guesses: [{p, value, err, place, gain}] sorted by closeness. */
export function numberLineView(ui, { q, guesses, header, double }) {
  ui.header(header);
  const fmt = (n) => fmtNum(n, q.year);
  const ans = q.answer;
  const vals = guesses.map((g) => g.value).sort((a, b) => a - b);
  let lo;
  let hi;
  if (vals.length > 5) {
    lo = vals[Math.floor(vals.length * 0.1)];
    hi = vals[Math.ceil(vals.length * 0.9) - 1];
  } else if (vals.length) {
    lo = vals[0];
    hi = vals[vals.length - 1];
  } else {
    lo = ans;
    hi = ans;
  }
  lo = Math.min(lo, ans);
  hi = Math.max(hi, ans);
  // Keep the true answer from being squashed into a corner by a huge outlier range.
  let span = hi - lo;
  if (span === 0) span = Math.max(2, Math.abs(ans) * 0.2);
  lo -= span * 0.08;
  hi += span * 0.08;
  if (lo === hi) { lo -= 1; hi += 1; }
  if (vals.every((x) => x >= 0) && ans >= 0) lo = Math.max(lo, 0);
  const TW = 1600;
  const xOf = (val) => Math.max(0, Math.min(TW, ((val - lo) / (hi - lo)) * TW));
  const step = niceStep(hi - lo);
  const ticks = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);

  const cards = guesses.slice(0, 6);
  const others = guesses.slice(6);
  // Spread name cards apart (two lanes, min spacing) and connect each to its true spot on the track.
  const placed = cards.map((g) => ({ g, x: xOf(g.value) })).sort((a, b) => a.x - b.x || a.g.place - b.g.place);
  const GAP = 120;
  placed.forEach((c, i) => { c.dx = i === 0 ? c.x : Math.max(c.x, placed[i - 1].dx + GAP); c.lane = i % 2; });
  const overflow = (placed.at(-1)?.dx ?? 0) - TW;
  if (overflow > 0) placed.forEach((c) => { c.dx -= overflow; });
  for (let i = placed.length - 2; i >= 0; i--) placed[i].dx = Math.min(placed[i].dx, placed[i + 1].dx - GAP);
  placed.forEach((c) => { c.dx = Math.max(-60, c.dx); c.dy = 40 + c.lane * 150; });

  const v = ui.view(`
    <div class="bb-nl">
      <div class="bb-nl-q">${esc(q.text)}</div>
      <div class="bb-nl-answer"><div class="lbl">The answer is</div><div class="val">${fmt(ans)}${q.unit ? `<small>${esc(q.unit)}</small>` : ''}</div></div>
      <div class="bb-nl-track">
        <svg class="bb-nl-links" width="${TW}" height="340" viewBox="0 0 ${TW} 340">${placed.map((c, i) => `<line x1="${c.x}" y1="7" x2="${c.dx}" y2="${c.dy}" style="transition-delay:${(1.1 + i * 0.12).toFixed(2)}s"/>`).join('')}</svg>
        ${ticks.map((t) => `<div class="bb-nl-tick" style="left:${xOf(t)}px">${fmt(Math.round(t * 100) / 100 || 0)}</div>`).join('')}
        <div class="bb-nl-pin" style="left:${xOf(ans)}px"><b>🎯</b></div>
        ${[...others.slice(0, 250), ...placed.map((c) => c.g)].map((g, i) => `<div class="bb-nl-guess" data-x="${xOf(g.value)}" data-y="${-16 - (i % 4) * 14}" style="transform:translate(${TW / 2}px, 200px);transition-delay:${(0.3 + (i % 40) * 0.02).toFixed(2)}s"><span class="bb-dot" style="--c:${g.p.color}"></span></div>`).join('')}
        ${placed.map((c, i) => `<div class="bb-nl-guess" data-x="${c.dx}" data-y="${c.dy}" style="transform:translate(${TW / 2}px, 420px);transition-delay:${(0.2 + i * 0.12).toFixed(2)}s">
            <div class="bb-nl-card ${c.g.place === 1 ? 'win' : ''}">${avatar(c.g.p)}<div class="nm">${esc(c.g.p.name)}</div><div class="gv">${fmt(c.g.value)}</div></div>
          </div>`).join('')}
      </div>
      <div class="bb-nl-winner"></div>
    </div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    v.querySelectorAll('.bb-nl-guess').forEach((el) => { el.style.transform = `translate(${el.dataset.x}px, ${el.dataset.y}px)`; });
    v.querySelector('.bb-nl-links')?.classList.add('show');
  }));
  sfx.play('whoosh');
  const winners = guesses.filter((g) => g.place === 1);
  later(() => {
    const w = v.querySelector('.bb-nl-winner');
    if (!winners.length) w.innerHTML = 'Nobody guessed this time! 😶';
    else if (winners[0].err === 0) w.innerHTML = `🎯 <b>BULLSEYE!</b> ${winners.map((g) => esc(g.p.name)).join(' & ')} nailed it exactly! <b>+${fmtNum(winners[0].gain)}</b>`;
    else w.innerHTML = `🏆 ${winners.slice(0, 3).map((g) => `<b>${esc(g.p.name)}</b>`).join(' & ')}${winners.length > 3 ? ` +${winners.length - 3}` : ''} ${winners.length > 1 ? 'were' : 'was'} closest · off by ${fmt(winners[0].err)} · <b>+${fmtNum(winners[0].gain)}</b>${double ? ' (2×)' : ''}`;
    w.classList.add('show');
    if (winners.length) {
      sfx.play(winners[0].err === 0 ? 'win' : 'correct');
      ui.burstAt(v.querySelector('.bb-nl-card.win') || v.querySelector('.bb-nl-pin'), { count: 150 });
    } else sfx.play('wrong');
  }, 1900, ui);
  return { el: v };
}

// ------------------------------------------------------------------ final standings

export function finalView(ui, { ranked }) {
  ui.theme('final');
  ui.header({ show: false });
  const pods = ranked.slice(0, 3);
  const rest = ranked.slice(3, 10);
  const v = ui.view(`
    <div class="bb-final">
      <div class="bb-spot"></div>
      <div class="bb-final-title"><div class="bb-h1" style="font-size:100px">Final Standings</div></div>
      <div class="bb-drum">🥁 Drumroll…</div>
      <div class="bb-rest"></div>
      <div class="bb-podium">
        ${pods.map((e, i) => `<div class="bb-pod bb-pod-${i + 1}" style="--c:${e.p.color}">
          ${i === 0 ? '<div class="bb-crown">👑</div>' : ''}
          ${avatar(e.p)}
          <div class="bb-pod-name">${esc(e.p.name)}</div>
          <div class="bb-pod-score">${fmtNum(e.score)} pts</div>
          <div class="bb-pod-block">${i + 1}</div>
        </div>`).join('')}
      </div>
    </div>`);
  const restEl = v.querySelector('.bb-rest');
  const seq = [];
  let t = 700;
  [...rest].reverse().forEach((e) => {
    seq.push([t, () => {
      restEl.insertAdjacentHTML('afterbegin', `<div class="bb-row" style="--c:${e.p.color}"><div class="bb-row-rank">${e.rank}</div>${avatar(e.p)}<div class="bb-row-name">${esc(e.p.name)}</div><div class="bb-row-score">${fmtNum(e.score)}</div></div>`);
      sfx.play('tick');
    }]);
    t += 320;
  });
  const podEls = v.querySelectorAll('.bb-pod');
  if (podEls[2]) { t += 500; seq.push([t, () => { podEls[2].classList.add('show'); sfx.play('coin'); }]); }
  if (podEls[1]) { t += 1300; seq.push([t, () => { podEls[1].classList.add('show'); sfx.play('coin'); }]); }
  if (podEls[0]) {
    t += 1200;
    seq.push([t, () => { v.querySelector('.bb-drum').style.display = 'block'; }]);
    t += 1600;
    seq.push([t, () => {
      v.querySelector('.bb-drum').remove();
      podEls[0].classList.add('show');
      v.querySelector('.bb-spot').classList.add('on');
      sfx.play('win');
      ui.confetti.rain(260);
      later(() => ui.burstAt(podEls[0], { count: 160, power: 1.2 }), 400, ui);
    }]);
  }
  v.querySelector('.bb-drum').style.display = 'none';
  seq.forEach(([ms, fn]) => later(fn, ms, ui));
  return { duration: t + 4200 };
}
