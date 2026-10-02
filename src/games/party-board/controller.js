// Party Board — phone controller. A pure renderer of the state the screen sends ({type:'state', s}).
// Dark, flat, thumb-sized. Laid out for landscape (status panel left, actions right); portrait still works.
// Star/coin/item icons and the player's portrait arrive once as rendered images ({type:'art'}).

const CSS = `
.pbc{position:absolute;inset:0;display:grid;grid-template-columns:minmax(150px,30%) 1fr;font-family:Figtree,system-ui,sans-serif;color:#fff;background:#14161d;--pc:var(--me)}
.pbc *{box-sizing:border-box}
.pbc .ci,.pbc .si{display:inline-block;width:1em;height:1em;vertical-align:-.14em;margin:0 .06em;background-size:contain;background-repeat:no-repeat;background-position:center;font-style:normal}
.pbc .ci{background-image:var(--pbc-coin,radial-gradient(circle,#ffc61a 60%,#d98a00 62%,#d98a00 70%,transparent 72%))}
.pbc .si{background-image:var(--pbc-star,none)}
.pbc.full{grid-template-columns:1fr}
.pbc.full .pbc-side{display:none}
body[data-layout='portrait'] .pbc{grid-template-columns:1fr;grid-template-rows:auto 1fr}
body[data-layout='portrait'] .pbc.full{grid-template-rows:1fr}
.pbc-side{padding:12px 14px;display:flex;flex-direction:column;gap:6px;justify-content:center;background:#1c1f29;min-width:0;box-shadow:inset 0 4px 0 var(--pc)}
body[data-layout='portrait'] .pbc-side{flex-direction:row;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:8px 12px}
.pbc-who{display:flex;align-items:center;gap:10px;min-width:0}
.pbc-pt{flex:none;width:52px;height:52px;border-radius:50%;background:var(--pc);position:relative}
.pbc-pt img{position:absolute;inset:-14% -8% 0;width:116%;height:114%;object-fit:contain}
body[data-layout='portrait'] .pbc-pt{width:40px;height:40px}
.pbc-name{font-weight:800;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pbc-stats{display:flex;gap:14px;font-size:28px;font-weight:800;line-height:1.1}
body[data-layout='portrait'] .pbc-stats{font-size:22px}
.pbc-sub{color:#9aa0b8;font-size:14px;font-weight:600}
.pbc-items{display:flex;gap:6px;min-height:30px;align-items:center}
.pbc-items img{height:30px}
.pbc-main{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:14px 16px;min-width:0;min-height:0;overflow:hidden;text-align:center}
.pbc-clock{position:absolute;left:0;top:0;height:5px;background:#ffb21a;border-radius:0 4px 4px 0}
.pbc-title{font-size:clamp(22px,6vmin,36px);font-weight:800;line-height:1.08}
.pbc-text{font-size:clamp(17px,5vmin,28px);font-weight:600;line-height:1.25;color:#e3e6f3}
.pbc-text b{color:#fff}
.pbc-hit{width:min(48vmin,210px);height:min(48vmin,210px);border-radius:50%;border:0;font-family:inherit;font-weight:800;font-size:clamp(28px,9vmin,46px);color:#fff;background:var(--pc);box-shadow:0 10px 0 color-mix(in srgb,var(--pc) 55%,#000),0 16px 30px rgba(0,0,0,.45);touch-action:manipulation;animation:pbcPulse 1.1s infinite;letter-spacing:.02em}
.pbc-hit small{display:block;font-size:.42em;font-weight:700;opacity:.9}
.pbc-hit:active{transform:translateY(8px);box-shadow:0 2px 0 color-mix(in srgb,var(--pc) 55%,#000)}
.pbc-hit:disabled{animation:none;opacity:.5}
@keyframes pbcPulse{50%{transform:scale(1.05)}}
.pbc-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;width:100%}
.pbc-btn{--bc:#3d8bff;border:0;border-radius:18px;padding:12px 18px;font-family:inherit;font-weight:800;font-size:clamp(17px,4.8vmin,26px);color:#fff;background:var(--bc);box-shadow:0 6px 0 color-mix(in srgb,var(--bc) 55%,#000);min-height:60px;touch-action:manipulation;flex:1 1 0;min-width:120px;max-width:340px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.pbc-btn small{display:block;font-weight:600;font-size:.62em;opacity:.9}
.pbc-btn:active{transform:translateY(4px);box-shadow:0 2px 0 color-mix(in srgb,var(--bc) 55%,#000)}
.pbc-btn:disabled{opacity:.4}
.pbc-btn.ghost{--bc:#2c3040}
.pbc-item{--bc:#3a3f55;flex:0 1 auto;min-width:0;padding:6px 14px 6px 8px;min-height:50px;font-size:clamp(14px,4vmin,19px);flex-direction:row;gap:8px}
.pbc-item img{height:34px}
.pbc-shop{display:flex;gap:10px;width:100%;justify-content:center}
.pbc-card{flex:1 1 0;max-width:210px;background:#1f2230;border-radius:18px;padding:8px;display:flex;flex-direction:column;gap:4px;align-items:center}
.pbc-card img{height:46px}
.pbc-card b{font-size:16px;font-weight:800}
.pbc-card p{margin:0;font-size:12px;color:#aab0c8;min-height:2.4em;font-weight:600}
.pbc-card .pbc-btn{min-width:0;width:100%;min-height:46px;font-size:18px;padding:6px;flex-direction:row;gap:4px}
.pbc-big{font-size:clamp(70px,28vmin,140px);line-height:1;font-weight:800}
.pbc-duel{position:absolute;inset:0;border:0;font-family:inherit;font-size:clamp(44px,15vmin,96px);font-weight:800;color:#fff;touch-action:manipulation;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.pbc-duel small{font-size:.3em;font-weight:700;opacity:.85}
.pbc-duel.ready{background:#2a2e3e}
.pbc-duel.go{background:#18c964;animation:pbcPulse .4s infinite}
.pbc-ready{--bc:#18c964;max-width:380px;font-size:clamp(24px,7.5vmin,36px);min-height:76px;flex:0 0 auto;width:min(380px,90%)}
.pbc-ctl{display:flex;gap:12px;justify-content:center;align-items:center;color:#aab0c8;font-size:15px;font-weight:700}
.pbc-ctl i{font-style:normal;display:inline-grid;place-items:center;min-width:42px;height:42px;border-radius:999px;background:#ff4d6d;color:#fff;font-weight:800;padding:0 10px;font-size:13px}
.pbc-tag{color:#9aa0b8;font-weight:800;font-size:13px;letter-spacing:.1em;text-transform:uppercase}
.pbc-turns{display:flex;gap:12px;width:100%;justify-content:center}
.pbc-turns .pbc-btn{max-width:180px;font-size:clamp(20px,6vmin,30px);min-height:96px}
.pbc-turns .pbc-btn b{font-size:1.4em;line-height:1}
.pbc-place{font-size:clamp(64px,24vmin,124px);font-weight:800;line-height:1}
.dots i{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:#9aa0b8;animation:pbcDot 1s infinite}
.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes pbcDot{50%{transform:translateY(-6px)}}
`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const PLACE_COLORS = ['#ffc61a', '#c9d2e3', '#e59a5c'];

