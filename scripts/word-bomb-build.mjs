#!/usr/bin/env node
// Builds the Word Bomb dictionary + prompt tiers.
//
//   node scripts/word-bomb-build.mjs
//
// Sources (both free to redistribute):
//   - ENABLE2K word list (public domain)            https://github.com/dolph/dictionary (enable1.txt)
//   - Wordnik wordlist 2021-07-29 (MIT licence)     https://github.com/wordnik/wordlist
//   - a small hand-made supplement of everyday modern words (below)
//
// Output (commit these):
//   public/assets/word-bomb/words.txt     one lowercase a-z word per line, length >= 2
//   public/assets/word-bomb/prompts.json  { easy: [...], medium: [...], hard: [...] } 2-3 letter prompts
//
// Prompt difficulty is measured on the "core" set (words present in BOTH lists) so obscure
// entries don't make a sequence look easier than it is.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BAD_PROMPTS } from '../src/games/word-bomb/blocklist.js';

const OUT = resolve(import.meta.dirname, '..', 'public', 'assets', 'word-bomb');
const CACHE = resolve(import.meta.dirname, 'out', 'word-bomb-cache');
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const SOURCES = {
  enable: 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt',
  wordnik: 'https://raw.githubusercontent.com/wordnik/wordlist/main/wordlist-20210729.txt',
};

const SUPPLEMENT = `
internet internets emoji emojis ok okay wifi selfie selfies email emails emailed emailing online offline website websites
smartphone smartphones app apps blog blogs blogger vlog vlogs podcast podcasts texting texted hashtag hashtags meme memes
google googled googling youtube youtuber tweet tweets tweeted tweeting username usernames password passwords login logout
laptop laptops webcam webcams download downloads upload uploads uploaded streaming livestream livestreams emoticon emoticons
bitcoin crypto gif gifs pixel pixels online app smartwatch playlist playlists unfollow unfriend hoodie hoodies
`;

async function source(name) {
  const file = resolve(CACHE, `${name}.txt`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  process.stdout.write(`downloading ${name}… `);
  const res = await fetch(SOURCES[name]);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text);
  console.log(`${(text.length / 1e6).toFixed(1)} MB`);
  return text;
}

const clean = (text) => text.split(/\r?\n/).map((w) => w.replace(/"/g, '').trim()).filter((w) => /^[a-z]{2,}$/.test(w));

const enable = new Set(clean(await source('enable')));
const wordnik = new Set(clean(await source('wordnik')));
const extra = SUPPLEMENT.split(/\s+/).filter((w) => /^[a-z]{2,}$/.test(w));

const all = new Set([...enable, ...wordnik, ...extra]);
const words = [...all].sort();
writeFileSync(resolve(OUT, 'words.txt'), words.join('\n') + '\n');

// ---- prompts
// Difficulty = geometric mean of two counts over the "core" set:
//   all: core words containing the sequence (captures easy inflections: -ds, -ts, -ed …)
//   base: short (3-7 letter) core words that aren't obvious inflections (what people actually think of)
// so a sequence only counts as easy when it shows up in plenty of everyday short words too ("nb", "uo" don't).
const core = [...enable].filter((w) => wordnik.has(w)).concat(extra);
const countSeqs = (list) => {
  const m = new Map();
  for (const w of list) {
    const seen = new Set();
    for (let len = 2; len <= 3; len++) for (let i = 0; i + len <= w.length; i++) seen.add(w.slice(i, i + len));
    for (const s of seen) m.set(s, (m.get(s) || 0) + 1);
  }
  return m;
};
const allCounts = countSeqs(core);
const baseCounts = countSeqs(core.filter((w) => w.length >= 3 && w.length <= 7 && !/(s|ed|ing|er|est|ly)$/.test(w)));
const tiers = { easy: [], medium: [], hard: [] };
for (const [s, n] of allCounts) {
  if (BAD_PROMPTS.has(s)) continue;
  const score = Math.sqrt(n * (baseCounts.get(s) || 0));
  if (score >= 500) tiers.easy.push(s);
  else if (score >= 200) tiers.medium.push(s);
  else if (score >= 80) tiers.hard.push(s);
}
for (const k of Object.keys(tiers)) tiers[k].sort();
writeFileSync(resolve(OUT, 'prompts.json'), JSON.stringify(tiers));

const kb = (f) => (readFileSync(resolve(OUT, f)).length / 1024).toFixed(0);
console.log(`words.txt   ${words.length} words (${kb('words.txt')} KB)  [enable ${enable.size}, wordnik ${wordnik.size}, core ${core.length}]`);
console.log(`prompts.json easy ${tiers.easy.length}, medium ${tiers.medium.length}, hard ${tiers.hard.length} (${kb('prompts.json')} KB)`);
