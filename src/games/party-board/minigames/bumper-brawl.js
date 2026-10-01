// Bumper Brawl: slippery ice floe made of hex tiles. Dash into rivals to knock them off; the floe crumbles
// from the outside in. Last one standing wins.
import { createSession, THREE, sfx } from './_shared-core.js';
import { spawnCharacters, separate } from './_shared-chars.js';
import { waterSea, scatter, snow } from './_shared-env.js';

const HEX = 1.0; // hex tile radius
const N = 5; // rings

export default {
  id: 'bumper-brawl',
  name: 'Bumper Brawl',
  instructions: 'Slide around the icy floe and press <b>A</b> to dash into rivals. Knock them into the sea! The ice crumbles from the edges.',
  mode: 'ffa',
  minPlayers: 2,
  controls: { stick: 'analog', buttons: [{ id: 'a', label: 'DASH' }], hint: 'Move · <b>A</b> to dash-bump' },
  duration: 50,

  async run(env) {
    const s = await createSession(env, {
      title: this.name,
      instructions: this.instructions,
      background: 0xbfdcf0,
      sky: [0x6aa9e0, 0xe8f4ff],
      fog: { near: 40, far: 110 },
      hud: { scoreLabel: 's', sort: false },
      camera: { pitch: 56, dist: 19 },
    });
    try {
      s.sun.intensity = 2.0;
      waterSea(s, { y: -1.4, deep: 0x0d3f6e, shallow: 0x2b84b8 });
      snow(s, { area: 50, count: 450 });
      // Hex ice tiles
      const geo = new THREE.CylinderGeometry(HEX * 0.97, HEX * 0.9, 0.7, 6);
      geo.translate(0, -0.35, 0);
      const mats = [
        new THREE.MeshStandardMaterial({ color: 0xc4e4fa, roughness: 0.25, metalness: 0.05, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: 0x9fcdf0, roughness: 0.2, metalness: 0.05, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: 0x86bce6, roughness: 0.2, metalness: 0.05, flatShading: true }),
      ];
      const warnMat = new THREE.MeshStandardMaterial({ color: 0xff7a6a, roughness: 0.4, emissive: 0x801000, emissiveIntensity: 0.6, flatShading: true });
      const tiles = [];
      for (let q = -N; q <= N; q++) {
        for (let r = -N; r <= N; r++) {
          const d = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
          if (d > N) continue;
          const x = HEX * Math.sqrt(3) * (q + r / 2);
          const z = HEX * 1.5 * r;
          const mat = mats[(((q - r) % 3) + 3) % 3];
          const m = new THREE.Mesh(geo, mat);
          m.position.set(x, 0, z);
          m.rotation.y = Math.PI / 6;
          m.receiveShadow = true;
          m.castShadow = true;
          s.scene.add(m);
          tiles.push({ m, x, z, d, mat, state: 'ok', vy: 0, t: 0 });
        }
      }
      const tileAt = (x, z) => {
        for (const t of tiles) {
          if (t.state === 'gone' || t.state === 'fall') continue;
          if ((x - t.x) ** 2 + (z - t.z) ** 2 < (HEX * 0.93) ** 2) return t;
        }
        return null;
      };

      const deco = await scatter(s, [
        { path: 'nature/rock-2-e.glb', count: 6, size: 6 },
        { path: 'nature/rock-1-j.glb', count: 5, size: 5 },
        { path: 'nature/tree-4-a.glb', count: 6, height: 7 },
      ], { inner: 16, outer: 30, y: -1.6, seed: 11, avoid: (p) => p.z > 4 && Math.abs(p.x) < 18 });
      // frost the icebergs and trees
      const iceTint = new THREE.Color(0xeaf6ff);
      const frosted = new Map();
      deco.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        if (!frosted.has(o.material)) { const m = o.material.clone(); m.color.lerp(iceTint, 0.6); frosted.set(o.material, m); }
        o.material = frosted.get(o.material);
      });

      const chars = await spawnCharacters(s, { height: 1.7 });
      const list = [...chars.values()];
      list.forEach((c, i) => {
        const a = (i / list.length) * Math.PI * 2;
        c.pos.set(Math.sin(a) * 4.2, 0, Math.cos(a) * 4.2);
        c.face(-c.pos.x, -c.pos.z);
        c.yaw = c.targetYaw;
        c.dashT = 0; c.dashCd = 0; c.out = false;
      });
      s.cam.set(new THREE.Vector3(0, 0, 0.5), 19);
      s.cam.snap();

      let phase = 'intro';
      const survival = new Map(list.map((c) => [c.id, 0]));
      const outOrder = [];
      let t = 0;

      function crumble(ring) {
        const ts = tiles.filter((x) => x.d === ring && x.state === 'ok');
        ts.forEach((x) => { x.state = 'warn'; x.t = 0; });
        sfx.play('blip');
        s.hud.note('⚠️ The ice is cracking!', 1600);
      }

      s.onFrame((dt) => {
        // tiles
        for (const x of tiles) {
          if (x.state === 'warn') {
            x.t += dt;
            x.m.material = Math.sin(x.t * (8 + x.t * 10)) > 0 ? warnMat : x.mat;
            x.m.position.y = Math.sin(x.t * 60) * 0.03;
            if (x.t > 2.2) { x.state = 'fall'; x.m.material = x.mat; s.fx.burst(new THREE.Vector3(x.x, 0.1, x.z), { color: [0xffffff, 0xcfe9ff], count: 4, speed: 2, up: 2, size: 0.2 }); }
          } else if (x.state === 'fall') {
            x.vy -= 18 * dt;
            x.m.position.y += x.vy * dt;
            x.m.rotation.x += dt * 1.2;
            if (x.m.position.y < -6) { x.state = 'gone'; x.m.visible = false; }
          }
        }
        if (phase === 'intro') return;
        if (phase === 'play') t += dt;
        for (const c of list) {
          if (c.out) {
            c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt;
            c.integrate(dt, { ground: () => null });
            if (c.pos.y < -1.3 && !c.splashed) {
              c.splashed = true;
              s.fx.burst(c.pos.clone().setY(-1.2), { color: [0xffffff, 0x9fd8ff], count: 20, speed: 3, up: 7, size: 0.2 });
              s.fx.ring(c.pos.clone().setY(-1.3), 0xffffff, 2.5);
              sfx.play('explosion');
            }
            if (c.pos.y < -4) c.root.visible = false;
            continue;
          }
          c.dashCd = Math.max(0, c.dashCd - dt);
          const inp = phase === 'play' ? s.input(c.id) : { x: 0, y: 0, pressed: () => false };
          if (c.dashT > 0) {
            c.dashT -= dt;
            c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt;
            if (Math.random() < 0.6) s.fx.burst(c.pos.clone().setY(0.1), { color: [0xffffff, 0xd8f0ff], count: 1, speed: 0.5, up: 1, size: 0.12, gravity: 2 });
          } else {
            c.drive(inp.x, inp.y, dt, { speed: 6, accel: 2.6 });
            if (inp.pressed('a') && c.dashCd <= 0 && c.stunT <= 0) {
              const fx = inp.x || inp.y ? inp.x : Math.sin(c.targetYaw);
              const fz = inp.x || inp.y ? inp.y : Math.cos(c.targetYaw);
              const m = Math.hypot(fx, fz) || 1;
              c.vel.set((fx / m) * 13, 0, (fz / m) * 13);
              c.face(fx, fz);
              c.dashT = 0.22; c.dashCd = 1.1;
              c.action('punch', 0.35, 1.8);
              c.squash(0.2);
              sfx.play('whoosh');
            }
          }
          // ground
          const tile = tileAt(c.pos.x, c.pos.z);
          c.integrate(dt, { ground: () => (tile ? 0 : null) });
          if (!tile && c.pos.y < -0.4 && phase === 'play') {
            c.out = true;
            c.die();
            outOrder.push(c.id);
            s.hud.setOut(c.id);
            s.vibrate(c.id, 300);
            s.status(c.id, '💦 Splash! You are out.');
            sfx.play('lose');
            s.pop(c.pos.clone().setY(1.5), 'SPLASH!', '#9fd8ff');
          }
        }
        const hits = separate(list.filter((c) => !c.out), 0.48, { bounce: 0.6 });
        for (const [a, b, rel, n] of hits) {
          if (rel < 3) continue;
          const atk = a.dashT > 0 && b.dashT <= 0 ? a : b.dashT > 0 && a.dashT <= 0 ? b : null;
          if (atk) {
            const vic = atk === a ? b : a;
            const dir = atk === a ? n : n.clone().negate();
            vic.vel.set(dir.x * 15, 0, dir.z * 15);
            vic.dashT = 0.25; // slides helplessly
            vic.stun(0.7);
            vic.dashT = 0.25;
            atk.vel.multiplyScalar(0.15);
            atk.dashT = 0;
            s.vibrate(vic.id, 120);
          }
          const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5).setY(1);
          s.fx.burst(mid, { color: [0xffffff, 0xffe066], count: 10, speed: 5, up: 3, glow: true, size: 0.12 });
          s.fx.ring(mid.setY(0.05), 0xffffff, 1.6, 0.3);
          s.shake(0.25 + Math.min(0.3, rel * 0.02));
          sfx.play('hit');
        }
        if (phase === 'play') {
          for (const c of list) if (!c.out) survival.set(c.id, t);
          for (const c of list) s.hud.setScore(c.id, Math.floor(survival.get(c.id)), { bump: false });
          const alive = list.filter((c) => !c.out).map((c) => c.pos);
          s.cam.frame(alive.length ? alive : [new THREE.Vector3()], { pad: 4, min: 14, max: 21 });
        }
      });

      await s.intro();
      if (s.aborted) return {};
      phase = 'play';
      list.forEach((c) => s.status(c.id, 'Bump them off! <b>A</b> = dash'));
      [12, 22, 32].forEach((sec, i) => s.after(sec * 1000, () => crumble(N - i)));
      const n0 = list.length;
      await s.play(this.duration, { until: () => { const a = list.filter((c) => !c.out).length; return n0 > 1 ? a <= 1 : a === 0; } });
      phase = 'end';
      if (s.aborted) return {};
      const alive = list.filter((c) => !c.out);
      const winners = alive.length ? alive.map((c) => c.id) : outOrder.slice(-1);
      for (const id of winners) {
        const c = chars.get(id);
        if (c.out) { c.out = false; c.root.visible = true; c.pos.set(0, 0, 0); c.vy = 0; c.grounded = true; }
        c.vel.set(0, 0, 0); c.dashT = 0;
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
