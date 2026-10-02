// Seat ring + bomb placement for the TV (pure, so scripts/word-bomb-layout.mjs can verify clearances in node).
import { superellipsePoints } from './render.js';

export function computeLayout(W, H, n) {
  const cx = W / 2;
  const cy = H * 0.53;
  let specs;
  if (n <= 18) specs = [{ a: W * 0.39, b: H * 0.345, n: 2, count: n, phase: n === 1 ? 0.75 : n === 2 ? 0.25 : 0 }];
  else if (n <= 30) specs = [{ a: W * 0.43, b: H * 0.37, n: 2.8, count: n, phase: 0 }];
  else {
    const outer = Math.ceil(n * 0.58);
    specs = [{ a: W * 0.44, b: H * 0.39, n: 2.8, count: outer, phase: 0 }, { a: W * 0.28, b: H * 0.225, n: 2.2, count: n - outer, phase: 0.5 }];
  }
  const rings = specs.map((s) => ({ ...s, ...superellipsePoints(cx, cy, s.a, s.b, s.n, Math.max(1, s.count), s.phase) }));
  let A = Math.min(H * 0.13, W * 0.075);
  for (const r of rings) if (r.count > 1) A = Math.min(A, (r.perimeter / r.count) * 0.52);
  A = Math.max(22, A);
  const R0 = Math.min(W * 0.07, n > 30 ? H * 0.072 : n > 18 ? H * 0.095 : H * 0.115);
  const seats = [];
  for (const r of rings) for (let i = 0; i < r.count; i++) seats.push({ x: r.points[i][0], y: r.points[i][1] });
  // Fit the bomb stack (fuse spark on top, typing box underneath) between the seats in its column, so it never
  // covers a name, hearts or progress bar. A seat block is centred on its point: ~1.25A above (disc + turn ring), ~1.15A below (hearts + bar).
  const colHalf = Math.max(R0 * 1.2, Math.max(16, R0 * 0.4) * 4.5) + A * 1.0; // bomb or typing box, whichever is wider
  let top = H * 0.13;
  let bottom = H * 0.97;
  for (const s of seats) {
    if (Math.abs(s.x - cx) > colHalf) continue;
    if (s.y < cy) top = Math.max(top, s.y + A * 1.15);
    else bottom = Math.min(bottom, s.y - A * 1.25);
  }
  const UP = 1.9; // fuse tip + spark above the centre, in R
  const DOWN = 2.0; // typing box below the centre, in R
  const avail = Math.max(0, bottom - top);
  const R = Math.max(30, Math.min(R0, avail / (UP + DOWN)));
  const by = top + UP * R + Math.max(0, avail - (UP + DOWN) * R) * 0.45;
  return { W, H, cx, cy, rings, A, seats, bomb: { x: cx, y: by, R } };
}
