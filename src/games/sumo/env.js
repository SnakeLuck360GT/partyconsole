// Stylised environment: gradient sky dome, animated sea / lava / cloud-sea surface, drifting clouds, floating islands.
import { THREE } from '../../sdk/three-kit.js';

export const SEA_Y = -13;

export const THEMES = {
  dohyo: { top: 0x3b6fd6, horizon: 0xffb877, bottom: 0x1d4f7a, sun: 0xffd9a0, surface: 0, deep: 0x0d4a6e, shallow: 0x2fa3b8, fogNear: 70, fogFar: 260, sunDir: [0.5, 0.28, -0.8], sunI: 2.4, hemi: [0xfff0dd, 0x5a6a88], island: 'grass' },
  ice: { top: 0x4c8ee8, horizon: 0xdcefff, bottom: 0x2d5f8c, sun: 0xffffff, surface: 0, deep: 0x0a2f55, shallow: 0x3f8fc4, fogNear: 60, fogFar: 230, sunDir: [-0.4, 0.55, -0.7], sunI: 2.6, hemi: [0xeaf4ff, 0x6a86a8], island: 'snow' },
  crumble: { top: 0x1b1033, horizon: 0xff6b3a, bottom: 0x2a0a05, sun: 0xffa066, surface: 1, deep: 0x5a0a00, shallow: 0xff7a10, fogNear: 60, fogFar: 220, sunDir: [0.2, 0.3, -0.9], sunI: 1.9, hemi: [0xffc49a, 0x6a2a20], island: 'basalt' },
  spinner: { top: 0x2a86ff, horizon: 0xc5ecff, bottom: 0x1a6c8a, sun: 0xfff6e0, surface: 0, deep: 0x05607a, shallow: 0x22d3c5, fogNear: 80, fogFar: 280, sunDir: [0.45, 0.7, -0.5], sunI: 2.8, hemi: [0xffffff, 0x5a7a90], island: 'tropic' },
  mushroom: { top: 0x7a6cff, horizon: 0xffcfe8, bottom: 0xf3d8ff, sun: 0xfff0f6, surface: 2, deep: 0xe9c6ff, shallow: 0xffffff, fogNear: 70, fogFar: 240, sunDir: [-0.5, 0.45, -0.75], sunI: 2.4, hemi: [0xfff0ff, 0x9a7ab8], island: 'fairy' },
};

const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // at the far plane
}`;
const skyFrag = /* glsl */`
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSun; uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.55)) : mix(uHorizon, uBottom, pow(-h, 0.4));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSun * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.35);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const surfVert = /* glsl */`
uniform float uTime; uniform float uMode;
varying vec3 vWorld; varying float vH; varying vec3 vN;
vec3 wave(vec2 p, vec2 d, float f, float s, float a) {
  float ph = dot(p, d) * f + uTime * s;
  float c = cos(ph) * a * f;
  return vec3(sin(ph) * a, c * d.x, c * d.y); // height, dh/dx, dh/dz
}
void main() {
  vec3 p = position;
  vec4 w = modelMatrix * vec4(p, 1.0);
  float amp = uMode == 1.0 ? 0.25 : uMode == 2.0 ? 0.9 : 0.55;
  vec3 W = wave(w.xz, vec2(1.0, 0.3), 0.18, 1.1, 1.0) + wave(w.xz, vec2(-0.4, 1.0), 0.27, 1.6, 0.6) + wave(w.xz, vec2(0.7, -0.7), 0.5, 2.3, 0.3);
  float h = W.x * amp;
  vN = normalize(vec3(-W.y * amp, 1.0, -W.z * amp));
  w.y += h;
  vH = h / amp;
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const surfFrag = /* glsl */`
uniform float uTime; uniform float uMode; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSun;
uniform float uFogNear; uniform float uFogFar;
varying vec3 vWorld; varying float vH; varying vec3 vN;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vN);
  vec3 col;
  if (uMode == 1.0) {
    // lava: flowing fbm with dark crust
    vec2 uv = vWorld.xz * 0.06;
    float n = fbm(uv + vec2(uTime * 0.03, uTime * 0.02));
    float n2 = fbm(uv * 2.5 - vec2(uTime * 0.05, -uTime * 0.04) + n);
    float heat = smoothstep(0.35, 0.75, n2);
    col = mix(vec3(0.12, 0.02, 0.0), uDeep, smoothstep(0.2, 0.5, n2));
    col = mix(col, uShallow * 1.6, heat);
    col += vec3(1.0, 0.8, 0.3) * pow(heat, 4.0) * 1.2;
  } else if (uMode == 2.0) {
    // cloud sea: soft billows
    vec2 uv = vWorld.xz * 0.035;
    float n = fbm(uv + vec2(uTime * 0.01, 0.0));
    float light = clamp(dot(N, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0);
    col = mix(uDeep, uShallow, smoothstep(0.25, 0.8, n) * 0.7 + vH * 0.15 + 0.15);
    col *= 0.85 + light * 0.25;
  } else {
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col = mix(uDeep, uShallow, clamp(vH * 0.35 + 0.45, 0.0, 1.0));
    col = mix(col, uHorizon, fres * 0.6);
    vec3 H = normalize(normalize(uSunDir) + V);
    float spec = pow(max(dot(N, H), 0.0), 180.0);
    col += uSun * spec * 1.8;
    // foam caps
    float foam = smoothstep(0.62, 0.95, fbm(vWorld.xz * 0.25 + uTime * 0.05) * (0.6 + vH * 0.3));
    col = mix(col, vec3(0.95, 0.98, 1.0), foam * 0.55);
  }
  float dist = length(cameraPosition - vWorld);
  float fog = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uHorizon, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function jitter(geo, amt, seed = 1) {
  const pos = geo.attributes.position;
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, [rnd() * amt, rnd() * amt * 0.6, rnd() * amt]);
    const [a, b, c] = map.get(key);
    pos.setXYZ(i, pos.getX(i) + a, pos.getY(i) + b, pos.getZ(i) + c);
  }
  geo.computeVertexNormals();
  return geo;
}
export { jitter };

