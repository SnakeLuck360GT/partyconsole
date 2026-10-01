// Brain Brawl — TV quiz-show trivia for any number of players. The screen is authoritative: it runs the show,
// scores answers and sends each phone a personalised state message on every phase change.
import { sfx } from '../../sdk/audio.js';
import { loadBank } from './bank.js';
import { LENGTHS, catStyle } from './shared.js';
import { createUI, loadFonts } from './ui.js';
import { titleView, introView, voteView, wheelView, questionView, boardView, numberLineView, finalView, ROUND_INFO } from './views.js';

const ABORT = Symbol('abort');

// Show plans. kind: classic | tf | num. `final` = double points. `closer` = extra closest-number question at the end.
const PLANS = {
  short: [
    { kind: 'classic', n: 3, vote: true },
    { kind: 'tf', n: 5 },
    { kind: 'num', n: 2 },
    { kind: 'classic', n: 3, vote: true, final: true },
  ],
  normal: [
    { kind: 'classic', n: 4, vote: true },
    { kind: 'tf', n: 5 },
    { kind: 'classic', n: 4, vote: true },
    { kind: 'num', n: 2 },
    { kind: 'classic', n: 3, vote: true, final: true, closer: 1 },
  ],
  long: [
    { kind: 'classic', n: 5, vote: true },
    { kind: 'tf', n: 5 },
    { kind: 'classic', n: 5, vote: true },
    { kind: 'num', n: 3 },
    { kind: 'tf', n: 5 },
    { kind: 'classic', n: 4, vote: true },
    { kind: 'classic', n: 3, vote: true, final: true, closer: 1 },
  ],
};

const T = {
  titleAuto: 90000,
  intro: 4200,
  vote: 12000,
  classic: 15000,
  tf: 6000,
  num: 20000,
  revealClassic: 4300,
  revealTF: 2300,
  revealNum: 6200,
  board: 5200,
};

export default async function start(ctx) {
  const [bank] = await Promise.all([loadBank(ctx.asset('questions.json')), loadFonts()]);
  const game = new Game(ctx, bank);
  game.run();
  return { destroy: () => game.destroy() };
}

class Game {
  constructor(ctx, bank) {
    this.ctx = ctx;
    this.bank = bank;
    this.ui = createUI(ctx.container);
    this.recs = new Map();
    this.settings = { length: 'normal' };
    this.phase = { name: 'boot', pub: {} };
    this.gate = null;
    this.dead = false;
    this.runId = 0;
    this.seq = 0;
    this.cur = null;
    this.vote = null;
    this.started = false;
    this.lastChime = 0;
    this.timers = new Set();

    ctx.players().forEach((p) => this.rec(p.id));
    ctx.onMessage((id, msg) => { if (!this.dead) this.onMessage(id, msg); });
    ctx.onJoin((p, { rejoin }) => { if (!this.dead) this.onJoin(p, rejoin); });
    ctx.onLeave(() => { if (!this.dead) this.onLeave(); });
  }

  // ---------------------------------------------------------------- players

  rec(id) {
    let r = this.recs.get(id);
    if (!r) {
      r = { id, score: 0, streak: 0, best: 0, right: 0, lastOk: null, lateFor: -1, res: null, rank: 0, of: 0, welcomed: false };
      this.recs.set(id, r);
    }
    return r;
  }

  info(id) {
    return this.ctx.player(id) || { id, name: '?', color: '#888', avatar: '❔', connected: false };
  }

  /** All ranked entries best-first, competition ranking (1,2,2,4). */
  standings(scoreKey = 'score') {
    const list = [...this.recs.values()]
      .map((rec) => ({ rec, p: this.info(rec.id) }))
      .filter((e) => e.p.connected || e.rec.score > 0 || e.rec.right > 0)
      .sort((a, b) => b.rec[scoreKey] - a.rec[scoreKey] || a.p.index - b.p.index);
    let rank = 0;
    list.forEach((e, i) => {
      if (i === 0 || e.rec[scoreKey] !== list[i - 1].rec[scoreKey]) rank = i + 1;
      e.rank = rank;
    });
    return list;
  }

