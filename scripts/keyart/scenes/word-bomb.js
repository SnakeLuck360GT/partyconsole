// Word Bomb: a glossy cartoon bomb with a sparking fuse, chunky letter tiles blasting outward.
export default async function (ctx) {
  const { THREE, scene, letterTile, glowSprite, sparkle, contact, shadowOnly, puff, burst, D2R, rand, srand } = ctx;

  ctx.backdrop({
    stops: [[0, '#b3122b'], [0.5, '#e8283a'], [0.8, '#ff5a4a'], [1, '#ff6f55']],
    glow: [{ x: ctx.wide ? 0.66 : 0.5, y: 0.42, r: 0.5, color: '#ffc27a', a: 0.55 }],
  });
  const SHOT = { pos: [0.4, 1.3, 8.2], target: [0.1, 1.65, 0], fov: 34 };
  ctx.shot({ ...SHOT, shift: ctx.wide ? 0.17 : 0 });
  const cam = ctx.camera.position;

  // ---- floor: soft shadow catcher on a slightly darker red disc
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0xd8233a, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  ctx.fog(0xff5a4a, 12, 30);

  // ---- cartoon bomb
  const bomb = new THREE.Group(); bomb.position.set(0, 0, 0); bomb.rotation.z = -10 * D2R; scene.add(bomb);
  const R = 1.25;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshPhysicalMaterial({ color: 0x23233a, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, metalness: 0.1 }));
  shell.position.y = R; shell.castShadow = shell.receiveShadow = true; bomb.add(shell);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.34, 48), new THREE.MeshStandardMaterial({ color: 0xb8bcc8, roughness: 0.3, metalness: 0.85 }));
  cap.position.y = 2 * R + 0.08; cap.castShadow = true; bomb.add(cap);
  const capRim = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.05, 12, 48), cap.material);
  capRim.rotation.x = Math.PI / 2; capRim.position.y = 2 * R + 0.25; bomb.add(capRim);
  const fusePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2 * R + 0.2, 0), new THREE.Vector3(0.05, 2 * R + 0.6, 0.05), new THREE.Vector3(0.35, 2 * R + 0.95, 0.1), new THREE.Vector3(0.8, 2 * R + 1.02, 0.12),
  ]);
  const fuse = new THREE.Mesh(new THREE.TubeGeometry(fusePath, 48, 0.07, 12), new THREE.MeshStandardMaterial({ color: 0xe9c48a, roughness: 0.9 }));
  fuse.castShadow = true; bomb.add(fuse);
  // spark at the fuse tip
  bomb.updateMatrixWorld(true);
  const tip = bomb.localToWorld(new THREE.Vector3(0.82, 2 * R + 1.02, 0.12));
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), ctx.glow(0xfff3b0, 2.2));
  flame.position.copy(tip); scene.add(flame);
  for (const [c, sz, o] of [[0xffb340, 1.9, 0.9], [0xffffff, 0.8, 1.0]]) { const g = glowSprite(c, sz, o); g.position.copy(tip); scene.add(g); }
  srand(11);
  for (let i = 0; i < 9; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0.25, 0.7);
    const sp = sparkle(i % 3 ? 0xffd34a : 0xffffff, rand(0.25, 0.55), 1, rand(0, 1));
    sp.position.copy(tip).add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.2)); scene.add(sp);
  }
  // spark streaks
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, r0 = 0.18, r1 = rand(0.45, 0.8);
    const from = tip.clone().add(new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0.1));
    const to = tip.clone().add(new THREE.Vector3(Math.cos(a) * r1, Math.sin(a) * r1, 0.1));
    scene.add(ctx.streak(to.toArray(), from.toArray(), 0.05, 0xffe08a, 1, { face: cam, additive: true }));
  }
  // bomb highlight sheen
  const sheen = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false }));
  sheen.scale.set(1.3, 0.7, 0.3); sheen.position.set(-0.55, 2.05, 0.95); sheen.rotation.z = 0.6; bomb.add(sheen);
  contact(scene, 0, 0, 0, 1.5, 1.2, 0.5);

  // ---- letter tiles bursting outward
  const L = 'WORDBLASTQUIZEKMYHP';
  const tiles = [
    // x, y, z, size, rotX, rotY, rotZ (deg) ; ground tiles first
    [-2.5, 0.16, 1.2, 0.95, 0, 20, 0], [2.4, 0.16, 1.5, 0.9, 0, -25, 0], [-1.3, 0.16, 2.6, 0.75, 0, 8, 0], [1.4, 0.16, 2.8, 0.7, 0, -12, 0],
    [-2.6, 2.6, 0.4, 1.0, 58, 25, 20], [2.7, 2.9, 0.2, 1.0, 62, -30, -25], [-2.0, 4.1, -0.6, 0.8, 40, 40, 35], [2.0, 4.4, -0.9, 0.78, 45, -40, -30],
    [-3.4, 1.2, 1.0, 0.82, 70, 15, 50], [3.4, 1.5, 0.9, 0.8, 70, -20, -45], [0.2, 4.7, -1.4, 0.7, 50, 10, 8], [-0.9, 3.5, 1.6, 0.6, 75, 20, 15], [1.2, 3.7, 1.5, 0.55, 75, -20, -15],
  ];
  const faces = ['#fff4dc', '#fff4dc', '#ffe08a', '#fff4dc', '#bfe9ff', '#fff4dc'];
  tiles.forEach(([x, y, z, sz, rx, ry, rz], i) => {
    const t = letterTile(L[i % L.length], { size: sz, face: faces[i % faces.length], ink: '#3a1530', points: String((i * 7) % 9 + 1) });
    t.position.set(x, y + (y < 0.5 ? sz * 0.16 : 0), z);
    t.rotation.set(rx * D2R, ry * D2R, rz * D2R, 'YXZ');
    scene.add(t);
    if (y < 0.5) contact(scene, x, 0, z, sz * 0.7, sz * 0.7, 0.35);
  });
  // a few smoke puffs at the base
  for (const [x, z, s] of [[-1.5, 0.3, 0.7], [1.6, 0.2, 0.6], [0.4, -1.2, 0.8]]) { const p = puff(0xffe6dc, 6, 0.3 * s / 0.7, 0.4); p.position.set(x, 0.25, z); scene.add(p); }

  ctx.rig({ center: [0, 1.5, 0], shadowR: 7, keyAz: -40, keyEl: 55, keyI: 3.2, rimColor: 0xffc8a0, rimI: 3.8, sky: 0xffd8d0, ground: 0x902030, envI: 0.6 });
}
