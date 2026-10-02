// Draw & Guess — TV side. One artist per turn draws on their phone; strokes stream live to the TV canvas.
import { sfx } from '../../sdk/audio.js';
import { Surface, LivePlayer, packOps, ASPECT } from './draw-core.js';
import { judge, makeMask, letterCount, isLetter } from './text.js';
import { TIMEOUT, el, esc, clamp, shuffled, fitBox } from './util.js';
import { floatEmoji, doodleSvg } from './fx.js';
import { logoHtml, chip, avatar, makeTimer, underline } from './tv-ui.js';

const DIFFS = [
  { id: 'easy', label: 'Easy', mult: 1 },
  { id: 'medium', label: 'Medium', mult: 1.5 },
  { id: 'hard', label: 'Hard', mult: 2 },
];
const CHOOSE_MS = 10000;
const REVEAL_MS = 5600;
const ARTIST_GRACE_MS = 7000;
const REACTIONS = ['👍', '😂', '😮', '🔥', '❤️', '🤔'];
const MAX_TURNS_BIG = 10; // with lots of players, a game is capped at this many turns (least-drawn players go first)

export class DrawGuess {
  constructor(G) {
    this.G = G;
    this.ctx = G.ctx;
    this.R = G.R;
    this.scores = new Map();
    this.used = new Set();
    this.drawn = new Map();
    this.turnSeq = 0;
    this.t = null;
    this.lastGuess = new Map();
    this.lastReact = new Map();
    this.cleanups = [];
  }

  // ---------------------------------------------------------------- flow

  async run() {
    this.build();
    for (const p of this.ctx.players()) this.scores.set(p.id, 0);
    const n0 = this.ctx.players().length;
    this.rounds = n0 > MAX_TURNS_BIG ? 1 : clamp(Math.floor(10 / n0), 1, 3);
    this.totalTurns = n0 > MAX_TURNS_BIG ? MAX_TURNS_BIG : n0 * this.rounds;
    this.turnNo = 0;
    this.round = 1;
    this.G.setPhase(this.phaseObj());
    this.renderPlayers();
    this.renderRound();
    for (let r = 1; r <= this.rounds; r++) {
      if (this.R.dead) return null;
      if (this.ctx.players().length < 2 || this.turnNo >= this.totalTurns) break;
      this.round = r;
      this.renderRound();
      if (this.rounds > 1) await this.G.banner(`Round ${r}<small>of ${this.rounds}</small>`, 1500);
      const order = this.pickArtists(this.totalTurns - this.turnNo);
      for (const pid of order) {
        if (this.R.dead) return null;
        if (this.ctx.players().length < 2) break;
        if (!this.G.isConnected(pid)) continue;
        this.turnNo++;
        await this.turn(pid);
      }
    }
    if (this.R.dead) return null;
    if (this.ctx.players().length < 2) {
      await this.G.banner('Not enough players left!', 2000);
    } else {
      await this.G.banner('That\'s a wrap!', 1700);
    }
    this.t = null;
    const rows = this.ctx.allPlayers()
      .filter((p) => this.scores.has(p.id))
      .map((p) => ({ player: p, score: this.scores.get(p.id) || 0, label: 'pts' }))
      .sort((a, b) => b.score - a.score);
    return rows;
  }

  pickArtists(max) {
    const ps = shuffled(this.ctx.players().map((p) => p.id));
    ps.sort((a, b) => (this.drawn.get(a) || 0) - (this.drawn.get(b) || 0));
    return ps.slice(0, Math.max(0, max));
  }

  pickWords() {
    return DIFFS.map((d, i) => {
      const list = this.G.env.words[d.id];
      let w = null;
      for (let k = 0; k < 40; k++) {
        const cand = list[Math.floor(Math.random() * list.length)];
        if (!this.used.has(cand)) { w = cand; break; }
      }
      w ??= list[Math.floor(Math.random() * list.length)];
      this.used.add(w);
      return { w, d: i };
    });
  }

