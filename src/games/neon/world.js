// Renderer, bloom post-processing, synthwave floor, backdrop (sky/sun/mountains), arena boundary and camera.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Trail } from './trails.js';

const PITCH = THREE.MathUtils.degToRad(50);
const FOV = 38;

const floorVert = /* glsl */`
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const floorFrag = /* glsl */`
  uniform vec2 uHalf;
  uniform float uShrink;
  uniform float uTime;
  uniform float uPulse;
  uniform float uFarZ;
  varying vec3 vW;
  float grid(vec2 p, float sp, float w) {
    vec2 c = p / sp;
    vec2 fw = max(fwidth(c), vec2(1e-4));
    vec2 g = abs(fract(c - 0.5) - 0.5) / fw;
    return 1.0 - clamp(min(g.x, g.y) / w, 0.0, 1.0);
  }
  void main() {
    vec2 p = vW.xz;
    vec2 q = abs(p) - uHalf;
    float outside = max(q.x, q.y);
    float fw = length(fwidth(p));
    vec3 col = vec3(0.010, 0.006, 0.026);
    if (outside < 0.0) {
      float minor = grid(p, 1.0, 0.9) * clamp(1.3 - fw * 2.0, 0.0, 1.0);
      float major = grid(p, 6.0, 1.3);
      // soft vignette inside the arena, brighter toward the far (sun) side
      float sheen = smoothstep(uHalf.y * 1.2, -uHalf.y * 1.1, p.y) * (1.0 - smoothstep(0.0, uHalf.x * 1.1, abs(p.x)));
      col += vec3(0.05, 0.012, 0.09) * sheen;
      col += vec3(0.30, 0.06, 0.62) * major * (0.55 + 0.25 * uPulse);
      col += vec3(0.16, 0.05, 0.36) * minor * 0.35;
      // edge glow just inside the boundary
      col += vec3(0.05, 0.35, 0.5) * exp(outside * 0.9) * 0.35;
      // collapsing zone
      if (outside > -uShrink) {
        float stripe = step(0.5, fract((p.x + p.y) * 0.25 - uTime * 0.6));
        col = mix(col, vec3(0.45, 0.01, 0.06) * (0.55 + 0.45 * stripe), 0.75);
      }
    } else {
      float big = grid(p, 6.0, 1.1);
      float fade = exp(-outside * 0.03);
      col += vec3(0.35, 0.06, 0.55) * big * 0.45 * fade;
      col += vec3(0.05, 0.3, 0.45) * exp(-outside * 0.8) * 0.3;
    }
    // horizon haze toward the backdrop
    float haze = smoothstep(uFarZ + 30.0, uFarZ, p.y);
    col = mix(col, vec3(0.30, 0.04, 0.22), haze * 0.55);
    gl_FragColor = vec4(col, 1.0);
  }`;

const skyVert = /* glsl */`
  varying vec2 vP;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vP = wp.xy;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const skyFrag = /* glsl */`
  uniform float uH;
  uniform vec2 uSunC;
  uniform float uSunR;
  uniform float uTime;
  uniform float uStarScale;
  varying vec2 vP;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float h = clamp(vP.y / uH, 0.0, 1.0);
    vec3 hor = vec3(0.95, 0.16, 0.48);
    vec3 mid = vec3(0.16, 0.02, 0.28);
    vec3 top = vec3(0.008, 0.004, 0.03);
    vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
    col = mix(col, top, smoothstep(0.18, 0.75, h));
    // stars
    vec2 g = vP / uStarScale;
    vec2 id = floor(g);
    float r = hash(id);
    vec2 f = fract(g) - 0.5 - (vec2(hash(id + 1.7), hash(id + 3.1)) - 0.5) * 0.6;
    float star = step(0.9, r) * smoothstep(0.09, 0.0, length(f)) * smoothstep(0.25, 0.6, h);
    col += star * vec3(0.9, 0.85, 1.0) * (0.6 + 0.4 * sin(uTime * 1.7 + r * 60.0)) * 1.4;
    // retro sun with scanline cut-outs
    vec2 d = vP - uSunC;
    float dist = length(d) / uSunR;
    float sy = d.y / uSunR;
    float mask = smoothstep(1.0, 0.98, dist);
    if (sy < 0.25) {
      float band = fract(sy * 7.0 - uTime * 0.25);
      float gap = mix(0.06, 0.55, clamp((0.25 - sy) / 1.1, 0.0, 1.0));
      mask *= step(gap, band);
    }
    vec3 sunCol = mix(vec3(1.0, 0.12, 0.5), vec3(1.0, 0.85, 0.25), clamp(sy * 0.5 + 0.55, 0.0, 1.0)) * 1.6;
    col = mix(col, sunCol, mask);
    col += vec3(1.0, 0.25, 0.55) * 0.28 * exp(-max(dist - 1.0, 0.0) * 2.5) * (1.0 - mask);
    gl_FragColor = vec4(col, 1.0);
  }`;

