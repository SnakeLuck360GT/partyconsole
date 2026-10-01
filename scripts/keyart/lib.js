// Shared key-art toolkit: asset loading/posing, the studio light rig, backdrops and stylised FX.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export { THREE, RoundedBoxGeometry };
export const D2R = Math.PI / 180;

// ---------------------------------------------------------------- random
let seed = 1234567;
export function srand(s) { seed = s >>> 0; }
export function rand(a = 0, b = 1) { seed = (seed * 1664525 + 1013904223) >>> 0; return a + (b - a) * (seed / 4294967296); }
export const pick = (arr) => arr[Math.floor(rand(0, arr.length))];

// ---------------------------------------------------------------- assets
const loader = new GLTFLoader();
const cache = new Map();
export function gltf(path) {
  const url = '/assets/shared/' + path.replace(/^assets\/shared\//, '') + (path.endsWith('.glb') ? '' : '.glb');
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

/**
 * Load a model, clone it, optionally pose it and tint it. Returns a Group whose child is the model.
 * opts: scale | height (fit rest-bbox height) | size (fit max dimension), clip, t (seconds) | f (0..1 of clip),
 *       tint {matName: color}, mult (color multiply for atlas models, lerped by multK), center (center on XZ),
 *       ground (sit min.y on 0; default true for size/height fits), hide [nodeNames]
 */
export async function model(path, opts = {}) {
  const g = await gltf(path);
  const m = SkeletonUtils.clone(g.scene);
  const wrap = new THREE.Group();
  wrap.name = path;
  wrap.add(m);
  m.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = opts.castShadow !== false;
      o.receiveShadow = opts.receiveShadow !== false;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const nm = mats.map((mat) => {
        const c = mat.clone();
        if (opts.tint && opts.tint[mat.name] !== undefined) c.color.set(opts.tint[mat.name]);
        if (opts.mult) c.color.lerp(new THREE.Color(opts.mult), opts.multK ?? 0.6);
        if (opts.rough !== undefined && 'roughness' in c) c.roughness = opts.rough;
        if (opts.metal !== undefined && 'metalness' in c) c.metalness = opts.metal;
        if (opts.emissive) { c.emissive = new THREE.Color(opts.emissive); c.emissiveIntensity = opts.emissiveI ?? 1; }
        if (opts.matFn) opts.matFn(c, o);
        return c;
      });
      o.material = Array.isArray(o.material) ? nm : nm[0];
    }
  });
  const byName = (n) => m.getObjectByName(n) || m.getObjectByName(n.replace(/[.\[\]:\/]/g, ''));
  for (const n of opts.hide || []) { const o = byName(n); if (o) o.visible = false; else console.warn('hide: no node', n); }
  // rest-pose bounds for fitting
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m, true);
  const size = box.getSize(new THREE.Vector3());
  let k = opts.scale ?? 1;
  if (opts.height) k = opts.height / size.y;
  if (opts.size) k = opts.size / Math.max(size.x, size.y, size.z);
  m.scale.multiplyScalar(k);
  if (opts.center || opts.size) {
    const c = box.getCenter(new THREE.Vector3());
    m.position.x -= c.x * k; m.position.z -= c.z * k;
    if (opts.centerY) m.position.y -= c.y * k;
  }
  if ((opts.ground ?? !!(opts.size || opts.height)) && !opts.centerY) m.position.y -= box.min.y * k;
  // pose
  if (opts.clip && g.animations.length) {
    const clip = THREE.AnimationClip.findByName(g.animations, opts.clip);
    if (!clip) console.warn('no clip', opts.clip, 'in', path, g.animations.map((a) => a.name).join(','));
    else {
      const mixer = new THREE.AnimationMixer(m);
      mixer.clipAction(clip).play();
      const t = opts.t ?? (opts.f ?? 0) * clip.duration;
      mixer.setTime(Math.min(t, clip.duration - 1e-3));
      wrap.userData.mixer = mixer;
    }
  }
  // manual bone tweaks on top of the sampled pose (local-axis rotations, degrees)
  for (const [n, r] of Object.entries(opts.bones || {})) {
    const b = byName(n);
    if (!b) { console.warn('bones: no node', n); continue; }
    b.rotateX(r[0] * D2R); b.rotateY((r[1] ?? 0) * D2R); b.rotateZ((r[2] ?? 0) * D2R);
  }
  wrap.userData.byName = byName;
  wrap.userData.model = m;
  wrap.userData.restSize = size.multiplyScalar(k);
  return wrap;
}

