// Tower Topple — screen side. Players take turns dropping toy blocks onto one shared tower
// (Rapier physics). Knock anything off the island and you lose a heart; last builder standing wins.
import RAPIER from '@dimforge/rapier3d-compat';
import { createStage, THREE, makeLabel, loadModel } from '../../sdk/three-kit.js';
import { countdown, banner } from '../../sdk/screen-kit.js';
import { sfx } from '../../sdk/audio.js';
import { buildWorld, decorate, PLATFORM_R } from './world.js';
import { getPiece, pieceShapes, colliderDescs, createBag, pieceMaterial, SPECIALS, disposePieceCaches } from './pieces.js';
import { createParticles, createLeaves, knock, windWhoosh, closeAudio } from './fx.js';
import { createHud } from './hud.js';

const STEP = 1 / 120;
const GRAVITY = -18;
const FALL_Y = -0.9; // a piece whose centre drops below this has left the deck
const KILL_Y = -4.5;
const HOLD_GAP = 1.5; // clearance between the tower top and the bottom of the held piece
const INTRO_SEC = 6;
const SETTLE_MIN = 0.9;
const SETTLE_MAX = 5;
const DISCONNECT_GRACE = 25;
const TIPS = [
  new THREE.Quaternion(),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
];
const UP = new THREE.Vector3(0, 1, 0);

let rapierInit = null;

