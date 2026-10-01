// Fighter visuals: animated monster models tinted to the player's colour, ground ring, name + damage badge,
// power-up auras, and an animation state machine driven by simulation state.
import { THREE, loadGLTF, SkeletonUtils } from '../../sdk/three-kit.js';

// Species roster: body material (tinted to player colour) + clip names.
export const SPECIES = [
  { file: 'characters/monsters/dino.glb', body: /Dino_Main/ },
  { file: 'characters/monsters/frog.glb', body: /Frog_Main/ },
  { file: 'characters/monsters/yeti.glb', body: /Yeti_Main/ },
  { file: 'characters/monsters/orc.glb', body: /Orc_Main/ },
  { file: 'characters/monsters/cactoro.glb', body: /Cactoro_Main/ },
  { file: 'characters/monsters/alien.glb', body: /Alien_Main/ },
  { file: 'characters/monsters/blue-demon.glb', body: /BlueDemon_Main/ },
  { file: 'characters/monsters/mushroom-king.glb', body: /MushroomKing_Main/ },
  { file: 'characters/critters/platformer-hero.glb', body: /^Main$/, scale: 0.49 },
  { file: 'characters/robot/robot-expressive.glb', body: /^Main$/, scale: 0.38 },
];

const CLIPS = {
  idle: ['Idle'],
  run: ['Run', 'Running'],
  walk: ['Walk', 'Walking'],
  dash: ['Punch', 'Headbutt'],
  charge: ['Duck', 'Idle'],
  air: ['Jump_Idle', 'Jump', 'WalkJump'],
  land: ['Jump_Land', 'Idle'],
  hurt: ['HitReact', 'HitRecieve', 'No'],
  fall: ['Jump_Idle', 'Jump', 'HitReact'],
  win: ['Wave', 'Dance', 'Yes'],
  cheer: ['Yes', 'Wave', 'ThumbsUp'],
  lose: ['Death', 'No'],
};
const ONCE = new Set(['dash', 'hurt', 'land', 'lose']);

const speciesCache = new Map();

/** Preload species GLBs and measure their height once. */
export async function loadSpecies(sharedAsset) {
  await Promise.all(SPECIES.map(async (sp) => {
    const gltf = await loadGLTF(sharedAsset(sp.file));
    const probe = SkeletonUtils.clone(gltf.scene);
    probe.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(probe, true);
    const h = box.max.y - box.min.y || 1;
    const scale = sp.scale || 0.56; // one factor for the monster set keeps their relative sizes
    speciesCache.set(sp.file, { gltf, scale, minY: box.min.y, height: h * scale });
  }));
}

function makeBadgeCanvas() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 150;
  return c;
}

