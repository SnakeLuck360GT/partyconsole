// Stadium: striped grass pitch with markings, LED ad boards, goals with bulging nets,
// stepped stands with an instanced animated crowd, floodlight towers, and a dusk sky.
import { THREE } from '../../sdk/three-kit.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TEAMS } from './config.js';

const BRANDS = [
  { t: 'ZAPCOLA', bg: '#e8202a', fg: '#ffffff', s: 'italic 900' },
  { t: 'NOVA BOOTS', bg: '#101820', fg: '#39ff88', s: '900' },
  { t: 'PIXELBANK', bg: '#1f4fff', fg: '#ffffff', s: '800' },
  { t: 'ORBIT AIR', bg: '#ffffff', fg: '#0d2a6b', s: 'italic 800' },
  { t: 'KICKFUEL', bg: '#ffcc00', fg: '#1a1a1a', s: '900' },
  { t: 'PARTYCONSOLE', bg: '#5c3dff', fg: '#ffcc00', s: '800' },
  { t: 'MEGA BURGER', bg: '#ff7a1a', fg: '#ffffff', s: '900' },
  { t: 'SPARK MOBILE', bg: '#00b894', fg: '#ffffff', s: 'italic 800' },
];

function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}

function boardTexture(goal = false) {
  return canvasTex(2048, 128, (g, w, h) => {
    const tiles = goal ? 8 : BRANDS.length;
    const tw = w / tiles;
    for (let i = 0; i < tiles; i++) {
      const x = i * tw;
      if (goal) {
        const grd = g.createLinearGradient(x, 0, x + tw, 0);
        grd.addColorStop(0, i % 2 ? TEAMS[0].css : '#ffcc00');
        grd.addColorStop(1, i % 2 ? '#ffcc00' : TEAMS[1].css);
        g.fillStyle = grd;
        g.fillRect(x, 0, tw, h);
        g.fillStyle = '#fff';
        g.font = 'italic 900 88px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('GOAL!', x + tw / 2, h / 2 + 4);
        continue;
      }
      const b = BRANDS[i];
      g.fillStyle = b.bg;
      g.fillRect(x, 0, tw, h);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x, 0, tw, h / 2);
      g.fillStyle = b.fg;
      let size = 64;
      g.font = `${b.s} ${size}px system-ui, sans-serif`;
      while (g.measureText(b.t).width > tw * 0.86 && size > 20) { size -= 2; g.font = `${b.s} ${size}px system-ui, sans-serif`; }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(b.t, x + tw / 2, h / 2 + 3);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + tw - 3, 0, 3, h);
    }
    // LED pixel grid
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  }, { repeat: true });
}

