// Blast Arena: three.js diorama for the simulation (tiles, characters, bombs, power-ups, sudden-death blocks).
import { THREE, loadModel, tint, makeLabel, animator } from '../../sdk/three-kit.js';
import { T, DX, DY } from './sim.js';

export const THEMES = {
  garden: {
    name: 'Garden', icon: '🌿', bg: 0xa9dcff, ground: 0x6bb04a,
    floor: ['#86c95c', '#7abf52'], grout: 'rgba(40,80,20,0.18)', rough: 0.95, metal: 0,
    pillar: { url: 'nature/bush-2-a.glb', size: 0.98, height: 0.95 },
    crate: { url: 'props/cube-crate.glb', size: 0.84 },
    border: { url: 'props/minigame/tile-small-forest.glb', size: 1.0, height: 0.85 },
    debris: [0xc8955a, 0xa8743f, 0xe0b47a],
    deco: [['nature/tree-1-a.glb', 2.2], ['nature/tree-3-a.glb', 2.0], ['nature/tree-2-a.glb', 1.6], ['platformer/flowers.glb', 0.8], ['nature/k-flower-red-a.glb', 0.35], ['nature/k-mushroom-red-group.glb', 0.5]],
    tagline: 'Classic rules. Hide behind the hedges!',
  },
  factory: {
    name: 'Factory', icon: '🏭', bg: 0x2b3342, ground: 0x3b4250,
    floor: ['#5b6472', '#545d6b'], grout: 'rgba(10,14,20,0.45)', rough: 0.55, metal: 0.35,
    pillar: { url: 'props/minigame/tile-small-yellow.glb', size: 0.98, height: 0.95 },
    crate: { url: 'platformer/crate-strong.glb', size: 0.86 },
    border: { url: 'props/minigame/tile-small-blue.glb', size: 1.0, height: 0.9, tintMat: 'Blue', tintColor: 0x5a6678 },
    debris: [0xb9c2cf, 0x8a94a3, 0xd8a15a],
    deco: [['platformer/barrel.glb', 0.6], ['props/kaykit-platformer/pipe-straight-a-blue.glb', 0.9], ['platformer/crate-strong.glb', 0.7], ['props/minigame/tile-small-desert.glb', 0.8]],
    tagline: 'Conveyor belts carry players AND bombs!',
  },
  ice: {
    name: 'Ice', icon: '❄️', bg: 0xcfe9ff, ground: 0xeef6ff,
    floor: ['#bfe3fb', '#b2dcf7'], grout: 'rgba(255,255,255,0.55)', rough: 0.12, metal: 0.05,
    pillar: { url: 'platformer/block-snow.glb', size: 0.98, height: 0.95 },
    crate: { url: 'props/minigame/powerup-block-blue.glb', size: 0.84 },
    border: { url: 'platformer/block-snow.glb', size: 1.0, height: 0.85 },
    debris: [0xdff3ff, 0xa6d8f5, 0xffffff],
    deco: [['platformer/tree-pine.glb', 1.3], ['nature/tree-4-a.glb', 1.8], ['nature/q-rock-1.glb', 0.8], ['platformer/rocks.glb', 0.7]],
    tagline: 'Slippery floor: you slide until you stop!',
  },
};
export const THEME_ORDER = ['garden', 'factory', 'ice'];

export const CHARACTERS = [
  'characters/monsters/dino.glb', 'characters/monsters/frog.glb', 'characters/monsters/yeti.glb', 'characters/monsters/cactoro.glb',
  'characters/monsters/alien.glb', 'characters/monsters/blue-demon.glb', 'characters/monsters/mushroom-king.glb', 'characters/monsters/orc.glb',
];

export const PU_STYLE = {
  bomb: { color: 0x3d7bff, url: 'props/minigame/powerup-bomb.glb', size: 0.42, emoji: '💣' },
  fire: { color: 0xff6a1a, url: null, size: 0.42, emoji: '🔥' },
  speed: { color: 0xffc400, url: 'props/minigame/lightning.glb', size: 0.44, emoji: '⚡' },
  kick: { color: 0x2fcf6a, url: 'props/minigame/ball-red.glb', size: 0.36, emoji: '🦶' },
  shield: { color: 0xff4d8b, url: 'props/minigame/heart-red.glb', size: 0.42, emoji: '🛡️' },
  remote: { color: 0xb46bff, url: 'props/minigame/button-red.glb', size: 0.44, emoji: '📡' },
  skull: { color: 0x6a1b9a, url: 'characters/critters/skull.glb', size: 0.42, emoji: '💀' },
};

const BOMB_URL = 'props/minigame/bomb-red.glb';
const BLOCK_URL = 'props/cube-bricks.glb';
const BELT_URL = 'platformer/conveyor-belt.glb';

