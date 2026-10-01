# PartyConsole: handoff for a new session

The project is an AirConsole-style party console that runs in the browser. The TV/laptop opens `screen.html` and runs the games in three.js. Phones open `controller.html` and act as controllers. Devices talk over WebRTC via PeerJS. There is no game server, only the public PeerJS broker for the handshake. It is **localhost / home network only**, with no public hosting.

## Run it
- `npm run dev` (live reload is OFF on purpose; `HMR=1 npm run dev` turns it on).
- `npm run dev:https` is needed for phone tilt/gyro on the LAN (self-signed cert, accept the warning).
- On the TV, open `http://<lan-ip>:5173/`. The root redirects phones → controller and tablets/PCs → screen.
- Test without internet: add `?local=1` to both `screen.html` and `controller.html` (uses BroadcastChannel between tabs).
- Headless test: `node scripts/smoke.mjs <gameId> [players] [seconds]` writes screenshots to `scripts/out/<id>/`.
- `npm run build` currently FAILS only because `src/games/doodle/` is half-built (missing `style-screen.js`).

## Key files
- `GAME_DEV.md`: the game API, quality bar, phone orientation/rotation rules, haptics API and testing rules. **Read it first.**
- `src/screen/main.js` + `screen.css`: TV host (lobby, room code, QR, game lifecycle, results podium, WebGL context cleanup).
- `src/controller/main.js` + `controller.css`: phone (join, lobby, results, orientation lock / virtual rotation for iOS, fullscreen, haptics toggle).
- `src/sdk/`:
  - `controller-kit.js`: joystick, d-pad, buttons, gamepad, `tilt()` gyro steering, `vibrate()` with HAPTICS presets, `localPoint`/`toLocalVec`.
  - `screen-kit.js`: input tracking, countdown, banner, scoreboard.
  - `three-kit.js`: stage, model loading, labels, animator.
  - `audio.js`: sfx.
- `src/net/transport.js`: PeerJS + local transport.
- `src/games/<id>/{meta,screen,controller}.js`: games are auto-discovered.
- `public/assets/shared/`: 569 CC0 GLB models (Kenney, Quaternius, KayKit). See `ASSETS.md` and `catalog.json`.

## Design direction (the user approved this; don't drift)
The look is a Nintendo-Switch-style console: light grey `#ebebeb`, white cards, the Figtree font, square game tiles filled with **real 3D-rendered cover art** (`public/assets/<id>/cover.jpg`, falling back to a coloured tile with the name), a cyan `#12b5ea` focus ring, and minimal text.

The user hates "AI-looking" UI: gradient icon tiles, glass/neon, emoji chrome, lots of tiny labels. The QR code must stay visible at every size. In-game phone controllers are dark.

## Status per game
| game | state |
|---|---|
| trivia (Brain Brawl) | **finished**, reviewed |
| kart (Kart Chaos) | being overhauled by an agent in the previous chat (Mario Kart–style chase cam, split screen ≤4, CPU grid of 8, items, drift + Smart Steering, slipstream, character + kart select with stats, custom model folder `public/assets/kart/custom/`, track audit, upside-down "?" fix). Check whether it finished (files still changing? `scripts/out/kart*` screenshots?) before touching it. |
| cover art (all games) | an agent in the previous chat is rendering `cover.jpg` (1024²) + `cover-wide.jpg` for all 14 games via `scripts/keyart/`. Check what exists. |
| word-bomb | nearly finished (its agent was on the final test run); has thumb. Verify and polish. |
| sumo | mostly built; crumble-arena spawn bug fixed (sim.js `buildTiles`); needs finishing/polish |
| party-board + minigames | partially built (board in `src/games/party-board/`, minigames in `minigames/` per `minigames/README.md`, test page `src/games/_mgtest/`) |
| doodle, bluff, soccer, golf, bomber, tanks, space, neon, tower | partial; agents were stopped mid-work. Continue from the code on disk. |

## Open user feedback / known issues
- **Haptics:** the user is on **iPhone**, where Safari blocks web vibration and the iOS switch-tick hack doesn't work for them. Haptic events now show a screen-edge flash in the player's colour (`flash()` in controller-kit), and the toggle reads "Flash on/off". Real iPhone vibration would need a native wrapper (Capacitor + Xcode sideload); it was offered and not yet requested. Android uses `navigator.vibrate` normally.
- The Kart feedback above is with the Kart agent. If it didn't finish, re-brief a new agent with those points.

## How to work (lessons learned)
- The user wants parallel subagents, one per game, but **~15 Opus agents at once exhausts their usage limit within about an hour**. Run batches of ~5. Suggested order: party-board + minigames, word-bomb, sumo, doodle (fixes the build) → soccer, bluff, golf, bomber → tanks, space, neon, tower.
- Give each agent `GAME_DEV.md` and the parallel-work rules (own folders only). Have them use a test Vite config with `server.hmr:false`, test with the smoke script and their own Playwright script, and look at their screenshots.
- Don't download Nintendo/Mario Kart or other ripped copyrighted assets. Use the CC0 library; user-supplied models go in the custom folder.
- Review each finished game's screenshots yourself before telling the user it's done.
