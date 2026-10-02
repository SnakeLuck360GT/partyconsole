// Renders real 3D models (player monsters, star, coin, item props) into small transparent PNGs for the DOM
// HUD and the phones, so the 2D UI uses the game's own art instead of emoji.
// Uses the board's renderer: draws into a corner of its canvas, copies the pixels out, then the next frame
// overwrites it. Transparency comes from difference matting (render on black and on white).
import { THREE } from '../../sdk/three-kit.js';
import { model, rig } from './models.js';

export function createIconRenderer(stage) {
  const { renderer } = stage;
  const scene = new THREE.Scene();
  scene.environment = stage.scene.environment;
  scene.environmentIntensity = 0.8;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a50, 1.1));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
  key.position.set(2.5, 4, 5);
  const rim = new THREE.DirectionalLight(0xbfdcff, 1.4);
  rim.position.set(-4, 3, -3);
  scene.add(key, rim);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const black = new THREE.Color(0x000000);
  const white = new THREE.Color(0xffffff);
  const work = document.createElement('canvas');
  const wg = work.getContext('2d', { willReadFrequently: true });

  /** Render `obj` (already in `scene`) at `size` px from the current camera → PNG data URL. */
  function snap(size) {
    const pr = renderer.getPixelRatio();
    const px = Math.round(size * pr);
    const canvas = renderer.domElement;
    const oldVp = renderer.getViewport(new THREE.Vector4());
    const oldScissor = renderer.getScissor(new THREE.Vector4());
    const oldScissorTest = renderer.getScissorTest();
    const oldAuto = renderer.autoClear;
    const oldClear = renderer.getClearColor(new THREE.Color());
    const oldAlpha = renderer.getClearAlpha();
    const oldShadow = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setViewport(0, 0, size, size);
    renderer.setScissor(0, 0, size, size);
    renderer.setScissorTest(true);
    work.width = px * 2;
    work.height = px;
    const grab = (bg, dx) => {
      scene.background = bg;
      renderer.render(scene, cam);
      wg.drawImage(canvas, 0, canvas.height - px, px, px, dx, 0, px, px);
    };
    grab(black, 0);
    grab(white, px);
    renderer.setViewport(oldVp);
    renderer.setScissor(oldScissor);
    renderer.setScissorTest(oldScissorTest);
    renderer.autoClear = oldAuto;
    renderer.setClearColor(oldClear, oldAlpha);
    renderer.shadowMap.enabled = oldShadow;
    // Repaint the board right away so the corner never shows on screen.
    renderer.render(stage.scene, stage.camera);
    const a = wg.getImageData(0, 0, px, px);
    const b = wg.getImageData(px, 0, px, px);
    const out = new ImageData(px, px);
    for (let i = 0; i < a.data.length; i += 4) {
      const alpha = 255 - ((b.data[i] - a.data[i]) + (b.data[i + 1] - a.data[i + 1]) + (b.data[i + 2] - a.data[i + 2])) / 3;
      const al = Math.max(0, Math.min(255, alpha));
      out.data[i + 3] = al;
      if (al > 0) {
        const k = 255 / al;
        out.data[i] = Math.min(255, a.data[i] * k);
        out.data[i + 1] = Math.min(255, a.data[i + 1] * k);
        out.data[i + 2] = Math.min(255, a.data[i + 2] * k);
      }
    }
    const res = document.createElement('canvas');
    res.width = res.height = px;
    res.getContext('2d').putImageData(out, 0, 0);
    let url = res.toDataURL('image/webp', 0.9);
    if (!url.startsWith('data:image/webp')) url = res.toDataURL('image/png');
    return url;
  }

  const cache = new Map();
  return {
    /** Head-and-shoulders portrait of a monster tinted to the player's colour. */
    async portrait(url, colorHex, size = 128) {
      const k = `p|${url}|${colorHex}|${size}`;
      if (cache.has(k)) return cache.get(k);
      const job = (async () => {
        const m = await model(url, { height: 1.65 });
        const col = new THREE.Color(colorHex);
        m.userData.inner.traverse((o) => {
          if (!o.isMesh) return;
          const arr = Array.isArray(o.material) ? o.material : [o.material];
          const out = arr.map((mat) => {
            const c = mat.clone();
            if (/main$/i.test(mat.name)) c.color = col.clone();
            else if (/secondary$/i.test(mat.name)) c.color = c.color.clone().lerp(col, 0.25);
            return c;
          });
          o.material = out.length === 1 ? out[0] : out;
          o.frustumCulled = false;
        });
        const a = rig(m);
        a.play('idle', { fade: 0 });
        a.update(0.35);
        m.rotation.y = 0.35;
        scene.add(m);
        const h = m.userData.dims?.y || 1.65;
        cam.fov = 30;
        cam.position.set(0.25, h * 0.72, 3.1);
        cam.lookAt(0, h * 0.58, 0);
        cam.updateProjectionMatrix();
        const img = snap(size);
        scene.remove(m);
        return img;
      })().catch((e) => { console.warn('portrait failed', e); return ''; });
      cache.set(k, job);
      return job;
    },
    /** A prop icon (star, coin, item), centred and slightly tilted. */
    async prop(url, size = 96, { tilt = 0.35, spin = 0.5, recolor = null } = {}) {
      const k = `o|${url}|${size}`;
      if (cache.has(k)) return cache.get(k);
      const job = (async () => {
        const m = await model(url, { size: 1 });
        if (recolor) recolor(m);
        const g = new THREE.Group();
        m.position.y = -(m.userData.dims?.y || 1) / 2;
        g.add(m);
        g.rotation.set(tilt * 0.4, spin, 0);
        scene.add(g);
        cam.fov = 30;
        cam.position.set(0, 0, 2.55);
        cam.lookAt(0, 0, 0);
        cam.updateProjectionMatrix();
        const img = snap(size);
        scene.remove(g);
        return img;
      })().catch((e) => { console.warn('icon failed', e); return ''; });
      cache.set(k, job);
      return job;
    },
  };
}

/** Rich gold for the library's coin/star models (their gold reads brown under ACES). */
export function goldify(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const arr = Array.isArray(o.material) ? o.material : [o.material];
    const out = arr.map((mat) => {
      if (!/gold|yellow|coin|star/i.test(mat.name)) return mat;
      const c = mat.clone();
      const dark = /dark/i.test(mat.name);
      c.color = new THREE.Color(dark ? 0xe08a00 : 0xffc61a);
      c.metalness = 0.45;
      c.roughness = 0.3;
      if (c.emissive) { c.emissive = new THREE.Color(dark ? 0x6a3300 : 0x8a5200); c.emissiveIntensity = 0.5; }
      return c;
    });
    o.material = out.length === 1 ? out[0] : out;
  });
  return obj;
}
