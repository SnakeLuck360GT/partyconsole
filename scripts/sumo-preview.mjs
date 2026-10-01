// Dev helper: renders a grid of GLB models (from public/assets) to a screenshot.
//   node scripts/sumo-preview.mjs out.png path1.glb path2.glb ...   (paths relative to public/assets/)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const [outFile, ...models] = process.argv.slice(2);
const port = 5900 + Math.floor(Math.random() * 90);
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => server.stdout.on('data', (d) => { if (String(d).includes('Local')) res(); }));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => console.log('console', m.text()));
await page.goto(`http://localhost:${port}/screen.html?local=1&room=PREV`);
await page.evaluate(async ({ models, tint }) => {
  document.body.innerHTML = '<div id="c" style="position:fixed;inset:0"></div>';
  const kit = await import('/src/sdk/three-kit.js');
  const { THREE } = kit;
  const stage = kit.createStage(document.getElementById('c'), { background: 0x88aacc });
  const cols = Math.ceil(Math.sqrt(models.length * 1.8));
  const spacing = 2.2;
  const rows = Math.ceil(models.length / cols);
  for (let i = 0; i < models.length; i++) {
    const m = await kit.loadModel('/assets/' + models[i]);

    const x = (i % cols - (cols - 1) / 2) * spacing;
    const z = (Math.floor(i / cols) - (rows - 1) / 2) * spacing;
    m.position.set(x, 0, z);
    const anims = m.userData.animations;
    if (anims?.length) {
      const mixer = new THREE.AnimationMixer(m);
      const clip = anims.find((c) => /^idle$/i.test(c.name)) || anims[0];
      mixer.clipAction(clip).play();
      mixer.update(0.3);
    }
    m.updateMatrixWorld(true);
    m.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); o.computeBoundingSphere(); } });
    const box = new THREE.Box3().setFromObject(m, true);
    const size = box.getSize(new THREE.Vector3());
    console.log(models[i], size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2), 'minY', box.min.y.toFixed(2));
    const s = 1.6 / Math.max(size.y, 0.001);
    m.scale.setScalar(s);
    stage.scene.add(m);
    const lab = kit.makeLabel(models[i].split('/').pop().replace('.glb', ''), { height: 0.3 });
    lab.position.set(x, 2.0, z);
    stage.scene.add(lab);
  }
  stage.camera.position.set(0, rows * 2.2, rows * 2.6 + 3);
  stage.camera.lookAt(0, 0.5, 0);
  await new Promise((r) => setTimeout(r, 1500));
}, { models });
await page.screenshot({ path: outFile });
await browser.close();
server.kill();
