// Model helpers: normalized loading (by target height), instanced scattering, clip lookup.
import { THREE, loadGLTF, loadModel } from '../../sdk/three-kit.js';

const bboxCache = new Map();
const Y = new THREE.Vector3(0, 1, 0);

async function gltfBox(url) {
  if (!bboxCache.has(url)) {
    bboxCache.set(url, loadGLTF(url).then((g) => {
      g.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.scene, true);
      return box;
    }));
  }
  return bboxCache.get(url);
}

/**
 * Load a model scaled so its height is `height` (or its largest side is `size`), feet at y=0, centred on x/z.
 * Returns a Group wrapper (so callers can freely position/rotate/scale it) with .userData.inner = the clone.
 */
export async function model(url, { height, size, center = true, shadows = true } = {}) {
  const [inner, box] = await Promise.all([loadModel(url, { castShadow: shadows, receiveShadow: shadows }), gltfBox(url)]);
  const dims = box.getSize(new THREE.Vector3());
  let s = 1;
  if (height) s = height / (dims.y || 1);
  else if (size) s = size / (Math.max(dims.x, dims.y, dims.z) || 1);
  inner.scale.multiplyScalar(s);
  if (center) inner.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  const g = new THREE.Group();
  g.add(inner);
  g.userData.inner = inner;
  g.userData.animations = inner.userData.animations;
  g.userData.dims = dims.clone().multiplyScalar(s);
  return g;
}

/**
 * Scatter many copies of one (static) model with InstancedMesh per sub-mesh.
 * list: [{ x, y, z, rot, h }] where h = target height (or `s` = raw scale).
 */
export async function instanced(url, list, { shadows = true, receive = true, tintColor = null } = {}) {
  const group = new THREE.Group();
  if (!list.length) return group;
  const gltf = await loadGLTF(url);
  const box = await gltfBox(url);
  const dims = box.getSize(new THREE.Vector3());
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const off = new THREE.Matrix4();
  for (const mesh of meshes) {
    let mat = mesh.material;
    if (tintColor) { mat = mat.clone(); mat.color = new THREE.Color(tintColor); }
    const im = new THREE.InstancedMesh(mesh.geometry, mat, list.length);
    list.forEach((pl, i) => {
      const s = pl.s ?? (pl.h ? pl.h / (dims.y || 1) : 1);
      off.makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      q.setFromAxisAngle(Y, pl.rot || 0);
      sc.setScalar(s);
      p.set(pl.x, pl.y || 0, pl.z);
      m4.compose(p, q, sc).multiply(off).multiply(mesh.matrixWorld);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = shadows;
    im.receiveShadow = receive;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}

// Animation clip name candidates (models in the library use different naming schemes).
const CLIPS = {
  idle: ['Idle', 'idle', 'Idle_Neutral', 'Flying_Idle', 'Standing'],
  run: ['Run', 'Running', 'Running_A', 'sprint', 'Walk', 'walk', 'Walking'],
  walk: ['Walk', 'walk', 'Walking', 'Walking_A'],
  jump: ['Jump', 'jump', 'Jump_Idle', 'WalkJump', 'Jump_Full_Short'],
  win: ['Dance', 'Wave', 'Yes', 'ThumbsUp', 'Cheer', 'emote-yes', 'Hello'],
  wave: ['Wave', 'Hello', 'Yes', 'emote-yes', 'Dance'],
  yes: ['Yes', 'ThumbsUp', 'emote-yes', 'Wave'],
  sad: ['No', 'emote-no', 'HitReact', 'HitRecieve', 'Death'],
  hit: ['HitReact', 'HitRecieve', 'HitRecieve_1', 'Hit_A', 'No'],
  die: ['Death', 'die', 'Death_A'],
  punch: ['Punch', 'Weapon', 'Headbutt', 'attack-melee-right', 'Kick'],
};

/** Mixer wrapper that plays semantic clips ('idle', 'run', 'win', …) with crossfades. */
export function rig(obj) {
  const clips = obj.userData.animations || [];
  const root = obj.userData.inner || obj;
  const mixer = new THREE.AnimationMixer(root);
  const find = (key) => {
    const cands = CLIPS[key] || [key];
    for (const c of cands) {
      const clip = clips.find((x) => x.name === c) || clips.find((x) => x.name.toLowerCase() === c.toLowerCase());
      if (clip) return clip;
    }
    return null;
  };
  let current = null;
  let currentKey = '';
  return {
    mixer,
    has: (key) => !!find(key),
    play(key, { fade = 0.18, once = false, timeScale = 1, force = false } = {}) {
      const clip = find(key);
      if (!clip) return null;
      if (currentKey === key && !force && !once) return current;
      const action = mixer.clipAction(clip);
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = once;
      action.timeScale = timeScale;
      action.reset().fadeIn(fade).play();
      if (current && current !== action) current.fadeOut(fade);
      current = action;
      currentKey = key;
      return action;
    },
    duration(key) { return find(key)?.duration || 1; },
    get key() { return currentKey; },
    update(dt) { mixer.update(dt); },
  };
}
