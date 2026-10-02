// DOM overlay for the board: player cards, turn counter, banners, captions, sheets, roulettes, flying coins.
// Flat, bold, readable from the couch. Star/coin/item icons and player portraits are rendered from the 3D
// models (see icons.js) and injected with setArt().
import { escapeHtml } from '../../sdk/screen-kit.js';
import { sfx } from '../../sdk/audio.js';

const CSS = `
.pb-hud{position:absolute;inset:0;pointer-events:none;font-family:Figtree,system-ui,sans-serif;color:#fff;z-index:10;overflow:hidden;--ink:#20232e;--sub:#6b7085}
.pb-hud *{box-sizing:border-box}
.ci,.si{display:inline-block;width:1.15em;height:1.15em;vertical-align:-.2em;margin:0 .06em;font-style:normal;background-size:contain;background-repeat:no-repeat;background-position:center}
.ci{background-image:radial-gradient(circle at 50% 50%,#ffc61a 58%,#d98a00 60%,#d98a00 70%,transparent 72%)}
.si{background-image:var(--pb-star,none)}
.pb-top{position:absolute;top:14px;left:16px;display:flex;gap:10px;align-items:center}
.pb-pill{background:#fff;color:var(--ink);border-radius:999px;padding:8px 22px;font-weight:800;font-size:clamp(16px,1.7vw,30px);box-shadow:0 4px 0 rgba(0,0,0,.14),0 8px 20px rgba(0,0,0,.14);display:flex;gap:8px;align-items:center;letter-spacing:.01em}
.pb-pill b{color:#ff5a3c;font-size:1.2em}
.pb-pill[hidden]{display:none}
.pb-pill.frenzy{background:#ff4f3a;color:#fff}
.pb-cards{position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:clamp(6px,.7vw,12px);padding:0 12px;flex-wrap:nowrap}
.pb-card{position:relative;min-width:0;flex:0 1 220px;background:#fff;color:var(--ink);border-radius:18px;padding:6px 10px 6px 6px;display:flex;align-items:center;gap:8px;box-shadow:inset 0 -5px 0 var(--c),0 8px 22px rgba(0,0,0,.22);transition:transform .35s cubic-bezier(.2,1.6,.4,1),opacity .3s}
.pb-card.active{transform:translateY(-14px) scale(1.06);box-shadow:inset 0 -5px 0 var(--c),0 0 0 5px var(--c),0 16px 34px rgba(0,0,0,.3)}
.pb-card.dim{opacity:.5}
.pb-av{flex:none;width:clamp(40px,3.8vw,66px);height:clamp(40px,3.8vw,66px);border-radius:50%;background:var(--c);position:relative;overflow:visible}
.pb-av img{position:absolute;left:-8%;bottom:0;width:116%;height:116%;object-fit:contain;border-radius:0 0 50% 50%}
.pb-av .pb-team{position:absolute;bottom:-6px;right:-8px;background:var(--ink);color:#fff;border-radius:999px;font-size:11px;padding:1px 6px;font-weight:800;z-index:2}
.pb-info{min-width:0;flex:1}
.pb-name{font-weight:800;font-size:clamp(12px,1.1vw,20px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.15}
.pb-stats{display:flex;gap:10px;font-weight:800;font-size:clamp(15px,1.45vw,26px);line-height:1.1}
.pb-stats span{display:flex;align-items:center;gap:2px;white-space:nowrap}
.pb-stats .pb-coins.bump{animation:pbBump .3s}
@keyframes pbBump{50%{transform:scale(1.35);color:#e08a00}}
.pb-items{display:flex;gap:2px;height:clamp(14px,1.3vw,22px)}
.pb-items img{height:100%;width:auto}
.pb-rank{position:absolute;top:-11px;left:-8px;background:var(--ink);color:#fff;border-radius:999px;font-weight:800;font-size:clamp(11px,.95vw,16px);padding:1px 8px;box-shadow:0 3px 6px rgba(0,0,0,.25)}
.pb-rank.r1{background:#ffc61a;color:#3d2600}
.pb-caption{position:absolute;left:50%;bottom:clamp(110px,15vh,170px);transform:translateX(-50%) translateY(20px);background:rgba(24,26,36,.9);border-radius:18px;padding:12px 28px;font-size:clamp(18px,2vw,36px);font-weight:700;opacity:0;transition:all .3s;text-align:center;max-width:80vw}
.pb-caption.show{opacity:1;transform:translateX(-50%) translateY(0)}
.pb-banner{position:absolute;inset:0;display:grid;place-items:center;z-index:20}
.pb-banner span{font-size:clamp(44px,7.5vw,132px);font-weight:800;color:#fff;-webkit-text-stroke:6px var(--ink);paint-order:stroke fill;text-shadow:0 10px 0 rgba(0,0,0,.22);animation:pbIn .55s cubic-bezier(.2,1.6,.4,1);text-align:center;line-height:1.02;letter-spacing:-.01em}
.pb-banner small{display:block;font-size:.36em;-webkit-text-stroke:4px var(--ink);margin-bottom:.15em}
.pb-banner.out span{animation:pbOut .3s forwards}
.pb-banner img{height:1em;vertical-align:-.12em}
@keyframes pbIn{from{transform:scale(.2) rotate(-6deg);opacity:0}}
@keyframes pbOut{to{transform:scale(1.4);opacity:0}}
.pb-modal{position:absolute;inset:0;display:grid;place-items:center;z-index:25;background:rgba(16,18,28,.45);animation:pbFade .3s}
@keyframes pbFade{from{opacity:0}}
.pb-sheet{background:#fff;color:var(--ink);border-radius:30px;padding:clamp(18px,2.4vw,42px);min-width:min(720px,86vw);max-width:92vw;max-height:88vh;overflow:hidden;box-shadow:0 12px 0 rgba(0,0,0,.14),0 30px 80px rgba(0,0,0,.4);animation:pbIn .5s cubic-bezier(.2,1.5,.4,1);text-align:center}
.pb-sheet h1{margin:0 0 6px;font-size:clamp(30px,3.8vw,68px);line-height:1.04;font-weight:800;letter-spacing:-.01em}
.pb-sheet h2{margin:0 0 12px;font-size:clamp(18px,1.9vw,32px);color:var(--sub);font-weight:700}
.pb-sheet p{font-size:clamp(17px,1.7vw,30px);margin:8px 0;font-weight:600}
.pb-tag{display:inline-block;color:var(--sub);font-weight:800;font-size:clamp(13px,1.2vw,22px);margin-bottom:6px;letter-spacing:.08em;text-transform:uppercase}
.pb-ready{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:16px}
.pb-chip{display:flex;align-items:center;gap:8px;background:#f0f1f5;border-radius:999px;padding:4px 16px 4px 4px;font-weight:700;font-size:clamp(14px,1.25vw,22px);opacity:.6;transition:all .25s}
.pb-chip.on{opacity:1;background:var(--c);color:#fff;transform:scale(1.06)}
.pb-chip .pt{width:clamp(30px,2.6vw,44px);height:clamp(30px,2.6vw,44px);border-radius:50%;background:var(--c);position:relative;flex:none}
.pb-chip .pt img{position:absolute;inset:-12% -8% 0;width:116%;height:112%;object-fit:contain}
.pb-chip .ok{font-weight:800}
.pb-controls{display:flex;justify-content:center;gap:28px;align-items:center;margin:16px 0 6px;flex-wrap:wrap}
.pb-ctl{display:flex;flex-direction:column;align-items:center;gap:6px;font-weight:700;color:var(--sub);font-size:clamp(13px,1.15vw,20px)}
.pb-ctl .stick{width:70px;height:70px;border-radius:50%;background:#e7e9f0;position:relative}
.pb-ctl .stick:after{content:'';position:absolute;inset:18px;border-radius:50%;background:#6b7085}
.pb-ctl .dpad{width:70px;height:70px;position:relative}
.pb-ctl .dpad:before,.pb-ctl .dpad:after{content:'';position:absolute;background:#6b7085;border-radius:6px}
.pb-ctl .dpad:before{left:24px;right:24px;top:2px;bottom:2px}
.pb-ctl .dpad:after{top:24px;bottom:24px;left:2px;right:2px}
.pb-ctl .btn{min-width:64px;height:64px;padding:0 10px;border-radius:999px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:15px;box-shadow:0 5px 0 rgba(0,0,0,.22)}
.pb-timer{height:10px;border-radius:999px;background:#e7e9f0;overflow:hidden;margin-top:18px}
.pb-timer div{height:100%;background:#ffb21a;width:100%;transition:width linear}
.pb-rows{display:flex;flex-direction:column;gap:8px;margin-top:12px;text-align:left}
.pb-row{display:flex;align-items:center;gap:12px;background:#f3f4f8;border-radius:16px;padding:6px 16px 6px 8px;font-size:clamp(16px,1.6vw,28px);font-weight:700;animation:pbSlide .4s backwards;box-shadow:inset 6px 0 0 var(--c)}
.pb-row .pl{width:2.4em;font-weight:800;color:var(--sub);text-align:center}
.pb-row .pt{width:1.8em;height:1.8em;border-radius:50%;background:var(--c);position:relative;flex:none}
.pb-row .pt img{position:absolute;inset:-14% -8% 0;width:116%;height:114%;object-fit:contain}
.pb-row .nm{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb-row .sc{color:var(--sub)}
.pb-row .gain{color:#d98200;font-weight:800;min-width:3.4em;text-align:right}
.pb-row.first{background:#fff4cc}
@keyframes pbSlide{from{transform:translateX(-40px);opacity:0}}
.pb-roulette{margin:18px auto 6px;height:clamp(64px,7vw,110px);width:min(560px,70vw);overflow:hidden;border-radius:20px;background:var(--ink);position:relative}
.pb-roulette:after{content:'';position:absolute;inset:0;border-radius:20px;box-shadow:inset 0 0 0 5px #ffc61a;pointer-events:none}
.pb-roulette .strip{position:absolute;left:0;right:0;top:0}
.pb-roulette .it{height:clamp(64px,7vw,110px);display:grid;place-items:center;color:#fff;font-weight:800;font-size:clamp(24px,2.9vw,50px);white-space:nowrap}
.pb-pop{position:absolute;font-weight:800;font-size:clamp(30px,3.2vw,60px);-webkit-text-stroke:5px var(--ink);paint-order:stroke fill;transform:translate(-50%,-50%);animation:pbRise 1.4s forwards;white-space:nowrap}
@keyframes pbRise{0%{transform:translate(-50%,-30%) scale(.4);opacity:0}15%{transform:translate(-50%,-60%) scale(1.15);opacity:1}100%{transform:translate(-50%,-170%) scale(1);opacity:0}}
.pb-fly{position:absolute;font-size:clamp(22px,2.2vw,38px);transition:left .7s cubic-bezier(.5,0,.6,1),top .7s cubic-bezier(.4,-0.6,.6,1),transform .7s;transform:translate(-50%,-50%) scale(1.2);filter:drop-shadow(0 3px 2px rgba(0,0,0,.35))}
.pb-vs{display:flex;align-items:center;justify-content:center;gap:clamp(16px,3vw,60px);margin:16px 0}
.pb-vs .side{display:flex;flex-direction:column;align-items:center;gap:8px;font-weight:800;font-size:clamp(18px,1.9vw,34px)}
.pb-vs .big{width:clamp(90px,10vw,170px);height:clamp(90px,10vw,170px);border-radius:50%;background:var(--c);position:relative;transition:transform .3s}
.pb-vs .big img{position:absolute;inset:-14% -8% 0;width:116%;height:114%;object-fit:contain}
.pb-vs .vs{font-size:clamp(40px,5vw,92px);font-weight:800;color:#ff3d5a}
.pb-vs .side.win .big{box-shadow:0 0 0 8px #ffc61a;transform:scale(1.1)}
.pb-big{font-size:clamp(60px,8vw,140px);line-height:1;font-weight:800}
.pb-big img{height:1em}
.pb-order{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:16px}
.pb-order .o{display:flex;flex-direction:column;align-items:center;gap:6px;background:#f3f4f8;border-radius:20px;padding:10px 14px;min-width:110px;font-weight:800;font-size:clamp(14px,1.25vw,22px);box-shadow:inset 0 -5px 0 var(--c)}
.pb-order .num{width:clamp(56px,5vw,88px);height:clamp(56px,5vw,88px);border-radius:16px;background:var(--ink);color:#fff;display:grid;place-items:center;font-size:clamp(30px,3vw,54px)}
.pb-order .o.done .num{background:var(--c);animation:pbBump .35s}
.pb-legend{display:flex;justify-content:center;gap:18px;flex-wrap:wrap;margin:16px 0}
.pb-legend div{display:flex;align-items:center;gap:8px;font-weight:700;font-size:clamp(14px,1.35vw,24px)}
.pb-legend i{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;font-style:normal;font-size:20px}
.pb-legend .si{width:34px;height:34px}
.pb-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:30}
.pb-flash.go{animation:pbFlash .5s}
@keyframes pbFlash{20%{opacity:.8}}
`;

