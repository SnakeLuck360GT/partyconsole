// Screen-side helpers shared by games: input tracking, countdowns, banners, scoreboards.
// DOM overlays use classes prefixed `sk-` defined in src/screen/screen.css.

import { sfx } from './audio.js';

/**
 * Tracks the latest gamepad state per player (messages sent by controller-kit `gamepad`).
 * const input = trackInput(ctx); input.get(playerId) -> { x, y, b: {a:true}, pressed(id) }
 * `pressed(id)` returns true once per button press (edge-triggered).
 */
export function trackInput(ctx) {
  const states = new Map();
  const blank = () => ({ x: 0, y: 0, b: {}, _edges: new Set() });
  ctx.onMessage((pid, msg) => {
    if (msg?.type !== 'input') return;
    const s = states.get(pid) || blank();
    for (const [k, v] of Object.entries(msg.b || {})) if (v && !s.b[k]) s._edges.add(k);
    s.x = msg.x || 0;
    s.y = msg.y || 0;
    s.b = msg.b || {};
    states.set(pid, s);
  });
  ctx.onLeave((p) => states.delete(p.id));
  return {
    get(pid) {
      const s = states.get(pid) || blank();
      if (!states.has(pid)) states.set(pid, s);
      return {
        x: s.x,
        y: s.y,
        b: s.b,
        pressed(id) { if (s._edges.has(id)) { s._edges.delete(id); return true; } return false; },
      };
    },
    clear() { states.clear(); },
  };
}

function overlay(container, cls, html) {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  container.appendChild(d);
  return d;
}

/** 3-2-1-GO countdown overlay. Resolves when GO shows. */
export function countdown(container, from = 3) {
  return new Promise((resolve) => {
    const d = overlay(container, 'sk-countdown', '');
    let n = from;
    const step = () => {
      d.innerHTML = `<span>${n > 0 ? n : 'GO!'}</span>`;
      sfx.play(n > 0 ? 'countdown' : 'go');
      if (n === 0) {
        resolve();
        setTimeout(() => d.remove(), 700);
        return;
      }
      n -= 1;
      setTimeout(step, 800);
    };
    step();
  });
}

/** Big temporary banner text, e.g. "Round 2" or "Red scores!". */
export function banner(container, html, ms = 1800) {
  const d = overlay(container, 'sk-banner', `<span>${html}</span>`);
  return new Promise((r) => setTimeout(() => { d.classList.add('out'); setTimeout(() => { d.remove(); r(); }, 300); }, ms));
}

/** Persistent HUD scoreboard in a corner. update([{ player, score, extra? }]) */
export function scoreboard(container, { position = 'top-left', title = '' } = {}) {
  const d = overlay(container, `sk-scoreboard sk-${position}`, '');
  return {
    update(rows) {
      d.innerHTML = (title ? `<div class="sk-sb-title">${title}</div>` : '') + rows.map((r) => `
        <div class="sk-sb-row ${r.dim ? 'dim' : ''}">
          <span class="sk-dot" style="background:${r.player.color}"></span>
          <span class="sk-sb-name">${escapeHtml(r.player.name)}</span>
          <span class="sk-sb-score">${r.score}${r.extra ? ` <small>${r.extra}</small>` : ''}</span>
        </div>`).join('');
    },
    destroy: () => d.remove(),
    el: d,
  };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
