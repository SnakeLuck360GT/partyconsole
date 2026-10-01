// Arena visuals. Each arena: a scalable `platform` group (top surface at y=0, radius R) plus a static `decor` group.
import { THREE } from '../../sdk/three-kit.js';
import { jitter, floatingIsland, SEA_Y } from './env.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}

function speckle(g, s, base, cols, n, rmax = 3) {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i % cols.length];
    g.globalAlpha = 0.15 + Math.random() * 0.25;
    g.beginPath();
    g.arc(Math.random() * s, Math.random() * s, 0.5 + Math.random() * rmax, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function shadowed(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

/** Hanging paper lantern (glowing). */
function lantern(color = 0xff3b2f) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.6 }));
  body.scale.y = 1.25;
  const capMat = std(0x1a1a1a);
  const cap1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.08, 12), capMat);
  cap1.position.y = 0.4;
  const cap2 = cap1.clone();
  cap2.position.y = -0.4;
  g.add(body, cap1, cap2);
  return g;
}

function post(height, color = 0x5a3a22) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, height, 8), std(color));
  m.position.y = height / 2;
  return m;
}

/** Rock underside for a floating disc. */
function rockUnder(R, color = 0x8a6b52, color2 = 0x6b5140, seed = 3, depthK = 1.25) {
  const g = new THREE.Group();
  const cone = jitter(new THREE.ConeGeometry(R + 0.4, R * depthK, 14, 4), R * 0.09, seed);
  cone.rotateX(Math.PI);
  const m = new THREE.Mesh(cone, std(color, { flatShading: true, roughness: 1 }));
  m.position.y = -(R * depthK) / 2 - 0.5;
  const c2 = jitter(new THREE.ConeGeometry(R * 0.35, R * 0.9, 7, 2), R * 0.05, seed + 5);
  c2.rotateX(Math.PI);
  const m2 = new THREE.Mesh(c2, std(color2, { flatShading: true, roughness: 1 }));
  m2.position.set(R * 0.3, -R * depthK - 0.2, -R * 0.2);
  g.add(m, m2);
  return shadowed(g);
}

// ---------------------------------------------------------------- arenas

function dohyo(R, lib) {
  const platform = new THREE.Group();
  const decor = new THREE.Group();
  const clayTex = canvasTex(1024, (g, s) => {
    speckle(g, s, '#d9b47c', ['#c49a60', '#e8c890', '#b88a50', '#f0d6a8'], 5000, 3);
    const c = s / 2;
    // bale ring shadow + inner circle
    g.strokeStyle = 'rgba(120,80,40,0.35)';
    g.lineWidth = 10;
    g.beginPath(); g.arc(c, c, s * 0.47, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(c, c, s * 0.2, 0, Math.PI * 2); g.stroke();
    // shikiri-sen lines
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.fillRect(c - s * 0.06, c - s * 0.07, s * 0.12, s * 0.018);
    g.fillRect(c - s * 0.06, c + s * 0.052, s * 0.12, s * 0.018);
  });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.35, R + 0.6, 1.0, 64), [
    std(0xb0845a, { roughness: 1 }), std(0xffffff, { map: clayTex, roughness: 0.95 }), std(0x8a6440),
  ]);
  top.position.y = -0.5;
  platform.add(top);
  // straw bale ring (rope)
  const rope = new THREE.Mesh(new THREE.TorusGeometry(R, 0.16, 8, 96), std(0xd8c07a, { roughness: 1 }));
  rope.rotation.x = Math.PI / 2;
  rope.position.y = 0.02;
  platform.add(rope);
  // wooden skirt band
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.62, R + 0.62, 0.35, 64, 1, true), std(0x7a2b20));
  band.position.y = -0.75;
  platform.add(band);
  platform.add(rockUnder(R, 0x8a6b52, 0x6b5140, 5));
  // grass rim below the clay
  const grass = new THREE.Mesh(jitter(new THREE.CylinderGeometry(R + 0.9, R + 0.7, 0.5, 20), 0.12, 9), std(0x6cbf4a, { flatShading: true }));
  grass.position.y = -1.1;
  platform.add(shadowed(grass));

  // decor: four floating shrine islets with lanterns, flags and trees
  const lanterns = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const isl = floatingIsland(1.5, 'grass', 20 + i);
    isl.position.set(Math.cos(a) * (R + 4.2), -1.2 - (i % 2) * 0.6, Math.sin(a) * (R + 4.2));
    const p = post(3.2, 0x7a2b20);
    isl.add(p);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), std(0x7a2b20));
    beam.position.y = 3.1;
    isl.add(beam);
    for (const s of [-0.55, 0.55]) {
      const l = lantern(i % 2 ? 0xff3b2f : 0xffb030);
      l.position.set(s, 2.5, 0);
      isl.add(l);
      lanterns.push(l);
    }
    isl.rotation.y = -a;
    lib.place(isl, 'nature/tree-3-a.glb', 0.55, 0.6, 0, 0.7);
    lib.place(isl, 'nature/bush-2-a.glb', 1.2, -0.7, 0, -0.5);
    lib.place(isl, 'nature/k-flower-red-a.glb', 2.5, 0.3, 0, -0.9);
    decor.add(shadowed(isl));
  }
  return {
    platform, decor,
    update(dt, t) { lanterns.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.3 + i) * 0.08; }); },
  };
}

