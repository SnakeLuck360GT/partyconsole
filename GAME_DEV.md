# PartyConsole — Game Developer Guide

PartyConsole is an AirConsole-style party platform. A **screen** (TV/laptop browser, `screen.html`) runs the game;
every player's **phone** (`controller.html`) is a controller. Phones connect straight to the screen over WebRTC
(PeerJS), and there is no game server. Everything is a static Vite site (three.js r186, vanilla ES modules, no framework).

## Anatomy of a game

A game is a folder `src/games/<id>/` with three files. It is auto-discovered, so there's no registry to edit.

```
src/games/<id>/meta.js        default export: metadata
src/games/<id>/screen.js      default export: async function start(ctx) -> { destroy() }
src/games/<id>/controller.js  default export: async function start(ctx) -> { destroy() }
public/assets/<id>/...        game-specific assets, URL via ctx.asset('file.glb')
public/assets/shared/...      shared CC0 model library (see public/assets/shared/ASSETS.md + catalog.json), URL via ctx.sharedAsset('characters/x.glb')
```

You may add any number of extra modules in your folder (e.g. `src/games/<id>/physics.js`, `minigames/*.js`).

### meta.js
```js
export default {
  id: 'kart',                  // must equal folder name
  name: 'Kart Chaos',
  tagline: 'Drift, boost, and bump your friends off the track',  // one line
  emoji: '🏎️',                 // fallback card art
  color: '#ff4d4d',            // card accent colour
  thumbnail: 'thumb.jpg',      // optional: public/assets/<id>/thumb.jpg (16:9, ~640x360, <120 KB)
  minPlayers: 1,
  maxPlayers: 999,             // 999 = "no limit". Be honest if the game truly caps.
  orientation: 'landscape',    // phone pose: 'landscape' (gamepads, tilt) | 'portrait' (typing, drawing, voting) | 'any'.
                               // The platform locks it on Android and shows a "rotate your phone" overlay on iOS, so don't build your own.
  order: 10,                   // position in the menu (lower first)
};
```

### Screen ctx (`screen.js`)
| member | description |
|---|---|
| `ctx.container` | full-screen `div` (position:absolute; inset:0) to render into. Remove everything you add in `destroy()`. |
| `ctx.players()` | connected players, sorted by join order: `{ id, name, color (css), colorHex (0xRRGGBB), avatar (emoji), index, isAdmin, connected }` |
| `ctx.allPlayers()` / `ctx.player(id)` | including disconnected ones |
| `ctx.send(playerId, data)` / `ctx.broadcast(data)` | send any JSON-serialisable data to phone(s) |
| `ctx.onMessage((playerId, data) => …)` | data sent by a phone's `ctx.send` |
| `ctx.onJoin((player, {rejoin}) => …)` | someone joined **mid-game** (or reconnected, `rejoin: true`). The platform already told their phone to load your controller. Send them the current state! |
| `ctx.onLeave(player => …)` | phone disconnected (may come back with the same `id`). Never crash or softlock. |
| `ctx.showResults(rows, {title, subtitle})` | platform podium overlay. `rows = [{ player, score, label? }]` best-first. Returns a Promise resolving `'again'` (admin chose play again → restart your game) or `'menu'` (platform is destroying your game). |
| `ctx.vibrate(playerId \| 'all', pattern)` | buzz phones from the screen: a preset name (`'tap' 'select' 'bump' 'hit' 'heavy' 'explosion' 'boost' 'turn' 'warn' 'error' 'success' 'win' 'lose' 'heartbeat' 'buzz'`), ms, or `[on, off, on…]`. Use it for hits, deaths, your-turn, boosts and wins. Phones respect the player's Haptics toggle. iPhones only get light ticks. |
| `ctx.exit()` | back to the game menu |
| `ctx.asset(path)` / `ctx.sharedAsset(path)` | asset URLs |
| `ctx.adminId` | the player who controls menus (👑) |