export function place(o, x = 0, y = 0, z = 0, ry = 0, s) {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  if (s !== undefined) o.scale.setScalar(s);
  return o;
}

export function bounds(o) { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o, true); }

// ---------------------------------------------------------------- materials
export const toon = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.45, metalness: o.metal ?? 0, ...o.extra });
export const glow = (color, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
export function shadowOnly(o = {}) {
  return new THREE.ShadowMaterial({ color: o.color ?? 0x000000, opacity: o.opacity ?? 0.28 });
}

// ---------------------------------------------------------------- canvas textures
export function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// radial soft blob texture (for contact shadows / glows)
let _blobTex;
export function blobTex() {
  if (_blobTex) return _blobTex;
  _blobTex = canvasTex(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    r.addColorStop(0.7, 'rgba(255,255,255,0.18)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  }, { srgb: false });
  return _blobTex;
}

/** Soft contact shadow decal on a horizontal surface. */
export function contact(scene, x, y, z, rx, rz = rx, opacity = 0.45, color = 0x000000) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color, map: blobTex(), alphaMap: blobTex(), transparent: true, opacity, depthWrite: false,
  }));
  m.material.map = null;
  m.rotation.x = -Math.PI / 2;
  m.scale.set(rx * 2, rz * 2, 1);
  m.position.set(x, y + 0.004, z);
  m.renderOrder = 1;
  scene.add(m);
  return m;
}

/** Additive glow sprite. */
export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: blobTex(), color: new THREE.Color(color), blending: THREE.AdditiveBlending, transparent: true,
    opacity, depthWrite: false, toneMapped: false,
  }));
  s.scale.setScalar(size);
  return s;
}

// 4-point sparkle texture
let _sparkTex;
export function sparkTex() {
  if (_sparkTex) return _sparkTex;
  _sparkTex = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const r = g.createRadialGradient(c, c, 0, c, c, c * 0.5);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
    g.fillStyle = '#fff';
    for (const a of [0, Math.PI / 2]) {
      g.save(); g.translate(c, c); g.rotate(a);
      g.beginPath(); g.moveTo(-c, 0); g.quadraticCurveTo(0, -c * 0.07, c, 0); g.quadraticCurveTo(0, c * 0.07, -c, 0); g.fill();
      g.restore();
    }
  }, { srgb: false });
  return _sparkTex;
}
export function sparkle(color, size, opacity = 1, rot = 0) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sparkTex(), color: new THREE.Color(color), blending: THREE.AdditiveBlending, transparent: true,
    opacity, depthWrite: false, toneMapped: false, rotation: rot,
  }));
  s.scale.setScalar(size);
  return s;
}

// ---------------------------------------------------------------- stylised FX geometry
/** Chunky toy-like puff cloud made of flat-shaded icospheres. */
export function puff(color = 0xffffff, n = 6, r = 0.35, spread = 0.5, o = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: o.flat ?? false, transparent: !!o.opacity, opacity: o.opacity ?? 1, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveI ?? 1 });
  for (let i = 0; i < n; i++) {
    const rr = r * rand(0.55, 1.1) * (i === 0 ? 1.25 : 1);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, o.detail ?? 2), mat);
    m.position.set(rand(-spread, spread), rand(-spread, spread) * (o.flatY ?? 0.5), rand(-spread, spread));
    if (i === 0) m.position.set(0, 0, 0);
    m.castShadow = o.shadow ?? false;
    g.add(m);
  }
  return g;
}

