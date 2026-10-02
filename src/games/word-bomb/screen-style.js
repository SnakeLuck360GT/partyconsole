// Word Bomb TV styles. Flat ink table, one hot accent (bomb orange), player colours for identity, heavy Figtree.
export const SCREEN_CSS = `
.wb-root { --ink:#141519; --ink-2:#1d1f25; --paper:#f4f1ea; --text:#f4f1ea; --muted:#9a9ba4; --hot:#ff5a1f; --heart:#ff4057;
  position:absolute; inset:0; overflow:hidden; font-family:'Figtree',system-ui,sans-serif; color:var(--text); background:var(--ink); user-select:none; }
.wb-shake { position:absolute; inset:0; will-change:transform; }
.wb-root canvas { position:absolute; inset:0; width:100%; height:100%; display:block; pointer-events:none; }
.wb-floaters { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
.wb-floater { position:absolute; bottom:-12vh; font-weight:800; letter-spacing:-.01em; color:rgba(244,241,234,.028); white-space:nowrap; animation:wb-floatup linear forwards; text-transform:uppercase; }
@keyframes wb-floatup { from { transform:translateY(0) rotate(var(--r)); } to { transform:translateY(-125vh) rotate(calc(var(--r) * -1)); } }

/* ---------- seats */
.wb-seats { position:absolute; inset:0; pointer-events:none; }
.wb-seat { --s:80px; --c:#fff; --on:#fff; position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; width:calc(var(--s) * 2); transition:filter .4s, opacity .4s; }
.wb-av { position:relative; width:var(--s); height:var(--s); border-radius:50%; display:grid; place-items:center; background:var(--c); color:var(--on);
  box-shadow:0 0 0 calc(var(--s) * .055) var(--ink), 0 0 0 calc(var(--s) * .1) rgba(244,241,234,.92), 0 calc(var(--s)*.1) calc(var(--s)*.2) rgba(0,0,0,.45);
  transition:transform .35s cubic-bezier(.2,1.6,.4,1); }
.wb-ini { font-weight:800; font-size:calc(var(--s) * .4); letter-spacing:-.02em; line-height:1; }
.wb-ring { position:absolute; inset:calc(var(--s) * -.24); border-radius:50%; border:calc(var(--s) * .07) solid var(--c); opacity:0; }
.wb-seat.turn .wb-ring { opacity:1; animation:wb-ring 1s ease-out infinite; }
@keyframes wb-ring { from { transform:scale(.86); opacity:1; } to { transform:scale(1.18); opacity:0; } }
.wb-tag { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) rotate(-10deg); display:none; padding:.12em .45em; border-radius:.3em; font-weight:800; font-size:max(10px, calc(var(--s) * .2)); letter-spacing:.06em; background:var(--ink); color:var(--paper); border:2px solid currentColor; white-space:nowrap; z-index:3; }
.wb-name { margin-top:calc(var(--s) * .2); max-width:100%; padding:.08em .5em; border-radius:999px; font-weight:700; font-size:max(12px, calc(var(--s) * .24)); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.25;
  text-shadow:0 1px 3px rgba(0,0,0,.6); transition:background .2s, color .2s; }
.wb-hearts { display:flex; gap:calc(var(--s) * .04); margin-top:calc(var(--s) * .05); height:calc(var(--s) * .2); min-height:10px; position:relative; }
.wb-hearts svg { height:100%; width:auto; overflow:visible; }
.wb-hearts .full path { fill:var(--heart); }
.wb-hearts .empty path { fill:none; stroke:rgba(244,241,234,.35); stroke-width:2; }
.wb-hearts .lost { animation:wb-heartpop .9s ease-out forwards; }
@keyframes wb-heartpop { 0% { transform:scale(1); } 25% { transform:scale(1.8); } 100% { transform:translateY(30px) scale(.6) rotate(40deg); opacity:0; } }
.wb-hearts .gained { animation:wb-heartgain .8s cubic-bezier(.2,1.8,.4,1); }
@keyframes wb-heartgain { from { transform:scale(3); opacity:0; } }
.wb-prog { transition:opacity .3s; width:calc(var(--s) * 1); height:max(3px, calc(var(--s) * .045)); margin-top:calc(var(--s) * .08); border-radius:9px; background:rgba(244,241,234,.1); overflow:hidden; }
.wb-prog i { display:block; height:100%; width:0; background:var(--c); border-radius:9px; transition:width .5s; }

.wb-seat.turn .wb-av { transform:scale(1.2); }
.wb-name, .wb-hearts { position:relative; z-index:2; }
.wb-seat.turn .wb-name { margin-top:calc(var(--s) * .3); background:var(--c); color:var(--on); text-shadow:none; }
.wb-seat.dead { filter:grayscale(1); opacity:.45; }
.wb-seat.dead .wb-tag.out { display:block; color:#ff6b7d; }
.wb-seat.dc { opacity:.5; }
.wb-seat.dc .wb-tag.off { display:block; color:var(--muted); }
.wb-seat.hit .wb-av { animation:wb-hit .7s ease-out; }
@keyframes wb-hit { 0% { filter:brightness(3) saturate(0); } 15% { transform:scale(1.4) rotate(-12deg); } 30% { transform:scale(.9) rotate(10deg); } 45% { transform:rotate(-6deg); } 100% { transform:none; } }
.wb-seat.shake .wb-av { animation:wb-shake .4s; }
.wb-seat.good .wb-av { animation:wb-good .5s cubic-bezier(.2,1.8,.4,1); }
@keyframes wb-good { 30% { transform:scale(1.32); } }
@keyframes wb-shake { 20%,60% { transform:translateX(-12%); } 40%,80% { transform:translateX(12%); } }
.wb-bubble { position:absolute; left:50%; transform:translateX(-50%); white-space:nowrap; padding:.16em .55em; border-radius:.4em; background:var(--paper); color:var(--ink); font-weight:800; letter-spacing:.03em; text-transform:uppercase;
  font-size:max(12px, calc(var(--s) * .26)); box-shadow:0 6px 16px rgba(0,0,0,.35); opacity:0; transition:opacity .2s; pointer-events:none; z-index:4; }
.wb-bubble.show { opacity:1; }
.wb-bubble.below { top:calc(100% + 6px); }
.wb-bubble.above { bottom:calc(100% + 14px); }
.wb-bubble .hl { color:var(--hot); }
.wb-many .wb-bubble, .wb-many .wb-prog { display:none; }

/* ---------- centre */
.wb-prompt { position:absolute; transform:translate(-50%,-50%); display:flex; gap:.01em; font-weight:800; line-height:1; pointer-events:none; z-index:3; letter-spacing:-.01em; }
.wb-prompt span { display:inline-block; color:#fff; text-shadow:0 .05em 0 rgba(0,0,0,.55); animation:wb-letter .45s cubic-bezier(.2,1.7,.4,1) both; }
@keyframes wb-letter { from { transform:translateY(-.6em) scale(.3); opacity:0; } }
.wb-prompt.gone span { animation:wb-letterout .25s ease-in forwards; }
@keyframes wb-letterout { to { transform:scale(1.8); opacity:0; } }
.wb-pill { position:absolute; transform:translateX(-50%); display:flex; align-items:center; gap:.4em; max-width:78%; padding:.22em .7em .22em .25em; border-radius:999px;
  background:var(--paper); color:var(--ink); box-shadow:0 .2em .7em rgba(0,0,0,.4); z-index:3; white-space:nowrap; transition:opacity .2s; }
.wb-pill .av { width:1.45em; height:1.45em; border-radius:50%; display:grid; place-items:center; font-size:.62em; font-weight:800; background:var(--c,#555); color:var(--on,#fff); flex:none; }
.wb-pill .txt { font-weight:800; letter-spacing:.03em; text-transform:uppercase; min-width:1em; overflow:hidden; text-overflow:clip; }
.wb-pill .txt .hl { color:var(--hot); }
.wb-pill .txt .ph { color:#8b8c94; letter-spacing:0; text-transform:none; font-weight:600; }
.wb-pill .caret { display:inline-block; width:.07em; height:.95em; background:var(--ink); margin-left:.05em; vertical-align:-.1em; animation:wb-blink 1s steps(1) infinite; }
@keyframes wb-blink { 50% { opacity:0; } }
.wb-pill.bad { animation:wb-pillshake .45s; box-shadow:0 0 0 .1em #ff3b4f, 0 .2em .7em rgba(0,0,0,.4); }
@keyframes wb-pillshake { 15%,55% { transform:translateX(calc(-50% - .5em)); } 35%,75% { transform:translateX(calc(-50% + .5em)); } }
.wb-pill.hidden { opacity:0; }
.wb-hint { position:absolute; transform:translateX(-50%); font-weight:700; white-space:nowrap; z-index:3; text-align:center; transition:opacity .25s; }
.wb-hint.bad { color:#ff7383; }
.wb-hint.info { color:var(--muted); }
.wb-hint b { color:var(--text); letter-spacing:.03em; }
.wb-flyword { position:absolute; transform:translate(-50%,0); font-weight:800; letter-spacing:.03em; text-transform:uppercase; color:#4ade80; text-shadow:0 .06em .2em rgba(0,0,0,.6); pointer-events:none; z-index:4; animation:wb-fly 1.1s cubic-bezier(.2,.8,.3,1) forwards; white-space:nowrap; }
@keyframes wb-fly { 0% { transform:translate(-50%,0) scale(1); } 25% { transform:translate(-50%,-.4em) scale(1.25); opacity:1; } 100% { transform:translate(-50%,-3.2em) scale(.9); opacity:0; } }
.wb-callout { position:absolute; transform:translate(-50%,-50%); font-weight:800; white-space:nowrap; pointer-events:none; z-index:6; text-align:center; animation:wb-callout 1.8s cubic-bezier(.2,1.5,.4,1) forwards;
  padding:.1em .45em; border-radius:.3em; background:var(--ink); border:.08em solid currentColor; display:flex; align-items:center; gap:.25em; }
.wb-callout svg { height:.8em; width:auto; }
.wb-callout svg path { fill:currentColor; }
@keyframes wb-callout { 0% { transform:translate(-50%,-50%) scale(.2); opacity:0; } 15% { transform:translate(-50%,-50%) scale(1.1); opacity:1; } 25% { transform:translate(-50%,-50%) scale(1); } 80% { opacity:1; } 100% { transform:translate(-50%,-90%) scale(1); opacity:0; } }

/* ---------- HUD */
.wb-logo { position:absolute; left:3vh; top:2.6vh; z-index:5; display:flex; flex-direction:column; gap:.4vh; }
.wb-logo .t { font-size:clamp(18px, 3.6vh, 44px); font-weight:800; letter-spacing:-.02em; line-height:1; color:var(--text); }
.wb-logo .s { font-size:clamp(12px, 2vh, 22px); color:var(--muted); font-weight:600; }
.wb-logo .s b { color:var(--text); }
.wb-feed { position:absolute; left:3vh; bottom:3vh; z-index:5; display:flex; flex-direction:column; gap:.7vh; font-size:clamp(12px, 2.3vh, 26px); }
.wb-feed .row { display:flex; align-items:center; gap:.45em; animation:wb-feedin .4s cubic-bezier(.2,1.5,.4,1); width:max-content; font-weight:800; }
.wb-feed .row i { width:.55em; height:.55em; border-radius:50%; background:var(--c); flex:none; }
.wb-feed .row:nth-child(n+3) { opacity:.6; } .wb-feed .row:nth-child(n+4) { opacity:.35; }
.wb-feed .row b { letter-spacing:.03em; text-transform:uppercase; }
.wb-feed .row .hl { color:var(--hot); }
@keyframes wb-feedin { from { transform:translateX(-30px); opacity:0; } }
.wb-status { position:absolute; right:3vh; bottom:3vh; z-index:5; text-align:right; font-size:clamp(12px, 2.1vh, 24px); font-weight:700; color:var(--muted); line-height:1.35; }
.wb-status b { color:var(--text); }
.wb-status .lvl { display:inline-flex; gap:.18em; margin-left:.4em; vertical-align:.05em; }
.wb-status .lvl i { width:.42em; height:.75em; border-radius:.12em; background:rgba(244,241,234,.16); }
.wb-status .lvl i.on { background:var(--hot); }
.wb-specs { position:absolute; left:50%; bottom:1.2vh; transform:translateX(-50%); z-index:5; font-size:clamp(11px, 1.8vh, 19px); font-weight:600; color:var(--muted); white-space:nowrap; max-width:50vw; overflow:hidden; text-overflow:ellipsis; }
.wb-specs b { color:var(--text); }

/* ---------- overlays */
.wb-overlay { position:absolute; inset:0; z-index:20; display:grid; place-items:center; background:rgba(14,15,18,.78); animation:wb-fade .35s; }
.wb-overlay.out { opacity:0; transition:opacity .35s; }
@keyframes wb-fade { from { opacity:0; } }
.wb-card { width:min(84vw, 124vh); padding:5vh 5.5vh 4vh; border-radius:3.2vh; background:var(--paper); color:#1e1f24; box-shadow:0 3vh 8vh rgba(0,0,0,.5); animation:wb-cardin .6s cubic-bezier(.2,1.4,.4,1); }
@keyframes wb-cardin { from { transform:translateY(8vh) scale(.92); opacity:0; } }
.wb-card .head { display:flex; align-items:baseline; justify-content:space-between; gap:3vh; margin-bottom:3.6vh; }
.wb-card .title { font-size:7.5vh; font-weight:800; line-height:.95; letter-spacing:-.035em; }
.wb-card .sub { color:#6b6c74; font-size:2.6vh; font-weight:600; text-align:right; }
.wb-rules { display:grid; grid-template-columns:1fr 1fr; gap:3.4vh 5vh; }
.wb-rule { display:flex; gap:2.4vh; align-items:flex-start; font-size:2.6vh; line-height:1.3; color:#4a4b52; font-weight:500; }
.wb-rule .n { flex:none; font-size:7vh; font-weight:800; line-height:.8; color:var(--hot); letter-spacing:-.04em; width:5vh; }
.wb-rule b { display:block; font-size:3.2vh; color:#1e1f24; font-weight:800; letter-spacing:-.01em; margin-bottom:.5vh; }
.wb-ex { margin-top:.8vh; display:flex; align-items:center; gap:1.2vh; font-weight:800; letter-spacing:.04em; font-size:3.2vh; color:#1e1f24; }
.wb-ex .chip { background:#1e1f24; color:#fff; border-radius:.9vh; padding:.2vh 1.2vh; }
.wb-ex .hl { color:var(--hot); }
.wb-ex .arrow { color:#a3a4ab; font-weight:600; }
.wb-ex svg { height:3vh; width:auto; }
.wb-ex svg path { fill:var(--heart); }
.wb-ex svg.empty path { fill:none; stroke:#b9bac0; stroke-width:2.2; }
.wb-ex .tiles { display:flex; gap:.6vh; }
.wb-ex .tiles span { width:3.6vh; height:3.6vh; border-radius:.8vh; display:grid; place-items:center; font-size:2vh; background:#e2ded5; color:#9a9ba4; }
.wb-ex .tiles span.on { background:#1e1f24; color:#fff; }
.wb-bar { height:.8vh; border-radius:1vh; background:#e2ded5; margin-top:4vh; overflow:hidden; }
.wb-bar i { display:block; height:100%; background:#1e1f24; animation:wb-bar linear forwards; transform-origin:left; }
@keyframes wb-bar { from { transform:scaleX(0); } to { transform:scaleX(1); } }
.wb-win { text-align:center; animation:wb-cardin .7s cubic-bezier(.2,1.4,.4,1); }
.wb-win .big { width:26vh; height:26vh; margin:0 auto; border-radius:50%; display:grid; place-items:center; font-size:11vh; font-weight:800; letter-spacing:-.03em; background:var(--c); color:var(--on);
  box-shadow:0 0 0 1.4vh var(--ink), 0 0 0 2.4vh var(--paper); animation:wb-winpop 1.6s ease-in-out infinite; }
@keyframes wb-winpop { 50% { transform:scale(1.04) rotate(-2deg); } }
.wb-win .name { font-size:10vh; font-weight:800; margin-top:5vh; line-height:1; letter-spacing:-.035em; }
.wb-win .stats { font-size:3.2vh; color:var(--muted); margin-top:1.8vh; font-weight:600; }
.wb-win .stats b { color:var(--text); letter-spacing:.03em; }
.wb-wait { font-size:4vh; font-weight:800; text-align:center; padding:3.5vh 6vh; border-radius:3vh; background:var(--paper); color:#1e1f24; letter-spacing:-.01em; }
.wb-wait small { display:block; font-size:2.4vh; font-weight:600; color:#6b6c74; margin-top:.8vh; letter-spacing:0; }
`;
