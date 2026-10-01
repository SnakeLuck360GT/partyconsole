// Builds the visual world for a Track: road ribbon, kerbs, walls, terrain, start gantry,
// boost pads, jump ramps, sky and dense decoration (instanced library models).
import * as THREE from 'three';
import { tryProto, instance } from './assets.js';
import { rng, fbm, smoothstep, lerp, canvasTex, glowTexture } from './util.js';
import { makeSky } from './sky.js';

const TRACK_PROPS = {
  grand: 'track/grand-stand-covered.glb',
  grandAwning: 'track/grand-stand-awning.glb',
  grandOpen: 'track/grand-stand.glb',
  tent: 'track/tent.glb',
  flagChecker: 'track/flag-checkers.glb',
  flagRed: 'track/flag-red.glb',
  flagGreen: 'track/flag-green.glb',
  bannerRed: 'track/banner-tower-red.glb',
  bannerGreen: 'track/banner-tower-green.glb',
  billboard: 'track/billboard.glb',
  lightPost: 'track/light-post-large.glb',
  pits: 'track/pits-garage.glb',
  office: 'track/pits-office.glb',
  overhead: 'track/overhead.glb',
  tire: 'vehicles/parts/debris-tire.glb',
  cone: 'track/cone.glb',
  pylon: 'track/pylon.glb',
  fence: 'track/fence-straight.glb',
};

// ------------------------------------------------------------------ textures

function roadTexture(asphalt, night) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = asphalt;
    g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 9000; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.05 + r() * 0.12})` : `rgba(255,255,255,${0.03 + r() * 0.07})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // worn racing lines
    for (const cx of [0.3, 0.7]) {
      const gr = g.createLinearGradient((cx - 0.12) * w, 0, (cx + 0.12) * w, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0.13)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect((cx - 0.12) * w, 0, 0.24 * w, h);
    }
    // edge lines
    g.fillStyle = night ? '#dfe8ff' : '#f4f4f0';
    g.fillRect(0.03 * w, 0, 0.022 * w, h);
    g.fillRect(0.948 * w, 0, 0.022 * w, h);
    // centre dashes
    g.fillStyle = night ? 'rgba(120,230,255,0.85)' : 'rgba(255,214,70,0.9)';
    for (let y = 0; y < h; y += h / 6) g.fillRect(0.492 * w, y, 0.016 * w, h / 12);
  });
}

function kerbTexture(a, b) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.25)');
    gr.addColorStop(0.3, 'rgba(0,0,0,0)');
    gr.addColorStop(0.8, 'rgba(255,255,255,0.1)');
    gr.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

function wallTexture(style) {
  return canvasTex(128, 128, (g, w, h) => {
    if (style === 'neon') {
      g.fillStyle = '#1c2033'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a3050'; g.fillRect(0, h * 0.8, w, h * 0.2);
      return;
    }
    const [c1, c2] = style === 'orangewhite' ? ['#ff8a2a', '#fff4e6'] : ['#e8352e', '#fafafa'];
    g.fillStyle = c1; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = c2; g.fillRect(0, h / 2, w, h / 2);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, 0, w * 0.06, h); // top bevel shade
  });
}

function neonEmissive(color) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.fillRect(w * 0.18, 0, w * 0.1, h);
  });
}

function checkerTexture() {
  return canvasTex(128, 32, (g, w, h) => {
    const n = 16; const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      g.fillRect(i * s, j * s, s, s);
    }
  }, { repeat: false });
}

function boostTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#ff7a00'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#ff4d00'); gr.addColorStop(0.5, '#ffb400'); gr.addColorStop(1, '#ff4d00');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6c0';
    for (let k = 0; k < 2; k++) {
      const y0 = k * h / 2;
      g.beginPath();
      g.moveTo(w * 0.12, y0 + h * 0.34); g.lineTo(w * 0.5, y0 + h * 0.08); g.lineTo(w * 0.88, y0 + h * 0.34);
      g.lineTo(w * 0.88, y0 + h * 0.46); g.lineTo(w * 0.5, y0 + h * 0.2); g.lineTo(w * 0.12, y0 + h * 0.46);
      g.closePath(); g.fill();
    }
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(4, -10, w - 8, h + 20);
  });
}

function rampTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffd21f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#222';
    for (let i = -2; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + 64, h); g.lineTo(i * 32 + 64, h);
      g.closePath(); g.fill();
    }
  });
}

