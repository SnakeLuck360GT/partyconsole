// DOM HUD for the TV. One overlay per split-screen viewport (scaled to its size via --u), plus the
// 3-player map quadrant, flyover title card, lobby / track select, placements and toasts.
import { escapeHtml } from '../../sdk/screen-kit.js';
import { ordinal, fmtTime } from './util.js';
import { ITEM_SVG, ITEM_KEYS, ITEM_INFO, COIN_SVG } from './icons.js';

const POS_GRAD = [
  ['#fff27a', '#ffb000', '#b35a00'], // 1
  ['#e8f6ff', '#5ab8ff', '#1d4fb8'],
  ['#ffd2a0', '#ff8a3a', '#a33d0a'],
  ['#d6ffb0', '#4fd84a', '#1a7a1a'],
  ['#b8fff4', '#1fd6c6', '#0a6f6a'],
  ['#efd2ff', '#b86bff', '#5a1fa8'],
  ['#ffd0ec', '#ff5cc8', '#9a1a6a'],
  ['#e0e6f0', '#8a98b8', '#3a4460'],
];

const CSS = `
.kx{position:absolute;inset:0;pointer-events:none;font-family:Fredoka,system-ui,sans-serif;color:#fff;z-index:10;overflow:hidden}
.kx *{box-sizing:border-box}
.kx-v{position:absolute;overflow:hidden;--c:#fff}
.kx-frame{position:absolute;inset:0;box-shadow:inset 0 0 0 calc(var(--u)*0.45) color-mix(in srgb,var(--c) 85%,transparent),inset 0 0 calc(var(--u)*6) color-mix(in srgb,var(--c) 22%,transparent)}
.kx.solo .kx-frame,.kx.solo .kx-name{display:none}
.kx-name{position:absolute;top:calc(var(--u)*2.2);left:50%;transform:translateX(-50%);white-space:nowrap;display:flex;align-items:center;gap:calc(var(--u)*0.8);padding:calc(var(--u)*0.5) calc(var(--u)*1.6) calc(var(--u)*0.5) calc(var(--u)*0.6);
  border-radius:999px;background:color-mix(in srgb,var(--c) 80%,#000);font-weight:600;font-size:calc(var(--u)*3.2);box-shadow:0 calc(var(--u)*0.4) 0 rgba(0,0,0,.25)}
.kx-name i{font-style:normal;width:1.5em;height:1.5em;border-radius:50%;background:rgba(255,255,255,.9);display:grid;place-items:center;font-size:.8em}
.kx-lap{position:absolute;top:calc(var(--u)*2);left:calc(var(--u)*2.4);line-height:.9;text-shadow:0 calc(var(--u)*.35) 0 rgba(0,0,0,.35),0 0 calc(var(--u)*2) rgba(0,0,0,.35)}
.kx-lap small{display:block;font-size:calc(var(--u)*3);font-weight:600;letter-spacing:.12em;opacity:.95}
.kx-lap b{font-family:Unbounded,Fredoka,sans-serif;font-weight:800;font-size:calc(var(--u)*8);font-style:italic;letter-spacing:-.02em}
.kx-lap b span{font-size:.55em;opacity:.85}
.kx-lap em{display:block;font-style:normal;font-size:calc(var(--u)*2.7);font-weight:500;margin-top:calc(var(--u)*.6);font-variant-numeric:tabular-nums;opacity:.92}
.kx-lap.pop b{animation:kxpop .6s cubic-bezier(.2,1.8,.4,1)}
.kx-item{position:absolute;top:calc(var(--u)*2.2);left:calc(var(--u)*22);width:calc(var(--u)*13);height:calc(var(--u)*13);border-radius:calc(var(--u)*3.2);
  background:radial-gradient(circle at 50% 35%,rgba(255,255,255,.35),rgba(255,255,255,.08) 60%),rgba(10,14,40,.55);
  box-shadow:inset 0 0 0 calc(var(--u)*.6) rgba(255,255,255,.85),0 calc(var(--u)*.5) 0 rgba(0,0,0,.3);display:grid;place-items:center}
.kx-item svg{width:78%;height:78%;filter:drop-shadow(0 calc(var(--u)*.3) 0 rgba(0,0,0,.35))}
.kx-item.roll svg{animation:kxroll .09s linear infinite}
.kx-item.got{animation:kxpop .5s cubic-bezier(.2,1.8,.4,1)}
.kx-item b{position:absolute;right:-12%;bottom:-10%;background:#ffcc00;color:#222;border-radius:999px;font-size:calc(var(--u)*3);padding:0 .45em;box-shadow:0 2px 0 rgba(0,0,0,.3)}
.kx-item.held{box-shadow:inset 0 0 0 calc(var(--u)*.6) #7dffb0,0 0 calc(var(--u)*3) #7dffb0}
.kx-coins{position:absolute;left:calc(var(--u)*2.4);bottom:calc(var(--u)*2.4);display:flex;align-items:center;gap:calc(var(--u)*.8);font-family:Unbounded,Fredoka,sans-serif;font-weight:800;font-style:italic;
  font-size:calc(var(--u)*5);text-shadow:0 calc(var(--u)*.35) 0 rgba(0,0,0,.4)}
.kx-coins svg{width:1.05em;height:1.05em}
.kx-coins.max{color:#ffd84a}
.kx-coins.bump{animation:kxpop .35s ease-out}
.kx-pos{position:absolute;right:calc(var(--u)*2.6);bottom:calc(var(--u)*1.2);font-family:Unbounded,Fredoka,sans-serif;font-weight:800;font-style:italic;line-height:1;
  display:flex;align-items:flex-start;filter:drop-shadow(0 calc(var(--u)*.6) 0 rgba(0,0,0,.35))}
.kx-pos .n{font-size:calc(var(--u)*19);background:linear-gradient(180deg,var(--g1),var(--g2) 55%,var(--g3));-webkit-background-clip:text;background-clip:text;color:transparent;
  -webkit-text-stroke:calc(var(--u)*.55) #fff;paint-order:stroke fill;letter-spacing:-.04em}
.kx-pos .s{font-size:calc(var(--u)*7);margin-top:calc(var(--u)*2);background:linear-gradient(180deg,var(--g1),var(--g2));-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:calc(var(--u)*.35) #fff;paint-order:stroke fill}
.kx-pos.pop{animation:kxpos .45s cubic-bezier(.2,1.8,.4,1)}
.kx-ww{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);font-family:Unbounded,Fredoka,sans-serif;font-weight:800;font-size:calc(var(--u)*8);color:#ffe14a;
  -webkit-text-stroke:calc(var(--u)*.4) #b31a1a;paint-order:stroke fill;display:none;text-align:center;animation:kxblink .5s steps(2) infinite}
.kx-ww.on{display:block}
.kx-ww small{display:block;font-size:.5em}
.kx-banner{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);white-space:nowrap;font-family:Unbounded,Fredoka,sans-serif;font-weight:800;font-style:italic;
  font-size:calc(var(--u)*11);-webkit-text-stroke:calc(var(--u)*.5) rgba(0,0,0,.55);paint-order:stroke fill;text-shadow:0 calc(var(--u)*.8) 0 rgba(0,0,0,.3);animation:kxban 1.9s cubic-bezier(.2,1.4,.4,1) forwards}
.kx-banner small{display:block;font-size:.38em;text-align:center;font-style:normal}
.kx-banner.final{background:linear-gradient(180deg,#fff27a,#ff8a00);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:calc(var(--u)*.5) #fff}
.kx-count{position:absolute;inset:0;display:grid;place-items:center}
.kx-count span{font-family:Unbounded,Fredoka,sans-serif;font-weight:800;font-style:italic;font-size:calc(var(--u)*30);color:#fff;-webkit-text-stroke:calc(var(--u)*.9) #1a1a3a;paint-order:stroke fill;
  text-shadow:0 calc(var(--u)*1.2) 0 rgba(0,0,0,.35);animation:kxcount .9s cubic-bezier(.2,1.6,.4,1) forwards}
.kx-count span.go{background:linear-gradient(180deg,#b8ff6a,#18c03a);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:calc(var(--u)*.8) #fff}
.kx-count span.rocket{font-size:calc(var(--u)*7);margin-top:calc(var(--u)*30);color:#ffd84a;animation:kxpop .5s}
.kx-speed{position:absolute;inset:-10%;opacity:0;transition:opacity .25s;
  background:repeating-conic-gradient(from 0deg at 50% 52%,rgba(255,255,255,.0) 0deg 2.2deg,rgba(255,255,255,.55) 2.4deg 2.7deg,rgba(255,255,255,0) 2.9deg 6.1deg);
  -webkit-mask:radial-gradient(ellipse at 50% 52%,transparent 38%,#000 72%);mask:radial-gradient(ellipse at 50% 52%,transparent 38%,#000 72%);animation:kxspeed .12s linear infinite}
.kx-speed.on{opacity:.75}
.kx-drift{position:absolute;left:50%;bottom:calc(var(--u)*3);transform:translateX(-50%);display:flex;gap:calc(var(--u)*.8);opacity:0;transition:opacity .2s}
.kx-drift.on{opacity:1}
.kx-drift i{width:calc(var(--u)*4.5);height:calc(var(--u)*1.6);border-radius:999px;background:rgba(0,0,0,.35);box-shadow:inset 0 0 0 2px rgba(255,255,255,.5)}
.kx-drift i.l1{background:#45b8ff;box-shadow:0 0 calc(var(--u)*1.5) #45b8ff}
.kx-drift i.l2{background:#ff9a1f;box-shadow:0 0 calc(var(--u)*1.5) #ff9a1f}
.kx-drift i.l3{background:#d35bff;box-shadow:0 0 calc(var(--u)*1.5) #d35bff}
.kx-fin{position:absolute;inset:0;display:none;place-items:center;text-align:center;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 30%,rgba(0,0,0,.35))}
.kx-fin.on{display:grid}
.kx-fin b{display:block;font-family:Unbounded,Fredoka,sans-serif;font-weight:800;font-style:italic;font-size:calc(var(--u)*13);background:repeating-linear-gradient(90deg,#fff 0 .5em,#ddd 0 1em);
  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:calc(var(--u)*.5) #111;paint-order:stroke fill;animation:kxpop .6s cubic-bezier(.2,1.8,.4,1)}
.kx-fin span{display:block;font-size:calc(var(--u)*5);font-weight:600;margin-top:calc(var(--u)*1);text-shadow:0 2px 6px rgba(0,0,0,.6)}
.kx-hint{position:absolute;left:50%;top:calc(var(--u)*20);transform:translateX(-50%);padding:calc(var(--u)*.8) calc(var(--u)*2.4);border-radius:999px;background:rgba(10,12,30,.72);font-size:calc(var(--u)*3);white-space:nowrap;display:none}
.kx-hint.on{display:block}
.kx-div{position:absolute;background:#0b0d1a;z-index:2}
.kx-map3{position:absolute;overflow:hidden;background:radial-gradient(circle at 30% 20%,#2a2f6a,#0d0f24 70%);display:none}
.kx-map3.on{display:block}
.kx-map3 canvas{position:absolute;left:3%;top:6%;width:56%;height:88%}
.kx-map3 .st{position:absolute;right:4%;top:8%;width:36%;display:flex;flex-direction:column;gap:calc(var(--u)*.7);font-size:calc(var(--u)*3.4)}
.kx-map3 .st div{display:flex;align-items:center;gap:.5em;padding:.15em .6em .15em .2em;border-radius:999px;background:rgba(255,255,255,.08)}
.kx-map3 .st div.h{background:color-mix(in srgb,var(--c) 70%,#000)}
.kx-map3 .st b{width:1.6em;text-align:center;font-family:Unbounded,Fredoka,sans-serif;font-style:italic}
.kx-map3 .st span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kx-map3 h3{position:absolute;left:4%;top:2%;margin:0;font-size:calc(var(--u)*3.2);opacity:.75;font-weight:500}
.kx-title{position:absolute;left:0;right:0;bottom:12%;display:flex;flex-direction:column;align-items:center;gap:1vh;animation:kxslide .8s cubic-bezier(.2,1.2,.4,1)}
.kx-title .t{font-family:Unbounded,Fredoka,sans-serif;font-weight:800;font-style:italic;font-size:min(8vw,13vh);line-height:1;-webkit-text-stroke:min(.5vw,.8vh) #141432;paint-order:stroke fill;text-shadow:0 1vh 0 rgba(0,0,0,.3)}
.kx-title .b{font-size:min(2.6vw,4vh);font-weight:600;padding:.3em 1.2em;border-radius:999px;background:rgba(10,12,30,.65)}
.kx-title .ribbon{font-size:min(2vw,3vh);font-weight:700;letter-spacing:.3em;color:#ffcc00}
.kx-toasts{position:absolute;left:50%;top:1.5%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:.6vh;z-index:5}
.kx-toast{background:rgba(8,10,24,.78);border-left:6px solid var(--c);padding:.4em 1em;border-radius:12px;font-size:min(1.5vw,2.6vh);white-space:nowrap;animation:kxdrop .35s ease-out}
.kx-panel{position:absolute;inset:0;display:grid;place-items:center;pointer-events:auto;animation:kxfade .4s;
  background:radial-gradient(circle at 20% 10%,rgba(255,120,60,.35),transparent 45%),radial-gradient(circle at 85% 90%,rgba(80,120,255,.45),transparent 50%),linear-gradient(160deg,#1b1f4a,#0b0d22)}
.kx-panel h1{margin:0;font-family:Unbounded,Fredoka,sans-serif;font-weight:800;font-style:italic;font-size:min(5.4vw,9vh);line-height:1;text-align:center;-webkit-text-stroke:min(.35vw,.6vh) #0b0d22;paint-order:stroke fill}
.kx-panel h1 em{font-style:inherit;background:linear-gradient(180deg,#fff27a,#ff8a00);-webkit-background-clip:text;background-clip:text;color:transparent}
.kx-sub{text-align:center;color:#c8cdf0;font-size:min(1.7vw,3vh);margin:1.4vh 0 3vh}
.kx-tracks{display:flex;gap:2vw;justify-content:center}
.kx-card{width:min(25vw,44vh);border-radius:2vh;overflow:hidden;background:#171a36;box-shadow:0 1.4vh 4vh rgba(0,0,0,.45),inset 0 0 0 2px rgba(255,255,255,.08);transition:transform .25s,box-shadow .25s;position:relative}
.kx-card.sel{transform:translateY(-1.4vh) scale(1.05);box-shadow:0 0 0 .6vh #ffcc00,0 2.4vh 6vh rgba(255,204,0,.35)}
.kx-card canvas{display:block;width:100%;aspect-ratio:16/10}
.kx-card .t{padding:1.2vh 1.4vw 1.8vh}
.kx-card .t b{font-size:min(1.9vw,3.4vh);display:block}
.kx-card .t span{color:#aab;font-size:min(1.1vw,2vh)}
.kx-card .d{position:absolute;top:1.2vh;right:1.2vh;background:rgba(0,0,0,.55);padding:.3em .9em;border-radius:999px;font-size:min(1vw,1.8vh)}
.kx-card .n{position:absolute;top:1.2vh;left:1.2vh;background:#ffcc00;color:#222;font-weight:700;padding:.2em .7em;border-radius:999px;font-size:min(1vw,1.8vh)}
.kx-cc{display:flex;gap:1vw;justify-content:center;margin-top:3vh}
.kx-cc span{padding:.4em 1.4em;border-radius:999px;background:rgba(255,255,255,.08);font-weight:700;font-size:min(1.6vw,2.8vh);color:#aab}
.kx-cc span.on{background:linear-gradient(180deg,#ff6a3a,#d0301a);color:#fff;box-shadow:0 .5vh 0 #7a1a0a}
.kx-timer{margin-top:2.4vh;text-align:center;color:#aab;font-size:min(1.4vw,2.4vh)}
.kx-racers{display:flex;gap:.8vw;justify-content:center;margin-top:2vh;flex-wrap:wrap}
.kx-racers span{padding:.3em .9em;border-radius:999px;background:color-mix(in srgb,var(--c) 75%,#000);font-weight:600;font-size:min(1.3vw,2.3vh)}
.kx-panel.clear{background:linear-gradient(180deg,rgba(12,10,40,.72),rgba(12,10,40,.25) 48%,rgba(12,10,40,0) 60%);place-items:start center}
.kx-lobby{width:100%;height:100%;position:relative;padding-top:2.5vh}
.kx-lobby h1{font-size:min(4.2vw,7.5vh)}
.kx-lobby .kx-sub{margin:.8vh 0 1.6vh;font-size:min(1.4vw,2.5vh)}
.kx-tracks.sm{gap:1.4vw}
.kx-tracks.sm .kx-card{width:min(17vw,30vh)}
.kx-tracks.sm .kx-card canvas{aspect-ratio:16/8}
.kx-tracks.sm .kx-card .t{padding:.6vh 1vw 1vh}
.kx-tracks.sm .kx-card .t b{font-size:min(1.3vw,2.4vh)}
.kx-lobby .kx-cc{margin-top:1.6vh}
.kx-lobby .kx-cc span{font-size:min(1.2vw,2.2vh)}
.kx-slots{position:absolute;left:0;right:0;bottom:6.5vh;height:0}
.kx-slot{position:absolute;bottom:0;transform:translateX(-50%);width:min(21vw,38vh);padding:.6vh .9vw .8vh;border-radius:1.6vh;background:rgba(10,12,34,.82);
  box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--c) 70%,transparent),0 1vh 3vh rgba(0,0,0,.4);text-align:center}
.kx-slot .nm{display:inline-block;margin-top:-3.2vh;padding:.3em 1.1em;border-radius:999px;background:var(--c);font-weight:700;font-size:min(1.4vw,2.5vh);box-shadow:0 .4vh 0 rgba(0,0,0,.3)}
.kx-slot .dk{font-size:min(1.15vw,2.1vh);margin:.6vh 0 .8vh;color:#dde}
.kx-slot .dk b{color:#fff}
.kx-slot .dk i{font-style:normal;font-size:.8em;padding:.1em .6em;border-radius:999px;background:rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.06em}
.kx-slot .bars{display:grid;gap:.25vh}
.kx-slot .bars div{display:grid;grid-template-columns:7.5em 1fr;align-items:center;gap:.6em;font-size:min(.9vw,1.6vh);color:#aab;text-align:left}
.kx-slot .bars em{height:.75vh;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
.kx-slot .bars s{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#ffcc00,#ff7a1a);transition:width .3s}
.kx-slot .rd{margin-top:.4vh;font-weight:700;font-size:min(1.2vw,2.2vh);color:#aab}
.kx-slot.ready{box-shadow:inset 0 0 0 3px #5dff7a,0 0 3vh rgba(93,255,122,.35)}
.kx-slot.ready .rd{color:#5dff7a}
.kx-lobby .kx-extra{position:absolute;left:0;right:0;bottom:3vh;margin:0}
.kx-lobby .kx-timer{position:absolute;left:0;right:0;bottom:.4vh;margin:0}
.kx-places{width:min(70vw,120vh)}
.kx-places .row{display:grid;grid-template-columns:5vh 7vh 1fr auto auto;align-items:center;gap:1.4vw;padding:.6vh 1.2vw;margin:.7vh 0;border-radius:1.4vh;background:rgba(255,255,255,.07);
  font-size:min(2vw,3.4vh);animation:kxslide .5s both}
.kx-places .row.h{background:linear-gradient(90deg,color-mix(in srgb,var(--c) 70%,#000),rgba(255,255,255,.06));box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--c) 70%,#fff)}
.kx-places .row.cpu{opacity:.5;filter:grayscale(.6)}
.kx-places .row .p{font-family:Unbounded,Fredoka,sans-serif;font-weight:800;font-style:italic;font-size:1.3em;text-align:center}
.kx-places .row img,.kx-places .row .ph{width:6.5vh;height:6.5vh;border-radius:1vh;background:#2a2f5a;object-fit:cover}
.kx-places .row .tm{font-variant-numeric:tabular-nums;color:#dde}
.kx-places .row .pt{font-weight:700;color:#ffcc00;min-width:4.5em;text-align:right}
@keyframes kxpop{from{transform:scale(.3)}}
@keyframes kxpos{from{transform:scale(1.5) rotate(-8deg)}}
@keyframes kxroll{50%{transform:translateY(-6%) scale(1.06)}}
@keyframes kxblink{50%{opacity:.25}}
@keyframes kxban{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}12%{transform:translate(-50%,-50%) scale(1.08);opacity:1}20%{transform:translate(-50%,-50%) scale(1)}85%{opacity:1}100%{opacity:0;transform:translate(-50%,-70%) scale(1)}}
@keyframes kxcount{0%{transform:scale(2.2);opacity:0}25%{transform:scale(1);opacity:1}80%{opacity:1}100%{opacity:0;transform:scale(.8)}}
@keyframes kxspeed{50%{transform:rotate(1.2deg) scale(1.02)}}
@keyframes kxslide{from{transform:translateY(4vh);opacity:0}}
@keyframes kxdrop{from{transform:translateY(-2vh);opacity:0}}
@keyframes kxfade{from{opacity:0}}
`;

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

