#!/usr/bin/env node
// Checks that the bomb stack (fuse spark, bomb, typing box) never covers any seat's disc, name, hearts or bar,
// for many player counts and TV sizes.   node scripts/word-bomb-layout.mjs
import { computeLayout } from '../src/games/word-bomb/layout.js';

const sizes = [[1280, 720], [1920, 1080], [1024, 768], [1366, 768], [800, 600]];
const counts = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30, 40];
let bad = 0;
const hit = (a, b) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1; // 1px tolerance
for (const [W, H] of sizes) {
  for (const n of counts) {
    const L = computeLayout(W, H, n);
    const { x, y, R } = L.bomb;
    const pillFont = Math.max(16, R * 0.4);
    const stack = [
      { x0: x - R * 1.1, x1: x + R * 1.1, y0: y - R * 1.9, y1: y + R * 1.05 }, // bomb + fuse + spark
      { x0: x - pillFont * 4.5, x1: x + pillFont * 4.5, y0: y + R * 1.28, y1: y + R * 1.28 + pillFont * 1.5 }, // typing box
    ];
    const A = L.A;
    const seatBox = (s) => ({ x0: s.x - A * 0.95, x1: s.x + A * 0.95, y0: s.y - A * 1.25, y1: s.y + A * 1.15 });
    const over = L.seats.filter((s) => stack.some((b) => hit(b, seatBox(s)))).length;
    if (over) { bad++; console.log(`OVERLAP ${W}x${H} n=${n}: ${over} seat(s), R=${R.toFixed(0)}`); }
    else if (W === 1280) console.log(`ok ${W}x${H} n=${String(n).padStart(2)}  bomb R=${R.toFixed(0)}  seat=${A.toFixed(0)}`);
  }
}
console.log(bad ? `${bad} layout(s) overlap` : 'all layouts clear');
process.exit(bad ? 1 : 0);
