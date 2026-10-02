// Memory Mix: DJ Bot dances a sequence of moves (arrows). Repeat it on your d-pad!
// Sequences grow every round. Perfect rounds score their length.
import { createSession, THREE, sfx } from './_shared-core.js';
import { spawnCharacters, Char } from './_shared-chars.js';
import { prop, glowMat } from './_shared-env.js';
import { loadModel } from '../../../sdk/three-kit.js';
import { note, arp } from './_shared-audio.js';

const DIRS = {
  up: { arrow: '▲', css: '#34d058', hex: 0x34d058, freq: 659, move: 'jump' },
  right: { arrow: '▶', css: '#ff4d4d', hex: 0xff4d4d, freq: 523, move: 'punchR' },
  down: { arrow: '▼', css: '#3d8bff', hex: 0x3d8bff, freq: 392, move: 'duck' },
  left: { arrow: '◀', css: '#ffcc00', hex: 0xffcc00, freq: 440, move: 'punchL' },
};
const KEYS = Object.keys(DIRS);

function dirOf(x, y) {
  if (Math.hypot(x, y) < 0.5) return null;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
}

export default {
  id: 'memory-mix',
  name: 'Memory Mix',
  instructions: 'Watch DJ Bot\'s dance moves, then repeat them in order on your <b>d-pad</b>. Sequences get longer every round!',
  mode: 'ffa',
  minPlayers: 1,
  controls: { stick: 'dpad', buttons: [], hint: 'Repeat the moves on the d-pad' },
  duration: 75,

  async run(env) {
    const s = await createSession(env, {
      title: this.name,
      instructions: this.instructions,
      background: 0x140c2e,
      sky: [0x0b0620, 0x3a1a6e],
      hud: { scoreLabel: 'pts' },
      camera: { pitch: 30, dist: 15, lookY: 1.6 },
      sunIntensity: 1.4,
      envIntensity: 0.5,
      shadowArea: 14,
    });
    try {
      s.stage.hemi.intensity = 0.5;
      s.sun.position.set(0, 18, 10);
      const n = s.players.length;
      // disco floor
      const tileGeo = new THREE.BoxGeometry(1.46, 0.2, 1.46);
      const floorTiles = [];
      const baseMats = [new THREE.MeshStandardMaterial({ color: 0x241a40, roughness: 0.3, metalness: 0.2 }), new THREE.MeshStandardMaterial({ color: 0x2f2352, roughness: 0.3, metalness: 0.2 })];
      const litMats = Object.fromEntries(KEYS.map((k) => [k, glowMat(DIRS[k].hex, 1.4)]));
      for (let i = -6; i <= 6; i++) {
        for (let j = -4; j <= 3; j++) {
          const m = new THREE.Mesh(tileGeo, baseMats[(i + j + 20) % 2]);
          m.position.set(i * 1.5, -0.1, j * 1.5);
          m.receiveShadow = true;
          s.scene.add(m);
          floorTiles.push({ m, base: m.material, t: 0 });
        }
      }
      // DJ booth + robot
      const booth = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, 1.2, 32), new THREE.MeshStandardMaterial({ color: 0x1b1530, roughness: 0.4, metalness: 0.4 }));
      booth.position.set(0, 0.6, -5.2);
      booth.castShadow = true;
      s.scene.add(booth);
      const boothRing = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.07, 8, 48), glowMat(0xff5cc8, 2));
      boothRing.rotation.x = Math.PI / 2;
      boothRing.position.set(0, 1.15, -5.2);
      s.scene.add(boothRing);
      const robotModel = await loadModel(env.sharedAsset('characters/robot/robot-expressive.glb'));
      const dj = new Char(s, { id: 'dj', name: 'DJ Bot', color: '#b86bff', colorHex: 0xb86bff }, robotModel, { height: 3.0, ring: false });
      dj.pos.set(0, 1.2, -5.2);
      dj.groundY = 1.2;
      dj.play('Dance');
      s.onFrame((dt) => dj.update(dt));
      // disco ball + spot lights
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.15, flatShading: true }));
      ball.position.set(0, 7.5, -2);
      s.scene.add(ball);
      const spots = [0xff5cc8, 0x3d8bff, 0x34d058].map((c, i) => {
        const l = new THREE.SpotLight(c, 60, 30, 0.35, 0.6, 1.2);
        l.position.set((i - 1) * 6, 9, 2);
        s.scene.add(l, l.target);
        return l;
      });
      // speakers
      const speaker = await prop(s, 'props/hazard-cylinder.glb', { height: 2.4 }).catch(() => null);
      if (speaker) [-7.5, 7.5].forEach((x) => { const sp = speaker.clone(true); sp.position.set(x, 0, -5); s.scene.add(sp); });

      const chars = await spawnCharacters(s, { height: 1.5 });
      const list = [...chars.values()];
      const span = Math.min(14, 2.1 * (n - 1));
      list.forEach((c, i) => {
        const x = n > 1 ? -span / 2 + (span * i) / (n - 1) : 0;
        c.pos.set(x, 0, 2.2 - Math.abs(x) * 0.15);
        c.face(0, 1); c.yaw = c.targetYaw;
        c.home = c.pos.clone();
        c.score = 0;
      });
      s.cam.set(new THREE.Vector3(0, 0, 0), 15 + Math.max(0, n - 4) * 0.8);
      s.cam.snap();

      // HUD: sequence strip
      const strip = document.createElement('div');
      strip.style.cssText = 'position:absolute;top:11vh;left:50%;transform:translateX(-50%);z-index:21;display:flex;gap:1.2vmin;pointer-events:none;font-family:Figtree,system-ui,sans-serif';
      s.root.appendChild(strip);
      function showStrip(seq, shown, hidden = false) {
        strip.innerHTML = seq.map((d, i) => {
          const vis = i < shown && !hidden;
          return `<div style="width:8vmin;height:8vmin;border-radius:2vmin;display:grid;place-items:center;font-size:5vmin;font-weight:700;color:#fff;
            background:${vis ? DIRS[d].css : '#ffffff22'};box-shadow:0 .6vmin 0 #0005;transform:scale(${i === shown - 1 && !hidden ? 1.15 : 1});transition:transform .15s">${vis ? DIRS[d].arrow : '?'}</div>`;
        }).join('');
      }

      function lightFloor(d) {
        for (const ft of floorTiles) if (Math.random() < 0.35) { ft.m.material = litMats[d]; ft.t = 0.35; }
      }
      function doMove(c, d, big = false) {
        const mv = DIRS[d].move;
        if (mv === 'jump') { c.grounded = true; c.jump(big ? 8 : 7); }
        else if (mv === 'duck') c.action('duck', 0.45);
        else { c.face(mv === 'punchR' ? 1 : -1, big ? 0 : 0.6); c.action('punch', 0.4, 1.5); }
      }

      s.onFrame((dt, time) => {
        ball.rotation.y += dt * 0.8;
        spots.forEach((l, i) => l.target.position.set(Math.sin(time * (0.7 + i * 0.2) + i * 2) * 6, 0, Math.cos(time * 0.6 + i) * 3));
        for (const ft of floorTiles) if (ft.t > 0) { ft.t -= dt; if (ft.t <= 0) ft.m.material = ft.base; }
        for (const c of [...list, dj]) {
          c.integrate(dt);
          if (c.lockT <= 0 && c !== dj && c.grounded) c.face(0, 1);
        }
        if (dj.lockT <= 0 && dj.loco !== 'Dance' && dj.grounded) dj.play('Dance');
      });

      await s.intro();
      if (s.aborted) return {};
      const t0 = performance.now();
      const deadline = t0 + this.duration * 1000;
      let round = 0;
      const prev = new Map();
      // Timer shows overall time left
      const timerOff = s.onFrame(() => s.hud.setTime(Math.max(0, (deadline - performance.now()) / 1000), this.duration));
      while (!s.aborted && round < 7 && performance.now() < deadline - 5000) {
        round++;
        const len = 2 + round;
        const seq = Array.from({ length: len }, () => KEYS[Math.floor(Math.random() * 4)]);
        s.hud.big(`Round ${round}`, 900);
        list.forEach((c) => s.status(c.id, 'Watch DJ Bot…'));
        await s.wait(1000);
        // demo
        const step = Math.max(0.45, 0.8 - round * 0.05);
        showStrip(seq, 0);
        for (let i = 0; i < len && !s.aborted; i++) {
          const d = seq[i];
          showStrip(seq, i + 1);
          note(DIRS[d].freq, { dur: 0.3, type: 'square', vol: 0.18 });
          lightFloor(d);
          if (DIRS[d].move === 'jump') { dj.grounded = true; dj.jump(7); }
          else dj.action(DIRS[d].move === 'duck' ? 'Sitting' : DIRS[d].move === 'punchR' ? 'Punch' : 'Wave', step * 0.9, 1.6);
          await s.wait(step * 1000);
        }
        if (s.aborted) break;
        await s.wait(350);
        // input phase
        showStrip(seq, 0, true);
        s.hud.note('Your turn! Repeat the moves', 1500);
        sfx.play('go');
        const state = new Map(list.map((c) => [c.id, { i: 0, done: false, ok: false }]));
        list.forEach((c) => { s.status(c.id, `Your turn! Repeat ${len} moves`); prev.set(c.id, dirOf(s.input(c.id).x, s.input(c.id).y)); s.hud.setScore(c.id, c.score, { extra: '', bump: false }); });
        const win = 2.5 + len * 0.9;
        let el = 0;
        await new Promise((res) => {
          const off = s.onFrame((dt) => {
            el += dt;
            s.hud.note(`Your turn! ${Math.ceil(win - el)}`);
            for (const c of list) {
              const st = state.get(c.id);
              const inp = s.input(c.id);
              const d = dirOf(inp.x, inp.y);
              const was = prev.get(c.id);
              prev.set(c.id, d);
              if (st.done || !d || d === was) continue;
              if (d === seq[st.i]) {
                st.i++;
                doMove(c, d);
                note(DIRS[d].freq, { dur: 0.15, vol: 0.08 });
                s.hud.setScore(c.id, c.score, { extra: '●'.repeat(st.i), bump: false });
                if (st.i >= len) {
                  st.done = true; st.ok = true;
                  c.score += len;
                  s.hud.setScore(c.id, c.score, { extra: '✓' });
                  s.pop(c.pos.clone().setY(c.height + 0.6), `+${len}`, '#7dff9a', { size: 1.2 });
                  s.fx.burst(c.pos.clone().setY(1.2), { color: [0x7dff9a, 0xffffff], count: 12, speed: 3, up: 4, glow: true, size: 0.1 });
                  sfx.play('correct');
                  s.vibrate(c.id, 60);
                  s.status(c.id, `Perfect! +${len}`);
                }
              } else {
                st.done = true;
                c.action('no', 1.0);
                c.flash(0xff2020, 0.4);
                s.hud.setScore(c.id, c.score, { extra: '✗' });
                s.pop(c.pos.clone().setY(c.height + 0.6), 'MISS', '#ff6a6a');
                sfx.play('wrong');
                s.vibrate(c.id, 200);
                s.status(c.id, 'Wrong move! Wait for the next round.');
              }
            }
            if (el >= win || list.every((c) => state.get(c.id).done) || s.aborted) { off(); res(); }
          });
        });
        s.hud.note('');
        showStrip(seq, len);
        for (const c of list) {
          const st = state.get(c.id);
          if (!st.done) { c.action('no', 1.0); s.hud.setScore(c.id, c.score, { extra: 'slow' }); s.status(c.id, 'Too slow!'); }
          else if (st.ok) c.action('yes', 1.0);
        }
        const perfect = list.filter((c) => state.get(c.id).ok).length;
        if (perfect === list.length) arp([523, 659, 784, 1047], { vol: 0.15 });
        await s.wait(1600);
        strip.innerHTML = '';
      }
      timerOff();
      s.hud.setTime(null);
      if (s.aborted) return {};
      const scores = Object.fromEntries(list.map((c) => [c.id, c.score]));
      const best = Math.max(...list.map((c) => c.score));
      const winners = list.filter((c) => c.score === best && best > 0).map((c) => c.id);
      await s.finish(winners, { chars });
      return scores;
    } finally {
      s.dispose();
    }
  },
};
