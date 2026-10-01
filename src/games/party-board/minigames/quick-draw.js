// Quick Draw: a dusty desert showdown. Wait for the big "!" then press A to fling your snowball at your target.
// Fastest wins the round. Pressing early (or on a fake-out) is a FAULT. Best of 3.
import { createSession, THREE, sfx, rand } from './_shared-core.js';
import { spawnCharacters } from './_shared-chars.js';
import { propFactory, scatter, groundTexture } from './_shared-env.js';

const ROUNDS = 3;

export default {
  id: 'quick-draw',
  name: 'Quick Draw',
  instructions: 'Wait for the big <b>!</b>, then press <b>A</b> as fast as you can. Press too early, or on a fake-out, and you FAULT. Best of 3!',
  mode: 'ffa',
  minPlayers: 2,
  controls: { stick: 'none', buttons: [{ id: 'a', label: 'FIRE!' }], hint: 'Wait for <b>!</b> then press <b>A</b>' },
  duration: 45,

  async run(env) {
    const s = await createSession(env, {
      title: this.name,
      instructions: this.instructions,
      background: 0xf3b27a,
      sky: [0x5a7fd6, 0xffb36b],
      fog: { near: 30, far: 80 },
      hud: { scoreLabel: 'wins' },
      camera: { pitch: 18, yaw: 0, dist: 14, lookY: 1.2 },
    });
    try {
      s.sun.color.set(0xfff0e0);
      s.sun.position.set(-14, 16, 6);
      const n = s.players.length;
      const gap = 2.3;
      const width = n * gap;
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: groundTexture(0xe3b77a, 60, { variance: 0.08 }), roughness: 1 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      s.scene.add(ground);
      await scatter(s, [
        { path: 'nature/k-cactus-tall.glb', count: 7, height: 3.2 },
        { path: 'nature/k-cactus-short.glb', count: 7, height: 2 },
        { path: 'props/minigame/tree-desert.glb', count: 5, height: 3 },
        { path: 'nature/rock-1-j.glb', count: 4, size: 4 },
        { path: 'nature/q-rock-2.glb', count: 5, size: 2.5 },
      ], { inner: Math.max(10, width / 2 + 4), outer: 30, seed: 5, avoid: (p) => p.z > -4 && Math.abs(p.x) < width / 2 + 6 });
      // wooden fence behind the targets
      const fenceF = await propFactory(s, 'nature/k-fence-planks.glb', { size: 2 });
      for (let x = -width / 2 - 3; x <= width / 2 + 3; x += 2) { const f = fenceF(); f.position.set(x, 0, -9.5); s.scene.add(f); }
      const targetF = await propFactory(s, 'props/minigame/target-stand.glb', { height: 1.9 });
      const ballF = await propFactory(s, 'props/cannonball.glb', { size: 0.35, center: true });
      const barrelF = await propFactory(s, 'platformer/barrel.glb', { height: 1 });
      [[-width / 2 - 2.2, -1], [width / 2 + 2.2, -0.5], [width / 2 + 3, -2.2]].forEach(([x, z]) => { const b = barrelF(); b.position.set(x, 0, z); s.scene.add(b); });

      const chars = await spawnCharacters(s, { height: 1.6 });
      const list = [...chars.values()];
      const rig = new Map();
      list.forEach((c, i) => {
        const x = (i - (n - 1) / 2) * gap;
        c.pos.set(x, 0, 1.5);
        c.face(0, -1); c.yaw = c.targetYaw;
        const tg = targetF();
        tg.position.set(x, 0, -7.5);
        s.scene.add(tg);
        c.wins = 0;
        c.total = 0;
        rig.set(c.id, { tg, ball: null, fault: false, time: null });
      });
      s.cam.set(new THREE.Vector3(0, 0, -1.5), Math.max(14, width * 1.1 + 4));
      s.cam.snap();

      // big signal overlay
      const sig = document.createElement('div');
      sig.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:22;font-family:var(--font)';
      s.root.appendChild(sig);
      function signal(html, color = '#fff') {
        sig.innerHTML = html ? `<span style="font-size:30vmin;font-weight:700;color:${color};-webkit-text-stroke:1vmin #0007;text-shadow:0 2vmin 0 #0005;animation:pbm-slam .35s cubic-bezier(.2,1.7,.4,1)">${html}</span>` : '';
      }

      const flights = [];
      function fire(c, win) {
        const r = rig.get(c.id);
        c.action('punch', 0.5, 2);
        sfx.play('shoot');
        const b = ballF();
        b.position.copy(c.pos).add(new THREE.Vector3(0.3, 1.3, -0.4));
        s.scene.add(b);
        flights.push({ b, from: b.position.clone(), to: r.tg.position.clone().add(new THREE.Vector3(0, 1.25, 0.2)), t: 0, c, win });
      }
      s.onFrame((dt) => {
        for (const f of [...flights]) {
          f.t += dt * 2.6;
          const k = Math.min(1, f.t);
          f.b.position.lerpVectors(f.from, f.to, k);
          f.b.position.y += Math.sin(k * Math.PI) * 1.2;
          if (k >= 1) {
            s.scene.remove(f.b);
            flights.splice(flights.indexOf(f), 1);
            const tg = rig.get(f.c.id).tg;
            s.fx.burst(f.to, { color: [0xffffff, 0xff4d4d], count: f.win ? 26 : 10, speed: f.win ? 6 : 3, up: 3, size: 0.15 });
            tg.rotation.x = -0.5;
            if (f.win) { s.fx.confetti(f.to, 40); s.shake(0.35); sfx.play('explosion'); }
            else sfx.play('hit');
          }
        }
        for (const r of rig.values()) r.tg.rotation.x *= Math.exp(-5 * dt);
      });

      await s.intro();
      if (s.aborted) return {};
      for (let round = 1; round <= ROUNDS && !s.aborted; round++) {
        list.forEach((c) => { const r = rig.get(c.id); r.fault = false; r.time = null; s.hud.setScore(c.id, c.wins, { extra: '', bump: false }); });
        s.hud.big(`Round ${round}`, 1000);
        await s.wait(1300);
        if (s.aborted) break;
        signal('Ready…', '#ffe7b0');
        list.forEach((c) => { s.status(c.id, '🤠 Steady… wait for <b>!</b>'); c.play('idle'); });
        // drain stale presses
        list.forEach((c) => s.input(c.id).pressed('a'));
        const wait = rand(1.8, 4.2);
        const fakeAt = round > 1 && Math.random() < 0.7 ? rand(0.8, wait - 0.6) : -1;
        let el = 0;
        let fakeShown = false;
        let fired = false;
        let sigT = 0;
        let winnerOfRound = null;
        await new Promise((res) => {
          const off = s.onFrame((dt) => {
            el += dt;
            if (!fired) {
              if (fakeAt > 0 && !fakeShown && el >= fakeAt) { fakeShown = true; signal(Math.random() < 0.5 ? '?' : '¡', '#9ad0ff'); sfx.play('blip'); s.after(450, () => { if (!fired) signal('Ready…', '#ffe7b0'); }); }
              if (el >= wait) { fired = true; sigT = performance.now(); signal('!', '#ff3b3b'); sfx.play('go'); s.shake(0.2); list.forEach((c) => s.status(c.id, '🔥 FIRE! Press <b>A</b>!')); }
            }
            for (const c of list) {
              const r = rig.get(c.id);
              if (r.fault || r.time !== null) continue;
              if (s.input(c.id).pressed('a')) {
                if (!fired) {
                  r.fault = true;
                  c.action('no', 1.2);
                  c.flash(0xff2020, 0.4);
                  sfx.play('wrong');
                  s.vibrate(c.id, 300);
                  s.pop(c.pos.clone().setY(c.height + 0.6), 'FAULT!', '#ff6a6a', { size: 1.2 });
                  s.hud.setScore(c.id, c.wins, { extra: 'fault', bump: false });
                  s.status(c.id, '❌ Fault! Too early.');
                } else {
                  r.time = (performance.now() - sigT) / 1000;
                  const first = !winnerOfRound;
                  if (first) winnerOfRound = c;
                  fire(c, first);
                  s.pop(c.pos.clone().setY(c.height + 0.6), `${r.time.toFixed(3)}s`, first ? '#ffe14d' : '#fff', { size: first ? 1.3 : 0.9 });
                  s.hud.setScore(c.id, c.wins, { extra: `${r.time.toFixed(2)}s`, bump: false });
                  s.vibrate(c.id, 50);
                }
              }
            }
            const allDone = list.every((c) => { const r = rig.get(c.id); return r.fault || r.time !== null; });
            if ((fired && (allDone || performance.now() - sigT > 2000)) || (!fired && allDone) || s.aborted) { off(); res(); }
          });
        });
        signal('');
        if (s.aborted) break;
        if (winnerOfRound) {
          winnerOfRound.wins += 1;
          s.hud.setScore(winnerOfRound.id, winnerOfRound.wins, { extra: '⚡' });
          s.hud.note(`<span style="color:${winnerOfRound.player.color}">${winnerOfRound.player.name}</span> was fastest! (${rig.get(winnerOfRound.id).time.toFixed(3)}s)`, 1800);
          s.status(winnerOfRound.id, '⚡ Fastest! +1 win');
          sfx.play('correct');
          s.after(400, () => winnerOfRound.action('yes', 1.2));
        } else {
          s.hud.note('Nobody fired in time!', 1500);
        }
        for (const c of list) { const r = rig.get(c.id); c.total += r.time ?? 3; }
        await s.wait(2000);
      }
      if (s.aborted) return {};
      const scores = Object.fromEntries(list.map((c) => [c.id, Math.round((c.wins * 100 + Math.max(0, 30 - c.total)) * 10) / 10]));
      const best = Math.max(...list.map((c) => c.wins));
      let winners = list.filter((c) => c.wins === best && best > 0);
      if (winners.length > 1) { const bt = Math.min(...winners.map((c) => c.total)); winners = winners.filter((c) => c.total === bt); }
      await s.finish(winners.map((c) => c.id), { chars });
      return scores;
    } finally {
      s.dispose();
    }
  },
};

