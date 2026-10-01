export const SCREEN_CSS = `
.wb-root { position:absolute; inset:0; overflow:hidden; font-family:'Fredoka',system-ui,sans-serif; color:#fff; background:#140b27; user-select:none; }
.wb-shake { position:absolute; inset:0; will-change:transform; }
.wb-root canvas { position:absolute; inset:0; width:100%; height:100%; display:block; pointer-events:none; }
.wb-floaters { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
.wb-floater { position:absolute; bottom:-12vh; font-weight:700; letter-spacing:.06em; color:rgba(255,220,200,.07); white-space:nowrap; animation:wb-floatup linear forwards; text-transform:uppercase; }
@keyframes wb-floatup { from { transform:translateY(0) rotate(var(--r)); } to { transform:translateY(-125vh) rotate(calc(var(--r) * -1)); } }

/* ---------- seats */
.wb-seats { position:absolute; inset:0; pointer-events:none; }
.wb-seat { --s:80px; --c:#fff; position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; width:calc(var(--s) * 1.9); transition:filter .4s, opacity .4s; }
.wb-av { position:relative; width:var(--s); height:var(--s); border-radius:50%; display:grid; place-items:center; font-size:calc(var(--s) * .56);
  background:radial-gradient(circle at 35% 28%, color-mix(in srgb, var(--c) 55%, white), var(--c) 55%, color-mix(in srgb, var(--c) 45%, black));
  box-shadow:0 0 0 calc(var(--s) * .05) rgba(255,255,255,.85), 0 calc(var(--s)*.08) calc(var(--s)*.22) rgba(0,0,0,.5); transition:transform .35s cubic-bezier(.2,1.6,.4,1), box-shadow .3s; }
.wb-av .wb-emoji { filter:drop-shadow(0 3px 4px rgba(0,0,0,.35)); line-height:1; }
.wb-ring { position:absolute; inset:calc(var(--s) * -.16); border-radius:50%; opacity:0; transition:opacity .3s;
  background:conic-gradient(from 0deg, var(--c), #fff, var(--c), transparent 60%, var(--c)); -webkit-mask:radial-gradient(circle, transparent 62%, #000 64%); mask:radial-gradient(circle, transparent 62%, #000 64%); animation:wb-spin 1.2s linear infinite; }
@keyframes wb-spin { to { transform:rotate(360deg); } }
.wb-skull, .wb-dc { position:absolute; display:none; }
.wb-skull { inset:0; place-items:center; font-size:calc(var(--s) * .62); background:rgba(10,8,16,.55); border-radius:50%; }
.wb-dc { right:-6%; top:-6%; font-size:calc(var(--s) * .3); background:#222; border-radius:50%; padding:2px; }
.wb-name { margin-top:calc(var(--s) * .12); max-width:100%; padding:.1em .6em; border-radius:999px; background:rgba(10,6,24,.72); border:2px solid color-mix(in srgb, var(--c) 70%, transparent);
  font-weight:600; font-size:max(11px, calc(var(--s) * .22)); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.25; }
.wb-hearts { display:flex; gap:calc(var(--s) * .03); margin-top:calc(var(--s) * .06); height:calc(var(--s) * .22); min-height:10px; }
.wb-hearts svg { height:100%; width:auto; overflow:visible; }
.wb-hearts .full path { fill:#ff3b5c; stroke:#fff; stroke-width:1.6; filter:drop-shadow(0 1px 2px rgba(0,0,0,.5)); }
.wb-hearts .empty path { fill:rgba(255,255,255,.1); stroke:rgba(255,255,255,.35); stroke-width:1.6; }
.wb-hearts .lost { animation:wb-heartpop .9s ease-out forwards; }
@keyframes wb-heartpop { 0% { transform:scale(1); } 25% { transform:scale(1.8); } 100% { transform:translateY(30px) scale(.6) rotate(40deg); opacity:0; } }
.wb-hearts .gained { animation:wb-heartgain .8s cubic-bezier(.2,1.8,.4,1); }
@keyframes wb-heartgain { from { transform:scale(3); opacity:0; } }
.wb-prog { width:calc(var(--s) * 1.1); height:max(3px, calc(var(--s) * .05)); margin-top:calc(var(--s) * .07); border-radius:9px; background:rgba(255,255,255,.12); overflow:hidden; }
.wb-prog i { display:block; height:100%; width:0; background:linear-gradient(90deg, #ffcc00, #ff8a1f); border-radius:9px; transition:width .5s; }

.wb-seat.turn .wb-av { transform:scale(1.22); box-shadow:0 0 0 calc(var(--s) * .05) #fff, 0 0 calc(var(--s) * .5) var(--c), 0 calc(var(--s)*.08) calc(var(--s)*.22) rgba(0,0,0,.5); }
.wb-seat.turn .wb-ring { opacity:1; }
.wb-name, .wb-hearts { position:relative; z-index:2; }
.wb-seat.turn .wb-name { margin-top:calc(var(--s) * .26); }
.wb-seat.turn .wb-name { background:var(--c); border-color:#fff; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.5); }
.wb-seat.dead { filter:grayscale(1) brightness(.6); opacity:.55; }
.wb-seat.dead .wb-skull { display:grid; }
.wb-seat.dc { opacity:.45; }
.wb-seat.dc .wb-dc { display:block; }
.wb-seat.hit .wb-av { animation:wb-hit .7s ease-out; }
@keyframes wb-hit { 0% { filter:brightness(3) saturate(0); } 15% { transform:scale(1.4) rotate(-12deg); } 30% { transform:scale(.9) rotate(10deg); } 45% { transform:rotate(-6deg); } 100% { transform:none; } }
.wb-seat.shake .wb-av { animation:wb-shake .4s; }
.wb-seat.good .wb-av { animation:wb-good .5s cubic-bezier(.2,1.8,.4,1); }
@keyframes wb-good { 30% { transform:scale(1.35); box-shadow:0 0 0 calc(var(--s)*.07) #3ef08a, 0 0 calc(var(--s)*.6) #3ef08a; } }
@keyframes wb-shake { 20%,60% { transform:translateX(-12%); } 40%,80% { transform:translateX(12%); } }
.wb-bubble { position:absolute; left:50%; transform:translateX(-50%); white-space:nowrap; padding:.18em .6em; border-radius:12px; background:#fff; color:#1a1030; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  font-size:max(12px, calc(var(--s) * .24)); box-shadow:0 6px 16px rgba(0,0,0,.4); opacity:0; transition:opacity .2s; pointer-events:none; }
.wb-bubble.show { opacity:1; }
.wb-bubble.below { top:calc(100% + 6px); }
.wb-bubble.above { bottom:calc(100% + 10px); }
.wb-bubble .hl { color:#ff5a1f; }
.wb-many .wb-bubble { display:none; }

/* ---------- centre */
.wb-prompt { position:absolute; transform:translate(-50%,-50%); display:flex; gap:.02em; font-weight:700; line-height:1; pointer-events:none; z-index:3; }
.wb-prompt span { display:inline-block; color:#fff; text-shadow:0 .04em 0 #b3261e, 0 .08em .18em rgba(0,0,0,.6); -webkit-text-stroke:.03em rgba(0,0,0,.25); animation:wb-letter .45s cubic-bezier(.2,1.7,.4,1) both; }
@keyframes wb-letter { from { transform:translateY(-.6em) scale(.3); opacity:0; } }
.wb-prompt.gone span { animation:wb-letterout .25s ease-in forwards; }
@keyframes wb-letterout { to { transform:scale(1.8); opacity:0; } }
.wb-pill { position:absolute; transform:translateX(-50%); display:flex; align-items:center; gap:.45em; max-width:80%; padding:.28em .8em .28em .35em; border-radius:999px;
  background:rgba(12,8,28,.82); border:.12em solid var(--c,#fff); box-shadow:0 .25em .9em rgba(0,0,0,.5), 0 0 1.2em color-mix(in srgb, var(--c,#fff) 40%, transparent); z-index:3; transition:border-color .25s; white-space:nowrap; }
.wb-pill .av { width:1.5em; height:1.5em; border-radius:50%; display:grid; place-items:center; font-size:.8em; background:var(--c,#555); flex:none; }
.wb-pill .txt { font-weight:700; letter-spacing:.08em; text-transform:uppercase; min-width:1em; overflow:hidden; text-overflow:clip; }
.wb-pill .txt .hl { color:#ffcf3d; text-shadow:0 0 .4em rgba(255,180,0,.7); }
.wb-pill .txt .ph { color:rgba(255,255,255,.45); letter-spacing:.02em; text-transform:none; font-weight:500; }
.wb-pill .caret { display:inline-block; width:.08em; height:1em; background:#fff; margin-left:.06em; vertical-align:-.12em; animation:wb-blink 1s steps(1) infinite; }
@keyframes wb-blink { 50% { opacity:0; } }
.wb-pill.bad { animation:wb-pillshake .45s; border-color:#ff3b5c; }
@keyframes wb-pillshake { 15%,55% { transform:translateX(calc(-50% - .5em)); } 35%,75% { transform:translateX(calc(-50% + .5em)); } }
.wb-pill.hidden { opacity:0; }
.wb-hint { position:absolute; transform:translateX(-50%); font-weight:600; white-space:nowrap; z-index:3; text-align:center; transition:opacity .25s; }
.wb-hint.bad { color:#ff7088; }
.wb-hint.info { color:rgba(255,255,255,.75); }
.wb-hint b { color:#ffcf3d; letter-spacing:.06em; }
.wb-flyword { position:absolute; transform:translate(-50%,0); font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#3ef08a; text-shadow:0 0 .5em rgba(62,240,138,.7), 0 .08em .2em rgba(0,0,0,.6); pointer-events:none; z-index:4; animation:wb-fly 1.1s cubic-bezier(.2,.8,.3,1) forwards; white-space:nowrap; }
@keyframes wb-fly { 0% { transform:translate(-50%,0) scale(1); } 25% { transform:translate(-50%,-.4em) scale(1.25); opacity:1; } 100% { transform:translate(-50%,-3.2em) scale(.9); opacity:0; } }
.wb-callout { position:absolute; transform:translate(-50%,-50%); font-weight:700; white-space:nowrap; pointer-events:none; z-index:6; text-align:center; animation:wb-callout 1.8s cubic-bezier(.2,1.5,.4,1) forwards; text-shadow:0 .08em .3em rgba(0,0,0,.7); }
@keyframes wb-callout { 0% { transform:translate(-50%,-50%) scale(.2); opacity:0; } 15% { transform:translate(-50%,-50%) scale(1.1); opacity:1; } 25% { transform:translate(-50%,-50%) scale(1); } 80% { opacity:1; } 100% { transform:translate(-50%,-90%) scale(1); opacity:0; } }

/* ---------- HUD */
.wb-logo { position:absolute; left:2.2vh; top:1.8vh; z-index:5; display:flex; flex-direction:column; gap:.3vh; }
.wb-logo .t { font-size:clamp(18px, 3.6vh, 44px); font-weight:700; letter-spacing:.04em; line-height:1;
  background:linear-gradient(180deg, #ffe066, #ff7a2f 60%, #ff3b5c); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 3px 0 rgba(0,0,0,.35)); }
.wb-logo .s { font-size:clamp(11px, 1.8vh, 20px); color:rgba(255,255,255,.7); font-weight:500; }
.wb-logo .s b { color:#ffcf3d; }
.wb-feed { position:absolute; left:2.2vh; bottom:2.2vh; z-index:5; display:flex; flex-direction:column; gap:.6vh; font-size:clamp(12px, 2.1vh, 24px); }
.wb-feed .h { color:rgba(255,255,255,.5); font-size:.75em; text-transform:uppercase; letter-spacing:.15em; }
.wb-feed .row { display:flex; align-items:center; gap:.4em; padding:.15em .6em .15em .2em; border-radius:999px; background:rgba(10,6,24,.6); border-left:.3em solid var(--c); animation:wb-feedin .4s cubic-bezier(.2,1.5,.4,1); width:max-content; }
.wb-feed .row:nth-child(n+4) { opacity:.7; } .wb-feed .row:nth-child(n+5) { opacity:.45; }
.wb-feed .row b { letter-spacing:.06em; text-transform:uppercase; }
.wb-feed .row .hl { color:#ffcf3d; }
@keyframes wb-feedin { from { transform:translateX(-30px); opacity:0; } }
.wb-many .wb-feed { display:none; }
.wb-status { position:absolute; right:12px; top:58px; z-index:5; display:flex; flex-direction:column; align-items:flex-end; gap:.6vh; font-size:clamp(12px, 2vh, 22px); }
.wb-status .chip { padding:.25em .8em; border-radius:999px; background:rgba(10,6,24,.6); border:1px solid rgba(255,255,255,.12); white-space:nowrap; }
.wb-status .chip b { color:#ffcf3d; }
.wb-many .wb-status .bonus { display:none; }
.wb-specs { position:absolute; left:50%; bottom:.8vh; transform:translateX(-50%); z-index:5; font-size:clamp(11px, 1.7vh, 18px); color:rgba(255,255,255,.6); white-space:nowrap; max-width:60vw; overflow:hidden; text-overflow:ellipsis; }

/* ---------- overlays */
.wb-overlay { position:absolute; inset:0; z-index:20; display:grid; place-items:center; background:radial-gradient(circle, rgba(20,10,40,.72), rgba(6,3,14,.88)); animation:wb-fade .35s; }
.wb-overlay.out { opacity:0; transition:opacity .35s; }
@keyframes wb-fade { from { opacity:0; } }
.wb-card { width:min(82vw, 118vh); padding:4vh 4.5vh 3vh; border-radius:4vh; background:linear-gradient(160deg, #2c1850, #1a0e30); border:2px solid rgba(255,255,255,.12); box-shadow:0 3vh 8vh rgba(0,0,0,.6); animation:wb-cardin .6s cubic-bezier(.2,1.4,.4,1); }
@keyframes wb-cardin { from { transform:translateY(8vh) scale(.9); opacity:0; } }
.wb-card .title { text-align:center; font-size:7vh; font-weight:700; line-height:1; background:linear-gradient(180deg, #ffe066, #ff7a2f 60%, #ff3b5c); -webkit-background-clip:text; background-clip:text; color:transparent; }
.wb-card .sub { text-align:center; color:rgba(255,255,255,.7); font-size:2.6vh; margin:1vh 0 3vh; }
.wb-rules { display:grid; grid-template-columns:1fr 1fr; gap:2.2vh 3vh; }
.wb-rule { display:flex; gap:2vh; align-items:center; background:rgba(255,255,255,.06); border-radius:2.4vh; padding:2vh; font-size:2.7vh; line-height:1.25; }
.wb-rule .ico { font-size:6vh; flex:none; width:8vh; text-align:center; }
.wb-rule b { color:#ffcf3d; display:block; font-size:3vh; }
.wb-ex { margin-top:.6vh; font-weight:700; letter-spacing:.08em; font-size:3.2vh; }
.wb-ex .p { color:#ffcf3d; } .wb-ex .arrow { opacity:.5; margin:0 .4em; letter-spacing:0; }
.wb-bar { height:1vh; border-radius:1vh; background:rgba(255,255,255,.1); margin-top:3vh; overflow:hidden; }
.wb-bar i { display:block; height:100%; background:linear-gradient(90deg, #ffcc00, #ff5a1f); animation:wb-bar linear forwards; transform-origin:left; }
@keyframes wb-bar { from { transform:scaleX(0); } to { transform:scaleX(1); } }
.wb-win { text-align:center; animation:wb-cardin .7s cubic-bezier(.2,1.4,.4,1); }
.wb-win .crown { font-size:10vh; animation:wb-bob 1.4s ease-in-out infinite; }
@keyframes wb-bob { 50% { transform:translateY(-1.5vh) rotate(-6deg); } }
.wb-win .big { width:24vh; height:24vh; margin:0 auto; border-radius:50%; display:grid; place-items:center; font-size:14vh; background:radial-gradient(circle at 35% 28%, color-mix(in srgb, var(--c) 55%, white), var(--c) 55%, color-mix(in srgb, var(--c) 45%, black)); box-shadow:0 0 0 1.2vh #fff, 0 0 12vh var(--c); }
.wb-win .name { font-size:9vh; font-weight:700; margin-top:3vh; line-height:1; text-shadow:0 .6vh 2vh rgba(0,0,0,.6); }
.wb-win .name span { color:var(--c); filter:brightness(1.3); }
.wb-win .stats { font-size:3.2vh; color:rgba(255,255,255,.8); margin-top:1.5vh; }
.wb-win .stats b { color:#ffcf3d; letter-spacing:.05em; }
.wb-wait { font-size:4.5vh; font-weight:600; text-align:center; padding:3vh 5vh; border-radius:3vh; background:rgba(10,6,24,.8); }
`;
