// Constants shared by the Brain Brawl screen and phone controller.

export const ANSWER_STYLE = [
  { key: 'A', color: '#e5484d', dark: '#9c1f2a', shape: '▲' },
  { key: 'B', color: '#2f7cf6', dark: '#153f8c', shape: '◆' },
  { key: 'C', color: '#f0a020', dark: '#94580a', shape: '●' },
  { key: 'D', color: '#1fb96b', dark: '#0d6b3c', shape: '■' },
];

export const TF_STYLE = [
  { key: 'T', label: 'TRUE', color: '#1fb96b', dark: '#0d6b3c', shape: '✔' },
  { key: 'F', label: 'FALSE', color: '#e5484d', dark: '#9c1f2a', shape: '✖' },
];

export const LENGTHS = {
  short: { label: 'Short', mins: '≈ 6 min' },
  normal: { label: 'Normal', mins: '≈ 11 min' },
  long: { label: 'Long', mins: '≈ 16 min' },
};

// Friendly display for Open Trivia DB categories (+ our own).
const CAT = {
  'General Knowledge': ['🧠', '#8b5cf6'],
  Books: ['📚', '#c2410c'],
  Film: ['🎬', '#dc2626'],
  Music: ['🎵', '#db2777'],
  'Musicals & Theatre': ['🎭', '#be185d'],
  Television: ['📺', '#7c3aed'],
  'Video Games': ['🎮', '#2563eb'],
  'Board Games': ['🎲', '#059669'],
  'Science & Nature': ['🔬', '#0d9488'],
  Computers: ['💻', '#0284c7'],
  Mathematics: ['➗', '#4f46e5'],
  Mythology: ['⚡', '#b45309'],
  Sports: ['⚽', '#16a34a'],
  Geography: ['🌍', '#0891b2'],
  History: ['🏛️', '#a16207'],
  Politics: ['🗳️', '#475569'],
  Art: ['🎨', '#e11d48'],
  Celebrities: ['🌟', '#d97706'],
  Animals: ['🦁', '#65a30d'],
  Vehicles: ['🚗', '#dc2626'],
  Comics: ['💥', '#ea580c'],
  Gadgets: ['📱', '#0369a1'],
  'Anime & Manga': ['🍥', '#e11d48'],
  Cartoons: ['🐭', '#9333ea'],
  'Mixed Bag': ['🎁', '#f59e0b'],
  'Closest Number': ['🎯', '#0ea5e9'],
};

export function catStyle(name) {
  const [emoji, color] = CAT[name] || ['❓', '#6366f1'];
  return { name, emoji, color };
}

export function fmtNum(n, year = false) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (year) return String(n);
  return Number(n).toLocaleString('en-US');
}