export default async function start(ctx) {
  rapierInit ??= RAPIER.init();
  await rapierInit;

  const stage = createStage(ctx.container, {
    background: 0xbfe0ff, fog: { near: 40, far: 130 }, shadowArea: 9, sunIntensity: 2.5, envIntensity: 0.55, fov: 45,
  });
  const { scene, camera, renderer, sun } = stage;
  sun.shadow.camera.far = 80;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  stage.hemi.intensity = 0.9;
  stage.hemi.color.set(0xdfefff);
  stage.hemi.groundColor.set(0x6a5a48);

  const env = buildWorld(scene);
  try {
    await Promise.race([decorate(env, ctx, loadModel), new Promise((r) => setTimeout(r, 8000))]);
  } catch (err) { console.warn('tower: decoration failed', err); }

  const particles = createParticles(scene);
  const leaves = createLeaves(scene);
  const hud = createHud(ctx.container);

  // ---------------------------------------------------------------- physics
  let world = null;
  function createWorld() {
    world?.free();
    world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    world.timestep = STEP;
    world.numSolverIterations = 8;
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.5, PLATFORM_R).setFriction(0.9).setRestitution(0.05), ground);
  }
  createWorld();

  // ---------------------------------------------------------------- state
  let dead = false;
  let gt = 0; // game time (s)
  let phase = 'loading'; // intro | countdown | hover | settle | between | over
  let order = []; // player ids in turn order
  const info = new Map(); // id -> { hearts, alive, drops, outOrder, leftAt }
  let startHearts = 3;
  let turnTime = 12;
  let turnPtr = -1;
  let turnCount = 0;
  let round = 1;
  let outCounter = 0;
  let activeId = null;
  let held = null;
  let turnStart = 0;
  let turnFalls = 0;
  let leaveDropAt = 0;
  let skipIntro = false;
  let bodies = [];
  let towerTop = 0;
  let shownTop = 0;
  let record = 0;
  let recordLabel = null;
  let calm = 0;
  let lastDropped = null;
  let windLevel = 0;
  const windDir = new THREE.Vector3(1, 0, 0);
  let gustWas = false;
  let shake = 0;
  let camAngle = 0.6;
  let multi = false;
  let retracting = [];
  const blowAt = new Map();
  let lastTick = 0;
  let blowRate = 0;
  const waiters = [];
  const bag = createBag();
  let special = null;

  const players = () => ctx.players();
  const pl = (id) => ctx.player(id);
  const isConnected = (id) => !!pl(id)?.connected;

  function wait(sec) { return new Promise((resolve) => waiters.push({ fn: () => false, until: gt + sec, resolve })); }
  function waitUntil(fn, maxSec) { return new Promise((resolve) => waiters.push({ fn, until: gt + maxSec, resolve })); }
  function pumpWaiters() {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      let done = gt >= w.until;
      if (!done) { try { done = !!w.fn(); } catch { done = true; } }
      if (done) { waiters.splice(i, 1); w.resolve(); }
    }
  }

  // ---------------------------------------------------------------- players / turns
  function addPlayer(p, hearts) {
    if (info.has(p.id)) return;
    info.set(p.id, { hearts, alive: true, drops: 0, outOrder: 0, leftAt: 0 });
    order.push(p.id);
    if (order.length >= 2) multi = true;
  }

  function aliveIds() { return order.filter((id) => info.get(id)?.alive); }
  function eligible(id) {
    const i = info.get(id);
    return i?.alive && isConnected(id);
  }

  /** Alive, connected players in upcoming turn order, starting with the active player. */
  function upcoming() {
    const n = order.length;
    const list = [];
    const startIdx = activeId && (phase === 'hover' || phase === 'settle') ? turnPtr : turnPtr + 1;
    for (let k = 0; k < n; k++) {
      const id = order[(((startIdx + k) % n) + n) % n];
      if (eligible(id) || id === activeId) list.push(id);
    }
    return [...new Set(list)];
  }
  function turnsUntil(id) {
    const list = upcoming();
    const idx = list.indexOf(id);
    const offset = activeId && (phase === 'hover' || phase === 'settle') ? 0 : 1;
    return idx < 0 ? -1 : idx + offset;
  }

  function nextTurnPlayer() {
    const n = order.length;
    for (let k = 1; k <= n; k++) {
      const idx = (turnPtr + k) % n;
      if (eligible(order[idx])) { turnPtr = idx; return order[idx]; }
    }
    return null;
  }

  function refreshHud(popId) {
    const rows = order.map((id) => {
      const p = pl(id);
      const i = info.get(id);
      return p && i ? { id, name: p.name, color: p.color, avatar: p.avatar, hearts: i.hearts, alive: i.alive, connected: p.connected } : null;
    }).filter(Boolean);
    hud.renderPlayers(rows, activeId, startHearts, popId);
    const up = upcoming().filter((id) => info.get(id)?.alive);
    const q = up.slice(0, 8).map((id) => ({ ...pl(id), hearts: info.get(id).hearts }));
    hud.renderQueue(phase === 'over' || phase === 'intro' ? [] : q, Math.max(0, up.length - 8), startHearts);
  }

  function phoneState(id) {
    const i = info.get(id);
    const a = activeId ? pl(activeId) : null;
    let ph;
    if (phase === 'intro' || phase === 'countdown' || phase === 'loading') ph = 'intro';
    else if (phase === 'over') ph = 'over';
    else if (!i) ph = 'watch';
    else if (!i.alive) ph = 'out';
    else if (id === activeId && phase === 'hover') ph = 'turn';
    else if (id === activeId) ph = 'dropped';
    else ph = 'watch';
    return {
      type: 'state',
      phase: ph,
      hearts: i?.hearts ?? 0,
      maxHearts: startHearts,
      alive: !!i?.alive,
      active: a ? { name: a.name, color: a.color, avatar: a.avatar } : null,
      turnsUntil: i?.alive ? turnsUntil(id) : -1,
      piece: held ? held.piece.name : null,
      special: special ? { icon: SPECIALS[special].icon, label: SPECIALS[special].label } : null,
      timeLeft: ph === 'turn' ? Math.max(0, turnTime - (gt - turnStart)) : 0,
      turnTime,
      wind: windLevel,
      canBlow: phase === 'hover' && id !== activeId,
      isAdmin: id === ctx.adminId,
      solo: !multi,
      record: Math.round(record * 10) / 10,
    };
  }
  function sendState(id) { ctx.send(id, phoneState(id)); }
  function broadcastState() { for (const p of players()) sendState(p.id); }

  // ---------------------------------------------------------------- held piece
  const ropeGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6).translate(0, 0.5, 0);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.9 });
  const hookMat = new THREE.MeshStandardMaterial({ color: 0x40464f, metalness: 0.8, roughness: 0.35 });
  const hookGeo = new THREE.TorusGeometry(0.16, 0.045, 8, 16, Math.PI * 1.4);
  const capGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.18, 12);
  const lineGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 6).translate(0, 0.5, 0);

  function makeRig(color) {
    const g = new THREE.Group();
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    rope.castShadow = true;
    const hook = new THREE.Group();
    const h = new THREE.Mesh(hookGeo, hookMat);
    h.rotation.z = Math.PI * 0.8;
    h.position.y = 0.1;
    hook.add(h);
    const capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 0.33;
    hook.add(cap);
    hook.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(rope, hook);
    return { group: g, rope, hook, capMat };
  }

  function spawnHeld(id) {
    const p = pl(id);
    const scale = special === 'giant' ? SPECIALS.giant.scale : 1;
    let pid = bag.next();
    if (special && (pid === 'ball' || pid === 'log')) pid = 'block';
    const piece = getPiece(pid, scale);
    const mat = pieceMaterial(p.colorHex, special);
    const mesh = new THREE.Mesh(piece.geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const ghostMat = new THREE.MeshBasicMaterial({ color: p.colorHex, transparent: true, opacity: 0.28, depthWrite: false });
    const ghost = new THREE.Mesh(piece.geo, ghostMat);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(piece.geo, 30), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    ghost.add(edges);
    ghost.renderOrder = 2;
    const lineMat = new THREE.MeshBasicMaterial({ color: p.colorHex, transparent: true, opacity: 0.55, depthWrite: false });
    const line = new THREE.Mesh(lineGeo, lineMat);
    const rig = makeRig(p.colorHex);
    const label = makeLabel(`${p.avatar} ${p.name}`, { color: '#fff', bg: p.color, size: 44, height: 0.5 });
    scene.add(mesh, ghost, line, rig.group, label);
    const start = new THREE.Vector3(0, 0, 0);
    // Start a little off-centre (rotating around) so auto-drops aren't always perfect.
    held = {
      owner: id, piece, special, mat, mesh, ghost, edges, ghostMat, line, lineMat, rig, label,
      trolley: start.clone(), pos: start.clone(), vel: new THREE.Vector3(), yaw: 0, tip: 0,
      q: new THREE.Quaternion(), qT: new THREE.Quaternion(), inX: 0, inY: 0, holdY: towerTop + 3, landing: null, bottom: 0, top: 0,
    };
    held.pos.y = held.holdY + 2;
    updateHoldHeight(true);
  }

  function disposeHeld(keepMesh) {
    if (!held) return;
    const h = held;
    held = null;
    if (!keepMesh) scene.remove(h.mesh);
    scene.remove(h.ghost, h.line, h.label);
    h.edges.geometry.dispose();
    h.edges.material.dispose();
    h.ghostMat.dispose();
    h.lineMat.dispose();
    h.label.material.map.dispose();
    h.label.material.dispose();
    retracting.push({ rig: h.rig, t: 0 });
  }

  const tmpBox = new THREE.Box3();
  const tmpM = new THREE.Matrix4();
  function updateHoldHeight(snap) {
    tmpM.makeRotationFromQuaternion(held.qT);
    tmpBox.copy(held.piece.box).applyMatrix4(tmpM);
    held.bottom = tmpBox.min.y;
    held.top = tmpBox.max.y;
    const target = Math.max(towerTop, 0) + HOLD_GAP - tmpBox.min.y;
    held.holdY = snap ? target : held.holdY;
    held.targetY = target;
  }

  function rotateHeld(kind) {
    if (!held || phase !== 'hover') return;
    if (kind === 'spin') held.yaw = (held.yaw + 1) % 8;
    else held.tip = (held.tip + 1) % TIPS.length;
    held.qT.setFromAxisAngle(UP, (held.yaw * Math.PI) / 4).multiply(TIPS[held.tip]);
    updateHoldHeight(false);
    sfx.play('click');
  }

  const castPos = new THREE.Vector3();
  const castRot = new THREE.Quaternion();
  function computeLanding() {
    const shapes = pieceShapes(RAPIER, held.piece);
    let best = Infinity;
    for (const s of shapes) {
      castPos.copy(s.pos).applyQuaternion(held.qT).add(held.pos);
      castRot.copy(held.qT).multiply(s.rot);
      const hit = world.castShape(castPos, castRot, { x: 0, y: -1, z: 0 }, s.shape, 0, held.pos.y + 20, false);
      if (hit && hit.time_of_impact < best) best = hit.time_of_impact;
    }
    return best === Infinity ? null : best;
  }

  const camRight = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  const tiltQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpR = new THREE.Vector3();
  const tmpD = new THREE.Vector3();
  function updateHeld(dt) {
    const h = held;
    // Camera-relative steering of the crane trolley.
    camera.getWorldDirection(camFwd);
    camFwd.y = 0;
    camFwd.normalize();
    camRight.set(-camFwd.z, 0, camFwd.x);
    const speed = 3.4;
    h.trolley.addScaledVector(camRight, h.inX * speed * dt).addScaledVector(camFwd, -h.inY * speed * dt);
    const lim = PLATFORM_R + 0.6;
    const d = Math.hypot(h.trolley.x, h.trolley.z);
    if (d > lim) { h.trolley.x *= lim / d; h.trolley.z *= lim / d; }
    // Pendulum-ish spring in xz; wind + audience push it around.
    const k = 30;
    const c = 4.6;
    h.vel.x += ((h.trolley.x - h.pos.x) * k - h.vel.x * c) * dt;
    h.vel.z += ((h.trolley.z - h.pos.z) * k - h.vel.z * c) * dt;
    if (windLevel > 0) {
      const g = gust();
      h.vel.x += windDir.x * windLevel * g * 2.2 * dt;
      h.vel.z += windDir.z * windLevel * g * 2.2 * dt;
    }
    const vm = Math.hypot(h.vel.x, h.vel.z);
    if (vm > 4) { h.vel.x *= 4 / vm; h.vel.z *= 4 / vm; }
    h.pos.x += h.vel.x * dt;
    h.pos.z += h.vel.z * dt;
    h.holdY += (h.targetY - h.holdY) * Math.min(1, dt * 4);
    h.pos.y += (h.holdY - h.pos.y) * Math.min(1, dt * 6);
    h.q.slerp(h.qT, Math.min(1, dt * 14));

    // Visual tilt from the swing.
    tmpV.set(h.pos.x - h.trolley.x, 0, h.pos.z - h.trolley.z);
    const off = tmpV.length();
    if (off > 1e-4) tiltQ.setFromAxisAngle(tmpV.set(tmpV.z, 0, -tmpV.x).normalize(), -Math.min(0.25, off * 0.35));
    else tiltQ.identity();
    h.mesh.position.copy(h.pos);
    h.mesh.quaternion.copy(tiltQ).multiply(h.q);

    // Rope & hook
    const hookPos = tmpV.set(0, h.top + 0.02, 0).applyQuaternion(tiltQ).add(h.pos);
    h.rig.hook.position.copy(hookPos);
    h.rig.hook.quaternion.copy(tiltQ);
    const ropeStart = tmpR.copy(hookPos);
    ropeStart.y += 0.42;
    const dir = tmpD.set(h.trolley.x, h.pos.y + 14, h.trolley.z).sub(ropeStart);
    const len = dir.length();
    h.rig.rope.position.copy(ropeStart);
    h.rig.rope.scale.set(1, len, 1);
    h.rig.rope.quaternion.setFromUnitVectors(UP, dir.normalize());
    h.label.position.set(hookPos.x, hookPos.y + 0.95, hookPos.z);

    // Landing preview
    const toi = computeLanding();
    h.landing = toi;
    if (toi !== null) {
      h.ghost.visible = true;
      h.ghost.position.set(h.pos.x, h.pos.y - toi, h.pos.z);
      h.ghost.quaternion.copy(h.qT);
      h.line.position.set(h.pos.x, h.pos.y - toi + h.bottom, h.pos.z);
      h.line.scale.set(1, Math.max(0.01, toi), 1);
      h.lineMat.color.setHex(pl(h.owner)?.colorHex ?? 0xffffff);
      h.ghostMat.opacity = 0.22 + 0.1 * Math.sin(gt * 6);
    } else {
      h.ghost.visible = false;
      h.line.position.set(h.pos.x, h.pos.y + h.bottom - 12, h.pos.z);
      h.line.scale.set(1, 12, 1);
      h.lineMat.color.setHex(0xff3344);
    }
  }

  function doDrop(auto) {
    if (!held || phase !== 'hover') return;
    const h = held;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(h.pos.x, h.pos.y, h.pos.z)
        .setRotation({ x: h.qT.x, y: h.qT.y, z: h.qT.z, w: h.qT.w })
        .setLinvel(h.vel.x * 0.5, -0.5, h.vel.z * 0.5)
        .setLinearDamping(0.05)
        .setAngularDamping(h.piece.id === 'ball' || h.piece.id === 'log' ? 0.2 : 0.6)
        .setCanSleep(true),
    );
    for (const d of colliderDescs(RAPIER, h.piece, h.special)) world.createCollider(d, body);
    h.mesh.quaternion.copy(h.qT);
    const b = {
      body, mesh: h.mesh, owner: h.owner, special: h.special, piece: h.piece, fallen: false, fallenAt: 0,
      prevV: new THREE.Vector3(0, -0.5, 0), landed: false, squashT: -1, dropTime: gt,
    };
    bodies.push(b);
    lastDropped = b;
    disposeHeld(true);
    phase = 'settle';
    sfx.play('whoosh');
    hud.setActiveStatus(auto ? 'auto-dropped!' : 'dropped!');
    broadcastState();
  }

  // ---------------------------------------------------------------- physics step / fx
  function gust() {
    return 0.55 + 0.45 * Math.sin(gt * 1.7) * Math.sin(gt * 0.63 + 1);
  }

  function applyWind() {
    if (windLevel <= 0) return;
    const g = gust();
    const a = windLevel * g * 0.4;
    for (const b of bodies) {
      if (b.fallen || b.body.isSleeping()) continue;
      const m = b.body.mass() * a * STEP;
      b.body.applyImpulse({ x: windDir.x * m, y: 0, z: windDir.z * m }, false);
    }
  }

  const tmpP = new THREE.Vector3();
  function onImpact(b, dv) {
    const intensity = Math.min(1, dv / 9);
    knock(intensity, b.special || 'wood');
    if (!b.landed) {
      b.landed = true;
      b.squashT = 0;
      b.squashAmp = Math.min(1, dv / 7);
      tmpBox.setFromObject(b.mesh);
      tmpP.set((tmpBox.min.x + tmpBox.max.x) / 2, tmpBox.min.y, (tmpBox.min.z + tmpBox.max.z) / 2);
      particles.dust(tmpP, 10 + Math.round(intensity * 14), 0xf3e6d0, 0.7 + intensity * 0.6);
      if (dv > 7) shake = Math.max(shake, 0.12);
    } else if (dv > 4) {
      tmpP.copy(b.mesh.position);
      particles.dust(tmpP, 5, 0xf3e6d0, 0.5);
    }
  }

  function removeBody(b, poof) {
    if (poof) {
      tmpP.copy(b.mesh.position);
      tmpP.y = Math.max(tmpP.y, -3.5);
      particles.poof(tmpP, pl(b.owner)?.colorHex ?? 0xffffff);
      sfx.play('whoosh');
    }
    world.removeRigidBody(b.body);
    scene.remove(b.mesh);
    b.removed = true;
  }

  function measureTop() {
    let top = 0;
    for (const b of bodies) {
      if (b.fallen || b.removed) continue;
      if (Math.hypot(b.mesh.position.x, b.mesh.position.z) > PLATFORM_R + 1.5) continue;
      tmpBox.setFromObject(b.mesh);
      if (tmpBox.max.y > top) top = tmpBox.max.y;
    }
    return top;
  }

  function physicsFrame(dt) {
    physicsFrame.acc = (physicsFrame.acc || 0) + dt;
    let n = 0;
    while (physicsFrame.acc >= STEP && n < 6) {
      applyWind();
      world.step();
      physicsFrame.acc -= STEP;
      n++;
    }
    if (n >= 6) physicsFrame.acc = 0;
    let moving = false;
    for (const b of bodies) {
      if (b.removed) continue;
      const t = b.body.translation();
      const r = b.body.rotation();
      b.mesh.position.set(t.x, t.y, t.z);
      b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      // squash & stretch on first landing (visual only)
      if (b.squashT >= 0) {
        b.squashT += dt;
        const s = Math.exp(-b.squashT * 9) * Math.cos(b.squashT * 28) * 0.16 * b.squashAmp;
        b.mesh.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
        if (b.squashT > 0.6) { b.squashT = -1; b.mesh.scale.set(1, 1, 1); }
      }
      if (!b.body.isSleeping()) {
        const v = b.body.linvel();
        const dv = Math.hypot(v.x - b.prevV.x, v.y - b.prevV.y, v.z - b.prevV.z);
        const prevSpeed = b.prevV.length();
        if (dv > 1.6 && prevSpeed > 1.2 && !b.fallen) onImpact(b, dv);
        b.prevV.set(v.x, v.y, v.z);
        if (!b.fallen) {
          const w = b.body.angvel();
          if (Math.hypot(v.x, v.y, v.z) > 0.15 || Math.hypot(w.x, w.y, w.z) > 0.4) moving = true;
        }
      } else b.prevV.set(0, 0, 0);
      if (!b.fallen && t.y < FALL_Y) {
        b.fallen = true;
        b.fallenAt = gt;
        if (phase === 'hover' || phase === 'settle') turnFalls++;
        if (turnFalls === 1) sfx.play('wrong');
        if (turnFalls === 4) { hud.toast('🌲 TIMBER! 🌲', 'bad', 1600); shake = Math.max(shake, 0.5); sfx.play('explosion'); }
      }
      if (b.fallen && (t.y < KILL_Y || gt - b.fallenAt > 1.8 || Math.hypot(t.x, t.z) > 30)) removeBody(b, true);
    }
    if (bodies.some((b) => b.removed)) bodies = bodies.filter((b) => !b.removed);
    calm = moving ? 0 : calm + dt;
  }

  // ---------------------------------------------------------------- camera
  const camPos = new THREE.Vector3(0, 8, 14);
  const camLook = new THREE.Vector3(0, 1, 0);
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  function updateCamera(dt) {
    camAngle += dt * (phase === 'hover' ? 0.035 : 0.07);
    shownTop += (towerTop - shownTop) * Math.min(1, dt * 1.5);
    const hold = held ? held.pos.y + held.top : shownTop + 3;
    const span = THREE.MathUtils.clamp(shownTop + 4, 6.5, 13);
    const focusY = Math.max(shownTop * 0.5 + 0.6, hold - span * 0.62);
    const aspect = camera.aspect || 16 / 9;
    const dist = (7.5 + span * 0.95) * Math.max(1, 1.5 / aspect);
    wantLook.set(0, focusY, 0);
    wantPos.set(Math.sin(camAngle) * dist, focusY + dist * 0.36, Math.cos(camAngle) * dist);
    const k = Math.min(1, dt * 2);
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-dt * 6);
    }
    camera.lookAt(camLook);
    // keep the shadow frustum centred on the action
    sun.position.set(camLook.x + 9, camLook.y + 16, camLook.z + 7);
    sun.target.position.copy(camLook);
    particles.setScale(renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    if (recordLabel) recordLabel.position.set(Math.sin(camAngle + 0.9) * 2.7, record + 0.3, Math.cos(camAngle + 0.9) * 2.7);
  }

  function setRecord(v) {
    record = v;
    env.record.visible = v > 0.3;
    env.record.position.y = v;
    if (recordLabel) { scene.remove(recordLabel); recordLabel.material.map.dispose(); recordLabel.material.dispose(); recordLabel = null; }
    if (v > 0.3) {
      recordLabel = makeLabel(`🏆 ${v.toFixed(1)}m`, { color: '#2a1a00', bg: 'rgba(255,210,63,0.92)', size: 40, height: 0.42 });
      scene.add(recordLabel);
    }
  }

  // ---------------------------------------------------------------- frame loop
  let heightTimer = 0;
  stage.onFrame((dt, t) => {
    if (dead) return;
    gt += dt;
    physicsFrame(dt);
    heightTimer -= dt;
    if (heightTimer <= 0 && phase !== 'settle') { heightTimer = 0.25; towerTop = measureTop(); if (held) updateHoldHeight(false); }
    if (held) {
      updateHeld(dt);
      if (phase === 'hover') {
        const left = turnTime - (gt - turnStart);
        hud.setTimer(left, turnTime);
        const s = Math.ceil(left);
        if (s <= 3 && s >= 1 && s !== lastTick) { lastTick = s; sfx.play('tick'); }
        if (left <= 0) doDrop(true);
        else if (leaveDropAt && gt >= leaveDropAt) doDrop(true);
      }
    }
    for (let i = retracting.length - 1; i >= 0; i--) {
      const r = retracting[i];
      r.t += dt;
      r.rig.group.position.y += dt * (4 + r.t * 20);
      if (r.t > 0.8) { scene.remove(r.rig.group); r.rig.capMat.dispose(); retracting.splice(i, 1); }
    }
    // wind fx
    const g = windLevel > 0 ? gust() : 0;
    const wind = tmpV.copy(windDir).multiplyScalar(windLevel * g);
    const blowBoost = blowRate;
    blowRate = Math.max(0, blowRate - dt * 8);
    leaves.update(dt, wind, camLook, blowBoost);
    const gusting = windLevel > 0 && g > 0.85;
    if (gusting && !gustWas) windWhoosh(Math.min(1, windLevel / 4));
    if (gusting !== gustWas) hud.setWind(windLevel, screenWindAngle(), gusting);
    gustWas = gusting;
    particles.update(dt);
    env.update(dt, t);
    updateCamera(dt);
    pumpWaiters();
  });
  // ---------------------------------------------------------------- messages
  ctx.onMessage((id, msg) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'hello': sendState(id); break;
      case 'move':
        if (held && id === activeId && phase === 'hover') {
          held.inX = THREE.MathUtils.clamp(Number(msg.x) || 0, -1, 1);
          held.inY = THREE.MathUtils.clamp(Number(msg.y) || 0, -1, 1);
        }
        break;
      case 'spin': case 'tip':
        if (id === activeId) rotateHeld(msg.type);
        break;
      case 'drop':
        if (id === activeId && phase === 'hover' && gt - turnStart > 0.3) doDrop(false);
        break;
      case 'blow': {
        if (phase !== 'hover' || !held || id === activeId) break;
        const last = blowAt.get(id) || 0;
        if (gt - last < 0.15) break;
        blowAt.set(id, gt);
        const blowers = Math.max(1, [...blowAt.values()].filter((v) => gt - v < 1.5).length);
        const dir = windLevel > 0 ? windDir : tmpP.set(Math.cos(turnCount * 2.4), 0, Math.sin(turnCount * 2.4));
        const imp = 0.32 / Math.sqrt(blowers);
        held.vel.x += dir.x * imp;
        held.vel.z += dir.z * imp;
        blowRate = Math.min(30, blowRate + 3);
        if (Math.random() < 0.15) windWhoosh(0.2);
        break;
      }
      case 'skip':
        if (id === ctx.adminId && phase === 'intro') skipIntro = true;
        break;
      default:
    }
  });

  ctx.onJoin((p, { rejoin }) => {
    if (dead) return;
    const i = info.get(p.id);
    if (i) {
      i.leftAt = 0;
      if (p.id === activeId) leaveDropAt = 0;
    } else if (phase !== 'over') {
      const alive = aliveIds().map((id) => info.get(id).hearts);
      const hearts = alive.length ? Math.max(1, Math.min(startHearts, Math.max(...alive))) : startHearts;
      addPlayer(p, hearts);
      if (phase !== 'intro' && phase !== 'loading') hud.toast(`${p.avatar} ${p.name} joined the queue!`, 'good', 1800);
    }
    if (!rejoin) sfx.play('join');
    refreshHud();
    broadcastState();
  });

  ctx.onLeave((p) => {
    if (dead) return;
    const i = info.get(p.id);
    if (i) i.leftAt = gt;
    if (p.id === activeId && phase === 'hover') leaveDropAt = gt + 1;
    refreshHud();
    broadcastState();
  });

  // ---------------------------------------------------------------- game flow
  function resetGame() {
    for (const b of bodies) if (!b.removed) { world.removeRigidBody(b.body); scene.remove(b.mesh); }
    bodies = [];
    if (held) disposeHeld(false);
    createWorld();
    particles.clear();
    leaves.clear();
    info.clear();
    order = [];
    multi = false;
    const list = players();
    const n = list.length;
    startHearts = n <= 6 ? 3 : n <= 12 ? 2 : 1;
    turnTime = n <= 8 ? 12 : 10;
    list.forEach((p) => addPlayer(p, startHearts));
    turnPtr = -1;
    turnCount = 0;
    round = 1;
    outCounter = 0;
    activeId = null;
    special = null;
    windLevel = 0;
    towerTop = 0;
    shownTop = 0;
    setRecord(0);
    skipIntro = false;
    bag.reset();
    hud.setWind(0, 0, false);
    hud.setRound(1);
    hud.setMode(multi ? '' : 'Solo — build high!');
    hud.setHeight(0, 0);
    hud.hideActive();
  }

  function checkEnd() {
    const alive = aliveIds();
    if (multi) {
      const active = alive.filter((id) => isConnected(id) || (info.get(id).leftAt && gt - info.get(id).leftAt < DISCONNECT_GRACE));
      return active.length <= 1 && (active.length === 1 || alive.length <= 1);
    }
    return alive.length === 0;
  }

  async function playTurn(id) {
    turnCount++;
    const alive = aliveIds().length;
    const per = Math.max(2, Math.min(6, alive));
    round = Math.max(round, 1 + Math.floor((turnCount - 1) / per));
    // Wind from round 3; specials sprinkle in from turn 5.
    windLevel = round >= 3 ? Math.min(5, 1 + Math.floor((round - 3) / 2)) : 0;
    const wa = Math.random() * Math.PI * 2;
    windDir.set(Math.cos(wa), 0, Math.sin(wa));
    const specialChance = turnCount < 5 ? 0 : round >= 8 ? 0.35 : 0.22;
    special = Math.random() < specialChance ? Object.keys(SPECIALS)[Math.floor(Math.random() * 4)] : null;
    turnFalls = 0;
    leaveDropAt = 0;
    lastTick = 0;
    activeId = id;
    towerTop = measureTop();
    spawnHeld(id);
    turnStart = gt;
    phase = 'hover';
    blowAt.clear();
    const p = pl(id);
    hud.setRound(round);
    hud.setWind(windLevel, screenWindAngle(), false);
    hud.showActive(p, held.piece.name, special ? SPECIALS[special] : null, turnTime);
    refreshHud();
    broadcastState();
    ctx.send(id, { type: 'yourTurn' });
    sfx.play('blip');
    if (special) hud.toast(`${SPECIALS[special].icon} ${SPECIALS[special].label} PIECE!`, 'gold', 1800);
    else if (windLevel > 0 && (turnCount % per === 1 || per === 1)) hud.toast(`💨 Wind level ${windLevel}`, '', 1500);

    await waitUntil(() => phase !== 'hover', turnTime + 3);
    if (dead) return;
    if (phase === 'hover') doDrop(true);
    const t0 = gt;
    calm = 0;
    await waitUntil(() => gt - t0 > SETTLE_MIN && calm > 0.5 && (!lastDropped || lastDropped.landed || lastDropped.fallen || gt - t0 > 2.5), SETTLE_MAX);
    if (dead) return;
    phase = 'between';
    towerTop = measureTop();
    const i = info.get(id);
    hud.setHeight(towerTop, Math.max(record, towerTop));
    if (turnFalls > 0 && i) {
      i.hearts = Math.max(0, i.hearts - 1);
      shake = Math.max(shake, 0.25 + Math.min(0.5, turnFalls * 0.08));
      ctx.send(id, { type: 'hurt', hearts: i.hearts });
      hud.setActiveStatus(`toppled ${turnFalls} piece${turnFalls === 1 ? '' : 's'}!`);
      if (i.hearts <= 0) {
        i.alive = false;
        i.outOrder = ++outCounter;
        sfx.play('lose');
        refreshHud(id);
        broadcastState();
        await banner(ctx.container, `${p?.avatar ?? ''} ${escape(p?.name)} is OUT!`, 1600);
      } else {
        hud.toast(`💔 ${escape(p?.name)} −1 heart`, 'bad', 1800);
        refreshHud(id);
        broadcastState();
        await wait(1.6);
      }
    } else {
      if (i) i.drops++;
      if (towerTop > record + 0.05) {
        const first = record < 0.01;
        setRecord(towerTop);
        if (!first && turnCount > 1) {
          hud.toast(`🏆 New record: ${towerTop.toFixed(1)}m!`, 'gold', 1600);
          sfx.play('powerup');
          tmpP.set(0, towerTop + 0.3, 0);
          particles.sparkle(tmpP, 0xffd23f, 18);
        } else sfx.play('correct');
      } else sfx.play('correct');
      hud.setActiveStatus('nailed it!');
      refreshHud();
      await wait(0.9);
    }
    hud.setHeight(towerTop, record);
    lastDropped = null;
  }

  function screenWindAngle() {
    // wind arrow relative to the current camera heading, so "➜" matches what you see.
    camera.getWorldDirection(camFwd);
    camFwd.y = 0;
    camFwd.normalize();
    camRight.set(-camFwd.z, 0, camFwd.x);
    return THREE.MathUtils.radToDeg(Math.atan2(-windDir.dot(camFwd), windDir.dot(camRight)));
  }

  function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function runGame() {
    resetGame();
    phase = 'intro';
    refreshHud();
    broadcastState();
    const intro = hud.intro(INTRO_SEC * 1000, !multi, startHearts);
    await waitUntil(() => skipIntro, INTRO_SEC);
    if (dead) return;
    intro.remove();
    phase = 'countdown';
    await countdown(ctx.container);
    if (dead) return;
    phase = 'between';
    while (!dead) {
      if (checkEnd()) break;
      const id = nextTurnPlayer();
      if (!id) {
        hud.waiting('⏳ Waiting for players to reconnect…');
        hud.hideActive();
        await wait(1);
        continue;
      }
      hud.waiting(null);
      await playTurn(id);
    }
    if (dead) return;
    await endGame();
  }

  async function endGame() {
    phase = 'over';
    const endedActive = activeId;
    activeId = null;
    windLevel = 0;
    hud.setWind(0, 0, false);
    hud.hideActive();
    refreshHud();
    const alive = aliveIds();
    const winnerId = multi ? (alive.find((id) => isConnected(id)) || alive[0]) : null;
    const w = winnerId ? pl(winnerId) : null;
    broadcastState();
    for (const p of players()) ctx.send(p.id, { type: 'over', winner: w ? w.name : null, youWon: p.id === winnerId, record: Math.round(record * 10) / 10 });
    tmpP.set(0, towerTop + 1, 0);
    const colors = w ? [w.colorHex, 0xffd23f, 0xffffff] : [0xffd23f, 0xff5cc8, 0x3d8bff, 0x34d058];
    particles.confetti(tmpP, colors, 140);
    sfx.play('win');
    await banner(ctx.container, w ? `🏆 ${w.avatar} ${escape(w.name)} wins!` : `🏗️ Tower: ${record.toFixed(1)}m`, 2600);
    if (dead) return;
    void endedActive;
    const rows = order.map((id) => ({ id, i: info.get(id), p: pl(id) })).filter((r) => r.p && r.i);
    rows.sort((a, b) => (b.i.alive - a.i.alive) || (b.i.outOrder - a.i.outOrder) || (b.i.drops - a.i.drops));
    if (winnerId) {
      const wi = rows.findIndex((r) => r.id === winnerId);
      if (wi > 0) rows.unshift(rows.splice(wi, 1)[0]);
    }
    const results = rows.map((r) => (multi
      ? { player: r.p, score: r.i.alive ? `${'❤'.repeat(r.i.hearts)}` : `${r.i.drops}`, label: r.i.alive ? '' : r.i.drops === 1 ? 'drop' : 'drops' }
      : { player: r.p, score: `${record.toFixed(1)}m`, label: `· ${r.i.drops} drops` }));
    const choice = await ctx.showResults(results, {
      title: w ? `${w.name} wins!` : 'Tower Topple',
      subtitle: `Tallest tower: ${record.toFixed(1)} m`,
    });
    if (choice === 'again' && !dead) runGame();
  }

  // debug/test hook
  window.__tower = {
    get phase() { return phase; },
    get activeId() { return activeId; },
    get towerTop() { return towerTop; },
    get record() { return record; },
    get bodies() { return bodies.length; },
    get round() { return round; },
    get turn() { return turnCount; },
    hearts: () => Object.fromEntries([...info].map(([k, v]) => [k, v.hearts])),
    held: () => (held ? { x: held.pos.x, y: held.pos.y, z: held.pos.z, landing: held.landing } : null),
    sleeping: () => bodies.filter((b) => b.body.isSleeping()).length,
  };

  runGame();

  return {
    destroy() {
      dead = true;
      waiters.length = 0;
      delete window.__tower;
      if (recordLabel) recordLabel.material.map.dispose();
      hud.destroy();
      stage.dispose();
      ropeGeo.dispose(); lineGeo.dispose(); hookGeo.dispose(); capGeo.dispose();
      disposePieceCaches();
      try { world.free(); } catch { /* already freed */ }
      closeAudio();
    },
  };
}