export function createHud(container) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'pb-hud';
  root.innerHTML = `
    <div class="pb-top"><div class="pb-pill turn"></div><div class="pb-pill frenzy" hidden>FINAL FRENZY</div></div>
    <div class="pb-cards"></div>
    <div class="pb-caption"></div>
    <div class="pb-flash"></div>`;
  container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const cardsEl = $('.pb-cards');
  let cardEls = new Map();
  let captionTimer = 0;
  const hud = {
    root,
    /** Rendered art: { star, coin } data URLs. */
    setArt({ star, coin } = {}) {
      if (star) root.style.setProperty('--pb-star', `url(${star})`);
      if (coin) style.textContent += `.pb-hud .ci{background-image:url(${coin})}`;
    },
    show(on) { root.style.display = on ? '' : 'none'; },
    setTurn(turn, max) { const el = $('.turn'); el.hidden = !turn; el.innerHTML = turn ? `TURN <b>${turn}</b> / ${max}` : ''; },
    setFrenzy(on) { $('.frenzy').hidden = !on; },
    /** pieces: [{ idx, name, portrait, color, coins, stars, items:[{icon,name}], members, rank }] */
    renderCards(pieces, activeIdx = -1) {
      const ids = pieces.map((p) => p.idx).join(',');
      if (cardsEl.dataset.ids !== ids) {
        cardsEl.dataset.ids = ids;
        cardsEl.innerHTML = '';
        cardEls = new Map();
        for (const p of pieces) {
          const el = document.createElement('div');
          el.className = 'pb-card';
          el.innerHTML = `<div class="pb-rank"></div><div class="pb-av"><img alt=""></div>
            <div class="pb-info"><div class="pb-name"></div><div class="pb-stats"><span class="pb-stars"><i class="si"></i><b></b></span><span class="pb-coins"><i class="ci"></i><b></b></span></div><div class="pb-items"></div></div>`;
          cardsEl.appendChild(el);
          cardEls.set(p.idx, el);
        }
      }
      const compact = pieces.length > 6;
      for (const p of pieces) {
        const el = cardEls.get(p.idx);
        el.style.setProperty('--c', p.color);
        el.classList.toggle('active', p.idx === activeIdx);
        el.classList.toggle('dim', !!p.allAway);
        const img = el.querySelector('.pb-av img');
        if (p.portrait && img.getAttribute('src') !== p.portrait) img.src = p.portrait;
        const av = el.querySelector('.pb-av');
        let team = av.querySelector('.pb-team');
        if (p.members > 1) {
          if (!team) { team = document.createElement('span'); team.className = 'pb-team'; av.appendChild(team); }
          team.textContent = `×${p.members}`;
        } else team?.remove();
        el.querySelector('.pb-name').textContent = p.name;
        el.querySelector('.pb-stars b').textContent = p.stars;
        el.querySelector('.pb-coins b').textContent = p.shownCoins ?? p.coins;
        const itemsKey = p.items.map((i) => i.id).join(',');
        const itemsEl = el.querySelector('.pb-items');
        if (itemsEl.dataset.k !== itemsKey) { itemsEl.dataset.k = itemsKey; itemsEl.innerHTML = p.items.map((i) => (i.icon ? `<img src="${i.icon}" alt="">` : '')).join(''); }
        itemsEl.style.display = compact && !p.items.length ? 'none' : '';
        const rk = el.querySelector('.pb-rank');
        rk.textContent = ['1st', '2nd', '3rd'][p.rank - 1] || `${p.rank}th`;
        rk.className = `pb-rank ${p.rank === 1 ? 'r1' : ''}`;
      }
    },
    cardRect(idx) { return cardEls.get(idx)?.getBoundingClientRect() || null; },
    bumpCoins(idx, value) {
      const el = cardEls.get(idx)?.querySelector('.pb-coins');
      if (!el) return;
      el.querySelector('b').textContent = value;
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    },
    caption(html, ms = 2600) {
      const c = $('.pb-caption');
      c.innerHTML = html;
      c.classList.add('show');
      clearTimeout(captionTimer);
      if (ms) captionTimer = setTimeout(() => c.classList.remove('show'), ms);
    },
    hideCaption() { $('.pb-caption').classList.remove('show'); },
    banner(html, ms = 1600, speed = 1) {
      const d = document.createElement('div');
      d.className = 'pb-banner';
      d.innerHTML = `<span>${html}</span>`;
      root.appendChild(d);
      return new Promise((r) => setTimeout(() => { d.classList.add('out'); setTimeout(() => { d.remove(); r(); }, 300 / speed); }, ms / speed));
    },
    flash() { const f = $('.pb-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); },
    /** Modal sheet; returns { el, set(html), close() } */
    modal(html) {
      const m = document.createElement('div');
      m.className = 'pb-modal';
      m.innerHTML = `<div class="pb-sheet">${html}</div>`;
      root.appendChild(m);
      return {
        el: m.querySelector('.pb-sheet'),
        set(h) { m.querySelector('.pb-sheet').innerHTML = h; },
        close() { m.style.transition = 'opacity .25s'; m.style.opacity = '0'; setTimeout(() => m.remove(), 260); },
      };
    },
    /** Slot-machine strip that lands on items[final]. */
    async roulette(sheetEl, items, final, { speed = 1, spins = 3 } = {}) {
      const box = document.createElement('div');
      box.className = 'pb-roulette';
      const strip = document.createElement('div');
      strip.className = 'strip';
      const seq = [];
      for (let s = 0; s < spins; s++) seq.push(...items);
      seq.push(...items.slice(0, final + 1));
      strip.innerHTML = seq.map((t) => `<div class="it">${t}</div>`).join('');
      box.appendChild(strip);
      sheetEl.appendChild(box);
      const h = box.clientHeight || 90;
      const total = (seq.length - 1) * h;
      const dur = 2600 / speed;
      const t0 = performance.now();
      let lastIdx = -1;
      await new Promise((res) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / dur);
          const e = 1 - (1 - k) ** 4;
          const y = e * total;
          strip.style.transform = `translateY(${-y}px)`;
          const idx = Math.floor(y / h + 0.5);
          if (idx !== lastIdx) { lastIdx = idx; sfx.play('tick'); }
          if (k < 1 && root.isConnected) requestAnimationFrame(step);
          else res();
        };
        // rAF can stall in background tabs: a timer guarantees the roulette always lands.
        setTimeout(() => { strip.style.transform = `translateY(${-total}px)`; res(); }, dur + 400);
        requestAnimationFrame(step);
      });
      sfx.play('correct');
      box.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 350 });
    },
    popup(x, y, html, color = '#ffd23f') {
      const d = document.createElement('div');
      d.className = 'pb-pop';
      d.style.left = `${x}px`;
      d.style.top = `${y}px`;
      d.style.color = color;
      d.innerHTML = html;
      root.appendChild(d);
      setTimeout(() => d.remove(), 1500);
    },
    /** Fly `n` icons from screen point to a piece card; onEach() per arrival. */
    fly(x, y, idx, n, icon, onEach, speed = 1) {
      const r = hud.cardRect(idx);
      if (!r) { for (let i = 0; i < n; i++) onEach?.(i); return Promise.resolve(); }
      const host = root.getBoundingClientRect();
      const tx = r.left - host.left + r.width * 0.62;
      const ty = r.top - host.top + r.height * 0.5;
      const jobs = [];
      for (let i = 0; i < n; i++) {
        jobs.push(new Promise((res) => {
          setTimeout(() => {
            const d = document.createElement('div');
            d.className = 'pb-fly';
            d.innerHTML = icon;
            d.style.left = `${x + (Math.random() - 0.5) * 40}px`;
            d.style.top = `${y + (Math.random() - 0.5) * 30}px`;
            root.appendChild(d);
            requestAnimationFrame(() => requestAnimationFrame(() => {
              d.style.transitionDuration = `${0.7 / speed}s`;
              d.style.left = `${tx}px`;
              d.style.top = `${ty}px`;
              d.style.transform = 'translate(-50%,-50%) scale(.7)';
            }));
            setTimeout(() => { d.remove(); onEach?.(i); res(); }, 720 / speed);
          }, (i * 70) / speed);
        }));
      }
      return Promise.all(jobs);
    },
    destroy() { clearTimeout(captionTimer); root.remove(); style.remove(); },
  };
  return hud;
}

