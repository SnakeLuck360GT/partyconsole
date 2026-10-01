// Environment building blocks for minigames: floating islands, animated lava / water seas, decoration scatter,
// clouds, and a normalised prop loader for the shared model library.
import { THREE, loadModel } from '../../../sdk/three-kit.js';

const NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
`;

/** Load a shared-library prop, scaled so its largest dimension (or height) equals `size`. */
export async function prop(s, path, { size = null, height = null, scale = 1, shadows = true, center = false } = {}) {
  const obj = await loadModel(s.env.sharedAsset(path), { castShadow: shadows, receiveShadow: true });
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const dim = b.getSize(new THREE.Vector3());
  let k = scale;
  if (height) k = height / Math.max(1e-3, dim.y);
  else if (size) k = size / Math.max(1e-3, dim.x, dim.y, dim.z);
  obj.scale.multiplyScalar(k);
  const wrap = new THREE.Group();
  wrap.add(obj);
  const c = b.getCenter(new THREE.Vector3());
  obj.position.set(center ? -c.x * k : 0, center ? -c.y * k : -b.min.y * k, center ? -c.z * k : 0);
  wrap.userData.size = dim.multiplyScalar(k);
  return wrap;
}

/** Load a prop once and return a factory producing clones (much cheaper than reloading). */
export async function propFactory(s, path, opts) {
  const base = await prop(s, path, opts);
  return () => {
    const c = base.clone(true);
    c.userData.size = base.userData.size;
    return c;
  };
}

/** Floating island: grassy top, earthy tapered sides. Returns group (top surface at y=0). */
export function island(s, { radius = 10, depth = 3, top = 0x6cc24a, side = 0x8a5a3b, rim = 0x4f9a36, segments = 48, shape = 'circle', size = null } = {}) {
  const g = new THREE.Group();
  const topMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: groundTexture(top, radius), roughness: 0.95 });
  const sideMat = new THREE.MeshStandardMaterial({ color: side, roughness: 1, flatShading: true });
  const rimMat = new THREE.MeshStandardMaterial({ color: rim, roughness: 0.9 });
  if (shape === 'circle') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.4, segments), topMat);
    cap.position.y = -0.2;
    cap.receiveShadow = true;
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.12, radius + 0.05, 0.5, segments), rimMat);
    lip.position.y = -0.45;
    const geo = new THREE.CylinderGeometry(radius * 0.98, radius * 0.35, depth, 14, 3);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < depth / 2 - 0.01) {
        const n = 0.82 + Math.random() * 0.3;
        pos.setX(i, pos.getX(i) * n);
        pos.setZ(i, pos.getZ(i) * n);
        pos.setY(i, y + (Math.random() - 0.5) * 0.4);
      }
    }
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, sideMat);
    rock.position.y = -0.6 - depth / 2;
    rock.castShadow = true;
    g.add(cap, lip, rock);
  } else {
    const [w, d] = size;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), topMat);
    cap.position.y = -0.2;
    cap.receiveShadow = true;
    const rock = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, depth, d * 0.96), sideMat);
    rock.position.y = -0.4 - depth / 2;
    g.add(cap, rock);
  }
  s.scene.add(g);
  return g;
}

/** Animated lava sea (glowing, flowing). */
export function lavaSea(s, { size = 200, y = -2 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 } },
    fog: false,
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float t; varying vec2 vUv; varying vec3 vW; ${NOISE}
      void main(){ vec2 p=vW.xz*0.16; float n=fbm(p+vec2(t*0.05,t*0.03)); float m=fbm(p*1.6-vec2(t*0.04,-t*0.02)+n*1.5);
        float vein=pow(1.0-abs(m*2.0-1.0), 5.0); float pool=smoothstep(0.55,0.75,n);
        vec3 crust=mix(vec3(0.16,0.04,0.03), vec3(0.32,0.08,0.03), fbm(p*4.0));
        vec3 hot=mix(vec3(1.0,0.36,0.04), vec3(1.0,0.78,0.25), vein*pool);
        float g=clamp(vein*0.9+pool*0.8,0.0,1.0);
        vec3 col=mix(crust, hot, g);
        float d=length(vW.xz); col*=mix(1.0,0.45,smoothstep(35.0,100.0,d));
        gl_FragColor=vec4(col,1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  s.scene.add(m);
  s.onFrame((dt, t) => { mat.uniforms.t.value = t; });
  return m;
}

/** Stylised animated water. */
export function waterSea(s, { size = 240, y = -1.5, deep = 0x1b6fb3, shallow = 0x49c6e5 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, deep: { value: new THREE.Color(deep) }, shallow: { value: new THREE.Color(shallow) } },
    fog: false,
    vertexShader: 'varying vec3 vW; uniform float t; void main(){ vec3 p=position; vec4 w=modelMatrix*vec4(p,1.0); w.y += sin(w.x*0.3+t*1.3)*0.12+cos(w.z*0.25+t)*0.12; vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float t; uniform vec3 deep; uniform vec3 shallow; varying vec3 vW; ${NOISE}
      void main(){ vec2 p=vW.xz*0.12; float n=fbm(p+vec2(t*0.04,t*0.02)); float f=smoothstep(0.62,0.7,fbm(p*2.5+n*1.5-t*0.05));
        float d=length(vW.xz); vec3 col=mix(shallow,deep,smoothstep(10.0,60.0,d)+n*0.3); col=mix(col,vec3(0.92,0.98,1.0),f*0.7);
        gl_FragColor=vec4(col,1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 60, 60), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  s.scene.add(m);
  s.onFrame((dt, t) => { mat.uniforms.t.value = t; });
  return m;
}

/** Scatter decoration props in an annulus around the arena. items: [{ path, count, size|height }] */
export async function scatter(s, items, { inner = 12, outer = 22, y = 0, avoid = null, seed = 1 } = {}) {
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  const group = new THREE.Group();
  const facs = await Promise.all(items.map((it) => propFactory(s, it.path, { size: it.size, height: it.height })));
  items.forEach((it, i) => {
    for (let k = 0; k < it.count; k++) {
      const o = facs[i]();
      const a = rnd() * Math.PI * 2;
      const d = (it.inner ?? inner) + rnd() * ((it.outer ?? outer) - (it.inner ?? inner));
      o.position.set(Math.cos(a) * d, it.y ?? y, Math.sin(a) * d);
      if (avoid && avoid(o.position)) continue;
      o.rotation.y = rnd() * Math.PI * 2;
      o.scale.multiplyScalar(0.75 + rnd() * 0.5);
      group.add(o);
    }
  });
  s.scene.add(group);
  return group;
}

/** Slowly drifting clouds (shared library). */
export async function clouds(s, { count = 6, radius = 50, y = 10, spread = 8 } = {}) {
  const facs = await Promise.all(['nature/q-cloud-1.glb', 'nature/q-cloud-2.glb', 'nature/q-cloud-3.glb'].map((p) => propFactory(s, p, { size: 8, shadows: false })));
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const c = facs[i % 3]();
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const d = radius * (0.7 + Math.random() * 0.5);
    c.position.set(Math.cos(a) * d, y + Math.random() * spread, Math.sin(a) * d);
    c.scale.multiplyScalar(0.8 + Math.random() * 1.2);
    c.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    g.add(c);
  }
  s.scene.add(g);
  s.onFrame((dt) => { g.rotation.y += dt * 0.01; });
  return g;
}

/** Glowing emissive material helper. */
export function glowMat(color, intensity = 1.5) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

/** Shadow blob decal (cheap soft circle) for props hovering in the air. */
let blobTex = null;
export function blobShadow(size = 1, opacity = 0.35) {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/** Make metallic gold props read as rich yellow gold under our lighting. */
export function goldify(obj, { color = 0xffc21a, emissive = 0x4a2a00 } = {}) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map((m) => {
      if (!/gold/i.test(m.name)) return m;
      const c = m.clone();
      c.color.set(/dark/i.test(m.name) ? 0xd98a00 : color);
      c.metalness = 0.35; c.roughness = 0.3;
      if (c.emissive) c.emissive.set(emissive);
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  return obj;
}

/** Falling snow (GPU-animated points). */
export function snow(s, { count = 500, area = 40, height = 20, color = 0xffffff, size = 0.18, speed = 1.6 } = {}) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { p[i * 3] = (Math.random() - 0.5) * area; p[i * 3 + 1] = Math.random() * height; p[i * 3 + 2] = (Math.random() - 0.5) * area; }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { t: { value: 0 }, h: { value: height }, c: { value: new THREE.Color(color) }, sz: { value: size }, sp: { value: speed } },
    vertexShader: `uniform float t; uniform float h; uniform float sz; uniform float sp; void main(){ vec3 q=position; q.y=mod(q.y - t*sp, h) - 2.0; q.x += sin(t*0.7+position.z)*0.6; q.z += cos(t*0.5+position.x)*0.6;
      vec4 mv=modelViewMatrix*vec4(q,1.0); gl_Position=projectionMatrix*mv; gl_PointSize = sz*600.0/ -mv.z; }`,
    fragmentShader: 'uniform vec3 c; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(c, smoothstep(0.5,0.2,d)*0.9); }',
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  s.scene.add(pts);
  s.onFrame((dt, t) => { mat.uniforms.t.value = t; });
  return pts;
}

/** Soft blotchy ground texture in shades of `color` (grass, stone, sand). */
export function groundTexture(color, radius = 10, { size = 512, blotches = 260, variance = 0.12 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const base = new THREE.Color(color);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, size, size);
  const hsl = {};
  base.getHSL(hsl);
  for (let i = 0; i < blotches; i++) {
    const col = new THREE.Color().setHSL(hsl.h + (Math.random() - 0.5) * 0.03, hsl.s, THREE.MathUtils.clamp(hsl.l + (Math.random() - 0.5) * variance * 2, 0, 1));
    g.fillStyle = `#${col.getHexString()}`;
    g.globalAlpha = 0.25 + Math.random() * 0.3;
    const r = 6 + Math.random() * 26;
    g.beginPath();
    g.ellipse(Math.random() * size, Math.random() * size, r, r * (0.5 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, radius / 5), Math.max(1, radius / 5));
  tex.anisotropy = 4;
  return tex;
}