/** 3D extruded starburst ("impact" shape) with bevel. */
export function burst(color, rOut = 1, rIn = 0.55, points = 9, depth = 0.15, o = {}) {
  const sh = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + (o.rot ?? 0);
    const r = i % 2 === 0 ? rOut * (o.jag ? rand(0.8, 1.15) : 1) : rIn;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: Math.min(rIn * 0.12, 0.08), bevelSegments: 3 });
  geo.center();
  const mat = o.mat ?? new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveI ?? 1 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = o.shadow ?? false;
  return m;
}

/** 5-point rounded star mesh (bevelled), for party/board art. */
export function star5(color, r = 1, depth = 0.3, o = {}) {
  return burst(color, r, r * 0.48, 5, depth, { rot: Math.PI / 2, ...o });
}

/** Speed streak: a tapered ribbon along direction, additive or solid. */
export function streak(from, to, width, color = 0xffffff, opacity = 0.8, o = {}) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const geo = new THREE.PlaneGeometry(len, width, 16, 1);
  // taper towards the tail (local -x)
  const pos = geo.attributes.position;
  const alpha = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const u = Math.min(1, Math.max(0, pos.getX(i) / len + 0.5)); // 0 tail .. 1 head
    pos.setY(i, pos.getY(i) * (0.15 + 0.85 * Math.pow(u, 0.7)));
    alpha[i] = Math.pow(u, 1.4);
  }
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA=alpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying float vA; void main(){ gl_FragColor=vec4(color, vA*opacity); }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  // orient: local x along a->b, face the camera-ish via provided up
  const dir = b.clone().sub(a).normalize();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const up = o.face ? o.face.clone().sub(mid).normalize() : new THREE.Vector3(...(o.normal ?? [0, 1, 0]));
  const zAxis = up.clone().sub(dir.clone().multiplyScalar(up.dot(dir))).normalize();
  const yAxis = zAxis.clone().cross(dir).normalize();
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, yAxis, zAxis));
  m.renderOrder = 5;
  return m;
}

/** Simple glowing bolt (capsule core + halo sprite). */
export function bolt(color, len = 1.2, r = 0.07) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), glow(0xffffff, 1.6));
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(r * 2.1, len * 1.05, 6, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  core.rotation.z = shell.rotation.z = Math.PI / 2;
  g.add(core, shell);
  const h = glowSprite(color, len * 1.6, 0.55); g.add(h);
  return g;
}

/** Rounded letter tile with a letter on the top (+Y) face or front (+Z). */
export function letterTile(ch, o = {}) {
  const size = o.size ?? 1;
  const geo = new RoundedBoxGeometry(size, size * (o.thick ?? 0.32), size, 4, size * 0.12);
  const tex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = o.face ?? '#fff4dc'; g.fillRect(0, 0, w, w);
    g.font = `${o.weight ?? 900} ${w * 0.66}px "Arial Rounded MT Bold", "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillText(ch, w / 2 + 6, w / 2 + 30);
    g.fillStyle = o.ink ?? '#2a2340'; g.fillText(ch, w / 2, w / 2 + 22);
    if (o.points) { g.font = `900 ${w * 0.16}px "Arial Rounded MT Bold", sans-serif`; g.fillText(o.points, w * 0.82, w * 0.84); }
  });
  const bump = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, w);
    g.font = `${o.weight ?? 900} ${w * 0.66}px "Arial Rounded MT Bold", "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(ch, w / 2, w / 2 + 22);
  }, { srgb: false });
  const side = new THREE.MeshStandardMaterial({ color: o.side ?? o.face ?? '#fff4dc', roughness: 0.42 });
  const top = new THREE.MeshStandardMaterial({ map: tex, bumpMap: bump, bumpScale: 2.5, roughness: 0.42 });
  // BoxGeometry groups: +x,-x,+y,-y,+z,-z
  const mats = [side, side, top, side, side, side];
  const m = new THREE.Mesh(geo, mats);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- environment
