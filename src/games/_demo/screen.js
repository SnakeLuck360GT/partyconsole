// Minimal reference screen game: one shaded sphere per player on a floor.
import { createStage, THREE, makeLabel } from '../../sdk/three-kit.js';
import { trackInput, countdown, scoreboard } from '../../sdk/screen-kit.js';
import { sfx } from '../../sdk/audio.js';

export default async function start(ctx) {
  const stage = createStage(ctx.container, { background: 0x9ad0ff });
  const { scene, camera } = stage;
  camera.position.set(0, 18, 16);
  camera.lookAt(0, 0, 0);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: 0x7bc86c }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const input = trackInput(ctx);
  const balls = new Map();
  const board = scoreboard(ctx.container, { title: 'Jumps' });
  function add(p) {
    if (balls.has(p.id)) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 16), new THREE.MeshStandardMaterial({ color: p.colorHex, roughness: 0.3 }));
    m.castShadow = true;
    m.position.set((Math.random() - 0.5) * 8, 0.7, (Math.random() - 0.5) * 8);
    const label = makeLabel(p.name, { color: p.color });
    label.position.y = 1.4;
    m.add(label);
    scene.add(m);
    balls.set(p.id, { mesh: m, vy: 0, jumps: 0, player: p });
  }
  ctx.players().forEach(add);
  ctx.onJoin(add);
  ctx.onLeave((p) => { const b = balls.get(p.id); if (b) { scene.remove(b.mesh); balls.delete(p.id); } });
  const refresh = () => board.update([...balls.values()].map((b) => ({ player: b.player, score: b.jumps })));
  refresh();

  let running = false;
  await countdown(ctx.container);
  running = true;
  const t0 = performance.now();

  stage.onFrame((dt) => {
    if (!running) return;
    for (const [id, b] of balls) {
      const i = input.get(id);
      b.mesh.position.x = THREE.MathUtils.clamp(b.mesh.position.x + i.x * dt * 8, -11, 11);
      b.mesh.position.z = THREE.MathUtils.clamp(b.mesh.position.z + i.y * dt * 8, -11, 11);
      if (i.pressed('a') && b.mesh.position.y <= 0.71) { b.vy = 9; b.jumps++; sfx.play('jump'); ctx.send(id, { type: 'bump' }); refresh(); }
      b.vy -= 25 * dt;
      b.mesh.position.y = Math.max(0.7, b.mesh.position.y + b.vy * dt);
    }
    if (performance.now() - t0 > 20000) {
      running = false;
      const rows = [...balls.values()].sort((a, b) => b.jumps - a.jumps).map((b) => ({ player: b.player, score: b.jumps, label: 'jumps' }));
      ctx.showResults(rows).then((choice) => { if (choice === 'again') { balls.forEach((b) => { b.jumps = 0; }); refresh(); running = true; } });
    }
  });

  return { destroy: () => { stage.dispose(); board.destroy(); } };
}
