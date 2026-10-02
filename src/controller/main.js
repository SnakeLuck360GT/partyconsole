import './controller.css';
import { connectToHost } from '../net/transport.js';
import { getGame } from '../games/registry.js';
import * as kit from '../sdk/controller-kit.js';
import { escapeHtml } from '../sdk/screen-kit.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

function storage(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch { /* private mode */ }
  return null;
}

let clientId = sessionStorage.getItem('pc-client') || storage('pc-client');
// Each tab is its own player when testing locally (?local=1); on a phone the id survives reloads for reconnects.
if (!clientId || params.has('local') || params.has('fresh')) clientId = Math.random().toString(36).slice(2, 12);
try { sessionStorage.setItem('pc-client', clientId); } catch { /* noop */ }
if (!params.has('local')) storage('pc-client', clientId);

let conn = null;
let room = '';
let me = null;
let adminId = null;
let gamesList = [];
let currentGame = null; // { id, instance, handlers }
let wantConnected = false;
let loadToken = 0;

// ------------------------------------------------------------------ views

function show(view) {
  for (const v of ['join', 'lobby', 'play', 'reconnect']) $(`#view-${v}`).hidden = v !== view;
  document.body.dataset.view = view;
  updateLayout();
}

const initials = (name) => (name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
const ordinal = (n) => `${n}<sup>${['th', 'st', 'nd', 'rd'][(n % 100 >= 11 && n % 100 <= 13) ? 0 : Math.min(n % 10, 4) % 4] || 'th'}</sup>`;

function setHeader() {
  if (!me) return;
  $('#me-avatar').textContent = initials(me.name);
  $('#me-avatar').style.background = me.color;
  $('#me-name').textContent = me.name;
  document.documentElement.style.setProperty('--me', me.color);
  $('#menu-btn').hidden = !(me.id === adminId && currentGame);
  const support = kit.hapticsSupport();
  const on = kit.hapticsEnabled() && support !== 'none';
  $('#vibe-btn').classList.toggle('off', !on);
  $('#vibe-btn').disabled = support === 'none';
  const label = support === 'ios' ? 'Flash' : 'Haptics';
  $('#vibe-btn span').textContent = support === 'none' ? 'No haptics' : `${label} ${on ? 'on' : 'off'}`;
}

function renderLobby() {
  if (currentGame) return;
  show('lobby');
  const isAdmin = me && me.id === adminId;
  $('#lobby-status').innerHTML = `<div>${isAdmin ? 'Pick a game' : 'You\'re in'}</div>`;
  const list = $('#lobby-games');
  list.hidden = !isAdmin;
  const sub = isAdmin
    ? '<p class="lobby-sub">You\'re the host. Everyone else follows your pick.</p>'
    : '<div class="waiting"><span class="pulse-dot"></span>Waiting for the host to pick a game</div>';
  $('#lobby-status').insertAdjacentHTML('beforeend', sub);
  if (isAdmin) {
    list.innerHTML = gamesList.map((g) => `
      <button class="lobby-game" data-id="${g.id}" style="--g:${g.color || '#5c6cff'}">
        <span class="lg-art">${escapeHtml(g.name[0])}<img src="${import.meta.env.BASE_URL}assets/${g.id}/cover.jpg" alt="" onerror="this.remove()"></span>
        <span class="lg-text"><b>${escapeHtml(g.name)}</b><small>${escapeHtml(g.tagline || '')}</small></span>
        <span class="lg-go">›</span>
      </button>`).join('');
    list.querySelectorAll('.lobby-game').forEach((b) => {
      b.addEventListener('click', () => { kit.vibrate('select'); conn?.send({ t: 'pick', game: b.dataset.id }); });
      b.addEventListener('pointerenter', () => conn?.send({ t: 'lobbyNav', game: b.dataset.id }));
      b.addEventListener('focus', () => conn?.send({ t: 'lobbyNav', game: b.dataset.id }));
    });
  }
}

// ------------------------------------------------------------------ orientation
// Games declare meta.orientation = 'landscape' | 'portrait' | 'any'.
// Android: fullscreen + screen.orientation.lock() (needs a tap, re-requested on the next tap after reloads).
// iOS can't lock, so for landscape games held in portrait we rotate the whole page 90° (body[data-vrot]),
// which keeps the controller visually fixed while you tilt-steer. body[data-layout] is the effective layout;
// game CSS should use it instead of @media (orientation).

const isTouch = matchMedia('(pointer: coarse)').matches;
let lastLandscapeAngle = 90;

function osAngle() {
  const a = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
}

function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return Promise.resolve();
  // iPhone Safari has no element fullscreen. Only do it on touch devices where lock() exists (Android).
  if (!screen.orientation?.lock || !isTouch) return Promise.resolve();
  return el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

function applyOrientation(want) {
  document.body.dataset.orient = want || 'any';
  const o = screen.orientation;
  if (o?.lock) {
    if (want === 'landscape' || want === 'portrait') o.lock(want).catch(() => { /* needs fullscreen */ });
    else o.unlock?.();
  }
  updateLayout();
}

const isTextField = (el) => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(el.type)));

