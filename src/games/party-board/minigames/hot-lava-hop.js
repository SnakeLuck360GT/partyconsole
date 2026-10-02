// Hot Lava Hop: a flaming beam sweeps around a stone island in a lava lake. Jump it! Last one standing wins.
import { createSession, THREE, sfx } from './_shared-core.js';
import { spawnCharacters, separate } from './_shared-chars.js';
import { island, lavaSea, scatter, glowMat } from './_shared-env.js';

const R = 6.6; // island radius
const PILLAR = 1.3;

export default {
  id: 'hot-lava-hop',
  name: 'Hot Lava Hop',
  instructions: 'A flaming beam sweeps the island. Press <b>A</b> to jump over it. It gets faster! Last one standing wins.',
  mode: 'ffa',
  minPlayers: 2,
  controls: { stick: 'analog', buttons: [{ id: 'a', label: 'JUMP' }], hint: 'Move · <b>A</b> to jump the beam' },
  duration: 50,

  async run(env) {
    const s = await createSession(env, {
      title: this.name,
      instructions: this.instructions,
      background: 0x2a0d0a,
      sky: [0x1a0606, 0x8a2a10],
      fog: { near: 30, far: 90 },
      sunIntensity: 1.8,
      envIntensity: 0.5,
      hud: { scoreLabel: 's', sort: false },
      camera: { pitch: 54, dist: 17, fixed: true },
    });
    try {
      s.sun.color.set(0xffc9a0);
      s.stage.hemi.color.set(0xffb080);
      s.stage.hemi.groundColor.set(0xff4010);
      s.stage.hemi.intensity = 0.6;
      lavaSea(s, { y: -1.6 });
      const isl = island(s, { radius: R, depth: 4, top: 0x57504c, side: 0x3b2a26, rim: 0x3a3230 });
      // stone tiles pattern on top
      const tiles = new THREE.Mesh(new THREE.RingGeometry(PILLAR + 0.3, R - 0.25, 48, 3), new THREE.MeshStandardMaterial({ color: 0x6e6560, roughness: 0.9, flatShading: true }));
      tiles.rotation.x = -Math.PI / 2;
      tiles.position.y = 0.01;
      tiles.receiveShadow = true;
      isl.add(tiles);
      // warning ring around the edge
      const edge = new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.08, 6, 64), glowMat(0xff5a1a, 2));
      edge.rotation.x = Math.PI / 2;
      edge.position.y = 0.02;
      isl.add(edge);

      // central pillar + rotating beam
      const pillar = new THREE.Group();
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR * 0.8, PILLAR, 1.8, 10), new THREE.MeshStandardMaterial({ color: 0x3d302b, roughness: 0.9, flatShading: true }));
      stone.position.y = 0.9;
      stone.castShadow = true;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR * 0.86, PILLAR * 0.86, 0.18, 10), glowMat(0xff7a1a, 2.5));
      band.position.y = 1.2;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(PILLAR * 0.8, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x2a201c, roughness: 0.9, flatShading: true }));
      crown.position.y = 2.25;
      crown.castShadow = true;
      pillar.add(stone, band, crown);
      s.scene.add(pillar);

      const beamMat = new THREE.MeshStandardMaterial({ color: 0xff3a00, emissive: 0xff3000, emissiveIntensity: 1.1, roughness: 0.4 });
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, toneMapped: false });
      const pivot = new THREE.Group();
      s.scene.add(pivot);
      const beams = [];
      function addBeam(angle) {
        const arm = new THREE.Group();
        arm.rotation.y = angle;
        const len = R + 0.6;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, len, 12, 1), beamMat);
        beam.rotation.z = Math.PI / 2;
        beam.position.set(len / 2, 0.45, 0);
        beam.castShadow = true;
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, len + 0.02, 8, 1), coreMat);
        core.rotation.z = Math.PI / 2;
        core.position.copy(beam.position);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), beamMat);
        tip.position.set(len, 0.45, 0);
        const light = new THREE.PointLight(0xff6a1a, 18, 7, 2);
        light.position.set(len * 0.6, 1.2, 0);
        arm.add(beam, core, tip, light);
        arm.scale.set(0.01, 1, 1);
        pivot.add(arm);
        beams.push({ arm, angle });
        return arm;
      }
      addBeam(0);

      await scatter(s, [
        { path: 'space/rock-large-1.glb', count: 5, size: 5 },
        { path: 'space/rock-large-3.glb', count: 5, size: 4 },
        { path: 'space/tree-lava-1.glb', count: 5, size: 3.5 },
        { path: 'space/rock-2.glb', count: 7, size: 2 },
      ], { inner: 11, outer: 24, y: -1.6, seed: 7 });

      const chars = await spawnCharacters(s, { height: 1.9 });
      const list = [...chars.values()];
      list.forEach((c, i) => {
        const a = (i / list.length) * Math.PI * 2 + Math.PI / 2;
        c.pos.set(Math.cos(a) * 4.3, 0, -Math.sin(a) * 4.3);
        c.face(-c.pos.x, -c.pos.z);
        c.yaw = c.targetYaw;
      });
      s.cam.set(new THREE.Vector3(0, 0, 0.4), 16.5);
      s.cam.snap();

      const survival = new Map(list.map((c) => [c.id, 0]));
      let phase = 'intro';
      let omega = 0;
      let dir = 1;
      let t = 0;
      let lastSpark = 0;
      const dead = [];

      s.onFrame((dt) => {
        pivot.rotation.y += omega * dir * dt;
        band.material.emissiveIntensity = 2 + Math.sin(performance.now() * 0.01) * 0.8;
        if (phase !== 'play' && phase !== 'end') return;
        for (const c of list) {
          if (!c.alive) {
            // falling into lava after being flung
            c.pos.x += c.vel.x * dt;
            c.pos.z += c.vel.z * dt;
            c.integrate(dt, { ground: () => -99 });
            if (c.pos.y < -1.4 && !c.sank) {
              c.sank = true;
              s.fx.burst(new THREE.Vector3(c.pos.x, -1.5, c.pos.z), { color: [0xff7a00, 0xffd000, 0xff3000], count: 18, speed: 3, up: 6, glow: true, size: 0.16 });
              sfx.play('explosion');
            }
            if (c.pos.y < -4) c.root.visible = false;
            continue;
          }
          if (phase === 'play') {
            const inp = s.input(c.id);
            c.drive(inp.x, inp.y, dt, { speed: 5.2, accel: 16 });
            if (inp.pressed('a') && c.jump(9.2)) sfx.play('jump');
          } else c.drive(0, 0, dt);
          c.integrate(dt, { gravity: 27 });
          // keep on the ring
          const r = Math.hypot(c.pos.x, c.pos.z);
          const maxR = R - 0.45;
          const minR = PILLAR + 0.5;
          if (r > maxR) { c.pos.x *= maxR / r; c.pos.z *= maxR / r; }
          if (r < minR && r > 1e-4) { c.pos.x *= minR / r; c.pos.z *= minR / r; }
        }
        separate(list, 0.42);
        if (phase !== 'play') return;
        t += dt;
        for (const c of list) if (c.alive) survival.set(c.id, t);
        // beam collisions
        for (const b of beams) {
          if (b.arm.scale.x < 0.95) continue;
          const th = pivot.rotation.y + b.angle;
          for (const c of list) {
            if (!c.alive || c.pos.y > 0.78) continue;
            const phi = Math.atan2(-c.pos.z, c.pos.x);
            let d = phi - th;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            const r = Math.hypot(c.pos.x, c.pos.z);
            if (Math.abs(d) * r < 0.42) {
              // tangential fling in beam's direction of travel + outward
              const tang = new THREE.Vector3(-Math.sin(th), 0, -Math.cos(th)).multiplyScalar(dir * 4);
              const out = new THREE.Vector3(c.pos.x, 0, c.pos.z).normalize().multiplyScalar(5);
              c.die({ fling: new THREE.Vector3(tang.x + out.x, 9, tang.z + out.z) });
              dead.push(c.id);
              s.hud.setOut(c.id);
              s.fx.burst(c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), { color: [0xff9a00, 0xffe070, 0xff4000], count: 22, speed: 5, up: 5, glow: true });
              s.shake(0.5);
              sfx.play('hit');
              s.vibrate(c.id, 200);
              s.status(c.id, "You're toast! Watch the TV…");
              s.pop(c.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), 'OUT!', '#ff6a3d');
            }
          }
        }
        // sparks along beams
        if (t - lastSpark > 0.05) {
          lastSpark = t;
          for (const b of beams) {
            const th = pivot.rotation.y + b.angle;
            const rr = PILLAR + Math.random() * (R - PILLAR);
            s.fx.burst(new THREE.Vector3(Math.cos(th) * rr, 0.6, -Math.sin(th) * rr), { color: [0xffb000, 0xff5a00], count: 1, speed: 0.6, up: 2.5, glow: true, size: 0.1, gravity: -2, life: 0.5 });
          }
        }
        // standings
        for (const c of list) s.hud.setScore(c.id, Math.floor(survival.get(c.id)), { bump: false });
      });

      await s.intro();
      if (s.aborted) return {};
      // beam grows out
      phase = 'play';
      list.forEach((c) => s.status(c.id, 'Jump the beam with <b>A</b>!'));
      const grow = (arm) => { let k = 0; const off = s.onFrame((dt) => { k = Math.min(1, k + dt * 2.5); arm.scale.x = k; if (k >= 1) off(); }); };
      grow(beams[0].arm);
      sfx.play('whoosh');
      const DUR = this.duration;
      const aliveCount = () => list.filter((c) => c.alive).length;
      const n0 = list.length;
      let secondAdded = false;
      let nextFlip = 16 + Math.random() * 6;
      const speedLoop = s.onFrame(() => {
        omega = 1.25 + Math.min(t, 40) * 0.052;
        if (!secondAdded && t > 20) {
          secondAdded = true;
          grow(addBeam(Math.PI));
          s.hud.big('TWO BEAMS!', 1100);
          sfx.play('powerup');
        }
        if (t > nextFlip) {
          nextFlip = t + 9 + Math.random() * 6;
          dir *= -1;
          s.hud.note('↺ REVERSE!', 1200);
          sfx.play('whoosh');
        }
      });
      await s.play(DUR, { until: () => (n0 > 1 ? aliveCount() <= 1 : aliveCount() === 0) });
      speedLoop();
      phase = 'end';
      omega *= 0.3;
      if (s.aborted) return {};
      const alive = list.filter((c) => c.alive);
      const winners = alive.length ? alive.map((c) => c.id) : dead.slice(-1);
      const scores = {};
      for (const c of list) scores[c.id] = Math.round(survival.get(c.id) * 10) / 10 + (c.alive ? 100 : 0);
      winners.forEach((id) => {
        const c = chars.get(id);
        if (!c.alive) { c.root.visible = true; c.pos.set(0, 0, PILLAR + 1.2); c.vel.set(0, 0, 0); c.vy = 0; c.grounded = true; }
        s.status(id, 'You survived!');
      });
      await s.finish(winners, { chars });
      return scores;
    } finally {
      s.dispose();
    }
  },
};

