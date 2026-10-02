// Doodle Dash — TV side. Owns the shared flow: mode pick → how-to → countdown → mode → results → again.
import { sfx } from '../../sdk/audio.js';
import { SCREEN_CSS } from './style-screen.js';
import { Runner, TIMEOUT, el, esc, installStyle } from './util.js';
import { makeAssembler, chunkedSend } from './net.js';
import { paperTexture, Scribbles, Confetti, doodleSvg } from './fx.js';
import { logoHtml, chip, banner, countdown } from './tv-ui.js';
import { DrawGuess } from './screen-guess.js';
import { Telephone } from './screen-telephone.js';

const FALLBACK_WORDS = {
  easy: ['cat', 'house', 'sun', 'tree', 'fish', 'car', 'apple', 'star', 'boat', 'flower'],
  medium: ['giraffe', 'lighthouse', 'windmill', 'snowman', 'rocket', 'pirate', 'volcano', 'robot', 'castle', 'guitar'],
  hard: ['time machine', 'haunted house', 'traffic jam', 'snowball fight', 'black hole', 'magic trick', 'treasure map', 'pillow fight'],
};

const MODE_SECONDS = 30;
const HOWTO_MS = 9000;

export default async function start(ctx) {
  const uninstall = await installStyle(SCREEN_CSS);
  let words = FALLBACK_WORDS;
  try {
    const res = await fetch(ctx.asset('words.json'));
    const j = await res.json();
    if (j?.easy?.length && j?.medium?.length && j?.hard?.length) words = j;
  } catch { /* use fallback list */ }

  const root = el('div', 'dd-root', ctx.container);
  root.style.setProperty('--paper-tex', `url(${paperTexture()})`);
  const scribbles = new Scribbles(root);
  const stage = el('div', 'dd-stage', root);
  const confetti = new Confetti(root);
  const game = new Game(ctx, { root, stage, confetti, words });
  game.run();
  return {
    destroy() {
      game.destroy();
      scribbles.destroy();
      confetti.destroy();
      root.remove();
      uninstall();
    },
  };
}

class Game {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.R = new Runner();
    this.phase = null;
    this.assemble = makeAssembler();
    this.mode = null;
    this.gameNo = 0;
    this.raf = 0;
    this.frameFns = new Set();
    const frame = (now) => {
      this.frameFns.forEach((fn) => { try { fn(now); } catch (err) { console.error(err); } });
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);