export const COIN = '<i class="ci"></i>';
export const STAR = '<i class="si"></i>';

/** Round portrait (rendered monster) on the player's colour. */
export function portrait(src, color, cls = 'pt') {
  return `<span class="${cls}" style="--c:${color}">${src ? `<img src="${src}" alt="">` : ''}</span>`;
}

export function chip(p, on = false, src = '') {
  return `<div class="pb-chip ${on ? 'on' : ''}" style="--c:${p.color}">${portrait(src, p.color)}${escapeHtml(p.name)}${on ? ' <span class="ok">✓</span>' : ''}</div>`;
}

export function controlsDiagram(controls = {}) {
  const parts = [];
  if (controls.stick === 'analog') parts.push('<div class="pb-ctl"><div class="stick"></div>Move</div>');
  else if (controls.stick === 'dpad') parts.push('<div class="pb-ctl"><div class="dpad"></div>D-pad</div>');
  const colors = ['#ff4d6d', '#3d8bff', '#34c759', '#ffb300'];
  (controls.buttons || []).forEach((b, i) => parts.push(`<div class="pb-ctl"><div class="btn" style="background:${b.color || colors[i % 4]}">${escapeHtml(b.label || b.id)}</div>Button ${escapeHtml(b.id.toUpperCase())}</div>`));
  return `<div class="pb-controls">${parts.join('')}</div>${controls.hint ? `<p style="color:var(--sub);font-size:clamp(14px,1.3vw,24px)">${controls.hint}</p>` : ''}`;
}
