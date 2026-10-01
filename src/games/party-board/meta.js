export default {
  id: 'party-board',
  name: 'Party Board',
  tagline: 'Roll the dice, grab the stars, win the minigames',
  emoji: '🎲',
  color: '#ffb020',
  thumbnail: 'thumb.jpg',
  minPlayers: 1,
  maxPlayers: 999, // up to 8 pieces on the board; beyond that players team up and share a piece
  order: 1,
  orientation: 'landscape', // minigames use the landscape gamepad; board screens are laid out for landscape too
};
