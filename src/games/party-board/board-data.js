// Board layouts: a looping path of spaces (sampled along smooth curves) plus branching paths.
// Every space: { id, x, z, type, next: [ids], prev: [ids], route, junction? }.
import { THREE } from '../../sdk/three-kit.js';

export const TYPES = {
  blue: { color: 0x1f74ff, rim: 0xd8ecff, label: 'Blue space', icon: '+' },
  red: { color: 0xff2a3c, rim: 0xffe0e0, label: 'Red space', icon: '−' },
  event: { color: 0x1fb85a, rim: 0xe1ffe9, label: 'Happening', icon: '?' },
  shop: { color: 0xff9500, rim: 0xfff0d6, label: 'Item Shop', icon: '🛍' },
  duel: { color: 0x8a3dff, rim: 0xefe3ff, label: 'Duel', icon: '⚔' },
};

// Type codes used in the layout strings.
const CODE = { B: 'blue', R: 'red', E: 'event', S: 'shop', D: 'duel' };

export const BOARDS = {
  isle: {
    id: 'isle',
    name: 'Sunny Isle',
    emoji: '🏝️',
    desc: 'A floating island with a lake, a village and a risky bridge shortcut',
    loop: [[-25, 9], [-14, 16], [0, 17], [14, 16], [25, 10], [30, -1], [25, -12], [12, -17], [0, -15], [-12, -18], [-25, -13], [-31, -2]],
    mainCount: 40,
    types: 'BBEBRBEBBEBSRBBBEBDRBBEBBRBBEBSBRBEBRBDE',
    branches: [
      // Risky shortcut straight through the middle (over the bridge).
      { name: 'Bridge shortcut', from: [0, 17], to: [0, -15], via: [[2, 9], [-1, 1], [1, -7]], count: 7, types: 'RERDBRE' },
      // Scenic detour out onto the east cape: longer but generous.
      { name: 'Cape detour', from: [25, 10], to: [25, -12], via: [[34, 12], [40, 3], [38, -8]], count: 8, types: 'BEBBSBEB' },
    ],
    lake: { x: -13, z: -1, rx: 7.5, rz: 5.5 },
    // The river leaves the lake, runs under the shortcut bridge and the front path, and pours off the island edge.
    river: { via: [[-6.5, 1.8], [-2, 3], 'crossBranch0', [4, 8.5], 'crossMain', [10, 22], [11, 27]] },
    village: [[10, 2], [15, -6], [18, 4], [8, -8]],
  },
};

function curvePts(pts, closed) {
  return new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal', 0.5);
}

function nearestIndex(spaces, [x, z]) {
  let best = 0;
  let bd = Infinity;
  spaces.forEach((s, i) => {
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export function buildBoard(def) {
  const spaces = [];
  const add = (x, z, type, route) => {
    const s = { id: spaces.length, x, z, type, next: [], prev: [], route };
    spaces.push(s);
    return s;
  };
  // Main loop.
  const main = curvePts(def.loop, true).getSpacedPoints(def.mainCount).slice(0, def.mainCount);
  main.forEach((p, i) => add(p.x, p.z, CODE[def.types[i]] || 'blue', 'main'));
  for (let i = 0; i < def.mainCount; i++) {
    const a = spaces[i];
    const b = spaces[(i + 1) % def.mainCount];
    a.next.push(b.id);
    b.prev.push(a.id);
  }
  const mainSpaces = spaces.slice();
  const branchIds = [];
  // Branches: leave from the main space nearest `from`, rejoin at the one nearest `to`.
  def.branches.forEach((br, bi) => {
    const fromS = mainSpaces[nearestIndex(mainSpaces, br.from)];
    const toS = mainSpaces[nearestIndex(mainSpaces, br.to)];
    const pts = [[fromS.x, fromS.z], ...br.via, [toS.x, toS.z]];
    const sampled = curvePts(pts, false).getSpacedPoints(br.count + 1);
    const ids = [];
    let prev = fromS;
    for (let k = 1; k <= br.count; k++) {
      const s = add(sampled[k].x, sampled[k].z, CODE[br.types[k - 1]] || 'blue', `branch${bi}`);
      prev.next.push(s.id);
      s.prev.push(prev.id);
      prev = s;
      ids.push(s.id);
    }
    prev.next.push(toS.id);
    toS.prev.push(prev.id);
    fromS.junction = true;
    fromS.junctionNames = ['Main road', br.name];
    branchIds.push(ids);
  });
  // Junctions must not be special spaces (keeps choices readable).
  for (const s of spaces) if (s.junction && s.type !== 'blue') s.type = 'blue';
  spaces[0].type = 'blue';
  spaces[0].start = true;

  // Star candidates: blue spaces spread out, away from the start.
  const blues = spaces.filter((s) => s.type === 'blue' && !s.start && !s.junction && s.id > 3);
  const cands = [];
  const order = [...blues].sort((a, b) => ((a.id * 7919) % 97) - ((b.id * 7919) % 97));
  for (const s of order) {
    if (cands.every((c) => Math.hypot(c.x - s.x, c.z - s.z) > 11)) cands.push(s);
  }
  const starCandidates = cands.map((s) => s.id);

  // River polyline: named anchors cross exactly between two spaces so bridges fit.
  const bridges = [];
  let river = null;
  if (def.river) {
    const pts = [];
    const lake = def.lake;
    pts.push([lake.x + lake.rx * 0.6, lake.z + 0.5]);
    const via = def.river.via;
    via.forEach((v, vi) => {
      if (typeof v !== 'string') { pts.push(v); return; }
      const prevPt = pts[pts.length - 1];
      const nextPt = via.slice(vi + 1).find((q) => typeof q !== 'string') || prevPt;
      const tx = (prevPt[0] + nextPt[0]) / 2;
      const tz = (prevPt[1] + nextPt[1]) / 2;
      const segs = [];
      if (v === 'crossMain') {
        for (let i = 0; i < def.mainCount; i++) segs.push([spaces[i], spaces[(i + 1) % def.mainCount]]);
      } else {
        const ids = branchIds[Number(v.slice(11))];
        for (let j = 0; j < ids.length - 1; j++) segs.push([spaces[ids[j]], spaces[ids[j + 1]]]);
      }
      let best = null;
      let bd = Infinity;
      for (const [s1, s2] of segs) {
        if (s1.junction || s2.junction) continue;
        const d = Math.hypot((s1.x + s2.x) / 2 - tx, (s1.z + s2.z) / 2 - tz);
        if (d < bd) { bd = d; best = [s1, s2]; }
      }
      const [a, b] = best;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      pts.push([mx, mz]);
      bridges.push({ x: mx, z: mz, angle: Math.atan2(b.x - a.x, b.z - a.z), len: Math.hypot(b.x - a.x, b.z - a.z), a: a.id, b: b.id });
    });
    river = pts;
  }
  return { def, spaces, starCandidates, river, bridges, lake: def.lake, village: def.village || [] };
}
