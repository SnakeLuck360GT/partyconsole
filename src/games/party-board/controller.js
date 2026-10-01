// Party Board — phone controller. A pure renderer of the state the screen sends ({type:'state', s}).
// Laid out for landscape (status panel left, actions right); portrait still works.

const CSS = `
.ci{display:inline-block;width:.85em;height:.85em;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff6b0,#ffc61a 45%,#e08a00);box-shadow:inset 0 -.12em 0 rgba(120,60,0,.35),0 0 0 .1em #b86a00;vertical-align:-.08em;margin:0 .08em;font-style:normal}
.pbc{position:absolute;inset:0;display:grid;grid-template-columns:minmax(150px,30%) 1fr;font-family:Fredoka,system-ui,sans-serif;color:#fff;background:radial-gradient(circle at 80% 0%,color-mix(in srgb,var(--me) 35%,#151a33),#0d1022 70%)}
.pbc.full{grid-template-columns:1fr}
.pbc.full .pbc-side{display:none}
@media (orientation:portrait){.pbc{grid-template-columns:1fr;grid-template-rows:auto 1fr}}
.pbc-side{padding:12px;display:flex;flex-direction:column;gap:8px;justify-content:center;background:rgba(255,255,255,.05);border-right:2px solid rgba(255,255,255,.08);min-width:0}
@media (orientation:portrait){.pbc-side{flex-direction:row;flex-wrap:wrap;align-items:center;border-right:0;border-bottom:2px solid rgba(255,255,255,.08);padding:8px 12px}}
.pbc-piece{font-weight:700;font-size:17px;display:flex;align-items:center;gap:8px;min-width:0}
.pbc-piece span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pbc-dot{width:16px;height:16px;border-radius:50%;background:var(--pc,var(--me));border:2px solid #fff;flex:none}
.pbc-stats{display:flex;gap:12px;font-size:26px;font-weight:700}
.pbc-sub{color:#aab3dc;font-size:14px;font-weight:500}
.pbc-items{font-size:22px;letter-spacing:4px;min-height:26px}
.pbc-main{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:10px 14px;min-width:0;min-height:0;overflow:hidden;text-align:center}
.pbc-title{font-size:clamp(20px,5.5vmin,34px);font-weight:700;line-height:1.1}
.pbc-text{font-size:clamp(17px,5vmin,28px);font-weight:500;line-height:1.25;color:#e6e9ff}
.pbc-hit{width:min(46vmin,200px);height:min(46vmin,200px);border-radius:50%;border:0;font-family:inherit;font-weight:700;font-size:clamp(22px,7vmin,36px);color:#fff;line-height:1;background:radial-gradient(circle at 35% 30%,#ff9db0,#ff3d6b 55%,#b3123a);box-shadow:0 10px 0 #8a0f2e,0 16px 30px rgba(0,0,0,.45);text-shadow:0 3px 0 rgba(0,0,0,.25);touch-action:manipulation;animation:pbcPulse 1.1s infinite}
.pbc-hit:active{transform:translateY(8px);box-shadow:0 2px 0 #8a0f2e}
@keyframes pbcPulse{50%{transform:scale(1.05)}}
.pbc-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;width:100%}
.pbc-btn{--bc:#3d8bff;border:0;border-radius:18px;padding:12px 18px;font-family:inherit;font-weight:700;font-size:clamp(16px,4.6vmin,24px);color:#fff;background:var(--bc);box-shadow:0 6px 0 color-mix(in srgb,var(--bc) 55%,#000);min-height:56px;touch-action:manipulation;flex:1 1 0;min-width:120px;max-width:340px}
.pbc-btn small{display:block;font-weight:500;font-size:.62em;opacity:.9}
.pbc-btn:active{transform:translateY(4px);box-shadow:0 2px 0 color-mix(in srgb,var(--bc) 55%,#000)}
.pbc-btn:disabled{opacity:.4}
.pbc-btn.ghost{--bc:#2a3157}
.pbc-item{--bc:#7a5cff;flex:0 1 auto;min-width:0;padding:8px 14px;min-height:46px;font-size:clamp(14px,4vmin,19px)}
.pbc-shop{display:flex;gap:10px;width:100%;justify-content:center}
.pbc-card{flex:1 1 0;max-width:200px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.15);border-radius:18px;padding:8px;display:flex;flex-direction:column;gap:4px;align-items:center}
.pbc-card .em{font-size:34px}
.pbc-card b{font-size:16px}
.pbc-card p{margin:0;font-size:12px;color:#c4cbef;min-height:2.4em}
.pbc-card .pbc-btn{min-width:0;width:100%;min-height:44px;font-size:17px;padding:6px}
.pbc-big{font-size:clamp(54px,22vmin,110px);line-height:1}
.pbc-duel{position:absolute;inset:0;border:0;font-family:inherit;font-size:clamp(40px,14vmin,90px);font-weight:700;color:#fff;touch-action:manipulation}
.pbc-duel.ready{background:#3a3f63}
.pbc-duel.go{background:#18c964;animation:pbcPulse .4s infinite}
.pbc-ready{--bc:#18c964;max-width:360px;font-size:clamp(22px,7vmin,34px);min-height:72px;flex:0 0 auto;width:min(360px,90%)}
.pbc-ctl{display:flex;gap:10px;justify-content:center;align-items:center;color:#aab3dc;font-size:14px}
.pbc-ctl i{font-style:normal;display:inline-grid;place-items:center;min-width:38px;height:38px;border-radius:50%;background:#ff4d6d;color:#fff;font-weight:700;padding:0 6px;font-size:12px}
.pbc-turns{display:flex;gap:12px;width:100%;justify-content:center}
.pbc-turns .pbc-btn{max-width:170px;font-size:clamp(22px,7vmin,34px);min-height:80px}
.dots i{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:#aab3dc;animation:pbcDot 1s infinite}
.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes pbcDot{50%{transform:translateY(-6px)}}
`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

