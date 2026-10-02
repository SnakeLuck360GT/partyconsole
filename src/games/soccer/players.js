// Player visuals: Kenney mini characters wearing recoloured team kits (shirt + sleeves -> jersey colour,
// trousers -> shorts colour, via UV remap into the palette's white cell + vertex colours), a ground ring in the
// player's own colour, a billboard name tag, and an animation state machine driven by a small "pose" struct
// (so the same code renders live play and the goal replay).
import { THREE, loadGLTF, SkeletonUtils } from '../../sdk/three-kit.js';

export const ROSTER = [
  'male-a', 'female-a', 'male-b', 'female-b', 'male-c', 'female-c',
  'male-d', 'female-d', 'male-e', 'female-e', 'male-f', 'female-f',
].map((n) => `characters/mini/${n}.glb`);

const HEIGHT = 1.75;
const CLIPS = {
  idle: ['idle'], walk: ['walk'], run: ['sprint'], kick: ['attack-kick-right'], pass: ['attack-kick-left'],
  slide: ['crouch'], fall: ['fall', 'die'], cheer: ['emote-yes'], sad: ['emote-no'], jump: ['jump'],
};
const ONCE = new Set(['kick', 'pass', 'cheer', 'sad', 'jump']);

const cache = new Map(); // file -> { gltf, scale, minY }
const kitCache = new Map(); // file|jersey|shorts -> BufferGeometry

export async function loadRoster(sharedAsset) {
  await Promise.all(ROSTER.map(async (file) => {
    const gltf = await loadGLTF(sharedAsset(file));
    const probe = SkeletonUtils.clone(gltf.scene);
    probe.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(probe, true);
    const h = box.max.y - box.min.y || 0.75;
    // one scale for the whole set keeps their relative heights
    cache.set(file, { gltf, scale: HEIGHT / 0.74, minY: box.min.y, h });
  }));
}

const cellOf = (u, v) => Math.floor(Math.min(0.999, Math.max(0, u)) * 16) + Math.floor(Math.min(0.999, Math.max(0, v)) * 4) * 16;

/** Build (once) a kit variant of a body geometry: shirt cells -> jersey, trouser cell -> shorts. */
function kitGeometry(file, mesh, jersey, shorts) {
  const key = `${file}|${jersey}|${shorts}`;
  if (kitCache.has(key)) return kitCache.get(key);
  const src = mesh.geometry;
  const g = src.clone();
  const uv = g.attributes.uv;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const n = uv.count;
  const part = new Array(n);
  const cells = new Array(n);
  const torsoCount = new Map();
  const legCount = new Map();
  let torsoN = 0;
  for (let i = 0; i < n; i++) {
    let best = 0; let bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    const name = bones[best]?.name || '';
    const pt = /torso/.test(name) ? 't' : /arm/.test(name) ? 'a' : /leg/.test(name) ? 'l' : 'o';
    part[i] = pt;
    const c = cellOf(uv.getX(i), uv.getY(i));
    cells[i] = c;
    if (pt === 't') { torsoCount.set(c, (torsoCount.get(c) || 0) + 1); torsoN++; }
    if (pt === 'l') legCount.set(c, (legCount.get(c) || 0) + 1);
  }
  const shirt = new Set();
  let top = null;
  for (const [c, k] of torsoCount) { if (k >= torsoN * 0.25) shirt.add(c); if (!top || k > top[1]) top = [c, k]; }
  if (top) shirt.add(top[0]);
  let trousers = -1; let tk = 0;
  for (const [c, k] of legCount) if (k > tk) { tk = k; trousers = c; }
  const colors = new Float32Array(n * 3).fill(1);
  const cj = new THREE.Color(jersey);
  const cs = new THREE.Color(shorts);
  for (let i = 0; i < n; i++) {
    let col = null;
    if ((part[i] === 't' || part[i] === 'a') && shirt.has(cells[i])) col = cj;
    else if (part[i] === 'l' && cells[i] === trousers) col = cs;
    if (!col) continue;
    const fu = (uv.getX(i) * 16) % 1;
    const fv = (uv.getY(i) * 4) % 1;
    uv.setXY(i, (8 + fu * 0.9 + 0.05) / 16, (3 + fv * 0.9 + 0.05) / 4); // the flat white palette cell
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  kitCache.set(key, g);
  return g;
}

export function disposeKits() {
  for (const g of kitCache.values()) g.dispose();
  kitCache.clear();
}

// ---------------------------------------------------------------- name tags

function drawTag(c, name, teamCss, bot) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = '700 46px Fredoka, system-ui, sans-serif';
  const tw = Math.min(c.width - 40, g.measureText(name).width);
  const w = tw + 34;
  const x0 = (c.width - w) / 2;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.roundRect(x0, 8, w, 60, 16); g.fill();
  g.fillStyle = bot ? '#2a2f3d' : teamCss;
  g.beginPath(); g.roundRect(x0, 3, w, 60, 16); g.fill();
  g.fillStyle = bot ? 'rgba(255,255,255,0.75)' : '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.strokeText(name, c.width / 2, 35, c.width - 40);
  g.fillText(name, c.width / 2, 35, c.width - 40);
}

