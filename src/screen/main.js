import './screen.css';
import QRCode from 'qrcode';
import { createHost, isCodeTaken, transportMode } from '../net/transport.js';
import { games, getGame, gameSummaries } from '../games/registry.js';
import { playerColor, colorToHex, AVATARS } from '../sdk/colors.js';
import { sfx, unlockAudio } from '../sdk/audio.js';
import { escapeHtml } from '../sdk/screen-kit.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ state

/** @type {Map<string, Player>} keyed by stable clientId */
const players = new Map();
let nextIndex = 0;
let adminId = null;
let host = null;
let roomCode = '';
let current = null; // { game, instance, handlers, container }
let resultsPending = null;

function makeCode() {
  if (params.get('room')) return params.get('room').toUpperCase();
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

function connected() {
  return [...players.values()].filter((p) => p.connected).sort((a, b) => a.index - b.index);
}

function publicPlayer(p) {
  return {
    id: p.id, name: p.name, color: p.color, colorHex: p.colorHex, avatar: p.avatar,
    index: p.index, isAdmin: p.id === adminId, connected: p.connected,
  };
}

function send(id, msg) { players.get(id)?.conn?.send(msg); }
function broadcast(msg) { for (const p of players.values()) if (p.connected) p.conn.send(msg); }

function pickAdmin() {
  const c = connected();
  if (!c.find((p) => p.id === adminId)) adminId = c[0]?.id ?? null;
}

function syncLobby() {
  pickAdmin();
  const list = connected().map(publicPlayer);
  for (const p of connected()) {
    p.conn.send({ t: 'players', players: list, you: publicPlayer(p), adminId });
  }
  renderPlayers();
}

// ------------------------------------------------------------------ networking

async function startHost() {
  for (let attempt = 0; attempt < 6; attempt++) {
    roomCode = makeCode();
    try {
      host = await createHost(roomCode);
      break;
    } catch (err) {
      if (!isCodeTaken(err) || params.get('room')) {
        showFatal(`Couldn't open a room (${escapeHtml(err.type || err.message)}). Check your internet connection and reload.`);
        return;
      }
    }
  }
  host.onConnection(onConnection);
  renderRoom();
}

function onConnection(conn) {
  let playerId = null;
  conn.onData((msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      playerId = handleHello(conn, msg);
      return;
    }
    if (!playerId) return;
    handleMessage(playerId, msg);
  });
  conn.onClose(() => {
    if (!playerId) return;
    const p = players.get(playerId);
    if (!p || p.conn !== conn) return; // already replaced by a reconnect
    p.connected = false;
    p.conn = null;
    current?.handlers.leave.forEach((fn) => safe(() => fn(publicPlayer(p))));
    syncLobby();
  });
}

function handleHello(conn, msg) {
  const id = String(msg.clientId || Math.random().toString(36).slice(2)).slice(0, 40);
  const name = String(msg.name || 'Player').trim().slice(0, 16) || 'Player';
  let p = players.get(id);
  const rejoin = !!p;
  if (!p) {
    const index = nextIndex++;
    const color = playerColor(index);
    p = { id, index, color, colorHex: colorToHex(color), avatar: AVATARS[index % AVATARS.length] };
    players.set(id, p);
  }
  if (p.conn && p.conn !== conn) p.conn._emitClose?.();
  p.name = name;
  p.conn = conn;
  p.connected = true;
  sfx.play('join');
  conn.send({ t: 'welcome', room: roomCode, you: publicPlayer(p), games: gameSummaries() });
  syncLobby();
  if (current) {
    conn.send({ t: 'load', game: current.game.id });
    current.handlers.join.forEach((fn) => safe(() => fn(publicPlayer(p), { rejoin })));
    if (resultsPending) conn.send({ t: 'results', rows: resultsPending.rows });
  }
  return id;
}