function ice(R, lib) {
  const platform = new THREE.Group();
  const decor = new THREE.Group();
  const frost = canvasTex(1024, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, '#dff4ff');
    grd.addColorStop(0.8, '#bfe6fb');
    grd.addColorStop(1, '#f4fbff');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    // cracks
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 1 + Math.random() * 2;
      let x = Math.random() * s;
      let y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 120; y += (Math.random() - 0.5) * 120; g.lineTo(x, y); }
      g.stroke();
    }
    // glints
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  });
  const iceMat = std(0xffffff, { map: frost, roughness: 0.08, metalness: 0.05, envMapIntensity: 1.6 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x8fd3ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.9, flatShading: true });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.2, R - 0.1, 0.9, 48), [sideMat, iceMat, sideMat]);
  top.position.y = -0.45;
  platform.add(top);
  // snow lip
  const snow = new THREE.Mesh(jitter(new THREE.TorusGeometry(R + 0.12, 0.2, 6, 64), 0.08, 3), std(0xffffff, { roughness: 1, flatShading: true }));
  snow.rotation.x = Math.PI / 2;
  snow.position.y = -0.02;
  platform.add(snow);
  // icy crystal underside
  const under = jitter(new THREE.ConeGeometry(R + 0.1, R * 1.3, 12, 3), R * 0.08, 17);
  under.rotateX(Math.PI);
  const um = new THREE.Mesh(under, new THREE.MeshStandardMaterial({ color: 0x6fb8e8, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.92 }));
  um.position.y = -0.9 - R * 0.65;
  platform.add(um);
  // icicles
  const icGeo = new THREE.ConeGeometry(0.16, 1, 5);
  icGeo.rotateX(Math.PI);
  const icMat = new THREE.MeshStandardMaterial({ color: 0xcfefff, roughness: 0.05, transparent: true, opacity: 0.85 });
  const n = Math.round(R * 4);
  const ic = new THREE.InstancedMesh(icGeo, icMat, n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const len = 0.5 + Math.random() * 1.2;
    m4.compose(new THREE.Vector3(Math.cos(a) * (R - 0.1), -0.9 - len / 2, Math.sin(a) * (R - 0.1)), new THREE.Quaternion(), new THREE.Vector3(1, len, 1));
    ic.setMatrixAt(i, m4);
  }
  platform.add(ic);
  shadowed(platform);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const isl = floatingIsland(1.3 + (i % 2) * 0.5, 'snow', 40 + i);
    isl.position.set(Math.cos(a) * (R + 4.5), -1.5 - (i % 3) * 0.7, Math.sin(a) * (R + 4.5));
    lib.place(isl, 'platformer/tree-pine.glb', 1.3, 0, 0, 0);
    lib.place(isl, 'platformer/tree-pine.glb', 0.8, 0.7, 0, 0.5);
    lib.place(isl, 'nature/rock-2-a.glb', 2.5, -0.6, 0, -0.4);
    decor.add(shadowed(isl));
  }
  return { platform, decor, snow: true };
}