/** Scale/offset a model so it fits a footprint of `size` (x/z) and sits on y=0, centred. */
function fit(obj, size, height) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const s = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const k = size / Math.max(s.x, s.z);
  const ky = height ? height / s.y : k;
  const wrap = new THREE.Group();
  obj.position.set(-c.x, -box.min.y, -c.z);
  wrap.add(obj);
  wrap.scale.set(k, ky, k);
  const outer = new THREE.Group();
  outer.add(wrap);
  outer.userData.height = s.y * ky;
  return outer;
}

/** Turn a (static) model into a set of InstancedMeshes, one per sub-mesh. */
class Instancer {
  constructor(template, max, { castShadow = true, receiveShadow = true } = {}) {
    this.group = new THREE.Group();
    this.parts = [];
    this.max = max;
    template.updateMatrixWorld(true);
    template.traverse((o) => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, max);
      im.castShadow = castShadow;
      im.receiveShadow = receiveShadow;
      im.count = 0;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.group.add(im);
      this.parts.push({ im, local: o.matrixWorld.clone() });
    });
    this.tmp = new THREE.Matrix4();
    this.count = 0;
  }

  set(i, m) {
    for (const p of this.parts) {
      this.tmp.multiplyMatrices(m, p.local);
      p.im.setMatrixAt(i, this.tmp);
    }
  }

  setCount(n) {
    this.count = n;
    for (const p of this.parts) { p.im.count = n; p.im.instanceMatrix.needsUpdate = true; }
  }

  touch() { for (const p of this.parts) p.im.instanceMatrix.needsUpdate = true; }

  dispose() { this.group.removeFromParent(); for (const p of this.parts) p.im.dispose(); }
}

