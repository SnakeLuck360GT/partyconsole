// Color Drop: a sky-high floor of coloured tiles. A colour is called; every other tile drops away.
// Get onto the right colour in time! Rounds get faster. Last one standing wins.
import { createSession, THREE, sfx, shuffleInPlace } from './_shared-core.js';
import { spawnCharacters, separate } from './_shared-chars.js';
import { clouds, island, scatter } from './_shared-env.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const COLORS = [
  { key: 'red', name: 'RED', css: '#ff4d4d', hex: 0xff4d4d },
  { key: 'blue', name: 'BLUE', css: '#3d8bff', hex: 0x3d8bff },
  { key: 'yellow', name: 'YELLOW', css: '#ffcc00', hex: 0xffcc00 },
  { key: 'green', name: 'GREEN', css: '#34d058', hex: 0x34d058 },
];
const T = 1.9; // tile pitch

export default {
  id: 'color-drop',
  name: 'Color Drop',
  instructions: 'A colour is called: get onto a tile of that colour before the others fall away! It gets faster each round.',
  mode: 'ffa',
  minPlayers: 2,
  controls: { stick: 'analog', buttons: [{ id: 'a', label: 'JUMP' }], hint: 'Move to the called colour · <b>A</b> jump' },
  duration: 55,

  async run(env) {
    const s = await createSession(env, {
      title: this.name,
      instructions: this.instructions,
      background: 0x9fd8ff,
      sky: [0x2f7fe0, 0xcfeaff],
      hud: { scoreLabel: 's', sort: false },
      envIntensity: 0.35,
      camera: { pitch: 58, dist: 18 },
    });
    try {
      const n = s.players.length;
      const G = n <= 4 ? 6 : 7; // grid size
      const half = ((G - 1) * T) / 2;
      await clouds(s, { count: 12, radius: 44, y: -20, spread: 5 });
      // distant floating islands
      const isles = [[-22, -6, -18], [20, -8, -20], [-26, -10, 6], [25, -7, 4]];
      for (const [x, y, z] of isles) { const g = island(s, { radius: 3.5, depth: 3 }); g.position.set(x, y, z); }
      await scatter(s, [{ path: 'nature/tree-1-a.glb', count: 1, height: 4 }], { inner: 0, outer: 0.01 }).then((g) => g.position.set(-22, -6, -18));
      await scatter(s, [{ path: 'nature/tree-3-a.glb', count: 1, height: 3.5 }], { inner: 0, outer: 0.01 }).then((g) => g.position.set(20, -8, -20));
      const tileGeo = new RoundedBoxGeometry(T * 0.94, 0.5, T * 0.94, 3, 0.12);
      tileGeo.translate(0, -0.25, 0);
      const tileMats = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c.hex, roughness: 0.75 }));
      const tiles = [];
      for (let i = 0; i < G; i++) {
        for (let j = 0; j < G; j++) {
          const x = -half + i * T;
          const z = -half + j * T;
          const holder = new THREE.Mesh(tileGeo, tileMats[0]);
          holder.position.set(x, 0, z);
          holder.receiveShadow = true;
          holder.castShadow = true;
          s.scene.add(holder);
          tiles.push({ holder, x, z, color: 0, y: 0, vy: 0, state: 'up' });
        }
      }
      function setColor(t, ci) { t.color = ci; t.holder.material = tileMats[ci]; }
      function shuffleColors() {
        const bag = [];
        for (let k = 0; k < tiles.length; k++) bag.push(k % 4);
        shuffleInPlace(bag);
        tiles.forEach((t, k) => setColor(t, bag[k]));
      }
      shuffleColors();
      // called-colour panel + screen edge glow
      const panel = document.createElement('div');
      panel.style.cssText = 'position:absolute;top:11vh;left:50%;transform:translateX(-50%);z-index:21;pointer-events:none;text-align:center;font-family:Figtree,system-ui,sans-serif;transition:opacity .2s;opacity:0';
      s.root.appendChild(panel);
      function drawSign(col, frac = 1) {
        if (!col) { panel.style.opacity = 0; return; }
        panel.style.opacity = 1;
        panel.innerHTML = `<div style="background:${col.css};color:#fff;font-weight:800;font-size:8vmin;padding:.4vmin 6vmin;border-radius:2.4vmin;box-shadow:0 1vmin 0 #0004">${col.name}</div>
          <div style="margin:1.2vmin auto 0;height:1.2vmin;width:30vmin;background:#0004;border-radius:9px;overflow:hidden"><div style="height:100%;width:${frac * 100}%;background:#fff"></div></div>`;
      }
      drawSign(null);

      const chars = await spawnCharacters(s, { height: 1.6 });
      const list = [...chars.values()];
      list.forEach((c, i) => {
        const a = (i / list.length) * Math.PI * 2;
        c.pos.set(Math.sin(a) * half * 0.6, 0, Math.cos(a) * half * 0.6);
        c.face(-c.pos.x, -c.pos.z); c.yaw = c.targetYaw;
        c.out = false;
      });
      s.cam.set(new THREE.Vector3(0, 0, 0.8), 16 + G * 0.6);
      s.cam.snap();

      const tileAt = (x, z) => {
        const i = Math.round((x + half) / T);
        const j = Math.round((z + half) / T);
        if (i < 0 || j < 0 || i >= G || j >= G) return null;
        return tiles[i * G + j];
      };
      let phase = 'intro';
      const survival = new Map(list.map((c) => [c.id, 0]));
      const outOrder = [];
      let t = 0;

      s.onFrame((dt, time) => {
        for (const tl of tiles) {
          if (tl.state === 'drop') { tl.vy -= 30 * dt; tl.y += tl.vy * dt; if (tl.y < -14) { tl.y = -14; tl.vy = 0; } }
          else if (tl.state === 'rise') { tl.y += (0 - tl.y) * (1 - Math.exp(-7 * dt)); if (Math.abs(tl.y) < 0.01) { tl.y = 0; tl.state = 'up'; } }
          else if (tl.state === 'shake') { tl.y = Math.sin(time * 70 + tl.x) * 0.06; }
          tl.holder.position.y = tl.y;
        }
          if (phase === 'intro') return;
        if (phase === 'play') t += dt;
        for (const c of list) {
          if (c.out) {
            c.integrate(dt, { ground: () => null });
            if (c.pos.y < -12) c.root.visible = false;
            continue;
          }
          const inp = phase === 'play' ? s.input(c.id) : { x: 0, y: 0, pressed: () => false };
          c.drive(inp.x, inp.y, dt, { speed: 6.3, accel: 16 });
          if (inp.pressed('a') && c.jump(8.5)) sfx.play('jump');
          const lim = half + T / 2 - 0.3;
          c.pos.x = THREE.MathUtils.clamp(c.pos.x, -lim, lim);
          c.pos.z = THREE.MathUtils.clamp(c.pos.z, -lim, lim);
          const tl = tileAt(c.pos.x, c.pos.z);
          const solid = tl && (tl.state === 'up' || tl.state === 'shake' || (tl.state === 'rise' && tl.y > -0.3));
          c.integrate(dt, { ground: () => (solid ? tl.y : null) });
          if (c.pos.y < -1.2 && phase === 'play') {
            c.out = true;
            c.die();
            outOrder.push(c.id);
            s.hud.setOut(c.id);
            s.vibrate(c.id, 300);
            s.status(c.id, 'You fell! Watch the TV…');
            sfx.play('lose');
            s.pop(c.pos.clone().setY(0.5), 'BYE!', '#fff');
          }
        }
        separate(list.filter((c) => !c.out), 0.42);
        if (phase === 'play') {
          for (const c of list) if (!c.out) survival.set(c.id, t);
          for (const c of list) s.hud.setScore(c.id, Math.floor(survival.get(c.id)), { bump: false });
        }
      });

      await s.intro();
      if (s.aborted) return {};
      phase = 'play';
      const n0 = list.length;
      const aliveN = () => list.filter((c) => !c.out).length;
      const isOver = () => (n0 > 1 ? aliveN() <= 1 : aliveN() === 0);
      let over = false;
      const game = (async () => {
        let round = 0;
        let lastCol = -1;
        while (!s.aborted && !over) {
          round++;
          let ci;
          do { ci = Math.floor(Math.random() * 4); } while (ci === lastCol);
          lastCol = ci;
          const col = COLORS[ci];
          const think = Math.max(1.3, 3.4 - round * 0.28);
                    sfx.play('blip');
          list.forEach((c) => !c.out && s.status(c.id, `Go to <b style="color:${col.css}">${col.name}</b>!`));
          let el = 0;
          await new Promise((res) => {
            const off = s.onFrame((dt) => {
              el += dt;
              drawSign(col, Math.max(0, 1 - el / think));
              if (el > think - 0.6) tiles.forEach((tl) => { if (tl.color !== ci && tl.state === 'up') tl.state = 'shake'; });
              if (el >= think || s.aborted) { off(); res(); }
            });
          });
          if (s.aborted || over) break;
          tiles.forEach((tl) => { if (tl.color !== ci) { tl.state = 'drop'; tl.vy = 0; } });
          sfx.play('whoosh');
          s.shake(0.2);
          await s.wait(1700);
          if (s.aborted || over) break;
          shuffleColors();
          tiles.forEach((tl) => { if (tl.state === 'drop') { tl.state = 'rise'; tl.y = -6; } });
          drawSign(null);
          await s.wait(900);
        }
      })();
      await s.play(this.duration, { until: isOver });
      over = true;
      phase = 'end';
      await game;
      if (s.aborted) return {};
      tiles.forEach((tl) => { if (tl.state !== 'up') { tl.state = 'rise'; } });
      const alive = list.filter((c) => !c.out);
      const winners = alive.length ? alive.map((c) => c.id) : outOrder.slice(-1);
      for (const id of winners) {
        const c = chars.get(id);
        if (c.out) { c.out = false; c.root.visible = true; c.pos.set(0, 0, 0); c.vy = 0; c.grounded = true; }
      }
      const scores = {};
      for (const c of list) scores[c.id] = Math.round(survival.get(c.id) * 10) / 10 + (alive.includes(c) ? 100 : 0);
      await s.finish(winners, { chars });
      return scores;
    } finally {
      s.dispose();
    }
  },
};

