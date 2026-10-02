// TV-side UI widgets in the sketchbook style.
import { sfx } from '../../sdk/audio.js';
import { el, esc } from './util.js';
import { doodleSvg } from './fx.js';

export function logoHtml() {
  return `<span class="dd-logo-word"><span class="a">Doodle</span><span class="b">Dash</span></span>`;
}

export function chip(p, extra = '') {
  if (!p) return '';
  return `<span class="dd-chip" style="--c:${p.color}"><i>${p.avatar}</i><b>${esc(p.name)}</b>${extra}</span>`;
}

export function avatar(p, cls = '') {
  if (!p) return '';
  return `<span class="dd-av ${cls}" style="--c:${p.color}">${p.avatar}</span>`;
}

/** Circular timer. */
export function makeTimer(parent) {
  const node = el('div', 'dd-timer', parent, `
    <svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="42"/><circle class="fg" cx="50" cy="50" r="42" pathLength="100"/></svg>
    <span class="num"></span>`);
  const fg = node.querySelector('.fg');
  const num = node.querySelector('.num');
  let lastSec = -1;
  return {
    el: node,
    set(remainMs, totalMs, { tick = true } = {}) {
      const sec = Math.max(0, Math.ceil(remainMs / 1000));
      const frac = totalMs > 0 ? Math.max(0, Math.min(1, remainMs / totalMs)) : 0;
      fg.style.strokeDashoffset = String(100 - frac * 100);
      if (sec !== lastSec) {
        num.textContent = String(sec);
        node.classList.toggle('low', sec <= 10 && sec > 0);
        if (tick && sec <= 5 && sec > 0 && lastSec !== -1) sfx.play('tick');
        lastSec = sec;
      }
    },
    hide(h) { node.classList.toggle('off', !!h); },
  };
}

/** Sticky-note banner that slaps onto the screen. */
export function banner(parent, html, ms = 1700) {
  const b = el('div', 'dd-banner', parent, `<div class="dd-banner-note">${html}</div>`);
  sfx.play('whoosh');
  return new Promise((r) => setTimeout(() => {
    b.classList.add('out');
    setTimeout(() => { b.remove(); r(); }, 350);
  }, ms));
}

/** 3-2-1-Draw! countdown in marker style. */
export function countdown(parent, word = 'Go!') {
  const d = el('div', 'dd-count', parent);
  return new Promise((resolve) => {
    let n = 3;
    const step = () => {
      d.innerHTML = `<span class="${n > 0 ? '' : 'go'}">${n > 0 ? n : esc(word)}</span>`;
      sfx.play(n > 0 ? 'countdown' : 'go');
      if (n === 0) { setTimeout(() => { d.remove(); resolve(); }, 650); return; }
      n--;
      setTimeout(step, 750);
    };
    step();
  });
}

export function underline(color = '#ff8a1f') {
  return `<svg class="dd-underline" viewBox="0 0 300 24" preserveAspectRatio="none"><path pathLength="1" d="M6 14 C60 4 120 20 170 10 C210 3 250 18 294 8" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/></svg>`;
}

export { doodleSvg };
