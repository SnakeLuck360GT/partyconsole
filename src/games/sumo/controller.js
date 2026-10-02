// Sumo Smash phone controller: kit gamepad (analog stick left, DASH + hold-to-charge SLAM right)
// with a status panel in the middle (alive / out / waiting, damage %, round wins).
const CSS = `
.sumo-gp { grid-template-columns: 1fr minmax(170px, 34%) 1fr !important; }
.sumo-gp .pk-gp-mid { max-width:none; padding:6px 4px; color:#fff; }
.sumo-gp .pk-gp-right { position:relative; padding:0; gap:0; }
.sumo-gp .btns { position:relative; width:min(46vmin, 290px); height:min(74vmin, 290px); }
.sumo-gp .pk-btn { position:absolute; font-weight:800; letter-spacing:.02em; overflow:hidden; }
.sumo-gp .pk-btn span { position:relative; display:block; line-height:1; }
.sumo-gp .pk-btn small { display:block; font-size:.48em; font-weight:700; opacity:.8; margin-top:4px; letter-spacing:.04em; }
.sumo-gp .b-dash { right:0; bottom:2%; width:min(38vmin, 172px); height:min(38vmin, 172px); font-size:clamp(20px, 6.5vmin, 30px); }
.sumo-gp .b-slam { left:0; top:0; width:min(28vmin, 128px); height:min(28vmin, 128px); font-size:clamp(16px, 5vmin, 23px); }
.sumo-gp .b-slam .fill { position:absolute; left:0; right:0; bottom:0; height:0; background:rgba(255,255,255,.4); pointer-events:none; }
.sumo-gp .b-slam.down .fill { height:100%; transition: height 1s linear; }
.sumo-gp.off .pk-gp-right, .sumo-gp.off .pk-gp-left { opacity:.28; }
.sumo-st { display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center; width:100%; }
.sumo-st .head { font-size:clamp(20px, 7vmin, 34px); font-weight:800; line-height:1.05; }
.sumo-st .sub { font-size:clamp(13px, 4vmin, 17px); font-weight:600; color:rgba(255,255,255,.62); line-height:1.25; min-height:1.25em; }
.sumo-st .dmg { font-size:clamp(46px, 17vmin, 88px); font-weight:800; line-height:.95; font-variant-numeric:tabular-nums; transition: transform .1s; }
.sumo-st .dmg small { font-size:.42em; margin-left:2px; }
.sumo-st .dmg.pop { transform: scale(1.18) rotate(-3deg); }
.sumo-st .score { display:flex; gap:6px; align-items:center; font-weight:700; font-size:15px; color:rgba(255,255,255,.75); }
.sumo-st .pip { width:14px; height:14px; border-radius:50%; background:rgba(255,255,255,.16); }
.sumo-st .pip.on { background:#ffc53a; }
.sumo-st .power { font-size:14px; font-weight:800; padding:3px 12px; border-radius:8px; color:#15131f; }
.sumo-st .tag { font-size:13px; font-weight:800; letter-spacing:.08em; padding:3px 10px; border-radius:8px; background:rgba(255,255,255,.12); color:rgba(255,255,255,.8); }
.sumo-st.out .head { color:#ff8a7a; }
.sumo-st.won .head { color:#ffc53a; }
body[data-layout='portrait'] .sumo-gp { grid-template-columns: 1fr !important; }
body[data-layout='portrait'] .sumo-gp .btns { width:min(80%, 300px); height:min(40vmin, 220px); }
`;

const POWER = { mega: ['MEGA', '#ff9a4a'], feather: ['FEATHER', '#6fe8ff'], spikes: ['SPIKES', '#c08aff'] };

function dmgColor(d) {
  if (d < 40) return '#ffffff';
  if (d < 80) return '#ffe15a';
  if (d < 130) return '#ff9a3a';
  return '#ff4a3a';
}

