// Showroom: a small separate scene with turntable podiums. Used by the TV character/kart select screen
// (one podium per player, their current pick spinning), the garage debug view and thumbnail rendering.
import * as THREE from 'three';
import { buildRacerModel } from './assets.js';
import { glowTexture } from './util.js';

function bgTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#2a2470'); gr.addColorStop(0.55, '#3b2f8c'); gr.addColorStop(1, '#120f30');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  const rg = g.createRadialGradient(512, 300, 10, 512, 300, 520);
  rg.addColorStop(0, 'rgba(255,170,90,0.45)'); rg.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 1024, 512);
  // diagonal speed stripes
  g.globalAlpha = 0.07; g.fillStyle = '#fff';
  for (let i = -10; i < 30; i++) { g.beginPath(); g.moveTo(i * 60, 0); g.lineTo(i * 60 + 30, 0); g.lineTo(i * 60 - 170, 512); g.lineTo(i * 60 - 200, 512); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createShowroom({ sharedAsset, asset, environment = null }) {
  const scene = new THREE.Scene();
  const bg = bgTexture();
  scene.background = bg;
  if (environment) { scene.environment = environment; scene.environmentIntensity = 0.6; }
  scene.add(new THREE.HemisphereLight(0xe8eeff, 0x40305a, 1.1));
  const key = new THREE.DirectionalLight(0xfff0dd, 2.4);
  key.position.set(4, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb8ff, 1.4);
  rim.position.set(-6, 4, -6);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 200);
  const glow = glowTexture();
  const podGeo = new THREE.CylinderGeometry(1.9, 2.1, 0.35, 48);
  const podMat = new THREE.MeshStandardMaterial({ color: 0x24264a, roughness: 0.35, metalness: 0.3 });
  const ringGeo = new THREE.RingGeometry(1.95, 2.25, 48);
  const blobGeo = new THREE.PlaneGeometry(3.6, 3.6);
  const blobMat = new THREE.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
  const slots = [];

  function makeSlot() {
    const group = new THREE.Group();
    const pod = new THREE.Mesh(podGeo, podMat);
    pod.position.y = -0.175;
    group.add(pod);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    group.add(ring);
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    group.add(blob);
    const turn = new THREE.Group();
    group.add(turn);
    scene.add(group);
    return { group, ring, turn, model: null, token: 0, key: '', spin: 0.7, yaw: -0.6 };
  }

  return {
    scene,
    camera,
    slots,
    /** Lay out n podiums in rows of `perRow`. */
    layout(n, aspect, { perRow = 4, spacing = 4.6, fixedYaw = null } = {}) {
      while (slots.length < n) slots.push(makeSlot());
      slots.forEach((s, i) => { s.group.visible = i < n; });
      const rows = Math.ceil(n / perRow);
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / perRow); const c = i % perRow;
        const inRow = Math.min(perRow, n - r * perRow);
        slots[i].group.position.set((c - (inRow - 1) / 2) * spacing, 0, -r * spacing * 0.95);
        if (fixedYaw != null) { slots[i].spin = 0; slots[i].yaw = fixedYaw; }
      }
      const width = Math.min(n, perRow) * spacing;
      const fovR = (camera.fov * Math.PI) / 180;
      const distW = (width / 2 + 1.2) / (Math.tan(fovR / 2) * aspect);
      const dist = Math.max(distW, 9 + rows * 3);
      camera.aspect = aspect;
      camera.position.set(0, 2.4 + dist * 0.28 + rows * 1.2, dist + (rows - 1) * spacing * 0.5);
      camera.lookAt(0, 0.9, -(rows - 1) * spacing * 0.45);
      camera.updateProjectionMatrix();
    },
    /** Show a racer pick on podium i. pick: { driver, kart, custom, color, ringColor } */
    async setPick(i, pick) {
      const s = slots[i];
      if (!s) return;
      const key = `${pick.driver?.id}|${pick.kart?.id}|${pick.custom?.name || ''}|${pick.color}|${pick.noDriver ? 1 : 0}`;
      s.ring.material.color.set(pick.ringColor || pick.color || '#ffffff');
      if (key === s.key) return;
      s.key = key;
      const token = ++s.token;
      const m = await buildRacerModel({ driver: pick.driver, kart: pick.kart, custom: pick.custom, color: pick.color, sharedAsset, asset, noDriver: pick.noDriver });
      if (token !== s.token) return;
      if (s.model) s.turn.remove(s.model.root);
      m.root.scale.setScalar(2);
      s.turn.add(m.root);
      s.model = m;
      s.pop = 0.35;
    },
    clear(i) { const s = slots[i]; if (s?.model) { s.turn.remove(s.model.root); s.model = null; s.key = ''; } },
    update(dt, t) {
      for (const s of slots) {
        if (!s.group.visible) continue;
        s.yaw += dt * s.spin;
        s.turn.rotation.y = s.yaw;
        if (s.pop > 0) { s.pop = Math.max(0, s.pop - dt); const k = 1 + Math.sin((s.pop / 0.35) * Math.PI) * 0.15; s.turn.scale.setScalar(k); }
        if (s.model) {
          s.model.driver?.anim?.update(dt);
          s.model.fx.time.value = t;
        }
      }
    },
    dispose() {
      scene.traverse((o) => { if (o.isMesh && o.material !== podMat && o.material !== blobMat) { /* model materials are shared clones */ } });
      podGeo.dispose(); podMat.dispose(); ringGeo.dispose(); blobGeo.dispose(); blobMat.dispose(); glow.dispose(); bg.dispose();
      for (const s of slots) s.ring.material.dispose();
    },
  };
}
