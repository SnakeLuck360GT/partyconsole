// Capped particle systems: glowing sparks (one Points draw call), shards (one InstancedMesh) and
// shockwave rings (small pool). Nothing is allocated per frame.
import * as THREE from 'three';

const MAX_SPARKS = 5000;
const MAX_SHARDS = 600;
const MAX_RINGS = 12;

const sparkVert = /* glsl */`
  attribute vec3 aColor;
  attribute float aSize;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const sparkFrag = /* glsl */`
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(d));
    if (a <= 0.0) discard;
    gl_FragColor = vec4(vColor * a * a, 1.0);
  }`;

export function createFx(scene) {
  // ---------------------------------------------------------------- sparks
  const pos = new Float32Array(MAX_SPARKS * 3);
  const col = new Float32Array(MAX_SPARKS * 3);
  const size = new Float32Array(MAX_SPARKS);
  const vel = new Float32Array(MAX_SPARKS * 3);
  const life = new Float32Array(MAX_SPARKS);
  const maxLife = new Float32Array(MAX_SPARKS);
  const baseCol = new Float32Array(MAX_SPARKS * 3);
  const baseSize = new Float32Array(MAX_SPARKS);
  const drag = new Float32Array(MAX_SPARKS);
  const grav = new Float32Array(MAX_SPARKS);
  let cursor = 0;
  let live = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 300 } },
    vertexShader: sparkVert,
    fragmentShader: sparkFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, sparkMat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  function spark(x, y, z, vx, vy, vz, color, s = 1, l = 1, g = 1, dr = 1.5) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_SPARKS;
    if (life[i] <= 0) live++;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    baseCol[i * 3] = color.r; baseCol[i * 3 + 1] = color.g; baseCol[i * 3 + 2] = color.b;
    baseSize[i] = s;
    life[i] = l; maxLife[i] = l;
    grav[i] = g; drag[i] = dr;
  }

  // ---------------------------------------------------------------- shards
  const shardGeo = new THREE.TetrahedronGeometry(0.16);
  shardGeo.scale(1, 0.35, 2.2);
  const shardMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, MAX_SHARDS);
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shards.setColorAt(0, new THREE.Color());
  shards.frustumCulled = false;
  shards.count = 0;
  scene.add(shards);
  const sh = Array.from({ length: MAX_SHARDS }, () => ({
    p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), life: 0, max: 1, c: new THREE.Color(), s: 1,
  }));
  let shardCursor = 0;

  // ---------------------------------------------------------------- rings
  const ringGeo = new THREE.RingGeometry(0.85, 1, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: MAX_RINGS }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.visible = false;
    m.position.y = 0.05;
    m.renderOrder = 4;
    scene.add(m);
    return { m, t: 0, dur: 1, max: 6, color: new THREE.Color() };
  });
  let ringCursor = 0;

  function ring(x, z, color, max = 8, dur = 0.7) {
    const r = rings[ringCursor];
    ringCursor = (ringCursor + 1) % MAX_RINGS;
    r.m.position.x = x; r.m.position.z = z;
    r.t = 0; r.dur = dur; r.max = max;
    r.color.copy(color);
    r.m.visible = true;
  }

  const tmpC = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  const mtx = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const sc = new THREE.Vector3();
  const dq = new THREE.Quaternion();
  const eu = new THREE.Euler();

  /** Big crash: shards + sparks + shockwave. `color` is a THREE.Color (linear). */
  function explode(x, z, color, { scale = 1, dirX = 0, dirZ = 0 } = {}) {
    const hot = color.clone().multiplyScalar(4);
    const nSpark = Math.round(170 * scale);
    for (let i = 0; i < nSpark; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 11) * (0.6 + 0.4 * scale);
      const up = Math.random() * 9;
      const c = Math.random() < 0.2 ? tmpC.copy(white).multiplyScalar(3) : hot;
      spark(x, 0.5 + Math.random() * 0.5, z, Math.cos(a) * sp - dirX * 3, up, Math.sin(a) * sp - dirZ * 3, c, 0.45 + Math.random() * 0.6, 0.6 + Math.random() * 1.0, 14, 1.8);
    }
    const nShard = Math.round(34 * scale);
    for (let i = 0; i < nShard; i++) {
      const s = sh[shardCursor];
      shardCursor = (shardCursor + 1) % MAX_SHARDS;
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 8;
      s.p.set(x + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6);
      s.v.set(Math.cos(a) * sp - dirX * 2, 4 + Math.random() * 9, Math.sin(a) * sp - dirZ * 2);
      s.q.setFromEuler(eu.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      s.w.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
      s.life = s.max = 1.4 + Math.random() * 1.2;
      s.c.copy(color).multiplyScalar(Math.random() < 0.25 ? 1.2 : 3.5);
      s.s = 0.6 + Math.random() * 1.1;
    }
    ring(x, z, color.clone().multiplyScalar(3), 9 * Math.max(0.7, scale), 0.7);
    ring(x, z, white.clone().multiplyScalar(2), 5 * Math.max(0.7, scale), 0.45);
  }

  /** Small burst of sparks (pickup, turn, etc.). */
  function burst(x, y, z, color, n = 30, speed = 5, lifeT = 0.6, s = 0.5) {
    const c = color.clone().multiplyScalar(3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.7);
      spark(x, y, z, Math.cos(a) * sp, Math.random() * speed, Math.sin(a) * sp, c, s * (0.6 + Math.random() * 0.8), lifeT * (0.6 + Math.random() * 0.8), 6, 2.5);
    }
  }

  /** Rising embers along a derezzing trail. points: [[x,z],...] */
  function derez(points, color) {
    const c = color.clone().multiplyScalar(2.5);
    for (const [x, z] of points) {
      spark(x + (Math.random() - 0.5) * 0.3, Math.random() * 1.1, z + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.2, c, 0.35 + Math.random() * 0.4, 0.8 + Math.random() * 0.7, -1, 1.2);
    }
  }

  function update(dt, camera, viewportH) {
    sparkMat.uniforms.uScale.value = (viewportH * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    if (live > 0) {
      let alive = 0;
      for (let i = 0; i < MAX_SPARKS; i++) {
        if (life[i] <= 0) { if (size[i] !== 0) size[i] = 0; continue; }
        life[i] -= dt;
        if (life[i] <= 0) { size[i] = 0; continue; }
        alive++;
        const k = Math.exp(-drag[i] * dt);
        vel[i * 3] *= k; vel[i * 3 + 2] *= k;
        vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav[i] * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.02 && vel[i * 3 + 1] < 0) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.35; vel[i * 3] *= 0.7; vel[i * 3 + 2] *= 0.7; }
        const f = life[i] / maxLife[i];
        const fade = f * f;
        col[i * 3] = baseCol[i * 3] * fade; col[i * 3 + 1] = baseCol[i * 3 + 1] * fade; col[i * 3 + 2] = baseCol[i * 3 + 2] * fade;
        size[i] = baseSize[i] * (0.4 + 0.6 * f);
      }
      live = alive;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    }

    let n = 0;
    for (let i = 0; i < MAX_SHARDS; i++) {
      const s = sh[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) continue;
      s.v.y -= 22 * dt;
      s.v.multiplyScalar(Math.exp(-0.8 * dt));
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.05) { s.p.y = 0.05; s.v.y *= -0.4; s.v.x *= 0.6; s.v.z *= 0.6; s.w.multiplyScalar(0.6); }
      dq.setFromEuler(eu.set(s.w.x * dt, s.w.y * dt, s.w.z * dt));
      s.q.multiply(dq);
      const f = Math.min(1, s.life / s.max * 1.6);
      sc.copy(one).multiplyScalar(s.s * f);
      mtx.compose(s.p, s.q, sc);
      shards.setMatrixAt(n, mtx);
      shards.setColorAt(n, tmpC.copy(s.c).multiplyScalar(f));
      n++;
    }
    shards.count = n;
    if (n) {
      shards.instanceMatrix.needsUpdate = true;
      shards.instanceColor.needsUpdate = true;
    }

    for (const r of rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const f = r.t / r.dur;
      if (f >= 1) { r.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - f, 3);
      r.m.scale.setScalar(0.3 + e * r.max);
      r.m.material.color.copy(r.color).multiplyScalar(1 - f);
    }
  }

  function clear() {
    life.fill(0); size.fill(0); live = 0;
    geo.attributes.aSize.needsUpdate = true;
    sh.forEach((s) => { s.life = 0; });
    shards.count = 0;
    rings.forEach((r) => { r.m.visible = false; });
  }

  return {
    explode, burst, derez, ring, spark, update, clear,
    dispose() {
      points.removeFromParent(); geo.dispose(); sparkMat.dispose();
      shards.removeFromParent(); shardGeo.dispose(); shardMat.dispose(); shards.dispose?.();
      rings.forEach((r) => { r.m.removeFromParent(); r.m.material.dispose(); });
      ringGeo.dispose();
    },
  };
}