class ViewHud {
  constructor(parent) {
    const v = el('div', 'kx-v', parent);
    this.el = v;
    this.speed = el('div', 'kx-speed', v);
    this.frame = el('div', 'kx-frame', v);
    this.name = el('div', 'kx-name', v);
    this.lapEl = el('div', 'kx-lap', v, '<small>LAP</small><b>1<span>/3</span></b><em></em>');
    this.itemEl = el('div', 'kx-item', v, ITEM_SVG.empty);
    this.coinsEl = el('div', 'kx-coins', v, `${COIN_SVG}<span>0</span>`);
    this.posEl = el('div', 'kx-pos', v, '<span class="n"></span><span class="s"></span>');
    this.drift = el('div', 'kx-drift', v, '<i></i><i></i><i></i>');
    this.ww = el('div', 'kx-ww', v, '↺ WRONG WAY<small>turn around!</small>');
    this.hintEl = el('div', 'kx-hint', v);
    this.count = el('div', 'kx-count', v);
    this.fin = el('div', 'kx-fin', v, '<div><b>FINISH!</b><span></span></div>');
    this.s = {};
  }

  set(key, val) { if (this.s[key] === val) return false; this.s[key] = val; return true; }

  layout(r, W, H) {
    const st = this.el.style;
    st.left = `${(r.x / W) * 100}%`; st.top = `${(r.y / H) * 100}%`;
    st.width = `${(r.w / W) * 100}%`; st.height = `${(r.h / H) * 100}%`;
    const u = Math.min(r.h, (r.w * 9) / 16) / 100;
    st.setProperty('--u', `${u.toFixed(2)}px`);
  }

