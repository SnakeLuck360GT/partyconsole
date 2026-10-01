// Kart Chaos phone controller (landscape). Tilt steering by default (auto fallback to touch steering),
// auto-gas on by default (left button = BRAKE / REVERSE), big DRIFT + ITEM for the right thumb, status strip,
// ⚙ sheet (steering mode, sensitivity, invert, recenter, auto-gas). Lobby picker for the host, spectator screen.
import { ITEM_SVG, ITEM_INFO, ITEM_KEYS, COIN_SVG } from './icons.js';
import { DRIVERS, KARTS, PAINTS, combineStats } from './roster.js';

const SENS = { low: 32, med: 26, high: 20 };

const CSS = `
.kc{position:absolute;inset:0;display:flex;flex-direction:column;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden;font-family:Fredoka,system-ui,sans-serif;color:#fff;
  background:radial-gradient(120% 90% at 50% 120%,color-mix(in srgb,var(--me) 30%,transparent),transparent 60%),linear-gradient(180deg,#14172e,#0b0d1c)}
.kc *{box-sizing:border-box}
.kc-top{flex:none;height:46px;display:flex;align-items:center;gap:8px;padding:0 10px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.07)}
.kc-pos{font-weight:700;font-size:28px;line-height:1;color:var(--me);min-width:3.2em;font-style:italic}
.kc-pos small{font-size:.55em;color:#aab;font-style:normal;font-weight:500}
.kc-chip{font-size:16px;font-weight:600;background:rgba(255,255,255,.09);padding:4px 11px;border-radius:999px;white-space:nowrap;display:flex;align-items:center;gap:5px}
.kc-chip svg{width:16px;height:16px}
.kc-msg{flex:1;text-align:center;font-size:17px;font-weight:600;color:#ffcc00;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kc-gear{flex:none;width:44px;height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font-size:20px}
.kc-body{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr 1.35fr;position:relative}
.kc-l,.kc-m,.kc-r{position:relative;min-width:0;min-height:0}
.kc-l{display:flex;align-items:center;justify-content:center;gap:12px;flex-direction:column}
.kc-m{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.kc-r{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto 1fr;padding:6px 10px 10px 4px;gap:4px}
.kc-b{touch-action:none;border:0;border-radius:50%;color:#fff;font-family:inherit;font-weight:700;display:grid;place-items:center;align-content:center;line-height:1;position:relative;
  background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--c) 55%,white),var(--c) 55%,color-mix(in srgb,var(--c) 60%,black));
  box-shadow:0 7px 0 color-mix(in srgb,var(--c) 45%,black),0 10px 20px rgba(0,0,0,.45);text-shadow:0 2px 3px rgba(0,0,0,.35);transition:transform 50ms,box-shadow 50ms}
.kc-b.down{transform:translateY(5px);box-shadow:0 2px 0 color-mix(in srgb,var(--c) 45%,black),0 3px 8px rgba(0,0,0,.4)}
.kc-b small{font-size:13px;font-weight:600;opacity:.95;margin-top:3px;letter-spacing:.06em}
.kc-drift{--c:#ff8a1f;grid-column:1 / span 2;justify-self:end;align-self:end;width:min(46vmin,172px);height:min(46vmin,172px);font-size:24px}
.kc-drift .lv{position:absolute;inset:-7px;border-radius:50%;border:5px solid transparent;transition:border-color .15s}
.kc-drift.l1 .lv{border-color:#45b8ff;box-shadow:0 0 18px #45b8ff}
.kc-drift.l2 .lv{border-color:#ff9a1f;box-shadow:0 0 18px #ff9a1f}
.kc-drift.l3 .lv{border-color:#d35bff;box-shadow:0 0 22px #d35bff}
.kc-item{--c:#3a3f63;width:min(30vmin,112px);height:min(30vmin,112px);justify-self:start;align-self:start;border-radius:26px}
.kc-item svg{width:66%;height:66%;filter:drop-shadow(0 3px 0 rgba(0,0,0,.35))}
.kc-item small{position:absolute;bottom:6px;left:0;right:0;text-align:center;font-size:11px}
.kc-item.has{--c:#7a4dff;animation:kcbob 1s ease-in-out infinite}
.kc-item.roll svg{animation:kcshake .09s linear infinite}
.kc-item.held{--c:#1faa5a}
.kc-item .cnt{position:absolute;right:-4px;top:-4px;background:#ffcc00;color:#111;font-size:15px;border-radius:999px;padding:3px 8px;text-shadow:none}
.kc-item .aim{position:absolute;left:50%;transform:translateX(-50%);font-size:22px;opacity:0;transition:opacity .1s}
.kc-item .aim.up{top:-30px}.kc-item .aim.dn{bottom:-30px}
.kc-item[data-aim='-1'] .aim.up,.kc-item[data-aim='1'] .aim.dn{opacity:1}
.kc-brake{--c:#e23b3b;width:min(40vmin,150px);height:min(40vmin,150px);font-size:22px}
.kc-gas{--c:#22b84a;width:min(40vmin,150px);height:min(40vmin,150px);font-size:22px}
.kc-brake.sm,.kc-gas.sm{width:min(25vmin,92px);height:min(25vmin,92px);font-size:15px}
.kc-r .kc-brake.sm,.kc-r .kc-gas.sm{justify-self:end;align-self:start}
.kc-wheel{width:min(30vmin,118px);aspect-ratio:1;border-radius:50%;border:9px solid color-mix(in srgb,var(--me) 75%,#fff);position:relative;opacity:.92}
.kc-wheel::before{content:'';position:absolute;left:50%;top:-7px;width:10px;height:24%;background:#fff;border-radius:6px;transform:translateX(-50%)}
.kc-wheel::after{content:'';position:absolute;left:10%;right:10%;top:45%;height:12%;background:color-mix(in srgb,var(--me) 75%,#fff);border-radius:6px}
.kc-lbl{font-size:13px;color:#9aa3c7;text-align:center}
.kc-steer{position:absolute;inset:6px;border-radius:22px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 2px rgba(255,255,255,.08);overflow:hidden}
.kc-steer .bar{position:absolute;left:12%;right:12%;top:50%;height:8px;margin-top:-4px;border-radius:4px;background:rgba(255,255,255,.15)}
.kc-steer .knob{position:absolute;top:50%;left:50%;width:min(22vmin,84px);height:min(22vmin,84px);margin:calc(min(22vmin,84px) / -2) 0 0 calc(min(22vmin,84px) / -2);border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#fff,var(--me) 60%);box-shadow:0 6px 16px rgba(0,0,0,.4)}
.kc-steer .arr{position:absolute;top:50%;transform:translateY(-50%);font-size:34px;color:rgba(255,255,255,.25)}
.kc-steer .arr.l{left:4%}.kc-steer .arr.r{right:4%}
.kc-rev{position:absolute;inset:8px;border-radius:22px;border:3px dashed rgba(255,204,0,.6);display:none;place-items:center;text-align:center;color:#ffcc00;font-weight:700;font-size:20px;background:rgba(255,204,0,.08)}
.kc-rev.on{display:grid}
.kc-rev.down{background:rgba(255,120,0,.35);border-style:solid;color:#fff}
.kc-flash{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .45s}
.kc-flash.on{opacity:1;transition:none}
.kc-over{position:absolute;inset:0;z-index:5;display:grid;place-items:center;background:rgba(8,10,24,.92);text-align:center;padding:14px;overflow:auto}
.kc-key{border:0;border-radius:26px;padding:20px 32px;font:700 26px Fredoka,system-ui;color:#1a1a1a;background:linear-gradient(#ffe066,#ffb300);box-shadow:0 8px 0 #a86f00,0 14px 30px rgba(0,0,0,.5);animation:kcbob 1.2s ease-in-out infinite}
.kc-over p{color:#c8cdf0;font-size:16px;margin:12px 0 0}
.kc-set{display:flex;flex-direction:column;gap:9px;width:min(560px,100%)}
.kc-set h3{margin:0;font-size:21px}
.kc-row{display:flex;align-items:center;gap:8px}
.kc-row>span{width:96px;text-align:left;color:#aab;font-size:14px;flex:none}
.kc-seg{display:flex;gap:6px;flex:1}
.kc-seg button,.kc-row>button{flex:1;border:2px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font:600 16px Fredoka,system-ui;border-radius:12px;padding:9px 6px}
.kc-seg button.on{background:var(--me);border-color:var(--me)}
.kc-set .done{background:#ffcc00!important;color:#111!important;border:0!important}
.kc-msgv{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:16px}
.kc-msgv .big{font-size:52px}
.kc-msgv b{display:block;font-size:24px;margin:6px 0}
.kc-msgv .muted{color:#aab;font-size:16px}
.kc-lobby{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;padding:8px 12px;overflow:auto}
.kc-lobby h2{margin:0;font-size:20px;text-align:center}
.kc-tr{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.kc-tr button{border:0;border-radius:16px;padding:12px 8px;color:#fff;font:600 17px Fredoka,system-ui;background:linear-gradient(135deg,#3b2f8c,#22264a);box-shadow:0 5px 0 #14162a;text-align:center}
.kc-tr button span{display:block;font-size:30px}
.kc-tr button small{display:block;font-size:12px;color:#c8cdf0;font-weight:400}
.kc-tr button.sel{outline:4px solid #ffcc00}
.kc-ccs{display:flex;gap:8px}
.kc-ccs button{flex:1;border:0;border-radius:14px;padding:10px;font:700 18px Fredoka,system-ui;color:#fff;background:rgba(255,255,255,.08)}
.kc-ccs button.sel{background:linear-gradient(180deg,#ff6a3a,#d0301a);box-shadow:0 4px 0 #7a1a0a}
.kc-go{border:0;border-radius:16px;padding:12px;font:700 22px Fredoka,system-ui;color:#111;background:linear-gradient(#7dff8a,#22c04a);box-shadow:0 5px 0 #0f6a25}
.kc-go small{font-weight:500;font-size:14px}
.kc-sel .kc-seltop{gap:6px}
.kc-tb{flex:none;width:40px;height:34px;border:0;border-radius:10px;background:rgba(255,255,255,.1);color:#fff;font-size:16px}
.kc-tname{font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1}
.kc-sel .kc-ccs{flex:none;gap:4px}
.kc-sel .kc-ccs button{padding:6px 8px;font-size:14px;border-radius:10px}
.kc-sel .kc-go{flex:none;padding:7px 12px;font-size:16px;border-radius:12px;box-shadow:0 3px 0 #0f6a25}
.kc-left{flex:none;font-weight:700;color:#ffcc00;min-width:2.4em;text-align:right}
.kc-selbody{flex:1;min-height:0;display:grid;grid-template-columns:1.65fr 1fr;gap:8px;padding:8px}
.kc-selmain{display:flex;flex-direction:column;min-width:0;min-height:0;gap:6px}
.kc-tabs{display:flex;gap:6px;flex:none}
.kc-tabs button{flex:1;border:0;border-radius:10px;padding:7px;font:700 14px Fredoka,system-ui;color:#aab;background:rgba(255,255,255,.07);letter-spacing:.08em}
.kc-tabs button.on{background:var(--me);color:#fff}
.kc-car{position:relative;flex:1;min-height:0;overflow:hidden;border-radius:16px;background:rgba(0,0,0,.25);touch-action:none}
.kc-strip{position:absolute;left:0;top:0;bottom:0;display:flex;align-items:center;transition:transform .25s cubic-bezier(.2,1.2,.4,1)}
.kc-card2{flex:none;width:120px;margin:0 4px;height:calc(100% - 14px);border-radius:14px;background:#22264a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  opacity:.55;transform:scale(.86);transition:transform .2s,opacity .2s;position:relative;overflow:hidden;pointer-events:none}
.kc-card2.on{opacity:1;transform:scale(1);box-shadow:0 0 0 3px #ffcc00}
.kc-card2 img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px 12px 0 0;flex:1;min-height:0}
.kc-card2 .sw{width:70%;aspect-ratio:1;border-radius:50%;box-shadow:inset 0 -6px 0 rgba(0,0,0,.25),0 4px 10px rgba(0,0,0,.4)}
.kc-card2 b{font-size:14px;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.kc-card2 i{font-style:normal;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#ffcc00;margin-bottom:4px}
.kc-card2 u{position:absolute;top:4px;left:4px;text-decoration:none;font-size:9px;background:rgba(0,0,0,.6);padding:2px 5px;border-radius:6px}
.kc-nav{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:56px;border:0;border-radius:10px;background:rgba(0,0,0,.45);color:#fff;font-size:18px;z-index:2}
.kc-nav.p{left:4px}.kc-nav.n{right:4px}
.kc-selside{display:flex;flex-direction:column;gap:8px;min-height:0}
.kc-stats{flex:1;min-height:0;background:rgba(255,255,255,.05);border-radius:14px;padding:8px 10px;display:flex;flex-direction:column;justify-content:center;gap:5px}
.kc-stats .hd{font-size:14px;color:#c8cdf0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kc-stats .br{display:grid;grid-template-columns:62px 1fr;align-items:center;gap:6px;font-size:12px;color:#aab}
.kc-stats em{height:9px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
.kc-stats s{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ffcc00,#ff7a1a);transition:width .3s}
.kc-ready{flex:none;border:0;border-radius:16px;padding:12px;font:700 22px Fredoka,system-ui;color:#111;background:linear-gradient(#7dff8a,#22c04a);box-shadow:0 5px 0 #0f6a25;display:flex;flex-direction:column;align-items:center}
.kc-ready small{font-size:12px;font-weight:500}
.kc-sel.ready .kc-ready{background:linear-gradient(#ffe066,#ffb300);box-shadow:0 5px 0 #a86f00}
.kc-sel.ready .kc-car{opacity:.6}
body[data-layout='portrait'] .kc-selbody{grid-template-columns:1fr;grid-template-rows:1fr auto}
body[data-layout='portrait'] .kc-body{grid-template-columns:1fr;grid-template-rows:1fr auto 1fr}
body[data-layout='portrait'] .kc-tr{grid-template-columns:1fr}
@keyframes kcbob{50%{transform:scale(1.05)}}
@keyframes kcshake{50%{transform:rotate(8deg) scale(1.08)}}
`;

