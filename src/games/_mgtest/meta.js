// Hidden test harness: runs one Party Board minigame in isolation.
//   screen.html?local=1&room=ABCD&mg=<id|all>&bots=3[&abort=5]
export default {
  id: '_mgtest',
  name: 'Minigame Test',
  tagline: 'Party Board minigame harness',
  emoji: '🧪',
  color: '#ff5cc8',
  minPlayers: 1,
  maxPlayers: 999,
  hidden: true,
};