  show(on) { this.el.style.display = on ? '' : 'none'; }

  player(name, color, avatar) {
    if (!this.set('player', name + color)) return;
    this.el.style.setProperty('--c', color);
    this.name.innerHTML = `<i>${escapeHtml(avatar || '🏎️')}</i>${escapeHtml(name)}`;
  }

  lap(n, total, time) {
    if (this.set('lap', `${n}/${total}`)) {
      this.lapEl.querySelector('b').innerHTML = `${n}<span>/${total}</span>`;
      this.lapEl.classList.remove('pop'); void this.lapEl.offsetWidth; this.lapEl.classList.add('pop');
    }
    if (this.set('time', time)) this.lapEl.querySelector('em').textContent = time;
  }

  pos(n) {
    if (!this.set('pos', n)) return;
    const g = POS_GRAD[Math.max(0, Math.min(7, n - 1))];
    this.posEl.style.setProperty('--g1', g[0]); this.posEl.style.setProperty('--g2', g[1]); this.posEl.style.setProperty('--g3', g[2]);
    const o = ordinal(n);
    this.posEl.querySelector('.n').textContent = String(n);
    this.posEl.querySelector('.s').textContent = o.slice(String(n).length);
    this.posEl.classList.remove('pop'); void this.posEl.offsetWidth; this.posEl.classList.add('pop');
  }