export default function start(ctx) {
  const { kit } = ctx;
  const style = document.createElement('style');
  style.textContent = CSS;
  ctx.container.appendChild(style);

  const gp = kit.gamepad(ctx, {
    stick: 'analog',
    buttons: [
      { id: 'b', label: '<i class="fill"></i><span>SLAM<small>HOLD</small></span>', color: '#4b63ff' },
      { id: 'a', label: '<span>DASH<small>TAP</small></span>', color: '#ff6b3d' },
    ],
  });
  gp.el.classList.add('sumo-gp', 'off');
  const right = gp.el.querySelector('.pk-gp-right');
  const btnWrap = document.createElement('div');
  btnWrap.className = 'btns';
  right.appendChild(btnWrap);
  const slamEl = gp.buttons.b.el;
  const dashEl = gp.buttons.a.el;
  slamEl.classList.add('b-slam');
  dashEl.classList.add('b-dash');
  btnWrap.append(slamEl, dashEl);
  const onSlamUp = () => { if (!root.classList.contains('out')) ctx.vibrate(20); };
  slamEl.addEventListener('pointerup', onSlamUp);

  const mid = gp.el.querySelector('.pk-gp-mid');
  const root = document.createElement('div');
  root.className = 'sumo-st';
  root.innerHTML = '<div class="tag" hidden></div><div class="head">Get ready</div><div class="dmg" hidden></div><div class="power" hidden></div><div class="score"></div><div class="sub"></div>';
  mid.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const headEl = $('.head');
  const subEl = $('.sub');
  const dmgEl = $('.dmg');
  const scoreEl = $('.score');
  const powerEl = $('.power');
  const tagEl = $('.tag');

  let respawnTimer = 0;
  let lastDmg = 0;
  let lastSt = '';

  function render(s) {
    clearInterval(respawnTimer);
    const live = s.st === 'alive';
    gp.el.classList.toggle('off', !(live && (s.phase === 'play' || s.phase === 'countdown')));
    root.classList.toggle('out', s.st === 'out' || s.st === 'falling');
    root.classList.toggle('won', !!(s.won || s.champ));

    dmgEl.hidden = !(live && s.phase === 'play');
    dmgEl.innerHTML = `${s.dmg}<small>%</small>`;
    dmgEl.style.color = dmgColor(s.dmg);
    if (s.dmg > lastDmg && !dmgEl.hidden) { dmgEl.classList.add('pop'); setTimeout(() => dmgEl.classList.remove('pop'), 140); }
    lastDmg = s.dmg;

    if (s.mode === 'rounds') {
      let pips = '';
      for (let i = 0; i < s.target; i++) pips += `<span class="pip${i < s.wins ? ' on' : ''}"></span>`;
      scoreEl.innerHTML = `${pips}<span style="margin-left:4px">${s.wins} of ${s.target} wins</span>`;
    } else scoreEl.textContent = `${s.pts} point${s.pts === 1 ? '' : 's'}`;

    if (live && s.power && POWER[s.power]) {
      powerEl.hidden = false;
      powerEl.textContent = POWER[s.power][0];
      powerEl.style.background = POWER[s.power][1];
    } else powerEl.hidden = true;

    let head = '';
    let sub = '';
    let tag = '';
    switch (s.st) {
      case 'intro': head = 'Get ready'; sub = 'How to play is on the TV'; break;
      case 'alive':
        if (s.phase === 'countdown') { head = `Round ${s.round}`; sub = s.arena; } else { head = ''; sub = s.alive > 1 ? `${s.alive} still standing` : ''; }
        break;
      case 'falling': head = 'Ring out!'; break;
      case 'out': head = "You're out"; sub = s.mode === 'rounds' ? 'Spectating · back next round' : 'Back soon'; tag = 'SPECTATING'; break;
      case 'respawn': {
        let left = Math.max(1, Math.ceil(s.respawnIn));
        head = 'Splash!';
        sub = `Respawning in ${left}`;
        respawnTimer = setInterval(() => {
          left -= 1;
          if (left <= 0) { clearInterval(respawnTimer); return; }
          subEl.textContent = `Respawning in ${left}`;
        }, 1000);
        break;
      }
      case 'wait': head = "You're in next round"; sub = 'Watch the TV'; tag = 'SPECTATING'; break;
      case 'roundEnd': head = s.won ? 'You won the round!' : 'Round over'; sub = s.rank ? `You're ${ordinal(s.rank)}` : ''; break;
      case 'results': head = s.champ ? 'You are the champion!' : 'Match over'; sub = s.rank ? `You finished ${ordinal(s.rank)}` : 'Check the TV'; break;
      default:
    }
    headEl.textContent = head;
    headEl.hidden = !head;
    subEl.textContent = sub;
    tagEl.textContent = tag;
    tagEl.hidden = !tag;
    if (s.st !== lastSt && s.st === 'alive' && s.phase === 'play') ctx.vibrate('tap');
    lastSt = s.st;
  }

  ctx.onMessage((m) => {
    if (m?.type === 'st') render(m);
    else if (m?.type === 'buzz') ctx.vibrate(m.p);
  });
  ctx.send({ type: 'hello' });

  return {
    destroy() {
      clearInterval(respawnTimer);
      slamEl.removeEventListener('pointerup', onSlamUp);
      gp.destroy();
      style.remove();
    },
  };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
