// Pooled visual effects: additive point particles, instanced debris chunks, shockwave rings,
// light flashes. Nothing is allocated per frame.
import * as THREE from 'three';

const tmpC = new THREE.Color();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

let glowTexCache = null;
export function glowTexture() {
  if (glowTexCache) return glowTexCache;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTexCache = new THREE.CanvasTexture(c);
  return glowTexCache;
}

export function createFx(scene, renderer, camera) {
  // ---------------------------------------------------------------- particles
  const N = 5000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const maxLife = new Float32Array(N);
  const drag = new Float32Array(N);
  const s0 = new Float32Array(N);
  const s1 = new Float32Array(N);
  const baseCol = new Float32Array(N * 3);
  let head = 0;
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  const aAlpha = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('aColor', aCol);
  geo.setAttribute('aSize', aSize);
  geo.setAttribute('aAlpha', aAlpha);
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 } },
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale;
      varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vC = aColor; vA = aAlpha;
        gl_PointSize = aAlpha <= 0.0 ? 0.0 : aSize * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a;
        if (a * vA < 0.003) discard; gl_FragColor = vec4(vC * a * vA, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  /** Emit one particle. color: THREE.Color or hex. intensity >1 = blooms. */
  function emit(x, y, z, vx, vy, vz, color, { life: l = 0.6, size: sz = 0.6, sizeEnd = 0, drag: d = 1.5, intensity = 1.5 } = {}) {
    const i = head;
    head = (head + 1) % N;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    if (typeof color === 'number') tmpC.setHex(color); else tmpC.copy(color);
    baseCol[i * 3] = tmpC.r * intensity; baseCol[i * 3 + 1] = tmpC.g * intensity; baseCol[i * 3 + 2] = tmpC.b * intensity;
    life[i] = l; maxLife[i] = l; drag[i] = d; s0[i] = sz; s1[i] = sizeEnd;
    alpha[i] = 1;
  }

  function burst(x, z, color, n, { speed = 8, life: l = 0.7, size: sz = 0.7, y = 0.3, spread = 1, intensity = 2, up = 0 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.25 + Math.random() * 0.75) * spread;
      emit(x, y, z, Math.cos(a) * s, (Math.random() - 0.3) * s * 0.4 + up, Math.sin(a) * s, color,
        { life: l * (0.5 + Math.random() * 0.7), size: sz * (0.6 + Math.random() * 0.8), drag: 2.2, intensity });
    }
  }

  // ---------------------------------------------------------------- debris
  const DN = 320;
  const debrisGeo = new THREE.DodecahedronGeometry(0.22, 0);
  const debrisMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.6, flatShading: true, emissive: 0xff6a20, emissiveIntensity: 0 });
  const debris = new THREE.InstancedMesh(debrisGeo, debrisMat, DN);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.frustumCulled = false;
  const dPos = new Float32Array(DN * 3);
  const dVel = new Float32Array(DN * 3);
  const dRot = new Float32Array(DN * 3);
  const dSpin = new Float32Array(DN * 3);
  const dLife = new Float32Array(DN);
  const dMax = new Float32Array(DN);
  const dScale = new Float32Array(DN * 3);
  const dHot = new Uint8Array(DN);
  let dHead = 0;
  for (let i = 0; i < DN; i++) {
    debris.setMatrixAt(i, tmpM.makeScale(0, 0, 0));
    debris.setColorAt(i, tmpC.set(0xffffff));
  }
  scene.add(debris);

  function chunks(x, z, color, n, { speed = 9, scale = 1, life: l = 1.6 } = {}) {
    for (let k = 0; k < n; k++) {
      const i = dHead;
      dHead = (dHead + 1) % DN;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.8);
      dPos[i * 3] = x; dPos[i * 3 + 1] = 0.3; dPos[i * 3 + 2] = z;
      dVel[i * 3] = Math.cos(a) * s; dVel[i * 3 + 1] = (Math.random() - 0.2) * s * 0.5; dVel[i * 3 + 2] = Math.sin(a) * s;
      dRot[i * 3] = Math.random() * 6; dRot[i * 3 + 1] = Math.random() * 6; dRot[i * 3 + 2] = Math.random() * 6;
      dSpin[i * 3] = (Math.random() - 0.5) * 14; dSpin[i * 3 + 1] = (Math.random() - 0.5) * 14; dSpin[i * 3 + 2] = (Math.random() - 0.5) * 14;
      const sc = scale * (0.5 + Math.random() * 1.1);
      dScale[i * 3] = sc * (0.6 + Math.random() * 0.8); dScale[i * 3 + 1] = sc * (0.4 + Math.random() * 0.5); dScale[i * 3 + 2] = sc * (0.8 + Math.random() * 0.9);
      dLife[i] = l * (0.6 + Math.random() * 0.6); dMax[i] = dLife[i];
      dHot[i] = Math.random() < 0.35 ? 1 : 0;
      const c = Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color;
      debris.setColorAt(i, dHot[i] ? tmpC.set(0xffb070) : tmpC.set(c));
    }
    debris.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- shockwave rings
  const ringGeo = new THREE.RingGeometry(0.82, 1, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.visible = false;
    m.renderOrder = 6;
    scene.add(m);
    rings.push({ mesh: m, t: 0, dur: 0.5, r0: 0.5, r1: 5, color: new THREE.Color() });
  }
  let ringHead = 0;
  function shockwave(x, z, color, { radius = 6, dur = 0.55, intensity = 2.5, y = 0.15 } = {}) {
    const r = rings[ringHead];
    ringHead = (ringHead + 1) % rings.length;
    r.mesh.position.set(x, y, z);
    r.t = 0; r.dur = dur; r.r1 = radius; r.r0 = radius * 0.1;
    r.color.set(color).multiplyScalar(intensity);
    r.mesh.visible = true;
  }

  // ---------------------------------------------------------------- flashes (sprites + a few pooled lights)
  const flashMatBase = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  const flashes = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(flashMatBase.clone());
    s.visible = false;
    s.renderOrder = 7;
    scene.add(s);
    flashes.push({ sprite: s, t: 0, dur: 0.3, size: 6, color: new THREE.Color() });
  }
  let flashHead = 0;
  const lights = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 30, 1.6);
    l.position.y = 3;
    scene.add(l);
    lights.push({ light: l, t: 1, dur: 0.4, peak: 0 });
  }
  let lightHead = 0;
  function flash(x, z, color, { size: sz = 8, dur = 0.35, intensity = 3, light = true, y = 0.8 } = {}) {
    const f = flashes[flashHead];
    flashHead = (flashHead + 1) % flashes.length;
    f.sprite.position.set(x, y, z);
    f.t = 0; f.dur = dur; f.size = sz;
    f.color.set(color).multiplyScalar(intensity);
    f.sprite.visible = true;
    if (light) {
      const L = lights[lightHead];
      lightHead = (lightHead + 1) % lights.length;
      L.light.position.set(x, 3, z);
      L.light.color.set(color);
      L.t = 0; L.dur = dur * 1.5; L.peak = 60 * intensity;
    }
  }

  // ---------------------------------------------------------------- composite
  function explosion(x, z, color, { big = 1 } = {}) {
    flash(x, z, 0xfff0d0, { size: 10 * big, dur: 0.3, intensity: 3.5 });
    flash(x, z, color, { size: 16 * big, dur: 0.6, intensity: 1.6, light: false });
    shockwave(x, z, color, { radius: 7 * big, dur: 0.55 });
    shockwave(x, z, 0xffffff, { radius: 4 * big, dur: 0.35, intensity: 2 });
    burst(x, z, 0xffc070, 40 * big, { speed: 14, life: 0.7, size: 1.1, intensity: 2.5 });
    burst(x, z, color, 30 * big, { speed: 10, life: 1.0, size: 0.9, intensity: 2 });
    burst(x, z, 0x6a6a7a, 16 * big, { speed: 4, life: 1.6, size: 2.2, intensity: 0.35 }); // smoke
  }

  function update(dt) {
    pMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      life[i] -= dt;
      const k = Math.max(0, life[i] / maxLife[i]);
      const damp = Math.exp(-drag[i] * dt);
      vel[i * 3] *= damp; vel[i * 3 + 1] *= damp; vel[i * 3 + 2] *= damp;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] = s1[i] + (s0[i] - s1[i]) * k;
      alpha[i] = life[i] > 0 ? Math.min(1, k * 1.6) : 0;
      col[i * 3] = baseCol[i * 3]; col[i * 3 + 1] = baseCol[i * 3 + 1]; col[i * 3 + 2] = baseCol[i * 3 + 2];
    }
    aPos.needsUpdate = true; aCol.needsUpdate = true; aSize.needsUpdate = true; aAlpha.needsUpdate = true;

    let anyDebris = false;
    for (let i = 0; i < DN; i++) {
      if (dLife[i] <= 0) continue;
      anyDebris = true;
      dLife[i] -= dt;
      const damp = Math.exp(-1.2 * dt);
      dVel[i * 3] *= damp; dVel[i * 3 + 2] *= damp; dVel[i * 3 + 1] = dVel[i * 3 + 1] * damp - 3 * dt;
      dPos[i * 3] += dVel[i * 3] * dt; dPos[i * 3 + 1] += dVel[i * 3 + 1] * dt; dPos[i * 3 + 2] += dVel[i * 3 + 2] * dt;
      dRot[i * 3] += dSpin[i * 3] * dt; dRot[i * 3 + 1] += dSpin[i * 3 + 1] * dt; dRot[i * 3 + 2] += dSpin[i * 3 + 2] * dt;
      const k = dLife[i] <= 0 ? 0 : Math.min(1, dLife[i] / (dMax[i] * 0.35));
      tmpE.set(dRot[i * 3], dRot[i * 3 + 1], dRot[i * 3 + 2]);
      tmpQ.setFromEuler(tmpE);
      tmpS.set(dScale[i * 3] * k, dScale[i * 3 + 1] * k, dScale[i * 3 + 2] * k);
      tmpP.set(dPos[i * 3], dPos[i * 3 + 1], dPos[i * 3 + 2]);
      debris.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
      // hot chunks leave little ember trails
      if (dHot[i] && Math.random() < 0.5 && dLife[i] > 0.2) emit(tmpP.x, tmpP.y, tmpP.z, 0, 0.2, 0, 0xff8a3a, { life: 0.35, size: 0.35, intensity: 2.2, drag: 1 });
    }
    if (anyDebris) debris.instanceMatrix.needsUpdate = true;

    for (const r of rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.mesh.visible = false; continue; }
      const e = 1 - (1 - k) ** 3;
      const s = r.r0 + (r.r1 - r.r0) * e;
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.color.copy(r.color).multiplyScalar((1 - k) ** 1.5);
      r.mesh.material.opacity = 1;
    }
    for (const f of flashes) {
      if (!f.sprite.visible) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) { f.sprite.visible = false; continue; }
      const s = f.size * (0.6 + 0.4 * k);
      f.sprite.scale.set(s, s, 1);
      f.sprite.material.color.copy(f.color).multiplyScalar((1 - k) ** 2);
    }
    for (const L of lights) {
      if (L.t >= L.dur) { L.light.intensity = 0; continue; }
      L.t += dt;
      L.light.intensity = L.peak * Math.max(0, 1 - L.t / L.dur) ** 2;
    }
  }

  function clear() {
    life.fill(0);
    alpha.fill(0);
    dLife.fill(0);
    for (let i = 0; i < DN; i++) debris.setMatrixAt(i, tmpM.makeScale(0, 0, 0));
    debris.instanceMatrix.needsUpdate = true;
    rings.forEach((r) => { r.mesh.visible = false; });
    flashes.forEach((f) => { f.sprite.visible = false; });
    lights.forEach((L) => { L.light.intensity = 0; L.t = L.dur; });
  }

  return { emit, burst, chunks, shockwave, flash, explosion, update, clear };
}
