#!/usr/bin/env node
// Generates the procedural sound effects used by Big Fat Liar (drumroll, cymbal, sad trombone, applause)
// into public/assets/bluff/*.wav. Pure synthesis, no third-party samples.  Run: node scripts/bluff-gen-audio.mjs
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SR = 22050;
const out = resolve(import.meta.dirname, '..', 'public', 'assets', 'bluff');

let seed = 1234567;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };

function wav(name, samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const norm = peak > 0 ? 0.89 / peak : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * norm)) * 32767), 44 + i * 2));
  writeFileSync(`${out}/${name}`, buf);
  console.log(name, (buf.length / 1024).toFixed(1), 'KB');
}

// One-pole filters for shaping noise.
function hp(x, a) { let py = 0; let px = 0; return x.map((v) => { const y = a * (py + v - px); px = v; py = y; return y; }); }
function lp(x, a) { let y = 0; return x.map((v) => (y += a * (v - y))); }

// ---- snare drumroll with crescendo (1.9 s) ending on an accent
{
  const dur = 1.9;
  const n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  let t = 0;
  let i = 0;
  while (t < dur - 0.05) {
    const prog = t / dur;
    const vol = 0.18 + 0.82 * prog ** 1.6;
    const start = Math.floor(t * SR);
    const len = Math.floor(0.09 * SR);
    for (let k = 0; k < len && start + k < n; k++) {
      const env = Math.exp(-k / (SR * 0.018));
      const body = Math.sin(2 * Math.PI * (190 + 30 * (i % 2)) * k / SR) * Math.exp(-k / (SR * 0.012));
      s[start + k] += vol * (rnd() * 0.8 * env + body * 0.35);
    }
    t += 1 / (17 + 6 * prog) * (1 + 0.08 * rnd());
    i++;
  }
  wav('drumroll.wav', hp(Array.from(s), 0.97));
}

// ---- crash cymbal + kick (1.4 s)
{
  const n = Math.floor(SR * 1.4);
  const noise = Array.from({ length: n }, () => rnd());
  const bright = hp(noise, 0.8);
  const s = bright.map((v, k) => {
    const env = Math.exp(-k / (SR * 0.38));
    const kick = Math.sin(2 * Math.PI * (60 + 90 * Math.exp(-k / (SR * 0.03))) * k / SR) * Math.exp(-k / (SR * 0.12));
    return v * env * 0.7 + kick * 0.9;
  });
  wav('crash.wav', s);
}

// ---- sad trombone: wah... wah... wah... wahhhh
{
  const notes = [[233.1, 0.42], [220.0, 0.42], [207.7, 0.42], [196.0, 1.25]];
  const total = notes.reduce((a, [, d]) => a + d, 0) + 0.1;
  const n = Math.floor(SR * total);
  const s = new Float32Array(n);
  let off = 0;
  let phase = 0;
  notes.forEach(([f, d], ni) => {
    const len = Math.floor(d * SR);
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      const last = ni === notes.length - 1;
      const vib = last && t > 0.25 ? Math.sin(2 * Math.PI * 5.5 * t) * 6 : 0;
      const bend = -f * 0.03 * Math.min(1, t / d);
      phase += 2 * Math.PI * (f + vib + bend) / SR;
      const att = Math.min(1, t / 0.04);
      const rel = Math.min(1, (d - t) / 0.08);
      const wah = 0.55 + 0.45 * Math.min(1, t / 0.15);
      // brassy: sum of harmonics with brightness following the "wah" envelope
      let v = 0;
      for (let h = 1; h <= 7; h++) v += Math.sin(phase * h) * (wah ** (h - 1)) / h;
      s[off + k] += v * att * rel * 0.5;
    }
    off += len;
  });
  wav('trombone.wav', lp(Array.from(s), 0.35));
}

// ---- applause (2.2 s): hundreds of little claps
{
  const dur = 2.2;
  const n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  for (let c = 0; c < 900; c++) {
    const t = Math.random() * (dur - 0.05);
    const start = Math.floor(t * SR);
    const env = Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.7);
    const vol = (0.3 + Math.random() * 0.7) * env;
    const len = Math.floor(0.012 * SR);
    for (let k = 0; k < len && start + k < n; k++) s[start + k] += rnd() * vol * Math.exp(-k / (SR * 0.003));
  }
  wav('applause.wav', lp(hp(Array.from(s), 0.9), 0.6));
}