  coins(n) {
    if (!this.set('coins', n)) return;
    this.coinsEl.querySelector('span').textContent = String(n);
    this.coinsEl.classList.toggle('max', n >= 10);
    this.coinsEl.classList.remove('bump'); void this.coinsEl.offsetWidth; this.coinsEl.classList.add('bump');
  }

  /** item: key | null, rolling: bool, t: time (for roulette), count, held: key|null */
  item(item, rolling, t, count, held) {
    const shown = rolling ? ITEM_KEYS[Math.floor(t * 13) % ITEM_KEYS.length] : (held || item || 'empty');
    const state = `${shown}|${rolling}|${count}|${!!held}`;
    if (!this.set('item', state)) return;
    const wasRolling = this.itemEl.classList.contains('roll');
    this.itemEl.innerHTML = ITEM_SVG[shown] + (!rolling && count > 1 ? `<b>×${count}</b>` : '');
    this.itemEl.classList.toggle('roll', rolling);
    this.itemEl.classList.toggle('held', !!held);
    if (wasRolling && !rolling && item) { this.itemEl.classList.remove('got'); void this.itemEl.offsetWidth; this.itemEl.classList.add('got'); }
  }

  driftLevel(on, lvl) {
    if (!this.set('drift', `${on}${lvl}`)) return;
    this.drift.classList.toggle('on', on);
    [...this.drift.children].forEach((c, i) => { c.className = lvl > i ? `l${lvl}` : ''; });
  }

