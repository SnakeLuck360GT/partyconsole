// Pump It Up: mash A to inflate your balloon until it POPS. But only pump on GREEN:
// pumping on a red light lets air out and zaps you. First to pop wins.
import { createSession, THREE, sfx, rand } from './_shared-core.js';
import { spawnCharacters } from './_shared-chars.js';
import { prop, glowMat } from './_shared-env.js';

const NEED = 1; // progress units to pop
const PER_PUMP = 1 / 48;

export default {
  id: 'pump-it-up',
  name: 'Pump It Up',
  instructions: 'Mash <b>A</b> to pump your balloon until it pops! Only pump on <b style="color:#4dff7a">GREEN</b>: pumping on <b style="color:#ff5a5a">RED</b> lets the air out.',
  mode: 'ffa',
  minPlayers: 2,
  controls: { stick: 'none', buttons: [{ id: 'a', label: 'PUMP' }], hint: 'Mash <b>A</b> on green. Stop on red!' },
  duration: 40,

  async run(env) {
    const s = await createSession(env, {
      title: this.name,
      instructions: this.instructions,
      background: 0x2b1d4f,
      sky: [0x1d1240, 0xff8a65],
      hud: { scoreLabel: '%' },
      camera: { pitch: 12, dist: 15, lookY: 3.0 },
      shadowArea: 16,
    });
    try {
      s.sun.position.set(4, 14, 12);
      s.sun.intensity = 2.0;
      const n = s.players.length;
      const gap = 2.7;
      const width = Math.max(8, n * gap + 2);
      // stage floor
      const floorTex = stripeTexture(['#c8874a', '#b4743c'], 16, true);
      floorTex.repeat.set(width / 4, 2);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(width + 4, 3, 7), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }));
      floor.position.set(0, -1.5, 0.5);
      floor.receiveShadow = true;
      s.scene.add(floor);
      const skirtTex = stripeTexture(['#b3122e', '#8a0c22'], 32, false);
      skirtTex.repeat.set(width / 3, 1);
      const skirt = new THREE.Mesh(new THREE.PlaneGeometry(width + 4.2, 3), new THREE.MeshStandardMaterial({ map: skirtTex, roughness: 0.9 }));
      skirt.position.set(0, -1.6, 4.02);
      s.scene.add(skirt);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(width + 4.2, 0.25, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4 }));
      lip.position.set(0, 0.0, 4.1);
      s.scene.add(lip);
      // circus backdrop
      const tentTex = stripeTexture(['#e8384f', '#fff4e0'], 24, false);
      tentTex.repeat.set(width / 2, 1);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.75, width * 0.75, 12, 48, 1, true, -Math.PI * 0.75, Math.PI * 1.5),
        new THREE.MeshStandardMaterial({ map: tentTex, side: THREE.BackSide, roughness: 0.9 }));
      back.position.set(0, 5.5, width * 0.75 - 3);
      back.rotation.y = Math.PI;
      back.receiveShadow = true;
      s.scene.add(back);
      // string lights
      const bulbGeo = new THREE.SphereGeometry(0.12, 8, 6);
      const bulbMats = [0xffd23f, 0xff5cc8, 0x4dd8ff, 0x7dff6a].map((c) => glowMat(c, 2.2));
      const bulbs = [];
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i <= 28; i++) {
          const u = i / 28;
          const x = (u - 0.5) * (width + 3);
          const y = 8.4 - row * 1.2 - Math.sin(u * Math.PI) * 1.1;
          const b = new THREE.Mesh(bulbGeo, bulbMats[(i + row) % 4]);
          b.position.set(x, y, -1.5 + row * 0.5);
          s.scene.add(b);
          bulbs.push(b);
        }
      }
      // traffic light
      const tl = new THREE.Group();
      const housing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x23252e, roughness: 0.5 }));
      tl.add(housing);
      const lampOff = [0x3a0d0d, 0x3a320d, 0x0d3a16].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 }));
      const lampOn = [0xff2a2a, 0xffb000, 0x22ff55].map((c) => glowMat(c, 0.9));
      const lamps = [0, 1, 2].map((i) => {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12), lampOff[i]);
        l.position.set(0, 1 - i * 1.0, 0.3);
        l.scale.z = 0.5;
        tl.add(l);
        return l;
      });
      const lampLight = new THREE.PointLight(0xffffff, 0, 14, 1.5);
      lampLight.position.set(0, 0, 2);
      tl.add(lampLight);
      tl.position.set(0, 6.0, -1.6);
      tl.scale.setScalar(0.85);
      s.scene.add(tl);

      const pumpBase = await prop(s, 'props/hazard-cylinder.glb', { height: 1.0 });
      const chars = await spawnCharacters(s, { height: 1.55 });
      const list = [...chars.values()];
      const balloonGeo = new THREE.SphereGeometry(1, 32, 20);
      balloonGeo.scale(1, 1.18, 1);
      const knotGeo = new THREE.ConeGeometry(0.12, 0.2, 8);
      const rig = new Map();
      list.forEach((c, i) => {
        const x = (i - (n - 1) / 2) * gap;
        c.pos.set(x - 0.55, 0, 1.6);
        c.face(0.3, 1);
        c.yaw = c.targetYaw;
        const g = new THREE.Group();
        g.position.set(x + 0.45, 0, 1.2);
        s.scene.add(g);
        const base = pumpBase.clone(true);
        base.scale.multiplyScalar(0.75);
        g.add(base);
        const handle = new THREE.Group();
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 }));
        rod.position.y = 0.45;
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 10), new THREE.MeshStandardMaterial({ color: c.player.colorHex, roughness: 0.4 }));
        bar.rotation.z = Math.PI / 2;
        bar.position.y = 0.9;
        handle.add(rod, bar);
        handle.position.y = 0.75;
        g.add(handle);
        // hose up to balloon
        const balloon = new THREE.Group();
        const skin = new THREE.Mesh(balloonGeo, new THREE.MeshPhysicalMaterial({ color: c.player.colorHex, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 }));
        skin.castShadow = true;
        skin.position.y = 1.18;
        const knot = new THREE.Mesh(knotGeo, skin.material);
        knot.position.y = 0;
        knot.rotation.x = Math.PI;
        balloon.add(skin, knot);
        balloon.position.set(0, 2.1, -0.2);
        g.add(balloon);
        const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 }));
        hose.position.set(0, 1.5, -0.1);
        g.add(hose);
        rig.set(c.id, { g, handle, balloon, skin, progress: 0, popped: false, wob: 0, pumpT: 0, zapT: 0, popOrder: 0 });
      });
      s.cam.set(new THREE.Vector3(0, 0, 1), Math.max(13, width * 1.05));
      s.cam.snap();

      const edgeGlow = document.createElement('div');
      edgeGlow.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;transition:box-shadow .15s;';
      s.root.appendChild(edgeGlow);
      let light = 'red'; // red | yellow | green
      let lightT = 0;
      let phase = 'intro';
      let popCount = 0;
      function setLight(l) {
        light = l;
        const idx = l === 'red' ? 0 : l === 'yellow' ? 1 : 2;
        lamps.forEach((m, i) => { m.material = i === idx ? lampOn[i] : lampOff[i]; });
        lampLight.color.set([0xff3b3b, 0xffc21a, 0x3bff6a][idx]);
        lampLight.intensity = 25;
        edgeGlow.style.boxShadow = `inset 0 0 6vmin 1.5vmin ${['#ff2a2acc', '#ffc21acc', '#2aff6acc'][idx]}`;
        tl.scale.setScalar(1.15);
        if (phase === 'play') {
          if (l === 'green') { s.hud.note('<span style="color:#5dff8a">● PUMP!</span>', 900); sfx.play('go'); list.forEach((c) => s.status(c.id, '🟢 PUMP PUMP PUMP!')); }
          if (l === 'red') { s.hud.note('<span style="color:#ff6a6a">● STOP!</span>', 900); sfx.play('wrong'); list.forEach((c) => s.status(c.id, '🔴 STOP! Don\'t pump!')); }
          if (l === 'yellow') sfx.play('blip');
        }
      }
      setLight('red');

      function pop(c, r) {
        r.popped = true;
        r.popOrder = ++popCount;
        r.balloon.visible = false;
        const p = new THREE.Vector3();
        r.skin.getWorldPosition(p);
        s.fx.burst(p, { color: [c.player.colorHex, 0xffffff], count: 30, speed: 7, up: 4, size: 0.18 });
        s.fx.confetti(p, 50);
        s.shake(0.5);
        sfx.play('explosion');
        sfx.play('win');
        s.pop(p.clone().add(new THREE.Vector3(0, 1.2, 0)), popCount === 1 ? 'POP! 1st!' : `POP! #${popCount}`, '#fff', { size: 1.4 });
        c.cheer();
        s.vibrate(c.id, [60, 40, 120]);
        s.status(c.id, `🎉 POP! You finished #${popCount}`);
        s.hud.setScore(c.id, 100, { extra: popCount === 1 ? '🥇' : `#${popCount}` });
      }

      s.onFrame((dt, time) => {
        tl.scale.lerp(new THREE.Vector3(0.85, 0.85, 0.85), 1 - Math.exp(-8 * dt));
        lampLight.intensity = Math.max(6, lampLight.intensity - dt * 30);
        bulbs.forEach((b, i) => { b.visible = Math.sin(time * 3 + i * 0.9) > -0.6; });
        if (phase === 'play') {
          lightT -= dt;
          if (lightT <= 0) {
            if (light === 'green') { setLight('yellow'); lightT = 0.7; }
            else if (light === 'yellow') { setLight('red'); lightT = rand(1.2, 2.6); }
            else { setLight('green'); lightT = rand(2.2, 4.5); }
          }
        }
        for (const c of list) {
          const r = rig.get(c.id);
          r.zapT = Math.max(0, r.zapT - dt);
          r.pumpT = Math.max(0, r.pumpT - dt);
          if (phase === 'play' && !r.popped) {
            const inp = s.input(c.id);
            if (inp.pressed('a') && r.zapT <= 0) {
              if (light === 'red') {
                r.progress = Math.max(0, r.progress - 0.12);
                r.zapT = 0.9;
                c.stun(0.9);
                c.flash(0xff2020, 0.4);
                r.wob = -0.3;
                sfx.play('hit');
                s.vibrate(c.id, 300);
                const p = c.pos.clone().setY(2.2);
                s.fx.burst(p, { color: [0xfff36b, 0x7ad7ff], count: 14, speed: 4, up: 3, glow: true, size: 0.1 });
                s.pop(p, 'ZAP! -12%', '#ff6a6a');
              } else {
                r.progress += PER_PUMP * (light === 'yellow' ? 0.6 : 1);
                r.pumpT = 0.12;
                r.wob = 0.18;
                c.action('punch', 0.18, 2.6);
                sfx.play('tick');
                if (r.progress >= NEED) pop(c, r);
              }
              s.hud.setScore(c.id, Math.floor(Math.min(1, r.progress) * 100), { bump: false });
            }
          }
          // visuals
          r.handle.position.y = 0.75 - (r.pumpT > 0 ? 0.35 : 0);
          r.wob += (-r.wob * 30 - (r.wobV || 0) * 0) * dt;
          const k = Math.min(1, r.progress);
          const base = 0.35 + k * 1.15;
          const tremble = k > 0.8 ? Math.sin(time * 50) * 0.02 * (k - 0.8) * 5 : 0;
          r.balloon.scale.set(base * (1 + r.wob * 0.6) + tremble, base * (1 - r.wob * 0.3), base * (1 + r.wob * 0.6) + tremble);
          r.balloon.position.y = 2.1;
          r.skin.material.emissive?.set(k > 0.85 ? 0x331111 : 0x000000);
        }
      });

      await s.intro();
      if (s.aborted) return {};
      phase = 'play';
      setLight('green');
      lightT = rand(2.5, 4);
      const target = Math.min(3, Math.max(1, n - 1));
      await s.play(this.duration, { until: () => popCount >= target || list.every((c) => rig.get(c.id).popped) });
      phase = 'end';
      if (s.aborted) return {};
      const scores = {};
      for (const c of list) {
        const r = rig.get(c.id);
        scores[c.id] = r.popped ? 200 - r.popOrder : Math.round(Math.min(1, r.progress) * 100);
      }
      const best = Math.max(...Object.values(scores));
      const winners = list.filter((c) => scores[c.id] === best && best > 0).map((c) => c.id);
      await s.finish(winners, { chars });
      return scores;
    } finally {
      s.dispose();
    }
  },
};

function stripeTexture(colors, stripes = 16, horizontal = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const w = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = colors[i % colors.length];
    if (horizontal) g.fillRect(0, i * w, 256, w); else g.fillRect(i * w, 0, w, 256);
  }
  if (horizontal) { g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < stripes; i++) g.fillRect(0, i * w, 256, 1.5); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
