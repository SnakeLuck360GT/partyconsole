// Deep-space backdrop: procedural nebula (fbm shader), three parallax star layers that twinkle,
// a lit gas-giant planet with an atmosphere shell + rings, and a faint holographic arena grid.
import * as THREE from 'three';

const NOISE = /* glsl */`
  float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
  float fbm(vec2 p){ float v=0.0, a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ v+=a*noise(p); p=m*p; a*=0.5; } return v; }
`;

export function createBackdrop(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ---------------------------------------------------------------- nebula
  const nebulaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uA: { value: new THREE.Color(0x3b1a78) },
      uB: { value: new THREE.Color(0x0d5a8a) },
      uC: { value: new THREE.Color(0xc2386b) },
      uSeed: { value: 3.1 },
    },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uA, uB, uC; uniform float uSeed; varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 p = (vUv - 0.5) * vec2(5.0, 3.2) + uSeed;
        float t = uTime * 0.012;
        vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
        vec2 r = vec2(fbm(p + 3.0*q + vec2(1.7, 9.2)), fbm(p + 3.0*q + vec2(8.3, 2.8)));
        float f = fbm(p + 2.5*r);
        vec3 col = mix(uA, uB, clamp(f*f*2.2, 0.0, 1.0));
        col = mix(col, uC, clamp(length(q)*0.9 - 0.35, 0.0, 1.0) * 0.8);
        float dens = smoothstep(0.25, 0.95, f) ;
        // dark dust lanes
        float dust = smoothstep(0.45, 0.75, fbm(p*1.7 - r*1.3 + 11.0));
        col *= dens * 1.25 * (1.0 - dust*0.7);
        col += uC * pow(max(f - 0.6, 0.0), 2.0) * 1.6;
        // vignette so the edges fall into black
        vec2 v = vUv - 0.5; col *= 1.0 - smoothstep(0.25, 0.72, length(v*vec2(1.0,1.3)));
        gl_FragColor = vec4(col * 0.55, 1.0);
      }`,
    depthWrite: false,
  });
  const nebula = new THREE.Mesh(new THREE.PlaneGeometry(900, 560), nebulaMat);
  nebula.rotation.x = -Math.PI / 2;
  nebula.position.y = -220;
  nebula.renderOrder = -10;
  group.add(nebula);

  // ---------------------------------------------------------------- stars
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aPhase; attribute vec3 aColor;
      uniform float uTime; uniform float uScale; varying vec3 vColor; varying float vTw;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vTw = 0.65 + 0.35 * sin(uTime * (1.2 + aPhase) + aPhase * 17.0);
        vColor = aColor;
        gl_PointSize = max(1.5, aSize * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vTw;
      void main(){
        vec2 d = gl_PointCoord - 0.5; float r = length(d);
        float core = smoothstep(0.5, 0.0, r);
        float a = pow(core, 2.2);
        // tiny cross flare
        float cross = max(0.0, 1.0 - abs(d.x)*14.0) * max(0.0, 1.0 - abs(d.y)*2.2) + max(0.0, 1.0 - abs(d.y)*14.0) * max(0.0, 1.0 - abs(d.x)*2.2);
        a = a + cross * 0.25;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * vTw * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const starColors = [new THREE.Color(0xffffff), new THREE.Color(0xbcd4ff), new THREE.Color(0xfff0d0), new THREE.Color(0xffc9e8), new THREE.Color(0xa8f0ff)];
  function starLayer(count, depth, spreadX, spreadZ, size, bright) {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const ph = new Float32Array(count);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spreadX;
      pos[i * 3 + 1] = depth + (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spreadZ;
      const big = Math.random() < 0.06;
      sz[i] = size * (big ? 2.6 : 0.6 + Math.random() * 0.8);
      ph[i] = Math.random() * 3;
      const c = starColors[Math.floor(Math.random() * starColors.length)];
      const b = bright * (big ? 2.2 : 0.5 + Math.random() * 0.7);
      col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, starMat);
    pts.frustumCulled = false;
    pts.renderOrder = -9;
    group.add(pts);
    return pts;
  }
  starLayer(1400, -200, 800, 500, 1.0, 0.9);
  starLayer(700, -110, 480, 300, 0.75, 1.0);
  starLayer(260, -45, 260, 170, 0.55, 1.2);

  // ---------------------------------------------------------------- planet
  const planetTex = makePlanetTexture();
  const planet = new THREE.Group();
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(30, 64, 48),
    new THREE.MeshStandardMaterial({ map: planetTex, roughness: 0.85, metalness: 0.0 }),
  );
  planet.add(globe);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x6fb6ff) }, uSun: { value: new THREE.Vector3(-0.6, 0.6, 0.5).normalize() } },
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); vW = normalize((modelMatrix*vec4(normal,0.0)).xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ float f = 1.0 - abs(dot(vN, vV)); float lit = clamp(dot(vW, uSun)*0.8+0.4, 0.05, 1.0);
        float a = pow(f, 2.6) * lit; gl_FragColor = vec4(uColor * a * 2.2, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(31.8, 48, 32), atmoMat);
  planet.add(atmo);
  const ringMat = new THREE.MeshStandardMaterial({ map: makeRingTexture(), transparent: true, side: THREE.DoubleSide, roughness: 1, depthWrite: false, opacity: 0.85 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(38, 58, 128, 1), ringMat);
  fixRingUV(ring.geometry, 38, 58);
  ring.rotation.x = -Math.PI / 2 + 0.35;
  ring.rotation.y = 0.25;
  planet.add(ring);
  planet.position.set(95, -130, -40);
  planet.rotation.z = 0.3;
  group.add(planet);

  // Planet sun light (only affects the planet visually since it's far away anyway).
  const planetSun = new THREE.DirectionalLight(0xffe2c0, 2.4);
  planetSun.position.set(40, -60, 40);
  planetSun.target = planet;
  group.add(planetSun);

  // ---------------------------------------------------------------- arena grid + border
  const gridMat = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: new THREE.Vector2(40, 22) }, uColor: { value: new THREE.Color(0x4fc3ff) }, uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vP; uniform vec2 uSize; void main(){ vP = (uv - 0.5) * uSize; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`uniform vec2 uSize; uniform vec3 uColor; uniform float uTime; varying vec2 vP;
      float line(float x, float w){ float d = abs(fract(x) - 0.5); return smoothstep(0.5 - w, 0.5, d); }
      void main(){
        vec2 g = vP / 3.0;
        float l = max(line(g.x, 0.02), line(g.y, 0.02));
        vec2 e = uSize*0.5 - abs(vP);
        float edge = min(e.x, e.y);
        float fadeIn = smoothstep(0.0, 6.0, edge);
        float pulse = 0.5 + 0.5 * sin(length(vP) * 0.35 - uTime * 1.2);
        float a = l * (0.05 + 0.05 * pulse) * (1.0 - fadeIn * 0.45);
        // soft inner glow along the border
        a += exp(-edge * 0.9) * 0.25;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -0.6;
  grid.renderOrder = -5;
  scene.add(grid);

  // Glowing border rails (HDR emissive so bloom picks them up).
  const railMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4fc3ff).multiplyScalar(2.2), toneMapped: false });
  const railGeo = new THREE.BoxGeometry(1, 0.18, 0.18);
  const rails = [];
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(railGeo, railMat); scene.add(m); rails.push(m); }
  const postGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.2, 8);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2b3142, metalness: 0.8, roughness: 0.3, emissive: 0x4fc3ff, emissiveIntensity: 0.6 });
  const posts = [];
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(postGeo, postMat); scene.add(m); posts.push(m); }

  function setArena(W, H) {
    grid.scale.set(W + 1, H + 1, 1);
    gridMat.uniforms.uSize.value.set(W + 1, H + 1);
    const hw = W / 2 + 0.3;
    const hh = H / 2 + 0.3;
    rails[0].position.set(0, 0, -hh); rails[0].scale.set(W + 0.6, 1, 1);
    rails[1].position.set(0, 0, hh); rails[1].scale.set(W + 0.6, 1, 1);
    rails[2].position.set(-hw, 0, 0); rails[2].scale.set(H + 0.6, 1, 1); rails[2].rotation.y = Math.PI / 2;
    rails[3].position.set(hw, 0, 0); rails[3].scale.set(H + 0.6, 1, 1); rails[3].rotation.y = Math.PI / 2;
    posts[0].position.set(-hw, 0, -hh); posts[1].position.set(hw, 0, -hh);
    posts[2].position.set(-hw, 0, hh); posts[3].position.set(hw, 0, hh);
  }

  function setTheme(theme) {
    nebulaMat.uniforms.uA.value.set(theme.nebula[0]);
    nebulaMat.uniforms.uB.value.set(theme.nebula[1]);
    nebulaMat.uniforms.uC.value.set(theme.nebula[2]);
    nebulaMat.uniforms.uSeed.value = theme.seed;
    gridMat.uniforms.uColor.value.set(theme.accent);
    railMat.color.set(theme.accent).multiplyScalar(2.2);
    postMat.emissive.set(theme.accent);
    atmoMat.uniforms.uColor.value.set(theme.atmo || 0x6fb6ff);
    planet.position.set(theme.planet?.[0] ?? 95, -130, theme.planet?.[1] ?? -40);
  }

  function update(dt, t, renderer, camera) {
    nebulaMat.uniforms.uTime.value = t;
    starMat.uniforms.uTime.value = t;
    starMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    gridMat.uniforms.uTime.value = t;
    globe.rotation.y += dt * 0.02;
  }

  return {
    group, setArena, setTheme, update,
    dispose() { planetTex.dispose(); ringMat.map.dispose(); scene.remove(grid, ...rails, ...posts); },
  };
}

