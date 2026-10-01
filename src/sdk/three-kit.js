// three.js helpers so every 3D game gets the same good-looking baseline:
// ACES tone mapping, soft shadows, image-based lighting, resize handling and a frame loop.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export { THREE, SkeletonUtils };

/**
 * createStage(container, opts) -> { renderer, scene, camera, sun, onFrame(fn), dispose() }
 * onFrame callbacks receive (dt seconds, elapsed seconds). dt is clamped to 0.05.
 */
export function createStage(container, {
  background = 0x87b5ff,
  fog = null, // e.g. { near: 40, far: 160 }
  shadows = true,
  fov = 50,
  envIntensity = 0.6,
  sunIntensity = 2.2,
  shadowArea = 40,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  if (fog) scene.fog = new THREE.Fog(background, fog.near, fog.far);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = envIntensity;

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, sunIntensity);
  sun.position.set(20, 35, 15);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const s = shadowArea;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 120 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const frameFns = new Set();
  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    for (const fn of frameFns) fn(dt, t);
    renderer.render(scene, camera);
  }
  loop();

  return {
    renderer, scene, camera, sun, hemi,
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      frameFns.clear();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose(); });
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // dispose() alone keeps the GL context alive; browsers cap live contexts (~16)
      renderer.domElement.remove();
    },
  };
}

const gltfCache = new Map();
let loader = null;
function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(draco);
  }
  return loader;
}

/** Load a glTF/GLB once; returns the parsed gltf ({ scene, animations }). */
export function loadGLTF(url) {
  if (!gltfCache.has(url)) {
    gltfCache.set(url, new Promise((res, rej) => getLoader().load(url, res, undefined, rej)));
  }
  return gltfCache.get(url);
}

/** Load a model and return a fresh deep clone (skinned meshes safe) with shadows enabled. */
export async function loadModel(url, { castShadow = true, receiveShadow = true, scale = 1 } = {}) {
  const gltf = await loadGLTF(url);
  const obj = SkeletonUtils.clone(gltf.scene);
  obj.scale.setScalar(scale);
  obj.traverse((o) => {
    if (o.isMesh) { o.castShadow = castShadow; o.receiveShadow = receiveShadow; }
  });
  obj.userData.animations = gltf.animations;
  return obj;
}

/** Recolour meshes whose material name matches `match` (regex/string) or all meshes if omitted. */
export function tint(obj, color, match) {
  const re = match ? new RegExp(match, 'i') : null;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map((m) => {
      if (re && !re.test(m.name) && !re.test(o.name)) return m;
      const c = m.clone();
      c.color = new THREE.Color(color);
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  return obj;
}

/** Billboard text label (e.g. player name above a character). */
export function makeLabel(text, { color = '#ffffff', bg = 'rgba(0,0,0,0.55)', size = 48, height = 0.6 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `800 ${size}px system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + size;
  c.width = w;
  c.height = size * 1.5;
  g.font = `800 ${size}px system-ui, sans-serif`;
  g.fillStyle = bg;
  const r = c.height / 2;
  g.beginPath();
  g.roundRect(0, 0, c.width, c.height, r);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set((height * c.width) / c.height, height, 1);
  sprite.renderOrder = 999;
  return sprite;
}

/** Simple animation mixer helper: plays clip by (partial, case-insensitive) name with crossfade. */
export function animator(obj) {
  const mixer = new THREE.AnimationMixer(obj);
  const clips = obj.userData.animations || [];
  let current = null;
  return {
    mixer,
    names: clips.map((c) => c.name),
    play(name, { fade = 0.2, loop = true, timeScale = 1 } = {}) {
      const clip = clips.find((c) => c.name === name) || clips.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
      if (!clip) return null;
      const action = mixer.clipAction(clip);
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !loop;
      action.timeScale = timeScale;
      if (current === action) return action;
      action.reset().fadeIn(fade).play();
      current?.fadeOut(fade);
      current = action;
      return action;
    },
    update(dt) { mixer.update(dt); },
  };
}
