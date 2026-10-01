// Procedural light bike: a sleek extruded fairing with glowing outline bands and rim-lit wheels.
// Built once; every rider gets 2 meshes (dark body + emissive glow) that share these geometries.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Local frame: +X forward, +Y up, Z across. Overall ~1.95 long, ~0.9 tall.
function profileShape(scale = 1, lift = 0) {
  const s = new THREE.Shape();
  const P = (x, y) => [x * scale, y * scale + lift];
  s.moveTo(...P(-0.98, 0.34));
  s.bezierCurveTo(...P(-1.0, 0.56), ...P(-0.86, 0.66), ...P(-0.6, 0.7));
  s.bezierCurveTo(...P(-0.3, 0.74), ...P(-0.12, 0.8), ...P(0.08, 0.8));
  s.bezierCurveTo(...P(0.4, 0.8), ...P(0.62, 0.66), ...P(0.86, 0.52));
  s.bezierCurveTo(...P(1.02, 0.43), ...P(1.02, 0.3), ...P(0.9, 0.26));
  s.bezierCurveTo(...P(0.6, 0.2), ...P(0.3, 0.3), ...P(0.0, 0.3));
  s.bezierCurveTo(...P(-0.35, 0.3), ...P(-0.6, 0.18), ...P(-0.85, 0.22));
  s.bezierCurveTo(...P(-0.95, 0.24), ...P(-0.98, 0.28), ...P(-0.98, 0.34));
  return s;
}

function centroid(pts) {
  const c = new THREE.Vector2();
  pts.forEach((p) => c.add(p));
  return c.divideScalar(pts.length);
}

/** A thin glowing band that follows the fairing silhouette (outer contour minus a shrunk copy). */
function outlineBand(depth, z) {
  const outer = profileShape().getPoints(24);
  const c = centroid(outer);
  const ring = new THREE.Shape(outer.map((p) => p.clone()));
  const inner = outer.map((p) => {
    const d = p.clone().sub(c);
    // shrink more vertically so the band is visible from above
    return new THREE.Vector2(c.x + d.x * 0.93, c.y + d.y * 0.8);
  }).reverse();
  ring.holes.push(new THREE.Path(inner));
  const g = new THREE.ExtrudeGeometry(ring, { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, z - depth / 2);
  return g;
}

function stripAttrs(g) {
  // mergeGeometries needs identical attribute sets.
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  return out;
}

export function buildBikeGeometry() {
  const body = [];
  const glow = [];

  // Fairing
  const fairing = new THREE.ExtrudeGeometry(profileShape(), {
    depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3, curveSegments: 14,
  });
  fairing.translate(0, 0, -0.15);
  body.push(fairing);

  // Canopy (dark glass bubble)
  const canopy = new THREE.SphereGeometry(0.3, 20, 12);
  canopy.scale(1.35, 0.42, 0.62);
  canopy.translate(0.08, 0.78, 0);
  body.push(canopy);

  // Wheels: fat dark tyres, emissive rims on both sides plus a hub dot.
  for (const wx of [-0.64, 0.64]) {
    const tyre = new THREE.CylinderGeometry(0.33, 0.33, 0.36, 28, 1);
    tyre.rotateX(Math.PI / 2);
    tyre.translate(wx, 0.33, 0);
    body.push(tyre);
    for (const side of [-1, 1]) {
      const rim = new THREE.TorusGeometry(0.25, 0.035, 8, 36);
      rim.translate(wx, 0.33, side * 0.185);
      glow.push(rim);
      const hub = new THREE.CircleGeometry(0.07, 16);
      if (side < 0) hub.rotateY(Math.PI);
      hub.translate(wx, 0.33, side * 0.186);
      glow.push(hub);
    }
    // tread glow line around the tyre's centre
    const tread = new THREE.TorusGeometry(0.335, 0.018, 6, 40);
    tread.translate(wx, 0.33, 0);
    glow.push(tread);
  }

  // Outline bands on both sides of the fairing
  glow.push(outlineBand(0.02, 0.215));
  glow.push(outlineBand(0.02, -0.215));

  // Spine stripe along the top
  const spine = new THREE.BoxGeometry(1.0, 0.03, 0.06);
  spine.translate(-0.42, 0.765, 0);
  spine.rotateZ(0);
  glow.push(spine);

  // Headlight + tail light
  const head = new THREE.BoxGeometry(0.06, 0.07, 0.28);
  head.translate(0.99, 0.4, 0);
  glow.push(head);
  const tail = new THREE.BoxGeometry(0.05, 0.1, 0.34);
  tail.translate(-1.02, 0.44, 0);
  glow.push(tail);

  const bodyGeo = mergeGeometries(body.map(stripAttrs));
  const glowGeo = mergeGeometries(glow.map(stripAttrs));
  bodyGeo.computeBoundingSphere();
  glowGeo.computeBoundingSphere();
  return { bodyGeo, glowGeo };
}

/** Radial soft glow texture used for the light pool under each bike and for pickups. */
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
