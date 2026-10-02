// Doodle Dash TV stylesheet: a sketchbook on a desk. Warm paper, ink, masking tape, sticky notes.
// Everything is sized in --u (1/100 of a 16:9 frame) so it reads the same on a laptop or a 4K TV.
export const SCREEN_CSS = /* css */ `
.dd-root {
  --u: min(1vw, 1.7778vh);
  --ink: #23212e; --ink-2: #5f5b6e; --ink-3: #9a95a6;
  --paper: #efe7d6; --sheet: #fffdf7; --line: rgba(35, 33, 46, 0.1);
  --orange: #ff8a1f; --red: #e8443a; --blue: #2f5bea; --green: #22a45d; --yellow: #ffd84a;
  --hand: 'Gochi Hand', 'Comic Sans MS', cursive;
  --ui: 'Figtree', system-ui, sans-serif;
  position: absolute; inset: 0; overflow: hidden; color: var(--ink); font-family: var(--ui);
  background-color: var(--paper);
  background-image: var(--paper-tex), radial-gradient(circle, rgba(35, 33, 46, 0.12) 1.1px, transparent 1.5px);
  background-size: 256px 256px, calc(var(--u) * 2.4) calc(var(--u) * 2.4);
  user-select: none; -webkit-font-smoothing: antialiased;
}
.dd-root::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 calc(var(--u) * 12) rgba(120, 90, 40, 0.18); z-index: 1; }
.dd-stage { position: absolute; inset: 0; z-index: 2; }
.dd-root b { font-weight: 800; }

/* ---------------------------------------------------------- shared bits */
.dd-card { position: relative; background: var(--sheet); border-radius: calc(var(--u) * 0.5);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05), 0 calc(var(--u) * 0.5) calc(var(--u) * 1.6) rgba(90, 60, 20, 0.16), 0 calc(var(--u) * 0.1) calc(var(--u) * 0.3) rgba(90, 60, 20, 0.12); }
.dd-card-title { font-family: var(--hand); font-size: calc(var(--u) * 2.3); line-height: 1; padding: calc(var(--u) * 1.2) calc(var(--u) * 1.4) calc(var(--u) * 0.6); color: var(--ink); }
.dd-tape { position: absolute; top: calc(var(--u) * -1); width: calc(var(--u) * 7); height: calc(var(--u) * 2.1); z-index: 3;
  background: rgba(244, 222, 160, 0.78); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  clip-path: polygon(3% 0, 97% 4%, 100% 50%, 96% 100%, 2% 96%, 0 48%); }
.dd-tape.l { left: calc(var(--u) * 1.5); transform: rotate(-6deg); }
.dd-tape.r { right: calc(var(--u) * 1.5); transform: rotate(5deg); }
.dd-tape.c { left: 50%; margin-left: calc(var(--u) * -3.5); transform: rotate(-2deg); }
.dd-doodle { display: block; width: 100%; height: 100%; overflow: visible; }
.dd-doodle path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: dd-draw 0.9s ease-out forwards; }
@keyframes dd-draw { to { stroke-dashoffset: 0; } }
.tp-p .st .dd-doodle path, .pl-row .badge .dd-doodle path, .fd .tick .dd-doodle path, .tk .dd-doodle path, .tpp-mini .dd-doodle path, .tpp-votes .dd-doodle path { animation: none; stroke-dashoffset: 0; }

.dd-logo-word { font-family: var(--hand); line-height: 0.9; white-space: nowrap; display: inline-flex; gap: 0.22em; }
.dd-logo-word .a { color: var(--ink); }
.dd-logo-word .b { color: var(--orange); transform: rotate(-4deg) translateY(0.04em); display: inline-block; }
.dd-logo.small { font-size: calc(var(--u) * 3.2); }
.dd-logo.big { font-size: calc(var(--u) * 9); text-align: center; }
.dd-logo.big .dd-logo-word { animation: dd-pop 0.6s cubic-bezier(.2, 1.6, .4, 1) both; }

.dd-chip { display: inline-flex; align-items: center; gap: calc(var(--u) * 0.6); padding: calc(var(--u) * 0.35) calc(var(--u) * 1.1) calc(var(--u) * 0.35) calc(var(--u) * 0.35);
  background: var(--sheet); border-radius: 999px; box-shadow: 0 1px 3px rgba(90, 60, 20, 0.18); font-size: calc(var(--u) * 1.5); white-space: nowrap; }
.dd-chip i { font-style: normal; width: calc(var(--u) * 2.4); height: calc(var(--u) * 2.4); border-radius: 50%; background: var(--c); display: grid; place-items: center; font-size: calc(var(--u) * 1.4); }
.dd-chip b { color: var(--ink); max-width: calc(var(--u) * 14); overflow: hidden; text-overflow: ellipsis; }
.dd-av { flex: none; width: calc(var(--u) * 2.8); height: calc(var(--u) * 2.8); border-radius: 50%; background: var(--c); display: inline-grid; place-items: center; font-size: calc(var(--u) * 1.6); box-shadow: 0 0 0 calc(var(--u) * 0.2) var(--sheet); }
.dd-av.big { width: calc(var(--u) * 9); height: calc(var(--u) * 9); font-size: calc(var(--u) * 5); }
.dd-av.bob { animation: dd-bob 1.2s ease-in-out infinite; }
@keyframes dd-bob { 50% { transform: translateY(calc(var(--u) * -0.8)) rotate(-4deg); } }
@keyframes dd-pop { from { transform: scale(0.4) rotate(-6deg); opacity: 0; } }

/* timer */
.dd-timer { position: relative; width: calc(var(--u) * 6.4); height: calc(var(--u) * 6.4); flex: none; transition: opacity 0.3s; }
.dd-timer.off { opacity: 0; }
.dd-timer svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.dd-timer circle { fill: none; stroke-width: 9; }
.dd-timer .bg { fill: var(--sheet); stroke: rgba(35, 33, 46, 0.12); }
.dd-timer .fg { stroke: var(--ink); stroke-linecap: round; stroke-dasharray: 100; transition: stroke-dashoffset 0.25s linear, stroke 0.3s; }
.dd-timer .num { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 800; font-size: calc(var(--u) * 2.5); font-variant-numeric: tabular-nums; }
.dd-timer.low .fg { stroke: var(--red); }
.dd-timer.low .num { color: var(--red); animation: dd-pulse 1s ease-in-out infinite; }
@keyframes dd-pulse { 50% { transform: scale(1.15); } }

/* banner = sticky note */
.dd-banner { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(239, 231, 214, 0.55); animation: dd-fade 0.25s; pointer-events: none; }
.dd-banner.out { animation: dd-fade 0.3s reverse forwards; }
.dd-banner-note { min-width: calc(var(--u) * 34); padding: calc(var(--u) * 3.2) calc(var(--u) * 4); background: var(--yellow); color: var(--ink); text-align: center;
  font-family: var(--hand); font-size: calc(var(--u) * 6.2); line-height: 1; transform: rotate(-2.5deg);
  box-shadow: 0 calc(var(--u) * 1.4) calc(var(--u) * 2.4) rgba(90, 60, 20, 0.25); animation: dd-slap 0.45s cubic-bezier(.2, 1.5, .4, 1); }
.dd-banner-note small { display: block; font-family: var(--ui); font-weight: 700; font-size: calc(var(--u) * 2); margin-top: calc(var(--u) * 1); color: rgba(35, 33, 46, 0.7); }
@keyframes dd-slap { from { transform: rotate(-14deg) scale(1.6); opacity: 0; } }
@keyframes dd-fade { from { opacity: 0; } }

.dd-count { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; pointer-events: none; }
.dd-count span { font-family: var(--hand); font-size: calc(var(--u) * 22); color: var(--ink); animation: dd-cnt 0.75s ease-out both; text-shadow: calc(var(--u) * 0.5) calc(var(--u) * 0.5) 0 rgba(255, 138, 31, 0.35); }
.dd-count span.go { color: var(--orange); font-size: calc(var(--u) * 16); text-shadow: calc(var(--u) * 0.5) calc(var(--u) * 0.5) 0 rgba(35, 33, 46, 0.15); }
@keyframes dd-cnt { 0% { transform: scale(2.2) rotate(-10deg); opacity: 0; } 25% { transform: scale(1) rotate(-3deg); opacity: 1; } 85% { opacity: 1; } 100% { transform: scale(0.9) rotate(-3deg); opacity: 0; } }

.dd-underline { display: block; width: 70%; height: calc(var(--u) * 1.6); margin: calc(var(--u) * -0.4) auto 0; }
.dd-underline path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: dd-draw 0.6s 0.25s ease-out forwards; }

.dd-scribbles { position: absolute; inset: 0; z-index: 1; pointer-events: none; transition: opacity 0.6s; }
.dd-root.busy .dd-scribbles { opacity: 0; }
.dd-scribble { position: absolute; opacity: 0.32; transform: rotate(var(--rot)); transition: opacity 0.8s; }
.dd-scribble.out { opacity: 0; }
.dd-scribble path { animation-duration: 2.2s; animation-delay: inherit; }
.dd-confetti { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 70; pointer-events: none; }

.dd-float { position: absolute; z-index: 30; pointer-events: none; display: flex; flex-direction: column; align-items: center; animation: dd-floatup 2.6s ease-out forwards; }
.dd-float span { width: calc(var(--u) * 4.4); height: calc(var(--u) * 4.4); font-size: calc(var(--u) * 3.6); line-height: 1; display: grid; place-items: center; }
.dd-float small { font-weight: 800; font-size: calc(var(--u) * 1.2); background: var(--sheet); padding: 0.1em 0.6em; border-radius: 999px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); }
@keyframes dd-floatup { 0% { transform: translate(-50%, 0) scale(0.4); opacity: 0; } 12% { transform: translate(-50%, -20%) scale(1.1); opacity: 1; } 100% { transform: translate(calc(-50% + var(--dx)), calc(var(--u) * -18)) scale(1); opacity: 0; } }

/* ---------------------------------------------------------- mode select */
.dd-mode { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(var(--u) * 2.4); padding: calc(var(--u) * 3) calc(var(--u) * 4); }
.dd-mode .dd-logo { margin-bottom: calc(var(--u) * 0.6); }
.dd-mode-cards { display: flex; gap: calc(var(--u) * 5); }
.dd-mode-card { width: calc(var(--u) * 36); padding: calc(var(--u) * 2.4) calc(var(--u) * 2.6) calc(var(--u) * 2.2); text-align: center; transition: transform 0.4s cubic-bezier(.3, 1.4, .5, 1), opacity 0.4s; }
.dd-mode-card:nth-child(1) { transform: rotate(-1.6deg); }
.dd-mode-card:nth-child(2) { transform: rotate(1.4deg); }
.dd-mode-card h2 { font-family: var(--hand); font-weight: 400; font-size: calc(var(--u) * 4.4); margin: calc(var(--u) * 1) 0 calc(var(--u) * 0.4); line-height: 1; }
.dd-mode-card p { font-size: calc(var(--u) * 1.65); line-height: 1.35; color: var(--ink-2); margin: 0 auto; max-width: 22em; font-weight: 600; }
.dd-mode-tag { margin-top: calc(var(--u) * 1.2); font-weight: 800; font-size: calc(var(--u) * 1.5); color: var(--ink); }
.dd-rec { position: absolute; top: calc(var(--u) * -1.6); right: calc(var(--u) * -2); padding: calc(var(--u) * 0.7) calc(var(--u) * 1.4); background: var(--yellow); font-weight: 800; font-size: calc(var(--u) * 1.35);
  transform: rotate(8deg); box-shadow: 0 calc(var(--u) * 0.4) calc(var(--u) * 0.8) rgba(90, 60, 20, 0.2); opacity: 0; transition: opacity 0.3s; }
.dd-mode-card.rec .dd-rec { opacity: 1; }
.dd-mode-art { height: calc(var(--u) * 13); display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 1); }
.dg-art .mini-sheet { width: calc(var(--u) * 10); height: calc(var(--u) * 12.5); background: #fff; border: 2px solid var(--line); border-radius: 4px; padding: calc(var(--u) * 1.4); transform: rotate(-3deg); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08); }
.dg-art .mini-bubbles { display: flex; flex-direction: column; gap: calc(var(--u) * 0.6); align-items: flex-start; }
.dg-art .mini-bubbles span { font-weight: 700; font-size: calc(var(--u) * 1.4); padding: calc(var(--u) * 0.35) calc(var(--u) * 1); border-radius: 999px; background: #f1ece2; color: var(--ink-2); }
.dg-art .mini-bubbles span.ok { background: var(--green); color: #fff; }
.tp-art .mini { display: grid; place-items: center; width: calc(var(--u) * 9); height: calc(var(--u) * 10); background: #fff; border: 2px solid var(--line); border-radius: 4px; font-family: var(--hand); font-size: calc(var(--u) * 1.9); line-height: 1.05; padding: calc(var(--u) * 0.8); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08); }
.tp-art .m1 { transform: rotate(-4deg); } .tp-art .m3 { transform: rotate(3deg); }
.tp-art .m2 .dd-doodle { width: 80%; height: 80%; }
.tp-art .arr { width: calc(var(--u) * 3.2); height: calc(var(--u) * 3.2); flex: none; }
.dd-mode-foot { font-size: calc(var(--u) * 2); font-weight: 600; color: var(--ink-2); }
.dd-mode-foot b { color: var(--ink); }
.dd-auto { margin-left: calc(var(--u) * 1); color: var(--ink-3); font-weight: 600; }
.dd-mode-players { display: flex; flex-wrap: wrap; justify-content: center; gap: calc(var(--u) * 0.8); max-width: calc(var(--u) * 100); }
.dd-more { font-weight: 800; font-size: calc(var(--u) * 1.5); color: var(--ink-2); align-self: center; }
.dd-mode.picked .dd-mode-card { opacity: 0.25; transform: scale(0.94); }
.dd-mode.picked .dd-mode-card.chosen { opacity: 1; transform: scale(1.07) rotate(-1deg); box-shadow: 0 0 0 calc(var(--u) * 0.45) var(--orange), 0 calc(var(--u) * 1) calc(var(--u) * 3) rgba(90, 60, 20, 0.25); }

/* ---------------------------------------------------------- how to play */
.dd-howto { position: absolute; inset: 0; display: grid; place-items: center; }
.dd-howto.out { animation: dd-fade 0.25s reverse forwards; }
.dd-howto-card { width: calc(var(--u) * 92); padding: calc(var(--u) * 3.4) calc(var(--u) * 4) calc(var(--u) * 2.6); text-align: center; transform: rotate(-0.6deg); animation: dd-pop 0.5s cubic-bezier(.2, 1.4, .4, 1) both; }
.dd-howto-card h1 { margin: 0; font-family: var(--hand); font-weight: 400; font-size: calc(var(--u) * 6.4); line-height: 1; }
.dd-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: calc(var(--u) * 2.6); margin: calc(var(--u) * 3.2) 0 calc(var(--u) * 2.4); }
.dd-step { position: relative; display: flex; flex-direction: column; align-items: center; animation: dd-pop 0.5s cubic-bezier(.2, 1.4, .4, 1) both; animation-delay: calc(var(--i) * 0.18s + 0.2s); }
.dd-step .ico { width: calc(var(--u) * 9); height: calc(var(--u) * 9); }
.dd-step .ico path { animation-delay: calc(var(--i) * 0.18s + 0.35s); }
.dd-step .n { position: absolute; top: calc(var(--u) * -0.6); left: calc(50% - var(--u) * 6.4); width: calc(var(--u) * 3); height: calc(var(--u) * 3); border-radius: 50%; background: var(--c); color: #fff; font-weight: 800; font-size: calc(var(--u) * 1.6); display: grid; place-items: center; }
.dd-step b { font-family: var(--hand); font-weight: 400; font-size: calc(var(--u) * 3.3); margin: calc(var(--u) * 1) 0 calc(var(--u) * 0.4); }
.dd-step p { margin: 0; font-size: calc(var(--u) * 1.6); line-height: 1.35; font-weight: 600; color: var(--ink-2); }
.dd-howto-foot { font-size: calc(var(--u) * 1.7); font-weight: 600; color: var(--ink-2); }
.dd-howto-foot b { color: var(--ink); }
.dd-howto-bar { height: calc(var(--u) * 0.5); background: rgba(35, 33, 46, 0.08); border-radius: 999px; margin-top: calc(var(--u) * 1.6); overflow: hidden; }
.dd-howto-bar i { display: block; height: 100%; width: 100%; background: var(--orange); border-radius: inherit; transform-origin: left; animation: dd-shrink linear forwards; }
@keyframes dd-shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }

/* ---------------------------------------------------------- Draw & Guess */
.dg { position: absolute; inset: 0; display: grid; grid-template-columns: calc(var(--u) * 25) 1fr calc(var(--u) * 27); grid-template-rows: calc(var(--u) * 9) 1fr; gap: calc(var(--u) * 1.4) calc(var(--u) * 2.2); padding: calc(var(--u) * 1.4) calc(var(--u) * 2.4) calc(var(--u) * 2.2); }
.dg-top { grid-column: 1 / -1; display: grid; grid-template-columns: calc(var(--u) * 25) 1fr calc(var(--u) * 27); gap: calc(var(--u) * 2.2); align-items: center; }
.dg-top .dd-logo { align-self: center; }
.dg-hint { display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 1.6); min-width: 0; }
.dg-mask { display: flex; align-items: flex-end; gap: calc(var(--u) * 0.55); min-height: calc(var(--u) * 5); }
.dg-mask .ch { width: calc(var(--u) * 3); height: calc(var(--u) * 4.4); border-bottom: calc(var(--u) * 0.45) solid var(--ink); display: grid; place-items: end center;
  font-family: var(--hand); font-size: calc(var(--u) * 4.4); line-height: 1; text-transform: uppercase; padding-bottom: calc(var(--u) * 0.1); }
.dg-mask .ch.on { color: var(--blue); border-bottom-color: var(--blue); }
.dg-mask .ch.new { animation: dd-pop 0.5s cubic-bezier(.2, 1.6, .4, 1); }
.dg-mask .sp { width: calc(var(--u) * 1.6); }
.dg-mask .pn { font-family: var(--hand); font-size: calc(var(--u) * 4); }
.dg-mask.long .ch { width: calc(var(--u) * 2.2); font-size: calc(var(--u) * 3.3); height: calc(var(--u) * 3.6); border-bottom-width: calc(var(--u) * 0.35); }
.dg-mask.long .sp { width: calc(var(--u) * 1.1); }
.dg-choosing-txt { font-family: var(--hand); font-size: calc(var(--u) * 3.6); color: var(--ink-2); }
.dg-len { font-weight: 800; font-size: calc(var(--u) * 1.8); color: var(--ink-3); white-space: nowrap; }
.dg-round { justify-self: end; align-self: end; text-align: right; line-height: 1.15; font-weight: 700; font-size: calc(var(--u) * 1.7); color: var(--ink-2); padding-bottom: calc(var(--u) * 0.4); }
.dg-round b { color: var(--ink); font-weight: 800; }
.dg-round small { display: block; font-size: calc(var(--u) * 1.3); color: var(--ink-3); font-weight: 700; }

.dg-players, .dg-feed { min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.dg-players { transform: rotate(-0.5deg); }
.dg-feed { transform: rotate(0.5deg); }
.dg-plist { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: calc(var(--u) * 0.3); padding: 0 calc(var(--u) * 0.8) calc(var(--u) * 1); overflow: hidden; }
.pl-row { position: relative; display: flex; align-items: center; gap: calc(var(--u) * 0.8); padding: calc(var(--u) * 0.55) calc(var(--u) * 0.7); border-radius: calc(var(--u) * 0.6); font-size: calc(var(--u) * 1.7); transition: background 0.3s; }
.pl-row .rk { width: calc(var(--u) * 2.4); font-weight: 800; color: var(--ink-3); font-size: calc(var(--u) * 1.3); }
.pl-row .nm { flex: 1; min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-row .sc { font-weight: 800; font-variant-numeric: tabular-nums; min-width: calc(var(--u) * 3.5); text-align: right; }
.pl-row .badge { width: calc(var(--u) * 2.2); height: calc(var(--u) * 2.2); flex: none; }
.pl-row .plus { font-weight: 800; color: var(--green); font-size: calc(var(--u) * 1.35); animation: dd-pop 0.4s both; }
.pl-row.artist { background: #fff1dc; }
.pl-row.guessed { background: #e3f5e9; }
.pl-row.gone { opacity: 0.4; }
.dg-plist.compact { gap: 0; }
.dg-plist.compact .pl-row { padding: calc(var(--u) * 0.25) calc(var(--u) * 0.6); font-size: calc(var(--u) * 1.4); }
.dg-plist.compact .dd-av { width: calc(var(--u) * 2.1); height: calc(var(--u) * 2.1); font-size: calc(var(--u) * 1.2); }
.dg-plist.compact .badge { width: calc(var(--u) * 1.7); height: calc(var(--u) * 1.7); }
.pl-more { text-align: center; font-weight: 800; color: var(--ink-3); font-size: calc(var(--u) * 1.3); padding-top: calc(var(--u) * 0.3); }

.dg-flist { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: calc(var(--u) * 0.35); padding: 0 calc(var(--u) * 1.2) calc(var(--u) * 1.2); overflow: hidden; }
.fd { font-size: calc(var(--u) * 1.75); line-height: 1.25; padding: calc(var(--u) * 0.35) calc(var(--u) * 0.7); border-radius: calc(var(--u) * 0.5); font-weight: 600; color: var(--ink); animation: dd-feedin 0.25s ease-out; overflow-wrap: anywhere; flex: none; }
.fd b { margin-right: 0.35em; }
.fd.sys { color: var(--ink-3); font-size: calc(var(--u) * 1.45); font-weight: 700; }
.fd.sys b { margin-right: 0.1em; }
.fd.ok { background: #e3f5e9; color: #16723f; font-weight: 700; display: flex; align-items: center; gap: calc(var(--u) * 0.4); }
.fd.ok .tick { width: calc(var(--u) * 1.8); height: calc(var(--u) * 1.8); flex: none; }
.fd.ok b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 0; }
.fd.ok .what { flex: none; white-space: nowrap; }
.fd.ok .pts { margin-left: auto; font-weight: 800; flex: none; }
.fd.close { background: #fff3d6; color: #9a6200; font-weight: 700; }
@keyframes dd-feedin { from { transform: translateY(calc(var(--u) * 1)); opacity: 0; } }

.dg-center { min-width: 0; min-height: 0; display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 1); }
.dg-holder { flex: 1; min-height: 0; width: 100%; display: grid; place-items: center; }
.dg-sheet { position: relative; background: #fff; border-radius: calc(var(--u) * 0.3); box-shadow: 0 calc(var(--u) * 0.6) calc(var(--u) * 2) rgba(90, 60, 20, 0.2), 0 1px 3px rgba(90, 60, 20, 0.15); }
.dg-sheet canvas { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit; }
.dg-overlay { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; background: rgba(255, 253, 247, 0.94); border-radius: inherit; text-align: center; }
.dg-choosing { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 1.4); font-size: calc(var(--u) * 2); font-weight: 600; color: var(--ink-2); padding: calc(var(--u) * 2); }
.dg-choosing b { color: var(--ink); }
.dg-dots { display: flex; gap: calc(var(--u) * 0.6); }
.dg-dots i, .dots i { width: calc(var(--u) * 0.9); height: calc(var(--u) * 0.9); border-radius: 50%; background: var(--ink-3); animation: dd-dot 1.2s infinite; }
.dg-dots i:nth-child(2), .dots i:nth-child(2) { animation-delay: 0.15s; }
.dg-dots i:nth-child(3), .dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes dd-dot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-40%); opacity: 1; } }
.dg-artist { display: flex; align-items: center; gap: calc(var(--u) * 0.8); font-size: calc(var(--u) * 1.7); font-weight: 700; color: var(--ink-2); min-height: calc(var(--u) * 3.2); }

.dg-reveal { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(239, 231, 214, 0.82); animation: dd-fade 0.3s; }
.dg-rev-card { display: flex; gap: calc(var(--u) * 3.4); align-items: center; padding: calc(var(--u) * 3) calc(var(--u) * 3.6); transform: rotate(-0.8deg); animation: dd-pop 0.5s cubic-bezier(.2, 1.4, .4, 1) both; max-width: calc(var(--u) * 92); }
.dg-rev-pic { flex: none; width: calc(var(--u) * 26); height: calc(var(--u) * 32.5); background: #fff; box-shadow: 0 0 0 calc(var(--u) * 0.8) #fff, 0 calc(var(--u) * 0.4) calc(var(--u) * 1.6) calc(var(--u) * 0.8) rgba(90, 60, 20, 0.18); transform: rotate(2deg); }
.dg-rev-pic canvas { width: 100%; height: 100%; display: block; }
.dg-rev-main { min-width: calc(var(--u) * 40); text-align: center; }
.dg-rev-label { font-weight: 700; font-size: calc(var(--u) * 2); color: var(--ink-2); }
.dg-rev-word { font-family: var(--hand); font-size: calc(var(--u) * 8.5); line-height: 1.05; margin-top: calc(var(--u) * 0.6); }
.dg-rev-word.long { font-size: calc(var(--u) * 6.2); }
.dg-rev-word.xlong { font-size: calc(var(--u) * 4.8); }
.dg-rev-sub { font-weight: 700; font-size: calc(var(--u) * 2.2); margin: calc(var(--u) * 1.2) 0 calc(var(--u) * 1.8); }
.dg-rev-gains { display: flex; flex-wrap: wrap; justify-content: center; gap: calc(var(--u) * 0.7); max-width: calc(var(--u) * 54); margin: 0 auto; }
.gain { display: inline-flex; align-items: center; gap: calc(var(--u) * 0.6); padding: calc(var(--u) * 0.35) calc(var(--u) * 1) calc(var(--u) * 0.35) calc(var(--u) * 0.35); background: #f4efe4; border-radius: 999px; font-size: calc(var(--u) * 1.55); animation: dd-pop 0.4s both; }
.gain span { color: var(--green); font-weight: 800; }
.gain em { font-style: normal; font-weight: 700; color: var(--orange); font-size: 0.85em; }
.gain .dd-av { width: calc(var(--u) * 2.4); height: calc(var(--u) * 2.4); font-size: calc(var(--u) * 1.3); }

/* ---------------------------------------------------------- Telephone: writing / drawing steps */
.tp { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 1.6); padding: calc(var(--u) * 1.4) calc(var(--u) * 2.4) calc(var(--u) * 2.2); }
.tp-top, .tpp .tp-top { width: 100%; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; min-height: calc(var(--u) * 7); }
.tp-steptitle { font-weight: 700; font-size: calc(var(--u) * 2); color: var(--ink-2); }
.tp-steptitle b { color: var(--ink); }
.tp-timer-slot { justify-self: center; }
.tp-top .tp-timer-slot { grid-column: 2; grid-row: 1; }
.tp-top .tp-steptitle { grid-column: 3; justify-self: end; align-self: end; }
.tp-track { display: flex; align-items: center; gap: calc(var(--u) * 0.6); }
.tk { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 0.3); }
.tk span { width: calc(var(--u) * 4.4); height: calc(var(--u) * 4.4); border-radius: 50%; background: var(--sheet); display: grid; place-items: center; padding: calc(var(--u) * 0.9); box-shadow: 0 1px 3px rgba(90, 60, 20, 0.2); }
.tk small { font-weight: 800; font-size: calc(var(--u) * 1.25); color: var(--ink-3); }
.tk.now span { background: var(--c); transform: scale(1.18); }
.tk.now small { color: var(--ink); }
.tk.done span { background: var(--ink); padding: calc(var(--u) * 1.1); }
.tk-line { width: calc(var(--u) * 3); height: calc(var(--u) * 0.3); background: rgba(35, 33, 46, 0.15); border-radius: 999px; margin-bottom: calc(var(--u) * 1.8); }
.tp-instr { display: flex; align-items: center; gap: calc(var(--u) * 2.4); padding: calc(var(--u) * 2) calc(var(--u) * 3.4) calc(var(--u) * 2) calc(var(--u) * 2.4); transform: rotate(-0.8deg); max-width: calc(var(--u) * 80); }
.tp-instr-art { width: calc(var(--u) * 8); height: calc(var(--u) * 8); flex: none; }
.tp-instr h1 { margin: 0; font-family: var(--hand); font-weight: 400; font-size: calc(var(--u) * 5.4); line-height: 1; }
.tp-instr p { margin: calc(var(--u) * 0.6) 0 0; font-size: calc(var(--u) * 2); font-weight: 600; color: var(--ink-2); line-height: 1.3; }
.tp-grid { flex: 1; min-height: 0; width: 100%; max-width: calc(var(--u) * 110); display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: calc(var(--u) * 1); overflow: hidden; }
.tp-p { display: flex; align-items: center; gap: calc(var(--u) * 0.7); padding: calc(var(--u) * 0.5) calc(var(--u) * 1.1) calc(var(--u) * 0.5) calc(var(--u) * 0.5); background: var(--sheet); border-radius: 999px; font-size: calc(var(--u) * 1.75); box-shadow: 0 1px 3px rgba(90, 60, 20, 0.18); transition: background 0.3s, transform 0.3s; }
.tp-p b { max-width: calc(var(--u) * 13); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-p .st { width: calc(var(--u) * 2.2); height: calc(var(--u) * 2.2); display: grid; place-items: center; }
.tp-p .dots { display: flex; gap: calc(var(--u) * 0.25); }
.tp-p .dots i { width: calc(var(--u) * 0.5); height: calc(var(--u) * 0.5); }
.tp-p.done { background: #e3f5e9; transform: rotate(-1.5deg); }
.tp-p.gone { opacity: 0.4; }
.tp-grid.big { gap: calc(var(--u) * 1.6); }
.tp-grid.big .tp-p { font-size: calc(var(--u) * 2.3); padding: calc(var(--u) * 0.7) calc(var(--u) * 1.6) calc(var(--u) * 0.7) calc(var(--u) * 0.7); }
.tp-grid.big .dd-av { width: calc(var(--u) * 3.8); height: calc(var(--u) * 3.8); font-size: calc(var(--u) * 2.2); }
.tp-grid.big .st { width: calc(var(--u) * 2.8); height: calc(var(--u) * 2.8); }
.tp-grid.compact .tp-p { font-size: calc(var(--u) * 1.4); padding: calc(var(--u) * 0.3) calc(var(--u) * 0.8) calc(var(--u) * 0.3) calc(var(--u) * 0.3); }
.tp-grid.compact .dd-av { width: calc(var(--u) * 2.2); height: calc(var(--u) * 2.2); font-size: calc(var(--u) * 1.2); }
.tp-grid.tiny { gap: calc(var(--u) * 0.5); }
.tp-grid.tiny .tp-p b { max-width: calc(var(--u) * 8); }
.tp-progress { display: flex; align-items: center; gap: calc(var(--u) * 1.4); width: calc(var(--u) * 60); font-weight: 800; font-size: calc(var(--u) * 1.8); }
.tp-progress .bar { flex: 1; height: calc(var(--u) * 1.2); background: rgba(35, 33, 46, 0.1); border-radius: 999px; overflow: hidden; }
.tp-progress .bar i { display: block; height: 100%; width: 0; background: var(--green); border-radius: inherit; transition: width 0.4s; }

/* ---------------------------------------------------------- Telephone: playback */
.tpp { position: absolute; inset: 0; display: flex; flex-direction: column; padding: calc(var(--u) * 1.4) calc(var(--u) * 2.4) calc(var(--u) * 1.6); gap: calc(var(--u) * 1); }
.tpp-title { grid-column: 2; display: flex; align-items: center; gap: calc(var(--u) * 0.8); font-weight: 700; font-size: calc(var(--u) * 2); color: var(--ink-2); white-space: nowrap; }
.tpp-title b { color: var(--ink); }
.tpp-title small { font-size: calc(var(--u) * 1.3); color: var(--ink-3); }
.tpp-hint { grid-column: 3; justify-self: end; align-self: end; font-size: calc(var(--u) * 1.45); font-weight: 600; color: var(--ink-3); text-align: right; }
.tpp-hint b { color: var(--ink-2); }
.tpp-body { flex: 1; min-height: 0; display: grid; grid-template-columns: calc(var(--u) * 17) 1fr calc(var(--u) * 17); gap: calc(var(--u) * 2); }
.tpp-body.overview { grid-template-columns: 0 1fr 0; gap: 0; }
.tpp-trail { display: flex; flex-direction: column; justify-content: center; gap: calc(var(--u) * 1); min-height: 0; overflow: hidden; }
.tpp-focus { min-width: 0; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.tpp-entry { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(var(--u) * 1.2); animation: dd-pop 0.45s cubic-bezier(.2, 1.3, .4, 1) both; }
.tpp-entry .who { display: flex; align-items: center; gap: calc(var(--u) * 0.8); font-size: calc(var(--u) * 2); font-weight: 700; color: var(--ink-2); }
.tpp-entry .who .dd-chip { font-size: calc(var(--u) * 1.9); }
.tpp-bubble { padding: calc(var(--u) * 4) calc(var(--u) * 5); max-width: calc(var(--u) * 80); text-align: center; transform: rotate(-1deg); }
.tpp-bubble.first { background: var(--yellow); }
.tpp-bubble .txt { font-family: var(--hand); font-size: calc(var(--u) * 7); line-height: 1.08; overflow-wrap: anywhere; }
.tpp-bubble .txt.long { font-size: calc(var(--u) * 5.4); }
.tpp-bubble .txt.xlong { font-size: calc(var(--u) * 4.4); }
.tpp-bubble .txt em { color: var(--ink-3); }
.tpp-bubble .auto { margin-top: calc(var(--u) * 1); font-size: calc(var(--u) * 1.5); font-weight: 700; color: rgba(35, 33, 46, 0.55); }
.tpp-holder { flex: 1; min-height: 0; width: 100%; display: grid; place-items: center; }
.tpp-sheet { position: relative; background: #fff; border-radius: calc(var(--u) * 0.3); box-shadow: 0 calc(var(--u) * 0.6) calc(var(--u) * 2) rgba(90, 60, 20, 0.2); transform: rotate(0.6deg); }
.tpp-sheet canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.tpp-empty { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--hand); font-size: calc(var(--u) * 3.4); color: var(--ink-3); }
.tpp-votes { display: flex; align-items: center; gap: calc(var(--u) * 0.6); font-size: calc(var(--u) * 2); font-weight: 700; min-height: calc(var(--u) * 3); }
.tpp-votes .dd-doodle { width: calc(var(--u) * 2.6); height: calc(var(--u) * 2.6); }
.tpp-votes .muted { color: var(--ink-3); font-size: calc(var(--u) * 1.6); }
.tpp-mini { flex: none; background: var(--sheet); border-radius: calc(var(--u) * 0.4); padding: calc(var(--u) * 0.7); box-shadow: 0 1px 4px rgba(90, 60, 20, 0.2); display: flex; flex-direction: column; gap: calc(var(--u) * 0.5); }
.tpp-mini.in { animation: dd-feedin 0.35s ease-out; }
.tpp-mini canvas { width: 100%; height: auto; aspect-ratio: 4 / 5; display: block; background: #fff; border: 1px solid var(--line); }
.tpp-mini .mt { font-family: var(--hand); font-size: calc(var(--u) * 1.9); line-height: 1.1; padding: calc(var(--u) * 0.3) calc(var(--u) * 0.2); overflow-wrap: anywhere; }
.tpp-mini .mt em { color: var(--ink-3); font-size: 0.8em; }
.tpp-mini .mb { display: flex; align-items: center; gap: calc(var(--u) * 0.5); font-weight: 700; font-size: calc(var(--u) * 1.2); color: var(--ink-2); min-width: 0; }
.tpp-mini .mb > span:not(.v):not(.dd-av) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpp-mini .mb .dd-av { width: calc(var(--u) * 1.9); height: calc(var(--u) * 1.9); font-size: calc(var(--u) * 1.05); box-shadow: none; }
.tpp-mini .v { display: inline-flex; align-items: center; gap: 2px; margin-left: auto; color: var(--red); }
.tpp-mini .v .dd-doodle { width: calc(var(--u) * 1.4); height: calc(var(--u) * 1.4); }
.tpp-trail .tpp-mini canvas { max-height: calc(var(--u) * 14); width: auto; align-self: center; }
.tpp-strip { display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 0.8); width: 100%; flex-wrap: nowrap; }
.tpp-strip .tpp-mini.big { flex: 1 1 0; min-width: 0; max-width: calc(var(--u) * 17); animation: dd-pop 0.4s cubic-bezier(.2, 1.4, .4, 1) both; animation-delay: calc(var(--i) * 0.12s); }
.tpp-strip .tpp-mini.text { min-height: calc(var(--u) * 12); justify-content: space-between; }
.tpp-strip .tpp-mini .mt { font-size: calc(var(--u) * 1.75); }
.tpp-strip .tpp-mini:nth-child(4n+1) { transform: rotate(-1.5deg); }
.tpp-strip .tpp-mini:nth-child(4n+3) { transform: rotate(1.2deg); }
.tpp-arrow { width: calc(var(--u) * 2.2); height: calc(var(--u) * 2.2); flex: none; animation: dd-fade 0.3s both; animation-delay: calc(var(--i) * 0.12s + 0.1s); }
.tpp-summary { margin-top: calc(var(--u) * 2.4); font-size: calc(var(--u) * 2.4); font-weight: 600; color: var(--ink-2); text-align: center; max-width: calc(var(--u) * 90); }
.tpp-summary b { font-family: var(--hand); font-weight: 400; font-size: 1.35em; color: var(--ink); }
.tpp-auto { height: calc(var(--u) * 0.45); background: rgba(35, 33, 46, 0.08); border-radius: 999px; overflow: hidden; }
.tpp-auto i { display: block; height: 100%; width: 0; background: var(--ink-3); }
.tpp-awards { display: flex; gap: calc(var(--u) * 6); align-items: flex-start; justify-content: center; }
.tpp-award { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 1); animation: dd-pop 0.5s cubic-bezier(.2, 1.4, .4, 1) both; }
.tpp-award:nth-child(2) { animation-delay: 0.2s; }
.aw-title { font-family: var(--hand); font-size: calc(var(--u) * 4); }
.tpp-award .tpp-mini.big { width: calc(var(--u) * 22); }
.tpp-award .tpp-mini.text { min-height: calc(var(--u) * 14); justify-content: space-between; }
.tpp-award .tpp-mini .mt { font-size: calc(var(--u) * 3); }
.aw-votes { display: flex; align-items: center; gap: calc(var(--u) * 0.5); font-weight: 800; font-size: calc(var(--u) * 2); color: var(--red); }
.aw-votes .dd-doodle { width: calc(var(--u) * 2.4); height: calc(var(--u) * 2.4); }
`;