const ISLAND_COLORS = {
  grass: { top: 0x6cbf4a, rock: 0x8a6b52, rock2: 0x6b5140 },
  snow: { top: 0xf2f7ff, rock: 0x7d8ea3, rock2: 0x5c6c82 },
  basalt: { top: 0x3a302c, rock: 0x2a2220, rock2: 0x1b1514 },
  tropic: { top: 0x7fd65a, rock: 0xc9a979, rock2: 0xa88a5e },
  fairy: { top: 0xa6e07a, rock: 0xb592c9, rock2: 0x8e6aa8 },
};

/** A floating low-poly rock island. Returns a Group with top surface at y=0. */
export function floatingIsland(radius, kind = 'grass', seed = 1) {
  const c = ISLAND_COLORS[kind] || ISLAND_COLORS.grass;
  const g = new THREE.Group();
  const seg = 9;
  const topGeo = jitter(new THREE.CylinderGeometry(radius, radius * 0.92, radius * 0.25, seg, 1), radius * 0.08, seed);
  const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ color: c.top, flatShading: true, roughness: 0.9 }));
  top.position.y = -radius * 0.125;
  const rockGeo = jitter(new THREE.ConeGeometry(radius * 0.95, radius * 1.6, seg, 3), radius * 0.22, seed + 7);
  rockGeo.rotateX(Math.PI);
  const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: c.rock, flatShading: true, roughness: 1 }));
  rock.position.y = -radius * 0.25 - radius * 0.8;
  const r2Geo = jitter(new THREE.ConeGeometry(radius * 0.4, radius * 0.9, 6, 2), radius * 0.1, seed + 3);
  r2Geo.rotateX(Math.PI);
  const r2 = new THREE.Mesh(r2Geo, new THREE.MeshStandardMaterial({ color: c.rock2, flatShading: true, roughness: 1 }));
  r2.position.set(radius * 0.3, -radius * 1.4, radius * 0.1);
  g.add(top, rock, r2);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function createEnvironment(stage) {
  const { scene } = stage;
  const root = new THREE.Group();
  scene.add(root);
  scene.background = null;

  const skyU = {
    uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
    uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0.5, 0.3, -0.8) },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  root.add(sky);

  const surfU = {
    uTime: { value: 0 }, uMode: { value: 0 }, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() }, uSunDir: skyU.uSunDir, uSun: skyU.uSun, uFogNear: { value: 60 }, uFogFar: { value: 240 },
  };
  const surfGeo = new THREE.PlaneGeometry(700, 700, 140, 140);
  surfGeo.rotateX(-Math.PI / 2);
  const surface = new THREE.Mesh(surfGeo, new THREE.ShaderMaterial({ uniforms: surfU, vertexShader: surfVert, fragmentShader: surfFrag }));
  surface.position.y = SEA_Y;
  surface.receiveShadow = false;
  root.add(surface);

  // lava glow light (only on lava theme)
  const lavaLight = new THREE.PointLight(0xff5a1a, 0, 60, 1.2);
  lavaLight.position.set(0, SEA_Y + 3, 0);
  root.add(lavaLight);

  // --- clouds: instanced puffs
  const puffGeo = new THREE.IcosahedronGeometry(1, 2);
  const puffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25, flatShading: false });
  const clouds = [];
  const PUFFS = 7;
  const NCLOUD = 18;
  const cloudMesh = new THREE.InstancedMesh(puffGeo, puffMat, NCLOUD * PUFFS);
  cloudMesh.frustumCulled = false;
  root.add(cloudMesh);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (let i = 0; i < NCLOUD; i++) {
    const ang = (i / NCLOUD) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 55 + Math.random() * 110;
    const size = 3 + Math.random() * 5;
    const puffs = [];
    for (let k = 0; k < PUFFS; k++) {
      puffs.push([(k - PUFFS / 2) * size * 0.45 + (Math.random() - 0.5) * size * 0.4, Math.random() * size * 0.3, (Math.random() - 0.5) * size * 0.6, size * (0.5 + Math.random() * 0.45) * (1 - Math.abs(k - PUFFS / 2) / PUFFS)]);
    }
    clouds.push({ ang, dist, y: -8 + Math.random() * 26, speed: 0.004 + Math.random() * 0.006, puffs });
  }
  function layoutClouds() {
    let idx = 0;
    for (const c of clouds) {
      const cx = Math.cos(c.ang) * c.dist;
      const cz = Math.sin(c.ang) * c.dist;
      for (const [px, py, pz, s] of c.puffs) {
        v.set(cx + px, c.y + py, cz + pz);
        sc.set(s, s * 0.7, s);
        m4.compose(v, q, sc);
        cloudMesh.setMatrixAt(idx++, m4);
      }
    }
    cloudMesh.instanceMatrix.needsUpdate = true;
  }
  layoutClouds();

  // --- distant floating islands (rebuilt per theme)
  const islandsGroup = new THREE.Group();
  root.add(islandsGroup);
  const islandDefs = [];
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + 0.35 + Math.random() * 0.3;
    islandDefs.push({ ang, dist: 42 + Math.random() * 55, y: -6 + Math.random() * 14, r: 2.5 + Math.random() * 4, seed: 11 + i * 7, bob: Math.random() * 6 });
  }
  let islands = [];

  let theme = null;
  function setTheme(name, decorate) {
    theme = THEMES[name];
    skyU.uTop.value.setHex(theme.top);
    skyU.uHorizon.value.setHex(theme.horizon);
    skyU.uBottom.value.setHex(theme.bottom);
    skyU.uSun.value.setHex(theme.sun);
    skyU.uSunDir.value.set(...theme.sunDir).normalize();
    surfU.uMode.value = theme.surface;
    surfU.uDeep.value.setHex(theme.deep);
    surfU.uShallow.value.setHex(theme.shallow);
    surfU.uHorizon.value.setHex(theme.horizon);
    surfU.uFogNear.value = theme.fogNear;
    surfU.uFogFar.value = theme.fogFar;
    scene.fog = new THREE.Fog(theme.horizon, theme.fogNear, theme.fogFar);
    stage.sun.color.setHex(theme.sun);
    stage.sun.intensity = theme.sunI;
    stage.sun.position.set(theme.sunDir[0] * 40, Math.max(theme.sunDir[1], 0.55) * 50, theme.sunDir[2] * 40 * -1 + 10);
    stage.hemi.color.setHex(theme.hemi[0]);
    stage.hemi.groundColor.setHex(theme.hemi[1]);
    lavaLight.intensity = theme.surface === 1 ? 900 : 0;
    puffMat.color.setHex(theme.surface === 1 ? 0x8a6a70 : 0xffffff);
    puffMat.emissive.setHex(theme.surface === 1 ? 0x5a1a10 : theme.surface === 2 ? 0xffe0f4 : 0xffffff);
    puffMat.emissiveIntensity = theme.surface === 1 ? 0.5 : 0.28;
    // islands
    islandsGroup.clear();
    islands = islandDefs.map((d) => {
      const isl = floatingIsland(d.r, theme.island, d.seed);
      isl.position.set(Math.cos(d.ang) * d.dist, d.y, Math.sin(d.ang) * d.dist);
      isl.rotation.y = d.ang;
      islandsGroup.add(isl);
      decorate?.(isl, d.r, d.seed);
      return { obj: isl, d };
    });
  }

  function update(dt, t) {
    surfU.uTime.value = t;
    for (const c of clouds) c.ang += c.speed * dt;
    layoutClouds();
    for (const { obj, d } of islands) obj.position.y = d.y + Math.sin(t * 0.4 + d.bob) * 0.6;
    if (theme?.surface === 1) lavaLight.intensity = 800 + Math.sin(t * 2.3) * 120;
  }

  return { root, setTheme, update, get theme() { return theme; } };
}
