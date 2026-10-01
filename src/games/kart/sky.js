// Painted sky panorama: gradient, sun / moon glow, soft clouds and layered distant mountains, drawn once into
// an equirectangular canvas and mapped on a small dome that follows whichever camera is rendering.
import * as THREE from 'three';
import { rng, fbm } from './util.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
function mix(a, b, t) {
  const ca = new THREE.Color(a); const cb = new THREE.Color(b);
  return `#${ca.lerp(cb, t).getHexString()}`;
}

function paint(theme, W = 2048, H = 1024) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(theme.seed || 5);
  const hz = H * 0.5; // horizon row
  const [zen, hor] = theme.sky;
  // sky gradient
  const gr = g.createLinearGradient(0, 0, 0, hz);
  gr.addColorStop(0, hex(zen));
  gr.addColorStop(0.6, mix(zen, hor, 0.35));
  gr.addColorStop(0.88, mix(zen, hor, 0.75));
  gr.addColorStop(1, hex(hor));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, hz + 2);
  g.fillStyle = hex(theme.groundHaze ?? hor);
  g.fillRect(0, hz, W, H - hz);
  const sunX = W * (theme.sunAz ?? 0.3);
  const wrap = (fn) => { fn(0); fn(-W); fn(W); };
  if (theme.night) {
    // stars
    for (let i = 0; i < 900; i++) {
      const y = Math.pow(r(), 1.6) * hz * 0.92;
      const a = 0.35 + r() * 0.65;
      g.fillStyle = `rgba(255,255,255,${a})`;
      const s = r() < 0.05 ? 2.4 : 1.3;
      g.fillRect(r() * W, y, s, s);
    }
    // aurora ribbons
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      const y0 = hz * (0.35 + k * 0.1);
      for (let x = 0; x <= W; x += 16) {
        const y = y0 + Math.sin(x / W * Math.PI * 6 + k * 2) * 28 + Math.sin(x / W * Math.PI * 14 + k) * 10;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.lineWidth = 46 - k * 10;
      g.strokeStyle = ['rgba(80,255,190,0.16)', 'rgba(120,160,255,0.14)', 'rgba(220,120,255,0.12)'][k];
      g.filter = 'blur(10px)';
      g.stroke();
      g.filter = 'none';
    }
    // moon
    const mx = sunX; const my = hz * 0.42;
    wrap((o) => {
      const mg = g.createRadialGradient(mx + o, my, 0, mx + o, my, 160);
      mg.addColorStop(0, 'rgba(220,230,255,0.45)'); mg.addColorStop(1, 'rgba(220,230,255,0)');
      g.fillStyle = mg; g.fillRect(mx + o - 160, my - 160, 320, 320);
      g.fillStyle = '#f2f4ff'; g.beginPath(); g.arc(mx + o, my, 34, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(160,170,210,0.35)'; g.beginPath(); g.arc(mx + o - 9, my - 6, 8, 0, Math.PI * 2); g.arc(mx + o + 10, my + 9, 6, 0, Math.PI * 2); g.fill();
    });
  } else {
    // sun glow
    const sy = hz * 0.38;
    wrap((o) => {
      const sg = g.createRadialGradient(sunX + o, sy, 0, sunX + o, sy, 420);
      sg.addColorStop(0, 'rgba(255,250,225,0.95)');
      sg.addColorStop(0.06, 'rgba(255,245,210,0.75)');
      sg.addColorStop(0.3, 'rgba(255,230,180,0.18)');
      sg.addColorStop(1, 'rgba(255,230,180,0)');
      g.fillStyle = sg; g.fillRect(sunX + o - 420, sy - 420, 840, 840);
    });
    // clouds: clusters of soft puffs with shaded bottoms
    const nClouds = theme.clouds ?? 26;
    for (let i = 0; i < nClouds; i++) {
      const cx = r() * W;
      const cy = hz * (0.42 + r() * 0.48);
      const scale = (0.35 + r() * 0.6) * (0.35 + (cy / hz) * 0.6);
      const puffs = 7 + Math.floor(r() * 8);
      const shade = theme.cloudShade || 'rgba(170,190,225,0.9)';
      wrap((o) => {
        for (let pass = 0; pass < 2; pass++) {
          for (let p = 0; p < puffs; p++) {
            const px = cx + o + (p - puffs / 2) * 26 * scale + Math.sin(p * 3.1 + i) * 10 * scale;
            const py = cy - Math.abs(Math.sin(p / puffs * Math.PI)) * 30 * scale + (pass ? -6 * scale : 6 * scale);
            const pr = (24 + 22 * Math.abs(Math.sin(p * 1.7 + i))) * scale;
            const cg = g.createRadialGradient(px, py, 0, px, py, pr);
            const col = pass ? 'rgba(255,255,255,0.95)' : shade;
            cg.addColorStop(0, col); cg.addColorStop(0.78, col); cg.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
            g.fillStyle = cg;
            g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
          }
        }
      });
    }
  }
  // distant mountain layers (far -> near), hazed toward the horizon colour
  const layers = theme.mountains || [];
  layers.forEach((L, li) => {
    const col = mix(L.color, hor, L.haze ?? 0.4);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, hz + 4);
    const seed = 13 + li * 7;
    for (let x = 0; x <= W; x += 4) {
      const u = x / W;
      let h;
      if (L.mesa) {
        const n = fbm(u * 9 + seed, seed, 2);
        h = n > 0.52 ? L.height * (0.75 + 0.25 * fbm(u * 40, seed, 2)) : L.height * 0.15 * fbm(u * 30, seed + 1, 2);
      } else {
        const ridge = 1 - Math.abs(fbm(u * L.freq + seed, seed * 0.3, 4) * 2 - 1);
        h = L.height * (0.25 + 0.75 * Math.pow(ridge, 1.6)) * (0.6 + 0.4 * fbm(u * 3 + seed, 1, 2));
      }
      // seamless wrap: blend the last 5% into the start
      g.lineTo(x, hz - h);
    }
    g.lineTo(W, hz + 4);
    g.closePath();
    g.fill();
    if (L.snow) {
      // snow caps: re-draw the top band lighter, clipped to the mountain shape
      g.save();
      g.clip();
      const sg = g.createLinearGradient(0, hz - L.height, 0, hz - L.height * 0.45);
      sg.addColorStop(0, 'rgba(255,255,255,0.9)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg; g.fillRect(0, hz - L.height, W, L.height * 0.6);
      g.restore();
    }
  });
  // horizon haze
  const hg = g.createLinearGradient(0, hz - 70, 0, hz + 10);
  hg.addColorStop(0, `${hex(hor)}00`); hg.addColorStop(1, `${hex(hor)}cc`);
  g.fillStyle = hg; g.fillRect(0, hz - 70, W, 80);
  return c;
}

export function makeSky(theme) {
  const canvas = paint(theme);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), mat);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  return {
    mesh,
    follow(cam) { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); },
    dispose() { mesh.geometry.dispose(); mat.dispose(); tex.dispose(); },
  };
}
