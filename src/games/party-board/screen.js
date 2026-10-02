// Party Board — screen side. Board game flow (turns, spaces, events, shop, duels, stars),
// minigame hosting, phone state machine, teams for >8 players, end-of-game bonus stars.
import { createStage, THREE, loadGLTF } from '../../sdk/three-kit.js';
import { trackInput, escapeHtml } from '../../sdk/screen-kit.js';
import { sfx } from '../../sdk/audio.js';
import { BOARDS, buildBoard, TYPES } from './board-data.js';
import { buildWorld } from './world.js';
import { model, rig } from './models.js';
import { createPiece, createDie, createCounter, createParticles, createCameraRig, PIECE_H } from './fx.js';
import { createHud, chip, controlsDiagram, portrait, COIN, STAR } from './hud.js';
import { createIconRenderer, goldify } from './icons.js';
import { DEBUG, makeRng, makeRuntime, ordinal } from './util.js';
import { minigames as registered } from './minigames/index.js';

// Same monster roster as the minigames use (player.index % 8), so players keep their character everywhere.
const ROSTER = ['dino', 'frog', 'yeti', 'cactoro', 'blue-demon', 'alien', 'mushroom-king', 'orc'];
const ROSTER_NAMES = ['Dino', 'Frog', 'Yeti', 'Cactus', 'Imp', 'Alien', 'Shroom', 'Orc'];
const MAX_PIECES = 8;
const START_COINS = 10;
const STAR_PRICE = 20;
const MG_REWARDS = [10, 5, 3, 2, 1, 1, 1, 1];
const LENGTHS = [{ turns: 5, label: 'Quick' }, { turns: 10, label: 'Standard' }, { turns: 15, label: 'Long' }];
const ITEMS = {
  double: { id: 'double', name: 'Double Dice', model: 'props/cube-question.glb', price: 6, desc: 'Hit two dice blocks this turn' },
  steal: { id: 'steal', name: 'Coin Slingshot', model: 'props/minigame/slingshot-yellow.glb', price: 8, desc: 'Steal 5–10 coins from a rival' },
  warp: { id: 'warp', name: 'Star Warp', model: 'props/minigame/lightning.glb', price: 14, desc: 'Zap right next to the Star' },
};
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

