// Original item artwork as inline SVG, shared by the TV HUD and the phone controller.
export const ITEM_INFO = {
  pepper: { name: 'Turbo Pepper', short: 'PEPPER', color: '#ff4a2a' },
  pepper3: { name: 'Triple Peppers', short: 'PEPPER ×3', color: '#ff4a2a' },
  peel: { name: 'Slick Peel', short: 'PEEL', color: '#ffd23a' },
  bouncer: { name: 'Bouncer Shell', short: 'BOUNCER', color: '#2fd06a' },
  homing: { name: 'Homing Shell', short: 'HOMING', color: '#ff3b4f' },
  star: { name: 'Super Star', short: 'STAR', color: '#ffcf1a' },
  zap: { name: 'Zap', short: 'ZAP', color: '#7cc7ff' },
  coins: { name: 'Coin Burst', short: 'COINS', color: '#ffc21a' },
};

const PEPPER = (x = 0, y = 0, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M50 18c6-8 14-10 20-6-6 1-10 4-12 9" fill="none" stroke="#2c9a3a" stroke-width="6" stroke-linecap="round"/>
  <path d="M30 30c10-10 34-10 40 4 6 14-6 34-22 46-12 9-26 12-30 6-3-5 8-10 12-22 4-12-8-26 0-34z" fill="#ff3b1f" stroke="#a3150a" stroke-width="4"/>
  <path d="M40 34c8-4 20-4 24 2" fill="none" stroke="#ffb3a0" stroke-width="5" stroke-linecap="round"/>
  <path d="M30 36c6-4 10-2 14 2-4-1-9 0-14 4z" fill="#3fbf4c"/></g>`;

const SHELL = (fill, dark, glow = '') => `
  ${glow}
  <ellipse cx="50" cy="66" rx="36" ry="12" fill="#f4f4f4" stroke="#9aa0a6" stroke-width="3"/>
  <path d="M14 64c0-26 16-44 36-44s36 18 36 44z" fill="${fill}" stroke="${dark}" stroke-width="4"/>
  <path d="M50 24v40M30 32l8 30M70 32l-8 30M18 50h64" stroke="${dark}" stroke-width="3" opacity=".55" fill="none"/>
  <path d="M30 34c6-6 14-8 20-8" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7" fill="none"/>`;

export const ITEM_SVG = {
  pepper: `<svg viewBox="0 0 100 100">${PEPPER(0, 4)}</svg>`,
  pepper3: `<svg viewBox="0 0 100 100">${PEPPER(-14, 18, 0.72)}${PEPPER(42, 18, 0.72)}${PEPPER(14, -6, 0.78)}</svg>`,
  peel: `<svg viewBox="0 0 100 100">
    <path d="M50 26c-4 14-10 30-30 46 14-2 24-10 30-18 6 8 16 16 30 18-20-16-26-32-30-46z" fill="#ffd23a" stroke="#b88a00" stroke-width="4" stroke-linejoin="round"/>
    <path d="M50 30c-2 14-2 30 0 42 2-12 2-28 0-42z" fill="#fff3b0" stroke="#b88a00" stroke-width="3"/>
    <path d="M46 14h8v14h-8z" fill="#7a5a10"/><ellipse cx="50" cy="80" rx="26" ry="5" fill="#000" opacity=".15"/></svg>`,
  bouncer: `<svg viewBox="0 0 100 100">${SHELL('#2fd06a', '#137a35')}</svg>`,
  homing: `<svg viewBox="0 0 100 100">${SHELL('#ff3b4f', '#9a1020', '<circle cx="50" cy="46" r="42" fill="#ff3b4f" opacity=".18"/>')}
    <circle cx="50" cy="42" r="9" fill="#fff" stroke="#9a1020" stroke-width="3"/><circle cx="50" cy="42" r="3.5" fill="#9a1020"/></svg>`,
  star: `<svg viewBox="0 0 100 100"><defs><linearGradient id="kst" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff27a"/><stop offset=".55" stop-color="#ffcf1a"/><stop offset="1" stop-color="#ff9a00"/></linearGradient></defs>
    <path d="M50 8l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z" fill="url(#kst)" stroke="#c46a00" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="42" cy="44" rx="3.5" ry="7" fill="#3a2a00"/><ellipse cx="58" cy="44" rx="3.5" ry="7" fill="#3a2a00"/></svg>`,
  zap: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#7cc7ff" opacity=".2"/>
    <path d="M58 8L22 56h22l-8 36 40-52H54z" fill="#fff36a" stroke="#c48a00" stroke-width="4" stroke-linejoin="round"/></svg>`,
  coins: `<svg viewBox="0 0 100 100">
    <ellipse cx="34" cy="60" rx="20" ry="22" fill="#ffc21a" stroke="#a86a00" stroke-width="4"/><rect x="30" y="48" width="8" height="24" rx="3" fill="#a86a00" opacity=".6"/>
    <ellipse cx="64" cy="44" rx="20" ry="22" fill="#ffd84a" stroke="#a86a00" stroke-width="4"/><rect x="60" y="32" width="8" height="24" rx="3" fill="#a86a00" opacity=".6"/></svg>`,
  empty: '<svg viewBox="0 0 100 100"></svg>',
};

export const ITEM_KEYS = ['pepper', 'pepper3', 'peel', 'bouncer', 'homing', 'star', 'zap', 'coins'];

/** Small coin glyph for counters. */
export const COIN_SVG = '<svg viewBox="0 0 100 100"><ellipse cx="50" cy="50" rx="38" ry="42" fill="#ffc21a" stroke="#a86a00" stroke-width="8"/><rect x="43" y="26" width="14" height="48" rx="5" fill="#a86a00" opacity=".55"/></svg>';