function crumble(R, lib, sim) {
  const platform = new THREE.Group();
  const decor = new THREE.Group();
  const tiles = sim.arena.tiles;
  const stoneTex = canvasTex(256, (g, s) => speckle(g, s, '#b5a48f', ['#8a7a66', '#d6c6ae', '#6e604f'], 900, 4));
  const mats = [std(0xffffff, { map: stoneTex, flatShading: true }), std(0xd8ccbb, { map: stoneTex, flatShading: true }), std(0xc4b19a, { map: stoneTex, flatShading: true })];
  const chunkMat = std(0x5a4a3e, { flatShading: true, roughness: 1 });
  const views = new Map();
  const depth = 0.6;
  for (const ring of tiles.rings) {
    for (const tile of ring.tiles) {
      const gap = 0.05;
      const shape = new THREE.Shape();
      const a0 = tile.a0 + gap / ring.outer;
      const a1 = tile.a1 - gap / ring.outer;
      const ri = ring.inner + gap;
      const ro = ring.outer - gap;
      const steps = 6;
      for (let k = 0; k <= steps; k++) { const a = a0 + ((a1 - a0) * k) / steps; shape.lineTo(Math.cos(a) * ro, -Math.sin(a) * ro); }
      for (let k = steps; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / steps; shape.lineTo(Math.cos(a) * ri, -Math.sin(a) * ri); }
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, -depth - 0.05, 0);
      // centre the geometry on the tile so it can tumble nicely
      const am = (tile.a0 + tile.a1) / 2;
      const rm = (ring.inner + ring.outer) / 2;
      const cx = Math.cos(am) * rm;
      const cz = Math.sin(am) * rm;
      geo.translate(-cx, 0, -cz);
      const g = new THREE.Group();
      const top = new THREE.Mesh(geo, mats[(tile.ring + tile.seg) % 3]);
      const ch = jitter(new THREE.ConeGeometry(Math.min(0.55, (ro - ri) * 0.45), 1.2, 5, 1), 0.12, tile.seg + tile.ring * 31);
      ch.rotateX(Math.PI);
      const cm = new THREE.Mesh(ch, chunkMat);
      cm.position.y = -1.2;
      g.add(top, cm);
      g.position.set(cx, 0, cz);
      shadowed(g);
      platform.add(g);
      views.set(tile, { g, cx, cz, spin: [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3] });
    }
  }
  // core with glowing rune
  const runeTex = canvasTex(512, (g, s) => {
    speckle(g, s, '#a8977f', ['#7d6d5a', '#cbb89c'], 700, 4);
    g.strokeStyle = '#ff9a3a';
    g.shadowColor = '#ffb050';
    g.shadowBlur = 16;
    g.lineWidth = 10;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.lineTo(s / 2 + Math.cos(a) * s * 0.33, s / 2 + Math.sin(a) * s * 0.33); }
    g.closePath(); g.stroke();
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(tiles.coreR - 0.05, tiles.coreR - 0.05, 0.7, 32), [std(0x8a7a66), std(0xffffff, { map: runeTex, emissive: 0xff7a20, emissiveMap: runeTex, emissiveIntensity: 0.5 }), std(0x6e604f)]);
  core.position.y = -0.35;
  platform.add(shadowed(core));
  const coreRock = jitter(new THREE.ConeGeometry(tiles.coreR + 0.4, R * 1.1, 9, 3), 0.3, 77);
  coreRock.rotateX(Math.PI);
  const cr = new THREE.Mesh(coreRock, std(0x3a2e28, { flatShading: true, roughness: 1 }));
  cr.position.y = -0.7 - R * 0.55;
  platform.add(shadowed(cr));

  // decor: ruined pillars + braziers on basalt islets
  const fires = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.2;
    const isl = floatingIsland(1.4, 'basalt', 60 + i);
    isl.position.set(Math.cos(a) * (R + 4.3), -1.4 - (i % 2) * 0.9, Math.sin(a) * (R + 4.3));
    const h = 1.8 + (i % 3) * 0.9;
    const col = new THREE.Mesh(jitter(new THREE.CylinderGeometry(0.4, 0.45, h, 8, 3), 0.04, i), std(0xcbbba3, { flatShading: true }));
    col.position.set(-0.3, h / 2, 0);
    col.rotation.z = (i % 2 ? 0.08 : -0.06);
    const capital = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.1), std(0xcbbba3));
    capital.position.set(-0.3, h + 0.1, 0);
    isl.add(col);
    if (i % 2 === 0) isl.add(capital);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.18, 0.35, 10), std(0x2a2020, { metalness: 0.6, roughness: 0.4 }));
    bowl.position.set(0.7, 0.9, 0.2);
    const stand = post(0.8, 0x2a2020);
    stand.position.set(0.7, 0.4, 0.2);
    isl.add(bowl, stand);
    decor.add(shadowed(isl));
    fires.push({ isl, x: 0.7, y: 1.1, z: 0.2 });
  }
  return {
    platform, decor, fires,
    update(dt, t, s, fx) {
      for (const [tile, v] of views) {
        if (tile.state === 'solid') {
          v.g.visible = true;
          v.g.position.set(v.cx, 0, v.cz);
          v.g.rotation.set(0, 0, 0);
        } else if (tile.state === 'shaking') {
          const k = tile.t / 1.3;
          v.g.position.set(v.cx + (Math.random() - 0.5) * 0.12 * k, (Math.random() - 0.5) * 0.06 * k - k * 0.05, v.cz + (Math.random() - 0.5) * 0.12 * k);
          if (Math.random() < dt * 8) fx.dust(v.cx, -0.2, v.cz, 1, 0xa89880, 0.6);
        } else if (tile.state === 'falling') {
          const tt = tile.t;
          v.g.position.set(v.cx * (1 + tt * 0.05), -0.5 * 20 * tt * tt, v.cz * (1 + tt * 0.05));
          v.g.rotation.set(v.spin[0] * tt, 0, v.spin[1] * tt);
        } else if (tile.state === 'gone') {
          v.g.visible = false;
        }
      }
      // fires on braziers
      if (fx) {
        for (const f of fires) {
          if (Math.random() < dt * 14) {
            const p = f.isl.localToWorld(new THREE.Vector3(f.x, f.y, f.z));
            fx.spawn({ x: p.x + (Math.random() - 0.5) * 0.3, y: p.y, z: p.z + (Math.random() - 0.5) * 0.3, vy: 1.5 + Math.random(), life: 0.6, size: 0.7, size1: 0.1, color: Math.random() < 0.5 ? 0xffa030 : 0xff5a10, shape: 0 });
          }
        }
      }
      return t;
    },
    regrow(tile) {
      const v = views.get(tile);
      if (v) { v.g.visible = true; v.g.position.set(v.cx, 0, v.cz); v.g.rotation.set(0, 0, 0); }
    },
  };
}