export default function start(ctx) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'pbc';
  root.innerHTML = '<div class="pbc-side"></div><div class="pbc-main"><div class="pbc-text">Connecting to the board <span class="dots"><i></i><i></i><i></i></span></div></div>';
  ctx.container.appendChild(root);
  const side = root.querySelector('.pbc-side');
  const main = root.querySelector('.pbc-main');
  let pad = null;
  let padRun = null;
  let lastKey = '';
  let lastSide = '';
  let clockTimer = 0;
  let lastState = null;
  const art = { star: '', coin: '', items: {}, portrait: '' };

  const answer = (s, data) => { ctx.vibrate(15); ctx.send({ type: 'answer', token: s.token, ...data }); };
  const itemImg = (id) => (art.items[id] ? `<img src="${art.items[id]}" alt="">` : '');

  function renderSide(me) {
    let html;
    if (!me || me.pending) {
      html = `<div class="pbc-who"><span class="pbc-pt"></span><span class="pbc-name">${esc(ctx.player.name)}</span></div><div class="pbc-sub">${me ? 'Joining at the next turn…' : 'Party Board'}</div>`;
    } else {
      side.style.setProperty('--pc', me.color);
      root.style.setProperty('--pc', me.color);
      html = `
        <div class="pbc-who"><span class="pbc-pt">${art.portrait ? `<img src="${art.portrait}" alt="">` : ''}</span><span class="pbc-name">${esc(me.piece)}</span></div>
        ${me.team ? `<div class="pbc-sub">Team: ${me.team.map(esc).join(', ')}</div>` : ''}
        <div class="pbc-stats"><span><i class="si"></i>${me.stars}</span><span><i class="ci"></i>${me.coins}</span></div>
        <div class="pbc-sub">${ord(me.rank)} of ${me.of}${me.turn ? ` · Turn ${me.turn}/${me.maxTurns}` : ''}${me.frenzy ? ' · Frenzy' : ''}</div>
        <div class="pbc-items">${me.items.map(itemImg).join('')}</div>`;
    }
    if (html !== lastSide) { lastSide = html; side.innerHTML = html; }
  }

  function killPad() {
    if (pad) { pad.destroy(); pad = null; padRun = null; }
  }

  function startClock(s) {
    clearInterval(clockTimer);
    if (!s.left || !s.total) return;
    const bar = document.createElement('div');
    bar.className = 'pbc-clock';
    main.appendChild(bar);
    const end = performance.now() + s.left;
    const tick = () => {
      const k = Math.max(0, (end - performance.now()) / s.total);
      bar.style.width = `${k * 100}%`;
      bar.style.background = k < 0.25 ? '#ff4d4d' : '#ffb21a';
      if (k <= 0) clearInterval(clockTimer);
    };
    tick();
    clockTimer = setInterval(tick, 100);
  }

  function render(s) {
    lastState = s;
    renderSide(s.me);
    if (s.view === 'mgPlay') {
      root.classList.add('full');
      if (padRun === s.run && pad) return;
      killPad();
      clearInterval(clockTimer);
      main.innerHTML = '';
      lastKey = '';
      const c = s.controls || {};
      // Gamepad inputs are wrapped so the board can route them to the running minigame only.
      const padCtx = { ...ctx, container: main, send: (d) => ctx.send({ type: 'mg', run: s.run, d }) };
      pad = ctx.kit.gamepad(padCtx, { stick: c.stick || 'analog', buttons: c.buttons?.length ? c.buttons : [{ id: 'a', label: 'A' }], hint: `<b>${esc(s.name)}</b><br>${c.hint || ''}` });
      padRun = s.run;
      return;
    }
    killPad();
    root.classList.toggle('full', s.view === 'duel');
    const key = JSON.stringify({ ...s, me: undefined, left: undefined });
    if (key === lastKey) return;
    lastKey = key;
    clearInterval(clockTimer);
    main.innerHTML = '';
    const h = (html) => { main.insertAdjacentHTML('beforeend', html); };
    switch (s.view) {
      case 'setup': {
        h('<div class="pbc-title">How long should the party be?</div>');
        h(`<div class="pbc-turns">${s.lengths.map((l, i) => `<button class="pbc-btn" data-t="${l.turns}" style="--bc:${['#18b85a', '#3d8bff', '#8a5cf6'][i]}">${esc(l.label)}<b>${l.turns}</b><small>turns · about ${l.min} min</small></button>`).join('')}</div>`);
        h(`<div class="pbc-sub">${s.players} player${s.players === 1 ? '' : 's'} connected</div>`);
        main.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { ctx.vibrate(25); ctx.send({ type: 'setup', turns: Number(b.dataset.t) }); main.innerHTML = '<div class="pbc-text">Starting the party!</div>'; }));
        break;
      }
      case 'roll': {
        h(`<div class="pbc-title">${esc(s.title || 'Your turn!')}</div>`);
        if (s.items?.length) {
          h(`<div class="pbc-row">${s.items.map((it) => `<button class="pbc-btn pbc-item" data-i="${it.i}">${itemImg(it.id)}<span>Use ${esc(it.name)}</span></button>`).join('')}</div>`);
          main.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { answer(s, { act: 'item', i: Number(b.dataset.i) }); main.querySelectorAll('button').forEach((x) => { x.disabled = true; }); }));
        }
        h(`<button class="pbc-hit">ROLL${s.dice > 1 ? '<small>× 2 dice</small>' : ''}</button>`);
        if (s.hint) h(`<div class="pbc-sub">${esc(s.hint)}</div>`);
        const hit = main.querySelector('.pbc-hit');
        hit.addEventListener('pointerdown', (e) => { e.preventDefault(); ctx.vibrate(40); answer(s, { act: 'roll' }); hit.disabled = true; main.querySelectorAll('.pbc-item').forEach((x) => { x.disabled = true; }); });
        ctx.vibrate([40, 30, 40]);
        break;
      }
      case 'rolled':
        h(`<div class="pbc-sub">You rolled</div><div class="pbc-big">${Number(s.n) || 0}</div><div class="pbc-text">Watch your piece on the TV</div>`);
        break;
      case 'choice': {
        h(`<div class="pbc-title">${esc(s.title)}</div>`);
        if (s.sub) h(`<div class="pbc-sub">${esc(s.sub)}</div>`);
        h(`<div class="pbc-row">${s.options.map((o, i) => `<button class="pbc-btn" data-i="${i}" style="--bc:${o.color || '#3d8bff'}">${o.label}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`);
        main.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { answer(s, { i: Number(b.dataset.i) }); main.querySelectorAll('button').forEach((x) => { x.disabled = x !== b; }); }));
        ctx.vibrate(30);
        break;
      }
      case 'confirm': {
        h(`${s.icon === 'star' && art.star ? `<img src="${art.star}" alt="" style="height:min(22vmin,96px)">` : ''}<div class="pbc-title">${esc(s.title)}</div><div class="pbc-text">${s.text || ''}</div>`);
        h(`<div class="pbc-row"><button class="pbc-btn" data-y="1" style="--bc:#e8a200">${esc(s.yes)}</button><button class="pbc-btn ghost" data-y="0">${esc(s.no)}</button></div>`);
        main.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => { answer(s, { yes: b.dataset.y === '1' }); main.querySelectorAll('button').forEach((x) => { x.disabled = true; }); }));
        ctx.vibrate([30, 30, 30]);
        break;
      }
      case 'shop': {
        h(`<div class="pbc-title" style="font-size:clamp(20px,5vmin,28px)">${esc(s.title)} <span class="pbc-sub">· you have <i class="ci"></i>${s.coins} · ${s.slots} slot${s.slots === 1 ? '' : 's'} free</span></div>`);
        h(`<div class="pbc-shop">${s.items.map((it) => `<div class="pbc-card">${itemImg(it.id)}<b>${esc(it.name)}</b><p>${esc(it.desc)}</p><button class="pbc-btn" data-b="${it.id}" style="--bc:#18b85a" ${it.can ? '' : 'disabled'}><i class="ci"></i>${it.price}</button></div>`).join('')}</div>`);
        h('<button class="pbc-btn ghost" data-leave="1" style="flex:0 0 auto;min-height:46px">Leave shop</button>');
        main.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => { answer(s, { buy: b.dataset.b }); main.querySelectorAll('button').forEach((x) => { x.disabled = true; }); }));
        main.querySelector('[data-leave]').addEventListener('click', () => { answer(s, { leave: true }); main.querySelectorAll('button').forEach((x) => { x.disabled = true; }); });
        break;
      }
      case 'duel': {
        const go = s.phase === 'go';
        h(`<button class="pbc-duel ${go ? 'go' : 'ready'}">${go ? 'TAP!' : 'WAIT…'}<small>${go ? '' : `vs ${esc(s.vs || '')} · tap on GO`}</small></button>`);
        const b = main.querySelector('.pbc-duel');
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); ctx.vibrate(30); ctx.send({ type: 'press' }); b.disabled = true; b.style.opacity = '.6'; });
        break;
      }
      case 'mgIntro': {
        const c = s.controls || {};
        h(`<div class="pbc-tag">${s.mode === 'teams' ? 'Team minigame' : 'Minigame'}</div><div class="pbc-title">${esc(s.name)}</div><div class="pbc-text" style="font-size:clamp(15px,4.4vmin,21px)">${s.instructions || ''}</div>`);
        h(`<div class="pbc-ctl">${c.stick && c.stick !== 'none' ? `<span>${c.stick === 'dpad' ? 'D-pad' : 'Stick'} to move</span>` : ''}${(c.buttons || []).map((b) => `<span><i style="background:${b.color || '#ff4d6d'}">${esc(b.label)}</i></span>`).join('')}</div>`);
        if (s.ready) h('<button class="pbc-btn pbc-ready" disabled>Ready! Waiting for others…</button>');
        else {
          h('<button class="pbc-btn pbc-ready">READY!</button>');
          main.querySelector('.pbc-ready').addEventListener('click', (e) => { ctx.vibrate(30); ctx.send({ type: 'ready' }); e.currentTarget.disabled = true; e.currentTarget.textContent = 'Ready! Waiting for others…'; });
          ctx.vibrate([40, 40, 40]);
        }
        break;
      }
      case 'mgResult': {
        const col = PLACE_COLORS[s.place - 1] || '#9aa0b8';
        h(`<div class="pbc-tag">${esc(s.name)}</div><div class="pbc-place" style="color:${col}">${ord(s.place)}</div><div class="pbc-text">place · <b>+${s.reward}</b> <i class="ci"></i></div>`);
        ctx.vibrate(s.place === 1 ? [60, 40, 60, 40, 120] : 40);
        break;
      }
      default:
        h(`<div class="pbc-text">${s.text || 'Watch the TV!'}</div>`);
    }
    startClock(s);
  }

  ctx.onMessage((msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'state') render(msg.s);
    else if (msg.type === 'art') {
      Object.assign(art, { star: msg.star || '', coin: msg.coin || '', items: msg.items || {}, portrait: msg.portrait || '' });
      if (art.star) root.style.setProperty('--pbc-star', `url(${art.star})`);
      if (art.coin) root.style.setProperty('--pbc-coin', `url(${art.coin})`);
      lastSide = '';
      lastKey = '';
      if (lastState) render(lastState);
    } else if (msg.type === 'vibrate') ctx.vibrate(msg.ms ?? 40);
    else if (msg.type === 'mgmsg' && pad && (msg.d?.type === 'hint' || msg.d?.type === 'status')) pad.setHint(msg.d.html ?? msg.d.text ?? '');
  });
  ctx.send({ type: 'hello' });

  return {
    destroy() {
      clearInterval(clockTimer);
      killPad();
      root.remove();
      style.remove();
    },
  };
}