function bannerTexture(night) {
  return canvasTex(1024, 128, (g, w, h) => {
    const s = 32;
    for (let i = 0; i < w / s; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * s, j * s, s, s); }
    g.fillStyle = night ? '#1b1340' : '#d7261e';
    g.fillRect(w * 0.22, 0, w * 0.56, h);
    g.font = '700 84px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = night ? '#6ff7ff' : '#fff';
    g.fillText('KART CHAOS', w / 2, h / 2 + 4);
  }, { repeat: false });
}

function detailTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const r = rng(3);
    for (let i = 0; i < w * h; i++) {
      const x = i % w; const y = Math.floor(i / w);
      const v = 200 + 55 * (fbm(x / 16, y / 16, 3) * 0.6 + r() * 0.4);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

// ------------------------------------------------------------------ geometry helpers

/**
 * Ribbon along the track between sample indices [i0, i1] (inclusive, may wrap), using a cross-section
 * profile of [lat, dy, u]. v = arc length / vLen.
 */
function ribbon(track, profile, i0, i1, vLen, yFn = null) {
  const N = track.N;
  const count = i1 >= i0 ? i1 - i0 + 1 : N - i0 + i1 + 1;
  const P = profile.length;
  const pos = new Float32Array(count * P * 3);
  const uv = new Float32Array(count * P * 2);
  const idx = [];
  for (let k = 0; k < count; k++) {
    const i = (i0 + k) % N;
    const s = (i0 + k) * track.seg;
    for (let p = 0; p < P; p++) {
      const [lat, dy, u] = profile[p];
      const x = track.px[i] + track.rx[i] * lat;
      const z = track.pz[i] + track.rz[i] * lat;
      const y = track.py[i] + dy + (yFn ? yFn(i * track.seg, lat) : 0);
      const o = (k * P + p);
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
      uv[o * 2] = u; uv[o * 2 + 1] = s / vLen;
    }
    if (k < count - 1) {
      for (let p = 0; p < P - 1; p++) {
        const a = k * P + p; const b = a + 1; const c = a + P; const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------ main builder

export async function buildTrackScene(track, sharedAsset, { lowDetail = false } = {}) {
  const def = track.def;
  const th = def.theme;
  const group = new THREE.Group();
  const animated = []; // fn(dt, t)
  const disposables = [];
  const r = rng(def.id.length * 977 + 13);
  const N = track.N;
  const hw = track.halfWidth;
  const wd = track.wallDist;

  const sky = makeSky(th);

  // ---------------- road
  const roadTex = roadTexture(th.asphalt, th.night);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.88, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const roadProfile = [];
  for (let k = 0; k <= 4; k++) { const u = k / 4; roadProfile.push([-hw + 2 * hw * u, 0.03, u]); }
  const roadGeo = ribbon(track, roadProfile, 0, N, 2 * hw * 2.1);
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ---------------- kerbs on corners
  const kerbTex = th.wall === 'neon' ? kerbTexture('#ff3ad6', '#e8f4ff') : th.wall === 'orangewhite' ? kerbTexture('#e8452a', '#fff3e0') : kerbTexture('#e22c2c', '#ffffff');
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7 });
  const isCorner = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (Math.abs(track.curv[i]) > 1 / 70) for (let k = -8; k <= 8; k++) isCorner[(i + k + N) % N] = 1;
  // split into ranges
  const ranges = [];
  let start = -1;
  const firstFalse = isCorner.indexOf(0);
  if (firstFalse >= 0) {
    for (let k = 0; k <= N; k++) {
      const i = (firstFalse + k) % N;
      if (isCorner[i] && start < 0) start = i;
      if ((!isCorner[i] || k === N) && start >= 0) { ranges.push([start, (i - 1 + N) % N]); start = -1; }
    }
  }
  for (const [a, b] of ranges) {
    for (const side of [-1, 1]) {
      const prof = side < 0
        ? [[-hw - 1.5, 0.02, 1], [-hw - 0.9, 0.12, 0.6], [-hw + 0.15, 0.06, 0]]
        : [[hw - 0.15, 0.06, 0], [hw + 0.9, 0.12, 0.6], [hw + 1.5, 0.02, 1]];
      const kerb = new THREE.Mesh(ribbon(track, prof, a, b, 2.6), kerbMat);
      kerb.receiveShadow = true;
      group.add(kerb);
    }
  }

  // ---------------- walls
  const wallTex = wallTexture(th.wall);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.6 });
  if (th.wall === 'neon') {
    wallMat.emissiveMap = neonEmissive('#ffffff');
    wallMat.emissive = new THREE.Color(0x35e8ff);
    wallMat.emissiveIntensity = 2.2;
  }
  const wallH = 1.0;
  for (const side of [-1, 1]) {
    const o = side * wd;
    const t = side * 0.55;
    // profile: inner base -> inner top -> outer top -> outer base (u across 0..1)
    const prof = side < 0
      ? [[o + t, -0.4, 1], [o + t, wallH, 0.62], [o, wallH, 0.3], [o, -0.4, 0]]
      : [[o, -0.4, 0], [o, wallH, 0.3], [o + t, wallH, 0.62], [o + t, -0.4, 1]];
    const geo = ribbon(track, prof, 0, N, 4);
    // u maps across the stripe texture horizontally; rotate so stripes alternate along the wall
    const uvA = geo.attributes.uv;
    for (let i = 0; i < uvA.count; i++) { const u = uvA.getX(i); const v = uvA.getY(i); uvA.setXY(i, u * 0.999, v); }
    const w = new THREE.Mesh(geo, wallMat);
    w.castShadow = true;
    w.receiveShadow = true;
    group.add(w);
  }

  // ---------------- terrain
  const minX = Math.min(...track.px) - 170; const maxX = Math.max(...track.px) + 170;
  const minZ = Math.min(...track.pz) - 170; const maxZ = Math.max(...track.pz) + 170;
  const cell = lowDetail ? 4 : 3;
  const nx = Math.ceil((maxX - minX) / cell) + 1;
  const nz = Math.ceil((maxZ - minZ) / cell) + 1;
  const tpos = new Float32Array(nx * nz * 3);
  const tcol = new Float32Array(nx * nz * 3);
  const tuv = new Float32Array(nx * nz * 2);
  const cBase = new THREE.Color(th.ground[0]); const cDark = new THREE.Color(th.ground[1]); const cLight = new THREE.Color(th.ground[2]);
  const cShoulder = new THREE.Color(th.shoulder);
  const cSand = new THREE.Color(th.sand ?? 0xe6d29a);
  const tmpC = new THREE.Color();
  // coarse grid of nearest samples to speed up lookups
  const step = 4; // check every 4th sample first, then refine
  function nearest(x, z) {
    let bi = 0; let bd = Infinity;
    for (let i = 0; i < N; i += step) {
      const d = (track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    for (let k = -step; k <= step; k++) {
      const i = (bi + k + N) % N;
      const d = (track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    return [bi, Math.sqrt(bd)];
  }
  const hills = th.hills;
  function terrainAt(x, z) {
    const [i, d] = nearest(x, z);
    const ty = track.py[i];
    const inner = wd + 1.0;
    let far = hills * (fbm(x / 90, z / 90, 4) - 0.35) * 2;
    if (def.decor.bigRocks) far += 10 * smoothstep(0.55, 0.8, fbm(x / 60 + 7, z / 60, 3));
    const w = smoothstep(inner, inner + 38, d);
    const base = ty - 0.12;
    let h = lerp(base, Math.max(far, -4) + ty * 0.35, w);
    if (d < hw) h = ty - 0.3;
    return { h, d, i, ty };
  }
  this_terrain: {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = minX + i * cell; const z = minZ + j * cell;
        const { h, d } = terrainAt(x, z);
        const o = j * nx + i;
        tpos[o * 3] = x; tpos[o * 3 + 1] = h; tpos[o * 3 + 2] = z;
        tuv[o * 2] = x / 9; tuv[o * 2 + 1] = z / 9;
        const n = fbm(x / 25, z / 25, 3);
        tmpC.copy(cBase).lerp(n > 0.5 ? cLight : cDark, Math.abs(n - 0.5) * 1.6);
        if (def.id === 'canyon') {
          const band = Math.sin(h * 1.3) * 0.5 + 0.5;
          tmpC.lerp(new THREE.Color(0xb86a3c), band * smoothstep(1, 6, Math.abs(h - 0)) * 0.35);
        }
        if (th.water != null) tmpC.lerp(cSand, smoothstep(th.water + 1.4, th.water - 0.2, h));
        const sh = 1 - smoothstep(wd - 0.5, wd + 2.5, d);
        tmpC.lerp(cShoulder, sh);
        tcol[o * 3] = tmpC.r; tcol[o * 3 + 1] = tmpC.g; tcol[o * 3 + 2] = tmpC.b;
      }
    }
  }
  const tidx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i; const b = a + 1; const c = a + nx; const d = c + 1;
    tidx.push(a, c, b, b, c, d);
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  tgeo.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
  tgeo.setIndex(tidx);
  tgeo.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTexture(), roughness: th.night ? 0.7 : 0.95, metalness: 0 });
  const terrain = new THREE.Mesh(tgeo, terrainMat);
  terrain.receiveShadow = true;
  group.add(terrain);
  if (th.water != null) group.add(buildWater(th, minX, maxX, minZ, maxZ, terrainAt, animated));

  // ---------------- start line + grid slots
  {
    const p = track.pointAt(0);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 2.2), new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    line.rotation.set(-Math.PI / 2, 0, p.hd, 'YXZ');
    line.rotation.order = 'YXZ';
    line.rotation.set(-Math.PI / 2, p.hd, 0);
    line.position.set(p.x, p.y + 0.05, p.z);
    group.add(line);
    // grid markers
    const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const markGeo = new THREE.PlaneGeometry(2.6, 0.25);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const q = track.pointAt(-6 - row * 5.2 - (col % 2) * 1.8, (col - 1.5) * 3.8);
      const m = new THREE.Mesh(markGeo, markMat);
      m.rotation.order = 'YXZ';
      m.rotation.set(-Math.PI / 2, q.hd, 0);
      m.position.set(q.x, q.y + 0.05, q.z);
      group.add(m);
    }
  }

  // ---------------- boost pads
  const boostTex = boostTexture();
  const boostMat = new THREE.MeshStandardMaterial({ map: boostTex, emissiveMap: boostTex, emissive: 0xffffff, emissiveIntensity: th.night ? 1.4 : 0.55, roughness: 0.4, transparent: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (const b of track.boosts) {
    const i0 = Math.floor((b.s - b.len / 2) / track.seg);
    const i1 = Math.ceil((b.s + b.len / 2) / track.seg);
    const prof = [[b.lat - b.half, 0.06, 0], [b.lat + b.half, 0.06, 1]];
    const geo = ribbon(track, prof, (i0 + N) % N, (i1 + N) % N, b.len);
    const m = new THREE.Mesh(geo, boostMat);
    group.add(m);
  }
  animated.push((dt) => { boostTex.offset.y -= dt * 1.6; });

  // ---------------- jump ramps
  const rampMat = new THREE.MeshStandardMaterial({ map: rampTexture(), roughness: 0.6 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.8 });
  for (const j of track.jumps) {
    const i0 = (Math.floor((j.s - j.len) / track.seg) + N) % N;
    const i1 = (Math.floor(j.s / track.seg) + N) % N;
    const yfn = (s, lat) => track.rampHeight(s + 0.01, Math.max(-j.half + 0.01, Math.min(j.half - 0.01, lat)));
    const top = new THREE.Mesh(ribbon(track, [[-j.half, 0.04, 0], [j.half, 0.04, 1]], i0, i1, 4, yfn), rampMat);
    top.castShadow = true; top.receiveShadow = true;
    group.add(top);
    for (const side of [-1, 1]) {
      const lat = side * j.half;
      const sideGeo = ribbon(track, [[lat, 0, 0], [lat, 0.04, 1]], i0, i1, 4, (s, l) => (l === lat && false ? 0 : 0));
      // raise the top edge of the side strip to the ramp height
      const pa = sideGeo.attributes.position;
      for (let k = 0; k < pa.count; k += 2) {
        const i = (i0 + k / 2) % N;
        pa.setY(k + 1, track.py[i] + 0.04 + track.rampHeight(i * track.seg + 0.01, lat - side * 0.02));
      }
      sideGeo.computeVertexNormals();
      const sm = new THREE.Mesh(sideGeo, sideMat);
      sm.material.side = THREE.DoubleSide;
      group.add(sm);
    }
    // lip face
    const p = track.pointAt(i1 * track.seg);
    const lip = new THREE.Mesh(new THREE.PlaneGeometry(2 * j.half, j.h), sideMat);
    lip.rotation.order = 'YXZ';
    lip.rotation.set(0, p.hd, 0);
    lip.position.set(p.x, p.y + j.h / 2, p.z);
    group.add(lip);
  }

  // ---------------- models
  const S = (f) => tryProto(sharedAsset(f));
  const protos = {};
  const tpKeys = Object.keys(TRACK_PROPS);
  const tpVals = await Promise.all(tpKeys.map((k) => S(TRACK_PROPS[k])));
  tpKeys.forEach((k, i) => { protos[k] = tpVals[i]; });
  const load = (arr) => Promise.all((arr || []).map(S)).then((a) => a.filter(Boolean));
  const [trees, bushes, small, rocks] = await Promise.all([load(def.decor.trees), load(def.decor.bushes), load(def.decor.small), load(def.decor.rocks)]);

  const frostMap = new Map();
  const matMap = def.decor.frost ? (m) => {
    if (!frostMap.has(m)) {
      const c = m.clone();
      if (c.color) c.color.lerp(new THREE.Color(0xeaf2ff), 0.22);
      frostMap.set(m, c);
    }
    return frostMap.get(m);
  } : null;

  // helper: place along track at arc s, lateral lat, facing the track
  const place = (s, lat, extra = {}) => {
    const p = track.pointAt(s, lat);
    const t = terrainAt(p.x, p.z);
    return { x: p.x, y: t.h, z: p.z, hd: p.hd, ...extra };
  };
  const sizeScale = (proto, h) => (proto ? h / Math.max(0.01, proto.size.y) : 1);
  const widthScale = (proto, w) => (proto ? w / Math.max(0.01, proto.size.x) : 1);

  // grandstands along the start straight (left side, facing the track)
  const stands = [];
  const standKinds = [protos.grand, protos.grandAwning, protos.grandOpen].filter(Boolean);
  for (let k = 0; k < 5; k++) {
    const pr = standKinds[k % standKinds.length];
    const sc = widthScale(pr, 11);
    const pos = place(8 + k * 12.5, -(wd + 1.2 + (pr?.size.z || 1) * sc / 2));
    stands.push({ pr, t: { ...pos, ry: pos.hd - Math.PI / 2, s: sc } });
  }
  for (const pr of standKinds) instance(group, pr, stands.filter((q) => q.pr === pr).map((q) => q.t));
  // grandstand near the other side of the grid/end
  // pits & tents on the right side of the straight
  const tents = []; const pits = [];
  for (let k = 0; k < 4; k++) {
    const pos = place(-40 + k * 9, wd + 6);
    pits.push({ ...pos, ry: pos.hd + Math.PI / 2, s: widthScale(protos.pits, 8) });
  }
  for (let k = 0; k < 3; k++) {
    const pos = place(10 + k * 14, wd + 7 + (k % 2) * 2);
    tents.push({ ...pos, ry: pos.hd + r() * 0.3, s: widthScale(protos.tent, 6) });
  }
  instance(group, protos.pits, pits);
  instance(group, protos.tent, tents);

  // start gantry
  {
    const p = track.pointAt(0);
    const span = 2 * wd + 1.6;
    const gantry = new THREE.Group();
    if (protos.overhead) {
      const pr = protos.overhead;
      const sx = span / pr.size.x;
      instance(gantry, pr, [{ x: 0, y: 0, z: 0, sx, sy: 8.5 / pr.size.y, sz: 9 }]);
    }
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTexture(th.night), roughness: 0.6, emissive: th.night ? 0xffffff : 0x000000, emissiveMap: th.night ? bannerTexture(true) : null, emissiveIntensity: 0.5, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(span - 3, 1.9), bannerMat);
    banner.position.set(0, 7.2, 0.95);
    gantry.add(banner);
    const b2 = banner.clone();
    b2.position.z = -0.95;
    b2.rotation.y = Math.PI;
    gantry.add(b2);
    // start lights (5 pods), facing the grid (behind the line => -z side)
    const lights = [];
    const podGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.35, 24);
    podGeo.rotateX(Math.PI / 2);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.9, 0.5), new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.5 }));
    housing.position.set(0, 5.1, -1.0);
    gantry.add(housing);
    for (let k = 0; k < 5; k++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000, roughness: 0.3 });
      const pod = new THREE.Mesh(podGeo, mat);
      pod.position.set((k - 2) * 1.6, 5.1, -1.3);
      gantry.add(pod);
      lights.push(mat);
    }
    gantry.rotation.y = p.hd;
    gantry.position.set(p.x, p.y, p.z);
    gantry.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    group.add(gantry);
    group.userData.startLights = lights;
    // waving checkered flags on both sides of the line
    for (const side of [-1, 1]) {
      const q = track.pointAt(1.5, side * (wd + 1.6));
      group.add(wavingFlag(q, p.hd, animated, side));
    }
  }
  const starter = buildStarter(track, animated);
  group.add(starter.group);

  // flags, banner towers, billboards, light posts, tyre stacks along the track
  const flagList = []; const bannerList = []; const bbList = []; const postList = []; const tireList = []; const coneList = [];
  const glowPos = [];
  for (let s = 20; s < track.L - 10; s += 26 + r() * 20) {
    const side = r() < 0.5 ? -1 : 1;
    const i = Math.floor(s / track.seg) % N;
    const corner = Math.abs(track.curv[i]) > 1 / 60;
    if (corner) {
      // tyre stacks on the outside of corners
      const out = track.curv[i] > 0 ? -1 : 1; // curving left (heading increases) => outside is right? handled empirically below
      for (let k = 0; k < 3; k++) {
        const pos = place(s + k * 2.2, out * (wd + 1.3));
        for (let h = 0; h < 3; h++) tireList.push({ x: pos.x, y: pos.y + h * 0.62, z: pos.z, rx: Math.PI / 2, ry: 0, s: 1.8 / (protos.tire?.size.y || 0.6), noLift: false });
      }
      continue;
    }
    const kind = r();
    if (kind < 0.3 && protos.billboard) {
      const pos = place(s, side * (wd + 4));
      bbList.push({ ...pos, ry: pos.hd + (side < 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI, s: widthScale(protos.billboard, 8) });
    } else if (kind < 0.55) {
      const pos = place(s, side * (wd + 2.2));
      bannerList.push({ ...pos, ry: pos.hd, s: sizeScale(protos.bannerRed, 6.5), red: r() < 0.5 });
    } else {
      const pos = place(s, side * (wd + 1.6));
      flagList.push({ ...pos, ry: pos.hd + (side < 0 ? 0 : Math.PI), s: sizeScale(protos.flagChecker, 5), k: Math.floor(r() * 3) });
    }
  }
  // light posts regularly (both sides alternating)
  const postEvery = th.night ? 30 : 60;
  for (let s = 12, k = 0; s < track.L; s += postEvery, k++) {
    const side = k % 2 ? -1 : 1;
    const pos = place(s, side * (wd + 1.4));
    postList.push({ ...pos, ry: pos.hd + (side < 0 ? -Math.PI / 2 : Math.PI / 2), s: sizeScale(protos.lightPost, 8) });
    if (th.night) {
      const lp = track.pointAt(s, side * (wd - 3));
      glowPos.push({ x: lp.x, y: lp.y, z: lp.z, lx: pos.x, ly: pos.y + 7.6, lz: pos.z });
    }
  }
  instance(group, protos.billboard, bbList);
  instance(group, protos.bannerRed, bannerList.filter((b) => b.red));
  instance(group, protos.bannerGreen, bannerList.filter((b) => !b.red));
  instance(group, protos.flagChecker, flagList.filter((f) => f.k === 0));
  instance(group, protos.flagRed, flagList.filter((f) => f.k === 1));
  instance(group, protos.flagGreen, flagList.filter((f) => f.k === 2));
  instance(group, protos.lightPost, postList);
  instance(group, protos.tire, tireList, { castShadow: true });

  // cones lined up around boost pads' shoulders (outside the wall -> decorative)
  for (const b of track.boosts) {
    for (const side of [-1, 1]) {
      const pos = place(b.s, side * (wd + 0.9));
      coneList.push({ ...pos, ry: 0, s: sizeScale(protos.cone, 1.0) });
    }
  }
  instance(group, protos.cone, coneList);

  // night light pools + lamp glows
  if (glowPos.length) {
    const gtex = glowTexture();
    const poolMat = new THREE.MeshBasicMaterial({ map: gtex, color: 0xffd9a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const poolGeo = new THREE.PlaneGeometry(16, 16);
    poolGeo.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, glowPos.length);
    const lampMat = new THREE.SpriteMaterial({ map: gtex, color: 0xffe2b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const m4 = new THREE.Matrix4();
    glowPos.forEach((g, i) => {
      m4.makeTranslation(g.x, g.y + 0.12, g.z);
      pools.setMatrixAt(i, m4);
      const sp = new THREE.Sprite(lampMat);
      sp.position.set(g.lx, g.ly, g.lz);
      sp.scale.setScalar(4.5);
      group.add(sp);
    });
    group.add(pools);
  }

  // ---------------- scattered nature
  const pools = { trees, bushes, small, rocks };
  const scatter = { trees: [], bushes: [], small: [], rocks: [] };
  const density = def.decor.treeDensity ?? 1;
  const nTrees = Math.round((lowDetail ? 110 : 420) * density);
  const tries = (n, band, bucket, hRange) => {
    let placed = 0; let guard = 0;
    while (placed < n && guard++ < n * 6) {
      const s = r() * track.L;
      const side = r() < 0.5 ? -1 : 1;
      const lat = side * (wd + band[0] + Math.pow(r(), 1.6) * (band[1] - band[0]));
      const p = track.pointAt(s, lat);
      const x = p.x + (r() - 0.5) * 6; const z = p.z + (r() - 0.5) * 6;
      const t = terrainAt(x, z);
      if (t.d < wd + band[0]) continue;
      // keep the start straight's stands clear
      const s0 = track.deltaS(t.i * track.seg, 0);
      if (s0 > -50 && s0 < 75 && t.d < wd + 16) continue;
      const list = pools[bucket];
      if (!list.length) return;
      const k = Math.floor(r() * list.length);
      const pr = list[k];
      const h = hRange[0] + r() * (hRange[1] - hRange[0]);
      scatter[bucket].push({ k, x, y: t.h - 0.05, z, ry: r() * Math.PI * 2, s: h / Math.max(0.1, pr.size.y) });
      placed++;
    }
  };
  tries(nTrees, [2.5, 70], 'trees', def.decor.bigRocks ? [3, 7] : [5, 10]);
  tries(Math.round(nTrees * 0.5), [1.5, 40], 'bushes', [1.2, 2.6]);
  tries(Math.round(nTrees * 0.7), [1.0, 30], 'small', [0.5, 1.1]);
  tries(Math.round(nTrees * (def.decor.bigRocks ? 0.45 : 0.18)), [3, 90], 'rocks', def.decor.bigRocks ? [4, 16] : [1.2, 3.5]);
  for (const bucket of Object.keys(scatter)) {
    pools[bucket].forEach((pr, k) => {
      instance(group, pr, scatter[bucket].filter((q) => q.k === k), { castShadow: bucket !== 'small', materialMap: matMap });
    });
  }

  group.traverse((o) => { if (o.material && !disposables.includes(o.material)) disposables.push(o.material); });

  return {
    group,
    sky,
    starter,
    terrainAt,
    startLights: group.userData.startLights,
    update(dt, t) { for (const fn of animated) fn(dt, t); },
    dispose() { sky.dispose(); },
  };
}


// ------------------------------------------------------------------ water

const WATER_VERT = `
  attribute float depth;
  varying float vDepth; varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vDepth = depth;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const WATER_FRAG = `
  uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSunDir; uniform float uIce;
  varying float vDepth; varying vec3 vW;
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vW.xz; float t = uTime * (1.0 - uIce);
    vec2 g = vec2(cos(p.x * 0.35 + t * 1.3), cos(p.y * 0.31 + t * 1.1)) * 0.35;
    g += vec2(cos((p.x + p.y) * 0.8 + t * 2.1), cos((p.x - p.y) * 0.7 - t * 1.7)) * 0.18;
    g += vec2(cos(p.x * 2.1 - p.y * 1.3 + t * 3.0), cos(p.y * 2.3 + p.x * 0.9 + t * 2.6)) * 0.08;
    vec3 n = normalize(vec3(-g.x * 0.22, 1.0, -g.y * 0.22));
    vec3 v = normalize(cameraPosition - vW);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float d = clamp(vDepth / 3.0, 0.0, 1.0);
    vec3 col = mix(uShallow, uDeep, d);
    col = mix(col, uSky, 0.12 + 0.55 * fres);
    vec3 h = normalize(uSunDir + v);
    col += pow(max(dot(n, h), 0.0), 220.0) * 2.2 * (1.0 - uIce * 0.6);
    float foam = smoothstep(0.45, 0.0, vDepth) * (0.65 + 0.35 * sin(p.x * 2.7 + p.y * 1.9 + t * 3.0));
    col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.75);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

function buildWater(th, minX, maxX, minZ, maxZ, terrainAt, animated) {
  const cell = 7;
  const nx = Math.ceil((maxX - minX) / cell) + 1;
  const nz = Math.ceil((maxZ - minZ) / cell) + 1;
  const level = th.water;
  const pos = new Float32Array(nx * nz * 3);
  const dep = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = minX + i * cell; const z = minZ + j * cell;
    const o = j * nx + i;
    pos[o * 3] = x; pos[o * 3 + 1] = level; pos[o * 3 + 2] = z;
    dep[o] = level - terrainAt(x, z).h;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i; const b = a + 1; const c = a + nx; const d = c + 1;
    if (Math.max(dep[a], dep[b], dep[c], dep[d]) < -0.2) continue; // fully above water: skip
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('depth', new THREE.BufferAttribute(dep, 1));
  geo.setIndex(idx);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(th.waterDeep ?? 0x0b5fa8) },
    uShallow: { value: new THREE.Color(th.waterShallow ?? 0x2fd6d0) },
    uSky: { value: new THREE.Color(th.sky[1]) },
    uSunDir: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
    uIce: { value: th.ice ? 1 : 0 },
  }]);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  animated.push((dt, t) => { uniforms.uTime.value = t; });
  return mesh;
}

