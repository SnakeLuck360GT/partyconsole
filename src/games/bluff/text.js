// Text helpers for Big Fat Liar: normalisation, fuzzy "is this the truth?" matching and duplicate merging.

const NUM = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18',
  nineteen: '19', twenty: '20', thirty: '30', forty: '40', fourty: '40', fifty: '50', sixty: '60', seventy: '70', eighty: '80',
  ninety: '90', hundred: '100',
};
const STOP = new Set(['the', 'a', 'an', 'of', 'its', 'their', 'his', 'her', 'some']);

/** Collapse whitespace, strip control chars, clamp length. What we store and display. */
export function clean(s, max = 45) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Lowercased word tokens with accents, punctuation, articles and plurals stripped, numbers unified. */
export function tokens(s) {
  const t = String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  if (!t) return [];
  return t.split(' ').filter((w) => !STOP.has(w)).map((w) => {
    if (NUM[w]) return NUM[w];
    if (w.length > 3 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
    if (w.length > 3 && w.endsWith('es') && /(ss|sh|ch|x|o)es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
  });
}

/** Compact comparison key: tokens joined without spaces ("Coffee-pot" == "coffee pot" == "coffeepots"). */
export function key(s) { return tokens(s).join(''); }

export function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // Optimal string alignment distance (Levenshtein + adjacent transpositions, so "unicron" ~ "unicorn").
  let pp = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
    }
    pp = prev;
    prev = cur;
  }
  return prev[b.length];
}

function tolerance(len) { return len >= 9 ? 2 : len >= 5 ? 1 : 0; }

/** True when `a` and `b` are the same answer give or take typos/plurals/articles. */
export function same(a, b) {
  const ka = typeof a === 'string' ? key(a) : '';
  const kb = typeof b === 'string' ? key(b) : '';
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  return lev(ka, kb) <= tolerance(Math.min(ka.length, kb.length));
}

/** Is this player's lie actually the truth (or very close to it)? */
export function isTruth(text, fact) {
  const k = key(text);
  if (!k) return false;
  const tt = tokens(text);
  for (const target of [fact.a, ...(fact.alt || [])]) {
    const tk = key(target);
    if (!tk) continue;
    if (k === tk || lev(k, tk) <= tolerance(tk.length)) return true;
    // "a big unicorn" / "unicorn obviously": contains the whole answer plus a word or two.
    const targetToks = tokens(target);
    if (tk.length >= 4 && tt.length <= targetToks.length + 2) {
      const joined = ` ${tt.join(' ')} `;
      if (joined.includes(` ${targetToks.join(' ')} `)) return true;
    }
  }
  return false;
}