function spinner(R, lib, sim) {
  const platform = new THREE.Group(); // scaled for sudden death
  const spinGroup = new THREE.Group(); // rotates with the platform
  const decor = new THREE.Group();
  platform.add(spinGroup);
  const wedges = canvasTex(1024, (g, s) => {
    const c = s / 2;
    const n = 16;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? '#ffcf3a' : '#2fc6c0';
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, c, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2); g.closePath(); g.fill();
    }
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(c, c, c * 0.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 4;
    for (let r = 0.3; r < 1; r += 0.23) { g.beginPath(); g.arc(c, c, c * r, 0, Math.PI * 2); g.stroke(); }
  });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.2, R + 0.2, 0.5, 64), [std(0xe84a5f, { metalness: 0.2, roughness: 0.5 }), std(0xffffff, { map: wedges, roughness: 0.55 }), std(0x333a44)]);
  disc.position.y = -0.25;
  spinGroup.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.2, 0.12, 8, 96), std(0xdfe6ee, { metalness: 0.85, roughness: 0.25 }));
  rim.rotation.x = Math.PI / 2;
  spinGroup.add(rim);
  // light bulbs around the rim (two alternating sets)
  const bulbGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const bulbA = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd24a, emissiveIntensity: 2 });
  const bulbB = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd24a, emissiveIntensity: 0.2 });
  const nb = Math.round(R * 5);
  const bulbs = [new THREE.InstancedMesh(bulbGeo, bulbA, Math.ceil(nb / 2)), new THREE.InstancedMesh(bulbGeo, bulbB, Math.ceil(nb / 2))];
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2;
    m4.makeTranslation(Math.cos(a) * (R + 0.2), -0.25, Math.sin(a) * (R + 0.2) + 0);
    m4.setPosition(Math.cos(a) * (R + 0.33), -0.25, Math.sin(a) * (R + 0.33));
    bulbs[i % 2].setMatrixAt(Math.floor(i / 2), m4);
  }
  spinGroup.add(...bulbs);
  // mechanical underside + support column
  const under = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.35, 1.6, 32), std(0x4a5563, { metalness: 0.6, roughness: 0.45 }));
  under.position.y = -1.3;
  platform.add(under);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.28, R * 0.34, 14, 16), std(0x3a4450, { metalness: 0.5, roughness: 0.5 }));
  col.position.y = -2 - 7;
  platform.add(col);
  const gear = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, 0.25, 6, 24), std(0xffb020, { metalness: 0.6, roughness: 0.4 }));
  gear.rotation.x = Math.PI / 2;
  gear.position.y = -1.9;
  spinGroup.add(gear);
  // hub + sweeper arm (arm rotates independently)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(sim.arena.hub, sim.arena.hub + 0.1, 1.3, 24), std(0xe84a5f, { metalness: 0.3, roughness: 0.4 }));
  hub.position.y = 0.6;
  const hubCap = new THREE.Mesh(new THREE.SphereGeometry(sim.arena.hub * 0.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffcf3a, { metalness: 0.5, roughness: 0.3 }));
  hubCap.position.y = 1.25;
  platform.add(hub, hubCap);
  const armGroup = new THREE.Group();
  const L = R + 0.5 - sim.arena.hub;
  const stripes = canvasTex(256, (g, s) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e8323c'; g.fillRect((i * s) / 8, 0, s / 8, s); }
  });
  stripes.wrapS = THREE.RepeatWrapping;
  stripes.repeat.set(L / 1.5, 1);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, L, 16), std(0xffffff, { map: stripes, roughness: 0.4 }));
  arm.rotation.z = Math.PI / 2;
  arm.position.set(sim.arena.hub + L / 2, 0.45, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), std(0xffcf3a, { metalness: 0.5, roughness: 0.3 }));
  knob.position.set(sim.arena.hub + L, 0.45, 0);
  armGroup.add(arm, knob);
  platform.add(armGroup);
  shadowed(platform);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.7;
    const isl = floatingIsland(1.5, 'tropic', 80 + i);
    isl.position.set(Math.cos(a) * (R + 4.6), -1.6 - (i % 2) * 0.8, Math.sin(a) * (R + 4.6));
    lib.place(isl, 'nature/k-tree-palm.glb', 2.2, 0.2, 0, 0.1);
    lib.place(isl, 'nature/k-tree-palm.glb', 1.6, -0.6, 0, -0.5);
    lib.place(isl, 'platformer/barrel.glb', 1.4, 0.7, 0, -0.6);
    decor.add(shadowed(isl));
  }
  let blink = 0;
  return {
    platform, decor,
    update(dt, t, s) {
      spinGroup.rotation.y = -s.arena.rot;
      armGroup.rotation.y = -s.arena.armAngle;
      blink += dt;
      if (blink > 0.35) { blink = 0; const e = bulbA.emissiveIntensity; bulbA.emissiveIntensity = bulbB.emissiveIntensity; bulbB.emissiveIntensity = e; }
    },
  };
}