  updateRanks() {
    const s = this.standings();
    for (const e of s) { e.rec.rank = e.rank; e.rec.of = s.length; }
    return s;
  }

  snapshot() {
    this.updateRanks();
    for (const r of this.recs.values()) { r.prevScore = r.score; r.prevRank = r.rank; r.roundGain = 0; }
  }

  eligible() {
    const seq = this.cur?.seq;
    return this.ctx.players().filter((p) => this.rec(p.id).lateFor !== seq);
  }

  // ---------------------------------------------------------------- phone messaging

  setPhase(name, pub = {}) {
    this.phase = { name, pub };
    this.pushAll();
  }

  stateFor(id) {
    const r = this.rec(id);
    const { name, pub } = this.phase;
    const msg = { type: 'state', phase: name, ...pub, me: { score: r.score, rank: r.rank, of: r.of, streak: r.streak } };
    if (name === 'title') msg.length = this.settings.length;
    if (name === 'vote') msg.myVote = this.vote?.votes.get(id) ?? null;
    if ((name === 'read' || name === 'answer') && this.cur) {
      msg.late = r.lateFor === this.cur.seq;
      const a = this.cur.answers.get(id);
      msg.myAnswer = a ? (a.value ?? a.choice) : null;
      if (name === 'answer') msg.remaining = Math.max(0, this.cur.openedAt + this.cur.dur - performance.now());
    }
    if (name === 'reveal') msg.res = r.res;
    if (name === 'board') msg.me.delta = (r.prevRank || r.rank) - r.rank;
    if (name === 'final') msg.stats = { right: r.right, best: r.best };
    return msg;
  }

  push(id) { this.ctx.send(id, this.stateFor(id)); }
  pushAll() { for (const p of this.ctx.players()) this.push(p.id); }

  // ---------------------------------------------------------------- waits (all skippable & abortable)

  wait(ms, { tag = '' } = {}) {
    const run = this.runId;
    return new Promise((resolve, reject) => {
      let done = false;
      const g = {
        tag,
        finish: (why) => {
          if (done) return;
          done = true;
          clearTimeout(t);
          if (this.gate === g) this.gate = null;
          if (this.dead || run !== this.runId) reject(ABORT); else resolve(why);
        },
      };
      const t = setTimeout(() => g.finish('timeout'), ms);
      this.gate?.finish('superseded');
      this.gate = g;
    });
  }

  // ---------------------------------------------------------------- input

  onMessage(id, msg) {
    if (!msg || typeof msg !== 'object') return;
    const isAdmin = id === this.ctx.adminId;
    switch (msg.type) {
      case 'hello':
        this.rec(id);
        this.updateRanks();
        this.push(id);
        this.welcome(id);
        break;
      case 'setting':
        if (isAdmin && this.phase.name === 'title' && LENGTHS[msg.length]) {
          this.settings.length = msg.length;
          sfx.play('click');
          this.titleCtl?.update({ length: msg.length });
          this.pushAll();
        }
        break;
      case 'start':
        if (isAdmin && this.phase.name === 'title') this.gate?.finish('start');
        break;
      case 'skip':
        if (isAdmin && this.gate && this.phase.name !== 'results') { sfx.play('blip'); this.gate.finish('skip'); }
        break;
      case 'vote': this.onVote(id, msg); break;
      case 'answer': this.onAnswer(id, msg); break;
      default:
    }
  }

  welcome(id) {
    const r = this.rec(id);
    if (r.welcomed || !this.started) { r.welcomed = true; return; }
    r.welcomed = true;
    this.ctx.send(id, { type: 'toast', text: 'You joined mid-game! You start at 0 points and play from the next question.' });
  }

  onJoin(p, rejoin) {
    const r = this.rec(p.id);
    if (!rejoin && this.cur && (this.phase.name === 'read' || this.phase.name === 'answer')) r.lateFor = this.cur.seq;
    this.updateRanks();
    if (this.phase.name === 'title') this.titleCtl?.update({ players: this.ctx.players() });
    this.push(p.id);
    this.checkAllAnswered();
  }

