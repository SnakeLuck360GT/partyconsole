#!/usr/bin/env node
// Builds public/assets/trivia/questions.json from the Open Trivia Database (https://opentdb.com, CC BY-SA 4.0).
// Uses a session token so no question repeats, pages through each category with amount<=50, and waits
// between requests to respect the 1 request / 5 s per IP rate limit.
//
//   node scripts/trivia-build.mjs            # full fetch (~10-15 minutes)
//   node scripts/trivia-build.mjs --max 200  # stop after ~200 questions (quick test)

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/assets/trivia/questions.json');
const API = 'https://opentdb.com';
const DELAY = 5600;
const args = process.argv.slice(2);
const MAX = args.includes('--max') ? Number(args[args.indexOf('--max') + 1]) : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastReq = 0;
async function get(path) {
  const wait = lastReq + DELAY - Date.now();
  if (wait > 0) await sleep(wait);
  for (let attempt = 0; attempt < 6; attempt++) {
    lastReq = Date.now();
    try {
      const res = await fetch(API + path, { headers: { 'user-agent': 'PartyConsole trivia builder' } });
      if (res.status === 429) { await sleep(DELAY * 2); continue; }
      const json = await res.json();
      if (json.response_code === 5) { await sleep(DELAY * 2); continue; }
      return json;
    } catch (e) {
      console.warn('  request failed:', e.message);
      await sleep(DELAY * 2);
    }
  }
  throw new Error(`giving up on ${path}`);
}

// Named + numeric HTML entities (OpenTDB's default encoding). We request url3986 encoding, which avoids
// entities entirely, but decode anyway in case some questions contain literal entities.
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', Eacute: 'É', egrave: 'è', ecirc: 'ê',
  aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', szlig: 'ß',
  oacute: 'ó', iacute: 'í', uacute: 'ú', ntilde: 'ñ', Ntilde: 'Ñ', ccedil: 'ç', Ccedil: 'Ç', aring: 'å', Aring: 'Å',
  oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…',
  ndash: '–', mdash: '—', deg: '°', shy: '', ocirc: 'ô', icirc: 'î', ucirc: 'û', euml: 'ë', iuml: 'ï', ograve: 'ò',
  ugrave: 'ù', igrave: 'ì', Aacute: 'Á', Oacute: 'Ó', Iacute: 'Í', Uacute: 'Ú', pi: 'π', times: '×', divide: '÷',
  prime: '′', Prime: '″', trade: '™', reg: '®', copy: '©', euro: '€', pound: '£', yen: '¥', cent: '¢', sup2: '²', sup3: '³',
  frac12: '½', frac14: '¼', frac34: '¾', laquo: '«', raquo: '»', middot: '·', bull: '•', micro: 'µ', alpha: 'α', beta: 'β',
  gamma: 'γ', delta: 'δ', Delta: 'Δ', omega: 'Ω', Omega: 'Ω', sigma: 'σ', Sigma: 'Σ', lambda: 'λ', mu: 'μ', le: '≤', ge: '≥',
  ne: '≠', infin: '∞', iexcl: '¡', iquest: '¿', scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž', oelig: 'œ', OElig: 'Œ',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ', yacute: 'ý', Yacute: 'Ý', thorn: 'þ', eth: 'ð', ETH: 'Ð', THORN: 'Þ',
};
export function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+\d*);/g, (m, n) => (n in NAMED ? NAMED[n] : m));
}
const dec = (s) => decodeEntities(decodeURIComponent(s)).replace(/\s+/g, ' ').trim();

// Friendlier category names for TV display.
function prettyCategory(name) {
  return name.replace(/^Entertainment: /, '').replace(/^Science: /, '')
    .replace('Japanese Anime & Manga', 'Anime & Manga')
    .replace('Cartoon & Animations', 'Cartoons')
    .replace('Musicals & Theatres', 'Musicals & Theatre')
    .replace('Science & Nature', 'Science & Nature');
}

async function main() {
  const tok = await get('/api_token.php?command=request');
  const token = tok.token;
  console.log('session token ok');
  const cats = (await get('/api_category.php')).trivia_categories;
  console.log(`${cats.length} categories`);

  const all = [];
  const seen = new Set();
  for (const cat of cats) {
    if (all.length >= MAX) break;
    const count = await get(`/api_count.php?category=${cat.id}`);
    const total = count.category_question_count?.total_question_count ?? 0;
    let got = 0;
    let amount = 50;
    let emptyStreak = 0;
    console.log(`\n${cat.name}: ${total} available`);
    while (got < total && all.length < MAX) {
      const want = Math.min(amount, total - got);
      if (want <= 0) break;
      const r = await get(`/api.php?amount=${want}&category=${cat.id}&token=${token}&encode=url3986`);
      if (r.response_code === 0) {
        for (const q of r.results) {
          const item = {
            category: prettyCategory(cat.name),
            difficulty: dec(q.difficulty),
            type: dec(q.type) === 'boolean' ? 'tf' : 'mc',
            q: dec(q.question),
            correct: dec(q.correct_answer),
            incorrect: q.incorrect_answers.map(dec),
          };
          const key = item.q.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          all.push(item);
        }
        got += r.results.length;
        emptyStreak = 0;
        process.stdout.write(`  +${r.results.length} (${got}/${total}, total ${all.length})\n`);
      } else if (r.response_code === 1 || r.response_code === 4) {
        // Not enough left for this amount (token exhausted for this query). Shrink the page size.
        emptyStreak++;
        if (want <= 1 || emptyStreak > 6) break;
        amount = Math.max(1, Math.floor(want / 2));
      } else if (r.response_code === 3) {
        throw new Error('token lost');
      } else {
        console.warn('  unexpected response', r.response_code);
        break;
      }
    }
    // Save progress after each category so a crash keeps what we have.
    save(all);
  }
  save(all);
  console.log(`\nDONE: ${all.length} questions -> ${OUT}`);
}

function save(all) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(all));
}

if (existsSync(OUT) && !args.includes('--force') && JSON.parse(readFileSync(OUT, 'utf8')).length > 1000) {
  console.log('questions.json already exists with >1000 questions; pass --force to re-fetch.');
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}
