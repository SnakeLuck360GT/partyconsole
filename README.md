# PartyConsole

Couch party games in the browser, in the style of AirConsole. A TV or laptop opens `screen.html` and becomes the console.
Everyone's phone opens `controller.html` (scan the QR code) and becomes a controller. There's no app, no account and no player cap.

## How it works
- **No game server.** Phones connect straight to the screen over WebRTC data channels (PeerJS). The free public PeerJS broker only does the initial handshake. After that, traffic goes device to device (usually over your local Wi-Fi), so latency is low.
- The screen runs all game logic. Phones send inputs and render controller UIs.
- It's a static site (Vite + three.js), so it can be hosted free anywhere static.

## Develop
```bash
npm install
npm run dev          # open http://localhost:5173/screen.html on the TV/laptop, scan the QR with your phone (same Wi-Fi)
npm run build        # production build to dist/
node scripts/smoke.mjs <gameId> [players] [seconds]   # headless test: screen + N fake phones
```
Local multi-tab testing without internet: add `?local=1` to both `screen.html` and `controller.html` URLs.

Writing a game: see [GAME_DEV.md](GAME_DEV.md).

## Deploy (free) on Netlify
`netlify.toml` configures everything (build `npm run build`, publish `dist`). Pick one:
- **Git:** push to GitHub → Netlify → *Add new site → Import an existing project* → pick the repo. Every push auto-deploys.
- **CLI:** `npx netlify-cli login` once, then `npx netlify-cli deploy --build --prod`.
- **Drag & drop:** `npm run build`, then drop the `dist/` folder on https://app.netlify.com/drop.

Then open `https://<your-site>.netlify.app/screen.html` on the TV. Phones scan the QR code, or go to `<your-site>.netlify.app/play`.

## Network notes
- The best experience is the TV and phones on the same Wi-Fi. Phones on mobile data usually connect fine via STUN.
  Some strict carrier/corporate NATs need a TURN relay. Add one to `ICE` in `src/net/transport.js` if needed.
- Guest Wi-Fi networks with "client isolation" block device-to-device traffic. Use mobile data on the phones in that case.

## Credits
3D models: see `public/assets/shared/CREDITS.md` (CC0 packs by Kenney, Quaternius, KayKit and others).
Trivia questions: Open Trivia Database (CC BY-SA 4.0).
