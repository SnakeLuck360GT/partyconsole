// TV stylesheet for Big Fat Liar. Injected into the game container (removed with it on destroy).
// Everything is scoped under .bf and sized in --u (≈1% of a 16:9 screen) so it scales from laptop to TV.
export const SCREEN_CSS = `
.bf { --u: min(1vw, 1.778vh); --ink: #1c0f3a; --paper: #fffaf0; --gold: #ffd23f; --pink: #ff3d8b; --blue: #3db4ff;
  --lie: #ff3b4e; --truth: #1fd97c; position: absolute; inset: 0; overflow: hidden; color: #fff;
  font-family: 'Lilita One', 'Fredoka', system-ui, sans-serif; font-weight: 400; letter-spacing: 0.01em; user-select: none; }
.bf * { box-sizing: border-box; }
.bf-bg { position: absolute; inset: 0; background: linear-gradient(125deg, #2b0b63, #6d1b8f 30%, #c2267a 60%, #ff7a3d 100%);
  background-size: 300% 300%; animation: bf-bgshift 24s ease-in-out infinite alternate; }
.bf.quip .bf-bg { background-image: linear-gradient(125deg, #062a5e, #1b4fb8 30%, #7b2ff7 62%, #ff3d8b 100%); }
@keyframes bf-bgshift { 0% { background-position: 0% 30%; } 100% { background-position: 100% 70%; } }
.bf-rays { position: absolute; left: 50%; top: 45%; width: 260vmax; height: 260vmax; margin: -130vmax 0 0 -130vmax;
  background: repeating-conic-gradient(from 0deg, rgba(255,255,255,0.07) 0deg 9deg, transparent 9deg 18deg);
  animation: bf-spin 90s linear infinite; mask-image: radial-gradient(circle, #000 0%, transparent 45%); -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 45%); }
@keyframes bf-spin { to { transform: rotate(360deg); } }
.bf-shapes i { position: absolute; display: block; opacity: 0.16; animation: bf-float var(--d, 14s) ease-in-out infinite alternate; animation-delay: var(--dl, 0s); font-style: normal; }
.bf-shapes .c { border-radius: 50%; border: calc(var(--u) * 0.8) solid #fff; }
.bf-shapes .s { border-radius: 22%; background: #fff; }
.bf-shapes .t { background: #fff; clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.bf-shapes .g { color: #fff; font-size: calc(var(--u) * 9); line-height: 1; opacity: 0.12; }
@keyframes bf-float { 0% { transform: translate(0, 0) rotate(0deg); } 100% { transform: translate(var(--x, 3vw), var(--y, -6vh)) rotate(var(--r, 60deg)); } }

.bf-top { position: absolute; left: calc(var(--u) * 2); top: calc(var(--u) * 1.6); display: flex; align-items: center; gap: calc(var(--u) * 1.6); z-index: 5; }
.bf-logo { font-size: calc(var(--u) * 2.6); color: var(--gold); -webkit-text-stroke: calc(var(--u) * 0.25) var(--ink); paint-order: stroke fill;
  text-shadow: 0 calc(var(--u) * 0.4) 0 var(--ink); transform: rotate(-3deg); white-space: nowrap; }
.bf-logo b { color: #fff; font-weight: 400; }
.bf-round { font-size: calc(var(--u) * 1.7); background: rgba(20, 6, 50, 0.55); border: calc(var(--u) * 0.2) solid rgba(255,255,255,0.25);
  padding: calc(var(--u) * 0.5) calc(var(--u) * 1.4); border-radius: 999px; letter-spacing: 0.06em; }
.bf-round:empty { display: none; }
.bf-round.double { background: var(--gold); color: var(--ink); border-color: #fff; animation: bf-pulse 1s ease-in-out infinite; }
@keyframes bf-pulse { 50% { transform: scale(1.07); } }

.bf-timer { position: absolute; right: calc(var(--u) * 2); top: calc(var(--u) * 5.2); width: calc(var(--u) * 8.5); height: calc(var(--u) * 8.5); z-index: 6;
  transition: transform 0.35s cubic-bezier(.3,1.6,.5,1), opacity 0.3s; }
.bf-timer.off { transform: scale(0); opacity: 0; }
.bf-timer svg { width: 100%; height: 100%; transform: rotate(-90deg); filter: drop-shadow(0 calc(var(--u)*0.4) 0 rgba(0,0,0,0.3)); }
.bf-timer .bg { fill: var(--paper); stroke: var(--ink); stroke-width: 7; }
.bf-timer .fg { fill: none; stroke: var(--truth); stroke-width: 9; stroke-linecap: round; transition: stroke 0.3s; }
.bf-timer span { position: absolute; inset: 0; display: grid; place-items: center; color: var(--ink); font-size: calc(var(--u) * 3.4); }
.bf-timer.warn .fg { stroke: var(--gold); }
.bf-timer.danger .fg { stroke: var(--lie); }
.bf-timer.danger { animation: bf-throb 0.5s ease-in-out infinite; }
@keyframes bf-throb { 50% { transform: scale(1.1); } }

.bf-stage { position: absolute; left: 0; right: 0; top: calc(var(--u) * 6.5); bottom: calc(var(--u) * 10.5); display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: calc(var(--u) * 2); padding: 0 calc(var(--u) * 11); z-index: 3; }
.bf-stage.wide { padding: 0 calc(var(--u) * 3); }

/* ------------------------------------------------ prompt card */
.bf-cat { font-size: calc(var(--u) * 1.6); letter-spacing: 0.12em; background: var(--ink); color: var(--gold); padding: calc(var(--u)*0.4) calc(var(--u)*1.4);
  border-radius: 999px; transform: rotate(-2deg); box-shadow: 0 calc(var(--u)*0.35) 0 rgba(0,0,0,0.3); animation: bf-pop 0.5s cubic-bezier(.3,1.7,.5,1) both; }
.bf-card { background: var(--paper); color: var(--ink); border-radius: calc(var(--u) * 2.4); border: calc(var(--u) * 0.45) solid var(--ink);
  box-shadow: 0 calc(var(--u) * 1) 0 var(--ink), 0 calc(var(--u) * 2.4) calc(var(--u) * 4) rgba(0,0,0,0.35); }
.bf-prompt { font-size: calc(var(--u) * 3.7); line-height: 1.18; padding: calc(var(--u) * 2.6) calc(var(--u) * 3.4); text-align: center; max-width: calc(var(--u) * 82);
  transform: rotate(-1.2deg); animation: bf-slam 0.6s cubic-bezier(.2,1.5,.4,1) both; }
.bf-prompt.small { font-size: calc(var(--u) * 2.3); padding: calc(var(--u) * 1.3) calc(var(--u) * 2.4); max-width: calc(var(--u) * 90); transform: rotate(-0.6deg); animation: none; }
.bf-prompt.tiny { font-size: calc(var(--u) * 1.9); padding: calc(var(--u) * 1) calc(var(--u) * 2); }
.bf-blank { display: inline-block; min-width: 4.2em; border-bottom: 0.14em solid var(--pink); margin: 0 0.1em; transform: translateY(-0.12em); animation: bf-blink 1.4s ease-in-out infinite; }
@keyframes bf-blink { 50% { border-color: var(--blue); } }
@keyframes bf-slam { 0% { transform: scale(2.4) rotate(8deg); opacity: 0; } 60% { opacity: 1; } 100% { transform: scale(1) rotate(-1.2deg); } }
@keyframes bf-pop { 0% { transform: scale(0) rotate(-12deg); } 100% { transform: scale(1) rotate(-2deg); } }
.bf-sub { font-size: calc(var(--u) * 2.3); text-align: center; text-shadow: 0 calc(var(--u)*0.3) 0 rgba(0,0,0,0.35); animation: bf-rise 0.5s 0.3s both; }
.bf-sub em { font-style: normal; color: var(--gold); }
@keyframes bf-rise { from { transform: translateY(calc(var(--u) * 3)); opacity: 0; } }

/* ------------------------------------------------ answers */
.bf-grid { display: grid; gap: calc(var(--u) * 1.4); width: 100%; justify-content: center; grid-template-columns: repeat(var(--cols, 3), minmax(0, calc(var(--u) * 26))); }
.bf-ans { --c: #ff4d6d; position: relative; background: var(--c); color: #fff; border-radius: calc(var(--u) * 1.6); border: calc(var(--u) * 0.4) solid var(--ink);
  box-shadow: 0 calc(var(--u) * 0.7) 0 var(--ink); padding: calc(var(--u) * 1.2) calc(var(--u) * 1.4); min-height: calc(var(--u) * 7.2);
  display: flex; align-items: center; justify-content: center; text-align: center; font-size: calc(var(--u) * 2.2); line-height: 1.12; text-transform: uppercase;
  -webkit-text-stroke: calc(var(--u) * 0.12) rgba(28,15,58,0.55); paint-order: stroke fill; word-break: break-word; transition: opacity 0.4s, filter 0.4s, transform 0.4s; }
.bf-ans.flip { animation: bf-flip 0.55s cubic-bezier(.3,1.4,.5,1) both; }
@keyframes bf-flip { 0% { transform: perspective(800px) rotateY(95deg) scale(0.7); opacity: 0; } 100% { transform: none; opacity: 1; } }
.bf-ans.done { filter: saturate(0.35) brightness(0.75); }
.bf-ans .tag { position: absolute; left: 50%; bottom: calc(var(--u) * -1.3); transform: translateX(-50%) rotate(-3deg); white-space: nowrap; font-size: calc(var(--u) * 1.2);
  background: var(--ink); color: #fff; padding: calc(var(--u)*0.25) calc(var(--u)*0.8); border-radius: 999px; -webkit-text-stroke: 0; text-transform: none;
  animation: bf-pop2 0.35s cubic-bezier(.3,1.7,.5,1) both; max-width: 110%; overflow: hidden; text-overflow: ellipsis; }
.bf-ans .tag.lie { background: var(--lie); }
.bf-ans .tag.truth { background: var(--truth); color: var(--ink); }
.bf-ans.is-truth { filter: none; box-shadow: 0 0 0 calc(var(--u)*0.5) var(--truth), 0 0 calc(var(--u)*4) var(--truth); transform: scale(1.06); }
@keyframes bf-pop2 { 0% { transform: translateX(-50%) scale(0); } 100% { transform: translateX(-50%) rotate(-3deg) scale(1); } }
.bf-num { position: absolute; top: calc(var(--u) * -1); left: calc(var(--u) * -1); width: calc(var(--u)*3); height: calc(var(--u)*3); border-radius: 50%;
  background: var(--gold); color: var(--ink); display: grid; place-items: center; font-size: calc(var(--u)*1.6); border: calc(var(--u)*0.3) solid var(--ink); -webkit-text-stroke: 0; }

/* ------------------------------------------------ head-to-head */
.bf-vs { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: calc(var(--u) * 2.5); width: 100%; max-width: calc(var(--u) * 100); }
.bf-side { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: calc(var(--u) * 1.2); }
.bf-side .bf-ans { font-size: calc(var(--u) * 3.1); min-height: calc(var(--u) * 15); padding: calc(var(--u) * 2); }
.bf-side.l .bf-ans { --c: var(--pink); animation: bf-inL 0.6s cubic-bezier(.2,1.4,.4,1) both; transform: rotate(-2deg); }
.bf-side.r .bf-ans { --c: #2f8cff; animation: bf-inR 0.6s 0.25s cubic-bezier(.2,1.4,.4,1) both; transform: rotate(2deg); }
@keyframes bf-inL { from { transform: translateX(-70vw) rotate(-30deg); } }
@keyframes bf-inR { from { transform: translateX(70vw) rotate(30deg); } }
.bf-vsbadge { font-size: calc(var(--u) * 6); color: var(--gold); -webkit-text-stroke: calc(var(--u) * 0.35) var(--ink); paint-order: stroke fill;
  text-shadow: 0 calc(var(--u)*0.6) 0 var(--ink); animation: bf-vsin 0.5s 0.5s cubic-bezier(.3,1.8,.5,1) both, bf-pulse 1.2s 1s ease-in-out infinite; }
@keyframes bf-vsin { from { transform: scale(0) rotate(-40deg); } }
.bf-side.win .bf-ans { transform: scale(1.08) rotate(0deg); box-shadow: 0 0 0 calc(var(--u)*0.5) var(--gold), 0 0 calc(var(--u)*5) var(--gold); }
.bf-side.lose .bf-ans { filter: saturate(0.3) brightness(0.7); transform: scale(0.94); }
.bf-meter { height: calc(var(--u) * 3.4); border-radius: 999px; background: rgba(20,6,50,0.5); border: calc(var(--u)*0.3) solid var(--ink); overflow: hidden; position: relative; opacity: 0; transition: opacity 0.3s; }
.bf-meter.on { opacity: 1; }
.bf-meter i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: var(--gold); transition: width 1.2s cubic-bezier(.3,1,.4,1); }
.bf-meter b { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-weight: 400; font-size: calc(var(--u) * 2); -webkit-text-stroke: calc(var(--u)*0.15) var(--ink); paint-order: stroke fill; }
.bf-authorline { min-height: calc(var(--u) * 5); display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 1); font-size: calc(var(--u) * 2.2); }
.bf-authorline .bf-av { --s: calc(var(--u) * 4.4); }
.bf-authorline .pts { color: var(--gold); -webkit-text-stroke: calc(var(--u)*0.15) var(--ink); paint-order: stroke fill; }
.bf-slidein { animation: bf-rise 0.45s cubic-bezier(.3,1.5,.5,1) both; }

/* ------------------------------------------------ avatars & status bar */
.bf-av { --s: calc(var(--u) * 5.2); --c: #888; position: relative; width: var(--s); height: var(--s); border-radius: 50%; background: var(--c); display: grid; place-items: center;
  font-size: calc(var(--s) * 0.56); border: calc(var(--s) * 0.07) solid var(--ink); box-shadow: 0 calc(var(--s) * 0.08) 0 var(--ink); flex: none; line-height: 1; font-family: system-ui, sans-serif; }
.bf-bar { position: absolute; left: 0; right: 0; bottom: 0; height: calc(var(--u) * 10.5); display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 2);
  padding: 0 calc(var(--u) * 2); z-index: 4; background: linear-gradient(to top, rgba(12, 4, 32, 0.7), transparent); transition: transform 0.4s; }
.bf-bar.off { transform: translateY(110%); }
.bf-bar-avs { display: flex; gap: var(--gap, calc(var(--u) * 1.1)); align-items: flex-end; }
.bf-pl { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 0.3); width: var(--w, calc(var(--u) * 6.4)); transition: opacity 0.3s; }
.bf-pl .bf-av { --s: var(--avs, calc(var(--u) * 4.6)); filter: grayscale(0.85) brightness(0.7); transition: filter 0.3s; }
.bf-pl .nm { font-family: 'Fredoka', system-ui, sans-serif; font-weight: 600; font-size: calc(var(--u) * 1.15); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.8; }
.bf-pl.done .bf-av { filter: none; animation: bf-bounce 0.6s cubic-bezier(.3,1.8,.5,1); }
.bf-pl.done .bf-av::after { content: '✓'; position: absolute; right: -12%; bottom: -8%; width: 44%; height: 44%; border-radius: 50%; background: var(--truth); color: var(--ink);
  display: grid; place-items: center; font-size: calc(var(--avs, calc(var(--u) * 4.6)) * 0.28); border: calc(var(--u)*0.2) solid var(--ink); font-family: 'Lilita One', 'Fredoka', sans-serif; }
.bf-pl.gone { opacity: 0.3; }
.bf-pl.idle .bf-av { filter: none; animation: bf-idle 2.4s ease-in-out infinite; animation-delay: var(--dl, 0s); }
@keyframes bf-idle { 50% { transform: translateY(calc(var(--u) * -0.6)); } }
@keyframes bf-bounce { 0% { transform: scale(1); } 30% { transform: scale(1.35) translateY(calc(var(--u) * -1.6)); } 60% { transform: scale(0.9); } 100% { transform: scale(1); } }
.bf-count { font-size: calc(var(--u) * 2.3); white-space: nowrap; background: rgba(20,6,50,0.6); border: calc(var(--u)*0.2) solid rgba(255,255,255,0.25); padding: calc(var(--u)*0.5) calc(var(--u)*1.3); border-radius: 999px; }
.bf-count b { color: var(--truth); font-weight: 400; }
.bf-aud { font-size: calc(var(--u) * 1.6); white-space: nowrap; opacity: 0.9; background: rgba(255,255,255,0.12); padding: calc(var(--u)*0.4) calc(var(--u)*1.1); border-radius: 999px; }
.bf-aud:empty { display: none; }

/* ------------------------------------------------ overlays: spotlight, scoreboard, how-to, banners */
.bf-over { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(12, 4, 32, 0.72); backdrop-filter: blur(calc(var(--u) * 0.5));
  animation: bf-fade 0.3s both; }
.bf-over.out { animation: bf-fadeout 0.3s both; }
@keyframes bf-fade { from { opacity: 0; } }
@keyframes bf-fadeout { to { opacity: 0; } }
.bf-spot { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 2); width: calc(var(--u) * 70); }
.bf-spot .bf-ans { font-size: calc(var(--u) * 4.4); width: 100%; min-height: calc(var(--u) * 16); padding: calc(var(--u) * 2.5); animation: bf-slam2 0.55s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes bf-slam2 { 0% { transform: scale(0.2) rotate(-14deg); opacity: 0; } 100% { transform: none; opacity: 1; } }
.bf-spot .q { font-size: calc(var(--u) * 1.9); opacity: 0.85; text-align: center; max-width: 100%; }
.bf-tray { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 0.8); justify-content: center; min-height: calc(var(--u) * 5); align-items: center; }
.bf-tray .bf-av { --s: calc(var(--u) * 4.6); }
.bf-tray .aud { font-size: calc(var(--u) * 1.9); background: rgba(255,255,255,0.18); border-radius: 999px; padding: calc(var(--u)*0.5) calc(var(--u)*1.2); animation: bf-pop 0.4s cubic-bezier(.3,1.7,.5,1) both; }
.bf-tray .none { font-size: calc(var(--u) * 2); opacity: 0.8; }
.bf-stamp { position: absolute; z-index: 5; left: 50%; top: 50%; font-size: calc(var(--u) * 9); padding: 0 calc(var(--u) * 2.5); border: calc(var(--u) * 0.9) solid currentColor;
  border-radius: calc(var(--u) * 2); color: var(--lie); background: rgba(255,255,255,0.92); transform: translate(-50%, -50%) rotate(-12deg); pointer-events: none;
  animation: bf-stamp 0.45s cubic-bezier(.2,1.6,.4,1) both; white-space: nowrap; box-shadow: 0 calc(var(--u)*0.8) calc(var(--u)*3) rgba(0,0,0,0.4); }
.bf-stamp.truth { color: #0a9d55; }
.bf-stamp.gold { color: #d48a00; }
@keyframes bf-stamp { 0% { transform: translate(-50%, -50%) rotate(-12deg) scale(3.5); opacity: 0; } 100% { transform: translate(-50%, -50%) rotate(-12deg) scale(1); opacity: 1; } }
.bf-reveal { position: relative; width: 100%; }
.bf-author { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 0.8); font-size: calc(var(--u) * 2.6); text-align: center; min-height: calc(var(--u) * 9); }
.bf-author .who { display: flex; gap: calc(var(--u) * 1.2); align-items: center; flex-wrap: wrap; justify-content: center; }
.bf-author .who > span { display: inline-flex; align-items: center; gap: calc(var(--u)*0.6); }
.bf-author .who .bf-av { --s: calc(var(--u) * 5); }
.bf-author .pts { color: var(--gold); font-size: calc(var(--u) * 3.2); -webkit-text-stroke: calc(var(--u)*0.18) var(--ink); paint-order: stroke fill; }
.bf-shake { animation: bf-shake 0.4s; }
@keyframes bf-shake { 20% { transform: translate(-1.2%, 0.6%) rotate(-0.6deg); } 40% { transform: translate(1%, -0.8%) rotate(0.5deg); } 60% { transform: translate(-0.8%, 0.4%); } 80% { transform: translate(0.5%, -0.2%); } }

.bf-banner { position: absolute; inset: 0; z-index: 25; display: grid; place-items: center; pointer-events: none; }
.bf-banner > div { text-align: center; animation: bf-bannerin 0.55s cubic-bezier(.2,1.6,.4,1) both; }
.bf-banner.out > div { animation: bf-bannerout 0.35s ease-in both; }
.bf-banner .big { font-size: calc(var(--u) * 11); line-height: 0.95; color: var(--gold); -webkit-text-stroke: calc(var(--u) * 0.5) var(--ink); paint-order: stroke fill;
  text-shadow: 0 calc(var(--u) * 1) 0 var(--ink); transform: rotate(-4deg); }
.bf-banner .small { margin-top: calc(var(--u) * 1.8); display: inline-block; font-size: calc(var(--u) * 3); background: var(--ink); padding: calc(var(--u)*0.6) calc(var(--u)*2.2); border-radius: 999px; transform: rotate(2deg); }
.bf-banner.sweep .big { color: #fff; background: linear-gradient(90deg, #ff3d8b, #ffd23f, #1fd97c, #3db4ff, #b46bff); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
@keyframes bf-bannerin { 0% { transform: scale(0.1) rotate(-25deg); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes bf-bannerout { to { transform: scale(1.6); opacity: 0; } }

.bf-board { width: min(92vw, calc(var(--u) * 96)); display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 1.6); }
.bf-board h2 { margin: 0; font-weight: 400; font-size: calc(var(--u) * 4.6); color: var(--gold); -webkit-text-stroke: calc(var(--u)*0.3) var(--ink); paint-order: stroke fill; text-shadow: 0 calc(var(--u)*0.5) 0 var(--ink); transform: rotate(-2deg); }
.bf-rows { display: grid; grid-auto-flow: column; grid-template-rows: repeat(var(--rows, 8), auto); gap: calc(var(--u) * 0.8) calc(var(--u) * 2.2); width: 100%; }
.bf-row { display: flex; align-items: center; gap: calc(var(--u) * 1.2); background: var(--paper); color: var(--ink); border: calc(var(--u)*0.3) solid var(--ink); border-radius: calc(var(--u)*1.4);
  padding: calc(var(--u)*0.4) calc(var(--u)*1.4) calc(var(--u)*0.4) calc(var(--u)*0.6); box-shadow: 0 calc(var(--u)*0.45) 0 var(--ink); font-size: calc(var(--rowf, 2.4) * var(--u));
  animation: bf-rowin 0.4s cubic-bezier(.3,1.5,.5,1) both; }
@keyframes bf-rowin { from { transform: translateX(-30vw); opacity: 0; } }
.bf-row .rk { width: 1.6em; text-align: center; opacity: 0.6; }
.bf-row .bf-av { --s: calc(var(--rowf, 2.4) * var(--u) * 1.7); }
.bf-row .nm { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'Fredoka', sans-serif; font-weight: 700; }
.bf-row .sc { font-variant-numeric: tabular-nums; }
.bf-row .dl { color: #fff; background: var(--truth); border-radius: 999px; padding: 0 0.5em; font-size: 0.8em; -webkit-text-stroke: calc(var(--u)*0.1) var(--ink); paint-order: stroke fill; transform: scale(0); transition: transform 0.35s cubic-bezier(.3,1.8,.5,1); }
.bf-row .dl.on { transform: scale(1); }
.bf-row.gone { opacity: 0.45; }
.bf-row.lead { background: var(--gold); }

.bf-howto { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 2.4); }
.bf-howto h2 { margin: 0; font-weight: 400; font-size: calc(var(--u) * 6); color: var(--gold); -webkit-text-stroke: calc(var(--u)*0.35) var(--ink); paint-order: stroke fill; text-shadow: 0 calc(var(--u)*0.6) 0 var(--ink); transform: rotate(-3deg); animation: bf-bannerin 0.5s both; }
.bf-steps { display: flex; gap: calc(var(--u) * 2); }
.bf-step { width: calc(var(--u) * 27); padding: calc(var(--u) * 2); text-align: center; font-size: calc(var(--u) * 2.1); line-height: 1.2; display: flex; flex-direction: column; gap: calc(var(--u)*0.8); align-items: center; animation: bf-slam2 0.5s cubic-bezier(.2,1.5,.4,1) both; }
.bf-step:nth-child(1) { transform: rotate(-2deg); }
.bf-step:nth-child(3) { transform: rotate(2deg); }
.bf-step .e { font-size: calc(var(--u) * 6); line-height: 1; font-family: system-ui, sans-serif; }
.bf-step small { font-family: 'Fredoka', sans-serif; font-weight: 500; font-size: calc(var(--u) * 1.6); opacity: 0.75; }
.bf-skiphint { font-size: calc(var(--u) * 1.6); opacity: 0.75; font-family: 'Fredoka', sans-serif; }

/* ------------------------------------------------ title / mode select */
.bf-title { text-align: center; line-height: 0.88; transform: rotate(-4deg); animation: bf-slam 0.7s cubic-bezier(.2,1.5,.4,1) both; }
.bf-title .l1 { display: block; font-size: calc(var(--u) * 5); color: #fff; -webkit-text-stroke: calc(var(--u)*0.35) var(--ink); paint-order: stroke fill; text-shadow: 0 calc(var(--u)*0.6) 0 var(--ink); }
.bf-title .l2 { display: block; font-size: calc(var(--u) * 12); color: var(--gold); -webkit-text-stroke: calc(var(--u)*0.55) var(--ink); paint-order: stroke fill; text-shadow: 0 calc(var(--u)*1) 0 var(--ink); }
.bf-title .nose { display: inline-block; animation: bf-nose 2.2s ease-in-out infinite; transform-origin: 20% 50%; font-family: system-ui, sans-serif; }
@keyframes bf-nose { 50% { transform: scaleX(1.3) rotate(-6deg); } }
.bf-modes { display: flex; gap: calc(var(--u) * 3); }
.bf-mode { width: calc(var(--u) * 34); padding: calc(var(--u) * 1.8) calc(var(--u) * 2.2); text-align: center; cursor: pointer; display: flex; flex-direction: column; gap: calc(var(--u)*0.6); align-items: center;
  transition: transform 0.2s; animation: bf-slam2 0.5s 0.2s cubic-bezier(.2,1.5,.4,1) both; }
.bf-mode:nth-child(2) { animation-delay: 0.35s; }
.bf-mode:hover { transform: scale(1.04) rotate(-1deg); }
.bf-mode .e { font-size: calc(var(--u) * 5.5); line-height: 1; font-family: system-ui, sans-serif; }
.bf-mode .n { font-size: calc(var(--u) * 3.4); }
.bf-mode.fib .n { color: #c2185b; }
.bf-mode.quip .n { color: #1b4fb8; }
.bf-mode .d { font-family: 'Fredoka', sans-serif; font-weight: 500; font-size: calc(var(--u) * 1.65); line-height: 1.25; opacity: 0.85; }
.bf-mode.off { filter: grayscale(1); opacity: 0.55; }
.bf-mode .note { font-size: calc(var(--u) * 1.4); color: var(--lie); }
.bf-mode.chosen { transform: scale(1.12) rotate(-2deg); box-shadow: 0 0 0 calc(var(--u)*0.6) var(--gold), 0 0 calc(var(--u)*6) var(--gold); }
.bf-mode.notchosen { transform: scale(0.85); opacity: 0.3; }

/* ------------------------------------------------ fx */
.bf-fx { position: absolute; inset: 0; pointer-events: none; z-index: 40; overflow: hidden; }
.bf-conf { position: absolute; top: -4vh; width: calc(var(--u) * 1.1); height: calc(var(--u) * 1.8); border-radius: 2px; animation: bf-fall var(--t, 2.6s) cubic-bezier(.25,.5,.6,1) forwards; }
@keyframes bf-fall { to { transform: translate(var(--dx, 0), 112vh) rotate(var(--rot, 720deg)); } }
.bf-awards { display: flex; gap: calc(var(--u) * 2.2); flex-wrap: wrap; justify-content: center; }
.bf-award { width: calc(var(--u) * 26); padding: calc(var(--u) * 1.8); display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 0.7); text-align: center; animation: bf-slam2 0.5s cubic-bezier(.2,1.5,.4,1) both; }
.bf-award .e { font-size: calc(var(--u) * 5); line-height: 1; font-family: system-ui, sans-serif; }
.bf-award .t { font-size: calc(var(--u) * 2.6); color: #c2185b; }
.bf-award .bf-av { --s: calc(var(--u) * 6); }
.bf-award .nm { font-family: 'Fredoka', sans-serif; font-weight: 700; font-size: calc(var(--u) * 2.2); }
.bf-award small { font-family: 'Fredoka', sans-serif; font-weight: 500; font-size: calc(var(--u) * 1.5); opacity: 0.75; }
`;