function pitchTexture(pitch, floor) {
  const { HL, HW, GW, corner } = pitch;
  const ppm = Math.min(36, 2048 / (floor.L));
  const W = Math.round(floor.L * ppm);
  const H = Math.round(floor.W * ppm);
  return canvasTex(W, H, (g) => {
    const X = (x) => (x + floor.L / 2) * ppm;
    const Z = (z) => (z + floor.W / 2) * ppm;
    // runoff
    g.fillStyle = '#2f6e2c';
    g.fillRect(0, 0, W, H);
    // mowing stripes
    const stripes = Math.max(10, Math.round(HL / 2.6) * 2);
    const sw = (2 * HL) / stripes;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#47a03c' : '#3d9234';
      g.fillRect(X(-HL + i * sw), Z(-HW), sw * ppm + 1, 2 * HW * ppm);
    }
    // cross-cut subtle checker
    const cs = (2 * HW) / Math.max(6, Math.round(HW / 2.6) * 2);
    for (let j = 0; j * cs < 2 * HW; j++) {
      if (j % 2) continue;
      g.fillStyle = 'rgba(255,255,255,0.035)';
      g.fillRect(X(-HL), Z(-HW + j * cs), 2 * HL * ppm, cs * ppm);
    }
    // noise speckle
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      d[i] += n * 0.6; d[i + 1] += n; d[i + 2] += n * 0.4;
    }
    g.putImageData(img, 0, 0);
    // wear near the goal mouths and centre
    const wear = (x, z, r, a) => {
      const grd = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * ppm);
      grd.addColorStop(0, `rgba(120,110,60,${a})`);
      grd.addColorStop(1, 'rgba(120,110,60,0)');
      g.fillStyle = grd;
      g.fillRect(X(x) - r * ppm, Z(z) - r * ppm, 2 * r * ppm, 2 * r * ppm);
    };
    wear(-HL + 1.2, 0, 2.6, 0.28);
    wear(HL - 1.2, 0, 2.6, 0.28);
    wear(0, 0, 1.4, 0.15);

    // lines
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = Math.max(2, 0.13 * ppm);
    g.lineJoin = 'round';
    const inset = 0.35;
    const L = HL - inset;
    const Wd = HW - inset;
    const c = corner;
    g.beginPath();
    g.moveTo(X(-L + c), Z(-Wd));
    g.lineTo(X(L - c), Z(-Wd));
    g.lineTo(X(L), Z(-Wd + c));
    g.lineTo(X(L), Z(Wd - c));
    g.lineTo(X(L - c), Z(Wd));
    g.lineTo(X(-L + c), Z(Wd));
    g.lineTo(X(-L), Z(Wd - c));
    g.lineTo(X(-L), Z(-Wd + c));
    g.closePath();
    g.stroke();
    g.beginPath(); g.moveTo(X(0), Z(-Wd)); g.lineTo(X(0), Z(Wd)); g.stroke();
    const cr = Math.min(9.15, Math.max(3, HW * 0.3));
    g.beginPath(); g.arc(X(0), Z(0), cr * ppm, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath(); g.arc(X(0), Z(0), 0.3 * ppm, 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) {
      const bd = Math.min(16.5, HL * 0.3); // box depth
      const bw = Math.min(HW - 1.2, GW + Math.min(11, HW * 0.45)); // box half width
      const sd = Math.min(5.5, bd * 0.36);
      const sw2 = GW + Math.min(5.5, bd * 0.4);
      g.beginPath();
      g.moveTo(X(s * L), Z(-bw)); g.lineTo(X(s * (L - bd)), Z(-bw)); g.lineTo(X(s * (L - bd)), Z(bw)); g.lineTo(X(s * L), Z(bw));
      g.stroke();
      g.beginPath();
      g.moveTo(X(s * L), Z(-sw2)); g.lineTo(X(s * (L - sd)), Z(-sw2)); g.lineTo(X(s * (L - sd)), Z(sw2)); g.lineTo(X(s * L), Z(sw2));
      g.stroke();
      const ps = L - bd * 0.67;
      g.beginPath(); g.arc(X(s * ps), Z(0), 0.25 * ppm, 0, Math.PI * 2); g.fill();
      const ar = cr * 0.95;
      const dx = bd - bd * 0.67;
      if (ar > dx) {
        const a = Math.acos(dx / ar);
        g.beginPath();
        if (s > 0) g.arc(X(ps), Z(0), ar * ppm, Math.PI - a, Math.PI + a);
        else g.arc(X(-ps), Z(0), ar * ppm, -a, a);
        g.stroke();
      }
    }
  });
}

function netTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 5;
    g.beginPath();
    for (let i = 0; i <= 4; i++) {
      g.moveTo(0, i * 32); g.lineTo(w, i * 32);
      g.moveTo(i * 32, 0); g.lineTo(i * 32, h);
    }
    g.stroke();
  }, { repeat: true });
}

