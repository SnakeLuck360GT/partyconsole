// Loads and normalises every model Star Skirmish uses (all from the shared CC0 library).
// Each template is wrapped so that: centred on the origin, sized to a known world size, and for
// vehicles/characters the nose points along local +X (our heading angle 0).
import * as THREE from 'three';
import { loadGLTF, SkeletonUtils } from '../../sdk/three-kit.js';

const SHIPS = ['k-craft-speeder-a', 'k-craft-racer', 'k-craft-speeder-b', 'k-craft-speeder-d', 'k-craft-speeder-c', 'k-craft-miner'];
const PILOTS = ['astronaut-frog', 'astronaut-flamingo', 'astronaut-bee', 'astronaut-red-panda'];
const ROCKS = ['rock-1', 'rock-2', 'rock-3', 'rock-4', 'rock-large-1', 'k-meteor-detailed'];
const PLANETS = ['planet-7', 'planet-11', 'planet-8', 'planet-1', 'planet-9', 'planet-2'];

function normalise(obj, { size = 1, axis = 'max', yaw = 0, groundY = false } = {}) {
  const wrap = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(obj);
  inner.rotation.y = yaw;
  wrap.add(inner);
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const s = box.getSize(new THREE.Vector3());
  const ref = axis === 'x' ? s.x : axis === 'y' ? s.y : axis === 'z' ? s.z : Math.max(s.x, s.y, s.z);
  const k = size / ref;
  inner.scale.setScalar(k);
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
  inner.position.set(-c.x, groundY ? -box.min.y * k : -c.y, -c.z);
  return wrap;
}

export async function loadAssets(ctx) {
  const S = (p) => ctx.sharedAsset(p);
  const load = (p) => loadGLTF(S(p));
  const [ships, pilots, rocks, planets, crate, mine, turret] = await Promise.all([
    Promise.all(SHIPS.map((n) => load(`space/${n}.glb`))),
    Promise.all(PILOTS.map((n) => load(`characters/astronauts/${n}.glb`))),
    Promise.all(ROCKS.map((n) => load(`space/${n}.glb`))),
    Promise.all(PLANETS.map((n) => load(`space/${n}.glb`))),
    load('space/pickup-crate.glb'),
    load('props/spiky-ball.glb'),
    load('space/k-turret-single.glb'),
  ]);

  // Kenney crafts: nose points -Z; rotate so it points +X. Length (x after yaw) = 2.3 units.
  const shipTemplates = ships.map((g) => normalise(g.scene.clone(true), { size: 2.3, axis: 'x', yaw: -Math.PI / 2 }));
  const rockTemplates = rocks.map((g) => normalise(g.scene.clone(true), { size: 2 }));
  const planetTemplates = planets.map((g) => normalise(g.scene.clone(true), { size: 2 }));

  return {
    /** A fresh ship model with its accent material recoloured to the player's colour. */
    ship(index, colorHex) {
      const o = shipTemplates[index % shipTemplates.length].clone(true);
      const col = new THREE.Color(colorHex);
      const mats = [];
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        const mat = m.material;
        mats.push(mat);
        if (/red/i.test(mat.name)) {
          mat.color.copy(col);
          mat.emissive = col.clone();
          mat.emissiveIntensity = 0.28;
          mat.metalness = 0.35;
          mat.roughness = 0.35;
        } else if (/dark/i.test(mat.name) && !/metal/i.test(mat.name)) {
          // cockpit glass: glossy + a faint glow of the player colour
          mat.color.set(0x1a2233);
          mat.emissive = col.clone().multiplyScalar(0.35);
          mat.metalness = 0.9;
          mat.roughness = 0.12;
        } else {
          mat.metalness = 0.55;
          mat.roughness = 0.38;
        }
      });
      o.userData.mats = mats;
      return o;
    },
    /** A pilot (animated astronaut). Returns { obj, clips }. Height ~1.1 units, faces +X. */
    pilot(index) {
      const g = pilots[index % pilots.length];
      const src = SkeletonUtils.clone(g.scene);
      const wrap = normalise(src, { size: 1.15, axis: 'y', yaw: Math.PI / 2, groundY: true });
      return { obj: wrap, clips: g.animations, root: src };
    },
    rock(i, size) {
      const o = rockTemplates[i % rockTemplates.length].clone(true);
      o.scale.setScalar(size);
      return o;
    },
    rockCount: rockTemplates.length,
    planet(i) { return planetTemplates[i % planetTemplates.length].clone(true); },
    crate() { return normalise(crate.scene.clone(true), { size: 1.5 }); },
    mine() {
      const o = normalise(mine.scene.clone(true), { size: 1.0 });
      o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.emissive = new THREE.Color(0xff2a2a); m.material.emissiveIntensity = 0; } });
      return o;
    },
    turret() { return normalise(turret.scene.clone(true), { size: 2.4, axis: 'y', groundY: true }); },
  };
}