const ringGeo = new THREE.RingGeometry(0.5, 0.68, 36);
ringGeo.rotateX(-Math.PI / 2);
const arrowGeo = new THREE.ConeGeometry(0.16, 0.34, 3);
arrowGeo.rotateX(Math.PI / 2);
const chargeGeo = new THREE.RingGeometry(0.72, 0.86, 40, 1, 0, Math.PI * 2);
chargeGeo.rotateX(-Math.PI / 2);

/** A reusable pose struct (live sim player or replay frame). */
export function makePose() {
  return { x: 0, z: 0, face: 0, speed: 0, kickAnim: 0, passAnim: 0, slide: 0, stun: 0, charging: false, charge: 0, hasBall: false, sprint: false };
}

/**
 * opts: { name, team (0/1), teamCss, jersey, shorts, ringColor (hex|null), bot, keeper, modelIdx }
 */
export function createPlayerView(scene, opts) {
  const file = ROSTER[opts.modelIdx % ROSTER.length];
  const data = cache.get(file);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const model = SkeletonUtils.clone(data.gltf.scene);
  model.scale.setScalar(data.scale);
  model.position.y = -data.minY * data.scale;
  const mats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false;
    if (o.isSkinnedMesh && /body/.test(o.name)) {
      o.geometry = kitGeometry(file, o, opts.jersey, opts.shorts);
      const m = o.material.clone();
      m.vertexColors = true;
      m.emissive = new THREE.Color(0);
      o.material = m;
      mats.push(m);
    } else {
      const m = o.material.clone();
      m.emissive = new THREE.Color(0);
      o.material = m;
      mats.push(m);
    }
  });
  body.add(model);
  scene.add(root);

  // ground ring: player's own colour for humans, faint team colour for CPU
  const ringMat = new THREE.MeshBasicMaterial({ color: opts.ringColor ?? opts.jersey, transparent: true, opacity: opts.ringColor != null ? 0.9 : 0.35, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 2;
  const arrow = new THREE.Mesh(arrowGeo, ringMat);
  arrow.renderOrder = 2;
  ring.add(arrow);
  arrow.position.set(0, 0.02, 0.86);
  arrow.rotation.x = -Math.PI / 2;
  arrow.rotation.z = Math.PI;
  arrow.visible = opts.ringColor != null;
  scene.add(ring);
  const chargeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const chargeRing = new THREE.Mesh(chargeGeo, chargeMat);
  chargeRing.renderOrder = 3;
  scene.add(chargeRing);

  // name tag
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 72;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  tag.renderOrder = 999;
  tag.center.set(0.5, 0);
  scene.add(tag);
  let tagScale = 1;
  function setTag(name, bot) {
    drawTag(canvas, name, opts.teamCss, bot);
    tex.needsUpdate = true;
  }
  setTag(opts.name, opts.bot);

  // animation
  const mixer = new THREE.AnimationMixer(model);
  const clips = data.gltf.animations;
  const actions = {};
  for (const [key, names] of Object.entries(CLIPS)) {
    let clip = null;
    for (const nm of names) { clip = clips.find((c) => c.name === nm); if (clip) break; }
    if (!clip) clip = clips.find((c) => c.name === 'idle') || clips[0];
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
    if (a === cur && !force) { a.timeScale = speed; return; }
    a.reset();
    a.timeScale = speed;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (cur && cur !== a) a.crossFadeFrom(cur, fade, false);
    cur = a;
    curKey = key;
    onceT = ONCE.has(key) ? (a.getClip().duration / speed) * 0.9 : 0;
  }
  play('idle');

  let celebrate = null; // 'cheer' | 'sad' | null
  let prevKick = 0;
  let prevPass = 0;
  let lean = 0;
  let flashT = 0;
  let hop = 0;
  let celebT = 0;

  return {
    root,
    get anim() { return curKey; },
    setCelebrate(kind) { celebrate = kind; celebT = 0; if (kind) play(kind, { force: true, fade: 0.2 }); },
    setName(name, bot) { setTag(name, bot); ringMat.opacity = bot ? 0.35 : 0.9; },
    setRing(hex) { ringMat.color.setHex(hex ?? opts.jersey); ringMat.opacity = hex != null ? 0.9 : 0.35; arrow.visible = hex != null; },
    flash() { flashT = 0.15; },
    setVisible(v) { root.visible = v; ring.visible = v; tag.visible = v; if (!v) chargeRing.visible = false; },
    /** cam: camera (for tag scale by distance). dt may be scaled (slow-mo). */
    update(ps, dt, t, cam, tagMul = 1) {
      if (!root.visible) return;
      root.position.set(ps.x, 0, ps.z);
      root.rotation.y = Math.PI / 2 - ps.face;
      ring.position.set(ps.x, 0.03, ps.z);
      ring.rotation.y = Math.PI / 2 - ps.face;
      const own = ps.hasBall ? 1.18 : 1;
      ring.scale.setScalar(own);
      chargeRing.visible = ps.charging;
      if (ps.charging) {
        chargeRing.position.set(ps.x, 0.04, ps.z);
        chargeRing.scale.setScalar(1 + ps.charge * 0.9);
        chargeMat.opacity = 0.35 + ps.charge * 0.55;
        chargeMat.color.setHex(ps.charge >= 1 ? 0xffd23a : 0xffffff);
      }
      // tag: constant-ish screen size
      const d = cam.position.distanceTo(root.position);
      tagScale = Math.max(0.9, d * 0.034) * tagMul;
      tag.scale.set(tagScale * 1.6, tagScale * 0.36, 1);
      tag.position.set(ps.x, HEIGHT + 0.25 + hop, ps.z);

      // slide: lean back and drop; stun: tip over a bit
      const wantLean = ps.slide > 0 ? -1.15 : ps.stun > 0.3 ? 0.5 : 0;
      lean += (wantLean - lean) * Math.min(1, dt * 16);
      body.rotation.x = lean;
      body.position.y = ps.slide > 0 ? 0.25 : 0;
      if (celebrate === 'cheer') {
        celebT += dt;
        hop = Math.abs(Math.sin(celebT * 7)) * 0.5;
        body.position.y += hop;
      } else hop = 0;

      if (flashT > 0) {
        flashT -= dt;
        const k = Math.max(0, flashT / 0.15);
        for (const m of mats) m.emissive.setRGB(k, k, k);
      } else if (ps.charging && ps.charge >= 1) {
        const k = (Math.sin(t * 26) * 0.5 + 0.5) * 0.3;
        for (const m of mats) m.emissive.setRGB(k, k * 0.8, 0);
      } else if (mats[0].emissive.r !== 0) for (const m of mats) m.emissive.setRGB(0, 0, 0);

      // animation state
      if (onceT > 0) onceT -= dt;
      if (celebrate) {
        if (onceT <= 0 && celebrate === 'cheer') play('cheer', { force: true });
      } else if (ps.kickAnim > prevKick + 0.05) {
        play('kick', { force: true, speed: 2.2, fade: 0.05 });
      } else if (ps.passAnim > prevPass + 0.05) {
        play('kick', { force: true, speed: 2.6, fade: 0.05 });
      } else if (ps.slide > 0) {
        if (curKey !== 'slide') play('slide', { fade: 0.05 });
      } else if (ps.stun > 0) {
        if (curKey !== 'fall') play('fall', { fade: 0.1 });
      } else if (onceT > 0 && (curKey === 'kick' || curKey === 'pass')) {
        // let the kick play out
      } else if (ps.speed > 5.5) {
        play('run', { speed: Math.min(1.5, 0.55 + ps.speed / 11) });
      } else if (ps.speed > 0.6) {
        play('walk', { speed: Math.min(2.2, 0.6 + ps.speed / 3) });
      } else {
        play('idle');
      }
      prevKick = ps.kickAnim;
      prevPass = ps.passAnim;
      mixer.update(dt);
    },
    dispose() {
      scene.remove(root, ring, chargeRing, tag);
      mixer.stopAllAction();
      mats.forEach((m) => m.dispose());
      ringMat.dispose(); chargeMat.dispose();
      tex.dispose();
      tag.material.dispose();
    },
  };
}