  wrongWay(on) { if (this.set('ww', on)) this.ww.classList.toggle('on', on); }
  speedLines(on) { if (this.set('speed', on)) this.speed.classList.toggle('on', on); }
  hint(text) {
    if (!this.set('hint', text || '')) return;
    this.hintEl.textContent = text || '';
    this.hintEl.classList.toggle('on', !!text);
  }

  banner(html, cls = '', color = '#fff') {
    const b = el('div', `kx-banner ${cls}`, this.el, html);
    if (!cls) b.style.color = color;
    setTimeout(() => b.remove(), 2000);
  }

  countdown(text, cls = '') {
    this.count.innerHTML = '';
    if (text == null) return;
    el('span', cls, this.count, text);
  }

  rocket(text) { const r = el('span', 'rocket', this.count, text); setTimeout(() => r.remove(), 1300); }

  finish(place, sub) {
    this.fin.classList.toggle('on', place > 0);
    if (place > 0) {
      this.fin.querySelector('b').textContent = place === 1 ? '1ST PLACE!' : 'FINISH!';
      this.fin.querySelector('span').textContent = sub || '';
    }
  }

  reset() {
    this.s = {};
    this.finish(0);
    this.countdown(null);
    this.wrongWay(false);
    this.speedLines(false);
    this.hint('');
    this.el.querySelectorAll('.kx-banner').forEach((b) => b.remove());
  }
}

