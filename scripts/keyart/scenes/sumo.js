// Sumo Smash: orc lands a haymaker on a yeti teetering at the edge of a floating sumo ring, impact burst.
export default async function (ctx) {
  const { THREE, model, scene, puff, burst, star5, contact, sparkle, glowSprite, D2R, rand } = ctx;

  ctx.backdrop({
    stops: [[0, '#ff6a1f'], [0.5, '#ff9638'], [0.8, '#ffc46a'], [1, '#ffd88a']],
    glow: [{ x: ctx.wide ? 0.66 : 0.5, y: 0.4, r: 0.55, color: '#fff2c4', a: 0.7 }],
  });
  const SHOT = { pos: [0.5, 1.25, 7.0], target: [0.2, 1.05, 0], fov: 31 };
  ctx.shot({ ...SHOT, shift: ctx.wide ? 0.17 : 0 });

  // ---- floating ring (dohyo): clay disc, straw rope ring, rocky underside
  const R = 4.2;
  const ring = new THREE.Group(); ring.position.set(0.6, 0, -3.2); scene.add(ring);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, 0.7, 96), [
    new THREE.MeshStandardMaterial({ color: 0x7c3f2a, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0xcf8247, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x7c3f2a, roughness: 0.7 }),
  ]);
  top.position.y = -0.35; top.receiveShadow = top.castShadow = true; ring.add(top);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(R - 0.35, 0.14, 16, 160), new THREE.MeshStandardMaterial({ color: 0xe9cf8a, roughness: 0.75 }));
  rope.rotation.x = Math.PI / 2; rope.position.y = 0.06; rope.castShadow = rope.receiveShadow = true; ring.add(rope);
  // red + gold trim bands around the platform side
  const trim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.005, R * 1.005, 0.16, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8332c, roughness: 0.5 }));
  trim.position.y = -0.12; ring.add(trim);
  const gold = new THREE.Mesh(new THREE.TorusGeometry(R * 1.005, 0.035, 8, 160), new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: 0.3, metalness: 0.6 }));
  gold.rotation.x = Math.PI / 2; gold.position.y = -0.21; ring.add(gold);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.3, 0.05, 8, 96), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  
  const rock = new THREE.Mesh(new THREE.ConeGeometry(R * 0.97, 3.2, 14, 3), new THREE.MeshStandardMaterial({ color: 0x9a6a4a, roughness: 0.95, flatShading: true }));
  rock.rotation.x = Math.PI; rock.position.y = -0.7 - 1.6; rock.castShadow = true; ring.add(rock);
  // grass lip
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.0, R * 1.0, 0.18, 96), new THREE.MeshStandardMaterial({ color: 0x7ccf4f, roughness: 0.9 }));
  lip.position.y = -0.79; ring.add(lip);

  // ---- distant floating islands + clouds for depth
  for (const [x, y, z, s] of [[-12, 2.5, -26, 1.0], [10, -0.5, -16, 1.2], [-20, -2.5, -34, 1.1], [6, 3.5, -30, 0.8]]) {
    const isl = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.4, 32), new THREE.MeshStandardMaterial({ color: 0x86d65a, roughness: 0.9 }));
    const b = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2, 9), new THREE.MeshStandardMaterial({ color: 0xb07a52, roughness: 0.95, flatShading: true }));
    b.rotation.x = Math.PI; b.position.y = -1.2; isl.add(t, b);
    isl.position.set(x, y, z); isl.scale.setScalar(s); scene.add(isl);
  }
  const cloud = (x, y, z, s) => { const c = puff(0xffffff, 9, 0.9 * s, 1.3 * s, { flatY: 0.35 }); c.position.set(x, y, z); scene.add(c); };
  cloud(-8, -2.6, -7, 1.3); cloud(5.6, -2.1, -0.5, 1.5); cloud(-2.5, -4.2, -1, 1.4); cloud(2.4, -3.0, 3.0, 1.0); cloud(-11, 2.0, -14, 1.1); cloud(11, 3.2, -18, 1.1);

  // ---- fighters: orc's hook connects with the yeti's chin
  const pair = new THREE.Group(); scene.add(pair);
  // orc faces camera; its right hook swings out to screen-left into the yeti's cheek
  const orc = await model('characters/monsters/orc', { scale: 0.68, clip: 'Punch', f: 0.41, hide: ['Orc_Weapon'], rough: 0.6 });
  orc.userData.model.rotation.z = 6 * D2R; // lean into the punch
  orc.position.set(0.85, 0, 0.1);
  orc.rotation.y = -22 * D2R;
  pair.add(orc);
  pair.updateMatrixWorld(true);
  const fist = orc.userData.byName('Middle1.R').getWorldPosition(new THREE.Vector3());
  const yeti = await model('characters/monsters/yeti', { scale: 0.66, clip: 'HitReact', f: 0.3, rough: 0.6 });
  yeti.userData.model.rotation.x = -18 * D2R; // knocked back
  yeti.userData.model.rotation.z = 6 * D2R;
  const yawY = 62 * D2R;
  const fwd = new THREE.Vector3(Math.sin(yawY), 0, Math.cos(yawY));
  yeti.position.set(fist.x - fwd.x * 0.42, 0, fist.z - fwd.z * 0.42);
  yeti.rotation.y = yawY;
  pair.add(yeti);
  pair.updateMatrixWorld(true);
  const hit = fist.clone().add(new THREE.Vector3(-0.08, 0.1, 0.3));
  const op = orc.getWorldPosition(new THREE.Vector3()), yp = yeti.getWorldPosition(new THREE.Vector3());
  contact(scene, op.x, 0.0, op.z, 0.95, 0.75, 0.42);
  contact(scene, yp.x, 0.0, yp.z, 0.9, 0.7, 0.42);

  // ---- impact
  const face = ctx.camera.position;
  const b1 = burst(0xfff36b, 0.46, 0.25, 9, 0.06, { jag: true, emissive: 0xffd23a, emissiveI: 0.7 });
  b1.position.copy(hit); b1.lookAt(face); scene.add(b1);
  const b2 = burst(0xffffff, 0.26, 0.15, 8, 0.06, { jag: true, emissive: 0xffffff, emissiveI: 0.7, rot: 0.3 });
  b2.position.copy(hit).add(new THREE.Vector3(0, 0, 0.08)); b2.lookAt(face); scene.add(b2);
  const gl = glowSprite(0xfff1a0, 1.3, 0.6); gl.position.copy(hit); scene.add(gl);
  for (const [dx, dy, sz, c] of [[0.45, 0.5, 0.14, 0xffe14d], [0.6, 0.0, 0.1, 0xffffff], [0.25, -0.4, 0.11, 0xff7a3d], [-0.15, 0.55, 0.09, 0xffffff]]) {
    const st = star5(c, sz, 0.07, { emissive: c, emissiveI: 0.25 });
    st.position.copy(hit).add(new THREE.Vector3(dx, dy, 0.15)); st.lookAt(face); st.rotateZ(rand(-0.6, 0.6)); scene.add(st);
  }
  for (const [dx, dy, sz] of [[0.5, 0.3, 0.35], [-0.3, -0.25, 0.22], [0.1, 0.6, 0.22]]) { const sp = sparkle(0xffffff, sz); sp.position.copy(hit).add(new THREE.Vector3(dx, dy, 0.3)); scene.add(sp); }
  // dust kicked up at the yeti's skidding feet
  const dust = (x, y, z, s) => { const p = puff(0xffe9cf, 7, 0.28 * s, 0.4 * s); p.position.set(x, y, z); scene.add(p); };
  dust(yp.x - 0.7, 0.12, yp.z - 0.2, 0.55); dust(yp.x - 0.2, 0.1, yp.z + 0.45, 0.4);

  ctx.rig({ center: [0.2, 1.2, 0], shadowR: 7, keyAz: -45, keyEl: 55, keyI: 3.2, rimColor: 0xffe2b0, rimI: 3.4, sky: 0xffe6c8, ground: 0xa06a40, envI: 0.45 });
}
