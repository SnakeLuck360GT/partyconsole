// Kart Chaos: TV side. Lobby (track + speed class) -> build -> flyover -> 3-2-1 (rocket start) -> race
// (1-4 human split screen + CPU racers to fill an 8-kart grid) -> placements -> results -> next track (cup).
import * as THREE from 'three';
import { loadGLTF } from '../../sdk/three-kit.js';
import { sfx } from '../../sdk/audio.js';
import { TRACKS, getTrackDef } from './tracks.js';
import { Track } from './track.js';
import { buildTrackScene } from './trackscene.js';
import { DRIVERS, KARTS, PAINTS, buildRacerModel, loadCustomConfig, combineStats, driverById, kartById, paintById } from './assets.js';
import { createShowroom } from './showroom.js';
import { Kart, KART_RADIUS, CLASSES, DRIFT_COLORS } from './kart.js';
import { CpuDriver } from './ai.js';
import { ItemSystem, rollItem, HOLDABLE } from './items.js';
import { ITEM_INFO } from './icons.js';
import { createFx } from './fx.js';
import { createKartStage } from './stage.js';
import { ChaseCam, SharedCam } from './camera.js';
import { createHud, drawTrackPreview, placementsHtml } from './hud.js';
import { clamp, angleDiff, ordinal, fmtTime } from './util.js';

const MAX_HUMANS = 8; // driver seats (the rest spectate)
const SPLIT_MAX = 4; // up to 4 humans: split screen; 5-8: one shared broadcast camera
const GRID = 8;
const LOBBY_TIME = 20;
const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
const CPU_COLORS = ['#9b6bff', '#ff6fb5', '#1fc9b0', '#ff8a1f', '#e8e2d0', '#5c6cff', '#9be15d', '#8a98b8'];
const CPU_HEX = CPU_COLORS.map((c) => parseInt(c.slice(1), 16));