function updateLayout() {
  const b = document.body;
  // The on-screen keyboard shrinks the viewport (often below its width), which would flip a portrait controller
  // into the landscape layout mid-typing. Keep the current layout until the field loses focus.
  if (isTouch && b.dataset.layout && isTextField(document.activeElement)) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const portrait = h > w;
  const a = osAngle();
  if (!portrait && (a === 90 || a === 270)) lastLandscapeAngle = a;
  const rotate = isTouch && portrait && b.dataset.orient === 'landscape' && b.dataset.view === 'play';
  if (rotate) {
    b.style.setProperty('--vw', `${w}px`);
    b.style.setProperty('--vh', `${h}px`);
    b.dataset.vrot = lastLandscapeAngle === 270 ? '-90' : '90';
  } else {
    delete b.dataset.vrot;
  }
  b.dataset.layout = portrait && !rotate ? 'portrait' : 'landscape';
}

window.addEventListener('resize', updateLayout);
screen.orientation?.addEventListener?.('change', updateLayout);
window.addEventListener('orientationchange', () => setTimeout(updateLayout, 50));

// Fullscreen gets dropped by reloads/app switches; re-enter on the next tap while playing (Android).
document.addEventListener('pointerdown', () => {
  if (!wantConnected || document.fullscreenElement) return;
  enterFullscreen().then(() => { if (currentGame) applyOrientation(getGame(currentGame.id)?.orientation); });
}, true);

// iOS: real fullscreen only exists for home-screen web apps.
function iosTip() {
  const ios = /iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!ios || navigator.standalone) return;
  const tip = document.createElement('div');
  tip.className = 'ios-tip';
  tip.innerHTML = '📲 For fullscreen: tap <b>Share</b> → <b>Add to Home Screen</b>,<br>then open PartyConsole from your home screen.';
  document.querySelector('.join-card')?.appendChild(tip);
}

// ------------------------------------------------------------------ connection

async function join(code, name) {
  room = code.toUpperCase().trim();
  storage('pc-name', name);
  storage('pc-room', room);
  wantConnected = true;
  $('#join-error').textContent = '';
  $('#join-btn').disabled = true;
  $('#join-btn').textContent = 'Connecting…';
  try {
    conn = await connectToHost(room);
  } catch (err) {
    $('#join-error').textContent = err.message === 'Room not found' ? `Room ${room} not found. Check the code on the TV.` : `Couldn't connect: ${err.message}`;
    $('#join-btn').disabled = false;
    $('#join-btn').textContent = 'Join';
    wantConnected = false;
    return false;
  }
  $('#join-btn').disabled = false;
  $('#join-btn').textContent = 'Join';
  conn.onData(onMessage);
  conn.onClose(onClose);
  conn.send({ t: 'hello', clientId, name });
  const u = new URL(location.href);
  u.searchParams.set('room', room);
  history.replaceState(null, '', u);
  return true;
}

function onClose() {
  conn = null;
  if (!wantConnected) return;
  show('reconnect');
  reconnectLoop();
}

async function reconnectLoop() {
  for (let i = 0; wantConnected && !conn; i++) {
    $('#reconnect-msg').textContent = i === 0 ? 'Reconnecting…' : `Reconnecting… (attempt ${i + 1})`;
    try {
      conn = await connectToHost(room);
      conn.onData(onMessage);
      conn.onClose(onClose);
      conn.send({ t: 'hello', clientId, name: storage('pc-name') || 'Player' });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, Math.min(1000 * (i + 1), 5000)));
    }
  }
}

function onMessage(msg) {
  switch (msg.t) {
    case 'welcome':
      if (!me) kit.vibrate('success');
      me = msg.you;
      gamesList = msg.games;
      setHeader();
      if (!currentGame) renderLobby();
      else show('play');
      break;
    case 'players':
      me = msg.you;
      adminId = msg.adminId;
      setHeader();
      if (!currentGame) renderLobby();
      break;
    case 'load':
      loadGame(msg.game);
      break;
    case 'lobby':
      unloadGame();
      renderLobby();
      break;
    case 'g':
      currentGame?.handlers.forEach((fn) => { try { fn(msg.d); } catch (err) { console.error(err); } });
      break;
    case 'results':
      showResults(msg.rows);
      break;
    case 'vib':
      kit.vibrate(msg.p);
      break;
    case 'resultsDone':
      $('#results').hidden = true;
      break;
    default:
  }
}

