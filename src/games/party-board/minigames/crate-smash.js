// Crate Smash: crates drop onto a beach. Punch them open for points: wooden +1, golden +5.
// Careful: TNT crates blow up in your face and stun everyone nearby. Most points wins.
import { createSession, THREE, sfx } from './_shared-core.js';
import { spawnCharacters, separate } from './_shared-chars.js';
import { island, waterSea, scatter, propFactory, blobShadow } from './_shared-env.js';

const R = 8.2;

function tntTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c8261f'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#8f1712'; for (let i = 0; i < 4; i++) g.fillRect(0, i * 32 + 30, 128, 3);
  g.fillStyle = '#f4e3c0'; g.fillRect(8, 40, 112, 48);
  g.fillStyle = '#1b1b1b'; g.font = '700 44px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('TNT', 64, 66);
  g.strokeStyle = '#5a0e0b'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default {
  id: 'crate-smash',
  name: 'Crate Smash',
  instructions: 'Run up to crates and press <b>A</b> to smash them! Wooden +1, golden +5 (takes 3 hits). Avoid the <b style="color:#ff5a4a">TNT</b>!',
  mode: 'ffa',
  minPlayers: 1,
  controls: { stick: 'analog', buttons: [{ id: 'a', label: 'SMASH' }], hint: 'Move · <b>A</b> to smash crates' },
  duration: 40,

  async run(env) {
    const s = await createSession(env, {
      title: this.name,
      instructions: this.instructions,
      background: 0x9fdcff,
      sky: [0x3d9be9, 0xd8f3ff],
      fog: { near: 45, far: 120 },
      hud: { scoreLabel: 'pts' },
      camera: { pitch: 55, dist: 18 },
    });
    try {
      waterSea(s, { y: -1.0, deep: 0x0b6fa8, shallow: 0x35d0d6 });
      island(s, { radius: R, depth: 3, top: 0xf0d79a, side: 0xc9a46a, rim: 0xe4c27f });
      const [crateF] = await Promise.all([
        propFactory(s, 'props/cube-crate.glb', { size: 1.15 }),
        scatter(s, [
          { path: 'nature/k-tree-palm-tall.glb', count: 6, height: 5.5, inner: R - 0.8, outer: R - 0.3 },
          { path: 'nature/k-tree-palm.glb', count: 4, height: 4.5, inner: R - 0.8, outer: R - 0.3 },
          { path: 'nature/q-rock-1.glb', count: 5, size: 1.5, inner: R - 0.6, outer: R + 0.5 },
          { path: 'nature/k-tree-palm-tall.glb', count: 6, height: 7, inner: 14, outer: 24, y: -1 },
        ], { seed: 21, avoid: (p) => p.length() < R + 1 && p.z > -2 }),
      ]);
      const crateH = 1.15;
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 0.55, roughness: 0.25, emissive: 0x5a3800 });
      const tntMat = new THREE.MeshStandardMaterial({ map: tntTexture(), roughness: 0.7 });
      const tntGeo = new THREE.BoxGeometry(crateH, crateH, crateH);
      tntGeo.translate(0, crateH / 2, 0);
      function makeCrate(kind) {
        if (kind === 'tnt') { const m = new THREE.Mesh(tntGeo, tntMat); m.castShadow = true; const g = new THREE.Group(); g.add(m); return g; }
        const o = crateF();
        if (kind === 'gold') o.traverse((m) => { if (m.isMesh) m.material = goldMat; });
        return o;
      }

      const chars = await spawnCharacters(s, { height: 1.7 });
      const list = [...chars.values()];
      list.forEach((c, i) => {
        const a = (i / list.length) * Math.PI * 2;
        c.pos.set(Math.sin(a) * 2.5, 0, Math.cos(a) * 2.5);
        c.face(c.pos.x, c.pos.z); c.yaw = c.targetYaw;
        c.pts = 0; c.cd = 0;
      });
      s.cam.set(new THREE.Vector3(0, 0, 0.6), 18);
      s.cam.snap();

      const crates = [];
      const tmp = new THREE.Vector3();
      function freeSpot() {
        for (let k = 0; k < 30; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * (R - 1.6);
          const x = Math.cos(a) * r; const z = Math.sin(a) * r;
          if (crates.every((c) => Math.hypot(c.x - x, c.z - z) > 1.6) && list.every((c) => Math.hypot(c.pos.x - x, c.pos.z - z) > 1.2)) return [x, z];
        }
        return null;
      }
      function spawnCrate() {
        const spot = freeSpot();
        if (!spot) return;
        const roll = Math.random();
        const kind = roll < 0.12 ? 'gold' : roll < 0.26 ? 'tnt' : 'wood';
        const obj = makeCrate(kind);
        const [x, z] = spot;
        obj.position.set(x, 9 + Math.random() * 3, z);
        obj.rotation.y = Math.random() * Math.PI;
        const sh = blobShadow(1.6, 0.4);
        sh.position.set(x, 0.03, z);
        s.scene.add(obj, sh);
        crates.push({ obj, sh, x, z, kind, hp: kind === 'gold' ? 3 : 1, vy: 0, landed: false, wob: 0, fuse: 0 });
      }
      function removeCrate(cr) { s.scene.remove(cr.obj, cr.sh); crates.splice(crates.indexOf(cr), 1); }
      function award(c, v, at) {
        c.pts += v;
        s.hud.setScore(c.id, c.pts);
        s.pop(at.clone().setY(2.2), `+${v}`, v >= 5 ? '#ffe14d' : '#ffffff', { size: v >= 5 ? 1.4 : 1 });
      }
      function explode(cr, by) {
        const p = new THREE.Vector3(cr.x, 0.6, cr.z);
        removeCrate(cr);
        s.fx.burst(p, { color: [0xff8a00, 0xffe070, 0xff3000], count: 30, speed: 8, up: 6, glow: true, size: 0.24 });
        s.fx.burst(p, { color: [0x444444, 0x666666], count: 12, speed: 3, up: 4, size: 0.4, gravity: -1, drag: 2.5, life: 1.2 });
        s.fx.ring(p, 0xffa040, 3.4);
        s.shake(0.7);
        sfx.play('explosion');
        for (const c of list) {
          const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
          if (d < 2.8) {
            c.stun(1.6);
            tmp.set(c.pos.x - p.x, 0, c.pos.z - p.z).normalize();
            c.vel.set(tmp.x * 7, 0, tmp.z * 7);
            c.vy = 7; c.grounded = false;
            s.vibrate(c.id, 300);
            if (c.pts > 0) { const lose = Math.min(2, c.pts); c.pts -= lose; s.hud.setScore(c.id, c.pts); s.pop(c.pos.clone().setY(2.4), `-${lose}`, '#ff6a6a'); }
          }
        }
        if (by) s.status(by.id, 'Ouch, TNT!');
      }
      function smash(c) {
        c.action('punch', 0.32, 2.2);
        c.cd = 0.32;
        sfx.play('whoosh');
        const fx = Math.sin(c.targetYaw); const fz = Math.cos(c.targetYaw);
        let best = null; let bd = 1e9;
        for (const cr of crates) {
          if (!cr.landed) continue;
          const dx = cr.x - c.pos.x; const dz = cr.z - c.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 1.75) continue;
          const dot = (dx * fx + dz * fz) / (d || 1);
          if (dot < 0.2 && d > 0.9) continue;
          if (d < bd) { bd = d; best = cr; }
        }
        if (best) {
          if (best.kind === 'tnt') { best.fuse = 0.35; best.by = c; sfx.play('tick'); return; }
          best.hp -= 1;
          best.wob = 0.35;
          sfx.play('hit');
          s.vibrate(c.id, 40);
          const p = new THREE.Vector3(best.x, 0.7, best.z);
          s.fx.burst(p, { color: best.kind === 'gold' ? [0xffd84a, 0xfff2a8] : [0xa0703f, 0xc89a5e, 0x7a5230], count: best.hp <= 0 ? 18 : 6, speed: 5, up: 5, size: 0.16 });
          if (best.hp <= 0) {
            removeCrate(best);
            s.shake(0.15);
            if (best.kind === 'gold') { award(c, 5, p); sfx.play('powerup'); s.fx.burst(p, { color: [0xffe14d], count: 12, speed: 4, up: 6, glow: true, size: 0.1 }); }
            else { award(c, 1, p); sfx.play('coin'); }
          }
          return;
        }
        // shove a nearby player
        for (const o of list) {
          if (o === c) continue;
          const dx = o.pos.x - c.pos.x; const dz = o.pos.z - c.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.3 && (dx * fx + dz * fz) / (d || 1) > 0.3) {
            o.vel.set((dx / d) * 9, 0, (dz / d) * 9);
            o.stun(0.45);
            sfx.play('hit');
            s.fx.burst(o.pos.clone().setY(1), { color: [0xffffff, 0xffe066], count: 8, speed: 4, up: 2, glow: true, size: 0.1 });
          }
        }
      }

      let phase = 'intro';
      s.onFrame((dt, time) => {
        for (const cr of [...crates]) {
          if (!cr.landed) {
            cr.vy -= 25 * dt;
            cr.obj.position.y += cr.vy * dt;
            if (cr.obj.position.y <= 0) { cr.obj.position.y = 0; cr.landed = true; cr.wob = 0.3; s.fx.dust(cr.obj.position, 6, 0xf0d79a); sfx.play('blip'); }
          }
          const h = cr.obj.position.y;
          cr.sh.scale.setScalar(THREE.MathUtils.clamp(1 - h / 14, 0.3, 1));
          cr.wob *= Math.exp(-10 * dt);
          const sq = Math.sin(time * 40) * cr.wob;
          cr.obj.scale.set(1 + sq, 1 - sq, 1 + sq);
          if (cr.kind === 'gold') cr.obj.rotation.y += dt * 0.6;
          if (cr.fuse > 0) {
            cr.fuse -= dt;
            const k = 1 + Math.sin(time * 60) * 0.1;
            cr.obj.scale.setScalar(k);
            if (cr.fuse <= 0) explode(cr, cr.by);
          }
        }
        for (const c of list) {
          c.cd = Math.max(0, c.cd - dt);
          if (phase === 'play' && c.stunT <= 0) {
            const inp = s.input(c.id);
            c.drive(inp.x, inp.y, dt, { speed: 6, accel: 15 });
            if (inp.pressed('a') && c.cd <= 0) smash(c);
          } else {
            c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt; c.vel.multiplyScalar(Math.exp(-5 * dt));
            if (phase !== 'play' && !c.cheering) c.drive(0, 0, dt);
          }
          if (!c.cheering) c.integrate(dt);
          // crate collision
          for (const cr of crates) {
            if (!cr.landed) continue;
            const dx = c.pos.x - cr.x; const dz = c.pos.z - cr.z;
            const lim = 0.95;
            if (Math.abs(dx) < lim && Math.abs(dz) < lim) {
              if (Math.abs(dx) > Math.abs(dz)) c.pos.x = cr.x + Math.sign(dx) * lim; else c.pos.z = cr.z + Math.sign(dz) * lim;
            }
          }
          const r = Math.hypot(c.pos.x, c.pos.z);
          if (r > R - 0.6) { c.pos.x *= (R - 0.6) / r; c.pos.z *= (R - 0.6) / r; }
        }
        separate(list, 0.45);
        if (phase === 'play') {
          const want = 5 + list.length;
          if (crates.length < want && Math.random() < dt * 3) spawnCrate();
        }
      });

      for (let i = 0; i < 4 + list.length; i++) spawnCrate();
      await s.intro();
      if (s.aborted) return {};
      phase = 'play';
      list.forEach((c) => s.status(c.id, 'Smash crates with <b>A</b>!'));
      await s.play(this.duration);
      phase = 'end';
      if (s.aborted) return {};
      const scores = Object.fromEntries(list.map((c) => [c.id, c.pts]));
      const best = Math.max(...list.map((c) => c.pts));
      const winners = list.filter((c) => c.pts === best && best > 0).map((c) => c.id);
      for (const c of list) { c.stunT = 0; c.vel.set(0, 0, 0); }
      await s.finish(winners, { chars });
      return scores;
    } finally {
      s.dispose();
    }
  },
};