// ------------------------------------------------------------------ waving flags

function wavingFlag(q, hd, animated, side) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7.5, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 }));
  pole.position.y = 3.75;
  pole.castShadow = true;
  g.add(pole);
  const tex = canvasTex(256, 160, (c, w, h) => {
    const n = 8; const m = 5;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fafafa'; c.fillRect(i * w / n, j * h / m, w / n + 1, h / m + 1); }
  }, { repeat: false });
  const geo = new THREE.PlaneGeometry(3.4, 2.1, 16, 6);
  geo.translate(1.7, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 });
  const uT = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = position.x / 3.4;
        transformed.z += sin(position.x * 2.2 - uT * 7.0) * 0.32 * k + sin(position.y * 1.7 - uT * 5.0) * 0.08 * k;
        transformed.y -= k * k * 0.25;`);
  };
  const cloth = new THREE.Mesh(geo, mat);
  cloth.position.y = 6.3;
  cloth.castShadow = true;
  g.add(cloth);
  g.position.set(q.x, q.y, q.z);
  g.rotation.y = hd + (side < 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI;
  animated.push((dt, t) => { uT.value = t + side; });
  return g;
}

// ------------------------------------------------------------------ starter drone (floating start lights)

function buildStarter(track, animated) {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.35, metalness: 0.1 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe8352e, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c24, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), white);
  body.scale.set(1.2, 0.75, 1.2);
  group.add(body);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.14, 8, 28), red);
  band.rotation.x = Math.PI / 2;
  group.add(band);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: 0x223355, emissive: 0x3aa0ff, emissiveIntensity: 1.2, roughness: 0.2 }));
  eye.position.set(0, 0.1, -1.05);
  group.add(eye);
  const rotors = [];
  for (const [x, z] of [[1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.2), white);
    arm.position.set(x * 0.6, 0.2, z * 0.6);
    arm.lookAt(0, 0.2, 0);
    group.add(arm);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.16), dark);
    rotor.position.set(x, 0.42, z);
    group.add(rotor);
    rotors.push(rotor);
  }
  // light board hanging below
  const board = new THREE.Group();
  board.position.set(0, -2.1, 0);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.35, 0.3), dark);
  board.add(plate);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), dark);
  cable.position.y = 1.2;
  board.add(cable);
  const lamps = [];
  for (let k = 0; k < 3; k++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0x000000, roughness: 0.3 });
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), m);
    lamp.position.set((k - 1) * 1.1, 0, -0.16);
    lamp.rotation.y = Math.PI;
    board.add(lamp);
    lamps.push(m);
  }
  group.add(board);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const p = track.pointAt(-12, -6.2);
  const base = new THREE.Vector3(p.x, p.y + 5.2, p.z);
  group.scale.setScalar(1.7);
  group.position.copy(base);
  group.rotation.y = p.hd + Math.PI; // board faces the grid
  let away = 0;
  let flying = false;
  animated.push((dt, t) => {
    for (const r of rotors) r.rotation.y += dt * 40;
    if (flying) {
      away += dt;
      group.position.y = base.y + Math.sin(t * 2) * 0.25 + away * away * 6;
      group.rotation.z = Math.sin(away * 3) * 0.15;
      group.visible = away < 4;
    } else {
      group.position.y = base.y + Math.sin(t * 2) * 0.25;
      board.rotation.z = Math.sin(t * 1.3) * 0.05;
    }
  });
  return {
    group,
    /** n = 0..3 red lamps lit; go = all green */
    set(n, go = false) {
      lamps.forEach((m, i) => {
        if (go) { m.color.setHex(0x113311); m.emissive.setHex(0x2aff4a); m.emissiveIntensity = 3; }
        else { m.color.setHex(0x331111); m.emissive.setHex(i < n ? 0xff2a1a : 0x000000); m.emissiveIntensity = 3.2; }
      });
    },
    flyAway() { flying = true; away = 0; },
    reset() { flying = false; away = 0; group.visible = true; group.position.copy(base); this.set(0); },
  };
}
