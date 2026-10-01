// Arena maps. Each build() returns { walls, gravity?, asteroids?, segments(), update(dt,t), dispose() }.
// walls: axis-aligned boxes { x, z, hw, hd } that ships bounce off and bullets die on.
// segments(): currently-lethal line segments [{ x1, z1, x2, z2, w }] (laser gate).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { glowTexture } from './fx.js';

export const MAPS = [
  {
    id: 'asteroids', name: 'Asteroid Field', sub: 'Rocks drift and shatter when shot',
    theme: { nebula: [0x2a1260, 0x0b4f7a, 0xc23a6b], accent: 0x4fc3ff, seed: 3.1, atmo: 0xffc38a, planet: 0 },
  },
  {
    id: 'blackhole', name: 'Event Horizon', sub: 'A black hole pulls everything in',
    theme: { nebula: [0x3a0d2a, 0x52205a, 0xff7a2a], accent: 0xff9a3c, seed: 7.7, atmo: 0xff6a3a, planet: 1 },
  },
  {
    id: 'maze', name: 'Hangar Maze', sub: 'Walls for cover, corners for ambushes',
    theme: { nebula: [0x0a2a3a, 0x10506a, 0x2adfb0], accent: 0x3cffc8, seed: 12.4, atmo: 0x9f7aff, planet: 2 },
  },
  {
    id: 'laser', name: 'Laser Gate', sub: 'Dodge the sweeping laser gate',
    theme: { nebula: [0x2a0a2a, 0x401060, 0xff2a6a], accent: 0xff4d8a, seed: 21.9, atmo: 0x6fb6ff, planet: 3 },
  },
];

const wallGeoCache = new Map();
function wallMesh(w, h, d, bodyMat, stripMat) {
  const key = `${w.toFixed(2)}_${d.toFixed(2)}`;
  if (!wallGeoCache.has(key)) wallGeoCache.set(key, new RoundedBoxGeometry(w, h, d, 2, 0.18));
  const g = new THREE.Group();
  const body = new THREE.Mesh(wallGeoCache.get(key), bodyMat);
  g.add(body);
  // glowing strips on top edges
  const strip = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.1, w - 0.5), 0.06, 0.1), stripMat);
  strip.position.set(0, h / 2 + 0.02, d / 2 - 0.2);
  const strip2 = strip.clone();
  strip2.position.z = -d / 2 + 0.2;
  const strip3 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, Math.max(0.1, d - 0.5)), stripMat);
  strip3.position.set(w / 2 - 0.2, h / 2 + 0.02, 0);
  const strip4 = strip3.clone();
  strip4.position.x = -w / 2 + 0.2;
  g.add(strip, strip2, strip3, strip4);
  return g;
}

