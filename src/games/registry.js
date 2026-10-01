// Games are auto-discovered: any folder in src/games/ with meta.js + screen.js + controller.js.
const metas = import.meta.glob('./*/meta.js', { eager: true, import: 'default' });
const screens = import.meta.glob('./*/screen.js');
const controllers = import.meta.glob('./*/controller.js');

const allGames = Object.entries(metas)
  .map(([path, meta]) => {
    const dir = path.split('/')[1];
    return {
      ...meta,
      id: meta.id || dir,
      loadScreen: screens[`./${dir}/screen.js`],
      loadController: controllers[`./${dir}/controller.js`],
    };
  })
  .filter((g) => g.loadScreen && g.loadController)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name));

// Hidden games (e.g. the SDK demo) are loadable by id but not listed.
export const games = allGames.filter((g) => !g.hidden);

export function getGame(id) {
  return allGames.find((g) => g.id === id);
}

// What phones need to render the game picker.
export function gameSummaries() {
  return games.map((g) => ({
    id: g.id, name: g.name, emoji: g.emoji, color: g.color, tagline: g.tagline,
    minPlayers: g.minPlayers, maxPlayers: g.maxPlayers,
  }));
}
