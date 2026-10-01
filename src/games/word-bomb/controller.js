// Word Bomb — phone controller. Shows the prompt, a keyboard-friendly input on your turn (live typing is
// streamed to the TV), your hearts and your alphabet-bonus tracker.
import { HEART_SVG, BONUS_LETTERS } from './common.js';

const CSS = `
.wbc { position:absolute; inset:0; display:flex; flex-direction:column; gap:10px; padding:12px 14px 14px; overflow-y:auto; overflow-x:hidden;
  background:radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--me) 22%, transparent), transparent 60%), linear-gradient(#1d1036, #0e0820); font-family:'Fredoka',system-ui,sans-serif; }
.wbc-status { text-align:center; font-size:20px; font-weight:600; padding:10px 12px; border-radius:18px; background:rgba(255,255,255,.07); border:2px solid rgba(255,255,255,.08); display:flex; align-items:center; justify-content:center; gap:10px; min-height:56px; transition:background .25s, border-color .25s; }
.wbc-status .av { width:34px; height:34px; border-radius:50%; display:grid; place-items:center; font-size:21px; flex:none; }
.wbc-status small { display:block; font-size:13px; font-weight:400; color:rgba(255,255,255,.65); }
.wbc.mine .wbc-status { background:linear-gradient(135deg, #ff7a2f, #ff3b5c); border-color:#fff; font-size:26px; font-weight:700; letter-spacing:.03em; animation:wbc-pulse 1s ease-in-out infinite; text-shadow:0 2px 4px rgba(0,0,0,.3); }
@keyframes wbc-pulse { 50% { transform:scale(1.03); box-shadow:0 0 24px rgba(255,90,40,.6); } }
.wbc.boomed .wbc-status { background:#b3261e; animation:wbc-shake .5s; }
.wbc-prompt { text-align:center; padding:6px 0 2px; }
.wbc-prompt .lbl { font-size:14px; color:rgba(255,255,255,.6); text-transform:uppercase; letter-spacing:.14em; }
.wbc-prompt .letters { font-size:64px; font-weight:700; letter-spacing:.1em; line-height:1.05; color:#fff; text-shadow:0 4px 0 #b3261e, 0 8px 20px rgba(0,0,0,.5); }
.wbc-prompt .letters.pop { animation:wbc-pop .45s cubic-bezier(.2,1.7,.4,1); }
@keyframes wbc-pop { from { transform:scale(.4); opacity:0; } }
.wbc-formwrap { position:relative; }
.wbc-form { display:flex; gap:10px; }
.wbc-form input { flex:1; min-width:0; font:inherit; font-size:30px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:12px 14px; border-radius:18px; border:3px solid rgba(255,255,255,.18);
  background:rgba(0,0,0,.35); color:#fff; outline:none; user-select:text; -webkit-user-select:text; caret-color:var(--me); transition:border-color .2s, background .2s; }
.wbc-form input::placeholder { color:rgba(255,255,255,.3); letter-spacing:.02em; text-transform:none; font-weight:500; font-size:20px; }
.wbc.mine .wbc-form input { border-color:var(--me); background:rgba(0,0,0,.5); }
.wbc-form button { font:inherit; font-size:24px; font-weight:700; border:0; border-radius:18px; padding:0 22px; color:#fff; background:var(--me); box-shadow:0 5px 0 color-mix(in srgb, var(--me) 55%, black); touch-action:manipulation; }
.wbc-form button:active { transform:translateY(4px); box-shadow:0 1px 0 color-mix(in srgb, var(--me) 55%, black); }
.wbc:not(.mine) .wbc-form { opacity:.45; }
.wbc-form.bad input { border-color:#ff3b5c !important; background:rgba(255,59,92,.18); animation:wbc-shake .4s; }
.wbc-form.good input { border-color:#3ef08a !important; background:rgba(62,240,138,.18); }
@keyframes wbc-shake { 20%,60% { transform:translateX(-10px); } 40%,80% { transform:translateX(10px); } }
.wbc-tap { position:absolute; inset:-4px; border:0; border-radius:20px; font:inherit; font-size:26px; font-weight:700; color:#1a1030; background:linear-gradient(135deg, #ffe066, #ffb020); box-shadow:0 6px 0 #b37400; animation:wbc-pulse .9s ease-in-out infinite; }
.wbc-fb { min-height:26px; text-align:center; font-size:20px; font-weight:600; }
.wbc-fb.bad { color:#ff7088; } .wbc-fb.good { color:#3ef08a; } .wbc-fb.info { color:rgba(255,255,255,.7); }
.wbc-info { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 14px; border-radius:16px; background:rgba(255,255,255,.06); }
.wbc-hearts { display:flex; gap:6px; height:30px; }
.wbc-hearts svg { height:100%; width:auto; overflow:visible; }
.wbc-hearts .full path { fill:#ff3b5c; stroke:#fff; stroke-width:1.6; }
.wbc-hearts .empty path { fill:rgba(255,255,255,.1); stroke:rgba(255,255,255,.35); stroke-width:1.6; }
.wbc-hearts .gained { animation:wbc-pop .8s cubic-bezier(.2,1.8,.4,1); }
.wbc-words { font-size:16px; color:rgba(255,255,255,.75); }
.wbc-words b { color:#fff; font-size:20px; }
.wbc-alpha { padding:10px 12px 12px; border-radius:16px; background:rgba(255,255,255,.06); }
.wbc-alpha .cap { display:flex; justify-content:space-between; font-size:13px; color:rgba(255,255,255,.6); margin-bottom:8px; text-transform:uppercase; letter-spacing:.1em; }
.wbc-alpha .cap b { color:#ffcf3d; }
.wbc-tiles { display:grid; grid-template-columns:repeat(10, 1fr); gap:5px; }
.wbc-tiles span { aspect-ratio:1; display:grid; place-items:center; border-radius:8px; font-weight:700; font-size:clamp(12px, 3.6vw, 18px); background:rgba(255,255,255,.07); color:rgba(255,255,255,.35); transition:background .3s, color .3s, transform .3s; }
.wbc-tiles span.on { background:var(--me); color:#fff; box-shadow:0 2px 0 color-mix(in srgb, var(--me) 55%, black); }
.wbc-tiles span.new { animation:wbc-pop .5s cubic-bezier(.2,1.8,.4,1); }
.wbc-msg { text-align:center; font-size:17px; color:rgba(255,255,255,.75); line-height:1.35; padding:4px 8px; }
.wbc-msg b { color:#ffcf3d; }
.wbc.spectator .wbc-formwrap, .wbc.spectator .wbc-info, .wbc.spectator .wbc-alpha, .wbc.spectator .wbc-fb,
.wbc.dead .wbc-formwrap, .wbc.dead .wbc-fb, .wbc.intro .wbc-formwrap, .wbc.intro .wbc-prompt, .wbc.over .wbc-formwrap, .wbc.over .wbc-prompt { display:none; }
.wbc-flash { position:absolute; inset:0; pointer-events:none; opacity:0; }
.wbc-flash.go { animation:wbc-flash .6s ease-out; }
@keyframes wbc-flash { from { opacity:1; } }
@media (orientation: landscape) and (max-height: 520px) {
  .wbc { display:grid; grid-template-columns:1.25fr 1fr; grid-auto-rows:min-content; column-gap:14px; row-gap:8px; padding:8px 12px; }
  .wbc > .wbc-status, .wbc > .wbc-prompt, .wbc > .wbc-formwrap, .wbc > .wbc-fb, .wbc > .wbc-msg { grid-column:1; }
  .wbc > .wbc-info { grid-column:2; grid-row:1; }
  .wbc > .wbc-alpha { grid-column:2; grid-row:2 / span 4; align-self:start; }
  .wbc-prompt .letters { font-size:44px; }
  .wbc-status { min-height:44px; font-size:17px; padding:6px 10px; }
  .wbc.mine .wbc-status { font-size:20px; }
  .wbc-form input { font-size:24px; padding:8px 12px; }
  .wbc-tiles span { font-size:14px; }
}
`;