  async turn(artistId) {
    const artist = this.ctx.player(artistId);
    const t = {
      id: ++this.turnSeq,
      artist: artistId,
      phase: 'choose',
      choices: this.pickWords(),
      word: '',
      diff: 0,
      mult: 1,
      guessed: new Map(),
      gains: new Map(),
      revealed: new Set(),
      mask: '',
      start: 0,
      dur: CHOOSE_MS,
      endsAt: Date.now() + CHOOSE_MS,
      goneAt: null,
      hints: [],
    };
    this.t = t;
    this.drawn.set(artistId, (this.drawn.get(artistId) || 0) + 1);
    this.live.reset();
    this.surface.reset();
    this.renderRound();
    this.renderPlayers();
    this.renderArtist();
    this.maskEl.innerHTML = '<span class="dg-choosing-txt">Picking a word…</span>';
    this.lenEl.textContent = '';
    this.overlay.innerHTML = `
      <div class="dg-choosing">
        ${avatar(artist, 'big bob')}
        <div><b>${esc(artist?.name ?? '?')}</b> is picking a word…</div>
        <div class="dg-dots"><i></i><i></i><i></i></div>
      </div>`;
    this.overlay.hidden = false;
    this.feedAdd(`<b style="color:${artist?.color}">${esc(artist?.name)}</b> is up to draw`, 'sys');
    sfx.play('whoosh');
    this.G.vibrate(artistId, 'turn');
    this.G.refreshViews();

    // ---- choose
    t.gate = this.R.gate(CHOOSE_MS + 400);
    const pick = await t.gate.promise;
    if (this.R.dead) return;
    if (!this.G.isConnected(artistId)) {
      this.feedAdd(`${esc(artist?.name)} left, skipping their turn`, 'sys');
      this.overlay.innerHTML = '<div class="dg-choosing"><div>Turn skipped</div></div>';
      await this.R.sleep(1500);
      return;
    }
    const choice = t.choices[pick === TIMEOUT || !(pick >= 0 && pick <= 2) ? Math.floor(Math.random() * 3) : pick];
    t.word = choice.w;
    t.diff = choice.d;
    t.mult = DIFFS[choice.d].mult;
    const guessers = this.ctx.players().filter((p) => p.id !== artistId).length;
    t.dur = (guessers <= 1 ? 60 : guessers === 2 ? 70 : 80) * 1000;
    t.start = Date.now();
    t.endsAt = t.start + t.dur;
    t.phase = 'draw';
    // hint schedule
    const idx = [...t.word].map((ch, i) => (isLetter(ch) ? i : -1)).filter((i) => i >= 0);
    const L = idx.length;
    let nh = L <= 3 ? 1 : L <= 5 ? 2 : L <= 8 ? 3 : 4;
    nh = Math.min(nh, Math.max(0, L - 2));
    const pool = shuffled(idx);
    for (let k = 1; k <= nh; k++) t.hints.push({ at: t.dur * (0.35 + (0.5 * k) / nh), i: pool[k - 1], done: false });
    t.mask = makeMask(t.word, t.revealed);
    this.overlay.hidden = true;
    this.overlay.innerHTML = '';
    this.renderArtist();
    this.renderMask(true);
    this.lenEl.textContent = `(${letterCount(t.word)})`;
    this.renderPlayers();
    sfx.play('go');
    this.G.refreshViews();
    for (const p of this.ctx.players()) if (p.id !== artistId) this.G.vibrate(p.id, 'tap');

    // ---- draw
    t.gate = this.R.gate(null);
    const stop = this.R.every(200, () => this.tick());
    const reason = await t.gate.promise;
    stop();
    if (this.R.dead) return;

    // ---- reveal
    this.live.flush();
    t.phase = 'reveal';
    t.endsAt = Date.now() + REVEAL_MS;
    this.timer.set(0, 1, { tick: false });
    this.showReveal(reason);
    this.renderPlayers(true);
    this.G.refreshViews();
    await this.R.sleep(REVEAL_MS);
    this.hideReveal();
  }

