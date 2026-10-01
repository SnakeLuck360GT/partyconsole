// Shared constants for Super Kickoff (screen + controller safe: no three.js imports here).

export const TEAMS = [
  { key: 'blue', name: 'BLUE', short: 'BLU', css: '#2f7bff', dark: '#123a8c', hex: 0x2f7bff, shorts: 0xf2f5ff, side: -1 },
  { key: 'orange', name: 'ORANGE', short: 'ORA', css: '#ff7a1a', dark: '#8c3a06', hex: 0xff7a1a, shorts: 0x1c1f2b, side: 1 },
];

export const MATCH_MINUTES = [2, 3, 5];

// Gameplay tuning (metres, seconds).
export const T = {
  playerRadius: 0.42,
  ballRadius: 0.24,
  speed: 6.2,
  sprintSpeed: 8.9,
  chargeSpeedMul: 0.62,
  withBallMul: 0.93,
  accel: 11,
  turnRate: 13,
  staminaDrain: 0.34,
  staminaRegen: 0.22,
  staminaMinRestart: 0.3,
  chargeTime: 0.95, // seconds from 0 to full power
  gravity: 19,
  bounce: 0.56,
  groundDecel: 3.6, // rolling friction (m/s^2)
  groundDrag: 0.35, // proportional drag on ground (1/s)
  airDrag: 0.06,
  wallBounce: 0.72,
  controlRadius: 1.0,
  keepRadius: 1.45,
  protectTime: 0.4,
  stealRate: 2.2, // per second when an opponent is glued to the ball
  kickLock: 0.3,
  slideTime: 0.42,
  slideSpeed: 12.5,
  tackleCooldown: 1.15,
  foulStun: 1.1,
  tackledStun: 0.75,
};

/** Pitch dimensions scale with the bigger team's size. */
export function pitchFor(teamSize) {
  const n = Math.max(1, teamSize);
  const HL = Math.min(50, 16 + n * 3.4); // half length
  const HW = Math.round(HL * 0.63 * 10) / 10; // half width
  const GW = Math.min(5.2, 2.7 + n * 0.28); // goal half width
  const GH = Math.min(3.0, 2.2 + n * 0.08); // goal height
  return { HL, HW, GW, GH, GD: 2.1, corner: Math.min(5, 2.2 + n * 0.3) };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