export default function start(ctx) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'pbc';
  root.innerHTML = '<div class="pbc-side"></div><div class="pbc-main"><div class="pbc-text">Connecting to the board… <span class="dots"><i></i><i></i><i></i></span></div></div>';
  ctx.container.appendChild(root);
  const side = root.querySelector('.pbc-side');
  const main = root.querySelector('.pbc-main');
  let pad = null;
  let padRun = null;
  let lastKey = '';

  const answer = (s, data) => { ctx.vibrate(15); ctx.send({ type: 'answer', token: s.token, ...data }); };

  function renderSide(me) {
    if (!me || me.pending) {
      side.innerHTML = `<div class="pbc-piece"><span class="pbc-dot"></span><span>${esc(ctx.player.name)}</span></div><div class="pbc-sub">Joining next turn…</div>`;
      return;
    }
    side.style.setProperty('--pc', me.color);
    side.innerHTML = `
      <div class="pbc-piece"><span class="pbc-dot"></span><span>${esc(me.piece)}</span></div>
      ${me.team ? `<div class="pbc-sub">Team: ${me.team.map(esc).join(', ')}</div>` : ''}
      <div class="pbc-stats"><span>⭐${me.stars}</span><span><i class="ci"></i>${me.coins}</span></div>
      <div class="pbc-sub">${ord(me.rank)} of ${me.of}${me.turn ? ` · Turn ${me.turn}/${me.maxTurns}` : ''}${me.frenzy ? ' · 🔥' : ''}</div>
      <div class="pbc-items">${me.items.length ? me.items.join(' ') : '<span class="pbc-sub" style="letter-spacing:0">No items</span>'}</div>`;
  }

  function killPad() {
    if (pad) { pad.destroy(); pad = null; padRun = null; }
  }

  function render(s) {
    renderSide(s.me);
    if (s.view === 'mgPlay') {
      root.classList.add('full');
      if (padRun === s.run && pad) return;
      killPad();
      main.innerHTML = '';
      const c = s.controls || {};
      // Gamepad inputs are wrapped so the board can route them to the running minigame only.
      const padCtx = { ...ctx, container: main, send: (d) => ctx.send({ type: 'mg', run: s.run, d }) };
      pad = ctx.kit.gamepad(padCtx, { stick: c.stick || 'analog', buttons: c.buttons?.length ? c.buttons : [{ id: 'a', label: 'A' }], hint: c.hint || esc(s.name) });
      padRun = s.run;
      return;
    }
    killPad();
    root.classList.toggle('full', s.view === 'duel');
    const key = JSON.stringify({ ...s, me: undefined });
    if (key === lastKey) return;
    lastKey = key;
    main.innerHTML = '';
    const h = (html) => { main.insertAdjacentHTML('beforeend', html); };
    switch (s.view) {
      case 'setup': {
        h('<div class="pbc-title">👑 How long should the party be?</div>');
        h(`<div class="pbc-turns">${s.turns.map((t, i) => `<button class="pbc-btn" data-t="${t}" style="--bc:${['#18c964', '#3d8bff', '#b06bff'][i]}">${t}<small>turns · ~${Math.round(t * 2.4)} min</small></button>`).join('')}</div>`);
        h(`<div class="pbc-sub">${s.players} player${s.players === 1 ? '' : 's'} ready</div>`);
        main.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { ctx.vibrate(25); ctx.send({ type: 'setup', turns: Number(b.dataset.t) }); main.innerHTML = '<div class="pbc-text">Starting the party! 🎉</div>'; }));
        break;
      }
      case 'roll': {
        h(`<div class="pbc-title">${esc(s.title || 'Your turn!')}</div>`);
        if (s.items?.length) {
          h(`<div class="pbc-row">${s.items.map((it) => `<button class="pbc-btn pbc-item" data-i="${it.i}">${it.emoji} ${esc(it.name)}</button>`).join('')}</div>`);
          main.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { answer(s, { act: 'item', i: Number(b.dataset.i) }); main.querySelectorAll('button').forEach((x) => { x.disabled = true; }); }));
        }
        h(`<button class="pbc-hit">HIT THE<br>DICE!${s.dice > 1 ? '<br>×2' : ''}</button>`);
        if (s.hint) h(`<div class="pbc-sub">${esc(s.hint)}</div>`);
        const hit = main.querySelector('.pbc-hit');
        hit.addEventListener('pointerdown', (e) => { e.preventDefault(); ctx.vibrate(40); answer(s, { act: 'roll' }); hit.disabled = true; hit.style.animation = 'none'; hit.style.opacity = '.5'; });
        ctx.vibrate([40, 30, 40]);
        break;
      }
      case 'choice': {
        h(`<div class="pbc-title">${esc(s.title)}</div>`);
        if (s.sub) h(`<div class="pbc-sub">${esc(s.sub)}</div>`);
        h(`<div class="pbc-row">${s.options.map((o, i) => `<button class="pbc-btn" data-i="${i}" style="--bc:${o.color || '#3d8bff'}">${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</button>`).join('')}</div>`);
        main.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { answer(s, { i: Number(b.dataset.i) }); main.querySelectorAll('button').forEach((x) => { x.disabled = x !== b; }); }));
        ctx.vibrate(30);
        break;
      }
      case 'confirm': {
        h(`<div class="pbc-title">${esc(s.title)}</div><div class="pbc-text">${s.text || ''}</div>`);
        h(`<div class="pbc-row"><button class="pbc-btn" data-y="1" style="--bc:#ffb300">${s.yes}</button><button class="pbc-btn ghost" data-y="0">${esc(s.no)}</button></div>`);
        main.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => { answer(s, { yes: b.dataset.y === '1' }); main.querySelectorAll('button').forEach((x) => { x.disabled = true; }); }));
        ctx.vibrate([30, 30, 30]);
        break;
      }
      case 'shop': {
        h(`<div class="pbc-title">${esc(s.title)} <span class="pbc-sub">· <i class="ci"></i>${s.coins} · ${s.slots} slot${s.slots === 1 ? '' : 's'} free</span></div>`);
        h(`<div class="pbc-shop">${s.items.map((it) => `<div class="pbc-card"><div class="em">${it.emoji}</div><b>${esc(it.name)}</b><p>${esc(it.desc)}</p><button class="pbc-btn" data-b="${it.id}" style="--bc:#18c964" ${it.can ? '' : 'disabled'}><i class="ci"></i> ${it.price}</button></div>`).join('')}</div>`);
        h('<button class="pbc-btn ghost" data-leave="1" style="flex:0 0 auto;min-height:44px">Leave shop</button>');
        main.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => { answer(s, { buy: b.dataset.b }); main.querySelectorAll('button').forEach((x) => { x.disabled = true; }); }));
        main.querySelector('[data-leave]').addEventListener('click', () => { answer(s, { leave: true }); main.querySelectorAll('button').forEach((x) => { x.disabled = true; }); });
        break;
      }
      case 'duel': {
        const go = s.phase === 'go';
        h(`<button class="pbc-duel ${go ? 'go' : 'ready'}">${go ? 'TAP!' : 'WAIT…'}<div style="font-size:.3em;font-weight:500">${go ? '' : `vs ${esc(s.vs || '')} · tap on GO!`}</div></button>`);
        const b = main.querySelector('.pbc-duel');
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); ctx.vibrate(30); ctx.send({ type: 'press' }); b.disabled = true; b.style.opacity = '.6'; });
        break;
      }
      case 'mgIntro': {
        const c = s.controls || {};
        h(`<div class="pbc-title">🎮 ${esc(s.name)}</div><div class="pbc-text" style="font-size:clamp(14px,4.2vmin,20px)">${s.instructions || ''}</div>`);
        h(`<div class="pbc-ctl">${c.stick && c.stick !== 'none' ? `<span>🕹️ ${c.stick === 'dpad' ? 'D-pad' : 'Stick'}</span>` : ''}${(c.buttons || []).map((b) => `<span><i style="background:${b.color || '#ff4d6d'}">${esc(b.label)}</i></span>`).join('')}</div>`);
        if (s.ready) h('<button class="pbc-btn pbc-ready" disabled>✓ Ready! Waiting…</button>');
        else {
          h('<button class="pbc-btn pbc-ready">READY!</button>');
          main.querySelector('.pbc-ready').addEventListener('click', (e) => { ctx.vibrate(30); ctx.send({ type: 'ready' }); e.currentTarget.disabled = true; e.currentTarget.textContent = '✓ Ready! Waiting…'; });
        }
        ctx.vibrate([40, 40, 40]);
        break;
      }
      case 'mgResult': {
        h(`<div class="pbc-big">${['🥇', '🥈', '🥉'][s.place - 1] || '🎖️'}</div><div class="pbc-title">${ord(s.place)} place!</div><div class="pbc-text">+${s.reward} <i class="ci"></i></div>`);
        ctx.vibrate(s.place === 1 ? [60, 40, 60, 40, 120] : 40);
        break;
      }
      default:
        h(`<div class="pbc-text">${s.text || 'Watch the TV!'}</div>`);
    }
  }

  ctx.onMessage((msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'state') render(msg.s);
    else if (msg.type === 'vibrate') ctx.vibrate(msg.ms ?? 40);
    else if (msg.type === 'mgmsg' && msg.d?.type === 'hint' && pad) pad.setHint(msg.d.html || '');
  });
  ctx.send({ type: 'hello' });

  return {
    destroy() {
      killPad();
      root.remove();
      style.remove();
    },
  };
}