function glowTexture() {
  return canvasTex(128, 128, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,245,1)');
    grd.addColorStop(0.18, 'rgba(255,245,210,0.75)');
    grd.addColorStop(0.5, 'rgba(255,230,170,0.15)');
    grd.addColorStop(1, 'rgba(255,230,170,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  });
}

// ---------------------------------------------------------------- goals with nets

function buildGoal(pitch, side, mats) {
  const { HL, GW, GH, GD } = pitch;
  const grp = new THREE.Group();
  const pr = 0.1;
  const postGeo = new THREE.CylinderGeometry(pr, pr, GH + pr, 14);
  for (const z of [-GW, GW]) {
    const post = new THREE.Mesh(postGeo, mats.post);
    post.position.set(0, (GH + pr) / 2, z);
    post.castShadow = true;
    grp.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, GW * 2 + pr * 2, 14), mats.post);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0, GH, 0);
  bar.castShadow = true;
  grp.add(bar);
  // back frame
  const thin = 0.045;
  const fr = (a, b) => {
    const v = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(thin, thin, v.length(), 6), mats.frame);
    m.position.copy(a).addScaledVector(v, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    grp.add(m);
  };
  const D = GD;
  const top = GH * 0.92;
  for (const z of [-GW, GW]) {
    fr(new THREE.Vector3(0, GH, z), new THREE.Vector3(D * 0.55, top, z));
    fr(new THREE.Vector3(D * 0.55, top, z), new THREE.Vector3(D, 0, z));
    fr(new THREE.Vector3(0, 0.02, z), new THREE.Vector3(D, 0.02, z));
  }
  fr(new THREE.Vector3(D, 0.02, -GW), new THREE.Vector3(D, 0.02, GW));
  fr(new THREE.Vector3(D * 0.55, top, -GW), new THREE.Vector3(D * 0.55, top, GW));

  // Nets: roof (bar -> top back), back (top back -> ground back), sides.
  const segZ = 18;
  const segY = 10;
  const back = new THREE.PlaneGeometry(1, 1, segZ, segY);
  const bpos = back.attributes.position;
  const base = new Float32Array(bpos.count * 3);
  const uv = back.attributes.uv;
  for (let i = 0; i < bpos.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i); // 0 bottom .. 1 top of back net, continues over the roof
    const z = (u - 0.5) * 2 * GW;
    // path: ground back (D,0) -> (D*0.55, top) -> bar (0, GH)
    let x; let y;
    if (v < 0.62) { const k = v / 0.62; x = D - k * D * 0.45; y = k * top; } else { const k = (v - 0.62) / 0.38; x = D * 0.55 * (1 - k); y = top + (GH - top) * k; }
    base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;
    bpos.setXYZ(i, x, y, z);
    uv.setXY(i, u * GW * 2 / 0.35, v * (D + GH) / 0.35);
  }
  back.computeVertexNormals();
  const backMesh = new THREE.Mesh(back, mats.net);
  grp.add(backMesh);
  for (const z of [-GW, GW]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(D, 0); shape.lineTo(D * 0.55, top); shape.lineTo(0, GH); shape.closePath();
    const sg = new THREE.ShapeGeometry(shape);
    const suv = sg.attributes.uv;
    const sp = sg.attributes.position;
    for (let i = 0; i < suv.count; i++) suv.setXY(i, sp.getX(i) / 0.35, sp.getY(i) / 0.35);
    const sm = new THREE.Mesh(sg, mats.net);
    sm.position.z = z;
    grp.add(sm);
  }
  grp.position.x = side * HL;
  if (side < 0) grp.rotation.y = Math.PI;
  // bulge state
  const bulge = { amp: 0, vel: 0, z: 0, y: 1 };
  grp.userData.bulge = bulge;
  grp.userData.update = (dt) => {
    // damped spring
    bulge.vel += (-bulge.amp * 90 - bulge.vel * 7) * dt;
    bulge.amp += bulge.vel * dt;
    if (Math.abs(bulge.amp) < 1e-4 && Math.abs(bulge.vel) < 1e-3) { if (bulge.idle) return; bulge.idle = true; } else bulge.idle = false;
    for (let i = 0; i < bpos.count; i++) {
      const bx = base[i * 3]; const by = base[i * 3 + 1]; const bz = base[i * 3 + 2];
      const dz = bz - bulge.z * (side < 0 ? -1 : 1);
      const dy = by - bulge.y;
      const f = Math.exp(-(dz * dz) / 1.6 - (dy * dy) / 1.2) * bulge.amp;
      bpos.setXYZ(i, bx + f, by + f * 0.1, bz);
    }
    bpos.needsUpdate = true;
  };
  grp.userData.hit = (z, y, speed) => {
    bulge.z = z; bulge.y = y;
    bulge.vel += Math.min(1.8, speed * 0.09) * 9;
    bulge.idle = false;
  };
  return grp;
}

// ---------------------------------------------------------------- crowd

