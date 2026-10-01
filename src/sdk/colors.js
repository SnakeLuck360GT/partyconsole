// Player colour palette. Beyond 16 players colours cycle with a hue shift so everyone stays distinct-ish.
const BASE = [
  '#ff4d4d', '#3d8bff', '#34d058', '#ffcc00', '#b86bff', '#ff8a1f', '#1fd6d6', '#ff5cc8',
  '#9be15d', '#5c6cff', '#ff7a7a', '#00b894', '#fdcb6e', '#a29bfe', '#e17055', '#74b9ff',
];

export function playerColor(index) {
  if (index < BASE.length) return BASE[index];
  const hue = (index * 137.508) % 360;
  return `hsl(${hue.toFixed(0)} 80% 60%)`;
}

// Numeric 0xRRGGBB, for three.js materials.
export function colorToHex(css) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = css;
  return parseInt(c.fillStyle.slice(1), 16);
}

export const AVATARS = ['🦊', '🐼', '🐸', '🐙', '🦁', '🐧', '🐯', '🐨', '🦄', '🐵', '🐰', '🐻', '🐷', '🐔', '🦖', '🐳',
  '🦉', '🐝', '🦀', '🐢', '🦩', '🐺', '🦝', '🐮'];