  onLeave() {
    if (this.phase.name === 'title') this.titleCtl?.update({ players: this.ctx.players(), adminName: this.info(this.ctx.adminId)?.name });
    this.pushAll(); // admin may have changed
    this.checkAllAnswered();
    this.checkAllVoted();
  }

  onVote(id, msg) {
    const v = this.vote;
    if (!v || this.phase.name !== 'vote' || msg.voteId !== v.id) return;
    const i = Number(msg.choice);
    if (!(i >= 0 && i < v.options.length)) return;
    const first = !v.votes.has(id);
    v.votes.set(id, i);
    if (first) sfx.play('blip');
    v.ctl.tally(this.voteCounts(), this.ctx.players().length);
    this.push(id);
    this.checkAllVoted();
  }

  voteCounts() {
    const counts = this.vote.options.map(() => 0);
    for (const [id, i] of this.vote.votes) if (this.info(id).connected) counts[i]++;
    return counts;
  }

  checkAllVoted() {
    if (!this.vote || this.phase.name !== 'vote') return;
    const ps = this.ctx.players();
    if (ps.length && ps.every((p) => this.vote.votes.has(p.id)) && this.gate?.tag === 'vote') this.gate.finish('all');
  }

  onAnswer(id, msg) {
    const c = this.cur;
    if (!c || !c.open || msg.qid !== c.seq || c.answers.has(id)) return;
    const r = this.rec(id);
    if (r.lateFor === c.seq) return;
    const t = performance.now() - c.openedAt;
    if (c.q.kind === 'num') {
      const value = Math.round(Number(msg.value));
      if (!Number.isFinite(value) || Math.abs(value) > 1e12) return;
      c.answers.set(id, { value, t });
    } else {
      const choice = Number(msg.choice);
      if (!(choice >= 0 && choice < c.q.choices.length)) return;
      c.answers.set(id, { choice, t });
    }
    const now = performance.now();
    if (now - this.lastChime > 90) { sfx.play('blip'); this.lastChime = now; }
    this.ui.lock.add(this.info(id));
    this.ui.lock.set(c.answers.size, this.eligible().length);
    this.push(id);
    this.checkAllAnswered();
  }

  checkAllAnswered() {
    const c = this.cur;
    if (!c || !c.open) return;
    const el = this.eligible();
    this.ui.lock.set(el.filter((p) => c.answers.has(p.id)).length, el.length);
    if (el.length && el.every((p) => c.answers.has(p.id)) && this.gate?.tag === 'answer') {
      c.open = false; // no more answers; brief beat so the last lock-in registers visually
      const t = setTimeout(() => { this.timers.delete(t); if (this.gate?.tag === 'answer') this.gate.finish('all'); }, 600);
      this.timers.add(t);
    }
  }

  // ---------------------------------------------------------------- show flow

  async run() {
    const myRun = ++this.runId;
    try {
      await this.show();
    } catch (err) {
      if (err !== ABORT) console.error('[trivia]', err);
      return;
    }
    if (this.dead || myRun !== this.runId) return;
    const rows = this.standings().map((e) => ({ player: e.p, score: e.rec.score, label: 'pts' }));
    this.setPhase('results');
    const choice = await this.ctx.showResults(rows, { title: '🏆 Brain Brawl Champion', subtitle: `${rows[0]?.player.name ?? 'Nobody'} wins with ${(rows[0]?.score ?? 0).toLocaleString('en-US')} points!` });
    if (choice === 'again' && !this.dead) this.run();
  }

