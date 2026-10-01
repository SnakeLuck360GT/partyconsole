// Key-art render page. URL: index.html?scene=<id>&w=1024&h=1024&ss=2
import * as L from './lib.js';
const { THREE } = L;

const q = new URLSearchParams(location.search);
const id = q.get('scene');
const W = +(q.get('w') || 1024), H = +(q.get('h') || 1024), SS = +(q.get('ss') || 2);
const wide = W / H > 1.3;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W * SS, H * SS, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.width = W + 'px';
renderer.domElement.style.height = H + 'px';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 500);

const ctx = {
  ...L, L, scene, renderer, camera, W, H, SS, wide, aspect: W / H,
  grade: { saturate: 1.12, contrast: 1.05, vignette: 0.22, bright: 1.0 },
  target: new THREE.Vector3(),

  /** Frame the shot. shift = fraction of image width to push the subject right (lens shift, keeps perspective). */
  shot({ pos, target, fov = 30, shift = 0, shiftY = 0, roll = 0, near = 0.1, far = 500 }) {
    camera.fov = fov; camera.near = near; camera.far = far;
    camera.position.set(...pos);
    ctx.target.set(...target);
    camera.up.set(0, 1, 0);
    camera.lookAt(ctx.target);
    if (roll) camera.rotateZ(roll * L.D2R);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const tanH = Math.tan((fov * L.D2R) / 2);
    camera.filmOffset = -shift * (2 * tanH * camera.aspect) * camera.getFilmWidth() / 1;
    // filmOffset is in film units relative to near-plane width; three: left += near*filmOffset/filmWidth
    camera.filmOffset = -shift * 2 * tanH * camera.aspect * camera.getFilmWidth();
    camera.updateProjectionMatrix();
    if (shiftY) {
      // vertical lens shift via the projection matrix
      camera.projectionMatrix.elements[9] += shiftY * 2;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    return camera;
  },

  /** The shared light rig, positioned relative to the camera so every cover gets the same lighting language. */
  rig(o = {}) {
    const tgt = new THREE.Vector3(...(o.center ?? ctx.target.toArray()));
    const toCam = camera.position.clone().sub(tgt); toCam.y = 0; toCam.normalize();
    const dirAt = (az, el, dist) => {
      const v = toCam.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), az * L.D2R);
      v.multiplyScalar(Math.cos(el * L.D2R)); v.y = Math.sin(el * L.D2R);
      return tgt.clone().add(v.multiplyScalar(dist));
    };
    const R = o.shadowR ?? 6;
    const key = new THREE.DirectionalLight(o.keyColor ?? 0xfff1dc, o.keyI ?? 3.2);
    key.position.copy(dirAt(o.keyAz ?? -38, o.keyEl ?? 52, R * 3));
    key.target.position.copy(tgt);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    Object.assign(key.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 0.1, far: R * 7 });
    key.shadow.bias = o.bias ?? -0.0004;
    key.shadow.normalBias = o.normalBias ?? 0.02;
    key.shadow.radius = o.shadowSoft ?? 4;
    key.shadow.blurSamples = 16;
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(o.rimColor ?? 0xffffff, o.rimI ?? 2.6);
    rim.position.copy(dirAt(o.rimAz ?? 155, o.rimEl ?? 35, R * 3));
    rim.target.position.copy(tgt);
    scene.add(rim, rim.target);
    let rim2;
    if (o.rim2I) {
      rim2 = new THREE.DirectionalLight(o.rim2Color ?? 0xffffff, o.rim2I);
      rim2.position.copy(dirAt(o.rim2Az ?? -150, o.rim2El ?? 30, R * 3));
      rim2.target.position.copy(tgt);
      scene.add(rim2, rim2.target);
    }
    const hemi = new THREE.HemisphereLight(o.sky ?? 0xdfeaff, o.ground ?? 0x8a7a70, o.hemiI ?? 1.1);
    scene.add(hemi);
    scene.environment = L.studioEnv(renderer);
    scene.environmentIntensity = o.envI ?? 0.45;
    // soft frontal fill without shadows
    const fill = new THREE.DirectionalLight(o.fillColor ?? 0xffffff, o.fillI ?? 0.5);
    fill.position.copy(dirAt(o.fillAz ?? 30, o.fillEl ?? 15, R * 3));
    fill.target.position.copy(tgt);
    scene.add(fill, fill.target);
    return { key, rim, rim2, hemi, fill };
  },

  backdrop(o) {
    scene.background = L.backdropTex(W, H, o);
  },
  fog(color, near, far) { scene.fog = new THREE.Fog(color, near, far); },
  /** World point where the ray through square-frame screen coords (sx,sy in 0..1, y down) of a shot hits plane y=h.
   *  Layout is always solved against the square framing so cover + wide share one world. */
  solve(shotParams, sx, sy, h = 0) {
    const c = new THREE.PerspectiveCamera(shotParams.fov ?? 30, 1, 0.1, 500);
    c.position.set(...shotParams.pos); c.lookAt(new THREE.Vector3(...shotParams.target)); c.updateMatrixWorld();
    const p = new THREE.Vector3(sx * 2 - 1, 1 - sy * 2, 0.5).unproject(c);
    const d = p.sub(c.position).normalize();
    const t = (h - c.position.y) / d.y;
    return c.position.clone().add(d.multiplyScalar(t));
  },
  /** project a world point to normalised screen coords (0..1, y down) */
  screen(p) {
    camera.updateMatrixWorld();
    const v = new THREE.Vector3(...p).project(camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  },
};
window.__ctx = ctx;

async function run() {
  L.srand(1234);
  const mod = await import(/* @vite-ignore */ `/scripts/keyart/scenes/${id}.js`);
  await mod.default(ctx);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  // downscale + grade into a 2D canvas
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const gr = ctx.grade;
  g.filter = `saturate(${gr.saturate}) contrast(${gr.contrast}) brightness(${gr.bright})`;
  let src = renderer.domElement, sw = W * SS, sh = H * SS;
  while (sw / 2 >= W * 1.01) {
    const c = document.createElement('canvas'); c.width = sw / 2; c.height = sh / 2;
    const cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high'; cg.drawImage(src, 0, 0, c.width, c.height);
    src = c; sw /= 2; sh /= 2;
  }
  g.drawImage(src, 0, 0, W, H);
  g.filter = 'none';
  if (gr.vignette > 0) {
    const r = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(0,0,0,${gr.vignette})`);
    g.fillStyle = r; g.fillRect(0, 0, W, H);
  }
  if (ctx.post) ctx.post(g, W, H);
  window.__out = out;
  window.__done = true;
}
run().catch((e) => { console.error(e); window.__error = String(e.stack || e); });
