// Touch controller widgets for phones. All widgets use pointer events + multi-touch and return
// { el, destroy() }. Styles live in src/controller/controller.css (classes prefixed `pk-`).

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

// ---------------------------------------------------------------- virtual rotation
// iOS can't lock orientation, so when a landscape game is held in portrait the platform rotates the whole
// controller page 90° (body[data-vrot="90"|"-90"]) so it stays visually fixed. Screen-space pointer
// coordinates must then be mapped into the page's own frame. Kit widgets do this; custom code should too.

export function virtualRotation() {
  return Number(document.body.dataset.vrot || 0);
}

/** Map a screen-space delta (e.g. clientX/Y differences) into the controller's visual frame. */
export function toLocalVec(dx, dy) {
  const r = virtualRotation();
  if (r === 90) return [dy, -dx];
  if (r === -90) return [-dy, dx];
  return [dx, dy];
}

/** Pointer position relative to `elem`'s top-left corner, in the controller's visual frame. */
export function localPoint(elem, e) {
  const r = elem.getBoundingClientRect();
  const rot = virtualRotation();
  if (rot === 90) return { x: e.clientY - r.top, y: r.right - e.clientX };
  if (rot === -90) return { x: r.bottom - e.clientY, y: e.clientX - r.left };
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// ---------------------------------------------------------------- haptics
// Named patterns so every game feels consistent. vibrate() accepts a preset name, ms, or a pattern array.
export const HAPTICS = {
  tap: 10, select: 15, tick: 6, bump: 30, hit: [40, 30, 60], heavy: 120,
  explosion: [80, 40, 220], boost: [15, 25, 15, 25, 40], turn: [20, 80, 20], warn: [60, 60, 60],
  error: [50, 40, 50], success: [20, 60, 40], win: [30, 70, 30, 70, 160], lose: [220, 120, 320],
  heartbeat: [30, 140, 60], buzz: 400,
};

let hapticsOn = (() => { try { return localStorage.getItem('pc-haptics') !== 'off'; } catch { return true; } })();
export function setHaptics(on) {
  hapticsOn = on;
  try { localStorage.setItem('pc-haptics', on ? 'on' : 'off'); } catch { /* private mode */ }
}
export function hapticsEnabled() { return hapticsOn; }

/** 'vibrate' (Android etc.), 'ios' (light system ticks, iOS 18+ with System Haptics on), or 'none'. */
export function hapticsSupport() {
  if (typeof navigator.vibrate === 'function') return 'vibrate';
  const ios = /iPhone|iPod|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'none';
}

// iOS Safari has no Vibration API. Since iOS 18, clicking the <label> of an <input type="checkbox" switch>
// plays the system haptic tick. It must be a fresh, display:none element per tick, and it only fires
// reliably inside a user gesture (tap handler). Requires Settings → Sounds & Haptics → System Haptics.
function iosTick() {
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

/** Returns 'ok' | 'off' | 'blocked' (browser refused, e.g. no tap yet / battery saver) | 'ios' | 'unsupported'. */
// Visual stand-in for vibration on iPhone: a quick inset glow around the screen edge in the player colour.
let flashEl = null;
function flash(strength = 0.5) {
  if (!flashEl) {
    flashEl = document.createElement('div');
    flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;opacity:0;transition:opacity .18s ease-out;';
    document.body.appendChild(flashEl);
  }
  const px = Math.round(18 + strength * 42);
  flashEl.style.boxShadow = `inset 0 0 ${px}px ${Math.round(px / 3)}px var(--me, #12b5ea)`;
  flashEl.style.transition = 'none';
  flashEl.style.opacity = String(0.55 + strength * 0.45);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    flashEl.style.transition = 'opacity .22s ease-out';
    flashEl.style.opacity = '0';
  }));
}