function damageColor(d) {
  // white -> yellow -> orange -> red -> deep red
  const stops = [[0, [255, 255, 255]], [40, [255, 230, 90]], [80, [255, 150, 40]], [130, [255, 60, 40]], [200, [190, 20, 40]]];
  for (let i = 1; i < stops.length; i++) {
    if (d <= stops[i][0]) {
      const [d0, c0] = stops[i - 1];
      const [d1, c1] = stops[i];
      const k = (d - d0) / (d1 - d0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`;
    }
  }
  return 'rgb(190,20,40)';
}
export { damageColor };

function drawBadge(c, name, color, dmg, { crown = false, dim = false } = {}) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  // name pill
  g.font = '800 34px system-ui, sans-serif';
  const label = (crown ? '👑 ' : '') + name;
  const w = Math.min(248, g.measureText(label).width + 30);
  g.fillStyle = color;
  g.globalAlpha = dim ? 0.5 : 0.95;
  g.beginPath();
  g.roundRect((c.width - w) / 2, 4, w, 46, 23);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.strokeText(label, c.width / 2, 28, 236);
  g.fillText(label, c.width / 2, 28, 236);
  // damage %
  if (dmg !== null) {
    g.font = 'italic 900 70px system-ui, sans-serif';
    const txt = `${Math.round(dmg)}%`;
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(20,10,30,0.9)';
    g.strokeText(txt, c.width / 2, 102);
    g.fillStyle = damageColor(dmg);
    g.fillText(txt, c.width / 2, 102);
  }
}

const ringGeo = new THREE.RingGeometry(0.58, 0.78, 40);
ringGeo.rotateX(-Math.PI / 2);
const chargeGeo = new THREE.RingGeometry(0.8, 1, 48);
chargeGeo.rotateX(-Math.PI / 2);
const spikeGeo = new THREE.ConeGeometry(0.12, 0.45, 6);
spikeGeo.rotateZ(-Math.PI / 2);
const auraGeo = new THREE.SphereGeometry(1, 20, 14);

/** Create the visual for one fighter. `player` = {name, color, colorHex}. */
export function createFighterView(scene, player, speciesIdx) {
  const sp = SPECIES[speciesIdx % SPECIES.length];
  const data = speciesCache.get(sp.file);
  const root = new THREE.Group();
  const body = new THREE.Group(); // squash / tumble
  root.add(body);
  const model = SkeletonUtils.clone(data.gltf.scene);
  model.scale.setScalar(data.scale);
  model.position.y = -data.minY * data.scale;
  const mats = [];
  const bodyColor = new THREE.Color(player.colorHex);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const cloned = list.map((m) => {
      const c = m.clone();
      if (sp.body.test(m.name)) {
        c.color = bodyColor.clone();
        c.roughness = Math.min(c.roughness ?? 0.6, 0.55);
      }
      c.emissive = new THREE.Color(0x000000);
      mats.push(c);
      return c;
    });
    o.material = cloned.length === 1 ? cloned[0] : cloned;
  });
  body.add(model);

  // ground ring in player colour
  const ringMat = new THREE.MeshBasicMaterial({ color: player.colorHex, transparent: true, opacity: 0.85, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 2;
  scene.add(ring);
  const chargeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const chargeRing = new THREE.Mesh(chargeGeo, chargeMat);
  chargeRing.renderOrder = 2;
  scene.add(chargeRing);

  // name + damage badge
  const canvas = makeBadgeCanvas();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  badge.scale.set(1.9, 1.9 * (150 / 256), 1);
  badge.renderOrder = 998;
  scene.add(badge);
  let lastDmg = -1;
  let lastKey = '';

  // spikes power visual
  const spikes = new THREE.Group();
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd0d6e0, metalness: 0.9, roughness: 0.25, emissive: 0x8a3cff, emissiveIntensity: 0.4 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = new THREE.Mesh(spikeGeo, spikeMat);
    s.position.set(Math.cos(a) * 0.55, 0.7 + (i % 2) * 0.35, Math.sin(a) * 0.55);
    s.rotation.y = -a;
    spikes.add(s);
  }
  spikes.visible = false;
  root.add(spikes);
  const auraMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const aura = new THREE.Mesh(auraGeo, auraMat);
  aura.scale.set(0.8, 1.0, 0.8);
  aura.position.y = 0.75;
  root.add(aura);

  scene.add(root);

  // --- animation
  const mixer = new THREE.AnimationMixer(model);
  const clips = data.gltf.animations;
  const actions = {};
  for (const [key, names] of Object.entries(CLIPS)) {
    let clip = null;
    for (const n of names) { clip = clips.find((c) => c.name === n); if (clip) break; }
    if (!clip) clip = clips.find((c) => /idle/i.test(c.name)) || clips[0];
    const a = mixer.clipAction(clip);
    if (ONCE.has(key)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    actions[key] = a;
  }
  let cur = null;
  let curKey = '';
  let onceT = 0;
  function play(key, { fade = 0.12, speed = 1, force = false } = {}) {
    const a = actions[key];
    if (!a) return;
    if (a === cur && !force) { a.timeScale = speed; curKey = key; return; }
    a.reset();
    a.timeScale = speed;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (cur && cur !== a) a.crossFadeFrom(cur, fade, false);
    cur = a;
    curKey = key;
    if (ONCE.has(key)) onceT = (a.getClip().duration / speed) * 0.85;
  }
  play('idle');

  const flashCol = new THREE.Color();
  let flashT = 0;
  let squash = 0;
  let squashV = 0;
  let tumble = 0;
  let pose = null; // forced pose key: 'win' | 'cheer' | 'lose'
  let prevAir = false;
  let prevDash = 0;
  let prevStun = 0;

  const view = {
    root, player,
    get anim() { return curKey; },
    setPose(p) { pose = p; if (p) play(p, { fade: 0.2 }); },
    flash() { flashT = 0.14; },
    squash(v) { squashV += v; },
    update(f, dt, t, { crown = false, showDamage = true } = {}) {
      const visible = f.state === 'alive' || f.state === 'falling' || (f.state === 'idle' && pose);
      root.visible = visible && !(f.invuln > 0 && f.state === 'alive' && Math.floor(t * 12) % 2 === 0 && f.invuln < 1.8);
      ring.visible = f.state === 'alive' && f.y < 2.5;
      chargeRing.visible = f.charging;
      badge.visible = (f.state === 'alive' || (f.state === 'idle' && pose)) && f.y > -2;
      if (!visible) { badge.visible = false; ring.visible = false; return; }

      root.position.set(f.x, f.y, f.z);
      root.rotation.y = f.face;
      const sc = f.scale;
      root.scale.setScalar(sc);
      ring.position.set(f.x, f.groundY + 0.04, f.z);
      ring.scale.setScalar(sc * (1 + Math.sin(t * 4) * 0.04));
      ringMat.opacity = f.airborne ? 0.4 : 0.85;
      if (f.charging) {
        chargeRing.position.set(f.x, f.groundY + 0.05, f.z);
        const r = (2.0 + 2.4 * f.charge) * (f.power === 'mega' ? 1.5 : 1);
        chargeRing.scale.setScalar(r * (0.95 + Math.sin(t * 30) * 0.03));
        chargeMat.opacity = 0.25 + f.charge * 0.45;
        chargeMat.color.setHex(f.charge >= 1 ? 0xffe14d : player.colorHex);
      }

      // badge
      badge.position.set(f.x, f.y + (data.height + 0.35) * sc + 0.15, f.z);
      const dmgInt = Math.round(f.damage);
      const key = `${dmgInt}|${crown}|${showDamage}`;
      if (key !== lastKey) {
        drawBadge(canvas, player.name, player.color, showDamage ? dmgInt : null, { crown });
        tex.needsUpdate = true;
        if (dmgInt > lastDmg && lastDmg >= 0) badge.userData.pop = 0.25;
        lastDmg = dmgInt;
        lastKey = key;
      }
      const pop = badge.userData.pop || 0;
      if (pop > 0) badge.userData.pop = pop - dt;
      const bs = 1.45 * (1 + Math.max(0, pop) * 1.6);
      badge.scale.set(bs, bs * (150 / 256), 1);

      // power visuals
      spikes.visible = f.power === 'spikes';
      if (spikes.visible) spikes.rotation.y += dt * 4;
      if (f.power) {
        auraMat.color.setHex(f.power === 'mega' ? 0xff6a2a : f.power === 'feather' ? 0x5ae8ff : 0xb070ff);
        auraMat.opacity = 0.16 + Math.sin(t * 10) * 0.06 + (f.powerT < 1.5 ? Math.sin(t * 30) * 0.08 : 0);
      } else auraMat.opacity = 0;

      // hit flash (emissive)
      if (f.hitFlash > 0.15) flashT = Math.max(flashT, 0.1);
      if (flashT > 0) {
        flashT -= dt;
        flashCol.setRGB(1, 1, 1).multiplyScalar(Math.max(0, flashT / 0.14) * 1.2);
        mats.forEach((m) => m.emissive.copy(flashCol));
      } else if (f.charging && f.charge >= 1) {
        const k = (Math.sin(t * 25) * 0.5 + 0.5) * 0.35;
        mats.forEach((m) => m.emissive.setRGB(k, k * 0.8, 0));
      } else mats[0]?.emissive.getHex() && mats.forEach((m) => m.emissive.setRGB(0, 0, 0));

      // squash & stretch spring
      if (f.airborne && !prevAir && f.vy > 0) squashV += 3;
      if (!f.airborne && prevAir) squashV -= 5;
      squashV += (-squash * 180 - squashV * 12) * dt;
      squash += squashV * dt;
      const chargeSquash = f.charging ? -0.12 * f.charge : 0;
      const sy = 1 + squash * 0.25 + chargeSquash;
      body.scale.set(1 / Math.sqrt(Math.max(0.5, sy)), sy, 1 / Math.sqrt(Math.max(0.5, sy)));
      if (f.charging && f.charge > 0.2) body.position.x = Math.sin(t * 60) * 0.03 * f.charge;
      else body.position.x = 0;

      // tumble when launched / falling
      if (f.state === 'falling') { tumble += dt * 9; body.rotation.x = tumble; }
      else if (f.stun > 0.25 && f.speed > 9) { tumble += dt * 14; body.rotation.x = tumble; }
      else { tumble = 0; body.rotation.x *= Math.max(0, 1 - dt * 12); }

      // animation state
      if (onceT > 0) onceT -= dt;
      if (pose) {
        // forced pose (victory etc.)
      } else if (f.state === 'falling') {
        if (curKey !== 'fall') play('fall', { speed: 1.6 });
      } else if (f.stun > 0 && (prevStun <= 0 || f.stun > prevStun + 0.05)) {
        play('hurt', { force: true, speed: 1.4 });
      } else if (f.dashT > 0 && prevDash <= 0) {
        play('dash', { force: true, speed: 2.2, fade: 0.05 });
      } else if (onceT > 0 && (curKey === 'dash' || curKey === 'hurt' || curKey === 'land')) {
        // let the one-shot play out
      } else if (f.airborne) {
        if (curKey !== 'air') play('air');
      } else if (!f.airborne && prevAir) {
        play('land', { force: true, speed: 1.5, fade: 0.05 });
      } else if (f.charging) {
        if (curKey !== 'charge') play('charge', { fade: 0.1 });
      } else if (f.speed > 0.7) {
        play('run', { speed: Math.min(1.6, 0.6 + f.speed / 6) });
      } else {
        play('idle');
      }
      prevAir = f.airborne;
      prevDash = f.dashT;
      prevStun = f.stun;
      mixer.update(dt);
    },
    dispose() {
      scene.remove(root, ring, chargeRing, badge);
      mixer.stopAllAction();
      mats.forEach((m) => m.dispose());
      ringMat.dispose(); chargeMat.dispose(); auraMat.dispose(); spikeMat.dispose();
      tex.dispose();
      badge.material.dispose();
    },
  };
  return view;
}
