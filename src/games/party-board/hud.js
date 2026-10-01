// DOM overlay for the board: player cards, turn counter, banners, captions, cards, roulettes, flying coins.
import { escapeHtml } from '../../sdk/screen-kit.js';
import { sfx } from '../../sdk/audio.js';

const CSS = `
.ci{display:inline-block;width:.85em;height:.85em;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff6b0,#ffc61a 45%,#e08a00);box-shadow:inset 0 -.12em 0 rgba(120,60,0,.35),0 0 0 .1em #b86a00;vertical-align:-.08em;margin:0 .08em;font-style:normal}
.pb-hud{position:absolute;inset:0;pointer-events:none;font-family:Fredoka,system-ui,sans-serif;color:#fff;z-index:10;overflow:hidden}
.pb-hud *{box-sizing:border-box}
.pb-top{position:absolute;top:14px;left:16px;display:flex;gap:10px;align-items:center}
.pb-pill{background:linear-gradient(180deg,#ffffff,#e6efff);color:#1d2340;border-radius:999px;padding:8px 20px;font-weight:700;font-size:clamp(16px,1.6vw,28px);box-shadow:0 5px 0 rgba(0,0,0,.18),0 10px 24px rgba(0,0,0,.2);border:3px solid #fff;display:flex;gap:8px;align-items:center}
.pb-pill b{color:#ff5a3c;font-size:1.25em}
.pb-pill.board{background:linear-gradient(180deg,#5ad1ff,#2f86ff);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.2)}
.pb-pill.frenzy{background:linear-gradient(180deg,#ffb347,#ff3d6b);color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.25);animation:pbPulse 1s infinite}
@keyframes pbPulse{50%{transform:scale(1.07)}}
.pb-cards{position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:clamp(6px,0.8vw,14px);padding:0 12px;flex-wrap:nowrap}
.pb-card{position:relative;min-width:0;flex:0 1 210px;background:linear-gradient(180deg,rgba(255,255,255,.97),rgba(232,239,255,.97));color:#1d2340;border-radius:20px;padding:8px 10px 8px 8px;display:flex;align-items:center;gap:8px;border:4px solid var(--c);box-shadow:0 6px 0 color-mix(in srgb,var(--c) 60%,#000),0 12px 26px rgba(0,0,0,.28);transition:transform .35s cubic-bezier(.2,1.6,.4,1),opacity .3s}
.pb-card.active{transform:translateY(-16px) scale(1.06);box-shadow:0 6px 0 color-mix(in srgb,var(--c) 60%,#000),0 0 0 6px rgba(255,255,255,.8),0 18px 40px rgba(0,0,0,.35)}
.pb-card.dim{opacity:.55}
.pb-av{flex:none;width:clamp(36px,3.4vw,58px);height:clamp(36px,3.4vw,58px);border-radius:50%;background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--c) 55%,#fff),var(--c));display:grid;place-items:center;font-size:clamp(20px,2vw,34px);border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.25);position:relative}
.pb-av .pb-team{position:absolute;bottom:-6px;right:-8px;background:#1d2340;color:#fff;border-radius:999px;font-size:11px;padding:1px 6px;font-weight:700}
.pb-info{min-width:0;flex:1}
.pb-name{font-weight:700;font-size:clamp(12px,1.05vw,19px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb-stats{display:flex;gap:10px;font-weight:700;font-size:clamp(14px,1.35vw,24px);line-height:1.1}
.pb-stats span{display:flex;align-items:center;gap:3px;white-space:nowrap}
.pb-stats .pb-coins.bump{animation:pbBump .3s}
@keyframes pbBump{50%{transform:scale(1.35);color:#ff9b00}}
.pb-items{font-size:clamp(11px,.9vw,16px);height:1.2em;letter-spacing:2px}
.pb-rank{position:absolute;top:-12px;left:-10px;background:#1d2340;color:#ffd23f;border:3px solid #fff;border-radius:999px;font-weight:700;font-size:clamp(11px,.9vw,16px);padding:0 7px;box-shadow:0 3px 6px rgba(0,0,0,.3)}
.pb-rank.r1{background:linear-gradient(180deg,#ffe066,#ffb300);color:#4a2a00}
.pb-caption{position:absolute;left:50%;bottom:clamp(110px,15vh,170px);transform:translateX(-50%) translateY(20px);background:rgba(20,24,48,.82);backdrop-filter:blur(6px);border-radius:22px;padding:12px 28px;font-size:clamp(18px,1.9vw,34px);font-weight:600;opacity:0;transition:all .3s;text-align:center;max-width:80vw;border:3px solid rgba(255,255,255,.25)}
.pb-caption.show{opacity:1;transform:translateX(-50%) translateY(0)}
.pb-banner{position:absolute;inset:0;display:grid;place-items:center;z-index:20}
.pb-banner span{font-size:clamp(44px,7.5vw,130px);font-weight:700;color:#fff;-webkit-text-stroke:5px #1d2340;paint-order:stroke fill;text-shadow:0 10px 0 rgba(0,0,0,.25),0 18px 40px rgba(0,0,0,.35);animation:pbIn .55s cubic-bezier(.2,1.6,.4,1);text-align:center;line-height:1.05}
.pb-banner small{display:block;font-size:.38em;-webkit-text-stroke:3px #1d2340}
.pb-banner.out span{animation:pbOut .3s forwards}
@keyframes pbIn{from{transform:scale(.2) rotate(-8deg);opacity:0}}
@keyframes pbOut{to{transform:scale(1.4);opacity:0}}
.pb-modal{position:absolute;inset:0;display:grid;place-items:center;z-index:25;background:radial-gradient(circle,rgba(10,14,40,.35),rgba(10,14,40,.7));animation:pbFade .3s}
@keyframes pbFade{from{opacity:0}}
.pb-sheet{background:linear-gradient(180deg,#ffffff,#eef3ff);color:#1d2340;border-radius:34px;padding:clamp(18px,2.4vw,40px);min-width:min(720px,86vw);max-width:92vw;max-height:88vh;overflow:hidden;box-shadow:0 14px 0 rgba(0,0,0,.18),0 30px 80px rgba(0,0,0,.45);border:6px solid #fff;animation:pbIn .5s cubic-bezier(.2,1.5,.4,1);text-align:center}
.pb-sheet h1{margin:0 0 6px;font-size:clamp(30px,3.6vw,64px);line-height:1.05}
.pb-sheet h2{margin:0 0 12px;font-size:clamp(18px,1.8vw,30px);color:#5a6390;font-weight:600}
.pb-sheet p{font-size:clamp(17px,1.6vw,28px);margin:8px 0}
.pb-tag{display:inline-block;background:#ffd23f;color:#4a2a00;border-radius:999px;padding:4px 16px;font-weight:700;font-size:clamp(14px,1.2vw,22px);margin-bottom:8px}
.pb-ready{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:16px}
.pb-chip{display:flex;align-items:center;gap:6px;background:#fff;border:3px solid var(--c);border-radius:999px;padding:4px 14px 4px 6px;font-weight:600;font-size:clamp(14px,1.2vw,22px);opacity:.55;transition:all .25s}
.pb-chip.on{opacity:1;background:var(--c);color:#fff;transform:scale(1.06)}
.pb-chip i{font-style:normal;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--c);color:#fff}
.pb-controls{display:flex;justify-content:center;gap:24px;align-items:center;margin:14px 0 4px;flex-wrap:wrap}
.pb-ctl{display:flex;flex-direction:column;align-items:center;gap:6px;font-weight:600;color:#5a6390;font-size:clamp(13px,1.1vw,20px)}
.pb-ctl .stick{width:70px;height:70px;border-radius:50%;background:radial-gradient(circle,#c9d3f5 30%,#e6ebfb 31%);border:4px solid #b9c4ea;position:relative}
.pb-ctl .stick:after{content:'';position:absolute;inset:18px;border-radius:50%;background:#5a6390}
.pb-ctl .dpad{font-size:44px;line-height:1;color:#5a6390}
.pb-ctl .btn{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:15px;box-shadow:0 5px 0 rgba(0,0,0,.25)}
.pb-timer{height:10px;border-radius:999px;background:#dfe5f8;overflow:hidden;margin-top:16px}
.pb-timer div{height:100%;background:linear-gradient(90deg,#ffb300,#ff5a3c);width:100%;transition:width linear}
.pb-rows{display:flex;flex-direction:column;gap:8px;margin-top:12px;text-align:left}
.pb-row{display:flex;align-items:center;gap:12px;background:#fff;border-radius:18px;padding:8px 16px;border:3px solid var(--c);font-size:clamp(16px,1.5vw,27px);font-weight:600;animation:pbSlide .4s backwards}
.pb-row .pl{width:2.2em;font-weight:700;color:#5a6390}
.pb-row .nm{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb-row .gain{color:#e69500;font-weight:700}
.pb-row.first{background:linear-gradient(90deg,#fff6cf,#fff)}
@keyframes pbSlide{from{transform:translateX(-40px);opacity:0}}
.pb-roulette{margin:18px auto 6px;height:clamp(64px,7vw,110px);width:min(560px,70vw);overflow:hidden;border-radius:22px;background:#1d2340;border:5px solid #ffd23f;position:relative;box-shadow:inset 0 0 30px rgba(0,0,0,.6)}
.pb-roulette .strip{position:absolute;left:0;right:0;top:0}
.pb-roulette .it{height:clamp(64px,7vw,110px);display:grid;place-items:center;color:#fff;font-weight:700;font-size:clamp(24px,2.8vw,48px);white-space:nowrap}
.pb-pop{position:absolute;font-weight:700;font-size:clamp(28px,3vw,56px);-webkit-text-stroke:4px #1d2340;paint-order:stroke fill;transform:translate(-50%,-50%);animation:pbRise 1.4s forwards;white-space:nowrap}
@keyframes pbRise{0%{transform:translate(-50%,-30%) scale(.4);opacity:0}15%{transform:translate(-50%,-60%) scale(1.15);opacity:1}100%{transform:translate(-50%,-170%) scale(1);opacity:0}}
.pb-fly{position:absolute;font-size:clamp(20px,2vw,34px);transition:left .7s cubic-bezier(.5,0,.6,1),top .7s cubic-bezier(.4,-0.6,.6,1),transform .7s;transform:translate(-50%,-50%) scale(1.2);filter:drop-shadow(0 3px 2px rgba(0,0,0,.35))}
.pb-vs{display:flex;align-items:center;justify-content:center;gap:clamp(16px,3vw,60px);margin:16px 0}
.pb-vs .side{display:flex;flex-direction:column;align-items:center;gap:8px;font-weight:700;font-size:clamp(18px,1.8vw,32px)}
.pb-vs .big{width:clamp(80px,9vw,150px);height:clamp(80px,9vw,150px);border-radius:50%;background:var(--c);display:grid;place-items:center;font-size:clamp(44px,5vw,84px);border:6px solid #fff;box-shadow:0 6px 0 rgba(0,0,0,.2)}
.pb-vs .vs{font-size:clamp(40px,5vw,90px);font-weight:700;color:#ff3d6b;-webkit-text-stroke:3px #1d2340;paint-order:stroke fill}
.pb-vs .side.win .big{box-shadow:0 0 0 8px #ffd23f,0 6px 0 rgba(0,0,0,.2);transform:scale(1.12);transition:transform .3s}
.pb-big{font-size:clamp(60px,8vw,140px);line-height:1}
.pb-order{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:16px}
.pb-order .o{display:flex;flex-direction:column;align-items:center;gap:6px;background:#fff;border:4px solid var(--c);border-radius:22px;padding:10px 14px;min-width:110px;font-weight:700;font-size:clamp(14px,1.2vw,22px)}
.pb-order .num{width:clamp(56px,5vw,86px);height:clamp(56px,5vw,86px);border-radius:18px;background:#1d2340;color:#fff;display:grid;place-items:center;font-size:clamp(30px,3vw,52px)}
.pb-order .o.done .num{background:var(--c);animation:pbBump .35s}
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
    <div class="pb-top"><div class="pb-pill turn"></div><div class="pb-pill board"></div><div class="pb-pill frenzy" hidden>🔥 FINAL FRENZY</div></div>
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
    show(on) { root.style.display = on ? '' : 'none'; },
    setTurn(turn, max) { $('.turn').innerHTML = turn ? `TURN <b>${turn}</b> / ${max}` : 'GET READY'; },
    setBoard(name) { $('.board').textContent = name; },
    setFrenzy(on) { $('.frenzy').hidden = !on; },
    /** pieces: [{ idx, name, avatar, color, coins, stars, items, members, rank }] */
    renderCards(pieces, activeIdx = -1) {
      const ids = pieces.map((p) => p.idx).join(',');
      if (cardsEl.dataset.ids !== ids) {
        cardsEl.dataset.ids = ids;
        cardsEl.innerHTML = '';
        cardEls = new Map();
        for (const p of pieces) {
          const el = document.createElement('div');
          el.className = 'pb-card';
          el.innerHTML = `<div class="pb-rank"></div><div class="pb-av"><span class="em"></span></div>
            <div class="pb-info"><div class="pb-name"></div><div class="pb-stats"><span class="pb-stars">⭐<b></b></span><span class="pb-coins"><i class="ci"></i><b></b></span></div><div class="pb-items"></div></div>`;
          cardsEl.appendChild(el);
          cardEls.set(p.idx, el);
        }
      }
      for (const p of pieces) {
        const el = cardEls.get(p.idx);
        el.style.setProperty('--c', p.color);
        el.classList.toggle('active', p.idx === activeIdx);
        el.classList.toggle('dim', !!p.allAway);
        el.querySelector('.em').textContent = p.avatar;
        const av = el.querySelector('.pb-av');
        let team = av.querySelector('.pb-team');
        if (p.members > 1) {
          if (!team) { team = document.createElement('span'); team.className = 'pb-team'; av.appendChild(team); }
          team.textContent = `×${p.members}`;
        } else team?.remove();
        el.querySelector('.pb-name').textContent = p.name;
        el.querySelector('.pb-stars b').textContent = p.stars;
        el.querySelector('.pb-coins b').textContent = p.shownCoins ?? p.coins;
        el.querySelector('.pb-items').textContent = p.items.map((i) => i.emoji).join(' ');
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
    destroy() { root.remove(); style.remove(); },
  };
  return hud;
}

export const COIN = '<i class="ci"></i>';

export function chip(p, on = false, mark = '') {
  return `<div class="pb-chip ${on ? 'on' : ''}" style="--c:${p.color}"><i>${on ? '✓' : p.avatar}</i>${escapeHtml(p.name)}${mark}</div>`;
}

export function controlsDiagram(controls = {}) {
  const parts = [];
  if (controls.stick === 'analog') parts.push('<div class="pb-ctl"><div class="stick"></div>Move</div>');
  else if (controls.stick === 'dpad') parts.push('<div class="pb-ctl"><div class="dpad">✚</div>D-pad</div>');
  const colors = ['#ff4d6d', '#3d8bff', '#34c759', '#ffb300'];
  (controls.buttons || []).forEach((b, i) => parts.push(`<div class="pb-ctl"><div class="btn" style="background:${b.color || colors[i % 4]}">${escapeHtml(b.label || b.id)}</div>${escapeHtml(b.id.toUpperCase())}</div>`));
  return `<div class="pb-controls">${parts.join('')}</div>${controls.hint ? `<p style="color:#5a6390;font-size:clamp(14px,1.2vw,22px)">${controls.hint}</p>` : ''}`;
}
