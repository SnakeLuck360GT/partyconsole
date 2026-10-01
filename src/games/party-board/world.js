// The 3D board diorama: floating island, lake/river/waterfall, bridges, village, forest, clouds,
// the board spaces themselves, the Star and junction arrows.
import { THREE } from '../../sdk/three-kit.js';
import { TYPES } from './board-data.js';
import { model, instanced } from './models.js';
import { makeRng } from './util.js';

const SPACE_R = 1.05;
const SPACE_TOP = 0.3;

// ------------------------------------------------------------------ textures
function canvasTex(w, h, draw, { repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

export function skyTexture(top, mid, bottom) {
  return canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top);
    gr.addColorStop(0.55, mid);
    gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

function iconTexture(type) {
  return canvasTex(256, 256, (g) => {
    g.translate(128, 128);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const shadow = () => { g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 10; g.shadowOffsetY = 6; };
    shadow();
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    if (type === 'blue' || type === 'red') {
      g.lineWidth = 34;
      g.beginPath();
      g.moveTo(-58, 0); g.lineTo(58, 0);
      if (type === 'blue') { g.moveTo(0, -58); g.lineTo(0, 58); }
      g.stroke();
    } else if (type === 'star') {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 42 : 96;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    } else {
      const glyph = { event: '?', shop: '🛍️', duel: '⚔️' }[type];
      g.font = type === 'event' ? '900 170px Fredoka, Arial Black, sans-serif' : '130px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(glyph, 0, type === 'event' ? 10 : 8);
    }
  });
}

function waterStreaks() {
  const rng = makeRng(7);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const x = rng.next() * w;
      const y = rng.next() * h;
      const len = 20 + rng.next() * 50;
      g.lineWidth = 2 + rng.next() * 4;
      g.beginPath();
      for (let k = 0; k <= 8; k++) {
        const px = x + (k / 8) * len;
        g.lineTo(px % w, y + Math.sin(k * 0.9) * 3);
      }
      g.stroke();
    }
  }, { repeat: true });
}

function glowTexture() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,240,180,0.55)');
    gr.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

// ------------------------------------------------------------------ geometry helpers
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function polyDist(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}

