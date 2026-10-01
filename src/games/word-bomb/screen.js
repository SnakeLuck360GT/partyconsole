// Word Bomb — screen (TV). Authoritative game state, dictionary validation, 2D canvas + DOM presentation.
import { countdown, escapeHtml } from '../../sdk/screen-kit.js';
import { sfx } from '../../sdk/audio.js';
import { FX, drawBackdrop, superellipsePoints } from './render.js';
import { createAudio } from './audio.js';
import { SCREEN_CSS } from './screen-style.js';
import { isOffensive, displayWord } from './blocklist.js';
import { BONUS_LETTERS, BONUS_EXCLUDE, MAX_HEARTS, startHearts, HEART_SVG, highlight } from './common.js';

const MIN_TURN_MS = 2500; // a player always gets at least this long after receiving the bomb
const LONELY_MS = 15000; // multiplayer game with only one connected survivor ends after this
const PAUSE_MS = 30000; // nobody connected to play: give up after this
// ?wbfast=1 on screen.html: short fuses + a state peek for automated tests (scripts/word-bomb-test.mjs)
const FAST = /[?&]wbfast=1/.test(location.search);
const rand = (a, b) => a + Math.random() * (b - a);
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
  el('div', 'wb-logo', root, `<div class="t">💣 WORD BOMB</div><div class="s" id="wb-sub"></div>`);
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
  let explosions = 0;
  let elimCounter = 0;
  let heartsAtStart = 2;
  let totalHearts = 1;
  let used = new Set();
  let recentPrompts = [];
  let typing = '';
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
    return { id: p.id, player: p, hearts: heartsAtStart, alive: true, connected: p.connected !== false, letters: new Set(), words: [], longest: '', elimOrder: 0, el: null };
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
  function computeLayout(W, H, n) {
    const cx = W / 2;
    const cy = H * 0.53;
    let specs;
    if (n <= 18) specs = [{ a: W * 0.39, b: H * 0.345, n: 2, count: n, phase: n <= 2 ? 0.5 : 0 }];
    else if (n <= 30) specs = [{ a: W * 0.43, b: H * 0.37, n: 2.8, count: n, phase: 0 }];
    else {
      const outer = Math.ceil(n * 0.58);
      specs = [{ a: W * 0.44, b: H * 0.39, n: 2.8, count: outer, phase: 0 }, { a: W * 0.28, b: H * 0.225, n: 2.2, count: n - outer, phase: 0.5 }];
    }
    const rings = specs.map((s) => ({ ...s, ...superellipsePoints(cx, cy, s.a, s.b, s.n, Math.max(1, s.count), s.phase) }));
    let A = Math.min(H * 0.13, W * 0.075);
    for (const r of rings) if (r.count > 1) A = Math.min(A, (r.perimeter / r.count) * 0.52);
    A = Math.max(22, A);
    const R = Math.min(W * 0.07, n > 30 ? H * 0.072 : n > 18 ? H * 0.095 : H * 0.115);
    const seats = [];
    for (const r of rings) for (let i = 0; i < r.count; i++) seats.push({ x: r.points[i][0], y: r.points[i][1] });
    return { W, H, cx, cy, rings, A, seats, bomb: { x: cx, y: cy - H * 0.045, R } };
  }

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
    promptEl.style.fontSize = `${bomb.R * 0.74}px`;
    const pillTop = bomb.y + bomb.R * 1.28;
    pillEl.style.left = `${bomb.x}px`;
    pillEl.style.top = `${pillTop}px`;
    pillEl.style.fontSize = `${Math.max(16, bomb.R * 0.4)}px`;
    hintEl.style.left = `${bomb.x}px`;
    hintEl.style.top = `${pillTop + Math.max(16, bomb.R * 0.4) * 1.9}px`;
    hintEl.style.fontSize = `${Math.max(13, bomb.R * 0.24)}px`;
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
        <div class="wb-av"><div class="wb-ring"></div><span class="wb-emoji">${p.avatar}</span><span class="wb-skull">💀</span><span class="wb-dc">📵</span></div>
        <div class="wb-name">${escapeHtml(p.name)}</div>
        <div class="wb-hearts"></div>
        <div class="wb-prog"><i></i></div>
        <div class="wb-bubble"></div>`);
      r.el.style.setProperty('--c', p.color);
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
    subEl.innerHTML = practice ? 'Practice mode · <b>survive!</b>' : `<b>${alive}</b> of ${order.length} still standing`;
    const t = turnCount;
    const diff = t < 6 ? ['Warm-up', 1] : t < 16 ? ['Medium', 2] : t < 32 ? ['Hard', 3] : ['Brutal', 4];
    statusEl.innerHTML = `
      <div class="chip bonus">🔤 Use every letter <b>A–Z</b> (except ${BONUS_EXCLUDE.toUpperCase().split('').join(' ')}) for <b>+1 ❤️</b></div>
      <div class="chip">Turn <b>${Math.max(1, t)}</b> · ${diff[0]} ${'🌶️'.repeat(diff[1])}</div>`;
    const specs = [...spectators.values()].filter((p) => p.connected !== false);
    specsEl.textContent = specs.length ? `👀 Joining next game: ${specs.map((p) => `${p.avatar} ${p.name}`).join(', ')}` : '';
  }

  function setPrompt(p) {
    promptEl.classList.remove('gone');
    promptEl.innerHTML = p.toUpperCase().split('').map((c, i) => `<span style="animation-delay:${i * 70}ms">${c}</span>`).join('');
  }

  function renderTyping() {
    const r = roster.get(holder);
    if (!r || phase !== 'play') { pillEl.classList.add('hidden'); return; }
    pillEl.classList.remove('hidden');
    pillEl.style.setProperty('--c', r.player.color);
    const shown = typing ? (isOffensive(typing) ? '✱'.repeat(typing.length) : typing) : '';
    const txt = shown
      ? `${highlight(shown, prompt)}<span class="caret"></span>`
      : `<span class="ph">${escapeHtml(r.player.name)} is thinking…</span>`;
    pillEl.innerHTML = `<span class="av">${r.player.avatar}</span><span class="txt">${txt}</span>`;
    const bub = r.el?.querySelector('.wb-bubble');
    if (bub) {
      bub.innerHTML = shown ? highlight(shown, prompt) : '…';
      bub.classList.add('show');
    }
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
    const row = el('div', 'row', null, `<span>${r.player.avatar}</span><b>${highlight(displayWord(word), isOffensive(word) ? '' : p)}</b>`);
    row.style.setProperty('--c', r.player.color);
    if (!feedEl.querySelector('.h')) el('div', 'h', feedEl, 'Recent words');
    feedEl.insertBefore(row, feedEl.children[1] || null);
    while (feedEl.children.length > 6) feedEl.lastChild.remove();
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
      holder: h && (phase === 'play' || phase === 'boom') ? { id: h.id, name: h.player.name, avatar: h.player.avatar, color: h.player.color } : null,
      you: r
        ? { hearts: r.hearts, slots: Math.max(heartsAtStart, r.hearts), alive: r.alive, letters: [...r.letters].join(''), words: r.words.length, spectator: false }
        : { spectator: true },
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
    const t = turnCount;
    const w = t < 6 ? [0.9, 0.1, 0] : t < 16 ? [0.55, 0.4, 0.05] : t < 32 ? [0.3, 0.5, 0.2] : [0.15, 0.45, 0.4];
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
    const lo = 9 - 3 * k;
    const hi = 16 - 5 * k;
    const now = performance.now();
    fuseStart = now;
    const f = FAST ? 0.45 : 1;
    fuseEnd = now + rand(lo, hi) * 1000 * f;
    fuseVisMax = hi * 1000 * f;
    nextTickAt = now + 450;
    Object.assign(fx.bomb, { visible: true, spawnT: 0, fuse: 1, heat: 0 });
    audio.drop();
    audio.startHiss();
  }

  function beginTurn(pid, { newPrompt = true, from = null } = {}) {
    const prev = holder;
    holder = pid;
    turnId++;
    typing = '';
    phase = 'play';
    clearBubbles();
    pillEl.classList.remove('bad');
    if (newPrompt) {
      turnCount++;
      prompt = pickPrompt();
      setPrompt(prompt);
    }
    const now = performance.now();
    const minTurn = FAST ? 800 : MIN_TURN_MS;
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
    if (now - (lastSubmit.get(pid) || 0) < 150) return;
    lastSubmit.set(pid, now);
    const r = roster.get(pid);
    const word = String(msg.text || '').toLowerCase().trim().slice(0, 40);
    const reason = validate(word);
    if (reason) {
      ctx.send(pid, { type: 'reject', reason, turnId });
      audio.reject();
      pillEl.classList.remove('bad');
      void pillEl.offsetWidth;
      pillEl.classList.add('bad');
      setHint(`✖ ${escapeHtml(reason)}`, 'bad', 1400);
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
        callout(r.pos.x, r.pos.y - layout.A * 1.1, bonus ? '+1 ❤️ ALPHABET BONUS!' : 'ALPHABET COMPLETE!', Math.max(18, layout.A * 0.36), '#ffcf3d');
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
      audio.eliminated();
    } else audio.heartLost();
    renderSeat(r, 'lose');
    flashSeat(r, 'hit', 750);
    if (r.pos) {
      later(() => fx.explode(r.pos.x, r.pos.y, 0.45), 120);
      callout(r.pos.x, r.pos.y - layout.A * 1.05, eliminated ? '💀 OUT!' : '−1 ❤️', Math.max(20, layout.A * 0.45), eliminated ? '#ff7088' : '#fff');
    }
    const ex = exampleWord(missed);
    later(() => setHint(`💥 <b>${escapeHtml(r.player.name)}</b> got blown up!${ex ? `  Could've played <b>${ex.toUpperCase()}</b>` : ''}`, 'info'), 500);
    ctx.send(r.id, { type: 'boom', eliminated });
    renderHud();
    syncAll();
    later(afterBoom, 2800);
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
    pauseRemaining = Math.max(MIN_TURN_MS, fuseEnd - pauseSince);
    pauseElapsed = pauseSince - fuseStart;
    audio.stopHiss();
    showWait('📵 Waiting for players to reconnect…');
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
    const h = roster.get(holder);
    if (!h || !h.connected || !h.alive) {
      const next = nextAlive(holder);
      if (next && next !== holder) beginTurn(next, { newPrompt: false });
      else if (!next) { enterPause(); return; }
    }
    if (!practice && connectedAlive().length === 1 && aliveList().length > 1) {
      if (!loneSince) { loneSince = now; showWait('📵 Everyone else disconnected…<br><small>Ending the game soon unless they come back</small>'); }
      else if (now - loneSince > LONELY_MS) { loneSince = 0; hideWait(); finish(); return; }
    } else if (loneSince) { loneSince = 0; hideWait(); }
    const elapsed = now - fuseStart;
    const heat = clamp(elapsed / fuseVisMax, 0, 1);
    fx.bomb.heat = heat;
    fx.bomb.fuse = 1 - heat * 0.92;
    if (now >= nextTickAt) {
      audio.tick(heat);
      if (Math.random() < 0.5) audio.crackle();
      fx.bomb.pulse = 1;
      nextTickAt = now + Math.max(160, 640 - elapsed * 0.045) * rand(0.92, 1.08);
    }
    if (now >= fuseEnd) explode();
  }

  // ------------------------------------------------------------ intro / end
  async function runIntro(first) {
    const g = gen;
    phase = 'intro';
    syncAll();
    const ms = first ? 5200 : 3200;
    const ov = el('div', 'wb-overlay', root, `
      <div class="wb-card">
        <div class="title">💣 WORD BOMB</div>
        <div class="sub">${practice ? 'Practice mode: how long can you survive?' : 'Pass the bomb before it blows up!'}</div>
        <div class="wb-rules">
          <div class="wb-rule"><div class="ico">⌨️</div><div><b>Type a word</b>containing the letters on the bomb<div class="wb-ex"><span class="p">ING</span><span class="arrow">→</span>S<span class="p">ING</span>ER</div></div></div>
          <div class="wb-rule"><div class="ico">💣</div><div><b>Pass it on</b>A real, unused word sends the bomb to the next player</div></div>
          <div class="wb-rule"><div class="ico">💥</div><div><b>Hidden fuse</b>If it explodes in your hands you lose a ❤️. Last one standing wins!</div></div>
          <div class="wb-rule"><div class="ico">🔤</div><div><b>Alphabet bonus</b>Use every letter A–Z (except ${BONUS_EXCLUDE.toUpperCase().split('').join(' ')}) to earn +1 ❤️</div></div>
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
    const alive = aliveList().sort((a, b) => b.hearts - a.hearts || b.words.length - a.words.length);
    const dead = order.map((id) => roster.get(id)).filter((r) => !r.alive).sort((a, b) => b.elimOrder - a.elimOrder);
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
        <div class="wb-win" style="--c:${w.player.color}">
          <div class="crown">${practice ? '🎯' : '👑'}</div>
          <div class="big">${w.player.avatar}</div>
          <div class="name">${practice ? `<span>${w.words.length}</span> word${w.words.length === 1 ? '' : 's'}!` : `<span>${escapeHtml(w.player.name)}</span> wins!`}</div>
          <div class="stats">${practice ? 'Practice complete' : `${w.words.length} word${w.words.length === 1 ? '' : 's'} played`}${longest ? ` · longest <b>${escapeHtml(longest)}</b>` : ''}</div>
        </div>`);
      ov.style.background = 'rgba(8,4,20,.45)';
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
      promptEl.style.transform = `translate(-50%,-50%) translate(${(tr.x - fx.bomb.x).toFixed(1)}px, ${(tr.y - fx.bomb.y).toFixed(1)}px) rotate(${tr.rot.toFixed(3)}rad) scale(${tr.sx.toFixed(3)}, ${tr.sy.toFixed(3)})`;
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
      cancelAnimationFrame(raf);
      clearInterval(guard);
      ro.disconnect();
      audio.destroy();
      root.remove();
      if (window.__wb) delete window.__wb;
    },
  };
}

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
