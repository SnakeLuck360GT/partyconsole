// Renderer + scene + lights for split-screen racing: one WebGLRenderer, one scene, N cameras rendered into
// scissored viewports. Shadows are rendered once per frame (autoUpdate off) with a frustum fitted around
// all human racers. Pixel ratio drops as the number of viewports grows.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function createKartStage(container, { lowGfx = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc8ff);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.5;

  const hemi = new THREE.HemisphereLight(0xdff0ff, 0x5a7a3a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();

  let W = 1; let H = 1; let nViews = 1; let dprCap = 2;
  let lowRes = lowGfx;
  function applyRatio() {
    const dpr = window.devicePixelRatio || 1;
    const cap = lowRes ? 0.6 : nViews >= 3 ? 1.15 : nViews === 2 ? 1.4 : 1.75;
    dprCap = Math.min(dpr, cap);
    renderer.setPixelRatio(dprCap);
    renderer.setSize(W, H, false);
  }
  const listeners = new Set();
  function resize() {
    W = container.clientWidth || window.innerWidth;
    H = container.clientHeight || window.innerHeight;
    applyRatio();
    for (const fn of listeners) fn(W, H);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /** Viewport rects (CSS px, top-left origin) for n players; 3 players leave the 4th quadrant for the map. */
  function layout(n) {
    const h2 = Math.floor(H / 2); const w2 = Math.floor(W / 2);
    if (n <= 1) return { views: [{ x: 0, y: 0, w: W, h: H }], map: null };
    if (n === 2) return { views: [{ x: 0, y: 0, w: W, h: h2 }, { x: 0, y: h2, w: W, h: H - h2 }], map: null };
    const q = [{ x: 0, y: 0, w: w2, h: h2 }, { x: w2, y: 0, w: W - w2, h: h2 }, { x: 0, y: h2, w: w2, h: H - h2 }, { x: w2, y: h2, w: W - w2, h: H - h2 }];
    if (n === 3) return { views: q.slice(0, 3), map: q[3] };
    return { views: q, map: null };
  }

  const _c = new THREE.Vector3();
  /** Fit the sun's shadow frustum around points (array of {x,y,z}). */
  function fitShadow(points, margin = 26) {
    if (!points.length) return;
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity; let y = 0;
    for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); y += p.y; }
    y /= points.length;
    _c.set((minX + maxX) / 2, y, (minZ + maxZ) / 2);
    const half = Math.max(maxX - minX, maxZ - minZ) / 2 + margin;
    const cam = sun.shadow.camera;
    // snap the centre to shadow texels to avoid shimmering
    const texel = (2 * half) / sun.shadow.mapSize.x;
    _c.x = Math.round(_c.x / texel) * texel; _c.z = Math.round(_c.z / texel) * texel;
    sun.position.copy(_c).addScaledVector(sunDir, 120);
    sun.target.position.copy(_c);
    sun.target.updateMatrixWorld();
    if (cam.right !== half) {
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.near = 20; cam.far = 260;
      cam.updateProjectionMatrix();
    }
  }

  /**
   * Render a list of viewports: [{ rect, camera, before?() }]. `clearRects` are filled with the clear colour.
   */
  function render(views) {
    renderer.setScissorTest(true);
    renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled;
    for (const v of views) {
      const r = v.rect;
      const y = H - (r.y + r.h);
      renderer.setViewport(r.x, y, r.w, r.h);
      renderer.setScissor(r.x, y, r.w, r.h);
      v.before?.();
      renderer.render(v.scene || scene, v.camera);
      renderer.shadowMap.needsUpdate = false;
    }
    renderer.setScissorTest(false);
  }

  return {
    renderer, scene, sun, hemi, sunDir, envTex,
    get size() { return { W, H }; },
    get pixelRatio() { return dprCap; },
    setViewCount(n) { if (n !== nViews) { nViews = n; applyRatio(); } },
    setLowRes(v) { lowRes = v; applyRatio(); },
    onResize(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    layout,
    fitShadow,
    render,
    dispose() {
      ro.disconnect();
      listeners.clear();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose(); });
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