function handleMessage(id, msg) {
  const isAdmin = id === adminId;
  switch (msg.t) {
    case 'g':
      if (current) current.handlers.message.forEach((fn) => safe(() => fn(id, msg.d)));
      break;
    case 'pick':
      if (isAdmin && !current) loadGame(msg.game);
      break;
    case 'menu':
      if (isAdmin) exitGame();
      break;
    case 'again':
      if (isAdmin && resultsPending) resolveResults('again');
      break;
    case 'lobbyNav':
      if (isAdmin && !current) highlightGame(msg.game);
      break;
    default:
  }
}

function safe(fn) {
  try { fn(); } catch (err) { console.error(err); }
}

// ------------------------------------------------------------------ game lifecycle

// Every WebGL context created while a game runs is tracked and force-released when the game exits,
// even if the game crashed or forgot to dispose. Otherwise leaked contexts hit the browser cap (~16)
// and later games fail with "Error creating WebGL context".
const gameGLContexts = new Set();
const origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
  const gl = origGetContext.call(this, type, ...rest);
  if (gl && current && /webgl/.test(type)) gameGLContexts.add(gl);
  return gl;
};
function releaseGameGL() {
  for (const gl of gameGLContexts) {
    try { if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ }
  }
  gameGLContexts.clear();
}

async function loadGame(id) {
  const game = getGame(id);
  if (!game || current) return;
  const count = connected().length;
  if (count < (game.minPlayers || 1)) {
    toast(`${game.name} needs at least ${game.minPlayers} players`);
    return;
  }
  const handlers = { message: new Set(), join: new Set(), leave: new Set() };
  const container = document.createElement('div');
  container.className = 'game-container';
  $('#game').appendChild(container);
  current = { game, instance: null, handlers, container };
  document.body.classList.add('in-game');
  $('#game-loading').innerHTML = `<div class="spinner"></div><div>${escapeHtml(game.name)}</div>`;
  $('#game-loading').hidden = false;
  broadcast({ t: 'load', game: game.id });

  const ctx = {
    container,
    meta: game,
    roomCode,
    players: () => connected().map(publicPlayer),
    allPlayers: () => [...players.values()].map(publicPlayer),
    player: (pid) => (players.has(pid) ? publicPlayer(players.get(pid)) : null),
    send: (pid, data) => send(pid, { t: 'g', d: data }),
    broadcast: (data) => broadcast({ t: 'g', d: data }),
    // Haptics on phones: pattern = preset name ('hit', 'explosion', 'win', …; see HAPTICS in controller-kit), ms, or [on, off, on…].
    vibrate: (pid, pattern = 'bump') => (pid === 'all' ? broadcast({ t: 'vib', p: pattern }) : send(pid, { t: 'vib', p: pattern })),
    onMessage: (fn) => handlers.message.add(fn),
    onJoin: (fn) => handlers.join.add(fn),
    onLeave: (fn) => handlers.leave.add(fn),
    asset: (path) => `${import.meta.env.BASE_URL}assets/${game.id}/${path}`,
    sharedAsset: (path) => `${import.meta.env.BASE_URL}assets/shared/${path}`,
    showResults: (rows, opts) => showResults(rows, opts),
    exit: () => exitGame(),
    get adminId() { return adminId; },
  };
  try {
    const mod = await game.loadScreen();
    if (current?.container !== container) return;
    current.instance = (await mod.default(ctx)) || {};
  } catch (err) {
    console.error(err);
    toast(`${game.name} crashed: ${err.message}`);
    exitGame();
    return;
  }
  $('#game-loading').hidden = true;
}

function exitGame() {
  if (!current) return;
  const c = current;
  current = null;
  resolveResults('menu');
  try { c.instance?.destroy?.(); } catch (err) { console.error(err); }
  c.container.remove();
  releaseGameGL();
  $('#game-loading').hidden = true;
  $('#results').hidden = true;
  document.body.classList.remove('in-game');
  broadcast({ t: 'lobby' });
  syncLobby();
}