export default async function start(ctx) {
  const stage = createStage(ctx.container, { shadows: true, shadowArea: 48, fov: 45, envIntensity: 0.55 });
  const { scene, camera } = stage;
  const boardDef = BOARDS[DEBUG.board] || BOARDS.isle;
  const board = buildBoard(boardDef);
  const spaces = board.spaces;
  const charUrl = (i) => ctx.sharedAsset(`characters/monsters/${ROSTER[i % ROSTER.length]}.glb`);
  const [world, particles] = await Promise.all([
    buildWorld(stage, board, { sharedAsset: ctx.sharedAsset, asset: ctx.asset }),
    createParticles(scene, ctx.sharedAsset),
    ...ROSTER.map((_, i) => loadGLTF(charUrl(i)).catch(() => null)),
    loadGLTF(ctx.sharedAsset('props/chest.glb')).catch(() => null),
    loadGLTF(ctx.sharedAsset('characters/critters/rabbit-chef.glb')).catch(() => null),
  ]);
  const cam = createCameraRig(camera);
  const origRender = stage.renderer.render;
  const hud = createHud(ctx.container);

  // Rendered art for the 2D UI (TV and phones): star, coin, item icons; portraits are made per piece.
  const icons = createIconRenderer(stage);
  const ART = { star: '', coin: '', items: {} };
  {
    const gold = (m) => goldify(m);
    const [star, coin, ...items] = await Promise.all([
      icons.prop(ctx.sharedAsset('props/star.glb'), 96, { spin: 0.25, recolor: gold }),
      icons.prop(ctx.sharedAsset('props/coin.glb'), 96, { spin: 0.45, recolor: gold }),
      ...Object.values(ITEMS).map((it) => icons.prop(ctx.sharedAsset(it.model), 96, { spin: 0.6 })),
    ]);
    Object.assign(ART, { star, coin });
    Object.keys(ITEMS).forEach((id, i) => { ART.items[id] = items[i]; });
    hud.setArt(ART);
  }
  const itemIcon = (id, h = '1.1em') => (ART.items[id] ? `<img src="${ART.items[id]}" alt="" style="height:${h};vertical-align:-.25em">` : '');

  let rt = makeRuntime(DEBUG.fast);
  let rng = makeRng(DEBUG.seed ?? undefined);
  let G = null; // game state
  let destroyed = false;
  let boardPaused = false;
  const extras = new Set(); // per-frame updaters (dice, counters, temp models)
  const phone = new Map(); // pid -> current phone state
  const asks = new Map(); // token -> { pids, done }
  const artSent = new Map(); // pid -> portrait last sent
  let tokenSeq = 0;
  let setupResolve = null;
  let readyHandler = null;
  let duelHandler = null;
  const mgBus = new Set();
  const mgLeave = new Set();
  let mgRun = 0;
  let mgAbort = null;
  let mgContainer = null;

  cam.set(world.center, { dist: 64, pitch: 0.92, yaw: 0, snap: true });

  stage.onFrame((dt, t) => {
    if (boardPaused) return;
    rt.update(dt);
    world.update(dt, t);
    particles.update(dt);
    if (G) for (const p of G.pieces) p.obj?.update(dt);
    for (const fn of extras) fn(dt, t);
    cam.update(dt * rt.speed);
    const fp = G && G.cur != null ? G.pieces[G.cur]?.obj?.root.position : null;
    world.setFocus(camera.position, fp);
  });

  // ------------------------------------------------------------------ helpers
  const W = (ms) => rt.wait(ms);
  const playerName = (pid) => ctx.player(pid)?.name ?? 'Someone';
  const connected = (pid) => !!ctx.player(pid)?.connected;
  const pieceOf = (pid) => G?.pieces.find((p) => p.members.includes(pid)) || null;
  const pieceName = (p) => (p.members.length > 1 ? `Team ${ROSTER_NAMES[p.char % ROSTER_NAMES.length]}` : playerName(p.members[0]));
  const frenzyLen = () => (!G ? 0 : G.maxTurns >= 15 ? 5 : G.maxTurns >= 10 ? 3 : G.maxTurns >= 5 ? 2 : 0);
  const isFrenzy = () => G && frenzyLen() > 0 && G.turn > G.maxTurns - frenzyLen();
  const ptr = (p, cls = 'pt') => portrait(p.portrait, p.color, cls);
  const log = (s) => { if (G) G.log.push(s); };

  function ranks() {
    const sorted = [...G.pieces].sort((a, b) => b.stars - a.stars || b.coins - a.coins);
    const r = new Map();
    sorted.forEach((p, i) => {
      const prev = sorted[i - 1];
      r.set(p.idx, prev && prev.stars === p.stars && prev.coins === p.coins ? r.get(prev.idx) : i + 1);
    });
    return r;
  }

  function refreshHud() {
    if (!G) return;
    const r = ranks();
    hud.renderCards(G.pieces.map((p) => ({
      idx: p.idx, name: pieceName(p), portrait: p.portrait, color: p.color, coins: p.coins, shownCoins: p.shownCoins,
      stars: p.stars, items: p.items.map((id) => ({ id, icon: ART.items[id] })), members: p.members.length, rank: r.get(p.idx), allAway: !p.members.some(connected),
    })), G.cur ?? -1);
    hud.setTurn(G.turn, G.maxTurns);
  }

  function statusFor(pid) {
    if (!G.pieces.length) return null;
    const p = pieceOf(pid);
    if (!p) return { pending: true };
    const r = ranks();
    return {
      coins: p.coins, stars: p.stars, rank: r.get(p.idx), of: G.pieces.length, items: [...p.items],
      piece: pieceName(p), color: p.color, team: p.members.length > 1 ? p.members.map(playerName) : null,
      turn: G.turn, maxTurns: G.maxTurns, frenzy: isFrenzy(),
    };
  }

  /** Icons + this player's portrait go to the phone once (and again if the portrait changes). */
  function sendArt(pid, force = false) {
    const pt = pieceOf(pid)?.portrait || '';
    if (!force && artSent.get(pid) === pt) return;
    artSent.set(pid, pt);
    ctx.send(pid, { type: 'art', star: ART.star, coin: ART.coin, items: ART.items, portrait: pt });
  }

  function sendState(pid) {
    const s = phone.get(pid) || { view: 'wait', text: 'Get ready to party!' };
    const out = { ...s, me: G ? statusFor(pid) : null, admin: pid === ctx.adminId };
    if (s.deadline) { out.left = Math.max(0, s.deadline - Date.now()); out.total = s.total; delete out.deadline; }
    sendArt(pid);
    ctx.send(pid, { type: 'state', s: out });
  }
  function setPhone(pid, s) { phone.set(pid, s); sendState(pid); }
  function allPids() { return ctx.allPlayers().map((p) => p.id); }
  function waitAll(text, except = []) {
    for (const pid of allPids()) if (!except.includes(pid)) setPhone(pid, { view: 'wait', text });
  }
  function refreshPhones(pids = allPids()) { pids.forEach((pid) => { if (connected(pid)) sendState(pid); }); }
  function vibrate(pid, pattern) { if (pid) ctx.vibrate(pid, pattern); }

  /** Ask one player's phone something. Resolves with their answer, or fallback after a timeout. */
  function ask(pid, s, { timeout = 25000, auto = 2500, fallback = {} } = {}) {
    const token = ++tokenSeq;
    const limit = timeout / rt.speed;
    return new Promise((resolve) => {
      const started = Date.now();
      let awayAt = null;
      let stop = () => {};
      const done = (v) => { stop(); asks.delete(token); resolve(v); };
      asks.set(token, { pids: pid ? [pid] : [], done });
      if (pid) setPhone(pid, { ...s, token, deadline: started + limit, total: limit });
      stop = rt.interval(() => {
        const fb = typeof fallback === 'function' ? fallback : () => fallback;
        if (!pid || !connected(pid)) {
          awayAt ??= Date.now();
          if (Date.now() - awayAt > auto / rt.speed) done({ ...fb(), auto: true });
        } else {
          awayAt = null;
          if (Date.now() - started > limit) done({ ...fb(), auto: true });
        }
      }, 150);
    });
  }

  /** Which member controls a piece this turn (team members alternate; skip disconnected). */
  function controllerOf(p) {
    const n = p.members.length;
    for (let k = 0; k < n; k++) {
      const pid = p.members[(p.turnCount + k) % n];
      if (connected(pid)) return pid;
    }
    return null;
  }

  function screenPos(v3) {
    const v = v3.clone().project(camera);
    const r = ctx.container.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height };
  }
  const headPos = (p) => p.obj.root.position.clone().add(new THREE.Vector3(0, PIECE_H + 0.4, 0));

  // ------------------------------------------------------------------ coins & stars
  async function changeCoins(p, delta, { wait = true } = {}) {
    const before = p.coins;
    p.coins = Math.max(0, before + delta);
    const actual = p.coins - before;
    p.stats.maxCoins = Math.max(p.stats.maxCoins, p.coins);
    const sp = screenPos(headPos(p));
    if (actual === 0) { hud.popup(sp.x, sp.y, '±0', '#ffffff'); refreshHud(); return; }
    hud.popup(sp.x, sp.y, `${actual > 0 ? '+' : '−'}${Math.abs(actual)}${COIN}`, actual > 0 ? '#ffd23f' : '#ff5a6e');
    if (actual > 0) {
      sfx.play('coin');
      particles.coinBurst(headPos(p), Math.min(actual, 10));
      const n = Math.min(actual, 10);
      p.shownCoins = before;
      const fly = hud.fly(sp.x, sp.y, p.idx, n, COIN, (i) => {
        p.shownCoins = before + Math.round((actual * (i + 1)) / n);
        if (i === n - 1) p.shownCoins = null;
        hud.bumpCoins(p.idx, p.shownCoins ?? p.coins);
        if (i % 2 === 0) sfx.play('coin');
      }, rt.speed);
      refreshPhones(p.members);
      if (wait) await rt.guard(fly);
    } else {
      sfx.play('wrong');
      particles.coinDrop(headPos(p), Math.min(-actual, 10));
      refreshHud();
      hud.bumpCoins(p.idx, p.coins);
      refreshPhones(p.members);
      if (wait) await W(600);
    }
    refreshHud();
  }

  function slotPos(spaceId, k, n) {
    const c = world.spacePos(spaceId);
    if (n <= 1) return c;
    const a = (k / n) * Math.PI * 2 + Math.PI / 4;
    const r = n > 6 ? 1.25 : n > 4 ? 0.95 : 0.75;
    return c.add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  /** Spread idle pieces that share a space. */
  function arrange(exclude = null, instant = false) {
    const groups = new Map();
    for (const p of G.pieces) {
      if (p === exclude) continue;
      if (!groups.has(p.space)) groups.set(p.space, []);
      groups.get(p.space).push(p);
    }
    for (const [sid, list] of groups) {
      const n = list.length + (exclude && exclude.space === sid ? 1 : 0);
      list.forEach((p, k) => {
        const to = slotPos(sid, k + (n > list.length ? 1 : 0), n);
        if (instant) p.obj.root.position.copy(to);
        else if (p.obj.root.position.distanceTo(to) > 0.05) p.obj.moveTo(to, 0.3);
        p.obj.face(camera.position.x, camera.position.z);
      });
    }
  }

  function relocateStar({ avoid = null } = {}) {
    const cands = board.starCandidates.filter((id) => id !== world.starSpace && (!avoid || G.pieces.every((p) => p.space !== id)));
    return rng.pick(cands.length ? cands : board.starCandidates);
  }
  async function placeStar(id, { show = true } = {}) {
    world.setStar(id);
    G.starSpace = id;
    if (!show) return;
    const pos = world.spacePos(id);
    cam.set(pos, { dist: 17, pitch: 0.7, stiff: 2.2 });
    await W(700);
    const sm = world.starObject;
    sm.position.y = 14;
    sfx.play('whoosh');
    await rt.tween(0.8, (k) => { sm.position.y = 14 * (1 - k); }, (t) => 1 - (1 - t) ** 3);
    particles.sparkle(pos.clone().add(new THREE.Vector3(0, 2, 0)), 14);
    sfx.play('powerup');
    hud.caption(`The ${STAR} <b>Star</b> has landed here!`, 2000 / rt.speed);
    await W(1600);
  }

  // ------------------------------------------------------------------ game setup
  function newState() {
    return { phase: 'setup', turn: 0, maxTurns: 10, pieces: [], order: [], pending: [], cur: null, starSpace: -1, mgBag: [], lastMg: null, mgCount: 0, log: [] };
  }

  async function makePiece(members) {
    const idx = G.pieces.length;
    const lead = ctx.player(members[0]);
    const used = new Set(G.pieces.map((p) => p.char));
    let char = (lead?.index ?? idx) % ROSTER.length;
    for (let k = 0; k < ROSTER.length && used.has(char); k++) char = (char + 1) % ROSTER.length;
    const p = {
      idx, members: [...members], char, color: lead?.color || '#ffffff', colorHex: lead?.colorHex ?? 0xffffff,
      coins: START_COINS, stars: 0, items: [], space: 0, turnCount: 0, shownCoins: null,
      stats: { mg: 0, maxCoins: START_COINS, events: 0 }, obj: null, portrait: '',
    };
    const [obj, pt] = await Promise.all([
      createPiece(rt, scene, { url: charUrl(char), name: '', color: p.color, colorHex: p.colorHex }),
      icons.portrait(charUrl(char), p.colorHex),
    ]);
    p.obj = obj;
    p.portrait = pt;
    p.obj.setLabel(pieceName(p));
    G.pieces.push(p);
    return p;
  }

  function addToTeam(pid) {
    const target = [...G.pieces].sort((a, b) => a.members.length - b.members.length || a.idx - b.idx)[0];
    target.members.push(pid);
    target.obj.setLabel(pieceName(target));
    refreshHud();
    setPhone(pid, { view: 'wait', text: `You joined <b>${escapeHtml(pieceName(target))}</b>! Teammates take turns rolling.` });
    refreshPhones(target.members);
    log('join:team');
  }

  async function addPending() {
    const pend = G.pending.filter(connected);
    G.pending = [];
    for (const pid of pend) {
      if (pieceOf(pid)) continue;
      if (G.pieces.length < MAX_PIECES) {
        const p = await makePiece([pid]);
        p.obj.root.position.copy(world.spacePos(0));
        G.order.push(p.idx);
        sfx.play('join');
        hud.caption(`<b>${escapeHtml(pieceName(p))}</b> hopped onto the board!`, 2200);
        setPhone(pid, { view: 'wait', text: 'You\'re on the board! Your turn comes after the others.' });
        log('join:piece');
      } else addToTeam(pid);
    }
    arrange(null, false);
    refreshHud();
  }

  const minutes = (turns, n) => Math.max(5, Math.round((turns * (Math.min(n, MAX_PIECES) * 0.4 + 1.7)) / 5) * 5);

  function setupSheet() {
    const types = [['blue', '+3 coins'], ['red', '−3 coins'], ['event', 'Happening'], ['shop', 'Item shop'], ['duel', 'Duel']];
    return `<h1>Party Board</h1>
      <h2>Race around ${escapeHtml(boardDef.name)} and collect the most Stars</h2>
      <div class="pb-legend">
        ${types.map(([t, d]) => `<div><i style="background:#${TYPES[t].color.toString(16).padStart(6, '0')}">${{ blue: '+', red: '−', event: '?', shop: '$', duel: 'VS' }[t]}</i>${d}</div>`).join('')}
        <div>${STAR}Star: ${STAR_PRICE} coins</div>
      </div>
      <p>A minigame after every round. Most stars wins, coins break ties.</p>
      <p style="color:var(--sub)" class="pb-setup-wait"></p>`;
  }

  function refreshSetup() {
    if (!G || G.phase !== 'setup') return;
    const admin = ctx.player(ctx.adminId);
    const n = ctx.players().length;
    for (const p of ctx.players()) {
      if (p.id === ctx.adminId) setPhone(p.id, { view: 'setup', lengths: LENGTHS.map((l) => ({ ...l, min: minutes(l.turns, n) })), players: n });
      else setPhone(p.id, { view: 'wait', text: `${escapeHtml(admin?.name || 'The host')} is picking the game length…` });
    }
    const el = hud.root.querySelector('.pb-setup-wait');
    if (el) el.innerHTML = `<b>${escapeHtml(admin?.name || 'The host')}</b> picks the game length on their phone`;
  }

  async function intro() {
    const n = G.pieces.length;
    hud.show(true);
    refreshHud();
    // flyover
    cam.manual(true);
    const c = world.center;
    sfx.play('whoosh');
    await rt.tween(4.2, (k) => {
      const a = -0.9 + k * 1.5;
      const r = 78 - k * 20;
      camera.position.set(c.x + Math.sin(a) * r, 34 - k * 6, c.z + Math.cos(a) * r);
      camera.lookAt(c.x, -2 + k * 2, c.z);
    }, (t) => t);
    cam.syncFrom(new THREE.Vector3(c.x, 0, c.z));
    cam.set(world.center, { dist: 60, pitch: 0.92, yaw: 0, stiff: 1.5 });
    await hud.banner(`Welcome to<br>${escapeHtml(boardDef.name)}!`, 1700, rt.speed);
    cam.set(world.spacePos(0), { dist: 13, pitch: 0.55, yaw: 0, stiff: 2 });
    for (const p of G.pieces) p.obj.anim.play('wave');
    hud.caption(`${n} ${n === 1 ? 'piece' : 'pieces'} at the start line${G.pieces.some((p) => p.members.length > 1) ? '. Big crowd, so players share pieces in teams!' : '!'}`, 2400 / rt.speed);
    await W(2200);
    for (const p of G.pieces) p.obj.anim.play('idle');
    await placeStar(relocateStar({ avoid: true }));
  }

  async function rollOrder() {
    const list = G.pieces;
    if (list.length === 1) { G.order = [0]; return; }
    const values = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, list.length);
    const m = hud.modal(`<h1>Who goes first?</h1><h2>Everyone hit your dice block!</h2>
      <div class="pb-order">${list.map((p) => `<div class="o" data-i="${p.idx}" style="--c:${p.color}"><div class="num">?</div>${escapeHtml(pieceName(p))}</div>`).join('')}</div>`);
    const spinning = new Set(list.map((p) => p.idx));
    const stopSpin = rt.interval(() => {
      for (const i of spinning) {
        const el = m.el.querySelector(`.o[data-i="${i}"] .num`);
        if (el) el.textContent = 1 + Math.floor(Math.random() * 10);
      }
    }, 70);
    waitAll('Rolling for turn order…');
    await Promise.all(list.map(async (p, i) => {
      const pid = controllerOf(p);
      await ask(pid, { view: 'roll', title: 'Roll for turn order!', items: [], hint: 'Biggest number goes first' }, { timeout: 15000, auto: 800 + i * 250, fallback: { act: 'roll' } });
      spinning.delete(p.idx);
      const el = m.el.querySelector(`.o[data-i="${p.idx}"]`);
      el.querySelector('.num').textContent = values[i];
      el.classList.add('done');
      sfx.play('hit');
      if (pid) { setPhone(pid, { view: 'wait', text: `You rolled <b>${values[i]}</b>!` }); vibrate(pid, 'tap'); }
    }));
    stopSpin();
    G.order = list.map((p, i) => ({ idx: p.idx, v: values[i] })).sort((a, b) => b.v - a.v).map((o) => o.idx);
    await W(700);
    m.set(`<h1>Turn order</h1><div class="pb-rows">${G.order.map((idx, k) => {
      const p = G.pieces[idx];
      return `<div class="pb-row" style="--c:${p.color};animation-delay:${k * 0.12}s"><span class="pl">${k + 1}</span>${ptr(p)}<span class="nm">${escapeHtml(pieceName(p))}</span></div>`;
    }).join('')}</div>`);
    sfx.play('powerup');
    await W(2600);
    m.close();
  }

  // ------------------------------------------------------------------ turns
  async function playTurn(p) {
    const pid = controllerOf(p);
    if (!pid && p.members.length) {
      // Everyone on this piece is disconnected: skip the turn (they can come back any time).
      log('turn:skip');
      hud.caption(`<b>${escapeHtml(pieceName(p))}</b> is away. Turn skipped.`, 1600 / rt.speed);
      await W(1200);
      return;
    }
    G.cur = p.idx;
    p.turnCount++;
    refreshHud();
    cam.set(p.obj.root, { dist: 13, pitch: 0.82, yaw: 0, stiff: 2.2 });
    // the active piece steps to the centre of its space
    p.obj.moveTo(world.spacePos(p.space), 0.25);
    arrange(p);
    p.obj.face(camera.position.x, camera.position.z);
    const who = pid ? escapeHtml(playerName(pid)) : escapeHtml(pieceName(p));
    waitAll(`<b>${who}</b> is rolling…`, pid ? [pid] : []);
    await hud.banner(`<small>${p.members.length > 1 ? escapeHtml(pieceName(p)) : `Turn ${G.turn}`}</small>${who}'s turn!`, 1100, rt.speed);
    if (pid) vibrate(pid, 'turn');

    const dice = [spawnDie(p, 0)];
    let usedItem = false;
    for (;;) {
      const items = usedItem ? [] : p.items.map((id, i) => ({ i, id, name: ITEMS[id].name }));
      const r = await ask(pid, { view: 'roll', title: 'Your turn!', items, dice: dice.length, hint: dice.length > 1 ? 'Double dice!' : 'Tap to roll' }, { timeout: 30000, auto: 1500, fallback: { act: 'roll' } });
      if (r.act === 'item' && !usedItem && p.items[r.i] != null) {
        const id = p.items.splice(r.i, 1)[0];
        usedItem = true;
        refreshHud();
        refreshPhones(p.members);
        sfx.play('powerup');
        hud.caption(`${itemIcon(id)} <b>${who}</b> used the <b>${ITEMS[id].name}</b>!`, 2200 / rt.speed);
        particles.sparkle(headPos(p), 10);
        log(`item:${id}`);
        if (id === 'double') {
          dice.push(spawnDie(p, 1));
          dice[0].offset = -0.85;
          dice[1].offset = 0.85;
        } else if (id === 'steal') {
          await stealItem(p, pid);
          cam.set(p.obj.root, { dist: 13, pitch: 0.82, yaw: 0 });
        } else if (id === 'warp') {
          dice.forEach((d) => d.kill());
          await warpToStar(p, pid);
          return endTurn(p);
        }
        continue;
      }
      break;
    }
    // Hit the block(s)
    p.obj.anim.play('jump', { once: true, fade: 0.05 });
    await p.obj.hop(p.obj.root.position.clone(), { height: 0.9, dur: 0.3 });
    const vals = dice.map(() => rng.int(1, 10));
    dice.forEach((d, i) => { d.die.stop(vals[i]); d.die.mesh.scale.setScalar(1.25); });
    sfx.play('hit');
    hud.flash();
    cam.shake(0.25);
    particles.sparkle(headPos(p).add(new THREE.Vector3(0, 2, 0)), 10, { speed: 4 });
    vibrate(pid, 'hit');
    const total = vals.reduce((a, b) => a + b, 0);
    log(`roll:${total}`);
    if (pid) setPhone(pid, { view: 'rolled', n: total });
    await W(dice.length > 1 ? 1300 : 900);
    if (dice.length > 1) hud.caption(`${vals.join(' + ')} = <b>${total}</b>`, 1600 / rt.speed);
    await rt.tween(0.25, (k) => dice.forEach((d) => d.die.mesh.scale.setScalar(1.25 + k * 0.6)));
    dice.forEach((d) => d.kill());
    p.obj.anim.play('idle');
    await moveSteps(p, total, pid);
    await landOn(p, pid);
    return endTurn(p);
  }

  async function endTurn(p) {
    await W(400);
    p.obj.anim.play('idle');
    G.cur = null;
    arrange();
    refreshHud();
  }

  function spawnDie(p, k) {
    const die = createDie(scene, p.color);
    const entry = { die, offset: 0, k };
    const fn = (dt) => {
      die.group.position.copy(p.obj.root.position).add(new THREE.Vector3(entry.offset, PIECE_H + 1.9, 0));
      die.update(dt, camera);
    };
    extras.add(fn);
    entry.kill = () => { extras.delete(fn); die.dispose(); };
    return entry;
  }

  function distToStar(from) {
    // BFS steps from `from` to the star space
    const seen = new Map([[from, 0]]);
    const q = [from];
    while (q.length) {
      const s = q.shift();
      if (s === G.starSpace) return seen.get(s);
      for (const n of spaces[s].next) if (!seen.has(n)) { seen.set(n, seen.get(s) + 1); q.push(n); }
    }
    return 99;
  }

  async function moveSteps(p, n, pid) {
    const counter = createCounter(scene);
    const cfn = (dt) => { counter.sprite.position.copy(p.obj.root.position).add(new THREE.Vector3(0, PIECE_H + 1.6, 0)); counter.update(dt); };
    extras.add(cfn);
    counter.set(n, p.color);
    let left = n;
    try {
      while (left > 0) {
        const s = spaces[p.space];
        let next = s.next[0];
        if (s.next.length > 1) { next = await junction(p, s, pid, left); }
        const to = world.spacePos(next);
        p.obj.anim.play('run');
        await p.obj.hop(to, { height: world.isBridge(s.id, next) ? 1.7 : 0.9, dur: 0.3 });
        sfx.play('blip');
        world.bounceSpace(next);
        p.space = next;
        left--;
        counter.set(left, p.color);
        arrange(p);
        if (next === G.starSpace) {
          p.obj.anim.play('idle');
          await starStop(p, pid, left);
          cam.set(p.obj.root, { dist: 13, pitch: 0.82, yaw: 0 });
        }
      }
    } finally {
      extras.delete(cfn);
      counter.dispose();
    }
    p.obj.anim.play('idle');
  }

  async function junction(p, s, pid, left) {
    p.obj.anim.play('idle');
    world.showArrows(s.id);
    cam.set(world.spacePos(s.id), { dist: 12, pitch: 0.75, yaw: 0 });
    await W(500);
    const here = screenPos(world.spacePos(s.id));
    const options = s.next.map((n, i) => {
      const there = screenPos(world.spacePos(n));
      const a = Math.atan2(there.y - here.y, there.x - here.x);
      const sector = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
      return { label: `${ARROWS[sector]} ${s.junctionNames?.[i] || `Path ${i + 1}`}`, color: ['#e08e00', '#1f8be0', '#e0478f'][i % 3] };
    });
    hud.caption(`Which way? <b>${options.map((o) => o.label).join('</b> or <b>')}</b>`, 0);
    const best = s.next.reduce((bi, n, i) => (distToStar(n) < distToStar(s.next[bi]) ? i : bi), 0);
    const r = await ask(pid, { view: 'choice', title: 'Which way?', sub: `${left} step${left === 1 ? '' : 's'} left`, options }, { timeout: 20000, auto: 1200, fallback: { i: best } });
    hud.hideCaption();
    world.hideArrows();
    sfx.play('click');
    cam.set(p.obj.root, { dist: 13, pitch: 0.82, yaw: 0 });
    if (pid) setPhone(pid, { view: 'wait', text: 'Hop, hop, hop…' });
    const k = Math.max(0, Math.min(s.next.length - 1, r.i | 0));
    log(`junction:${k}`);
    return s.next[k];
  }

  async function starStop(p, pid) {
    cam.set(world.spacePos(p.space), { dist: 12, pitch: 0.7, yaw: 0, stiff: 2.5 });
    if (p.coins >= STAR_PRICE) {
      hud.caption(`Buy a ${STAR} Star for <b>${STAR_PRICE} coins</b>?`, 0);
      const r = await ask(pid, { view: 'confirm', title: 'Buy a Star?', icon: 'star', text: `Trade <b>${STAR_PRICE} ${COIN}</b> for a shiny Star!`, yes: `Buy for ${STAR_PRICE}`, no: 'No thanks' }, { timeout: 20000, auto: 1200, fallback: { yes: true } });
      hud.hideCaption();
      if (r.yes) await buyStar(p, pid);
      else { hud.caption('Maybe next time…', 1400 / rt.speed); await W(900); }
    } else {
      p.obj.anim.play('sad');
      sfx.play('wrong');
      hud.caption(`A Star costs <b>${STAR_PRICE} ${COIN}</b>… ${escapeHtml(pieceName(p))} has ${p.coins}`, 2000 / rt.speed);
      vibrate(pid, 'error');
      log('star:broke');
      await W(1800);
      p.obj.anim.play('idle');
    }
    if (pid) setPhone(pid, { view: 'wait', text: 'Hop, hop, hop…' });
  }

  async function buyStar(p, pid) {
    await changeCoins(p, -STAR_PRICE, { wait: false });
    const star = world.starObject;
    const from = star.position.clone();
    sfx.play('powerup');
    await rt.tween(0.9, (k) => {
      star.position.lerpVectors(from, p.obj.root.position, k);
      star.position.y = from.y + Math.sin(k * Math.PI) * 2.5;
      star.scale.setScalar(1 - k * 0.6);
    });
    star.scale.setScalar(1);
    p.stars++;
    log('star:buy');
    world.setStar(-1);
    hud.flash();
    cam.shake(0.4);
    sfx.play('win');
    p.obj.anim.play('win');
    particles.confetti(p.obj.root.position.clone().add(new THREE.Vector3(0, 2, 0)), 160);
    particles.sparkle(headPos(p), 18, { speed: 6 });
    const sp = screenPos(headPos(p));
    hud.fly(sp.x, sp.y, p.idx, 1, STAR, () => refreshHud(), rt.speed);
    vibrate(pid, 'win');
    refreshHud();
    refreshPhones(p.members);
    await hud.banner(`STAR GET!<small>${escapeHtml(pieceName(p))} now has ${p.stars} ${p.stars === 1 ? 'star' : 'stars'}</small>`, 2200, rt.speed);
    p.obj.anim.play('idle');
    await placeStar(relocateStar());
  }

  async function warpToStar(p, pid) {
    // Arrive on the space right before the Star, then stop by it.
    const before = spaces[G.starSpace].prev[0];
    sfx.play('whoosh');
    particles.sparkle(headPos(p), 14);
    await rt.tween(0.35, (k) => p.obj.root.scale.setScalar(1 - k * 0.95));
    p.space = before;
    p.obj.root.position.copy(world.spacePos(before));
    cam.set(p.obj.root, { dist: 13, pitch: 0.82, yaw: 0, snap: true });
    await W(300);
    await rt.tween(0.45, (k) => p.obj.root.scale.setScalar(0.05 + k * 0.95), (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2);
    particles.sparkle(headPos(p), 14);
    const to = world.spacePos(G.starSpace);
    await p.obj.hop(to, { height: 1 });
    p.space = G.starSpace;
    await starStop(p, pid);
  }

  async function pickRival(p, pid, title, prefer = 'rich') {
    const others = G.pieces.filter((o) => o !== p);
    const options = others.map((o) => ({ label: escapeHtml(pieceName(o)), sub: `${o.stars} stars · ${o.coins} coins`, color: o.color }));
    const best = others.reduce((bi, o, i) => ((prefer === 'rich' ? o.coins > others[bi].coins : o.stars > others[bi].stars) ? i : bi), 0);
    const r = await ask(pid, { view: 'choice', title, options }, { timeout: 20000, auto: 1500, fallback: { i: best } });
    return others[Math.max(0, Math.min(others.length - 1, r.i | 0))];
  }

  async function stealItem(p, pid) {
    if (G.pieces.length < 2) return;
    const victim = await pickRival(p, pid, 'Steal from…');
    const amt = Math.min(victim.coins, rng.int(5, 10));
    cam.set(victim.obj.root, { dist: 13, pitch: 0.8 });
    await W(700);
    victim.obj.anim.play('hit', { once: true });
    cam.shake(0.4);
    victim.members.forEach((m) => vibrate(m, 'bump'));
    await changeCoins(victim, -amt, { wait: false });
    await W(500);
    cam.set(p.obj.root, { dist: 13, pitch: 0.8 });
    await W(500);
    await changeCoins(p, amt);
  }

  async function landOn(p, pid) {
    if (p.space === G.starSpace) return;
    const s = spaces[p.space];
    const frenzy = isFrenzy();
    world.bounceSpace(p.space);
    cam.set(p.obj.root, { dist: 12.5, pitch: 0.78, yaw: 0 });
    log(`land:${s.type}`);
    if (s.type === 'blue') {
      const v = frenzy ? 6 : 3;
      p.obj.anim.play('yes');
      hud.caption(`Blue space! <b>+${v} coins</b>`, 1800 / rt.speed);
      vibrate(pid, 'success');
      await changeCoins(p, v);
    } else if (s.type === 'red') {
      const v = frenzy ? 5 : 3;
      p.obj.anim.play('sad');
      cam.shake(0.35);
      hud.caption(`Red space… <b>−${v} coins</b>`, 1800 / rt.speed);
      vibrate(pid, 'lose');
      await changeCoins(p, -v);
    } else if (s.type === 'event') {
      p.stats.events++;
      await happening(p, pid);
    } else if (s.type === 'shop') {
      await shop(p, pid);
    } else if (s.type === 'duel') {
      await duel(p, pid);
    }
    await W(500);
  }

  // ------------------------------------------------------------------ happenings
  async function tempModel(url, height, pos, faceTo) {
    const m = await model(url, { height });
    m.position.copy(pos);
    if (faceTo) m.rotation.y = Math.atan2(faceTo.x - pos.x, faceTo.z - pos.z);
    scene.add(m);
    const a = rig(m);
    const fn = (dt) => a.update(dt);
    extras.add(fn);
    return { m, a, kill() { extras.delete(fn); scene.remove(m); } };
  }

  async function happening(p, pid) {
    const others = G.pieces.filter((o) => o !== p);
    const leader = [...G.pieces].sort((a, b) => b.stars - a.stars || b.coins - a.coins)[0];
    const events = [
      { id: 'shower', w: 3, name: 'Coin Shower' },
      { id: 'chest', w: 2.2, name: 'Lucky Chest' },
      { id: 'swap', w: others.length ? 1.6 : 0, name: 'Coin Swap' },
      { id: 'warp', w: others.length ? 1.6 : 0, name: 'Place Swap' },
      { id: 'bandit', w: 1.4, name: 'Star Bandit' },
      { id: 'starmove', w: 1, name: 'Star Shuffle' },
      { id: 'robin', w: others.length ? 1.4 : 0, name: 'Robin Hood' },
    ].filter((e) => e.w > 0);
    const ev = rng.weighted(events);
    log(`happening:${ev.id}`);
    sfx.play('powerup');
    if (pid) setPhone(pid, { view: 'wait', text: 'Happening! Watch the TV…' });
    const m = hud.modal('<div class="pb-tag">Happening</div><h1>What will happen?</h1>');
    await rt.guard(hud.roulette(m.el, events.map((e) => e.name), events.indexOf(ev), { speed: rt.speed }));
    await W(700);
    m.close();
    const who = `<b>${escapeHtml(pieceName(p))}</b>`;
    if (ev.id === 'shower') {
      const v = rng.int(6, 10);
      hud.caption(`Coins rain from the sky! ${who} gets <b>+${v}</b>`, 2400 / rt.speed);
      particles.coinRain(p.obj.root.position, 24, 2.5);
      p.obj.anim.play('win');
      await W(900);
      await changeCoins(p, v);
    } else if (ev.id === 'chest') {
      const front = p.obj.root.position.clone().add(new THREE.Vector3(0, 0, 1.6));
      const chest = await tempModel(ctx.sharedAsset('props/chest.glb'), 1.1, front, camera.position);
      chest.m.scale.setScalar(0.01);
      await rt.tween(0.4, (k) => chest.m.scale.setScalar(Math.max(0.01, k)), (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2);
      await W(400);
      chest.a.play('Chest_Open', { once: true });
      sfx.play('powerup');
      particles.sparkle(front.clone().add(new THREE.Vector3(0, 0.8, 0)), 14);
      if (p.items.length < 3) {
        const id = rng.pick(Object.keys(ITEMS));
        p.items.push(id);
        hud.caption(`${who} found a ${itemIcon(id)} <b>${ITEMS[id].name}</b>!`, 2400 / rt.speed);
        refreshHud();
        refreshPhones(p.members);
        vibrate(pid, 'success');
        await W(1600);
      } else {
        hud.caption(`The chest is full of coins! ${who} gets <b>+8</b>`, 2400 / rt.speed);
        await changeCoins(p, 8);
      }
      await W(500);
      chest.kill();
    } else if (ev.id === 'swap') {
      const o = rng.pick(others);
      hud.caption(`${who} swaps coins with <b>${escapeHtml(pieceName(o))}</b>!`, 2600 / rt.speed);
      await W(800);
      const a = p.coins;
      const b = o.coins;
      sfx.play('whoosh');
      await changeCoins(p, b - a, { wait: false });
      await changeCoins(o, a - b);
    } else if (ev.id === 'warp') {
      const o = rng.pick(others);
      hud.caption(`${who} trades places with <b>${escapeHtml(pieceName(o))}</b>!`, 2600 / rt.speed);
      await W(600);
      sfx.play('whoosh');
      await rt.tween(0.35, (k) => { p.obj.root.scale.setScalar(1 - k * 0.95); o.obj.root.scale.setScalar(1 - k * 0.95); });
      [p.space, o.space] = [o.space, p.space];
      p.obj.root.position.copy(world.spacePos(p.space));
      o.obj.root.position.copy(world.spacePos(o.space));
      cam.set(p.obj.root, { dist: 13, pitch: 0.82, snap: true });
      await rt.tween(0.4, (k) => { p.obj.root.scale.setScalar(0.05 + k * 0.95); o.obj.root.scale.setScalar(0.05 + k * 0.95); });
      particles.sparkle(headPos(p), 12);
      arrange();
      await W(900);
      if (p.space === G.starSpace) await starStop(p, pid);
    } else if (ev.id === 'bandit') {
      const side = p.obj.root.position.clone().add(new THREE.Vector3(1.6, 0, 0.6));
      const bandit = await tempModel(ctx.sharedAsset('characters/monsters/blue-demon.glb'), 2.1, side.clone().add(new THREE.Vector3(6, 0, 0)), p.obj.root.position);
      bandit.m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.45); } });
      bandit.a.play('run');
      sfx.play('whoosh');
      const startPos = bandit.m.position.clone();
      await rt.tween(0.6, (k) => bandit.m.position.lerpVectors(startPos, side, k));
      bandit.m.rotation.y = Math.atan2(p.obj.root.position.x - side.x, p.obj.root.position.z - side.z);
      bandit.a.play('punch', { once: true });
      await W(450);
      cam.shake(0.9);
      sfx.play('hit');
      p.obj.anim.play('hit', { once: true });
      vibrate(pid, 'heavy');
      if (p.stars > 0) {
        p.stars--;
        hud.caption(`The Star Bandit stole a ${STAR} <b>Star</b> from ${who}!`, 2600 / rt.speed);
        particles.sparkle(headPos(p), 14);
        refreshHud();
        refreshPhones(p.members);
      } else {
        const v = Math.min(p.coins, 10);
        hud.caption(`No stars to steal… the Star Bandit swiped <b>${v} coins</b> instead!`, 2600 / rt.speed);
        await changeCoins(p, -v, { wait: false });
      }
      sfx.play('lose');
      await W(1400);
      bandit.a.play('run');
      bandit.m.rotation.y += Math.PI;
      const s2 = bandit.m.position.clone();
      await rt.tween(0.7, (k) => { bandit.m.position.lerpVectors(s2, s2.clone().add(new THREE.Vector3(8, 0, -3)), k); bandit.m.position.y = Math.sin(k * Math.PI * 3) * 0.4; });
      bandit.kill();
      p.obj.anim.play('idle');
    } else if (ev.id === 'starmove') {
      hud.caption(`The ${STAR} Star is on the move!`, 2000 / rt.speed);
      await W(900);
      await placeStar(relocateStar());
      cam.set(p.obj.root, { dist: 13, pitch: 0.82 });
    } else if (ev.id === 'robin') {
      if (leader !== p) {
        const v = Math.min(leader.coins, 6);
        hud.caption(`Robin Hood! <b>${escapeHtml(pieceName(leader))}</b> (1st place) gives ${who} <b>${v} coins</b>`, 2800 / rt.speed);
        await changeCoins(leader, -v, { wait: false });
        await W(400);
        await changeCoins(p, v);
      } else {
        const poor = [...others].sort((a, b) => a.stars - b.stars || a.coins - b.coins)[0];
        const v = Math.min(p.coins, 6);
        hud.caption(`Robin Hood! ${who} is in 1st, so <b>${v} coins</b> go to <b>${escapeHtml(pieceName(poor))}</b>`, 2800 / rt.speed);
        await changeCoins(p, -v, { wait: false });
        await W(400);
        await changeCoins(poor, v);
      }
    }
    await W(600);
  }

  // ------------------------------------------------------------------ shop
  async function shop(p, pid) {
    const pos = p.obj.root.position.clone().add(new THREE.Vector3(-1.5, 0, 0.8));
    const keeper = await tempModel(ctx.sharedAsset('characters/critters/rabbit-chef.glb'), 1.5, pos, camera.position);
    keeper.a.play('wave');
    sfx.play('join');
    try {
      if (p.items.length >= 3) {
        hud.caption('Welcome! …oh, your bag is full (3 items max).', 2200 / rt.speed);
        await W(1800);
        return;
      }
      const list = Object.values(ITEMS).map((it) => ({ id: it.id, name: it.name, desc: it.desc, price: it.price, can: p.coins >= it.price }));
      hud.caption(`Welcome to the <b>Item Shop</b>! ${escapeHtml(pieceName(p))} has ${p.coins} ${COIN}`, 0);
      // Auto-buy for absent players: cheapest affordable item if they'd keep 5 coins.
      const autoPick = () => {
        const a = list.filter((it) => p.coins >= it.price + 5).sort((x, y) => x.price - y.price)[0];
        return a ? { buy: a.id } : { leave: true };
      };
      const r = await ask(pid, { view: 'shop', title: 'Item Shop', coins: p.coins, items: list, slots: 3 - p.items.length }, { timeout: 25000, auto: 1500, fallback: autoPick });
      const it = r.buy && ITEMS[r.buy];
      if (it && p.coins >= it.price) {
        keeper.a.play('yes');
        p.items.push(it.id);
        log(`shop:${it.id}`);
        hud.caption(`${itemIcon(it.id)} ${escapeHtml(pieceName(p))} bought the <b>${it.name}</b>!`, 2200 / rt.speed);
        sfx.play('powerup');
        await changeCoins(p, -it.price);
        refreshHud();
        refreshPhones(p.members);
        await W(800);
      } else {
        log('shop:leave');
        hud.caption('Come back any time!', 1500 / rt.speed);
        await W(900);
      }
    } finally {
      hud.hideCaption();
      keeper.kill();
    }
  }

  // ------------------------------------------------------------------ duels
  async function duel(p, pid) {
    const others = G.pieces.filter((o) => o !== p);
    if (!others.length) {
      hud.caption('No rivals to duel… have <b>5 coins</b> instead!', 2000 / rt.speed);
      await changeCoins(p, 5);
      return;
    }
    hud.caption(`<b>DUEL!</b> ${escapeHtml(pieceName(p))} picks a rival…`, 0);
    const o = await pickRival(p, pid, 'Challenge who?');
    hud.hideCaption();
    const stake = 10;
    const kind = rng.next() < 0.6 ? 'draw' : 'flip';
    log(`duel:${kind}`);
    const side = (q, cls = '') => `<div class="side ${cls}" data-i="${q.idx}" style="--c:${q.color}">${ptr(q, 'big')}${escapeHtml(pieceName(q))}</div>`;
    const sheet = (msg, win = null) => `<div class="pb-tag">Duel · ${stake} coins at stake</div><h1>${kind === 'draw' ? 'Quick Draw!' : 'Coin Flip!'}</h1>
      <div class="pb-vs">${side(p, win === p ? 'win' : '')}<div class="vs">VS</div>${side(o, win === o ? 'win' : '')}</div><p class="pb-duel-msg">${msg}</p>`;
    const m = hud.modal(sheet(kind === 'draw' ? 'Wait for <b>GO!</b> then tap your phone first. Too early and you lose!' : `${escapeHtml(pieceName(p))} calls it…`));
    sfx.play('countdown');
    await W(2200);
    let winner = null;
    if (kind === 'draw') winner = await quickDraw(p, o, m);
    else winner = await coinFlip(p, o, pid, m);
    const loser = winner === p ? o : winner === o ? p : null;
    if (winner) {
      m.set(sheet(`<b>${escapeHtml(pieceName(winner))}</b> wins the duel!`, winner));
      sfx.play('win');
      await W(1600);
      m.close();
      winner.obj.anim.play('win');
      loser.obj.anim.play('sad');
      const v = Math.min(stake, loser.coins);
      await changeCoins(loser, -v, { wait: false });
      await W(300);
      await changeCoins(winner, v);
      await W(700);
      winner.obj.anim.play('idle');
      loser.obj.anim.play('idle');
    } else {
      m.set(sheet('Nobody wins. It\'s a draw!'));
      await W(1500);
      m.close();
    }
    waitAll('Duel over!');
  }

  async function quickDraw(a, b, m) {
    const pidsA = a.members.filter(connected);
    const pidsB = b.members.filter(connected);
    const all = [...pidsA, ...pidsB];
    for (const pid of all) setPhone(pid, { view: 'duel', phase: 'ready', vs: pieceName(pidsA.includes(pid) ? b : a) });
    let go = false;
    let result = null;
    const foul = new Set();
    let resolve;
    const finished = new Promise((r) => { resolve = r; });
    duelHandler = (pid) => {
      const side = pidsA.includes(pid) ? a : pidsB.includes(pid) ? b : null;
      if (!side || result) return;
      if (!go) {
        foul.add(side);
        vibrate(pid, 'error');
        if (foul.size === 2) { result = 'draw'; resolve(); } else { result = side === a ? b : a; resolve(); }
        return;
      }
      result = side;
      resolve();
    };
    const delay = 1500 + rng.next() * 2500;
    rt.timeout(() => {
      if (result) return;
      go = true;
      sfx.play('go');
      hud.flash();
      const msg = m.el.querySelector('.pb-duel-msg');
      if (msg) msg.innerHTML = '<span class="pb-big" style="color:#ff3d6b">GO!</span>';
      for (const pid of all) { setPhone(pid, { view: 'duel', phase: 'go' }); vibrate(pid, 'heavy'); }
      // Absent sides get a CPU reflex so the duel still resolves.
      for (const side of [a, b]) {
        if (!side.members.some(connected)) rt.timeout(() => { if (!result) { result = side; resolve(); } }, 380 + rng.next() * 400);
      }
      rt.timeout(() => { if (!result) { result = 'draw'; resolve(); } }, 6000);
    }, delay / Math.min(rt.speed, 2));
    // Nobody can stall a duel: hard cap.
    rt.timeout(() => { if (!result) { result = 'draw'; resolve(); } }, 15000);
    await rt.guard(finished);
    duelHandler = null;
    if (foul.size === 1) {
      const msg = m.el.querySelector('.pb-duel-msg');
      if (msg) msg.innerHTML = `<b>${escapeHtml(pieceName([...foul][0]))}</b> tapped too early!`;
      sfx.play('wrong');
      await W(1300);
    }
    for (const pid of all) {
      const won = result !== 'draw' && (result === a ? pidsA : pidsB).includes(pid);
      setPhone(pid, { view: 'wait', text: result === 'draw' ? 'Draw!' : won ? 'You won the duel!' : 'You lost the duel…' });
      vibrate(pid, result === 'draw' ? 'tap' : won ? 'win' : 'lose');
    }
    return result === 'draw' ? null : result;
  }

  async function coinFlip(a, b, pid, m) {
    const r = await ask(pid, { view: 'choice', title: 'Call it!', options: [{ label: 'Heads', color: '#ffb300' }, { label: 'Tails', color: '#5c6cff' }] }, { timeout: 15000, auto: 1200, fallback: () => ({ i: rng.int(0, 1) }) });
    const call = r.i === 1 ? 1 : 0;
    const res = rng.int(0, 1);
    const msg = m.el.querySelector('.pb-duel-msg');
    if (msg) msg.innerHTML = `Called <b>${call ? 'Tails' : 'Heads'}</b>… <span class="pb-big pb-coin" style="display:inline-block">${COIN}</span>`;
    const coin = m.el.querySelector('.pb-coin');
    coin?.animate([{ transform: 'rotateY(0) translateY(0)' }, { transform: 'rotateY(1800deg) translateY(-60px)' }, { transform: 'rotateY(3600deg) translateY(0)' }], { duration: 1800 / rt.speed, easing: 'ease-out' });
    sfx.play('whoosh');
    await W(1900);
    if (msg) msg.innerHTML = `It's <b>${res ? 'Tails' : 'Heads'}</b>!`;
    sfx.play(res === call ? 'correct' : 'wrong');
    await W(1200);
    return res === call ? a : b;
  }

  // ------------------------------------------------------------------ minigames
  function participantsFor() {
    const live = G.pieces.map((p) => p.members.filter(connected));
    const total = live.reduce((s, l) => s + l.length, 0);
    const out = [];
    G.pieces.forEach((p, i) => {
      if (!live[i].length) return;
      if (total <= MAX_PIECES) out.push(...live[i]);
      else out.push(live[i][G.turn % live[i].length]); // rotate the team representative
    });
    return out;
  }

  function chooseMinigame(n) {
    const pool = registered.filter((mg) => (mg.minPlayers || 1) <= Math.max(1, n));
    if (DEBUG.minigame) {
      const ids = DEBUG.minigame.split(',');
      const forced = registered.find((mg) => mg.id === ids[G.mgCount % ids.length]);
      if (forced) return { mg: forced, pool: [forced, ...pool.filter((x) => x !== forced)] };
    }
    const usable = pool.length ? pool : registered;
    if (!G.mgBag.length || !G.mgBag.every((id) => usable.some((mg) => mg.id === id))) {
      G.mgBag = rng.shuffle(usable.map((mg) => mg.id));
      if (G.mgBag.length > 1 && G.mgBag[0] === G.lastMg) G.mgBag.push(G.mgBag.shift());
    }
    const id = G.mgBag.shift();
    G.lastMg = id;
    return { mg: usable.find((x) => x.id === id) || usable[0], pool: usable };
  }

  async function minigameRound() {
    G.phase = 'minigame';
    G.cur = null;
    refreshHud();
    const parts = participantsFor();
    if (!parts.length) return;
    const { mg, pool } = chooseMinigame(parts.length);
    G.mgCount++;
    log(`minigame:${mg.id}`);
    cam.set(world.center, { dist: 58, pitch: 0.95, yaw: 0, stiff: 1.4 });
    waitAll('Minigame time!');
    await hud.banner('MINIGAME TIME!', 1300, rt.speed);
    // Roulette
    const m = hud.modal('<div class="pb-tag">Minigame</div><h1>Which game is next?</h1>');
    const names = pool.map((x) => escapeHtml(x.name));
    await rt.guard(hud.roulette(m.el, names, Math.max(0, pool.indexOf(mg)), { speed: rt.speed, spins: pool.length > 1 ? 2 : 1 }));
    await W(600);
    // Instruction card + READY check (TV and phones)
    const plist = parts.map((pid) => ctx.player(pid)).filter(Boolean);
    const ready = new Set();
    const timeLimit = 12000 / rt.speed;
    const t0 = Date.now();
    const portraitOf = (pid) => pieceOf(pid)?.portrait || '';
    const card = () => `<div class="pb-tag">${mg.mode === 'teams' ? 'Team game' : mg.mode === 'coop' ? 'Co-op' : 'Free for all'}</div><h1>${escapeHtml(mg.name)}</h1>
      <p>${mg.instructions || ''}</p>${controlsDiagram(mg.controls)}
      <div class="pb-ready">${plist.map((pp) => chip(pp, ready.has(pp.id), portraitOf(pp.id))).join('')}</div>
      <div class="pb-timer"><div></div></div><p style="color:var(--sub);font-size:clamp(13px,1.2vw,22px)">Tap <b>READY</b> on your phone</p>`;
    const syncBar = () => {
      const b = m.el.querySelector('.pb-timer div');
      if (!b) return;
      const left = Math.max(0, timeLimit - (Date.now() - t0));
      b.style.transition = 'none';
      b.style.width = `${(left / timeLimit) * 100}%`;
      requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transition = `width ${left / 1000}s linear`; b.style.width = '0%'; }));
    };
    m.set(card());
    syncBar();
    const introState = (extra = {}) => ({ view: 'mgIntro', name: mg.name, instructions: mg.instructions, controls: mg.controls || {}, mode: mg.mode, deadline: t0 + timeLimit, total: timeLimit, ...extra });
    for (const pid of allPids()) {
      if (parts.includes(pid)) setPhone(pid, introState());
      else if (pieceOf(pid)) setPhone(pid, { view: 'wait', text: `<b>${escapeHtml(mg.name)}</b><br>A teammate plays this one for your team. Cheer them on!` });
    }
    await new Promise((res) => {
      const check = () => {
        const allReady = plist.every((pp) => ready.has(pp.id) || !connected(pp.id));
        if (allReady || Date.now() - t0 > timeLimit) { stop(); readyHandler = null; res(); }
      };
      readyHandler = (pid) => {
        if (!parts.includes(pid) || ready.has(pid)) return;
        ready.add(pid);
        sfx.play('blip');
        m.set(card());
        syncBar();
        setPhone(pid, introState({ ready: true }));
        check();
      };
      const stop = rt.interval(check, 200);
    });
    await W(400);
    m.close();
    const scores = await runMinigame(mg, parts);
    await minigameResults(mg, parts, scores);
    G.phase = 'turns';
  }

  async function runMinigame(mg, parts) {
    mgRun++;
    const run = mgRun;
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;inset:0;z-index:15;overflow:hidden;background:#000';
    ctx.container.appendChild(container);
    mgContainer = container;
    hud.show(false);
    boardPaused = true;
    stage.renderer.render = () => {}; // pause the board render loop while the minigame runs
    mgBus.clear();
    mgLeave.clear();
    const input = trackInput({ onMessage: (fn) => mgBus.add(fn), onLeave: (fn) => mgLeave.add(fn) });
    const ac = new AbortController();
    mgAbort = ac;
    let teams = null;
    if (mg.mode === 'teams') {
      const order = rng.shuffle(G.pieces.filter((p) => p.members.some((id) => parts.includes(id))));
      teams = [[], []];
      order.forEach((p, i) => teams[i % 2].push(...p.members.filter((id) => parts.includes(id))));
    }
    for (const pid of parts) setPhone(pid, { view: 'mgPlay', run, name: mg.name, controls: mg.controls || {} });
    const env = {
      container,
      players: parts.map((pid) => ctx.player(pid)).filter(Boolean),
      teams,
      input,
      portraits: Object.fromEntries(parts.map((pid) => [pid, pieceOf(pid)?.portrait || ''])),
      send: (pid, d) => {
        if (d?.type === 'vibrate') ctx.vibrate(pid, d.pattern ?? d.ms ?? 40);
        else ctx.send(pid, { type: 'mgmsg', run, d });
      },
      sharedAsset: ctx.sharedAsset,
      signal: ac.signal,
    };
    let scores = {};
    let timer = 0;
    try {
      const limit = ((mg.duration || 60) + 40) * 1000;
      scores = await Promise.race([
        Promise.resolve().then(() => mg.run(env)),
        new Promise((res) => { timer = setTimeout(() => { console.warn(`minigame ${mg.id} timed out`); ac.abort(); res(null); }, limit); }),
      ]) || {};
    } catch (err) {
      console.error('minigame crashed', mg.id, err);
      scores = {};
    }
    clearTimeout(timer);
    if (destroyed) return new Promise(() => {});
    if (!ac.signal.aborted) ac.abort();
    mgAbort = null;
    mgBus.clear();
    mgLeave.clear();
    container.remove();
    mgContainer = null;
    stage.renderer.render = origRender;
    boardPaused = false;
    hud.show(true);
    return scores;
  }

  async function minigameResults(mg, parts, scores) {
    // Per-piece score: average of its participating members.
    const rows = G.pieces.map((p) => {
      const ms = p.members.filter((id) => parts.includes(id));
      const vals = ms.map((id) => Number(scores?.[id])).filter((v) => Number.isFinite(v));
      return { p, score: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, played: ms.length > 0 };
    }).filter((r) => r.played);
    rows.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
    let place = 0;
    rows.forEach((r, i) => {
      if (i === 0 || r.score !== rows[i - 1].score) place = i + 1;
      r.place = place;
      r.reward = r.score == null ? 0 : MG_REWARDS[place - 1] ?? 1;
    });
    // Everybody tied (e.g. a dead-even tug of war): a small consolation instead of 1st-place coins for all.
    if (rows.length > 1 && rows.every((r) => r.score === rows[0].score)) rows.forEach((r) => { r.reward = r.score == null ? 0 : 3; });
    cam.set(world.center, { dist: 50, pitch: 0.9, yaw: 0, stiff: 1.4 });
    const m = hud.modal(`<div class="pb-tag">${escapeHtml(mg.name)}</div><h1>Results</h1><div class="pb-rows">${rows.map((r, i) => `
      <div class="pb-row ${r.place === 1 ? 'first' : ''}" style="--c:${r.p.color};animation-delay:${i * 0.12}s"><span class="pl">${ordinal(r.place)}</span>${ptr(r.p)}
      <span class="nm">${escapeHtml(pieceName(r.p))}</span><span class="gain">+${r.reward} ${COIN}</span></div>`).join('')}</div>`);
    sfx.play('win');
    for (const r of rows) {
      for (const pid of r.p.members) {
        if (parts.includes(pid) || pieceOf(pid) === r.p) setPhone(pid, { view: 'mgResult', place: r.place, of: rows.length, reward: r.reward, name: mg.name });
        vibrate(pid, r.place === 1 ? 'win' : 'tap');
      }
    }
    await W(2300);
    for (const r of rows) {
      if (!r.reward) continue;
      r.p.stats.mg += r.reward;
      const rowEl = m.el.querySelectorAll('.pb-row')[rows.indexOf(r)];
      const rr = rowEl?.getBoundingClientRect();
      const host = ctx.container.getBoundingClientRect();
      const x = rr ? rr.right - host.left - 60 : 0;
      const y = rr ? rr.top - host.top + rr.height / 2 : 0;
      const before = r.p.coins;
      r.p.coins += r.reward;
      r.p.stats.maxCoins = Math.max(r.p.stats.maxCoins, r.p.coins);
      const n = Math.min(r.reward, 6);
      r.p.shownCoins = before;
      hud.fly(x, y, r.p.idx, n, COIN, (i) => {
        r.p.shownCoins = i === n - 1 ? null : before + Math.round((r.reward * (i + 1)) / n);
        hud.bumpCoins(r.p.idx, r.p.shownCoins ?? r.p.coins);
        sfx.play('coin');
      }, rt.speed);
      await W(260);
    }
    await W(1400);
    refreshHud();
    refreshPhones();
    m.close();
  }

  // ------------------------------------------------------------------ end of game
  async function endGame() {
    G.phase = 'end';
    G.cur = null;
    refreshHud();
    waitAll('That was the last turn! Watch the TV for the bonus stars…');
    cam.set(world.center, { dist: 52, pitch: 0.85, yaw: 0, stiff: 1.2 });
    await hud.banner('That\'s the last turn!', 1800, rt.speed);
    const bonuses = [
      { name: 'Minigame Star', desc: 'Won the most coins in minigames', key: (p) => p.stats.mg },
      { name: 'Coin Star', desc: 'Held the most coins at one time', key: (p) => p.stats.maxCoins },
      { name: 'Happening Star', desc: 'Landed on the most Happening spaces', key: (p) => p.stats.events },
    ];
    const drum = `<p class="pb-big"><i class="si" style="animation:pbDrum .5s ease-in-out infinite alternate;display:inline-block"></i></p><style>@keyframes pbDrum{to{transform:scale(1.25) rotate(18deg)}}</style>`;
    const m = hud.modal(`<div class="pb-tag">Bonus stars</div><h1>Three extra Stars</h1><h2>are up for grabs…</h2>${drum}`);
    await W(2000);
    for (const b of bonuses) {
      m.set(`<div class="pb-tag">Bonus star</div><h1>${b.name}</h1><h2>${b.desc}</h2>${drum}`);
      for (let i = 0; i < 8; i++) { sfx.play('tick'); await W(160); }
      const best = Math.max(...G.pieces.map(b.key));
      const winners = best > 0 ? G.pieces.filter((p) => b.key(p) === best) : [];
      if (!winners.length) {
        m.set(`<div class="pb-tag">Bonus star</div><h1>${b.name}</h1><h2>Nobody earned this one!</h2>`);
        await W(1600);
        continue;
      }
      m.set(`<div class="pb-tag">Bonus star</div><h1>${b.name}</h1><h2>${b.desc} (${best})</h2>
        <div class="pb-vs">${winners.map((w) => `<div class="side win" style="--c:${w.color}">${ptr(w, 'big')}${escapeHtml(pieceName(w))}</div>`).join('')}</div><p>+1 ${STAR}</p>`);
      sfx.play('win');
      hud.flash();
      for (const w of winners) {
        w.stars++;
        particles.sparkle(headPos(w), 14);
        w.obj.anim.play('win');
        w.members.forEach((pid) => vibrate(pid, 'success'));
      }
      refreshHud();
      refreshPhones();
      await W(2600);
      for (const w of winners) w.obj.anim.play('idle');
    }
    const ranked = [...G.pieces].sort((a, b) => b.stars - a.stars || b.coins - a.coins);
    const win = ranked[0];
    m.set(`<div class="pb-tag">The winner</div><h1>And the Party Star is…</h1>${drum}`);
    for (let i = 0; i < 12; i++) { sfx.play('tick'); await W(140); }
    m.close();
    // Winner celebration on the board
    for (const p of G.pieces) p.obj.anim.play(p === win ? 'win' : 'sad');
    cam.set(win.obj.root, { dist: 8.5, pitch: 0.35, yaw: 0, stiff: 1.8 });
    win.members.forEach((pid) => vibrate(pid, 'win'));
    G.pieces.filter((p) => p !== win).forEach((p) => p.members.forEach((pid) => vibrate(pid, 'lose')));
    await hud.banner(`${escapeHtml(pieceName(win))}!<small>${win.stars} ${STAR} · ${win.coins} ${COIN}</small>`, 2400, rt.speed);
    sfx.play('win');
    for (let i = 0; i < 3; i++) {
      particles.confetti(win.obj.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 120);
      cam.shake(0.25);
      await W(500);
    }
    await W(1500);
    const rows = [];
    for (const p of ranked) {
      for (const pid of p.members) {
        const pl = ctx.player(pid);
        if (pl) rows.push({ player: pl, score: `${p.stars} ${p.stars === 1 ? 'star' : 'stars'} · ${p.coins} coins`, label: p.members.length > 1 ? `(${pieceName(p)})` : '' });
      }
    }
    log('results');
    if (!rows.length) return 'menu';
    return ctx.showResults(rows, { title: 'Party Board', subtitle: `${pieceName(win)} is the Party Star!` });
  }

  // ------------------------------------------------------------------ main flow
  async function runGame() {
    G = newState();
    phone.clear();
    hud.setTurn(0, 0);
    hud.setFrenzy(false);
    world.setFrenzy(false);
    world.setStar(-1);
    // Setup: admin picks the length; others wait. Board slowly orbits.
    cam.set(world.center, { dist: 62, pitch: 0.9, yaw: 0, snap: true });
    let orbit = true;
    const orbitFn = (dt) => { if (orbit) cam.goal.yaw += dt * 0.06; };
    extras.add(orbitFn);
    hud.renderCards([]);
    let turns = DEBUG.turns;
    if (!turns || DEBUG.setup) {
      const m = hud.modal(setupSheet());
      refreshSetup();
      const r = await new Promise((res) => {
        setupResolve = res;
        rt.timeout(() => res({ turns: 10 }), 90000);
      });
      setupResolve = null;
      turns = DEBUG.turns || (LENGTHS.some((l) => l.turns === Number(r.turns)) ? Number(r.turns) : 10);
      m.close();
    }
    orbit = false;
    extras.delete(orbitFn);
    cam.goal.yaw = 0;
    G.maxTurns = turns;
    // Pieces: up to 8; more players share pieces as teams.
    const players = ctx.players();
    const nPieces = Math.max(1, Math.min(MAX_PIECES, players.length));
    const groups = Array.from({ length: nPieces }, () => []);
    players.forEach((pl, i) => groups[i % nPieces].push(pl.id));
    for (const g of groups) if (g.length) await makePiece(g);
    if (!G.pieces.length) await makePiece([]);
    G.pieces.forEach((p) => p.obj.root.position.copy(world.spacePos(0)));
    arrange(null, true);
    G.phase = 'intro';
    waitAll('Welcome to Party Board!');
    await intro();
    await rollOrder();
    G.phase = 'turns';
    for (let turn = 1; turn <= G.maxTurns; turn++) {
      G.turn = turn;
      await addPending();
      refreshHud();
      refreshPhones();
      if (frenzyLen() && turn === G.maxTurns - frenzyLen() + 1) {
        world.setFrenzy(true);
        hud.setFrenzy(true);
        sfx.play('powerup');
        cam.shake(0.5);
        ctx.vibrate('all', 'boost');
        log('frenzy');
        await hud.banner(`FINAL FRENZY!<small>Last ${frenzyLen()} turns · Blue +6 · Red −5</small>`, 2600, rt.speed);
      } else {
        await hud.banner(turn === G.maxTurns ? 'LAST TURN!' : `Turn ${turn}`, 1100, rt.speed);
      }
      for (const idx of [...G.order]) {
        const p = G.pieces[idx];
        if (p) await playTurn(p);
      }
      await minigameRound();
    }
    const choice = await endGame();
    if (choice === 'again' && !destroyed) {
      for (const p of G.pieces) p.obj.dispose();
      rt.kill();
      rt = makeRuntime(DEBUG.fast);
      rng = makeRng(DEBUG.seed ?? undefined);
      asks.clear();
      extras.clear();
      hud.hideCaption();
      runGame().catch((err) => console.error('party-board flow error', err));
    }
  }

  // ------------------------------------------------------------------ networking
  ctx.onMessage((pid, msg) => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'hello':
        sendArt(pid, true);
        if (G?.phase === 'setup') refreshSetup();
        else sendState(pid);
        break;
      case 'answer': {
        const a = asks.get(msg.token);
        if (a && a.pids.includes(pid)) a.done(msg);
        break;
      }
      case 'setup':
        if (pid === ctx.adminId && setupResolve) { sfx.play('click'); setupResolve(msg); }
        break;
      case 'ready':
        readyHandler?.(pid);
        break;
      case 'press':
        duelHandler?.(pid, msg);
        break;
      case 'mg':
        if (msg.run === mgRun && boardPaused) for (const fn of mgBus) fn(pid, msg.d);
        break;
      default:
    }
  });

  ctx.onJoin((p, { rejoin } = {}) => {
    if (!G) return;
    if (G.phase === 'setup') { refreshSetup(); return; }
    if (pieceOf(p.id) || G.pending.includes(p.id)) { sendState(p.id); refreshHud(); return; }
    if (rejoin && phone.has(p.id)) { sendState(p.id); return; }
    if (G.pieces.length < MAX_PIECES) {
      G.pending.push(p.id);
      setPhone(p.id, { view: 'wait', text: 'Welcome! You\'ll hop onto the board at the start of the next turn.' });
    } else addToTeam(p.id);
  });

  ctx.onLeave((p) => {
    mgLeave.forEach((fn) => fn(p));
    if (!G) return;
    if (G.phase === 'setup') refreshSetup();
    refreshHud();
  });

  // Test hook (read-only state for automated tests)
  window.__pb = {
    get phase() { return G?.phase; },
    get turn() { return G?.turn; },
    get maxTurns() { return G?.maxTurns; },
    get cur() { return G?.cur; },
    get log() { return G ? [...G.log] : []; },
    get pieces() { return G?.pieces.map((p) => ({ name: pieceName(p), coins: p.coins, stars: p.stars, space: p.space, members: p.members.length, items: p.items })); },
    get minigame() { return boardPaused; },
  };

  runGame().catch((err) => console.error('party-board flow error', err));

  return {
    destroy() {
      destroyed = true;
      rt.kill();
      mgAbort?.abort();
      mgContainer?.remove();
      stage.renderer.render = origRender;
      extras.clear();
      if (G) for (const p of G.pieces) p.obj?.dispose();
      hud.destroy();
      stage.dispose();
      if (window.__pb) delete window.__pb;
    },
  };
}