export default function start(ctx) {
  const root = document.createElement('div');
  root.className = 'wbc intro';
  root.innerHTML = `<style>${CSS}</style>
    <div class="wbc-status">Get ready…</div>
    <div class="wbc-prompt"><div class="lbl">Type a word containing</div><div class="letters">…</div></div>
    <div class="wbc-formwrap">
      <form class="wbc-form" autocomplete="off">
        <input type="text" maxlength="30" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="send" placeholder="Wait for your turn…" />
        <button type="submit">GO</button>
      </form>
      <button class="wbc-tap" type="button" hidden>👆 TAP TO TYPE</button>
    </div>
    <div class="wbc-fb"></div>
    <div class="wbc-msg" hidden></div>
    <div class="wbc-info"><div class="wbc-hearts"></div><div class="wbc-words"></div></div>
    <div class="wbc-alpha"><div class="cap"><span>Alphabet bonus</span><span class="cnt"></span></div><div class="wbc-tiles"></div></div>
    <div class="wbc-flash"></div>`;
  ctx.container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const statusEl = $('.wbc-status');
  const lettersEl = $('.wbc-prompt .letters');
  const form = $('.wbc-form');
  const input = $('.wbc-form input');
  const goBtn = $('.wbc-form button');
  const tapBtn = $('.wbc-tap');
  const fbEl = $('.wbc-fb');
  const msgEl = $('.wbc-msg');
  const heartsEl = $('.wbc-hearts');
  const wordsEl = $('.wbc-words');
  const tilesEl = $('.wbc-tiles');
  const cntEl = $('.wbc-alpha .cnt');
  const flashEl = $('.wbc-flash');

  let st = null;
  let myTurn = false;
  let turnId = -1;
  let lastPrompt = '';
  let prevLetters = '';
  let prevHearts = -1;
  let sendTimer = 0;
  let lastSent = 0;
  let lastSentText = '';
  let fbTimer = 0;
  let boomTimer = 0;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function feedback(text, cls, ms = 1800) {
    fbEl.className = `wbc-fb ${cls}`;
    fbEl.textContent = text;
    clearTimeout(fbTimer);
    if (ms) fbTimer = setTimeout(() => { fbEl.textContent = ''; }, ms);
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

  function render() {
    if (!st) return;
    const you = st.you || {};
    const wasMine = myTurn;
    const newTurn = st.turnId !== turnId;
    myTurn = st.phase === 'play' && st.holder?.id === ctx.player.id && !you.spectator && you.alive;
    turnId = st.turnId;
    root.classList.toggle('mine', myTurn);
    root.classList.toggle('spectator', !!you.spectator);
    root.classList.toggle('dead', !you.spectator && you.alive === false);
    root.classList.toggle('intro', st.phase === 'intro');
    root.classList.toggle('over', st.phase === 'over');

    // status
    const h = st.holder;
    if (you.spectator) statusEl.innerHTML = '👀 Spectating<small>You\'ll join the next game</small>';
    else if (st.phase === 'intro') statusEl.innerHTML = '💣 Get ready!<small>Watch the TV for the rules</small>';
    else if (st.phase === 'over') statusEl.innerHTML = '🏁 Game over!';
    else if (you.alive === false) statusEl.innerHTML = `💀 You're out!<small>${h ? `${esc(h.avatar)} ${esc(h.name)} has the bomb` : 'Watch the rest of the game'}</small>`;
    else if (myTurn) statusEl.innerHTML = '💣 YOUR TURN!';
    else if (st.phase === 'boom' && h) statusEl.innerHTML = h.id === ctx.player.id ? '💥 BOOM!' : `💥 ${esc(h.name)} blew up!`;
    else if (h) statusEl.innerHTML = `<span class="av" style="background:${esc(h.color)}">${esc(h.avatar)}</span><span>${esc(h.name)} has the bomb</span>`;
    else statusEl.textContent = '…';

    // prompt
    const p = st.phase === 'boom' ? '💥' : st.prompt || '…';
    if (p !== lastPrompt) {
      lettersEl.textContent = p;
      lettersEl.classList.remove('pop');
      void lettersEl.offsetWidth;
      lettersEl.classList.add('pop');
      lastPrompt = p;
    }

    root.querySelector('.wbc-prompt .lbl').textContent = myTurn ? 'Type a word containing' : 'Current letters';

    // extra message
    let msg = '';
    if (you.spectator) msg = 'You joined mid-game. Watch the TV. You\'re in when the next game starts!';
    else if (st.phase === 'intro') msg = `Type a real word that contains the letters on the bomb. Don't be holding it when it explodes!${st.practice ? '<br><b>Practice mode</b>: survive as long as you can.' : ''}`;
    else if (you.alive === false) msg = `You played <b>${you.words}</b> word${you.words === 1 ? '' : 's'}. ${st.alive} player${st.alive === 1 ? '' : 's'} left.`;
    msgEl.hidden = !msg;
    msgEl.innerHTML = msg;

    // input state
    if (newTurn || (myTurn && !wasMine)) {
      input.value = '';
      lastSentText = '';
      form.classList.remove('bad', 'good');
    }
    input.placeholder = myTurn ? 'Type a word…' : 'Wait for your turn…';
    if (myTurn && !wasMine) {
      ctx.vibrate([70, 50, 70]);
      flash('rgba(255,120,40,.35)');
      fbEl.textContent = '';
      try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    }
    setTimeout(updateTap, 60);

    // hearts & letters
    if (!you.spectator) {
      const slots = you.slots || you.hearts || 0;
      let html = '';
      for (let i = 0; i < slots; i++) html += HEART_SVG.replace('<svg', `<svg class="${i < you.hearts ? `full${prevHearts >= 0 && you.hearts > prevHearts && i === you.hearts - 1 ? ' gained' : ''}` : 'empty'}"`);
      heartsEl.innerHTML = html;
      prevHearts = you.hearts;
      wordsEl.innerHTML = `<b>${you.words || 0}</b> word${you.words === 1 ? '' : 's'}`;
      const letters = you.letters || '';
      const bonus = st.bonus || BONUS_LETTERS;
      tilesEl.innerHTML = bonus.split('').map((c) => `<span class="${letters.includes(c) ? `on${prevLetters.includes(c) ? '' : ' new'}` : ''}">${c.toUpperCase()}</span>`).join('');
      cntEl.innerHTML = `<b>${letters.length}</b>/${bonus.length} → +1 ❤️`;
      prevLetters = letters;
    }
  }

  // ---------------------------------------------------------------- input
  input.addEventListener('input', () => {
    if (!myTurn) { input.value = ''; return; }
    const clean = input.value.toLowerCase().replace(/[^a-z]/g, '');
    if (clean !== input.value) input.value = clean;
    sendTyping();
  });
  input.addEventListener('focus', updateTap);
  input.addEventListener('blur', () => setTimeout(updateTap, 30));
  // keep focus in the input when pressing GO (so the phone keyboard stays up)
  goBtn.addEventListener('pointerdown', (e) => { if (document.activeElement === input) e.preventDefault(); });
  goBtn.addEventListener('mousedown', (e) => { if (document.activeElement === input) e.preventDefault(); });
  tapBtn.addEventListener('click', () => { input.focus(); ctx.vibrate(15); updateTap(); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!myTurn || !st) return;
    const text = input.value.toLowerCase().replace(/[^a-z]/g, '');
    if (!text) { formFx('bad'); return; }
    const prompt = (st.prompt || '').toLowerCase();
    if (prompt && !text.includes(prompt)) {
      formFx('bad');
      feedback(`Must contain ${prompt.toUpperCase()}`, 'bad');
      ctx.vibrate(120);
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
        feedback(`✖ ${msg.reason}`, 'bad');
        ctx.vibrate(140);
        break;
      case 'accept':
        formFx('good');
        feedback(`✓ ${String(msg.word || '').toUpperCase()}!`, 'good', 1500);
        flash('rgba(62,240,138,.25)');
        ctx.vibrate(30);
        break;
      case 'boom':
        root.classList.add('boomed');
        clearTimeout(boomTimer);
        boomTimer = setTimeout(() => root.classList.remove('boomed'), 2500);
        flash('rgba(255,60,40,.6)');
        feedback(msg.eliminated ? '💀 That was your last life!' : '💥 You lost a life!', 'bad', 2500);
        ctx.vibrate([300, 100, 400]);
        break;
      case 'bonus':
        flash('rgba(255,207,61,.4)');
        feedback(msg.gained ? '🔤 ALPHABET BONUS! +1 ❤️' : '🔤 Alphabet complete! (max lives)', 'good', 2500);
        ctx.vibrate([40, 40, 40, 40, 150]);
        break;
      default:
    }
  });

  ctx.send({ type: 'hello' });

  return {
    destroy() {
      clearTimeout(sendTimer);
      clearTimeout(fbTimer);
      clearTimeout(boomTimer);
      root.remove();
    },
  };
}
