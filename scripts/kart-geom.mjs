#!/usr/bin/env node
// Kart Chaos track geometry audit (no browser): tightest corner radius vs wall distance, places where two
// different parts of the loop come close enough for their walls to overlap (projection ambiguity / holes),
// slopes, and feature placement (item rows, boost pads, jumps on the road).
//   node scripts/kart-geom.mjs
import { TRACKS } from '../src/games/kart/tracks.js';
import { Track } from '../src/games/kart/track.js';

let bad = 0;
for (const def of TRACKS) {
  const t = new Track(def);
  const N = t.N;
  let minR = Infinity; let minRAt = 0;
  for (let i = 0; i < N; i++) { const c = Math.abs(t.curv[i]); if (c > 1e-6 && 1 / c < minR) { minR = 1 / c; minRAt = i; } }
  // non-adjacent proximity (more than 3 wall widths apart along the loop)
  let minGap = Infinity; let gapAt = null;
  const skip = Math.ceil((t.wallDist * 6) / t.seg);
  for (let i = 0; i < N; i += 2) {
    for (let j = 0; j < N; j += 2) {
      let d = Math.abs(i - j); d = Math.min(d, N - d);
      if (d < skip) continue;
      const g = Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]);
      if (g < minGap) { minGap = g; gapAt = [i, j]; }
    }
  }
  let maxSlope = 0;
  for (let i = 0; i < N; i++) maxSlope = Math.max(maxSlope, Math.abs(t.slope[i]));
  const issues = [];
  if (minR < t.wallDist + 2) issues.push(`corner radius ${minR.toFixed(1)} m < wall distance ${t.wallDist} (+2)`);
  if (minGap < 2 * t.wallDist + 6) issues.push(`two parts of the loop only ${minGap.toFixed(1)} m apart at s=${(gapAt[0] * t.seg).toFixed(0)}/${(gapAt[1] * t.seg).toFixed(0)}`);
  if (maxSlope > 0.2) issues.push(`slope ${maxSlope.toFixed(2)}`);
  for (const b of t.boosts) if (Math.abs(b.lat) + b.half > t.halfWidth) issues.push(`boost pad at s=${b.s.toFixed(0)} pokes off the road`);
  for (const j of t.jumps) if (j.half > t.halfWidth) issues.push(`jump at s=${j.s.toFixed(0)} wider than road`);
  for (const it of t.items) if (2 * 3.2 + 1 > t.halfWidth) issues.push(`item row at s=${it.s.toFixed(0)} too wide`);
  // features too close to the start line or to each other
  const feats = [...t.items.map((x) => ['items', x.s]), ...t.jumps.map((x) => ['jump', x.s]), ...t.boosts.map((x) => ['boost', x.s])];
  for (let a = 0; a < feats.length; a++) for (let b = a + 1; b < feats.length; b++) {
    if (Math.abs(t.deltaS(feats[a][1], feats[b][1])) < 12) issues.push(`${feats[a][0]} and ${feats[b][0]} overlap near s=${feats[a][1].toFixed(0)}`);
  }
  console.log(`${def.id.padEnd(8)} L=${t.L.toFixed(0)}m  minR=${minR.toFixed(1)}m (s=${(minRAt * t.seg).toFixed(0)})  minGap=${minGap.toFixed(1)}m  maxSlope=${maxSlope.toFixed(3)}  ${issues.length ? 'ISSUES: ' + issues.join('; ') : 'ok'}`);
  bad += issues.length;
}
process.exit(bad ? 1 : 0);
