// Word Bomb — screen (TV). Authoritative game state, dictionary validation, 2D canvas + DOM presentation.
import { countdown, escapeHtml } from '../../sdk/screen-kit.js';
import { sfx } from '../../sdk/audio.js';
import { FX, drawBackdrop } from './render.js';
import { computeLayout } from './layout.js';
import { createAudio } from './audio.js';
import { SCREEN_CSS } from './screen-style.js';
import { isOffensive, displayWord } from './blocklist.js';
import { BONUS_LETTERS, BONUS_EXCLUDE, MAX_HEARTS, startHearts, HEART_SVG, highlight, initials, onColorRgb } from './common.js';

const MIN_TURN_MS = 8000; // a player always gets at least this long after receiving the bomb (early game)
const MIN_TURN_LATE_MS = 5500; // ...easing down to this as the game heats up
const LONELY_MS = 15000; // multiplayer game with only one connected survivor ends after this
const PAUSE_MS = 30000; // nobody connected to play: give up after this
const FORFEIT_MS = 30000; // a player gone this long mid-game is out (so they can't 'survive' while away)
// ?wbfast=1 on screen.html: short fuses + a state peek for automated tests (scripts/word-bomb-test.mjs)
const FAST = /[?&]wbfast=1/.test(location.search);
const rand = (a, b) => a + Math.random() * (b - a);
const LEVELS = ['Warm-up', 'Medium', 'Hard', 'Brutal'];
// prompt tier odds [easy, medium, hard] per level
const TIER_ODDS = [[0.9, 0.1, 0], [0.5, 0.45, 0.05], [0.25, 0.5, 0.25], [0.1, 0.4, 0.5]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export default async function start(ctx) {
  // ------------------------------------------------------------ assets
  const [wordsText, prompts] = await Promise.all([
    fetch(ctx.asset('words.txt')).then((r) => { if (!r.ok) throw new Error('dictionary missing'); return r.text(); }),
    fetch(ctx.asset('prompts.json')).then((r) => r.json()),
  ]);
  const wordList = wordsText.split('\n').filter(Boolean);
  const dict = new Set(wordList);

  // ------------------------------------------------------------ DOM
  const root = el('div', 'wb-root', ctx.container);
  el('style', '', root, SCREEN_CSS);
  const shakeEl = el('div', 'wb-shake', root);
  const bgCanvas = el('canvas', '', shakeEl);
  const floaters = el('div', 'wb-floaters', shakeEl);
  const seatsEl = el('div', 'wb-seats', shakeEl);
  const fxCanvas = el('canvas', '', shakeEl);
  const promptEl = el('div', 'wb-prompt', shakeEl);
  const pillEl = el('div', 'wb-pill hidden', shakeEl);
  const hintEl = el('div', 'wb-hint', shakeEl);
  el('div', 'wb-logo', root, `<div class="t">Word Bomb</div><div class="s" id="wb-sub"></div>`);
  const subEl = root.querySelector('#wb-sub');
  const feedEl = el('div', 'wb-feed', root);
  const statusEl = el('div', 'wb-status', root);
  const specsEl = el('div', 'wb-specs', root);
  const fx = new FX(fxCanvas);
  const audio = createAudio();

  // ------------------------------------------------------------ state
  /** @type {Map<string, any>} */
  const roster = new Map();
  let order = [];
  const spectators = new Map();
  let phase = 'intro'; // intro | play | boom | over
  let practice = false;
  let holder = null;
  let prompt = '';
  let turnId = 0;
  let turnCount = 0;
  let progress = 0; // rounds played: +1/alive per new prompt
  let explosions = 0;
  let elimCounter = 0;
  let heartsAtStart = 2;
  let totalHearts = 1;
  let used = new Set();
  let recentPrompts = [];
  let typing = '';
  let pillErr = ''; // last rejection reason, shown inside the typing box until the text changes
  let fuseStart = 0;
  let fuseEnd = 0;
  let fuseVisMax = 1;
  let nextTickAt = 0;
  let paused = false;
  let pauseRemaining = 0;
  let pauseSince = 0;
  let pauseElapsed = 0;
  let loneSince = 0;
  let lastSubmit = new Map();
  let lastKeySound = 0;
  let shake = 0;
  let gen = 0; // bumps on restart/destroy to cancel pending async steps
  let destroyed = false;
  let testFreeze = false; // ?wbfast=1 only: hold the fuse while a test types
  let layout = null;
  let waitOverlay = null;
  const timers = new Set();
  const later = (fn, ms) => {
    const g = gen;
    const id = setTimeout(() => { timers.delete(id); if (g === gen && !destroyed) fn(); }, ms);
    timers.add(id);
    return id;
  };
  const wait = (ms) => new Promise((res) => later(res, ms));

  // ------------------------------------------------------------ roster
  function makeEntry(p) {
    return { id: p.id, player: p, hearts: heartsAtStart, alive: true, connected: p.connected !== false, dcSince: 0, forfeit: false, letters: new Set(), words: [], longest: '', elimOrder: 0, el: null };
  }

  function resetGame() {
    gen++;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    audio.stopHiss();
    roster.clear();
    spectators.clear();
    const ps = ctx.players();
    heartsAtStart = startHearts(ps.length);
    for (const p of ps) roster.set(p.id, makeEntry(p));
    order = ps.map((p) => p.id);
    practice = order.length === 1;
    totalHearts = Math.max(1, order.length * heartsAtStart);
    phase = 'intro';
    holder = null;
    prompt = '';
    typing = '';
    turnCount = 0;
    progress = 0;
    explosions = 0;
    elimCounter = 0;
    used = new Set();
    paused = false;
    loneSince = 0;
    fx.bomb.visible = false;
    fx.bomb.target = null;
    feedEl.innerHTML = '';
    floaters.innerHTML = '';
    promptEl.innerHTML = '';
    hintEl.innerHTML = '';
    pillEl.classList.add('hidden');
    hideWait();
    buildSeats();
    relayout();
    renderHud();
  }

  const round = () => Math.floor(progress);
  const level = () => (progress < 2 ? 0 : progress < 5 ? 1 : progress < 9 ? 2 : 3);
  const aliveList = () => order.map((id) => roster.get(id)).filter((r) => r.alive);
  const connectedAlive = () => aliveList().filter((r) => r.connected);

  function nextAlive(from) {
    const n = order.length;
    const idx = Math.max(0, order.indexOf(from));
    for (let i = 1; i <= n; i++) {
      const r = roster.get(order[(idx + i) % n]);
      if (r.alive && r.connected) return r.id;
    }
    return null;
  }

  // ------------------------------------------------------------ layout
  function relayout() {
    const W = root.clientWidth || 1280;
    const H = root.clientHeight || 720;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    layout = computeLayout(W, H, Math.max(1, order.length));
    root.classList.toggle('wb-many', order.length > 14);
    drawBackdrop(bgCanvas, W, H, dpr, layout);
    fx.resize(W, H, dpr);
    const { bomb, A } = layout;
    Object.assign(fx.bomb, { x: bomb.x, y: bomb.y, R: bomb.R });
    order.forEach((id, i) => {
      const r = roster.get(id);
      const s = layout.seats[i];
      r.pos = s;
      r.el.style.left = `${s.x}px`;
      r.el.style.top = `${s.y}px`;
      r.el.style.setProperty('--s', `${A}px`);
      const bub = r.el.querySelector('.wb-bubble');
      bub.classList.toggle('above', s.y > layout.cy);
      bub.classList.toggle('below', s.y <= layout.cy);
    });
    promptEl.style.left = `${bomb.x}px`;
    promptEl.style.top = `${bomb.y + bomb.R * 0.06}px`;
    fitPrompt();
    const pillTop = bomb.y + bomb.R * 1.28;
    pillEl.style.left = `${bomb.x}px`;
    pillEl.style.top = `${pillTop}px`;
    pillEl.style.fontSize = `${Math.max(16, bomb.R * 0.4)}px`;
    hintEl.style.left = `${bomb.x}px`;
    hintEl.style.top = `${pillTop + Math.max(16, bomb.R * 0.4) * 0.3}px`; // only shown while the typing box is hidden
    hintEl.style.fontSize = `${Math.max(14, bomb.R * 0.26)}px`;
    pointAt(holder, true);
  }

  const ro = new ResizeObserver(() => relayout());
  ro.observe(root);

  // ------------------------------------------------------------ rendering: seats & HUD
  function buildSeats() {
    seatsEl.innerHTML = '';
    for (const id of order) {
      const r = roster.get(id);
      const p = r.player;
      r.el = el('div', 'wb-seat', seatsEl, `
        <div class="wb-av"><div class="wb-ring"></div><span class="wb-ini">${escapeHtml(initials(p.name))}</span><span class="wb-tag out">OUT</span><span class="wb-tag off">AWAY</span></div>
        <div class="wb-name">${escapeHtml(p.name)}</div>
        <div class="wb-hearts"></div>
        <div class="wb-prog"><i></i></div>
        <div class="wb-bubble"></div>`);
      r.el.style.setProperty('--c', p.color);
      r.el.style.setProperty('--on', onColor(p.color));
      r.heartsShown = null;
      renderSeat(r);
    }
  }

  function renderSeat(r, fxKind) {
    if (!r.el) return;
    r.el.classList.toggle('turn', r.id === holder && (phase === 'play' || phase === 'boom'));
    r.el.classList.toggle('dead', !r.alive);
    r.el.classList.toggle('dc', !r.connected && r.alive);
    const slots = Math.max(heartsAtStart, r.hearts);
    const hEl = r.el.querySelector('.wb-hearts');
    const key = `${r.hearts}/${slots}`;
    if (r.heartsShown !== key || fxKind) {
      let html = '';
      for (let i = 0; i < slots; i++) {
        const full = i < r.hearts;
        const cls = full ? (fxKind === 'gain' && i === r.hearts - 1 ? 'full gained' : 'full') : 'empty';
        html += HEART_SVG.replace('<svg', `<svg class="${cls}"`);
      }
      if (fxKind === 'lose') html += HEART_SVG.replace('<svg', '<svg class="full lost" style="position:absolute"');
      hEl.style.position = 'relative';
      hEl.innerHTML = html;
      if (fxKind === 'lose') {
        // place the "lost" heart over the slot that just emptied
        const lost = hEl.querySelector('.lost');
        const slot = hEl.children[r.hearts];
        if (lost && slot) { lost.style.left = `${slot.offsetLeft}px`; lost.style.top = '0'; lost.style.height = '100%'; }
      }
      r.heartsShown = key;
    }
    r.el.querySelector('.wb-prog i').style.width = `${(r.letters.size / BONUS_LETTERS.length) * 100}%`;
    r.el.querySelector('.wb-prog').style.opacity = r.letters.size && r.alive ? 1 : 0;
  }

  function flashSeat(r, cls, ms = 800) {
    if (!r?.el) return;
    r.el.classList.remove(cls);
    void r.el.offsetWidth;
    r.el.classList.add(cls);
    later(() => r.el?.classList.remove(cls), ms);
  }

  function renderHud() {
    const alive = aliveList().length;
    subEl.innerHTML = practice ? (() => { const n = roster.get(order[0])?.words.length || 0; return `Practice · <b>${n}</b> word${n === 1 ? '' : 's'}`; })() : `<b>${alive}</b> of ${order.length} still standing`;
    const lvl = level();
    statusEl.innerHTML = phase === 'intro' ? '' : `Round <b>${round() + 1}</b><br>${LEVELS[lvl]}<span class="lvl">${LEVELS.map((_, i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</span>`;
    const specs = [...spectators.values()].filter((p) => p.connected !== false);
    specsEl.innerHTML = specs.length ? `Joining next game: <b>${specs.map((p) => escapeHtml(p.name)).join(', ')}</b>` : '';
  }

  // Prompt letters always face the camera, centred on the bomb, sized so 2-4 letters fit inside the sphere.
  function fitPrompt() {
    if (!layout) return;
    const n = Math.max(2, prompt.length || 3);
    promptEl.style.fontSize = `${layout.bomb.R * Math.min(0.78, 1.5 / (n * 0.64))}px`;
  }
  function setPrompt(p) {
    promptEl.classList.remove('gone');
    promptEl.innerHTML = `<span>${p.toUpperCase()}</span>`;
    fitPrompt();
  }

  function renderTyping() {
    const r = roster.get(holder);
    if (!r || phase !== 'play') { pillEl.classList.add('hidden'); return; }
    pillEl.classList.remove('hidden');
    pillEl.style.setProperty('--c', r.player.color);
    pillEl.style.setProperty('--on', onColor(r.player.color));
    const shown = typing ? displayWord(typing) : '';
    const txt = shown
      ? `${highlight(shown, prompt)}<span class="caret"></span>${pillErr ? `<span class="err">${escapeHtml(pillErr)}</span>` : ''}`
      : `<span class="ph">${escapeHtml(r.player.name)} is thinking…</span>`;
    pillEl.innerHTML = `<span class="av">${escapeHtml(initials(r.player.name))}</span><span class="txt">${txt}</span>`;
  }

  function clearBubbles() {
    seatsEl.querySelectorAll('.wb-bubble.show').forEach((b) => b.classList.remove('show'));
  }

  function setHint(html, cls = 'info', ms = 0) {
    hintEl.className = `wb-hint ${cls}`;
    hintEl.innerHTML = html;
    hintEl.style.opacity = 1;
    clearTimeout(setHint.t);
    if (ms) setHint.t = setTimeout(() => { hintEl.style.opacity = 0; }, ms);
  }

  function pointAt(pid, instant = false) {
    const r = pid && roster.get(pid);
    if (!r?.pos || !layout) { fx.bomb.target = null; return; }
    const { bomb, A } = layout;
    fx.bomb.targetAngle = Math.atan2(r.pos.y - bomb.y, r.pos.x - bomb.x);
    if (instant) { fx.bomb.angle = fx.bomb.targetAngle; fx.bomb.angVel = 0; }
    fx.bomb.target = { x: r.pos.x, y: r.pos.y, r: A * 0.8 };
    fx.bomb.rim = r.player.color;
  }

  function addFeed(r, word, p) {
    const row = el('div', 'row', null, `<i></i><b>${highlight(displayWord(word), p)}</b>`);
    row.style.setProperty('--c', r.player.color);
    feedEl.insertBefore(row, feedEl.firstChild);
    while (feedEl.children.length > 5) feedEl.lastChild.remove();
  }

  function addFloater(word) {
    if (floaters.children.length > 12) floaters.firstChild.remove();
    const f = el('div', 'wb-floater', floaters, escapeHtml(displayWord(word)));
    f.style.left = `${rand(-5, 85)}%`;
    f.style.fontSize = `${rand(5, 11)}vh`;
    f.style.setProperty('--r', `${rand(-8, 8)}deg`);
    f.style.animationDuration = `${rand(16, 24)}s`;
    f.addEventListener('animationend', () => f.remove());
  }

  function callout(x, y, html, size, color = '#fff') {
    const c = el('div', 'wb-callout', shakeEl, html);
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
    c.style.fontSize = `${size}px`;
    c.style.color = color;
    later(() => c.remove(), 1900);
  }

  function flyWord(word) {
    const f = el('div', 'wb-flyword', shakeEl, escapeHtml(displayWord(word)));
    f.style.left = pillEl.style.left;
    f.style.top = pillEl.style.top;
    f.style.fontSize = pillEl.style.fontSize;
    later(() => f.remove(), 1200);
  }

  function showWait(html) {
    if (!waitOverlay) waitOverlay = el('div', 'wb-overlay', root, '<div class="wb-wait"></div>');
    waitOverlay.firstChild.innerHTML = html;
  }
  function hideWait() { waitOverlay?.remove(); waitOverlay = null; }

  // ------------------------------------------------------------ phones
  function stateFor(pid) {
    const r = roster.get(pid);
    const h = holder && roster.get(holder);
    return {
      type: 'state',
      phase,
      practice,
      prompt: prompt.toUpperCase(),
      turnId,
      holder: h && (phase === 'play' || phase === 'boom') ? { id: h.id, name: h.player.name, color: h.player.color } : null,
      you: r
        ? { hearts: r.hearts, slots: Math.max(heartsAtStart, r.hearts), alive: r.alive, forfeit: r.forfeit, letters: [...r.letters].join(''), words: r.words.length, longest: r.longest, spectator: false }
        : { spectator: true },
      winner: phase === 'over' && !practice ? (() => { const w = ranking()[0]; return w ? { id: w.id, name: w.player.name, color: w.player.color } : null; })() : null,
      bonus: BONUS_LETTERS,
      alive: aliveList().length,
      total: order.length,
    };
  }
  const sendState = (pid) => ctx.send(pid, stateFor(pid));
  function syncAll() {
    for (const id of order) if (roster.get(id).connected) sendState(id);
    for (const id of spectators.keys()) sendState(id);
  }

  // ------------------------------------------------------------ game flow
  function pickPrompt() {
    const w = TIER_ODDS[level()];
    const x = Math.random();
    const tier = x < w[0] ? prompts.easy : x < w[0] + w[1] ? prompts.medium : prompts.hard;
    let p = '';
    for (let i = 0; i < 20; i++) {
      p = tier[Math.floor(Math.random() * tier.length)];
      if (!recentPrompts.includes(p)) break;
    }
    recentPrompts.push(p);
    if (recentPrompts.length > 60) recentPrompts.shift();
    return p;
  }

  function exampleWord(p) {
    const cands = [];
    for (const w of wordList) {
      if (w.length >= Math.max(4, p.length + 2) && w.length <= 8 && w.includes(p) && !used.has(w) && !isOffensive(w)) {
        cands.push(w);
        if (cands.length > 400) break;
      }
    }
    if (!cands.length) return '';
    cands.sort((a, b) => a.length - b.length);
    return cands[Math.floor(Math.random() * Math.min(cands.length, 60))];
  }

  function armBomb() {
    const k = clamp(explosions / Math.max(3, totalHearts * 0.8), 0, 1);
    // hidden fuse per bomb: 15-26 s at the start, easing to 11-19 s late in the game
    const lo = 15 - 4 * k;
    const hi = 26 - 7 * k;
    const now = performance.now();
    fuseStart = now;
    const f = FAST ? 0.45 : 1;
    fuseEnd = now + rand(lo, hi) * 1000 * f;
    fuseVisMax = hi * 1000 * f;
    nextTickAt = now + 450;
    Object.assign(fx.bomb, { visible: true, spawnT: 0, spawnStart: performance.now(), fuse: 1, heat: 0 });
    audio.drop();
    audio.startHiss();
  }

  function beginTurn(pid, { newPrompt = true, from = null } = {}) {
    const prev = holder;
    holder = pid;
    turnId++;
    typing = '';
    pillErr = '';
    phase = 'play';
    clearBubbles();
    pillEl.classList.remove('bad');
    if (newPrompt) {
      turnCount++;
      if (turnCount > 1) progress += 1 / Math.max(3, aliveList().length);
      prompt = pickPrompt();
      setPrompt(prompt);
    }
    const now = performance.now();
    const k = clamp(explosions / Math.max(3, totalHearts * 0.8), 0, 1);
    const minTurn = FAST ? 800 : MIN_TURN_MS - (MIN_TURN_MS - MIN_TURN_LATE_MS) * k;
    if (fuseEnd - now < minTurn) fuseEnd = now + minTurn;
    const src = from ?? prev;
    const a = src && roster.get(src);
    const b = roster.get(pid);
    if (a?.pos && b?.pos && src !== pid) {
      fx.comet(a.pos, b.pos, hexRgb(b.player.color));
      audio.whoosh();
    }
    audio.arrive();
    pointAt(pid);
    fx.bomb.pulse = 1;
    for (const r of roster.values()) renderSeat(r);
    flashSeat(b, 'good', 500);
    renderTyping();
    renderHud();
    syncAll();
  }

  function startPlay() {
    const alive = connectedAlive();
    if (!alive.length) { ctx.exit(); return; }
    const first = alive[Math.floor(Math.random() * alive.length)];
    armBomb();
    hintEl.innerHTML = '';
    beginTurn(first.id);
  }

  function validate(word) {
    if (!word) return 'Type a word!';
    if (!/^[a-z]+$/.test(word)) return 'Letters only';
    if (!word.includes(prompt)) return `Must contain ${prompt.toUpperCase()}`;
    if (!dict.has(word)) return 'Not a word';
    if (used.has(word)) return 'Already used';
    return null;
  }

  function onSubmit(pid, msg) {
    if (phase !== 'play' || paused || pid !== holder || msg.turnId !== turnId) return;
    const now = performance.now();
    const word = String(msg.text || '').toLowerCase().trim().slice(0, 40);
    // swallow only an accidental double-send of the same word; a different word is always judged
    const last = lastSubmit.get(pid);
    if (last && last.word === word && now - last.t < 400) return;
    lastSubmit.set(pid, { word, t: now });
    const r = roster.get(pid);
    const reason = validate(word);
    if (reason) {
      ctx.send(pid, { type: 'reject', reason, turnId });
      audio.reject();
      pillEl.classList.remove('bad');
      void pillEl.offsetWidth;
      pillEl.classList.add('bad');
      clearTimeout(onSubmit.badT);
      onSubmit.badT = setTimeout(() => pillEl.classList.remove('bad'), 500);
      pillErr = reason;
      renderTyping();
      clearTimeout(onSubmit.errT);
      onSubmit.errT = setTimeout(() => { pillErr = ''; renderTyping(); }, 1600);
      if (reason !== 'Type a word!') ctx.vibrate(pid, 'error');
      flashSeat(r, 'shake', 450);
      return;
    }
    used.add(word);
    r.words.push(word);
    if (word.length > r.longest.length) r.longest = word;
    for (const ch of word) if (BONUS_LETTERS.includes(ch)) r.letters.add(ch);
    let bonus = false;
    if (r.letters.size >= BONUS_LETTERS.length) {
      r.letters.clear();
      bonus = r.hearts < MAX_HEARTS;
      if (bonus) r.hearts++;
      ctx.send(pid, { type: 'bonus', gained: bonus });
      audio.bonus();
      renderSeat(r, bonus ? 'gain' : null);
      if (r.pos) {
        callout(r.pos.x, r.pos.y - layout.A * 1.1, bonus ? `+1 ${HEART_SVG} Alphabet bonus` : 'Alphabet complete', Math.max(18, layout.A * 0.36), '#ffc531');
        fx.burst(r.pos.x, r.pos.y, '255,207,61', 50, 1.2);
      }
    }
    ctx.send(pid, { type: 'accept', word, turnId });
    audio.accept();
    flyWord(word);
    addFeed(r, word, prompt);
    addFloater(word);
    pillEl.classList.remove('bad');
    setHint('', 'info');
    if (r.pos) fx.burst(r.pos.x, r.pos.y, '62,240,138', 18, 0.8);
    const next = practice ? pid : nextAlive(pid) || pid;
    beginTurn(next, { newPrompt: true, from: pid });
  }

  function onTyping(pid, msg) {
    if (phase !== 'play' || pid !== holder || msg.turnId !== turnId) return;
    const t = String(msg.text || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 24);
    if (t === typing) return;
    typing = t;
    pillErr = ''; // a stale "Not a word" must not sit under the next attempt
    const now = performance.now();
    if (now - lastKeySound > 45) { audio.key(); lastKeySound = now; }
    renderTyping();
  }

  function explode() {
    if (phase !== 'play') return;
    phase = 'boom';
    explosions++;
    const r = roster.get(holder);
    audio.stopHiss();
    audio.explosion();
    fx.explode(fx.bomb.x, fx.bomb.y, 1.2);
    fx.bomb.visible = false;
    fx.bomb.target = null;
    shake = 1;
    promptEl.classList.add('gone');
    pillEl.classList.add('hidden');
    clearBubbles();
    const missed = prompt;
    r.hearts = Math.max(0, r.hearts - 1);
    const eliminated = r.hearts === 0;
    if (eliminated) {
      r.alive = false;
      r.elimOrder = ++elimCounter;
      r.outAt = performance.now();
      audio.eliminated();
    } else audio.heartLost();
    renderSeat(r, 'lose');
    flashSeat(r, 'hit', 750);
    if (r.pos) {
      later(() => fx.explode(r.pos.x, r.pos.y, 0.45), 120);
      callout(r.pos.x, r.pos.y - layout.A * 1.05, eliminated ? 'OUT' : `−1 ${HEART_SVG}`, Math.max(20, layout.A * 0.45), eliminated ? '#ff6b7d' : '#f4f1ea');
    }
    const ex = exampleWord(missed);
    later(() => setHint(`${eliminated ? `${escapeHtml(r.player.name)} is out.` : `Boom! ${escapeHtml(r.player.name)} loses a life.`}${ex ? `&ensp;Could've played <b>${ex.toUpperCase()}</b>` : ''}`, 'info'), 500);
    ctx.send(r.id, { type: 'boom', eliminated });
    ctx.vibrate(r.id, eliminated ? 'lose' : 'explosion');
    renderHud();
    syncAll();
    later(afterBoom, FAST ? 2800 : 3600); // time to see who blew up before the next prompt
  }

  function isOver() {
    const alive = aliveList().length;
    return practice ? alive === 0 : alive <= 1;
  }

  function afterBoom() {
    if (phase !== 'boom') return;
    if (isOver()) { finish(); return; }
    const exploded = holder;
    const next = practice ? holder : nextAlive(exploded);
    if (!next) { phase = 'play'; enterPause(); return; }
    hintEl.innerHTML = '';
    armBomb();
    beginTurn(next, { newPrompt: true, from: exploded });
  }

  // ------------------------------------------------------------ disconnect handling
  function enterPause() {
    if (paused) return;
    paused = true;
    pauseSince = performance.now();
    pauseRemaining = Math.max(MIN_TURN_LATE_MS, fuseEnd - pauseSince);
    pauseElapsed = pauseSince - fuseStart;
    audio.stopHiss();
    showWait('Waiting for players to reconnect…<small>The game ends in 30 seconds if nobody comes back</small>');
  }

  function resumeIfPossible() {
    if (!paused) return;
    const next = practice ? (roster.get(holder)?.connected ? holder : null) : (roster.get(holder)?.connected && roster.get(holder)?.alive ? holder : nextAlive(holder));
    if (!next) return;
    paused = false;
    hideWait();
    const now = performance.now();
    fuseEnd = now + pauseRemaining;
    fuseStart = now - pauseElapsed;
    if (!fx.bomb.visible) armBomb(); else audio.startHiss();
    beginTurn(next, { newPrompt: next !== holder });
  }

  function logicTick(now) {
    if (phase !== 'play') return;
    if (paused) {
      if (now - pauseSince > PAUSE_MS) { hideWait(); finish(); }
      return;
    }
    const forfeitMs = FAST ? 5000 : FORFEIT_MS;
    for (const r of roster.values()) {
      if (r.alive && !r.connected && r.dcSince && now - r.dcSince > forfeitMs) {
        r.alive = false;
        r.forfeit = true;
        r.elimOrder = ++elimCounter;
        r.outAt = r.dcSince; // ranked by when they left, not when the timeout fired
        renderSeat(r);
        renderHud();
        syncAll();
      }
    }
    if (isOver()) { hideWait(); finish(); return; }
    const h = roster.get(holder);
    if (!h || !h.connected || !h.alive) {
      const next = nextAlive(holder);
      if (next && next !== holder) beginTurn(next, { newPrompt: false });
      else if (!next) { enterPause(); return; }
    }
    if (!practice && connectedAlive().length === 1 && aliveList().length > 1) {
      if (!loneSince) { loneSince = now; showWait('Everyone else disconnected<small>Ending the game soon unless they come back</small>'); }
      else if (now - loneSince > LONELY_MS) { loneSince = 0; hideWait(); finish(); return; }
    } else if (loneSince) { loneSince = 0; hideWait(); }
    if (testFreeze) fuseEnd = Math.max(fuseEnd, now + 1000);
    const elapsed = now - fuseStart;
    const heat = clamp(elapsed / fuseVisMax, 0, 1);
    fx.bomb.heat = heat;
    fx.bomb.fuse = 1 - heat * 0.92;
    if (heat > 0.7) shake = Math.max(shake, (heat - 0.7) * 1.1); // the table starts to rattle
    if (now >= nextTickAt) {
      audio.tick(heat);
      if (Math.random() < 0.5) audio.crackle();
      fx.bomb.pulse = 1;
      nextTickAt = now + (640 - 480 * heat) * rand(0.92, 1.08); // ticks speed up as the fuse burns
    }
    if (now >= fuseEnd) explode();
  }

  // ------------------------------------------------------------ intro / end
  async function runIntro(first) {
    const g = gen;
    phase = 'intro';
    syncAll();
    const ms = first ? 5200 : 3200;
    const tiles = BONUS_LETTERS.slice(0, 8).toUpperCase().split('').map((c, i) => `<span class="${i < 5 ? 'on' : ''}">${c}</span>`).join('');
    const heart = (cls = '') => HEART_SVG.replace('<svg', `<svg class="${cls}"`);
    const ov = el('div', 'wb-overlay', root, `
      <div class="wb-card">
        <div class="head"><div class="title">Word Bomb</div><div class="sub">${practice ? 'Practice: how long can you last?' : 'Last one standing wins'}</div></div>
        <div class="wb-rules">
          <div class="wb-rule"><div class="n">1</div><div><b>Type a word with the letters</b>The letters on the bomb can go anywhere in your word.<div class="wb-ex"><span class="chip">ING</span><span class="arrow">→</span><span>S<span class="hl">ING</span>ER</span></div></div></div>
          <div class="wb-rule"><div class="n">2</div><div><b>Pass the bomb</b>A real word nobody has used yet sends it to the next player.</div></div>
          <div class="wb-rule"><div class="n">3</div><div><b>Don't be holding it</b>The fuse is hidden. If it blows up on you, you lose a life.<div class="wb-ex">${heart()}${heart()}${heart('empty')}</div></div></div>
          <div class="wb-rule"><div class="n">4</div><div><b>Alphabet bonus</b>Use every letter except ${BONUS_EXCLUDE.toUpperCase().split('').join(' ')} across your words for an extra life.<div class="wb-ex"><span class="tiles">${tiles}</span></div></div></div>
        </div>
        <div class="wb-bar"><i style="animation-duration:${ms}ms"></i></div>
      </div>`);
    await wait(ms);
    ov.classList.add('out');
    later(() => ov.remove(), 400);
    if (g !== gen) return;
    await countdown(root);
    if (g !== gen || destroyed) return;
    startPlay();
  }

  function ranking() {
    // connected survivors first: someone who walked away doesn't win by not being blown up
    const alive = aliveList().sort((a, b) => (b.connected - a.connected) || b.hearts - a.hearts || b.words.length - a.words.length);
    const dead = order.map((id) => roster.get(id)).filter((r) => !r.alive).sort((a, b) => (b.outAt || 0) - (a.outAt || 0));
    return [...alive, ...dead];
  }

  async function finish() {
    if (phase === 'over') return;
    const g = gen;
    phase = 'over';
    paused = false;
    audio.stopHiss();
    fx.bomb.visible = false;
    fx.bomb.target = null;
    promptEl.innerHTML = '';
    pillEl.classList.add('hidden');
    clearBubbles();
    for (const r of roster.values()) renderSeat(r);
    syncAll();
    const rank = ranking();
    const w = rank[0];
    if (w) {
      const longest = w.longest ? displayWord(w.longest).toUpperCase() : '';
      const ov = el('div', 'wb-overlay', root, `
        <div class="wb-win" style="--c:${w.player.color};--on:${onColor(w.player.color)}">
          <div class="big">${practice ? w.words.length : escapeHtml(initials(w.player.name))}</div>
          <div class="name">${practice ? `${w.words.length} word${w.words.length === 1 ? '' : 's'}` : `${escapeHtml(w.player.name)} wins`}</div>
          <div class="stats">${practice ? 'Practice complete' : `${w.words.length} word${w.words.length === 1 ? '' : 's'} played`}${longest ? ` · longest <b>${escapeHtml(longest)}</b>` : ''}</div>
        </div>`);
      if (!practice) {
        ctx.vibrate(w.id, 'win');
        for (const r of rank.slice(1)) if (r.connected) ctx.vibrate(r.id, 'lose');
      }
      ov.style.background = 'rgba(14,15,18,.55)';
      fx.confetti(practice ? 90 : 200);
      sfx.play('win');
      await wait(3600);
      ov.remove();
    }
    if (g !== gen || destroyed) return;
    const rows = rank.map((r) => ({
      player: ctx.player(r.id) || r.player,
      score: r.words.length,
      label: `word${r.words.length === 1 ? '' : 's'}${r.longest ? ` · ${displayWord(r.longest).toUpperCase()}` : ''}`,
    }));
    const choice = await ctx.showResults(rows, {
      title: practice ? 'Practice over' : `${w?.player.name ?? 'Nobody'} wins!`,
      subtitle: practice ? 'Score = words played before your last life' : 'Ranked by survival · words played · longest word',
    });
    if (choice === 'again' && !destroyed) {
      resetGame();
      runIntro(false);
    }
  }

  // ------------------------------------------------------------ networking
  ctx.onMessage((pid, msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') sendState(pid);
    else if (msg.type === 'typing') onTyping(pid, msg);
    else if (msg.type === 'submit') onSubmit(pid, msg);
  });

  ctx.onJoin((p) => {
    audio.unlock();
    const r = roster.get(p.id);
    if (r) {
      r.connected = true;
      r.dcSince = 0;
      r.player = p;
      renderSeat(r);
      if (paused) resumeIfPossible();
    } else if (phase === 'intro' && !ctx.container.querySelector('.sk-countdown')) {
      // still reading the rules: let them in
      if (!roster.size) heartsAtStart = startHearts(1);
      roster.set(p.id, makeEntry(p));
      order.push(p.id);
      practice = order.length === 1;
      totalHearts = order.length * heartsAtStart;
      buildSeats();
      relayout();
    } else {
      spectators.set(p.id, p);
    }
    renderHud();
    sendState(p.id);
  });

  ctx.onLeave((p) => {
    const r = roster.get(p.id);
    if (r) {
      r.connected = false;
      r.dcSince = performance.now();
      renderSeat(r);
      if (phase === 'play' && holder === p.id && !paused) {
        const next = nextAlive(p.id);
        if (next) beginTurn(next, { newPrompt: false, from: p.id });
        else enterPause();
      }
    } else spectators.delete(p.id);
    renderHud();
  });

  // ------------------------------------------------------------ loop
  let raf = 0;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    logicTick(now);
    fx.update(dt);
    fx.draw();
    if (fx.bomb.visible) {
      // letters ride on the bomb: follow its drop-in, bob, wobble and squash
      const tr = fx.bombTransform();
      // follow the bomb's drop/bob/squash but never its wobble: the letters stay upright and readable
      promptEl.style.transform = `translate(-50%,-50%) translate(${(tr.x - fx.bomb.x).toFixed(1)}px, ${(tr.y - fx.bomb.y).toFixed(1)}px) scale(${tr.sx.toFixed(3)}, ${tr.sy.toFixed(3)})`;
    }
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 1.6);
      const m = shake * shake * Math.min(root.clientWidth, root.clientHeight) * 0.03;
      shakeEl.style.transform = `translate(${rand(-m, m)}px, ${rand(-m, m)}px) rotate(${rand(-m, m) * 0.02}deg)`;
    } else if (shakeEl.style.transform) shakeEl.style.transform = '';
  }
  raf = requestAnimationFrame(frame);
  // rAF stalls in background tabs; keep the fuse honest anyway.
  const guard = setInterval(() => logicTick(performance.now()), 250);

  if (FAST) {
    window.__wb = {
      get phase() { return phase; },
      get holder() { return holder; },
      get prompt() { return prompt; },
      get turnId() { return turnId; },
      get practice() { return practice; },
      get explosions() { return explosions; },
      hearts: () => Object.fromEntries([...roster.values()].map((r) => [r.player.name, r.hearts])),
      words: () => Object.fromEntries([...roster.values()].map((r) => [r.player.name, r.words.length])),
      spectators: () => [...spectators.values()].map((p) => p.name),
      roster: () => order.map((id) => { const r = roster.get(id); return { id, name: r.player.name, alive: r.alive, connected: r.connected, hearts: r.hearts, words: r.words.length, forfeit: r.forfeit }; }),
      get level() { return level(); },
      forcePrompt(p) { if (phase !== 'play') return false; prompt = p; setPrompt(p); typing = ''; renderTyping(); syncAll(); return true; },
      fuseNow() { if (phase === 'play' && !paused) { testFreeze = false; fuseEnd = performance.now(); } },
      freeze(v) { testFreeze = !!v; },
    };
  }
  resetGame();
  runIntro(true);

  return {
    destroy() {
      destroyed = true;
      gen++;
      for (const id of timers) clearTimeout(id);
      clearTimeout(setHint.t);
      clearTimeout(onSubmit.badT);
      clearTimeout(onSubmit.errT);
      cancelAnimationFrame(raf);
      clearInterval(guard);
      ro.disconnect();
      audio.destroy();
      root.remove();
      if (window.__wb) delete window.__wb;
    },
  };
}

const onColor = (css) => onColorRgb(hexRgb(css));

const rgbCache = new Map();
function hexRgb(css) {
  if (rgbCache.has(css)) return rgbCache.get(css);
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = css;
  const v = c.fillStyle;
  const out = v.startsWith('#') ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)).join(',') : (v.match(/\d+/g) || [255, 255, 255]).slice(0, 3).join(',');
  rgbCache.set(css, out);
  return out;
}
