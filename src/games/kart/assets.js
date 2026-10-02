// Model loading: instancing prototypes, the racer roster (Kenney karts + seated rigged drivers),
// per-racer tint / flash / star-rainbow material patches, and optional user-supplied custom models
// (public/assets/kart/custom/karts.json, see the README there).
import * as THREE from 'three';
import { loadGLTF, loadModel, animator } from '../../sdk/three-kit.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/** Native size of a Kenney kart: 0.97 W x 1.33 H (with driver) x 1.43 L. Everything is normalised to it. */
export const KART_NATIVE = { w: 0.97, l: 1.43 };

import { DRIVERS, KARTS } from './roster.js';

export { DRIVERS, KARTS, PAINTS, combineStats, driverById, kartById, paintById } from './roster.js';

// Kept for older imports: default 8-racer roster pairing.
export const ROSTER = DRIVERS.slice(0, 8).map((d, i) => ({ ...d, driver: d.file, kart: KARTS[i % KARTS.length].file, accent: KARTS[i % KARTS.length].accent, driverScale: d.scale }));

const protoCache = new Map();

/**
 * Load a GLB and flatten it to [{geometry, material, matrix}] (matrix relative to the model root),
 * plus its bounding box, for use with InstancedMesh.
 */
export async function loadProto(url) {
  if (protoCache.has(url)) return protoCache.get(url);
  const p = (async () => {
    const gltf = await loadGLTF(url);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const parts = [];
    root.traverse((o) => {
      if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
    });
    const box = new THREE.Box3().setFromObject(root);
    return { url, parts, box, size: box.getSize(new THREE.Vector3()) };
  })();
  protoCache.set(url, p);
  return p;
}

