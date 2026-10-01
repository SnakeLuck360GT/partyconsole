# Party Board — minigame contract

The board game (`../screen.js`) plays a minigame after every round. Each minigame is one self-contained ES module
`src/games/party-board/minigames/<id>.js` (extra helper files go in `./<id>/` subfolders or `_shared-*.js`).
Files starting with `_` are not auto-registered.

```js
export default {
  id: 'hot-lava',                     // kebab-case, equals filename
  name: 'Hot Lava Hop',
  instructions: 'Jump over the sweeping lava beam. Last one standing wins!',  // shown on screen + phones before start
  mode: 'ffa',                        // 'ffa' (everyone vs everyone) | 'teams' (board passes teams) | 'coop'
  minPlayers: 2,
  // Phone layout: the board's controller renders the standard kit gamepad with this spec.
  // Inputs reach you through env.input.get(pid) -> { x, y, b, pressed(id) }.
  controls: { stick: 'analog', buttons: [{ id: 'a', label: 'JUMP' }], hint: 'Jump with A' },
  duration: 45,                       // seconds (upper bound; you may end early)

  /**
   * Run the minigame to completion.
   * @param env.container   fresh full-screen div; render everything inside it (e.g. createStage(env.container))
   * @param env.players     array of platform players { id, name, color, colorHex, avatar }
   * @param env.teams       for mode 'teams': array of arrays of player ids, else null
   * @param env.input       input tracker: env.input.get(pid) -> { x, y, b, pressed(btnId) }
   * @param env.send        (pid, data) -> send to that phone (e.g. { type: 'vibrate', ms: 40 } — board forwards it to ctx.vibrate)
   * @param env.sharedAsset (path) -> URL in public/assets/shared/
   * @param env.signal      AbortSignal, aborted if the whole game is closed. Stop immediately and resolve.
   * @returns Promise<{ [playerId]: number }> score per player — higher is better. Board converts to placements/coins.
   */
  async run(env) { ... },
};
```

Rules:
- `run` must clean up EVERYTHING it created (stage.dispose(), timers, DOM) before resolving.
- Show your own countdown (screen-kit `countdown`) and a clear timer / live standings, finish with a ~2 s "FINISH!" moment.
- Must work for 2–8 players (board caps active pieces at 8; extra players are on teams sharing a piece), and must not
  break with 1 player (for testing).
- Never wait forever; respect `duration`.
- 3D with the shared model library (`public/assets/shared/ASSETS.md`), same quality bar as full games.
