// Shared tuning constants for Tank Tussle (screen + controller).
export const CELL = 2;             // world units per grid cell
export const TANK_R = 0.82;        // tank collision radius
export const TANK_LEN = 2.15;      // visual hull length
export const MAX_HP = 3;
export const TANK_SPEED = 5.4;
export const TANK_TURN = 3.6;      // rad/s hull rotation
export const TURRET_TURN = 10;     // rad/s turret rotation
export const FIRE_COOLDOWN = 0.5;
export const MAX_SHELLS = 4;       // own shells in flight
export const SHELL_SPEED = 15;
export const SHELL_R = 0.16;
export const SHELL_LIFE = 3.2;
export const BIG_SHELL_R = 0.3;
export const RESPAWN_TIME = 3;
export const SPAWN_SHIELD = 2;
export const MAX_MINES = 2;
export const MINE_ARM = 1.1;
export const MINE_RADIUS = 2.5;
export const BARREL_RADIUS = 2.9;
export const AIM_FIRE_THRESHOLD = 0.72;

// Cell types
export const EMPTY = 0;
export const WALL = 1;
export const CRATE = 2;
export const BARREL = 3;

export const POWERUPS = {
  triple: { icon: '🔱', name: 'Triple Shot', color: '#ffb02e', ammo: 6 },
  laser: { icon: '⚡', name: 'Laser', color: '#3ef0ff', ammo: 3 },
  big: { icon: '💣', name: 'Big Bouncer', color: '#ff5a3c', ammo: 4 },
  shield: { icon: '🛡️', name: 'Shield', color: '#7c8bff' },
  speed: { icon: '👟', name: 'Speed', color: '#55e05a' },
  heal: { icon: '❤️', name: 'Repair', color: '#ff4d6d' },
};

export const MAPS = {
  desert: { name: 'Desert Base', emoji: '🏜️' },
  snow: { name: 'Snowy Outpost', emoji: '❄️' },
  jungle: { name: 'Jungle Ruins', emoji: '🌴' },
};

export const LENGTHS = {
  quick: { name: 'Quick', time: 120, ffa: 7, team: 12 },
  standard: { name: 'Standard', time: 180, ffa: 12, team: 20 },
  long: { name: 'Long', time: 300, ffa: 20, team: 35 },
};

export const TEAMS = [
  { id: 0, name: 'Red', color: '#ff4d4d', hex: 0xff4d4d },
  { id: 1, name: 'Blue', color: '#3d8bff', hex: 0x3d8bff },
];
