// Kart Chaos: two alien karts racing at camera, the hero launched off a ramp, rainbow item box, dust + speed lines.
export default async function (ctx) {
  const { THREE, model, scene, place, puff, streak, contact, canvasTex, RoundedBoxGeometry, sparkle, glowSprite, D2R, rand } = ctx;
  const T = 4; // track scale (road is T wide)

  ctx.backdrop({
    stops: [[0, '#e33a2c'], [0.4, '#ff6a36'], [0.6, '#ffa45c'], [0.75, '#ffc27e'], [1, '#ffc27e']],
    glow: [{ x: ctx.wide ? 0.66 : 0.58, y: 0.42, r: 0.5, color: '#fff3c4', a: 0.6 }],
  });
  ctx.fog(0xffbd7c, 22, 70);
  const SHOT = { pos: [-3.0, 1.25, 6.3], target: [0.4, 1.2, -0.9], fov: 37 };
  ctx.shot({ ...SHOT, shift: ctx.wide ? 0.17 : 0 });
  const S = (sx, sy, h = 0) => ctx.solve(SHOT, sx, sy, h);
  const cam = ctx.camera.position.clone();

  // layout in screen space: hero (airborne, front-left), rival (right, behind)
  const H = S(0.40, 0.86), R = S(0.84, 0.64), B = S(0.79, 0.2, 2.6);
  const dir = H.clone().sub(R).setY(0).normalize();         // travel direction
  const yaw = Math.atan2(dir.x, dir.z);
  // track centre line passes between the two karts
  const mid = H.clone().add(R).multiplyScalar(0.5);
  const world = new THREE.Group(); world.position.copy(mid); world.rotation.y = yaw; scene.add(world);
  world.updateMatrixWorld();
  const local = (p) => world.worldToLocal(p.clone());

  // ---- track along local Z
  for (let i = -9; i <= 3; i++) {
    const r = await model('track/road-straight-long', { scale: T, center: true });
    r.position.set(0, 0, i * 2 * T);
    world.add(r);
  }
  for (let i = -60; i <= 14; i++) {
    for (const sd of [-1, 1]) {
      const b = await model('track/barrier-wall', { scale: T * 0.75, center: true });
      b.rotation.y = Math.PI / 2;
      b.position.set(sd * (T / 2 + 0.25), 0, i * 0.75 * T * 0.999);
      world.add(b);
    }
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x4fbf3c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true;
  scene.add(ground);

  // ---- scenery in track-local coords
  const trees = [[5.5, -10], [7.5, -16], [5, -24], [9, -30], [-5.5, -12], [-7.5, -20], [-5, -30], [12, -4], [-11, -6], [14, -20], [-13, -26]];
  for (const [x, z] of trees) {
    const wp = world.localToWorld(new THREE.Vector3(x, 4, z)); const sp = ctx.screen(wp.toArray());
    if (Math.abs(sp.x - (ctx.wide ? 0.8 : 0.78)) < 0.27 && sp.y < 0.75) continue; // keep the item box clean
    world.add(place(await model(rand() > 0.4 ? 'track/tree-large' : 'track/tree-small', { scale: 3.6 * rand(0.85, 1.15) }), x, 0, z, rand(0, 6)));
  }
  ctx.hills(scene, mid, { color: 0x53b84a, dMin: 34, dMax: 52, rMin: 7, rMax: 13, hMin: 0.3, hMax: 0.55, count: 22 });
  // distant tree line for depth
  for (let i = 0; i < 40; i++) {
    const a = rand(0, Math.PI * 2), d = rand(26, 44);
    const p = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d).add(mid);
    const lp = world.worldToLocal(p.clone()); if (Math.abs(lp.x) < 4) continue;
    const sp = ctx.screen([p.x, 4, p.z]); if (Math.abs(sp.x - (ctx.wide ? 0.8 : 0.78)) < 0.2 && sp.y < 0.75) continue;
    scene.add(place(await model(rand() > 0.5 ? 'track/tree-large' : 'track/tree-small', { scale: 4 * rand(0.8, 1.2) }), p.x, 0, p.z, rand(0, 6)));
  }
  world.add(place(await model('track/banner-tower-red', { scale: 2.8 }), 3.3, 0, -12, -0.3));
  world.add(place(await model('track/banner-tower-green', { scale: 2.8 }), -3.3, 0, -18, 0.3));
  world.add(place(await model('track/overhead-lights', { scale: T * 0.9, center: true }), 0, 0, -20, 0));
  world.add(place(await model('track/cone', { scale: 1.3 }), 1.6, 0, -7, 0.1));

  // ---- hero kart: airborne, nose up, banked
  const hl = local(H);
  const hero = await model('vehicles/kart-oopi', { scale: 1.3 });
  hero.position.set(hl.x, 0.8, hl.z);
  hero.rotation.set(-11 * D2R, -10 * D2R, -8 * D2R, 'YXZ');
  world.add(hero);
  contact(scene, H.x, 0, H.z, 0.95, 1.1, 0.16);
  // ramp it launched from (slope rises toward +Z)
  const ramp = await model('track/ramp', { scale: 2.2, center: true, mult: 0xffb347, multK: 0.35 });
  ramp.position.set(hl.x, 0, hl.z - 1.75);
  world.add(ramp);

  // ---- rival kart: on the ground, drifting hard (rear swung out)
  const rl = local(R);
  const rival = await model('vehicles/kart-oodi', { scale: 1.3 });
  rival.position.set(rl.x, 0, rl.z);
  rival.rotation.set(0, -26 * D2R, 3 * D2R, 'YXZ');
  world.add(rival);
  contact(scene, R.x, 0, R.z, 0.8, 1.0, 0.5);

  // ---- dust puffs (track-local)
  const dust = (x, y, z, s) => { const p = puff(0xfff4e6, 8, 0.3 * s, 0.42 * s); p.position.set(x, y, z); world.add(p); };
  dust(rl.x + 0.75, 0.25, rl.z - 0.9, 1.1); dust(rl.x + 0.05, 0.2, rl.z - 1.3, 0.85); dust(rl.x + 1.2, 0.35, rl.z - 2.0, 0.8); dust(rl.x + 0.6, 0.5, rl.z - 2.9, 0.6);
  dust(hl.x + 0.6, 0.2, hl.z - 1.5, 0.55); dust(hl.x - 0.5, 0.2, hl.z - 1.7, 0.5);

  // ---- speed lines trailing behind (local -Z), facing camera
  world.updateMatrixWorld(true);
  const W = (x, y, z) => world.localToWorld(new THREE.Vector3(x, y, z)).toArray();
  const lines = [
    [hl.x - 0.95, 2.0, hl.z - 0.6, 3.5, 0.08], [hl.x - 0.9, 0.95, hl.z - 0.7, 3.5, 0.08], [hl.x - 0.6, 2.6, hl.z - 0.4, 3.0, 0.06],
  ];
  for (const [x, y, z, len, w] of lines) scene.add(streak(W(x, y, z), W(x, y + len * 0.06, z - len), w, 0xffffff, 0.9, { face: cam }));

  // ---- rainbow item box, floating ahead
  const boxTex = canvasTex(512, 512, (g, w) => {
    const lg = g.createLinearGradient(0, 0, w, w);
    ['#ff4d6d', '#ffb340', '#ffe74a', '#4de08a', '#45b6ff', '#a66bff'].forEach((c, i, a) => lg.addColorStop(i / (a.length - 1), c));
    g.fillStyle = lg; g.fillRect(0, 0, w, w);
    g.font = `900 ${w * 0.62}px "Arial Rounded MT Bold", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(80,20,90,0.25)'; g.fillText('?', w / 2 + 10, w / 2 + 34);
    g.fillStyle = '#ffffff'; g.fillText('?', w / 2, w / 2 + 24);
  });
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.85, 0.85, 5, 0.13), new THREE.MeshPhysicalMaterial({
    map: boxTex, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1, emissive: 0xffffff, emissiveMap: boxTex, emissiveIntensity: 0.35,
  }));
  box.position.copy(B);
  box.rotation.set(20 * D2R, -62 * D2R, 14 * D2R);
  box.castShadow = true;
  scene.add(box);
  const bg = glowSprite(0xfff2a8, 2.6, 0.5); bg.position.copy(box.position); scene.add(bg);
  for (const [dx, dy, s] of [[0.65, 0.5, 0.5], [-0.55, 0.45, 0.32], [0.45, -0.6, 0.28]]) {
    const sp = sparkle(0xffffff, s); sp.position.set(box.position.x + dx, box.position.y + dy, box.position.z + 0.3); scene.add(sp);
  }

  ctx.rig({ shadowR: 10, keyAz: -60, keyEl: 50, keyI: 3.4, rimColor: 0xffc890, rimI: 3.2, rimAz: 150, sky: 0xffe0c0, ground: 0x6a7a3a, envI: 0.5 });
}
