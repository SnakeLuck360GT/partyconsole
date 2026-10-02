// Paint Party: run around to paint the floor in your colour; press A to lob a paint bomb for a big splat.
// You're faster on your own paint. Whoever covers the most floor wins.
import { createSession, THREE, sfx } from './_shared-core.js';
import { spawnCharacters, separate } from './_shared-chars.js';
import { clouds, scatter, island } from './_shared-env.js';

const HALF = 8; // arena half size
const RES = 128; // paint grid resolution

export default {
  id: 'paint-party',
  name: 'Paint Party',
  instructions: 'Run around to paint the floor in your colour. Press <b>A</b> to throw a paint bomb! You\'re faster on your own paint. Most floor wins.',
  mode: 'ffa',
  minPlayers: 1,
  controls: { stick: 'analog', buttons: [{ id: 'a', label: 'SPLAT' }], hint: 'Move to paint · <b>A</b> paint bomb' },
  duration: 40,

  async run(env) {
    const s = await createSession(env, {
      title: this.name,
      instructions: this.instructions,
      background: 0xa8dcff,
      sky: [0x5aa6f0, 0xeaf7ff],
      hud: { scoreLabel: '%' },
      camera: { pitch: 60, dist: 20 },
    });
    try {
      const n = s.players.length;
      await clouds(s, { count: 10, radius: 40, y: -14, spread: 6 });
      const isl = island(s, { radius: HALF * 1.6, depth: 5, top: 0x6cc24a });
      isl.position.y = -0.31;
      await scatter(s, [
        { path: 'nature/tree-3-a.glb', count: 6, height: 4 },
        { path: 'nature/bush-1-d.glb', count: 8, size: 1.6 },
        { path: 'nature/k-flower-purple-a.glb', count: 10, height: 0.5 },
      ], { inner: HALF + 2.2, outer: HALF * 1.55, seed: 9, avoid: (p) => p.z > HALF - 1 && Math.abs(p.x) < HALF + 4, y: -0.31 });
      // paint canvas
      const data = new Uint8Array(RES * RES * 4);
      const owner = new Uint8Array(RES * RES); // 0 = none, i+1 = player i
      const counts = new Array(n + 1).fill(0);
      const base = (i, j) => (((i >> 3) + (j >> 3)) % 2 ? [236, 238, 246] : [222, 226, 238]);
      for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) { const k = (j * RES + i) * 4; const b = base(i, j); data[k] = b[0]; data[k + 1] = b[1]; data[k + 2] = b[2]; data[k + 3] = 255; }
      const tex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      const floor = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.3, HALF * 2), [null, null, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }), null, null, null].map((m) => m || new THREE.MeshStandardMaterial({ color: 0xbfc6d8, roughness: 0.6 })));
      floor.position.y = -0.15;
      floor.receiveShadow = true;
      s.scene.add(floor);
      // padded rails
      const railMat = new THREE.MeshStandardMaterial({ color: 0x2f3550, roughness: 0.5 });
      const padMats = [0xff5cc8, 0x3d8bff, 0xffcc00, 0x34d058].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
      for (let side = 0; side < 4; side++) {
        for (let k = 0; k < 8; k++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 / 8 - 0.06, 0.45, 0.35), k % 2 ? railMat : padMats[side]);
          const u = -HALF + (k + 0.5) * (HALF * 2 / 8);
          const pos = [[u, HALF + 0.18], [u, -HALF - 0.18], [HALF + 0.18, u], [-HALF - 0.18, u]][side];
          m.position.set(pos[0], 0.22, pos[1]);
          if (side >= 2) m.rotation.y = Math.PI / 2;
          m.castShadow = true;
          s.scene.add(m);
        }
      }

      const chars = await spawnCharacters(s, { height: 1.6 });
      const list = [...chars.values()];
      const rgb = list.map((c) => { const col = new THREE.Color(c.player.colorHex ?? c.player.color); return [Math.round(Math.pow(col.r, 1 / 2.2) * 255), Math.round(Math.pow(col.g, 1 / 2.2) * 255), Math.round(Math.pow(col.b, 1 / 2.2) * 255)]; });
      list.forEach((c, i) => {
        c.idx = i;
        const a = (i / list.length) * Math.PI * 2 + Math.PI / 4;
        c.pos.set(Math.sin(a) * HALF * 0.6, 0, Math.cos(a) * HALF * 0.6);
        c.face(-c.pos.x, -c.pos.z); c.yaw = c.targetYaw;
        c.cd = 0;
      });
      s.cam.set(new THREE.Vector3(0, 0, 0.8), 19.5);
      s.cam.snap();
      // tint the original colours exactly for paint (CSS colours → sRGB bytes)
      list.forEach((c, i) => { const col = new THREE.Color(); col.setStyle(c.player.color, THREE.SRGBColorSpace); rgb[i] = [Math.round(col.r * 255), Math.round(col.g * 255), Math.round(col.b * 255)]; });

      let dirty = false;
      const toCell = (x) => Math.floor(((x + HALF) / (HALF * 2)) * RES);
      const toRow = (z) => toCell(-z); // the box's top-face UVs run opposite to world z
      function paint(x, z, radius, pi) {
        const ci = toCell(x); const cj = toRow(z);
        const rc = Math.ceil((radius / (HALF * 2)) * RES);
        const [r, g, b] = rgb[pi];
        for (let j = cj - rc; j <= cj + rc; j++) {
          if (j < 0 || j >= RES) continue;
          for (let i = ci - rc; i <= ci + rc; i++) {
            if (i < 0 || i >= RES) continue;
            const d2 = (i - ci) ** 2 + (j - cj) ** 2;
            // wobbly splat edge
            const edge = rc * (0.85 + 0.15 * Math.sin(i * 1.7 + j * 2.3));
            if (d2 > edge * edge) continue;
            const idx = j * RES + i;
            if (owner[idx] === pi + 1) continue;
            counts[owner[idx]]--;
            owner[idx] = pi + 1;
            counts[pi + 1]++;
            const k = idx * 4;
            const shade = 1 - ((i * 7 + j * 13) % 5) * 0.025;
            data[k] = r * shade; data[k + 1] = g * shade; data[k + 2] = b * shade;
          }
        }
        dirty = true;
      }
      counts[0] = RES * RES;
      const ownerAt = (x, z) => { const i = toCell(x); const j = toRow(z); return i < 0 || j < 0 || i >= RES || j >= RES ? 0 : owner[j * RES + i]; };

      // paint bombs
      const bombGeo = new THREE.SphereGeometry(0.28, 14, 10);
      const bombs = [];
      function throwBomb(c) {
        const fx = Math.sin(c.targetYaw); const fz = Math.cos(c.targetYaw);
        const m = new THREE.Mesh(bombGeo, new THREE.MeshStandardMaterial({ color: c.player.colorHex, roughness: 0.2 }));
        m.position.copy(c.pos).setY(1.4);
        m.castShadow = true;
        s.scene.add(m);
        bombs.push({ m, c, vx: fx * 7.5, vz: fz * 7.5, vy: 6 });
        c.action('punch', 0.35, 2);
        sfx.play('shoot');
      }

      let phase = 'intro';
      let hudT = 0;
      s.onFrame((dt) => {
        for (const b of [...bombs]) {
          b.vy -= 20 * dt;
          b.m.position.x += b.vx * dt; b.m.position.z += b.vz * dt; b.m.position.y += b.vy * dt;
          b.m.position.x = THREE.MathUtils.clamp(b.m.position.x, -HALF + 0.3, HALF - 0.3);
          b.m.position.z = THREE.MathUtils.clamp(b.m.position.z, -HALF + 0.3, HALF - 0.3);
          if (b.m.position.y <= 0.15) {
            s.scene.remove(b.m);
            b.m.material.dispose();
            bombs.splice(bombs.indexOf(b), 1);
            paint(b.m.position.x, b.m.position.z, 2.3, b.c.idx);
            s.fx.burst(b.m.position.clone().setY(0.2), { color: [b.c.player.colorHex, 0xffffff], count: 18, speed: 5, up: 4, size: 0.18 });
            s.fx.ring(b.m.position, b.c.player.colorHex, 2.6);
            sfx.play('hit');
            s.shake(0.12);
          }
        }
        for (const c of list) {
          c.cd = Math.max(0, c.cd - dt);
          if (phase === 'play') {
            const inp = s.input(c.id);
            const own = ownerAt(c.pos.x, c.pos.z);
            const mult = own === c.idx + 1 ? 1.2 : own === 0 ? 1 : 0.8;
            c.drive(inp.x, inp.y, dt, { speed: 6 * mult, accel: 14 });
            if (inp.pressed('a') && c.cd <= 0) { throwBomb(c); c.cd = 2.2; s.status(c.id, 'Splat! (reloading…)'); s.after(2200, () => s.status(c.id, '<b>A</b> = paint bomb ready!')); }
            if (Math.hypot(c.vel.x, c.vel.z) > 0.4) paint(c.pos.x, c.pos.z, 0.75, c.idx);
            if (Math.random() < 0.15 && Math.hypot(c.vel.x, c.vel.z) > 2) s.fx.burst(c.pos.clone().setY(0.1), { color: c.player.colorHex, count: 1, speed: 1, up: 1.5, size: 0.1 });
          } else if (!c.cheering) c.drive(0, 0, dt);
          if (!c.cheering) c.integrate(dt);
          c.pos.x = THREE.MathUtils.clamp(c.pos.x, -HALF + 0.5, HALF - 0.5);
          c.pos.z = THREE.MathUtils.clamp(c.pos.z, -HALF + 0.5, HALF - 0.5);
        }
        separate(list, 0.45);
        if (dirty) { tex.needsUpdate = true; dirty = false; }
        hudT -= dt;
        if (hudT <= 0 && phase === 'play') {
          hudT = 0.25;
          list.forEach((c) => s.hud.setScore(c.id, Math.round((counts[c.idx + 1] / (RES * RES)) * 100), { bump: false }));
        }
      });

      await s.intro();
      if (s.aborted) return {};
      phase = 'play';
      list.forEach((c) => { paint(c.pos.x, c.pos.z, 1.6, c.idx); s.status(c.id, 'Paint everything! <b>A</b> = paint bomb'); });
      await s.play(this.duration);
      phase = 'end';
      if (s.aborted) return {};
      const scores = Object.fromEntries(list.map((c) => [c.id, Math.round((counts[c.idx + 1] / (RES * RES)) * 1000) / 10]));
      list.forEach((c) => s.hud.setScore(c.id, Math.round(scores[c.id])));
      const best = Math.max(...Object.values(scores));
      const winners = list.filter((c) => scores[c.id] === best && best > 0).map((c) => c.id);
      await s.finish(winners, { chars });
      return scores;
    } finally {
      s.dispose();
    }
  },
};