function mushroom(R, lib) {
  const platform = new THREE.Group();
  const decor = new THREE.Group();
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) { const r = (i / N) * R; pts.push(new THREE.Vector2(r, 0.9 * (1 - (r / R) ** 2))); }
  pts.push(new THREE.Vector2(R + 0.35, -0.12), new THREE.Vector2(R + 0.45, -0.4), new THREE.Vector2(R + 0.3, -0.7), new THREE.Vector2(R * 0.85, -0.75));
  const cap = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), std(0xe8413a, { roughness: 0.45 }));
  cap.position.y = -0.02;
  platform.add(cap);
  // white spots (flattened spheres on the dome)
  const spotGeo = new THREE.SphereGeometry(1, 16, 8);
  const spotMat = std(0xfff6ea, { roughness: 0.6 });
  const spots = [];
  for (let i = 0; i < Math.round(R * 2.2); i++) {
    const r = Math.sqrt(Math.random()) * (R - 0.6);
    const a = Math.random() * Math.PI * 2;
    const s = 0.35 + Math.random() * 0.45;
    const m = new THREE.Mesh(spotGeo, spotMat);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    m.position.set(x, 0.9 * (1 - (r / R) ** 2) - 0.02, z);
    m.scale.set(s, 0.05, s);
    const nrm = new THREE.Vector3(x * 1.8 / (R * R), 1, z * 1.8 / (R * R)).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
    platform.add(m);
    spots.push(m);
  }
  // gills + stem
  const gills = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, 1.6, 0.8, 48, 1, true), std(0xf5d7c4, { side: THREE.DoubleSide }));
  gills.position.y = -1.1;
  platform.add(gills);
  const stemPts = [];
  for (let i = 0; i <= 10; i++) { const y = -i * 1.4; stemPts.push(new THREE.Vector2(1.7 + Math.sin(i * 0.5) * 0.15 + i * 0.05, y - 0.8)); }
  const stem = new THREE.Mesh(new THREE.LatheGeometry(stemPts.reverse(), 24), std(0xf3e6c8, { roughness: 0.8 }));
  platform.add(stem);
  shadowed(platform);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const isl = floatingIsland(1.4, 'fairy', 100 + i);
    isl.position.set(Math.cos(a) * (R + 4.5), -1.4 - (i % 2) * 0.8, Math.sin(a) * (R + 4.5));
    lib.place(isl, 'nature/k-mushroom-red-group.glb', 5, 0.2, 0, 0);
    lib.place(isl, 'nature/k-mushroom-tan-group.glb', 4, -0.7, 0, 0.4);
    lib.place(isl, 'nature/k-flower-purple-a.glb', 2.5, 0.6, 0, -0.7);
    decor.add(shadowed(isl));
  }
  // giant background mushrooms rising from the cloud sea
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 1.1;
    const h = 10 + i * 3;
    const g = new THREE.Group();
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, h, 12), std(0xf3e6c8));
    st.position.y = h / 2;
    const cp = new THREE.Mesh(new THREE.SphereGeometry(4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(i % 2 ? 0xff8ac0 : 0x8a7dff, { roughness: 0.5 }));
    cp.scale.y = 0.6;
    cp.position.y = h;
    g.add(st, cp);
    g.position.set(Math.cos(a) * (R + 22 + i * 6), SEA_Y - 1, Math.sin(a) * (R + 22 + i * 6));
    decor.add(g);
  }
  let squash = 0;
  let squashV = 0;
  return {
    platform, decor,
    boing(amount = 1) { squashV -= 2.5 * amount; },
    update(dt) {
      // spring
      squashV += (-squash * 90 - squashV * 7) * dt;
      squash += squashV * dt;
      cap.scale.y = 1 + squash * 0.35;
      spots.forEach((s) => { s.position.y += 0; });
    },
  };
}