export function buildMap(def, { scene, W, H, assets }) {
  const group = new THREE.Group();
  scene.add(group);
  const disposables = [];
  const walls = [];
  const accent = new THREE.Color(def.theme.accent);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x252a3a, metalness: 0.8, roughness: 0.32 });
  const stripMat = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(2.6), toneMapped: false });
  disposables.push(bodyMat, stripMat);

  function addWall(x, z, hw, hd, h = 1.3) {
    walls.push({ x, z, hw, hd });
    const m = wallMesh(hw * 2, h, hd * 2, bodyMat, stripMat);
    m.position.set(x, h / 2 - 0.5, z);
    group.add(m);
  }

  const api = {
    walls,
    gravity: null,
    asteroids: 0,
    segments: () => NO_SEGS,
    update() {},
    avoid: [], // {x,z,r} zones to keep spawns away from
  };

  if (def.id === 'asteroids') {
    api.asteroids = Math.round(5 + (W - 36) / 7);
  }

  if (def.id === 'maze') {
    const hx = W / 2;
    const hz = H / 2;
    const T = 0.55; // half thickness
    // Four L-shaped corner bunkers + central pillars + side stubs. Layout scales with the arena.
    const L = (sx, sz) => {
      addWall(sx * hx * 0.52, sz * hz * 0.5, hx * 0.16, T);
      addWall(sx * (hx * 0.52 + hx * 0.16 - T), sz * (hz * 0.5 - hz * 0.14), T, hz * 0.14);
    };
    L(-1, -1); L(1, -1); L(-1, 1); L(1, 1);
    addWall(0, 0, 1.3, 1.3);
    addWall(0, -hz * 0.78, T, hz * 0.22);
    addWall(0, hz * 0.78, T, hz * 0.22);
    addWall(-hx * 0.86, 0, hx * 0.14, T);
    addWall(hx * 0.86, 0, hx * 0.14, T);
    if (W > 50) {
      addWall(-hx * 0.28, 0, T, hz * 0.2);
      addWall(hx * 0.28, 0, T, hz * 0.2);
    }
  }

  if (def.id === 'laser') {
    // cover pillars
    const hx = W / 2;
    const hz = H / 2;
    addWall(-hx * 0.62, -hz * 0.45, 0.9, 0.9);
    addWall(hx * 0.62, hz * 0.45, 0.9, 0.9);
    addWall(-hx * 0.62, hz * 0.45, 0.9, 0.9);
    addWall(hx * 0.62, -hz * 0.45, 0.9, 0.9);

    const gate = { x: 0, gap: 0, gapHalf: 3.0, on: false, warn: false, phase: 0 };
    const turretA = assets.turret();
    const turretB = assets.turret();
    turretA.rotation.y = Math.PI;
    [turretA, turretB].forEach((t) => t.traverse((o) => { o.userData.keep = true; }));
    group.add(turretA, turretB);
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a5a).multiplyScalar(4), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3), toneMapped: false });
    disposables.push(beamMat, coreMat);
    const beamGeo = new THREE.BoxGeometry(0.5, 0.5, 1);
    const coreGeo = new THREE.BoxGeometry(0.14, 0.14, 1);
    const mk = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(beamGeo, beamMat), new THREE.Mesh(coreGeo, coreMat)); group.add(g); return g; };
    const beamTop = mk();
    const beamBot = mk();
    const gapGlowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(0xff2a5a).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    disposables.push(gapGlowMat);
    const gapA = new THREE.Sprite(gapGlowMat);
    const gapB = new THREE.Sprite(gapGlowMat);
    group.add(gapA, gapB);
    const segs = [];
    const CYCLE = 9;
    api.update = (dt, t) => {
      const hx2 = W / 2;
      const hz2 = H / 2;
      gate.x = Math.sin(t * 0.32) * hx2 * 0.72;
      gate.gap = Math.sin(t * 0.9 + 1) * hz2 * 0.5;
      const ph = t % CYCLE;
      gate.on = ph < 6;
      gate.warn = ph >= 7.8;
      const vis = gate.on || (gate.warn && Math.floor(t * 12) % 2 === 0);
      const thick = gate.on ? 1 : 0.25;
      const top = -hz2;
      const bot = hz2;
      const g1 = gate.gap - gate.gapHalf;
      const g2 = gate.gap + gate.gapHalf;
      beamTop.visible = beamBot.visible = vis;
      beamTop.position.set(gate.x, 0.4, (top + g1) / 2);
      beamTop.scale.set(thick * (1 + Math.sin(t * 40) * 0.12), thick, g1 - top);
      beamBot.position.set(gate.x, 0.4, (g2 + bot) / 2);
      beamBot.scale.set(thick * (1 + Math.cos(t * 43) * 0.12), thick, bot - g2);
      gapA.visible = gapB.visible = vis;
      gapA.position.set(gate.x, 0.4, g1); gapB.position.set(gate.x, 0.4, g2);
      const gs = gate.on ? 2.6 : 1.2;
      gapA.scale.set(gs, gs, 1); gapB.scale.set(gs, gs, 1);
      turretA.position.set(gate.x, -0.5, top - 1.3);
      turretB.position.set(gate.x, -0.5, bot + 1.3);
      segs.length = 0;
      if (gate.on) {
        segs.push({ x1: gate.x, z1: top, x2: gate.x, z2: g1, w: 0.35 }, { x1: gate.x, z1: g2, x2: gate.x, z2: bot, w: 0.35 });
      }
    };
    api.segments = () => segs;
    api.gate = gate;
    api.update(0, 0);
  }

  if (def.id === 'blackhole') {
    const G = 210;
    api.gravity = { x: 0, z: 0, G, horizon: 1.5 };
    api.avoid.push({ x: 0, z: 0, r: 7 });
    // Core: pure black sphere + lensing halo (normal blend so it darkens the grid) + photon ring.
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.35, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    core.renderOrder = 3;
    group.add(core);
    const haloTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.35, 'rgba(0,0,0,0.9)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    })();
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.5;
    group.add(halo);
    const diskMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uTime; varying vec3 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
        void main(){
          float r = length(vP.xy); float a = atan(vP.y, vP.x);
          float rn = (r - 1.4) / (6.5 - 1.4);
          float swirl = a * 3.0 + 7.0 / (r + 0.3) - uTime * 1.6;
          float n = noise(vec2(swirl * 1.3, r * 2.5)) * 0.6 + noise(vec2(swirl * 3.1, r * 6.0 - uTime)) * 0.4;
          float band = smoothstep(0.0, 0.08, rn) * (1.0 - smoothstep(0.35, 1.0, rn));
          float heat = 1.0 - rn;
          vec3 col = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.85, 0.55), heat * heat);
          col = mix(col, vec3(1.0), pow(heat, 6.0));
          float intensity = band * (0.35 + n * 1.1) * (0.6 + heat * 2.2);
          gl_FragColor = vec4(col * intensity, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const disk = new THREE.Mesh(new THREE.RingGeometry(1.4, 6.5, 96, 1), diskMat);
    disk.rotation.x = -Math.PI / 2 + 0.25;
    disk.position.y = -0.1;
    group.add(disk);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd0a0).multiplyScalar(3), toneMapped: false });
    const photon = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.06, 8, 64), ringMat);
    photon.rotation.x = -Math.PI / 2 + 0.5;
    group.add(photon);
    // outer danger ring on the floor
    const dangerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a2a).multiplyScalar(0.6), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const danger = new THREE.Mesh(new THREE.RingGeometry(6.8, 7.0, 96), dangerMat);
    danger.rotation.x = -Math.PI / 2;
    danger.position.y = -0.45;
    group.add(danger);
    disposables.push(haloTex, diskMat, ringMat, dangerMat);
    api.update = (dt, t, fx) => {
      diskMat.uniforms.uTime.value = t;
      photon.rotation.z = t * 0.5;
      dangerMat.opacity = 0.35 + Math.sin(t * 3) * 0.15;
      // matter spiralling in
      if (fx && Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2;
        const r = 5 + Math.random() * 4;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const sp = 5;
        fx.emit(x, 0.1, z, -Math.sin(a) * sp - x * 0.35, 0, Math.cos(a) * sp - z * 0.35, 0xffa050, { life: 1.0, size: 0.4, sizeEnd: 0.1, drag: 0.2, intensity: 1.8 });
      }
    };
  }

  return {
    ...api,
    group,
    dispose() {
      scene.remove(group);
      const cached = new Set(wallGeoCache.values());
      group.traverse((o) => { if (o.geometry && !o.userData.keep && !cached.has(o.geometry)) o.geometry.dispose?.(); });
      disposables.forEach((d) => d.dispose());
    },
  };
}
const NO_SEGS = [];
