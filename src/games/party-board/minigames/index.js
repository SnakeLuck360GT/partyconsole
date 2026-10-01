// Auto-discovers minigames: every ./<name>.js (not starting with "_") with a default export.
// See ./README.md for the contract.
const mods = import.meta.glob(['./*.js', '!./index.js', '!./_*.js'], { eager: true, import: 'default' });
export const minigames = Object.values(mods).filter((m) => m && m.id && typeof m.run === 'function');
