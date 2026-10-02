// Tug Rumble (team game): two teams on grassy cliffs, a rope over a mud pit. Mash A to pull; when the
// HEAVE! call comes, every press counts triple. Drag the other team's front runner into the mud to win.
// Team power is averaged per member, so a 3-vs-2 is still fair. A lone player pulls against a CPU crew.
import { createSession, THREE, sfx } from './_shared-core.js';
import { spawnCharacters, Char } from './_shared-chars.js';
import { loadModel } from '../../../sdk/three-kit.js';
import { escapeHtml } from '../../../sdk/screen-kit.js';
import { island, scatter, clouds, propFactory, waterSea } from './_shared-env.js';

const PIT = 2.2; // half width of the mud pit; rope centre past ±PIT = win
const FRONT = 2.9; // front puller's distance from the centre
const GAP = 1.25; // spacing between teammates
const TEAM_COLORS = [
  { name: 'Orange', css: '#ff7a1f', hex: 0xff7a1f },
  { name: 'Blue', css: '#2f8cff', hex: 0x2f8cff },
];

export default {
  id: 'tug-rumble',
  name: 'Tug Rumble',
  instructions: 'Team game! Mash <b>A</b> to pull the rope. When <b>HEAVE!</b> flashes, every pull counts triple. Drag the other team into the mud!',
  mode: 'teams',
  minPlayers: 1,
  controls: { stick: 'none', buttons: [{ id: 'a', label: 'PULL' }], hint: 'Mash <b>A</b> · triple power on <b>HEAVE!</b>' },
  duration: 35,

  async run(env) {
    const s = await createSession(env, {
      title: this.name,
      instructions: this.instructions,
      background: 0x9fd8ff,
      sky: [0x3f93e8, 0xd9f1ff],
      fog: { near: 50, far: 130 },
      hud: { scoreLabel: 'pulls', showStandings: false },
      camera: { pitch: 22, dist: 13, lookY: 0.9 },
      shadowArea: 26,
    });
    try {
      // ---------------------------------------------------------------- teams
      const ids = s.players.map((p) => p.id);
      let teams;
      if (env.teams && env.teams.length >= 2) {
        teams = [env.teams[0].filter((id) => s.byId.has(id)), env.teams[1].filter((id) => s.byId.has(id))];
        for (const id of ids) if (!teams[0].includes(id) && !teams[1].includes(id)) (teams[0].length <= teams[1].length ? teams[0] : teams[1]).push(id);
      } else {
        teams = [ids.filter((_, i) => i % 2 === 0), ids.filter((_, i) => i % 2 === 1)];
      }
      if (!teams[0].length && teams[1].length) teams = [teams[1], teams[0]];
      const cpuTeam = teams[1].length ? -1 : 1; // a lone player (or a lopsided split) pulls against a CPU crew

      // ---------------------------------------------------------------- world
      waterSea(s, { y: -3.2 });
      const maxSide = Math.max(teams[0].length, teams[1].length, 2);
      const cliffW = FRONT - PIT + maxSide * GAP + 3;
      for (const side of [-1, 1]) {
        const c = island(s, { shape: 'box', size: [cliffW, 7], depth: 5, top: 0x63bd45, side: 0x8a5a3b });
        c.position.set(side * (PIT + cliffW / 2), 0, 0);
      }
      // mud pit between the cliffs
      const mudMat = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.35, metalness: 0.0 });
      const mud = new THREE.Mesh(new THREE.BoxGeometry(PIT * 2 + 0.2, 0.4, 7), mudMat);
      mud.position.set(0, -1.6, 0);
      mud.receiveShadow = true;
      s.scene.add(mud);
      const mudWalls = new THREE.Mesh(new THREE.BoxGeometry(PIT * 2 + 0.2, 4, 7.2), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 }));
      mudWalls.position.set(0, -3.8, 0);
      s.scene.add(mudWalls);
      const bubbles = [];
      const bubbleGeo = new THREE.SphereGeometry(0.16, 10, 8);
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(bubbleGeo, mudMat);
        b.position.set((Math.random() - 0.5) * PIT * 1.6, -1.4, (Math.random() - 0.5) * 5);
        b.userData.t = Math.random() * 3;
        s.scene.add(b);
        bubbles.push(b);
      }
      // white lines at the cliff edges
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (const side of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 6.6), lineMat);
        l.position.set(side * (PIT + 0.15), 0.01, 0);
        s.scene.add(l);
      }
      const [flagR, flagB] = await Promise.all([
        propFactory(s, 'props/minigame/flag-red.glb', { height: 2.6 }),
        propFactory(s, 'props/minigame/flag-blue.glb', { height: 2.6 }),
        scatter(s, [
          { path: 'nature/tree-1-a.glb', count: 4, height: 4.2, inner: 0, outer: 1 },
        ], { seed: 4 }).then((g) => { g.children.forEach((o, i) => o.position.set((i % 2 ? 1 : -1) * (PIT + cliffW - 1.4), 0, -2.6 + (i > 1 ? 0.6 : -0.4))); }),
        clouds(s, { count: 7, radius: 45, y: 9 }),
      ]);
      const fA = flagR(); fA.position.set(-(PIT + cliffW - 0.9), 0, 1.8); s.scene.add(fA);
      const fB = flagB(); fB.position.set(PIT + cliffW - 0.9, 0, 1.8); s.scene.add(fB);
      // tint the red flag orange so it matches the team colour
      fA.traverse((o) => { if (o.isMesh && /red/i.test(o.material?.name || '')) { o.material = o.material.clone(); o.material.color.set(TEAM_COLORS[0].hex); } });

      // rope + centre ribbon
      const ROPE_Y = 0.95;
      const ropeLen = (FRONT + maxSide * GAP + 1.2) * 2;
      const rope = new THREE.Group();
      const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, ropeLen, 10), new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 0.9 }));
      ropeMesh.rotation.z = Math.PI / 2;
      ropeMesh.castShadow = true;
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: 0xff3355, roughness: 0.5 }));
      ribbon.position.y = -0.35;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), ribbon.material);
      rope.add(ropeMesh, ribbon, knot);
      rope.position.y = ROPE_Y;
      s.scene.add(rope);

      // ---------------------------------------------------------------- characters
      const chars = await spawnCharacters(s, { height: 1.55 });
      const teamOf = new Map();
      teams.forEach((t, ti) => t.forEach((id, k) => {
        teamOf.set(id, ti);
        const c = chars.get(id);
        c.side = ti === 0 ? -1 : 1;
        c.baseX = c.side * (FRONT + k * GAP);
        c.baseZ = (k % 2 ? 0.35 : -0.35);
        c.pos.set(c.baseX, 0, c.baseZ);
        c.face(-c.side, 0);
        c.yaw = c.targetYaw;
        c.pulls = 0;
        c.lean = 0;
        c.inner = c.model;
      }));
      // CPU crew: shadowy robots so a lone player still has someone to beat
      const cpu = [];
      if (cpuTeam > 0) {
        for (let k = 0; k < 2; k++) {
          const m = await loadModel(env.sharedAsset('characters/robot/robot-expressive.glb'));
          const c = new Char(s, { id: `cpu${k}`, name: k ? '' : 'CPU', color: '#5b6378', colorHex: 0x5b6378 }, m, { height: 1.6, label: !k });
          c.side = 1;
          c.baseX = FRONT + k * GAP;
          c.baseZ = k % 2 ? 0.35 : -0.35;
          c.pos.set(c.baseX, 0, c.baseZ);
          c.face(-1, 0); c.yaw = c.targetYaw;
          c.lean = 0;
          c.inner = c.model;
          cpu.push(c);
        }
        s.onFrame((dt) => cpu.forEach((c) => c.update(dt)));
      }
      const all = [...chars.values(), ...cpu];
      s.cam.set(new THREE.Vector3(0, 0, 0.6), Math.max(11.5, (FRONT + maxSide * GAP) * 1.75));
      s.cam.snap();

      // ---------------------------------------------------------------- tug meter (DOM)
      const meter = document.createElement('div');
      meter.style.cssText = 'position:absolute;top:11vh;left:50%;transform:translateX(-50%);width:min(64vw,880px);z-index:21;pointer-events:none;font-family:Figtree,system-ui,sans-serif;color:#fff';
      const teamLine = (ti) => (teams[ti].length ? teams[ti].map((id) => escapeHtml(s.byId.get(id).name)).join(', ') : 'CPU crew');
      meter.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:3vmin;text-shadow:0 .3vmin 0 #0006;margin-bottom:.8vmin">
          <span style="color:${TEAM_COLORS[0].css}">${TEAM_COLORS[0].name}</span><span style="color:${TEAM_COLORS[1].css}">${TEAM_COLORS[1].name}</span></div>
        <div style="position:relative;height:3.4vmin;border-radius:999px;overflow:hidden;background:#0005;border:.45vmin solid #fff;box-shadow:0 .8vmin 0 #0004">
          <div style="position:absolute;inset:0 50% 0 0;background:${TEAM_COLORS[0].css}"></div>
          <div style="position:absolute;inset:0 0 0 50%;background:${TEAM_COLORS[1].css}"></div>
          <div class="tr-knob" style="position:absolute;top:-.2vmin;bottom:-.2vmin;width:1.4vmin;margin-left:-.7vmin;left:50%;background:#fff;border-radius:.6vmin;box-shadow:0 0 0 .4vmin #ff3355"></div></div>
        <div style="display:flex;justify-content:space-between;gap:4vmin;font-weight:600;font-size:2.2vmin;margin-top:.8vmin;text-shadow:0 .3vmin .6vmin #000a">
          <span style="max-width:45%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${teamLine(0)}</span><span style="max-width:45%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:right">${teamLine(1)}</span></div>`;
      s.root.appendChild(meter);
      const knob = meter.querySelector('.tr-knob');
      const heaveEl = document.createElement('div');
      heaveEl.style.cssText = 'position:absolute;left:50%;top:34vh;transform:translate(-50%,-50%);z-index:22;pointer-events:none;font-family:Figtree,system-ui,sans-serif;font-weight:700;font-size:15vmin;color:#ffd23f;-webkit-text-stroke:.6vmin #6b2a00;paint-order:stroke fill;text-shadow:0 1.2vmin 0 #6b2a00;opacity:0;transition:opacity .12s';
      heaveEl.textContent = 'HEAVE!';
      s.root.appendChild(heaveEl);

      // ---------------------------------------------------------------- simulation
      let phase = 'intro';
      let ropeX = 0; // + = towards team 1 (right)
      const power = [0, 0]; // smoothed pulls/second per member
      const burst = [0, 0];
      let heave = false;
      let heaveT = 0;
      let nextHeave = 4 + Math.random() * 2;
      let winner = -1;
      let cpuAcc = 0;
      let playT = 0;

      function pull(ti, amount) { burst[ti] += amount; }

      s.onFrame((dt, time) => {
        bubbles.forEach((b) => {
          b.userData.t += dt;
          const k = (b.userData.t % 2.4) / 2.4;
          b.scale.setScalar(k < 0.8 ? k * 1.2 : (1 - k) * 4);
          if (k < dt / 2.4) b.position.set((Math.random() - 0.5) * PIT * 1.6, -1.4, (Math.random() - 0.5) * 5);
        });
        if (phase === 'play') {
          playT += dt;
          // HEAVE windows
          if (!heave && playT > nextHeave) {
            heave = true; heaveT = 1.3;
            heaveEl.style.opacity = 1;
            sfx.play('go');
            s.shake(0.15);
            for (const id of ids) { s.status(id, '<b>HEAVE!</b> Mash now!'); s.vibrate(id, 80); }
          }
          if (heave) {
            heaveT -= dt;
            heaveEl.style.transform = `translate(-50%,-50%) scale(${1 + Math.sin(time * 30) * 0.04})`;
            if (heaveT <= 0) {
              heave = false;
              heaveEl.style.opacity = 0;
              nextHeave = playT + 3.2 + Math.random() * 2.6;
              for (const id of ids) s.status(id, 'Mash <b>A</b> to pull!');
            }
          }
          const mult = heave ? 3 : 1;
          for (const id of ids) {
            const c = chars.get(id);
            if (s.input(id).pressed('a')) {
              c.pulls += 1;
              pull(teamOf.get(id), mult / Math.max(1, teams[teamOf.get(id)].length));
              c.lean = Math.min(1, c.lean + 0.35);
              c.squash(0.1);
              s.hud.setScore(id, c.pulls, { bump: false });
              if (heave) sfx.play('tick');
            }
          }
          if (cpuTeam > 0) {
            // ~6.5 pulls/s with a little HEAVE timing
            cpuAcc += dt * (heave ? 7 : 6.2);
            while (cpuAcc > 1) {
              cpuAcc -= 1;
              pull(1, heave && Math.random() < 0.75 ? 3 : 1);
              cpu.forEach((c) => { c.lean = Math.min(1, c.lean + 0.3); });
            }
          }
          // smoothed pull power (pulls per second per member)
          for (let ti = 0; ti < 2; ti++) {
            const k = 1 - Math.exp(-dt / 0.45);
            power[ti] += (burst[ti] / Math.max(dt, 1e-3) - power[ti]) * k;
            burst[ti] = 0;
          }
          ropeX += (power[1] - power[0]) * 0.085 * dt;
          if (Math.abs(ropeX) >= PIT) {
            winner = ropeX > 0 ? 1 : 0;
            ropeX = Math.sign(ropeX) * PIT;
          }
        }
        // rope + people follow the rope offset
        rope.position.x = ropeX;
        ribbon.rotation.z = Math.sin(time * 6) * 0.12;
        knob.style.left = `${50 + (ropeX / PIT) * 50}%`;
        for (const c of all) {
          if (c.splash) continue;
          c.lean *= Math.exp(-3 * dt);
          const tension = phase === 'play' ? 0.35 + c.lean * 0.4 : 0.15;
          if (c.inner) c.inner.rotation.x = -tension * 0.7;
          if (phase === 'play' || phase === 'intro') {
            const tx = c.baseX + ropeX;
            const moving = tx - c.pos.x;
            c.pos.x = tx;
            c.pos.z = c.baseZ;
            if (phase === 'play') {
              if (c.loco !== 'walk') c.walkA = c.play('walk', { timeScale: 0.7 });
              if (c.walkA) c.walkA.timeScale = 0.5 + Math.min(1.6, Math.abs(moving) / Math.max(dt, 1e-3)) + c.lean * 0.8;
            }
          }
        }
      });

      await s.intro();
      if (s.aborted) return {};
      phase = 'play';
      for (const id of ids) s.status(id, 'Mash <b>A</b> to pull!');
      await s.play(this.duration, { until: () => winner >= 0 });
      phase = 'end';
      heaveEl.style.opacity = 0;
      if (s.aborted) return {};
      if (winner < 0) winner = Math.abs(ropeX) < 0.05 ? -1 : ropeX > 0 ? 1 : 0;
      // losers get dragged into the mud
      if (winner >= 0) {
        const losers = all.filter((c) => (c.side > 0 ? 1 : 0) !== winner);
        sfx.play('whoosh');
        losers.forEach((c, k) => {
          c.splash = true;
          if (c.inner) c.inner.rotation.x = 0.4;
          c.play('hit', { loop: false });
          const from = c.pos.clone();
          const to = new THREE.Vector3(-c.side * (0.6 + Math.random() * 0.8), -1.4, c.baseZ + (Math.random() - 0.5));
          let t = 0;
          const off = s.onFrame((dt) => {
            t += dt / (0.7 + k * 0.08);
            const e = Math.min(1, t);
            c.pos.lerpVectors(from, to, e);
            c.pos.y = from.y + (to.y - from.y) * e + Math.sin(e * Math.PI) * 1.2;
            if (e >= 1) {
              off();
              s.fx.burst(new THREE.Vector3(c.pos.x, -1.3, c.pos.z), { color: [0x6b4426, 0x8a5a32, 0x4a2c16], count: 18, speed: 4, up: 6, size: 0.22 });
              s.fx.ring(new THREE.Vector3(c.pos.x, -1.38, c.pos.z), 0x8a5a32, 2);
              sfx.play('explosion');
              s.shake(0.3);
              c.die();
              c.pos.y = -1.6;
            }
          });
          if (!String(c.id).startsWith('cpu')) { s.vibrate(c.id, 250); s.status(c.id, 'Splat! Into the mud…'); }
        });
        rope.visible = true;
        for (const id of teams[winner]) s.status(id, 'Your team won the tug!');
      }
      await s.wait(1200);
      const scores = {};
      for (const id of ids) scores[id] = teamOf.get(id) === winner ? 100 : winner < 0 ? 50 : 0; // whole team shares the result
      const winners = winner >= 0 ? teams[winner] : [];
      await s.finish(winners, { chars, text: winner < 0 ? 'DRAW!' : 'FINISH!' });
      return scores;
    } finally {
      s.dispose();
    }
  },
};
