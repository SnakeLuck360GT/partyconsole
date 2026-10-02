// Telephone — TV side. Everyone plays simultaneously: write → draw → describe → draw …, then chains replay on the TV.
import { sfx } from '../../sdk/audio.js';
import { Surface, Replayer, packOps, unpackOps, opsBlank, renderThumb, ASPECT } from './draw-core.js';
import { promptIdeas } from './text.js';
import { TIMEOUT, el, esc, shuffled, fitBox } from './util.js';
import { floatEmoji, doodleSvg } from './fx.js';
import { logoHtml, chip, avatar, makeTimer } from './tv-ui.js';

const DUR = { write: 40000, draw: 60000, describe: 30000 };
const GRACE_MS = 3000;
const MAX_STEPS = 6;
const MAX_CHAINS_SHOWN = 8;
const VOTE_EMOJI = ['❤️', '😂', '😮', '🔥'];
const HEART = (c = '#e8443a') => doodleSvg('heart', c, 9);
const KIND_INFO = {
  write: { title: 'Write a prompt', short: 'Write', text: 'Something fun to draw: a thing, a scene, a silly situation.', art: 'pencil', color: '#ff8a1f' },
  draw: { title: 'Draw it', short: 'Draw', text: 'Your phone shows someone else\'s prompt. Draw it. No letters!', art: 'smile', color: '#2f5bea' },
  describe: { title: 'What is it?', short: 'Describe', text: 'Your phone shows someone\'s drawing. Describe what you see.', art: 'bubble', color: '#22a45d' },
};

export class Telephone {
  constructor(G) {
    this.G = G;
    this.ctx = G.ctx;
    this.R = G.R;
    this.cleanups = [];
    this.st = null;
    this.cur = null;
    this.stage = 'steps';
    this.lastReact = new Map();
    this.votes = new Map(); // pid → votes received
  }

  async run() {
    const players = shuffled(this.ctx.players());
    this.seats = players.map((p) => p.id);
    this.seatOf = new Map(this.seats.map((id, k) => [id, k]));
    const P = this.seats.length;
    this.P = P;
    this.N = Math.min(P, MAX_STEPS);
    const pool = shuffled(Array.from({ length: Math.max(0, P - 1) }, (_, i) => i + 1));
    this.offsets = [0, ...pool.slice(0, this.N - 1)];
    this.chains = this.seats.map((id) => ({ owner: id, entries: [] }));
    for (const id of this.seats) this.votes.set(id, 0);
    this.G.setPhase(this.phaseObj());

    for (let s = 0; s < this.N; s++) {
      if (this.R.dead) return null;
      await this.step(s);
    }
    if (this.R.dead) return null;
    await this.playback();
    if (this.R.dead) return null;
    return this.seats.map((id) => this.ctx.player(id)).filter(Boolean)
      .map((p) => ({ player: p, score: this.votes.get(p.id) || 0, label: 'votes' }))
      .sort((a, b) => b.score - a.score);
  }

  kindOf(s) { return s === 0 ? 'write' : s % 2 === 1 ? 'draw' : 'describe'; }

  chainFor(pid, s) {
    const k = this.seatOf.get(pid);
    if (k === undefined) return null;
    return this.chains[(k - this.offsets[s] + this.P) % this.P];
  }

  lastText(chain) {
    for (let i = chain.entries.length - 1; i >= 0; i--) {
      const e = chain.entries[i];
      if (e.kind === 'text' && !e.missing) return e.text;
    }
    return chain.entries.find((e) => e.kind === 'text')?.text ?? 'anything you like';
  }

  lastDrawing(chain) {
    for (let i = chain.entries.length - 1; i >= 0; i--) {
      const e = chain.entries[i];
      if (e.kind === 'drawing' && !e.empty) return e.ops;
    }
    return [];
  }

  // ---------------------------------------------------------------- steps