function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(`kart-${k}`);
    localStorage.setItem(`kart-${k}`, String(v));
  } catch { /* private mode */ }
  return null;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function start(ctx) {
  const style = document.createElement('style');
  style.textContent = CSS;
  ctx.container.appendChild(style);
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0';
  ctx.container.appendChild(root);
  const kit = ctx.kit;
  const vibrate = (p) => { try { ctx.vibrate(p); } catch { /* noop */ } };

  const prefs = {
    steer: store('steer2') || 'tilt',
    invert: store('invert') === '1',
    autoGas: store('autogas') !== '0',
    sens: SENS[store('sens2')] ? store('sens2') : 'med',
    smart: store('smart') !== '0',
  };
  const st = { steer: 0, touch: 0, gas: false, brake: false, drift: false, item: false, aim: 0, rev: false };
  let phase = 'connecting';
  let engineOn = false;
  let tiltCtl = null;
  let pending = null;
  let lastSend = 0;
  let view = null;
  let pad = null;
  let rollTimer = null;
  let msgTimer = null;
  let lastState = null;
  let lastStatus = null;
  let lastItem = { item: null, count: 0, rolling: false, held: null };

  // ---------------------------------------------------------------- input sending (<= 30 Hz)
  function flush() {
    pending = null;
    lastSend = performance.now();
    const s = prefs.steer === 'tilt' && tiltCtl ? st.steer : st.touch;
    let g;
    if (phase === 'countdown') g = st.rev || st.gas;
    else g = !st.brake && (prefs.autoGas ? true : st.gas);
    ctx.send({ type: 'input', s, g, b: st.brake && phase !== 'countdown', d: st.drift, i: st.item, a: st.aim, m: prefs.smart ? 1 : 0 });
  }
  function schedule(now) {
    if (now) { if (pending) clearTimeout(pending); flush(); return; }
    if (pending) return;
    pending = setTimeout(flush, Math.max(0, 33 - (performance.now() - lastSend)));
  }
  const keepAlive = setInterval(() => { if (view === 'pad') schedule(false); }, 250);

  // ---------------------------------------------------------------- tilt
  function ensureTilt() {
    if (tiltCtl || !kit.tilt) return tiltCtl;
    tiltCtl = kit.tilt({
      maxAngle: SENS[prefs.sens],
      invert: prefs.invert,
      onChange: (v) => {
        st.steer = v;
        if (pad?.wheel) pad.wheel.style.transform = `rotate(${v * 100}deg)`;
        if (prefs.steer === 'tilt') schedule(false);
      },
    });
    return tiltCtl;
  }

  async function startEngine() {
    vibrate('success');
    engineOn = true;
    pad?.over?.remove();
    if (pad) pad.over = null;
    if (prefs.steer === 'tilt') {
      const t = ensureTilt();
      const ok = t ? await t.start() : false;
      const t0 = performance.now();
      const check = () => {
        if (destroyed) return;
        if (ok && t.receiving) { setTimeout(() => t.calibrate(), 120); note('Tilt to steer · hold it like a wheel', 2200); return; }
        if (performance.now() - t0 < 1100) { setTimeout(check, 100); return; }
        // no sensor / permission denied -> touch steering
        t?.stop();
        tiltCtl = null;
        prefs.steer = 'touch';
        rebuildPad();
        note('No tilt sensor: touch steering on the left', 3500);
      };
      check();
    }
    schedule(true);
  }

  // ---------------------------------------------------------------- views
  function clear() {
    if (rollTimer) { clearInterval(rollTimer); rollTimer = null; }
    root.innerHTML = '';
    pad = null;
    view = null;
  }

  function holdButton(el, onChange, { aim = false } = {}) {
    let pid = null;
    let y0 = 0;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (pid !== null) return;
      pid = e.pointerId;
      try { el.setPointerCapture(pid); } catch { /* noop */ }
      el.classList.add('down');
      if (aim) { y0 = kit.localPoint(el, e).y; st.aim = 0; el.dataset.aim = '0'; }
      vibrate('tap');
      onChange(true);
    });
    if (aim) {
      el.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid) return;
        const dy = kit.localPoint(el, e).y - y0;
        const a = dy < -28 ? -1 : dy > 28 ? 1 : 0;
        if (a !== st.aim) { st.aim = a; el.dataset.aim = String(a); schedule(true); }
      });
    }
    const up = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      el.classList.remove('down');
      onChange(false);
      if (aim) { setTimeout(() => { st.aim = 0; el.dataset.aim = '0'; }, 80); }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /** Touch steering: drag left/right anywhere in the zone (relative to where the thumb landed). */
  function steerZone(parent) {
    const z = document.createElement('div');
    z.className = 'kc-steer';
    z.innerHTML = '<div class="bar"></div><div class="arr l">◀</div><div class="arr r">▶</div><div class="knob"></div>';
    parent.appendChild(z);
    const knob = z.querySelector('.knob');
    let pid = null; let x0 = 0;
    const setV = (v) => {
      st.touch = Math.round(v * 100) / 100;
      knob.style.transform = `translateX(${v * z.clientWidth * 0.36}px)`;
      schedule(v === 0);
    };
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (pid !== null) return;
      pid = e.pointerId;
      try { z.setPointerCapture(pid); } catch { /* noop */ }
      const p = kit.localPoint(z, e);
      // landing left/right of centre already steers a little, so taps work too
      const w = z.clientWidth || 1;
      x0 = p.x - Math.max(-0.5, Math.min(0.5, (p.x - w / 2) / (w * 0.5))) * w * 0.12;
      setV(Math.max(-1, Math.min(1, (p.x - x0) / (w * 0.3))));
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      const p = kit.localPoint(z, e);
      setV(Math.max(-1, Math.min(1, (p.x - x0) / ((z.clientWidth || 1) * 0.3))));
    });
    const end = (e) => { if (e.pointerId !== pid) return; pid = null; setV(0); };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    return z;
  }

  function mkBtn(cls, html, parent) {
    const b = document.createElement('button');
    b.className = `kc-b ${cls}`;
    b.innerHTML = html;
    parent.appendChild(b);
    return b;
  }

  function showPad() {
    if (view === 'pad') return;
    clear();
    view = 'pad';
    const touch = prefs.steer === 'touch';
    const el = document.createElement('div');
    el.className = 'kc';
    el.style.setProperty('--me', lastState?.color || ctx.player.color);
    el.innerHTML = `
      <div class="kc-top"><div class="kc-pos">–</div><div class="kc-chip kc-lapc">LAP –</div><div class="kc-chip kc-coin">${COIN_SVG}<span>0</span></div>
        <div class="kc-msg"></div><button class="kc-gear" aria-label="Settings">⚙</button></div>
      <div class="kc-body"><div class="kc-l"></div><div class="kc-m"></div><div class="kc-r"></div><div class="kc-rev">HOLD TO REV 🔥<br><small style="font-weight:500;font-size:14px">let go = no rocket start</small></div></div>
      <div class="kc-flash"></div>`;
    root.appendChild(el);
    const L = el.querySelector('.kc-l'); const M = el.querySelector('.kc-m'); const R = el.querySelector('.kc-r');
    const item = mkBtn('kc-item', `${ITEM_SVG.empty}<small>ITEM</small><i class="aim up">▲</i><i class="aim dn">▼</i>`, R);
    let wheel = null;
    if (touch) {
      // left thumb steers; brake (and gas when auto-gas is off) move to the right column
      steerZone(L);
      L.style.gridColumn = '1 / span 2';
      M.style.display = 'none';
      const br = mkBtn('kc-brake sm', '◼<small>BRAKE</small>', R);
      holdButton(br, (v) => { st.brake = v; schedule(true); });
      if (!prefs.autoGas) {
        const g = mkBtn('kc-gas sm', '▲<small>GAS</small>', R);
        g.style.gridColumn = '2'; g.style.gridRow = '1';
        br.style.gridColumn = '1'; br.style.gridRow = '2'; br.style.alignSelf = 'end';
        holdButton(g, (v) => { st.gas = v; schedule(true); });
      }
    } else {
      if (!prefs.autoGas) {
        const g = mkBtn('kc-gas', '▲<small>GAS</small>', L);
        holdButton(g, (v) => { st.gas = v; schedule(true); });
      }
      const br = mkBtn(`kc-brake ${prefs.autoGas ? '' : 'sm'}`, `◼<small>${prefs.autoGas ? 'BRAKE · REVERSE' : 'BRAKE'}</small>`, L);
      holdButton(br, (v) => { st.brake = v; if (phase === 'countdown') st.rev = v; schedule(true); });
      M.innerHTML = '<div class="kc-wheel"></div><div class="kc-lbl">tilt to steer</div>';
      wheel = M.querySelector('.kc-wheel');
    }
    const drift = mkBtn('kc-drift', '<span class="lv"></span>DRIFT<small>HOP · TRICK</small>', R);
    holdButton(item, (v) => { st.item = v; schedule(true); }, { aim: true });
    holdButton(drift, (v) => { st.drift = v; schedule(true); });
    const rev = el.querySelector('.kc-rev');
    holdButton(rev, (v) => { st.rev = v; rev.classList.toggle('down', v); schedule(true); if (v) vibrate('tick'); });
    el.querySelector('.kc-gear').addEventListener('click', openSettings);
    pad = {
      el, pos: el.querySelector('.kc-pos'), lap: el.querySelector('.kc-lapc'), coin: el.querySelector('.kc-coin span'), msg: el.querySelector('.kc-msg'),
      flash: el.querySelector('.kc-flash'), item, drift, wheel, rev, over: null,
    };
    if (!engineOn) {
      const over = document.createElement('div');
      over.className = 'kc-over';
      over.innerHTML = `<div><button class="kc-key">TAP TO START ENGINE 🔑</button>
        <p>${prefs.steer === 'tilt' ? 'Hold your phone sideways like a steering wheel and tilt to steer.' : 'Drag on the left side to steer.'}<br>Gas is automatic · hold DRIFT in corners · ⚙ for options</p></div>`;
      over.querySelector('.kc-key').addEventListener('click', startEngine);
      el.appendChild(over);
      pad.over = over;
    }
    applyPhase();
    if (lastStatus) applyStatus(lastStatus);
    applyItem(lastItem);
    schedule(true);
  }

  function rebuildPad() {
    if (view !== 'pad') return;
    view = null;
    showPad();
  }

  function openSettings() {
    if (!pad) return;
    const over = document.createElement('div');
    over.className = 'kc-over';
    const seg = (key, opts) => `<div class="kc-seg" data-k="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(prefs[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    over.innerHTML = `<div class="kc-set">
      <h3>⚙ Controls</h3>
      <div class="kc-row"><span>Steering</span>${seg('steer', [['tilt', '📱 Tilt'], ['touch', '👆 Touch']])}</div>
      <div class="kc-row"><span>Sensitivity</span>${seg('sens', [['low', 'Low'], ['med', 'Medium'], ['high', 'High']])}</div>
      <div class="kc-row"><span>Gas</span>${seg('autoGas', [['true', '🟢 Auto-gas'], ['false', '👆 Gas button']])}</div>
      <div class="kc-row"><span>Assist</span>${seg('smart', [['true', '📡 Smart Steering'], ['false', 'Off (pro)']])}</div>
      <div class="kc-row"><span>Tilt</span><button class="recenter">🎯 Recenter</button><button class="invert">${prefs.invert ? '✅' : '⬜'} Invert</button></div>
      <div class="kc-row"><button class="done">Done</button></div></div>`;
    over.querySelectorAll('.kc-seg button').forEach((b) => b.addEventListener('click', () => {
      const k = b.parentElement.dataset.k;
      prefs[k] = k === 'autoGas' || k === 'smart' ? b.dataset.v === 'true' : b.dataset.v;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (k === 'sens') tiltCtl?.setMaxAngle(SENS[prefs.sens]);
      vibrate('select');
    }));
    over.querySelector('.recenter').addEventListener('click', () => { tiltCtl?.calibrate(); vibrate('success'); note('Tilt recentred', 1200); });
    over.querySelector('.invert').addEventListener('click', (e) => {
      prefs.invert = !prefs.invert;
      tiltCtl?.setInvert(prefs.invert);
      e.currentTarget.textContent = `${prefs.invert ? '✅' : '⬜'} Invert`;
    });
    over.querySelector('.done').addEventListener('click', async () => {
      store('steer2', prefs.steer); store('invert', prefs.invert ? '1' : '0'); store('autogas', prefs.autoGas ? '1' : '0'); store('sens2', prefs.sens); store('smart', prefs.smart ? '1' : '0'); schedule(true);
      over.remove();
      if (prefs.steer === 'tilt') {
        const t = ensureTilt();
        if (t && await t.start()) { setTimeout(() => t.calibrate(), 250); }
      } else if (tiltCtl) { tiltCtl.stop(); tiltCtl = null; }
      rebuildPad();
    });
    pad.el.appendChild(over);
  }

  function showMsg(html) {
    clear();
    view = 'msg';
    const m = document.createElement('div');
    m.className = 'kc kc-msgv';
    m.style.setProperty('--me', ctx.player.color);
    m.innerHTML = `<div>${html}</div>`;
    root.appendChild(m);
  }

  // ---------------------------------------------------------------- lobby: driver / kart / paint select
  let sel = { tab: 'driver', idx: { driver: 0, kart: 0, paint: 0 } };
  function catalog(tab, m) {
    if (tab === 'driver') return DRIVERS.map((d) => ({ id: d.id, name: d.name, img: ctx.asset(`select/driver-${d.id}.jpg`), badge: d.weight, taken: (m.taken || []).includes(d.id) }));
    if (tab === 'kart') {
      return [...KARTS.map((k) => ({ id: k.id, name: k.name, img: ctx.asset(`select/kart-${k.id}.jpg`) })),
        ...(m.customs || []).map((c) => ({ id: `custom:${c.i}`, name: `★ ${c.name}`, img: c.thumb, badge: 'custom' }))];
    }
    return PAINTS.map((p) => ({ id: p.id, name: p.name, swatch: p.color || ctx.player.color }));
  }
  function currentId(tab, pick) {
    if (tab === 'driver') return pick.driver;
    if (tab === 'kart') return pick.custom != null ? `custom:${pick.custom}` : pick.kart;
    return pick.paint;
  }
  function showLobby(m) {
    if (m.role !== 'racer') {
      showMsg('<div class="big">🅿️</div><b>Race is full, you\'re spectating</b><div class="muted">Kart Chaos has 4 driver seats. Watch the TV and cheer!</div>');
      return;
    }
    const pick = m.pick;
    if (view !== 'lobby') {
      clear();
      view = 'lobby';
      const el = document.createElement('div');
      el.className = 'kc kc-sel';
      el.style.setProperty('--me', ctx.player.color);
      el.innerHTML = `
        <div class="kc-top kc-seltop"></div>
        <div class="kc-selbody">
          <div class="kc-selmain">
            <div class="kc-tabs"><button data-t="driver">DRIVER</button><button data-t="kart">KART</button><button data-t="paint">PAINT</button></div>
            <div class="kc-car"><div class="kc-strip"></div><button class="kc-nav p">◀</button><button class="kc-nav n">▶</button></div>
          </div>
          <div class="kc-selside"><div class="kc-stats"></div><button class="kc-ready">READY!</button></div>
        </div>`;
      root.appendChild(el);
      el.querySelectorAll('.kc-tabs button').forEach((b) => b.addEventListener('click', () => { sel.tab = b.dataset.t; vibrate('tick'); drawCarousel(lastState); }));
      el.querySelector('.kc-nav.p').addEventListener('click', () => step(-1));
      el.querySelector('.kc-nav.n').addEventListener('click', () => step(1));
      el.querySelector('.kc-ready').addEventListener('click', () => { vibrate('success'); ctx.send({ type: 'ready', on: !lastState?.pick?.ready }); });
      // swipe (custom pointer code: use the kit's rotation-aware local coordinates)
      const car = el.querySelector('.kc-car');
      let pid = null; let x0 = 0; let dx = 0;
      car.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.kc-nav')) return;
        pid = e.pointerId; x0 = kit.localPoint(car, e).x; dx = 0;
        try { car.setPointerCapture(pid); } catch { /* noop */ }
      });
      car.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid) return;
        dx = kit.localPoint(car, e).x - x0;
        const strip = car.querySelector('.kc-strip');
        strip.style.transition = 'none';
        strip.style.transform = `translateX(${stripX() + dx}px)`;
      });
      const end = (e) => {
        if (e.pointerId !== pid) return;
        pid = null;
        const strip = car.querySelector('.kc-strip');
        strip.style.transition = '';
        const cw = cardW();
        if (Math.abs(dx) > 30) step(-Math.round(dx / cw) || -Math.sign(dx));
        else {
          // tap: pick the tapped card
          const x = kit.localPoint(car, e).x;
          const i = Math.floor((x - stripX()) / cw);
          const items = catalog(sel.tab, lastState);
          if (i >= 0 && i < items.length && i !== sel.idx[sel.tab]) choose(i);
          else drawCarousel(lastState);
        }
        dx = 0;
      };
      car.addEventListener('pointerup', end);
      car.addEventListener('pointercancel', end);
    }
    const el = root.querySelector('.kc-sel');
    // top row: host controls or status
    const top = el.querySelector('.kc-seltop');
    const t = m.tracks[m.sel.track];
    const key = `${m.admin}|${m.sel.track}|${m.sel.cc}`;
    if (top.dataset.key !== key) {
      top.dataset.key = key;
      top.innerHTML = m.admin
        ? `<button class="kc-tb tp">◀</button><div class="kc-tname">${t.emoji} ${t.name}</div><button class="kc-tb tn">▶</button>
           <div class="kc-ccs">${[50, 100, 150].map((c) => `<button data-cc="${c}" class="${c === m.sel.cc ? 'sel' : ''}">${c}cc</button>`).join('')}</div>
           <button class="kc-go">START ▶</button><span class="kc-left"></span>`
        : `<div class="kc-tname">${t.emoji} ${t.name} · ${m.sel.cc}cc</div><div class="kc-msg">Pick your driver &amp; kart</div><span class="kc-left"></span>`;
      if (m.admin) {
        top.querySelector('.tp').addEventListener('click', () => { vibrate('select'); ctx.send({ type: 'pick', track: (m.sel.track + m.tracks.length - 1) % m.tracks.length }); });
        top.querySelector('.tn').addEventListener('click', () => { vibrate('select'); ctx.send({ type: 'pick', track: (m.sel.track + 1) % m.tracks.length }); });
        top.querySelectorAll('.kc-ccs button').forEach((b) => b.addEventListener('click', () => { vibrate('select'); ctx.send({ type: 'pick', cc: Number(b.dataset.cc) }); }));
        top.querySelector('.kc-go').addEventListener('click', () => { vibrate('success'); ctx.send({ type: 'start' }); });
      }
    }
    top.querySelector('.kc-left').textContent = `${m.left}s`;
    // sync carousel index with the server's pick
    for (const tab of ['driver', 'kart', 'paint']) {
      const i = catalog(tab, m).findIndex((c) => c.id === currentId(tab, pick));
      if (i >= 0) sel.idx[tab] = i;
    }
    el.classList.toggle('ready', !!pick.ready);
    el.querySelector('.kc-ready').innerHTML = pick.ready ? 'READY ✓<small>tap to change</small>' : 'READY!';
    drawCarousel(m);
    drawStats(pick, m);
  }
  function cardW() { return 128; }
  function stripX() {
    const car = root.querySelector('.kc-car');
    const w = car ? car.clientWidth : 300;
    return w / 2 - (sel.idx[sel.tab] + 0.5) * cardW();
  }
  function drawCarousel(m) {
    const el = root.querySelector('.kc-sel');
    if (!el || !m) return;
    el.querySelectorAll('.kc-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === sel.tab));
    const items = catalog(sel.tab, m);
    const strip = el.querySelector('.kc-strip');
    const key = `${sel.tab}|${items.map((c) => c.id + (c.taken ? 't' : '')).join(',')}`;
    if (strip.dataset.key !== key) {
      strip.dataset.key = key;
      strip.innerHTML = items.map((c) => `<div class="kc-card2">${c.swatch ? `<div class="sw" style="background:${c.swatch}"></div>` : c.img ? `<img src="${c.img}" alt="" draggable="false">` : '<div class="sw"></div>'}
        <b>${c.name}</b>${c.badge ? `<i>${c.badge}</i>` : ''}${c.taken ? '<u>also picked</u>' : ''}</div>`).join('');
    }
    [...strip.children].forEach((c, i) => c.classList.toggle('on', i === sel.idx[sel.tab]));
    strip.style.transform = `translateX(${stripX()}px)`;
  }
  function step(d) {
    const items = catalog(sel.tab, lastState);
    choose((sel.idx[sel.tab] + d + items.length * 4) % items.length);
  }
  function choose(i) {
    if (lastState?.pick?.ready) { note('Tap READY to change', 1200); return; }
    sel.idx[sel.tab] = i;
    vibrate('tick');
    const c = catalog(sel.tab, lastState)[i];
    if (sel.tab === 'driver') ctx.send({ type: 'sel', driver: c.id });
    else if (sel.tab === 'kart') ctx.send(c.id.startsWith('custom:') ? { type: 'sel', custom: Number(c.id.slice(7)) } : { type: 'sel', kart: c.id });
    else ctx.send({ type: 'sel', paint: c.id });
    drawCarousel(lastState);
  }
  function drawStats(pick, m) {
    const el = root.querySelector('.kc-stats');
    if (!el) return;
    const d = DRIVERS.find((x) => x.id === pick.driver);
    const k = KARTS.find((x) => x.id === pick.kart);
    const st = combineStats(d, k);
    const cu = pick.custom != null ? (m.customs || [])[pick.custom] : null;
    el.innerHTML = `<div class="hd"><b>${cu?.hasDriver ? cu.name : d?.name || ''}</b> · ${cu ? cu.name : k?.name || ''}</div>`
      + [['speed', 'Speed'], ['accel', 'Accel'], ['handling', 'Handling'], ['weight', 'Weight'], ['turbo', 'Turbo']].map(([key, l]) => `<div class="br"><span>${l}</span><em><s style="width:${(st[key] / 6) * 100}%"></s></em></div>`).join('');
  }

  function applyItem(m) {
    lastItem = m;
    if (!pad) return;
    const b = pad.item;
    if (rollTimer) { clearInterval(rollTimer); rollTimer = null; }
    b.classList.remove('has', 'roll', 'held');
    b.querySelector('.cnt')?.remove();
    const setIcon = (k) => { const svg = b.querySelector('svg'); svg.outerHTML = ITEM_SVG[k] || ITEM_SVG.empty; };
    const lbl = b.querySelector('small');
    if (m.rolling) {
      b.classList.add('roll', 'has');
      let i = 0;
      rollTimer = setInterval(() => { if (pad) setIcon(ITEM_KEYS[i++ % ITEM_KEYS.length]); }, 85);
      lbl.textContent = '…';
      return;
    }
    if (m.held) {
      b.classList.add('held');
      setIcon(m.held);
      lbl.textContent = m.held === 'peel' ? 'LET GO: DROP' : 'LET GO: FIRE';
      return;
    }
    if (m.item) {
      b.classList.add('has');
      setIcon(m.item);
      lbl.textContent = ITEM_INFO[m.item]?.short || 'ITEM';
      if (m.count > 1) b.insertAdjacentHTML('beforeend', `<span class="cnt">×${m.count}</span>`);
    } else {
      setIcon('empty');
      lbl.textContent = 'ITEM';
    }
  }

  function applyStatus(m) {
    lastStatus = m;
    if (!pad) return;
    pad.pos.innerHTML = `${ordinal(m.finished && m.place ? m.place : m.pos)}<small> / ${m.total}</small>`;
    pad.lap.textContent = m.finished ? `🏁 ${m.time}` : `LAP ${m.lap}/${m.laps}`;
    pad.coin.textContent = String(m.coins);
    if (m.ww && !m.finished) note('↺ WRONG WAY', 1500);
  }

  function applyPhase() {
    if (!pad) return;
    pad.rev.classList.toggle('on', phase === 'countdown');
    if (phase !== 'countdown') { st.rev = false; pad.rev.classList.remove('down'); }
    if (phase === 'loading' || phase === 'intro') note(lastState?.track ? `${lastState.track} · get ready!` : 'Get ready!', 6000);
    else if (phase === 'countdown') note('Hold REV at "2" for a ROCKET START', 4000);
    else if (phase === 'race' && !lastStatus?.finished) note('GO GO GO!', 1200);
    else if (phase === 'post' || phase === 'results') note('🏁 Race over!', 60000);
  }

  function flash(color) {
    if (!pad) return;
    pad.flash.style.background = `radial-gradient(circle, transparent 35%, ${color})`;
    pad.flash.classList.add('on');
    setTimeout(() => pad?.flash.classList.remove('on'), 60);
  }

  function note(text, ms = 1500) {
    if (!pad) return;
    pad.msg.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { if (pad) pad.msg.textContent = ''; }, ms);
  }

  let destroyed = false;
  ctx.onMessage((m) => {
    if (m.type === 'state') {
      lastState = m;
      phase = m.phase;
      if (m.phase === 'lobby') { lastStatus = null; lastItem = { item: null, count: 0, rolling: false, held: null }; showLobby(m); return; }
      if (m.role === 'racer') {
        showPad();
        pad.el.style.setProperty('--me', m.color || ctx.player.color);
        applyPhase();
        return;
      }
      if (m.role === 'full') showMsg('<div class="big">🅿️</div><b>Race is full, you\'re spectating</b><div class="muted">4 drivers max. You\'ll get a seat if someone leaves before the next race.</div>');
      else showMsg(`<div class="big">📺</div><b>Race in progress</b><div class="muted">You'll join the next race${m.track ? ` · ${m.track}` : ''}. Watch the TV!</div>`);
    } else if (m.type === 'status') {
      applyStatus(m);
    } else if (m.type === 'item') {
      applyItem(m);
    } else if (m.type === 'buzz') {
      const k = m.kind;
      if (k === 'hit') { flash('rgba(255,40,40,.75)'); note('💥 Ouch!'); }
      else if (k === 'boost') { flash('rgba(255,170,0,.5)'); note('🔥 BOOST!', 900); }
      else if (k === 'star') { flash('rgba(255,230,80,.6)'); note('⭐ SUPER STAR!', 2000); }
      else if (k === 'burnout') { flash('rgba(120,120,120,.6)'); note('Too early: burnout!', 1500); vibrate('error'); }
      else if (k === 'wall') flash('rgba(255,255,255,.25)');
      else if (k.startsWith('drift')) {
        const lvl = Number(k.slice(5));
        pad?.drift.classList.remove('l1', 'l2', 'l3');
        pad?.drift.classList.add(`l${lvl}`);
        vibrate(lvl === 3 ? 'bump' : 'tick');
        clearTimeout(pad?.driftT);
        if (pad) pad.driftT = setTimeout(() => pad?.drift.classList.remove('l1', 'l2', 'l3'), 1600);
      } else if (k === 'lap') note('Lap complete!', 1200);
      else if (k === 'item') vibrate('select');
      else if (k === 'finish') note('🏁 FINISHED!', 60000);
    }
  });

  showMsg('<div class="big">🏎️</div><b>Kart Chaos</b><div class="muted">Connecting…</div>');
  ctx.send({ type: 'hello' });

  return {
    destroy() {
      destroyed = true;
      if (pending) clearTimeout(pending);
      if (rollTimer) clearInterval(rollTimer);
      clearInterval(keepAlive);
      clearTimeout(msgTimer);
      tiltCtl?.stop();
      root.remove();
      style.remove();
    },
  };
}
