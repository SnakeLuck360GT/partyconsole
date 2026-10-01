// Party Board: hero leaps off a board space and punches a giant die, coins burst out, star floats nearby.
export default async function (ctx) {
  const { THREE, model, scene, place, contact, sparkle, glowSprite, puff, aim, D2R, rand } = ctx;

  ctx.backdrop({
    stops: [[0, '#ffb81f'], [0.45, '#ffd84a'], [1, '#ffe98a']],
    glow: [{ x: ctx.wide ? 0.66 : 0.52, y: 0.32, r: 0.55, color: '#fffbe0', a: 0.85 }],
    rays: { x: ctx.wide ? 0.66 : 0.52, y: 0.3, n: 22, color: 'rgba(255,255,255,0.13)' },
  });
  const SHOT = { pos: [0.6, 1.05, 8.4], target: [0.05, 2.45, 0], fov: 36 };
  ctx.shot({ ...SHOT, shift: ctx.wide ? 0.17 : 0 });
  const cam = ctx.camera.position;

  // ---- board: grassy island with a winding path of coloured spaces
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.6, 96), new THREE.MeshStandardMaterial({ color: 0x6fd05a, roughness: 0.95 }));
  ground.position.set(0, -0.32, -3); ground.receiveShadow = true; scene.add(ground);
  const cols = ['tile-blue', 'tile-red', 'tile-yellow', 'tile-green', 'tile-blue', 'tile-purple', 'tile-red', 'tile-green', 'tile-yellow', 'tile-blue', 'tile-red', 'tile-green'];
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-6, 0, 2.5), new THREE.Vector3(-3, 0, 1.2), new THREE.Vector3(0, 0, 0.2), new THREE.Vector3(2.8, 0, -1.2),
    new THREE.Vector3(3.5, 0, -4.2), new THREE.Vector3(0.5, 0, -6.5), new THREE.Vector3(-3.5, 0, -7.5),
  ]);
  const N = 15;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const p = path.getPointAt(t), tan = path.getTangentAt(t);
    const tile = await model('board/' + cols[i % cols.length], { scale: 1.5, center: true });
    tile.position.set(p.x, -0.02, p.z);
    tile.rotation.y = Math.atan2(tan.x, tan.z);
    scene.add(tile);
  }
  // scenery
  scene.add(place(await model('board/building-red', { scale: 1.4 }), -3.6, 0, -2.4, 0.5));
  scene.add(place(await model('board/building-blue', { scale: 1.2 }), 5.2, 0, -2.6, -0.4));
  scene.add(place(await model('board/building-yellow', { scale: 1.1 }), -1.4, 0, -5.0, 0.2));
  scene.add(place(await model('board/flag-a-red', { scale: 1.3 }), 2.2, 0, -5.5, -0.5));
  for (const [x, z, s] of [[-5.5, -1, 1.5], [6.5, -5, 1.8], [-6, -6, 1.7], [4.4, 0.8, 1.2], [-2.6, -8.5, 1.6]]) scene.add(place(await model('platformer/tree', { scale: s }), x, 0, z, rand(0, 6)));
  scene.add(place(await model('board/pawn-b-blue', { scale: 1.2 }), 2.9, 0.15, -1.6, 0));
  scene.add(place(await model('board/pawn-b-green', { scale: 1.2 }), 3.6, 0.15, -3.4, 0));

  // ---- hero mid-jump, fist punching up into the die
  const hero = await model('characters/critters/platformer-hero', { scale: 0.62, clip: 'Jump', f: 0.6, rough: 0.5 });
  hero.position.set(0.35, 0.7, 0.3);
  hero.rotation.y = 12 * D2R;
  scene.add(hero);
  const die = await model('board/d6-a-red', { size: 1.25, centerY: true, rough: 0.35 });
  die.rotation.set(22 * D2R, 35 * D2R, -12 * D2R);
  scene.add(die);
  // raise right arm straight up at the die, left arm out for balance
  aim(hero, 'UpperArm.R', 'LowerArm.R', { dir: [-0.75, 1, 0.35] });
  aim(hero, 'LowerArm.R', 'Fist.R', { dir: [-0.6, 1, 0.3] });
  aim(hero, 'UpperArm.L', 'LowerArm.L', { dir: [1, -0.15, 0.4] });
  aim(hero, 'UpperLeg.L', 'LowerLeg.L', { dir: [0.25, -0.35, 1] });
  aim(hero, 'LowerLeg.L', 'Foot.L', { dir: [0.1, -1, 0.15] });
  aim(hero, 'UpperLeg.R', 'LowerLeg.R', { dir: [-0.15, -1, -0.25] });
  contact(scene, 0.35, 0.17, 0.3, 0.8, 0.8, 0.35);
  const fist = ctx.bonePos(hero, 'Fist.R');
  die.position.copy(fist).add(new THREE.Vector3(-0.45, 0.95, -0.1));
  const D = die.position;

  // ---- coins bursting out of the die
  const coinPos = [[-1.5, 0.6, 0.2, 40], [-0.95, 1.35, 0.4, -20], [0.15, 1.45, 0.1, 60], [1.15, 0.95, 0.5, -50], [1.7, 0.15, 0.3, 20], [-1.95, -0.4, 0.6, 70], [-2.2, -1.35, 0.9, -30]];
  for (const [dx, dy, z, r] of coinPos) {
    const x = D.x + dx, y = D.y + dy;
    const c = await model('board/coin-gold', { size: 0.62, centerY: true, metal: 0.55, rough: 0.28 });
    c.position.set(x, y, z);
    c.rotation.set(r * D2R + 80 * D2R, rand(-1, 1), r * D2R * 0.5);
    scene.add(c);
  }
  // star
  const star = await model('props/star', { size: 1.15, centerY: true, rough: 0.3, tint: { [''] : 0 }, matFn: (m) => { m.color.set(0xffc21a); m.emissive = new THREE.Color(0xff9a00); m.emissiveIntensity = 0.35; } });
  star.position.set(1.95, 3.15, 0.3);
  star.rotation.set(0, -0.4, 0.25);
  scene.add(star);
  const sg = glowSprite(0xfff3a0, 2.4, 0.6); sg.position.copy(star.position); scene.add(sg);
  const dg = glowSprite(0xffffff, 3.2, 0.55); dg.position.copy(die.position); scene.add(dg);
  for (const [x, y, s] of [[D.x - 1.0, D.y + 0.3, 0.6], [D.x + 1.1, D.y + 0.9, 0.45], [2.9, 3.7, 0.5], [1.7, 2.1, 0.35], [D.x - 1.6, D.y + 1.6, 0.35]]) { const sp = sparkle(0xffffff, s); sp.position.set(x, y, 1); scene.add(sp); }
  // impact puff ring around the die's underside
  for (const [x, y, z, s] of [[D.x - 0.6, D.y - 0.55, 0.5, 0.45], [D.x + 0.65, D.y - 0.5, 0.5, 0.4]]) { const p = puff(0xffffff, 5, 0.22 * s / 0.5, 0.25); p.position.set(x, y, z); scene.add(p); }

  ctx.rig({ center: [0, 2, 0], shadowR: 9, keyAz: -40, keyEl: 55, keyI: 3.2, rimColor: 0xfff0c0, rimI: 3.0, sky: 0xfff2c8, ground: 0x7a8a40, envI: 0.5 });
}