// rows: [{ player (or player id), score, label? }] sorted best-first by the game.
function showResults(rows, { title = 'Results', subtitle = '' } = {}) {
  const norm = rows.map((r) => {
    const p = typeof r.player === 'string' ? players.get(r.player) : r.player;
    return { name: p?.name ?? '?', color: p?.color ?? '#999', avatar: p?.avatar ?? '', initials: initials(p?.name ?? '?'), score: r.score ?? '', label: r.label ?? '' };
  });
  const el = $('#results');
  const podium = norm.slice(0, 3);
  const order = [1, 0, 2].filter((i) => podium[i]);
  el.innerHTML = `
    <div class="results-card">
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="results-sub">${escapeHtml(subtitle)}</p>` : ''}
      <div class="podium">
        ${order.map((i) => `
          <div class="podium-slot place-${i + 1}">
            <div class="podium-avatar" style="--c:${podium[i].color}">${escapeHtml(podium[i].initials)}</div>
            <div class="podium-name">${escapeHtml(podium[i].name)}</div>
            <div class="podium-score">${escapeHtml(podium[i].score)} ${escapeHtml(podium[i].label)}</div>
            <div class="podium-block">${i + 1}</div>
          </div>`).join('')}
      </div>
      ${norm.length > 3 ? `<ol start="4" class="results-rest">${norm.slice(3).map((r) => `
        <li><span class="sk-dot" style="background:${r.color}"></span>${escapeHtml(r.name)} <b>${escapeHtml(r.score)}</b></li>`).join('')}</ol>` : ''}
      <div class="results-buttons"><button id="res-again">Play again</button><button id="res-menu">Back to games</button></div>
    </div>`;
  el.hidden = false;
  sfx.play('win');
  $('#res-again').onclick = () => resolveResults('again');
  $('#res-menu').onclick = () => exitGame();
  broadcast({ t: 'results', rows: norm });
  return new Promise((resolve) => { resultsPending = { rows: norm, resolve }; });
}

function resolveResults(choice) {
  if (!resultsPending) return;
  const r = resultsPending;
  resultsPending = null;
  $('#results').hidden = true;
  broadcast({ t: 'resultsDone' });
  r.resolve(choice);
}

// ------------------------------------------------------------------ UI

function controllerUrl() {
  const base = new URL('controller.html', location.href);
  base.search = '';
  base.searchParams.set('room', roomCode);
  if (transportMode() === 'local') base.searchParams.set('local', '1');
  return base.toString();
}

async function renderRoom() {
  const url = controllerUrl();
  $('#room-code').textContent = roomCode;
  // Netlify serves /play -> controller.html (see netlify.toml); the dev server doesn't, so show the full page there.
  const isDev = ['localhost', '127.0.0.1'].includes(location.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname);
  const page = new URL(isDev ? 'controller.html' : 'play', location.href);
  $('#join-url').textContent = (page.host + page.pathname).replace(/\/$/, '').replace(/\/controller\.html$/, '');
  $('#qr').innerHTML = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#10131a', light: '#ffffff' } });
  $('#qr').title = url;
  $('#mini-code').textContent = roomCode;
  $('#connecting').hidden = true;
}

const seenPlayers = new Set();
const MAX_LISTED = 12;
const initials = (name) => name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

function renderPlayers() {
  const list = connected();
  const shown = list.slice(0, MAX_LISTED);
  $('#players').innerHTML = shown.map((p) => `
    <div class="pl ${seenPlayers.has(p.id) ? '' : 'new'} ${p.id === adminId ? 'host' : ''}" style="--c:${p.color}">
      <span class="pl-av">${escapeHtml(initials(p.name))}</span>
      <span class="pl-name">${escapeHtml(p.name)}</span>
    </div>`).join('') + (list.length > MAX_LISTED ? `<div class="pl more"><span class="pl-av">+${list.length - MAX_LISTED}</span></div>` : '');
  list.forEach((p) => seenPlayers.add(p.id));
  $('#empty-hint').hidden = list.length > 0;
  document.querySelectorAll('.tile').forEach((tile) => {
    const g = getGame(tile.dataset.id);
    tile.classList.toggle('unavailable', list.length < (g.minPlayers || 1));
  });
  updateHero();
}

// ---------------------------------------------------------------- shelf
let focusedId = null;
const coverUrl = (g) => `${import.meta.env.BASE_URL}assets/${g.id}/cover.jpg`;

function renderGames() {
  $('#games').innerHTML = games.map((g) => `
    <button class="tile" data-id="${g.id}" style="--g:${g.color || '#5c6cff'}" aria-label="${escapeHtml(g.name)}">
      <span class="tile-fallback">${escapeHtml(g.name)}</span>
      <img class="tile-art" src="${coverUrl(g)}" alt="" loading="lazy">
    </button>`).join('') || '<p class="no-games">No games installed yet.</p>';
  document.querySelectorAll('.tile').forEach((tile) => {
    tile.querySelector('img').addEventListener('error', (e) => e.target.remove()); // no cover yet → coloured fallback
    tile.addEventListener('mouseenter', () => focusGame(tile.dataset.id, { sound: false, scroll: false }));
    tile.addEventListener('focus', () => focusGame(tile.dataset.id, { sound: false }));
    tile.addEventListener('click', () => { unlockAudio(); loadGame(tile.dataset.id); });
  });
  if (games.length) focusGame(games[0].id, { sound: false, scroll: false });
}

function focusGame(id, { sound = true, scroll = true } = {}) {
  if (!getGame(id) || id === focusedId) return;
  focusedId = id;
  document.querySelectorAll('.tile').forEach((t) => t.classList.toggle('focused', t.dataset.id === id));
  const tile = document.querySelector(`.tile[data-id="${id}"]`);
  if (scroll) tile?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  if (sound) sfx.play('tick');
  updateHero();
}

function updateHero() {
  const g = getGame(focusedId);
  if (!g) return;
  $('#hero-title').textContent = g.name;
  const need = (g.minPlayers || 1) - connected().length;
  $('#hero-meta').textContent = need > 0 ? `Needs ${g.minPlayers} player${g.minPlayers === 1 ? '' : 's'}` : '';
  $('#hero-play').disabled = need > 0;
}

function moveFocus(dir) {
  if (!games.length) return;
  const i = Math.max(0, games.findIndex((g) => g.id === focusedId));
  focusGame(games[(i + dir + games.length) % games.length].id);
}

function highlightGame(id) {
  focusGame(id);
}

const ICON_SOUND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

function showFatal(html) {
  $('#connecting').innerHTML = `<div class="fatal">${html}</div>`;
  $('#connecting').hidden = false;
}

// ------------------------------------------------------------------ boot

document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });
$('#fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});
$('#mute').innerHTML = ICON_SOUND_ON;
$('#mute').addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  $('#mute').innerHTML = sfx.muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
});
$('#hero-play').addEventListener('click', () => { unlockAudio(); if (focusedId) loadGame(focusedId); });
document.addEventListener('keydown', (e) => {
  if (current || resultsPending) return;
  if (e.key === 'ArrowRight') { moveFocus(1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { moveFocus(-1); e.preventDefault(); }
  else if (e.key === 'Enter' && focusedId && !(e.target instanceof HTMLButtonElement)) loadGame(focusedId);
});

$('#exit-game').addEventListener('click', () => exitGame());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current && !document.fullscreenElement) exitGame(); });

renderGames();
renderPlayers();
startHost();

// Exposed for automated smoke tests only.
window.__party = { get roomCode() { return roomCode; }, loadGame, exitGame, players: () => connected().map(publicPlayer), get current() { return current?.game.id ?? null; } };
