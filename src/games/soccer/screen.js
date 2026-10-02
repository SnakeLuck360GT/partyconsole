// Super Kickoff — TV screen. Authoritative match: teams + CPU fill, kickoffs, goals with slow-mo + replay,
// golden goal, bench rotation for big groups, broadcast-style sideline camera.
import { createStage, THREE } from '../../sdk/three-kit.js';
import { escapeHtml } from '../../sdk/screen-kit.js';
import { TEAMS, T, pitchFor, clamp } from './config.js';
import { createSim } from './sim.js';
import { updateBots, formation } from './ai.js';
import { buildStadium } from './stadium.js';
import { loadRoster, createPlayerView, makePose, ROSTER, disposeKits } from './players.js';
import { createFX } from './fx.js';
import { createHUD } from './hud.js';
import { createSounds } from './sounds.js';

const MAX_FIELD = 8; // outfield players per team; extra humans rotate in from the bench at kickoffs
const MATCH_SECS = 180;
const GOLDEN_MAX = 90;
const BOT_NAMES = ['Rex', 'Bolt', 'Pip', 'Juno', 'Ziggy', 'Mo', 'Taz', 'Nell', 'Ozzy', 'Kit', 'Bea', 'Dash', 'Fizz', 'Lou', 'Vee', 'Gus'];
const KEEPER_NAMES = ['Gloves', 'The Wall'];
const KEEPER_KIT = [0x2fcf73, 0xb46cff];
const REC_HZ = 30;
const REC_FRAMES = 160;
const REC_N = 10; // floats per slot per frame
const MAX_SLOTS = 40;

