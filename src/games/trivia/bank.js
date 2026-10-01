// Question bank: loads Open Trivia DB questions (public/assets/trivia/questions.json) + our closest-number set,
// hands out questions without repeats for the lifetime of the screen session.
import { shuffle } from '../../sdk/screen-kit.js';
import CLOSEST from './closest.js';

const MIXED = 'Mixed Bag';

function usable(q) {
  if (!q || !q.q || !q.correct) return false;
  if (q.q.length > 230) return false;
  const answers = [q.correct, ...(q.incorrect || [])];
  if (q.type === 'mc' && answers.length !== 4) return false;
  if (answers.some((a) => !a || a.length > 64)) return false;
  // Questions that only make sense with the original answer order.
  if (/\b(all of the above|none of the above|all of these|none of these)\b/i.test(answers.join('|'))) return false;
  if (/\b(following|these)\b.*\?/i.test(q.q) && q.type === 'tf') return false;
  return true;
}

export async function loadBank(url) {
  let list = [];
  try {
    const res = await fetch(url);
    list = await res.json();
  } catch (err) {
    console.warn('[trivia] could not load question bank', err);
  }
  return new Bank(list);
}

export class Bank {
  constructor(list) {
    this.mc = [];
    this.tf = [];
    for (const q of list) {
      if (!usable(q)) continue;
      q.q = q.q.replace(/\s+([?.!,])/g, '$1');
      (q.type === 'tf' ? this.tf : this.mc).push(q);
    }
    if (!this.mc.length) this.mc.push(...FALLBACK_MC);
    if (!this.tf.length) this.tf.push(...FALLBACK_TF);
    this.byCat = new Map();
    for (const q of this.mc) {
      if (!this.byCat.has(q.category)) this.byCat.set(q.category, []);
      this.byCat.get(q.category).push(q);
    }
    this.used = new Set();
    this.usedNum = new Set();
    this.recentCats = [];
  }

  get size() { return this.mc.length + this.tf.length + CLOSEST.length; }

  unused(arr) { return arr.filter((q) => !this.used.has(q)); }

  /** n category options for a vote; each has enough unused questions. Sometimes includes "Mixed Bag". */
  categoryOptions(n, need) {
    const cats = [...this.byCat.keys()].filter((c) => this.unused(this.byCat.get(c)).length >= need + 2);
    // Prefer categories not shown recently; weight big categories slightly up so options feel mainstream.
    const fresh = cats.filter((c) => !this.recentCats.includes(c));
    const pool = fresh.length >= n ? fresh : cats;
    const weighted = pool.map((c) => ({ c, w: Math.random() * Math.log(10 + this.byCat.get(c).length) }))
      .sort((a, b) => b.w - a.w).map((x) => x.c);
    const pick = weighted.slice(0, Math.random() < 0.5 ? n - 1 : n);
    if (pick.length < n) pick.push(MIXED);
    this.recentCats = [...pick, ...this.recentCats].slice(0, 10);
    return shuffle(pick);
  }

  /** stage in 0..1 ramps difficulty through the show. */
  pickMC(category, n, stage) {
    const source = category === MIXED || !this.byCat.has(category) ? this.mc : this.byCat.get(category);
    let pool = this.unused(source);
    if (pool.length < n) pool = this.unused(this.mc);
    if (pool.length < n) { this.used.clear(); pool = [...source]; }
    const want = stage < 0.34 ? { easy: 3, medium: 2, hard: 0.4 } : stage < 0.7 ? { easy: 1.5, medium: 3, hard: 1 } : { easy: 1, medium: 3, hard: 2.5 };
    const picked = weightedPick(pool, n, (q) => want[q.difficulty] ?? 1);
    picked.forEach((q) => this.used.add(q));
    return picked.map((q) => {
      const answers = shuffle([q.correct, ...q.incorrect]);
      return { kind: 'mc', category: q.category, difficulty: q.difficulty, text: q.q, choices: answers, correct: answers.indexOf(q.correct) };
    });
  }

  pickTF(n) {
    let pool = this.unused(this.tf);
    if (pool.length < n) { this.tf.forEach((q) => this.used.delete(q)); pool = [...this.tf]; }
    const picked = weightedPick(pool, n, (q) => (q.difficulty === 'hard' ? 0.5 : 1));
    picked.forEach((q) => this.used.add(q));
    return picked.map((q) => ({ kind: 'tf', category: q.category, text: q.q, choices: ['True', 'False'], correct: q.correct === 'True' ? 0 : 1 }));
  }

  pickNum(n) {
    let pool = CLOSEST.filter((q) => !this.usedNum.has(q));
    if (pool.length < n) { this.usedNum.clear(); pool = [...CLOSEST]; }
    const picked = shuffle(pool).slice(0, n);
    picked.forEach((q) => this.usedNum.add(q));
    return picked.map((q) => ({ kind: 'num', category: 'Closest Number', text: q.q, answer: q.a, year: !!q.year, unit: q.unit || '' }));
  }
}

function weightedPick(pool, n, weight) {
  const scored = pool.map((q) => ({ q, k: Math.random() ** (1 / Math.max(0.01, weight(q))) }));
  scored.sort((a, b) => b.k - a.k);
  return scored.slice(0, n).map((s) => s.q);
}

// Only used if questions.json is missing (e.g. offline dev) so the game never softlocks.
const FALLBACK_MC = [
  { category: 'General Knowledge', difficulty: 'easy', type: 'mc', q: 'What is the largest planet in our Solar System?', correct: 'Jupiter', incorrect: ['Saturn', 'Neptune', 'Earth'] },
  { category: 'General Knowledge', difficulty: 'easy', type: 'mc', q: 'What is the chemical symbol for gold?', correct: 'Au', incorrect: ['Ag', 'Gd', 'Go'] },
  { category: 'General Knowledge', difficulty: 'easy', type: 'mc', q: 'How many continents are there?', correct: '7', incorrect: ['5', '6', '8'] },
  { category: 'General Knowledge', difficulty: 'medium', type: 'mc', q: 'Which ocean is the largest?', correct: 'Pacific', incorrect: ['Atlantic', 'Indian', 'Arctic'] },
  { category: 'General Knowledge', difficulty: 'easy', type: 'mc', q: 'What colour do you get by mixing blue and yellow?', correct: 'Green', incorrect: ['Purple', 'Orange', 'Brown'] },
  { category: 'General Knowledge', difficulty: 'medium', type: 'mc', q: 'What is the capital of Australia?', correct: 'Canberra', incorrect: ['Sydney', 'Melbourne', 'Perth'] },
];
const FALLBACK_TF = [
  { category: 'General Knowledge', difficulty: 'easy', type: 'tf', q: 'The Sun is a star.', correct: 'True', incorrect: ['False'] },
  { category: 'General Knowledge', difficulty: 'easy', type: 'tf', q: 'Spiders are insects.', correct: 'False', incorrect: ['True'] },
  { category: 'General Knowledge', difficulty: 'easy', type: 'tf', q: 'Water boils at 100 °C at sea level.', correct: 'True', incorrect: ['False'] },
  { category: 'General Knowledge', difficulty: 'easy', type: 'tf', q: 'Mount Everest is in the Andes.', correct: 'False', incorrect: ['True'] },
  { category: 'General Knowledge', difficulty: 'easy', type: 'tf', q: 'A hexagon has six sides.', correct: 'True', incorrect: ['False'] },
];
