// Renderer + bloom post-processing + a framing camera with screen shake.
// (Own stage instead of three-kit's createStage because we need an EffectComposer in the loop.)
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020308);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 1, 900);

  // Lights: cool fill + warm key from the "sun" + coloured rim from below/behind.
  const hemi = new THREE.HemisphereLight(0x9fb4ff, 0x1a0d2e, 0.9);
  const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
  key.position.set(-30, 60, 25);
  const rim = new THREE.DirectionalLight(0x7a5cff, 1.4);
  rim.position.set(35, 20, -40);
  scene.add(hemi, key, rim);

  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const shake = { trauma: 0, offset: new THREE.Vector3() };
  const view = { dist: 60, target: new THREE.Vector3(), tilt: 0.36, want: 60 };
  let w = 1;
  let h = 1;

  function resize() {
    w = container.clientWidth || window.innerWidth;
    h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /** Distance so an arena of W x H (plus HUD margins) fits the view with the current tilt. */
  function fitDistance(W, H) {
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const tanV = Math.tan(vf);
    const tanH = tanV * camera.aspect;
    // Leave ~12% of the height for the HUD strip + labels.
    const needV = (H / 2 + 2.6) / (tanV * 0.86);
    const needH = (W / 2 + 2.2) / tanH;
    return Math.max(needV, needH) * (1 + view.tilt * 0.12);
  }

  function frame(W, H, instant = false) {
    view.want = fitDistance(W, H);
    if (instant) view.dist = view.want;
  }

  let sway = 0;
  function updateCamera(dt, t) {
    view.dist += (view.want - view.dist) * Math.min(1, dt * 2.5);
    // shake: trauma^2 falloff, random jitter
    shake.trauma = Math.max(0, shake.trauma - dt * 1.4);
    const s = shake.trauma * shake.trauma;
    const amp = s * view.dist * 0.018;
    shake.offset.set((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp * 0.5, (Math.random() * 2 - 1) * amp);
    sway = t;
    const swayX = Math.sin(sway * 0.11) * view.dist * 0.012;
    const swayZ = Math.cos(sway * 0.083) * view.dist * 0.008;
    const tilt = view.tilt;
    camera.position.set(
      view.target.x + swayX + shake.offset.x,
      view.target.y + Math.cos(tilt) * view.dist + shake.offset.y,
      view.target.z + Math.sin(tilt) * view.dist + swayZ + shake.offset.z,
    );
    // Look slightly below centre so the arena sits under the HUD strip.
    camera.lookAt(view.target.x + shake.offset.x * 0.5, 0, view.target.z - view.dist * 0.018 + shake.offset.z * 0.5);
    camera.rotation.z += (Math.random() * 2 - 1) * s * 0.012;
  }

  const frameFns = new Set();
  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;
  let elapsed = 0;
  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    for (const fn of frameFns) fn(dt, elapsed);
    updateCamera(dt, elapsed);
    composer.render(dt);
  }
  loop();

  return {
    renderer, scene, camera, composer, bloom, key, rim, hemi,
    get width() { return w; },
    get height() { return h; },
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    frame,
    addShake(amount) { shake.trauma = Math.min(1, shake.trauma + amount); },
    view,
    /** Project a world point to container pixel coords. */
    project(v, out = new THREE.Vector3()) {
      out.copy(v).project(camera);
      out.x = (out.x * 0.5 + 0.5) * w;
      out.y = (-out.y * 0.5 + 0.5) * h;
      return out;
    },
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
      rt.dispose();
      composer.dispose?.();
      bloom.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
