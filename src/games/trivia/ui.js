// DOM shell for the Brain Brawl screen: background, scaled 1920×1080 stage, header, view switching, lock-in bar,
// confetti layer. Views themselves are built in views.js.
import css from './screen.css?inline';
import { escapeHtml as esc } from '../../sdk/screen-kit.js';
import { createConfetti } from './fx.js';

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap';

export async function loadFonts() {
  if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }
  try {
    await Promise.race([document.fonts.load('64px "Lilita One"'), new Promise((r) => setTimeout(r, 2500))]);
  } catch { /* offline: fall back to Fredoka */ }
}

export function avatar(p, cls = '', extra = '') {
  return `<span class="bb-av ${cls}" style="--c:${p.color};${extra}">${p.avatar || '🙂'}</span>`;
}

export function createUI(container) {
  const root = document.createElement('div');
  root.className = 'bb-root th-title';
  const sparks = Array.from({ length: 22 }, () => `<i class="bb-spark" style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 70).toFixed(1)}%;animation-delay:${(-Math.random() * 4).toFixed(2)}s;animation-duration:${(3 + Math.random() * 3).toFixed(2)}s"></i>`).join('');
  root.innerHTML = `
    <style>${css}</style>
    <div class="bb-bg">
      <div class="bb-bg-grad"></div>
      <div class="bb-beam"></div><div class="bb-beam"></div><div class="bb-beam"></div><div class="bb-beam"></div>
      <div class="bb-floor"></div>
      ${sparks}
      <div class="bb-vignette"></div>
    </div>
    <div class="bb-stage">
      <div class="bb-hdr hide">
        <div class="bb-logo">🧠 BRAIN <b>BRAWL</b></div>
        <div class="bb-hdr-mid"><div class="bb-pill"></div></div>
        <div class="bb-hdr-right"><span class="bb-x2" hidden>2× POINTS</span><div class="bb-qcount"></div></div>
      </div>
      <div class="bb-views"></div>
      <div class="bb-lock hide"><div class="bb-lock-inner"><div class="bb-lock-count"></div><div class="bb-lock-avs"></div></div></div>
    </div>
    <canvas class="bb-confetti"></canvas>`;
  container.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const stage = $('.bb-stage');
  const views = $('.bb-views');
  const confetti = createConfetti($('.bb-confetti'));
  stage.style.position = 'absolute';
  stage.style.left = '50%';
  stage.style.top = '50%';

  let scale = 1;
  function fit() {
    const w = root.clientWidth || window.innerWidth;
    const h = root.clientHeight || window.innerHeight;
    scale = Math.min(w / 1920, h / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    confetti.resize();
  }
  const ro = new ResizeObserver(fit);
  ro.observe(root);
  fit();

  let current = null;
  const cleanups = new Set();

  const lock = {
    el: $('.bb-lock'),
    shown: 0,
    start(total) {
      this.shown = 0;
      this.el.classList.remove('all');
      $('.bb-lock-avs').innerHTML = '';
      this.set(0, total);
      this.el.classList.remove('hide');
    },
    set(n, total) {
      const all = total > 0 && n >= total;
      this.el.classList.toggle('all', all);
      $('.bb-lock-count').innerHTML = all ? '🔒 <b>Everyone</b> is locked in!' : `🔒 <b>${n}</b> / ${total} locked in`;
    },
    add(p) {
      const avs = $('.bb-lock-avs');
      this.shown++;
      if (this.shown <= 16) avs.insertAdjacentHTML('beforeend', avatar(p, 'sm pop'));
      else {
        let more = avs.querySelector('.bb-more');
        if (!more) { avs.insertAdjacentHTML('beforeend', '<span class="bb-more"></span>'); more = avs.querySelector('.bb-more'); }
        more.textContent = `+${this.shown - 16}`;
      }
    },
    hide() { this.el.classList.add('hide'); },
  };

  return {
    root,
    stage,
    confetti,
    lock,
    get scale() { return scale; },
    theme(name) { root.className = `bb-root th-${name}`; },
    header({ show = true, pill = '', count = '', double = false } = {}) {
      $('.bb-hdr').classList.toggle('hide', !show);
      $('.bb-pill').textContent = pill;
      $('.bb-qcount').textContent = count;
      $('.bb-x2').hidden = !double;
    },
    /** Replace the current view with a new one (cross-fade). Returns the new element. */
    view(html, cls = '') {
      for (const fn of cleanups) { try { fn(); } catch { /* noop */ } }
      cleanups.clear();
      if (current) {
        const old = current;
        old.classList.add('leaving');
        setTimeout(() => old.remove(), 420);
      }
      const v = document.createElement('div');
      v.className = `bb-view ${cls}`;
      v.innerHTML = html;
      views.appendChild(v);
      current = v;
      return v;
    },
    /** Register a cleanup (intervals, rafs) that runs when the view is replaced or the game ends. */
    onLeave(fn) { cleanups.add(fn); },
    /** Confetti burst from the centre of an element. */
    burstAt(el, opts) {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      confetti.burst(r.left + r.width / 2 - rr.left, r.top + r.height / 3 - rr.top, opts);
    },
    esc,
    destroy() {
      for (const fn of cleanups) { try { fn(); } catch { /* noop */ } }
      cleanups.clear();
      ro.disconnect();
      confetti.destroy();
      root.remove();
    },
  };
}