  tick() {
    const t = this.t;
    if (!t || t.phase !== 'draw') return;
    const now = Date.now();
    const elapsed = now - t.start;
    this.timer.set(t.endsAt - now, t.dur);
    let hinted = false;
    for (const h of t.hints) {
      if (!h.done && elapsed >= h.at) {
        h.done = true;
        t.revealed.add(h.i);
        hinted = true;
      }
    }
    if (hinted) {
      t.mask = makeMask(t.word, t.revealed);
      this.renderMask();
      sfx.play('blip');
      this.G.refreshViews((id) => id !== t.artist && !t.guessed.has(id));
    }
    if (t.goneAt && now - t.goneAt > ARTIST_GRACE_MS) { t.gate.open('left'); return; }
    if (now >= t.endsAt) { t.gate.open('time'); return; }
    const guessers = this.ctx.players().filter((p) => p.id !== t.artist);
    if (!guessers.length && now - t.start > 3000) { t.gate.open('empty'); return; }
    if (guessers.length && guessers.every((p) => t.guessed.has(p.id)) && !t.allAt) {
      t.allAt = now;
      this.R.after(1000, () => t.gate.open('all'));
    }
  }

  // ---------------------------------------------------------------- messages

  phaseObj() {
    return {
      view: (pid, hello) => this.view(pid, hello),
      onMessage: (pid, m) => this.onMessage(pid, m),
      onJoin: (p, info) => this.onJoin(p, info),
      onLeave: (p) => this.onLeave(p),
      onAdminMaybeChanged: () => {},
    };
  }

  view(pid, hello) {
    const t = this.t;
    const score = this.scores.get(pid) || 0;
    if (!t) return { kind: 'wait', key: 'dg-wait', art: 'pencil', title: 'Get ready to doodle!', sub: 'Draw & Guess', score };
    const ap = this.ctx.player(t.artist);
    const a = ap ? { name: ap.name, color: ap.color, avatar: ap.avatar } : { name: '?', color: '#999', avatar: '❔' };
    const endsIn = Math.max(0, t.endsAt - Date.now());
    if (t.phase === 'choose') {
      if (pid === t.artist) {
        return { kind: 'choose', key: `dg-c${t.id}`, turn: t.id, words: t.choices.map((c) => ({ w: c.w, d: c.d, mult: DIFFS[c.d].mult })), endsIn };
      }
      return { kind: 'wait', key: `dg-cw${t.id}`, art: 'question', title: `${a.name} is picking a word…`, sub: 'Get your guessing thumbs ready', who: a, score };
    }
    if (t.phase === 'draw') {
      if (pid === t.artist) {
        if (hello) this.live.flush();
        return {
          kind: 'draw', key: `dg-d${t.id}`, turn: t.id, word: t.word, endsIn, total: t.dur,
          restore: hello ? packOps(this.surface.ops) : null,
        };
      }
      const g = t.guessed.get(pid);
      return {
        kind: 'guess', key: `dg-g${t.id}`, turn: t.id, mask: t.mask, len: letterCount(t.word), endsIn, total: t.dur,
        artist: a, guessed: !!g, pts: g?.pts || 0, word: g ? t.word : null, score,
      };
    }
    const gained = t.gains.get(pid) || 0;
    const ranked = [...this.scores.entries()].sort((x, y) => y[1] - x[1]);
    const rank = ranked.findIndex(([id]) => id === pid) + 1;
    return { kind: 'reveal', key: `dg-r${t.id}`, word: t.word, gained, total: score, wasArtist: pid === t.artist, guessedIt: t.guessed.has(pid), rank, of: ranked.length };
  }

  onMessage(pid, m) {
    const t = this.t;
    switch (m.type) {
      case 'pick':
        if (t && t.phase === 'choose' && pid === t.artist && m.turn === t.id) t.gate.open(m.i | 0);
        break;
      case 'draw':
        if (t && t.phase === 'draw' && pid === t.artist && m.turn === t.id && Array.isArray(m.a)) {
          this.live.push(m.a.slice(0, 400));
          if (!t.drew) { t.drew = true; }
        }
        break;
      case 'guess':
        this.onGuess(pid, m.text);
        break;
      case 'react':
        this.onReact(pid, m.e);
        break;
      default:
    }
  }