function envMap(renderer) {
  // A dark room with a few neon panels: gives the glossy bike bodies synthwave reflections.
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x06030f, side: THREE.BackSide }));
  s.add(box);
  const panel = (color, pos, size, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    s.add(m);
  };
  panel(new THREE.Color(0xff2a9a).multiplyScalar(3), [0, 2, -9.5], [16, 3]);
  panel(new THREE.Color(0x19e6ff).multiplyScalar(2.5), [-9.5, 3, 0], [3, 12], [0, Math.PI / 2, 0]);
  panel(new THREE.Color(0x8a4dff).multiplyScalar(2.5), [9.5, 3, 0], [3, 12], [0, Math.PI / 2, 0]);
  panel(new THREE.Color(0xffffff).multiplyScalar(2.2), [0, 9.5, 0], [12, 2], [Math.PI / 2, 0, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.03).texture;
  pm.dispose();
  s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

function mountainGeometry(width, height, seed) {
  const segX = 90;
  const segY = 6;
  const g = new THREE.PlaneGeometry(width, 1, segX, segY);
  const pos = g.attributes.position;
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const peaks = [];
  for (let i = 0; i <= segX; i++) peaks.push(rnd());
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const v = pos.getY(i) + 0.5; // 0..1
    const u = x / width + 0.5;
    const col = Math.round(u * segX);
    const center = Math.abs(u - 0.5) * 2; // 0 at centre
    const envelope = Math.pow(THREE.MathUtils.smoothstep(center, 0.12, 0.75), 1.3);
    const ridge = (0.35 + 0.65 * peaks[col] * (0.6 + 0.4 * Math.sin(u * 23 + seed))) * envelope;
    pos.setY(i, v * ridge * height);
    pos.setZ(i, (rnd() - 0.5) * height * 0.15 * v);
  }
  g.computeVertexNormals();
  return g;
}

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05020c);
  const env = envMap(renderer);
  scene.environment = env;
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 3000);
  scene.add(new THREE.HemisphereLight(0x9a7dff, 0x14061f, 0.7));
  const key = new THREE.DirectionalLight(0xffe6f4, 1.4);
  key.position.set(-30, 60, 40);
  scene.add(key);

  // Reflection group: everything added here is mirrored under the floor.
  const reflection = new THREE.Group();
  reflection.scale.y = -1;
  scene.add(reflection);

  // Floor
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uHalf: { value: new THREE.Vector2(30, 20) },
      uShrink: { value: 0 },
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uFarZ: { value: -60 },
    },
    vertexShader: floorVert,
    fragmentShader: floorFrag,
    depthWrite: false,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = -10;
  scene.add(floor);

  // Backdrop
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uH: { value: 50 }, uSunC: { value: new THREE.Vector2() }, uSunR: { value: 20 }, uTime: { value: 0 }, uStarScale: { value: 3 },
    },
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    depthWrite: true,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMat);
  scene.add(sky);
  const mountainGroup = new THREE.Group();
  scene.add(mountainGroup);
  const mountainFill = new THREE.MeshBasicMaterial({ color: 0x07020f, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const mountainLine = new THREE.LineBasicMaterial({ color: new THREE.Color(0xff3cc8).multiplyScalar(1.3), transparent: true, opacity: 0.9 });
  const mountainLine2 = new THREE.LineBasicMaterial({ color: new THREE.Color(0x2ee6ff).multiplyScalar(1.2), transparent: true, opacity: 0.8 });

  // Arena boundary: a taller, white-cyan light wall.
  const boundary = new Trail(scene, reflection, new THREE.Color(0x3ff0ff).multiplyScalar(1.1), 8);
  boundary.mesh.scale.y = 1.25;
  boundary.refl.scale.y = 1.25;

  let W = 60;
  let H = 40;
  const base = { target: new THREE.Vector3(), dist: 80 };
  const cam = { target: new THREE.Vector3(), dist: 80, wantTarget: new THREE.Vector3(), wantDist: 80, shake: 0 };

  function placeCamera(target, dist) {
    camera.position.set(target.x, target.y + Math.sin(PITCH) * dist, target.z + Math.cos(PITCH) * dist);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  const tmp = new THREE.Vector3();
  function fitCamera() {
    const hw = W / 2 + 1;
    const hh = H / 2 + 1;
    const pts = [];
    for (const x of [-hw, hw]) for (const z of [-hh, hh]) for (const y of [0, 1.6]) pts.push(new THREE.Vector3(x, y, z));
    const target = new THREE.Vector3(0, 0, 0);
    let dist = Math.max(W, H) * 1.3;
    const top = 0.66;
    const bottom = -0.93;
    const side = 0.95;
    for (let it = 0; it < 60; it++) {
      placeCamera(target, dist);
      let minY = Infinity; let maxY = -Infinity; let maxX = 0;
      for (const p of pts) {
        tmp.copy(p).project(camera);
        minY = Math.min(minY, tmp.y); maxY = Math.max(maxY, tmp.y); maxX = Math.max(maxX, Math.abs(tmp.x));
      }
      const s = Math.max(maxX / side, (maxY - minY) / (top - bottom));
      dist *= 1 + (s - 1) * 0.6;
      const yc = (maxY + minY) / 2;
      target.z -= (yc - (top + bottom) / 2) * dist * 0.25;
    }
    base.target.copy(target);
    base.dist = dist;
    cam.target.copy(target); cam.wantTarget.copy(target);
    cam.dist = dist; cam.wantDist = dist;
    placeCamera(target, dist);
    layoutBackdrop();
  }

  function layoutBackdrop() {
    const zb = -H / 2 - Math.max(8, H * 0.22);
    // Where does the top edge of the view hit the backdrop plane?
    const ray = new THREE.Vector3(0, 1, 0.5).unproject(camera).sub(camera.position).normalize();
    const t = (zb - camera.position.z) / ray.z;
    const yTop = Math.max(10, camera.position.y + ray.y * t);
    const ray2 = new THREE.Vector3(1, 1, 0.5).unproject(camera).sub(camera.position).normalize();
    const t2 = (zb - camera.position.z) / ray2.z;
    const halfW = Math.abs(camera.position.x + ray2.x * t2) * 1.4 + 20;
    const hSky = yTop * 2.2;
    sky.scale.set(halfW * 2, hSky, 1);
    sky.position.set(0, hSky / 2 - 2, zb);
    skyMat.uniforms.uH.value = yTop * 1.05;
    skyMat.uniforms.uSunR.value = yTop * 0.42;
    skyMat.uniforms.uSunC.value.set(0, yTop * 0.36);
    skyMat.uniforms.uStarScale.value = Math.max(1.5, yTop / 14);
    floorMat.uniforms.uFarZ.value = zb;
    // mountains
    mountainGroup.children.slice().forEach((c) => { c.geometry.dispose(); c.removeFromParent(); });
    const mk = (width, height, z, seed, lineMat) => {
      const g = mountainGeometry(width, height, seed);
      const fill = new THREE.Mesh(g, mountainFill);
      fill.position.z = z;
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(g), lineMat);
      wire.position.z = z;
      mountainGroup.add(fill, wire);
    };
    mk(halfW * 2, yTop * 0.62, zb + 1.5, 7, mountainLine2);
    mk(halfW * 2.2, yTop * 0.42, zb + 4, 13, mountainLine);
  }

  function setArena(w, h) {
    W = w; H = h;
    floorMat.uniforms.uHalf.value.set(W / 2, H / 2);
    setShrink(0);
    fitCamera();
  }

  function setShrink(k) {
    floorMat.uniforms.uShrink.value = k;
    const x0 = -W / 2 + k; const x1 = W / 2 - k; const z0 = -H / 2 + k; const z1 = H / 2 - k;
    boundary.reset();
    boundary.start(x0, z0); boundary.close(x1, z0);
    boundary.start(x1, z0); boundary.close(x1, z1);
    boundary.start(x1, z1); boundary.close(x0, z1);
    boundary.start(x0, z1); boundary.close(x0, z0);
  }

  // Post-processing
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.95, 0.55, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let bloomBase = 0.95;
  let bloomKick = 0;

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // Frame loop with a simple dynamic-resolution governor for weak GPUs.
  const frameFns = new Set();
  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;
  let perfT = 0; let perfFrames = 0;
  const governor = !navigator.webdriver;
  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    for (const fn of frameFns) fn(dt, t);
    floorMat.uniforms.uTime.value = t;
    skyMat.uniforms.uTime.value = t;
    bloomKick = Math.max(0, bloomKick - dt * 2.2);
    bloom.strength = bloomBase + bloomKick;
    floorMat.uniforms.uPulse.value = Math.min(1, bloomKick);
    composer.render(dt);
    if (governor) {
      perfT += dt; perfFrames++;
      if (perfT > 2.5) {
        const fps = perfFrames / perfT;
        perfT = 0; perfFrames = 0;
        if (fps < 42 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); resize(); }
      }
    }
  }
  loop();

  return {
    renderer, scene, camera, reflection, cam, base, bloom,
    get W() { return W; }, get H() { return H; },
    setArena, setShrink,
    kick(v) { bloomKick = Math.min(1.6, bloomKick + v); },
    setBloom(v) { bloomBase = v; },
    placeCamera,
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      frameFns.clear();
      boundary.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose(); });
      });
      env.dispose();
      composer.dispose?.();
      bloom.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