function crowdMaterial(uniforms) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uExcite = uniforms.uExcite;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uExcite; attribute float aHead; attribute float aFan;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }`)
      .replace('#include <color_vertex>', `
        vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        float hh = hsh(ip);
        vec3 skin = mix(vec3(1.0,0.8,0.62), vec3(0.42,0.27,0.17), hsh(ip + 3.7));
        vec3 shirt = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          shirt = instanceColor.rgb;
        #endif
        vColor = mix(shirt, skin, aHead);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ex = aFan < 0.5 ? uExcite.z : (aFan < 1.5 ? uExcite.x : uExcite.y);
        float wave = max(0.0, sin(uTime * 1.3 - ip.x * 0.12 - ip.y * 0.12)) ;
        float bob = abs(sin(uTime * (5.0 + hh * 4.0) + hh * 30.0)) * (0.05 + ex * 0.55) + pow(wave, 12.0) * 0.35 * (1.0 - ex);
        transformed.y += bob;
        transformed.x += sin(uTime * 3.0 + hh * 10.0) * 0.03 * (1.0 + ex * 3.0) * (position.y);`);
  };
  return m;
}

function spectatorGeometry() {
  const body = new THREE.BoxGeometry(0.44, 0.55, 0.3);
  body.translate(0, 0.28, 0);
  const head = new THREE.BoxGeometry(0.27, 0.27, 0.27);
  head.translate(0, 0.72, 0);
  const armL = new THREE.BoxGeometry(0.11, 0.42, 0.12);
  armL.translate(-0.28, 0.6, 0.02);
  const armR = armL.clone();
  armR.translate(0.56, 0, 0);
  const parts = [body, head, armL, armR].map((g, i) => {
    const n = g.attributes.position.count;
    g.setAttribute('aHead', new THREE.BufferAttribute(new Float32Array(n).fill(i === 1 ? 1 : 0), 1));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    return g;
  });
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return geo;
}

// ---------------------------------------------------------------- build

export function buildStadium(scene, pitch) {
  const { HL, HW, GW, corner } = pitch;
  const root = new THREE.Group();
  scene.add(root);
  const disposables = [];
  const track = (x) => { disposables.push(x); return x; };

  const floor = { L: 2 * HL + 8, W: 2 * HW + 6 };
  const pitchTex = track(pitchTexture(pitch, floor));
  const grassMat = track(new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.92, metalness: 0 }));
  const grass = new THREE.Mesh(track(new THREE.PlaneGeometry(floor.L, floor.W)), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  root.add(grass);

  // Surrounding ground (track) out to the stands.
  const standGap = 2.6;
  const outer = new THREE.Mesh(track(new THREE.PlaneGeometry(floor.L + 90, floor.W + 90)), track(new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 1 })));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  outer.receiveShadow = true;
  root.add(outer);

  // ---- LED boards along the arena walls
  const boardTex = track(boardTexture(false));
  const goalTex = track(boardTexture(true));
  const boardMat = track(new THREE.MeshStandardMaterial({ map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.55, roughness: 0.5 }));
  const boardBack = track(new THREE.MeshStandardMaterial({ color: 0x1b1e27, roughness: 0.8 }));
  const bh = 0.9;
  const tileLen = 1.8 * 1; // metres per brand tile
  const segs = [];
  const c = corner;
  // corners of the octagon (clockwise)
  const P = [
    [-HL + c, -HW], [HL - c, -HW], [HL, -HW + c], [HL, -GW - 0.12], null, [HL, GW + 0.12], [HL, HW - c], [HL - c, HW],
    [-HL + c, HW], [-HL, HW - c], [-HL, GW + 0.12], null, [-HL, -GW - 0.12], [-HL, -HW + c],
  ];
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    if (!a || !b) continue;
    segs.push([a, b]);
  }
  const boardGeos = [];
  const backGeos = [];
  for (const [a, b] of segs) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const ang = Math.atan2(dz, dx);
    const g = new THREE.PlaneGeometry(len, bh);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / (tileLen * 8)) * 1);
    // The plane faces +Z; rotate so its front faces the pitch centre.
    const m = new THREE.Matrix4();
    const mid = new THREE.Vector3((a[0] + b[0]) / 2, bh / 2, (a[1] + b[1]) / 2);
    // normal pointing inward: (dz, -dx) rotated... pick the one facing origin
    let nx = -dz / len;
    let nz = dx / len;
    if (nx * -mid.x + nz * -mid.z < 0) { nx = -nx; nz = -nz; }
    const yaw = Math.atan2(nx, nz);
    m.makeRotationY(yaw);
    // After yaw rotation the plane's +X axis should run a->b or b->a; fine visually either way.
    m.setPosition(mid.x - nx * 0.02, mid.y, mid.z - nz * 0.02);
    g.applyMatrix4(m);
    boardGeos.push(g);
    const bk = new THREE.BoxGeometry(len + 0.1, bh + 0.08, 0.22);
    const m2 = new THREE.Matrix4().makeRotationY(yaw).setPosition(mid.x - nx * 0.14, mid.y + 0.02, mid.z - nz * 0.14);
    bk.applyMatrix4(m2);
    backGeos.push(bk);
    void ang;
  }
  const boards = new THREE.Mesh(track(mergeGeometries(boardGeos)), boardMat);
  boardGeos.forEach((g) => g.dispose());
  const boardBox = new THREE.Mesh(track(mergeGeometries(backGeos)), boardBack);
  backGeos.forEach((g) => g.dispose());
  boardBox.castShadow = true;
  boardBox.receiveShadow = true;
  root.add(boards, boardBox);

  // ---- Goals
  const netTex = track(netTexture());
  const mats = {
    post: track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x333333 })),
    frame: track(new THREE.MeshStandardMaterial({ color: 0xcfd6e0, roughness: 0.6 })),
    net: track(new THREE.MeshStandardMaterial({ map: netTex, alphaMap: null, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9, color: 0xf2f4f8 })),
  };
  const goals = {};
  for (const s of [-1, 1]) {
    const gl = buildGoal(pitch, s, mats);
    root.add(gl);
    goals[s] = gl;
    gl.traverse((o) => { if (o.geometry) track(o.geometry); });
  }
  // Team colour strip in each goal mouth floor (defending team).
  for (const s of [-1, 1]) {
    const team = TEAMS[s < 0 ? 0 : 1];
    const strip = new THREE.Mesh(track(new THREE.PlaneGeometry(pitch.GD, GW * 2)), track(new THREE.MeshStandardMaterial({ color: team.hex, transparent: true, opacity: 0.22, roughness: 1 })));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(s * (HL + pitch.GD / 2), 0.012, 0);
    root.add(strip);
  }

  // ---- Stands (four sides), stepped tiers + crowd
  const rows = Math.min(10, 6 + Math.round(HL / 14));
  const rise = 0.5;
  const depth = 0.95;
  const baseH = 1.3;
  const standMat = track(new THREE.MeshStandardMaterial({ color: 0x565d6e, roughness: 0.95 }));
  const seatMats = [track(new THREE.MeshStandardMaterial({ color: TEAMS[0].dark, roughness: 0.7 })), track(new THREE.MeshStandardMaterial({ color: TEAMS[1].dark, roughness: 0.7 }))];
  const standGeos = [];
  const seatGeos = [[], []];
  const sides = [
    { axis: 'x', sign: 1, len: 2 * HL + 6, dist: HW + standGap },
    { axis: 'x', sign: -1, len: 2 * HL + 6, dist: HW + standGap },
    { axis: 'z', sign: 1, len: 2 * HW + 2 * standGap + 2 * rows * depth, dist: HL + standGap + 1.2 },
    { axis: 'z', sign: -1, len: 2 * HW + 2 * standGap + 2 * rows * depth, dist: HL + standGap + 1.2 },
  ];
  const seats = []; // [x, y, z, yaw, fan]
  for (const sd of sides) {
    for (let r = 0; r < rows; r++) {
      const h = baseH + r * rise;
      const g = new THREE.BoxGeometry(sd.len, h, depth);
      const off = sd.dist + depth * (r + 0.5);
      const m = new THREE.Matrix4();
      if (sd.axis === 'x') m.makeTranslation(0, h / 2, sd.sign * off);
      else m.makeRotationY(Math.PI / 2).setPosition(sd.sign * off, h / 2, 0);
      g.applyMatrix4(m);
      standGeos.push(g);
      // seat rows
      const spacing = 0.64;
      const n = Math.floor((sd.len - 1) / spacing);
      for (let i = 0; i < n; i++) {
        const t = -sd.len / 2 + 0.5 + i * spacing + (Math.random() - 0.5) * 0.08;
        if (Math.random() < 0.1) continue;
        let x; let z; let fan;
        if (sd.axis === 'x') { x = t; z = sd.sign * (off + 0.05); fan = x < -3 ? 1 : x > 3 ? 2 : 0; } else { x = sd.sign * (off + 0.05); z = t; fan = sd.sign < 0 ? 1 : 2; }
        if (Math.random() < 0.25) fan = 0;
        const yaw = sd.axis === 'x' ? (sd.sign > 0 ? Math.PI : 0) : (sd.sign > 0 ? -Math.PI / 2 : Math.PI / 2);
        seats.push([x, h, z, yaw, fan]);
      }
      // seat strip (coloured) on each step
      const sg = new THREE.BoxGeometry(sd.len - 0.4, 0.12, 0.35);
      const m3 = new THREE.Matrix4();
      const so = off - depth * 0.1;
      if (sd.axis === 'x') m3.makeTranslation(0, h + 0.06, sd.sign * so);
      else m3.makeRotationY(Math.PI / 2).setPosition(sd.sign * so, h + 0.06, 0);
      sg.applyMatrix4(m3);
      seatGeos[(r + (sd.axis === 'x' ? 0 : 1)) % 2].push(sg);
    }
    // back wall + roof canopy
    const topH = baseH + rows * rise;
    const wallDist = sd.dist + depth * rows + 0.3;
    const wall = new THREE.BoxGeometry(sd.len + 2, topH + 3.5, 0.6);
    const roof = new THREE.BoxGeometry(sd.len + 2, 0.35, depth * rows * 0.75);
    const mw = new THREE.Matrix4();
    const mr = new THREE.Matrix4();
    const rd = wallDist - depth * rows * 0.35;
    if (sd.axis === 'x') { mw.makeTranslation(0, (topH + 3.5) / 2, sd.sign * wallDist); mr.makeTranslation(0, topH + 3.4, sd.sign * rd); } else {
      mw.makeRotationY(Math.PI / 2).setPosition(sd.sign * wallDist, (topH + 3.5) / 2, 0);
      mr.makeRotationY(Math.PI / 2).setPosition(sd.sign * rd, topH + 3.4, 0);
    }
    wall.applyMatrix4(mw);
    roof.applyMatrix4(mr);
    standGeos.push(wall, roof);
  }
  const stands = new THREE.Mesh(track(mergeGeometries(standGeos)), standMat);
  standGeos.forEach((g) => g.dispose());
  stands.receiveShadow = true;
  root.add(stands);
  for (let i = 0; i < 2; i++) {
    if (!seatGeos[i].length) continue;
    const sm = new THREE.Mesh(track(mergeGeometries(seatGeos[i])), seatMats[i]);
    seatGeos[i].forEach((g) => g.dispose());
    root.add(sm);
  }
  // roof underside light strips
  const stripMat = track(new THREE.MeshBasicMaterial({ color: 0xfff4d6 }));
  for (const sd of sides) {
    const topH = baseH + rows * rise;
    const wallDist = sd.dist + depth * rows + 0.3;
    const rd = wallDist - depth * rows * 0.7;
    const g = track(new THREE.BoxGeometry(sd.len * 0.9, 0.08, 0.25));
    const m = new THREE.Mesh(g, stripMat);
    if (sd.axis === 'x') m.position.set(0, topH + 3.2, sd.sign * rd);
    else { m.rotation.y = Math.PI / 2; m.position.set(sd.sign * rd, topH + 3.2, 0); }
    root.add(m);
  }

  // crowd
  const uniforms = { uTime: { value: 0 }, uExcite: { value: new THREE.Vector3(0.1, 0.1, 0.1) } };
  const specGeo = track(spectatorGeometry());
  const fanAttr = new Float32Array(seats.length);
  const crowdMat = track(crowdMaterial(uniforms));
  const crowd = new THREE.InstancedMesh(specGeo, crowdMat, seats.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const neutral = ['#e8e8e8', '#2d3142', '#c0392b', '#27ae60', '#f1c40f', '#8e44ad', '#16a085', '#d35400', '#7f8c8d'];
  seats.forEach(([x, y, z, yaw, fan], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw + (Math.random() - 0.5) * 0.4, 0);
    const s = 0.9 + Math.random() * 0.25;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
    if (fan === 1) col.set(Math.random() < 0.8 ? TEAMS[0].css : '#ffffff');
    else if (fan === 2) col.set(Math.random() < 0.8 ? TEAMS[1].css : '#1c1f2b');
    else col.set(neutral[Math.floor(Math.random() * neutral.length)]);
    col.offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
    crowd.setColorAt(i, col);
    fanAttr[i] = fan;
  });
  specGeo.setAttribute('aFan', new THREE.InstancedBufferAttribute(fanAttr, 1));
  crowd.instanceMatrix.needsUpdate = true;
  crowd.frustumCulled = false;
  root.add(crowd);

  // flags / banners on the back walls
  // ---- Floodlight towers
  const glowTex = track(glowTexture());
  const poleMat = track(new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.5, metalness: 0.6 }));
  const lampMat = track(new THREE.MeshBasicMaterial({ color: 0xfffbe8 }));
  const towerH = 22 + HL * 0.18;
  const lights = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (HL + standGap + rows * depth + 1.5);
      const z = sz * (HW + standGap + rows * depth + 1.5);
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.35, 0.6, towerH, 10)), poleMat);
      pole.position.set(x, towerH / 2, z);
      root.add(pole);
      const head = new THREE.Group();
      head.position.set(x, towerH, z);
      head.lookAt(0, 0, 0);
      const panel = new THREE.Mesh(track(new THREE.BoxGeometry(5.2, 3.2, 0.4)), poleMat);
      head.add(panel);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          const lamp = new THREE.Mesh(track(new THREE.PlaneGeometry(1.0, 0.75)), lampMat);
          lamp.position.set(-1.9 + i * 1.27, -1.0 + j * 1.0, 0.21);
          head.add(lamp);
        }
      }
      const glow = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1cc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      glow.scale.set(16, 16, 1);
      glow.position.set(0, 0, 0.8);
      head.add(glow);
      root.add(head);
      lights.push(head);
    }
  }

  // ---- Sky dome
  const skyMat = track(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 top = vec3(0.03,0.07,0.2);
        vec3 mid = vec3(0.16,0.22,0.46);
        vec3 hor = vec3(0.98,0.56,0.36);
        vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(hor, mid, smoothstep(-0.05, 0.12, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(400, 32, 16)), skyMat);
  root.add(sky);

  let excite = 0.1;
  let exciteTarget = 0.1;
  let cheerTeam = -1;
  let cheerT = 0;
  let goalBoardsT = 0;
  return {
    root,
    goals,
    rows,
    outerRadius: Math.max(HL, HW) + standGap + rows * depth,
    update(dt, t) {
      uniforms.uTime.value = t;
      excite += (exciteTarget - excite) * Math.min(1, dt * 3);
      const u = uniforms.uExcite.value;
      u.set(excite, excite, excite * 0.6);
      if (cheerTeam === 0) u.set(Math.max(excite, 0.9), 0.05, 0.4);
      if (cheerTeam === 1) u.set(0.05, Math.max(excite, 0.9), 0.4);
      boardTex.offset.x = (boardTex.offset.x + dt * 0.035) % 1;
      goalTex.offset.x = (goalTex.offset.x + dt * 0.25) % 1;
      if (cheerT > 0) { cheerT -= dt; if (cheerT <= 0) cheerTeam = -1; }
      if (goalBoardsT > 0) {
        goalBoardsT -= dt;
        if (goalBoardsT <= 0) { boardMat.map = boardTex; boardMat.emissiveMap = boardTex; boardMat.needsUpdate = true; }
      }
      goals[-1].userData.update(dt);
      goals[1].userData.update(dt);
    },
    setExcitement(v) { exciteTarget = v; },
    cheer(team, secs = 5) {
      cheerTeam = team;
      goalBoardsT = secs;
      boardMat.map = goalTex; boardMat.emissiveMap = goalTex; boardMat.needsUpdate = true;
      cheerT = secs;
    },
    netHit(side, z, y, speed) { goals[side]?.userData.hit(z, y, speed); },
    dispose() {
      scene.remove(root);
      disposables.forEach((d) => d.dispose?.());
    },
  };
}