  onGuess(pid, raw) {
    const t = this.t;
    if (!t || t.phase !== 'draw' || pid === t.artist || t.guessed.has(pid)) return;
    const now = Date.now();
    if (now - (this.lastGuess.get(pid) || 0) < 350) return;
    this.lastGuess.set(pid, now);
    const text = String(raw ?? '').slice(0, 40).trim();
    if (!text) return;
    const p = this.ctx.player(pid);
    if (!p) return;
    if (!this.scores.has(pid)) this.scores.set(pid, 0);
    const res = judge(text, t.word);
    if (res === 'correct') {
      const frac = clamp(1 - (now - t.start) / t.dur, 0, 1);
      const bonus = [60, 30, 15][t.guessed.size] || 0;
      const pts = Math.round(((60 + 240 * frac + bonus) * t.mult) / 5) * 5;
      t.guessed.set(pid, { pts, order: t.guessed.size });
      t.gains.set(pid, (t.gains.get(pid) || 0) + pts);
      this.scores.set(pid, (this.scores.get(pid) || 0) + pts);
      const apts = Math.round((50 * t.mult) / 5) * 5;
      t.gains.set(t.artist, (t.gains.get(t.artist) || 0) + apts);
      this.scores.set(t.artist, (this.scores.get(t.artist) || 0) + apts);
      this.feedAdd(`<span class="tick">${doodleSvg('check', '#22a45d', 12)}</span><b style="color:${p.color}">${esc(p.name)}</b><span class="what">got it!</span><span class="pts">+${pts}</span>`, 'ok');
      this.G.vibrate(pid, 'success');
      this.G.vibrate(t.artist, 'tap');
      sfx.play('correct');
      this.renderPlayers();
      const row = this.plist.querySelector(`[data-id="${CSS.escape(pid)}"]`);
      const r = (row || this.feedList).getBoundingClientRect();
      this.G.env.confetti.burst(r.left + r.width * 0.7, r.top + r.height / 2, 45, 0.8);
      this.G.send(pid, { type: 'result', r: 'correct', pts, word: t.word });
      this.G.sendView(pid);
      const guessers = this.ctx.players().filter((x) => x.id !== t.artist).length;
      this.G.send(t.artist, { type: 'gotit', name: p.name, n: t.guessed.size, of: guessers, pts: apts });
    } else if (res === 'close') {
      this.feedAdd(`<b style="color:${p.color}">${esc(p.name)}</b> is close!`, 'close');
      this.G.vibrate(pid, 'bump');
      sfx.play('blip');
      this.G.send(pid, { type: 'result', r: 'close', text });
    } else if (res === 'wrong') {
      this.feedAdd(`<b style="color:${p.color}">${esc(p.name)}</b> ${esc(text)}`, '');
      this.G.send(pid, { type: 'result', r: 'wrong', text });
    }
  }

  onReact(pid, e) {
    if (!REACTIONS.includes(e)) return;
    const t = this.t;
    if (t && t.phase === 'draw' && pid === t.artist) return;
    const now = Date.now();
    if (now - (this.lastReact.get(pid) || 0) < 600) return;
    this.lastReact.set(pid, now);
    const p = this.ctx.player(pid);
    const holder = this.sheetHolder.getBoundingClientRect();
    const rootR = this.el.getBoundingClientRect();
    floatEmoji(this.el, e, holder.left - rootR.left + holder.width * (0.15 + Math.random() * 0.7), holder.bottom - rootR.top - 30, esc(p?.name ?? ''));
  }

  onJoin(p, { rejoin } = {}) {
    const t = this.t;
    if (!this.scores.has(p.id)) this.scores.set(p.id, 0);
    if (t && p.id === t.artist) {
      t.goneAt = null;
      this.feedAdd(`${esc(p.name)} is back`, 'sys');
    } else if (!rejoin) {
      this.feedAdd(`<b style="color:${p.color}">${esc(p.name)}</b> joined the game`, 'sys');
      sfx.play('join');
    }
    this.renderPlayers();
  }