/** Safe version: resolves null on failure so one broken model can't kill the game. */
export async function tryProto(url) {
  try { return await loadProto(url); } catch (err) { console.warn('[kart] model failed', url, err); return null; }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Create InstancedMeshes for `proto` at `list` of {x, y, z, ry, s (uniform) | sx,sy,sz, rx, rz}.
 * y is the ground height: the model's bbox bottom is placed on it.
 */
export function instance(parent, proto, list, opts = {}) {
  if (!proto || !list.length) return [];
  // Spatial chunks (~70 m cells): each chunk is its own InstancedMesh with a tight bounding sphere, so the
  // main and shadow passes frustum-cull whole chunks instead of drawing every tree on the map in every viewport.
  const CELL = 70;
  if (list.length <= 12 || opts.noChunk) return instanceChunk(parent, proto, list, opts);
  const cells = new Map();
  for (const t of list) {
    const key = `${Math.floor(t.x / CELL)},${Math.floor(t.z / CELL)}`;
    let c = cells.get(key);
    if (!c) { c = []; cells.set(key, c); }
    c.push(t);
  }
  const out = [];
  for (const c of cells.values()) out.push(...instanceChunk(parent, proto, c, opts));
  return out;
}

function instanceChunk(parent, proto, list, { castShadow = true, receiveShadow = true, materialMap = null, center = true } = {}) {
  const meshes = [];
  const cx = center ? (proto.box.min.x + proto.box.max.x) / 2 : 0;
  const cz = center ? (proto.box.min.z + proto.box.max.z) / 2 : 0;
  const off = new THREE.Matrix4().makeTranslation(-cx, 0, -cz);
  for (const part of proto.parts) {
    const mat = materialMap ? materialMap(part.material) : part.material;
    const im = new THREE.InstancedMesh(part.geometry, mat, list.length);
    im.castShadow = castShadow;
    im.receiveShadow = receiveShadow;
    list.forEach((t, i) => {
      const sx = t.sx ?? t.s ?? 1; const sy = t.sy ?? t.s ?? 1; const sz = t.sz ?? t.s ?? 1;
      _e.set(t.rx || 0, t.ry || 0, t.rz || 0, 'YXZ');
      _q.setFromEuler(_e);
      _s.set(sx, sy, sz);
      _p.set(t.x, t.y - (t.noLift ? 0 : proto.box.min.y * sy), t.z);
      _m.compose(_p, _q, _s).multiply(off).multiply(part.matrix);
      im.setMatrixAt(i, _m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    parent.add(im);
    meshes.push(im);
  }
  return meshes;
}

/** Clone of a proto as a normal Object3D (for animated/unique props). */
export function protoObject(proto) {
  const g = new THREE.Group();
  for (const part of proto.parts) {
    const m = new THREE.Mesh(part.geometry, part.material);
    m.matrixAutoUpdate = false;
    m.matrix.copy(part.matrix);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

// ------------------------------------------------------------------ material patches

const FX_HEADER = 'uniform float uFlash;\nuniform float uStar;\nuniform float uTime;\n';
const FX_EMISSIVE = `
  if ( uStar > 0.0 ) {
    float hh = fract( uTime * 0.9 + ( vViewPosition.y + vViewPosition.x ) * 0.06 );
    vec3 rb = clamp( abs( mod( hh * 6.0 + vec3( 0.0, 4.0, 2.0 ), 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, rb, 0.55 * uStar );
    totalEmissiveRadiance += rb * 0.85 * uStar;
  }
  totalEmissiveRadiance += vec3( uFlash );`;

/**
 * Clone a material and patch in the per-racer effects (hit flash, star rainbow). `fx` holds the shared
 * uniform objects of one racer. Optionally re-tints the Kenney colormap body cell.
 */
function patchMaterial(src, fx, { bodyTint = null, accentCell = null } = {}) {
  const m = src.clone();
  const tintKey = bodyTint ? `t${accentCell ? accentCell.join('') : ''}` : '';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = fx.flash;
    shader.uniforms.uStar = fx.star;
    shader.uniforms.uTime = fx.time;
    let fs = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FX_HEADER}${bodyTint ? 'uniform vec3 uTint;\n' : ''}`);
    if (bodyTint) {
      shader.uniforms.uTint = fx.tint;
      const [ax, ay] = accentCell || [-1, -1];
      fs = fs.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec2 kCell = floor( fract( vMapUv ) * vec2( 8.0, 4.0 ) );
  float kLum = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  if ( kCell.x == 5.0 && kCell.y == 2.0 ) sampledDiffuseColor.rgb = uTint * ( 0.35 + 0.85 * kLum );
  diffuseColor *= sampledDiffuseColor;
#endif`);
      void ax; void ay;
    }
    fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FX_EMISSIVE}`);
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `kartfx-${tintKey}`;
  // never let a model come out see-through
  m.transparent = false;
  m.opacity = 1;
  m.depthWrite = true;
  m.alphaTest = 0;
  m.side = THREE.FrontSide;
  return m;
}

function patchAll(obj, fx, opts = {}) {
  const cache = new Map();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((mat) => {
      const key = mat.uuid + (opts.match && opts.match(o, mat) ? 't' : '');
      if (!cache.has(key)) {
        const tintThis = opts.match ? opts.match(o, mat) : false;
        const pm = patchMaterial(mat, fx, tintThis ? { bodyTint: true, accentCell: opts.accentCell } : {});
        if (tintThis && opts.lerpTint && pm.color) pm.color.lerp(fx.tint.value, opts.lerpTint);
        cache.set(key, pm);
      }
      return cache.get(key);
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  return [...cache.values()];
}

// ------------------------------------------------------------------ custom models

/** Fetch public/assets/kart/custom/karts.json. Missing (404) or invalid -> null, silently. */
export async function loadCustomConfig(assetUrl) {
  try {
    const res = await fetch(assetUrl('custom/karts.json'), { cache: 'no-cache' });
    if (!res.ok) return null;
    const txt = await res.text();
    if (!txt.trim().startsWith('{') && !txt.trim().startsWith('[')) return null; // SPA fallback html
    const j = JSON.parse(txt);
    const karts = Array.isArray(j) ? j : Array.isArray(j.karts) ? j.karts : [];
    const tracks = Array.isArray(j.tracks) ? j.tracks : [];
    if (!karts.length && !tracks.length) return null;
    console.info(`[kart] custom models: ${karts.length} kart(s), ${tracks.length} track(s)`);
    return { karts, tracks };
  } catch (err) {
    console.warn('[kart] custom/karts.json could not be parsed, using defaults', err);
    return null;
  }
}

function normaliseTo(obj, { length = KART_NATIVE.l, height = null } = {}) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  let k = 1;
  if (height) k = height / Math.max(1e-4, size.y);
  else k = length / Math.max(1e-4, Math.max(size.z, size.x * 0.9));
  if (!Number.isFinite(k) || k <= 0) k = 1;
  const g = new THREE.Group();
  g.add(obj);
  obj.scale.multiplyScalar(k);
  obj.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
  return g;
}

// ------------------------------------------------------------------ racer model

/**
 * Build the visual of one racer: kart (tinted body) with a seated, animated driver.
 * pick = { driver: DRIVERS entry, kart: KARTS entry } or custom = karts.json entry (kart + optional driver).
 * Returns { root, wheels: {fl, fr, bl, br, extra[]}, driver: {obj, anim, base}, fx, ok }.
 * `root` is in native kart units (scale it by KART_SCALE). Never throws: falls back to a visible stand-in.
 */
export async function buildRacerModel({ driver = DRIVERS[0], kart = KARTS[1], color, custom = null, sharedAsset, asset, noDriver = false }) {
  const fx = {
    flash: { value: 0 }, star: { value: 0 }, time: { value: 0 },
    tint: { value: new THREE.Color(color) },
  };
  const root = new THREE.Group();
  const wheels = { extra: [] };
  let drv = null;
  let ok = true;
  let kartObj = null;

  // ---- kart
  try {
    if (custom?.kart) {
      const raw = await loadModel(asset(`custom/${custom.kart}`));
      if (custom.rotationY) raw.rotation.y = custom.rotationY * Math.PI / 180;
      kartObj = normaliseTo(raw);
      kartObj.scale.multiplyScalar(custom.scale || 1);
      if (Array.isArray(custom.offset)) kartObj.position.add(new THREE.Vector3(...custom.offset));
      const tre = custom.tintMaterial ? new RegExp(custom.tintMaterial, 'i') : null;
      patchAll(kartObj, fx, { match: tre ? (o, m) => tre.test(m.name) || tre.test(o.name) : null, lerpTint: 0.65 });
      const wre = custom.wheels ? new RegExp(custom.wheels, 'i') : null;
      if (wre) {
        kartObj.traverse((o) => {
          if (!wre.test(o.name)) return;
          const n = o.name.toLowerCase();
          o.rotation.order = 'YXZ';
          if (n.includes('front') && n.includes('left')) wheels.fl = o;
          else if (n.includes('front') && n.includes('right')) wheels.fr = o;
          else wheels.extra.push(o);
        });
      }
    } else {
      kartObj = await loadModel(sharedAsset(kart.file));
      let builtIn = null;
      kartObj.traverse((o) => {
        const n = o.name.toLowerCase();
        if (n.includes('wheel-front-left')) wheels.fl = o;
        else if (n.includes('wheel-front-right')) wheels.fr = o;
        else if (n.includes('wheel-back-left')) wheels.bl = o;
        else if (n.includes('wheel-back-right')) wheels.br = o;
        else if (n === 'character') builtIn = o;
      });
      for (const k of ['fl', 'fr', 'bl', 'br']) if (wheels[k]) wheels[k].rotation.order = 'YXZ';
      kartObj.userData.builtInDriver = builtIn;
      patchAll(kartObj, fx, { match: (o) => /^kart/i.test(o.name), accentCell: kart.accent });
    }
    const box = new THREE.Box3().setFromObject(kartObj);
    if (box.isEmpty() || !Number.isFinite(box.min.y)) throw new Error('empty kart model');
    root.add(kartObj);
  } catch (err) {
    console.warn('[kart] kart model failed, using a fallback kart', custom?.kart || kart?.file, err);
    ok = false;
    kartObj = fallbackKart(color, wheels);
    root.add(kartObj);
  }

  // ---- driver (rigged, plays a seated clip; the kart's static built-in driver is hidden)
  const driverUrl = noDriver ? null : custom?.driver ? asset(`custom/${custom.driver}`) : custom?.kart ? null : sharedAsset(driver.file);
  if (driverUrl) {
    try {
      const d = await loadModel(driverUrl);
      let holder;
      if (custom?.driver) {
        holder = normaliseTo(d, { height: 0.8 });
        holder.scale.multiplyScalar(custom.driverScale || 1);
      } else {
        holder = new THREE.Group();
        holder.add(d);
        holder.scale.setScalar(driver.scale || 1);
        for (const n of driver.hide || []) { const o = d.getObjectByName(n); if (o) o.visible = false; }
      }
      patchAll(holder, fx);
      holder.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
      const anim = animator(d);
      const clip = custom?.driverClip || driver?.clip || 'drive';
      if (!anim.play(clip, { fade: 0 })) anim.play('drive', { fade: 0 }) || anim.play('sit', { fade: 0 }) || anim.play('idle', { fade: 0 });
      const lean = new THREE.Group();
      if (custom?.driver) lean.position.copy(Array.isArray(custom.driverOffset) ? new THREE.Vector3(...custom.driverOffset) : SEAT);
      else lean.position.set(0, driver.y ?? SEAT.y, driver.z ?? SEAT.z);
      lean.add(holder);
      kartObj.add(lean);
      drv = { obj: lean, inner: holder, anim, base: lean.position.clone(), clip };
      if (kartObj.userData.builtInDriver) kartObj.userData.builtInDriver.visible = false;
    } catch (err) {
      console.warn('[kart] driver model failed, keeping the built-in driver', driverUrl, err);
    }
  } else if (noDriver && kartObj.userData.builtInDriver) kartObj.userData.builtInDriver.visible = false;
  if (!drv && !noDriver && kartObj.userData.builtInDriver) {
    const b = kartObj.userData.builtInDriver;
    drv = { obj: b, inner: b, anim: null, base: b.position.clone() };
  }

  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return { root, wheels, driver: drv, fx, ok };
}

/** Visible stand-in if a kart GLB fails to load (never leave a racer without a kart). */
function fallbackKart(color, wheels) {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 1.3), body);
  shell.position.y = 0.3;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.4), body);
  nose.position.set(0, 0.36, 0.55);
  const seat = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  seat.position.set(0, 0.62, -0.12);
  root.add(shell, nose, seat);
  root.userData.builtInDriver = seat;
  for (const [k, x, z] of [['fl', 0.4, 0.42], ['fr', -0.4, 0.42], ['bl', 0.4, -0.4], ['br', -0.4, -0.4]]) {
    const w = new THREE.Group();
    w.position.set(x, 0.18, z);
    w.rotation.order = 'YXZ';
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.16, 14).rotateZ(Math.PI / 2), dark);
    w.add(m);
    root.add(w);
    wheels[k] = w;
  }
  return root;
}

/** Deep clone helper for skinned props (re-export so other modules don't import SkeletonUtils). */
export const cloneSkinned = (o) => SkeletonUtils.clone(o);
