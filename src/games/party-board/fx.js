// Board pieces, dice blocks, particles (coins, stars, confetti), floating counters and the camera rig.
import { THREE, makeLabel, loadGLTF } from '../../sdk/three-kit.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { model, rig } from './models.js';
import { ease } from './util.js';

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();

function rgba(css, a) {
  const c = new THREE.Color(css);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

// ------------------------------------------------------------------ pieces
export const PIECE_H = 1.65;

export async function createPiece(rt, scene, { url, name, color, colorHex }) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const m = await model(url, { height: PIECE_H });
  const col = new THREE.Color(colorHex ?? color);
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
  body.add(m);
  const anim = rig(m);
  anim.play('idle');
  // coloured base ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false }));
  ring.position.y = 0.03;
  ring.renderOrder = 3;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false }));
  disc.position.y = 0.025;
  disc.renderOrder = 3;
  root.add(ring, disc);
  let label = null;
  const setLabel = (text) => {
    if (label) { root.remove(label); label.material.map.dispose(); label.material.dispose(); }
    label = makeLabel(text, { color: '#ffffff', bg: rgba(color, 0.9), size: 44, height: 0.42 });
    label.position.y = PIECE_H + 0.45;
    root.add(label);
  };
  setLabel(name);
  scene.add(root);

  let squash = 0;
  const piece = {
    root, body, anim, ring,
    setLabel,
    get pos() { return root.position; },
    face(x, z, instant = false) {
      const target = Math.atan2(x - root.position.x, z - root.position.z);
      piece.targetYaw = target;
      if (instant) body.rotation.y = target;
    },
    targetYaw: 0,
    /** Arc hop to a point. */
    async hop(to, { height = 1.1, dur = 0.34 } = {}) {
      const from = root.position.clone();
      piece.face(to.x, to.z);
      await rt.tween(dur, (k) => {
        root.position.lerpVectors(from, to, k);
        root.position.y = from.y + (to.y - from.y) * k + Math.sin(Math.PI * k) * height;
      }, ease.linear);
      squash = 1;
    },
    async moveTo(to, dur = 0.4) {
      const from = root.position.clone();
      await rt.tween(dur, (k) => root.position.lerpVectors(from, to, k), ease.inOut);
    },
    update(dt) {
      anim.update(dt);
      let d = piece.targetYaw - body.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      body.rotation.y += d * Math.min(1, dt * 12);
      if (squash > 0) {
        squash = Math.max(0, squash - dt * 5);
        const s = Math.sin(squash * Math.PI) * 0.18;
        body.scale.set(1 + s, 1 - s, 1 + s);
      }
    },
    dispose() { scene.remove(root); },
  };
  return piece;
}

// ------------------------------------------------------------------ dice blocks
function faceCanvas() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  return c;
}
function drawFace(c, n, color) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#e3ecff');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  g.lineWidth = 16;
  g.strokeStyle = color;
  g.beginPath();
  g.roundRect(18, 18, 220, 220, 34);
  g.stroke();
  g.font = '900 150px Fredoka, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 14;
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.strokeText(String(n), 128, 140);
  g.fillStyle = n === '?' ? color : '#22263a';
  g.fillText(String(n), 128, 140);
}

const diceGeo = new RoundedBoxGeometry(1.25, 1.25, 1.25, 4, 0.2);

export function createDie(scene, color = '#ff4d6d') {
  const c = faceCanvas();
  drawFace(c, '?', color);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25, transparent: true });
  const mesh = new THREE.Mesh(diceGeo, mat);
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  scene.add(g);
  let spinning = true;
  let shown = null;
  let timer = 0;
  let t = Math.random() * 10;
  const die = {
    group: g,
    value: null,
    spinning: true,
    setNumber(n) {
      if (n === shown) return;
      shown = n;
      drawFace(c, n, color);
      tex.needsUpdate = true;
    },
    update(dt, camera) {
      t += dt;
      if (spinning) {
        mesh.rotation.x += dt * 5.2;
        mesh.rotation.y += dt * 6.7;
        timer += dt;
        if (timer > 0.07) { timer = 0; die.setNumber(1 + Math.floor(Math.random() * 10)); }
        mesh.position.y = Math.sin(t * 4) * 0.12;
      } else if (camera) {
        // face the camera
        const q0 = mesh.quaternion.clone();
        mesh.lookAt(camera.position);
        tmpQ.copy(mesh.quaternion);
        mesh.quaternion.copy(q0).slerp(tmpQ, Math.min(1, dt * 14));
      }
    },
    baseY: 0,
    stop(n) {
      spinning = false;
      die.spinning = false;
      die.value = n;
      die.setNumber(n);
    },
    mesh,
    dispose() { scene.remove(g); tex.dispose(); mat.dispose(); },
  };
  return die;
}