/** Ribbon (flat strip) geometry along a 2D polyline. */
function ribbon(pts, width, y, { uvScale = 0.25 } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const nx = -tz;
    const nz = tx;
    if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    pos.push(p[0] + nx * width / 2, y, p[1] + nz * width / 2, p[0] - nx * width / 2, y, p[1] - nz * width / 2);
    uv.push(0, dist * uvScale, 1, dist * uvScale);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function smoothCurve(pts, n = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  return curve.getSpacedPoints(Math.max(8, pts.length * n)).map((v) => [v.x, v.z]);
}

// ------------------------------------------------------------------ world
export async function buildWorld(stage, board, { sharedAsset, asset }) {
  const { scene } = stage;
  const S = sharedAsset;
  const root = new THREE.Group();
  scene.add(root);
  const rng = makeRng(1234);
  const spaces = board.spaces;
  const frameFns = [];

  // Sky + fog + light
  const skyDay = skyTexture('#3f9bff', '#9fd4ff', '#e8f6ff');
  scene.background = skyDay;
  scene.fog = new THREE.Fog(0xcfe9ff, 95, 230);
  stage.sun.position.set(30, 55, 25);
  stage.sun.intensity = 2.4;
  stage.sun.shadow.camera.left = -48;
  stage.sun.shadow.camera.right = 48;
  stage.sun.shadow.camera.top = 40;
  stage.sun.shadow.camera.bottom = -40;
  stage.sun.shadow.camera.far = 160;
  stage.sun.shadow.camera.updateProjectionMatrix();
  stage.hemi.color.set(0xdff1ff);
  stage.hemi.groundColor.set(0x6b8a4a);
  stage.hemi.intensity = 1.0;

  // ---- island outline (polar radius function around the board centroid)
  let cx = 0;
  let cz = 0;
  spaces.forEach((s) => { cx += s.x; cz += s.z; });
  cx /= spaces.length;
  cz /= spaces.length;
  const N = 128;
  const rad = new Array(N).fill(8);
  const feature = [...spaces.map((s) => [s.x, s.z, 6]), [board.lake.x, board.lake.z, board.lake.rx + 3]];
  for (const [x, z, m] of feature) {
    const d = Math.hypot(x - cx, z - cz);
    const a = Math.atan2(z - cz, x - cx);
    for (let i = 0; i < N; i++) {
      const ai = (i / N) * Math.PI * 2;
      let da = Math.abs(((ai - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const half = Math.atan2(m, Math.max(d, 0.1));
      if (da < half) {
        const reach = d * Math.cos(da) + Math.sqrt(Math.max(0, m * m - (d * Math.sin(da)) ** 2));
        rad[i] = Math.max(rad[i], reach);
      }
    }
  }
  for (let pass = 0; pass < 4; pass++) {
    const copy = rad.slice();
    for (let i = 0; i < N; i++) rad[i] = Math.max(copy[i], (copy[(i + N - 1) % N] + copy[i] * 2 + copy[(i + 1) % N]) / 4);
  }
  for (let i = 0; i < N; i++) rad[i] += Math.sin(i * 0.9) * 0.35 + Math.sin(i * 2.3) * 0.25;
  const radiusAt = (a) => {
    const f = ((a / (Math.PI * 2)) * N + N * 4) % N;
    const i0 = Math.floor(f);
    const t = f - i0;
    return rad[i0] * (1 - t) + rad[(i0 + 1) % N] * t;
  };
  const insideIsland = (x, z, margin = 0) => Math.hypot(x - cx, z - cz) < radiusAt(Math.atan2(z - cz, x - cx)) - margin;

  // ---- island top (polar grid, vertex-coloured grass)
  {
    const RINGS = 16;
    const pos = [];
    const col = [];
    const c1 = new THREE.Color(0x67c23f);
    const c2 = new THREE.Color(0x4fae35);
    const c3 = new THREE.Color(0x86d24c);
    const tmp = new THREE.Color();
    const pushV = (x, y, z, edge) => {
      pos.push(x, y, z);
      const n = Math.sin(x * 0.35) * Math.cos(z * 0.31) + Math.sin(x * 0.11 + z * 0.13);
      tmp.copy(c1).lerp(n > 0 ? c3 : c2, Math.min(1, Math.abs(n) * 0.6));
      if (edge) tmp.lerp(c2, 0.4);
      col.push(tmp.r, tmp.g, tmp.b);
    };
    const vert = (i, k) => {
      const a = (i / N) * Math.PI * 2;
      const r = rad[i % N] * (k / RINGS);
      return [cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r];
    };
    for (let k = 0; k < RINGS; k++) {
      for (let i = 0; i < N; i++) {
        const a = vert(i, k);
        const b = vert(i + 1, k);
        const c = vert(i, k + 1);
        const d = vert(i + 1, k + 1);
        const e = k + 1 === RINGS;
        if (k > 0) { pushV(...a, false); pushV(...b, false); pushV(...c, e); }
        pushV(...b, false); pushV(...d, e); pushV(...c, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const top = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    top.receiveShadow = true;
    root.add(top);
  }

  // ---- island underside (layered rock cone, flat shaded)
  {
    const layers = [
      [1.0, 0, 0x5aa83a], [1.015, -0.45, 0x4f9a33], [0.985, -0.9, 0x8b5a34], [0.95, -2.4, 0x7d4f2d],
      [0.87, -4.6, 0x8d7a66], [0.74, -7.8, 0x776a5d], [0.55, -11.5, 0x6a5f55], [0.33, -15.5, 0x5c534b], [0.12, -19.5, 0x51493f], [0.0, -22, 0x4a423a],
    ];
    const n2 = N / 2;
    const ring = layers.map(([f, y], li) => {
      const arr = [];
      for (let i = 0; i < n2; i++) {
        const a = (i / n2) * Math.PI * 2;
        const jitter = li > 1 ? 1 + Math.sin(i * 1.7 + li * 3.1) * 0.06 + Math.sin(i * 4.3 + li) * 0.035 : 1;
        const r = radiusAt(a) * f * jitter;
        arr.push([cx + Math.cos(a) * r, y + (li > 2 ? Math.sin(i * 2.1 + li) * 0.5 : 0), cz + Math.sin(a) * r]);
      }
      return arr;
    });
    const pos = [];
    const col = [];
    const tc = new THREE.Color();
    for (let li = 0; li < layers.length - 1; li++) {
      const ca = new THREE.Color(layers[li][2]);
      const cb = new THREE.Color(layers[li + 1][2]);
      for (let i = 0; i < n2; i++) {
        const j = (i + 1) % n2;
        const quad = [ring[li][i], ring[li + 1][i], ring[li][j], ring[li][j], ring[li + 1][i], ring[li + 1][j]];
        const shade = 0.92 + ((i * 37 + li * 11) % 9) / 60;
        for (let q = 0; q < 6; q++) {
          pos.push(...quad[q]);
          tc.copy(q === 1 || q === 4 || q === 5 ? cb : ca).multiplyScalar(shade);
          col.push(tc.r, tc.g, tc.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const under = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    under.castShadow = true;
    under.receiveShadow = true;
    root.add(under);
  }

  // ---- water (lake, river, waterfall)
  const streak = waterStreaks();
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x2fb4ea, roughness: 0.12, metalness: 0.05, emissive: 0xffffff, emissiveMap: streak, emissiveIntensity: 0.28, transparent: true, opacity: 0.93 });
  const riverStreak = streak.clone();
  riverStreak.needsUpdate = true;
  const riverMat = waterMat.clone();
  riverMat.emissiveMap = riverStreak;
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xead7a2, roughness: 1 });
  const lk = board.lake;
  {
    const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), sandMat);
    sand.scale.set(lk.rx + 1.1, 1, lk.rz + 1.1);
    sand.position.set(lk.x, 0.015, lk.z);
    sand.receiveShadow = true;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), waterMat);
    water.scale.set(lk.rx, 1, lk.rz);
    water.position.set(lk.x, 0.05, lk.z);
    water.receiveShadow = true;
    root.add(sand, water);
    streak.repeat.set(3, 3);
  }
  let riverPts = null;
  let fallTop = null;
  if (board.river) {
    // Clip the river where it leaves the island; that's where the waterfall starts.
    const full = smoothCurve(board.river, 10);
    riverPts = [];
    for (const p of full) {
      riverPts.push(p);
      if (!insideIsland(p[0], p[1], 0.2)) break;
    }
    const last = riverPts[riverPts.length - 1];
    const prev = riverPts[riverPts.length - 2];
    const bank = new THREE.Mesh(ribbon(riverPts, 2.9, 0.02), sandMat);
    bank.receiveShadow = true;
    const river = new THREE.Mesh(ribbon(riverPts, 1.9, 0.06, { uvScale: 0.12 }), riverMat);
    river.receiveShadow = true;
    root.add(bank, river);
    // Waterfall: a curtain falling off the edge.
    const dir = new THREE.Vector2(last[0] - prev[0], last[1] - prev[1]).normalize();
    fallTop = new THREE.Vector3(last[0], 0.06, last[1]);
    const fallGeo = new THREE.PlaneGeometry(2.2, 26, 1, 12);
    const p = fallGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); // 13 .. -13
      const t = (13 - y) / 26; // 0 top .. 1 bottom
      p.setZ(i, 1.6 * Math.sqrt(t) + t * 1.5);
      p.setY(i, -t * 26);
      p.setX(i, p.getX(i) * (1 + t * 0.6));
    }
    fallGeo.computeVertexNormals();
    const fallStreak = streak.clone();
    fallStreak.needsUpdate = true;
    fallStreak.repeat.set(1, 3);
    fallStreak.rotation = Math.PI / 2;
    const fallAlpha = canvasTex(4, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#fff');
      gr.addColorStop(0.7, '#aaa');
      gr.addColorStop(1, '#000');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    fallAlpha.colorSpace = THREE.NoColorSpace;
    const fallMat = new THREE.MeshStandardMaterial({ color: 0x5cc8f2, emissive: 0xffffff, emissiveMap: fallStreak, emissiveIntensity: 0.55, transparent: true, alphaMap: fallAlpha, side: THREE.DoubleSide, depthWrite: false, roughness: 0.2 });
    const fall = new THREE.Mesh(fallGeo, fallMat);
    fall.position.copy(fallTop);
    fall.rotation.y = Math.atan2(dir.x, dir.y);
    root.add(fall);
    frameFns.push((dt) => { fallStreak.offset.x -= dt * 0.9; });
    // spray puffs at the lip
    const puffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, roughness: 1 });
    const puffGeo = new THREE.IcosahedronGeometry(0.5, 1);
    const puffs = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(puffGeo, puffMat);
      m.userData.ph = i / 6;
      root.add(m);
      puffs.push(m);
    }
    const out = new THREE.Vector3(dir.x, 0, dir.y);
    frameFns.push((dt, t) => {
      puffs.forEach((m, i) => {
        const k = (t * 0.4 + m.userData.ph) % 1;
        m.position.copy(fallTop).addScaledVector(out, 1.2 + k * 1.2);
        m.position.x += Math.sin(i * 2.4) * 0.9;
        m.position.y = -0.3 - k * 1.8;
        m.scale.setScalar(0.6 + k * 0.9);
      });
    });
  }
  frameFns.push((dt) => {
    streak.offset.x += dt * 0.02;
    streak.offset.y += dt * 0.012;
    riverStreak.offset.y -= dt * 0.35;
  });

  // ---- path ribbons between spaces
  const bridged = new Set(board.bridges.map((b) => `${b.a}-${b.b}`));
  {
    const pathMat = new THREE.MeshStandardMaterial({ color: 0xf1dfb0, roughness: 1 });
    const geos = [];
    for (const s of spaces) {
      for (const n of s.next) {
        if (bridged.has(`${s.id}-${n}`)) continue;
        const t = spaces[n];
        geos.push(ribbon([[s.x, s.z], [t.x, t.z]], 1.15, 0.025));
      }
    }
    for (const gg of geos) {
      const m = new THREE.Mesh(gg, pathMat);
      m.receiveShadow = true;
      root.add(m);
    }
    // little white stepping dots along the path
    const dotList = [];
    for (const s of spaces) {
      for (const n of s.next) {
        if (bridged.has(`${s.id}-${n}`)) continue;
        const t = spaces[n];
        for (const f of [0.4, 0.6]) dotList.push([s.x + (t.x - s.x) * f, s.z + (t.z - s.z) * f]);
      }
    }
    const dots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.2, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), dotList.length);
    const m4 = new THREE.Matrix4();
    dotList.forEach(([x, z], i) => { m4.makeTranslation(x, 0.06, z); dots.setMatrixAt(i, m4); });
    dots.receiveShadow = true;
    root.add(dots);
  }

  // ---- spaces
  const iconTex = {};
  const spaceMats = {};
  const iconMats = {};
  for (const type of [...Object.keys(TYPES), 'star']) {
    iconTex[type] = iconTexture(type);
    const color = type === 'star' ? 0xffc21a : TYPES[type].color;
    spaceMats[type] = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.0, emissive: color, emissiveIntensity: 0.06 });
    iconMats[type] = new THREE.MeshBasicMaterial({ map: iconTex[type], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  const puckGeo = new THREE.LatheGeometry([
    new THREE.Vector2(SPACE_R - 0.05, 0), new THREE.Vector2(SPACE_R, 0.08), new THREE.Vector2(SPACE_R, SPACE_TOP - 0.1),
    new THREE.Vector2(SPACE_R - 0.02, SPACE_TOP - 0.03), new THREE.Vector2(SPACE_R - 0.1, SPACE_TOP), new THREE.Vector2(0, SPACE_TOP),
  ], 40);
  const rimGeo = new THREE.LatheGeometry([
    new THREE.Vector2(SPACE_R + 0.1, 0), new THREE.Vector2(SPACE_R + 0.22, 0.02), new THREE.Vector2(SPACE_R + 0.22, 0.14), new THREE.Vector2(SPACE_R + 0.17, 0.2), new THREE.Vector2(SPACE_R - 0.05, 0.2),
  ], 40);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const iconGeo = new THREE.CircleGeometry(SPACE_R * 0.72, 32).rotateX(-Math.PI / 2);
  const spaceObjs = spaces.map((s) => {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.receiveShadow = true;
    const puck = new THREE.Mesh(puckGeo, spaceMats[s.type]);
    puck.castShadow = true;
    puck.receiveShadow = true;
    const icon = new THREE.Mesh(iconGeo, iconMats[s.type]);
    icon.position.y = SPACE_TOP + 0.01;
    icon.rotation.y = Math.PI * 0.0;
    icon.renderOrder = 2;
    g.add(rim, puck, icon);
    root.add(g);
    return { g, puck, icon };
  });
  function setSpaceLook(id, type) {
    const o = spaceObjs[id];
    o.puck.material = spaceMats[type];
    o.icon.material = iconMats[type];
  }
  const bounces = [];
  function bounceSpace(id) { bounces.push({ id, t: 0 }); }
  frameFns.push((dt) => {
    for (let i = bounces.length - 1; i >= 0; i--) {
      const b = bounces[i];
      b.t += dt;
      const k = b.t / 0.45;
      const o = spaceObjs[b.id].g;
      o.scale.set(1 + Math.sin(k * Math.PI) * 0.18, 1 - Math.sin(k * Math.PI) * 0.25, 1 + Math.sin(k * Math.PI) * 0.18);
      if (k >= 1) { o.scale.set(1, 1, 1); bounces.splice(i, 1); }
    }
  });

  // ---- load models
  const L = (p, o) => model(S(p), o).catch((e) => { console.warn('model failed', p, e); return new THREE.Group(); });
  const A = (p, o) => model(asset(p), o).catch((e) => { console.warn('model failed', p, e); return new THREE.Group(); });

  // ---- bridges
  await Promise.all(board.bridges.map(async (b) => {
    const br = await L('props/bridge-small.glb', { size: b.len - 1.2 });
    br.position.set(b.x, 0.02, b.z);
    br.rotation.y = b.angle - Math.PI / 2;
    root.add(br);
  }));

  // ---- decoration scatter (rejection sampling)
  const edges = [];
  for (const s of spaces) for (const n of s.next) edges.push([s.x, s.z, spaces[n].x, spaces[n].z]);
  const pathDist = (x, z) => {
    let d = Infinity;
    for (const e of edges) d = Math.min(d, segDist(x, z, ...e));
    return d;
  };
  const occupied = [];
  const free = (x, z, r) => occupied.every(([ox, oz, or]) => Math.hypot(x - ox, z - oz) > r + or);
  const blocked = (x, z, clear = 2.3) => {
    if (pathDist(x, z) < clear) return true;
    if (((x - lk.x) / (lk.rx + 1.6)) ** 2 + ((z - lk.z) / (lk.rz + 1.6)) ** 2 < 1) return true;
    if (riverPts && polyDist(x, z, riverPts) < 2.4) return true;
    return false;
  };
  function place(n, { r = 1, margin = 1.2, clear = 2.3, tries = 40, filter = null } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < tries; t++) {
        const a = rng.next() * Math.PI * 2;
        const rr = Math.sqrt(rng.next());
        const x = cx + Math.cos(a) * rr * (radiusAt(a));
        const z = cz + Math.sin(a) * rr * (radiusAt(a));
        if (!insideIsland(x, z, margin)) continue;
        if (blocked(x, z, clear)) continue;
        if (!free(x, z, r)) continue;
        if (filter && !filter(x, z)) continue;
        occupied.push([x, z, r]);
        out.push({ x, z, rot: rng.next() * Math.PI * 2 });
        break;
      }
    }
    return out;
  }
  // Village first (fixed spots), so nature avoids it.
  const villageSpots = [];
  for (const [vx, vz] of board.village) {
    if (!blocked(vx, vz, 3.2) && free(vx, vz, 2.4)) {
      occupied.push([vx, vz, 2.6]);
      villageSpots.push([vx, vz]);
    }
  }
  // Landmarks
  const landmarks = [];
  const tryLandmark = (x, z, r) => {
    if (!blocked(x, z, r + 1.2) && free(x, z, r) && insideIsland(x, z, r)) { occupied.push([x, z, r]); landmarks.push([x, z]); return true; }
    return false;
  };
  const towerSpot = [[-20, -9], [-18, 7], [-6, -9]].find(([x, z]) => tryLandmark(x, z, 2.6));
  const windmillSpot = [[-23, 1], [-21, 4], [18, -9]].find(([x, z]) => tryLandmark(x, z, 2));
  const fountainSpot = villageSpots.length ? (() => {
    const fx = villageSpots.reduce((s, v) => s + v[0], 0) / villageSpots.length;
    const fz = villageSpots.reduce((s, v) => s + v[1], 0) / villageSpots.length;
    return tryLandmark(fx, fz, 1.8) ? [fx, fz] : null;
  })() : null;

  const trees = place(34, { r: 2.2, margin: 1.2, clear: 3.2 });
  const bushes = place(26, { r: 0.9, margin: 0.8, clear: 1.9 });
  const rocks = place(22, { r: 0.8, margin: 0.4, clear: 1.9 });
  const flowers = place(70, { r: 0.35, margin: 0.6, clear: 1.6 });
  const tufts = place(110, { r: 0.25, margin: 0.3, clear: 1.5 });
  const mush = place(10, { r: 0.4, margin: 1, clear: 1.7 });

  const split = (arr, k) => { const res = Array.from({ length: k }, () => []); arr.forEach((v, i) => res[i % k].push(v)); return res; };
  const treeKinds = ['nature/tree-1-a.glb', 'nature/tree-2-a.glb', 'nature/tree-3-a.glb', 'nature/q-tree.glb', 'nature/k-tree-palm-tall.glb'];
  const treeSets = split(trees, treeKinds.length);
  const jobs = [];
  treeKinds.forEach((k, i) => jobs.push(instanced(S(k), treeSets[i].map((p) => ({ ...p, h: (k.includes('palm') ? 4.4 : 3.3) + rng.next() * 1.0 })))));
  const bushKinds = ['nature/bush-1-a.glb', 'nature/bush-2-a.glb', 'nature/q-bush.glb', 'nature/q-bush-fruit.glb'];
  split(bushes, 4).forEach((set, i) => jobs.push(instanced(S(bushKinds[i]), set.map((p) => ({ ...p, h: 0.9 + rng.next() * 0.6 })))));
  const rockKinds = ['nature/rock-1-a.glb', 'nature/rock-2-a.glb', 'nature/q-rock-1.glb', 'nature/q-rock-2.glb'];
  split(rocks, 4).forEach((set, i) => jobs.push(instanced(S(rockKinds[i]), set.map((p) => ({ ...p, h: 0.6 + rng.next() * 1.0 })))));
  const flowerKinds = ['nature/k-flower-red-a.glb', 'nature/k-flower-yellow-a.glb', 'nature/k-flower-purple-a.glb', 'platformer/flowers.glb'];
  split(flowers, 4).forEach((set, i) => jobs.push(instanced(S(flowerKinds[i]), set.map((p) => ({ ...p, h: i === 3 ? 0.25 : 0.45 + rng.next() * 0.25 })), { shadows: false })));
  jobs.push(instanced(S('nature/grass-2-a.glb'), tufts.map((p) => ({ ...p, h: 0.35 + rng.next() * 0.25 })), { shadows: false }));
  jobs.push(instanced(S('nature/k-mushroom-red-group.glb'), mush.map((p) => ({ ...p, h: 0.5 }))));
  // Lily pads on the lake
  const lilies = [];
  for (let i = 0; i < 7; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 0.35 + rng.next() * 0.5;
    lilies.push({ x: lk.x + Math.cos(a) * lk.rx * r, z: lk.z + Math.sin(a) * lk.rz * r, y: 0.06, rot: rng.next() * 6, h: 0.12 });
  }
  jobs.push(instanced(S('nature/k-lily-large.glb'), lilies, { shadows: false }));
  // Rocks hanging on the cliff rim
  const rimRocks = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng.next() * 0.2;
    const r = radiusAt(a) - 0.3;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (pathDist(x, z) < 2.2 || (riverPts && polyDist(x, z, riverPts) < 3)) continue;
    rimRocks.push({ x, z, y: -0.6, rot: rng.next() * 6, h: 1.4 + rng.next() * 1.4 });
  }
  jobs.push(instanced(S('nature/rock-2-a.glb'), rimRocks.map((r) => ({ ...r, y: -0.3, h: r.h * 0.8 }))));
  const groups = await Promise.all(jobs);
  groups.forEach((g) => root.add(g));

  // ---- landmarks & village (Kenney Fantasy Town pieces assembled into cottages)
  async function cottage(x, z, rot, { floors = 1, wood = true, roof = 'roof-high-point', variant = false } = {}) {
    const g = new THREE.Group();
    const walls = wood
      ? ['town/wall-wood-door.glb', 'town/wall-wood-window-shutters.glb', 'town/wall-wood.glb', 'town/wall-wood-window-round.glb']
      : ['town/wall-door.glb', 'town/wall-window-shutters.glb', 'town/wall.glb', 'town/wall-window-glass.glb'];
    const parts = [];
    for (let f = 0; f < floors; f++) {
      for (let side = 0; side < 4; side++) {
        const w = f === 0 ? walls[side] : (side % 2 ? walls[1] : walls[3]);
        parts.push(A(w, { center: false }).then((m) => { m.rotation.y = -side * Math.PI / 2 + Math.PI / 2; m.position.y = f; g.add(m); }));
      }
    }
    parts.push(A(`town/${roof}.glb`, { center: false }).then((m) => { m.position.y = floors; g.add(m); if (variant) recolor(m); }));
    parts.push(A('town/chimney.glb', { center: false }).then((m) => { m.position.set(0.05, floors + 0.1, 0.12); m.scale.setScalar(0.8); g.add(m); }));
    await Promise.all(parts);
    g.scale.setScalar(2.3);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    root.add(g);
    return g;
  }
  let variantTex = null;
  function recolor(m) {
    if (!variantTex) {
      variantTex = new THREE.TextureLoader().load(asset('town/Textures/variation-a.png'));
      variantTex.flipY = false;
      variantTex.colorSpace = THREE.SRGBColorSpace;
    }
    m.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); o.material.map = variantTex; }
    });
  }
  const faceCenter = (x, z) => Math.atan2((fountainSpot?.[0] ?? cx) - x, (fountainSpot?.[1] ?? cz) - z);
  const vjobs = villageSpots.map(([x, z], i) => cottage(x, z, faceCenter(x, z), { floors: i % 3 === 1 ? 2 : 1, wood: i % 2 === 0, variant: i % 2 === 1, roof: i % 3 === 2 ? 'roof-point' : 'roof-high-point' }));
  if (fountainSpot) {
    vjobs.push(A('town/fountain-round-detail.glb', { size: 3.4 }).then((m) => { m.position.set(fountainSpot[0], 0, fountainSpot[1]); root.add(m); }));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      vjobs.push(A('town/lantern.glb', { height: 2.2 }).then((m) => { m.position.set(fountainSpot[0] + Math.cos(a) * 2.6, 0, fountainSpot[1] + Math.sin(a) * 2.6); root.add(m); }));
    }
  }
  if (towerSpot) {
    vjobs.push(L('props/tower.glb', { height: 8.5 }).then((m) => { m.position.set(towerSpot[0], 0, towerSpot[1]); m.rotation.y = 0.6; root.add(m); }));
  }
  let blades = null;
  if (windmillSpot) {
    vjobs.push(cottage(windmillSpot[0], windmillSpot[1], Math.PI * 0.15, { floors: 3, wood: false, roof: 'roof-high-point', variant: true }).then(async (g) => {
      const b = await A('town/windmill.glb', { center: true });
      // blades spin around the model's local X axis; put them on the front wall
      b.position.set(0, 2.25, 0.6);
      b.rotation.y = Math.PI / 2;
      b.scale.setScalar(0.85);
      g.add(b);
      blades = b;
    }));
  }
  frameFns.push((dt) => { if (blades) blades.userData.inner.rotation.x += dt * 0.8; });
  // Market stalls next to shop spaces
  for (const s of spaces.filter((q) => q.type === 'shop')) {
    const out = new THREE.Vector2(s.x - cx, s.z - cz).normalize();
    for (const side of [1, -1]) {
      const x = s.x + out.x * 2.6 * side;
      const z = s.z + out.y * 2.6 * side;
      if (!insideIsland(x, z, 1) || blocked(x, z, 1.6) || !free(x, z, 1)) continue;
      occupied.push([x, z, 1]);
      vjobs.push(A(side > 0 ? 'town/stall-red.glb' : 'town/stall-green.glb', { height: 2.6 }).then((m) => { m.position.set(x, 0, z); m.rotation.y = Math.atan2(s.x - x, s.z - z); root.add(m); }));
      break;
    }
  }
  // Start gate flag
  {
    const s0 = spaces[0];
    vjobs.push(L('props/goal-flag.glb', { height: 2.6 }).then((m) => { m.position.set(s0.x - 1.7, 0, s0.z - 0.4); root.add(m); }));
  }
  await Promise.all(vjobs);

  // ---- clouds and floating islets
  const cloudKinds = ['nature/q-cloud-1.glb', 'nature/q-cloud-2.glb', 'nature/q-cloud-3.glb'];
  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xdde9ff, emissiveIntensity: 0.25, transparent: true, opacity: 0.96 });
  await Promise.all(Array.from({ length: 18 }, async (_, i) => {
    const c = await L(cloudKinds[i % 3], { size: 7 + rng.next() * 9, shadows: false });
    c.traverse((o) => { if (o.isMesh) o.material = cloudMat; });
    const a = rng.next() * Math.PI * 2;
    const r = 52 + rng.next() * 45;
    const below = i % 3 === 0;
    c.position.set(cx + Math.cos(a) * r, below ? -14 - rng.next() * 10 : -4 + rng.next() * 16, cz + Math.sin(a) * r * 0.8);
    c.userData.speed = 0.4 + rng.next() * 0.5;
    root.add(c);
    clouds.push(c);
  }));
  frameFns.push((dt) => {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > cx + 110) c.position.x = cx - 110;
    }
  });
  const islets = [];
  for (let i = 0; i < 4; i++) {
    const a = 0.6 + i * 1.55 + rng.next() * 0.4;
    const r = 48 + rng.next() * 10;
    const ig = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 6, 7).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0x7d5a3c, flatShading: true, roughness: 1 }));
    cone.position.y = -3;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.2, 0.6, 7), new THREE.MeshStandardMaterial({ color: 0x62bb3f, flatShading: true, roughness: 1 }));
    cap.position.y = -0.1;
    ig.add(cone, cap);
    const t = await L(i % 2 ? 'nature/tree-2-a.glb' : 'nature/k-tree-palm-tall.glb', { height: 4 });
    t.position.y = 0.2;
    ig.add(t);
    ig.position.set(cx + Math.cos(a) * r, -6 + rng.next() * 8, cz + Math.sin(a) * r * 0.75);
    ig.userData.base = ig.position.y;
    ig.userData.ph = rng.next() * 6;
    root.add(ig);
    islets.push(ig);
  }
  frameFns.push((dt, t) => { for (const ig of islets) ig.position.y = ig.userData.base + Math.sin(t * 0.5 + ig.userData.ph) * 0.6; });

  // ---- the Star
  const star = new THREE.Group();
  const starModel = await L('props/star.glb', { size: 1.7 });
  starModel.userData.inner.traverse((o) => {
    if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0xffb300); o.material.emissiveIntensity = 0.45; o.material.metalness = 0.4; o.material.roughness = 0.25; }
  });
  starModel.position.y = 2.2;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(4.2);
  glow.position.y = 2.95;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.25, 7, 24, 1, true), beamMat);
  beam.position.y = 3.5;
  star.add(starModel, glow, beam);
  root.add(star);
  let starSpace = -1;
  frameFns.push((dt, t) => {
    starModel.rotation.y += dt * 1.6;
    starModel.position.y = 2.2 + Math.sin(t * 2) * 0.18;
    glow.material.opacity = 0.7 + Math.sin(t * 3) * 0.2;
  });
  function setStar(id) {
    if (starSpace >= 0) setSpaceLook(starSpace, spaces[starSpace].type);
    starSpace = id;
    star.visible = id >= 0;
    if (id >= 0) {
      star.position.set(spaces[id].x, 0, spaces[id].z);
      setSpaceLook(id, 'star');
    }
  }

  // ---- junction arrows
  const arrowGroup = new THREE.Group();
  root.add(arrowGroup);
  const arrowProto = await L('props/arrow.glb', { size: 1.5 });
  const arrowMats = [0xffd23f, 0x4fd1ff, 0xff6fb1].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, roughness: 0.4 }));
  function showArrows(spaceId) {
    arrowGroup.clear();
    const s = spaces[spaceId];
    s.next.forEach((n, i) => {
      const t = spaces[n];
      const dx = t.x - s.x;
      const dz = t.z - s.z;
      const l = Math.hypot(dx, dz);
      const a = arrowProto.clone();
      a.traverse((o) => { if (o.isMesh) o.material = arrowMats[i % 3]; });
      const holder = new THREE.Group();
      holder.add(a);
      holder.position.set(s.x + (dx / l) * 2.1, 0.9, s.z + (dz / l) * 2.1);
      holder.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
      holder.userData.dir = new THREE.Vector3(dx / l, 0, dz / l);
      holder.userData.base = holder.position.clone();
      arrowGroup.add(holder);
    });
  }
  function hideArrows() { arrowGroup.clear(); }
  frameFns.push((dt, t) => {
    arrowGroup.children.forEach((h, i) => {
      h.position.copy(h.userData.base).addScaledVector(h.userData.dir, Math.sin(t * 6 + i) * 0.25);
    });
  });

  // ---- frenzy mood
  const skyFrenzy = skyTexture('#5b3cc4', '#ff7a59', '#ffd18a');
  function setFrenzy(on) {
    scene.background = on ? skyFrenzy : skyDay;
    scene.fog.color.set(on ? 0xffb98a : 0xcfe9ff);
    stage.sun.color.set(on ? 0xffc28a : 0xfff2dd);
    stage.hemi.color.set(on ? 0xffd7c2 : 0xdff1ff);
  }

  return {
    root,
    center: new THREE.Vector3(cx, 0, cz),
    extent: Math.max(...rad),
    spaceTop: SPACE_TOP,
    spacePos: (id, out = new THREE.Vector3()) => out.set(spaces[id].x, SPACE_TOP, spaces[id].z),
    setStar,
    get starSpace() { return starSpace; },
    starObject: star,
    starModel,
    bounceSpace,
    showArrows,
    hideArrows,
    setFrenzy,
    isBridge: (a, b) => bridged.has(`${a}-${b}`),
    update(dt, t) { for (const fn of frameFns) fn(dt, t); },
  };
}