async function loadGame(id) {
  if (currentGame?.id === id) { show('play'); return; }
  unloadGame();
  const game = getGame(id);
  if (!game) return;
  applyOrientation(game.orientation);
  const token = ++loadToken;
  show('play');
  const container = $('#play-area');
  container.innerHTML = '<div class="pk-message">Loading…</div>';
  const handlers = new Set();
  currentGame = { id, instance: null, handlers };
  setHeader();
  const mod = await game.loadController();
  if (token !== loadToken) return;
  container.innerHTML = '';
  const ctx = {
    container,
    player: me,
    meta: game,
    get isAdmin() { return me?.id === adminId; },
    send: (d) => conn?.send({ t: 'g', d }),
    onMessage: (fn) => handlers.add(fn),
    vibrate: kit.vibrate,
    kit,
    asset: (path) => `${import.meta.env.BASE_URL}assets/${game.id}/${path}`,
    sharedAsset: (path) => `${import.meta.env.BASE_URL}assets/shared/${path}`,
  };
  try {
    currentGame.instance = (await mod.default(ctx)) || {};
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="pk-message">Controller error: ${escapeHtml(err.message)}</div>`;
  }
}

function unloadGame() {
  loadToken++;
  if (!currentGame) return;
  try { currentGame.instance?.destroy?.(); } catch (err) { console.error(err); }
  currentGame = null;
  applyOrientation('any');
  $('#play-area').innerHTML = '';
  $('#results').hidden = true;
  setHeader();
}

function showResults(rows) {
  const isAdmin = me?.id === adminId;
  const mine = rows.findIndex((r) => r.name === me?.name && r.color === me?.color);
  $('#results').innerHTML = `
    <div class="res-card">
      <div class="res-place ${mine === 0 ? 'win' : ''}">${mine >= 0 ? ordinal(mine + 1) : 'GG'}</div>
      <div class="res-title">${mine === 0 ? 'You won.' : mine >= 0 ? `out of ${rows.length}` : 'Game over'}</div>
      <ol class="res-list">${rows.slice(0, 8).map((r, i) => `
        <li class="${i === mine ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="dot" style="background:${r.color}"></span><span class="nm">${escapeHtml(r.name)}</span><b>${escapeHtml(r.score)}</b></li>`).join('')}</ol>
      ${isAdmin ? '<button id="res-again" class="big-btn">Play again</button><button id="res-menu" class="big-btn ghost">Choose another game</button>' : '<div class="waiting"><span class="pulse-dot"></span>Waiting for the host</div>'}
    </div>`;
  $('#results').hidden = false;
  kit.vibrate(mine === 0 ? 'win' : 'success');
  if (isAdmin) {
    $('#res-again').onclick = () => conn?.send({ t: 'again' });
    $('#res-menu').onclick = () => conn?.send({ t: 'menu' });
  }
}

// ------------------------------------------------------------------ boot

$('#code-input').value = (params.get('room') || (navigator.standalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ? storage('pc-room') : '') || '').toUpperCase();
iosTip();
$('#name-input').value = storage('pc-name') || '';
$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#code-input').value.trim();
  const name = $('#name-input').value.trim() || 'Player';
  if (code.length < 4) { $('#join-error').textContent = 'Enter the 4-letter code shown on the TV.'; return; }
  enterFullscreen();
  join(code, name);
});
$('#code-input').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('#vibe-btn').addEventListener('click', () => {
  kit.setHaptics(!kit.hapticsEnabled());
  // Turning it on plays an obvious test pattern so you can feel whether your phone supports it.
  const res = kit.hapticsEnabled() ? kit.vibrate([60, 80, 60, 80, 160]) : 'off';
  setHeader();
  if (res === 'blocked') $('#vibe-btn span').textContent = 'Blocked by browser';
  if (res === 'unsupported') $('#vibe-btn span').textContent = 'Not supported';
});
$('#menu-btn').addEventListener('click', () => {
  if (confirm('Quit to the game menu for everyone?')) conn?.send({ t: 'menu' });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentGame) applyOrientation(getGame(currentGame.id)?.orientation);
  if (document.visibilityState === 'visible' && wantConnected && !conn) reconnectLoop();
});
// Block pinch-zoom / double-tap zoom / context menus. iOS Safari ignores user-scalable=no, so pinches are stopped
// here (gesture* is iOS-only; multi-touch touchmove covers the rest). Double-tap zoom is off via touch-action.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());
// After the keyboard closes, iOS can leave the page scrolled/offset; snap back and re-check the layout.
document.addEventListener('focusout', () => setTimeout(() => {
  if (isTextField(document.activeElement)) return;
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  updateLayout();
}, 60));

show('join');
if (params.get('room') && storage('pc-name') && params.has('autojoin')) join(params.get('room'), storage('pc-name'));
else if (params.get('room')) $('#name-input').focus();

// Exposed for automated smoke tests only.
window.__party = { join, get me() { return me; }, get game() { return currentGame?.id ?? null; } };
