// Word Bomb — phone controller (portrait). Whose turn it is, the current letters, a big text input that stays above
// the on-screen keyboard (live typing is streamed to the TV), your lives and your alphabet-bonus tracker.
import { HEART_SVG, BONUS_LETTERS, initials } from './common.js';

const CSS = `
.wbc { --hot:#ff5a1f; --ok:#4ade80; --bad:#ff5468; --text:#f3f2ee; --muted:#8d8d96; --panel:#1c1c20; --line:rgba(255,255,255,.09);
  position:absolute; left:0; right:0; top:0; bottom:0; display:flex; flex-direction:column; gap:10px; padding:12px 16px 16px; overflow:hidden;
  background:#121214; color:var(--text); font-family:'Figtree',system-ui,sans-serif; }
.wbc-top { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:30px; flex:none; }
.wbc-hearts { display:flex; gap:6px; height:26px; }
.wbc-hearts svg { height:100%; width:auto; overflow:visible; }
.wbc-hearts .full path { fill:#ff4057; }
.wbc-hearts .empty path { fill:none; stroke:rgba(255,255,255,.3); stroke-width:2; }
.wbc-hearts .gained { animation:wbc-pop .8s cubic-bezier(.2,1.8,.4,1); }
.wbc-hearts .lost { animation:wbc-lost .7s ease-out; }
@keyframes wbc-lost { 0% { transform:scale(1.6); } 100% { transform:none; } }
.wbc-count { font-size:15px; font-weight:600; color:var(--muted); white-space:nowrap; }
.wbc-count b { color:var(--text); font-weight:800; }

.wbc-turn { flex:none; display:flex; align-items:center; gap:12px; min-height:60px; padding:10px 14px; border-radius:16px; background:var(--panel); border:1px solid var(--line); font-size:19px; font-weight:700; line-height:1.15; transition:background .2s, color .2s; }
.wbc-turn .disc { width:38px; height:38px; border-radius:50%; flex:none; display:grid; place-items:center; font-weight:800; font-size:15px; }
.wbc-turn small { display:block; font-size:14px; font-weight:600; color:var(--muted); margin-top:2px; }
.wbc.mine .wbc-turn { background:var(--hot); border-color:var(--hot); color:#fff; justify-content:center; font-size:28px; font-weight:800; letter-spacing:-.01em; animation:wbc-beat 1s ease-in-out infinite; }
@keyframes wbc-beat { 0%,100% { transform:none; } 12% { transform:scale(1.025); } 24% { transform:none; } }
.wbc.boomed .wbc-turn { background:#b3261e; border-color:#b3261e; color:#fff; animation:wbc-shake .5s; }
.wbc.over .wbc-turn.won { background:#f3f2ee; color:#121214; }

.wbc-prompt { flex:none; text-align:center; }
.wbc-prompt .lbl { font-size:14px; font-weight:600; color:var(--muted); }
.wbc-prompt .letters { font-size:72px; font-weight:800; letter-spacing:.02em; line-height:1; color:#fff; margin-top:2px; }
.wbc:not(.mine) .wbc-prompt .letters { color:rgba(255,255,255,.55); }
.wbc-prompt .letters.pop { animation:wbc-pop .45s cubic-bezier(.2,1.7,.4,1); }
@keyframes wbc-pop { from { transform:scale(.4); opacity:0; } }

.wbc-formwrap { position:relative; flex:none; }
.wbc-form { display:flex; gap:10px; }
.wbc-form input { flex:1; min-width:0; height:66px; font:inherit; font-size:30px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; padding:0 16px; border-radius:16px; border:3px solid rgba(255,255,255,.14);
  background:#1c1c20; color:#fff; outline:none; user-select:text; -webkit-user-select:text; caret-color:var(--hot); transition:border-color .15s, background .15s; -webkit-appearance:none; appearance:none; }
.wbc-form input::placeholder { color:rgba(255,255,255,.3); letter-spacing:0; text-transform:none; font-weight:600; font-size:19px; }
.wbc.mine .wbc-form input { border-color:#f3f2ee; background:#0b0b0d; }
.wbc.mine .wbc-form.has input { border-color:var(--ok); }
.wbc-form button { font:inherit; font-size:24px; font-weight:800; border:0; border-radius:16px; width:88px; flex:none; color:#121214; background:#f3f2ee; box-shadow:0 5px 0 #8d8d96; touch-action:manipulation; }
.wbc.mine .wbc-form button { background:var(--hot); color:#fff; box-shadow:0 5px 0 #a8360d; }
.wbc-form button:active { transform:translateY(4px); box-shadow:0 1px 0 #8d8d96; }
.wbc:not(.mine) .wbc-form { opacity:.4; }
.wbc-form.bad input { border-color:var(--bad) !important; background:#2a1216 !important; animation:wbc-shake .4s; }
.wbc-form.good input { border-color:var(--ok) !important; background:#10261a !important; }
@keyframes wbc-shake { 20%,60% { transform:translateX(-10px); } 40%,80% { transform:translateX(10px); } }
.wbc-tap { position:absolute; inset:-3px; border:0; border-radius:18px; font:inherit; font-size:24px; font-weight:800; color:#fff; background:var(--hot); box-shadow:0 5px 0 #a8360d; animation:wbc-beat 1s ease-in-out infinite; }

.wbc-fb { flex:none; min-height:26px; text-align:center; font-size:19px; font-weight:700; color:var(--muted); }
.wbc-fb.bad { color:var(--bad); } .wbc-fb.good { color:var(--ok); }
.wbc-fb .hl { color:var(--hot); }

.wbc-out { flex:none; padding:22px 18px; border-radius:18px; background:var(--panel); border:1px solid var(--line); text-align:center; }
.wbc-out .big { font-size:34px; font-weight:800; letter-spacing:-.02em; line-height:1.05; }
.wbc-out .sub { font-size:17px; font-weight:600; color:var(--muted); margin-top:8px; line-height:1.35; }
.wbc-out .sub b { color:var(--text); }
.wbc-out .tag { display:inline-block; margin-top:14px; padding:6px 12px; border-radius:999px; font-size:14px; font-weight:800; letter-spacing:.06em; background:rgba(255,255,255,.08); color:var(--muted); }

.wbc-alpha { flex:none; margin-top:auto; padding:12px; border-radius:16px; background:var(--panel); border:1px solid var(--line); }
.wbc-alpha .cap { display:flex; justify-content:space-between; font-size:14px; font-weight:600; color:var(--muted); margin-bottom:9px; }
.wbc-alpha .cap b { color:var(--text); font-weight:800; }
.wbc-tiles { display:grid; grid-template-columns:repeat(10, 1fr); gap:5px; }
.wbc-tiles span { aspect-ratio:1; display:grid; place-items:center; border-radius:7px; font-weight:800; font-size:15px; background:rgba(255,255,255,.06); color:rgba(255,255,255,.3); transition:background .3s, color .3s; }
.wbc-tiles span.on { background:var(--me); color:var(--on, #fff); }
.wbc-tiles span.new { animation:wbc-pop .5s cubic-bezier(.2,1.8,.4,1); }
.wbc-msg { flex:none; text-align:center; font-size:17px; font-weight:500; color:var(--muted); line-height:1.4; padding:4px 6px; }
.wbc-msg b { color:var(--text); }

.wbc.spectator .wbc-formwrap, .wbc.spectator .wbc-alpha, .wbc.spectator .wbc-fb, .wbc.spectator .wbc-top,
.wbc.dead .wbc-formwrap, .wbc.dead .wbc-fb, .wbc.dead .wbc-alpha,
.wbc.intro .wbc-formwrap, .wbc.intro .wbc-prompt, .wbc.intro .wbc-fb,
.wbc.over .wbc-formwrap, .wbc.over .wbc-prompt, .wbc.over .wbc-fb { display:none; }
.wbc.dead .wbc-turn, .wbc.spectator .wbc-turn { min-height:52px; font-size:17px; }
.wbc-flash { position:absolute; inset:0; pointer-events:none; opacity:0; }
.wbc-flash.go { animation:wbc-flash .6s ease-out; }
@keyframes wbc-flash { from { opacity:1; } }

/* short screens / keyboard up: keep status, letters and input; drop the extras */
.wbc.compact { gap:7px; padding-top:8px; padding-bottom:8px; }
.wbc.compact .wbc-alpha, .wbc.compact .wbc-msg { display:none; }
.wbc.compact .wbc-top { min-height:24px; }
.wbc.compact .wbc-hearts { height:22px; }
.wbc.compact .wbc-turn { min-height:46px; padding:6px 12px; font-size:17px; }
.wbc.compact.mine .wbc-turn { font-size:22px; }
.wbc.compact .wbc-turn .disc { width:30px; height:30px; font-size:13px; }
.wbc.compact .wbc-prompt .lbl { display:none; }
.wbc.compact .wbc-prompt .letters { font-size:52px; }
.wbc.compact .wbc-form input { height:58px; }
.wbc.tiny .wbc-top { min-height:20px; }
.wbc.tiny .wbc-hearts { height:18px; }
.wbc.tiny .wbc-count { font-size:13px; }
.wbc.tiny .wbc-turn { min-height:40px; }
.wbc.tiny .wbc-prompt .letters { font-size:40px; }

body[data-layout='landscape'] .wbc { display:grid; grid-template-columns:1.3fr 1fr; grid-auto-rows:min-content; column-gap:16px; row-gap:8px; padding:10px 14px; }
body[data-layout='landscape'] .wbc > * { grid-column:1; }
body[data-layout='landscape'] .wbc > .wbc-top { grid-column:2; grid-row:1; }
body[data-layout='landscape'] .wbc > .wbc-alpha { grid-column:2; grid-row:2 / span 4; margin-top:0; }
body[data-layout='landscape'] .wbc-prompt .letters { font-size:48px; }
`;