export function vibrate(pattern = 15) {
  if (!hapticsOn) return 'off';
  const p = typeof pattern === 'string' ? HAPTICS[pattern] ?? 15 : pattern;
  try {
    if (typeof navigator.vibrate === 'function') return navigator.vibrate(p) ? 'ok' : 'blocked';
    if (hapticsSupport() !== 'ios') return 'unsupported';
    // iPhone: Safari blocks web vibration. Try the system-switch tick (works on some iOS versions, only inside
    // a tap) and always show a visual pulse so players still feel the event.
    const segs = Array.isArray(p) ? p : [p];
    let t = 0;
    segs.forEach((ms, i) => {
      if (i % 2 === 0) {
        const strength = Math.min(1, ms / 120);
        if (t === 0) { iosTick(); flash(strength); } else setTimeout(() => flash(strength), t);
      }
      t += ms;
    });
    return 'ios';
  } catch { return 'unsupported'; }
}

/**
 * Analog joystick. onMove(x, y) with x,y in [-1,1] (y down = +1). Fires on every change.
 * Floating: the stick centres wherever the thumb lands inside the zone.
 */
export function joystick(parent, { onMove, color = '#fff', floating = true, deadzone = 0.12 } = {}) {
  const zone = el('div', 'pk-stick-zone', parent);
  const base = el('div', 'pk-stick-base', zone);
  const knob = el('div', 'pk-stick-knob', base);
  knob.style.background = color;
  let pid = null;
  let cx = 0;
  let cy = 0;
  let last = [0, 0];

  function center() {
    const r = base.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2];
  }
  function emit(x, y) {
    const mag = Math.hypot(x, y);
    if (mag < deadzone) { x = 0; y = 0; }
    x = Math.round(x * 100) / 100;
    y = Math.round(y * 100) / 100;
    if (x === last[0] && y === last[1]) return;
    last = [x, y];
    onMove?.(x, y);
  }
  function move(e) {
    const [bx, by, rad] = center();
    let [dx, dy] = toLocalVec((e.clientX - bx) / rad, (e.clientY - by) / rad);
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    knob.style.transform = `translate(${dx * 60}%, ${dy * 60}%)`;
    emit(dx, dy);
  }
  zone.addEventListener('pointerdown', (e) => {
    if (pid !== null) return;
    pid = e.pointerId;
    zone.setPointerCapture(pid);
    if (floating) {
      ({ x: cx, y: cy } = localPoint(zone, e));
      base.style.left = `${cx}px`;
      base.style.top = `${cy}px`;
    }
    base.classList.add('active');
    move(e);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    base.classList.remove('active');
    knob.style.transform = '';
    if (floating) { base.style.left = ''; base.style.top = ''; }
    emit(0, 0);
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  return { el: zone, destroy: () => zone.remove(), get value() { return last; } };
}

/** Big round/rect button. onDown/onUp callbacks; `hold` state readable via .pressed */
export function button(parent, { label = 'A', color = '#ff4d4d', onDown, onUp, shape = 'round', size } = {}) {
  const b = el('button', `pk-btn pk-btn-${shape}`, parent);
  b.innerHTML = label;
  b.style.setProperty('--btn-color', color);
  if (size) { b.style.width = size; b.style.height = size; }
  let pressed = false;
  let pid = null;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (pressed) return;
    pid = e.pointerId;
    b.setPointerCapture(pid);
    pressed = true;
    b.classList.add('down');
    vibrate(12);
    onDown?.();
  });
  const up = (e) => {
    if (!pressed || e.pointerId !== pid) return;
    pressed = false;
    b.classList.remove('down');
    onUp?.();
  };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  return { el: b, destroy: () => b.remove(), get pressed() { return pressed; }, setLabel: (l) => { b.innerHTML = l; } };
}

