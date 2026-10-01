// Probe bone world positions: ?scene=_probe&m=...&clip=...&f=...&bones=a,b
export default async function (ctx) {
  const q = new URLSearchParams(location.search);
  const m = await ctx.model(q.get('m'), { scale: +(q.get('s') || 1), clip: q.get('clip'), f: +(q.get('f') || 0) });
  ctx.scene.add(m); m.updateMatrixWorld(true);
  const out = {};
  for (const n of (q.get('bones') || '').split(',')) { const b = m.userData.byName(n); if (b) out[n] = b.getWorldPosition(new ctx.THREE.Vector3()).toArray().map((v) => +v.toFixed(2)); }
  const bb = ctx.bounds(m); out.bbox = [bb.min.toArray().map((v) => +v.toFixed(2)), bb.max.toArray().map((v) => +v.toFixed(2))];
  console.warn('PROBE', JSON.stringify(out));
  ctx.shot({ pos: [0, 1, 6], target: [0, 1, 0] }); ctx.rig();
}