export default async function start(ctx) {
  const params = new URLSearchParams(location.search);
  const LAPS = clamp(Number(params.get('kartLaps')) || 3, 1, 9);
  const forceTrack = params.get('kartTrack');
  const forceCC = Number(params.get('kartCC')) || null;
  const quickStart = params.get('kartAuto') === '1';
  const debug = params.get('kartDebug') || '';

  // software renderers (headless tests): trade resolution/shadows for frame rate
  let lowGfx = params.get('kartLow') === '1';
  {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
      if (/swiftshader|llvmpipe|software/i.test(name)) lowGfx = true;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { /* noop */ }
  }
  if (params.get('kartLow') === '0') lowGfx = false;

  const stage = createKartStage(ctx.container, { lowGfx });
  const { scene, renderer, sun, hemi } = stage;
  if (lowGfx) { sun.shadow.mapSize.set(1024, 1024); }
  const hud = createHud(ctx.container);
  const fx = createFx(scene);
  const S = (f) => ctx.sharedAsset(f);
  const A = (f) => ctx.asset(f);

  const custom = await loadCustomConfig(A);
  if (debug === 'garage' || debug === 'garage-side' || debug === 'thumbs') return runShowroomDebug();

  // Debug views: all drivers seated (garage) and offline thumbnail rendering for the phone carousel.
  async function runShowroomDebug() {
    const room = createShowroom({ sharedAsset: S, asset: A, environment: stage.envTex });
    let live = true;
    const { W, H } = stage.size;
    if (debug === 'thumbs') {
      const out = [];
      const size = 256;
      const c2 = document.createElement('canvas'); c2.width = size; c2.height = size;
      const g = c2.getContext('2d');
      const pr = stage.pixelRatio;
      room.layout(1, 1, { fixedYaw: -0.55 });
      const shot = async (name, pick, look) => {
        await room.setPick(0, pick);
        room.slots[0].yaw = look.yaw ?? -0.55;
        room.update(0.5, 1);
        room.camera.aspect = 1;
        room.camera.fov = look.fov;
        room.camera.position.set(...look.pos);
        room.camera.lookAt(...look.at);
        room.camera.updateProjectionMatrix();
        stage.render([{ rect: { x: 0, y: 0, w: size, h: size }, camera: room.camera, scene: room.scene }]);
        g.drawImage(renderer.domElement, 0, 0, size * pr, size * pr, 0, 0, size, size);
        out.push({ name, data: c2.toDataURL('image/jpeg', 0.86) });
      };
      for (const d of DRIVERS) await shot(`driver-${d.id}`, { driver: d, kart: KARTS[1], color: '#9aa3c7' }, { fov: 22, pos: [1.6, 3.2, 5.2], at: [0, 1.45, 0] });
      for (const k of KARTS) await shot(`kart-${k.id}`, { driver: DRIVERS[0], kart: k, color: '#e4e8f2', noDriver: true }, { fov: 30, pos: [4.6, 3.6, 6.6], at: [0, 0.55, 0], yaw: 0.35 });
      window.__kartThumbs = out;
    } else {
      const from = Number(params.get('kartFrom')) || 0;
      const list = DRIVERS.slice(from, from + 4);
      room.layout(list.length, W / H, { perRow: 4, spacing: 4.4, fixedYaw: debug === 'garage-side' ? -Math.PI / 2 : -0.55 });
      list.forEach((d, i) => room.setPick(i, { driver: d, kart: KARTS[(from + i) % KARTS.length], color: d.color }));
      const loop = () => {
        if (!live) return;
        requestAnimationFrame(loop);
        room.update(1 / 60, performance.now() / 1000);
        stage.render([{ rect: { x: 0, y: 0, w: stage.size.W, h: stage.size.H }, camera: room.camera, scene: room.scene }]);
      };
      loop();
    }
    window.__kart = { phase: 'debug' };
    return { destroy() { live = false; room.dispose(); hud.destroy(); stage.dispose(); delete window.__kart; } };
  }
  // warm the model cache so the race builds quickly
  await Promise.all([...new Set([...DRIVERS.map((d) => d.file), ...KARTS.map((k) => k.file)])].map((f) => loadGLTF(S(f)).catch((e) => console.warn('[kart] preload failed', f, e))));

  // ------------------------------------------------------------------ state
  let destroyed = false;
  let phase = 'lobby';
  let track = null;
  let world = null;
  let items = null;
  let karts = []; // grid order
  let ranking = [];
  const humans = new Map(); // pid -> { kart, view, cam, engine }
  let viewOrder = []; // pids in viewport order
  let shared = false; // 5+ humans: one shared view instead of split screen
  let sharedCam = null;
  const inputs = new Map(); // pid -> latest input + edges
  const cup = { race: 0, points: new Map(), order: [], cc: forceCC || 100, trackIdx: 0 };
  let raceTime = 0;
  let cdT = 0;
  let finishCount = 0;
  let endAt = -1;
  let zapCooldown = 0;
  let lobby = null;
  let introCam = null;
  let introT = 0;
  let portraits = new Map();
  let lastWallSfx = 0;
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms); timers.add(t); return t; };
  const wait = (ms) => new Promise((r) => later(ms, r));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const vib = (pid, p) => { try { ctx.vibrate?.(pid, p); } catch { /* older platform */ } };

  // ------------------------------------------------------------------ phone messaging
  const picks = new Map(); // pid -> { driver, kart, paint, custom, ready }
  const customKarts = custom?.karts || [];
  let customThumbs = [];
  function racerIds() { return ctx.players().slice(0, MAX_HUMANS).map((p) => p.id); }
  // default drivers per player slot: visually distinct from behind (colour, silhouette), no two alike
  const DEFAULT_DRIVERS = ['bo', 'penny', 'robo', 'panda', 'max', 'knight', 'yeti', 'bun', 'shade', 'brute', 'oodi', 'ooli', 'oobi'];
  function pickOf(pid) {
    if (!picks.has(pid)) {
      const i = Math.max(0, ctx.players().findIndex((p) => p.id === pid));
      const used = new Set([...picks.values()].map((q) => q.driver));
      const order = [...DEFAULT_DRIVERS.slice(i % DEFAULT_DRIVERS.length), ...DEFAULT_DRIVERS.slice(0, i % DEFAULT_DRIVERS.length)];
      const driver = order.find((id) => !used.has(id)) || order[0];
      picks.set(pid, { driver, kart: KARTS[(i + 1) % KARTS.length].id, paint: 'player', custom: null, ready: false });
    }
    return picks.get(pid);
  }
  function roleOf(pid) {
    if (phase === 'lobby') return racerIds().includes(pid) ? 'racer' : 'full';
    if (humans.has(pid)) return 'racer';
    return ctx.players().length > MAX_HUMANS ? 'full' : 'spectator';
  }
  function phoneState(pid) {
    const p = ctx.player(pid);
    if (!p) return;
    const role = roleOf(pid);
    const msg = { type: 'state', phase, role, admin: pid === ctx.adminId, laps: LAPS };
    if (phase === 'lobby') {
      msg.tracks = TRACKS.map((t, i) => ({ i, name: t.name, difficulty: t.difficulty }));
      msg.sel = { track: cup.trackIdx, cc: cup.cc };
      msg.left = lobby ? Math.ceil(lobby.t) : LOBBY_TIME;
      if (role === 'racer') msg.pick = pickOf(pid);
      msg.customs = customKarts.map((c, i) => ({ i, name: c.name || `Custom ${i + 1}`, thumb: customThumbs[i] || null, hasDriver: !!c.driver }));
      msg.taken = [...picks.entries()].filter(([id]) => id !== pid && racerIds().includes(id)).map(([, q]) => q.driver);
    } else {
      msg.track = track?.def.name;
      const h = humans.get(pid);
      if (h) msg.color = h.kart.racer.color;
    }
    ctx.send(pid, msg);
    const h = humans.get(pid);
    if (h && phase !== 'lobby') { sendStatus(h.kart, true); sendItem(h.kart); }
  }
  const broadcastState = () => ctx.players().forEach((p) => phoneState(p.id));
  const lastStatus = new Map();
  function sendStatus(k, force = false) {
    if (!k.human) return;
    const pos = ranking.indexOf(k) + 1;
    const lap = Math.min(LAPS, Math.max(1, k.lapsDone + 1));
    const key = `${pos}/${lap}/${k.coins}/${k.finished}/${k.wrongWay}`;
    if (!force && lastStatus.get(k.id) === key) return;
    lastStatus.set(k.id, key);
    ctx.send(k.racer.playerId, { type: 'status', pos, total: ranking.length, lap, laps: LAPS, coins: k.coins, finished: k.finished, place: k.place, ww: k.wrongWay, time: k.finished ? fmtTime(k.finishTime) : null });
  }
  function sendItem(k) {
    if (!k.human) return;
    ctx.send(k.racer.playerId, { type: 'item', item: k.item, count: k.itemCount, rolling: k.rolling > 0, held: k.held });
  }
  const buzz = (k, kind) => { if (k.human && !k.disconnected) ctx.send(k.racer.playerId, { type: 'buzz', kind }); };

  ctx.onMessage((pid, m) => {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'input') {
      const st = inputs.get(pid) || { s: 0, g: false, b: false, d: false, i: false, a: 0, iDown: false, iUp: false, dDown: false, smart: true };
      const i = !!m.i; const d = !!m.d;
      if (i && !st.i) st.iDown = true;
      if (!i && st.i) st.iUp = true;
      if (d && !st.d) st.dDown = true;
      st.s = clamp(Number(m.s) || 0, -1, 1); st.g = !!m.g; st.b = !!m.b; st.d = d; st.i = i; st.a = Number(m.a) || 0;
      st.smart = m.m !== 0;
      inputs.set(pid, st);
      const h = humans.get(pid);
      if (h) h.kart.smart = st.smart;
    } else if (m.type === 'hello') phoneState(pid);
    else if (phase === 'lobby') {
      if (m.type === 'sel' && racerIds().includes(pid)) {
        const q = pickOf(pid);
        if (q.ready) return;
        if (m.driver && DRIVERS.some((d) => d.id === m.driver)) q.driver = m.driver;
        if (m.kart && KARTS.some((k) => k.id === m.kart)) { q.kart = m.kart; q.custom = null; }
        if (m.custom != null && customKarts[m.custom]) q.custom = m.custom;
        if (m.paint && PAINTS.some((p) => p.id === m.paint)) q.paint = m.paint;
        sfx.play('tick');
        renderLobby();
        phoneState(pid);
      } else if (m.type === 'ready' && racerIds().includes(pid)) {
        pickOf(pid).ready = !!m.on;
        sfx.play(m.on ? 'correct' : 'click');
        renderLobby();
        broadcastState();
        const ids = racerIds();
        if (ids.length && ids.every((id) => pickOf(id).ready)) { lobby.t = Math.min(lobby.t, 1.6); }
      } else if (pid === ctx.adminId && m.type === 'pick') {
        if (Number.isInteger(m.track) && TRACKS[m.track]) cup.trackIdx = m.track;
        if (CLASSES[m.cc]) cup.cc = m.cc;
        sfx.play('blip');
        renderLobby();
        broadcastState();
      } else if (pid === ctx.adminId && m.type === 'start') startFromLobby();
    }
  });
  ctx.onJoin((p) => {
    const h = humans.get(p.id);
    if (h) {
      h.kart.disconnected = false;
      h.kart.autopilot = h.kart.finished;
      h.kart.racer.name = p.name;
    }
    if (phase === 'lobby') renderLobby();
    phoneState(p.id);
  });
  ctx.onLeave((p) => {
    const h = humans.get(p.id);
    if (h) { h.kart.disconnected = true; h.kart.autopilot = true; inputs.delete(p.id); }
    if (phase === 'lobby') { renderLobby(); broadcastState(); }
  });

  // ------------------------------------------------------------------ lobby: track + speed + driver/kart select
  const previews = TRACKS.map((def) => new Track(def));
  let room = null; // showroom (3D turntables)
  const STAT_LABELS = [['speed', 'Speed'], ['accel', 'Accel'], ['handling', 'Handling'], ['weight', 'Weight'], ['turbo', 'Mini-turbo']];
  function pickVisual(pid) {
    const q = pickOf(pid);
    const p = ctx.player(pid);
    const paint = paintById(q.paint);
    const cu = q.custom != null ? customKarts[q.custom] : null;
    return { driver: driverById(q.driver), kart: kartById(q.kart), custom: cu, color: paint.color || p?.color || '#ffffff', ringColor: p?.color || '#ffffff' };
  }
  function statsOf(pid) {
    const q = pickOf(pid);
    const cu = q.custom != null ? customKarts[q.custom] : null;
    const kart = cu?.stats ? { stats: { ...KARTS[1].stats, ...cu.stats } } : kartById(q.kart);
    return combineStats(driverById(q.driver), kart);
  }
  function renderLobby() {
    if (!lobby) return;
    const ps = ctx.players();
    const admin = ctx.player(ctx.adminId);
    const ids = racerIds();
    lobby.panel.querySelector('.kx-sub').innerHTML = `${admin ? `<b>${esc(admin.name)}</b> picks the track · everyone picks a driver &amp; kart on their phone` : 'Pick a track'}`;
    lobby.panel.querySelectorAll('.kx-card').forEach((c, i) => c.classList.toggle('sel', i === cup.trackIdx));
    lobby.panel.querySelectorAll('.kx-cc span').forEach((c) => c.classList.toggle('on', Number(c.dataset.cc) === cup.cc));
    lobby.panel.querySelector('.kx-extra').innerHTML = (ps.length > MAX_HUMANS ? `<span style="--c:#555">+${ps.length - MAX_HUMANS} spectating</span>` : '')
      + `<span style="--c:#333">+ ${GRID - ids.length} CPU racers</span>`;
    // slots
    const slotsEl = lobby.panel.querySelector('.kx-slots');
    slotsEl.style.setProperty('--n', String(Math.max(1, ids.length)));
    slotsEl.classList.toggle('many', ids.length > 4);
    slotsEl.innerHTML = ids.map((pid) => {
      const p = ctx.player(pid);
      const q = pickOf(pid);
      const d = driverById(q.driver);
      const cu = q.custom != null ? customKarts[q.custom] : null;
      const kname = cu ? `★ ${cu.name || 'Custom'}` : kartById(q.kart)?.name;
      const st = statsOf(pid);
      return `<div class="kx-slot ${q.ready ? 'ready' : ''}" style="--c:${p?.color || '#fff'}">
        <div class="nm">${esc(p?.name || '')}</div>
        <div class="dk"><b>${esc(cu?.driver ? cu.name : d?.name || '')}</b> · ${esc(kname || '')} <i>${d?.weight || ''}</i></div>
        <div class="bars">${STAT_LABELS.map(([k, l]) => `<div><span>${l}</span><em><s style="width:${(st[k] / 6) * 100}%"></s></em></div>`).join('')}</div>
        <div class="rd">${q.ready ? 'READY!' : 'choosing…'}</div></div>`;
    }).join('');
    ids.forEach((pid, i) => room?.setPick(i, pickVisual(pid)));
    if (room) layoutRoom();
  }
  function layoutRoom() {
    const { W, H } = stage.size;
    const n = Math.max(1, racerIds().length);
    room.layout(n, W / H, n > 4 ? { perRow: 8, spacing: 4.5 } : { perRow: 4, spacing: 4.8 });
    // aim the camera above the podiums so they sit in the lower half, under the track cards
    room.camera.position.y += 0.6;
    room.camera.lookAt(0, 2.0, 0);
    room.camera.updateMatrixWorld();
  }
  const _sp = new THREE.Vector3();
  function placeSlotCards() {
    if (!lobby) return;
    const cards = lobby.panel.querySelectorAll('.kx-slot');
    const { W } = stage.size;
    cards.forEach((c, i) => {
      const sl = room.slots[i];
      if (!sl) return;
      _sp.copy(sl.group.position).project(room.camera);
      const x = Math.round(((_sp.x + 1) / 2) * W);
      if (c.dataset.x !== String(x)) { c.dataset.x = String(x); c.style.left = `${x}px`; }
    });
  }
  stage.onResize(() => { if (phase === 'lobby' && room) layoutRoom(); });
  async function enterLobby() {
    phase = 'lobby';
    hud.hideViews();
    if (!room) room = createShowroom({ sharedAsset: S, asset: A, environment: stage.envTex });
    // render thumbnails for custom karts so phones can show them in the carousel
    if (customKarts.length && !customThumbs.length) customThumbs = await renderCustomThumbs();
    const panel = hud.panel(`
      <div class="kx-lobby">
        <h1>KART <em>CHAOS</em></h1>
        <div class="kx-sub"></div>
        <div class="kx-tracks sm">${TRACKS.map((t, i) => `
          <div class="kx-card" data-i="${i}"><canvas></canvas><span class="n">CUP ${i + 1}</span><span class="d">${t.difficulty}</span>
            <div class="t"><b>${t.name}</b></div></div>`).join('')}</div>
        <div class="kx-cc">${[50, 100, 150].map((c) => `<span data-cc="${c}">${c}cc</span>`).join('')}</div>
        <div class="kx-slots"></div>
        <div class="kx-racers kx-extra"></div>
        <div class="kx-timer"></div>
      </div>`);
    panel.classList.add('clear');
    panel.querySelectorAll('.kx-card').forEach((card, i) => {
      drawTrackPreview(card.querySelector('canvas'), previews[i]);
      card.addEventListener('click', () => { cup.trackIdx = i; renderLobby(); broadcastState(); });
    });
    lobby = { panel, t: quickStart ? 1.2 : LOBBY_TIME };
    if (forceTrack) { const i = TRACKS.findIndex((t) => t.id === forceTrack); if (i >= 0) cup.trackIdx = i; }
    renderLobby();
    broadcastState();
  }
  async function renderCustomThumbs() {
    const out = [];
    try {
      const r = createShowroom({ sharedAsset: S, asset: A, environment: stage.envTex });
      r.layout(1, 1, { fixedYaw: 0.35 });
      const size = 160;
      const c2 = document.createElement('canvas'); c2.width = size; c2.height = size;
      const g = c2.getContext('2d');
      const pr = stage.pixelRatio;
      for (const cu of customKarts) {
        await r.setPick(0, { custom: cu, driver: DRIVERS[0], kart: KARTS[1], color: '#e4e8f2' });
        r.update(0.3, 1);
        r.camera.aspect = 1; r.camera.fov = 30; r.camera.position.set(4.6, 3.6, 6.6); r.camera.lookAt(0, 0.7, 0); r.camera.updateProjectionMatrix();
        stage.render([{ rect: { x: 0, y: 0, w: size, h: size }, camera: r.camera, scene: r.scene }]);
        g.drawImage(renderer.domElement, 0, 0, size * pr, size * pr, 0, 0, size, size);
        out.push(c2.toDataURL('image/jpeg', 0.8));
      }
      r.dispose();
    } catch (err) { console.warn('[kart] custom thumbnails failed', err); }
    return out;
  }
  function startFromLobby() {
    if (phase !== 'lobby' || !lobby) return;
    sfx.play('go');
    for (const id of racerIds()) pickOf(id).ready = true;
    lobby.panel.remove();
    lobby = null;
    setupRace(cup.trackIdx);
  }

  // ------------------------------------------------------------------ race setup
  function disposeWorld() {
    for (const h of humans.values()) { try { h.engine?.stop(); } catch { /* noop */ } }
    humans.clear();
    if (items) { items.dispose(); items = null; }
    for (const k of karts) k.dispose();
    karts = [];
    ranking = [];
    if (world) {
      scene.remove(world.group);
      scene.remove(world.sky.mesh);
      world.group.traverse((o) => {
        if (o.isInstancedMesh) { o.dispose(); return; }
        if (o.isMesh || o.isPoints) {
          o.geometry?.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m && !m.userData.shared && !m.userData.proto) { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); } });
        }
      });
      world.dispose();
      world = null;
    }
    fx.skids.clear();
  }

  async function setupRace(trackIdx) {
    phase = 'loading';
    const def = getTrackDef(TRACKS[trackIdx % TRACKS.length].id);
    broadcastState();
    const loading = hud.panel(`<div style="text-align:center"><h1><em>${esc(def.name)}</em></h1><div class="kx-sub">Building the track…</div></div>`);
    await wait(40);
    disposeWorld();
    track = new Track(def);
    sharedCam = new SharedCam(track);
    const th = def.theme;
    world = await buildTrackScene(track, S, { lowDetail: lowGfx });
    if (destroyed) return;
    // protect shared GLB materials from disposal between races
    world.group.traverse((o) => { if (o.isInstancedMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.userData.proto = true; }); } });
    scene.add(world.group);
    scene.add(world.sky.mesh);
    scene.background = new THREE.Color(th.sky[1]);
    scene.fog = new THREE.Fog(th.sky[1], th.fog[0] * 0.9, th.fog[1] * 1.1);
    sun.color.setHex(th.sun);
    sun.intensity = th.sunIntensity;
    hemi.color.setHex(th.hemi[0]);
    hemi.groundColor.setHex(th.hemi[1]);
    hemi.intensity = th.hemi[2];
    scene.environmentIntensity = th.night ? 0.4 : 0.55;
    items = new ItemSystem({ scene, track, fx, events: itemEvent });
    hud.setupMap(track, th);

    // ---- roster: up to 4 humans (their picks) + CPU racers with random combos to fill the grid
    const ps = ctx.players().slice(0, MAX_HUMANS);
    viewOrder = ps.map((p) => p.id);
    shared = viewOrder.length > SPLIT_MAX;
    sharedCam.reset();
    const racers = [];
    ps.forEach((p) => {
      const q = pickOf(p.id);
      const paint = paintById(q.paint);
      const cu = q.custom != null ? customKarts[q.custom] : null;
      const color = paint.color || p.color;
      racers.push({ id: `h:${p.id}`, playerId: p.id, human: true, name: p.name, avatar: p.avatar, color: p.color, colorHex: p.colorHex, bodyColor: color,
        driver: driverById(q.driver), kart: kartById(q.kart), custom: cu, stats: statsOf(p.id) });
    });
    const usedDrivers = new Set(racers.map((r) => r.driver?.id));
    const cpuDrivers = DRIVERS.filter((d) => !usedDrivers.has(d.id)).sort(() => Math.random() - 0.5);
    const cpuCustoms = customKarts.slice(ps.length);
    for (let i = racers.length, c = 0; i < GRID; i++, c++) {
      const d = cpuDrivers[c % cpuDrivers.length] || DRIVERS[c % DRIVERS.length];
      const kt = KARTS[Math.floor(Math.random() * KARTS.length)];
      const cu = cpuCustoms[c] || null;
      racers.push({ id: `c:${d.id}${c}`, human: false, name: cu?.name || d.name, color: CPU_COLORS[c], colorHex: CPU_HEX[c], bodyColor: CPU_COLORS[c],
        driver: d, kart: kt, custom: cu, stats: combineStats(d, cu?.stats ? { stats: { ...KARTS[1].stats, ...cu.stats } } : kt) });
    }
    // grid order: first race CPUs in front, humans at the back; later races lowest points start in front
    let order;
    if (cup.race === 0) order = [...racers.filter((r) => !r.human), ...racers.filter((r) => r.human)];
    else order = [...racers].sort((a, b) => (cup.points.get(a.id) || 0) - (cup.points.get(b.id) || 0));
    const cls = CLASSES[cup.cc];
    const level = cup.cc === 50 ? 1 : cup.cc === 100 ? 2 : 3;
    const built = await Promise.all(order.map(async (r, i) => {
      const model = await buildRacerModel({ driver: r.driver, kart: r.kart, color: r.bodyColor, custom: r.custom, sharedAsset: S, asset: A });
      r.rosterIndex = i;
      const k = new Kart({ racer: r, model, track, scene, fx, night: th.night });
      k.cls = cls;
      k.stats = r.stats;
      k.mass = 0.55 + r.stats.weight * 0.22;
      if (!r.human) {
        k.skill = cls.ai * (0.97 + Math.random() * 0.04);
        k.brain = new CpuDriver(k, track, { level, seed: Math.random() });
      } else k.smart = true;
      k.dustColor = th.shoulder;
      return k;
    }));
    if (destroyed) return;
    karts = built;
    karts.forEach((k, i) => {
      const d = -5 - i * 3.6;
      k.placeAt(track.wrapS(d), (i % 2 ? 1 : -1) * 3.4, d);
      k.brain ||= new CpuDriver(k, track, { level: 3, seed: Math.random() }); // drives humans that disconnect / finish
    });
    for (const pid of viewOrder) {
      const k = karts.find((kk) => kk.racer.playerId === pid);
      const cam = new ChaseCam(track);
      humans.set(pid, { kart: k, cam, engine: null, view: viewOrder.indexOf(pid) });
      if (!ctx.player(pid)?.connected) { k.disconnected = true; k.autopilot = true; }
    }
    raceTime = 0; finishCount = 0; endAt = -1; zapCooldown = 0;
    lastStatus.clear();
    inputs.clear();
    updateRanking();
    world.starter.reset();
    stage.setViewCount(1);
    // portraits for the placements screen
    portraits = renderPortraits();
    loading.remove();
    runIntro();
  }

  /** Placement-screen portraits: the pre-rendered select-screen headshots (custom racers use their kart thumbnail). */
  function renderPortraits() {
    const out = new Map();
    for (const k of karts) {
      const r = k.racer;
      const ci = r.custom ? customKarts.indexOf(r.custom) : -1;
      if (ci >= 0 && customThumbs[ci]) out.set(k.id, customThumbs[ci]);
      else if (r.driver) out.set(k.id, A(`select/driver-${r.driver.id}.jpg`));
    }
    return out;
  }

  // ------------------------------------------------------------------ intro flyover + countdown
  async function runIntro() {
    phase = 'intro';
    broadcastState();
    introCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 700);
    introT = 0;
    hud.hideViews();
    hud.title(track.def.name, `${LAPS} LAP${LAPS > 1 ? 'S' : ''} · ${CLASSES[cup.cc].label} · ${karts.length} RACERS`, `RACE ${cup.race + 1}`);
    sfx.play('whoosh');
    await wait(debug.includes('nofly') ? 200 : 5200);
    if (destroyed) return;
    hud.clearTitle();
    // split screen behind each player's kart
    phase = 'countdown';
    cdT = -0.8;
    for (const h of humans.values()) h.cam.snap(h.kart);
    applyLayout();
    let ei = 0;
    for (const h of humans.values()) {
      if (shared && ei++ > 0) continue; // one engine voice is plenty on a shared screen
      try { h.engine = sfx.engine(); } catch { h.engine = null; }
    }
    for (const k of karts) { k.rev = { pressAt: null }; }
    broadcastState();
  }

  let countStep = -1;
  function countdownStep(dt) {
    cdT += dt;
    const step = cdT < 0 ? -1 : Math.floor(cdT); // 0 = "3", 1 = "2", 2 = "1", 3 = GO
    // rev / rocket-start tracking
    for (const k of karts) {
      let gas;
      if (k.human && !k.disconnected) {
        const st = inputs.get(k.racer.playerId);
        gas = !!(st && st.g);
      } else {
        if (k.cpuRev == null) {
          const chance = cup.cc === 150 ? 0.55 : cup.cc === 100 ? 0.4 : 0.25;
          k.cpuRev = Math.random() < 0.04 ? 0.3 : Math.random() < chance ? 1.2 + Math.random() * 0.8 : 9;
        }
        gas = cdT >= k.cpuRev;
      }
      if (gas && k.rev.pressAt == null) k.rev.pressAt = cdT;
      if (!gas) k.rev.pressAt = null;
      k.revving = gas;
      if (gas && Math.random() < 0.25) {
        const sin = Math.sin(k.heading); const cos = Math.cos(k.heading);
        fx.smoke.emit(k.x - sin * 1.6, k.y + 0.8, k.z - cos * 1.6, -sin * 2, 1.5, -cos * 2, { color: 0xdddddd, size: 0.7, life: 0.6, grow: 2.5, drag: 2, alpha: 0.45 });
      }
    }
    if (step !== countStep) {
      countStep = step;
      if (step >= 0 && step <= 2) {
        world.starter.set(step + 1);
        world.startLights?.forEach((m, i) => { m.emissive.setHex(i < Math.round((step + 1) * 5 / 3) ? 0xff2020 : 0x000000); m.emissiveIntensity = 3; });
        sfx.play('countdown');
        forViews((v) => v.countdown(String(3 - step)));
      } else if (step === 3) {
        world.starter.set(0, true);
        world.startLights?.forEach((m) => { m.emissive.setHex(0x20ff40); m.emissiveIntensity = 3; });
        sfx.play('go');
        forViews((v) => v.countdown('GO!', 'go'));
        later(900, () => forViews((v) => v.countdown(null)));
        later(1200, () => world?.starter.flyAway());
        // rocket starts
        for (const k of karts) {
          const at = k.rev.pressAt;
          if (at == null) continue;
          if (at < 0.75) {
            k.spinT = 1.1; k.spinMax = 1.1; k.spinDir = 1;
            if (k.human) { viewOf(k)?.rocket('BURNOUT!'); buzz(k, 'burnout'); }
          } else if (at >= 1.0 && at <= 2.3) {
            const q = 1 - Math.abs(at - 1.55) / 0.8;
            k.startBoost(0.7 + q * 0.7, 0);
            k.speed = 0;
            if (k.human) { viewOf(k)?.rocket('ROCKET START!'); buzz(k, 'boost'); vib(k.racer.playerId, 'boost'); sfx.play('whoosh'); }
          }
        }
        phase = 'race';
        raceTime = 0;
        broadcastState();
      }
    }
  }

  // ------------------------------------------------------------------ layout & views
  function applyLayout() {
    const { W, H } = stage.size;
    if (shared) {
      stage.setViewCount(1);
      const rect = { x: 0, y: 0, w: W, h: H };
      sharedRect = rect;
      sharedCam.setAspect(W / H);
      for (const h of humans.values()) h.rect = null;
      hud.views[0].reset();
      const mw = Math.round(W * 0.4); const mh = Math.round(mw * 9 / 16);
      const m = { x: W - mw - Math.round(W * 0.012), y: H - mh - Math.round(H * 0.02), w: mw, h: mh };
      hud.layout([rect], W, H, m, { shared: true });
      mapRect = m;
      return;
    }
    const n = Math.max(1, viewOrder.length);
    stage.setViewCount(n);
    const lay = stage.layout(n);
    viewOrder.forEach((pid, i) => {
      const h = humans.get(pid);
      h.rect = lay.views[i];
      h.cam.setAspect(h.rect.w / h.rect.h);
      const v = hud.views[i];
      v.reset();
      v.player(h.kart.racer.name, h.kart.racer.color);
    });
    hud.layout(lay.views.slice(0, n), W, H, lay.map);
    mapRect = lay.map;
  }
  let sharedRect = null;
  let mapRect = null;
  stage.onResize(() => { if (phase === 'countdown' || phase === 'race' || phase === 'post') applyLayout(); });
  const viewOf = (k) => { if (shared) return null; const h = humans.get(k.racer.playerId); return h ? hud.views[h.view] : null; };
  const forViews = (fn) => { if (shared) { fn(hud.views[0], null); return; } for (const h of humans.values()) fn(hud.views[h.view], h); };

  // ------------------------------------------------------------------ events
  function itemEvent(name, d) {
    if (name === 'hit') {
      const k = d.kart;
      if (d.result === 'hit') {
        sfx.play('hit');
        buzz(k, 'hit');
        if (k.human) vib(k.racer.playerId, 'hit');
        items.dropTrail(k);
        if (d.lost > 0) fx.burst(k.x, k.y + 1.2, k.z, { n: d.lost * 4, color: 0xffc21a, speed: 6, size: 0.7, life: 0.7, grav: 14 });
        if (d.by && d.by !== k && (d.by.human || k.human)) hud.toast(d.by.racer.color, `<b>${esc(d.by.racer.name)}</b> hit <b>${esc(k.racer.name)}</b>`);
        sendItem(k);
      } else if (d.result === 'immune') {
        sfx.play('blip');
      }
    } else if (name === 'shoot') { sfx.play('shoot'); sendItem(d); }
    else if (name === 'drop' || name === 'throw') { sfx.play('click'); sendItem(d); }
    else if (name === 'bounce') sfx.play('tick');
    else if (name === 'blocked') { sfx.play('correct'); sendItem(d.kart); }
  }

  function kartEvent(k, name, v) {
    const view = k.human ? viewOf(k) : null;
    if (name === 'turbo') {
      if (k.human) { sfx.play('whoosh'); buzz(k, 'boost'); vib(k.racer.playerId, 'boost'); }
      fx.burst(k.x, k.y + 0.6, k.z, { n: 14, color: DRIFT_COLORS[v - 1], speed: 6, size: 0.8, life: 0.35, grav: 6 });
    } else if (name === 'driftLevel') {
      if (k.human) { sfx.play(v === 3 ? 'powerup' : 'blip'); buzz(k, `drift${v}`); }
    } else if (name === 'pad') {
      if (k.human) { sfx.play('whoosh'); buzz(k, 'boost'); vib(k.racer.playerId, 'boost'); }
    } else if (name === 'wall') {
      if (k.human && raceTime - lastWallSfx > 0.15) { sfx.play('hit'); lastWallSfx = raceTime; }
      if (v > 9 && k.human) { buzz(k, 'wall'); vib(k.racer.playerId, 'bump'); }
    } else if (name === 'trick') {
      if (k.human) { sfx.play('jump'); view?.rocket('TRICK!'); }
      fx.burst(k.x, k.y + 1.2, k.z, { n: 16, color: 0xffffff, speed: 6, size: 0.6, life: 0.4, grav: 2 });
    } else if (name === 'trickBoost') {
      if (k.human) { sfx.play('whoosh'); buzz(k, 'boost'); }
    } else if (name === 'hop') {
      if (k.human) sfx.play('tick');
    } else if (name === 'wrongWay') {
      if (k.human) { if (v) { buzz(k, 'warn'); vib(k.racer.playerId, 'warn'); } sendStatus(k); }
    } else if (name === 'land') {
      if (k.human && v > 10) sfx.play('tick');
    }
    void view;
  }

  function useInstant(k, it) {
    if (it === 'pepper' || it === 'pepper3') {
      k.startBoost(1.25, 0);
      k.itemCount -= 1;
      if (k.itemCount <= 0) { k.item = null; k.itemCount = 0; }
      if (k.human) { sfx.play('whoosh'); buzz(k, 'boost'); vib(k.racer.playerId, 'boost'); }
    } else if (it === 'star') {
      k.starT = 7.5;
      k.item = null; k.itemCount = 0;
      if (k.human) { sfx.play('powerup'); buzz(k, 'star'); }
    } else if (it === 'coins') {
      k.coins = Math.min(10, k.coins + 3);
      k.item = null; k.itemCount = 0;
      fx.burst(k.x, k.y + 2, k.z, { n: 18, color: 0xffd84a, speed: 5, size: 0.8, life: 0.6, grav: 10 });
      if (k.human) sfx.play('coin');
    } else if (it === 'zap') {
      k.item = null; k.itemCount = 0;
      zapCooldown = 25;
      sfx.play('explosion');
      for (const o of karts) {
        if (o === k || o.finished) continue;
        const r = o.hit('zap');
        if (r.result === 'hit') {
          items.dropTrail(o);
          fx.burst(o.x, o.y + 2.5, o.z, { n: 10, color: 0xfff36a, speed: 3, size: 1.4, life: 0.4, grav: 0 });
          if (o.human) { viewOf(o)?.banner('ZAPPED!', '', '#fff36a'); buzz(o, 'hit'); vib(o.racer.playerId, 'explosion'); }
        }
        sendItem(o);
      }
      hud.toast(k.racer.color, `<b>${esc(k.racer.name)}</b> zapped everyone!`);
    }
    sendItem(k);
  }

  function handleItems(k, down, downEdge, upEdge, aim) {
    if (k.finished) return;
    if (downEdge) {
      if (!k.grounded && k.rampAir && !k.trickDone) k.doTrick((n, v) => kartEvent(k, n, v));
      else if (k.item && k.rolling <= 0 && !k.held && k.spinT <= 0) {
        const it = k.item;
        if (HOLDABLE.has(it)) {
          items.hold(k, it);
          k.item = null; k.itemCount = 0;
          if (k.human) sfx.play('click');
          sendItem(k);
        } else useInstant(k, it);
      }
    }
    if (k.held && (!down || upEdge)) {
      items.release(k, aim, ranking);
      sendItem(k);
    }
  }

  // ------------------------------------------------------------------ race logic
  function updateRanking() {
    ranking = [...karts].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishOrder - b.finishOrder;
      return b.dist - a.dist;
    });
  }

  function finishKart(k) {
    k.finished = true;
    k.finishTime = raceTime;
    k.finishOrder = finishCount++;
    k.place = k.finishOrder + 1;
    k.autopilot = true;
    k.held && items.dropTrail(k);
    if (k.human) {
      const h = humans.get(k.racer.playerId);
      h.cam.mode = 'finish';
      const v = viewOf(k);
      v?.finish(k.place, `${ordinal(k.place)} · ${fmtTime(k.finishTime)}`);
      v?.speedLines(false);
      sfx.play(k.place <= 3 ? 'win' : 'lose');
      vib(k.racer.playerId, k.place <= 3 ? 'win' : 'success');
      buzz(k, 'finish');
      fx.confetti.burst(k.x, k.y + 5, k.z, 14);
      try { h.engine?.stop(); } catch { /* noop */ } h.engine = null;
      const d = k.model.driver;
      if (d?.anim) d.anim.play(k.place <= 3 ? 'emote-yes' : 'emote-no', { fade: 0.3 }) || d.anim.play('jump');
      hud.toast(k.racer.color, `<b>${esc(k.racer.name)}</b> finished ${ordinal(k.place)}`);
      sendStatus(k, true);
    } else {
      const d = k.model.driver;
      if (d?.anim && k.place <= 3) d.anim.play('emote-yes', { fade: 0.3 });
    }
    if (k.place === 1) {
      const p = track.pointAt(0);
      fx.confetti.burst(p.x, p.y + 7, p.z, 24);
    }
  }

  function raceStep(dt) {
    raceTime += dt;
    zapCooldown = Math.max(0, zapCooldown - dt);
    const world_ = { karts, ranking, items, raceTime };
    // inputs (phones / CPU brains)
    for (const k of karts) {
      let down; let dEdge; let uEdge; let aim;
      if (k.human && !k.autopilot) {
        const st = inputs.get(k.racer.playerId);
        if (st) {
          k.input.steer = st.s; k.input.gas = st.g; k.input.brake = st.b; k.input.drift = st.d || st.dDown;
          down = st.i; dEdge = st.iDown; uEdge = st.iUp; aim = st.a;
          st.iDown = false; st.iUp = false; st.dDown = false;
        } else {
          k.input.steer = 0; k.input.gas = true; k.input.brake = false; k.input.drift = false;
          down = false; dEdge = false; uEdge = false; aim = 0;
        }
      } else {
        k.brain.update(dt, world_);
        down = k.input.item; dEdge = down && !k.prev.item; uEdge = !down && k.prev.item; aim = k.input.aim;
        if (k.finished) { k.input.gas = true; down = false; dEdge = false; }
      }
      k.prev.item = down;
      handleItems(k, down, dEdge, uEdge, aim);
      if (k.rolling > 0) {
        k.rolling -= dt;
        if (k.rolling <= 0) {
          k.item = k.rollItem; k.itemCount = k.item === 'pepper3' ? 3 : 1;
          if (k.human) { sfx.play('blip'); buzz(k, 'item'); }
          sendItem(k);
        }
      }
    }
    // rubber band (CPU only): a little help when behind the best human, a little restraint when far ahead
    let bestHuman = -Infinity;
    for (const h of humans.values()) bestHuman = Math.max(bestHuman, h.kart.dist);
    for (const k of karts) {
      if (k.human) continue;
      const diff = k.dist - bestHuman; // + = ahead of the best human
      // ahead: ease off a little (never speed-match); far behind: a small catch-up so the pack stays together
      k.rubber = diff > 0 ? 1 - clamp((diff - 30) / 260, 0, 1) * 0.07 : 1 + clamp((-diff - 70) / 300, 0, 1) * 0.05;
    }
    for (const k of karts) k.update(dt, true, (n, v) => kartEvent(k, n, v));
    collideKarts();
    slipstream(dt);
    items.updateBoxes(dt, raceTime, karts, (k) => {
      if (k.human) sfx.play('coin');
      if (k.item || k.rolling > 0 || k.held) return;
      const pos = ranking.indexOf(k);
      const n = ranking.length;
      k.rollItem = rollItem(n > 1 ? pos / (n - 1) : 0, n, { zapAllowed: zapCooldown <= 0 });
      if (k.rollItem === 'zap') zapCooldown = 30;
      k.rolling = 1.5;
      if (k.human) { buzz(k, 'roll'); vib(k.racer.playerId, 'select'); }
      sendItem(k);
    });
    items.updateCoins(dt, raceTime, karts, (k) => {
      if (k.coins < 10) k.coins++;
      if (k.human) { sfx.play('coin'); sendStatus(k); }
    });
    items.update(dt, raceTime, karts);
    // laps & finish
    for (const k of karts) {
      if (k.finished) continue;
      const laps = Math.floor(k.dist / track.L);
      if (laps > k.lapsDone) {
        k.lapsDone = laps;
        k.lapTimes.push(raceTime - k.lapStart);
        k.lapStart = raceTime;
        if (k.lapsDone >= LAPS) finishKart(k);
        else if (k.human) {
          buzz(k, 'lap');
          const v = viewOf(k);
          if (k.lapsDone === LAPS - 1) {
            v?.banner('FINAL LAP!', 'final');
            sfx.play('powerup');
            later(380, () => sfx.play('correct'));
          } else v?.banner(`LAP ${k.lapsDone + 1}`, '', '#fff');
        }
      }
    }
    updateRanking();
    for (const k of karts) if (k.human) sendStatus(k);
    // end: all humans finished (or gone) -> wrap up, CPUs are placed by current order
    const humansLeft = [...humans.values()].filter((h) => !h.kart.finished && !h.kart.disconnected).length;
    const waitAll = debug.includes('waitall') && karts.some((k) => !k.finished); // test: let every CPU finish
    if (endAt < 0 && humans.size && humansLeft === 0 && !waitAll) endAt = raceTime + 4.5;
    if (endAt < 0 && !humans.size) endAt = raceTime + 2;
    if ((endAt >= 0 && raceTime >= endAt) || raceTime > 60 * 8) endRace();
  }

  function collideKarts() {
    for (let a = 0; a < karts.length; a++) {
      const A = karts[a];
      for (let b = a + 1; b < karts.length; b++) {
        const B = karts[b];
        const dx = B.x - A.x; const dz = B.z - A.z;
        const d2 = dx * dx + dz * dz;
        const R = KART_RADIUS * ((A.shrinkVis ?? 1) + (B.shrinkVis ?? 1));
        if (d2 > R * R || d2 < 1e-6 || Math.abs(A.y - B.y) > 1.6) continue;
        // star / shrink interactions
        if (A.starT > 0 && B.starT <= 0) { const r = B.hit('shell'); if (r.result) itemEvent('hit', { kart: B, by: A, result: r.result, lost: r.lost }); continue; }
        if (B.starT > 0 && A.starT <= 0) { const r = A.hit('shell'); if (r.result) itemEvent('hit', { kart: A, by: B, result: r.result, lost: r.lost }); continue; }
        if (A.shrinkT > 0 && B.shrinkT <= 0 && A.squashT <= 0) { const r = A.hit('squish'); if (r.result) itemEvent('hit', { kart: A, by: B, result: r.result, lost: r.lost }); }
        else if (B.shrinkT > 0 && A.shrinkT <= 0 && B.squashT <= 0) { const r = B.hit('squish'); if (r.result) itemEvent('hit', { kart: B, by: A, result: r.result, lost: r.lost }); }
        const d = Math.sqrt(d2);
        const nx = dx / d; const nz = dz / d;
        const mA = A.mass * (A.boostT > 0 ? 1.8 : 1) * (A.shrinkT > 0 ? 0.4 : 1);
        const mB = B.mass * (B.boostT > 0 ? 1.8 : 1) * (B.shrinkT > 0 ? 0.4 : 1);
        const fA0 = A.vx * Math.sin(A.heading) + A.vz * Math.cos(A.heading);
        const fB0 = B.vx * Math.sin(B.heading) + B.vz * Math.cos(B.heading);
        const pen = R - d;
        A.x -= nx * pen * mB / (mA + mB); A.z -= nz * pen * mB / (mA + mB);
        B.x += nx * pen * mA / (mA + mB); B.z += nz * pen * mA / (mA + mB);
        const rv = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
        if (rv < 0) {
          const j = -(1 + 0.35) * rv / (1 / mA + 1 / mB);
          A.vx -= j * nx / mA; A.vz -= j * nz / mA;
          B.vx += j * nx / mB; B.vz += j * nz / mB;
          // not sticky: karts keep most of their forward speed and the lighter one is shoved sideways
          for (const [K, f0, sgn, m, mo] of [[A, fA0, -1, mA, mB], [B, fB0, 1, mB, mA]]) {
            const s = Math.sin(K.heading); const c = Math.cos(K.heading);
            const f1 = K.vx * s + K.vz * c;
            if (f0 > 0 && f1 < f0 * 0.82) { const add = f0 * 0.82 - f1; K.vx += s * add; K.vz += c * add; }
            const side = (sgn * nx) * -c + (sgn * nz) * s; // push direction projected on K's right vector
            const kick = clamp(-rv * 0.45 * (mo / (m + mo)), 0, 6) * (Math.sign(side) || 1);
            K.vx += -c * kick; K.vz += s * kick;
          }
          if (-rv > 4) {
            fx.burst((A.x + B.x) / 2, (A.y + B.y) / 2 + 0.8, (A.z + B.z) / 2, { n: 10, color: 0xfff0a0, speed: 5, size: 0.45, life: 0.3, grav: 14 });
            if ((A.human || B.human) && raceTime - lastWallSfx > 0.12) { sfx.play('hit'); lastWallSfx = raceTime; }
            A.camShake = Math.max(A.camShake, 0.15); B.camShake = Math.max(B.camShake, 0.15);
            if (-rv > 8) { buzz(A, 'bump'); buzz(B, 'bump'); if (A.human) vib(A.racer.playerId, 'bump'); if (B.human) vib(B.racer.playerId, 'bump'); }
          }
        }
      }
    }
  }

  // drafting: tuck in behind a kart for ~1.5 s for a slipstream boost
  function slipstream(dt) {
    for (const A of karts) {
      if (A.finished || !A.grounded || A.speed < 14 || A.boostT > 0 || A.spinT > 0) { A.draftT = Math.max(0, A.draftT - dt * 2); A.drafting = false; continue; }
      const s = Math.sin(A.heading); const c = Math.cos(A.heading);
      let found = false;
      for (const B of karts) {
        if (B === A || B.speed < 10) continue;
        const dx = B.x - A.x; const dz = B.z - A.z;
        const along = dx * s + dz * c;
        if (along < 2.5 || along > 17) continue;
        const lat = Math.abs(dx * -c + dz * s);
        if (lat < 1.8 + along * 0.06) { found = true; break; }
      }
      A.drafting = found;
      if (found) {
        A.draftT += dt;
        if (Math.random() < 0.6) {
          fx.smoke.emit(A.x + (Math.random() - 0.5) * 3, A.y + 0.6 + Math.random() * 1.6, A.z + (Math.random() - 0.5) * 3, -s * 9, 0, -c * 9, { color: 0xffffff, size: 0.35, life: 0.35, drag: 0, alpha: 0.6 });
        }
        if (A.draftT > 1.5) {
          A.draftT = 0;
          A.startBoost(1.0, 0);
          if (A.human) { sfx.play('whoosh'); buzz(A, 'boost'); viewOf(A)?.rocket('SLIPSTREAM!'); }
        }
      } else A.draftT = Math.max(0, A.draftT - dt * 1.5);
    }
  }

  async function endRace() {
    if (phase !== 'race') return;
    phase = 'post';
    for (const h of humans.values()) { try { h.engine?.stop(); } catch { /* noop */ } h.engine = null; }
    // place the unfinished by current order
    updateRanking();
    ranking.forEach((k, i) => { if (!k.finished) { k.place = i + 1; k.autopilot = true; } });
    broadcastState();
    await wait(1500);
    if (destroyed) return;
    // cup points
    ranking.forEach((k, i) => cup.points.set(k.racer.id, (cup.points.get(k.racer.id) || 0) + POINTS[i]));
    const rows = ranking.map((k, i) => ({
      place: i + 1, name: k.racer.name, color: k.racer.color, human: k.human, portrait: portraits.get(k.id),
      time: k.finished ? fmtTime(k.finishTime) : '--:--', points: POINTS[i], total: cup.points.get(k.racer.id),
    }));
    phase = 'results';
    const panel = hud.panel(placementsHtml(rows, { title: 'RACE <em>RESULTS</em>', sub: `${track.def.name} · ${CLASSES[cup.cc].label} · race ${cup.race + 1}` }));
    panel.style.background = 'linear-gradient(160deg,rgba(27,31,74,.86),rgba(11,13,34,.92))';
    sfx.play('win');
    await wait(debug.includes('fastresults') ? 1200 : 6500);
    if (destroyed) return;
    panel.remove();
    const humanRows = ranking.filter((k) => k.human).map((k) => ({
      player: ctx.player(k.racer.playerId) || { name: k.racer.name, color: k.racer.color },
      score: `${ordinal(k.place)}${k.finished ? ` · ${fmtTime(k.finishTime)}` : ''}`,
      label: `${cup.points.get(k.racer.id)} cup pts${k.lapTimes.length ? ` · best lap ${fmtTime(Math.min(...k.lapTimes))}` : ''}`,
    }));
    const choice = await ctx.showResults(humanRows, { title: 'Race Results', subtitle: `${track.def.name} · ${CLASSES[cup.cc].label}` });
    if (destroyed || choice !== 'again') return;
    cup.race++;
    cup.trackIdx = (cup.trackIdx + 1) % TRACKS.length;
    hud.hideViews();
    setupRace(cup.trackIdx);
  }

  // ------------------------------------------------------------------ intro camera
  const _a = new THREE.Vector3();
  function updateIntroCam(dt) {
    introT += dt;
    const u = Math.min(1, introT / 5.2);
    const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    const L = track.L;
    const s = track.wrapS(-L * 0.42 + e * (L * 0.42 - 38));
    const p = track.pointAt(s, 0);
    const side = Math.sin(u * Math.PI) * 24;
    const h = 34 * (1 - e) + 7;
    introCam.position.set(p.x + p.rx * side, p.y + h, p.z + p.rz * side);
    const q = track.pointAt(s + 26 + e * 8, 0);
    _a.set(q.x, q.y + 1 + (1 - e) * 2, q.z);
    introCam.lookAt(_a);
    introCam.aspect = stage.size.W / stage.size.H;
    introCam.updateProjectionMatrix();
    introCam.updateMatrixWorld();
  }

  // ------------------------------------------------------------------ frame loop
  let lastNow = performance.now();
  let elapsed = 0;
  let raf = 0;
  const perf = { frames: 0, acc: 0, fps: 0, ms: 0, msAcc: 0 };
  const fastSteps = Math.min(8, Number(params.get('kartFast')) || 0);
  function simulate(dt) {
    if (phase === 'race') raceStep(dt);
    else if (phase === 'countdown') {
      countdownStep(dt);
      for (const k of karts) { k.input.steer = 0; k.input.gas = false; k.update(dt, false, () => {}); }
    } else if (phase === 'post' || phase === 'results') {
      raceTime += dt;
      const w_ = { karts, ranking, items, raceTime };
      for (const k of karts) { if (!k.finished || k.autopilot) { k.brain.update(dt, w_); k.input.item = false; } k.update(dt, true, () => {}); }
      collideKarts();
      items.update(dt, raceTime, karts);
    } else if (phase === 'intro' || phase === 'loading') {
      for (const k of karts) k.update(dt, false, () => {});
    }
  }
  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;
    elapsed += dt;
    const t = elapsed;
    const t0 = performance.now();
    if (phase === 'lobby') {
      if (lobby) {
        lobby.t -= dt;
        const el = lobby.panel.querySelector('.kx-timer');
        const left = Math.max(0, Math.ceil(lobby.t));
        if (el && el.dataset.left !== String(left)) { el.dataset.left = String(left); el.textContent = `Starting in ${left}s · the host can press START`; if (left <= 5 && left > 0) sfx.play('tick'); broadcastState(); }
        if (lobby.t <= 0) startFromLobby();
      }
      if (room) {
        room.update(dt, t);
        stage.render([{ rect: { x: 0, y: 0, w: stage.size.W, h: stage.size.H }, camera: room.camera, scene: room.scene }]);
        placeSlotCards();
      }
      return;
    }
    if (!world || !track) return;
    // test-only: ?kartFast=N runs N fixed 1/30 s simulation steps per rendered frame (slow software GL)
    const steps = fastSteps && (phase === 'race' || phase === 'post') ? fastSteps : 1;
    for (let i = 0; i < steps; i++) simulate(steps > 1 ? 1 / 30 : dt);
    if (phase !== 'race') { items?.updateBoxes(dt, t, [], () => {}); items?.updateCoins(dt, t, [], () => {}); }
    for (const k of karts) {
      k.syncVisual(dt, t);
      if (phase === 'race' || phase === 'post' || phase === 'results') k.emitFx(dt);
    }
    world.update(dt, t);
    fx.update(dt);
    // engines
    for (const h of humans.values()) {
      if (!h.engine) continue;
      const k = h.kart;
      const p = phase === 'countdown' ? (k.revving ? 0.55 + Math.sin(t * 30) * 0.05 : 0.05) : clamp(Math.abs(k.speed) / k.cls.top, 0, 1.3) * 0.8 + (k.boostT > 0 ? 0.25 : 0);
      try { h.engine.set(p); } catch { /* noop */ }
    }
    // ---- render
    if (phase === 'intro' || phase === 'loading' || !humans.size) {
      if (introCam) {
        if (phase === 'intro') updateIntroCam(dt);
        const { W, H } = stage.size;
        world.sky.follow(introCam);
        setPointScale(H, introCam);
        // shadow box around the point the flyover camera is looking at (wide: the flyover sees a lot)
        stage.fitShadowView(introCam.position.x, _a.y, introCam.position.z, Math.atan2(_a.x - introCam.position.x, _a.z - introCam.position.z), 80);
        for (const k of karts) if (k.label) k.label.visible = false;
        stage.render([{ rect: { x: 0, y: 0, w: W, h: H }, camera: introCam }]);
      }
    } else {
      const list = viewList;
      list.length = 0;
      if (shared) {
        humanKarts.length = 0;
        for (const h of humans.values()) humanKarts.push(h.kart);
        sharedCam.update(dt, humanKarts);
        if (sharedRect) list.push(sharedSpec);
      } else for (const h of humans.values()) h.cam.update(dt, h.kart, t);
      if (!shared) for (const pid of viewOrder) {
        const h = humans.get(pid);
        if (!h?.rect) continue;
        list.push(h.viewSpec || (h.viewSpec = makeViewSpec(h)));
      }
      stage.render(list);
      updateHud(t);
    }
    // perf log
    perf.frames++; perf.acc += dt; perf.msAcc += performance.now() - t0;
    if (perf.acc >= 1) { perf.fps = perf.frames / perf.acc; perf.ms = perf.msAcc / perf.frames; perf.frames = 0; perf.acc = 0; perf.msAcc = 0; }
  }
  const viewList = [];
  const humanKarts = [];
  const sharedSpec = {
    get rect() { return sharedRect; },
    get camera() { return sharedCam.camera; },
    shadow: () => { const f = sharedCam.focus; stage.fitShadowView(f.x, f.y, f.z, sharedCam.yaw, 52 + sharedCam.spread * 0.8); },
    before: () => {
      const cam = sharedCam.camera;
      world.sky.follow(cam);
      setPointScale(sharedRect.h, cam);
      for (const k of karts) if (k.label) { k.label.visible = true; k.fitLabel(cam, sharedRect.h, 40); }
    },
  };
  function shadowHalf() { const n = viewOrder.length; return n <= 1 ? 50 : n === 2 ? 46 : 40; }
  /** Render spec for one split-screen view (created once per race, no per-frame allocation). */
  function makeViewSpec(h) {
    return {
      get rect() { return h.rect; },
      camera: h.cam.camera,
      shadow: () => { const k = h.kart; stage.fitShadowView(k.x, k.y, k.z, h.cam.yaw, shadowHalf()); },
      before: () => {
        world.sky.follow(h.cam.camera);
        setPointScale(h.rect.h, h.cam.camera);
        for (const k of karts) {
          if (!k.label) continue;
          k.label.visible = k !== h.kart;
          if (k.label.visible) k.fitLabel(h.cam.camera, h.rect.h);
        }
      },
    };
  }
  function setPointScale(hCss, cam) {
    const px = (hCss * stage.pixelRatio) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    fx.setScale(px);
    items?.setPointScale(px);
  }

  function updateHud(t) {
    if (shared) {
      // shared view: race clock + the leading human's lap; everyone's position/item is on their own phone
      let lead = null;
      for (const h of humans.values()) if (!lead || h.kart.dist > lead.dist) lead = h.kart;
      if (lead) hud.views[0].lap(Math.min(LAPS, Math.max(1, lead.lapsDone + 1)), LAPS, fmtTime(Math.max(0, phase === 'race' ? raceTime : 0)));
      if (mapRect) hud.drawMap(ranking, t);
      return;
    }
    for (const h of humans.values()) {
      const v = hud.views[h.view];
      const k = h.kart;
      v.lap(Math.min(LAPS, Math.max(1, k.lapsDone + 1)), LAPS, fmtTime(Math.max(0, phase === 'race' ? (k.finished ? k.finishTime : raceTime) : 0)));
      v.pos(Math.max(1, k.finished ? k.place : ranking.indexOf(k) + 1));
      v.coins(k.coins);
      v.item(k.item, k.rolling > 0, t, k.itemCount, k.held);
      v.wrongWay(k.wrongWay && !k.finished);
      v.speedLines(!k.finished && (k.boostT > 0 || k.starT > 0 || k.draftT > 0.5));
      v.driftLevel(k.drift !== 0, k.driftLevel);
      v.hint(k.disconnected ? 'Disconnected: CPU is driving' : '');
    }
    if (mapRect) hud.drawMap(ranking, t);
  }

  // ------------------------------------------------------------------ debug hook for automated tests
  window.__kart = {
    get phase() { return phase; },
    get laps() { return LAPS; },
    get fps() { return perf.fps; },
    get frameMs() { return perf.ms; },
    get raceTime() { return raceTime; },
    trackL: () => track?.L,
    karts: () => karts.map((k) => ({ finishTime: k.finishTime, offroad: k.offroad, wrongWay: k.wrongWay, spinT: k.spinT, id: k.id, name: k.racer.name, human: k.human, x: k.x, z: k.z, y: k.y, heading: k.heading, dist: k.dist, lat: k.lat, laps: k.lapsDone, finished: k.finished, place: k.place, item: k.item, held: k.held, speed: k.speed, coins: k.coins, drift: k.drift, boostT: k.boostT, visible: k.root.visible, autopilot: k.autopilot })),
    ranking: () => ranking.map((k) => k.racer.name),
    /** Let the CPU brain drive the given human player ids (or 'all'). */
    autopilot(ids = 'all') {
      for (const h of humans.values()) if (ids === 'all' || ids.includes(h.kart.racer.playerId)) h.kart.autopilot = true;
    },
    start() { startFromLobby(); },
    give(pid, item) { const h = humans.get(pid) || [...humans.values()][0]; if (h) { h.kart.item = item; h.kart.itemCount = item === 'pepper3' ? 3 : 1; sendItem(h.kart); } },
    setDist(pid, dist) { const h = humans.get(pid) || [...humans.values()][0]; if (h) { const k = h.kart; k.placeAt(track.wrapS(dist), 0, dist); k.speed = 0; h.cam.snap(k); sharedCam?.reset(); } },
    cams: () => [...humans.values()].map((h) => ({ x: h.cam.pos.x, y: h.cam.pos.y, z: h.cam.pos.z, fov: h.cam.camera.fov })),
    /** Steering a test driver should apply for player pid (pure pursuit on the racing line). */
    suggestSteer(pid) {
      const h = humans.get(pid);
      if (!h || !track) return 0;
      const k = h.kart;
      const look = 8 + Math.max(0, k.speed) * 0.45;
      const p = track.pointAt(k.s + look, track.lineAt(k.s + look) * 0.6);
      return clamp(-angleDiff(Math.atan2(p.x - k.x, p.z - k.z), k.heading) * 2.4, -1, 1);
    },
    humanState(pid) { const k = humans.get(pid)?.kart; return k ? { laps: k.lapsDone, finished: k.finished, place: k.place, dist: k.dist, speed: k.speed, offroad: k.offroad, wrongWay: k.wrongWay, smart: k.smart, input: k.input.steer } : null; },
    get track() { return track?.def.id; },
    scene,
    renderer,
  };

  enterLobby();
  frame();

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      disposeWorld();
      hud.destroy();
      room?.dispose();
      stage.dispose();
      delete window.__kart;
    },
  };
}

export { ITEM_INFO, angleDiff };
