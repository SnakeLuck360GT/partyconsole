// Word Bomb's own synthesized sounds (richer than the shared sfx set): tick-tock, fuse hiss, key clicks,
// a layered explosion, chimes. Uses its own AudioContext and respects the platform mute toggle.
import { sfx } from '../../sdk/audio.js';

export function createAudio() {
  let ac = null;
  let master = null;
  let hiss = null;
  let noiseBuf = null;
  let tickFlip = false;

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.55;
      const comp = ac.createDynamicsCompressor();
      master.connect(comp).connect(ac.destination);
      const len = ac.sampleRate * 2;
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  const ok = () => !sfx.muted && ctx();

  function tone({ type = 'sine', from = 440, to = from, dur = 0.12, vol = 0.2, delay = 0, attack = 0.004 }) {
    const a = ac;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.3, type = 'lowpass', f0 = 1200, f1 = f0, q = 0.7, delay = 0, attack = 0.005 }) {
    const a = ac;
    const t = a.currentTime + delay;
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  const S = {
    unlock() { ctx(); },
    tick(heat = 0) {
      if (!ok()) return;
      tickFlip = !tickFlip;
      const f = tickFlip ? 1250 : 900;
      tone({ type: 'sine', from: f * (1 + heat * 0.3), to: f * 0.7, dur: 0.06, vol: 0.22 + heat * 0.1 });
      noise({ dur: 0.03, vol: 0.12, type: 'highpass', f0: 3000 });
    },
    key() {
      if (!ok()) return;
      noise({ dur: 0.035, vol: 0.09, type: 'bandpass', f0: 2500 + Math.random() * 1500, q: 2 });
    },
    accept() {
      if (!ok()) return;
      [1047, 1319, 1568].forEach((f, i) => { tone({ type: 'triangle', from: f, dur: 0.18, vol: 0.16, delay: i * 0.055 }); tone({ type: 'sine', from: f * 2, dur: 0.12, vol: 0.05, delay: i * 0.055 }); });
    },
    reject() {
      if (!ok()) return;
      tone({ type: 'square', from: 180, to: 150, dur: 0.14, vol: 0.09 });
      tone({ type: 'square', from: 150, to: 110, dur: 0.2, vol: 0.09, delay: 0.15 });
    },
    whoosh() {
      if (!ok()) return;
      noise({ dur: 0.38, vol: 0.28, type: 'bandpass', f0: 350, f1: 3200, q: 1.4, attack: 0.12 });
    },
    arrive() {
      if (!ok()) return;
      tone({ type: 'sine', from: 520, to: 780, dur: 0.12, vol: 0.14, delay: 0.3 });
    },
    explosion() {
      if (!ok()) return;
      noise({ dur: 1.6, vol: 0.9, type: 'lowpass', f0: 3200, f1: 120, attack: 0.002 });
      noise({ dur: 0.5, vol: 0.5, type: 'highpass', f0: 1500, f1: 600, attack: 0.001 });
      tone({ type: 'sine', from: 110, to: 28, dur: 1.1, vol: 0.8, attack: 0.002 });
      tone({ type: 'sawtooth', from: 70, to: 30, dur: 0.6, vol: 0.2, attack: 0.002 });
      for (let i = 0; i < 6; i++) noise({ dur: 0.08, vol: 0.2, type: 'bandpass', f0: 800 + Math.random() * 1500, q: 3, delay: 0.25 + Math.random() * 0.8 });
    },
    heartLost() {
      if (!ok()) return;
      [659, 587, 494].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.22, vol: 0.13, delay: 0.5 + i * 0.14 }));
    },
    eliminated() {
      if (!ok()) return;
      [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', from: f, to: f * 0.98, dur: 0.3, vol: 0.15, delay: 0.55 + i * 0.18 }));
    },
    bonus() {
      if (!ok()) return;
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.2, vol: 0.15, delay: i * 0.07 }));
      tone({ type: 'sine', from: 2093, dur: 0.6, vol: 0.08, delay: 0.35 });
    },
    drop() {
      if (!ok()) return;
      tone({ type: 'sine', from: 180, to: 60, dur: 0.18, vol: 0.35, delay: 0.25 });
      noise({ dur: 0.12, vol: 0.2, type: 'lowpass', f0: 600, delay: 0.25 });
    },
    startHiss() {
      if (!ok() || hiss) return;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 5200;
      f.Q.value = 0.9;
      const g = ac.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.035, ac.currentTime + 0.3);
      src.connect(f).connect(g).connect(master);
      src.start();
      hiss = { src, g };
    },
    crackle() {
      if (!hiss || sfx.muted || !ac) return;
      noise({ dur: 0.02, vol: 0.05 + Math.random() * 0.05, type: 'highpass', f0: 4000 });
    },
    stopHiss() {
      if (!hiss) return;
      const h = hiss;
      hiss = null;
      try {
        h.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.05);
        h.src.stop(ac.currentTime + 0.3);
      } catch { /* already stopped */ }
    },
    destroy() {
      S.stopHiss();
      try { ac?.close(); } catch { /* noop */ }
      ac = null;
    },
  };
  return S;
}
