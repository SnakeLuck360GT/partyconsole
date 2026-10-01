// Piece catalogue for Tower Topple: procedural bevelled toy-block geometry + matching Rapier collider parts.
// Every piece is built once per (type, scale) and cached; meshes share geometry and per-player materials.
import { THREE } from '../../sdk/three-kit.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const U = 0.72; // cube size for the tetromino-style pieces
const BEVEL = 0.06;

/**
 * Part descriptions (local to the piece origin):
 *  { type: 'cuboid', h: [hx,hy,hz], pos: [x,y,z] }
 *  { type: 'cylinder', hh, r, pos, rot? (quaternion [x,y,z,w]) }
 *  { type: 'ball', r, pos }
 *  { type: 'hull', points: Float32Array, pos }
 */

function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(BEVEL, Math.min(w, h, d) * 0.2));
  g.translate(x, y, z);
  return { geo: g, part: { type: 'cuboid', h: [w / 2, h / 2, d / 2], pos: [x, y, z] } };
}

function cells(list, u = U) {
  // list of [cx, cz] cells in the x-z plane, one cube tall; re-centred on the bounding box.
  const xs = list.map((c) => c[0]);
  const zs = list.map((c) => c[1]);
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2;
  const oz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const parts = list.map(([cx, cz]) => box(u, u, u, (cx - ox) * u, 0, (cz - oz) * u));
  return {
    geo: mergeGeometries(parts.map((p) => p.geo)),
    parts: parts.map((p) => p.part),
  };
}

function roundedLathe(r, h, b = 0.07, seg = 28) {
  const pts = [];
  const hh = h / 2;
  pts.push(new THREE.Vector2(0, -hh));
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, -hh + b + Math.sin(a) * b));
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, hh - b + Math.sin(a) * b));
  }
  pts.push(new THREE.Vector2(0, hh));
  return new THREE.LatheGeometry(pts, seg);
}

function extruded(shape, depth, bevel = 0.05) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  // ExtrudeGeometry UVs are in shape units; scale them down so the wood grain isn't tiny.
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
  return g;
}

function hullPoints(geo) {
  const g = mergeVertices(geo.clone().deleteAttribute('normal').deleteAttribute('uv'), 1e-3);
  const arr = new Float32Array(g.attributes.position.array);
  g.dispose();
  return arr;
}