  onLeave(p) {
    const t = this.t;
    if (t && p.id === t.artist && t.phase !== 'reveal') {
      t.goneAt = Date.now();
      this.feedAdd(`${esc(p.name)} disconnected…`, 'sys');
      if (t.phase === 'choose') t.gate.open(TIMEOUT);
    }
    this.renderPlayers();
  }

  // ---------------------------------------------------------------- DOM

  build() {
    const s = this.G.env.stage;
    s.innerHTML = '';
    this.G.env.root.classList.add('busy');
    this.el = el('div', 'dg', s, `
      <header class="dg-top">
        <div class="dd-logo small">${logoHtml()}</div>
        <div class="dg-hint"><div class="dg-timer-slot"></div><div class="dg-mask"></div><div class="dg-len"></div></div>
        <div class="dg-round"></div>
      </header>
      <aside class="dg-players dd-card"><div class="dd-card-title">Players</div><div class="dg-plist"></div></aside>
      <main class="dg-center">
        <div class="dg-holder">
          <div class="dg-sheet"><canvas></canvas><div class="dg-overlay" hidden></div><i class="dd-tape l"></i><i class="dd-tape r"></i></div>
        </div>
        <div class="dg-artist"></div>
      </main>
      <aside class="dg-feed dd-card"><div class="dd-card-title">Guesses</div><div class="dg-flist"></div></aside>
      <div class="dg-reveal" hidden></div>`);
    const q = (sel) => this.el.querySelector(sel);
    this.roundEl = q('.dg-round');
    this.maskEl = q('.dg-mask');
    this.lenEl = q('.dg-len');
    this.plist = q('.dg-plist');
    this.feedList = q('.dg-flist');
    this.sheet = q('.dg-sheet');
    this.sheetHolder = q('.dg-holder');
    this.overlay = q('.dg-overlay');
    this.artistEl = q('.dg-artist');
    this.revealEl = q('.dg-reveal');
    this.timer = makeTimer(q('.dg-timer-slot'));
    this.surface = new Surface(q('canvas'));
    this.live = new LivePlayer(this.surface);
    const fit = () => fitBox(this.sheet, this.sheetHolder, ASPECT, 4);
    const ro = new ResizeObserver(fit);
    ro.observe(this.sheetHolder);
    fit();
    this.cleanups.push(() => ro.disconnect());
    this.cleanups.push(this.G.onFrame(() => {
      this.live.step();
      const t = this.t;
      if (t && t.phase === 'choose') this.timer.set(t.endsAt - Date.now(), CHOOSE_MS, { tick: false });
    }));
  }

  renderRound() {
    this.roundEl.innerHTML = `<span>Round <b>${this.round}</b>/${this.rounds}</span><small>Turn ${Math.max(1, this.turnNo)} of ${this.totalTurns}</small>`;
  }

  renderArtist() {
    const t = this.t;
    const p = t && this.ctx.player(t.artist);
    this.artistEl.innerHTML = p ? `${chip(p)} <span>${t.phase === 'choose' ? 'is up next' : 'is drawing'}</span>` : '';
  }

  renderMask(fresh = false) {
    const t = this.t;
    const prev = this.prevMask || '';
    this.maskEl.innerHTML = [...t.mask].map((ch, i) => {
      if (ch === ' ') return '<span class="sp"></span>';
      if (ch === '_') return '<span class="ch"></span>';
      if (!isLetter(ch)) return `<span class="pn">${esc(ch)}</span>`;
      const isNew = !fresh && prev[i] === '_';
      return `<span class="ch on ${isNew ? 'new' : ''}">${esc(ch)}</span>`;
    }).join('');
    this.maskEl.classList.toggle('long', t.mask.length > 14);
    this.prevMask = t.mask;
  }