/** 4-way d-pad. onChange(dir) where dir is 'up'|'down'|'left'|'right'|null. */
export function dpad(parent, { onChange } = {}) {
  const pad = el('div', 'pk-dpad', parent);
  const arrows = { up: '▲', left: '◀', right: '▶', down: '▼' };
  for (const d of Object.keys(arrows)) {
    const a = el('div', `pk-dpad-${d}`, pad);
    a.textContent = arrows[d];
  }
  let pid = null;
  let dir = null;
  function set(e) {
    const r = pad.getBoundingClientRect();
    const [dx, dy] = toLocalVec(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    const nd = Math.hypot(dx, dy) < r.width * 0.1 ? null
      : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (nd !== dir) {
      dir = nd;
      pad.dataset.dir = dir || '';
      if (dir) vibrate(8);
      onChange?.(dir);
    }
  }
  pad.addEventListener('pointerdown', (e) => { pid = e.pointerId; pad.setPointerCapture(pid); set(e); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    dir = null;
    pad.dataset.dir = '';
    onChange?.(null);
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  return { el: pad, destroy: () => pad.remove() };
}

/**
 * Standard gamepad: stick (analog|dpad|none) on the left, buttons on the right.
 * Sends { type: 'input', x, y, b: { [id]: bool } } via ctx.send whenever state changes
 * (throttled to `rate` msgs/sec for stick moves; button changes are sent immediately).
 *
 * Screen side: use `trackInput(ctx)` from screen-kit.js to read the latest state per player.
 */
export function gamepad(ctx, { stick = 'analog', buttons = [{ id: 'a', label: 'A' }], rate = 30, hint } = {}) {
  const root = el('div', 'pk-gamepad', ctx.container);
  const left = el('div', 'pk-gp-left', root);
  const mid = el('div', 'pk-gp-mid', root);
  const right = el('div', 'pk-gp-right', root);
  if (hint) el('div', 'pk-gp-hint', mid).innerHTML = hint;
  const state = { x: 0, y: 0, b: {} };
  let pending = null;
  let lastSend = 0;
  function flush() {
    pending = null;
    lastSend = performance.now();
    ctx.send({ type: 'input', x: state.x, y: state.y, b: { ...state.b } });
  }
  function schedule(immediate) {
    if (immediate) { if (pending) clearTimeout(pending); flush(); return; }
    if (pending) return;
    const wait = Math.max(0, 1000 / rate - (performance.now() - lastSend));
    pending = setTimeout(flush, wait);
  }
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  if (stick === 'analog') {
    joystick(left, { color: ctx.player.color, onMove: (x, y) => { state.x = x; state.y = y; schedule(x === 0 && y === 0); } });
  } else if (stick === 'dpad') {
    dpad(left, { onChange: (d) => { [state.x, state.y] = d ? DIRS[d] : [0, 0]; schedule(true); } });
  }
  const btns = {};
  for (const bdef of buttons) {
    state.b[bdef.id] = false;
    btns[bdef.id] = button(right, {
      label: bdef.label,
      color: bdef.color || ctx.player.color,
      onDown: () => { state.b[bdef.id] = true; schedule(true); },
      onUp: () => { state.b[bdef.id] = false; schedule(true); },
    });
  }
  return {
    el: root,
    buttons: btns,
    state,
    setHint(h) { mid.innerHTML = h ? `<div class="pk-gp-hint">${h}</div>` : ''; },
    destroy() { if (pending) clearTimeout(pending); root.remove(); },
  };
}

/** Full-width list of big choice buttons (quiz answers, votes). onPick(index). */
export function choices(parent, items, { onPick, colors } = {}) {
  const wrap = el('div', 'pk-choices', parent);
  const palette = colors || ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#1abc9c', '#ec407a'];
  items.forEach((item, i) => {
    const b = el('button', 'pk-choice', wrap);
    b.innerHTML = item;
    b.style.setProperty('--btn-color', palette[i % palette.length]);
    b.addEventListener('click', () => {
      vibrate(20);
      wrap.querySelectorAll('.pk-choice').forEach((x) => x.classList.toggle('picked', x === b));
      onPick?.(i);
    });
  });
  return { el: wrap, destroy: () => wrap.remove(), disable() { wrap.classList.add('disabled'); } };
}

/** Text input with submit. onSubmit(text). Keeps keyboard up if `keepFocus`. */
export function textInput(parent, { placeholder = '', maxLength = 60, onSubmit, submitLabel = 'Send', keepFocus = false, autoCaps = 'none' } = {}) {
  const form = el('form', 'pk-text', parent);
  const input = el('input', '', form);
  input.placeholder = placeholder;
  input.maxLength = maxLength;
  input.autocomplete = 'off';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', autoCaps);
  input.spellcheck = false;
  const b = el('button', 'pk-btn-rect', form);
  b.type = 'submit';
  b.textContent = submitLabel;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    onSubmit?.(v);
    input.value = '';
    if (keepFocus) input.focus();
  });
  return { el: form, input, focus: () => input.focus(), destroy: () => form.remove() };
}

/** Simple centred message panel. */
export function message(parent, html) {
  const m = el('div', 'pk-message', parent);
  m.innerHTML = html;
  return { el: m, set: (h) => { m.innerHTML = h; }, destroy: () => m.remove() };
}

/**
 * Tilt (gyro) steering, like holding the phone as a steering wheel in landscape.
 * Works in any orientation: it uses the gravity direction projected onto the screen plane.
 *
 *   const t = tilt({ onChange: (steer) => …, maxAngle: 25 });   // degrees of tilt for full lock   // steer in [-1, 1], right = +
 *   button.onclick = async () => { if (await t.start()) … else fall back to joystick };  // MUST be in a tap handler (iOS permission)
 *   t.calibrate();  // current pose becomes "straight"
 *   t.stop();
 *
 * Requirements: a secure context (https:// or localhost). iOS asks the user for motion permission on start().
 */
export function tilt({ onChange, maxAngle = 25, deadzone = 0.04, invert = false, smoothing = 0.45, curve = 1.35 } = {}) {
  const supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && window.isSecureContext;
  let offset = 0;
  let raw = 0;
  let value = 0;
  let last = null;
  let running = false;
  let gotEvent = false;
  let range = Math.sin((maxAngle * Math.PI) / 180);

  function screenAngle() {
    // The visual frame = OS screen rotation + the platform's virtual rotation (see virtualRotation()).
    const a = (screen.orientation?.angle ?? window.orientation ?? 0) + virtualRotation();
    return (((a % 360) + 360) % 360) * Math.PI / 180;
  }
  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    gotEvent = true;
    const b = (e.beta * Math.PI) / 180;
    const g = (e.gamma * Math.PI) / 180;
    // Gravity in device coordinates (x right, y up, z out of screen), derived from the W3C Z-X'-Y'' Euler angles.
    const gx = Math.cos(b) * Math.sin(g);
    const gy = -Math.sin(b);
    // Rotate into screen coordinates. Gravity pulls toward the lowered edge, so lowering the right edge gives +x.
    const t = screenAngle();
    raw = gx * Math.cos(t) - gy * Math.sin(t);
    let s = (raw - offset) / range;
    if (invert) s = -s;
    s = Math.max(-1, Math.min(1, s));
    // Deadzone, then an expo response curve (>1 = gentle near centre for small corrections, full lock at maxAngle).
    s = Math.abs(s) < deadzone ? 0 : Math.sign(s) * ((Math.abs(s) - deadzone) / (1 - deadzone)) ** curve;
    value += (s - value) * (1 - smoothing);
    const out = Math.round(value * 100) / 100;
    if (out !== last) { last = out; onChange?.(out); }
  }
  return {
    supported,
    get value() { return last ?? 0; },
    get receiving() { return gotEvent; },
    async start() {
      if (!supported) return false;
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') return false;
        }
      } catch { return false; }
      if (!running) window.addEventListener('deviceorientation', onOrient);
      running = true;
      return true;
    },
    calibrate() { offset = raw; value = 0; },
    setInvert(v) { invert = v; },
    setMaxAngle(deg) { range = Math.sin((deg * Math.PI) / 180); },
    stop() { running = false; window.removeEventListener('deviceorientation', onOrient); },
  };
}