let _env;
export function studioEnv(renderer) {
  if (_env) return _env;
  const pm = new THREE.PMREMGenerator(renderer);
  _env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  return _env;
}

/** Gradient backdrop (screen space). stops: [[y0..1, color], ...]; glow: {x,y,r,color,alpha}; rays */
export function backdropTex(W, H, o) {
  return canvasTex(Math.round(W), Math.round(H), (g, w, h) => {
    const lin = g.createLinearGradient(0, 0, 0, h);
    for (const [p, c] of o.stops) lin.addColorStop(p, c);
    g.fillStyle = lin; g.fillRect(0, 0, w, h);
    if (o.rays) {
      const { x = 0.5, y = 0.45, n = 18, color = 'rgba(255,255,255,0.08)' } = o.rays;
      g.save(); g.translate(x * w, y * h); g.fillStyle = color;
      const R = Math.hypot(w, h);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = a0 + Math.PI / n;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); g.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); g.closePath(); g.fill();
      }
      g.restore();
    }
    for (const gl of [].concat(o.glow || [])) {
      const r = g.createRadialGradient(gl.x * w, gl.y * h, 0, gl.x * w, gl.y * h, gl.r * Math.max(w, h));
      const hx = new THREE.Color(gl.color).getHex(); const rgb = `${(hx >> 16) & 255},${(hx >> 8) & 255},${hx & 255}`;
      r.addColorStop(0, `rgba(${rgb},${gl.a ?? 1})`); r.addColorStop(gl.mid ?? 0.4, `rgba(${rgb},${(gl.a ?? 1) * 0.45})`); r.addColorStop(1, `rgba(${rgb},0)`);
      g.globalCompositeOperation = gl.mode ?? 'source-over';
      g.fillStyle = r; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    }
    if (o.draw) o.draw(g, w, h);
  });
}

/** Rolling toy hills on a ring around `center` (fog softens them into layered silhouettes). */
export function hills(scene, center, o = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: o.color ?? 0x5cc451, roughness: 0.95 });
  const n = o.count ?? 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.15, 0.15);
    const d = rand(o.dMin ?? 40, o.dMax ?? 60);
    const r = rand(o.rMin ?? 8, o.rMax ?? 16);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    m.scale.set(r * rand(1.2, 1.8), r * rand(o.hMin ?? 0.35, o.hMax ?? 0.6), r);
    m.position.set(center.x + Math.cos(a) * d, -r * 0.05, center.z + Math.sin(a) * d);
    m.rotation.y = rand(0, 6);
    m.receiveShadow = true;
    g.add(m);
  }
  scene.add(g);
  return g;
}

/** Rotate `bone` so the direction bone->child points at world `target` (blend k). Works on any rig.
 *  target can be a Vector3/array (world point) or {dir:[x,y,z]} (world direction). */
export function aim(wrap, boneName, childName, target, k = 1) {
  const by = wrap.userData.byName;
  const b = by(boneName), c = by(childName);
  if (!b || !c) { console.warn('aim: missing', boneName, childName); return; }
  wrap.updateMatrixWorld(true);
  const bp = b.getWorldPosition(new THREE.Vector3()), cp = c.getWorldPosition(new THREE.Vector3());
  const d = cp.sub(bp).normalize();
  let t;
  if (target.dir) t = new THREE.Vector3(...target.dir).normalize();
  else t = (Array.isArray(target) ? new THREE.Vector3(...target) : target.clone()).sub(bp).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(d, t);
  if (k !== 1) q.slerp(new THREE.Quaternion(), 1 - k);
  const bw = b.getWorldQuaternion(new THREE.Quaternion());
  const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.copy(pw.invert().multiply(q.multiply(bw)));
  wrap.updateMatrixWorld(true);
}
/** world position of a named bone */
export function bonePos(wrap, name) { wrap.updateMatrixWorld(true); const b = wrap.userData.byName(name); return b ? b.getWorldPosition(new THREE.Vector3()) : null; }