export default async function start(ctx) {
  const stage = createStage(ctx.container, { background: 0x0b1530, shadows: true, shadowArea: 26, fov: 30, envIntensity: 0.45, sunIntensity: 2.4 });
  const { scene, camera, renderer, sun } = stage;
  renderer.toneMappingExposure = 1.05;
  sun.shadow.mapSize.set(2048, 2048);
  sun.color.setHex(0xfff4e6);
  stage.hemi.intensity = 0.9;
  stage.hemi.color.setHex(0xdfe8ff);
  stage.hemi.groundColor.setHex(0x3a4a3a);
  const hud = createHUD(ctx.container);
  const fx = createFX(scene, renderer);

  const [sounds] = await Promise.all([createSounds(), loadRoster(ctx.sharedAsset)]);

  // ------------------------------------------------------------ state
  let destroyed = false;
  const timeouts = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); if (!destroyed) fn(); }, ms); timeouts.add(t); return t; };
  const wait = (ms) => new Promise((r) => later(r, ms));

  let phase = 'intro';
  let matchId = 0;
  let stadium = null;
  let pitchKey = '';
  let sim = null;
  const slots = []; // sim players (stable for the match). slot.ctrl = human id | null, slot.view, slot.pose
  const humans = new Map(); // id -> { id, team, slot, fieldTime, goals, assists, tackles, shots, saves, away }
  const inputs = new Map(); // id -> { x, y, a, b, aE, bE }
  const score = [0, 0];
  let clock = MATCH_SECS;
  let matchLen = MATCH_SECS;
  let golden = false;
  let goldenT = 0;
  let pendingGoal = null;
  let slowT = 99;
  let shake = 0;
  let kickTeam = 0;
  let autopilot = false;
  let botSeq = 0;
  let replay = null; // { t0, t1, t, side }
  let celebFocus = null;
  let goalSide = 0;
  let lastGoal = null;
  let kickoffN = 0;
  const counters = { passes: 0, shots: 0, tackles: 0, goals: 0, saves: 0 };

  const ballPose = { x: 0, y: T.ballRadius, z: 0 };

  // ------------------------------------------------------------ ball visuals
  const ballGeo = (() => {
    const g = new THREE.IcosahedronGeometry(T.ballRadius, 2).toNonIndexed();
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const ip = ico.attributes.position;
    const verts = [];
    for (let i = 0; i < ip.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(ip, i).normalize();
      if (!verts.some((u) => u.distanceTo(v) < 1e-3)) verts.push(v);
    }
    ico.dispose();
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const a = new THREE.Vector3();
    for (let f = 0; f < p.count; f += 3) {
      let black = false;
      for (let k = 0; k < 3 && !black; k++) {
        a.fromBufferAttribute(p, f + k).normalize();
        if (verts.some((u) => u.dot(a) > 0.9999)) black = true;
      }
      const c = black ? 0.06 : 0.95;
      for (let k = 0; k < 3; k++) col.set([c, c, c], (f + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  })();
  const ballMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, flatShading: true });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.castShadow = true;
  scene.add(ballMesh);
  const blobTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.renderOrder = 1;
  scene.add(blob);
  // ball marker: a small team-coloured chevron above a high ball so it's never lost
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
  const markerGeo = new THREE.ConeGeometry(0.22, 0.4, 4);
  markerGeo.rotateX(Math.PI);
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.renderOrder = 998;
  scene.add(marker);
  const ballAxis = new THREE.Vector3();
  const ballQ = new THREE.Quaternion();
  let ballPrevX = 0;
  let ballPrevZ = 0;

  function updateBallView(x, y, z, dt) {
    ballMesh.position.set(x, y, z);
    const dx = x - ballPrevX;
    const dz = z - ballPrevZ;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4 && d < 3) {
      ballAxis.set(dz / d, 0, -dx / d);
      ballQ.setFromAxisAngle(ballAxis, d / T.ballRadius);
      ballMesh.quaternion.premultiply(ballQ);
    }
    ballPrevX = x; ballPrevZ = z;
    const h = Math.max(0, y - T.ballRadius);
    blob.position.set(x, 0.025, z);
    const s = 0.75 + h * 0.18;
    blob.scale.set(s, 1, s);
    blobMat.opacity = Math.max(0.15, 1 - h * 0.12);
    marker.visible = h > 2.2;
    if (marker.visible) marker.position.set(x, y + 0.75, z);
    void dt;
  }

  // ------------------------------------------------------------ replay recorder (preallocated)
  const rec = new Float32Array(REC_FRAMES * MAX_SLOTS * REC_N);
  const recBall = new Float32Array(REC_FRAMES * 3);
  const recTime = new Float64Array(REC_FRAMES).fill(-1);
  let recHead = 0;
  let recAcc = 0;
  function record(simTime) {
    const f = recHead;
    recHead = (recHead + 1) % REC_FRAMES;
    recTime[f] = simTime;
    const b = sim.ball;
    recBall[f * 3] = b.x; recBall[f * 3 + 1] = b.y; recBall[f * 3 + 2] = b.z;
    const base = f * MAX_SLOTS * REC_N;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const o = base + i * REC_N;
      const p = slots[i];
      if (!p) { rec[o + 9] = 0; continue; }
      rec[o] = p.x; rec[o + 1] = p.z; rec[o + 2] = p.face; rec[o + 3] = Math.hypot(p.vx, p.vz);
      rec[o + 4] = p.kickAnim; rec[o + 5] = p.passAnim; rec[o + 6] = p.slide; rec[o + 7] = p.stun;
      rec[o + 8] = b.owner === p ? 1 : 0; rec[o + 9] = 1;
    }
  }
  /** Find the two recorded frames around simulation time t; returns blend into rf0/rf1/rk. */
  let rf0 = 0; let rf1 = 0; let rk = 0;
  function findFrames(t) {
    let best0 = -1; let t0 = -1e9; let best1 = -1; let t1 = 1e9;
    for (let i = 0; i < REC_FRAMES; i++) {
      const ti = recTime[i];
      if (ti < 0) continue;
      if (ti <= t && ti > t0) { t0 = ti; best0 = i; }
      if (ti >= t && ti < t1) { t1 = ti; best1 = i; }
    }
    if (best0 < 0) best0 = best1;
    if (best1 < 0) best1 = best0;
    rf0 = best0; rf1 = best1;
    rk = t1 > t0 && t1 < 1e8 && t0 > -1e8 ? (t - t0) / (t1 - t0) : 0;
  }
  const lerpAng = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
  function applyReplayFrame() {
    const b0 = rf0 * 3; const b1 = rf1 * 3;
    ballPose.x = recBall[b0] + (recBall[b1] - recBall[b0]) * rk;
    ballPose.y = recBall[b0 + 1] + (recBall[b1 + 1] - recBall[b0 + 1]) * rk;
    ballPose.z = recBall[b0 + 2] + (recBall[b1 + 2] - recBall[b0 + 2]) * rk;
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i];
      const o0 = rf0 * MAX_SLOTS * REC_N + i * REC_N;
      const o1 = rf1 * MAX_SLOTS * REC_N + i * REC_N;
      const ps = p.pose;
      ps.visible = rec[o0 + 9] > 0 && rec[o1 + 9] > 0;
      ps.x = rec[o0] + (rec[o1] - rec[o0]) * rk;
      ps.z = rec[o0 + 1] + (rec[o1 + 1] - rec[o0 + 1]) * rk;
      ps.face = lerpAng(rec[o0 + 2], rec[o1 + 2], rk);
      ps.speed = rec[o0 + 3] + (rec[o1 + 3] - rec[o0 + 3]) * rk;
      ps.kickAnim = rec[o1 + 4];
      ps.passAnim = rec[o1 + 5];
      ps.slide = rec[o1 + 6];
      ps.stun = rec[o1 + 7];
      ps.hasBall = rec[o1 + 8] > 0;
      ps.charging = false;
    }
  }
  function livePose(p) {
    const ps = p.pose;
    ps.visible = p.onPitch;
    ps.x = p.x; ps.z = p.z; ps.face = p.face; ps.speed = Math.hypot(p.vx, p.vz);
    ps.kickAnim = p.kickAnim; ps.passAnim = p.passAnim; ps.slide = p.slide; ps.stun = p.stun;
    ps.charging = p.charging; ps.charge = p.charge; ps.hasBall = sim.ball.owner === p;
  }

  // ------------------------------------------------------------ helpers
  const connected = (id) => !!ctx.player(id)?.connected;
  const teamOf = (id) => humans.get(id)?.team;
  function buzz(id, pattern) { if (id && humans.has(id) && connected(id)) ctx.vibrate(id, pattern); }
  function buzzTeam(team, pattern) { for (const h of humans.values()) if (h.team === team && h.slot && !h.away) buzz(h.id, pattern); }
  const tagName = (p) => (p.ctrl ? (ctx.player(p.ctrl)?.name || 'Player') : p.botName);
  function slotLabel(p) {
    if (p.ctrl) {
      const pl = ctx.player(p.ctrl);
      p.view.setName(pl?.name || 'Player', false);
      p.view.setRing(pl?.colorHex ?? 0xffffff);
    } else {
      p.view.setName(p.botName, true);
      p.view.setRing(null);
    }
  }
  const whoHtml = (id) => { const pl = ctx.player(id); return pl ? `<b style="--c:${TEAMS[teamOf(id)]?.css || '#fff'}">${escapeHtml(pl.name)}</b>` : ''; };

  function addSlot(team, role, ctrl) {
    const idx = slots.length;
    if (idx >= MAX_SLOTS) return null;
    const keeper = role === 'keeper';
    const botName = keeper ? KEEPER_NAMES[team] : BOT_NAMES[botSeq++ % BOT_NAMES.length];
    const p = sim.addPlayer({ id: `s${idx}`, team, role, name: botName, bot: !ctrl });
    p.ctrl = ctrl || null;
    p.botName = botName;
    p.skill = 0.84 + Math.random() * 0.1;
    p.view = createPlayerView(scene, {
      name: botName, team, teamCss: TEAMS[team].css,
      jersey: keeper ? KEEPER_KIT[team] : TEAMS[team].hex,
      shorts: keeper ? 0x1c1f2b : TEAMS[team].shorts,
      ringColor: null, bot: true, keeper,
      modelIdx: (idx * 5 + team * 3) % ROSTER.length,
    });
    p.pose = makePose();
    p.pose.visible = true;
    slots.push(p);
    slotLabel(p);
    return p;
  }

  function claimSlot(h, p) {
    p.ctrl = h.id;
    p.bot = false;
    h.slot = p;
    h.prevSlot = p;
    p.input.a = false; p.input.b = false; p.aHeld = false;
    slotLabel(p);
  }
  function releaseSlot(h) {
    const p = h.slot;
    if (!p) return;
    p.ctrl = null;
    p.bot = true;
    h.slot = null;
    slotLabel(p);
  }

  // ------------------------------------------------------------ match setup
  function setupMatch() {
    matchId++;
    // tear down
    for (const p of slots) p.view.dispose();
    slots.length = 0;
    botSeq = 0;
    for (const h of [...humans.values()]) if (!connected(h.id)) humans.delete(h.id);
    const list = ctx.players().filter((p) => p.connected);
    // auto-balance: alternate by join order
    list.forEach((pl, i) => {
      const prev = humans.get(pl.id);
      humans.set(pl.id, { id: pl.id, team: i % 2, slot: null, prevSlot: null, fieldTime: 0, goals: 0, assists: 0, tackles: 0, shots: 0, saves: 0, away: false, joinIdx: prev?.joinIdx ?? i });
    });
    const per = [0, 0];
    for (const h of humans.values()) per[h.team]++;
    const F = clamp(Math.max(per[0], per[1], 2), 2, MAX_FIELD);
    const pitch = pitchFor(F);
    const key = JSON.stringify(pitch);
    if (key !== pitchKey) {
      stadium?.dispose();
      stadium = buildStadium(scene, pitch);
      pitchKey = key;
    }
    sim = createSim({ pitch, onEvent });
    for (const team of [0, 1]) {
      addSlot(team, 'keeper', null);
      const hs = [...humans.values()].filter((h) => h.team === team);
      for (let i = 0; i < F; i++) {
        const h = hs[i];
        const p = addSlot(team, 'field', null);
        if (h) claimSlot(h, p);
      }
    }
    score[0] = 0; score[1] = 0;
    clock = matchLen;
    golden = false;
    goldenT = 0;
    pendingGoal = null;
    replay = null;
    celebFocus = null;
    recTime.fill(-1);
    counters.passes = counters.shots = counters.tackles = counters.goals = counters.saves = 0;
    hud.setScore(0, 0);
    hud.setClock(clock);
    const s = Math.max(pitch.HL, pitch.HW) * 0.75 + 6;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, far: 160 });
    sun.shadow.camera.updateProjectionMatrix();
    placeKickoff(0);
  }

  function rotateBench() {
    for (const team of [0, 1]) {
      const bench = [...humans.values()].filter((h) => h.team === team && !h.slot && !h.away && connected(h.id)).sort((a, b) => a.fieldTime - b.fieldTime);
      // fill any CPU slots first
      for (const p of slots) {
        if (!bench.length) break;
        if (p.team === team && p.role !== 'keeper' && !p.ctrl) claimSlot(bench.shift(), p);
      }
      if (!bench.length) continue;
      // then swap the longest-serving player off for the most-rested sub
      const field = [...humans.values()].filter((h) => h.team === team && h.slot).sort((a, b) => b.fieldTime - a.fieldTime);
      const swaps = Math.min(bench.length, Math.max(1, Math.floor(field.length / 3)));
      for (let i = 0; i < swaps && i < field.length; i++) {
        const off = field[i];
        const on = bench[i];
        const p = off.slot;
        releaseSlot(off);
        claimSlot(on, p);
        hud.feed(`${whoHtml(on.id)} on for ${whoHtml(off.id)}`);
        sendState(off.id);
        sendState(on.id);
      }
    }
  }

  function placeKickoff(team) {
    const { HL } = sim.pitch;
    sim.resetBall(0, 0);
    sim.goalCooldown = false;
    for (const t of [0, 1]) {
      const side = t === 0 ? 1 : -1; // attacking direction
      const field = slots.filter((p) => p.team === t && p.role !== 'keeper');
      const kp = slots.find((p) => p.team === t && p.role === 'keeper');
      if (kp) { kp.x = -side * (HL - 1.3); kp.z = 0; kp.face = side > 0 ? 0 : Math.PI; }
      // humans take the forward slots (closest to the ball) so they're in the action
      field.sort((a, b) => (b.ctrl ? 1 : 0) - (a.ctrl ? 1 : 0));
      const form = formation(field.length);
      const cr = 4.2;
      field.forEach((p, i) => {
        const f = form[i];
        let x = f.u * HL * side;
        let z = f.v * sim.pitch.HW * 0.8;
        if (t !== team) {
          // defenders stay outside the centre circle
          const d = Math.hypot(x, z);
          if (d < cr + 0.6) { const k = (cr + 0.6) / Math.max(0.01, d); x *= k; z *= k; if (Math.abs(x) < 0.5) x = -side * (cr + 0.6); }
        }
        if (t === team && i === 0) { x = -side * 0.75; z = 0; }
        p.x = x; p.z = z;
        p.vx = 0; p.vz = 0;
        p.face = side > 0 ? 0 : Math.PI;
        p.stun = 0; p.slide = 0; p.charging = false; p.charge = 0; p.aHeld = false;
        p.brain = p.brain || { next: 0, hold: 0, charge: 0, aimZ: 0, ownedFor: 0, home: { u: -0.4, v: 0 } };
        p.brain.home = form[i];
        p.brain.hold = 0;
      });
    }
    for (const p of slots) p.view.setCelebrate(null);
  }

  // ------------------------------------------------------------ phone state
  function stateFor(id) {
    const h = humans.get(id);
    const pl = ctx.player(id);
    const team = h ? h.team : -1;
    return {
      type: 'st', phase, team, score, golden, n: kickoffN,
      bench: !!h && !h.slot,
      teamName: team >= 0 ? TEAMS[team].name : '', teamCss: team >= 0 ? TEAMS[team].css : '#888',
      lastGoalTeam: lastGoal ? lastGoal.team : -1, scored: !!(lastGoal && lastGoal.scorer === id),
      winner: phase === 'fulltime' || phase === 'results' ? (score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1) : null,
      name: pl?.name || '',
    };
  }
  function sendState(id) { if (humans.has(id) && connected(id)) ctx.send(id, stateFor(id)); }
  function sendAll() { for (const id of humans.keys()) sendState(id); }

  // ------------------------------------------------------------ sim events
  function onEvent(e) {
    if (destroyed) return;
    switch (e.type) {
      case 'kick': {
        counters.shots++;
        const hard = e.power > 0.45;
        sounds.kick(hard);
        fx.turf(e.x, e.z, hard ? 8 : 4, hard ? 1.2 : 0.7);
        if (hard) shake = Math.max(shake, 0.12 + e.power * 0.2);
        const h = e.p.ctrl && humans.get(e.p.ctrl);
        if (h) { h.shots++; buzz(h.id, hard ? 'heavy' : 'bump'); }
        break;
      }
      case 'pass': {
        counters.passes++;
        sounds.kick(false);
        fx.turf(e.p.x + Math.cos(e.p.face) * 0.5, e.p.z + Math.sin(e.p.face) * 0.5, 3, 0.5);
        if (e.p.ctrl) buzz(e.p.ctrl, 'tap');
        break;
      }
      case 'possess':
        if (e.p.ctrl && e.prev && e.prev.team !== e.p.team) buzz(e.p.ctrl, 'tap');
        break;
      case 'slide':
        fx.turf(e.p.x, e.p.z, 5, 0.8);
        break;
      case 'tackle': {
        counters.tackles++;
        sounds.kick(false);
        fx.turf(e.victim.x, e.victim.z, 8, 1);
        fx.sparks(e.victim.x, 0.8, e.victim.z, 8, 0xffffff, 5);
        e.victim.view.flash();
        shake = Math.max(shake, 0.18);
        const h = e.p.ctrl && humans.get(e.p.ctrl);
        if (h) { h.tackles++; buzz(h.id, 'hit'); }
        if (e.victim.ctrl) buzz(e.victim.ctrl, 'heavy');
        break;
      }
      case 'foul':
        e.victim.view.flash();
        fx.turf(e.victim.x, e.victim.z, 5, 0.8);
        if (e.p.ctrl) buzz(e.p.ctrl, 'error');
        if (e.victim.ctrl) buzz(e.victim.ctrl, 'hit');
        sounds.whistle();
        break;
      case 'steal':
        if (e.p.ctrl) buzz(e.p.ctrl, 'tap');
        if (e.victim.ctrl) buzz(e.victim.ctrl, 'bump');
        break;
      case 'save': {
        counters.saves++;
        sounds.kick(true);
        fx.sparks(sim.ball.x, sim.ball.y, sim.ball.z, 10, 0xffffff, 5);
        stadium.setExcitement(0.7);
        later(() => stadium?.setExcitement(0.15), 1500);
        break;
      }
      case 'post':
        sounds.post();
        sounds.groan();
        shake = Math.max(shake, 0.2);
        fx.sparks(e.x, e.y, e.z, 10, 0xffffff, 5);
        break;
      case 'net':
        stadium.netHit(e.side, e.z, e.y, e.speed);
        break;
      case 'bounce':
        if (e.speed > 6) fx.puff(e.x, 0.1, e.z, 0xe8f2dc, 0.3, 1.0, 0.4, 0.4);
        break;
      case 'wall':
        if (e.speed > 9) sounds.kick(false);
        break;
      case 'goal':
        if (phase === 'play' && !pendingGoal) pendingGoal = e;
        break;
      default:
    }
  }

  // ------------------------------------------------------------ flow
  async function runMatch() {
    const my = matchId + 1;
    hud.clearOverlays();
    setupMatch();
    phase = 'intro';
    hud.showBug(false);
    sendAll();
    sounds.startCrowd();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (destroyed || my !== matchId) return;
    const H = [...humans.values()].length;
    const F = slots.filter((p) => p.team === 0 && p.role !== 'keeper').length;
    const benchN = [...humans.values()].filter((h) => !h.slot).length;
    const introMs = 6500;
    hud.intro({
      ms: introMs,
      modeText: `${F + 1} vs ${F + 1}${H < F * 2 ? ' · CPU players fill the gaps' : ''}${benchN ? ' · subs rotate in after every goal' : ''} · ${Math.round(matchLen / 60)} minute match · golden goal if it’s a draw`,
    });
    await wait(introMs + 300);
    if (destroyed || my !== matchId) return;
    phase = 'teams';
    sendAll();
    const roster = [0, 1].map((t) => {
      const out = [];
      for (const p of slots) if (p.team === t) out.push({ name: tagName(p), color: p.ctrl ? (ctx.player(p.ctrl)?.color || '#fff') : '#59607a', bot: !p.ctrl, keeper: p.role === 'keeper' });
      for (const h of humans.values()) if (h.team === t && !h.slot) out.push({ name: ctx.player(h.id)?.name || '?', color: ctx.player(h.id)?.color || '#fff', bench: true });
      return out.sort((a, b) => (a.bot ? 1 : 0) - (b.bot ? 1 : 0) || (a.keeper ? 1 : 0) - (b.keeper ? 1 : 0));
    });
    hud.teams(roster, 3800);
    await wait(4100);
    if (destroyed || my !== matchId) return;
    hud.showBug(true);
    kickTeam = Math.random() < 0.5 ? 0 : 1;
    await kickoff(kickTeam, my);
  }

  async function kickoff(team, my) {
    phase = 'kickoff';
    sim.frozen = true;
    replay = null;
    hud.replay(false);
    rotateBench();
    placeKickoff(team);
    celebFocus = null;
    stadium.setExcitement(0.2);
    for (let n = 3; n >= 1; n--) {
      kickoffN = n;
      sendAll();
      hud.callout(`${n}`, 700, 'num');
      sounds.kick(false);
      await wait(800);
      if (destroyed || my !== matchId) return;
    }
    kickoffN = 0;
    for (const v of inputs.values()) { v.aE = false; v.bE = false; }
    phase = 'play';
    sim.frozen = false;
    sounds.whistle();
    hud.callout(golden ? 'Golden goal<small>Next goal wins</small>' : 'Kick off', 900);
    for (const h of humans.values()) if (h.slot) buzz(h.id, 'select');
    sendAll();
  }

  async function onGoal(e) {
    const my = matchId;
    phase = 'goal';
    lastGoal = { team: e.team, scorer: e.scorer?.ctrl || null };
    score[e.team]++;
    counters.goals++;
    goalSide = e.side;
    hud.setScore(score[0], score[1], e.team);
    const sH = e.scorer?.ctrl ? humans.get(e.scorer.ctrl) : null;
    const aH = e.assist?.ctrl ? humans.get(e.assist.ctrl) : null;
    if (sH) sH.goals++;
    if (aH) aH.assists++;
    const scorerName = e.own ? (e.ownBy ? tagName(e.ownBy) : '') : e.scorer ? tagName(e.scorer) : '';
    const wasGolden = golden;
    hud.goal({ teamCss: TEAMS[e.team].css, scorer: scorerName, assist: e.assist ? tagName(e.assist) : '', own: e.own, golden: wasGolden }, 2900);
    stadium.cheer(e.team, 6);
    stadium.setExcitement(1);
    sounds.roar();
    shake = 0.55;
    slowT = 0;
    // confetti cannons at both posts of the goal that was scored in
    const { HL, GW, GH } = sim.pitch;
    const colors = [TEAMS[e.team].hex, 0xffffff, 0xffd23a];
    for (const z of [-GW, GW]) fx.confetti(e.side * HL, GH, z, 90, colors, -e.side * 0.6, -Math.sign(z) * 0.2, 1);
    celebFocus = e.scorer && !e.own ? e.scorer : null;
    buzzTeam(e.team, 'success');
    buzzTeam(1 - e.team, 'lose');
    if (sH) buzz(sH.id, 'win');
    sendAll();
    await wait(1300);
    if (destroyed || my !== matchId) return;
    sim.frozen = true;
    for (const p of slots) p.view.setCelebrate(p.team === e.team ? 'cheer' : 'sad');
    await wait(1700);
    if (destroyed || my !== matchId) return;
    // replay of the last few seconds from behind the goal
    const tGoal = sim.time - 3.0 * 1; // sim time keeps running while frozen: find the goal moment
    replay = { t0: e.simTime - 2.6, t1: e.simTime + 0.45, t: e.simTime - 2.6, side: e.side };
    void tGoal;
    for (const p of slots) p.view.setCelebrate(null);
    hud.replay(true);
    stadium.setExcitement(0.5);
    await new Promise((r) => { replay.done = r; later(r, 7000); });
    if (destroyed || my !== matchId) return;
    replay = null;
    hud.replay(false);
    stadium.setExcitement(0.2);
    if (wasGolden || (clock <= 0 && score[0] !== score[1])) { await fullTime(my); return; }
    await kickoff(1 - e.team, my);
  }

  async function fullTime(my) {
    phase = 'fulltime';
    sim.frozen = true;
    replay = null;
    hud.replay(false);
    sounds.fullTime();
    const winner = score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1;
    for (const p of slots) p.view.setCelebrate(winner == null ? null : p.team === winner ? 'cheer' : 'sad');
    if (winner != null) { stadium.cheer(winner, 8); stadium.setExcitement(1); sounds.roar(); }
    const ranked = rankHumans(winner);
    const mvp = ranked[0];
    const mvpLine = mvp && (mvp.goals || mvp.assists || mvp.tackles) ? `Player of the match: <b style="color:${TEAMS[mvp.team].css}">${escapeHtml(ctx.player(mvp.id)?.name || '')}</b> · ${statLine(mvp)}` : '';
    hud.final({ score, winner, mvp: mvpLine }, 4600);
    if (winner != null) {
      const { HL, HW } = sim.pitch;
      fx.rain(0, 0, HL * 1.4, HW * 1.4, 260, [TEAMS[winner].hex, 0xffffff, 0xffd23a]);
    }
    for (const h of humans.values()) buzz(h.id, winner == null ? 'success' : h.team === winner ? 'win' : 'lose');
    sendAll();
    await wait(4900);
    if (destroyed || my !== matchId) return;
    phase = 'results';
    sendAll();
    const rows = ranked.map((h) => ({ player: ctx.player(h.id) || { name: '?', color: '#999' }, score: points(h, winner), label: 'pts' }));
    const title = winner == null ? `Draw ${score[0]}–${score[1]}` : `${TEAMS[winner].name} win ${Math.max(...score)}–${Math.min(...score)}`;
    const subtitle = mvp ? `Player of the match: ${ctx.player(mvp.id)?.name || ''} · ${statLine(mvp)}` : '';
    const choice = await ctx.showResults(rows, { title, subtitle });
    if (destroyed || choice !== 'again') return;
    runMatch();
  }

  const points = (h, winner) => h.goals * 3 + h.assists * 2 + h.tackles + (winner != null && h.team === winner ? 2 : 0);
  function statLine(h) {
    const parts = [];
    if (h.goals) parts.push(`${h.goals} goal${h.goals > 1 ? 's' : ''}`);
    if (h.assists) parts.push(`${h.assists} assist${h.assists > 1 ? 's' : ''}`);
    if (h.tackles) parts.push(`${h.tackles} tackle${h.tackles > 1 ? 's' : ''}`);
    return parts.join(' · ') || 'played their heart out';
  }
  function rankHumans(winner) {
    return [...humans.values()]
      .filter((h) => connected(h.id) || h.goals || h.assists || h.tackles)
      .sort((a, b) => points(b, winner) - points(a, winner) || b.goals - a.goals || b.shots - a.shots || a.joinIdx - b.joinIdx);
  }

  // ------------------------------------------------------------ platform events
  ctx.onMessage((pid, msg) => {
    if (!msg) return;
    if (msg.type === 'input') {
      let s = inputs.get(pid);
      if (!s) { s = { x: 0, y: 0, a: false, b: false, aE: false, bE: false }; inputs.set(pid, s); }
      const a = !!msg.b?.a;
      const b = !!msg.b?.b;
      if (a && !s.a) s.aE = true;
      if (b && !s.b) s.bE = true;
      s.a = a; s.b = b;
      s.x = clamp(+msg.x || 0, -1, 1);
      s.y = clamp(+msg.y || 0, -1, 1);
    } else if (msg.type === 'hello') {
      if (!humans.has(pid) && sim) lateJoin(pid);
      sendState(pid);
    }
  });

  function lateJoin(id) {
    const pl = ctx.player(id);
    if (!pl || !sim) return;
    let h = humans.get(id);
    if (!h) {
      const per = [0, 0];
      for (const x of humans.values()) if (connected(x.id) || x.slot) per[x.team]++;
      const team = per[0] <= per[1] ? 0 : 1;
      h = { id, team, slot: null, prevSlot: null, fieldTime: 0, goals: 0, assists: 0, tackles: 0, shots: 0, saves: 0, away: false, joinIdx: humans.size };
      humans.set(id, h);
    }
    h.away = false;
    if (h.slot) return;
    // take back the old slot if a CPU is still running it, otherwise any CPU outfield slot on the team
    let p = h.prevSlot && !h.prevSlot.ctrl ? h.prevSlot : slots.find((s) => s.team === h.team && s.role !== 'keeper' && !s.ctrl);
    if (!p) {
      const field = slots.filter((s) => s.team === h.team && s.role !== 'keeper').length;
      if (field < MAX_FIELD && slots.length < MAX_SLOTS - 1) {
        p = addSlot(h.team, 'field', null);
        p.x = (h.team === 0 ? -1 : 1) * sim.pitch.HL * 0.5; p.z = sim.pitch.HW * 0.6;
        // keep the sides even
        const other = slots.filter((s) => s.team !== h.team && s.role !== 'keeper').length;
        if (other < field + 1) { const q = addSlot(1 - h.team, 'field', null); q.x = (h.team === 0 ? 1 : -1) * sim.pitch.HL * 0.5; q.z = -sim.pitch.HW * 0.6; }
      }
    }
    if (p) claimSlot(h, p);
    sendState(id);
  }

  ctx.onJoin((pl, { rejoin }) => {
    if (!sim) return;
    lateJoin(pl.id);
    const h = humans.get(pl.id);
    hud.feed(`${whoHtml(pl.id)} ${rejoin ? 'is back' : `joined ${h ? TEAMS[h.team].name : ''}`}${h && !h.slot ? ' · on the bench' : ''}`);
    sendState(pl.id);
  });
  ctx.onLeave((pl) => {
    const h = humans.get(pl.id);
    inputs.delete(pl.id);
    if (!h) return;
    h.away = true;
    if (h.slot) { releaseSlot(h); hud.feed(`${whoHtml(pl.id)} left · CPU takes over`); }
  });

  // ------------------------------------------------------------ input -> sim
  function applyInputs() {
    for (const p of slots) {
      if (!p.ctrl) continue;
      if (autopilot && (autopilot === true || autopilot.has(p.ctrl))) { p.bot = true; continue; }
      p.bot = false;
      const s = inputs.get(p.ctrl);
      const inp = p.input;
      if (!s) { inp.x = 0; inp.z = 0; inp.a = false; inp.b = false; continue; }
      inp.x = s.x; inp.z = s.y;
      inp.a = s.a; inp.b = s.b;
      if (s.aE) { inp.aDown = true; s.aE = false; }
      if (s.bE) { inp.bDown = true; s.bE = false; }
    }
  }

  // ------------------------------------------------------------ camera
  const camPos = new THREE.Vector3(0, 30, 40);
  const camLook = new THREE.Vector3();
  const want = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  const PITCH_ANG = 0.68; // radians above horizontal
  let camLead = 0;

  function updateCamera(dt, t) {
    if (!sim) return;
    const { HL, HW } = sim.pitch;
    const b = sim.ball;
    const aspect = camera.aspect;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let k = 1 - Math.exp(-dt * 2.2);
    if (replay) {
      // behind-the-goal angle, low, tracking the ball
      const s = replay.side;
      want.set(s * (HL + 9), 4.2, ballPose.z * 0.35 + s * 3.5);
      wantLook.set(ballPose.x, Math.max(0.6, ballPose.y * 0.6), ballPose.z);
      k = 1 - Math.exp(-dt * 6);
      if (replay.t === replay.t0) { camPos.copy(want); camLook.copy(wantLook); }
    } else if (phase === 'intro' || phase === 'teams' || phase === 'fulltime' || phase === 'results') {
      // slow orbit over the pitch
      const a = t * 0.08;
      const r = HL * 1.25 + 8;
      want.set(Math.sin(a) * r * 0.6, HL * 0.55 + 8, Math.cos(a) * r * 0.7 + HW * 0.4);
      wantLook.set(0, 0, 0);
      k = 1 - Math.exp(-dt * 1.2);
    } else {
      let fx0 = b.x;
      let fz0 = b.z;
      let viewHalf = Math.min(17 + HL * 0.12, HL + 4); // half width of the view on the ground, metres
      if (phase === 'kickoff') { fx0 = 0; fz0 = 0; viewHalf += 4; }
      if (phase === 'goal') {
        const f = celebFocus && celebFocus.onPitch ? celebFocus : null;
        fx0 = f ? f.x * 0.6 + goalSide * HL * 0.4 : goalSide * (HL - 5);
        fz0 = f ? f.z * 0.6 : 0;
        viewHalf = 11;
        k = 1 - Math.exp(-dt * 1.6);
      } else {
        // lead the play a little in the direction the ball is travelling
        const lv = clamp(b.vx * 0.35, -6, 6);
        camLead += (lv - camLead) * Math.min(1, dt * 1.5);
        fx0 += camLead;
      }
      const lim = Math.max(0, HL - viewHalf * 0.7);
      fx0 = clamp(fx0, -lim, lim);
      fz0 = clamp(fz0 * 0.45, -HW * 0.35, HW * 0.35);
      const dist = viewHalf / (tanH * aspect);
      want.set(fx0, Math.sin(PITCH_ANG) * dist, fz0 + Math.cos(PITCH_ANG) * dist);
      wantLook.set(fx0, 0, fz0 - 1.0);
    }
    camPos.lerp(want, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    if (shake > 0) {
      const s = shake * shake * 0.6;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      shake = Math.max(0, shake - dt * 1.6);
    }
    camera.lookAt(camLook);
    sun.target.position.set(camLook.x, 0, camLook.z);
    sun.position.set(camLook.x + 18, 40, camLook.z + 22);
  }

  // ------------------------------------------------------------ frame loop
  let stateT = 0;
  stage.onFrame((dt, t) => {
    if (destroyed || !sim) return;
    let simDt = dt;
    if (slowT < 1.6) {
      slowT += dt;
      simDt *= slowT < 1.0 ? 0.25 : 0.25 + (slowT - 1.0) * 1.25;
    }
    if (replay) {
      replay.t += dt * 0.6;
      if (replay.t >= replay.t1) { replay.t = replay.t1; replay.done?.(); }
      findFrames(replay.t);
      applyReplayFrame();
    } else {
      if (phase === 'play' || phase === 'goal' || phase === 'kickoff') {
        applyInputs();
        updateBots(sim, simDt);
        sim.update(simDt);
        if (pendingGoal) { const g = pendingGoal; pendingGoal = null; g.simTime = sim.time; onGoal(g); }
        recAcc += simDt;
        if ((phase === 'play' || phase === 'goal') && recAcc >= 1 / REC_HZ) { recAcc = 0; record(sim.time); }
      }
      if (phase === 'play') {
        for (const h of humans.values()) if (h.slot) h.fieldTime += dt;
        if (!golden) {
          clock -= dt;
          if (clock <= 0) {
            clock = 0;
            if (score[0] === score[1]) {
              golden = true;
              goldenT = 0;
              hud.callout('Golden goal<small>Next goal wins</small>', 1800);
              sounds.longWhistle();
              stadium.setExcitement(0.6);
              sendAll();
            } else fullTime(matchId);
          }
        } else {
          goldenT += dt;
          if (goldenT > GOLDEN_MAX) fullTime(matchId);
        }
        hud.setClock(clock, golden);
      }
      ballPose.x = sim.ball.x; ballPose.y = sim.ball.y; ballPose.z = sim.ball.z;
      for (const p of slots) livePose(p);
      // shot trail
      const b = sim.ball;
      if (b.power > 0.3 && !b.owner && simDt > 0) {
        const lt = b.lastTouch;
        fx.puff(b.x, b.y, b.z, lt ? TEAMS[lt.team].hex : 0xffffff, 0.55 * b.power + 0.2, 0.05, 0.35, 0.7);
      }
      // sprint dust
      for (const p of slots) if (p.sprinting && Math.random() < 0.12) fx.puff(p.x, 0.1, p.z, 0xdfe8d0, 0.25, 0.7, 0.4, 0.35);
    }
    updateBallView(ballPose.x, ballPose.y, ballPose.z, dt);
    markerMat.color.setHex(sim.ball.lastTouch ? TEAMS[sim.ball.lastTouch.team].hex : 0xffffff);
    const viewDt = replay ? dt * 0.6 : simDt;
    const tagMul = replay ? 0.6 : 1;
    for (const p of slots) {
      p.view.setVisible(!!p.pose.visible);
      p.view.update(p.pose, viewDt, t, camera, tagMul);
    }
    stadium.update(dt, t);
    fx.update(slowT < 1.6 ? Math.max(simDt, dt * 0.3) : dt);
    updateCamera(dt, t);
    // countdown status is pushed on change; refresh the bench/score on phones occasionally
    stateT -= dt;
    if (stateT <= 0) { stateT = 5; }
  });

  // initial scene before resolving start()
  setupMatch();
  updateCamera(1, 0);
  renderer.compile(scene, camera);

  // test hook (scripts/soccer-test.mjs)
  window.__soccerDebug = {
    get phase() { return phase; },
    get score() { return [...score]; },
    get clock() { return clock; },
    get golden() { return golden; },
    get counters() { return { ...counters }; },
    get replaying() { return !!replay; },
    get pitch() { return sim?.pitch; },
    setMatchLength(s) { matchLen = s; if (phase !== 'play') clock = s; },
    setClock(s) { clock = s; },
    ball: () => ({ x: sim.ball.x, y: sim.ball.y, z: sim.ball.z, owner: sim.ball.owner ? tagName(sim.ball.owner) : null }),
    slots: () => slots.map((p) => ({ id: p.id, name: tagName(p), team: p.team, role: p.role, human: !!p.ctrl, bot: p.bot, x: p.x, z: p.z, face: p.face, hasBall: sim.ball.owner === p })),
    humans: () => [...humans.values()].map((h) => ({ id: h.id, name: ctx.player(h.id)?.name, team: h.team, onPitch: !!h.slot, away: h.away, goals: h.goals, assists: h.assists, tackles: h.tackles, shots: h.shots })),
    /** true = all humans bot-driven; [names] = just those; false = off */
    autopilot(v) {
      if (Array.isArray(v)) autopilot = new Set([...humans.values()].filter((h) => v.includes(ctx.player(h.id)?.name)).map((h) => h.id));
      else autopilot = v;
    },
    /** Put the ball at a player's feet near the opponent goal, facing it (deterministic goal setup for tests). */
    setupChance(name, clearKeeper = true) {
      const h = [...humans.values()].find((x) => ctx.player(x.id)?.name === name);
      const p = h?.slot;
      if (!p) return false;
      const side = p.team === 0 ? 1 : -1;
      const { HL } = sim.pitch;
      p.x = side * (HL - 7); p.z = 0.3; p.vx = 0; p.vz = 0; p.face = side > 0 ? 0 : Math.PI; p.stun = 0; p.slide = 0;
      for (const q of slots) {
        if (q === p) continue;
        if (Math.abs(q.x - p.x) < 6) { q.x = -side * HL * 0.3; q.stun = 1.5; }
        if (clearKeeper && q.role === 'keeper' && q.team !== p.team) { q.x = side * (HL - 1); q.z = sim.pitch.GW + 1.5; q.stun = 2; }
      }
      sim.resetBall(p.x + side * 0.7, p.z);
      sim.ball.owner = p;
      return true;
    },
  };

  runMatch();

  return {
    destroy() {
      destroyed = true;
      delete window.__soccerDebug;
      replay?.done?.();
      timeouts.forEach(clearTimeout);
      timeouts.clear();
      for (const p of slots) p.view.dispose();
      slots.length = 0;
      disposeKits();
      stadium?.dispose();
      ballGeo.dispose(); ballMat.dispose(); blobGeo.dispose(); blobMat.dispose(); blobTex.dispose(); markerGeo.dispose(); markerMat.dispose();
      fx.dispose();
      hud.destroy();
      sounds.dispose();
      stage.dispose();
    },
  };
}
