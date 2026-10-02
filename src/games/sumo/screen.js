// Sumo Smash — TV screen. Authoritative simulation + rendering + round flow.
import { createStage, THREE, loadGLTF } from '../../sdk/three-kit.js';
import { trackInput, countdown, escapeHtml, sleep } from '../../sdk/screen-kit.js';
import { sfx } from '../../sdk/audio.js';
import { createSim, makeFighter, ARENA_ORDER, ARENA_RULES, arenaRadius } from './sim.js';
import { createEnvironment, SEA_Y } from './env.js';
import { buildArena } from './arenas.js';
import { loadSpecies, createFighterView, SPECIES } from './fighters.js';
import { createFX } from './fx.js';
import { createHUD } from './hud.js';
import { createSounds } from './sounds.js';

const DECOR = [
  'nature/tree-3-a.glb', 'nature/bush-2-a.glb', 'nature/k-flower-red-a.glb', 'nature/k-flower-purple-a.glb', 'platformer/tree-pine.glb',
  'nature/rock-2-a.glb', 'nature/k-tree-palm.glb', 'platformer/barrel.glb', 'nature/k-mushroom-red-group.glb', 'nature/k-mushroom-tan-group.glb',
  'props/star.glb', 'props/thunder.glb', 'props/spiky-ball.glb', 'props/bomb.glb',
];
const POWER_INFO = {
  mega: { model: 'props/star.glb', label: 'MEGA', color: '#ff7a2a', hex: 0xff7a2a, desc: 'Huge & heavy!' },
  feather: { model: 'props/thunder.glb', label: 'FEATHER', color: '#4fe3ff', hex: 0x4fe3ff, desc: 'Super dash!' },
  spikes: { model: 'props/spiky-ball.glb', label: 'SPIKES', color: '#b070ff', hex: 0xb070ff, desc: 'Ouch to touch!' },
};
const BOT_NAMES = ['Bonk', 'Wobbles', 'Chonk', 'Sir Shove', 'Thud', 'Mochi'];
const SURFACE_KIND = { dohyo: 0, ice: 0, crumble: 1, spinner: 0, mushroom: 2 };
const STEP = 1 / 60;
const SLOW_LEN = 1.4;

