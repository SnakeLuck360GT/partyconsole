// Tower Topple: a towering, leaning stack of blocks, crates and planks; a little builder clutches the next crate.
export default async function (ctx) {
  const { THREE, model, scene, place, contact, puff, sparkle, D2R, rand, srand } = ctx;

  ctx.backdrop({
    stops: [[0, '#0f8f9a'], [0.45, '#2cc3c0'], [0.8, '#8be6d6'], [1, '#bff3e6']],
    glow: [{ x: ctx.wide ? 0.66 : 0.55, y: 0.35, r: 0.5, color: '#eafff8', a: 0.55 }],
  });
  ctx.fog(0xa6eedf, 26, 70);
  const SHOT = { pos: [2.6, 1.0, 13.6], target: [0.5, 3.9, 0], fov: 40 };
  ctx.shot({ ...SHOT, shift: ctx.wide ? 0.17 : 0 });

  // ---- ground: grassy plateau + distant hills
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 1, 96), new THREE.MeshStandardMaterial({ color: 0x67c94a, roughness: 0.95 }));
  ground.position.set(0, -0.5, -2); ground.receiveShadow = true; scene.add(ground);
  ctx.hills(scene, new THREE.Vector3(0, 0, -4), { color: 0x4fb84a, dMin: 32, dMax: 50, rMin: 7, rMax: 13, count: 20 });
  for (const [x, z, s] of [[-6, -4, 1.9], [6.5, -6, 2.2], [-8.5, -10, 2.4], [9, -2, 1.6], [-4, -12, 2.6], [4, -14, 2.5]]) scene.add(place(await model('platformer/tree', { scale: s }), x, 0, z, rand(0, 6)));

  // ---- the tower: chunky pieces stacked with a growing lean
  const pieces = [
    ['props/kaykit-platformer/platform-4x4x1-green', 0.85],
    ['props/kaykit-platformer/platform-2x2x1-red', 0.85],
    ['props/cube-crate', 0.7],
    ['props/kaykit-platformer/floor-wood-2x2', 1.0],
    ['props/kaykit-platformer/platform-2x2x1-yellow', 0.78],
    ['props/cube-crate', 0.55],
    ['props/kaykit-platformer/platform-1x1x1-blue', 1.05],
    ['props/kaykit-platformer/floor-wood-2x2', 0.85],
    ['props/kaykit-platformer/platform-2x2x1-red', 0.62],
  ];
  const tower = new THREE.Group(); tower.position.set(-0.9, 0, -0.6); scene.add(tower);
  let y = 0, x = 0, tilt = 0;
  srand(7);
  for (let i = 0; i < pieces.length; i++) {
    const [path, s] = pieces[i];
    const p = await model(path, { scale: s, center: true, ground: true });
    const ph = p.userData.restSize.y;
    const lean = i * i * 0.016;
    x += 0.05 + lean;
    tilt = (i * 2.2 + rand(-2, 2)) * D2R;
    p.position.set(x, y, rand(-0.12, 0.12));
    p.rotation.set(rand(-0.04, 0.04), rand(-0.5, 0.5), -tilt);
    tower.add(p);
    y += ph * Math.cos(tilt) * 0.97 + Math.abs(Math.sin(tilt)) * 0.12;
  }
  // a crate already tumbling off the top
  const fall = await model('props/cube-crate', { scale: 0.5, center: true, centerY: true });
  fall.position.set(x + 1.5, y + 0.4, 0.3); fall.rotation.set(0.5, 0.4, -0.9); tower.add(fall);
  // wobble cues: little dust puffs + motion arcs near the top
  for (const [dx, dy, sz] of [[x - 1.1, y - 0.3, 0.25], [x + 0.9, y - 1.2, 0.2]]) { const pf = puff(0xffffff, 5, sz, 0.25); pf.position.set(dx, dy, 0.8); tower.add(pf); }
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false });
  for (const [r, a0, len, yy] of [[1.3, 1.9, 0.9, y - 0.2], [1.6, 2.0, 0.7, y - 0.5]]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 48, len), arcMat);
    arc.position.set(x - 0.2, yy, 0.6); arc.rotation.z = a0; tower.add(arc);
    const arc2 = arc.clone(); arc2.position.x = x + 0.2; arc2.rotation.z = -a0 + Math.PI - len; tower.add(arc2);
  }
  contact(scene, -0.9, 0.0, -0.6, 2.4, 2.4, 0.35);

  // ---- builder: holding the next crate, leaning back, looking up nervously
  const kid = await model('characters/mini/female-b', { scale: 2.9, clip: 'holding-both', f: 0.3, bones: { head: [-16, 0, 0], torso: [-6, 0, 0] } });
  kid.position.set(2.3, 0, 4.4);
  kid.rotation.y = -38 * D2R;
  scene.add(kid);
  const hold = await model('props/kaykit-platformer/platform-1x1x1-blue', { scale: 0.62, center: true, centerY: true });
  kid.updateMatrixWorld(true);
  const hands = ctx.bonePos(kid, 'arm-left').add(ctx.bonePos(kid, 'arm-right')).multiplyScalar(0.5);
  const kf = new THREE.Vector3(Math.sin(kid.rotation.y), 0, Math.cos(kid.rotation.y));
  hold.position.copy(hands).add(kf.multiplyScalar(0.42)).add(new THREE.Vector3(0, 0.05, 0));
  hold.rotation.set(0.1, -0.5, 0.08);
  scene.add(hold);
  contact(scene, 2.3, 0.0, 4.4, 0.8, 0.7, 0.45);
  // sweat drops
  const dropMat = new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, roughness: 0.05, transmission: 0.2, clearcoat: 1 });
  const head = ctx.bonePos(kid, 'head');
  for (const [dx, dy, sz] of [[0.55, 0.95, 0.07], [0.68, 0.72, 0.05]]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(sz, 24, 16), dropMat);
    d.scale.y = 1.5; d.position.copy(head).add(new THREE.Vector3(dx, dy, 0.2)); scene.add(d);
  }

  ctx.rig({ center: [0, 2.5, 0], shadowR: 9, keyAz: -40, keyEl: 52, keyI: 3.2, rimColor: 0xd8fff4, rimI: 3.0, sky: 0xdffcf4, ground: 0x6a8a50, envI: 0.5 });
}
