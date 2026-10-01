#!/usr/bin/env node
// Renders a contact sheet of candidate models for Star Skirmish (dev tool).
//   node scripts/space-preview.mjs "space/spaceship-bee.glb,space/planet-1.glb" out.png
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const [list, outFile = 'scripts/out/space/preview.png'] = process.argv.slice(2);
const port = 5900 + Math.floor(Math.random() * 90);
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('pageerror', (e) => console.log('err', e.message));
page.on('console', (m) => console.log('console', m.text()));
await page.goto(`http://localhost:${port}/index.html`);
await page.evaluate(async (urls) => {
  const { THREE, loadGLTF } = await import('/src/sdk/three-kit.js');
  document.body.innerHTML = '';
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setSize(1400, 800);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(r.domElement);
  const { RoomEnvironment } = await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1d2a);
  scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1));
  const d = new THREE.DirectionalLight(0xffffff, 2.5); d.position.set(3, 10, 6); scene.add(d);
  const cols = Math.ceil(Math.sqrt(urls.length * 1.75));
  const cam = new THREE.PerspectiveCamera(35, 1400 / 800, 0.1, 500);
  const rows = Math.ceil(urls.length / cols);
  let i = 0;
  for (const u of urls) {
    const g = await loadGLTF('/assets/shared/' + u).catch(() => loadGLTF('/assets/space/' + u));
    const o = g.scene.clone(true);
    const box = new THREE.Box3().setFromObject(o);
    const s = 2.2 / Math.max(...box.getSize(new THREE.Vector3()).toArray());
    o.scale.setScalar(s);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
    const x = (i % cols) * 3 - (cols - 1) * 1.5;
    const z = Math.floor(i / cols) * 3 - (rows - 1) * 1.5;
    o.position.set(x - c.x, -c.y, z - c.z);
    scene.add(o);
    i++;
  }
  cam.position.set(0, cols * 2.6, rows * 2.2);
  cam.lookAt(0, 0, 0);
  r.render(scene, cam);
}, list.split(','));
await page.screenshot({ path: outFile });
await browser.close();
server.kill();
console.log('saved', outFile);