export default async function start(ctx) {
  const stage = createStage(ctx.container, { background: 0x87b5ff, shadows: true, shadowArea: 16, fov: 42, envIntensity: 0.55 });
  const { scene, camera, renderer } = stage;
  renderer.toneMappingExposure = 1.05;
  stage.sun.shadow.mapSize.set(1024, 1024);
  const env = createEnvironment(stage);
  const fx = createFX(scene, camera, renderer);
  const hud = createHUD(ctx.container);
  const input = trackInput(ctx);

  // ------------------------------------------------------------ assets
  const decorGltf = new Map();
  const [sounds] = await Promise.all([
    createSounds(),
    loadSpecies(ctx.sharedAsset),
    ...DECOR.map((p) => loadGLTF(ctx.sharedAsset(p)).then((g) => decorGltf.set(p, g)).catch(() => {})),
  ]);
  function decorClone(path) {
    const g = decorGltf.get(path);
    if (!g) return null;
    const o = g.scene.clone(true);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.userData.sharedModel = true; } });
    return o;
  }
  const lib = {
    place(parent, path, scale, x, y, z) {
      const o = decorClone(path);
      if (!o) return null;
      o.scale.setScalar(scale);
      o.position.set(x, y, z);
      o.rotation.y = Math.random() * Math.PI * 2;
      parent.add(o);
      return o;
    },
  };
  function decorateIsland(isl, r) {
    const kind = env.theme?.island;
    const spot = (k) => [(Math.random() - 0.5) * r * k, (Math.random() - 0.5) * r * k];
    if (kind === 'grass') { lib.place(isl, 'nature/tree-3-a.glb', r * 0.28, ...[spot(0.6)[0], 0, spot(0.6)[1]]); lib.place(isl, 'nature/bush-2-a.glb', r * 0.5, r * 0.4, 0, -r * 0.2); }
    if (kind === 'snow') { lib.place(isl, 'platformer/tree-pine.glb', r * 0.6, 0, 0, 0); lib.place(isl, 'platformer/tree-pine.glb', r * 0.4, r * 0.45, 0, r * 0.2); }
    if (kind === 'tropic') { lib.place(isl, 'nature/k-tree-palm.glb', r * 0.8, 0, 0, 0); }
    if (kind === 'fairy') { lib.place(isl, 'nature/k-mushroom-red-group.glb', r * 2.2, 0, 0, 0); }
    if (kind === 'basalt') { lib.place(isl, 'nature/rock-2-a.glb', r * 2.5, r * 0.2, 0, 0); }
  }

  // ------------------------------------------------------------ state
  let destroyed = false;
  const timeouts = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); if (!destroyed) fn(); }, ms); timeouts.add(t); return t; };
  const wait = (ms) => new Promise((r) => later(r, ms));

  const entries = new Map(); // id -> { id, f, view, player, isBot, wins, pts, kos, species, inMatch }
  let mode = 'rounds';
  let target = 3;
  let phase = 'intro';
  let roundNo = 0;
  let arenaType = 'dohyo';
  let arenaView = null;
  let roundT = 0;
  let roundLen = 60;
  let hitStop = 0;
  let shake = 0;
  let tilt = 0;
  let tiltDir = 0;
  let acc = 0;
  let cardsDirty = true;
  let cardsT = 0;
  let roundEndCheck = 0;
  let finalDuelAnnounced = false;
  let onRoundOver = null;
  let focusId = null; // camera focus at round end
  const puViews = new Map();
  const bombViews = new Map();
  const stateSendT = new Map();
  let botCount = 0;
  let maxRounds = 99;
  let roundSize = 0; // fighters who started this round
  let slowT = 99; // seconds since the final ring-out started (slow motion while < SLOW_LEN)
  let slowFocus = null;

  const sim = createSim({ emit: onEvent });

  function humanEntries() { return [...entries.values()].filter((e) => !e.isBot); }
  function connectedHumans() { return humanEntries().filter((e) => ctx.player(e.id)?.connected); }

  function addEntry(player, { isBot = false } = {}) {
    if (entries.has(player.id)) return entries.get(player.id);
    const f = makeFighter(player.id, { isBot });
    f.state = 'idle';
    sim.fighters.set(player.id, f);
    const species = isBot ? (player.index + 3) % SPECIES.length : player.index % SPECIES.length;
    const view = createFighterView(scene, player, species);
    const e = { id: player.id, f, view, player, isBot, wins: 0, pts: 0, kos: 0, species, inMatch: false };
    entries.set(player.id, e);
    cardsDirty = true;
    return e;
  }
  function removeEntry(id) {
    const e = entries.get(id);
    if (!e) return;
    e.view.dispose();
    sim.fighters.delete(id);
    entries.delete(id);
    cardsDirty = true;
  }

  function syncBots() {
    const humans = connectedHumans().length;
    const wantBots = humans >= 2 ? 0 : 3 - Math.max(1, humans);
    const bots = [...entries.values()].filter((e) => e.isBot);
    for (let i = bots.length; i < wantBots; i++) {
      const color = ['#e8e8e8', '#8a8f9c', '#c9a27a'][i % 3];
      const p = { id: `bot-${++botCount}`, name: `CPU ${BOT_NAMES[(botCount - 1) % BOT_NAMES.length]}`, color, colorHex: parseInt(color.slice(1), 16), avatar: '🤖', index: 100 + botCount };
      addEntry(p, { isBot: true });
    }
    for (let i = wantBots; i < bots.length; i++) removeEntry(bots[i].id);
  }

  // ------------------------------------------------------------ phone state
  function stateFor(e) {
    const f = e.f;
    let st = 'wait';
    if (phase === 'intro') st = 'intro';
    else if (phase === 'results') st = 'results';
    else if (phase === 'roundEnd') st = 'roundEnd';
    else if (!e.inMatch || f.state === 'idle' || (e.left && f.state === 'out')) st = 'wait';
    else if (f.state === 'alive') st = 'alive';
    else if (f.state === 'falling') st = 'falling';
    else if (f.state === 'respawning') st = 'respawn';
    else if (f.state === 'out') st = 'out';
    let rank = 0;
    if (phase === 'results' || phase === 'roundEnd') rank = rankedEntries().indexOf(e) + 1;
    return {
      type: 'st', phase, st, mode, target, round: roundNo, arena: ARENA_RULES[arenaType]?.name,
      dmg: Math.round(f.damage), wins: e.wins, pts: e.pts, power: f.power, powerT: f.powerT,
      respawnIn: f.state === 'respawning' ? f.respawnT : 0,
      won: phase === 'roundEnd' && focusId === e.id && mode === 'rounds',
      champ: phase === 'results' && rank === 1,
      rank, alive: sim.aliveCount(),
    };
  }
  const statePending = new Set();
  function sendState(id, force = true) {
    const e = entries.get(id);
    if (!e || e.isBot) return;
    const now = performance.now();
    if (!force && now - (stateSendT.get(id) || 0) < 150) {
      if (!statePending.has(id)) { statePending.add(id); later(() => { statePending.delete(id); sendState(id, true); }, 160); }
      return;
    }
    stateSendT.set(id, now);
    ctx.send(id, stateFor(e));
  }
  function sendAll() { for (const e of entries.values()) if (!e.isBot) sendState(e.id); }
  // Haptics go through the platform (phones honour the player's toggle; iPhones get a screen-edge flash).
  function buzz(id, p) { const e = entries.get(id); if (e && !e.isBot && ctx.player(id)?.connected) ctx.vibrate(id, p); }
  const who = (e) => `<span class="who" style="--c:${e.player.color}">${escapeHtml(e.player.name)}</span>`;

  // ------------------------------------------------------------ events from the sim
  function onEvent(type, d) {
    if (destroyed) return;
    const fe = d.f && entries.get(d.f.id);
    switch (type) {
      case 'dash': {
        fx.dust(d.f.x, d.f.y, d.f.z, 5, arenaDust(), 0.8);
        if (d.f.power === 'feather') fx.sparks(d.f.x, d.f.y + 0.6, d.f.z, 8, 0x8ff0ff, 4);
        sfx.play('whoosh');
        break;
      }
      case 'hit': {
        const big = d.kb > 12;
        fx.stars(d.x, d.y + 0.8, d.z, big ? 12 : 7, big ? 1.3 : 1);
        fx.flash(d.x, d.y + 0.8, d.z, big ? 3.2 : 2.2, d.spikes ? 0xd090ff : 0xffffff);
        sounds.smack();
        if (big) { sfx.play('hit'); hitStop = d.kb > 17 ? 0.09 : 0.06; }
        shake = Math.max(shake, Math.min(0.6, 0.12 + d.kb * 0.02));
        buzz(d.tgt.id, big ? 'heavy' : 'hit');
        buzz(d.att.id, 'bump');
        entries.get(d.att.id)?.view.squash(2.5);
        break;
      }
      case 'hurt': {
        fe?.view.flash();
        fe?.view.squash(-Math.min(7, 2 + d.kb * 0.3));
        if (fe) { fe.hitCard = performance.now(); cardsDirty = true; }
        if (d.f && !d.f.isBot) { sendState(d.f.id, false); if (!d.dash) buzz(d.f.id, d.kb > 12 ? 'heavy' : 'hit'); }
        break;
      }
      case 'bump': {
        if (arenaType === 'mushroom') { sounds.boing(); arenaView?.boing?.(0.4); } else if (d.hard > 7) sfx.play('blip');
        fx.dust(d.x, d.y, d.z, 3, arenaDust(), 0.6);
        if (d.hard > 8) fx.stars(d.x, d.y + 0.8, d.z, 3, 0.6);
        break;
      }
      case 'hop': sfx.play('jump'); break;
      case 'land': if (d.vy < -8) fx.dust(d.f.x, d.f.y, d.f.z, 4, arenaDust(), 0.7); break;
      case 'slam': {
        const gy = sim.groundY(d.x, d.z);
        fx.ring(d.x, gy, d.z, d.radius, { color: 0xffffff, dur: 0.45, opacity: 1 });
        fx.ring(d.x, gy, d.z, d.radius * 0.7, { color: fe?.player.colorHex ?? 0xffcf3a, dur: 0.35, opacity: 0.9 });
        const n = Math.round(10 + d.charge * 14);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          fx.spawn({ x: d.x + Math.cos(a) * 0.5, y: gy + 0.1, z: d.z + Math.sin(a) * 0.5, vx: Math.cos(a) * (5 + d.charge * 6), vy: 0.8, vz: Math.sin(a) * (5 + d.charge * 6), drag: 3.5, life: 0.6, size: 0.7, size1: 1.6, alpha: 0.8, color: arenaDust(), shape: 0 });
        }
        sounds.thud();
        if (d.hits) sfx.play('hit');
        if (arenaType === 'mushroom') { sounds.boing(); arenaView?.boing?.(0.6 + d.charge); }
        shake = Math.max(shake, 0.18 + d.charge * 0.35);
        if (d.charge > 0.8 && d.hits) hitStop = 0.05;
        break;
      }
      case 'fall': {
        sounds.scream();
        tilt = 1;
        tiltDir = Math.sign(d.f.x) || 1;
        buzz(d.f.id, 'lose');
        sendState(d.f.id);
        // last ring-out of the round: slow motion + camera follows the faller
        if (phase === 'play' && mode === 'rounds' && roundSize >= 2 && sim.aliveCount() <= 1) {
          slowT = 0;
          slowFocus = d.f;
          hitStop = Math.max(hitStop, 0.08);
        }
        break;
      }
      case 'splash': {
        fx.splash(d.f.x, SEA_Y + 0.3, d.f.z, SURFACE_KIND[arenaType]);
        sounds.splash();
        shake = Math.max(shake, 0.15);
        break;
      }
      case 'ko': onKO(d.victim, d.killer); break;
      case 'pickup': {
        const info = POWER_INFO[d.kind];
        sfx.play('powerup');
        fx.ring(d.f.x, d.f.y, d.f.z, 2.5, { color: info.hex, dur: 0.5 });
        fx.sparks(d.f.x, d.f.y + 1, d.f.z, 16, info.hex, 6);
        hud.feed(`${who(fe)} got <b style="color:${info.color}">${info.label}</b> · ${info.desc}`);
        buzz(d.f.id, 'boost');
        sendState(d.f.id);
        if (d.kind === 'mega') sounds.boing();
        break;
      }
      case 'powerEnd': sendState(d.f.id); break;
      case 'spawn': {
        sfx.play('join');
        sendState(d.f.id);
        break;
      }
      case 'armHit': {
        fx.stars(d.x, 0.8, d.z, 6, 1);
        sounds.smack();
        shake = Math.max(shake, 0.2);
        break;
      }
      case 'tileShake': sfx.play('tick'); break;
      case 'tileFall': {
        const t = d.tile;
        const am = (t.a0 + t.a1) / 2;
        const rm = (t.inner + t.outer) / 2;
        fx.dust(Math.cos(am) * rm, 0, Math.sin(am) * rm, 6, 0xa89880, 1);
        break;
      }
      case 'tileRegrow': arenaView?.regrow?.(d.tile); break;
      case 'hazardWarn': {
        const hz = d.hz;
        fx.addWarn(hz.id, hz.x, sim.groundY(hz.x, hz.z), hz.z, hz.radius);
        const bomb = decorClone('props/bomb.glb');
        if (bomb) { bomb.scale.setScalar(0.8); bomb.visible = false; scene.add(bomb); }
        bombViews.set(hz.id, { hz, bomb });
        sfx.play('tick');
        break;
      }
      case 'hazardImpact': {
        const hz = d.hz;
        fx.removeWarn(hz.id);
        const b = bombViews.get(hz.id);
        if (b?.bomb) scene.remove(b.bomb);
        bombViews.delete(hz.id);
        const gy = sim.groundY(hz.x, hz.z);
        fx.flash(hz.x, gy + 0.8, hz.z, 5, 0xffb040);
        fx.sparks(hz.x, gy + 0.4, hz.z, 24, 0xffa030, 9);
        fx.ring(hz.x, gy, hz.z, hz.radius * 1.4, { color: 0xffa040, dur: 0.5 });
        for (let i = 0; i < 10; i++) fx.spawn({ x: hz.x, y: gy + 0.5, z: hz.z, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 4, drag: 2, life: 1.2, size: 1.4, size1: 2.6, alpha: 0.6, color: 0x55505a, shape: 0 });
        sfx.play('explosion');
        shake = Math.max(shake, 0.45);
        break;
      }
      case 'powerupSpawn': addPowerupView(d.pu); break;
      case 'powerupGone': {
        const v = puViews.get(d.pu.id);
        if (v) { scene.remove(v.g); puViews.delete(d.pu.id); }
        if (!d.by) fx.dust(d.pu.x, 0.5, d.pu.z, 6, 0xffffff, 1);
        break;
      }
      default:
    }
  }

  function arenaDust() { return arenaType === 'ice' ? 0xf4fbff : arenaType === 'crumble' ? 0xb8a890 : arenaType === 'mushroom' ? 0xfff0f8 : arenaType === 'spinner' ? 0xffffff : 0xe2c79a; }

  const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 6, 20, 1, true);
  const puRingGeo = new THREE.RingGeometry(0.55, 0.75, 32);
  puRingGeo.rotateX(-Math.PI / 2);
  function addPowerupView(pu) {
    const info = POWER_INFO[pu.kind];
    const g = new THREE.Group();
    const m = decorClone(info.model);
    if (m) { m.scale.setScalar(0.55); m.position.y = 0.55; g.add(m); }
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: info.hex, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.y = 3;
    const ring = new THREE.Mesh(puRingGeo, new THREE.MeshBasicMaterial({ color: info.hex, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.y = 0.05;
    g.add(beam, ring);
    g.position.set(pu.x, sim.groundY(pu.x, pu.z), pu.z);
    scene.add(g);
    puViews.set(pu.id, { g, m, pu });
    fx.ring(pu.x, g.position.y, pu.z, 1.5, { color: info.hex });
    sfx.play('coin');
  }

  function onKO(victim, killerId) {
    const ve = entries.get(victim.id);
    if (!ve) return;
    const ke = killerId && killerId !== 'arena' && killerId !== victim.id ? entries.get(killerId) : null;
    const vName = who(ve);
    if (ke) {
      ke.kos++;
      if (mode === 'points') ke.pts++;
      hud.feed(`${who(ke)} knocked out ${vName}`);
      buzz(ke.id, 'success');
      sendState(ke.id);
    } else if (killerId === 'arena') {
      hud.feed(`${vName} got wrecked by the arena`);
    } else {
      if (mode === 'points') ve.pts--;
      hud.feed(`${vName} fell off alone${mode === 'points' ? ' <span class="bad">−1</span>' : ''}`);
    }
    if (mode === 'points' && phase === 'play') {
      victim.state = 'respawning';
      victim.respawnT = 3;
    }
    cardsDirty = true;
    sendAll(); // everyone's "N still standing" changes
  }

  // ------------------------------------------------------------ platform events
  ctx.onJoin((p, { rejoin }) => {
    let e = entries.get(p.id);
    if (e) {
      e.f.active = true;
      e.player = { ...e.player, ...p };
      if (mode === 'points' && phase === 'play' && (e.f.state === 'idle' || e.f.state === 'out')) { e.inMatch = true; e.left = false; sim.spawnFromSky(e.f); }
      if (rejoin) hud.feed(`${who(e)} is back${mode === 'points' ? '' : ' · fights next round'}`);
    } else {
      e = addEntry(p);
      sfx.play('join');
      hud.feed(`${who(e)} joined${mode === 'points' || phase === 'intro' ? '' : ' · fights next round'}`);
      if (mode === 'points' && phase === 'play') { e.inMatch = true; sim.spawnFromSky(e.f); }
    }
    if (!rejoin && phase !== 'results') syncBotsLater();
    cardsDirty = true;
    sendState(p.id);
  });
  ctx.onLeave((p) => {
    const e = entries.get(p.id);
    if (!e) return;
    e.f.active = false;
    // Pull the fighter out of the round cleanly (a puff of smoke, no KO credit). Their wins are kept for the results.
    if (e.f.state === 'alive' || e.f.state === 'respawning') {
      if (e.f.state === 'alive') { fx.dust(e.f.x, e.f.y, e.f.z, 10, 0xffffff, 1.4); fx.ring(e.f.x, e.f.y, e.f.z, 1.6, { color: 0xffffff, dur: 0.4 }); }
      sim.withdraw(e.f);
      e.left = true;
      hud.feed(`${who(e)} left the arena`);
      sfx.play('whoosh');
    }
    if (phase !== 'results') syncBotsLater();
    cardsDirty = true;
  });
  let botSyncPending = false;
  function syncBotsLater() {
    // bots only change between rounds
    if (phase === 'play' || phase === 'countdown') { botSyncPending = true; return; }
    syncBots();
  }
  ctx.onMessage((pid, msg) => {
    if (msg?.type === 'hello') { if (!entries.has(pid)) { const p = ctx.player(pid); if (p) addEntry(p); } sendState(pid); }
  });

  // ------------------------------------------------------------ round flow
  function setupArena(type) {
    if (arenaView) { scene.remove(arenaView.root); arenaView.dispose(); }
    fx.clear();
    for (const v of puViews.values()) scene.remove(v.g);
    puViews.clear();
    for (const b of bombViews.values()) if (b.bomb) scene.remove(b.bomb);
    bombViews.clear();
    const fighters = [...entries.values()].filter((e) => e.inMatch);
    sim.mode = mode;
    sim.setupArena(type, Math.max(2, fighters.length));
    env.setTheme(type, decorateIsland);
    arenaView = buildArena(type, sim, lib);
    scene.add(arenaView.root);
    const R = sim.arena.R;
    const s = Math.max(14, R + 6);
    Object.assign(stage.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    stage.sun.shadow.camera.updateProjectionMatrix();
    stage.sun.target.position.set(0, 0, 0);
  }

  /** First-to-N scales with the crowd: bigger groups need fewer wins (and get a round cap) so matches stay ~6–8 min. */
  function matchRules(humans) {
    if (humans > 12) return { mode: 'points', target: 0, maxRounds: 3 };
    if (humans <= 4) return { mode: 'rounds', target: 3, maxRounds: 99 };
    return { mode: 'rounds', target: 2, maxRounds: humans <= 8 ? 7 : 8 };
  }
  function roundSubtitle() {
    if (mode === 'points') return `Round ${roundNo} of ${maxRounds} · +1 per knockout`;
    return maxRounds < 99 ? `First to ${target} wins · round ${roundNo} of ${maxRounds}` : `First to ${target} wins`;
  }

  async function runMatch() {
    // reset
    hud.clearOverlays();
    for (const e of [...entries.values()]) { e.wins = 0; e.pts = 0; e.kos = 0; e.left = false; if (!ctx.player(e.id)?.connected && !e.isBot) removeEntry(e.id); }
    for (const p of ctx.players()) addEntry(p);
    syncBots();
    const humans = connectedHumans().length;
    ({ mode, target, maxRounds } = matchRules(humans));
    roundNo = 0;
    phase = 'intro';
    focusId = null;
    slowT = 99;
    for (const e of entries.values()) { e.inMatch = true; e.f.state = 'idle'; e.view.setPose(null); }
    arenaType = 'dohyo';
    setupArena(arenaType);
    sim.placeForRound([...entries.values()].map((e) => e.f));
    for (const e of entries.values()) e.f.state = 'alive';
    sim.running = false;
    hud.setHeader('Sumo <b>Smash</b>', '');
    hud.setTimer(null);
    sendAll();
    // let the first frames (shader compiles) land before the timed how-to-play card starts
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (destroyed) return;
    const introMs = 5500;
    hud.intro({
      ms: introMs,
      modeText: mode === 'rounds'
        ? `Last one standing wins the round · first to ${target} wins the match`
        : `${humans} players: 3 timed rounds · +1 per knockout · −1 for falling off alone · you respawn`,
    });
    await wait(introMs + 400);

    while (!destroyed) {
      roundNo++;
      arenaType = ARENA_ORDER[(roundNo - 1) % ARENA_ORDER.length];
      if (botSyncPending) { botSyncPending = false; syncBots(); }
      // disconnected players sit out (their score is kept for the results)
      for (const e of entries.values()) { e.inMatch = e.isBot || !!ctx.player(e.id)?.connected; e.left = false; e.view.setPose(null); }
      setupArena(arenaType);
      const list = [...entries.values()].filter((e) => e.inMatch).map((e) => e.f);
      sim.placeForRound(list);
      for (const e of entries.values()) e.f.state = e.inMatch ? 'alive' : 'idle';
      roundSize = list.length;
      sim.running = false;
      phase = 'countdown';
      roundT = 0;
      roundLen = mode === 'points' ? 60 : 85;
      finalDuelAnnounced = list.length <= 2;
      focusId = null;
      slowT = 99;
      slowFocus = null;
      cardsDirty = true;
      hud.setTimer(mode === 'points' ? roundLen : null);
      hud.setHeader(`Round ${roundNo} · <b>${ARENA_RULES[arenaType].name}</b>`, roundSubtitle());
      sendAll();
      hud.callout(`${ARENA_RULES[arenaType].name}<small>${arenaHint(arenaType)}</small>`, 1900);
      await wait(2100);
      if (destroyed) return;
      await countdown(ctx.container);
      if (destroyed) return;
      input.clear();
      phase = 'play';
      sim.running = true;
      sendAll();
      await new Promise((r) => { onRoundOver = r; });
      if (destroyed) return;
      if (matchOver()) break;
      await wait(200);
    }
    if (destroyed) return;
    await showFinal();
  }

  function matchOver() {
    if (mode === 'points') return roundNo >= maxRounds;
    return [...entries.values()].some((e) => e.wins >= target) || roundNo >= maxRounds;
  }

  function arenaHint(t) {
    return {
      dohyo: 'Classic ring · watch out for bombs',
      ice: 'Slippery! Momentum carries you',
      crumble: 'The floor falls away tile by tile',
      spinner: 'Tap SLAM to hop over the sweeper',
      mushroom: 'Extra bouncy · everything flies farther',
    }[t];
  }

  function rankedEntries() {
    const all = [...entries.values()].filter((e) => e.isBot || e.wins || e.pts || e.kos || ctx.player(e.id)?.connected);
    return mode === 'rounds'
      ? all.sort((a, b) => b.wins - a.wins || b.kos - a.kos || a.player.index - b.player.index)
      : all.sort((a, b) => b.pts - a.pts || b.kos - a.kos || a.player.index - b.player.index);
  }

  async function endRound(winner, reason) {
    if (phase !== 'play') return;
    phase = 'roundEnd';
    sim.running = false;
    hud.setTimer(null);
    let freshId = null;
    if (mode === 'rounds') {
      if (winner) {
        winner.wins++;
        freshId = winner.id;
        focusId = winner.id;
        winner.view.setPose('win');
        winner.f.face = 0; // turn to the camera
        fx.confetti(winner.f.x, winner.f.y + 2, winner.f.z, 90, 3);
        sfx.play('win');
        hud.callout(`<span class="c" style="--c:${winner.player.color}">${escapeHtml(winner.player.name)}</span> wins<small>${reason || `Round ${roundNo}`} · ${winner.wins} of ${target}</small>`, 2300, 'low');
        buzz(winner.id, 'win');
      } else {
        hud.callout('Nobody survived<small>No point this round</small>', 2200);
        sfx.play('lose');
      }
    } else {
      const top = rankedEntries()[0];
      hud.callout(`Time<small>${top ? `${escapeHtml(top.player.name)} leads with ${top.pts}` : ''}</small>`, 2300);
      sfx.play('go');
      if (top) { focusId = top.id; if (top.f.state === 'alive') top.view.setPose('win'); }
    }
    cardsDirty = true;
    sendAll();
    await wait(2500);
    if (destroyed) return;
    if (!matchOver()) {
      const rows = rankedEntries().map((e) => ({ name: e.player.name, color: e.player.color, wins: e.wins, pts: e.pts, fresh: e.id === freshId }));
      const left = maxRounds - roundNo;
      const sub = mode === 'rounds'
        ? `First to ${target} wins${maxRounds < 99 ? ` · ${left} round${left === 1 ? '' : 's'} left` : ''}`
        : `${left} round${left === 1 ? '' : 's'} left`;
      hud.standings({ title: 'Standings', subtitle: sub, rows, mode, target, ms: 3300 });
      sfx.play('blip');
      await wait(3500);
    }
    for (const e of entries.values()) e.view.setPose(null);
    onRoundOver?.();
  }

  async function showFinal() {
    phase = 'results';
    sim.running = false;
    const ranked = rankedEntries();
    const rows = ranked.map((e) => ({ player: e.player, score: mode === 'rounds' ? e.wins : e.pts, label: mode === 'rounds' ? (e.wins === 1 ? 'win' : 'wins') : 'pts' }));
    const ce = ranked[0];
    // champion moment: alone in the middle of a fresh dohyo, confetti raining
    if (ce) {
      focusId = ce.id;
      for (const e of entries.values()) { e.f.state = 'idle'; e.view.setPose(null); }
      setupArena('dohyo');
      sim.placeForRound([ce.f]);
      ce.f.state = 'alive';
      ce.f.face = 0;
      ce.view.setPose('win');
      fx.confetti(0, 3, 0, 160, 5);
      sfx.play('win');
      hud.setHeader('Sumo <b>Smash</b>', '');
      hud.callout(`<span class="c" style="--c:${ce.player.color}">${escapeHtml(ce.player.name)}</span><small>is the Sumo Smash champion</small>`, 2700, 'low');
      // snap the camera onto the champion
      camPos.set(0, 0.9 + Math.sin(PITCH) * 9, Math.cos(PITCH) * 9);
      camLook.set(0, 0.9, -0.3);
      for (const e of entries.values()) buzz(e.id, e === ce ? 'win' : 'success');
    }
    sendAll();
    await wait(3000);
    if (destroyed) return;
    const choice = await ctx.showResults(rows, { title: 'Sumo Smash', subtitle: ce ? `${ce.player.name} is the last one standing` : '' });
    if (destroyed || choice !== 'again') return;
    runMatch();
  }

  // ------------------------------------------------------------ frame loop
  const camPos = new THREE.Vector3(0, 16, 16);
  const camLook = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const PITCH = 0.92; // radians above horizontal

  const inp = { x: 0, y: 0, dash: false, slam: false };
  let autopilot = false; // test hook: humans are driven by the bot brain
  function getInput(f) {
    if (phase !== 'play') { inp.x = 0; inp.y = 0; inp.dash = false; inp.slam = false; return inp; }
    if (f.isBot || (autopilot && (autopilot === true || autopilot.has(f.id)))) return sim.botInput(f);
    const i = input.get(f.id);
    inp.x = i.x; inp.y = i.y; inp.dash = i.pressed('a'); inp.slam = !!i.b.b;
    return inp;
  }

  function checkRoundEnd(dt) {
    if (phase !== 'play') return;
    let aliveN = 0;
    let last = null;
    let falling = false;
    for (const e of entries.values()) {
      if (e.f.state === 'alive') { aliveN++; last = e; } else if (e.f.state === 'falling') falling = true;
    }
    roundT += dt;
    if (mode === 'points') {
      hud.setTimer(roundLen - roundT);
      if (roundT >= roundLen) endRound(null);
      return;
    }
    if (!sim.suddenDeath && roundT > 40) {
      sim.suddenDeath = true;
      hud.callout(`Sudden death<small>${arenaType === 'crumble' ? 'The floor is collapsing faster' : 'The arena is shrinking'}</small>`, 1600);
      sfx.play('countdown');
    }
    if (!finalDuelAnnounced && aliveN === 2 && roundSize >= 3) {
      finalDuelAnnounced = true;
      hud.callout('Final duel', 1200);
      sfx.play('countdown');
    }
    if (aliveN <= 1 && !falling) {
      roundEndCheck += dt;
      if (roundEndCheck > 0.5) { roundEndCheck = 0; endRound(last); }
    } else roundEndCheck = 0;
    if (roundT > roundLen && aliveN > 1) {
      let w = null;
      for (const e of entries.values()) if (e.f.state === 'alive' && (!w || e.f.damage < w.f.damage)) w = e;
      endRound(w, 'Time up · lowest damage');
    }
  }

  function updateCamera(dt, t) {
    const R = sim.arena?.R || 8;
    let pts = [];
    if (phase === 'play' || phase === 'countdown') {
      for (const e of entries.values()) {
        const f = e.f;
        if (f.state === 'alive' || (f.state === 'falling' && f.y > -5)) pts.push(f);
      }
    }
    let cx = 0;
    let cz = 0;
    let ext = R;
    const focus = focusId && entries.get(focusId);
    let lookY = 0.4;
    if (focus && (phase === 'roundEnd' || phase === 'results')) {
      cx = focus.f.x; cz = focus.f.z; ext = 3.1; lookY = focus.f.y + 0.9;
    } else if (slowFocus && slowT < SLOW_LEN + 0.6 && phase === 'play') {
      cx = slowFocus.x; cz = slowFocus.z; ext = 4.2; lookY = Math.max(-2.5, slowFocus.y * 0.5);
    } else if (phase === 'countdown' || phase === 'intro' || !pts.length) {
      ext = R + 1;
    } else {
      let minX = 1e9; let maxX = -1e9; let minZ = 1e9; let maxZ = -1e9;
      for (const f of pts) { minX = Math.min(minX, f.x); maxX = Math.max(maxX, f.x); minZ = Math.min(minZ, f.z); maxZ = Math.max(maxZ, f.z); }
      cx = (minX + maxX) / 2;
      cz = (minZ + maxZ) / 2;
      ext = Math.max((maxX - minX) / 2 / Math.max(1, camera.aspect * 0.75), (maxZ - minZ) / 2) + 2.2;
      ext = Math.max(ext, R * (pts.length <= 2 ? 0.62 : 0.72), 4.2);
      // keep some arena context
      cx *= 0.6; cz *= 0.6;
    }
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = THREE.MathUtils.clamp((ext * 1.05) / tanH, 7, 60);
    const k = 1 - Math.exp(-dt * (phase === 'roundEnd' || phase === 'results' ? 4 : slowT < SLOW_LEN ? 4 : 2));
    desired.set(cx, lookY + Math.sin(PITCH) * dist, cz + Math.cos(PITCH) * dist);
    camPos.lerp(desired, k);
    tmpLook.set(cx, lookY, cz - 0.3);
    camLook.lerp(tmpLook, k);
    camera.position.copy(camPos);
    // shake
    if (shake > 0) {
      const s = shake * shake * 0.8;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s * 0.5;
      shake = Math.max(0, shake - dt * 1.8);
    }
    camera.lookAt(camLook);
    // tilt towards falling players
    if (tilt > 0) { tilt = Math.max(0, tilt - dt * 1.2); }
    camera.rotation.z += Math.sin(tilt * Math.PI) * 0.035 * tiltDir;
    // shadow camera follows
    stage.sun.target.position.set(cx * 0.5, 0, cz * 0.5);
  }

  function updateCards() {
    const now = performance.now();
    const rows = [...entries.values()].filter((e) => e.isBot || ctx.player(e.id)?.connected).sort((a, b) => (mode === 'points' ? b.pts - a.pts : 0) || a.player.index - b.player.index).map((e) => ({
      id: e.id, name: e.player.name, color: e.player.color,
      dmg: e.f.damage, wins: e.wins, target, pts: e.pts,
      out: e.f.state === 'out' || e.f.state === 'falling' || e.f.state === 'respawning' || (e.f.state === 'idle' && phase === 'play'),
      outText: e.f.state === 'respawning' ? `${Math.ceil(e.f.respawnT)}s` : e.f.state === 'idle' ? 'NEXT' : 'OUT',
      hit: e.hitCard && now - e.hitCard < 260,
    }));
    hud.setCards(rows, mode);
    hud.setBoard(mode === 'points' && rows.length > 12 ? [...rows].sort((a, b) => b.pts - a.pts).slice(0, 5) : null);
  }

  stage.onFrame((dt, t) => {
    if (destroyed || !sim.arena) return;
    let simDt = dt;
    if (hitStop > 0) { hitStop -= dt; simDt = 0; }
    // final ring-out slow motion: 0.25x, easing back to full speed
    if (slowT < SLOW_LEN) {
      slowT += dt;
      simDt *= slowT < 0.9 ? 0.25 : Math.min(1, 0.25 + (slowT - 0.9) * 1.6);
    }
    if (phase === 'play' || phase === 'roundEnd') {
      acc += simDt;
      let steps = 0;
      while (acc >= STEP && steps < 4) {
        if (phase === 'play' || phase === 'roundEnd') {
          sim.running = phase === 'play';
          sim.step(STEP, getInput);
        }
        acc -= STEP;
        steps++;
      }
      if (steps === 4) acc = 0;
    }
    checkRoundEnd(simDt);
    env.update(dt, t);
    arenaView?.update(dt, t, sim, fx);

    // fighters
    const viewDt = simDt;
    let leaderWins = 0;
    if (mode === 'rounds') for (const e of entries.values()) leaderWins = Math.max(leaderWins, e.wins);
    for (const e of entries.values()) {
      const f = e.f;
      f.groundY = sim.groundY(f.x, f.z);
      e.view.update(f, viewDt, t, { crown: leaderWins > 0 && e.wins === leaderWins && mode === 'rounds' });
      if (f.state !== 'alive' || viewDt === 0) continue;
      if (f.stun > 0 && f.speed > 9 && Math.random() < 0.8) fx.speedLine(f.x, f.y, f.z);
      if (f.power === 'feather' && f.speed > 3 && Math.random() < 0.4) fx.puff(f.x, f.y + 0.5, f.z, 0, 0.5, 0, 0.5, 0.4, 0, 1, 0x8ff0ff, 1);
      if (f.dashT > 0) fx.speedLine(f.x, f.y, f.z, e.player.colorHex);
      if (arenaType === 'ice' && f.speed > 4 && !f.airborne && Math.random() < 0.3) fx.puff(f.x, 0.1, f.z, Math.random() - 0.5, 0.6, Math.random() - 0.5, 0.4, 0.3, 0.6, 0.6, 0xffffff, 0);
      // skid dust when a launched fighter slides along the ground
      if (f.stun > 0 && !f.airborne && f.speed > 6 && arenaType !== 'ice' && Math.random() < 0.5) fx.puff(f.x, f.groundY + 0.1, f.z, -f.vx * 0.08, 0.7, -f.vz * 0.08, 0.5, 0.6, 1.4, 0.65, arenaDust(), 0);
    }
    // power-ups bob
    for (const v of puViews.values()) {
      v.g.position.set(v.pu.x, sim.groundY(v.pu.x, v.pu.z), v.pu.z);
      if (v.m) { v.m.rotation.y += dt * 2.5; v.m.position.y = 0.6 + Math.sin(t * 3 + v.pu.id) * 0.15; }
      v.g.visible = !(v.pu.life - v.pu.t < 2.5 && Math.floor(t * 8) % 2 === 0);
    }
    // falling bombs
    for (const b of bombViews.values()) {
      if (!b.bomb) continue;
      const k = (b.hz.t - (b.hz.warn - 0.55)) / 0.55;
      b.bomb.visible = k > 0;
      if (k > 0) {
        b.bomb.position.set(b.hz.x, sim.groundY(b.hz.x, b.hz.z) + 18 * (1 - k) * (1 - k), b.hz.z);
        b.bomb.rotation.z += dt * 6;
      }
    }
    // ambient snow on the ice arena
    if (arenaType === 'ice' && Math.random() < 0.6) {
      fx.puff(camLook.x + (Math.random() - 0.5) * 30, 10, camLook.z + (Math.random() - 0.5) * 24, 0.3, -1.6, 0.2, 6, 0.18, 0.18, 0.9, 0xffffff, 2);
    }
    // lava embers
    if (arenaType === 'crumble' && Math.random() < 0.5) {
      fx.puff((Math.random() - 0.5) * 50, SEA_Y + 1, (Math.random() - 0.5) * 50, 0, 2 + Math.random() * 2, 0, 4, 0.25, 0.05, 1, 0xffa040, 2);
    }
    fx.update(slowT < SLOW_LEN ? Math.max(simDt, dt * 0.25) : dt);
    updateCamera(dt, t);
    cardsT -= dt;
    if (cardsT <= 0 && (cardsDirty || phase === 'play')) {
      cardsT = 0.12;
      cardsDirty = false;
      updateCards();
    }
  });

  // initial camera
  camera.position.copy(camPos);
  camera.lookAt(0, 0, 0);

  // build the first arena before resolving start() so the loading spinner covers it
  for (const p of ctx.players()) addEntry(p);
  syncBots();
  setupArena('dohyo');
  sim.placeForRound([...entries.values()].map((e) => e.f));
  updateCamera(1, 0);
  // warm-up render so shaders compile under the spinner
  renderer.compile(scene, camera);

  // test hook (used by scripts/sumo-test.mjs)
  window.__sumoDebug = {
    get phase() { return phase; }, get mode() { return mode; }, get round() { return roundNo; }, get arena() { return arenaType; },
    get target() { return target; }, get maxRounds() { return maxRounds; }, get slowmo() { return slowT < SLOW_LEN; },
    get R() { return sim.arena?.R; }, get Reff() { return sim.arena?.Reff; },
    fighters: () => [...entries.values()].map((e) => ({ id: e.id, name: e.player.name, bot: e.isBot, x: e.f.x, z: e.f.z, y: e.f.y, state: e.f.state, dmg: e.f.damage, wins: e.wins, pts: e.pts, inMatch: e.inMatch, solid: sim.arena ? sim.solidAt(e.f.x, e.f.z) : null })),
    setTarget(n) { target = n; cardsDirty = true; },
    setMaxRounds(n) { maxRounds = n; },
    /** true = every human is bot-driven; array of player names = just those; false = off */
    autopilot(v) { autopilot = Array.isArray(v) ? new Set([...entries.values()].filter((e) => v.includes(e.player.name)).map((e) => e.id)) : v; },
  };

  runMatch();

  return {
    destroy() {
      destroyed = true;
      delete window.__sumoDebug;
      onRoundOver?.();
      timeouts.forEach(clearTimeout);
      timeouts.clear();
      for (const e of [...entries.values()]) e.view.dispose();
      entries.clear();
      if (arenaView) { scene.remove(arenaView.root); arenaView.dispose(); }
      fx.dispose();
      hud.destroy();
      sounds.dispose();
      stage.dispose();
    },
  };
}

export { arenaRadius };
