// Brain Brawl: robot contestant throws a thumbs-up behind a quiz podium, "?" blocks float in the spotlights.
export default async function (ctx) {
  const { THREE, model, scene, RoundedBoxGeometry, glowSprite, sparkle, contact, glow, aim, D2R, rand } = ctx;

  ctx.backdrop({
    stops: [[0, '#2a1470'], [0.45, '#4528ad'], [0.62, '#4a2ab0'], [1, '#4a2ab0']],
    glow: [{ x: ctx.wide ? 0.66 : 0.5, y: 0.42, r: 0.5, color: '#b58cff', a: 0.55 }],
  });
  ctx.fog(0x4a2ab0, 9, 26);
  const SHOT = { pos: [0.9, 1.3, 7.6], target: [0.15, 1.95, 0], fov: 35 };
  ctx.shot({ ...SHOT, shift: ctx.wide ? 0.17 : 0 });

  // ---- glossy stage floor with concentric light rings
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 96), new THREE.MeshPhysicalMaterial({ color: 0x3a1f8f, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.25 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  for (const [r, c] of [[2.6, 0xff4fd8], [4.2, 0x52e6ff], [6.0, 0xffd34a]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.07, 128), glow(c, 1.4));
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.005, -0.6); scene.add(ring);
  }

  // ---- podium: rounded block, coloured front, light strip + bulbs, red buzzer
  const pod = new THREE.Group(); pod.position.set(0.15, 0, 0.95); pod.rotation.y = -14 * D2R; pod.scale.set(0.8, 0.8, 0.8); scene.add(pod);
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.9, 1.15, 1.0, 6, 0.12), new THREE.MeshPhysicalMaterial({ color: 0xff3d8b, roughness: 0.35, clearcoat: 0.8 }));
  body.position.y = 0.575; body.castShadow = body.receiveShadow = true; pod.add(body);
  const topSlab = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.14, 1.2, 4, 0.06), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1 }));
  topSlab.position.y = 1.2; topSlab.castShadow = topSlab.receiveShadow = true; pod.add(topSlab);
  const base = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.14, 1.2, 4, 0.06), new THREE.MeshPhysicalMaterial({ color: 0x2b1666, roughness: 0.4 }));
  base.position.y = 0.07; pod.add(base);
  const strip = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.42, 0.06, 4, 0.03), new THREE.MeshPhysicalMaterial({ color: 0x1b0d4a, roughness: 0.2, clearcoat: 1 }));
  strip.position.set(0, 0.62, 0.51); pod.add(strip);
  for (let i = 0; i < 11; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 8), glow(i % 2 ? 0xffe46b : 0xffffff, 1.6));
    b.position.set(-0.75 + i * 0.15, 1.02, 0.52); pod.add(b);
    const b2 = b.clone(); b2.position.y = 0.2; pod.add(b2);
  }
  // star emblem on the screen strip
  const emb = ctx.star5(0xffd34a, 0.16, 0.03, { emissive: 0xffb300, emissiveI: 0.8 });
  emb.position.set(0, 0.62, 0.56); pod.add(emb);
  const buzz = await model('props/minigame/button-red', { size: 0.62 });
  buzz.position.set(0.5, 1.27, 0.12); pod.add(buzz);

  // ---- robot contestant: thumbs up, leaning in
  const bot = await model('characters/robot/robot-expressive', { height: 2.7, clip: 'ThumbsUp', f: 0.5, rough: 0.45, tint: { Main: 0xffb81f } });
  bot.position.set(-0.05, 0, -0.05);
  bot.rotation.y = 12 * D2R;
  scene.add(bot);
  contact(scene, 0, 0, 0, 1.0, 0.7, 0.4);

  // ---- floating ? blocks
  const qs = [[-1.9, 3.2, -0.6, 1.0, 20, 30], [2.1, 3.3, -1.0, 0.9, -15, -25], [-2.0, 1.2, 1.2, 0.6, 30, 15], [2.3, 1.3, 0.9, 0.55, -25, 40], [0.9, 4.5, -2.4, 0.55, 10, -10]];
  for (const [x, y, z, sz, rx, ry] of qs) {
    const q = await model('props/cube-question', { size: sz, centerY: true, rough: 0.35 });
    q.position.set(x, y, z); q.rotation.set(rx * D2R, ry * D2R, rand(-0.3, 0.3));
    scene.add(q);
    const g = glowSprite(0x9fd8ff, sz * 2.4, 0.35); g.position.set(x, y, z - 0.2); scene.add(g);
  }

  // ---- spotlight beams converging on the contestant
  const beamMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  for (const [x, z, c, o] of [[-5, -3, 0xb08cff, 0.07], [5, -3.5, 0x8cd8ff, 0.065], [0, -6, 0xffffff, 0.05]]) {
    const top = new THREE.Vector3(x, 9, z), bot0 = new THREE.Vector3(0, 0, 0);
    const len = top.distanceTo(bot0);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 1.6, len, 48, 1, true), beamMat(c, o));
    cone.position.copy(top).add(bot0).multiplyScalar(0.5);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot0).normalize());
    scene.add(cone);
  }
  const pool = glowSprite(0xd6c2ff, 5, 0.25); pool.position.set(0, 0.05, 0); scene.add(pool);
  for (const [x, y, s] of [[-1.2, 2.9, 0.5], [1.4, 2.4, 0.4], [-2.8, 1.9, 0.35], [2.0, 4.1, 0.45]]) { const sp = sparkle(0xffffff, s); sp.position.set(x, y, 0.8); scene.add(sp); }

  ctx.rig({ center: [0, 1.4, 0], shadowR: 7, keyAz: -35, keyEl: 58, keyI: 3.4, keyColor: 0xfff4ea, rimColor: 0xc08cff, rimI: 4.5, rim2I: 3, rim2Color: 0x6fd8ff, sky: 0xb9a6ff, ground: 0x3a2070, hemiI: 0.9, envI: 0.5 });
  ctx.grade.vignette = 0.3;
}
