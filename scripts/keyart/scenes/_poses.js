// Pose explorer: ?scene=_poses&m=characters/monsters/orc&clip=Punch&n=8&ry=30
// Renders n evenly spaced frames of a clip side by side (left -> right = 0 .. 1 of the clip).
export default async function (ctx) {
  const { THREE, model, scene } = ctx;
  const q = new URLSearchParams(location.search);
  const path = q.get('m'), clip = q.get('clip'), n = +(q.get('n') || 8), ry = +(q.get('ry') || 25);
  const dry = +(q.get('dry') || 0);
  const f0 = +(q.get('f0') || 0), f1 = +(q.get('f1') || 1);
  const cols = Math.ceil(Math.sqrt(n * ctx.aspect)), rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    const f = f0 + (f1 - f0) * (n === 1 ? 0 : i / (n - 1));
    const m = await model(path, { height: 1.8, clip, f, center: true });
    m.position.set((i % cols - (cols - 1) / 2) * 2.2, -Math.floor(i / cols) * 2.6, 0);
    m.rotation.y = (ry + dry * i) * ctx.D2R;
    scene.add(m);
  }
  ctx.backdrop({ stops: [[0, '#cfd8e6'], [1, '#9fb0c8']] });
  const h = rows * 2.6, w = cols * 2.2;
  const dist = Math.max(h, w / ctx.aspect) / (2 * Math.tan(15 * ctx.D2R)) * 1.05;
  ctx.shot({ pos: [0, -(rows - 1) * 1.3 + 0.9, dist], target: [0, -(rows - 1) * 1.3 + 0.9, 0], fov: 30 });
  ctx.rig({ shadowR: 12 });
  ctx.grade.vignette = 0;
}