export function createHud(container) {
  const style = el('style', null, null);
  style.textContent = CSS;
  const root = el('div', 'kx');
  container.append(style, root);
  const viewsEl = el('div', '', root);
  const map3 = el('div', 'kx-map3', root, '<h3>LIVE MAP</h3><canvas width="480" height="480"></canvas><div class="st"></div>');
  const divs = [el('div', 'kx-div', root), el('div', 'kx-div', root)];
  const toasts = el('div', 'kx-toasts', root);
  const views = [0, 1, 2, 3].map(() => new ViewHud(viewsEl));
  views.forEach((v) => v.show(false));
  let mapBg = null; let mapXf = null; let mapW = 480;
  let titleEl = null;

  return {
    root,
    views,
    layout(rects, W, H, mapRect) {
      root.classList.toggle('solo', rects.length === 1);
      views.forEach((v, i) => {
        if (rects[i]) { v.layout(rects[i], W, H); v.show(true); } else v.show(false);
      });
      // dividers
      const n = rects.length;
      const t = Math.max(3, Math.round(H * 0.006));
      const set = (d, css) => Object.assign(d.style, { display: 'block', left: '0', top: '0', width: '0', height: '0', ...css });
      if (n <= 1) divs.forEach((d) => { d.style.display = 'none'; });
      else if (n === 2) { set(divs[0], { left: '0', top: `${H / 2 - t / 2}px`, width: '100%', height: `${t}px` }); divs[1].style.display = 'none'; }
      else { set(divs[0], { left: '0', top: `${H / 2 - t / 2}px`, width: '100%', height: `${t}px` }); set(divs[1], { left: `${W / 2 - t / 2}px`, top: '0', width: `${t}px`, height: '100%' }); }
      if (mapRect) {
        Object.assign(map3.style, { left: `${(mapRect.x / W) * 100}%`, top: `${(mapRect.y / H) * 100}%`, width: `${(mapRect.w / W) * 100}%`, height: `${(mapRect.h / H) * 100}%` });
        map3.style.setProperty('--u', `${(Math.min(mapRect.h, (mapRect.w * 9) / 16) / 100).toFixed(2)}px`);
        map3.classList.add('on');
      } else map3.classList.remove('on');
    },
    hideViews() { views.forEach((v) => v.show(false)); divs.forEach((d) => { d.style.display = 'none'; }); map3.classList.remove('on'); },
    setupMap(track, theme) {
      const c = map3.querySelector('canvas');
      const g = c.getContext('2d');
      mapW = c.width;
      let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
      for (let i = 0; i < track.N; i++) { minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]); minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]); }
      const pad = 40;
      const sc = (mapW - 2 * pad) / Math.max(maxX - minX, maxZ - minZ);
      const ox = (mapW - (maxX - minX) * sc) / 2; const oz = (mapW - (maxZ - minZ) * sc) / 2;
      // mirror X so the map matches the drivers' view (track right = screen right when heading "up")
      mapXf = (x, z) => [mapW - (ox + (x - minX) * sc), mapW - (oz + (z - minZ) * sc)];
      g.clearRect(0, 0, mapW, mapW);
      g.lineJoin = 'round'; g.lineCap = 'round';
      const path = () => { g.beginPath(); for (let i = 0; i <= track.N; i++) { const [x, y] = mapXf(track.px[i % track.N], track.pz[i % track.N]); if (i) g.lineTo(x, y); else g.moveTo(x, y); } };
      path(); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 26; g.stroke();
      path(); g.strokeStyle = theme.night ? '#5ad8ff' : '#ffffff'; g.lineWidth = 18; g.stroke();
      path(); g.strokeStyle = theme.night ? '#1d2440' : '#4a4e5a'; g.lineWidth = 12; g.stroke();
      const [sx, sy] = mapXf(track.px[0], track.pz[0]);
      g.fillStyle = '#fff'; g.fillRect(sx - 7, sy - 7, 14, 14);
      g.fillStyle = '#111'; g.fillRect(sx - 7, sy - 7, 7, 7); g.fillRect(sx, sy, 7, 7);
      mapBg = g.getImageData(0, 0, mapW, mapW);
    },
    drawMap(ranking, t) {
      if (!mapBg || !map3.classList.contains('on')) return;
      const g = map3.querySelector('canvas').getContext('2d');
      g.putImageData(mapBg, 0, 0);
      for (let i = ranking.length - 1; i >= 0; i--) {
        const k = ranking[i];
        const [x, y] = mapXf(k.x, k.z);
        const r = k.human ? 13 + Math.sin(t * 6) * 1.5 : 8;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = k.racer.color; g.fill();
        g.lineWidth = k.human ? 4 : 2.5; g.strokeStyle = k.human ? '#fff' : 'rgba(0,0,0,.6)'; g.stroke();
      }
      const key = ranking.map((k) => k.id + (k.finished ? 'f' : '')).join();
      if (map3.dataset.key !== key) {
        map3.dataset.key = key;
        map3.querySelector('.st').innerHTML = ranking.map((k, i) => `<div class="${k.human ? 'h' : ''}" style="--c:${k.racer.color}"><b>${i + 1}</b><span>${escapeHtml(k.racer.name)}</span>${k.finished ? '🏁' : ''}</div>`).join('');
      }
    },
    title(name, sub, ribbon) {
      titleEl?.remove();
      titleEl = el('div', 'kx-title', root, `<div class="ribbon">${escapeHtml(ribbon || '')}</div><div class="t">${escapeHtml(name)}</div><div class="b">${escapeHtml(sub || '')}</div>`);
    },
    clearTitle() { titleEl?.remove(); titleEl = null; },
    toast(color, html, ms = 3000) {
      const t = el('div', 'kx-toast', toasts, html);
      t.style.setProperty('--c', color);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      setTimeout(() => t.remove(), ms);
    },
    panel(html) {
      const p = el('div', 'kx-panel', root, html);
      return p;
    },
    destroy() { root.remove(); style.remove(); },
  };
}

