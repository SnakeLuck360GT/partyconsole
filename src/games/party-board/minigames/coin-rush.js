// Coin Rush: coins rain onto a grassy island. Grab as many as you can; stars are worth 3.
// Bombs fall too: their blast stuns you and knocks coins out of your pockets.
import { createSession, THREE, sfx } from './_shared-core.js';
import { spawnCharacters, separate } from './_shared-chars.js';
import { island, waterSea, scatter, clouds, propFactory, blobShadow, goldify } from './_shared-env.js';

const R = 8.5;

export default {
  id: 'coin-rush',
  name: 'Coin Rush',
  instructions: 'Coins are raining! Run to grab them. Stars are worth 3. Dodge the bombs: they stun you and knock coins out of your pockets.',
  mode: 'ffa',
  minPlayers: 1,
  controls: { stick: 'analog', buttons: [{ id: 'a', label: 'DASH' }], hint: 'Move · <b>A</b> to dash' },
  duration: 40,

  async run(env) {
    const s = await createSession(env, {
      title: this.name,
      instructions: this.instructions,
      background: 0x8fd3ff,
      sky: [0x3b8fe8, 0xcdeeff],
      fog: { near: 45, far: 120 },
      hud: { scoreLabel: '' },
      camera: { pitch: 56, dist: 19 },
    });
    try {
      waterSea(s, { y: -1.2 });
      island(s, { radius: R, depth: 3.5, top: 0x5cb53f, side: 0x8a5a3b, rim: 0x4b9a32 });
      const [coinF, starF, bombF] = await Promise.all([
        propFactory(s, 'props/coin.glb', { size: 0.9, center: true }),
        propFactory(s, 'props/star.glb', { size: 1.1, center: true }),
        propFactory(s, 'props/bomb.glb', { size: 1.1, center: true }),
        scatter(s, [
          { path: 'nature/tree-1-a.glb', count: 7, height: 4.5, inner: R - 0.2, outer: R - 0.05 },
          { path: 'nature/bush-1-d.glb', count: 8, size: 1.6, inner: R - 0.6, outer: R - 0.3 },
          { path: 'nature/k-flower-red-a.glb', count: 10, height: 0.5, inner: 3, outer: R - 1 },
          { path: 'nature/k-flower-yellow-a.glb', count: 10, height: 0.4, inner: 3, outer: R - 1 },
          { path: 'nature/k-tree-palm-tall.glb', count: 6, height: 6, inner: 14, outer: 22, y: -1.2 },
        ], { seed: 3, avoid: (p) => p.length() < R + 1 && p.z > -3.5 && Math.abs(p.x) < R }),
        clouds(s, { count: 7, radius: 45, y: 12 }),
      ]);
      const coinT = goldify(coinF());
      const starT = goldify(starF(), { color: 0xffe14d });
      const chars = await spawnCharacters(s, { height: 1.8 });
      const list = [...chars.values()];
      list.forEach((c, i) => {
        const a = (i / list.length) * Math.PI * 2;
        c.pos.set(Math.sin(a) * 3.5, 0, Math.cos(a) * 3.5);
        c.face(c.pos.x, c.pos.z);
        c.yaw = c.targetYaw;
        c.coins = 0;
        c.dashT = 0;
        c.dashCd = 0;
        c.invuln = 0;
      });
      s.cam.set(new THREE.Vector3(0, 0, 0.5), 19);
      s.cam.snap();

      const items = [];
      const tmp = new THREE.Vector3();
      function spawn(kind, x, z, { y = 13 + Math.random() * 3, vx = 0, vz = 0, vy = 0, delay = 0 } = {}) {
        const obj = kind === 'coin' ? coinT.clone(true) : kind === 'star' ? starT.clone(true) : bombF();
        obj.position.set(x, y, z);
        const sh = blobShadow(kind === 'bomb' ? 1.6 : 1.1, 0.4);
        sh.position.set(x, 0.03, z);
        s.scene.add(obj, sh);
        const it = { kind, obj, sh, vx, vz, vy, state: 'fall', t: 0, delay, fuse: 1.3 };
        items.push(it);
        return it;
      }
      function remove(it) {
        s.scene.remove(it.obj, it.sh);
        items.splice(items.indexOf(it), 1);
      }
      function randomSpot(margin = 1) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * (R - margin);
        return [Math.cos(a) * r, Math.sin(a) * r];
      }
      function collect(c, it) {
        const v = it.kind === 'star' ? 3 : 1;
        c.coins += v;
        s.hud.setScore(c.id, c.coins);
        sfx.play(it.kind === 'star' ? 'powerup' : 'coin');
        s.fx.burst(it.obj.position, { color: [0xffd84a, 0xfff2a8], count: v > 1 ? 16 : 8, speed: 3, up: 3, glow: true, size: 0.12 });
        s.pop(tmp.copy(c.pos).setY(c.height + 0.6), `+${v}`, v > 1 ? '#ffe14d' : '#fff3a0', { size: v > 1 ? 1.3 : 1 });
        c.squash(-0.15);
        remove(it);
      }
      function explode(it) {
        const p = it.obj.position.clone().setY(0.2);
        s.fx.burst(p, { color: [0xff8a00, 0xffe070, 0xff3000], count: 30, speed: 7, up: 6, glow: true, size: 0.22 });
        s.fx.burst(p, { color: [0x555555, 0x333333, 0x777777], count: 14, speed: 3, up: 4, size: 0.35, gravity: -1, drag: 2.5, life: 1.1 });
        s.fx.ring(p, 0xffa040, 3.2);
        s.shake(0.6);
        sfx.play('explosion');
        remove(it);
        for (const c of list) {
          const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
          if (d < 2.6 && c.invuln <= 0) {
            c.stun(1.4);
            c.invuln = 2.2;
            tmp.set(c.pos.x - p.x, 0, c.pos.z - p.z).normalize();
            c.vel.set(tmp.x * 8, 0, tmp.z * 8);
            c.vy = 6; c.grounded = false;
            s.vibrate(c.id, 250);
            const lose = Math.min(c.coins, 3);
            c.coins -= lose;
            s.hud.setScore(c.id, c.coins);
            if (lose) s.pop(tmp.copy(c.pos).setY(c.height + 0.6), `-${lose}`, '#ff6a6a', { size: 1.2 });
            for (let k = 0; k < lose; k++) {
              const a = Math.random() * Math.PI * 2;
              const it2 = spawn('coin', c.pos.x, c.pos.z, { y: 1.2, vx: Math.cos(a) * 4, vz: Math.sin(a) * 4, vy: 7 });
              it2.nopick = 0.5;
            }
          }
        }
      }

      let phase = 'intro';
      let spawnAcc = 0;
      let frenzy = false;
      s.onFrame((dt) => {
        // items
        for (const it of [...items]) {
          it.t += dt;
          if (it.nopick) it.nopick = Math.max(0, it.nopick - dt);
          if (it.state === 'fall') {
            it.vy -= 22 * dt;
            it.obj.position.x += it.vx * dt;
            it.obj.position.z += it.vz * dt;
            it.obj.position.y += it.vy * dt;
            const r = Math.hypot(it.obj.position.x, it.obj.position.z);
            if (r > R - 0.5) { it.vx *= -0.5; it.vz *= -0.5; it.obj.position.x *= (R - 0.5) / r; it.obj.position.z *= (R - 0.5) / r; }
            const rest = it.kind === 'bomb' ? 0.55 : 0.55;
            if (it.obj.position.y <= rest) {
              it.obj.position.y = rest;
              if (Math.abs(it.vy) > 3) { it.vy *= -0.35; it.vx *= 0.6; it.vz *= 0.6; if (it.kind !== 'bomb') s.fx.dust(it.obj.position, 2, 0xe0f0c0); }
              else { it.state = 'ground'; it.vy = 0; if (it.kind === 'bomb') sfx.play('tick'); }
            }
          }
          it.obj.rotation.y += dt * (it.kind === 'bomb' ? 0.5 : 3);
          if (it.state === 'ground' && it.kind !== 'bomb') it.obj.position.y = 0.55 + Math.sin(it.t * 4) * 0.08;
          const h = it.obj.position.y;
          it.sh.position.set(it.obj.position.x, 0.03, it.obj.position.z);
          it.sh.scale.setScalar(THREE.MathUtils.clamp(1.2 - h / 14, 0.3, 1.1));
          it.sh.material.opacity = THREE.MathUtils.clamp(0.5 - h / 30, 0.1, 0.45);
          if (it.kind === 'bomb') {
            if (it.state === 'ground') {
              it.fuse -= dt;
              const blink = Math.sin(it.t * (10 + (1.3 - it.fuse) * 25)) > 0;
              it.obj.scale.setScalar(1 + (blink ? 0.12 : 0) + (1.3 - it.fuse) * 0.2);
              if (it.fuse <= 0) explode(it);
            }
            continue;
          }
          if (it.kind !== 'bomb' && it.state === 'ground' && it.t > 12) { remove(it); continue; }
          if (phase !== 'play' || it.nopick) continue;
          if (h > 2.2) continue;
          for (const c of list) {
            if (c.stunT > 0) continue;
            if (Math.hypot(c.pos.x - it.obj.position.x, c.pos.z - it.obj.position.z) < 1.0) { collect(c, it); break; }
          }
        }
        // players
        for (const c of list) {
          c.invuln = Math.max(0, c.invuln - dt);
          c.dashCd = Math.max(0, c.dashCd - dt);
          if (phase === 'play') {
            const inp = s.input(c.id);
            if (c.stunT > 0) {
              c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt; c.vel.multiplyScalar(Math.exp(-4 * dt));
            } else if (c.dashT > 0) {
              c.dashT -= dt;
              c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt;
              if (Math.random() < 0.5) s.fx.dust(c.pos, 1, c.player.colorHex);
            } else {
              c.drive(inp.x, inp.y, dt, { speed: 6.2, accel: 14 });
              if (inp.pressed('a') && c.dashCd <= 0) {
                const fx = Math.sin(c.targetYaw); const fz = Math.cos(c.targetYaw);
                c.vel.set(fx * 15, 0, fz * 15);
                c.dashT = 0.18;
                c.dashCd = 0.9;
                c.squash(0.2);
                c.action('punch', 0.3, 1.6);
                sfx.play('whoosh');
              }
            }
          } else if (c.alive && !c.cheering) c.drive(0, 0, dt);
          if (!c.cheering) c.integrate(dt);
          const r = Math.hypot(c.pos.x, c.pos.z);
          if (r > R - 0.5) { c.pos.x *= (R - 0.5) / r; c.pos.z *= (R - 0.5) / r; }
        }
        separate(list, 0.45);
        if (phase !== 'play') return;
        // spawning
        const rate = (frenzy ? 5.5 : 2.6 + s.elapsed * 0.04) * (0.6 + list.length * 0.12);
        spawnAcc += dt * rate;
        while (spawnAcc > 1) {
          spawnAcc -= 1;
          const [x, z] = randomSpot(1.2);
          const roll = Math.random();
          spawn(roll < 0.13 ? 'bomb' : roll < 0.2 ? 'star' : 'coin', x, z);
        }
      });

      await s.intro();
      if (s.aborted) return {};
      phase = 'play';
      list.forEach((c) => s.status(c.id, 'Grab the coins! <b>A</b> = dash'));
      // an opening shower
      for (let i = 0; i < 6 + list.length * 2; i++) { const [x, z] = randomSpot(1.5); spawn('coin', x, z, { y: 8 + Math.random() * 10 }); }
      const DUR = this.duration;
      s.after((DUR - 10) * 1000, () => { frenzy = true; s.hud.big('COIN FRENZY!', 1200); sfx.play('powerup'); });
      await s.play(DUR);
      phase = 'end';
      if (s.aborted) return {};
      const scores = Object.fromEntries(list.map((c) => [c.id, c.coins]));
      const best = Math.max(...list.map((c) => c.coins));
      const winners = list.filter((c) => c.coins === best && best > 0).map((c) => c.id);
      for (const c of list) { c.stunT = 0; c.vel.set(0, 0, 0); }
      await s.finish(winners, { chars });
      return scores;
    } finally {
      s.dispose();
    }
  },
};

