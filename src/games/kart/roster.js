// Selectable drivers, karts and paints + stat maths. Pure data (no three.js) so the phone controller can import it.
// Driver seat placement is in native kart units (Kenney kart ≈ 0.97 W x 1.43 L). `scale` maps the model to a
// seated size that fits the cockpit; `y` sinks models without a sitting clip so their legs hide in the body.
export const DRIVERS = [
  { id: 'oobi', name: 'Oobi', file: 'characters/aliens/alien-oobi.glb', clip: 'drive', weight: 'light', scale: 1, y: 0.215, z: -0.085, color: '#9b6bff' },
  { id: 'oodi', name: 'Oodi', file: 'characters/aliens/alien-oodi.glb', clip: 'drive', weight: 'light', scale: 1, y: 0.215, z: -0.085, color: '#ff6fb5' },
  { id: 'ooli', name: 'Ooli', file: 'characters/aliens/alien-ooli.glb', clip: 'drive', weight: 'light', scale: 1, y: 0.215, z: -0.085, color: '#ffc21a' },
  { id: 'penny', name: 'Penny', file: 'characters/mini/female-b.glb', clip: 'drive', weight: 'light', scale: 1.25, y: 0.2, z: -0.07, color: '#ff8a1f' },
  { id: 'max', name: 'Max', file: 'characters/mini/male-c.glb', clip: 'drive', weight: 'light', scale: 1.2, y: 0.2, z: -0.07, color: '#5c6cff' },
  { id: 'bo', name: 'Bo', file: 'characters/blocky/blocky-b.glb', clip: 'drive', weight: 'medium', scale: 0.36, y: 0.12, z: -0.08, color: '#e8452a' },
  { id: 'shade', name: 'Shade', file: 'characters/blocky/blocky-r.glb', clip: 'drive', weight: 'medium', scale: 0.36, y: 0.12, z: -0.08, color: '#3a3f63' },
  { id: 'panda', name: 'Chef Panda', file: 'characters/critters/panda-chef.glb', clip: 'Sitting_Idle', weight: 'medium', scale: 0.27, y: 0.18, z: -0.1, color: '#e8e2d0' },
  { id: 'bun', name: 'Chef Bun', file: 'characters/critters/rabbit-chef.glb', clip: 'Sitting_Idle', weight: 'medium', scale: 0.24, y: 0.18, z: -0.1, color: '#ffd0ec' },
  { id: 'robo', name: 'Robo', file: 'characters/robot/robot-expressive.glb', clip: 'Sitting', weight: 'heavy', scale: 0.21, y: 0.3, z: -0.12, color: '#ffcc33' },
  { id: 'knight', name: 'Sir Clank', file: 'characters/adventurers/knight.glb', clip: 'Sit_Floor_Idle', weight: 'heavy', scale: 0.36, y: 0.2, z: -0.06, color: '#8a98b8', hide: ['1H_Sword', 'Round_Shield'] },
  { id: 'brute', name: 'Brakka', file: 'characters/adventurers/barbarian.glb', clip: 'Sit_Floor_Idle', weight: 'heavy', scale: 0.36, y: 0.23, z: -0.06, color: '#b86a3a', hide: ['1H_Axe', 'Barbarian_Round_Shield'] },
  { id: 'yeti', name: 'Yeti', file: 'characters/monsters/yeti.glb', clip: 'Idle', weight: 'heavy', scale: 0.3, y: 0.09, z: -0.08, color: '#7fd0ff' },
];

export const KARTS = [
  { id: 'zippy', name: 'Zippy', file: 'vehicles/kart-oobi.glb', accent: [5, 3], stats: { speed: 2, accel: 4.5, handling: 4, weight: 1.5, turbo: 4 } },
  { id: 'cruiser', name: 'Cruiser', file: 'vehicles/kart-oodi.glb', accent: [7, 3], stats: { speed: 3, accel: 3, handling: 3, weight: 3, turbo: 3 } },
  { id: 'sunbolt', name: 'Sunbolt', file: 'vehicles/kart-ooli.glb', accent: [6, 3], stats: { speed: 4, accel: 2.5, handling: 2.5, weight: 3.5, turbo: 2.5 } },
  { id: 'drifter', name: 'Drifter', file: 'vehicles/kart-oopi.glb', accent: [4, 3], stats: { speed: 3, accel: 3, handling: 4.5, weight: 2, turbo: 4.5 } },
  { id: 'brick', name: 'Brick', file: 'vehicles/kart-oozi.glb', accent: [0, 2], stats: { speed: 4.5, accel: 2, handling: 2, weight: 4.5, turbo: 2 } },
];

/** Body paints. 'player' = the player's own colour. */
export const PAINTS = [
  { id: 'player', name: 'My colour', color: null },
  { id: 'red', name: 'Racing red', color: '#e8352e' },
  { id: 'blue', name: 'Ocean blue', color: '#2f7bff' },
  { id: 'green', name: 'Lime', color: '#3fcf4a' },
  { id: 'gold', name: 'Gold', color: '#ffbf1f' },
  { id: 'white', name: 'Pearl', color: '#f2f2f2' },
  { id: 'black', name: 'Midnight', color: '#30323c' },
  { id: 'pink', name: 'Bubblegum', color: '#ff6fb5' },
];

const WEIGHT_MOD = {
  light: { speed: -0.5, accel: 1, handling: 0.75, weight: -1.25, turbo: 0.5 },
  medium: { speed: 0, accel: 0, handling: 0, weight: 0, turbo: 0 },
  heavy: { speed: 1, accel: -0.75, handling: -0.5, weight: 1.75, turbo: -0.5 },
};

/** Combined driver + kart stats on a 0.5..6 scale (3 = average). */
export function combineStats(driver, kart) {
  const m = WEIGHT_MOD[driver?.weight || 'medium'];
  const k = kart?.stats || KARTS[1].stats;
  const out = {};
  for (const key of ['speed', 'accel', 'handling', 'weight', 'turbo']) out[key] = Math.max(0.5, Math.min(6, k[key] + m[key]));
  return out;
}

export const driverById = (id) => DRIVERS.find((d) => d.id === id) || null;
export const kartById = (id) => KARTS.find((k) => k.id === id) || null;
export const paintById = (id) => PAINTS.find((p) => p.id === id) || PAINTS[0];