function floorTexture(W, H, theme, sim) {
  const px = 48;
  const c = document.createElement('canvas');
  c.width = W * px;
  c.height = H * px;
  const g = c.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let col = theme.floor[(x + y) % 2];
    if (sim.theme === 'ice' && !sim.ice[i]) col = (x + y) % 2 ? '#f4f9ff' : '#ffffff';
    g.fillStyle = col;
    g.fillRect(x * px, y * px, px, px);
    // Subtle per-tile noise
    for (let k = 0; k < 10; k++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.025 + Math.random() * 0.03})`;
      const r = 3 + Math.random() * 9;
      g.beginPath();
      g.arc(x * px + Math.random() * px, y * px + Math.random() * px, r, 0, 7);
      g.fill();
    }
    if (sim.theme === 'garden' && Math.random() < 0.5) {
      g.strokeStyle = 'rgba(40,90,20,0.25)';
      g.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const bx = x * px + 6 + Math.random() * (px - 12);
        const by = y * px + 10 + Math.random() * (px - 14);
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + (Math.random() - 0.5) * 4, by - 6); g.stroke();
      }
    }
    if (sim.theme === 'factory') {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      for (const [ox, oy] of [[5, 5], [px - 5, 5], [5, px - 5], [px - 5, px - 5]]) { g.beginPath(); g.arc(x * px + ox, y * px + oy, 2, 0, 7); g.fill(); }
    }
    if (sim.theme === 'ice' && sim.ice[i] && Math.random() < 0.5) {
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1.5;
      g.beginPath();
      const sx = x * px + Math.random() * px;
      const sy = y * px + Math.random() * px;
      g.moveTo(sx, sy);
      g.lineTo(sx + (Math.random() - 0.5) * 30, sy + (Math.random() - 0.5) * 30);
      g.stroke();
    }
    g.strokeStyle = theme.grout;
    g.lineWidth = 2;
    g.strokeRect(x * px + 1, y * px + 1, px - 2, px - 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function chevronTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,210,60,0.95)';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(18, 12); g.lineTo(40, 32); g.lineTo(18, 52);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function flameIcon() {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = Math.sin(Math.PI * Math.pow(t, 0.75)) * 0.5 * (1 - t * 0.35);
    pts.push(new THREE.Vector2(Math.max(0.001, r), t * 1.5));
  }
  const geo = new THREE.LatheGeometry(pts, 20);
  const g = new THREE.Group();
  const outer = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff5a14, emissive: 0xff3a00, emissiveIntensity: 0.9, roughness: 0.4 }));
  const inner = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc000, emissiveIntensity: 1.2, roughness: 0.4 }));
  inner.scale.setScalar(0.62);
  inner.position.set(0, 0.02, 0.18);
  g.add(outer, inner);
  outer.castShadow = true;
  return g;
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function emojiSprite(emoji, size = 0.5) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  g.font = '72px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 48, 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.setScalar(size);
  s.renderOrder = 998;
  return s;
}

/** Load all GLBs the game needs (in parallel). */
export async function loadAssets(ctx) {
  const url = (p) => ctx.sharedAsset(p);
  const want = new Set([BOMB_URL, BLOCK_URL, BELT_URL, ...CHARACTERS]);
  for (const th of Object.values(THEMES)) {
    want.add(th.pillar.url); want.add(th.crate.url); want.add(th.border.url);
    th.deco.forEach(([u]) => want.add(u));
  }
  Object.values(PU_STYLE).forEach((p) => p.url && want.add(p.url));
  const models = {};
  await Promise.all([...want].map(async (p) => {
    try { models[p] = await loadModel(url(p)); } catch (err) { console.warn('bomber: failed to load', p, err); models[p] = null; }
  }));
  return { models, clone: (p) => (models[p] ? loadModel(url(p)) : Promise.resolve(null)) };
}

// ---------------------------------------------------------------------------------------------- avatar
class Avatar {
  constructor(view, template, player, scale) {
    this.view = view;
    this.player = player;
    this.root = new THREE.Group();
    const model = template;
    this.model = model;
    tint(model, player.colorHex, '_Main$');
    const holder = fit(model, 1, null);
    // Normalise by height (arms make the footprint misleading).
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const h = box.max.y - box.min.y;
    holder.scale.setScalar(0.92 / h);
    this.body = new THREE.Group();
    this.body.add(holder);
    this.root.add(this.body);
    this.anim = animator(model);
    this.anim.play('Idle');
    // Colour ring on the floor
    const ring = new THREE.Mesh(view.ringGeo, new THREE.MeshBasicMaterial({ color: player.colorHex, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.renderOrder = 3;
    this.ring = ring;
    this.root.add(ring);
    this.label = makeLabel(player.name, { color: '#fff', bg: hexCss(player.colorHex, 0.85), size: 44, height: 0.32 * scale });
    this.label.position.y = 1.25;
    this.root.add(this.label);
    // Shield bubble
    this.bubble = new THREE.Mesh(view.bubbleGeo, view.bubbleMat);
    this.bubble.position.y = 0.48;
    this.bubble.visible = false;
    this.root.add(this.bubble);
    // Curse icon
    this.curse = emojiSprite('💀', 0.42);
    this.curse.position.y = 1.62;
    this.curse.visible = false;
    this.root.add(this.curse);
    this.state = 'idle';
    this.yaw = 0;
    this.dead = false;
    this.deadT = 0;
    this.squash = 0;
    this.hitFlash = 0;
    view.group.add(this.root);
  }

  setAnim(name, opts) {
    if (this.state === name) return;
    this.state = name;
    const map = { idle: 'Idle', run: 'Run', walk: 'Walk', death: 'Death', win: 'Wave', hit: 'HitReact', yes: 'Yes' };
    this.anim.play(map[name] || name, opts);
  }

  update(dt, p, t) {
    const v = this.view;
    const [wx, wz] = v.world(p.x, p.y);
    this.root.position.x = wx;
    this.root.position.z = wz;
    if (!this.dead) {
      const target = Math.atan2(DX[p.facing], DY[p.facing]);
      let d = target - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 16);
      this.body.rotation.y = this.yaw;
      if (!this.override) {
        if (p.moving) this.setAnim(p.curse === 'slow' ? 'walk' : 'run', { timeScale: 0.9 + p.speedLvl * 0.12 });
        else this.setAnim('idle');
      }
      this.bubble.visible = p.shield || p.invuln > 0;
      if (this.bubble.visible) {
        this.bubble.scale.setScalar(1 + Math.sin(t * 6) * 0.04);
        this.bubble.material.opacity = p.shield ? 0.35 : 0.2 * (Math.sin(t * 30) > 0 ? 1 : 0.2);
      }
      this.body.visible = !(p.invuln > 0 && !p.shield && Math.sin(t * 40) < -0.3);
      this.curse.visible = !!p.curse;
      if (p.curse) this.curse.position.y = 1.62 + Math.sin(t * 5) * 0.06;
      this.ring.material.opacity = 0.75 + Math.sin(t * 4) * 0.15;
    } else {
      this.deadT += dt;
      if (this.deadT > 1.6) {
        const k = Math.max(0, 1 - (this.deadT - 1.6) / 0.5);
        this.body.scale.setScalar(k);
        if (k <= 0 && this.root.visible) {
          this.root.visible = false;
          v.fx.poof(wx, wz, 10, [0.8, 0.8, 0.85]);
        }
      }
      this.ring.material.opacity = Math.max(0, 0.8 - this.deadT);
      this.label.material.opacity = Math.max(0, 1 - this.deadT * 0.6);
    }
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 4);
      const s = Math.sin(this.squash * Math.PI) * 0.18;
      this.body.scale.set(1 + s, 1 - s, 1 + s);
    }
    this.anim.update(dt);
  }

  die() {
    this.dead = true;
    this.deadT = 0;
    this.bubble.visible = false;
    this.curse.visible = false;
    this.override = true;
    this.anim.play('Death', { loop: false, fade: 0.1 });
    this.state = 'death';
  }

  dispose() { this.root.removeFromParent(); this.label.material.map?.dispose(); this.label.material.dispose(); this.curse.material.map?.dispose(); }
}

function hexCss(hex, a = 1) {
  return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
}

// ---------------------------------------------------------------------------------------------- view
export class ArenaView {
  constructor(stage, assets, fx) {
    this.stage = stage;
    this.assets = assets;
    this.fx = fx;
    this.scene = stage.scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.ringGeo = new THREE.RingGeometry(0.3, 0.42, 32);
    this.bubbleGeo = new THREE.SphereGeometry(0.62, 24, 16);
    this.bubbleMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x3fb8ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false });
    this.chevron = chevronTexture();
    this.avatars = new Map();
    this.bombs = new Map();
    this.powerups = new Map();
    this.warnings = new Map();
    this.fallers = [];
    this.templates = {};
    this.camBase = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.insets = { left: 0, right: 0, top: 0, bottom: 0 };
    this.time = 0;
    // prepare fitted templates for props
    const m = assets.models;
    const mk = (url, size, height) => (m[url] ? fit(m[url].clone(), size, height) : null);
    this.templates.bomb = mk(BOMB_URL, 0.66);
    this.templates.block = mk(BLOCK_URL, 0.98, 0.98);
    this.templates.belt = mk(BELT_URL, 1.0, 0.3);
    this.puTemplates = {};
    for (const [k, s] of Object.entries(PU_STYLE)) this.puTemplates[k] = s.url ? m[s.url] : null;
  }

  world(x, y) { return [x - (this.W - 1) / 2, y - (this.H - 1) / 2]; }

  /** Build the arena for a fresh round. players: Map id -> platform player */
  async build(sim, players) {
    this.clear();
    this.sim = sim;
    this.W = sim.W;
    this.H = sim.H;
    const theme = THEMES[sim.theme];
    this.theme = theme;
    const { W, H } = this;
    const m = this.assets.models;
    this.scene.background = new THREE.Color(theme.bg);
    this.scene.fog = new THREE.Fog(theme.bg, 40 + W, 90 + W * 2);

    this.round = new THREE.Group();
    this.group.add(this.round);

    // Ground + floor
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * 6 + 40, H * 6 + 40), new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.round.add(ground);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(W, H, theme, sim), roughness: theme.rough, metalness: theme.metal });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.round.add(floor);
    // Low plinth under the playfield so it reads as a diorama
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, 0.5, H + 2.4), new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.ground).multiplyScalar(0.75), roughness: 0.9 }));
    plinth.position.y = -0.26;
    plinth.receiveShadow = true;
    this.round.add(plinth);

    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3(1, 1, 1);
    const P = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);

    // Border ring
    const bt = m[theme.border.url] ? fit(m[theme.border.url].clone(), theme.border.size, theme.border.height) : null;
    if (bt && theme.border.tintMat) tint(bt, theme.border.tintColor, theme.border.tintMat);
    if (bt) {
      const cells = [];
      for (let x = -1; x <= W; x++) { cells.push([x, -1]); cells.push([x, H]); }
      for (let y = 0; y < H; y++) { cells.push([-1, y]); cells.push([W, y]); }
      const inst = new Instancer(bt, cells.length);
      cells.forEach(([x, y], i) => {
        const [wx, wz] = this.world(x, y);
        M.compose(P.set(wx, 0, wz), Q.identity(), S.set(1, 1, 1));
        inst.set(i, M);
      });
      inst.setCount(cells.length);
      this.round.add(inst.group);
    }

    // Pillars
    const pt = m[theme.pillar.url] ? fit(m[theme.pillar.url].clone(), theme.pillar.size, theme.pillar.height) : null;
    let np = 0;
    for (let i = 0; i < W * H; i++) if (sim.grid[i] === T.PILLAR) np++;
    if (pt) {
      const inst = new Instancer(pt, np);
      let k = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (sim.grid[y * W + x] !== T.PILLAR) continue;
        const [wx, wz] = this.world(x, y);
        Q.setFromAxisAngle(Y, (((x * 7 + y * 13) % 4) * Math.PI) / 2);
        M.compose(P.set(wx, 0, wz), Q, S.set(1, 1, 1));
        inst.set(k++, M);
      }
      inst.setCount(k);
      this.round.add(inst.group);
    }

    // Crates (instanced; slot per cell so we can hide them individually)
    const ct = m[theme.crate.url] ? fit(m[theme.crate.url].clone(), theme.crate.size) : null;
    this.crateSlot = new Map();
    if (ct) {
      const cells = [];
      for (let i = 0; i < W * H; i++) if (sim.grid[i] === T.CRATE) cells.push(i);
      this.crates = new Instancer(ct, Math.max(1, cells.length));
      cells.forEach((i, k) => {
        const x = i % W;
        const y = Math.floor(i / W);
        const [wx, wz] = this.world(x, y);
        Q.setFromAxisAngle(Y, ((x * 3 + y * 5) % 4) * Math.PI / 2 + (Math.random() - 0.5) * 0.08);
        M.compose(P.set(wx, 0, wz), Q, S.set(1, 1, 1));
        this.crates.set(k, M);
        this.crateSlot.set(i, { k, wx, wz, q: Q.clone(), t: -1 });
      });
      this.crates.setCount(cells.length);
      this.round.add(this.crates.group);
    }

    // Conveyor belts
    this.beltStrips = [];
    if (sim.theme === 'factory' && this.templates.belt) {
      const cells = [];
      for (let i = 0; i < W * H; i++) if (sim.belt[i] >= 0) cells.push(i);
      const inst = new Instancer(this.templates.belt, Math.max(1, cells.length), { castShadow: false });
      const chevMat = new THREE.MeshBasicMaterial({ map: this.chevron, transparent: true, depthWrite: false });
      this.chevMat = chevMat;
      const chevGeo = new THREE.PlaneGeometry(0.9, 0.9);
      chevGeo.rotateX(-Math.PI / 2);
      cells.forEach((i, k) => {
        const x = i % W;
        const y = Math.floor(i / W);
        const d = sim.belt[i];
        const [wx, wz] = this.world(x, y);
        // model's belt runs along its X axis
        const yaw = d === 1 ? 0 : d === 3 ? Math.PI : d === 2 ? -Math.PI / 2 : Math.PI / 2;
        Q.setFromAxisAngle(Y, yaw);
        M.compose(P.set(wx, -0.22, wz), Q, S.set(1, 1, 1));
        inst.set(k, M);
        const ch = new THREE.Mesh(chevGeo, chevMat);
        ch.position.set(wx, 0.095, wz);
        ch.rotation.y = yaw;
        ch.renderOrder = 4;
        this.round.add(ch);
      });
      inst.setCount(cells.length);
      this.round.add(inst.group);
    }

    // Sudden-death blocks
    this.blockSlots = 0;
    if (this.templates.block) {
      this.blocks = new Instancer(this.templates.block, W * H);
      this.blocks.setCount(0);
      this.round.add(this.blocks.group);
    }
    this.warnGeo = this.warnGeo || new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);

    // Decoration around the arena
    this.decorate(theme, sim);

    // Characters
    const scale = W >= 21 ? 1.5 : W >= 17 ? 1.25 : 1;
    this.labelScale = scale;
    const tasks = [];
    for (const [id] of sim.players) {
      const pl = players.get(id);
      if (!pl) continue;
      const url = CHARACTERS[pl.index % CHARACTERS.length];
      tasks.push(this.assets.clone(url).then((obj) => {
        if (!obj || this.sim !== sim) return;
        const a = new Avatar(this, obj, pl, scale);
        this.avatars.set(id, a);
        const p = sim.players.get(id);
        a.update(0, p, 0);
      }));
    }
    await Promise.all(tasks);

    // Shadow camera covering the map
    const sun = this.stage.sun;
    const r = Math.max(W, H) * 0.75 + 3;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 200 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.position.set(W * 0.35, 30, H * 0.6 + 8);
    sun.target.position.set(0, 0, 0);
    this.fitCamera();
  }

  decorate(theme, sim) {
    const { W, H } = this;
    const m = this.assets.models;
    const rng = sim.rng;
    const spots = [];
    // Place along a band 1.5..5 tiles outside the border, sparser at the front (camera side).
    const count = Math.round((W + H) * 1.6);
    for (let k = 0; k < count * 3 && spots.length < count; k++) {
      const side = Math.floor(rng() * 4);
      const d = 2.2 + rng() * 4.5;
      let x; let z;
      if (side === 0) { x = (rng() - 0.5) * (W + 8); z = -(H / 2 + d); }
      else if (side === 1) { x = (rng() - 0.5) * (W + 8); z = H / 2 + d; if (rng() < 0.6) continue; }
      else if (side === 2) { x = -(W / 2 + d); z = (rng() - 0.5) * (H + 8); }
      else { x = W / 2 + d; z = (rng() - 0.5) * (H + 8); }
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 1.4)) continue;
      spots.push([x, z]);
    }
    for (const [x, z] of spots) {
      const [url, size] = theme.deco[Math.floor(rng() * theme.deco.length)];
      const src = m[url];
      if (!src) continue;
      const o = fit(src.clone(), size * (0.8 + rng() * 0.5));
      o.position.set(x, 0, z);
      o.rotation.y = rng() * Math.PI * 2;
      o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      this.round.add(o);
    }
  }

  /** Fit the whole map into the viewport region not covered by HUD (insets in px). */
  fitCamera(insets = this.insets) {
    this.insets = insets;
    if (!this.W) return;
    const cam = this.stage.camera;
    const el = this.stage.renderer.domElement;
    const w = el.clientWidth || 1280;
    const h = el.clientHeight || 720;
    cam.aspect = w / h;
    cam.fov = 38;
    cam.updateProjectionMatrix();
    const pitch = THREE.MathUtils.degToRad(58);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const hw = this.W / 2 + 1.1;
    const hh = this.H / 2 + 1.1;
    const pts = [];
    for (const x of [-hw, hw]) for (const z of [-hh, hh]) for (const y of [0, 1.2]) pts.push(new THREE.Vector3(x, y, z));
    // NDC bounds from insets
    const xMin = -1 + 2 * insets.left / w;
    const xMax = 1 - 2 * insets.right / w;
    const yMax = 1 - 2 * insets.top / h;
    const yMin = -1 + 2 * insets.bottom / h;
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const target = new THREE.Vector3(0, 0, 0.3);
    let lo = 3;
    let hi = 200;
    const v = new THREE.Vector3();
    for (let it = 0; it < 30; it++) {
      const d = (lo + hi) / 2;
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      // allow off-centre framing by shifting the projection (view offset) instead of moving the camera
      let ok = true;
      for (const p of pts) {
        v.copy(p).project(cam);
        const px = v.x + cx;
        const py = v.y + cy;
        if (px < xMin || px > xMax || py < yMin || py > yMax) { ok = false; break; }
      }
      if (ok) hi = d; else lo = d;
    }
    cam.position.copy(target).addScaledVector(dir, hi * 1.02);
    cam.lookAt(target);
    // Shift the rendered image so the map centre lands in the middle of the free region.
    cam.setViewOffset(w, h, -cx * w / 2, cy * h / 2, w, h);
    cam.updateProjectionMatrix();
    this.camBase.copy(cam.position);
    this.fx.updateScale();
  }

  // --------------------------------------------------------------------------------------- events
  onEvent(e) {
    const sim = this.sim;
    switch (e.t) {
      case 'bomb': this.addBomb(e.bomb); break;
      case 'explode': {
        const [wx, wz] = this.world(e.x, e.y);
        const b = this.bombs.get(e.bombId);
        if (b) { b.root.removeFromParent(); this.bombs.delete(e.bombId); }
        this.fx.explosion(wx, wz, e.arms, [[0, -1], [1, 0], [0, 1], [-1, 0]]);
        break;
      }
      case 'bombCrushed': {
        const b = this.bombs.get(e.bomb.id);
        if (b) { b.root.removeFromParent(); this.bombs.delete(e.bomb.id); }
        break;
      }
      case 'crate': {
        const i = e.y * this.W + e.x;
        const s = this.crateSlot.get(i);
        if (s) s.t = 0; // animate break
        const [wx, wz] = this.world(e.x, e.y);
        this.fx.debrisBurst(wx, 0.4, wz, this.theme.debris, 14, 1);
        break;
      }
      case 'powerup': this.addPowerup(e); break;
      case 'pickup':
      case 'burn': {
        const i = e.y * this.W + e.x;
        const pu = this.powerups.get(i);
        if (pu) {
          this.powerups.delete(i);
          pu.root.removeFromParent();
          const [wx, wz] = this.world(e.x, e.y);
          const c = new THREE.Color(PU_STYLE[pu.type].color);
          if (e.t === 'pickup') this.fx.sparkle(wx, 0.6, wz, [c.r, c.g, c.b], 30);
          else if (!e.silent) this.fx.poof(wx, wz, 6, [0.4, 0.4, 0.4]);
        }
        if (e.t === 'pickup') { const a = this.avatars.get(e.pid); if (a) a.squash = 1; }
        break;
      }
      case 'death': {
        const a = this.avatars.get(e.pid);
        if (a) a.die();
        const [wx, wz] = this.world(e.x, e.y);
        this.fx.sparkle(wx, 0.7, wz, [1, 1, 1], 20);
        break;
      }
      case 'leave': {
        const a = this.avatars.get(e.pid);
        if (a) {
          const [wx, wz] = this.world(e.x, e.y);
          this.fx.poof(wx, wz, 16);
          a.dispose();
          this.avatars.delete(e.pid);
        }
        break;
      }
      case 'shieldPop': {
        const p = sim.players.get(e.pid);
        const a = this.avatars.get(e.pid);
        if (p && a) {
          const [wx, wz] = this.world(p.x, p.y);
          this.fx.sparkle(wx, 0.6, wz, [0.5, 0.85, 1], 36);
          a.override = true;
          a.setAnim('hit', { loop: false, fade: 0.05 });
          setTimeout(() => { a.override = false; }, 500);
        }
        break;
      }
      case 'kick': {
        const b = this.bombs.get(e.bomb.id);
        if (b) b.squash = 1;
        break;
      }
      case 'blockDrop': this.dropBlock(e); break;
      case 'blockLand': this.landBlock(e); break;
      default:
    }
  }

  addBomb(b) {
    const tpl = this.templates.bomb;
    if (!tpl) return;
    const o = tpl.clone(true);
    const owner = this.sim.players.get(b.owner);
    const av = this.avatars.get(b.owner);
    const col = av ? av.player.colorHex : 0xff4444;
    tint(o, col, '^Red$');
    // Individual black material for the pulse glow
    const mats = [];
    o.traverse((c) => {
      if (!c.isMesh) return;
      c.castShadow = true;
      if (/black/i.test(c.material.name)) { c.material = c.material.clone(); c.material.emissive = new THREE.Color(0xff2200); c.material.emissiveIntensity = 0; mats.push(c.material); }
    });
    const root = new THREE.Group();
    root.add(o);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: b.remote ? 0x66aaff : 0xffaa33, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(0.35);
    glow.position.y = (tpl.userData.height || 0.8) + 0.02;
    root.add(glow);
    this.group.add(root);
    this.bombs.set(b.id, { root, model: o, mats, glow, bomb: b, t: 0, squash: 0, top: glow.position.y, owner });
  }

  addPowerup(e) {
    const style = PU_STYLE[e.type];
    const root = new THREE.Group();
    const base = new THREE.Mesh(this.puBaseGeo || (this.puBaseGeo = new THREE.CylinderGeometry(0.36, 0.4, 0.08, 28)),
      new THREE.MeshStandardMaterial({ color: style.color, emissive: style.color, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1 }));
    base.position.y = 0.05;
    base.receiveShadow = true;
    root.add(base);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: style.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
    glow.scale.setScalar(1.35);
    glow.position.y = 0.4;
    root.add(glow);
    const iconHolder = new THREE.Group();
    iconHolder.position.y = 0.42;
    root.add(iconHolder);
    let icon = null;
    let anim = null;
    if (e.type === 'fire') {
      icon = fit(flameIcon(), style.size);
    } else if (this.puTemplates[e.type]) {
      const src = this.puTemplates[e.type];
      const c = e.type === 'skull' ? null : src.clone(true);
      if (c) icon = fit(c, style.size);
    }
    if (e.type === 'skull') {
      // skinned, needs a proper clone
      this.assets.clone(style.url).then((obj) => {
        if (!obj || !root.parent) return;
        const f = fit(obj, style.size);
        f.position.y = -0.2;
        iconHolder.add(f);
        const a = animator(obj);
        a.play('Idle');
        const pu = this.powerups.get(e.y * this.W + e.x);
        if (pu) pu.anim = a;
      });
    } else if (icon) {
      icon.position.y = -0.2;
      iconHolder.add(icon);
    }
    const [wx, wz] = this.world(e.x, e.y);
    root.position.set(wx, 0, wz);
    root.scale.setScalar(0.01);
    this.group.add(root);
    const from = e.fromX !== undefined ? this.world(e.fromX, e.fromY) : null;
    this.powerups.set(e.y * this.W + e.x, { root, iconHolder, glow, type: e.type, t: 0, anim, from, to: [wx, wz], phase: Math.random() * 6 });
  }

  dropBlock(e) {
    const [wx, wz] = this.world(e.x, e.y);
    const warn = new THREE.Mesh(this.warnGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false }));
    warn.position.set(wx, 0.03, wz);
    warn.renderOrder = 5;
    this.round.add(warn);
    const slot = this.blockSlots++;
    this.fallers.push({ x: e.x, y: e.y, wx, wz, t: 0, dur: e.dur, slot, warn });
  }

  landBlock(e) {
    const [wx, wz] = this.world(e.x, e.y);
    const f = this.fallers.find((o) => o.x === e.x && o.y === e.y);
    if (f) {
      f.landed = true;
      f.t = f.dur;
      f.warn.removeFromParent();
      f.warn.material.dispose();
    }
    if (e.wasCrate) {
      const s = this.crateSlot.get(e.y * this.W + e.x);
      if (s) s.t = 0;
    }
    this.fx.debrisBurst(wx, 0.05, wz, [0xb03a2e, 0x8e2c22, 0x999999], 6, 0.6);
    this.fx.poof(wx, wz, 5, [0.75, 0.72, 0.7]);
    this.fx.shake = Math.min(0.25, this.fx.shake + 0.06);
  }

  // --------------------------------------------------------------------------------------- frame
  update(dt, t) {
    this.time = t;
    const sim = this.sim;
    if (!sim) return;
    const M = new THREE.Matrix4();
    const S = new THREE.Vector3();
    const P = new THREE.Vector3();
    for (const [id, a] of this.avatars) {
      const p = sim.players.get(id);
      if (p) a.update(dt, p, t);
    }
    // Bombs: position, pulse, fuse sparks
    for (const b of this.bombs.values()) {
      const bb = b.bomb;
      b.t += dt;
      const [wx, wz] = this.world(bb.x, bb.y);
      b.root.position.set(wx, 0, wz);
      const left = bb.remote ? 1 : Math.max(0, bb.fuse / bb.fuseMax);
      const freq = bb.remote ? 3 : 4 + (1 - left) * 14;
      const pulse = Math.sin(b.t * freq) * (0.05 + (1 - left) * 0.08);
      const drop = Math.min(1, b.t / 0.18);
      const land = drop < 1 ? 0.6 + drop * 0.4 : 1;
      let sx = land + pulse;
      let sy = (drop < 1 ? 1.25 - drop * 0.25 : 1) - pulse * 0.6;
      if (b.squash > 0) { b.squash = Math.max(0, b.squash - dt * 5); sx += b.squash * 0.2; sy -= b.squash * 0.2; }
      b.model.scale.set(sx, sy, sx);
      for (const m of b.mats) m.emissiveIntensity = bb.remote ? 0.1 : (1 - left) ** 2 * (0.6 + 0.4 * Math.sin(b.t * freq * 2)) * 1.4;
      b.glow.position.y = b.top * sy;
      b.glow.scale.setScalar(0.28 + Math.random() * 0.14);
      if (bb.slide !== null && bb.slide !== undefined) {
        b.model.rotation.x += DY[bb.slide] * dt * 12;
        b.model.rotation.z -= DX[bb.slide] * dt * 12;
      }
      if (!bb.remote && Math.random() < 0.6) this.fx.fuseSpark(wx, b.top * sy + 0.02, wz);
    }
    // Crates breaking (scale down + pop)
    if (this.crates) {
      let touched = false;
      for (const [i, s] of this.crateSlot) {
        if (s.t < 0) continue;
        s.t += dt;
        const k = Math.max(0, 1 - s.t / 0.22);
        M.compose(P.set(s.wx, 0.02, s.wz), s.q, S.set(1 + (1 - k) * 0.25, k, 1 + (1 - k) * 0.25).multiplyScalar(k > 0 ? 1 : 0));
        this.crates.set(s.k, M);
        touched = true;
        if (k <= 0) this.crateSlot.delete(i);
      }
      if (touched) this.crates.touch();
    }
    // Power-ups bob / spin / pop in
    for (const pu of this.powerups.values()) {
      pu.t += dt;
      const pop = Math.min(1, pu.t / 0.35);
      const e = 1 + 1.7 * Math.pow(pop - 1, 3) + 0.7 * Math.pow(pop - 1, 2);
      pu.root.scale.setScalar(Math.max(0.01, e));
      if (pu.from && pu.t < 0.5) {
        const k = pu.t / 0.5;
        pu.root.position.x = pu.from[0] + (pu.to[0] - pu.from[0]) * k;
        pu.root.position.z = pu.from[1] + (pu.to[1] - pu.from[1]) * k;
        pu.root.position.y = Math.sin(k * Math.PI) * 1.5;
      } else {
        pu.root.position.set(pu.to[0], 0, pu.to[1]);
      }
      pu.iconHolder.position.y = 0.46 + Math.sin(t * 3 + pu.phase) * 0.08;
      pu.iconHolder.rotation.y += dt * 1.6;
      pu.glow.material.opacity = 0.55 + Math.sin(t * 5 + pu.phase) * 0.25;
      pu.anim?.update(dt);
    }
    // Falling sudden-death blocks
    if (this.blocks) {
      let touched = false;
      const Q = new THREE.Quaternion();
      for (let k = this.fallers.length - 1; k >= 0; k--) {
        const f = this.fallers[k];
        if (!f.landed) {
          f.t += dt;
          const u = Math.min(1, f.t / f.dur);
          f.warn.material.opacity = 0.15 + 0.45 * u * (0.6 + 0.4 * Math.sin(t * 30));
          const y = (1 - u * u) * 9;
          M.compose(P.set(f.wx, y, f.wz), Q, S.set(1, 1, 1));
          this.blocks.set(f.slot, M);
        } else {
          f.bounce = (f.bounce || 0) + dt;
          const s = 1 + Math.sin(Math.min(1, f.bounce / 0.2) * Math.PI) * 0.12;
          M.compose(P.set(f.wx, 0, f.wz), Q, S.set(s, 2 - s, s));
          this.blocks.set(f.slot, M);
          if (f.bounce > 0.2) this.fallers.splice(k, 1);
        }
        touched = true;
      }
      if (this.blocks.count !== this.blockSlots) this.blocks.setCount(this.blockSlots);
      else if (touched) this.blocks.touch();
    }
    if (this.chevMat) this.chevron.offset.x = -((t * 1.7) % 1);
    // Camera shake
    const cam = this.stage.camera;
    const sh = this.fx.shake;
    cam.position.set(
      this.camBase.x + (Math.random() - 0.5) * sh * 0.5,
      this.camBase.y + (Math.random() - 0.5) * sh * 0.5,
      this.camBase.z + (Math.random() - 0.5) * sh * 0.3,
    );
  }

  celebrate(id) {
    const a = this.avatars.get(id);
    if (!a || a.dead) return;
    a.override = true;
    a.setAnim('win');
    a.body.rotation.y = 0;
    a.yaw = 0;
  }

  clear() {
    for (const a of this.avatars.values()) a.dispose();
    this.avatars.clear();
    for (const b of this.bombs.values()) b.root.removeFromParent();
    this.bombs.clear();
    for (const p of this.powerups.values()) p.root.removeFromParent();
    this.powerups.clear();
    this.fallers.length = 0;
    this.blockSlots = 0;
    this.chevMat = null;
    if (this.round) {
      this.round.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        if (o.geometry && o.geometry !== this.warnGeo && !o.userData.shared && o.geometry.type !== 'BufferGeometry') o.geometry.dispose?.();
      });
      this.round.removeFromParent();
      this.round = null;
    }
    this.crates = null;
    this.blocks = null;
    this.sim = null;
    this.fx.clear();
  }
}
