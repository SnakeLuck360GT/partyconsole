// Track definitions. Each track is a closed loop through control points [x, y, z] (y = elevation).
// The first point is the start/finish line; the race runs in list order.
// Features are placed with `at: [x, z]` (snapped to the nearest centreline sample) and a lateral offset.

export const TRACKS = [
  {
    id: 'meadow',
    name: 'Sunny Meadow',
    emoji: '🌻',
    blurb: 'Rolling hills, a creek jump and cheering crowds',
    difficulty: 'Easy',
    theme: {
      sky: [0x2f8cff, 0x9fd4ff], // zenith, horizon
      fog: [150, 420],
      sun: 0xfff1d6, sunIntensity: 2.6, hemi: [0xdff0ff, 0x5a7a3a, 0.9],
      ground: [0x6fbf4a, 0x5aa83c, 0x88cc55], // base, dark, light
      shoulder: 0x8fce5d,
      asphalt: '#4a4e57',
      wall: 'redwhite',
      night: false,
      hills: 9,
      water: -1.0, waterDeep: 0x0f6cc0, waterShallow: 0x3fe0cf, sand: 0xe8d9a0,
      sunAz: 0.28, clouds: 30, seed: 3,
      mountains: [
        { color: 0x7d9ccf, height: 125, freq: 3, haze: 0.5, snow: true },
        { color: 0x4f9a5c, height: 62, freq: 6, haze: 0.3 },
      ],
    },
    halfWidth: 9.5,
    shoulder: 3.5,
    points: [
      // (the dip after the hilltop is split into two gentle bends: one sharp V was tighter than the walls)
      [0, 0, 0], [70, 0, 0], [118, 0.5, 22], [136, 3, 78], [112, 6, 128], [62, 7, 144], [28, 5.5, 126], [4, 4.5, 128],
      [-24, 3, 144], [-62, 1, 160], [-118, 0, 132], [-142, 0, 72], [-122, 0, 22], [-70, 0, 0],
    ],
    boosts: [{ at: [100, 10], lat: 0 }, { at: [-80, 155], lat: -3 }, { at: [-138, 90], lat: 3 }],
    jumps: [{ at: [-36, 150], h: 1.7, len: 9, half: 5 }],
    items: [{ at: [40, 0] }, { at: [132, 60] }, { at: [40, 128] }, { at: [-132, 110] }],
    decor: {
      trees: ['nature/tree-1-a.glb', 'nature/tree-1-c.glb', 'nature/tree-2-a.glb', 'nature/tree-3-a.glb', 'nature/tree-4-a.glb', 'nature/q-tree.glb', 'nature/q-tree-fruit.glb'],
      bushes: ['nature/bush-1-a.glb', 'nature/bush-2-a.glb', 'nature/bush-3-a.glb', 'nature/q-bush.glb', 'nature/q-bush-fruit.glb'],
      small: ['nature/k-flower-purple-a.glb', 'nature/k-flower-red-a.glb', 'nature/k-flower-yellow-a.glb', 'nature/k-mushroom-red-group.glb', 'nature/grass-1-c.glb', 'nature/q-grass-2.glb'],
      rocks: ['nature/rock-3-a.glb', 'nature/rock-3-h.glb', 'nature/q-rock-1.glb'],
      clouds: true,
      treeDensity: 1,
    },
  },
  {
    id: 'canyon',
    name: 'Desert Canyon',
    emoji: '🌵',
    blurb: 'Climb the mesa, then leap off the cliff edge',
    difficulty: 'Medium',
    theme: {
      sky: [0x3a86e8, 0xffcf9a],
      fog: [160, 430],
      sun: 0xffe0b0, sunIntensity: 2.9, hemi: [0xffe6c8, 0x9a5a30, 0.8],
      ground: [0xe0a86a, 0xc98a50, 0xeec08a],
      shoulder: 0xd9b07a,
      asphalt: '#5a5250',
      wall: 'orangewhite',
      night: false,
      hills: 16,
      water: -1.6, waterDeep: 0x0f7f9a, waterShallow: 0x4ff0d0, sand: 0xf0d090,
      sunAz: 0.62, clouds: 9, seed: 9, cloudShade: 'rgba(255,205,170,0.9)', groundHaze: 0xe8b483,
      mountains: [
        { color: 0xc98a62, height: 120, mesa: true, haze: 0.5 },
        { color: 0xb0603a, height: 58, mesa: true, haze: 0.22 },
      ],
    },
    halfWidth: 9.5,
    shoulder: 3,
    points: [
      [0, 0, 0], [80, 0, 0], [130, 1.5, -30], [152, 5, -90], [124, 10, -142], [62, 14, -154], [8, 14.5, -126],
      [-26, 12.5, -84], [-72, 6, -92], [-122, 3, -132], [-172, 0.5, -104], [-176, 0, -40], [-124, 0, 10], [-60, 0, 8],
    ],
    boosts: [{ at: [104, -10], lat: -3 }, { at: [150, -70], lat: 2 }, { at: [-150, -125], lat: 0 }],
    jumps: [{ at: [-12, -106], h: 1.9, len: 10, half: 6 }],
    items: [{ at: [44, 0] }, { at: [145, -110] }, { at: [-48, -86] }, { at: [-176, -70] }],
    decor: {
      trees: ['nature/k-cactus-tall.glb', 'nature/k-cactus-short.glb', 'props/minigame/tree-desert.glb', 'nature/k-tree-palm-tall.glb', 'nature/tree-bare-1-a.glb'],
      bushes: ['nature/k-cactus-short.glb', 'nature/bush-4-a.glb', 'nature/tree-bare-2-a.glb'],
      small: ['space/rock-2.glb', 'space/rock-3.glb', 'nature/q-grass-1.glb'],
      rocks: ['space/rock-large-1.glb', 'space/rock-large-2.glb', 'space/rock-large-3.glb', 'nature/q-rock-platform-tall.glb', 'nature/q-rock-platforms-large.glb', 'space/rock-4.glb'],
      bigRocks: true,
      treeDensity: 0.55,
    },
  },
  {
    id: 'frost',
    name: 'Frostbite Night',
    emoji: '❄️',
    blurb: 'Neon-lit hairpins through snowy pines after dark',
    difficulty: 'Hard',
    theme: {
      sky: [0x060b24, 0x28336a],
      fog: [110, 360],
      sun: 0x9fb8ff, sunIntensity: 1.5, hemi: [0x8aa0ff, 0x223044, 0.75],
      ground: [0xe8f0ff, 0xc4d2ea, 0xffffff],
      shoulder: 0xd6e2f5,
      asphalt: '#34384a',
      wall: 'neon',
      night: true,
      hills: 12,
      water: -0.9, ice: true, waterDeep: 0x5f8fc8, waterShallow: 0xd8ecff, sand: 0xdde8f8,
      sunAz: 0.35, seed: 4, groundHaze: 0x1b2450,
      mountains: [
        { color: 0x34487e, height: 150, freq: 4, haze: 0.35, snow: true },
        { color: 0x1d2a56, height: 75, freq: 7, haze: 0.15, snow: true },
      ],
    },
    halfWidth: 9.5,
    shoulder: 3,
    points: [
      // hairpins widened to a >= 16 m radius so the inner wall never folds over itself
      [0, 0, 0], [60, 0, 0], [98, 0.5, -22], [110, 2.5, -70], [92, 4, -100], [62, 5, -106], [36, 6, -96], [14, 6.5, -104],
      [0, 7, -128], [-18, 7, -160], [-70, 5, -178], [-112, 3, -142], [-104, 1, -90], [-90, 0, -46], [-56, 0, -8],
    ],
    boosts: [{ at: [104, -50], lat: 0 }, { at: [-40, -172], lat: 2 }, { at: [-30, 3], lat: -3 }],
    jumps: [{ at: [-106, -115], h: 1.6, len: 9, half: 5 }],
    items: [{ at: [34, 0] }, { at: [88, -95] }, { at: [-8, -140] }, { at: [-92, -52] }],
    decor: {
      trees: ['nature/tree-4-a.glb', 'nature/tree-4-c.glb', 'platformer/tree-pine.glb', 'props/minigame/tree-forest.glb'],
      bushes: ['nature/tree-4-a.glb', 'platformer/tree-pine.glb'],
      small: ['nature/rock-1-a.glb', 'nature/q-rock-2.glb'],
      rocks: ['nature/rock-1-j.glb', 'nature/rock-2-a.glb', 'nature/rock-2-e.glb'],
      frost: true,
      treeDensity: 1.2,
    },
  },
];

export function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