// ------------------------------------------------------------------ floating counter over a piece
export function createCounter(scene) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 1000;
  sprite.scale.setScalar(1.7);
  scene.add(sprite);
  const draw = (n, color) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.beginPath();
    g.arc(128, 128, 100, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.lineWidth = 14;
    g.strokeStyle = '#fff';
    g.stroke();
    g.font = '900 130px Fredoka, Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.strokeText(String(n), 128, 138);
    g.fillText(String(n), 128, 138);
    tex.needsUpdate = true;
  };
  let pop = 0;
  return {
    sprite,
    set(n, color = '#2a6bff') { draw(n, color); pop = 1; },
    update(dt) {
      pop = Math.max(0, pop - dt * 4);
      sprite.scale.setScalar(1.7 * (1 + pop * 0.35));
    },
    dispose() { scene.remove(sprite); tex.dispose(); sprite.material.dispose(); },
  };
}

// ------------------------------------------------------------------ particle pools
async function modelPool(scene, url, size, cap) {
  const gltf = await loadGLTF(url);
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const dims = box.getSize(new THREE.Vector3());
  const k = size / Math.max(dims.x, dims.y, dims.z);
  const centre = box.getCenter(new THREE.Vector3());
  const parts = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const local = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z)).multiply(o.matrixWorld);
    const mat = o.material.clone();
    if (/gold/i.test(mat.name)) {
      const dark = /dark/i.test(mat.name);
      mat.color = new THREE.Color(dark ? 0xd98200 : 0xffc21a);
      mat.metalness = 0.55;
      mat.roughness = 0.3;
      if (mat.emissive) { mat.emissive = new THREE.Color(dark ? 0x7a3d00 : 0xb86f00); mat.emissiveIntensity = 0.45; }
    }
    const im = new THREE.InstancedMesh(o.geometry, mat, cap);
    im.count = 0;
    im.frustumCulled = false;
    im.castShadow = false;
    scene.add(im);
    parts.push({ im, local });
  });
  const list = [];
  return {
    spawn(p) { if (list.length < cap) list.push(p); },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        p.vel.y -= (p.g ?? 18) * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.floor != null && p.pos.y < p.floor) { p.pos.y = p.floor; p.vel.y *= -0.35; p.vel.x *= 0.7; p.vel.z *= 0.7; }
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
      }
      for (const { im, local } of parts) {
        im.count = list.length;
        list.forEach((p, i) => {
          const s = p.scale * Math.min(1, p.life * 3);
          tmpQ.setFromEuler(tmpE.set(p.rot.x, p.rot.y, 0));
          tmpM.compose(p.pos, tmpQ, tmpS.setScalar(s)).multiply(local);
          im.setMatrixAt(i, tmpM);
        });
        im.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

export async function createParticles(scene, sharedAsset) {
  const [coins, stars] = await Promise.all([
    modelPool(scene, sharedAsset('props/coin.glb'), 0.55, 90),
    modelPool(scene, sharedAsset('props/star.glb'), 0.5, 60),
  ]);
  // confetti
  const CAP = 360;
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.26), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CAP);
  conf.count = 0;
  conf.frustumCulled = false;
  scene.add(conf);
  const confList = [];
  const palette = [0xff4d6d, 0xffd23f, 0x3ddc97, 0x4d9bff, 0xb06bff, 0xff8a3d, 0xffffff].map((c) => new THREE.Color(c));
  const rnd = (a, b) => a + Math.random() * (b - a);
  return {
    coinBurst(pos, n = 6, { up = 7, spread = 3, floor = null, life = 1.1 } = {}) {
      for (let i = 0; i < n; i++) {
        coins.spawn({ pos: pos.clone(), vel: new THREE.Vector3(rnd(-spread, spread), rnd(up * 0.7, up * 1.2), rnd(-spread, spread)), rot: new THREE.Vector3(rnd(0, 6), rnd(0, 6), 0), spin: new THREE.Vector3(rnd(-8, 8), rnd(-12, 12), 0), scale: 1, life, floor });
      }
    },
    coinDrop(pos, n = 6) {
      this.coinBurst(pos, n, { up: 5, spread: 2.6, floor: 0.3, life: 1.5 });
    },
    coinRain(center, n = 20, radius = 3) {
      for (let i = 0; i < n; i++) {
        const p = center.clone().add(new THREE.Vector3(rnd(-radius, radius), rnd(6, 11), rnd(-radius, radius)));
        coins.spawn({ pos: p, vel: new THREE.Vector3(0, rnd(-2, 0), 0), rot: new THREE.Vector3(rnd(0, 6), rnd(0, 6), 0), spin: new THREE.Vector3(rnd(-6, 6), rnd(-10, 10), 0), scale: 1.2, life: 1.6, floor: 0.3, g: 14 });
      }
    },
    sparkle(pos, n = 12, { speed = 5, life = 1 } = {}) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        stars.spawn({ pos: pos.clone(), vel: new THREE.Vector3(Math.cos(a) * speed, rnd(2, 6), Math.sin(a) * speed), rot: new THREE.Vector3(0, rnd(0, 6), 0), spin: new THREE.Vector3(0, rnd(-8, 8), 0), scale: rnd(0.6, 1.1), life, g: 6 });
      }
    },
    confetti(pos, n = 160, { spread = 6, up = 10 } = {}) {
      for (let i = 0; i < n && confList.length < CAP; i++) {
        const idx = confList.length;
        confList.push({ pos: pos.clone().add(new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1))), vel: new THREE.Vector3(rnd(-spread, spread), rnd(up * 0.6, up * 1.3), rnd(-spread, spread)), rot: new THREE.Vector3(rnd(0, 6), rnd(0, 6), rnd(0, 6)), spin: new THREE.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)), life: rnd(2.2, 3.4) });
        conf.setColorAt(idx, palette[Math.floor(Math.random() * palette.length)]);
      }
      if (conf.instanceColor) conf.instanceColor.needsUpdate = true;
    },
    update(dt) {
      coins.update(dt);
      stars.update(dt);
      for (let i = confList.length - 1; i >= 0; i--) {
        const p = confList[i];
        p.life -= dt;
        if (p.life <= 0) {
          // swap-remove keeps colours roughly random; fine for confetti
          confList.splice(i, 1);
          continue;
        }
        p.vel.y = Math.max(p.vel.y - 9 * dt, -2.2);
        p.vel.x *= 1 - dt * 0.8;
        p.vel.z *= 1 - dt * 0.8;
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
      }
      conf.count = confList.length;
      confList.forEach((p, i) => {
        tmpQ.setFromEuler(tmpE.set(p.rot.x, p.rot.y, p.rot.z));
        tmpM.compose(p.pos, tmpQ, tmpS.setScalar(Math.min(1, p.life)));
        conf.setMatrixAt(i, tmpM);
      });
      conf.instanceMatrix.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ camera rig
export function createCameraRig(camera) {
  const look = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const goalLook = new THREE.Vector3();
  const goal = { dist: 60, pitch: 0.95, yaw: 0 };
  const cur = { dist: 60, pitch: 0.95, yaw: 0 };
  let follow = null;
  let shake = 0;
  let stiffness = 2.6;
  let manual = false;
  const rig = {
    /** Look at `target` (Vector3 or Object3D to follow) from distance/pitch/yaw. */
    set(target, { dist, pitch, yaw, snap = false, stiff = 2.6 } = {}) {
      manual = false;
      stiffness = stiff;
      follow = target?.isObject3D ? target : null;
      if (!follow && target) goalLook.copy(target);
      if (dist != null) goal.dist = dist;
      if (pitch != null) goal.pitch = pitch;
      if (yaw != null) goal.yaw = yaw;
      if (snap) {
        if (follow) goalLook.copy(follow.position);
        look.copy(goalLook);
        Object.assign(cur, goal);
      }
    },
    /** Hand the camera to a custom animation for a while. */
    manual(on = true) { manual = on; },
    /** Adopt the camera's current pose (after a manual animation) so the next move starts smoothly. */
    syncFrom(lookAt) {
      look.copy(lookAt);
      goalLook.copy(lookAt);
      follow = null;
      const d = tmpV.copy(camera.position).sub(lookAt);
      cur.dist = d.length();
      cur.pitch = Math.asin(THREE.MathUtils.clamp(d.y / cur.dist, -1, 1));
      cur.yaw = Math.atan2(d.x, d.z);
      Object.assign(goal, cur);
      manual = false;
    },
    shake(a = 0.6) { shake = Math.max(shake, a); },
    get goal() { return goal; },
    update(dt) {
      if (manual) return;
      if (follow) goalLook.copy(follow.position).add(tmpV.set(0, 0.8, 0));
      const k = 1 - Math.exp(-dt * stiffness);
      look.lerp(goalLook, k);
      cur.dist += (goal.dist - cur.dist) * k;
      cur.pitch += (goal.pitch - cur.pitch) * k;
      let dy = goal.yaw - cur.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      cur.yaw += dy * k;
      pos.set(Math.sin(cur.yaw) * Math.cos(cur.pitch), Math.sin(cur.pitch), Math.cos(cur.yaw) * Math.cos(cur.pitch)).multiplyScalar(cur.dist).add(look);
      camera.position.copy(pos);
      camera.lookAt(look);
      if (shake > 0) {
        shake = Math.max(0, shake - dt * 1.6);
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
      }
    },
  };
  return rig;
}