  async show() {
    // Reset for a fresh show.
    for (const r of this.recs.values()) Object.assign(r, { score: 0, streak: 0, best: 0, right: 0, lastOk: null, res: null, lateFor: -1, prevScore: 0, prevRank: 0 });
    this.ctx.players().forEach((p) => this.rec(p.id));
    this.started = false;
    this.cur = null;
    this.updateRanks();

    await this.titlePhase();
    this.started = true;
    for (const r of this.recs.values()) r.welcomed = true;

    const plan = PLANS[this.settings.length] || PLANS.normal;
    let qTotal = 0;
    for (let ri = 0; ri < plan.length; ri++) {
      const round = plan[ri];
      const stage = plan.length > 1 ? ri / (plan.length - 1) : 1;
      const info = round.final ? ROUND_INFO.final : ROUND_INFO[round.kind];
      const theme = round.final ? 'final' : ROUND_INFO[round.kind].theme;
      const header = (count) => ({ pill: round.final ? 'The Final' : `Round ${ri + 1} · ${ROUND_INFO[round.kind].name}`, count, double: !!round.final, theme });
      this.cur = null;
      this.setPhase('intro', { title: info.name, icon: info.icon, desc: info.desc, round: ri + 1, final: !!round.final });
      introView(this.ui, { index: ri + 1, info, double: !!round.final });
      await this.wait(T.intro);

      let questions;
      if (round.kind === 'classic') {
        const cat = round.vote ? await this.votePhase(round, header('')) : 'Mixed Bag';
        questions = this.bank.pickMC(cat, round.n, stage);
        for (let k = 0; k < (round.closer || 0); k++) questions.push(...this.bank.pickNum(1));
      } else if (round.kind === 'tf') questions = this.bank.pickTF(round.n);
      else questions = this.bank.pickNum(round.n);

      this.snapshot();
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        const isLastOfGame = ri === plan.length - 1 && qi === questions.length - 1;
        qTotal++;
        await this.ask(q, header(`Q ${qi + 1} / ${questions.length}`), !!round.final);
        const batchEnd = qi === questions.length - 1;
        if (!isLastOfGame && (q.kind !== 'tf' || batchEnd)) {
          await this.board(header(`Q ${qi + 1} / ${questions.length}`), q.kind === 'tf' ? 'Lightning results' : 'Leaderboard');
          this.snapshot();
        }
      }
    }
    await this.finalPhase();
  }

  async titlePhase() {
    this.setPhase('title');
    const t0 = performance.now();
    this.titleCtl = titleView(this.ui, { players: this.ctx.players(), adminName: this.info(this.ctx.adminId).name, length: this.settings.length, autoIn: T.titleAuto / 1000 });
    const iv = setInterval(() => this.titleCtl?.update({ autoIn: (T.titleAuto - (performance.now() - t0)) / 1000, adminName: this.info(this.ctx.adminId).name }), 1000);
    this.timers.add(iv);
    try {
      await this.wait(T.titleAuto, { tag: 'title' });
    } finally {
      clearInterval(iv);
      this.timers.delete(iv);
      this.titleCtl = null;
    }
    sfx.play('go');
  }

  async votePhase(round, header) {
    const options = this.bank.categoryOptions(round.final ? 3 : (Math.random() < 0.5 ? 3 : 4), round.n);
    const id = ++this.seq;
    this.vote = { id, options, votes: new Map(), ctl: null };
    this.vote.ctl = voteView(this.ui, { options, seconds: T.vote / 1000, header: { ...header, count: '' } });
    this.setPhase('vote', { voteId: id, options: options.map((o) => catStyle(o)), remaining: T.vote });
    await this.wait(T.vote, { tag: 'vote' });
    const counts = this.voteCounts();
    const total = counts.reduce((a, b) => a + b, 0);
    this.vote.ctl.tally(counts, this.ctx.players().length);
    let segments = options.map((name, i) => ({ name, i, weight: total ? counts[i] : 1, votes: counts[i] })).filter((s) => s.weight > 0);
    let winnerName;
    if (segments.length === 1) {
      winnerName = segments[0].name;
      this.vote.ctl.unanimous(segments[0].i);
      this.setPhase('spin', { category: catStyle(winnerName), done: true });
      await this.wait(2600);
    } else {
      await this.wait(700);
      let r = Math.random() * segments.reduce((a, s) => a + s.weight, 0);
      let wi = 0;
      for (; wi < segments.length - 1; wi++) { r -= segments[wi].weight; if (r <= 0) break; }
      segments = segments.map((s) => ({ ...s }));
      winnerName = segments[wi].name;
      this.setPhase('spin', { category: null });
      await Promise.race([wheelView(this.ui, { segments, winner: wi, header: { ...header, count: '' }, total }), this.wait(6500, { tag: 'spin' })]);
      this.setPhase('spin', { category: catStyle(winnerName), done: true });
      await this.wait(2400);
    }
    this.vote = null;
    return winnerName;
  }

  async ask(q, header, double) {
    const seq = ++this.seq;
    const dur = q.kind === 'tf' ? T.tf : q.kind === 'num' ? T.num : T.classic;
    const readMs = q.kind === 'tf' ? 1600 : Math.max(2400, Math.min(5200, 1500 + q.text.length * 30));
    const c = { seq, q, answers: new Map(), open: false, openedAt: 0, dur, double };
    this.cur = c;
    const pub = { qid: seq, kind: q.kind, text: q.text, category: catStyle(q.category), count: header.count, double, choices: q.kind === 'num' ? null : q.choices, unit: q.unit || '', year: !!q.year };
    this.setPhase('read', { ...pub, readMs });
    const view = questionView(this.ui, { q, header, readMs });
    this.ui.lock.hide();
    await this.wait(readMs);

    c.open = true;
    c.openedAt = performance.now();
    view.startAnswering(dur);
    this.ui.lock.start(this.eligible().length);
    this.setPhase('answer', { ...pub, dur });
    const why = await this.wait(dur + 250, { tag: 'answer' });
    c.open = false;
    this.ui.lock.hide();
    view.stop(why);
    this.setPhase('closed', { qid: seq, kind: q.kind });
    await this.wait(q.kind === 'tf' ? 700 : 1100);

    if (q.kind === 'num') {
      const guesses = this.scoreNum(c);
      this.updateRanks();
      this.setPhase('reveal', { qid: seq, kind: q.kind, answer: q.answer, unit: q.unit || '', year: !!q.year, text: q.text });
      numberLineView(this.ui, { q, guesses, header, double });
      await this.wait(T.revealNum);
    } else {
      const stats = this.scoreChoice(c);
      this.updateRanks();
      this.setPhase('reveal', { qid: seq, kind: q.kind, correct: q.correct, correctText: q.choices[q.correct], text: q.text });
      view.reveal(stats);
      await this.wait(q.kind === 'tf' ? T.revealTF : T.revealClassic);
    }
  }

  scoreChoice(c) {
    const { q, dur, double } = c;
    const counts = q.choices.map(() => 0);
    const pickers = q.choices.map(() => []);
    const order = [...c.answers.entries()].sort((a, b) => a[1].t - b[1].t);
    let fastest = null;
    for (const [id, a] of order) {
      counts[a.choice]++;
      pickers[a.choice].push(this.info(id));
      if (a.choice === q.correct && !fastest) fastest = { p: this.info(id), t: a.t };
    }
    const eligibleIds = new Set(this.eligible().map((p) => p.id));
    for (const r of this.recs.values()) {
      const a = c.answers.get(r.id);
      if (r.lateFor === c.seq) { r.res = { late: true }; continue; }
      if (!a) {
        if (eligibleIds.has(r.id) || r.streak) { r.streak = 0; r.lastOk = false; }
        r.res = { none: true, correctText: q.choices[q.correct], score: r.score };
        continue;
      }
      const ok = a.choice === q.correct;
      let gain = 0;
      let mult = 1;
      if (ok) {
        r.streak++;
        r.best = Math.max(r.best, r.streak);
        r.right++;
        mult = 1 + 0.1 * Math.min(r.streak - 1, 5);
        const speed = Math.max(0, 1 - a.t / dur);
        const base = q.kind === 'tf' ? 250 + 250 * speed : 500 + 500 * speed;
        gain = Math.round((base * mult * (double ? 2 : 1)) / 10) * 10;
      } else r.streak = 0;
      r.lastOk = ok;
      r.score += gain;
      r.res = { ok, gain, mult, double, streak: r.streak, pick: a.choice, correctText: q.choices[q.correct], t: a.t, score: r.score };
    }
    const answered = c.answers.size;
    return { counts, pickers, correct: q.correct, answered, eligible: eligibleIds.size, pctRight: answered ? counts[q.correct] / Math.max(answered, eligibleIds.size) : 0, fastest };
  }

  scoreNum(c) {
    const { q, double } = c;
    const list = [...c.answers.entries()].map(([id, a]) => ({ id, p: this.info(id), value: a.value, t: a.t, err: Math.abs(a.value - q.answer) }))
      .sort((a, b) => a.err - b.err || a.t - b.t);
    const n = list.length;
    let place = 0;
    list.forEach((g, i) => {
      if (i === 0 || g.err !== list[i - 1].err) place = i + 1;
      g.place = place;
      const base = place === 1 ? 1000 + (g.err === 0 ? 500 : 0) : Math.round((600 * (1 - (place - 1) / n)) / 10) * 10;
      g.gain = base * (double ? 2 : 1);
    });
    const byId = new Map(list.map((g) => [g.id, g]));
    for (const r of this.recs.values()) {
      if (r.lateFor === c.seq) { r.res = { late: true }; continue; }
      const g = byId.get(r.id);
      if (!g) { r.res = { none: true, answer: q.answer, score: r.score }; continue; }
      r.score += g.gain;
      if (g.place === 1) r.right++;
      r.res = { num: true, value: g.value, answer: q.answer, err: g.err, place: g.place, of: n, gain: g.gain, bullseye: g.err === 0, double, score: r.score };
    }
    return list;
  }

  async board(header, title) {
    const now = this.updateRanks();
    const prevOrder = [...now].sort((a, b) => (b.rec.prevScore ?? 0) - (a.rec.prevScore ?? 0) || a.p.index - b.p.index);
    const oldIdx = new Map(prevOrder.map((e, i) => [e.rec.id, i]));
    const oldRank = new Map();
    prevOrder.forEach((e, i) => { oldRank.set(e.rec.id, i > 0 && (e.rec.prevScore ?? 0) === (prevOrder[i - 1].rec.prevScore ?? 0) ? oldRank.get(prevOrder[i - 1].rec.id) : i + 1); });
    const entries = now.map((e, i) => ({
      p: e.p, rec: e.rec, newIdx: i, newRank: e.rank, oldIdx: oldIdx.get(e.rec.id) ?? now.length, oldRank: oldRank.get(e.rec.id) ?? e.rank,
      oldScore: e.rec.prevScore ?? 0, score: e.rec.score, gain: e.rec.score - (e.rec.prevScore ?? 0), streak: e.rec.streak, lastOk: e.rec.lastOk,
    }));
    const active = entries.filter((e) => e.lastOk !== null);
    const packStats = {
      pct: active.length ? Math.round((active.filter((e) => e.lastOk).length / active.length) * 100) : 0,
      avg: entries.length ? Math.round(entries.reduce((a, e) => a + e.score, 0) / entries.length) : 0,
      okLabel: 'green ring = got the last one',
    };
    this.setPhase('board', {});
    boardView(this.ui, { entries, header, title, packStats });
    await this.wait(T.board);
  }

  async finalPhase() {
    this.cur = null;
    const ranked = this.updateRanks().map((e) => ({ p: e.p, score: e.rec.score, rank: e.rank }));
    this.setPhase('final', {});
    const { duration } = finalView(this.ui, { ranked });
    await this.wait(duration);
  }

  destroy() {
    this.dead = true;
    this.gate?.finish('abort');
    for (const t of this.timers) { clearTimeout(t); clearInterval(t); }
    this.timers.clear();
    this.ui.destroy();
  }
}