export default function start(ctx) {
  const root = document.createElement('div');
  root.className = 'wbc intro';
  root.innerHTML = `<style>${CSS}</style>
    <div class="wbc-top"><div class="wbc-hearts"></div><div class="wbc-count"></div></div>
    <div class="wbc-turn">Get ready</div>
    <div class="wbc-prompt"><div class="lbl">Type a word containing</div><div class="letters">…</div></div>
    <div class="wbc-formwrap">
      <form class="wbc-form" autocomplete="off">
        <input type="text" maxlength="30" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="send" inputmode="text" placeholder="Wait for your turn" />
        <button type="submit">Go</button>
      </form>
      <button class="wbc-tap" type="button" hidden>Tap to type</button>
    </div>
    <div class="wbc-fb"></div>
    <div class="wbc-out" hidden></div>
    <div class="wbc-msg" hidden></div>
    <div class="wbc-alpha"><div class="cap"><span>Alphabet bonus</span><span class="cnt"></span></div><div class="wbc-tiles"></div></div>
    <div class="wbc-flash"></div>`;
  ctx.container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const turnEl = $('.wbc-turn');
  const lblEl = $('.wbc-prompt .lbl');
  const lettersEl = $('.wbc-prompt .letters');
  const form = $('.wbc-form');
  const input = $('.wbc-form input');
  const goBtn = $('.wbc-form button');
  const tapBtn = $('.wbc-tap');
  const fbEl = $('.wbc-fb');
  const outEl = $('.wbc-out');
  const msgEl = $('.wbc-msg');
  const heartsEl = $('.wbc-hearts');
  const countEl = $('.wbc-count');
  const tilesEl = $('.wbc-tiles');
  const cntEl = $('.wbc-alpha .cnt');
  const flashEl = $('.wbc-flash');
  root.style.setProperty('--on', onColor(ctx.player.color));

  let st = null;
  let myTurn = false;
  let turnId = -1;
  let lastPrompt = null;
  let prevLetters = '';
  let prevHearts = -1;
  let sendTimer = 0;
  let lastSent = 0;
  let lastSentText = '';
  let fbTimer = 0;
  let fbHold = false; // a server message (reject/accept) owns the feedback line for a moment
  let boomTimer = 0;
  let destroyed = false;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const disc = (p) => `<span class="disc" style="background:${esc(p.color)};color:${onColor(p.color)}">${esc(initials(p.name))}</span>`;

  function feedback(html, cls, ms = 1800) {
    fbEl.className = `wbc-fb ${cls}`;
    fbEl.innerHTML = html;
    clearTimeout(fbTimer);
    fbHold = !!ms;
    if (ms) fbTimer = setTimeout(() => { fbHold = false; fbEl.innerHTML = ''; liveFeedback(); }, ms);
  }

  // live feedback while typing: does the word contain the letters yet?
  function liveFeedback() {
    if (fbHold) return;
    const text = input.value.toLowerCase();
    const p = (st?.prompt || '').toLowerCase();
    const has = !!(myTurn && p && text.includes(p));
    form.classList.toggle('has', has);
    if (!myTurn || !text) { fbEl.className = 'wbc-fb'; fbEl.innerHTML = myTurn ? 'Any real word with those letters' : ''; return; }
    if (has) { fbEl.className = 'wbc-fb good'; fbEl.innerHTML = 'Got the letters. Hit Go!'; }
    else { fbEl.className = 'wbc-fb'; fbEl.innerHTML = `Needs <span class="hl">${esc(p.toUpperCase())}</span>`; }
  }

  function flash(color) {
    flashEl.style.background = color;
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  }

  function formFx(cls) {
    form.classList.remove('bad', 'good');
    void form.offsetWidth;
    form.classList.add(cls);
    setTimeout(() => form.classList.remove(cls), 600);
  }

  function updateTap() {
    if (destroyed) return;
    tapBtn.hidden = !(myTurn && document.activeElement !== input);
  }

  function sendTyping(force = false) {
    if (!myTurn) return;
    const text = input.value;
    if (text === lastSentText && !force) return;
    const now = performance.now();
    const wait = 80 - (now - lastSent);
    if (wait > 0 && !force) {
      if (!sendTimer) sendTimer = setTimeout(() => { sendTimer = 0; sendTyping(); }, wait);
      return;
    }
    clearTimeout(sendTimer);
    sendTimer = 0;
    lastSent = now;
    lastSentText = text;
    ctx.send({ type: 'typing', text, turnId });
  }

  // ---------------------------------------------------------------- keyboard-safe layout
  // iOS doesn't shrink the page for the keyboard; it overlays it (and may pan the page). Fit the controller into
  // the part of the screen that's actually visible, and go compact when that's short.
  function fit() {
    if (destroyed) return;
    const vv = window.visualViewport;
    const rect = ctx.container.getBoundingClientRect();
    let top = 0;
    let h = rect.height;
    if (vv && vv.height < window.innerHeight - 80) {
      if (window.scrollY) window.scrollTo(0, 0);
      const visTop = Math.max(rect.top, vv.offsetTop);
      const visBottom = Math.min(rect.bottom, vv.offsetTop + vv.height);
      top = Math.max(0, visTop - rect.top);
      h = Math.max(160, visBottom - visTop);
    }
    root.style.top = top ? `${top}px` : '0';
    root.style.bottom = 'auto';
    root.style.height = `${h}px`;
    root.classList.toggle('compact', h < 560);
    root.classList.toggle('tiny', h < 330);
  }
  const vv = window.visualViewport;
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  window.addEventListener('resize', fit);
  const ro = new ResizeObserver(fit);
  ro.observe(ctx.container);

  // ---------------------------------------------------------------- render
  function render() {
    if (!st) return;
    const you = st.you || {};
    const wasMine = myTurn;
    const newTurn = st.turnId !== turnId;
    myTurn = st.phase === 'play' && st.holder?.id === ctx.player.id && !you.spectator && you.alive;
    turnId = st.turnId;
    if (st.phase !== 'boom' && newTurn) root.classList.remove('boomed');
    const dead = !you.spectator && you.alive === false && st.phase !== 'over';
    root.classList.toggle('mine', myTurn);
    root.classList.toggle('spectator', !!you.spectator);
    root.classList.toggle('dead', dead);
    root.classList.toggle('intro', st.phase === 'intro');
    root.classList.toggle('over', st.phase === 'over');

    // whose turn
    const h = st.holder;
    turnEl.classList.remove('won');
    if (st.phase === 'intro') turnEl.innerHTML = `<div>Get ready<small>${st.practice ? 'Practice round: watch the TV' : 'The rules are on the TV'}</small></div>`;
    else if (st.phase === 'over') {
      const w = st.winner;
      const won = w && w.id === ctx.player.id;
      turnEl.classList.toggle('won', !!won);
      turnEl.innerHTML = won ? '<div>You win!</div>' : w ? `${disc(w)}<div>${esc(w.name)} wins<small>Game over</small></div>` : '<div>Game over</div>';
    } else if (myTurn) turnEl.innerHTML = 'Your turn!';
    else if (st.phase === 'boom' && h) turnEl.innerHTML = h.id === ctx.player.id ? '<div>Boom!</div>' : `${disc(h)}<div>Boom! ${esc(h.name)} got hit</div>`;
    else if (h) turnEl.innerHTML = `${disc(h)}<div>${esc(h.name)}<small>has the bomb</small></div>`;
    else turnEl.innerHTML = '<div>Waiting…</div>';

    // letters
    const p = st.prompt || '';
    if (p !== lastPrompt) {
      lettersEl.textContent = p || '—';
      lettersEl.classList.remove('pop');
      void lettersEl.offsetWidth;
      if (p) lettersEl.classList.add('pop');
      lastPrompt = p;
    }
    lblEl.textContent = myTurn ? 'Type a word containing' : st.phase === 'boom' && h ? `${h.id === ctx.player.id ? 'You' : h.name} missed` : h ? `${h.name}'s letters` : 'Letters';

    // out / spectating card
    let out = '';
    if (you.spectator) out = `<div class="big">Spectating</div><div class="sub">A game is already running.<br>You'll join when the next one starts.</div>`;
    else if (dead) {
      out = `<div class="big">You're out</div><div class="sub">${you.forfeit ? 'You were away too long. ' : ''}You played <b>${you.words || 0}</b> word${you.words === 1 ? '' : 's'}${you.longest ? `, longest <b>${esc(you.longest.toUpperCase())}</b>` : ''}.<br><b>${st.alive}</b> player${st.alive === 1 ? '' : 's'} still in.</div><div class="tag">SPECTATING</div>`;
    }
    outEl.hidden = !out;
    if (out) outEl.innerHTML = out;

    let msg = '';
    if (st.phase === 'intro') msg = `Type a real word containing the letters on the bomb, then it passes on. <b>Don't be holding it when it blows.</b>`;
    msgEl.hidden = !msg;
    msgEl.innerHTML = msg;

    // input
    if (newTurn || (myTurn && !wasMine)) {
      input.value = '';
      lastSentText = '';
      form.classList.remove('bad', 'good', 'has');
    }
    input.placeholder = myTurn ? 'Type here' : 'Wait for your turn';
    if (myTurn && !wasMine) {
      ctx.vibrate('turn');
      flash('rgba(255,90,31,.35)');
      fbHold = false;
      try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    }
    if (!myTurn && document.activeElement === input && (dead || you.spectator || st.phase !== 'play' && st.phase !== 'boom')) input.blur();
    liveFeedback();
    setTimeout(updateTap, 60);

    // lives, words, alphabet
    if (!you.spectator) {
      const slots = you.slots || you.hearts || 0;
      let html = '';
      for (let i = 0; i < slots; i++) {
        const full = i < you.hearts;
        const fx = prevHearts >= 0 && you.hearts > prevHearts && i === you.hearts - 1 ? ' gained' : prevHearts > you.hearts && i === you.hearts ? ' lost' : '';
        html += HEART_SVG.replace('<svg', `<svg class="${full ? 'full' : 'empty'}${fx}"`);
      }
      heartsEl.innerHTML = html;
      prevHearts = you.hearts;
      countEl.innerHTML = `<b>${you.words || 0}</b> word${you.words === 1 ? '' : 's'} · <b>${st.alive}</b>/${st.total} in`;
      const letters = you.letters || '';
      const bonus = st.bonus || BONUS_LETTERS;
      tilesEl.innerHTML = bonus.split('').map((c) => `<span class="${letters.includes(c) ? `on${prevLetters.includes(c) ? '' : ' new'}` : ''}">${c.toUpperCase()}</span>`).join('');
      cntEl.innerHTML = `<b>${letters.length}</b> of ${bonus.length} for an extra life`;
      prevLetters = letters;
    }
    fit();
  }

  // ---------------------------------------------------------------- input
  input.addEventListener('input', () => {
    if (!myTurn) { input.value = ''; return; }
    const clean = input.value.toLowerCase().replace(/[^a-z]/g, '');
    if (clean !== input.value) input.value = clean;
    if (fbHold && fbEl.classList.contains('bad')) { fbHold = false; clearTimeout(fbTimer); }
    liveFeedback();
    sendTyping();
  });
  input.addEventListener('focus', () => { updateTap(); setTimeout(fit, 300); });
  input.addEventListener('blur', () => setTimeout(updateTap, 30));
  // keep focus in the input when pressing Go (so the phone keyboard stays up)
  goBtn.addEventListener('pointerdown', (e) => { if (document.activeElement === input) e.preventDefault(); });
  goBtn.addEventListener('mousedown', (e) => { if (document.activeElement === input) e.preventDefault(); });
  tapBtn.addEventListener('click', () => { input.focus(); ctx.vibrate('tap'); updateTap(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!myTurn || !st) return;
    const text = input.value.toLowerCase().replace(/[^a-z]/g, '');
    if (!text) { formFx('bad'); return; }
    const prompt = (st.prompt || '').toLowerCase();
    if (prompt && !text.includes(prompt)) {
      formFx('bad');
      feedback(`Needs <span class="hl">${esc(prompt.toUpperCase())}</span>`, 'bad');
      ctx.vibrate('error');
      return;
    }
    sendTyping(true);
    ctx.send({ type: 'submit', text, turnId });
    try { input.focus({ preventScroll: true }); } catch { /* noop */ }
  });

  // ---------------------------------------------------------------- messages
  ctx.onMessage((msg) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'state': st = msg; render(); break;
      case 'reject':
        if (msg.turnId !== turnId) break;
        formFx('bad');
        feedback(esc(msg.reason), 'bad');
        ctx.vibrate('error');
        break;
      case 'accept':
        formFx('good');
        feedback(`${esc(String(msg.word || '').toUpperCase())}. Passed!`, 'good', 1500);
        flash('rgba(74,222,128,.22)');
        ctx.vibrate('success');
        break;
      case 'boom':
        root.classList.add('boomed');
        clearTimeout(boomTimer);
        boomTimer = setTimeout(() => root.classList.remove('boomed'), 2500);
        flash('rgba(255,60,40,.55)');
        feedback(msg.eliminated ? 'That was your last life' : 'You lost a life', 'bad', 2500);
        break;
      case 'bonus':
        flash('rgba(255,197,49,.35)');
        feedback(msg.gained ? 'Alphabet bonus: +1 life!' : 'Alphabet complete (lives are full)', 'good', 2500);
        ctx.vibrate('boost');
        break;
      default:
    }
  });

  ctx.send({ type: 'hello' });
  fit();

  return {
    destroy() {
      destroyed = true;
      clearTimeout(sendTimer);
      clearTimeout(fbTimer);
      clearTimeout(boomTimer);
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
      ro.disconnect();
      root.remove();
    },
  };
}

function onColor(css) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = '#000';
  c.fillStyle = css;
  const v = c.fillStyle;
  const rgb = v.startsWith('#') ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) : (v.match(/\d+/g) || [255, 255, 255]).map(Number);
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return lum > 0.62 ? '#16171b' : '#ffffff';
}
