// Guess matching, hint masks and prompt ideas.

export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const squash = (s) => s.replace(/ /g, '');

export function lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** 'correct' | 'close' | 'wrong' | 'empty' */
export function judge(guess, word) {
  const gn = norm(guess).replace(/^(a|an|the) /, '');
  const g = squash(gn);
  const w = squash(norm(word).replace(/^(a|an|the) /, ''));
  if (!g) return 'empty';
  if (g === w) return 'correct';
  if (g === `${w}s` || g === `${w}es` || w === `${g}s` || w === `${g}es`) return 'close';
  if (w.length >= 3 && g.length >= 2 && lev(g, w) <= 1) return 'close';
  if (w.length >= 4 && g.includes(w)) return 'close'; // contains the answer, hide it from the feed
  return 'wrong';
}

export const isLetter = (ch) => /[a-z0-9]/i.test(ch);

/** e.g. "ice cream" with {2} revealed → "__e _____" */
export function makeMask(word, revealed) {
  return [...word].map((ch, i) => (isLetter(ch) ? (revealed.has(i) ? ch.toLowerCase() : '_') : ch)).join('');
}

export function letterCount(word) {
  return word.split(' ').map((w) => [...w].filter(isLetter).length).filter(Boolean).join(', ');
}

// ---------------------------------------------------------------- Telephone prompt ideas

const WHO = ['a grumpy cat', 'a tiny dragon', 'a nervous penguin', 'grandma', 'a robot chef', 'a sleepy bear', 'a pirate duck',
  'a giant snail', 'a dancing banana', 'an alien tourist', 'a shy ghost', 'a very strong ant', 'a wizard frog', 'a surfing cow',
  'a knight', 'a confused octopus', 'a baby dinosaur', 'a sneaky raccoon', 'a pizza delivery shark', 'a superhero hamster',
  'a vampire bunny', 'a cowboy snowman', 'a ballerina hippo', 'a detective dog', 'a unicorn', 'a caveman', 'an astronaut'];
const DOING = ['eating spaghetti', 'riding a skateboard', 'stuck in a tree', 'on the moon', 'lifting weights', 'taking a bubble bath',
  'playing the drums', 'at a job interview', 'hiding from the rain', 'building a snowman', 'flying a kite', 'in a traffic jam',
  'winning a medal', 'baking a giant cake', 'scared of a mouse', 'on a roller coaster', 'walking a pet rock', 'painting a portrait',
  'sneezing fire', 'at the dentist', 'juggling eggs', 'lost in the jungle', 'doing yoga', 'surfing a huge wave', 'having a picnic',
  'stuck in a washing machine', 'singing karaoke', 'riding a giant chicken', 'chasing a donut', 'opening a mysterious present'];

export function promptIdeas(n = 6, rnd = Math.random) {
  const out = new Set();
  let guard = 0;
  while (out.size < n && guard++ < 100) {
    out.add(`${WHO[Math.floor(rnd() * WHO.length)]} ${DOING[Math.floor(rnd() * DOING.length)]}`);
  }
  return [...out];
}