const DEFS = {
  plank: {
    name: 'Plank', weight: 3,
    build: () => { const b = box(2.8, 0.36, 0.9); return { geo: b.geo, parts: [b.part] }; },
  },
  beam: {
    name: 'Long Beam', weight: 2,
    build: () => { const b = box(3.6, 0.46, 0.46); return { geo: b.geo, parts: [b.part] }; },
  },
  block: {
    name: 'Block', weight: 2,
    build: () => { const b = box(1.05, 1.05, 1.05); return { geo: b.geo, parts: [b.part] }; },
  },
  slab: {
    name: 'Big Slab', weight: 2,
    build: () => { const b = box(1.9, 0.5, 1.9); return { geo: b.geo, parts: [b.part] }; },
  },
  pillar: {
    name: 'Pillar', weight: 1.5,
    build: () => { const b = box(0.6, 1.9, 0.6); return { geo: b.geo, parts: [b.part] }; },
  },
  ell: { name: 'L-Block', weight: 2, build: () => cells([[0, 0], [1, 0], [2, 0], [0, 1]]) },
  tee: { name: 'T-Block', weight: 2, build: () => cells([[0, 0], [1, 0], [2, 0], [1, 1]]) },
  zig: { name: 'Zig-Zag', weight: 1.5, build: () => cells([[0, 0], [1, 0], [1, 1], [2, 1]]) },
  cross: { name: 'Cross', weight: 1.5, build: () => cells([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]) },
  drum: {
    name: 'Drum', weight: 1.5,
    build: () => ({ geo: roundedLathe(0.6, 0.9), parts: [{ type: 'cylinder', hh: 0.45, r: 0.6, pos: [0, 0, 0] }] }),
  },
  log: {
    name: 'Rolling Log', weight: 0.8,
    build: () => {
      const g = roundedLathe(0.34, 2.4, 0.1, 20);
      g.rotateZ(Math.PI / 2);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      return { geo: g, parts: [{ type: 'cylinder', hh: 1.2, r: 0.34, pos: [0, 0, 0], rot: [q.x, q.y, q.z, q.w] }] };
    },
  },
  wedge: {
    name: 'Wedge', weight: 1.5,
    build: () => {
      const w = 1.7; const h = 0.95; const bs = 0.05;
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + bs, -h / 2 + bs);
      s.lineTo(w / 2 - bs, -h / 2 + bs);
      s.lineTo(-w / 2 + bs, h / 2 - bs);
      s.closePath();
      const g = extruded(s, 1.0, bs);
      return { geo: g, parts: [{ type: 'hull', points: hullPoints(g), pos: [0, 0, 0] }] };
    },
  },
  arch: {
    name: 'Arch', weight: 1.5,
    build: () => {
      const w = 2.3; const h = 1.2; const d = 0.8; const rh = 0.56; const bs = 0.05;
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + bs, bs);
      s.lineTo(-rh - bs, bs);
      s.absarc(0, 0, rh + bs, Math.PI, 0, true);
      s.lineTo(w / 2 - bs, bs);
      s.lineTo(w / 2 - bs, h - bs);
      s.lineTo(-w / 2 + bs, h - bs);
      s.closePath();
      const g = extruded(s, d, bs);
      g.translate(0, -h / 2, 0);
      const legW = w / 2 - rh;
      const legH = rh;
      return {
        geo: g,
        parts: [
          { type: 'cuboid', h: [legW / 2, legH / 2, d / 2], pos: [-(rh + legW / 2), -h / 2 + legH / 2, 0] },
          { type: 'cuboid', h: [legW / 2, legH / 2, d / 2], pos: [rh + legW / 2, -h / 2 + legH / 2, 0] },
          { type: 'cuboid', h: [w / 2, (h - legH) / 2, d / 2], pos: [0, -h / 2 + legH + (h - legH) / 2, 0] },
        ],
      };
    },
  },
  ball: {
    name: 'Wobbly Ball', weight: 0.6,
    build: () => ({ geo: new THREE.SphereGeometry(0.42, 28, 18), parts: [{ type: 'ball', r: 0.42, pos: [0, 0, 0] }] }),
  },
};

export const PIECE_IDS = Object.keys(DEFS);
export const pieceName = (id) => DEFS[id]?.name ?? id;

export const SPECIALS = {
  heavy: { label: 'HEAVY', icon: '🪨', color: '#8a94a6', density: 3.5, friction: 0.9, restitution: 0.02 },
  ice: { label: 'ICE', icon: '❄️', color: '#7fe3ff', density: 0.9, friction: 0.04, restitution: 0.02 },
  bouncy: { label: 'BOUNCY', icon: '🟣', color: '#ff5cc8', density: 0.8, friction: 0.8, restitution: 0.8 },
  giant: { label: 'GIANT', icon: '🦣', color: '#ffcc00', density: 0.7, friction: 0.85, restitution: 0.04, scale: 1.35 },
};

const cache = new Map();