    ctx.onMessage((pid, raw) => {
      if (this.R.dead) return;
      const m = this.assemble(pid, raw);
      if (!m || typeof m.type !== 'string') return;
      if (m.type === 'hello') { this.sendView(pid, true); return; }
      this.phase?.onMessage?.(pid, m);
    });
    ctx.onJoin((p, info) => {
      if (this.R.dead) return;
      this.phase?.onJoin?.(p, info);
      // the controller also sends 'hello' when it boots; this covers phones whose controller was already loaded
      this.R.after(400, () => this.sendView(p.id, true));
    });
    ctx.onLeave((p) => {
      if (this.R.dead) return;
      this.phase?.onLeave?.(p);
      // the platform may hand the crown to someone else right after this callback
      this.R.after(60, () => this.phase?.onAdminMaybeChanged?.());
    });
  }

  get players() { return this.ctx.players(); }
  isConnected(pid) { return this.ctx.players().some((p) => p.id === pid); }
  adminName() { return this.ctx.player(this.ctx.adminId)?.name ?? 'The host'; }
  onFrame(fn) { this.frameFns.add(fn); return () => this.frameFns.delete(fn); }
  vibrate(target, pattern) { try { this.ctx.vibrate(target, pattern); } catch { /* optional */ } }

  send(pid, data) { chunkedSend((d) => this.ctx.send(pid, d), data); }

  sendView(pid, hello = false) {
    if (!this.isConnected(pid)) return;
    let v = null;
    try { v = this.phase?.view?.(pid, hello); } catch (err) { console.error(err); }
    if (!v) v = { kind: 'wait', key: 'boot', art: 'pencil', title: 'Doodle Dash', sub: 'Sharpening pencils…' };
    this.send(pid, { type: 'view', v });
  }

  refreshViews(filter) {
    for (const p of this.ctx.players()) if (!filter || filter(p.id)) this.sendView(p.id);
  }

  setPhase(phase) {
    this.phase = phase;
    this.refreshViews();
  }

  banner(html, ms) { return banner(this.env.root, html, ms); }

  async run() {
    while (!this.R.dead) {
      this.gameNo++;
      const mode = await this.pickMode();
      if (this.R.dead) return;
      this.mode = mode;
      await this.howTo(mode);
      if (this.R.dead) return;
      const impl = mode === 'tp' ? new Telephone(this) : new DrawGuess(this);
      this.impl = impl;
      const rows = await impl.run();
      if (this.R.dead) return;
      this.setPhase({
        view: () => ({ kind: 'wait', key: `final-${this.gameNo}`, art: 'trophy', title: 'Final scores', sub: 'Look at the TV' }),
      });
      if (rows?.length) {
        this.vibrate(rows[0].player.id, 'win');
        const choice = await this.ctx.showResults(rows, {
          title: 'Doodle Dash',
          subtitle: mode === 'tp' ? 'Telephone · points are votes from other players' : 'Draw & Guess · final scores',
        });
        impl.destroy?.();
        this.impl = null;
        if (choice !== 'again' || this.R.dead) return;
      } else {
        impl.destroy?.();
        this.impl = null;
      }
    }
  }

  // ---------------------------------------------------------------- mode select

  recommended() {
    return this.players.length > 12 ? 'tp' : 'dg';
  }

  async pickMode() {
    const { stage } = this.env;
    stage.innerHTML = '';
    this.env.root.classList.remove('busy');
    const wrap = el('div', 'dd-mode', stage, `
      <div class="dd-logo big">${logoHtml()}</div>
      <div class="dd-mode-cards">
        <div class="dd-mode-card dd-card" data-mode="dg">
          <i class="dd-tape c"></i>
          <div class="dd-mode-art dg-art">
            <div class="mini-sheet">${doodleSvg('sun', '#ff8a1f', 5, 'a1')}</div>
            <div class="mini-bubbles"><span>a sun?</span><span>flower!</span><span class="ok">sun</span></div>
          </div>
          <h2>Draw &amp; Guess</h2>
          <p>One artist draws on their phone. Everyone else races to guess the word.</p>
          <div class="dd-mode-tag">3–12 players</div>
          <div class="dd-rec">Recommended</div>
        </div>
        <div class="dd-mode-card dd-card" data-mode="tp">
          <i class="dd-tape c"></i>
          <div class="dd-mode-art tp-art">
            <span class="mini m1">a cat on a bike</span>
            ${doodleSvg('arrow', '#23212e', 6, 'arr')}
            <span class="mini m2">${doodleSvg('smile', '#2f5bea', 6)}</span>
            ${doodleSvg('arrow', '#23212e', 6, 'arr')}
            <span class="mini m3">a happy moon?</span>
          </div>
          <h2>Telephone</h2>
          <p>Everyone writes, draws and describes at the same time. Watch the story fall apart.</p>
          <div class="dd-mode-tag">4–50+ players</div>
          <div class="dd-rec">Recommended</div>
        </div>
      </div>
      <div class="dd-mode-foot"></div>
      <div class="dd-mode-players"></div>`);
    const foot = wrap.querySelector('.dd-mode-foot');
    const plist = wrap.querySelector('.dd-mode-players');
    const endsAt = Date.now() + MODE_SECONDS * 1000;
    const render = () => {
      const rec = this.recommended();
      wrap.querySelectorAll('.dd-mode-card').forEach((c) => c.classList.toggle('rec', c.dataset.mode === rec));
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      foot.innerHTML = `<b>${esc(this.adminName())}</b> picks a mode on their phone <span class="dd-auto">starts by itself in ${left}s</span>`;
      const ps = this.players;
      const MAX = 24;
      plist.innerHTML = ps.slice(0, MAX).map((p) => chip(p)).join('') + (ps.length > MAX ? `<span class="dd-more">+${ps.length - MAX} more</span>` : '');
    };
    render();
    const gate = this.R.gate(MODE_SECONDS * 1000);
    const stopTick = this.R.every(1000, render);
    const view = (pid) => ({
      kind: 'mode', key: `mode-${this.gameNo}-${pid === this.ctx.adminId ? 'a' : 'p'}`, admin: pid === this.ctx.adminId, adminName: this.adminName(),
      count: this.players.length, rec: this.recommended(), endsIn: endsAt - Date.now(),
    });
    this.setPhase({
      view,
      onMessage: (pid, m) => {
        if (m.type === 'mode' && pid === this.ctx.adminId && (m.mode === 'dg' || m.mode === 'tp')) gate.open(m.mode);
      },
      onJoin: () => { render(); this.refreshViews((id) => id === this.ctx.adminId); },
      onLeave: () => render(),
      onAdminMaybeChanged: () => { render(); this.refreshViews(); },
    });
    let mode = await gate.promise;
    stopTick();
    if (mode === TIMEOUT) mode = this.recommended();
    const card = wrap.querySelector(`.dd-mode-card[data-mode="${mode}"]`);
    wrap.classList.add('picked');
    card?.classList.add('chosen');
    sfx.play('powerup');
    this.vibrate('all', 'select');
    this.setPhase({ view: () => ({ kind: 'wait', key: `picked-${this.gameNo}`, art: mode === 'tp' ? 'bubble' : 'pencil', title: mode === 'tp' ? 'Telephone' : 'Draw & Guess', sub: 'Look at the TV' }) });
    await this.R.sleep(1200);
    return mode;
  }

  // ---------------------------------------------------------------- how to play

  async howTo(mode) {
    const { stage, root } = this.env;
    stage.innerHTML = '';
    const steps = mode === 'tp'
      ? [
        ['pencil', '#ff8a1f', 'Write', 'Everyone secretly writes something to draw.'],
        ['smile', '#2f5bea', 'Draw', 'You get someone else\'s prompt. Draw it, no letters.'],
        ['bubble', '#22a45d', 'Describe', 'Then say what someone else\'s drawing shows.'],
        ['eye', '#e8443a', 'Watch & vote', 'Replay every chain on the TV. Vote for your favourites.'],
      ]
      : [
        ['pencil', '#ff8a1f', 'Draw', 'On your turn, pick a word and draw it on your phone.'],
        ['bubble', '#2f5bea', 'Guess', 'Everyone else types guesses. Faster guesses score more.'],
        ['bulb', '#e6a700', 'Hints', 'Letters appear as the clock runs down.'],
        ['trophy', '#22a45d', 'Score', 'The artist scores for every correct guess.'],
      ];
    const card = el('div', 'dd-howto', stage, `
      <div class="dd-howto-card dd-card">
        <i class="dd-tape l"></i><i class="dd-tape r"></i>
        <h1>${mode === 'tp' ? 'Telephone' : 'Draw &amp; Guess'}</h1>
        <div class="dd-steps">${steps.map(([art, col, t, d], i) => `
          <div class="dd-step" style="--i:${i};--c:${col}"><div class="ico">${doodleSvg(art, col, 6)}</div><span class="n">${i + 1}</span><b>${t}</b><p>${d}</p></div>`).join('')}</div>
        <div class="dd-howto-foot"><b>${esc(this.adminName())}</b> can tap <b>Let's go</b> to start now</div>
        <div class="dd-howto-bar"><i style="animation-duration:${HOWTO_MS}ms"></i></div>
      </div>`);
    const gate = this.R.gate(HOWTO_MS);
    this.setPhase({
      view: (pid) => ({ kind: 'howto', key: `howto-${this.gameNo}-${pid === this.ctx.adminId ? 'a' : 'p'}`, mode, admin: pid === this.ctx.adminId, steps: steps.map((s) => [s[2], s[3]]) }),
      onMessage: (pid, m) => { if (m.type === 'skip' && pid === this.ctx.adminId) gate.open('skip'); },
      onAdminMaybeChanged: () => this.refreshViews(),
    });
    await gate.promise;
    card.classList.add('out');
    this.setPhase({ view: () => ({ kind: 'wait', key: `cd-${this.gameNo}`, art: 'clock', title: 'Get ready…', sub: 'Eyes on the TV' }) });
    await this.R.sleep(250);
    stage.innerHTML = '';
    await countdown(root, mode === 'tp' ? 'Write!' : 'Draw!');
  }

  destroy() {
    this.R.destroy();
    cancelAnimationFrame(this.raf);
    this.frameFns.clear();
    this.impl?.destroy?.();
  }
}
