// Fallback minigame used only when no real minigame is registered (or for 1-player testing).
// Not auto-registered (underscore prefix); the board imports it explicitly.
import { countdown, escapeHtml } from '../../../sdk/screen-kit.js';
import { sfx } from '../../../sdk/audio.js';

export default {
  id: '_placeholder-mash',
  name: 'Balloon Pump',
  instructions: 'Mash the PUMP button to inflate your balloon. Biggest balloon when time runs out wins!',
  mode: 'ffa',
  minPlayers: 1,
  controls: { stick: 'none', buttons: [{ id: 'a', label: 'PUMP', color: '#ff4d6d' }], hint: 'Mash <b>PUMP</b>!' },
  duration: 12,

  async run(env) {
    const root = document.createElement('div');
    root.style.cssText = 'position:absolute;inset:0;background:linear-gradient(180deg,#7fd3ff,#d9f3ff);font-family:Fredoka,sans-serif;display:flex;align-items:flex-end;justify-content:center;gap:4vw;padding-bottom:12vh;overflow:hidden';
    env.container.appendChild(root);
    const timer = document.createElement('div');
    timer.style.cssText = 'position:absolute;top:3vh;left:50%;transform:translateX(-50%);font-size:6vh;font-weight:700;color:#1d2340';
    root.appendChild(timer);
    const lanes = env.players.map((p) => {
      const lane = document.createElement('div');
      lane.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:1vh';
      lane.innerHTML = `<div class="b" style="width:6vh;height:7vh;border-radius:50% 50% 46% 46%;background:radial-gradient(circle at 35% 30%,#fff8,${p.color} 45%);transition:transform .08s;transform-origin:bottom center;box-shadow:0 1vh 2vh #0003"></div>
        <div style="width:.3vh;height:5vh;background:#555"></div>
        <div style="font-size:2.6vh;font-weight:700;color:#1d2340">${p.avatar} ${escapeHtml(p.name)}</div>`;
      root.appendChild(lane);
      return { p, el: lane.querySelector('.b'), n: 0 };
    });
    const dur = this.duration * 1000;
    await countdown(env.container);
    if (env.signal.aborted) { root.remove(); return {}; }
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => {
        if (env.signal.aborted) return res();
        const left = dur - (performance.now() - t0);
        timer.textContent = Math.max(0, Math.ceil(left / 1000));
        for (const l of lanes) {
          if (env.input.get(l.p.id).pressed('a')) { l.n++; sfx.play('blip'); if (l.n % 10 === 0) env.send(l.p.id, { type: 'vibrate', ms: 30 }); }
          l.el.style.transform = `scale(${1 + Math.min(l.n, 120) / 30})`;
        }
        if (left <= 0) return res();
        requestAnimationFrame(tick);
      };
      tick();
    });
    timer.textContent = 'FINISH!';
    sfx.play('whoosh');
    await new Promise((r) => setTimeout(r, env.signal.aborted ? 0 : 1500));
    root.remove();
    return Object.fromEntries(lanes.map((l) => [l.p.id, l.n]));
  },
};
