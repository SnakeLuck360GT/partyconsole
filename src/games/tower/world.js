// Diorama environment: gradient sky dome, floating island with a wooden build deck, drifting clouds,
// little satellite islets with trees, and a gold "record height" ring.
import { THREE } from '../../sdk/three-kit.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PLATFORM_R = 3.4;

function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function skyDome() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f7fe0) },
      mid: { value: new THREE.Color(0x8cc8ff) },
      horizon: { value: new THREE.Color(0xffe3c4) },
      bottom: { value: new THREE.Color(0xb8d9f5) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c;
        if (h > 0.0) { c = mix(horizon, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.85, h)); }
        else { c = mix(horizon, bottom, smoothstep(0.0, -0.35, h)); }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

function noisyCone(radiusTop, height, seg, rand, color) {
  // Inverted rocky cone hanging under an island.
  const geo = new THREE.ConeGeometry(radiusTop, height, seg, 5, true);
  geo.rotateX(Math.PI);
  geo.translate(0, -height / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
    if (y > -0.05) continue; // keep the top rim clean
    const k = 0.18 + 0.22 * rand();
    pos.setXYZ(i, x * (1 + (rand() - 0.5) * k), y + (rand() - 0.5) * height * 0.08, z * (1 + (rand() - 0.5) * k));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true });
  return new THREE.Mesh(geo, mat);
}

function deckTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const planks = 9;
  const w = 512 / planks;
  const rand = rng(11);
  for (let i = 0; i < planks; i++) {
    const l = 58 + rand() * 10;
    g.fillStyle = `hsl(${28 + rand() * 6}, ${46 + rand() * 10}%, ${l}%)`;
    g.fillRect(i * w, 0, w, 512);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(90,50,20,${0.06 + rand() * 0.1})`;
      g.lineWidth = 1 + rand() * 2;
      const x = i * w + rand() * w;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (rand() - 0.5) * 10, 170, x + (rand() - 0.5) * 10, 340, x + (rand() - 0.5) * 6, 512);
      g.stroke();
    }
    g.fillStyle = 'rgba(60,30,10,0.55)';
    g.fillRect(i * w, 0, 3, 512);
    // nail heads
    g.fillStyle = 'rgba(70,60,50,0.7)';
    for (const y of [60, 452]) { g.beginPath(); g.arc(i * w + w / 2, y, 4, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function tree(rand, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 7), new THREE.MeshStandardMaterial({ color: 0x7a4b2a, roughness: 0.9 }));
  trunk.position.y = 0.3;
  g.add(trunk);
  const green = new THREE.Color().setHSL(0.26 + rand() * 0.08, 0.55, 0.36 + rand() * 0.1);
  const leafMat = new THREE.MeshStandardMaterial({ color: green, roughness: 0.8, flatShading: true });
  if (rand() < 0.5) {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.55 - i * 0.13, 0.7, 7), leafMat);
      c.position.y = 0.75 + i * 0.35;
      g.add(c);
    }
  } else {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), leafMat);
    b.position.y = 0.95;
    b.scale.set(1, 1.1, 1);
    g.add(b);
    const b2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.33, 0), leafMat);
    b2.position.set(0.3, 0.75, 0.1);
    g.add(b2);
  }
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function islet(rand, r) {
  const g = new THREE.Group();
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, r * 0.25, 12), new THREE.MeshStandardMaterial({ color: 0x6cc24a, roughness: 0.9, flatShading: true }));
  g.add(grass);
  const rock = noisyCone(r * 0.92, r * 1.8, 10, rand, 0x8a6a52);
  rock.position.y = -r * 0.125;
  g.add(rock);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  return g;
}

function cloud(rand, mat) {
  const parts = [];
  const n = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const s = new THREE.IcosahedronGeometry(1, 2);
    const r = 0.8 + rand() * 1.1;
    s.scale(r, r * 0.8, r);
    s.translate((i - n / 2) * 1.1 + rand() * 0.5, rand() * 0.6, (rand() - 0.5) * 1.2);
    parts.push(s);
  }
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const m = new THREE.Mesh(geo, mat);
  return m;
}

export function buildWorld(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const rand = rng(42);
  root.add(skyDome());

  // ---- main island
  const island = new THREE.Group();
  root.add(island);
  const R = PLATFORM_R;
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x74c94e, roughness: 0.9 });
  // Grass lip around the deck sits slightly lower and has no collider: anything over the edge falls.
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.4, R + 0.22, 0.45, 56), grassMat);
  lip.position.y = -0.325;
  island.add(lip);
  const dirt = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.22, R - 0.1, 0.6, 40), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 1 }));
  dirt.position.y = -0.85;
  island.add(dirt);
  const rock = noisyCone(R - 0.1, 6.5, 14, rand, 0x9a7a62);
  rock.position.y = -1.12;
  island.add(rock);
  const rock2 = noisyCone(R * 0.55, 3.5, 9, rand, 0x7c604d);
  rock2.position.set(1.2, -3.6, -0.6);
  island.add(rock2);

  // Wooden deck = the build surface (physics collider is a cylinder of the same radius, top at y=0).
  const deckSide = new THREE.MeshStandardMaterial({ color: 0x8e5f37, roughness: 0.8 });
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.16, 72), [deckSide, new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.72 }), deckSide]);
  deck.position.y = -0.08;
  island.add(deck);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.005, 0.045, 8, 96), new THREE.MeshStandardMaterial({ color: 0xe8b04a, metalness: 0.6, roughness: 0.35 }));
  trim.rotation.x = Math.PI / 2;
  trim.position.y = -0.06;
  island.add(trim);

  // Grass tufts + flowers on the lip ring.
  const tuftGeo = new THREE.ConeGeometry(0.06, 0.26, 4);
  tuftGeo.translate(0, 0.13, 0);
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0x5fb33c, roughness: 0.9, flatShading: true });
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 180);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 180; i++) {
    const a = rand() * Math.PI * 2;
    const r = R + 0.08 + rand() * 0.28;
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.7, 0, (rand() - 0.5) * 0.7));
    m4.compose(new THREE.Vector3(Math.cos(a) * r, -0.11, Math.sin(a) * r), q, new THREE.Vector3(1, 0.6 + rand() * 0.9, 1));
    tufts.setMatrixAt(i, m4);
  }
  island.add(tufts);
  const flowerGeo = new THREE.IcosahedronGeometry(0.055, 0);
  const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 48);
  const fcols = [0xffffff, 0xffd84d, 0xff7aa8, 0xb48cff];
  for (let i = 0; i < 48; i++) {
    const a = rand() * Math.PI * 2;
    const r = R + 0.12 + rand() * 0.22;
    m4.makeTranslation(Math.cos(a) * r, -0.02 + rand() * 0.06, Math.sin(a) * r);
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, new THREE.Color(fcols[i % 4]));
  }
  island.add(flowers);
  // Hanging roots / vines under the island
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x4f8f35, roughness: 0.9 });
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2;
    const len = 0.6 + rand() * 1.4;
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.015, len, 5), vineMat);
    v.position.set(Math.cos(a) * (R + 0.2), -0.5 - len / 2, Math.sin(a) * (R + 0.2));
    island.add(v);
  }
  // Little ledge on the side of the rock (decorated with a tree later).
  const ledge = new THREE.Group();
  ledge.position.set(R + 0.6, -1.45, 0.9);
  const ledgeTop = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 0.35, 9), grassMat);
  ledge.add(ledgeTop);
  const ledgeRock = noisyCone(0.6, 1.4, 8, rand, 0x8a6a52);
  ledgeRock.position.y = -0.15;
  ledge.add(ledgeRock);
  island.add(ledge);
  island.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });

  // ---- satellite islets
  const islets = [];
  const spots = [
    [14, 3, -10, 2.2], [-15, -2, -6, 2.8], [-9, 6, -18, 1.6], [11, -6, 9, 1.8], [-13, -8, 10, 2.0], [4, 9, -24, 2.4],
  ];
  for (const [x, y, z, r] of spots) {
    const g = islet(rand, r);
    g.userData.r = r;
    g.position.set(x, y, z);
    g.userData.bob = rand() * 6;
    g.userData.baseY = y;
    root.add(g);
    islets.push(g);
  }

  // ---- clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xdde8ff, emissiveIntensity: 0.25 });
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const c = cloud(rand, cloudMat);
    const a = rand() * Math.PI * 2;
    const d = 16 + rand() * 30;
    const low = i < 5;
    c.position.set(Math.cos(a) * d, low ? -7 - rand() * 6 : 2 + rand() * 18, Math.sin(a) * d);
    const s = low ? 1.6 + rand() : 0.9 + rand() * 1.4;
    c.scale.setScalar(s);
    c.userData.speed = 0.15 + rand() * 0.35;
    root.add(c);
    clouds.push(c);
  }

  // ---- record-height ring (gold dashed circle + label added by the game)
  const recGeo = new THREE.TorusGeometry(2.6, 0.035, 6, 96);
  const recMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false });
  const record = new THREE.Mesh(recGeo, recMat);
  record.rotation.x = Math.PI / 2;
  record.visible = false;
  root.add(record);

  return {
    root,
    island,
    islets,
    ledge,
    rand,
    record,
    update(dt, t) {
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 50) c.position.x = -50;
      }
      for (const g of islets) g.position.y = g.userData.baseY + Math.sin(t * 0.5 + g.userData.bob) * 0.25;
      island.position.y = 0; // the playable island stays put (physics!)
    },
  };
}


/** Dress the islands with models from the shared nature library; falls back to procedural trees. */
export async function decorate(w, ctx, loadModel) {
  const rand = rng(99);
  const cache = new Map();
  async function sized(file, h) {
    if (!cache.has(file)) cache.set(file, loadModel(ctx.sharedAsset(`nature/${file}`)).then((m) => m, () => null));
    const proto = await cache.get(file);
    if (!proto) return null;
    const m = proto.clone();
    const b = new THREE.Box3().setFromObject(m);
    const s = h / Math.max(0.001, b.max.y - b.min.y);
    m.scale.multiplyScalar(s);
    m.position.y = -b.min.y * s;
    const g = new THREE.Group();
    g.add(m);
    g.rotation.y = rand() * Math.PI * 2;
    return g;
  }
  const trees = ['tree-1-a.glb', 'tree-2-a.glb', 'tree-3-a.glb', 'q-tree.glb', 'q-tree-fruit.glb'];
  const small = ['k-flower-yellow-a.glb', 'k-flower-red-a.glb', 'k-flower-purple-a.glb', 'k-mushroom-red-group.glb', 'grass-1-a.glb', 'bush-1-a.glb'];
  const jobs = [];
  for (const g of w.islets) {
    const r = g.userData.r;
    const top = r * 0.125;
    const n = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const file = trees[Math.floor(rand() * trees.length)];
      const h = r * (0.9 + rand() * 0.6);
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.45;
      jobs.push(sized(file, h).then((t) => {
        const obj = t || tree(rand, h / 1.4);
        obj.position.set(Math.cos(a) * d, top, Math.sin(a) * d);
        g.add(obj);
      }));
    }
    const a2 = rand() * Math.PI * 2;
    jobs.push(sized(rand() < 0.5 ? 'q-rock-1.glb' : 'rock-1-a.glb', r * 0.3).then((m) => { if (m) { m.position.set(Math.cos(a2) * r * 0.6, top, Math.sin(a2) * r * 0.6); g.add(m); } }));
    const a3 = a2 + 2;
    jobs.push(sized('q-bush.glb', r * 0.3).then((m) => { if (m) { m.position.set(Math.cos(a3) * r * 0.55, top, Math.sin(a3) * r * 0.55); g.add(m); } }));
  }
  jobs.push(sized('tree-3-a.glb', 1.7).then((t) => { const o = t || tree(rand, 1); o.position.y = 0.17; w.ledge.add(o); }));
  jobs.push(sized('k-mushroom-red-group.glb', 0.35).then((m) => { if (m) { m.position.set(0.45, 0.17, 0.3); w.ledge.add(m); } }));
  // Small flowers & mushrooms on the grass ring around the deck.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
    const r = PLATFORM_R + 0.2 + rand() * 0.12;
    const file = small[i % small.length];
    jobs.push(sized(file, 0.22 + rand() * 0.14).then((m) => { if (m) { m.position.set(Math.cos(a) * r, -0.11, Math.sin(a) * r); w.island.add(m); } }));
  }
  await Promise.all(jobs);
  w.root.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; } });
}
