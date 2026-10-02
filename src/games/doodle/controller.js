// Doodle Dash — phone controller. Fully driven by `view` messages from the TV (stateless-tolerant: on boot it
// sends `hello` and the TV replies with the current view, including the drawing so far for a returning artist).
import css from './controller.css?inline';
import { Surface, PALETTE, SIZES, ERASER, W, ASPECT, MAX_POINTS, packOps, unpackOps } from './draw-core.js';
import { makeAssembler, chunkedSend } from './net.js';
import { doodleSvg } from './fx.js';

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Gochi+Hand&display=swap';
const FLUSH_MS = 50; // stroke batches: 20 Hz
const DRAFT_MS = 4000; // Telephone drawings: backup to the TV every 4 s while changed
const DIFF = [
  { label: 'Easy', color: '#3cc47c' },
  { label: 'Medium', color: '#ff8a1f' },
  { label: 'Hard', color: '#ff5a4e' },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isLetter = (ch) => /[a-z0-9]/i.test(ch);

const ICONS = {
  eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 16.5 13.5 7a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8L12 19.5H7Z"/><path d="M9.5 11 15 16.5M7 19.5h13"/></svg>',
  fill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M5 11 11 5l7 7-6 6a1.5 1.5 0 0 1-2 0l-5-5a1.5 1.5 0 0 1 0-2Z"/><path d="M8 3l3 2M5 12h13"/><path d="M20 15.5c0 1.4-.9 2.5-1.5 2.5S17 16.9 17 15.5 18.5 12 18.5 12 20 14.1 20 15.5Z" fill="currentColor"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
};

export default async function start(ctx) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_URL;
  document.head.appendChild(link);

  const root = document.createElement('div');
  root.className = 'ddc';
  root.innerHTML = `<style>${css}</style>
    <div class="ddc-strip"><div class="ddc-status">Doodle Dash</div><div class="ddc-clock"></div><div class="ddc-score" hidden></div></div>
    <div class="ddc-bar off"><i></i></div>
    <div class="ddc-body"><div class="ddc-center"><div class="ddc-sub">Connecting to the TV…</div></div></div>
    <div class="ddc-toast"></div>`;
  ctx.container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const body = $('.ddc-body');
  const statusEl = $('.ddc-status');
  const clockEl = $('.ddc-clock');
  const scoreEl = $('.ddc-score');
  const barEl = $('.ddc-bar');
  const barFill = barEl.querySelector('i');
  const toastEl = $('.ddc-toast');

  const assemble = makeAssembler();
  const send = (d) => chunkedSend((x) => ctx.send(x), d);
  const buzz = (p) => { try { ctx.vibrate(p); } catch { /* optional */ } };

  let dead = false;
  let view = null; // last view object
  let key = '';
  let current = null; // { update(v), destroy(), onMsg?(m), timeUp?() }
  let deadline = 0;
  let total = 0;
  let toastT = 0;
  let raf = 0;
  let score = null;

  // ---------------------------------------------------------------- chrome

  function setStatus(text, hot = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('hot', hot);
  }

  function setScore(n) {
    if (typeof n !== 'number') return;
    score = n;
    scoreEl.hidden = false;
    scoreEl.textContent = `${n} pts`;
  }

  function setClock(endsIn, tot) {
    if (typeof endsIn !== 'number') { deadline = 0; barEl.classList.add('off'); clockEl.textContent = ''; return; }
    deadline = performance.now() + endsIn;
    total = tot || endsIn || 1;
    barEl.classList.remove('off');
  }

  function tickClock() {
    if (dead) return;
    raf = requestAnimationFrame(tickClock);
    if (!deadline) return;
    const left = Math.max(0, deadline - performance.now());
    barFill.style.width = `${Math.min(100, (left / total) * 100)}%`;
    const sec = Math.ceil(left / 1000);
    const low = sec <= 10;
    barEl.classList.toggle('low', low);
    clockEl.classList.toggle('low', low);
    clockEl.textContent = left > 0 ? `${sec}s` : '';
  }
  raf = requestAnimationFrame(tickClock);

  function toast(html, cls = '', ms = 1800) {
    toastEl.innerHTML = html;
    toastEl.className = `ddc-toast on ${cls}`;
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.className = 'ddc-toast'; }, ms);
  }

  function art(name, color = '#ff8a1f') {
    return `<div class="ddc-art">${doodleSvg(name || 'pencil', color, 5)}</div>`;
  }

  // ---------------------------------------------------------------- view switching

  function show(v) {
    if (!v || typeof v.kind !== 'string') return;
    view = v;
    if (typeof v.score === 'number') setScore(v.score);
    if (typeof v.total === 'number' && v.kind === 'reveal') setScore(v.total);
    if (v.key === key && current?.update) {
      current.update(v);
      return;
    }
    current?.destroy?.();
    current = null;
    key = v.key;
    body.innerHTML = '';
    const build = VIEWS[v.kind] || VIEWS.wait;
    current = build(v) || null;
  }

  // ---------------------------------------------------------------- views

  const VIEWS = {
    wait(v) {
      setStatus(v.statusText || 'Doodle Dash');
      setClock(null);
      const render = (x) => {
        body.innerHTML = `<div class="ddc-center">
          ${art(x.art, x.who?.color || '#ff8a1f')}
          <div class="ddc-title">${esc(x.title)}</div>
          ${x.who ? `<div class="ddc-who" style="--c:${esc(x.who.color)}"><i>${esc(x.who.avatar)}</i>${esc(x.who.name)}</div>` : ''}
          ${x.sub ? `<div class="ddc-sub">${esc(x.sub)}</div>` : ''}
        </div>`;
      };
      render(v);
      return { update: render };
    },

    mode(v) {
      setClock(v.endsIn, 30000);
      const render = (x) => {
        if (!x.admin) {
          setStatus('Picking a mode');
          body.innerHTML = `<div class="ddc-center">${art('question')}<div class="ddc-title">${esc(x.adminName)} is picking a mode</div><div class="ddc-sub">Watch the TV</div></div>`;
          return;
        }
        setStatus('Pick a mode', true);
        body.innerHTML = `<div class="ddc-pad">
          <div class="ddc-h">How do you want to play?</div>
          <div class="ddc-modes">
            <button class="ddc-mode ${x.rec === 'dg' ? 'rec' : ''}" data-mode="dg">${x.rec === 'dg' ? '<span class="tag">Recommended</span>' : ''}
              <h3>Draw &amp; Guess</h3><p>Take turns drawing a word while everyone races to guess it.</p><div class="n">Best with 3–12 players</div></button>
            <button class="ddc-mode ${x.rec === 'tp' ? 'rec' : ''}" data-mode="tp">${x.rec === 'tp' ? '<span class="tag">Recommended</span>' : ''}
              <h3>Telephone</h3><p>Write, draw and describe all at once, then watch the chains go wrong.</p><div class="n">Great for big groups</div></button>
          </div></div>`;
        body.querySelectorAll('.ddc-mode').forEach((b) => b.addEventListener('click', () => {
          buzz('select');
          send({ type: 'mode', mode: b.dataset.mode });
          b.style.outline = '4px solid #ff8a1f';
        }));
      };
      render(v);
      return { update: (x) => { setClock(x.endsIn, 30000); render(x); } };
    },

    howto(v) {
      setStatus('How to play');
      setClock(null);
      body.innerHTML = `<div class="ddc-pad" style="flex:1">
          <div class="ddc-h">${v.mode === 'tp' ? 'Telephone' : 'Draw &amp; Guess'}</div>
          <div class="ddc-steps">${(v.steps || []).map(([t, d], i) => `<div class="ddc-step"><span class="n">${i + 1}</span><div><b>${esc(t)}</b><span>${esc(d)}</span></div></div>`).join('')}</div>
        </div>
        <div class="ddc-foot">${v.admin ? '<button class="ddc-btn go" data-go>Let\'s go</button>' : '<div class="ddc-sub" style="margin:0 auto 10px">Starting in a moment…</div>'}</div>`;
      body.querySelector('[data-go]')?.addEventListener('click', (e) => {
        buzz('select');
        send({ type: 'skip' });
        e.currentTarget.disabled = true;
      });
      return {};
    },

    choose(v) {
      setStatus('Your turn to draw!', true);
      setClock(v.endsIn, v.endsIn);
      buzz('turn');
      body.innerHTML = `<div class="ddc-words"><div class="ddc-prompt" style="margin-bottom:6px"><div class="w">Pick a word to draw</div><small>Harder words score more</small></div>${v.words.map((c, i) => `
          <button class="ddc-word" data-i="${i}" style="--d:${DIFF[c.d]?.color || '#888'}"><span class="w">${esc(c.w)}</span><span class="d">${DIFF[c.d]?.label || ''}<small>×${c.mult} pts</small></span></button>`).join('')}</div>`;
      let picked = false;
      body.querySelectorAll('.ddc-word').forEach((b) => b.addEventListener('click', () => {
        if (picked) return;
        picked = true;
        buzz('select');
        b.classList.add('picked');
        send({ type: 'pick', turn: v.turn, i: Number(b.dataset.i) });
      }));
      return {};
    },

    draw(v) {
      setStatus('You\'re drawing', true);
      setClock(v.endsIn, v.total);
      const pad = drawPad({
        promptLabel: 'Draw this. No letters!',
        prompt: v.word,
        live: (actions) => send({ type: 'draw', turn: v.turn, a: actions }),
        restore: v.restore,
      });
      return {
        update(x) {
          setClock(x.endsIn, x.total);
          if (x.restore && pad.surface.isBlank()) pad.load(x.restore);
        },
        onMsg(m) {
          if (m.type === 'gotit') toast(`${esc(m.name)} got it! +${m.pts}`, 'good');
        },
        destroy: () => pad.destroy(),
      };
    },

    guess(v) {
      setClock(v.endsIn, v.total);
      body.innerHTML = `<div class="ddc-guess">
        <div class="ddc-hintbox">
          <div class="who-line"><span class="ddc-who" style="--c:${esc(v.artist.color)}"><i>${esc(v.artist.avatar)}</i>${esc(v.artist.name)}</span> is drawing</div>
          <div class="ddc-mask"></div><div class="ddc-len"></div>
        </div>
        <div class="ddc-main"></div>
      </div>`;
      const maskEl = body.querySelector('.ddc-mask');
      const lenEl = body.querySelector('.ddc-len');
      const main = body.querySelector('.ddc-main');
      main.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
      const hist = [];
      let mode = null;
      let input = null;
      const renderMask = (mask) => {
        maskEl.classList.toggle('long', mask.length > 11);
        maskEl.innerHTML = [...mask].map((ch) => {
          if (ch === ' ') return '<span class="sp"></span>';
          if (ch === '_') return '<span class="ch"></span>';
          if (!isLetter(ch)) return `<span class="pn">${esc(ch)}</span>`;
          return `<span class="ch on">${esc(ch)}</span>`;
        }).join('');
      };
      const renderHist = () => {
        const h = main.querySelector('.ddc-hist');
        if (!h) return;
        h.innerHTML = hist.length
          ? hist.slice(-7).map((x) => `<div class="h ${x.r === 'close' ? 'close' : ''}">${esc(x.text)}</div>`).join('')
          : '<div class="empty">Watch the TV and type what you think it is. Guess as often as you like!</div>';
      };
      const renderMain = (x) => {
        const want = x.guessed ? 'got' : 'input';
        if (want === mode) return;
        mode = want;
        if (want === 'got') {
          setStatus('You got it!', true);
          main.innerHTML = `<div class="ddc-got">${art('check', '#3cc47c')}<div class="big">Got it!</div>
            <div class="word">${esc(x.word || '')}</div><div class="pts">+${x.pts}</div><div class="ddc-sub">Sit back while the others guess</div></div>`;
          input = null;
          return;
        }
        setStatus('Guess!', true);
        main.innerHTML = `<div class="ddc-hist"></div>
          <form class="ddc-input"><input type="text" maxlength="40" placeholder="Type a guess…" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="send"><button type="submit">Guess</button></form>`;
        input = main.querySelector('input');
        main.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          const text = input.value.trim();
          if (!text) return;
          send({ type: 'guess', text });
          hist.push({ text, r: 'pending' });
          input.value = '';
          input.focus();
          renderHist();
        });
        renderHist();
      };
      const update = (x) => {
        setClock(x.endsIn, x.total);
        renderMask(x.guessed && x.word ? x.word.toLowerCase() : x.mask);
        lenEl.textContent = x.len ? `${x.len} letters` : '';
        renderMain(x);
      };
      update(v);
      return {
        update,
        onMsg(m) {
          if (m.type !== 'result') return;
          if (m.r === 'close') {
            for (let i = hist.length - 1; i >= 0; i--) if (hist[i].text === m.text) { hist[i].r = 'close'; break; }
            renderHist();
            toast('So close!', 'warm');
          } else if (m.r === 'correct') {
            toast(`Correct! +${m.pts}`, 'good');
          }
        },
      };
    },

    reveal(v) {
      setStatus('Round over');
      setClock(null);
      const gainLine = v.wasArtist
        ? (v.gained ? `<div class="gain">+${v.gained}</div><div class="ddc-sub">for your drawing</div>` : '<div class="gain zero">Nobody guessed your drawing</div>')
        : (v.gained ? `<div class="gain">+${v.gained}</div>` : '<div class="gain zero">No points this time</div>');
      body.innerHTML = `<div class="ddc-center ddc-reveal">
        <div class="lbl">The word was</div><div class="word">${esc(v.word)}</div>
        ${gainLine}
        <div class="tot">Total <b>${v.total}</b> · <b>#${v.rank}</b> of ${v.of}</div>
      </div>`;
      return {};
    },

    'tp-write': (v) => tpText(v, 'write'),
    'tp-describe': (v) => tpText(v, 'describe'),

    'tp-draw': (v) => {
      setClock(v.endsIn, v.total);
      let done = v.done;
      let dirty = false;
      let lastDraft = 0;
      const pad = drawPad({
        promptLabel: 'Draw this. No letters!',
        prompt: v.prompt,
        restore: v.restore,
        onChange: () => { dirty = true; },
        footer: '<button class="ddc-btn go" data-done>Done</button>',
      });
      const doneBtn = pad.el.querySelector('[data-done]');
      const submit = (final = true) => {
        send({ type: final ? 'submit' : 'draft', step: v.step, ops: packOps(pad.surface.ops) });
        dirty = false;
        lastDraft = Date.now();
      };
      const status = (x) => setStatus(done ? 'Waiting for others' : `Step ${x.step + 1} of ${x.steps} · Draw`, !done);
      let shown = null;
      const renderDone = (x) => {
        status(x);
        if (shown !== done) {
          shown = done;
          pad.cover(done ? `<div class="ddc-title">Sent!</div><div class="ddc-count">${x.doneCount} / ${x.of} done</div>
            <button class="ddc-btn ghost" data-edit>Keep drawing</button>` : null);
          pad.cover.el?.querySelector('[data-edit]')?.addEventListener('click', () => { buzz('tap'); send({ type: 'unsubmit', step: x.step }); });
          doneBtn.hidden = done;
        } else if (done) {
          const c = pad.cover.el?.querySelector('.ddc-count');
          if (c) c.textContent = `${x.doneCount} / ${x.of} done`;
        }
      };
      doneBtn.addEventListener('click', () => {
        if (pad.surface.isBlank()) { toast('Draw something first!', 'warm'); return; }
        buzz('success');
        submit(true);
      });
      const draftTimer = setInterval(() => { if (dirty && !done && Date.now() - lastDraft > DRAFT_MS) submit(false); }, 1000);
      renderDone(v);
      return {
        update(x) {
          setClock(x.endsIn, x.total);
          if (x.restore && pad.surface.isBlank()) pad.load(x.restore);
          if (x.done !== done) { done = x.done; }
          renderDone(x);
        },
        onMsg(m) {
          if (m.type === 'progress') { const c = pad.cover.el?.querySelector('.ddc-count'); if (c) c.textContent = `${m.doneCount} / ${m.of} done`; }
        },
        timeUp() { if (!done) submit(true); },
        destroy() {
          clearInterval(draftTimer);
          if (!done && dirty) submit(false);
          pad.destroy();
        },
      };
    },

    'tp-play': (v) => {
      setClock(null);
      const render = (x) => {
        setStatus('Showtime');
        let main;
        if (!x.what) {
          main = `${art('eye')}<div class="ddc-title">Watch the TV</div>`;
        } else if (x.own) {
          main = `${art('star', '#ffd84a')}<div class="ddc-title">That's yours!</div><div class="ddc-sub">See if people vote for it</div>`;
        } else {
          main = `<button class="ddc-vote ${x.voted ? 'voted' : ''}" data-vote ${x.voted ? 'disabled' : ''}>
            <div class="heart">${doodleSvg('heart', '#ff5a4e', x.voted ? 9 : 6)}</div>
            <b>${x.voted ? 'Voted!' : `Love this ${x.what === 'drawing' ? 'drawing' : 'caption'}`}</b></button>`;
        }
        body.innerHTML = `<div class="ddc-center" style="gap:14px">${main}
          ${typeof x.votes === 'number' ? `<div class="ddc-sub">Your votes so far: <b style="color:#f4f1ea">${x.votes}</b></div>` : ''}</div>
          ${x.admin ? `<div class="ddc-foot"><div class="ddc-admin">
            <button class="ddc-btn go wide" data-nav="next">Next</button>
            <button class="ddc-btn ghost" data-nav="skip">Skip chain</button>
            <button class="ddc-btn ghost" data-nav="end">End show</button></div></div>` : ''}`;
        body.querySelector('[data-vote]')?.addEventListener('click', () => {
          buzz('select');
          send({ type: 'react', e: '❤️' });
        });
        body.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
          buzz('tap');
          send({ type: 'nav', a: b.dataset.nav });
        }));
      };
      render(v);
      return { update: render };
    },
  };

  // Telephone write / describe step.
  function tpText(v, kind) {
    setClock(v.endsIn, v.total);
    let done = v.done;
    let draftT = 0;
    let ideaAt = 0;
    body.innerHTML = `<div class="ddc-tp"></div><div class="ddc-foot"></div>`;
    const wrap = body.querySelector('.ddc-tp');
    const foot = body.querySelector('.ddc-foot');
    const drawing = kind === 'describe' ? unpackOps(v.drawing) : null;
    wrap.innerHTML = kind === 'write'
      ? `<div class="ddc-h">Write something to draw</div>
         <textarea class="ddc-textarea" maxlength="80" placeholder="e.g. a shark at a birthday party" autocapitalize="sentences" enterkeyhint="done"></textarea>
         <div class="ddc-ideas"><div class="lbl">Need an idea? Tap one <button type="button" data-more>More ideas</button></div><div class="list"></div></div>`
      : `<div class="ddc-h">What is this?</div>
         <div class="ddc-pic"><div class="ddc-sheet"><canvas></canvas>${v.blank ? '<div class="ddc-blank">They left it blank. Make something up!</div>' : ''}</div></div>
         <textarea class="ddc-textarea" maxlength="80" placeholder="Describe the drawing…" autocapitalize="sentences" enterkeyhint="done" style="height:64px"></textarea>`;
    const ta = wrap.querySelector('textarea');
    ta.value = v.draft || '';
    foot.innerHTML = '<button class="ddc-btn go" data-send>Send</button>';
    const sendBtn = foot.querySelector('[data-send]');

    let ro = null;
    if (drawing) {
      const holder = wrap.querySelector('.ddc-pic');
      const sheet = holder.querySelector('.ddc-sheet');
      const surf = new Surface(sheet.querySelector('canvas'));
      surf.load(drawing);
      const fit = () => fitAspect(sheet, holder);
      ro = new ResizeObserver(fit);
      ro.observe(holder);
      fit();
    }
    const renderIdeas = () => {
      const list = wrap.querySelector('.ddc-ideas .list');
      if (!list) return;
      const ideas = v.ideas || [];
      const pick = [0, 1, 2].map((k) => ideas[(ideaAt + k) % Math.max(1, ideas.length)]).filter(Boolean);
      list.innerHTML = pick.map((t) => `<button class="ddc-idea" type="button">${esc(t)}</button>`).join('');
      list.querySelectorAll('.ddc-idea').forEach((b) => b.addEventListener('click', () => {
        buzz('tap');
        ta.value = b.textContent;
        queueDraft();
      }));
    };
    wrap.querySelector('[data-more]')?.addEventListener('click', () => { buzz('tap'); ideaAt += 3; renderIdeas(); });
    renderIdeas();

    const queueDraft = () => {
      clearTimeout(draftT);
      draftT = setTimeout(() => send({ type: 'draft', step: v.step, text: ta.value }), 700);
    };
    ta.addEventListener('input', queueDraft);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); } });
    sendBtn.addEventListener('click', () => {
      const text = ta.value.trim();
      if (!text) { toast(kind === 'write' ? 'Write something first!' : 'Describe it first!', 'warm'); return; }
      buzz('success');
      ta.blur();
      send({ type: 'submit', step: v.step, text });
    });

    const renderDone = (x) => {
      setStatus(done ? 'Waiting for others' : `Step ${x.step + 1} of ${x.steps} · ${kind === 'write' ? 'Write' : 'Describe'}`, !done);
      let panel = body.querySelector('.ddc-done');
      if (done) {
        wrap.hidden = true;
        foot.hidden = true;
        if (panel) {
          const c = panel.querySelector('.ddc-count');
          if (c) c.textContent = `${x.doneCount} / ${x.of} done`;
          return;
        }
        panel = document.createElement('div');
        panel.className = 'ddc-done';
        body.appendChild(panel);
        panel.innerHTML = `${art('check', '#3cc47c')}<div class="ddc-title">Sent!</div><div class="ddc-sub">“${esc(ta.value.trim() || '…')}”</div>
          <div class="ddc-count">${x.doneCount} / ${x.of} done</div><button class="ddc-btn ghost" data-edit>Edit</button>`;
        panel.querySelector('[data-edit]').addEventListener('click', () => { buzz('tap'); send({ type: 'unsubmit', step: x.step }); });
      } else {
        panel?.remove();
        wrap.hidden = false;
        foot.hidden = false;
      }
    };
    renderDone(v);
    return {
      update(x) {
        setClock(x.endsIn, x.total);
        done = x.done;
        renderDone(x);
      },
      onMsg(m) {
        if (m.type === 'progress') { const c = body.querySelector('.ddc-count'); if (c) c.textContent = `${m.doneCount} / ${m.of} done`; }
      },
      timeUp() { if (!done) send({ type: 'submit', step: v.step, text: ta.value.trim() }); },
      destroy() { clearTimeout(draftT); ro?.disconnect(); },
    };
  }

  // ---------------------------------------------------------------- drawing pad

  function fitAspect(box, holder) {
    const aw = Math.max(40, holder.clientWidth - 24);
    const ah = Math.max(40, holder.clientHeight - 4);
    let w = aw;
    let h = w / ASPECT;
    if (h > ah) { h = ah; w = h * ASPECT; }
    box.style.width = `${Math.floor(w)}px`;
    box.style.height = `${Math.floor(h)}px`;
  }

  function drawPad({ promptLabel, prompt, live, restore, onChange, footer = '' }) {
    const el = document.createElement('div');
    el.className = 'ddc-draw';
    el.innerHTML = `
      <div class="ddc-prompt"><small>${esc(promptLabel)}</small><div class="w ${String(prompt).length > 22 ? 'long' : ''}">${esc(prompt)}</div></div>
      <div class="ddc-canvas-wrap"><div class="ddc-sheet"><canvas></canvas></div></div>
      <div class="ddc-tools">
        <div class="ddc-pal">${PALETTE.map((c, i) => `<button class="ddc-sw ${i === 0 ? 'on' : ''}" data-c="${i}" style="--c:${c}" aria-label="colour"></button>`).join('')}</div>
        <div class="ddc-row">
          ${SIZES.map((s, i) => `<button class="ddc-tool size ${i === 1 ? 'on' : ''}" data-s="${i}" aria-label="brush"><i class="dot" style="width:${[7, 13, 22][i]}px;height:${[7, 13, 22][i]}px"></i></button>`).join('')}
          <button class="ddc-tool" data-t="eraser" aria-label="eraser">${ICONS.eraser}</button>
          <button class="ddc-tool" data-t="fill" aria-label="fill">${ICONS.fill}</button>
          <button class="ddc-tool" data-a="undo" aria-label="undo">${ICONS.undo}</button>
          <button class="ddc-tool" data-a="clear" aria-label="clear">${ICONS.clear}</button>
        </div>
        ${footer}
      </div>`;
    body.appendChild(el);
    const holder = el.querySelector('.ddc-canvas-wrap');
    const sheet = el.querySelector('.ddc-sheet');
    const canvas = el.querySelector('canvas');
    const surface = new Surface(canvas);
    const fit = () => fitAspect(sheet, holder);
    const ro = new ResizeObserver(fit);
    ro.observe(holder);
    fit();

    let color = 0;
    let size = 1;
    let tool = 'pen'; // pen | eraser | fill
    let pointer = null;
    let last = null;
    let pending = [];
    let fullWarned = false;
    let clearArmed = 0;

    const queue = (a) => {
      if (!live) return;
      if (a[0] === 'p') {
        const tail = pending[pending.length - 1];
        if (tail && tail[0] === 'p' && tail.length < 400) { tail.push(a[1], a[2]); return; }
      }
      pending.push(a);
    };
    const flush = () => {
      if (!pending.length || !live) return;
      const batch = pending;
      pending = [];
      live(batch);
    };
    const flushTimer = live ? setInterval(flush, FLUSH_MS) : 0;

    const toCanvas = (e) => {
      const p = ctx.kit.localPoint(canvas, e);
      const k = W / Math.max(1, canvas.clientWidth);
      return [Math.round(p.x * k), Math.round(p.y * k)];
    };
    const setTool = (t) => {
      tool = t;
      el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tool));
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (pointer !== null || el.classList.contains('locked')) return;
      e.preventDefault();
      const [x, y] = toCanvas(e);
      if (tool === 'fill') {
        surface.fill(color, x, y);
        queue(['f', color, x, y]);
        buzz('tap');
        onChange?.();
        return;
      }
      if (surface.points >= MAX_POINTS) {
        if (!fullWarned) { toast('This page is full!', 'warm'); fullWarned = true; }
        return;
      }
      pointer = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      const c = tool === 'eraser' ? ERASER : color;
      surface.begin(c, size, x, y);
      queue(['b', c, size, x, y]);
      last = [x, y];
    });
    const move = (e) => {
      if (e.pointerId !== pointer) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const [x, y] = toCanvas(ev);
        if (Math.hypot(x - last[0], y - last[1]) < 4) continue;
        if (surface.points >= MAX_POINTS) break;
        if (surface.add(x, y)) { queue(['p', x, y]); last = [x, y]; }
      }
    };
    const up = (e) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      const [x, y] = toCanvas(e);
      if (last && (x !== last[0] || y !== last[1]) && Math.hypot(x - last[0], y - last[1]) >= 1 && surface.add(x, y)) queue(['p', x, y]);
      surface.end();
      queue(['e']);
      onChange?.();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      color = Number(b.dataset.c);
      el.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b));
      if (tool === 'eraser') setTool('pen');
      buzz('tick');
    }));
    el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
      size = Number(b.dataset.s);
      el.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b));
      if (tool === 'fill') setTool('pen');
      buzz('tick');
    }));
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
      setTool(tool === b.dataset.t ? 'pen' : b.dataset.t);
      buzz('tick');
    }));
    const clearBtn = el.querySelector('[data-a="clear"]');
    el.querySelector('[data-a="undo"]').addEventListener('click', () => {
      if (pointer !== null) return;
      surface.undo();
      queue(['u']);
      buzz('tick');
      onChange?.();
    });
    clearBtn.addEventListener('click', () => {
      if (Date.now() - clearArmed > 2500) {
        clearArmed = Date.now();
        clearBtn.classList.add('warn');
        clearBtn.textContent = 'Sure?';
        setTimeout(() => { if (Date.now() - clearArmed >= 2400) { clearBtn.classList.remove('warn'); clearBtn.innerHTML = ICONS.clear; } }, 2500);
        buzz('tick');
        return;
      }
      clearArmed = 0;
      clearBtn.classList.remove('warn');
      clearBtn.innerHTML = ICONS.clear;
      surface.clear();
      queue(['x']);
      fullWarned = false;
      buzz('bump');
      onChange?.();
    });

    const load = (packed) => {
      surface.load(unpackOps(packed));
    };
    if (restore) load(restore);

    const cover = (html) => {
      cover.el?.remove();
      cover.el = null;
      el.classList.toggle('locked', !!html);
      if (!html) return;
      cover.el = document.createElement('div');
      cover.el.className = 'cover';
      cover.el.innerHTML = html;
      sheet.appendChild(cover.el);
    };

    return {
      el,
      surface,
      load,
      cover,
      destroy() {
        flush();
        clearInterval(flushTimer);
        ro.disconnect();
      },
    };
  }

  // ---------------------------------------------------------------- messages

  ctx.onMessage((raw) => {
    if (dead) return;
    const m = assemble('tv', raw);
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'view') { show(m.v); return; }
    if (m.type === 'timeUp') { current?.timeUp?.(); return; }
    current?.onMsg?.(m);
  });

  send({ type: 'hello' });
  // in case the hello raced the TV's game boot, ask again until a view arrives
  let helloTries = 0;
  const helloTimer = setInterval(() => {
    if (view || ++helloTries > 10) { clearInterval(helloTimer); return; }
    send({ type: 'hello' });
  }, 1200);

  return {
    destroy() {
      dead = true;
      clearInterval(helloTimer);
      cancelAnimationFrame(raf);
      clearTimeout(toastT);
      current?.destroy?.();
      root.remove();
      link.remove();
    },
  };
}