  async step(s) {
    const kind = this.kindOf(s);
    const dur = DUR[kind];
    const st = { s, kind, dur, start: Date.now(), endsAt: Date.now() + dur, subs: new Map(), drafts: new Map(), inputs: new Map(), ideas: new Map(), timeUp: false };
    this.st = st;
    for (const pid of this.seats) {
      const chain = this.chainFor(pid, s);
      if (kind === 'draw') st.inputs.set(pid, this.lastText(chain));
      if (kind === 'describe') st.inputs.set(pid, this.lastDrawing(chain));
      if (kind === 'write') st.ideas.set(pid, promptIdeas(8));
    }
    this.buildStep();
    if (s > 0) sfx.play('whoosh');
    this.G.refreshViews();

    st.gate = this.R.gate(dur);
    const stop = this.R.every(250, () => this.tickStep());
    let r = await st.gate.promise;
    if (this.R.dead) return;
    if (r === TIMEOUT) {
      // ask phones that haven't submitted to send what they have, give them a moment
      st.timeUp = true;
      for (const pid of this.seats) if (!st.subs.has(pid)) this.G.send(pid, { type: 'timeUp', step: s });
      st.gate = this.R.gate(GRACE_MS);
      this.tickStep();
      r = await st.gate.promise;
      if (this.R.dead) return;
    }
    stop();
    // commit entries
    for (const pid of this.seats) {
      const chain = this.chainFor(pid, s);
      let sub = st.subs.get(pid) || st.drafts.get(pid);
      if (kind === 'drawing' || kind === 'draw') {
        const ops = sub?.ops || [];
        chain.entries.push({ kind: 'drawing', by: pid, ops, empty: opsBlank(ops), missing: !sub, votes: 0 });
      } else {
        let text = (sub?.text || '').trim();
        let missing = false;
        if (!text) {
          missing = kind !== 'write';
          text = kind === 'write' ? st.ideas.get(pid)[0] : '';
          sub = null;
        }
        chain.entries.push({ kind: 'text', by: pid, text, missing, auto: kind === 'write' && !st.subs.has(pid) && !st.drafts.get(pid)?.text, votes: 0, desc: kind === 'describe' });
      }
    }
    this.G.setPhase(this.phaseObj());
    this.G.refreshViews();
    if (s < this.N - 1) {
      await this.G.banner(`Pass it on!<small>Next: ${KIND_INFO[this.kindOf(s + 1)].title}</small>`, 1500);
    } else {
      await this.G.banner('Time for the big reveal!', 1700);
    }
  }

  tickStep() {
    const st = this.st;
    if (!st) return;
    const now = Date.now();
    this.timer?.set(Math.max(0, st.endsAt - now), st.dur, { tick: !st.timeUp });
    const active = this.seats.filter((id) => this.G.isConnected(id));
    const pending = active.filter((id) => !st.subs.has(id));
    if (!pending.length && !st.allDoneAt) {
      st.allDoneAt = now;
      this.R.after(900, () => {
        const still = this.seats.filter((id) => this.G.isConnected(id) && !st.subs.has(id));
        if (!still.length) st.gate.open('all');
        else st.allDoneAt = null;
      });
    }
  }

