export default async function (ctx) {
  const { THREE } = ctx;
  const m = await ctx.model('characters/critters/platformer-hero', { scale: 0.5, clip: 'Jump', f: 0.6 });
  ctx.scene.add(m);
  const before = ctx.bonePos(m, 'Fist.R').toArray();
  const ub = m.userData.byName('UpperArm.R');
  console.warn('bone', ub && ub.name, ub && ub.type, 'parent', ub && ub.parent.name);
  ctx.aim(m, 'UpperArm.R', 'LowerArm.R', [0, 4, 0]);
  ctx.aim(m, 'LowerArm.R', 'Fist.R', [0, 5, 0]);
  const after = ctx.bonePos(m, 'Fist.R').toArray();
  let skinned = 0; m.traverse((o) => { if (o.isSkinnedMesh) { skinned++; console.warn('skin', o.name, o.skeleton.bones.includes(ub)); } });
  console.warn('fist', JSON.stringify(before), JSON.stringify(after));
  ctx.shot({ pos: [0, 1.5, 6], target: [0, 1.5, 0] }); ctx.rig();
}