  renderPlayers(final = false) {
    const t = this.t;
    const all = this.ctx.allPlayers().filter((p) => p.connected || (this.scores.get(p.id) || 0) > 0);
    all.sort((a, b) => (this.scores.get(b.id) || 0) - (this.scores.get(a.id) || 0) || a.index - b.index);
    const MAX = 16;
    const shown = all.slice(0, all.length > MAX ? MAX - 1 : MAX);
    this.plist.classList.toggle('compact', all.length > 8);
    let rank = 0;
    let lastScore = null;
    this.plist.innerHTML = shown.map((p, i) => {
      const sc = this.scores.get(p.id) || 0;
      if (sc !== lastScore) { rank = i + 1; lastScore = sc; }
      const isArtist = t && p.id === t.artist;
      const g = t?.guessed.get(p.id);
      const gain = t?.gains.get(p.id);
        const plus = (final || g) && gain ? `<span class="plus">+${gain}</span>` : '';
      const badge = isArtist && !plus ? `<span class="badge">${doodleSvg('pencil', '#ff8a1f', 9)}</span>` : g && !plus ? `<span class="badge ok">${doodleSvg('check', '#22a45d', 13)}</span>` : '';
      return `<div class="pl-row ${isArtist ? 'artist' : ''} ${g ? 'guessed' : ''} ${p.connected ? '' : 'gone'}" data-id="${esc(p.id)}" style="--c:${p.color}">
        <span class="rk">${sc > 0 ? `#${rank}` : ''}</span>${avatar(p)}<span class="nm">${esc(p.name)}</span>${plus}${badge}<span class="sc">${sc}</span></div>`;
    }).join('') + (all.length > shown.length ? `<div class="pl-more">+${all.length - shown.length} more</div>` : '');
  }

  feedAdd(html, cls) {
    const row = el('div', `fd ${cls}`, this.feedList, html);
    while (this.feedList.children.length > 40) this.feedList.firstChild.remove();
    return row;
  }

  showReveal(reason) {
    const t = this.t;
    const artist = this.ctx.player(t.artist);
    const n = t.guessed.size;
    const guessers = this.ctx.players().filter((p) => p.id !== t.artist).length;
    let sub;
    if (reason === 'left') sub = `${esc(artist?.name)} left the game. No harm done!`;
    else if (n === 0) sub = 'Nobody got it!';
    else if (reason === 'all') sub = 'Everyone got it!';
    else sub = `${n} of ${Math.max(n, guessers)} guessed it!`;
    const gains = [...t.gains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const len = t.word.length;
    const blank = this.surface.isBlank();
    this.revealEl.innerHTML = `
      <div class="dg-rev-card dd-card">
        <i class="dd-tape l"></i><i class="dd-tape r"></i>
        ${blank ? '' : '<div class="dg-rev-pic"><canvas width="400" height="500"></canvas></div>'}
        <div class="dg-rev-main">
        <div class="dg-rev-label">The word was</div>
        <div class="dg-rev-word ${len > 12 ? 'long' : ''} ${len > 18 ? 'xlong' : ''}">${esc(t.word.toUpperCase())}</div>
        ${underline(n ? '#5fd35b' : '#ef3e36')}
        <div class="dg-rev-sub">${sub}</div>
        <div class="dg-rev-gains">${gains.map(([id, pts]) => {
          const p = this.ctx.player(id);
          return p ? `<div class="gain ${id === t.artist ? 'art' : ''}">${avatar(p)}<b>${esc(p.name)}</b><span>+${pts}</span>${id === t.artist ? '<em>artist</em>' : ''}</div>` : '';
        }).join('')}</div>
        </div>
      </div>`;
    const pic = this.revealEl.querySelector('.dg-rev-pic canvas');
    if (pic) {
      const g = pic.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(this.surface.canvas, 0, 0, pic.width, pic.height);
    }
    this.revealEl.hidden = false;
    if (n > 0) {
      sfx.play('win');
      this.G.env.confetti.rain(n === guessers ? 180 : 90);
    } else {
      sfx.play('lose');
    }
  }

  hideReveal() {
    this.revealEl.hidden = true;
    this.revealEl.innerHTML = '';
  }

  destroy() {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }
}