const BUILDERS = { dohyo, ice, crumble, spinner, mushroom };

/**
 * buildArena(type, sim, lib) -> { root, platform, decor, update(dt,t,sim,fx), edge, dispose() }
 * lib.place(parent, path, scale, x, y, z) positions a cached decor model (async, non-blocking).
 */
export function buildArena(type, sim, lib) {
  const R = sim.arena.R;
  const res = BUILDERS[type](R, lib, sim);
  const root = new THREE.Group();
  root.add(res.platform, res.decor);
  // danger edge ring (lights up red in sudden death)
  const edge = new THREE.Mesh(new THREE.RingGeometry(R - 0.25, R + 0.05, 96), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false }));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = type === 'mushroom' ? 0.03 : 0.035;
  edge.renderOrder = 2;
  res.platform.add(edge);
  return {
    ...res,
    root,
    edge,
    update(dt, t, s, fx) {
      const k = s.arena.Reff / s.arena.R;
      res.platform.scale.set(k, 1, k);
      edge.material.opacity = s.suddenDeath ? 0.45 + Math.sin(t * 8) * 0.25 : 0;
      res.update?.(dt, t, s, fx);
    },
    dispose() {
      root.traverse((o) => {
        if (o.userData.sharedModel) return;
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => { if (m.userData.shared) return; m.map?.dispose?.(); m.dispose(); });
      });
    },
  };
}