/** Returns { id, name, geo, parts, box (THREE.Box3 local), shapes (lazy RAPIER shapes) } */
export function getPiece(id, scale = 1) {
  const key = `${id}@${scale}`;
  if (cache.has(key)) return cache.get(key);
  const def = DEFS[id];
  const built = def.build();
  const geo = built.geo;
  let parts = built.parts;
  if (scale !== 1) {
    geo.scale(scale, scale, scale);
    parts = parts.map((p) => {
      const q = { ...p, pos: p.pos.map((v) => v * scale) };
      if (p.h) q.h = p.h.map((v) => v * scale);
      if (p.hh) q.hh = p.hh * scale;
      if (p.r) q.r = p.r * scale;
      if (p.points) q.points = p.points.map((v) => v * scale);
      return q;
    });
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const piece = { id, name: def.name, geo, parts, box: geo.boundingBox.clone(), scale, _shapes: null };
  cache.set(key, piece);
  return piece;
}

/** RAPIER.Shape instances for each part (used for the landing-preview shape cast). */
export function pieceShapes(RAPIER, piece) {
  if (piece._shapes) return piece._shapes;
  piece._shapes = piece.parts.map((p) => {
    let shape;
    if (p.type === 'cuboid') shape = new RAPIER.Cuboid(...p.h);
    else if (p.type === 'cylinder') shape = new RAPIER.Cylinder(p.hh, p.r);
    else if (p.type === 'ball') shape = new RAPIER.Ball(p.r);
    else shape = new RAPIER.ConvexPolyhedron(p.points, null);
    return { shape, pos: new THREE.Vector3(...p.pos), rot: new THREE.Quaternion(...(p.rot || [0, 0, 0, 1])) };
  });
  return piece._shapes;
}

/** Rapier collider descs for a piece with a special's material properties. */
export function colliderDescs(RAPIER, piece, special) {
  const sp = SPECIALS[special] || { density: 1, friction: 0.85, restitution: 0.05 };
  return piece.parts.map((p) => {
    let d;
    if (p.type === 'cuboid') d = RAPIER.ColliderDesc.cuboid(...p.h);
    else if (p.type === 'cylinder') d = RAPIER.ColliderDesc.cylinder(p.hh, p.r);
    else if (p.type === 'ball') d = RAPIER.ColliderDesc.ball(p.r);
    else d = RAPIER.ColliderDesc.convexHull(p.points);
    d.setTranslation(...p.pos);
    if (p.rot) d.setRotation({ x: p.rot[0], y: p.rot[1], z: p.rot[2], w: p.rot[3] });
    d.setDensity(sp.density).setFriction(sp.friction).setRestitution(sp.restitution);
    if (special === 'ice') d.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
    if (special === 'bouncy') d.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    return d;
  });
}

/** Weighted random bag so every player sees a good variety of shapes. */
export function createBag(rand = Math.random) {
  let bag = [];
  function refill() {
    bag = [];
    for (const id of PIECE_IDS) {
      const n = DEFS[id].weight;
      const count = Math.floor(n) + (rand() < n % 1 ? 1 : 0);
      for (let i = 0; i < count; i++) bag.push(id);
    }
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return {
    next() { if (!bag.length) refill(); return bag.pop(); },
    reset() { bag = []; },
  };
}

// ---------------------------------------------------------------- materials

let woodTex = null;
function woodTexture() {
  if (woodTex) return woodTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4ecdf';
  g.fillRect(0, 0, 256, 256);
  // Gentle grain streaks so the painted toy blocks read as wood.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 46; i++) {
    const y = rnd() * 256;
    const amp = 2 + rnd() * 6;
    const freq = 0.01 + rnd() * 0.03;
    const ph = rnd() * 6;
    g.strokeStyle = `rgba(${120 + rnd() * 40},${80 + rnd() * 30},${40},${0.05 + rnd() * 0.1})`;
    g.lineWidth = 0.8 + rnd() * 2.5;
    g.beginPath();
    for (let x = -4; x <= 260; x += 4) {
      const yy = y + Math.sin(x * freq + ph) * amp + Math.sin(x * 0.07 + ph * 2) * 0.8;
      if (x < 0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const x = rnd() * 256; const y = rnd() * 256;
    const grd = g.createRadialGradient(x, y, 1, x, y, 10 + rnd() * 6);
    grd.addColorStop(0, 'rgba(110,70,35,0.25)');
    grd.addColorStop(1, 'rgba(110,70,35,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, 18, 7, 0, 0, Math.PI * 2);
    g.fill();
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.anisotropy = 4;
  return woodTex;
}

const matCache = new Map();
/** Shared material per (player colour, special). */
export function pieceMaterial(colorHex, special) {
  const key = `${colorHex}|${special || ''}`;
  if (matCache.has(key)) return matCache.get(key);
  const base = new THREE.Color(colorHex);
  let m;
  if (special === 'heavy') {
    m = new THREE.MeshStandardMaterial({ color: base.clone().lerp(new THREE.Color(0x3a3f4a), 0.62), metalness: 0.75, roughness: 0.32 });
  } else if (special === 'ice') {
    m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xc8f2ff).lerp(base, 0.22), roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.8,
      clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6,
    });
  } else if (special === 'bouncy') {
    m = new THREE.MeshPhysicalMaterial({ color: base.clone().lerp(new THREE.Color(0xff4fd8), 0.35), roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.25 });
  } else {
    m = new THREE.MeshStandardMaterial({ color: base.clone().lerp(new THREE.Color(0xffffff), 0.1), map: woodTexture(), roughness: 0.62, metalness: 0 });
  }
  matCache.set(key, m);
  return m;
}

export function disposePieceCaches() {
  for (const p of cache.values()) p.geo.dispose();
  cache.clear();
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
  woodTex?.dispose();
  woodTex = null;
}
