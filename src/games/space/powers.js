// Power-ups (shared by screen + controller).
export const POWERS = {
  laser: { name: 'Laser Beam', icon: '⚡', color: '#ff3d6e', uses: 1, hint: 'FIRE for a huge laser' },
  triple: { name: 'Triple Shot', icon: '🔱', color: '#ffb020', uses: 3, hint: 'Next 3 shots spread' },
  shield: { name: 'Shield', icon: '🛡️', color: '#4dd2ff', uses: 0, hint: 'Blocks one hit' },
  mines: { name: 'Mines', icon: '💣', color: '#ff7a3a', uses: 3, hint: 'FIRE drops a mine' },
  missile: { name: 'Homing Missile', icon: '🎯', color: '#ff5cc8', uses: 1, hint: 'FIRE a seeker' },
  freeze: { name: 'Freeze Ray', icon: '❄️', color: '#8fe8ff', uses: 2, hint: 'Freeze a rival' },
};
export const POWER_IDS = Object.keys(POWERS);