The loading spinner stays up until your `start()` promise resolves. **Load assets before returning**, then run the
game (countdown etc.) *without* awaiting it inside `start`. For example, kick off `runGame()` without `await`.

### Controller ctx (`controller.js`)
| member | description |
|---|---|
| `ctx.container` | area below the 44px top bar (the bar shows the player's avatar/name/colour; the admin also gets a Menu button). |
| `ctx.player` | this player `{ id, name, color, avatar, … }` |
| `ctx.isAdmin` | boolean getter |
| `ctx.send(data)` | to the screen (arrives at the screen's `onMessage(playerId, data)`) |
| `ctx.onMessage(data => …)` | from the screen's `send`/`broadcast` |
| `ctx.vibrate(preset or ms or pattern)` | haptics, same presets as above (`ctx.kit.HAPTICS`) |
| `ctx.kit` | the widgets from `src/sdk/controller-kit.js` (below) |

**The controller must be stateless-tolerant.** It can load at any time, e.g. after a reconnect or on a mid-game
join. So on start, send something like `ctx.send({ type: 'hello' })`, and have the screen reply with the current
state for that player.

## SDK modules (read the source, they're short)

- `src/sdk/controller-kit.js`, phone widgets:
  - `gamepad(ctx, { stick: 'analog'|'dpad'|'none', buttons: [{id, label, color?}], hint })` sends `{type:'input', x, y, b:{id:bool}}` automatically. It lays out landscape and portrait.
  - `joystick`, `button`, `dpad`, `choices(parent, items, {onPick})`, `textInput(parent, {onSubmit})`, `message(parent, html)`, `vibrate`.
  - **Phone orientation & rotation (important).** iOS can't lock orientation, so for `orientation: 'landscape'` games the platform rotates the whole controller page 90° when the phone is held in portrait (`body[data-vrot]`). Rules for controller code:
    - Use `body[data-layout='portrait'|'landscape'] .your-class {…}` instead of `@media (orientation: …)`, which reports the wrong thing while rotated.
    - Avoid `vw`/`vh` units in controllers (they're swapped while rotated). Use `%`, `vmin`, or container sizes.
    - Custom pointer/drag code must use `ctx.kit.localPoint(el, e)` → `{x, y}` and `ctx.kit.toLocalVec(dx, dy)` instead of raw clientX/clientY maths. Kit widgets already do this.
  - `tilt({onChange(steer), maxAngle})`: gyro steering in any orientation. Call `start()` from a tap handler (iOS permission), then `calibrate()`. It needs HTTPS on phones (use `npm run dev:https` for LAN testing). Always offer an on-screen fallback.
  - You can build fully custom controller UIs (drawing canvas, keyboards, sliders). Use the CSS variable `--me` for the player colour and make it thumb-friendly.
- `src/sdk/screen-kit.js`:
  - `trackInput(ctx)`, whose `.get(pid)` gives `{x, y, b, pressed(id)}` (edge-triggered), paired with `gamepad`.
  - `countdown(container)`, `banner(container, html, ms)`, `scoreboard(container, {title, position})`, `escapeHtml`, `shuffle`, `sleep`.
- `src/sdk/three-kit.js`:
  - `createStage(container, {background, fog, shadows, shadowArea})` gives `{renderer, scene, camera, sun, onFrame(fn(dt,t)), dispose()}`. It comes with ACES tone mapping, PCF soft shadows and IBL, and handles resize.
  - `loadModel(url, {scale})` returns a cached clone of a GLB, SkinnedMesh-safe, with shadows on.
  - `tint(obj, color, materialNameRegex)`, `makeLabel(text, {color})` (billboard name tag), `animator(obj)`, whose `.play('Run')` crossfades between clips.
- `src/sdk/audio.js`: `sfx.play('coin'|'jump'|'hit'|'explosion'|'shoot'|'powerup'|'countdown'|'go'|'win'|'lose'|'correct'|'wrong'|'join'|'whoosh'|'tick'|'blip'|'click')`, `sfx.playFile(url)`, `sfx.engine()`.
- Physics libs are installed: `cannon-es` and `@dimforge/rapier3d-compat`. For top-down arcade games, simple custom physics is often better and more controllable.
- `src/sdk/colors.js`: player palette.

Reference implementation: `src/games/_demo/` (hidden from the menu).

## Quality bar (non-negotiable)

This should feel like a polished commercial party game, not a tech demo.

1. **Visuals.** Use the curated models in `public/assets/shared/` (check `ASSETS.md`, `catalog.json`, `preview-*.jpg`). Don't use primitive boxes as characters. Add real lighting and shadows, particles and juice (screen shake, squash/stretch, tweens, hit flashes, confetti), a proper environment and a readable camera that frames all players. 2D games get a polished look too: gradients, animation, big bold readable type visible from a couch 3 m away.
2. **Player identity.** Each player is clearly shown in their colour with a name label.
3. **Controllers.** Make them big, obvious and responsive. Show the player's current status on the phone ("You're out, spectating", "Your turn!", score). Vibrate on meaningful events.
4. **Game flow.** Instructions or a how-to-play card at the start (3–5 s, or skippable), a countdown, rounds, a scoreboard, and then `ctx.showResults`. Handle `'again'`. Never softlock: timeouts on every wait-for-player step, and skip disconnected players.
5. **Scale.** The platform has no player cap. Support as many players as the design allows (8+ for action games, 16–100+ for quiz/word/draw games). Degrade gracefully: dynamic arena size, camera zoom, compact scoreboards, teams, or queue/spectate beyond a hard limit.
6. **Networking.** Send inputs at ≤30 Hz from phones (gamepad does this). Never stream per-frame state to phones; send only events/state changes. The screen is authoritative.
7. **Performance.** Hold 60 fps on a laptop iGPU. Share geometries/materials, cap particle counts, use `renderer.setPixelRatio(min(dpr,2))` (createStage does), and don't create objects per frame.
8. **Clean up.** `destroy()` must stop loops, timers, audio and listeners, and remove DOM.
9. **Originality.** Games are *inspired by* genres (kart racer, sumo, quiz, drawing…). Use no copyrighted names, characters, logos or assets from Nintendo, AirConsole, etc.

## Testing (required)

```
npm run build                                    # must succeed
node scripts/smoke.mjs <id> [players] [seconds]  # headless: screen + N phones (local transport), random input mashing
```
The smoke test writes screenshots to `scripts/out/<id>/` (`lobby.png`, `screen-*.png`, `phone-*.png`, `phone-late-portrait.png`,
`screen-after-leave.png`) and prints page errors. **Look at the screenshots with the Read tool** and iterate until it
looks great. Headless uses SwiftShader (software WebGL), so it's slower than real hardware; don't mistake that
for your bug, but do keep scenes lean.
You can also write your own Playwright scripts, e.g. to drive a controller deterministically. Keep them in
`scripts/` named `<id>-*.mjs`. Test pages in the browser with `?local=1&room=ABCD` on both
`screen.html` and `controller.html` to use the in-browser BroadcastChannel transport.

For a thumbnail, take a nice in-game screenshot, downscale it to 640×360 JPEG (e.g. with `sips -Z 640` on macOS, or
Playwright `clip`), and save it as `public/assets/<id>/thumb.jpg`.

## Rules when working in parallel with other agents

- Only create or modify files inside `src/games/<id>/`, `public/assets/<id>/`, and `scripts/<id>-*.mjs`.
- **Do not edit** `src/sdk/*`, `src/screen/*`, `src/controller/*`, `src/net/*`, `package.json`, or other games.
  If you need an SDK change, work around it inside your folder and mention it in your final report.
- Do not `npm install` anything. If you truly need a package, say so in your report.
- Don't modify `public/assets/shared/` (read-only library). Copy nothing out of it; reference it via `ctx.sharedAsset()`.
- Don't commit to git.