  onSubmit(pid, m, final) {
    const st = this.st;
    if (!st || m.step !== st.s || !this.seatOf.has(pid)) return;
    let sub;
    if (st.kind === 'draw') {
      const ops = unpackOps(m.ops);
      sub = { ops };
    } else {
      const text = String(m.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (final && !text && !st.timeUp) return;
      sub = { text };
    }
    if (final) {
      const was = st.subs.has(pid);
      st.subs.set(pid, sub);
      if (!was) { sfx.play('blip'); this.G.vibrate(pid, 'success'); }
      this.renderProgress();
      this.G.sendView(pid);
      if (st.timeUp && this.seats.every((id) => st.subs.has(id) || !this.G.isConnected(id))) st.gate.open('grace-done');
    } else {
      st.drafts.set(pid, sub);
    }
  }

  // ---------------------------------------------------------------- views / messages

  phaseObj() {
    return {
      view: (pid, hello) => this.view(pid, hello),
      onMessage: (pid, m) => this.onMessage(pid, m),
      onJoin: () => { if (this.stage === 'steps') this.renderProgress(); },
      onLeave: () => { if (this.stage === 'steps') this.renderProgress(); },
      onAdminMaybeChanged: () => { if (this.stage === 'play') { this.renderPlayHint(); this.G.refreshViews(); } },
    };
  }

  view(pid, hello) {
    const seat = this.seatOf.has(pid);
    if (this.stage === 'play') {
      const c = this.cur;
      const own = c?.entry && c.entry.by === pid;
      return {
        kind: 'tp-play', key: 'tp-play', admin: pid === this.ctx.adminId, own: !!own,
        voted: c?.entry ? c.voters.has(pid) : false, canVote: !!c?.entry && !own,
        what: c?.entry ? (c.entry.kind === 'drawing' ? 'drawing' : 'caption') : null,
        replaying: !!c?.replaying, votes: this.votes.get(pid) || 0,
      };
    }
    const st = this.st;
    if (!seat) {
      return { kind: 'wait', key: 'tp-spec', art: 'eye', title: 'You\'re spectating', sub: 'This round started before you joined. You\'ll be in the next one!' };
    }
    if (!st || st.gate?.done) {
      return { kind: 'wait', key: `tp-between-${st?.s ?? 0}`, art: 'arrow', title: 'Passing it on…', sub: 'Look at the TV' };
    }
    const done = st.subs.has(pid);
    const doneCount = this.seats.filter((id) => st.subs.has(id)).length;
    const base = { step: st.s, steps: this.N, endsIn: Math.max(0, st.endsAt - Date.now()), total: st.dur, done, doneCount, of: this.seats.length };
    const draft = st.subs.get(pid) || st.drafts.get(pid);
    if (st.kind === 'write') return { kind: 'tp-write', key: `tp-w${st.s}`, ...base, ideas: st.ideas.get(pid), draft: draft?.text || '' };
    if (st.kind === 'draw') {
      return { kind: 'tp-draw', key: `tp-d${st.s}`, ...base, prompt: st.inputs.get(pid), restore: hello && draft?.ops ? packOps(draft.ops) : null };
    }
    const ops = st.inputs.get(pid) || [];
    return { kind: 'tp-describe', key: `tp-s${st.s}`, ...base, drawing: packOps(ops), blank: opsBlank(ops), draft: draft?.text || '' };
  }

  onMessage(pid, m) {
    switch (m.type) {
      case 'submit': this.onSubmit(pid, m, true); break;
      case 'draft': this.onSubmit(pid, m, false); break;
      case 'unsubmit': {
        const st = this.st;
        if (st && m.step === st.s && !st.timeUp && st.subs.has(pid)) {
          st.drafts.set(pid, st.subs.get(pid));
          st.subs.delete(pid);
          this.renderProgress();
          this.G.sendView(pid);
        }
        break;
      }
      case 'react': this.onReact(pid, m.e); break;
      case 'nav':
        if (pid === this.ctx.adminId && this.navGate && ['next', 'skip', 'end'].includes(m.a)) this.onNav(m.a);
        break;
      default:
    }
  }

  onNav(a) {
    const c = this.cur;
    if (a === 'next' && c?.replayer && !c.replayer.done) { c.replayer.finish(); return; }
    this.navGate.open(a);
  }

  onReact(pid, e) {
    if (this.stage !== 'play' || !VOTE_EMOJI.includes(e)) return;
    const now = Date.now();
    if (now - (this.lastReact.get(pid) || 0) < 350) return;
    this.lastReact.set(pid, now);
    const c = this.cur;
    const p = this.ctx.player(pid);
    if (c?.entry && c.entry.by !== pid && !c.voters.has(pid)) {
      c.voters.add(pid);
      c.entry.votes++;
      this.votes.set(c.entry.by, (this.votes.get(c.entry.by) || 0) + 1);
      this.renderVotes();
      this.G.sendView(pid);
      sfx.play('coin');
      this.G.vibrate(c.entry.by, 'tap');
    }
    const r = this.focusEl?.getBoundingClientRect();
    const rootR = this.wrap.getBoundingClientRect();
    if (r) floatEmoji(this.wrap, HEART(p?.color), r.left - rootR.left + r.width * (0.1 + Math.random() * 0.8), r.bottom - rootR.top - 40, esc(p?.name ?? ''));
  }

  // ---------------------------------------------------------------- step DOM

  buildStep() {
    const st = this.st;
    const info = KIND_INFO[st.kind];
    const s = this.G.env.stage;
    s.innerHTML = '';
    this.G.env.root.classList.add('busy');
    this.wrap = el('div', 'tp', s, `
      <header class="tp-top">
        <div class="dd-logo small">${logoHtml()}</div>
        <div class="tp-steptitle">Step <b>${st.s + 1}</b> of ${this.N}</div>
        <div class="tp-timer-slot"></div>
      </header>
      <div class="tp-track">${Array.from({ length: this.N }, (_, i) => {
        const k = this.kindOf(i);
        return `<div class="tk ${i < st.s ? 'done' : ''} ${i === st.s ? 'now' : ''}" style="--c:${KIND_INFO[k].color}"><span>${i < st.s ? doodleSvg('check', '#fff', 14) : doodleSvg(KIND_INFO[k].art, i === st.s ? '#fff' : '#9a95a6', 8)}</span><small>${KIND_INFO[k].short}</small></div>${i < this.N - 1 ? '<i class="tk-line"></i>' : ''}`;
      }).join('')}</div>
      <div class="tp-instr dd-card">
        <i class="dd-tape l"></i>
        <div class="tp-instr-art">${doodleSvg(info.art, info.color, 6)}</div>
        <div><h1>${info.title}</h1><p>${info.text}</p></div>
      </div>
      <div class="tp-grid"></div>
      <div class="tp-progress"><div class="bar"><i></i></div><span></span></div>`);
    this.timer = makeTimer(this.wrap.querySelector('.tp-timer-slot'));
    this.grid = this.wrap.querySelector('.tp-grid');
    this.renderProgress();
  }

  renderProgress() {
    const st = this.st;
    if (!st || !this.grid || this.stage !== 'steps') return;
    const n = this.seats.length;
    this.grid.classList.toggle('big', n <= 8);
    this.grid.classList.toggle('compact', n > 16);
    this.grid.classList.toggle('tiny', n > 36);
    this.grid.innerHTML = this.seats.map((id) => {
      const p = this.ctx.player(id);
      if (!p) return '';
      const done = st.subs.has(id);
      return `<div class="tp-p ${done ? 'done' : ''} ${p.connected ? '' : 'gone'}" style="--c:${p.color}">${avatar(p)}<b>${esc(p.name)}</b><span class="st">${done ? doodleSvg('check', '#22a45d', 14) : '<i class="dots"><i></i><i></i><i></i></i>'}</span></div>`;
    }).join('');
    const done = this.seats.filter((id) => st.subs.has(id)).length;
    this.wrap.querySelector('.tp-progress i').style.width = `${(done / Math.max(1, n)) * 100}%`;
    this.wrap.querySelector('.tp-progress span').textContent = `${done} / ${n} done`;
    // keep phones' "x / y done" fresh, but not on every single submit in huge rooms
    if (!this.progressPending) {
      this.progressPending = true;
      this.R.after(800, () => {
        this.progressPending = false;
        if (this.st === st && !st.gate?.done) {
          const count = this.seats.filter((id) => st.subs.has(id)).length;
          for (const id of this.seats) if (st.subs.has(id)) this.G.send(id, { type: 'progress', doneCount: count, of: n });
        }
      });
    }
  }

  // ---------------------------------------------------------------- playback

  chooseChains() {
    const chains = this.chains.filter((c) => c.entries.length);
    if (chains.length <= MAX_CHAINS_SHOWN) return shuffled(chains);
    const covered = new Set();
    const pool = shuffled(chains);
    const out = [];
    while (out.length < MAX_CHAINS_SHOWN && pool.length) {
      let best = 0;
      let bestScore = -1;
      pool.forEach((c, i) => {
        const fresh = new Set(c.entries.map((e) => e.by).filter((id) => !covered.has(id))).size;
        const hasArt = c.entries.some((e) => e.kind === 'drawing' && !e.empty) ? 0.5 : 0;
        if (fresh + hasArt > bestScore) { bestScore = fresh + hasArt; best = i; }
      });
      const [c] = pool.splice(best, 1);
      c.entries.forEach((e) => covered.add(e.by));
      out.push(c);
    }
    return out;
  }

  async playback() {
    this.stage = 'play';
    this.st = null;
    const shown = this.chooseChains();
    this.buildPlay();
    this.G.setPhase(this.phaseObj());
    let endAll = false;
    for (let ci = 0; ci < shown.length && !endAll; ci++) {
      const chain = shown[ci];
      const owner = this.ctx.player(chain.owner);
      this.titleEl.innerHTML = `Chain <b>${ci + 1}</b> of ${shown.length} <span>· started by</span> ${chip(owner)}${this.chains.length > shown.length ? `<small>(${shown.length} of ${this.chains.length} chains)</small>` : ''}`;
      this.trail.innerHTML = '';
      this.body.classList.remove('overview');
      for (let i = 0; i < chain.entries.length; i++) {
        const entry = chain.entries[i];
        const auto = entry.kind === 'drawing' ? 10000 : 6500;
        this.showEntry(chain, i);
        this.G.refreshViews();
        this.navGate = this.R.gate(auto);
        this.autoBar(auto);
        const r = await this.navGate.promise;
        if (this.R.dead) return;
        this.cur.replayer?.finish();
        this.cur = { entry: null, voters: new Set() };
        if (r === 'skip') break;
        if (r === 'end') { endAll = true; break; }
        this.pushTrail(chain, i);
      }
      if (endAll) break;
      // overview of the whole chain
      this.showOverview(chain);
      this.G.refreshViews();
      this.navGate = this.R.gate(8000);
      this.autoBar(8000);
      const r = await this.navGate.promise;
      if (this.R.dead) return;
      if (r === 'end') endAll = true;
    }
    this.navGate = null;
    await this.showAwards();
  }

  buildPlay() {
    const s = this.G.env.stage;
    s.innerHTML = '';
    this.G.env.root.classList.add('busy');
    this.wrap = el('div', 'tpp', s, `
      <header class="tp-top">
        <div class="dd-logo small">${logoHtml()}</div>
        <div class="tpp-title"></div>
        <div class="tpp-hint"></div>
      </header>
      <div class="tpp-body"><div class="tpp-trail"></div><div class="tpp-focus"></div></div>
      <div class="tpp-auto"><i></i></div>`);
    this.titleEl = this.wrap.querySelector('.tpp-title');
    this.trail = this.wrap.querySelector('.tpp-trail');
    this.body = this.wrap.querySelector('.tpp-body');
    this.focusEl = this.wrap.querySelector('.tpp-focus');
    this.autoEl = this.wrap.querySelector('.tpp-auto i');
    this.renderPlayHint();
    this.cur = { entry: null, voters: new Set() };
    this.cleanups.push(this.G.onFrame((now) => {
      const c = this.cur;
      if (c?.replayer && !c.replayer.done) {
        if (c.replayer.step(now)) { c.replaying = false; this.G.refreshViews(); }
      }
    }));
  }

  renderPlayHint() {
    const h = this.wrap?.querySelector('.tpp-hint');
    if (h) h.innerHTML = `Vote on your phone · <b>${esc(this.G.adminName())}</b> can skip ahead`;
  }

  autoBar(ms) {
    const bar = this.autoEl;
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = `width ${ms}ms linear`;
    bar.style.width = '100%';
  }

  whoLine(entry, idx) {
    const p = this.ctx.player(entry.by);
    const verb = entry.kind === 'drawing' ? 'drew' : idx === 0 ? 'wrote' : 'thought it was';
    return `${chip(p)} <span>${verb}</span>`;
  }

  showEntry(chain, i) {
    const entry = chain.entries[i];
    this.body.classList.remove('overview');
    this.focusEl.innerHTML = '';
    this.cur = { entry, voters: new Set(), replaying: false };
    const card = el('div', `tpp-entry ${entry.kind}`, this.focusEl);
    if (entry.kind === 'text') {
      const len = entry.text.length;
      card.innerHTML = `
        <div class="who">${this.whoLine(entry, i)}</div>
        <div class="tpp-bubble dd-card ${i === 0 ? 'first' : ''}">
          <div class="txt ${len > 40 ? 'long' : ''} ${len > 60 ? 'xlong' : ''}">${entry.missing ? '<em>…ran out of time</em>' : `“${esc(entry.text)}”`}</div>
          ${entry.auto ? '<div class="auto">(a random prompt was picked)</div>' : ''}
        </div>
        <div class="tpp-votes"></div>`;
      sfx.play(i === 0 ? 'blip' : 'whoosh');
    } else {
      card.innerHTML = `
        <div class="who">${this.whoLine(entry, i)}</div>
        <div class="tpp-holder"><div class="tpp-sheet"><canvas></canvas><i class="dd-tape l"></i><i class="dd-tape r"></i>${entry.empty ? '<div class="tpp-empty">(left blank)</div>' : ''}</div></div>
        <div class="tpp-votes"></div>`;
      const holder = card.querySelector('.tpp-holder');
      const sheet = card.querySelector('.tpp-sheet');
      const fit = () => fitBox(sheet, holder, ASPECT, 0);
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(holder);
      this.cleanups.push(() => ro.disconnect());
      const surf = new Surface(card.querySelector('canvas'));
      if (!entry.empty) {
        this.cur.replayer = new Replayer(surf, entry.ops, 3800);
        this.cur.replaying = true;
      }
      sfx.play('whoosh');
    }
    this.renderVotes();
  }

  renderVotes() {
    const v = this.focusEl?.querySelector('.tpp-votes');
    if (v && this.cur?.entry) v.innerHTML = this.cur.entry.votes ? `${HEART()} <b>${this.cur.entry.votes}</b> vote${this.cur.entry.votes === 1 ? '' : 's'}` : '<span class="muted">Like it? Vote on your phone</span>';
  }

  miniCard(entry, big = false) {
    const p = this.ctx.player(entry.by);
    const node = document.createElement('div');
    node.className = `tpp-mini ${entry.kind} ${big ? 'big' : ''}`;
    if (entry.kind === 'text') {
      node.innerHTML = `<div class="mt">${entry.missing ? '<em>(no answer)</em>' : `“${esc(entry.text)}”`}</div><div class="mb">${avatar(p)}<span>${esc(p?.name ?? '?')}</span>${entry.votes ? ` <span class="v">${HEART()}${entry.votes}</span>` : ''}</div>`;
    } else {
      node.innerHTML = `<canvas width="${big ? 320 : 160}" height="${big ? 400 : 200}"></canvas><div class="mb">${avatar(p)}<span>${esc(p?.name ?? '?')}</span>${entry.votes ? ` <span class="v">${HEART()}${entry.votes}</span>` : ''}</div>`;
      renderThumb(node.querySelector('canvas'), entry.ops);
    }
    return node;
  }

  pushTrail(chain, i) {
    const card = this.miniCard(chain.entries[i]);
    card.classList.add('in');
    this.trail.appendChild(card);
    while (this.trail.children.length > 4) this.trail.firstChild.remove();
  }

  showOverview(chain) {
    this.body.classList.add('overview');
    this.trail.innerHTML = '';
    this.focusEl.innerHTML = '';
    const strip = el('div', 'tpp-strip', this.focusEl);
    chain.entries.forEach((e, i) => {
      const c = this.miniCard(e, true);
      c.style.setProperty('--i', i);
      strip.appendChild(c);
      if (i < chain.entries.length - 1) el('div', 'tpp-arrow', strip, doodleSvg('arrow', '#23212e', 7)).style.setProperty('--i', i);
    });
    const first = chain.entries[0];
    const last = [...chain.entries].reverse().find((e) => e.kind === 'text' && !e.missing);
    el('div', 'tpp-summary', this.focusEl, last && last !== first
      ? `From <b>“${esc(first.text)}”</b> to <b>“${esc(last.text)}”</b>`
      : 'What a journey!');
    sfx.play('powerup');
    const r = this.focusEl.getBoundingClientRect();
    this.G.env.confetti.burst(r.left + r.width / 2, r.top + r.height * 0.8, 50, 0.9);
  }

  async showAwards() {
    this.cur = { entry: null, voters: new Set() };
    const all = this.chains.flatMap((c) => c.entries);
    const drawings = all.filter((e) => e.kind === 'drawing' && !e.empty).sort((a, b) => b.votes - a.votes);
    const texts = all.filter((e) => e.kind === 'text' && !e.missing && e.desc).sort((a, b) => b.votes - a.votes);
    const topD = drawings[0]?.votes ? drawings[0] : null;
    const topT = texts[0]?.votes ? texts[0] : null;
    if (!topD && !topT) return;
    this.titleEl.innerHTML = 'Crowd favourites';
    this.trail.innerHTML = '';
    this.body.classList.add('overview');
    this.focusEl.innerHTML = '';
    const box = el('div', 'tpp-awards', this.focusEl);
    const award = (e, title) => {
      const a = el('div', 'tpp-award', box, `<div class="aw-title">${title}</div>`);
      a.appendChild(this.miniCard(e, true));
      el('div', 'aw-votes', a, `${HEART()} ${e.votes} vote${e.votes === 1 ? '' : 's'}`);
    };
    if (topD) award(topD, 'Best drawing');
    if (topT) award(topT, 'Best caption');
    sfx.play('win');
    this.G.env.confetti.rain(160);
    this.G.refreshViews();
    this.navGate = this.R.gate(7000);
    this.autoBar(7000);
    await this.navGate.promise;
    this.navGate = null;
  }

  destroy() {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }
}
