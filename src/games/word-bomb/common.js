// Shared between screen and controller.

// Rare letters left out of the alphabet bonus (configurable). The bonus is earned by using every other letter.
export const BONUS_EXCLUDE = 'kqwxyz';
export const BONUS_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((c) => !BONUS_EXCLUDE.includes(c)).join('');
export const MAX_HEARTS = 3;

/** Starting lives: more players => fewer lives so a game stays ~5-10 minutes. */
export function startHearts(n) {
  if (n <= 4) return 3;
  if (n <= 16) return 2;
  return 1;
}

export const HEART_SVG = '<svg viewBox="-1 -1 26 24"><path d="M12 21.5S3.3 15.8 1.2 11C-.5 7 2 2 6.6 2c2.5 0 4.1 1.4 5.4 3.3C13.3 3.4 14.9 2 17.4 2 22 2 24.5 7 22.8 11 20.7 15.8 12 21.5 12 21.5z"/></svg>';

/** Uppercase `text` with the first occurrence of `prompt` wrapped in <span class="hl">. `text` must be [a-z✱]* only. */
export function highlight(text, prompt) {
  const t = String(text || '').toLowerCase();
  const p = String(prompt || '').toLowerCase();
  const i = p ? t.indexOf(p) : -1;
  if (i < 0) return t.toUpperCase();
  return `${t.slice(0, i).toUpperCase()}<span class="hl">${t.slice(i, i + p.length).toUpperCase()}</span>${t.slice(i + p.length).toUpperCase()}`;
}