/** Placements screen rows: [{ place, name, color, human, portrait, time, points, total }] */
export function placementsHtml(rows, { title, sub }) {
  return `<div class="kx-places"><h1>${title}</h1><div class="kx-sub">${escapeHtml(sub)}</div>${rows.map((r, i) => `
    <div class="row ${r.human ? 'h' : 'cpu'}" style="--c:${r.color};animation-delay:${i * 0.08}s">
      <span class="p">${ordinal(r.place)}</span>
      ${r.portrait ? `<img src="${r.portrait}" alt="">` : '<span class="ph"></span>'}
      <span>${escapeHtml(r.name)}${r.human ? '' : ' <small style="opacity:.7">CPU</small>'}</span>
      <span class="tm">${r.time}</span>
      <span class="pt">${r.points != null ? `+${r.points} · ${r.total}` : ''}</span>
    </div>`).join('')}</div>`;
}

/** Draw a stylised top-down preview of a track into a canvas. */
export function drawTrackPreview(canvas, track) {
  const th = track.def.theme;
  const W = canvas.width = 480; const H = canvas.height = 300;
  const g = canvas.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H);
  const c = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
  bg.addColorStop(0, c(th.ground[2])); bg.addColorStop(1, c(th.ground[1]));
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (th.night) { g.fillStyle = 'rgba(10,16,50,.55)'; g.fillRect(0, 0, W, H); }
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < track.N; i++) { minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]); minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]); }
  const pad = 34;
  const sc = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxZ - minZ));
  const ox = (W - (maxX - minX) * sc) / 2; const oz = (H - (maxZ - minZ) * sc) / 2;
  const P = (i) => [W - (ox + (track.px[i % track.N] - minX) * sc), H - (oz + (track.pz[i % track.N] - minZ) * sc)];
  const path = () => { g.beginPath(); for (let i = 0; i <= track.N; i += 2) { const [x, y] = P(i); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); };
  g.lineJoin = 'round';
  path(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 22; g.stroke();
  path(); g.strokeStyle = th.wall === 'neon' ? '#ff3ad6' : th.wall === 'orangewhite' ? '#ff8a2a' : '#e8352e'; g.lineWidth = 16; g.stroke();
  path(); g.strokeStyle = th.asphalt; g.lineWidth = 11; g.stroke();
  const [sx, sy] = P(0);
  g.fillStyle = '#fff'; g.fillRect(sx - 6, sy - 6, 12, 12);
  g.fillStyle = '#111'; g.fillRect(sx - 6, sy - 6, 6, 6); g.fillRect(sx, sy, 6, 6);
}

export { ordinal, fmtTime, ITEM_INFO };