function fixRingUV(geo, inner, outer) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
}

function makeRingTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 4;
  const g = c.getContext('2d');
  for (let x = 0; x < 512; x++) {
    const t = x / 512;
    const band = 0.5 + 0.5 * Math.sin(t * 60) * Math.sin(t * 13 + 1);
    const a = (0.25 + 0.6 * band) * Math.sin(t * Math.PI) * (t > 0.62 && t < 0.66 ? 0.1 : 1);
    g.fillStyle = `rgba(${210 + band * 40 | 0},${180 + band * 40 | 0},${160 + band * 30 | 0},${a.toFixed(3)})`;
    g.fillRect(x, 0, 1, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePlanetTexture() {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // Banded gas giant: layered sine bands with turbulence.
  const img = g.createImageData(W, H);
  const pal = [[52, 38, 92], [120, 70, 140], [214, 132, 110], [240, 196, 150], [150, 96, 150], [70, 60, 130]];
  const rnd = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      const turb = Math.sin(u * Math.PI * 8 + v * 30) * 0.012 + Math.sin(u * Math.PI * 22 + v * 70) * 0.006;
      let b = (v + turb) * 9 + Math.sin(v * 40) * 0.25;
      b = ((b % pal.length) + pal.length) % pal.length;
      const i0 = Math.floor(b);
      const f = b - i0;
      const a = pal[i0];
      const bb = pal[(i0 + 1) % pal.length];
      const k = f * f * (3 - 2 * f);
      const n = (rnd(Math.floor(u * 200) + Math.floor(v * 100) * 311) - 0.5) * 10;
      const idx = (y * W + x) * 4;
      img.data[idx] = a[0] + (bb[0] - a[0]) * k + n;
      img.data[idx + 1] = a[1] + (bb[1] - a[1]) * k + n;
      img.data[idx + 2] = a[2] + (bb[2] - a[2]) * k + n;
      img.data[idx + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // A great storm.
  const grd = g.createRadialGradient(W * 0.3, H * 0.62, 2, W * 0.3, H * 0.62, 38);
  grd.addColorStop(0, 'rgba(255,220,190,0.9)');
  grd.addColorStop(0.5, 'rgba(220,120,100,0.6)');
  grd.addColorStop(1, 'rgba(220,120,100,0)');
  g.fillStyle = grd;
  g.save(); g.translate(W * 0.3, H * 0.62); g.scale(2.2, 1); g.translate(-W * 0.3, -H * 0.62);
  g.beginPath(); g.arc(W * 0.3, H * 0.62, 38, 0, Math.PI * 2); g.fill(); g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
